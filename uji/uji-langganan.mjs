// Uji paket langganan, kuota balasan AI, dan pembayaran Midtrans Core API (API Midtrans tiruan lewat fetch).
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
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
const lib = (f) => import(pathToFileURL(path.join(akar, f)).href);

const { db, setSetting, sekarang } = await lib("src/lib/db.ts");
const L = await lib("src/lib/langganan.ts");
const M = await lib("src/lib/midtrans.ts");
const H0 = await lib("src/lib/harga.ts");
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

await cek("hak akun: admin tanpa batas; tanpa paket = TANPA free trial (0 balasan, bukan masa percobaan); admin masih bisa menyalakan trial (jumlah & 'tiap bulan'); kuota nomor per akun mengalahkan paket", async () => {
  assert.deepEqual(await L.hakAkun({ id: admin.id, peran: "admin" }), { nomor: null, balasan: null, periodeMulai: L.awalBulanWib(), sampai: null, paket: "Admin", kodePaket: null, bonus: 0, percobaan: false, percobaanSampai: null, percobaanBerakhir: false });
  let h = await L.hakAkun(B);
  const [{ created_at: dibuat }] = await sql`SELECT created_at FROM users WHERE id = ${budi.id}`;
  // Migrasi v30 (jaminan uang kembali) mematikan trial: tidak ada masa percobaan yang bisa "berakhir".
  assert.deepEqual([h.nomor, h.balasan, h.paket, h.sampai, h.percobaan, h.periodeMulai], [1, 0, "Gratis", null, false, L.awalBulanWib()]);
  assert.deepEqual([h.percobaanSampai, h.percobaanBerakhir], [null, false]);
  await setSetting("kuota_percobaan", "50");
  h = await L.hakAkun(B);
  assert.deepEqual([h.balasan, h.percobaan, h.periodeMulai], [50, true, dibuat]);
  // Masa percobaan bawaan 7 hari sejak akun dibuat (bila admin menyalakan trial lagi).
  assert.deepEqual([h.percobaanSampai, h.percobaanBerakhir], [dibuat + 7 * 86400, false]);
  await setSetting("kuota_percobaan_ulang", "bulanan");
  h = await L.hakAkun(B);
  assert.deepEqual([h.balasan, h.percobaan, h.periodeMulai, h.percobaanSampai], [50, false, L.awalBulanWib(), null]);
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
  await setSetting("kuota_percobaan_hari", "0"); // tanpa batas waktu dulu; masa berlaku diuji di akhir
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
  // Masa percobaan: akun ini dibuat 60 hari lalu. 90 hari = masih berlaku; 30 hari = sudah lewat, AI berhenti
  // walau balasannya masih tersisa.
  await setSetting("kuota_percobaan_hari", "90");
  L.segarkanKuota();
  let hp = await L.hakAkun(U);
  assert.deepEqual([hp.percobaanSampai, hp.percobaanBerakhir], [t - 60 * HARI + 90 * HARI, false]);
  assert.equal(await L.sisaKuotaAi(u.id), 3);
  await setSetting("kuota_percobaan_hari", "30");
  L.segarkanKuota();
  hp = await L.hakAkun(U);
  assert.deepEqual([hp.percobaanSampai, hp.percobaanBerakhir], [t - 30 * HARI, true]);
  assert.equal(await L.sisaKuotaAi(u.id), 0, "masa percobaan lewat = habis");
  // Mode bulanan tidak memakai masa percobaan.
  await setSetting("kuota_percobaan_ulang", "bulanan");
  L.segarkanKuota();
  hp = await L.hakAkun(U);
  assert.deepEqual([hp.percobaanSampai, hp.percobaanBerakhir], [null, false]);
  await setSetting("kuota_percobaan_ulang", "sekali");
  await setSetting("kuota_percobaan_hari", "0");
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

await cek("peta status Midtrans: settlement/capture-accept lunas, challenge menunggu, expire, cancel dibatalkan, deny gagal, refund", async () => {
  const p = (transaction_status, fraud_status) => M.petaStatus({ transaction_status, fraud_status });
  assert.deepEqual(
    [p("settlement"), p("capture", "accept"), p("capture", "challenge"), p("capture", "deny"), p("pending"), p("expire"), p("deny"), p("cancel"), p("failure"), p("refund")],
    ["lunas", "lunas", "menunggu", "gagal", "menunggu", "kedaluwarsa", "gagal", "dibatalkan", "gagal", "dikembalikan"]
  );
  // expiry_time Midtrans = waktu WIB tanpa zona
  assert.equal(M.waktuMidtrans("2026-11-03 10:15:00"), Date.UTC(2026, 10, 3, 3, 15) / 1000);
  assert.equal(M.waktuMidtrans("bukan waktu"), null);
});

// ---- Midtrans Core API tiruan: /v2/charge, /v2/{order}/status, /v2/{order}/cancel ----
const asli = globalThis.fetch;
/** Status per order di "Midtrans"; `gross` = nominal palsu untuk uji nominal tidak cocok. */
const dunia = new Map();
let tiruan = { tolak: null, jeda: 0, tolakBatal: false };
const panggilan = [];
const QRIS = "00020101021226620014COM.GO-JEK.WWW01189360091434506451760210G4506451760303UMI51440014ID.CO.QRIS.WWW0215ID10243228429300303UMI5204581253033605405990005802ID5907Uji Toko6007JAKARTA61051234062070703A0163044B2F";
const jawab = (d, status = 200) => new Response(JSON.stringify(d), { status });
/** Detik epoch -> "YYYY-MM-DD HH:mm:ss" WIB, format expiry_time Midtrans. */
const wib = (detik) => new Date((detik + 7 * 3600) * 1000).toISOString().slice(0, 19).replace("T", " ");
globalThis.fetch = async (url, o) => {
  const u = String(url);
  const body = o?.body ? JSON.parse(o.body) : null;
  panggilan.push({ url: u, method: o?.method ?? "GET", auth: o?.headers?.Authorization, body });
  if (u === "https://api.midtrans.com/v2/charge") {
    if (tiruan.jeda) await new Promise((r) => setTimeout(r, tiruan.jeda));
    // HTTP 200, galat di badan. 404 = QRIS yang data merchant-nya belum ada di akun Midtrans.
    if (tiruan.tolak) return jawab({ status_code: tiruan.tolak, status_message: tiruan.tolak === "404" ? "Merchant pop id is not found" : "Payment channel is not activated." });
    const { order_id, gross_amount } = body.transaction_details;
    if (dunia.has(order_id)) return jawab({ status_code: "406", status_message: "Duplicate order ID." });
    dunia.set(order_id, { status: "pending", gross: null, payment_type: body.payment_type });
    const dasar = { status_code: "201", transaction_status: "pending", order_id, gross_amount: `${gross_amount}.00`, payment_type: body.payment_type, expiry_time: wib(sekarang() + body.custom_expiry.expiry_duration * 60) };
    const aksi = (nama) => ({ name: nama, method: "GET", url: `https://api.midtrans.com/v2/${body.payment_type}/${order_id}/${nama}` });
    switch (body.payment_type) {
      case "qris":
        return jawab({ ...dasar, qr_string: QRIS, actions: [aksi("generate-qr-code")] });
      case "gopay":
        return jawab({ ...dasar, actions: [aksi("generate-qr-code"), aksi("deeplink-redirect"), aksi("get-status")] });
      case "shopeepay":
        return jawab({ ...dasar, actions: [aksi("deeplink-redirect")] });
      case "echannel":
        return jawab({ ...dasar, bill_key: "778899001122", biller_code: "70012" });
      case "bank_transfer":
        return body.bank_transfer.bank === "permata"
          ? jawab({ ...dasar, permata_va_number: "8562000012345678" })
          : jawab({ ...dasar, va_numbers: [{ bank: body.bank_transfer.bank, va_number: `${body.bank_transfer.bank === "bca" ? "12345" : "98800"}${String(dunia.size).padStart(6, "0")}` }] });
    }
    return jawab({ status_code: "400", status_message: "payment_type tidak dikenal" });
  }
  let m = u.match(/^https:\/\/api\.midtrans\.com\/v2\/(.+)\/status$/);
  if (m) {
    const order_id = decodeURIComponent(m[1]);
    const d = dunia.get(order_id);
    const t = (await sql`SELECT jumlah FROM transaksi WHERE order_id = ${order_id}`)[0];
    if (!d) return jawab({ status_code: "404", status_message: "Transaction doesn't exist." }, 404);
    return jawab({ order_id, status_code: "200", gross_amount: `${d.gross ?? t?.jumlah}.00`, transaction_status: d.status, payment_type: d.payment_type });
  }
  m = u.match(/^https:\/\/api\.midtrans\.com\/v2\/(.+)\/cancel$/);
  if (m) {
    const d = dunia.get(decodeURIComponent(m[1]));
    if (!d || d.status !== "pending" || tiruan.tolakBatal) return jawab({ status_code: "412", status_message: "Merchant cannot modify the status of the transaction" });
    d.status = "cancel";
    return jawab({ status_code: "200", transaction_status: "cancel" });
  }
  if (u.startsWith("https://graph.facebook.com/")) return jawab({ events_received: 1 });
  return new Response("{}", { status: 404 });
};
const charge = () => panggilan.filter((p) => p.url.endsWith("/v2/charge"));
const pembeli = { id: budi.id, email: "budi@uji.test", nama: "Budi" };
const tunggu = async (fn, ms = 2000) => {
  for (const akhir = Date.now() + ms; Date.now() < akhir; await new Promise((r) => setTimeout(r, 10))) if (await fn()) return;
  assert.fail("menunggu terlalu lama");
};

let orderId;
await cek("bayar QRIS: charge Core API dengan Basic auth server key, nominal & batas waktu; isi QR & batas bayar tersimpan, tagihan 'menunggu'", async () => {
  const t0 = performance.now();
  const h = await L.mulaiBayar(k, pembeli, starter, "qris", "https://wa.uji");
  console.log(`      (mulaiBayar QRIS dengan Midtrans tiruan: ${(performance.now() - t0).toFixed(1)} ms)`);
  assert.equal(h.baru, true);
  orderId = h.orderId;
  assert.match(orderId, new RegExp(`^WA-${budi.id}-\\d+-[0-9a-f]{6}$`));
  assert.match(orderId, L.ORDER_SAH);
  const [c] = charge();
  assert.equal(c.method, "POST");
  assert.equal(c.auth, `Basic ${Buffer.from(`${SK}:`).toString("base64")}`);
  assert.equal(c.body.payment_type, "qris");
  assert.deepEqual(c.body.transaction_details, { order_id: orderId, gross_amount: 99000 });
  assert.deepEqual(c.body.custom_expiry, { expiry_duration: 15, unit: "minute" });
  assert.equal(c.body.item_details[0].price, 99000);
  // Halaman tagihan hanya membuka transaksi milik pengguna itu sendiri, lengkap dengan data instruksinya.
  const t = await L.transaksiMilik(budi.id, orderId);
  assert.deepEqual([t.status, t.jumlah, t.kanal, t.bayar], ["menunggu", 99000, "qris", { qr: QRIS }]);
  assert.ok(Math.abs(t.kedaluwarsa - (sekarang() + 15 * 60)) <= 2, "batas bayar dari expiry_time Midtrans (WIB)");
  assert.equal(await L.transaksiMilik(budi.id + 9999, orderId), undefined);
  assert.equal(await L.transaksiMilik(budi.id, "WA-0-0-abc"), undefined);
  // Daftar riwayat tidak ikut membawa isi QR / nomor VA (payload kecil).
  assert.equal("bayar" in (await L.riwayatTransaksi({ userId: budi.id }))[0], false);
});


await cek("idempoten: klik ulang / 3 permintaan serentak paket+kanal sama = tagihan yang sama, tanpa charge baru", async () => {
  const n = charge().length;
  const h = await L.mulaiBayar(k, pembeli, starter, "qris", "https://wa.uji");
  assert.deepEqual(h, { orderId, baru: false });
  const serentak = await Promise.all([1, 2, 3].map(() => L.mulaiBayar(k, pembeli, starter, "qris", "https://wa.uji")));
  assert.deepEqual(new Set(serentak.map((x) => x.orderId)), new Set([orderId]));
  assert.equal(charge().length, n);
  // Sisa waktu < 2 menit: tidak dipakai ulang (pelanggan tidak sempat membayar) -> tagihan baru.
  await sql`UPDATE transaksi SET kedaluwarsa = ${sekarang() + 60} WHERE order_id = ${orderId}`;
  const baru = await L.mulaiBayar(k, pembeli, starter, "qris", "https://wa.uji");
  assert.equal(baru.baru, true);
  assert.notEqual(baru.orderId, orderId);
  // ... dan tagihan lama dibatalkan di Midtrans (di latar) supaya tidak terbayar dua kali.
  await tunggu(async () => (await sql`SELECT status FROM transaksi WHERE order_id = ${orderId}`)[0].status === "dibatalkan");
  assert.ok(panggilan.some((p) => p.url.endsWith(`/v2/${orderId}/cancel`) && p.method === "POST"));
  orderId = baru.orderId;
});

await cek("klik ganda serentak dengan charge lambat: dua permintaan mengantre di kunci per pengguna, hanya SATU charge", async () => {
  const n = charge().length;
  tiruan.jeda = 150;
  try {
    const [a, b] = await Promise.all([L.mulaiBayar(k, pembeli, bisnis, "bca", "https://wa.uji"), L.mulaiBayar(k, pembeli, bisnis, "bca", "https://wa.uji")]);
    assert.equal(a.orderId, b.orderId);
    assert.deepEqual([a.baru, b.baru].sort(), [false, true]);
  } finally {
    tiruan.jeda = 0;
  }
  assert.equal(charge().length, n + 1);
  const t = await L.transaksiMilik(budi.id, (await L.tagihanMenunggu(budi.id, bisnis.id))?.order_id ?? "-");
  assert.equal(charge().at(-1).body.bank_transfer.bank, "bca");
  assert.match(t.bayar.va, /^12345\d{6}$/);
  assert.deepEqual(charge().at(-1).body.custom_expiry, { expiry_duration: 1440, unit: "minute" });
  // Tagihan QRIS Starter yang masih menunggu ikut dibatalkan (satu tagihan aktif per pengguna).
  await tunggu(async () => (await sql`SELECT status FROM transaksi WHERE order_id = ${orderId}`)[0].status === "dibatalkan");
});

await cek("data instruksi per kanal: BNI/BRI/BSI/CIMB va_numbers, Permata, Mandiri bill key + kode perusahaan, GoPay QR+deeplink, ShopeePay deeplink", async () => {
  const kasus = [
    ["bni", { payment_type: "bank_transfer", bank_transfer: { bank: "bni" } }, (b) => assert.match(b.va, /^98800\d{6}$/)],
    ["bri", { payment_type: "bank_transfer", bank_transfer: { bank: "bri" } }, (b) => assert.match(b.va, /^98800\d{6}$/)],
    ["permata", { payment_type: "bank_transfer", bank_transfer: { bank: "permata" } }, (b) => assert.deepEqual(b, { va: "8562000012345678" })],
    ["bsi", { payment_type: "bank_transfer", bank_transfer: { bank: "bsi" } }, (b) => assert.match(b.va, /^98800\d{6}$/)],
    ["cimb", { payment_type: "bank_transfer", bank_transfer: { bank: "cimb" } }, (b) => assert.match(b.va, /^98800\d{6}$/)],
    ["mandiri", { payment_type: "echannel" }, (b) => assert.deepEqual(b, { va: "778899001122", biller: "70012" })],
    ["gopay", { payment_type: "gopay" }, (b) => assert.deepEqual(Object.keys(b).sort(), ["deeplink", "qrUrl"])],
    ["shopeepay", { payment_type: "shopeepay" }, (b) => assert.match(b.deeplink, /deeplink-redirect$/)],
  ];
  for (const [kanal, harap, periksa] of kasus) {
    const h = await L.mulaiBayar(k, pembeli, bisnis, kanal, "https://wa.uji");
    const c = charge().at(-1).body;
    for (const [kunci, nilai] of Object.entries(harap)) assert.deepEqual(c[kunci], nilai, `${kanal}.${kunci}`);
    if (kanal === "mandiri") assert.ok(c.echannel.bill_info1 && c.echannel.bill_info2);
    if (kanal === "gopay") assert.deepEqual(c.gopay, { enable_callback: true, callback_url: `https://wa.uji/langganan/tagihan/${encodeURIComponent(h.orderId)}` });
    if (kanal === "shopeepay") assert.equal(c.shopeepay.callback_url, `https://wa.uji/langganan/tagihan/${encodeURIComponent(h.orderId)}`);
    const t = await L.transaksiMilik(budi.id, h.orderId);
    assert.equal(t.kanal, kanal);
    periksa(t.bayar);
  }
  // Ganti metode berkali-kali: hanya tagihan terakhir yang masih menunggu.
  await tunggu(async () => (await sql`SELECT COUNT(*)::int AS n FROM transaksi WHERE user_id = ${budi.id} AND status = 'menunggu'`)[0].n === 1);
});

await cek("charge ditolak (kanal belum aktif = 402, QRIS tanpa merchant = 404, di HTTP 200; order ganda 406): galat jelas, TIDAK ada tagihan yatim, kanal tersembunyi permanen sampai admin menampilkannya", async () => {
  const sebelum = (await sql`SELECT COUNT(*)::int AS n FROM transaksi`)[0].n;
  tiruan.tolak = "402";
  try {
    await assert.rejects(L.mulaiBayar(k, pembeli, starter, "shopeepay", "https://wa.uji"), (e) => e instanceof M.MidtransError && e.kode === "402");
    tiruan.tolak = "404";
    await assert.rejects(L.mulaiBayar(k, pembeli, starter, "qris", "https://wa.uji"), (e) => e instanceof M.MidtransError && e.kode === "404");
    tiruan.tolak = "406";
    await assert.rejects(L.mulaiBayar(k, pembeli, starter, "bri", "https://wa.uji"), (e) => e.kode === "406");
  } finally {
    tiruan.tolak = null;
  }
  assert.equal((await sql`SELECT COUNT(*)::int AS n FROM transaksi`)[0].n, sebelum);
  const aktif = await M.kanalAktif();
  assert.deepEqual([aktif.includes("shopeepay"), aktif.includes("qris")], [false, false]); // pembeli lain tidak ikut gagal
  assert.equal(aktif.includes("bri"), true, "406 = order ganda, bukan soal kanal");
  // Tersimpan di database (tahan restart), lengkap dengan alasannya untuk panel admin.
  const mati = JSON.parse((await sql`SELECT nilai FROM settings WHERE kunci = 'kanal_mati'`)[0].nilai);
  assert.deepEqual(Object.keys(mati).sort(), ["qris", "shopeepay"]);
  assert.equal(mati.qris.oleh, "otomatis");
  assert.match(mati.qris.alasan, /kode 404: Merchant pop id is not found/);
  // Admin menampilkan lagi, atau menyembunyikan sendiri.
  await M.setKanalMati("qris", null);
  await M.setKanalMati("shopeepay", null);
  await M.setKanalMati("permata", { oleh: "admin", waktu: sekarang() });
  assert.equal((await M.kanalAktif()).includes("permata"), false);
  await M.setKanalMati("permata", null);
  process.env.MIDTRANS_KANAL = "qris, bca ,gopay";
  assert.deepEqual(await M.kanalAktif(), ["qris", "gopay", "bca"]); // urut seperti KANAL_BAYAR
  delete process.env.MIDTRANS_KANAL;
  assert.equal((await M.kanalAktif()).length, Object.keys(H0.KANAL_BAYAR).length);
  assert.deepEqual([H0.kanalSah("bca"), H0.kanalSah("kartu"), H0.kanalSah("toString")], [true, false, false]);
  assert.equal(H0.ringkasKanal(["gopay", "bni", "bri", "mandiri", "permata"]), "GoPay atau virtual account (BNI, BRI, Mandiri, Permata)");
  assert.equal(H0.ringkasKanal(["qris", "gopay", "bca"]), "QRIS, GoPay, atau virtual account (BCA)");
  assert.equal(H0.ringkasKanal([]), "");
});

await cek("status dari API Midtrans: pending tetap menunggu; settlement = lunas & paket aktif TEPAT SEKALI walau notifikasi berulang", async () => {
  const h = await L.mulaiBayar(k, pembeli, starter, "qris", "https://wa.uji");
  orderId = h.orderId;
  assert.deepEqual(await L.terapkanStatus(k, orderId), { status: "menunggu", baruAktif: false });
  assert.equal(await L.langgananAktif(budi.id), undefined);
  dunia.get(orderId).status = "settlement";
  assert.deepEqual(await L.terapkanStatus(k, orderId), { status: "lunas", baruAktif: true });
  assert.deepEqual(await L.terapkanStatus(k, orderId), { status: "lunas", baruAktif: false }); // notifikasi ulang
  const a = await L.langgananAktif(budi.id);
  assert.equal(a.nama_paket, "Starter");
  assert.equal(a.sampai - a.mulai, 30 * 86400); // tidak diperpanjang dua kali
  const [t] = await sql`SELECT status, metode, dibayar IS NOT NULL AS dibayar, langganan_id FROM transaksi WHERE order_id = ${orderId}`;
  assert.deepEqual({ ...t }, { status: "lunas", metode: "qris", dibayar: true, langganan_id: a.id });
  assert.equal((await sql`SELECT COUNT(*)::int AS n FROM langganan WHERE user_id = ${budi.id} AND sampai > ${sekarang()}`)[0].n, 1);
  // Tagihan lunas tidak dipakai ulang: beli lagi = tagihan baru.
  assert.equal((await L.mulaiBayar(k, pembeli, starter, "qris", "https://wa.uji")).baru, true);
});

await cek("polling status: dari DB tanpa memanggil Midtrans; cadangan webhook paling sering tiap 20 dtk, segera sekali setelah batas lewat; milik orang lain = null", async () => {
  const h = await L.mulaiBayar(k, pembeli, bisnis, "qris", "https://wa.uji");
  const statusKe = () => panggilan.filter((p) => p.url.endsWith(`/v2/${h.orderId}/status`)).length;
  const t0 = performance.now();
  for (let i = 0; i < 20; i++) assert.equal(await L.statusTagihan(k, budi.id, h.orderId), "menunggu");
  console.log(`      (statusTagihan dari DB: ${((performance.now() - t0) / 20).toFixed(2)} ms per polling)`);
  assert.equal(statusKe(), 0, "tagihan baru: Midtrans belum ditanya");
  assert.equal(await L.statusTagihan(k, lain.id, h.orderId), null);
  // Webhook tidak sampai: setelah jeda, Midtrans ditanya sekali dan hasilnya diterapkan.
  dunia.get(h.orderId).status = "settlement";
  globalThis.__waCekBayar.set(h.orderId, Date.now() - L.JEDA_CEK_MIDTRANS - 1);
  assert.equal(await L.statusTagihan(k, budi.id, h.orderId), "lunas");
  assert.equal(await L.statusTagihan(k, budi.id, h.orderId), "lunas");
  assert.equal(statusKe(), 1);
  // Batas bayar lewat: langsung dipastikan sekali (tanpa menunggu jeda), lalu kembali dijatah.
  const x = await L.mulaiBayar(k, pembeli, starter, "bca", "https://wa.uji");
  await sql`UPDATE transaksi SET kedaluwarsa = ${sekarang() - 1} WHERE order_id = ${x.orderId}`;
  globalThis.__waCekBayar.set(x.orderId, Date.now() - 5_000); // dibuat 5 dtk lalu, sebelum batasnya lewat
  dunia.get(x.orderId).status = "expire";
  assert.equal(await L.statusTagihan(k, budi.id, x.orderId), "kedaluwarsa");
  // Tanpa konfigurasi Midtrans: status DB saja.
  assert.equal(await L.statusTagihan(null, budi.id, x.orderId), "kedaluwarsa");
});

await cek("batalkan tagihan: milik sendiri -> 'dibatalkan' di Midtrans & DB; sudah dibayar (Midtrans menolak batal) -> status sebenarnya; orang lain = null", async () => {
  const a = await L.mulaiBayar(k, pembeli, starter, "bni", "https://wa.uji");
  assert.equal(await L.batalkanBayar(k, lain.id, a.orderId), null);
  assert.equal(await L.batalkanBayar(k, budi.id, a.orderId), "dibatalkan");
  assert.equal((await L.transaksiMilik(budi.id, a.orderId)).status, "dibatalkan");
  assert.equal(await L.batalkanBayar(k, budi.id, a.orderId), "dibatalkan"); // dua kali: tidak memanggil Midtrans lagi
  assert.equal(panggilan.filter((p) => p.url.endsWith(`/v2/${a.orderId}/cancel`)).length, 1);
  const b = await L.mulaiBayar(k, pembeli, starter, "bri", "https://wa.uji");
  dunia.get(b.orderId).status = "settlement";
  tiruan.tolakBatal = true;
  try {
    assert.equal(await L.batalkanBayar(k, budi.id, b.orderId), "lunas");
  } finally {
    tiruan.tolakBatal = false;
  }
});

await cek("nominal dari Midtrans berbeda dengan tagihan = TIDAK diaktifkan; order tak dikenal = null", async () => {
  const { orderId: o2 } = await L.mulaiBayar(k, pembeli, bisnis, "permata", "https://wa.uji");
  Object.assign(dunia.get(o2), { status: "settlement", gross: 1000 });
  const sebelum = (await L.langgananAktif(budi.id)).id;
  const h = await L.terapkanStatus(k, o2);
  assert.equal(h.baruAktif, false);
  assert.equal((await sql`SELECT status FROM transaksi WHERE order_id = ${o2}`)[0].status, "menunggu");
  assert.equal((await L.langgananAktif(budi.id)).id, sebelum);
  Object.assign(dunia.get(o2), { status: "expire", gross: null });
  assert.equal((await L.terapkanStatus(k, o2)).status, "kedaluwarsa");
  dunia.set("WA-999-1-abcdef", { status: "settlement", gross: 5000, payment_type: "qris" }); // dikenal Midtrans, tidak ada di DB kita
  assert.equal(await L.terapkanStatus(k, "WA-999-1-abcdef"), null);
});

await cek("lunas lewat webhook mengirim Purchase ke Meta sekali, lengkap dengan data pembeli dari checkout", async () => {
  await setSetting("meta_pixel_aktif", "1");
  await setSetting("meta_pixel_id", "889900112233445");
  await setSetting("meta_pixel_capi_token", "EAABuji");
  const konteks = { fbp: "fb.1.1.123", fbc: "fb.1.1.klik", ip: "203.0.113.10", userAgent: "Mozilla/5.0 Uji", urlSumber: "https://wa.uji/langganan/bayar/1" };
  const { orderId: o } = await L.mulaiBayar(k, pembeli, starter, "qris", "https://wa.uji", konteks);
  dunia.get(o).status = "settlement";
  const keMeta = () => panggilan.filter((p) => p.url.startsWith("https://graph.facebook.com/") && p.body.data[0].event_id === o);
  await L.terapkanStatus(k, o);
  await L.terapkanStatus(k, o); // notifikasi ulang tidak mengirim dua kali
  for (let i = 0; i < 100 && keMeta().length === 0; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(keMeta().length, 1);
  const ev = keMeta()[0].body.data[0];
  assert.equal(ev.event_name, "Purchase");
  assert.equal(ev.custom_data.value, starter.harga);
  assert.equal(ev.custom_data.currency, "IDR");
  assert.equal(ev.event_source_url, konteks.urlSumber);
  const hash = (s) => createHash("sha256").update(s).digest("hex");
  assert.deepEqual(ev.user_data, {
    em: [hash(pembeli.email)],
    external_id: [hash(String(budi.id))],
    fbp: konteks.fbp,
    fbc: konteks.fbc,
    client_ip_address: konteks.ip,
    client_user_agent: konteks.userAgent,
  });
  assert.equal((await sql`SELECT meta_konteks FROM transaksi WHERE order_id = ${o}`)[0].meta_konteks, null); // tidak disimpan setelah lunas
  await setSetting("meta_pixel_aktif", "0");
});

await cek("riwayat transaksi per pengguna & semua (admin), terbaru dulu", async () => {
  const milik = await L.riwayatTransaksi({ userId: budi.id });
  assert.ok(milik.length >= 10);
  assert.ok(milik.every((t, i) => i === 0 || milik[i - 1].dibuat >= t.dibuat));
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

await cek("rumus harga: modal dari tarif resmi x kuota (+5% foto/tulis-ulang), biaya bayar + PPN 11%, untung, margin, harga saran dibulatkan ke atas", async () => {
  const usd = AI2.perkiraanPerBalasan("claude-haiku-5-5"); // 0,000846 USD
  const a = { biayaBalasanUsd: usd, kurs: 16500, margin: 0.6, pemakaian: 1, metode: "kartu", biayaServerNomor: 0 };
  const s = H.hitungHarga({ harga: 99000, durasi_hari: 30, kuota_nomor: 1, kuota_balasan: 1000 }, a);
  assert.ok(Math.abs(s.biayaPerBalasan - 14.65695) < 1e-6);
  assert.ok(Math.abs(s.modal - 14656.95) < 1e-3);
  assert.ok(Math.abs(s.biayaBayar - (99000 * 0.029 + 2000) * 1.11) < 1e-6, "biaya Midtrans + PPN 11% atas biaya itu");
  assert.ok(Math.abs(s.untung - (99000 - 5406.81 - 14656.95)) < 1e-3);
  assert.ok(Math.abs(s.margin - 0.797336) < 1e-4);
  assert.equal(s.hargaSaran, 46000); // (14.656,95 + 2.220) / (1 - 0,6 - 0,03219) = 45.885 -> 46.000
  // Biaya server per nomor ikut masuk modal, sebanding durasi
  const t = H.hitungHarga({ harga: 249000, durasi_hari: 60, kuota_nomor: 3, kuota_balasan: 3500 }, { ...a, biayaServerNomor: 5000 });
  assert.ok(Math.abs(t.modalServer - 3 * 5000 * 2) < 1e-9);
  // Acuan "otomatis": di setiap harga dipakai kanal termahal yang bisa dipilih pembeli (VA Rp4.000 tetap vs e-wallet 2%).
  assert.ok(Math.abs(H.biayaBayar(49000, "otomatis") - 4440) < 1e-9, "Rp49.000: VA termahal (Rp4.000 + PPN)");
  assert.ok(Math.abs(H.biayaBayar(246000, "otomatis") - 246000 * 0.02 * 1.11) < 1e-6, "Rp246.000: e-wallet termahal (2% + PPN)");
  assert.equal(H.biayaBayar(0, "otomatis"), 0);
  // Harga minimal: margin target tercapai PERSIS untuk kanal termahal, dan setidaknya tercapai untuk kanal lain.
  for (const modal of [16069, 64277, 160693]) {
    const hp = H.hargaMinimal(modal, 0.7, "otomatis");
    assert.ok(Math.abs(H.sisaBersih(hp, 0.7, "otomatis") - modal) < 1e-6);
    for (const m of ["qris", "ewallet", "va"]) assert.ok(H.sisaBersih(hp, 0.7, m) >= modal - 1e-6, `${m} @ ${modal}`);
  }
  const o = { ...a, metode: "otomatis", margin: 0.7 };
  for (const [kuota, nomor] of [[1000, 1], [3500, 4], [10000, 11]]) {
    const saran = H.hitungHarga({ harga: 0, durasi_hari: 30, kuota_nomor: nomor, kuota_balasan: kuota }, o).hargaSaran;
    const di = H.hitungHarga({ harga: saran, durasi_hari: 30, kuota_nomor: nomor, kuota_balasan: kuota }, o);
    for (const m of ["qris", "ewallet", "va"]) {
      const per = H.hitungHarga({ harga: saran, durasi_hari: 30, kuota_nomor: nomor, kuota_balasan: kuota }, { ...o, metode: m });
      assert.ok(per.margin >= 0.7, `harga saran ${saran}: margin >= 70% walau pembeli bayar lewat ${m} (${per.margin})`);
    }
    assert.ok(di.margin >= 0.7);
  }
  assert.equal(H.teksTarif("otomatis"), "QRIS 0,7% / e-wallet 2% / VA Rp4.000 + PPN 11%");
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
  assert.deepEqual(H.kuotaDariHarga(46000, 30, a, 900), { kuotaBalasan: 1000, kuotaNomor: 1 });
  const k = H.kuotaDariHarga(144000, 30, { ...a, margin: 0.5 }, 900);
  assert.equal(k.kuotaBalasan % 50, 0);
  assert.ok(H.hitungHarga({ harga: 144000, durasi_hari: 30, kuota_nomor: k.kuotaNomor, kuota_balasan: k.kuotaBalasan }, { ...a, margin: 0.5 }).margin >= 0.5);
  assert.deepEqual(H.kuotaDariHarga(3000, 30, a, 900), { kuotaBalasan: 0, kuotaNomor: 1 }); // terlalu murah
  assert.equal(H.nomorDariKuota(3500, 30, 900), 4);
  assert.equal(H.nomorDariKuota(3500, 60, 900), 2); // durasi 60 hari: tiap nomor memakai 2x lipat
  assert.equal(H.nomorDariKuota(100, 30, 900), 1); // minimal 1
});

await cek("acuan harga tersimpan (bawaan: margin 60%, pakai 100%, otomatis = kanal termahal + PPN, Haiku 5.5) & terapkan simulasi ke semua paket berbayar", async () => {
  const a = await L.acuanHarga();
  assert.deepEqual({ ...a, kurs: undefined }, { margin: 60, pemakaian: 100, metode: "otomatis", biayaServerNomor: 0, kurs: undefined, model: "claude-haiku-5-5" });
  const acuan = { ...a, kurs: 16500 };
  const { berubah } = await L.terapkanSimulasi(acuan, "kunci-kuota");
  assert.deepEqual(
    berubah.map((b) => [b.nama, b.sesudah]),
    [
      ["Starter", "Rp48.000 · 1.000 balasan · 1 nomor"],
      ["Bisnis", "Rp140.000 · 3.500 balasan · 4 nomor"],
      ["Pro", "Rp388.000 · 10.000 balasan · 11 nomor"],
    ]
  );
  assert.equal(berubah[0].sebelum, "Rp99.000 · 1.000 balasan · 1 nomor");
  assert.deepEqual((await L.terapkanSimulasi(acuan, "kunci-kuota")).berubah, []); // sudah sesuai: tidak ada perubahan
  assert.deepEqual((await L.terapkanSimulasi(acuan, "kunci-harga")).berubah, []); // dua arah rumus konsisten
  // Harga dikunci, margin turun ke 50%: kuota balasan naik, harga tetap
  const { berubah: naik } = await L.terapkanSimulasi({ ...acuan, margin: 50 }, "kunci-harga");
  assert.equal(naik.length, 3);
  const starterBaru = (await L.daftarPaket({ semua: true })).find((p) => p.kode === "starter");
  assert.equal(starterBaru.harga, 48000);
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
  assert.equal(h.hargaOtomatis, 405000); // (146.569,5 + 2.220) / (1 - 0,6 - 0,03219) = 404.537 -> 405.000 (biaya kartu + PPN 11%)
  assert.deepEqual([h.harga, h.status], [405000, "sehat"]);
  assert.ok(h.rincian.margin >= 0.6);
  assert.equal(C.hitungCustom({ ...spekC, pembulatan: 10000, cantik: true }, KT).hargaOtomatis, 409000);
  assert.equal(C.hitungCustom({ ...spekC, pembulatan: 50000 }, KT).hargaOtomatis, 450000);
  // Kuota 2x -> modal AI 2x -> harga ikut naik; margin turun -> harga turun
  assert.ok(C.hitungCustom({ ...spekC, kuota_balasan: 20000 }, KT).hargaOtomatis > 790000);
  assert.ok(C.hitungCustom({ ...spekC, margin: 40 }, KT).hargaOtomatis < 405000);
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
  assert.deepEqual([t.harga, t.hargaOtomatis, t.status], [300000, 405000, "tipis"]);
  assert.ok(Math.abs(t.rincian.untung - (300000 - (300000 * 0.029 + 2000) * 1.11 - 146569.5)) < 1e-6);
  assert.equal(C.hitungCustom({ ...spekC, harga_manual: true, harga: 150000 }, KT).status, "rugi");
  const mahal = C.hitungCustom({ ...spekC, harga_manual: true, harga: 500000 }, KT);
  assert.deepEqual([mahal.status, mahal.perBalasan], ["sehat", 50]);
  // Kebalikan: anggaran = harga otomatis -> kuota kembali 10.000 (kelipatan 50, margin tetap tercapai)
  assert.equal(C.kuotaDariAnggaran(405000, spekC, KT), 10000);
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
  assert.deepEqual([p.harga, p.kuota_nomor, p.kurs, h.status], [405000, 10, 16500, "sehat"]);
  assert.ok(p.dihitung > 0);
  assert.deepEqual(await C.paketCustom(), p);
  const id = await C.idPaketCustom();
  const baris = await L.paketById(id);
  assert.deepEqual([baris.kode, baris.nama, baris.harga, baris.kuota_balasan, baris.kuota_nomor, baris.durasi_hari, baris.aktif], ["_custom", "Enterprise", 405000, 10000, 10, 30, true]);
  assert.ok(!(await L.daftarPaket()).some((x) => x.kode === "_custom"), "tidak ikut daftar paket biasa");
  assert.ok(!(await L.daftarPaket({ semua: true })).some((x) => x.kode === "_custom"));
  assert.ok((await L.daftarPaket({ semua: true, custom: true })).some((x) => x.id === id), "ikut daftar 'Berikan paket'");
  // Formulir & simulasi paket biasa tidak bisa mengubah baris Custom
  await L.simpanPaket({ ...baris, harga: 1000 });
  const sebelum = await L.daftarPaket({ semua: true });
  await L.terapkanSimulasi({ ...(await L.acuanHarga()), kurs: 16500, margin: 10 }, "kunci-kuota");
  for (const x of sebelum) await L.simpanPaket(x);
  assert.equal((await L.paketById(id)).harga, 405000);
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
  let charge;
  globalThis.fetch = async (_url, o) => {
    charge = JSON.parse(o.body);
    return new Response(JSON.stringify({ status_code: "201", transaction_status: "pending", va_numbers: [{ bank: "bca", va_number: "12345000999" }], expiry_time: "2026-11-04 10:00:00" }));
  };
  try {
    await L.mulaiBayar(k, { id: lain.id, email: "lain@uji.test", nama: "Lain" }, await L.paketById(id), "bca", "https://wa.uji");
  } finally {
    globalThis.fetch = fetchAsli;
  }
  assert.equal(charge.transaction_details.gross_amount, 405000);
  await L.hentikanLangganan(lain.id);
});

await cek("paket Custom mengikuti kurs: bergeser >=1% -> harga otomatis dihitung ulang sekali & tersimpan (juga di tabel paket); <1%, harga sendiri, atau saklar mati tidak", async () => {
  const id = await C.idPaketCustom();
  const tetap = process.env.KURS_USD_TETAP;
  try {
    process.env.KURS_USD_TETAP = "16600"; // 0,6%
    assert.equal((await C.paketCustom()).harga, 405000);
    process.env.KURS_USD_TETAP = "17000"; // 3%: modal AI 10.000 x 0,000846 x 17.000 x 1,05 -> harga 417.000 (kartu + PPN)
    const [a, b] = await Promise.all([C.paketCustom(), C.paketCustom()]);
    assert.deepEqual([a.harga, a.kurs, a.kuota_nomor, b.harga], [417000, 17000, 10, 417000]);
    assert.equal((await L.paketById(id)).harga, 417000);
    process.env.KURS_USD_TETAP = "16500";
    await C.simpanPaketCustom(C.periksaCustom({ ...spekC, nama: "Enterprise", aktif: true, aksi: "bayar", harga_manual: true, harga: 777000 }));
    process.env.KURS_USD_TETAP = "18000";
    assert.equal((await C.paketCustom()).harga, 777000, "harga sendiri tidak pernah diubah otomatis");
    process.env.KURS_USD_TETAP = "16500";
    await C.simpanPaketCustom(C.periksaCustom({ ...spekC, nama: "Enterprise", ikut_kurs: false }));
    process.env.KURS_USD_TETAP = "18000";
    assert.equal((await C.paketCustom()).harga, 405000, "saklar 'mengikuti kurs' mati");
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

await cek("KPI admin: pendapatan, pelanggan berbayar, balasan, biaya AI, tagihan menunggu, langganan berakhir & kuota menipis dibanding 30 hari sebelumnya", async () => {
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

await cek("knowledge otomatis ChatGerCep (khusus admin): paket, harga, komisi, metode bayar aktif dari database; ditulis ulang hanya bila berubah; tak terlihat/terhapus lewat akun pengguna biasa", async () => {
  const CG = await lib("src/lib/sinkron-cg.ts");
  const K = await lib("src/lib/knowledge.ts");
  const kunciLama = process.env.MIDTRANS_SERVER_KEY;
  process.env.MIDTRANS_SERVER_KEY = SK;
  const n = await tambahNomor("CS ChatGerCep", budi.id);
  const st = (await L.daftarPaket()).find((p) => p.kode === "starter");
  try {
    await M.setKanalMati("qris", { oleh: "otomatis", waktu: sekarang(), alasan: "kode 404" });
    await CG.setNomorSinkronCg(n.id, true);
    const dok = await K.daftarDokumen(n.id, true);
    assert.deepEqual(dok.map((d) => d.nama_berkas), ["sinkron:chatgercep"]);
    const teks = (await K.teksDokumen(dok[0].id, n.id, true)).teks;
    for (const p of (await L.daftarPaket()).filter((p) => p.harga > 0))
      assert.ok(teks.includes(`*${p.nama}*`) && teks.includes(`Rp${p.harga.toLocaleString("id-ID")} per ${p.durasi_hari} hari`), p.nama);
    assert.ok(teks.includes(st.komisi_jenis === "persen" ? `komisi ${st.komisi_nilai}% dari harga` : `komisi Rp${st.komisi_nilai.toLocaleString("id-ID")}`));
    const metode = teks.match(/Metode yang tersedia saat ini: [^\n]*/)[0];
    assert.ok(!metode.includes("QRIS") && metode.includes("BNI Virtual Account"), "kanal tersembunyi tidak disebut");
    assert.match(teks, /yang benar adalah data ini/);
    // Pengguna biasa: tidak tampil, tidak bisa dibaca/diunduh, tidak bisa dihapus. AI tetap memakainya.
    assert.equal((await K.daftarDokumen(n.id, false)).length, 0);
    assert.equal(await K.teksDokumen(dok[0].id, n.id, false), null);
    assert.equal(await K.pratinjauDokumen(dok[0].id, n.id, false), null);
    await K.hapusDokumen(dok[0].id, n.id, false);
    assert.equal((await K.daftarDokumen(n.id, true)).length, 1);
    assert.match((await K.konteksPengetahuan(n.id, "berapa harga paket")).teks, /Daftar paket & harga/);
    // Tidak ada yang berubah = tidak ditulis ulang; harga berubah = ditulis ulang dengan harga baru.
    const t0 = performance.now();
    await CG.jalankanCg();
    const msSama = performance.now() - t0;
    assert.equal((await K.daftarDokumen(n.id, true))[0].id, dok[0].id);
    await L.simpanPaket({ ...st, harga: st.harga + 1000 });
    const t1 = performance.now();
    await CG.jalankanCg();
    console.log(`        (susun tanpa perubahan ${msSama.toFixed(1)} ms; harga berubah + tulis ulang ${(performance.now() - t1).toFixed(1)} ms; ${teks.length.toLocaleString("id-ID")} karakter)`);
    const baru = (await K.daftarDokumen(n.id, true))[0];
    assert.notEqual(baru.id, dok[0].id);
    assert.ok((await K.teksDokumen(baru.id, n.id, true)).teks.includes(`Rp${(st.harga + 1000).toLocaleString("id-ID")}`));
    assert.equal((await CG.statusSinkronCg()).galat, null);
    // Seperti GercepBot di produksi: PDF unggahan panjang (total > BATAS_UTUH) berisi harga lama. Data resmi tetap
    // didahulukan dan ditandai paling baru, jadi AI tidak memakai harga PDF.
    const isian = Array.from({ length: 60 }, (_, i) => `Bagian ${i + 1}: daftar paket dan harga paket lama Starter Rp99.000 per 30 hari, penjelasan fitur, kuota, dan cara daftar.`).join("\n\n");
    const pdf = await K.tambahDokumen({ numberId: n.id, judul: "PDF harga lama", sumber: "teks", teks: isian });
    const kp = await K.konteksPengetahuan(n.id, "paket chat gercep ada di brp yak?");
    assert.equal(kp.mode, "relevan");
    assert.equal(kp.prioritas, true);
    assert.match(kp.teks, /^## \[DATA OTOMATIS TERBARU\] /, "data resmi ChatGerCep harus di urutan pertama");
    assert.ok(kp.teks.includes(`Rp${(st.harga + 1000).toLocaleString("id-ID")}`));
    assert.match((await K.susunSistem({ id: n.id, instruksi: "", belajar: false }, "paket chat gercep ada di brp yak?")).sistem, /dokumen lain itu sudah usang/);
    await K.hapusDokumen(pdf.id, n.id, true);
    // Dimatikan admin: dokumennya hilang.
    await CG.setNomorSinkronCg(n.id, false);
    assert.equal((await K.daftarDokumen(n.id, true)).length, 0);
  } finally {
    await L.simpanPaket(st);
    await M.setKanalMati("qris", null);
    if (kunciLama === undefined) delete process.env.MIDTRANS_SERVER_KEY;
    else process.env.MIDTRANS_SERVER_KEY = kunciLama;
  }
});

await cek("lencana paket & transaksi admin: tingkat dari kode paket, cari ID pembelian lewat indeks awalan, ringkasan & detail", async () => {
  const TP = await lib("src/lib/tingkat-paket.ts");
  const TA = await lib("src/lib/transaksi-admin.ts");
  assert.equal(TP.tingkatPaket("starter", "Starter"), "starter");
  assert.equal(TP.tingkatPaket("bisnis", "Bisnis"), "bisnis");
  assert.equal(TP.tingkatPaket("pro", "Pro"), "pro");
  assert.equal(TP.tingkatPaket("_custom", "Custom"), "custom");
  assert.equal(TP.tingkatPaket(null, "Custom PT Maju"), "custom", "isi khusus admin tanpa paket terdaftar = Custom");
  assert.equal(TP.tingkatPaket("paket-lain", "Hemat"), null);

  const akun = await P.buatAkun({ email: "lencana@uji.test", nama: "Lencana Uji", password: "rahasia-lencana-01" });
  const h = await L.berikanPaketManual(akun.id, { paketId: bisnis.id, metode: "manual_transfer", jumlah: 249000, catatan: "uji lencana" });
  // Daftar & detail pengguna membawa paket aktif (satu query, LATERAL) -> lencana emas.
  const { daftar } = await P.daftarPengguna({ cari: "lencana@uji.test" });
  assert.equal(daftar[0].paket_kode, "bisnis");
  assert.equal(daftar[0].paket_nama, "Bisnis");
  assert.ok(daftar[0].paket_sampai > sekarang());
  assert.equal((await P.penggunaById(akun.id)).paket_kode, "bisnis");
  assert.equal((await L.hakAkun({ id: akun.id, peran: "user" })).kodePaket, "bisnis");

  // Cari ID pembelian: penuh, awalan, huruf kecil; email; ID pengguna.
  for (const q of [h.orderId, h.orderId.slice(0, 12), h.orderId.toLowerCase()]) {
    const r = await TA.cariTransaksi({ q });
    assert.ok(r.daftar.some((t) => t.order_id === h.orderId), q);
    assert.ok(r.daftar.every((t) => t.order_id.toUpperCase().startsWith(q.slice(0, 12).toUpperCase())), q);
  }
  assert.equal((await TA.cariTransaksi({ q: "lencana@uji" })).daftar[0].order_id, h.orderId);
  assert.ok((await TA.cariTransaksi({ q: String(akun.id) })).daftar.every((t) => t.user_id === akun.id || t.id === akun.id));
  assert.equal((await TA.cariTransaksi({ q: h.orderId, status: "menunggu" })).daftar.length, 0);
  const baris = (await TA.cariTransaksi({ q: h.orderId })).daftar[0];
  assert.equal(baris.kode_paket, "bisnis");
  assert.ok(baris.langganan_mulai && baris.langganan_sampai > baris.langganan_mulai);
  assert.match(TA.labelMetode(baris), /dicatat admin/);
  const n = await TA.hitungTransaksi({ q: h.orderId });
  assert.equal(n.semua, 1);
  assert.equal(n.lunas, 1);
  assert.equal(n.nominal, 249000);
  // Rencana query: awalan ID memakai indeks pola (bukan pemindaian seluruh transaksi).
  await sql`SET enable_seqscan = off`;
  const rencana = (await sql.unsafe(`EXPLAIN SELECT id FROM transaksi t WHERE t.order_id LIKE 'ADM-${akun.id}-%'`)).map((r) => r["QUERY PLAN"]).join("\n");
  await sql`SET enable_seqscan = on`;
  assert.match(rencana, /transaksi_order_pola_idx/, rencana);
  // Paginasi keyset: halaman kedua tidak mengulang baris halaman pertama.
  const h1 = await TA.cariTransaksi({ batas: 2 });
  if (h1.adaLagi) {
    const akhir = h1.daftar[h1.daftar.length - 1];
    const h2 = await TA.cariTransaksi({ batas: 2, sebelum: { dibuat: akhir.dibuat, id: akhir.id } });
    assert.ok(h2.daftar.every((t) => !h1.daftar.some((x) => x.id === t.id)));
  }
  const r = await TA.ringkasanTransaksi();
  assert.ok(r.pendapatan >= 249000 && r.lunas >= 1 && r.pembeli >= 1);
  assert.ok(r.perPaket.some((p) => p.nama_paket === "Bisnis" && p.kode === "bisnis"));
  const d = await TA.detailTransaksi(h.orderId);
  assert.equal(d.email, "lencana@uji.test");
  assert.equal(d.catatan, "uji lencana");
  assert.equal(d.kuota_nomor, h.kuota_nomor);
  assert.equal(d.kuota_balasan, h.kuota_balasan);
  assert.equal(await TA.detailTransaksi("WA-0-0-tidakada"), undefined);
  // Opsi dari URL: tanggal WIB -> rentang [awal hari, awal hari berikutnya).
  const o = TA.opsiDariParam({ q: " x ", s: "gagal", paket: "2", dari: "2026-11-05", sampai: "2026-11-05" });
  assert.equal(o.status, "gagal");
  assert.equal(o.paketId, 2);
  assert.equal(o.sampai - o.dari, 86400);
  assert.equal(new Date((o.dari + 7 * 3600) * 1000).toISOString(), "2026-11-05T00:00:00.000Z");
  const t0 = performance.now();
  await Promise.all([TA.cariTransaksi({}), TA.hitungTransaksi({}), TA.ringkasanTransaksi()]);
  console.log(`        (halaman transaksi admin: daftar + hitung + ringkasan paralel ${(performance.now() - t0).toFixed(1)} ms)`);
});

await cek("pemberitahuan kuota habis: akun gratis sekali per periode kuota; berbayar & admin tidak pernah", async () => {
  const gratis = await P.buatAkun({ email: "gratis-kuota@uji.test", nama: "Gratis", password: "rahasia-gratis-01" });
  const [pertama, kedua] = await Promise.all([L.klaimPemberitahuanKuota(gratis.id), L.klaimPemberitahuanKuota(gratis.id)]);
  assert.equal(Number(pertama) + Number(kedua), 1, "dua chat bersamaan: hanya satu yang boleh mengirim");
  assert.equal(await L.klaimPemberitahuanKuota(gratis.id), false, "sudah diberi tahu di periode ini");
  const bayar = await P.buatAkun({ email: "bayar-kuota@uji.test", nama: "Bayar", password: "rahasia-bayar-01" });
  await L.berikanPaketManual(bayar.id, { paketId: starter.id, metode: "manual_transfer", jumlah: starter.harga, catatan: "" });
  assert.equal(await L.klaimPemberitahuanKuota(bayar.id), false, "akun berbayar tidak diberi pemberitahuan berlangganan");
  assert.equal(await L.klaimPemberitahuanKuota(admin.id), false, "admin tidak pernah");
});

await cek("bonus kuota dari admin: menambah batas periode ini (juga setelah trial lewat), tercatat di log & notifikasi pengguna", async () => {
  const N = await lib("src/lib/notifikasi.ts");
  const u = await P.buatAkun({ email: "bonus@uji.test", nama: "Bonus", password: "rahasia-bonus-01" });
  const A = { id: admin.id, email: "admin@uji.test", nama: "Admin", peran: "admin" };
  const h0 = await L.hakAkun({ id: u.id, peran: "user" });
  await P.beriBonusKuota(A, u.id, 250, "kompensasi uji");
  const h1 = await L.hakAkun({ id: u.id, peran: "user" });
  assert.equal(h1.bonus, 250);
  assert.equal(h1.balasan, h0.balasan + 250);
  assert.equal(await L.sisaKuotaAi(u.id), h1.balasan, "cache kuota disegarkan: bonus langsung terbaca jembatan WhatsApp");
  assert.deepEqual((await L.riwayatBonus(u.id)).map((b) => [b.jumlah, b.catatan, b.oleh_email]), [[250, "kompensasi uji", "admin@uji.test"]]);
  const { daftar } = await N.daftarNotif(u.id);
  assert.equal(daftar[0].jenis, "bonus");
  assert.match(daftar[0].judul, /Bonus 250 balasan AI dari admin/);
  assert.match(daftar[0].judul_en, /250 bonus AI replies/);
  assert.equal((await sql`SELECT COUNT(*)::int AS n FROM admin_log WHERE aksi = 'beri bonus kuota'`)[0].n, 1);
  await assert.rejects(P.beriBonusKuota(A, u.id, 0, ""), /Jumlah bonus harus/);
  await assert.rejects(P.beriBonusKuota(A, admin.id, 10, ""), /Admin tidak memakai/);
  // Free trial yang masa berlakunya lewat: bonus tetap bisa dipakai.
  await sql`UPDATE users SET created_at = ${sekarang() - 400 * 86400} WHERE id = ${u.id}`;
  await sql`UPDATE kuota_bonus SET dibuat = ${sekarang() - 400 * 86400 + 10} WHERE user_id = ${u.id}`;
  const h2 = await L.hakAkun({ id: u.id, peran: "user" });
  if (h2.percobaan && h2.percobaanSampai !== null) assert.equal(h2.percobaanBerakhir, false, "bonus membuat AI tetap aktif walau trial lewat");
});

await cek("notifikasi in-app: anti-dobel lewat kunci, hitungan belum dibaca dari memori, tandai dibaca, paginasi keyset", async () => {
  const N = await lib("src/lib/notifikasi.ts");
  const u = await P.buatAkun({ email: "notif@uji.test", nama: "Notif", password: "rahasia-notif-01" });
  assert.equal(await N.jumlahBelum(u.id), 0);
  for (let i = 0; i < 25; i++) await N.kirimNotif(u.id, { jenis: "kuota", judul: { id: `Notif ${i}`, en: `Notif ${i}` } });
  await N.kirimNotif(u.id, { jenis: "kuota", judul: { id: "dobel", en: "dup" }, kunci: "uji:1" });
  await N.kirimNotif(u.id, { jenis: "kuota", judul: { id: "dobel", en: "dup" }, kunci: "uji:1" });
  assert.equal(await N.jumlahBelum(u.id), 26, "kunci yang sama hanya tersimpan sekali; hitungan memori ikut");
  const [r] = await sql`SELECT COUNT(*)::int AS n FROM notifikasi WHERE user_id = ${u.id} AND dibaca IS NULL`;
  assert.equal(r.n, 26, "hitungan memori sama dengan database");
  const h1 = await N.daftarNotif(u.id, { batas: 20 });
  assert.equal(h1.daftar.length, 20);
  assert.ok(h1.adaLagi);
  const h2 = await N.daftarNotif(u.id, { batas: 20, sebelum: h1.daftar.at(-1).id });
  assert.equal(h2.daftar.length, 6);
  assert.ok(h2.daftar.every((n) => !h1.daftar.some((x) => x.id === n.id)));
  assert.equal(await N.tandaiNotifDibaca(u.id, h1.daftar[0].id), 25);
  assert.equal(await N.tandaiNotifDibaca(u.id, h1.daftar[0].id), 25, "dibaca dua kali tidak mengurangi lagi");
  assert.equal(await N.tandaiNotifDibaca(u.id), 0);
  await N.kirimNotif([u.id, admin.id], { jenis: "admin_daftar", judul: { id: "x", en: "x" } });
  assert.equal(await N.jumlahBelum(u.id), 1);
  // Notifikasi pengguna lain tidak bisa ditandai.
  const lain = await N.daftarNotif(admin.id, { batas: 1 });
  await N.tandaiNotifDibaca(u.id, lain.daftar[0].id);
  assert.equal((await sql`SELECT dibaca FROM notifikasi WHERE id = ${lain.daftar[0].id}`)[0].dibaca, null);
  const rencana = (await sql.unsafe(`EXPLAIN SELECT id FROM notifikasi WHERE user_id = ${u.id} ORDER BY id DESC LIMIT 21`)).map((x) => x["QUERY PLAN"]).join("\n");
  assert.match(rencana, /notifikasi_user_idx|Index/, rencana);
});

await cek("notifikasi otomatis: paket dari admin, paket akan berakhir (H-3, sekali), kuota habis (sekali per batas)", async () => {
  const N = await lib("src/lib/notifikasi.ts");
  const u = await P.buatAkun({ email: "pengingat@uji.test", nama: "Pengingat", password: "rahasia-ingat-01" });
  await L.berikanPaketManual(u.id, { paketId: starter.id, hari: 2, metode: "manual_transfer", jumlah: 1000, catatan: "" });
  await tidur(100);
  let { daftar } = await N.daftarNotif(u.id);
  assert.ok(daftar.some((n) => n.jenis === "paket" && /diaktifkan admin/.test(n.judul) && /ID pembelian ADM-/.test(n.isi)), JSON.stringify(daftar.map((n) => n.judul)));
  await N.jalankanPengingat();
  await N.jalankanPengingat();
  ({ daftar } = await N.daftarNotif(u.id));
  assert.equal(daftar.filter((n) => n.jenis === "paket_berakhir").length, 1, "pengingat H-3 hanya sekali walau putaran berulang");
  assert.match(daftar.find((n) => n.jenis === "paket_berakhir").judul, /berakhir 2 hari lagi/);
  // Kuota habis: notifikasi sekali untuk batas yang sama.
  const g = await P.buatAkun({ email: "habis@uji.test", nama: "Habis", password: "rahasia-habis-01" });
  await L.catatKuotaHabis(g.id);
  await L.catatKuotaHabis(g.id);
  ({ daftar } = await N.daftarNotif(g.id));
  assert.equal(daftar.filter((n) => n.jenis === "kuota").length, 1);
  assert.match(daftar[0].judul, /gratis sudah habis/);
});

void AI;
await sql.end({ timeout: 2 });
await pg.berhenti();
console.log(`\nLOLOS ${lolos} uji langganan & pembayaran`);
process.exit(0);
