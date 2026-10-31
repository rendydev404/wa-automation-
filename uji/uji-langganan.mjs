// Uji paket langganan, kuota balasan AI, dan pembayaran Midtrans (API Midtrans tiruan lewat fetch).
// PostgreSQL 15 sungguhan (uji/pg-lokal.mjs). Pakai: node --import ./uji/loader.mjs uji/uji-langganan.mjs
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { mulaiPg } from "./pg-lokal.mjs";

const akar = process.cwd();
const tmp = path.join(os.tmpdir(), "wa-uji-langganan");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const pg = await mulaiPg({ dir: path.join(tmp, "pg"), sementara: true });
process.env.DATABASE_URL = pg.url;
process.env.DATA_DIR = path.join(tmp, "kosong");
process.env.AUTH_SECRET = "q".repeat(48);
const lib = (f) => import(pathToFileURL(path.join(akar, f)).href);

const { db, setSetting, sekarang } = await lib("src/lib/db.ts");
const L = await lib("src/lib/langganan.ts");
const M = await lib("src/lib/midtrans.ts");
const P = await lib("src/lib/pengguna.ts");
const { tambahNomor } = await lib("src/lib/numbers.ts");
const AI = await lib("src/lib/ai.ts");
const sql = await db();

let lolos = 0;
const cek = async (nama, fn) => {
  await fn();
  lolos += 1;
  console.log(`  ok  ${nama}`);
};

const budi = await P.buatAkun({ email: "budi@uji.test", nama: "Budi", password: "rahasia-budi-01" });
const admin = await P.buatAkun({ email: "admin@uji.test", nama: "Admin", password: "rahasia-admin-01", peran: "admin" });
const B = { id: budi.id, peran: "user" };
const paket = await L.daftarPaket();
const starter = paket.find((p) => p.kode === "starter");
const bisnis = paket.find((p) => p.kode === "bisnis");

await cek("migrasi membuat 3 paket awal (Starter, Bisnis unggulan, Pro) urut harga", async () => {
  assert.deepEqual(
    paket.map((p) => [p.nama, p.harga, p.durasi_hari, p.kuota_nomor, p.kuota_balasan, p.unggulan]),
    [
      ["Starter", 99000, 30, 1, 1000, false],
      ["Bisnis", 249000, 30, 3, 3500, true],
      ["Pro", 599000, 30, 10, 10000, false],
    ]
  );
});

await cek("hak akun: admin tanpa batas; tanpa paket = free trial 5 balasan sekali pakai (jumlah & 'tiap bulan' bisa diatur admin); kuota nomor per akun mengalahkan paket", async () => {
  assert.deepEqual(await L.hakAkun({ id: admin.id, peran: "admin" }), { nomor: null, balasan: null, periodeMulai: L.awalBulanWib(), sampai: null, paket: "Admin", percobaan: false });
  let h = await L.hakAkun(B);
  const [{ created_at: dibuat }] = await sql`SELECT created_at FROM users WHERE id = ${budi.id}`;
  assert.deepEqual([h.nomor, h.balasan, h.paket, h.sampai, h.percobaan, h.periodeMulai], [1, 5, "Gratis", null, true, dibuat]);
  await setSetting("kuota_percobaan", "50");
  h = await L.hakAkun(B);
  assert.equal(h.balasan, 50);
  await setSetting("kuota_percobaan_ulang", "bulanan");
  h = await L.hakAkun(B);
  assert.deepEqual([h.balasan, h.percobaan, h.periodeMulai], [50, false, L.awalBulanWib()]);
  // awal bulan WIB: 1 Okt 2026 00:00 WIB = 30 Sep 2026 17:00 UTC
  assert.equal(L.awalBulanWib(Date.UTC(2026, 9, 15, 3) / 1000), Date.UTC(2026, 8, 30, 17) / 1000);
});

const n1 = await tambahNomor("Nomor Budi", budi.id);
const lain = await P.buatAkun({ email: "lain@uji.test", nama: "Lain", password: "rahasia-lain-01" });
const nLain = await tambahNomor("Nomor Lain", lain.id);
const pakai = (numberId, waktu) => sql`INSERT INTO ai_pakai(number_id, waktu, penyedia, ms) VALUES (${numberId}, ${waktu}, 'hermes', 1000)`;

await cek("balasan terpakai: hanya nomor milik pengguna itu, hanya dalam periode; lewat indeks", async () => {
  const t = sekarang();
  await pakai(n1.id, t - 10);
  await pakai(n1.id, t - 20);
  await pakai(n1.id, L.awalBulanWib() - 100); // bulan lalu
  await pakai(nLain.id, t - 5);
  assert.equal(await L.balasanTerpakai(budi.id, L.awalBulanWib()), 2);
  const rencana = (await sql.unsafe(`EXPLAIN SELECT COUNT(*) FROM numbers n JOIN ai_pakai a ON a.number_id = n.id AND a.waktu >= 0 WHERE n.user_id = ${budi.id}`)).map((r) => r["QUERY PLAN"]).join("\n");
  assert.doesNotMatch(rencana, /Seq Scan on ai_pakai/);
});

await cek("penjaga kuota WhatsApp: sisa dari memori, berkurang per balasan, habis = 0; disegarkan setelah paket berubah", async () => {
  await setSetting("kuota_percobaan", "3");
  L.segarkanKuota();
  assert.equal(await L.sisaKuotaAi(budi.id), 1); // 3 - 2 terpakai
  L.catatBalasanLokal(budi.id);
  assert.equal(await L.sisaKuotaAi(budi.id), 0);
  assert.equal(await L.sisaKuotaAi(admin.id), null); // admin tanpa batas
  await L.berikanPaket(budi.id, starter.id);
  // Paket baru: periode mulai sekarang, jadi balasan sebelum paket dibeli tidak ikut terhitung.
  assert.equal(await L.sisaKuotaAi(budi.id), 1000);
});

await cek("berikan paket sama = diperpanjang (masa & kuota bertambah); paket lain = mulai baru; hentikan = kembali gratis", async () => {
  const a = await L.langgananAktif(budi.id);
  assert.equal(a.nama_paket, "Starter");
  assert.equal(a.sampai - a.mulai, 30 * 86400);
  await L.berikanPaket(budi.id, starter.id);
  const b = await L.langgananAktif(budi.id);
  assert.equal(b.id, a.id);
  assert.equal(b.sampai - b.mulai, 60 * 86400);
  assert.equal(b.kuota_balasan, 2000);
  await L.berikanPaket(budi.id, bisnis.id, 7);
  const c = await L.langgananAktif(budi.id);
  assert.notEqual(c.id, a.id);
  assert.deepEqual([c.nama_paket, c.kuota_nomor, c.kuota_balasan, c.sampai - c.mulai], ["Bisnis", 3, 3500, 7 * 86400]);
  assert.equal((await L.hakAkun(B)).nomor, 3);
  await sql`UPDATE users SET kuota_nomor = 5 WHERE id = ${budi.id}`; // kuota dari admin per akun mengalahkan paket
  assert.equal((await L.hakAkun(B)).nomor, 5);
  await sql`UPDATE users SET kuota_nomor = NULL WHERE id = ${budi.id}`;
  await L.hentikanLangganan(budi.id);
  assert.equal(await L.langgananAktif(budi.id), undefined);
  assert.equal((await L.hakAkun(B)).paket, "Gratis");
});

await cek("free trial: kuota percobaan dihitung sejak akun dibuat (tidak terisi lagi tiap bulan); langganan berakhir = tetap habis; admin menaikkan kuota = AI jalan lagi", async () => {
  const HARI = 86400;
  const t = sekarang();
  await setSetting("kuota_percobaan", "5");
  await setSetting("kuota_percobaan_ulang", "sekali");
  const u = await P.buatAkun({ email: "trial@uji.test", nama: "Trial", password: "rahasia-trial-01" });
  const U = { id: u.id, peran: "user" };
  await sql`UPDATE users SET created_at = ${t - 60 * HARI} WHERE id = ${u.id}`;
  const n = await tambahNomor("Nomor Trial", u.id);
  for (const w of [t - 50 * HARI, t - 45 * HARI, t - 40 * HARI]) await pakai(n.id, w); // dua bulan lalu
  await pakai(n.id, t - 60);
  L.segarkanKuota(u.id);
  assert.equal(await L.sisaKuotaAi(u.id), 1, "4 dari 5 terpakai, termasuk yang bulan-bulan lalu");
  // Mode tiap bulan: hanya bulan ini yang dihitung.
  await setSetting("kuota_percobaan_ulang", "bulanan");
  L.segarkanKuota(u.id);
  assert.equal(await L.sisaKuotaAi(u.id), 4);
  await setSetting("kuota_percobaan_ulang", "sekali");
  // Berlangganan lalu langganannya berakhir: kembali ke kuota percobaan yang sudah terpakai (tidak dapat percobaan baru).
  await L.berikanPaket(u.id, starter.id);
  for (let i = 0; i < 3; i++) await pakai(n.id, t - 5 + i);
  await L.hentikanLangganan(u.id);
  L.segarkanKuota(u.id);
  const h = await L.hakAkun(U);
  assert.deepEqual([h.paket, h.percobaan, h.balasan], ["Gratis", true, 5]);
  assert.equal(await L.sisaKuotaAi(u.id), 0);
  // Admin menaikkan kuota percobaan: berlaku langsung.
  await setSetting("kuota_percobaan", "10");
  L.segarkanKuota();
  assert.equal(await L.sisaKuotaAi(u.id), 3);
  await setSetting("kuota_percobaan", "0");
  L.segarkanKuota();
  assert.equal(await L.sisaKuotaAi(u.id), 0, "0 = tanpa kuota gratis");
  await setSetting("kuota_percobaan", "50");
  await setSetting("kuota_percobaan_ulang", "bulanan");
  L.segarkanKuota();
});

console.log("== Midtrans ==");
const SK = "Mid-server-UJIabcdefghijklmnop";
const k = { serverKey: SK, produksi: true };

await cek("tanda tangan notifikasi: SHA-512(order+status+gross+serverKey) sah; diubah sedikit / kunci lain = ditolak", async () => {
  const n = { order_id: "WA-1-1-ab", status_code: "200", gross_amount: "99000.00" };
  const sig = createHash("sha512").update(`${n.order_id}${n.status_code}${n.gross_amount}${SK}`).digest("hex");
  assert.equal(M.tandaTanganSah({ ...n, signature_key: sig }, SK), true);
  assert.equal(M.tandaTanganSah({ ...n, gross_amount: "1.00", signature_key: sig }, SK), false);
  assert.equal(M.tandaTanganSah({ ...n, signature_key: sig }, "Mid-server-lain"), false);
  assert.equal(M.tandaTanganSah({ ...n }, SK), false);
  // Kunci tanda tangan terpisah (signature secret key): sah bila cocok dengan salah satu kunci.
  const sigLain = createHash("sha512").update(`${n.order_id}${n.status_code}${n.gross_amount}Mid-server-ttd.~x`).digest("hex");
  assert.equal(M.tandaTanganSah({ ...n, signature_key: sigLain }, [SK, "Mid-server-ttd.~x"]), true);
  assert.equal(M.tandaTanganSah({ ...n, signature_key: sigLain }, [SK]), false);
});

await cek("peta status Midtrans: settlement/capture-accept lunas, challenge menunggu, expire, deny/cancel gagal, refund", async () => {
  const p = (transaction_status, fraud_status) => M.petaStatus({ transaction_status, fraud_status });
  assert.deepEqual(
    [p("settlement"), p("capture", "accept"), p("capture", "challenge"), p("capture", "deny"), p("pending"), p("expire"), p("deny"), p("cancel"), p("refund")],
    ["lunas", "lunas", "menunggu", "gagal", "menunggu", "kedaluwarsa", "gagal", "gagal", "dikembalikan"]
  );
});

const asli = globalThis.fetch;
let midtrans = { status: "pending", gross: null };
const panggilan = [];
globalThis.fetch = async (url, o) => {
  const u = String(url);
  panggilan.push({ url: u, auth: o?.headers?.Authorization, body: o?.body ? JSON.parse(o.body) : null });
  if (u === "https://app.midtrans.com/snap/v1/transactions")
    return new Response(JSON.stringify({ token: "tok-uji", redirect_url: "https://app.midtrans.com/snap/v4/redirection/tok-uji" }), { status: 201 });
  const m = u.match(/^https:\/\/api\.midtrans\.com\/v2\/(.+)\/status$/);
  if (m) {
    const order_id = decodeURIComponent(m[1]);
    const t = (await sql`SELECT jumlah FROM transaksi WHERE order_id = ${order_id}`)[0];
    return new Response(JSON.stringify({ order_id, status_code: "200", gross_amount: `${midtrans.gross ?? t?.jumlah}.00`, transaction_status: midtrans.status, payment_type: "qris" }));
  }
  return new Response("{}", { status: 404 });
};

let orderId;
await cek("bayar paket: tagihan tercatat 'menunggu', Snap dipanggil dengan nominal & Basic auth server key, kembali ke /langganan/selesai", async () => {
  const url = await L.mulaiBayar(k, { id: budi.id, email: "budi@uji.test", nama: "Budi" }, starter, "https://wa.uji");
  assert.equal(url, "https://app.midtrans.com/snap/v4/redirection/tok-uji");
  const snap = panggilan.find((p) => p.url.includes("/snap/v1/"));
  assert.equal(snap.auth, `Basic ${Buffer.from(`${SK}:`).toString("base64")}`);
  assert.equal(snap.body.transaction_details.gross_amount, 99000);
  orderId = snap.body.transaction_details.order_id;
  assert.match(orderId, new RegExp(`^WA-${budi.id}-\\d+-[0-9a-f]{6}$`));
  assert.equal(snap.body.callbacks.finish, `https://wa.uji/langganan/selesai?order=${encodeURIComponent(orderId)}`);
  // Halaman hasil bayar hanya membuka transaksi milik pengguna itu sendiri.
  assert.equal((await L.transaksiMilik(budi.id, orderId)).order_id, orderId);
  assert.equal(await L.transaksiMilik(budi.id + 9999, orderId), undefined);
  assert.equal(await L.transaksiMilik(budi.id, 'WA-0-0-abc'), undefined);
  const [t] = await sql`SELECT status, jumlah, snap_token FROM transaksi WHERE order_id = ${orderId}`;
  assert.deepEqual({ ...t }, { status: "menunggu", jumlah: 99000, snap_token: "tok-uji" });
});

await cek("status dari API Midtrans: pending tetap menunggu; settlement = lunas & paket aktif TEPAT SEKALI walau notifikasi berulang", async () => {
  midtrans = { status: "pending", gross: null };
  assert.deepEqual(await L.terapkanStatus(k, orderId), { status: "menunggu", baruAktif: false });
  assert.equal(await L.langgananAktif(budi.id), undefined);
  midtrans = { status: "settlement", gross: null };
  assert.deepEqual(await L.terapkanStatus(k, orderId), { status: "lunas", baruAktif: true });
  assert.deepEqual(await L.terapkanStatus(k, orderId), { status: "lunas", baruAktif: false }); // notifikasi ulang
  const a = await L.langgananAktif(budi.id);
  assert.equal(a.nama_paket, "Starter");
  assert.equal(a.sampai - a.mulai, 30 * 86400); // tidak diperpanjang dua kali
  const [t] = await sql`SELECT status, metode, dibayar IS NOT NULL AS dibayar, langganan_id FROM transaksi WHERE order_id = ${orderId}`;
  assert.deepEqual({ ...t }, { status: "lunas", metode: "qris", dibayar: true, langganan_id: a.id });
  assert.equal((await sql`SELECT COUNT(*)::int AS n FROM langganan WHERE user_id = ${budi.id} AND sampai > ${sekarang()}`)[0].n, 1);
});

await cek("nominal dari Midtrans berbeda dengan tagihan = TIDAK diaktifkan; order tak dikenal = null", async () => {
  const o2 = await L.mulaiBayar(k, { id: budi.id, email: "budi@uji.test", nama: "Budi" }, bisnis, "https://wa.uji").then(() => panggilan.at(-1).body.transaction_details.order_id);
  midtrans = { status: "settlement", gross: 1000 };
  const h = await L.terapkanStatus(k, o2);
  assert.equal(h.baruAktif, false);
  assert.equal((await sql`SELECT status FROM transaksi WHERE order_id = ${o2}`)[0].status, "menunggu");
  assert.equal((await L.langgananAktif(budi.id)).nama_paket, "Starter");
  midtrans = { status: "expire", gross: null };
  assert.equal((await L.terapkanStatus(k, o2)).status, "kedaluwarsa");
  assert.equal(await L.terapkanStatus(k, "WA-999-1-abcdef"), null);
});

await cek("riwayat transaksi per pengguna & semua (admin), terbaru dulu", async () => {
  const milik = await L.riwayatTransaksi({ userId: budi.id });
  assert.equal(milik.length, 2);
  assert.ok(milik[0].dibuat >= milik[1].dibuat);
  const semua = await L.riwayatTransaksi({});
  assert.equal(semua[0].email, "budi@uji.test");
});
globalThis.fetch = asli;

await cek("kunci Midtrans hanya dari .env server; mode bawaan production, sandbox bila MIDTRANS_MODE=sandbox", async () => {
  delete process.env.MIDTRANS_SERVER_KEY;
  assert.equal(await M.konfigMidtrans(), null);
  process.env.MIDTRANS_SERVER_KEY = SK;
  assert.deepEqual(await M.konfigMidtrans(), { serverKey: SK, produksi: true, kunciTandaTangan: [SK] });
  process.env.MIDTRANS_SIGNATURE_KEY = "Mid-server-ttd.~x";
  assert.deepEqual((await M.konfigMidtrans()).kunciTandaTangan, [SK, "Mid-server-ttd.~x"]);
  process.env.MIDTRANS_MODE = "sandbox";
  assert.equal((await M.konfigMidtrans()).produksi, false);
});

console.log("== Harga & margin ==");
const H = await lib("src/lib/harga.ts");
const AI2 = await lib("src/lib/ai.ts");

await cek("rumus harga: modal dari tarif resmi x kuota (+5% foto/tulis-ulang), biaya bayar, untung, margin, harga saran dibulatkan ke atas", async () => {
  const usd = AI2.perkiraanPerBalasan("claude-haiku-5-5"); // 0,000846 USD
  const a = { biayaBalasanUsd: usd, kurs: 16500, margin: 0.6, pemakaian: 1, metode: "kartu", biayaServerNomor: 0 };
  const s = H.hitungHarga({ harga: 99000, durasi_hari: 30, kuota_nomor: 1, kuota_balasan: 1000 }, a);
  assert.ok(Math.abs(s.biayaPerBalasan - 14.65695) < 1e-6);
  assert.ok(Math.abs(s.modal - 14656.95) < 1e-3);
  assert.equal(s.biayaBayar, 99000 * 0.029 + 2000);
  assert.ok(Math.abs(s.untung - (99000 - 4871 - 14656.95)) < 1e-3);
  assert.ok(Math.abs(s.margin - 0.80275) < 1e-4);
  assert.equal(s.hargaSaran, 45000); // (14.656,95 + 2.000) / (1 - 0,6 - 0,029) = 44.897 -> 45.000
  // Biaya server per nomor ikut masuk modal, sebanding durasi
  const t = H.hitungHarga({ harga: 249000, durasi_hari: 60, kuota_nomor: 3, kuota_balasan: 3500 }, { ...a, biayaServerNomor: 5000 });
  assert.ok(Math.abs(t.modalServer - 3 * 5000 * 2) < 1e-9);
  // Margin + biaya bayar >= 100%: tidak ada harga yang masuk akal
  assert.equal(H.hitungHarga({ harga: 1000, durasi_hari: 30, kuota_nomor: 1, kuota_balasan: 1 }, { ...a, margin: 0.98 }).hargaSaran, null);
});

await cek("pemakaian nyata dari stats 30 hari (rata-rata per nomor per hari aktif x30); belum ada data = 900/bulan", async () => {
  assert.deepEqual(await L.pemakaianNyata(), { balasanPerNomorBulan: 900, nomor: 0, hari: 0, puncakHarian: 0 });
  await sql`INSERT INTO stats(number_id, tanggal, masuk, dibalas) VALUES (${n1.id}, (now() AT TIME ZONE 'Asia/Jakarta')::date, 70, 60),
    (${nLain.id}, (now() AT TIME ZONE 'Asia/Jakarta')::date, 30, 20), (${nLain.id}, (now() AT TIME ZONE 'Asia/Jakarta')::date - 40, 900, 900)`;
  assert.deepEqual(await L.pemakaianNyata(), { balasanPerNomorBulan: 1200, nomor: 2, hari: 1, puncakHarian: 60 }); // (60+20)/2 x30; baris 40 hari lalu diabaikan
  await sql`DELETE FROM stats`;
});

await cek("kebalikan rumus: harga dikunci -> kuota balasan (kelipatan 50, margin tetap tercapai) & nomor dari pemakaian nyata", async () => {
  const usd = AI2.perkiraanPerBalasan("claude-haiku-5-5");
  const a = { biayaBalasanUsd: usd, kurs: 16500, margin: 0.6, pemakaian: 1, metode: "kartu", biayaServerNomor: 0 };
  assert.deepEqual(H.kuotaDariHarga(45000, 30, a, 900), { kuotaBalasan: 1000, kuotaNomor: 1 });
  const k = H.kuotaDariHarga(144000, 30, { ...a, margin: 0.5 }, 900);
  assert.equal(k.kuotaBalasan % 50, 0);
  assert.ok(H.hitungHarga({ harga: 144000, durasi_hari: 30, kuota_nomor: k.kuotaNomor, kuota_balasan: k.kuotaBalasan }, { ...a, margin: 0.5 }).margin >= 0.5);
  assert.deepEqual(H.kuotaDariHarga(3000, 30, a, 900), { kuotaBalasan: 0, kuotaNomor: 1 }); // terlalu murah
  assert.equal(H.nomorDariKuota(3500, 30, 900), 4);
  assert.equal(H.nomorDariKuota(3500, 60, 900), 2); // durasi 60 hari: tiap nomor memakai 2x lipat
  assert.equal(H.nomorDariKuota(100, 30, 900), 1); // minimal 1
});

await cek("acuan harga tersimpan (bawaan: margin 60%, pakai 100%, kartu, Haiku 5.5) & terapkan simulasi ke semua paket berbayar", async () => {
  const a = await L.acuanHarga();
  assert.deepEqual({ ...a, kurs: undefined }, { margin: 60, pemakaian: 100, metode: "kartu", biayaServerNomor: 0, kurs: undefined, model: "claude-haiku-5-5" });
  const acuan = { ...a, kurs: 16500 };
  const { berubah } = await L.terapkanSimulasi(acuan, "kunci-kuota");
  assert.deepEqual(
    berubah.map((b) => [b.nama, b.sesudah]),
    [
      ["Starter", "Rp45.000 · 1.000 balasan · 1 nomor"],
      ["Bisnis", "Rp144.000 · 3.500 balasan · 4 nomor"],
      ["Pro", "Rp401.000 · 10.000 balasan · 11 nomor"],
    ]
  );
  assert.equal(berubah[0].sebelum, "Rp99.000 · 1.000 balasan · 1 nomor");
  assert.deepEqual((await L.terapkanSimulasi(acuan, "kunci-kuota")).berubah, []); // sudah sesuai: tidak ada perubahan
  assert.deepEqual((await L.terapkanSimulasi(acuan, "kunci-harga")).berubah, []); // dua arah rumus konsisten
  // Harga dikunci, margin turun ke 50%: kuota balasan naik, harga tetap
  const { berubah: naik } = await L.terapkanSimulasi({ ...acuan, margin: 50 }, "kunci-harga");
  assert.equal(naik.length, 3);
  const starterBaru = (await L.daftarPaket({ semua: true })).find((p) => p.kode === "starter");
  assert.equal(starterBaru.harga, 45000);
  assert.ok(starterBaru.kuota_balasan > 1000);
  // Simulasi hanya saran: paket yang tidak mungkin mencapai margin dilewati (tidak diubah, tidak menggagalkan paket lain).
  const sebelum = await L.daftarPaket({ semua: true });
  const kodeStarter = (daftar) => daftar.find((p) => p.kode === "starter");
  const lewat = await L.terapkanSimulasi({ ...acuan, margin: 90, metode: "va" }, "kunci-harga");
  assert.ok(lewat.dilewati.some((d) => d.nama === "Starter" && /terlalu rendah/.test(d.alasan)), "Starter dilaporkan dilewati");
  assert.deepEqual(kodeStarter(await L.daftarPaket({ semua: true })), kodeStarter(sebelum)); // dilewati = tidak berubah
  for (const p of sebelum) await L.simpanPaket(p); // pulihkan keadaan sebelum tes berikutnya
  // Hanya paket yang dipilih admin yang dihitung ulang; yang lain tetap seperti yang ia atur.
  const pro = sebelum.find((p) => p.kode === "pro");
  const sebagian = await L.terapkanSimulasi({ ...acuan, margin: 40 }, "kunci-harga", new Set([pro.id]));
  assert.deepEqual(sebagian.berubah.map((b) => b.nama), ["Pro"]);
  assert.deepEqual(kodeStarter(await L.daftarPaket({ semua: true })), kodeStarter(sebelum));
  for (const p of sebelum) await L.simpanPaket(p);
  await setSetting("margin_target", "80");
  assert.equal((await L.acuanHarga()).margin, 80);
});

console.log("== Paket Custom ==");
const C = await lib("src/lib/paket-custom.ts");
const KT = { usd: AI2.perkiraanPerBalasan("claude-haiku-5-5"), kurs: 16500, balasanPerNomorBulan: 900 };
const spekC = { ...C.BAWAAN_CUSTOM, kuota_balasan: 10000, nomor_otomatis: false, kuota_nomor: 10, durasi_hari: 30, margin: 60, pembulatan: 1000, cantik: false, harga_manual: false, harga: 0, pemakaian: 100, metode: "kartu", biaya_server: 0 };

await cek("paket Custom: kuota -> harga otomatis dari modal + margin (rumus sama dengan paket biasa); pembulatan & harga cantik tidak pernah di bawah harga pas", async () => {
  const h = C.hitungCustom(spekC, KT);
  assert.ok(Math.abs(h.rincian.modal - 146569.5) < 1e-6);
  assert.equal(h.hargaOtomatis, 401000); // (146.569,5 + 2.000) / (1 - 0,6 - 0,029) = 400.457,9 -> 401.000 (= simulasi paket Pro)
  assert.deepEqual([h.harga, h.status], [401000, "sehat"]);
  assert.ok(h.rincian.margin >= 0.6);
  assert.equal(C.hitungCustom({ ...spekC, pembulatan: 10000, cantik: true }, KT).hargaOtomatis, 409000);
  assert.equal(C.hitungCustom({ ...spekC, pembulatan: 50000 }, KT).hargaOtomatis, 450000);
  // Kuota 2x -> modal AI 2x -> harga ikut naik; margin turun -> harga turun
  assert.ok(C.hitungCustom({ ...spekC, kuota_balasan: 20000 }, KT).hargaOtomatis > 790000);
  assert.ok(C.hitungCustom({ ...spekC, margin: 40 }, KT).hargaOtomatis < 401000);
  // Durasi 90 hari: biaya server sebanding durasi, harga setara 30 hari ikut dihitung
  const tiga = C.hitungCustom({ ...spekC, durasi_hari: 90, biaya_server: 5000 }, KT);
  assert.ok(Math.abs(tiga.rincian.modalServer - 10 * 5000 * 3) < 1e-9);
  assert.ok(Math.abs(tiga.per30Hari - tiga.harga / 3) < 1e-6);
  for (const [pas, l] of [[1_240_000, 10_000], [1_249_500, 10_000], [1_249_000, 10_000], [3_000, 100_000], [401, 5_000]]) {
    const b = C.bulatkanHarga(pas, l, true);
    assert.ok(b >= pas && (b + 1000) % l === 0, `${pas} -> ${b}`);
  }
  assert.equal(C.bulatkanHarga(1_240_000, 10_000, true), 1_249_000);
  assert.equal(C.bulatkanHarga(1_249_500, 10_000, true), 1_259_000);
  assert.equal(C.bulatkanHarga(1_249_500, 10_000, false), 1_250_000);
  // Nomor otomatis dari pemakaian nyata (kuota ÷ balasan per nomor per bulan)
  assert.equal(C.hitungCustom({ ...spekC, nomor_otomatis: true, kuota_balasan: 3500 }, KT).kuotaNomor, 4);
  // Tarif model belum diketahui: tidak ada harga otomatis
  assert.equal(C.hitungCustom(spekC, { ...KT, usd: null }).hargaOtomatis, null);
});

await cek("paket Custom: harga sendiri menimpa harga otomatis; untung, margin, rugi & di bawah target terdeteksi; anggaran pelanggan -> kuota", async () => {
  const t = C.hitungCustom({ ...spekC, harga_manual: true, harga: 300000 }, KT);
  assert.deepEqual([t.harga, t.hargaOtomatis, t.status], [300000, 401000, "tipis"]);
  assert.ok(Math.abs(t.rincian.untung - (300000 - (300000 * 0.029 + 2000) - 146569.5)) < 1e-6);
  assert.equal(C.hitungCustom({ ...spekC, harga_manual: true, harga: 150000 }, KT).status, "rugi");
  const mahal = C.hitungCustom({ ...spekC, harga_manual: true, harga: 500000 }, KT);
  assert.deepEqual([mahal.status, mahal.perBalasan], ["sehat", 50]);
  // Kebalikan: anggaran = harga otomatis -> kuota kembali 10.000 (kelipatan 50, margin tetap tercapai)
  assert.equal(C.kuotaDariAnggaran(401000, spekC, KT), 10000);
  assert.equal(C.kuotaDariAnggaran(5000, spekC, KT), 0);
  const oto = { ...spekC, nomor_otomatis: true, biaya_server: 3000 };
  const q = C.kuotaDariAnggaran(1_000_000, oto, KT);
  assert.ok(q > 0 && q % 50 === 0);
  assert.ok(C.hitungCustom({ ...oto, kuota_balasan: q, harga_manual: true, harga: 1_000_000 }, KT).rincian.margin >= 0.59);
});

await cek("paket Custom versi lama (harga berupa teks) tetap tampil seperti dulu; isian rusak = bawaan; periksaCustom menolak angka tidak sah", async () => {
  const lama = C.rapikanCustom({ aktif: true, nama: "Custom", deskripsi: "Untuk cabang", harga: "Hubungi kami", fitur: ["A", "B"], wa: "6281234567890", pesan: "Halo", tombol: "Chat" });
  assert.deepEqual([lama.tampil_harga, lama.teks_harga, lama.tampil_kuota, lama.aksi, lama.harga, lama.kurs, lama.fitur], ["teks", "Hubungi kami", false, "wa", 0, 0, ["A", "B"]]);
  assert.equal(C.customTampil(lama), true);
  assert.deepEqual(C.rapikanCustom({ kuota_balasan: -5, margin: 99, metode: "bitcoin", pembulatan: 7, wa: "08123", harga: 1.5 }), C.BAWAAN_CUSTOM);
  const sah = { ...C.BAWAAN_CUSTOM, nama: "Enterprise" };
  assert.equal(typeof C.periksaCustom(sah), "object");
  for (const [ubah, pola] of [
    [{ durasi_hari: 0 }, /Durasi/],
    [{ kuota_balasan: 1.5 }, /Kuota balasan/],
    [{ margin: 95 }, /Margin/],
    [{ harga_manual: true, harga: 0 }, /Harga sendiri/],
    [{ nama: " " }, /Nama/],
    [{ aktif: true, aksi: "wa", wa: "" }, /WhatsApp/],
    [{ aktif: true, aksi: "bayar", tampil_harga: "teks", teks_harga: "" }, /Teks harga/],
    [{ nomor_otomatis: false, kuota_nomor: 0 }, /nomor/],
    [{ metode: "bitcoin" }, /Metode/],
  ])
    assert.match(C.periksaCustom({ ...sah, ...ubah }), pola, JSON.stringify(ubah));
  // Pesan WhatsApp ke admin memuat rincian paket di kartu, lalu email akun
  const isi = { ...sah, wa: "6281234567890", harga: 401000, kuota_nomor: 10, kuota_balasan: 10000 };
  const teks = new URL(C.tautanCustom(isi, "Email akun: budi@uji.test")).searchParams.get("text");
  assert.equal(teks, "Halo, saya tertarik dengan paket Custom ChatGerCep.\n\nPaket: Enterprise (10.000 balasan AI, 10 nomor WhatsApp, Rp401.000 / 30 hari)\nEmail akun: budi@uji.test");
  assert.ok(C.tautanCustom(isi).startsWith("https://wa.me/6281234567890?text="));
});

await cek("paket Custom disimpan: dihitung ulang di server (angka dari browser diabaikan), dicerminkan ke tabel paket, tidak ikut paket biasa & simulasinya", async () => {
  const isian = C.periksaCustom({ ...spekC, nama: "Enterprise", aktif: true, aksi: "bayar", tombol: "Pilih paket", harga: 1 });
  const { p, h } = await C.simpanPaketCustom(isian);
  assert.deepEqual([p.harga, p.kuota_nomor, p.kurs, h.status], [401000, 10, 16500, "sehat"]);
  assert.ok(p.dihitung > 0);
  assert.deepEqual(await C.paketCustom(), p);
  const id = await C.idPaketCustom();
  const baris = await L.paketById(id);
  assert.deepEqual([baris.kode, baris.nama, baris.harga, baris.kuota_balasan, baris.kuota_nomor, baris.durasi_hari, baris.aktif], ["_custom", "Enterprise", 401000, 10000, 10, 30, true]);
  assert.ok(!(await L.daftarPaket()).some((x) => x.kode === "_custom"), "tidak ikut daftar paket biasa");
  assert.ok(!(await L.daftarPaket({ semua: true })).some((x) => x.kode === "_custom"));
  assert.ok((await L.daftarPaket({ semua: true, custom: true })).some((x) => x.id === id), "ikut daftar 'Berikan paket'");
  // Formulir & simulasi paket biasa tidak bisa mengubah baris Custom
  await L.simpanPaket({ ...baris, harga: 1000 });
  const sebelum = await L.daftarPaket({ semua: true });
  await L.terapkanSimulasi({ ...(await L.acuanHarga()), kurs: 16500, margin: 10 }, "kunci-kuota");
  for (const x of sebelum) await L.simpanPaket(x);
  assert.equal((await L.paketById(id)).harga, 401000);
  // Tombol chat WhatsApp: baris nonaktif (tidak bisa dibeli lewat Midtrans), tetap satu baris yang sama
  await C.simpanPaketCustom(C.periksaCustom({ ...isian, aksi: "wa", wa: "6281234567890" }));
  assert.equal((await L.paketById(id)).aktif, false);
  assert.equal(await C.idPaketCustom(), id);
  // Model tanpa tarif resmi: ditolak, yang tersimpan tidak berubah
  await assert.rejects(C.simpanPaketCustom({ ...isian, model: "model-tak-dikenal" }), /Tarif model/);
  assert.equal((await C.paketCustom()).aksi, "wa");
});

await cek("paket Custom dibayar/diberikan seperti paket biasa: kuota dari isi paket, nominal tagihan = harganya, diperpanjang bila sama", async () => {
  await C.simpanPaketCustom(C.periksaCustom({ ...spekC, nama: "Enterprise", aktif: true, aksi: "bayar" }));
  const id = await C.idPaketCustom();
  await L.berikanPaket(lain.id, id);
  const h = await L.hakAkun({ id: lain.id, peran: "user" });
  assert.deepEqual([h.paket, h.nomor, h.balasan], ["Enterprise", 10, 10000]);
  await L.berikanPaket(lain.id, id);
  assert.equal((await L.hakAkun({ id: lain.id, peran: "user" })).balasan, 20000);
  const fetchAsli = globalThis.fetch;
  let snap;
  globalThis.fetch = async (_url, o) => {
    snap = JSON.parse(o.body);
    return new Response(JSON.stringify({ token: "tok-custom", redirect_url: "https://app.midtrans.com/snap/v4/redirection/tok-custom" }), { status: 201 });
  };
  try {
    await L.mulaiBayar(k, { id: lain.id, email: "lain@uji.test", nama: "Lain" }, await L.paketById(id), "https://wa.uji");
  } finally {
    globalThis.fetch = fetchAsli;
  }
  assert.equal(snap.transaction_details.gross_amount, 401000);
  await L.hentikanLangganan(lain.id);
});

await cek("paket Custom mengikuti kurs: bergeser >=1% -> harga otomatis dihitung ulang sekali & tersimpan (juga di tabel paket); <1%, harga sendiri, atau saklar mati tidak", async () => {
  const id = await C.idPaketCustom();
  const tetap = process.env.KURS_USD_TETAP;
  try {
    process.env.KURS_USD_TETAP = "16600"; // 0,6%
    assert.equal((await C.paketCustom()).harga, 401000);
    process.env.KURS_USD_TETAP = "17000"; // 3%: modal AI 10.000 x 0,000846 x 17.000 x 1,05 -> harga 413.000
    const [a, b] = await Promise.all([C.paketCustom(), C.paketCustom()]);
    assert.deepEqual([a.harga, a.kurs, a.kuota_nomor, b.harga], [413000, 17000, 10, 413000]);
    assert.equal((await L.paketById(id)).harga, 413000);
    process.env.KURS_USD_TETAP = "16500";
    await C.simpanPaketCustom(C.periksaCustom({ ...spekC, nama: "Enterprise", aktif: true, aksi: "bayar", harga_manual: true, harga: 777000 }));
    process.env.KURS_USD_TETAP = "18000";
    assert.equal((await C.paketCustom()).harga, 777000, "harga sendiri tidak pernah diubah otomatis");
    process.env.KURS_USD_TETAP = "16500";
    await C.simpanPaketCustom(C.periksaCustom({ ...spekC, nama: "Enterprise", ikut_kurs: false }));
    process.env.KURS_USD_TETAP = "18000";
    assert.equal((await C.paketCustom()).harga, 401000, "saklar 'mengikuti kurs' mati");
  } finally {
    process.env.KURS_USD_TETAP = tetap;
  }
});

console.log("== Berikan paket manual (admin) ==");
await cek("berikan paket manual: paket terdaftar + pembayaran transfer tercatat lunas; paket sama = diperpanjang; isi khusus = mulai baru dengan kuota sendiri; kompensasi Rp0", async () => {
  const akun = await P.buatAkun({ email: "manual@uji.test", nama: "Manual", password: "rahasia-manual-01" });
  const b0 = await L.paketById(bisnis.id); // nilai terkini (uji simulasi di atas bisa mengubah kuotanya)
  const h1 = await L.berikanPaketManual(akun.id, { paketId: bisnis.id, metode: "manual_transfer", jumlah: 249000, catatan: "BCA a.n. Manual" });
  assert.deepEqual([h1.nama, h1.kuota_balasan, h1.kuota_nomor, h1.diperpanjang, h1.jumlah], ["Bisnis", b0.kuota_balasan, b0.kuota_nomor, false, 249000]);
  assert.equal(h1.sampai - h1.mulai, b0.durasi_hari * 86400);
  assert.match(h1.orderId, new RegExp(`^ADM-${akun.id}-\\d+-[0-9a-f]{6}$`));
  let [t] = await L.riwayatTransaksi({ userId: akun.id });
  assert.deepEqual([t.status, t.metode, t.jumlah, t.catatan, t.nama_paket], ["lunas", "manual_transfer", 249000, "BCA a.n. Manual", "Bisnis"]);
  assert.equal((await L.hakAkun({ id: akun.id, peran: "user" })).paket, "Bisnis");
  // Paket sama lagi = diperpanjang (masa + kuota ditambah), transaksi kedua tercatat
  const h2 = await L.berikanPaketManual(akun.id, { paketId: bisnis.id, hari: 60, metode: "manual_tunai", jumlah: 498000, catatan: "" });
  assert.deepEqual([h2.diperpanjang, h2.kuota_balasan, h2.sampai - h1.sampai], [true, 2 * b0.kuota_balasan, 60 * 86400]);
  assert.equal((await L.riwayatTransaksi({ userId: akun.id })).length, 2);
  // Isi khusus hasil kesepakatan: mengganti paket lama, kuota sesuai isian, tanpa paket terdaftar
  const h3 = await L.berikanPaketManual(akun.id, { paketId: null, isi: { nama: "Custom PT Maju", kuota_balasan: 50000, kuota_nomor: 40 }, hari: 90, metode: "manual_transfer", jumlah: 4500000, catatan: "invoice 12" });
  assert.deepEqual([h3.nama, h3.kuota_balasan, h3.kuota_nomor, h3.diperpanjang, h3.sampai - h3.mulai], ["Custom PT Maju", 50000, 40, false, 90 * 86400]);
  const hak = await L.hakAkun({ id: akun.id, peran: "user" });
  assert.deepEqual([hak.paket, hak.balasan, hak.nomor], ["Custom PT Maju", 50000, 40]);
  const r = await L.riwayatLangganan(akun.id);
  assert.deepEqual(r.map((l) => [l.nama_paket, l.paket_id]), [["Custom PT Maju", null], ["Bisnis", bisnis.id]]);
  assert.ok(r[1].sampai <= sekarang(), "paket lama dihentikan saat diganti");
  // Isi khusus lagi = tetap mulai baru (tidak memperpanjang isi khusus lain)
  const h4 = await L.berikanPaketManual(akun.id, { paketId: null, isi: { nama: "Custom PT Maju", kuota_balasan: 50000, kuota_nomor: 40 }, hari: 30, metode: "kompensasi", jumlah: 99999, catatan: "" });
  assert.deepEqual([h4.diperpanjang, h4.jumlah], [false, 0]);
  [t] = await L.riwayatTransaksi({ userId: akun.id });
  assert.deepEqual([t.metode, t.jumlah], ["kompensasi", 0]);
  // Midtrans tetap memakai alur yang sama: berikanPaket lama masih berjalan
  await L.hentikanLangganan(akun.id);
  await L.berikanPaket(akun.id, starter.id);
  assert.equal((await L.hakAkun({ id: akun.id, peran: "user" })).paket, "Starter");
});

console.log("== Katalog produk ==");
const KAT = await lib("src/lib/katalog.ts");
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 1, 0, 72, 0, 72, 0, 0, 0xff, 0xd9]);

await cek("katalog: fitur akun berbayar (gratis tidak, berlangganan & admin boleh); produk + foto tersimpan, urutan bisa digeser, foto dicek dari isinya", async () => {
  const pemilik = await P.buatAkun({ email: "katalog@uji.test", nama: "Toko", password: "rahasia-toko-01" });
  const n = await tambahNomor("Toko Katalog", pemilik.id);
  assert.equal(await KAT.katalogBoleh(pemilik.id), false);
  assert.equal(await KAT.katalogBoleh(admin.id), true);
  await L.berikanPaket(pemilik.id, starter.id);
  globalThis.__waKatalogBoleh?.clear();
  assert.equal(await KAT.katalogBoleh(pemilik.id), true);
  const a = await KAT.simpanProduk(n.id, { nama: "Kopi Susu Aren", harga: 18000, deskripsi: "Es, 250 ml", tersedia: true, foto: JPEG });
  const b = await KAT.simpanProduk(n.id, { nama: "Roti Bakar", harga: null, deskripsi: "", tersedia: true });
  let d = await KAT.daftarProduk(n.id);
  assert.deepEqual(d.map((p) => [p.nama, p.harga, p.adaFoto]), [["Kopi Susu Aren", 18000, true], ["Roti Bakar", null, false]]);
  await KAT.geserProduk(n.id, b, -1);
  assert.deepEqual((await KAT.daftarProduk(n.id)).map((p) => p.id), [b, a]);
  // ubah tanpa foto = foto tetap; null = foto dihapus
  await KAT.simpanProduk(n.id, { id: a, nama: "Kopi Susu Aren Besar", harga: 22000, deskripsi: "", tersedia: true });
  assert.equal((await KAT.fotoProduk(a)).mime, "image/jpeg");
  const kirim = await KAT.bahanKirim(n.id, [a, b]);
  assert.deepEqual(kirim.foto.map((p) => [p.id, p.data.length]), [[a, JPEG.length]]);
  await KAT.simpanProduk(n.id, { id: a, nama: "Kopi Susu Aren Besar", harga: 22000, deskripsi: "", tersedia: true, foto: null });
  assert.equal(await KAT.fotoProduk(a), undefined);
  // validasi
  await assert.rejects(KAT.simpanProduk(n.id, { nama: "X", harga: 1, deskripsi: "", tersedia: true }), /Nama produk/);
  await assert.rejects(KAT.simpanProduk(n.id, { nama: "Palsu", harga: 1, deskripsi: "", tersedia: true, foto: new TextEncoder().encode("<svg onload=alert(1)>") }), /JPG, PNG, atau WebP/);
  await assert.rejects(KAT.simpanProduk(n.id, { id: 999999, nama: "Lain", harga: 1, deskripsi: "", tersedia: true }), /tidak ditemukan/);
  // produk nomor lain tidak bisa diubah/dihapus lewat nomor ini
  await KAT.hapusProduk(n1.id, a);
  assert.equal((await KAT.daftarProduk(n.id)).length, 2);
  await KAT.setTersedia(n.id, b, false);
  assert.equal((await KAT.daftarProduk(n.id)).find((p) => p.id === b).tersedia, false);
  await KAT.hapusProduk(n.id, a);
  assert.deepEqual((await KAT.daftarProduk(n.id)).map((p) => p.id), [b]);
});

await cek("penerusan selalu aktif selama nomor penerus terisi (saklar per nomor lama diabaikan)", async () => {
  const PN = await lib("src/lib/penerusan.ts");
  assert.equal(await PN.bisaTeruskan({ teruskan_ke: "6281234567890", teruskan_aktif: false }), true);
  assert.equal(await PN.bisaTeruskan({ teruskan_ke: null, teruskan_aktif: true }), false);
});

await cek("KPI admin: pendapatan, pelanggan berbayar, balasan, biaya AI, penerusan, tagihan menunggu, langganan berakhir & kuota menipis dibanding 30 hari sebelumnya", async () => {
  const K = await lib("src/lib/kpi.ts");
  const HARI = 86400;
  const kini = sekarang();
  const wib = (t) => new Date((t + 7 * 3600) * 1000).toISOString().slice(0, 10);
  const a = await K.kpiAdmin();
  assert.equal(a.hari.length, K.PERIODE_HARI);
  assert.equal(a.hari.at(-1), wib(kini));

  const u = await P.buatAkun({ email: "kpi@uji.test", nama: "KPI", password: "rahasia-kpi-0001" });
  const n = await tambahNomor("Nomor KPI", u.id);
  await sql`UPDATE numbers SET wa_id = '628111000999' WHERE id = ${n.id}`;
  await sql`INSERT INTO langganan(user_id, paket_id, nama_paket, mulai, sampai, kuota_nomor, kuota_balasan, sumber)
            VALUES (${u.id}, NULL, 'KPI Uji', ${kini - 10 * HARI}, ${kini + 3 * HARI}, 1, 10, 'admin')`;
  // 9 balasan terhitung kuota + 1 spam (biaya tetap tercatat, kuota tidak terpotong); satu panggilan 40 hari lalu = periode pembanding.
  for (let i = 0; i < 10; i++)
    await sql`INSERT INTO ai_pakai(number_id, waktu, penyedia, model, biaya_usd, ms, abaikan) VALUES (${n.id}, ${kini - i * 3600}, 'anthropic', 'uji', 0.01, 100, ${i === 9})`;
  await sql`INSERT INTO ai_pakai(number_id, waktu, penyedia, model, biaya_usd, ms) VALUES (${n.id}, ${kini - 40 * HARI}, 'anthropic', 'uji', 0.5, 100)`;
  await sql`INSERT INTO transaksi(order_id, user_id, nama_paket, jumlah, status, dibuat, dibayar) VALUES
    ('KPI-1', ${u.id}, 'KPI Uji', 150000, 'lunas', ${kini - 2 * HARI}, ${kini - 2 * HARI}),
    ('KPI-2', ${u.id}, 'KPI Uji', 50000, 'lunas', ${kini - 40 * HARI}, ${kini - 40 * HARI}),
    ('KPI-3', ${u.id}, 'KPI Uji', 99000, 'menunggu', ${kini - HARI}, NULL),
    ('KPI-4', ${u.id}, 'KPI Uji', 70000, 'menunggu', ${kini - 9 * HARI}, NULL)`;
  await sql`INSERT INTO stats(number_id, tanggal, masuk, dibalas) VALUES (${n.id}, ${wib(kini)}, 5, 4), (${n.id}, ${wib(kini - 35 * HARI)}, 3, 2)`;
  await sql`INSERT INTO teruskan(number_id, chat, jenis, ringkasan, tujuan, status, created_at) VALUES
    (${n.id}, 'c1', 'pesanan', 'pesan 2', '62811', 'terkirim', ${kini - HARI}),
    (${n.id}, 'c2', 'uji', 'uji', '62811', 'terkirim', ${kini}),
    (${n.id}, 'c3', 'keluhan', 'gagal kirim', '62811', 'gagal', ${kini})`;

  const b = await K.kpiAdmin();
  const beda = (f) => f(b) - f(a);
  const hariKe = (t) => b.hari.indexOf(wib(t));
  assert.deepEqual(
    [beda((k) => k.pendapatan.kini), beda((k) => k.pendapatan.lalu), beda((k) => k.pendapatan.transaksi)],
    [150000, 50000, 1]
  );
  assert.equal(b.pendapatan.harian[hariKe(kini - 2 * HARI)].nilai - a.pendapatan.harian[hariKe(kini - 2 * HARI)].nilai, 150000);
  assert.deepEqual([beda((k) => k.berbayar.kini), beda((k) => k.berbayar.lalu)], [1, 0]);
  assert.equal(b.berbayar.harian.at(-1).nilai - a.berbayar.harian.at(-1).nilai, 1, "aktif hari ini");
  assert.equal(b.berbayar.harian[hariKe(kini - 15 * HARI)].nilai - a.berbayar.harian[hariKe(kini - 15 * HARI)].nilai, 0, "belum mulai 15 hari lalu");
  assert.deepEqual(b.berbayar.perPaket.find((p) => p.nama === "KPI Uji"), { nama: "KPI Uji", jumlah: 1 });
  assert.deepEqual([beda((k) => k.balasan.kini), beda((k) => k.balasan.masuk), beda((k) => k.balasan.lalu)], [4, 5, 2]);
  assert.equal(b.balasan.harian.at(-1).dibalas - a.balasan.harian.at(-1).dibalas, 4);
  assert.ok(Math.abs(beda((k) => k.biayaAiUsd.kini) - 0.1) < 1e-9 && Math.abs(beda((k) => k.biayaAiUsd.lalu) - 0.5) < 1e-9);
  assert.equal(beda((k) => k.diteruskan.kini), 1, "uji & gagal tidak dihitung");
  assert.deepEqual([beda((k) => k.menunggu.jumlah), beda((k) => k.menunggu.nilai)], [1, 99000], "tagihan > 7 hari tidak dihitung");
  assert.deepEqual([beda((k) => k.akun.total), beda((k) => k.akun.pengguna), beda((k) => k.akun.baruKini)], [1, 1, 1]);
  assert.equal(beda((k) => k.nomor.total), 1);
  assert.deepEqual(b.nomor.tertaut.find((x) => x.userId === u.id), { sesi: n.sesi, label: "Nomor KPI", userId: u.id, email: "kpi@uji.test" });
  assert.deepEqual(b.berakhir.find((x) => x.userId === u.id), { userId: u.id, email: "kpi@uji.test", paket: "KPI Uji", sampai: kini + 3 * HARI });
  assert.deepEqual(b.kuotaMenipis.find((x) => x.userId === u.id), { userId: u.id, email: "kpi@uji.test", paket: "KPI Uji", terpakai: 9, kuota: 10 });

  // Akun diblokir: nomornya tidak dihitung sebagai "tertaut" (sengaja tidak dilayani), admin tidak dihitung pelanggan.
  await sql`UPDATE users SET status = 'diblokir' WHERE id = ${u.id}`;
  const c = await K.kpiAdmin();
  assert.equal(c.nomor.tertaut.some((x) => x.userId === u.id), false);
  await sql`UPDATE users SET status = 'aktif' WHERE id = ${u.id}`;
});

await cek("tur panduan: tercatat per akun, tidak dobel", async () => {
  assert.deepEqual(await P.turSelesai(budi.id), []);
  await P.tandaiTurSelesai(budi.id, "dashboard");
  await P.tandaiTurSelesai(budi.id, "dashboard");
  await P.tandaiTurSelesai(budi.id, "nomor");
  assert.deepEqual(await P.turSelesai(budi.id), ["dashboard", "nomor"]);
});

void AI;
await sql.end({ timeout: 2 });
await pg.berhenti();
console.log(`\nLOLOS ${lolos} uji langganan & pembayaran`);
process.exit(0);
