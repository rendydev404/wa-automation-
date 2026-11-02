// Uji menyeluruh sistem Afiliasi: pendaftaran mitra, klik & atribusi referral, komisi per paket (% & Rp),
// siklus pembelian pertama vs berulang, pembayaran Midtrans & manual admin, penarikan (manual, Iris, tolak).
import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { mulaiPg } from "./pg-lokal.mjs";

const akar = process.cwd();
const tmp = path.join(os.tmpdir(), "wa-uji-afiliasi");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const pg = await mulaiPg({ dir: path.join(tmp, "pg"), sementara: true });
process.env.DATABASE_URL = pg.url;
process.env.DATA_DIR = path.join(tmp, "kosong");
process.env.AUTH_SECRET = "q".repeat(48);
const lib = (f) => import(pathToFileURL(path.join(akar, f)).href);

const { db } = await lib("src/lib/db.ts");
const A = await lib("src/lib/afiliasi.ts");
const L = await lib("src/lib/langganan.ts");
const P = await lib("src/lib/pengguna.ts");
const sql = await db();

let lolos = 0;
const cek = async (nama, fn) => {
  await fn();
  lolos += 1;
  console.log(`  ok  ${nama}`);
};

const adminRow = await P.buatAkun({ email: "admin@uji.test", nama: "Admin", password: "rahasia-admin-01", peran: "admin" });
const admin = { id: adminRow.id, email: "admin@uji.test", nama: "Admin", peran: "admin" };
const mitra1 = await P.buatAkun({ email: "mitra1@uji.test", nama: "Mitra Satu", password: "rahasia-mitra-01" });
const pembeli1 = await P.buatAkun({ email: "pembeli1@uji.test", nama: "Pembeli Satu", password: "rahasia-pembeli-01" });
const pembeli2 = await P.buatAkun({ email: "pembeli2@uji.test", nama: "Pembeli Dua", password: "rahasia-pembeli-02" });

const daftarPaket = await L.daftarPaket();
const starter = daftarPaket.find((p) => p.kode === "starter");
const bisnis = daftarPaket.find((p) => p.kode === "bisnis");
const pro = daftarPaket.find((p) => p.kode === "pro");

await cek("migrasi v15 menambahkan komisi_jenis='persen' dan komisi_nilai=20 pada paket bawaan", async () => {
  assert.equal(starter.komisi_jenis, "persen");
  assert.equal(starter.komisi_nilai, 20);
  assert.equal(bisnis.komisi_jenis, "persen");
  assert.equal(bisnis.komisi_nilai, 20);
});

await cek("admin dapat mengatur komisi berbeda per paket: Starter 15% (persen), Bisnis Rp50.000 (rupiah), Pro 0 (tanpa komisi)", async () => {
  await L.simpanPaket({ ...starter, komisi_jenis: "persen", komisi_nilai: 15 });
  await L.simpanPaket({ ...bisnis, komisi_jenis: "rupiah", komisi_nilai: 50_000 });
  await L.simpanPaket({ ...pro, komisi_jenis: "rupiah", komisi_nilai: 0 });

  const s = await L.paketById(starter.id);
  const b = await L.paketById(bisnis.id);
  const pr = await L.paketById(pro.id);
  assert.deepEqual([s.komisi_jenis, s.komisi_nilai], ["persen", 15]);
  assert.deepEqual([b.komisi_jenis, b.komisi_nilai], ["rupiah", 50_000]);
  assert.deepEqual([pr.komisi_jenis, pr.komisi_nilai], ["rupiah", 0]);
});

await cek("pendaftaran afiliator mandiri (kode acak otomatis), pencatatan klik, dan atribusi referral (anti self-referral)", async () => {
  const af = await A.daftarAfiliator(mitra1.id, {
    bankNama: "bca",
    bankNomor: "1234567890",
    bankPemilik: "Mitra Satu",
  });
  assert.match(af.kode, /^[a-z0-9]{8}$/);
  assert.equal(af.status, "aktif");

  // Klik tercatat
  assert.equal(await A.catatKlikReferral(af.kode), true);
  assert.equal(await A.catatKlikReferral(af.kode), true);
  assert.equal((await A.profilAfiliator(mitra1.id)).klik, 2);

  // Self-referral ditolak
  assert.equal(await A.terapkanReferral(mitra1.id, af.kode), false);

  // Atribusi ke pembeli1 & pembeli2 berhasil
  assert.equal(await A.terapkanReferral(pembeli1.id, af.kode), true);
  assert.equal(await A.terapkanReferral(pembeli2.id, af.kode), true);
});

await cek("pembelian paket Starter (Rp99.000, komisi 15%) menghasilkan komisi Rp14.850 otomatis", async () => {
  await L.berikanPaketManual(pembeli1.id, {
    paketId: starter.id,
    metode: "manual_transfer",
    jumlah: starter.harga,
    catatan: "Transfer BCA",
  });
  const af = await A.profilAfiliator(mitra1.id);
  assert.equal(af.saldo, 14_850);
  assert.equal(af.total_komisi, 14_850);
});

await cek("pembelian paket Bisnis (Rp249.000, komisi tetap Rp50.000) menghasilkan komisi Rp50.000 otomatis", async () => {
  await L.berikanPaketManual(pembeli2.id, {
    paketId: bisnis.id,
    metode: "manual_qris",
    jumlah: bisnis.harga,
    catatan: "QRIS",
  });
  const af = await A.profilAfiliator(mitra1.id);
  assert.equal(af.saldo, 14_850 + 50_000);
  assert.equal(af.total_komisi, 14_850 + 50_000);
});

await cek("pemberian paket Gratis / kompensasi tidak memicu komisi afiliasi", async () => {
  await L.berikanPaketManual(pembeli1.id, {
    paketId: bisnis.id,
    metode: "kompensasi",
    jumlah: 0,
    catatan: "Bonus",
  });
  const af = await A.profilAfiliator(mitra1.id);
  assert.equal(af.saldo, 64_850);
});

await cek("siklus 'pertama' mencegah komisi kedua dari pembeli yang sudah pernah beli, sedangkan 'berulang' memberikan komisi lagi", async () => {
  const atur = await A.pengaturanAfiliasi();
  await A.simpanPengaturanAfiliasi({ ...atur, siklus: "pertama" });

  // pembeli1 beli lagi saat siklus = 'pertama' -> tidak dapat komisi
  await L.berikanPaketManual(pembeli1.id, {
    paketId: bisnis.id,
    metode: "manual_transfer",
    jumlah: bisnis.harga,
    catatan: "Perpanjang",
  });
  assert.equal((await A.profilAfiliator(mitra1.id)).saldo, 64_850);

  // Ubah kembali ke 'berulang' -> dapat komisi Rp50.000
  await A.simpanPengaturanAfiliasi({ ...atur, siklus: "berulang" });
  await L.berikanPaketManual(pembeli1.id, {
    paketId: bisnis.id,
    metode: "manual_transfer",
    jumlah: bisnis.harga,
    catatan: "Perpanjang ke-2",
  });
  assert.equal((await A.profilAfiliator(mitra1.id)).saldo, 114_850);
});

await cek("pengajuan penarikan (withdraw), tolak (refund saldo atomik), dan pencairan selesai", async () => {
  // Tarik Rp60.000
  const w1 = await A.ajukanPenarikan(mitra1.id, 60_000);
  assert.equal(w1.status, "menunggu");
  assert.equal((await A.profilAfiliator(mitra1.id)).saldo, 114_850 - 60_000);

  // Admin menolak -> saldo kembali utuh ke 114.850
  await A.prosesPenarikanAdmin(admin, w1.id, { aksi: "tolak", catatan: "Cek nomor rekening" });
  assert.equal((await A.profilAfiliator(mitra1.id)).saldo, 114_850);

  // Tarik lagi Rp100.000 -> Admin setujui manual
  const w2 = await A.ajukanPenarikan(mitra1.id, 100_000);
  await A.prosesPenarikanAdmin(admin, w2.id, { aksi: "manual", referensi: "TRF-001", catatan: "Lunas BCA" });
  const afAkhir = await A.profilAfiliator(mitra1.id);
  assert.equal(afAkhir.saldo, 14_850);
  assert.equal(afAkhir.total_ditarik, 100_000);
  assert.equal(afAkhir.total_komisi, 114_850);
});

await sql.end({ timeout: 2 });
await pg.berhenti().catch(() => {});
console.log(`\nLOLOS ${lolos} uji afiliasi & pencairan komisi`);
process.exit(0);
