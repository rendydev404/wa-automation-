// Uji jaminan uang kembali (src/lib/jaminan.ts) pengganti free trial: syarat, Refund API Midtrans tiruan, pencabutan
// paket, pembatalan komisi afiliasi + masa tahan 7 hari, refund dari dashboard Midtrans (webhook), gagal lalu coba lagi.
// PostgreSQL 15 sungguhan (uji/pg-lokal.mjs). Pakai: node --import ./uji/loader.mjs uji/uji-jaminan.mjs
import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { mulaiPg } from "./pg-lokal.mjs";

const akar = process.cwd();
const tmp = path.join(os.tmpdir(), "wa-uji-jaminan");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const pg = await mulaiPg({ dir: path.join(tmp, "pg"), sementara: true });
process.env.DATABASE_URL = pg.url;
process.env.DATA_DIR = path.join(tmp, "kosong");
process.env.AUTH_SECRET = "q".repeat(48);
const lib = (f) => import(pathToFileURL(path.join(akar, f)).href);

const { db, sekarang } = await lib("src/lib/db.ts");
const L = await lib("src/lib/langganan.ts");
const J = await lib("src/lib/jaminan.ts");
const A = await lib("src/lib/afiliasi.ts");
const P = await lib("src/lib/pengguna.ts");
const { tambahNomor } = await lib("src/lib/numbers.ts");
const sql = await db();

let lolos = 0;
const cek = async (nama, fn) => {
  await fn();
  lolos += 1;
  console.log(`  ok  ${nama}`);
};

// ---- Midtrans tiruan: /v2/{order}/status dan /v2/{order}/refund ----
const k = { serverKey: "Mid-server-UJIjaminan", produksi: true };
/** order_id -> { status, gross, refunds[] } */
const dunia = new Map();
const tiruan = { tolakRefund: null };
const panggilan = [];
const jawab = (d, status = 200) => new Response(JSON.stringify(d), { status });
globalThis.fetch = async (url, o) => {
  const u = String(url);
  const body = o?.body ? JSON.parse(o.body) : null;
  panggilan.push({ url: u, method: o?.method ?? "GET", body });
  let m = u.match(/^https:\/\/api\.midtrans\.com\/v2\/(.+)\/status$/);
  if (m) {
    const d = dunia.get(decodeURIComponent(m[1]));
    if (!d) return jawab({ status_code: "404", status_message: "Transaction doesn't exist." }, 404);
    return jawab({ order_id: decodeURIComponent(m[1]), status_code: "200", gross_amount: `${d.gross}.00`, transaction_status: d.status, payment_type: d.tipe, refunds: d.refunds });
  }
  m = u.match(/^https:\/\/api\.midtrans\.com\/v2\/(.+)\/refund$/);
  if (m) {
    const d = dunia.get(decodeURIComponent(m[1]));
    // Galat Midtrans datang sebagai HTTP 200 dengan status_code di badan.
    if (tiruan.tolakRefund) return jawab({ status_code: tiruan.tolakRefund, status_message: "Merchant does not have enough balance" });
    if (!d || d.status !== "settlement") return jawab({ status_code: "412", status_message: "Merchant cannot modify the status of the transaction" });
    if (Number(body.amount) !== d.gross) return jawab({ status_code: "414", status_message: "Refund request is rejected due to invalid amount." });
    d.status = "refund";
    d.refunds = [{ refund_key: body.refund_key, refund_amount: `${body.amount}.00`, bank_confirmed_at: "2026-11-07 10:00:00" }];
    return jawab({ status_code: "200", status_message: "Success, refund request is approved", transaction_status: "refund", refund_key: body.refund_key });
  }
  return new Response("{}", { status: 404 });
};
const refundDipanggil = () => panggilan.filter((p) => p.url.endsWith("/refund"));

const paket = await L.daftarPaket();
const starter = paket.find((p) => p.kode === "starter"); // Rp99.000, 1.000 balasan, komisi 20%

/** Tagihan Midtrans lunas lewat jalur sungguhan: baris transaksi + status settlement -> terapkanStatus (paket & komisi). */
async function bayar(user, kanal, dibayarLalu = 0) {
  const kini = sekarang();
  const orderId = `WA-${user.id}-${kini}-${Math.random().toString(16).slice(2, 8)}`;
  await sql`
    INSERT INTO transaksi(order_id, user_id, paket_id, nama_paket, jumlah, status, kanal, dibuat)
    VALUES (${orderId}, ${user.id}, ${starter.id}, ${starter.nama}, ${starter.harga}, 'menunggu', ${kanal}, ${kini - dibayarLalu})`;
  dunia.set(orderId, { status: "settlement", gross: starter.harga, tipe: kanal === "bni" ? "bank_transfer" : kanal, refunds: undefined });
  const h = await L.terapkanStatus(k, orderId);
  assert.equal(h.baruAktif, true);
  if (dibayarLalu) await sql`UPDATE transaksi SET dibayar = dibayar - ${dibayarLalu} WHERE order_id = ${orderId}`;
  return orderId;
}
const pakaiAi = async (numberId, n) => {
  const t = sekarang();
  for (let i = 0; i < n; i++) await sql`INSERT INTO ai_pakai(number_id, waktu, penyedia, ms) VALUES (${numberId}, ${t}, 'hermes', 1000)`;
};
const akun = async (email, wa) => {
  const u = await P.buatAkun({ email, nama: email.split("@")[0], password: "rahasia-uji-01" });
  const n = await tambahNomor(`Nomor ${email}`, u.id);
  if (wa) await sql`UPDATE numbers SET wa_id = ${wa} WHERE id = ${n.id}`;
  return { ...u, peran: "user", nomor: n };
};

const mitra = await akun("mitra@uji.test");
const af = await A.daftarAfiliator(mitra.id, { bankNama: "bca", bankNomor: "1234567890", bankPemilik: "Mitra" });

await cek("tanpa free trial: akun baru 0 balasan AI, bukan masa percobaan; kuota habis = tanpa pesan di chat pelanggan", async () => {
  const u = await akun("baru@uji.test", "6281100000001");
  const h = await L.hakAkun(u);
  assert.deepEqual([h.balasan, h.percobaan, h.percobaanBerakhir, h.sampai], [0, false, false, null]);
  assert.equal(await L.sisaKuotaAi(u.id), 0);
  assert.equal(await L.catatKuotaHabis(u.id), false, "tidak mengirim pesan 'masa gratis habis' ke chat");
  const [n] = await sql`SELECT judul FROM notifikasi WHERE user_id = ${u.id} ORDER BY id DESC LIMIT 1`;
  assert.equal(n.judul, "AI belum membalas pelanggan");
  assert.equal(await J.cekJaminan(u.id), null, "belum pernah membayar");
  assert.equal(await J.sudahPernahBayar(u.id), false);
});

const ani = await akun("ani@uji.test", "6281200000002");
await A.terapkanReferral(ani.id, af.kode);
let orderAni;
const tujuanAni = { bank: "gopay", nomor: "0812-0000-0002", nama: "Ani Lestari" };

await cek("bayar QRIS pertama: paket aktif + komisi afiliasi masuk saldo tapi TERTAHAN masa jaminan (belum bisa ditarik)", async () => {
  orderAni = await bayar(ani, "qris");
  assert.equal(await J.sudahPernahBayar(ani.id), true);
  assert.equal((await A.profilAfiliator(mitra.id)).saldo, 19_800);
  assert.equal((await A.ringkasanAfiliasiUser(mitra.id)).tertahan, 19_800);
  await assert.rejects(() => A.ajukanPenarikan(mitra.id, 50_000), /komisi baru bisa ditarik 3 hari/);
});

await cek("syarat jaminan: 3 hari, boleh selama pemakaian <= 20% kuota (200 dari 1.000); lewat itu ditolak dengan angka", async () => {
  let j = await J.cekJaminan(ani.id);
  assert.deepEqual([j.boleh, j.terpakai, j.batasPakai, j.jumlah, j.kanal], [true, 0, 200, 99_000, "qris"]);
  assert.ok(Math.abs(j.sampai - (sekarang() + 3 * 86400)) <= 2);
  await pakaiAi(ani.nomor.id, 201);
  j = await J.cekJaminan(ani.id);
  assert.equal(j.boleh, false);
  assert.match(j.alasan.id, /201.*lebih dari 20%.*200/);
  await sql`DELETE FROM ai_pakai WHERE id IN (SELECT id FROM ai_pakai WHERE number_id = ${ani.nomor.id} LIMIT 151)`;
  j = await J.cekJaminan(ani.id);
  assert.deepEqual([j.boleh, j.terpakai], [true, 50]);
});

await cek("kueri syarat cepat & lewat indeks", async () => {
  const t0 = performance.now();
  for (let i = 0; i < 20; i++) await J.cekJaminan(ani.id);
  const ms = (performance.now() - t0) / 20;
  console.log(`      (cekJaminan rata-rata ${ms.toFixed(2)} ms)`);
  assert.ok(ms < 20, `cekJaminan ${ms} ms`);
  await sql`SET enable_seqscan = off`;
  const rencana = async (q) => (await sql.unsafe(`EXPLAIN ${q}`)).map((r) => r["QUERY PLAN"]).join("\n");
  const r1 = await rencana(`SELECT t.id FROM transaksi t LEFT JOIN langganan l ON l.id = t.langganan_id LEFT JOIN pengembalian_dana r ON r.transaksi_id = t.id
      WHERE t.user_id = ${ani.id} AND t.status IN ('lunas','dikembalikan') AND t.jumlah > 0 ORDER BY t.dibuat ASC, t.id ASC LIMIT 2`);
  const r2 = await rencana(`SELECT id FROM pengembalian_dana WHERE status IN ('menunggu', 'diproses', 'gagal') ORDER BY dibuat, id`);
  await sql`SET enable_seqscan = on`;
  assert.match(r1, /transaksi_user_idx/);
  assert.match(r2, /pengembalian_dana_berjalan_idx/);
});

console.log("== mode manual (bawaan) ==");

await cek("mode bawaan = manual; tujuan transfer wajib & divalidasi", async () => {
  assert.equal(await J.modeRefund(), "manual");
  let h = await J.ajukanJaminan(k, ani.id, { alasan: "" });
  assert.equal(h.ok, false);
  assert.match(h.pesan.id, /Pilih bank atau e-wallet/);
  h = await J.ajukanJaminan(k, ani.id, { alasan: "", tujuan: { bank: "gopay", nomor: "0812", nama: "Ani" } });
  assert.match(h.pesan.id, /minimal 6 digit/);
  h = await J.ajukanJaminan(k, ani.id, { alasan: "", tujuan: { bank: "bank-palsu", nomor: "081200000002", nama: "Ani" } });
  assert.match(h.pesan.id, /Pilih bank/);
  assert.equal((await sql`SELECT count(*)::int AS n FROM pengembalian_dana`)[0].n, 0);
});

let idAni;
await cek("manual: ajukan = 'menunggu' + tujuan tersimpan, TANPA panggilan Midtrans; paket tetap aktif; komisi tetap tertahan walau masa jaminan lewat", async () => {
  const h = await J.ajukanJaminan(k, ani.id, { alasan: "Kurang cocok untuk toko saya", tujuan: tujuanAni });
  assert.deepEqual(h, { ok: true, cara: "manual" });
  assert.equal(refundDipanggil().length, 0);
  const [pd] = await sql`SELECT id, status, cara, tujuan_bank, tujuan_nomor, tujuan_nama, alasan, terpakai, wa_ids FROM pengembalian_dana WHERE order_id = ${orderAni}`;
  idAni = pd.id;
  assert.deepEqual(
    [pd.status, pd.cara, pd.tujuan_bank, pd.tujuan_nomor, pd.tujuan_nama, pd.alasan, pd.terpakai, pd.wa_ids],
    ["menunggu", "manual", "gopay", "081200000002", "Ani Lestari", "Kurang cocok untuk toko saya", 50, ["6281200000002"]],
  );
  assert.ok(await L.langgananAktif(ani.id), "paket tetap aktif sampai admin mentransfer");
  const j = await J.cekJaminan(ani.id);
  assert.deepEqual([j.boleh, j.pengajuan.status, j.pengajuan.tujuan.nomor], [false, "menunggu", "081200000002"]);
  assert.match((await J.ajukanJaminan(k, ani.id, { alasan: "", tujuan: tujuanAni })).pesan.id, /sedang diproses/);
  // Masa jaminan (3 hari) lewat tapi pengajuan belum selesai: komisinya tetap tidak boleh ditarik.
  await sql`UPDATE komisi_afiliasi SET created_at = created_at - 5 * 86400 WHERE afiliator_id = ${mitra.id}`;
  assert.equal((await A.ringkasanAfiliasiUser(mitra.id)).tertahan, 19_800);
  const { berjalan } = await J.daftarPengembalian();
  assert.deepEqual(berjalan.map((r) => r.id), [idAni]);
});

await cek("admin 'sudah ditransfer': selesai + referensi, paket dicabut, komisi batal, transaksi dikembalikan; klik kedua ditolak", async () => {
  assert.deepEqual(await J.selesaikanManual(idAni, " TRF-0001 "), { ok: true, cara: "manual" });
  const [pd] = await sql`SELECT status, cara, referensi, selesai FROM pengembalian_dana WHERE id = ${idAni}`;
  assert.deepEqual([pd.status, pd.cara, pd.referensi], ["selesai", "manual", "TRF-0001"]);
  assert.ok(pd.selesai);
  assert.equal((await sql`SELECT status FROM transaksi WHERE order_id = ${orderAni}`)[0].status, "dikembalikan");
  assert.equal(await L.langgananAktif(ani.id), undefined, "paket dicabut");
  assert.equal(await L.sisaKuotaAi(ani.id), 0, "AI berhenti membalas");
  const p = await A.profilAfiliator(mitra.id);
  assert.deepEqual([p.saldo, p.total_komisi], [0, 0]);
  const [n] = await sql`SELECT judul, isi FROM notifikasi WHERE user_id = ${ani.id} AND jenis = 'pembayaran' ORDER BY id DESC LIMIT 1`;
  assert.match(n.isi, /ditransfer kembali ke GoPay 081200000002 a\.n\. Ani Lestari/);
  assert.equal((await J.selesaikanManual(idAni, "")).ok, false);
  assert.equal(refundDipanggil().length, 0, "manual tidak pernah memanggil Midtrans");
});

await cek("manual: status Midtrans tetap 'settlement' -> webhook berikutnya tidak membalik ke lunas / menghidupkan paket", async () => {
  await L.terapkanStatus(k, orderAni);
  assert.equal((await sql`SELECT status FROM transaksi WHERE order_id = ${orderAni}`)[0].status, "dikembalikan");
  assert.equal(await L.langgananAktif(ani.id), undefined);
});

await cek("admin tolak: alasan wajib, status ditolak, paket tetap aktif, pemilik diberi tahu dan tidak bisa mengajukan lagi", async () => {
  const lina = await akun("lina@uji.test", "6282000000010");
  const order = await bayar(lina, "gopay");
  assert.equal((await J.ajukanJaminan(k, lina.id, { alasan: "", tujuan: { bank: "dana", nomor: "082000000010", nama: "Lina" } })).ok, true);
  const [pd] = await sql`SELECT id FROM pengembalian_dana WHERE order_id = ${order}`;
  assert.equal((await J.tolakPengembalian(pd.id, "x")).ok, false);
  assert.deepEqual(await J.tolakPengembalian(pd.id, "Pemakaian sudah melewati batas saat dicek"), { ok: true, cara: "manual" });
  assert.equal((await sql`SELECT status FROM pengembalian_dana WHERE id = ${pd.id}`)[0].status, "ditolak");
  assert.ok(await L.langgananAktif(lina.id));
  const j = await J.cekJaminan(lina.id);
  assert.deepEqual([j.boleh, j.pengajuan.status, j.pengajuan.catatan], [false, "ditolak", "Pemakaian sudah melewati batas saat dicek"]);
  await new Promise((r) => setTimeout(r, 50));
  const [n] = await sql`SELECT judul FROM notifikasi WHERE user_id = ${lina.id} AND jenis = 'pembayaran' ORDER BY id DESC LIMIT 1`;
  assert.match(n.judul, /ditolak/);
  assert.equal((await J.selesaikanManual(pd.id, "")).ok, false, "yang sudah ditolak tidak bisa diselesaikan");
});

await cek("sekali per orang: nomor WhatsApp yang sudah memakai jaminan tidak bisa lagi lewat akun baru, walau akun lamanya dihapus", async () => {
  await sql`DELETE FROM users WHERE id = ${ani.id}`; // catatan pengembalian tetap ada (FK SET NULL)
  assert.equal((await sql`SELECT count(*)::int AS n FROM pengembalian_dana WHERE user_id IS NULL AND wa_ids = '{6281200000002}'`)[0].n, 1);
  const ani2 = await akun("ani-lagi@uji.test", "6281200000002");
  await bayar(ani2, "gopay");
  const j = await J.cekJaminan(ani2.id);
  assert.equal(j.boleh, false);
  assert.match(j.alasan.id, /sudah pernah memakai jaminan/);
});

await cek("VA bank tidak termasuk; pembayaran kedua & lewat 3 hari juga tidak", async () => {
  const budi = await akun("budi@uji.test", "6281300000003");
  await bayar(budi, "bni");
  let j = await J.cekJaminan(budi.id);
  assert.equal(j.boleh, false);
  assert.match(j.alasan.id, /GoPay, ShopeePay, atau QRIS/);
  assert.equal((await J.ajukanJaminan(k, budi.id, { alasan: "", tujuan: tujuanAni })).ok, false);

  const citra = await akun("citra@uji.test", "6281400000004");
  await bayar(citra, "gopay");
  await bayar(citra, "gopay"); // perpanjangan
  j = await J.cekJaminan(citra.id);
  assert.match(j.alasan.id, /pembayaran pertama/);

  const dodi = await akun("dodi@uji.test", "6281500000005");
  await bayar(dodi, "shopeepay", 4 * 86400);
  j = await J.cekJaminan(dodi.id);
  assert.match(j.alasan.id, /sudah lewat/);
});

console.log("== mode otomatis (Refund API Midtrans) ==");

await cek("otomatis: Refund API sekali (kunci RF-<id>, nominal penuh), langsung selesai; webhook berulang idempoten", async () => {
  await J.setModeRefund("otomatis");
  assert.equal(await J.modeRefund(), "otomatis");
  const oto = await akun("oto@uji.test", "6282100000011");
  await A.terapkanReferral(oto.id, af.kode);
  const order = await bayar(oto, "qris");
  const h = await J.ajukanJaminan(k, oto.id, { alasan: "Belum butuh" });
  assert.deepEqual(h, { ok: true, cara: "otomatis" });
  const [r] = refundDipanggil();
  const [t] = await sql`SELECT id, status FROM transaksi WHERE order_id = ${order}`;
  assert.deepEqual([r.method, r.body.refund_key, r.body.amount], ["POST", `RF-${t.id}`, 99_000]);
  assert.equal(t.status, "dikembalikan");
  assert.equal(await L.langgananAktif(oto.id), undefined);
  assert.equal((await A.profilAfiliator(mitra.id)).saldo, 0);
  await L.terapkanStatus(k, order);
  await L.terapkanStatus(k, order);
  assert.equal(refundDipanggil().length, 1);
  const [pd] = await sql`SELECT status, cara, dikonfirmasi FROM pengembalian_dana WHERE order_id = ${order}`;
  assert.deepEqual([pd.status, pd.cara], ["selesai", "otomatis"]);
  assert.ok(pd.dikonfirmasi, "bank_confirmed_at dari status Midtrans tercatat");
});

await cek("otomatis ditolak Midtrans (refund belum diaktifkan / saldo kurang): 'gagal', paket TETAP aktif; admin coba lagi = selesai, kunci sama", async () => {
  const eka = await akun("eka@uji.test", "6281600000006");
  const order = await bayar(eka, "gopay");
  tiruan.tolakRefund = "412";
  const h = await J.ajukanJaminan(k, eka.id, { alasan: "" });
  assert.equal(h.ok, false);
  assert.match(h.pesan.id, /Admin sudah diberi tahu/);
  const [pd] = await sql`SELECT id, status, galat, refund_key FROM pengembalian_dana WHERE order_id = ${order}`;
  assert.equal(pd.status, "gagal");
  assert.match(pd.galat, /kode 412/);
  assert.ok(await L.langgananAktif(eka.id));
  assert.equal((await J.cekJaminan(eka.id)).boleh, true, "pemilik akun boleh mencoba lagi");
  tiruan.tolakRefund = null;
  assert.deepEqual(await J.ulangiPengembalian(k, pd.id), { ok: true, cara: "otomatis" });
  assert.equal(refundDipanggil().at(-1).body.refund_key, pd.refund_key);
  assert.equal(await L.langgananAktif(eka.id), undefined);
  assert.equal((await J.ulangiPengembalian(k, pd.id)).ok, false);
});

await cek("otomatis gagal lalu admin transfer sendiri: 'sudah ditransfer' menuntaskan sebagai manual", async () => {
  const fia = await akun("fia@uji.test", "6282200000012");
  const order = await bayar(fia, "shopeepay");
  tiruan.tolakRefund = "412";
  await J.ajukanJaminan(k, fia.id, { alasan: "" });
  tiruan.tolakRefund = null;
  const [pd] = await sql`SELECT id FROM pengembalian_dana WHERE order_id = ${order}`;
  const n = refundDipanggil().length;
  assert.deepEqual(await J.selesaikanManual(pd.id, "TRF-9"), { ok: true, cara: "manual" });
  assert.equal(refundDipanggil().length, n);
  assert.equal((await sql`SELECT cara FROM pengembalian_dana WHERE id = ${pd.id}`)[0].cara, "manual");
  assert.equal(await L.langgananAktif(fia.id), undefined);
});

await cek("refund dari dashboard Midtrans (webhook): paket dicabut, komisi batal, tercatat cara 'midtrans'; refund sebagian tidak mencabut", async () => {
  const fani = await akun("fani@uji.test", "6281700000007");
  await A.terapkanReferral(fani.id, af.kode);
  const order = await bayar(fani, "qris");
  assert.equal((await A.profilAfiliator(mitra.id)).saldo, 19_800);
  dunia.get(order).status = "refund";
  await L.terapkanStatus(k, order);
  assert.equal(await L.langgananAktif(fani.id), undefined);
  assert.equal((await A.profilAfiliator(mitra.id)).saldo, 0);
  const [pd] = await sql`SELECT status, cara, refund_key FROM pengembalian_dana WHERE order_id = ${order}`;
  assert.deepEqual([pd.status, pd.cara, pd.refund_key], ["selesai", "midtrans", null]);
  const gita = await akun("gita@uji.test", "6281800000008");
  const o2 = await bayar(gita, "gopay");
  dunia.get(o2).status = "partial_refund";
  await L.terapkanStatus(k, o2);
  assert.ok(await L.langgananAktif(gita.id));
  await J.setModeRefund("manual");
});

await cek("masa tahan komisi lewat 3 hari (tanpa pengajuan berjalan) = bisa ditarik", async () => {
  for (const x of ["hana", "ika", "joko"]) {
    const u = await akun(`${x}@uji.test`);
    await A.terapkanReferral(u.id, af.kode);
    await bayar(u, "gopay");
  }
  assert.equal((await A.profilAfiliator(mitra.id)).saldo, 59_400);
  await assert.rejects(() => A.ajukanPenarikan(mitra.id, 50_000), /ditarik 3 hari/);
  await sql`UPDATE komisi_afiliasi SET created_at = created_at - 4 * 86400 WHERE afiliator_id = ${mitra.id}`;
  assert.equal((await A.ringkasanAfiliasiUser(mitra.id)).tertahan, 0);
  assert.equal((await A.ajukanPenarikan(mitra.id, 50_000)).status, "menunggu");
});

await cek("daftar admin: yang berjalan terpisah dari riwayat (selesai/ditolak terbaru dulu)", async () => {
  const { berjalan, riwayat } = await J.daftarPengembalian(10);
  assert.equal(berjalan.length, 0);
  assert.ok(riwayat.length >= 5);
  assert.ok(riwayat.every((r, i) => i === 0 || riwayat[i - 1].dibuat >= r.dibuat));
  assert.deepEqual(new Set(riwayat.map((r) => r.cara)), new Set(["manual", "otomatis", "midtrans"]));
});

await sql.end({ timeout: 2 });
await pg.berhenti().catch(() => {});
console.log(`\nLOLOS ${lolos} uji jaminan uang kembali`);
process.exit(0);
