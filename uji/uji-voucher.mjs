// Uji integrasi Voucher Panduan Produk Digital (akbaralatas.com) & Voucher Promo Admin.
// PostgreSQL 15 sungguhan (uji/pg-lokal.mjs). Pakai: node --import ./uji/loader.mjs uji/uji-voucher.mjs
import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { mulaiPg } from "./pg-lokal.mjs";

const akar = process.cwd();
const tmp = path.join(os.tmpdir(), "wa-uji-voucher");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const pg = await mulaiPg({ dir: path.join(tmp, "pg"), sementara: true });
process.env.DATABASE_URL = pg.url;
process.env.DATA_DIR = path.join(tmp, "kosong");
process.env.AUTH_SECRET = "v".repeat(48);
process.env.VOUCHER_SYNC_SECRET = "rahasia-sinkron-panduan-cg-2026";

const lib = (f) => import(pathToFileURL(path.join(akar, f)).href);

const { db, sekarang } = await lib("src/lib/db.ts");
const V = await lib("src/lib/voucher.ts");
const L = await lib("src/lib/langganan.ts");
const T = await lib("src/lib/transaksi-admin.ts");
const P = await lib("src/lib/pengguna.ts");
const sql = await db();

let lolos = 0;
const cek = async (nama, fn) => {
  await fn();
  lolos += 1;
  console.log(`  ok  ${nama}`);
};

const budi = await P.buatAkun({ email: "budi@contoh.test", nama: "Budi Santoso", password: "rahasia-budi-01" });
const siti = await P.buatAkun({ email: "siti@contoh.test", nama: "Siti Aminah", password: "rahasia-siti-01" });

await cek("normalisasiKodeVoucher: merapikan input orang awam (tanpa strip, huruf kecil, spasi) ke CG-XXXX-XXXX", async () => {
  assert.equal(V.normalisasiKodeVoucher("cg-8k2m-9p4q"), "CG-8K2M-9P4Q");
  assert.equal(V.normalisasiKodeVoucher("  cg 8k2m 9p4q "), "CG-8K2M-9P4Q");
  assert.equal(V.normalisasiKodeVoucher("cg8k2m9p4q"), "CG-8K2M-9P4Q");
  assert.equal(V.kodeVoucherSah("CG-8K2M-9P4Q"), true);
  assert.equal(V.kodeVoucherSah("SALAH"), false);
});

await cek("pengaturanVoucher & simpanPengaturanVoucher: admin bisa mengatur nama paket, kuota AI, nomor WA, durasi, dan mode klaim", async () => {
  const awal = await V.pengaturanVoucher();
  assert.equal(awal.aktif, true);
  assert.equal(awal.nama_paket, "Paket Panduan");
  assert.equal(awal.kuota_balasan, 1500);

  const baru = await V.simpanPengaturanVoucher({
    aktif: true,
    nama_paket: "Paket Panduan Spesial",
    kuota_balasan: 2500,
    kuota_nomor: 2,
    durasi_hari: 45,
    mode_klaim: "tambah",
  });
  assert.equal(baru.nama_paket, "Paket Panduan Spesial");
  assert.equal(baru.kuota_balasan, 2500);
  assert.equal(baru.kuota_nomor, 2);
  assert.equal(baru.durasi_hari, 45);
  assert.equal(baru.mode_klaim, "tambah");
});

await cek("verifikasiSignatureVoucher & terbitkanVoucherPanduan: idempoten dan menyimpan snapshot kuota admin", async () => {
  const payload = JSON.stringify({
    kode: "CG-8K2M-9P4Q",
    order_id: "AA261114TEST01",
    pembeli_nama: "Budi Santoso",
    pembeli_email: "budi@contoh.test",
    pembeli_wa: "6281234567890",
    harga_beli: 99000,
  });
  const ts = String(sekarang());
  const sig = V.buatSignatureVoucher(payload, ts);
  assert.equal(V.verifikasiSignatureVoucher(payload, ts, sig), true);
  assert.equal(V.verifikasiSignatureVoucher(payload, ts, "deadbeef"), false);

  const v1 = await V.terbitkanVoucherPanduan(JSON.parse(payload));
  const v2 = await V.terbitkanVoucherPanduan(JSON.parse(payload)); // dipanggil ulang (rekonsiliasi)
  assert.equal(v1.id, v2.id);
  assert.equal(v1.kode, "CG-8K2M-9P4Q");
  assert.equal(v1.nama_paket, "Paket Panduan Spesial");
  assert.equal(v1.kuota_balasan, 2500);
  assert.equal(v1.kuota_nomor, 2);
  assert.equal(v1.durasi_hari, 45);
  assert.equal(v1.status, "belum_diklaim");
});

await cek("voucherBelumDiklaimEmail: mendeteksi otomatis voucher yang belum diklaim milik email pembeli", async () => {
  const daftarBudi = await V.voucherBelumDiklaimEmail("Budi@Contoh.Test");
  assert.equal(daftarBudi.length, 1);
  assert.equal(daftarBudi[0].kode, "CG-8K2M-9P4Q");

  const daftarSiti = await V.voucherBelumDiklaimEmail("siti@contoh.test");
  assert.equal(daftarSiti.length, 0);
});

await cek("klaimVoucher: mengaktifkan paket & kuota balasan AI, mencatat transaksi VCR-, dan menolak klaim ulang", async () => {
  const hasil = await V.klaimVoucher(budi.id, "cg 8k2m 9p4q");
  assert.equal(hasil.kode, "CG-8K2M-9P4Q");
  assert.equal(hasil.nama_paket, "Paket Panduan Spesial");
  assert.equal(hasil.kuota_balasan, 2500);
  assert.equal(hasil.kuota_nomor, 2);
  assert.equal(hasil.diperpanjang, false);
  assert.match(hasil.orderId, /^VCR-\d+-\d+-[0-9a-f]+$/);

  const hak = await L.hakAkun({ id: budi.id, peran: "user" });
  assert.equal(hak.paket, "Paket Panduan Spesial");
  assert.equal(hak.balasan, 2500);
  assert.equal(hak.nomor, 2);

  // Setelah diklaim, tidak lagi muncul di daftar belum diklaim
  assert.equal((await V.voucherBelumDiklaimEmail("budi@contoh.test")).length, 0);

  // Muncul di riwayat transaksi pengguna dan pencarian transaksi admin
  const riwayat = await L.riwayatTransaksi({ userId: budi.id });
  assert.equal(riwayat.length, 1);
  assert.equal(riwayat[0].order_id, hasil.orderId);
  assert.equal(riwayat[0].metode, "voucher");
  assert.equal(T.labelMetode(riwayat[0]), "Voucher Panduan");

  // Klaim ulang oleh Budi maupun Siti harus ditolak
  await assert.rejects(() => V.klaimVoucher(budi.id, "CG-8K2M-9P4Q"), /sudah pernah Anda klaim/);
  await assert.rejects(() => V.klaimVoucher(siti.id, "CG-8K2M-9P4Q"), /sudah pernah digunakan/);
});

await cek("buatVoucherAdmin, akumulasi kuota (mode tambah), dan batalkanVoucher", async () => {
  const dibuat = await V.buatVoucherAdmin({
    jumlah: 2,
    nama_paket: "Voucher Bonus Kelas",
    kuota_balasan: 1000,
    kuota_nomor: 3,
    durasi_hari: 15,
    catatan: "Bonus batch 1",
  });
  assert.equal(dibuat.length, 2);

  // Budi sudah punya paket aktif (2500 balasan, 2 nomor, 45 hari) -> klaim voucher kedua mengakumulasi kuota (+1000 jadi 3500, nomor max(2,3)=3)
  const klaim2 = await V.klaimVoucher(budi.id, dibuat[0].kode);
  assert.equal(klaim2.diperpanjang, true);
  assert.equal(klaim2.kuota_balasan, 3500);
  assert.equal(klaim2.kuota_nomor, 3);

  // Voucher kedua dibatalkan admin -> tidak bisa diklaim
  await V.batalkanVoucher(dibuat[1].id);
  await assert.rejects(() => V.klaimVoucher(siti.id, dibuat[1].kode), /dibatalkan/);

  const ringkasan = await V.ringkasanVoucherAdmin();
  assert.equal(ringkasan.total, 3);
  assert.equal(ringkasan.diklaim, 2);
  assert.equal(ringkasan.dibatalkan, 1);
  assert.equal(ringkasan.belum_diklaim, 0);
});

await sql.end({ timeout: 2 });
await pg.berhenti();
console.log(`\nLOLOS ${lolos} uji voucher.`);
process.exit(0);
