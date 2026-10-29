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

await cek("hak akun: admin tanpa batas; tanpa paket = kuota gratis bulanan (bisa diatur admin); kuota nomor per akun mengalahkan paket", async () => {
  assert.deepEqual(await L.hakAkun({ id: admin.id, peran: "admin" }), { nomor: null, balasan: null, periodeMulai: L.awalBulanWib(), sampai: null, paket: "Admin" });
  let h = await L.hakAkun(B);
  assert.deepEqual([h.nomor, h.balasan, h.paket, h.sampai], [1, 100, "Gratis", null]);
  await setSetting("kuota_balasan_gratis", "50");
  h = await L.hakAkun(B);
  assert.equal(h.balasan, 50);
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
  await setSetting("kuota_balasan_gratis", "3");
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
await cek("bayar paket: tagihan tercatat 'menunggu', Snap dipanggil dengan nominal & Basic auth server key, kembali ke /langganan", async () => {
  const url = await L.mulaiBayar(k, { id: budi.id, email: "budi@uji.test", nama: "Budi" }, starter, "https://wa.uji");
  assert.equal(url, "https://app.midtrans.com/snap/v4/redirection/tok-uji");
  const snap = panggilan.find((p) => p.url.includes("/snap/v1/"));
  assert.equal(snap.auth, `Basic ${Buffer.from(`${SK}:`).toString("base64")}`);
  assert.equal(snap.body.transaction_details.gross_amount, 99000);
  orderId = snap.body.transaction_details.order_id;
  assert.match(orderId, new RegExp(`^WA-${budi.id}-\\d+-[0-9a-f]{6}$`));
  assert.equal(snap.body.callbacks.finish, `https://wa.uji/langganan?order=${encodeURIComponent(orderId)}`);
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
