// Uji payment gateway yang bisa diganti (src/lib/gateway.ts): Midtrans <-> iPaymu kapan saja, webhook kedua provider,
// dan transaksi lama yang tetap diproses provider asalnya. API Midtrans & iPaymu tiruan lewat fetch; PostgreSQL 15
// sungguhan (uji/pg-lokal.mjs). Pakai: node --import ./uji/loader.mjs uji/uji-gateway.mjs
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { mulaiPg } from "./pg-lokal.mjs";

const akar = process.cwd();
const tmp = path.join(os.tmpdir(), "wa-uji-gateway");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const pg = await mulaiPg({ dir: path.join(tmp, "pg"), sementara: true });
process.env.DATABASE_URL = pg.url;
process.env.DATA_DIR = path.join(tmp, "kosong");
process.env.AUTH_SECRET = "g".repeat(48);
const SK = "Mid-server-UJIgateway01";
const VA = "0000001234567890";
const KUNCI_IPAYMU = "SANDBOX-UJI-ipaymu-api-key";
process.env.MIDTRANS_SERVER_KEY = SK;
delete process.env.IPAYMU_VA;
delete process.env.IPAYMU_API_KEY;
process.env.IPAYMU_SANDBOX = "1";
const lib = (f) => import(pathToFileURL(path.join(akar, f)).href);

const { db, sekarang, setSetting } = await lib("src/lib/db.ts");
const L = await lib("src/lib/langganan.ts");
const G = await lib("src/lib/gateway.ts");
const I = await lib("src/lib/ipaymu.ts");
const J = await lib("src/lib/jaminan.ts");
const P = await lib("src/lib/pengguna.ts");
const sql = await db();

let lolos = 0;
const cek = async (nama, fn) => {
  await fn();
  lolos += 1;
  console.log(`  ok  ${nama}`);
};
const tunggu = async (fn, ms = 2000) => {
  for (const akhir = Date.now() + ms; Date.now() < akhir; await new Promise((r) => setTimeout(r, 10))) if (await fn()) return;
  assert.fail("menunggu terlalu lama");
};

// ---- API tiruan: Midtrans (/v2/charge, /status, /cancel) dan iPaymu (/api/v2/payment/direct, /api/v2/transaction) ----
const asli = globalThis.fetch;
const midtrans = new Map(); // order_id -> { status, payment_type }
const ipaymu = new Map(); // TransactionId -> { status, amount, ref, via }
const tiruan = { tolakIpaymu: null, nominalIpaymu: null, kanalNonaktif: new Set() };
const panggilan = [];
let trxBerikut = 880001;
const jawab = (d, status = 200) => new Response(JSON.stringify(d), { status });
const wib = (detik) => new Date((detik + 7 * 3600) * 1000).toISOString().slice(0, 19).replace("T", " ");
const QRIS = "00020101021226670016ID.CO.IPAYMU.WWW011893600922000000000102150000001234567890303UMI5204729853033605405990005802ID5913UJI IPAYMU6007JAKARTA6304ABCD";
globalThis.fetch = async (url, o) => {
  const u = String(url);
  const body = o?.body ? JSON.parse(o.body) : null;
  panggilan.push({ url: u, method: o?.method ?? "GET", headers: o?.headers ?? {}, body, mentah: o?.body });
  if (u === "https://app.midtrans.com/snap/v3/merchant-preferences") {
    // Preference API (pengaturan dashboard Midtrans): Permata VA belum aktif di akun ini.
    if (o?.headers?.Authorization !== `Basic ${Buffer.from(`${SK}:`).toString("base64")}`) return jawab({ error_messages: ["unauthorized"] }, 401);
    const nama = ["credit_card", "other_qris", "gopay", "shopeepay", "bca_va", "bni_va", "bri_va", "bsi_va", "cimb_va", "echannel", "permata_va"];
    return jawab({ merchant_id: "M-UJI", payment_channels: nama.map((name) => ({ name, enabled: name !== "permata_va" })) });
  }
  if (u === "https://api.midtrans.com/v2/charge") {
    const { order_id, gross_amount } = body.transaction_details;
    midtrans.set(order_id, { status: "pending", payment_type: body.payment_type });
    const dasar = { status_code: "201", transaction_status: "pending", order_id, gross_amount: `${gross_amount}.00`, expiry_time: wib(sekarang() + body.custom_expiry.expiry_duration * 60) };
    if (body.payment_type === "qris") return jawab({ ...dasar, qr_string: "QR-MIDTRANS" });
    if (body.payment_type === "gopay") return jawab({ ...dasar, actions: [{ name: "deeplink-redirect", url: "https://gojek.link/x" }, { name: "generate-qr-code", url: "https://api.midtrans.com/v2/gopay/x/qr-code" }] });
    return jawab({ ...dasar, va_numbers: [{ bank: body.bank_transfer?.bank ?? "bni", va_number: "9880012345" }] });
  }
  let m = u.match(/^https:\/\/api\.midtrans\.com\/v2\/(.+)\/status$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    const d = midtrans.get(id);
    if (!d) return jawab({ status_code: "404", status_message: "Transaction doesn't exist." }, 404);
    const [t] = await sql`SELECT jumlah FROM transaksi WHERE order_id = ${id}`;
    return jawab({ order_id: id, status_code: "200", gross_amount: `${t.jumlah}.00`, transaction_status: d.status, payment_type: d.payment_type });
  }
  m = u.match(/^https:\/\/api\.midtrans\.com\/v2\/(.+)\/cancel$/);
  if (m) {
    const d = midtrans.get(decodeURIComponent(m[1]));
    if (!d || d.status !== "pending") return jawab({ status_code: "412", status_message: "Merchant cannot modify the status of the transaction" });
    d.status = "cancel";
    return jawab({ status_code: "200", transaction_status: "cancel" });
  }
  if (u.startsWith("https://sandbox.ipaymu.com/api/v2/")) {
    // Tanda tangan diperiksa seperti server iPaymu: HMAC-SHA256(apiKey, "POST:va:sha256(body):apiKey").
    const h = o.headers;
    const metode = o.method ?? "GET";
    const harap = createHmac("sha256", KUNCI_IPAYMU).update(`${metode}:${VA}:${createHash("sha256").update(o.body ?? "{}").digest("hex")}:${KUNCI_IPAYMU}`).digest("hex");
    if (h.va !== VA || h.signature !== harap || !/^\d{14}$/.test(h.timestamp)) return jawab({ Status: 401, Success: false, Message: "unauthorized signature" }, 401);
    if (u.endsWith("/payment-channels") && metode === "GET") {
      // Bentuk jawaban sama dengan akun produksi (FeatureStatus per kanal).
      const k = (grup, kode) => ({ Code: kode, Name: kode, FeatureStatus: tiruan.kanalNonaktif.has(`${grup}/${kode}`) ? "inactive" : "active", HealthStatus: "online" });
      return jawab({
        Status: 200,
        Success: true,
        Message: "Success",
        Data: [
          { Code: "qris", Channels: [k("qris", "mpm")] },
          { Code: "va", Channels: ["bca", "bni", "bri", "bsi", "cimb", "mandiri", "permata", "danamon"].map((c) => k("va", c)) },
          { Code: "ewallet", Channels: [k("ewallet", "shopeepay"), k("ewallet", "dana")] },
          { Code: "cstore", Channels: [{ Code: "alfamart", FeatureStatus: "inactive" }] },
        ],
      });
    }
    if (u.endsWith("/payment/direct")) {
      if (tiruan.tolakIpaymu) return jawab({ Status: 400, Success: false, Message: tiruan.tolakIpaymu }, 400);
      const id = trxBerikut++;
      ipaymu.set(id, { status: 0, amount: body.amount, ref: body.referenceId, via: body.paymentMethod });
      const dasar = { SessionId: `sid-${id}`, TransactionId: id, ReferenceId: body.referenceId, Via: body.paymentMethod.toUpperCase(), Channel: body.paymentChannel.toUpperCase(), PaymentName: "Uji", Total: body.amount, Fee: 0, Expired: wib(sekarang() + body.expired * 60) };
      if (body.paymentMethod === "ewallet") return jawab({ Status: 200, Success: true, Message: "Success", Data: { ...dasar, PaymentNo: id, Url: `https://m.sandbox.${body.paymentChannel}.id/checkout?trx=${id}` } });
      return jawab({ Status: 200, Success: true, Message: "Success", Data: body.paymentMethod === "qris" ? { ...dasar, PaymentNo: QRIS, QrString: QRIS, QrImage: "https://sandbox.ipaymu.com/qr/x.png" } : { ...dasar, PaymentNo: `8808${String(id).padStart(8, "0")}` } });
    }
    if (u.endsWith("/transaction")) {
      const d = ipaymu.get(Number(body.transactionId));
      if (!d) return jawab({ Status: 404, Success: false, Message: "Transaction not found" }, 404);
      return jawab({ Status: 200, Success: true, Message: "Success", Data: { TransactionId: Number(body.transactionId), ReferenceId: d.ref, Amount: tiruan.nominalIpaymu ?? d.amount, Status: d.status, StatusDesc: "x", Via: d.via } });
    }
  }
  if (u.startsWith("https://graph.facebook.com/")) return jawab({ events_received: 1 });
  return new Response("{}", { status: 404 });
};
/** Adapter mode satu provider (Hanya Midtrans / Hanya iPaymu). */
const aktifSatu = async () => G.adapter(await G.modeGateway());
const keIpaymu = (akhir) => panggilan.filter((p) => p.url.startsWith("https://sandbox.ipaymu.com") && p.url.endsWith(akhir));
const keMidtrans = (akhir) => panggilan.filter((p) => p.url.startsWith("https://api.midtrans.com") && p.url.endsWith(akhir));

const akunBaru = async (nama) => {
  const email = `${nama.toLowerCase()}@uji.test`;
  const u = await P.buatAkun({ email, nama, password: `rahasia-${nama.toLowerCase()}-01` });
  return { id: u.id, email, nama };
};
const budi = await akunBaru("Budi");
const sari = await akunBaru("Sari");
const pembeli = (u) => u;
const paket = await L.daftarPaket();
const starter = paket.find((p) => p.kode === "starter");
const bisnis = paket.find((p) => p.kode === "bisnis");
const baris = async (o) => (await sql`SELECT status, gateway, gateway_ref, kanal, bayar, metode, langganan_id FROM transaksi WHERE order_id = ${o}`)[0];
const jumlahLangganan = async (u) => (await sql`SELECT COUNT(*)::int AS n FROM langganan WHERE user_id = ${u.id}`)[0].n;

const routeIpaymu = await lib("src/app/api/ipaymu/notifikasi/route.ts");
const routeMidtrans = await lib("src/app/api/midtrans/notifikasi/route.ts");
const callbackIpaymu = (isi, jenis = "form") =>
  routeIpaymu.POST(
    new Request("https://wa.uji/api/ipaymu/notifikasi", {
      method: "POST",
      headers: { "Content-Type": jenis === "json" ? "application/json" : "application/x-www-form-urlencoded" },
      body: jenis === "json" ? JSON.stringify(isi) : new URLSearchParams(isi).toString(),
    })
  );
const webhookMidtrans = (order, jumlah, status) => {
  const n = { order_id: order, status_code: "200", gross_amount: `${jumlah}.00`, transaction_status: status };
  const signature_key = createHash("sha512").update(`${n.order_id}${n.status_code}${n.gross_amount}${SK}`).digest("hex");
  return routeMidtrans.POST(new Request("https://wa.uji/api/midtrans/notifikasi", { method: "POST", body: JSON.stringify({ ...n, signature_key }) }));
};

console.log("== Provider aktif ==");

await cek("migrasi: kolom transaksi.gateway (bawaan 'midtrans', hanya midtrans/ipaymu) + gateway_ref; baris lama otomatis 'midtrans'", async () => {
  const kolom = await sql`SELECT column_name, column_default, is_nullable FROM information_schema.columns WHERE table_name = 'transaksi' AND column_name IN ('gateway', 'gateway_ref') ORDER BY column_name`;
  assert.deepEqual(kolom.map((k) => [k.column_name, k.is_nullable]), [["gateway", "NO"], ["gateway_ref", "YES"]]);
  assert.match(kolom[0].column_default, /'midtrans'/);
  const kini = sekarang();
  await sql`INSERT INTO transaksi(order_id, user_id, paket_id, nama_paket, jumlah, status, dibuat) VALUES ('WA-1-1-aaaaaa', ${budi.id}, ${starter.id}, 'Starter', 1, 'lunas', ${kini})`;
  assert.equal((await baris("WA-1-1-aaaaaa")).gateway, "midtrans");
  await assert.rejects(sql`UPDATE transaksi SET gateway = 'xendit' WHERE order_id = 'WA-1-1-aaaaaa'`);
  await sql`DELETE FROM transaksi WHERE order_id = 'WA-1-1-aaaaaa'`;
});

await cek("bawaan Midtrans; iPaymu tanpa IPAYMU_VA/IPAYMU_API_KEY = belum dipasang (tanpa adapter, tanpa kanal)", async () => {
  const info = await G.infoGateway();
  assert.equal(info.mode, "midtrans");
  assert.deepEqual(info.daftar.map((d) => [d.nama, d.terpasang]), [["midtrans", true], ["ipaymu", false]]);
  assert.equal(await G.adapter("ipaymu"), null);
  assert.deepEqual(await G.kanalAktif("ipaymu"), []);
  assert.equal((await aktifSatu()).nama, "midtrans");
  // Nilai setting yang tidak dikenal = bawaan.
  await setSetting("gateway_aktif", "xendit");
  assert.equal(await G.modeGateway(), "midtrans");
  process.env.IPAYMU_VA = VA;
  process.env.IPAYMU_API_KEY = KUNCI_IPAYMU;
  const i2 = (await G.infoGateway()).daftar.find((d) => d.nama === "ipaymu");
  assert.deepEqual([i2.terpasang, i2.sandbox], [true, true]);
  assert.equal(I.alamatIpaymu(I.konfigIpaymu()), "https://sandbox.ipaymu.com");
  process.env.IPAYMU_SANDBOX = "0";
  assert.equal(I.alamatIpaymu(I.konfigIpaymu()), "https://my.ipaymu.com");
  process.env.IPAYMU_SANDBOX = "1";
});

await cek("tanda tangan iPaymu = HMAC-SHA256(apiKey, POST:va:sha256(body):apiKey); peta status iPaymu; waktu Expired WIB", async () => {
  const badan = JSON.stringify({ transactionId: 1 });
  const harap = createHmac("sha256", KUNCI_IPAYMU).update(`POST:${VA}:${createHash("sha256").update(badan).digest("hex")}:${KUNCI_IPAYMU}`).digest("hex");
  assert.equal(I.tandaTanganIpaymu({ va: VA, apiKey: KUNCI_IPAYMU }, badan), harap);
  assert.notEqual(I.tandaTanganIpaymu({ va: VA, apiKey: KUNCI_IPAYMU }, badan + " "), harap);
  const p = (Status) => I.petaStatusIpaymu({ Status });
  assert.deepEqual([p(1), p("1"), p(6), p(7), p(0), p(-2), p(2), p(3), p(4), p(5), p(undefined)], ["lunas", "lunas", "lunas", "lunas", "menunggu", "kedaluwarsa", "dibatalkan", "dikembalikan", "gagal", "gagal", "gagal"]);
  assert.equal(I.waktuIpaymu("2026-11-10 10:15:00"), Date.UTC(2026, 10, 10, 3, 15) / 1000);
  assert.equal(I.waktuIpaymu(""), null);
});

let orderMidtransLama;
let orderMidtransLunasNanti;
await cek("Midtrans -> iPaymu: tagihan baru lewat iPaymu, metode bayar mengikuti iPaymu (QRIS, ShopeePay, DANA, VA; tanpa GoPay); tagihan Midtrans yang masih menunggu dibatalkan lewat Midtrans", async () => {
  // Saat Midtrans aktif: dua tagihan Midtrans (Sari punya satu yang nanti dibayar setelah provider diganti).
  orderMidtransLama = (await L.mulaiBayar(await aktifSatu(), pembeli(budi), starter, "qris", "https://wa.uji")).orderId;
  orderMidtransLunasNanti = (await L.mulaiBayar(await aktifSatu(), pembeli(sari), starter, "bni", "https://wa.uji")).orderId;
  assert.equal((await baris(orderMidtransLama)).gateway, "midtrans");
  assert.ok((await G.kanalAktif()).includes("gopay"));

  await G.setModeGateway("ipaymu");
  assert.equal(await G.modeGateway(), "ipaymu");
  // Semua kanal yang dilayani iPaymu & aktif di akun (tiruan: semua aktif), DANA ikut; GoPay tidak ada di iPaymu.
  assert.deepEqual(await G.kanalAktif(), ["qris", "shopeepay", "dana", "bca", "bni", "bri", "bsi", "cimb", "mandiri", "permata"]);
  const g = await aktifSatu();
  assert.equal(g.nama, "ipaymu");
  const t0 = performance.now();
  const h = await L.mulaiBayar(g, pembeli(budi), starter, "qris", "https://wa.uji");
  console.log(`      (mulaiBayar lewat iPaymu tiruan: ${(performance.now() - t0).toFixed(1)} ms)`);
  assert.equal(h.baru, true, "tagihan QRIS Midtrans yang sama tidak dipakai ulang setelah provider diganti");
  const [c] = keIpaymu("/payment/direct");
  assert.equal(c.method, "POST");
  assert.deepEqual(
    [c.body.referenceId, c.body.amount, c.body.paymentMethod, c.body.paymentChannel, c.body.expired, c.body.expiredType, c.body.feeDirection, c.body.notifyUrl],
    [h.orderId, 99000, "qris", "qris", 15, "minutes", "MERCHANT", "https://wa.uji/api/ipaymu/notifikasi"]
  );
  assert.equal(c.body.returnUrl, `https://wa.uji/langganan/tagihan/${encodeURIComponent(h.orderId)}`);
  const t = await baris(h.orderId);
  assert.deepEqual([t.status, t.gateway, t.kanal, t.bayar], ["menunggu", "ipaymu", "qris", { qr: QRIS }]);
  assert.match(t.gateway_ref, /^\d+$/);
  assert.equal((await L.transaksiMilik(budi.id, h.orderId)).gateway, "ipaymu");
  // Tagihan Midtrans lama Budi dibatalkan lewat Midtrans (provider asalnya), bukan lewat iPaymu.
  await tunggu(async () => (await baris(orderMidtransLama)).status === "dibatalkan");
  assert.equal(keMidtrans(`/v2/${orderMidtransLama}/cancel`).length, 1);
  // VA: nomor dari PaymentNo, batas bayar 24 jam.
  const v = await L.mulaiBayar(g, pembeli(budi), bisnis, "mandiri", "https://wa.uji");
  const tv = await baris(v.orderId);
  assert.match(tv.bayar.va, /^8808\d{8}$/);
  assert.equal(tv.bayar.biller, undefined, "iPaymu: VA Mandiri biasa, tanpa kode perusahaan");
  assert.deepEqual([keIpaymu("/payment/direct").at(-1).body.paymentMethod, keIpaymu("/payment/direct").at(-1).body.expired], ["va", 1440]);
  // Klik ulang = tagihan iPaymu yang sama, tanpa charge baru.
  const n = keIpaymu("/payment/direct").length;
  assert.deepEqual(await L.mulaiBayar(g, pembeli(budi), bisnis, "mandiri", "https://wa.uji"), { orderId: v.orderId, baru: false });
  assert.equal(keIpaymu("/payment/direct").length, n);
});

let orderIpaymu;
await cek("callback iPaymu: trx_id salah = 403 tanpa perubahan; isi callback tidak dipercaya (status diambil ulang dari API); lunas = paket aktif TEPAT SEKALI walau callback berulang", async () => {
  const g = await aktifSatu();
  const h = await L.mulaiBayar(g, pembeli(budi), starter, "bca", "https://wa.uji");
  orderIpaymu = h.orderId;
  const t = await baris(orderIpaymu);
  const sebelum = await jumlahLangganan(budi);
  // trx_id milik transaksi lain / dikarang = ditolak.
  let r = await callbackIpaymu({ trx_id: "999999", reference_id: orderIpaymu, status: "berhasil", status_code: "1" });
  assert.equal(r.status, 403);
  // Callback "berhasil" palsu dengan trx_id benar, tapi API iPaymu masih pending = tetap menunggu.
  r = await callbackIpaymu({ trx_id: t.gateway_ref, reference_id: orderIpaymu, status: "berhasil", status_code: "1" });
  assert.equal(r.status, 200);
  assert.equal((await baris(orderIpaymu)).status, "menunggu");
  assert.equal(await jumlahLangganan(budi), sebelum);
  // Dibayar sungguhan.
  ipaymu.get(Number(t.gateway_ref)).status = 1;
  const t0 = performance.now();
  r = await callbackIpaymu({ trx_id: t.gateway_ref, reference_id: orderIpaymu, status: "berhasil", status_code: "1", via: "va", channel: "bca" });
  console.log(`      (callback iPaymu lunas -> paket aktif: ${(performance.now() - t0).toFixed(1)} ms)`);
  assert.equal(r.status, 200);
  r = await callbackIpaymu({ trx_id: t.gateway_ref, reference_id: orderIpaymu, status: "berhasil" }, "json"); // ulang, format JSON
  assert.equal(r.status, 200);
  const akhir = await baris(orderIpaymu);
  assert.deepEqual([akhir.status, akhir.metode], ["lunas", "va"]);
  assert.ok(akhir.langganan_id);
  assert.equal(await jumlahLangganan(budi), sebelum + 1);
  assert.equal((await L.langgananAktif(budi.id)).nama_paket, "Starter");
  // Order bukan milik aplikasi ini / tidak dikenal: diabaikan (200, supaya tidak dikirim ulang terus).
  assert.equal((await callbackIpaymu({ trx_id: "1", reference_id: "ORDER-LAIN" })).status, 200);
  assert.equal((await callbackIpaymu({ trx_id: "1", reference_id: "WA-9-9-abcdef" })).status, 200);
});

await cek("nominal dari iPaymu berbeda dengan tagihan = TIDAK diaktifkan", async () => {
  const g = await aktifSatu();
  const h = await L.mulaiBayar(g, pembeli(sari), bisnis, "bri", "https://wa.uji");
  const t = await baris(h.orderId);
  ipaymu.get(Number(t.gateway_ref)).status = 1;
  tiruan.nominalIpaymu = 1000;
  try {
    assert.equal((await L.terapkanStatus(h.orderId)).baruAktif, false);
  } finally {
    tiruan.nominalIpaymu = null;
  }
  assert.equal((await baris(h.orderId)).status, "menunggu");
  ipaymu.get(Number(t.gateway_ref)).status = -2;
  assert.equal((await L.terapkanStatus(h.orderId)).status, "kedaluwarsa");
});

await cek("transaksi Midtrans lama tetap jalan saat iPaymu aktif: webhook Midtrans (tanda tangan sah) -> status dari API Midtrans -> lunas & paket aktif", async () => {
  assert.equal(await G.modeGateway(), "ipaymu");
  midtrans.get(orderMidtransLunasNanti).status = "settlement";
  const sebelum = await jumlahLangganan(sari);
  const n = keIpaymu("/transaction").length;
  const r = await webhookMidtrans(orderMidtransLunasNanti, starter.harga, "settlement");
  assert.equal(r.status, 200);
  assert.equal((await baris(orderMidtransLunasNanti)).status, "lunas");
  assert.equal(await jumlahLangganan(sari), sebelum + 1);
  assert.equal(keIpaymu("/transaction").length, n, "iPaymu tidak ditanya untuk transaksi Midtrans");
  assert.ok(keMidtrans(`/v2/${orderMidtransLunasNanti}/status`).length >= 1);
  // Tanda tangan salah tetap ditolak.
  const palsu = await routeMidtrans.POST(new Request("https://wa.uji/x", { method: "POST", body: JSON.stringify({ order_id: orderMidtransLunasNanti, status_code: "200", gross_amount: "99000.00", signature_key: "x" }) }));
  assert.equal(palsu.status, 403);
});

await cek("kanal yang ditolak iPaymu hanya disembunyikan untuk iPaymu (kanal_mati_ipaymu), Midtrans tidak ikut; galat jelas tanpa tagihan yatim", async () => {
  const g = await aktifSatu();
  const sebelum = (await sql`SELECT COUNT(*)::int AS n FROM transaksi`)[0].n;
  tiruan.tolakIpaymu = "Payment channel bsi is not active for this merchant";
  try {
    await assert.rejects(L.mulaiBayar(g, pembeli(sari), starter, "bsi", "https://wa.uji"), (e) => e instanceof G.GatewayError && e.kanalMati === true);
    tiruan.tolakIpaymu = "Server sedang sibuk";
    await assert.rejects(L.mulaiBayar(g, pembeli(sari), starter, "cimb", "https://wa.uji"), (e) => e instanceof G.GatewayError && e.kanalMati === false);
  } finally {
    tiruan.tolakIpaymu = null;
  }
  assert.equal((await sql`SELECT COUNT(*)::int AS n FROM transaksi`)[0].n, sebelum);
  assert.equal((await G.kanalAktif("ipaymu")).includes("bsi"), false);
  assert.equal((await G.kanalAktif("ipaymu")).includes("cimb"), true, "galat sementara tidak menyembunyikan kanal");
  assert.equal((await G.kanalAktif("midtrans")).includes("bsi"), true);
  const [s] = await sql`SELECT nilai FROM settings WHERE kunci = 'kanal_mati_ipaymu'`;
  assert.match(JSON.parse(s.nilai).bsi.alasan, /not active/);
  await G.setKanalMati("ipaymu", "bsi", null);
  assert.equal((await G.kanalAktif("ipaymu")).includes("bsi"), true);
});

await cek("batal tagihan iPaymu (tanpa API batal): ditandai dibatalkan di sisi kita; bila tetap dibayar sebelum kedaluwarsa, callback lunas tetap mengaktifkan paket", async () => {
  const g = await aktifSatu();
  const h = await L.mulaiBayar(g, pembeli(sari), starter, "permata", "https://wa.uji");
  assert.equal(await L.batalkanBayar(budi.id, h.orderId), null, "milik orang lain");
  assert.equal(await L.batalkanBayar(sari.id, h.orderId), "dibatalkan");
  const t = await baris(h.orderId);
  assert.equal(t.status, "dibatalkan");
  const sebelum = (await L.langgananAktif(sari.id)).sampai;
  ipaymu.get(Number(t.gateway_ref)).status = 1;
  assert.equal((await callbackIpaymu({ trx_id: t.gateway_ref, reference_id: h.orderId, status: "berhasil" })).status, 200);
  assert.equal((await baris(h.orderId)).status, "lunas");
  assert.equal((await L.langgananAktif(sari.id)).sampai, sebelum + starter.durasi_hari * 86400, "paket Starter Sari diperpanjang");
  // Sudah dibayar lalu dibatalkan: status sebenarnya.
  const b = await L.mulaiBayar(g, pembeli(sari), bisnis, "bni", "https://wa.uji");
  ipaymu.get(Number((await baris(b.orderId)).gateway_ref)).status = 1;
  assert.equal(await L.batalkanBayar(sari.id, b.orderId), "lunas");
});

let orderIpaymuMenunggu;
await cek("iPaymu -> Midtrans: tagihan baru lewat Midtrans lagi; tagihan iPaymu yang masih menunggu dibatalkan di sisi kita; tagihan iPaymu lama tetap dicek ke iPaymu (polling) dan callback-nya tetap diterima", async () => {
  const g = await aktifSatu();
  orderIpaymuMenunggu = (await L.mulaiBayar(g, pembeli(budi), bisnis, "qris", "https://wa.uji")).orderId;
  const ipaymuLain = (await L.mulaiBayar(g, pembeli(sari), bisnis, "qris", "https://wa.uji")).orderId;
  await G.setModeGateway("midtrans");
  const m = await aktifSatu();
  assert.equal(m.nama, "midtrans");
  assert.ok((await G.kanalAktif()).includes("gopay"));
  const nIpaymu = keIpaymu("/payment/direct").length;
  const h = await L.mulaiBayar(m, pembeli(budi), bisnis, "qris", "https://wa.uji");
  assert.equal(h.baru, true, "tagihan QRIS iPaymu tidak dipakai ulang untuk Midtrans");
  assert.equal((await baris(h.orderId)).gateway, "midtrans");
  assert.equal(keIpaymu("/payment/direct").length, nIpaymu, "iPaymu tidak dipanggil untuk tagihan baru");
  await tunggu(async () => (await baris(orderIpaymuMenunggu)).status === "dibatalkan");
  // Tagihan iPaymu milik Sari masih menunggu: polling halaman tagihan bertanya ke iPaymu (provider asal), bukan Midtrans.
  const trx = (await baris(ipaymuLain)).gateway_ref;
  const n = keIpaymu("/transaction").length;
  const t0 = performance.now();
  for (let i = 0; i < 20; i++) assert.equal(await L.statusTagihan(sari.id, ipaymuLain), "menunggu");
  console.log(`      (statusTagihan dari DB: ${((performance.now() - t0) / 20).toFixed(2)} ms per polling)`);
  assert.equal(keIpaymu("/transaction").length, n, "dalam jeda: dari DB saja");
  ipaymu.get(Number(trx)).status = 1;
  globalThis.__waCekBayar.set(ipaymuLain, Date.now() - L.JEDA_CEK_MIDTRANS - 1);
  assert.equal(await L.statusTagihan(sari.id, ipaymuLain), "lunas");
  assert.equal(keIpaymu("/transaction").length, n + 1);
  assert.equal(keMidtrans(`/v2/${ipaymuLain}/status`).length, 0);
  // Callback iPaymu ulang setelah provider diganti tetap diterima (idempoten).
  assert.equal((await callbackIpaymu({ trx_id: trx, reference_id: ipaymuLain, status: "berhasil" })).status, 200);
  // Kredensial iPaymu dicabut: transaksi iPaymu lama tetap terbaca dari DB, callback 503 (iPaymu mengirim ulang nanti).
  delete process.env.IPAYMU_API_KEY;
  assert.equal(await L.statusTagihan(sari.id, ipaymuLain), "lunas");
  assert.equal((await callbackIpaymu({ trx_id: trx, reference_id: ipaymuLain })).status, 503);
  assert.equal((await G.infoGateway()).daftar.find((d) => d.nama === "ipaymu").terpasang, false);
  process.env.IPAYMU_API_KEY = KUNCI_IPAYMU;
});


await cek("kanal iPaymu mengikuti status akun (GET payment-channels, disimpan 10 menit): QRIS nonaktif di akun = tidak ditawarkan; satu panggilan untuk banyak permintaan", async () => {
  G.lupakanStatusKanal();
  tiruan.kanalNonaktif = new Set(["qris/mpm"]);
  const n = keIpaymu("/payment-channels").length;
  const t0 = performance.now();
  const daftar = await G.kanalAktif("ipaymu");
  const ms1 = performance.now() - t0;
  assert.equal(daftar.includes("qris"), false);
  assert.ok(daftar.includes("dana") && daftar.includes("bca"));
  const t1 = performance.now();
  for (let i = 0; i < 50; i++) await G.kanalAktif("ipaymu");
  console.log(`      (kanal iPaymu: pertama ${ms1.toFixed(1)} ms dengan 1 panggilan API; berikutnya ${((performance.now() - t1) / 50).toFixed(3)} ms dari memori)`);
  assert.equal(keIpaymu("/payment-channels").length, n + 1, "disimpan di memori");
  const [c] = keIpaymu("/payment-channels").slice(-1);
  assert.equal(c.method, "GET");
});

await cek("mode HYBRID: BCA VA, ShopeePay, DANA lewat iPaymu, sisanya Midtrans; admin bisa ubah per metode; metode yang tidak ada di provider pilihannya otomatis lewat provider lain", async () => {
  await G.setModeGateway("hybrid");
  let p = await G.penyediaKanal();
  // Permata belum aktif di dashboard Midtrans -> otomatis lewat iPaymu yang aktif.
  assert.deepEqual(p, { qris: "midtrans", gopay: "midtrans", shopeepay: "ipaymu", dana: "ipaymu", bca: "ipaymu", bni: "midtrans", bri: "midtrans", bsi: "midtrans", cimb: "midtrans", mandiri: "midtrans", permata: "ipaymu" });
  assert.deepEqual(await G.kanalAktif(), ["qris", "gopay", "shopeepay", "dana", "bca", "bni", "bri", "bsi", "cimb", "mandiri", "permata"]);
  // Tagihan per metode lewat provider masing-masing.
  const bca = await L.mulaiBayar(await G.adapterKanal("bca"), pembeli(budi), starter, "bca", "https://wa.uji");
  assert.equal((await baris(bca.orderId)).gateway, "ipaymu");
  const dana = await L.mulaiBayar(await G.adapterKanal("dana"), pembeli(budi), starter, "dana", "https://wa.uji");
  const td = await baris(dana.orderId);
  assert.deepEqual([td.gateway, td.kanal], ["ipaymu", "dana"]);
  assert.match(td.bayar.deeplink, /^https:\/\/m\.sandbox\.dana\.id\/checkout\?trx=\d+$/);
  assert.deepEqual([keIpaymu("/payment/direct").at(-1).body.paymentMethod, keIpaymu("/payment/direct").at(-1).body.paymentChannel, keIpaymu("/payment/direct").at(-1).body.expired], ["ewallet", "dana", 15]);
  const gopay = await L.mulaiBayar(await G.adapterKanal("gopay"), pembeli(budi), starter, "gopay", "https://wa.uji");
  assert.equal((await baris(gopay.orderId)).gateway, "midtrans");
  // Admin memindahkan BNI ke iPaymu; QRIS ke iPaymu padahal QRIS nonaktif di akun iPaymu = tetap lewat Midtrans.
  await G.setPenyediaHybrid("bni", "ipaymu");
  await G.setPenyediaHybrid("qris", "ipaymu");
  p = await G.penyediaKanal();
  assert.deepEqual([p.bni, p.qris, p.bca], ["ipaymu", "midtrans", "ipaymu"]);
  const r = (await G.rencanaKanal()).kanal;
  assert.deepEqual(r.find((x) => x.kanal === "gopay").pilihan, ["midtrans"]);
  assert.deepEqual(r.find((x) => x.kanal === "dana").pilihan, ["ipaymu"]);
  assert.deepEqual(r.find((x) => x.kanal === "bni").pilihan, ["midtrans", "ipaymu"]);
  // Disembunyikan admin hanya untuk provider yang melayani metode itu sekarang.
  await G.setKanalMati("ipaymu", "bni", { oleh: "admin", waktu: sekarang() });
  assert.equal((await G.kanalAktif()).includes("bni"), false);
  await G.setPenyediaHybrid("bni", "midtrans");
  assert.equal((await G.kanalAktif()).includes("bni"), true, "lewat Midtrans BNI tidak disembunyikan");
  await G.setKanalMati("ipaymu", "bni", null);
  // iPaymu dicabut dari .env: DANA hilang, BCA & ShopeePay otomatis lewat Midtrans.
  delete process.env.IPAYMU_API_KEY;
  p = await G.penyediaKanal();
  assert.deepEqual([p.dana, p.bca, p.shopeepay], [undefined, "midtrans", "midtrans"]);
  process.env.IPAYMU_API_KEY = KUNCI_IPAYMU;
  // Hanya Midtrans: DANA tidak ditawarkan; Hanya iPaymu: GoPay tidak ditawarkan.
  await G.setModeGateway("midtrans");
  assert.equal((await G.kanalAktif()).includes("dana"), false);
  await G.setModeGateway("ipaymu");
  assert.equal((await G.kanalAktif()).includes("gopay"), false);
  assert.equal(await G.adapterKanal("gopay"), null);
  await G.setModeGateway("midtrans");
  tiruan.kanalNonaktif = new Set();
  G.lupakanStatusKanal();
});

await cek("status NYATA tiap provider seperti di dashboard-nya: Midtrans (Preference API) & iPaymu (payment-channels); belum aktif = nonaktif & tidak bisa dipilih; ditolak saat bayar = nonaktif sampai admin 'Coba lagi'", async () => {
  G.lupakanStatusKanal();
  tiruan.kanalNonaktif = new Set(["qris/mpm"]);
  const nPref = panggilan.filter((x) => x.url.endsWith("/merchant-preferences")).length;
  const [m, i] = await Promise.all([G.statusProvider("midtrans"), G.statusProvider("ipaymu")]);
  assert.deepEqual(m.permata, { aktif: false, catatan: "Belum aktif di dashboard Midtrans" });
  assert.deepEqual(m.gopay, { aktif: true, catatan: "Aktif di Midtrans" });
  assert.equal(m.dana, undefined, "DANA tidak dilayani Midtrans");
  assert.deepEqual(i.qris, { aktif: false, catatan: "Belum aktif di dashboard iPaymu" });
  assert.deepEqual(i.dana, { aktif: true, catatan: "Aktif di iPaymu" });
  assert.equal(i.gopay, undefined, "GoPay tidak dilayani iPaymu");
  await G.statusProvider("midtrans");
  assert.equal(panggilan.filter((x) => x.url.endsWith("/merchant-preferences")).length, nPref + 1, "satu panggilan, lalu dari memori");
  // Mode satu provider: metode yang belum aktif di provider itu tidak ditawarkan.
  await G.setModeGateway("midtrans");
  assert.equal((await G.kanalAktif()).includes("permata"), false);
  await G.setModeGateway("ipaymu");
  assert.equal((await G.kanalAktif()).includes("qris"), false);
  // Hybrid: provider yang belum aktif tidak bisa dipilih admin; QRIS hanya aktif di Midtrans.
  await G.setModeGateway("hybrid");
  const r = (await G.rencanaKanal()).kanal;
  const qris = r.find((x) => x.kanal === "qris");
  assert.deepEqual([qris.pilihan, qris.penyedia, qris.status.ipaymu.aktif], [["midtrans"], "midtrans", false]);
  assert.deepEqual(r.find((x) => x.kanal === "permata").pilihan, ["ipaymu"]);
  // Ditolak Midtrans saat membuat tagihan (402) = nonaktif di Midtrans; hybrid otomatis lewat iPaymu.
  await G.setKanalMati("midtrans", "bni", { oleh: "otomatis", waktu: sekarang(), alasan: "kode 402: Payment channel is not activated." });
  let bni = (await G.rencanaKanal()).kanal.find((x) => x.kanal === "bni");
  assert.deepEqual([bni.penyedia, bni.status.midtrans.aktif, bni.status.midtrans.ditolak], ["ipaymu", false, true]);
  assert.match(bni.status.midtrans.catatan, /Ditolak Midtrans saat membuat tagihan \(kode 402/);
  await G.setKanalMati("midtrans", "bni", null); // admin "Coba lagi"
  bni = (await G.rencanaKanal()).kanal.find((x) => x.kanal === "bni");
  assert.deepEqual([bni.penyedia, bni.status.midtrans.aktif], ["midtrans", true]);
  // Status tidak terbaca (jaringan): tidak diketahui = tetap boleh dipakai, bukan dihilangkan.
  G.lupakanStatusKanal();
  const asliFetch = globalThis.fetch;
  globalThis.fetch = async (url, o) => (String(url).includes("merchant-preferences") || String(url).includes("payment-channels") ? new Response("gangguan", { status: 503 }) : asliFetch(url, o));
  try {
    const [m2, i2] = await Promise.all([G.statusProvider("midtrans"), G.statusProvider("ipaymu")]);
    assert.deepEqual([m2.permata.aktif, i2.qris.aktif], [null, null]);
  } finally {
    globalThis.fetch = asliFetch;
  }
  G.lupakanStatusKanal();
  tiruan.kanalNonaktif = new Set();
  await G.setModeGateway("midtrans");
});

await cek("jaminan uang kembali: pembayaran pertama lewat iPaymu (tanpa Refund API) = cara manual walau admin memilih otomatis; lewat Midtrans tetap otomatis", async () => {
  await J.setModeRefund("otomatis");
  const andi = await akunBaru("Andi");
  const dewi = await akunBaru("Dewi");
  assert.equal(await J.modeRefundAkun(andi.id), "otomatis", "belum bayar = mode admin");
  const kini = sekarang();
  await sql`INSERT INTO transaksi(order_id, user_id, paket_id, nama_paket, jumlah, status, kanal, dibuat, dibayar, gateway, gateway_ref)
            VALUES (${`WA-${andi.id}-${kini}-a1b2c3`}, ${andi.id}, ${starter.id}, 'Starter', 99000, 'lunas', 'qris', ${kini}, ${kini}, 'ipaymu', '1')`;
  await sql`INSERT INTO transaksi(order_id, user_id, paket_id, nama_paket, jumlah, status, kanal, dibuat, dibayar)
            VALUES (${`WA-${dewi.id}-${kini}-d1e2f3`}, ${dewi.id}, ${starter.id}, 'Starter', 99000, 'lunas', 'qris', ${kini}, ${kini})`;
  assert.equal(await J.modeRefundAkun(andi.id), "manual");
  assert.equal(await J.modeRefundAkun(dewi.id), "otomatis");
  await J.setModeRefund("manual");
  assert.equal(await J.modeRefundAkun(dewi.id), "manual");
});

await cek("query provider asal & callback lewat indeks unik order_id (bukan scan tabel)", async () => {
  // Tabel uji kecil (planner bisa memilih seq scan): paksa seperti tabel produksi yang besar.
  const r2 = await sql.begin(async (tx) => {
    await tx`SET LOCAL enable_seqscan = off`;
    return (await tx`EXPLAIN (ANALYZE, FORMAT JSON) SELECT gateway, gateway_ref FROM transaksi WHERE order_id = ${orderIpaymu}`)[0]["QUERY PLAN"];
  });
  assert.match(JSON.stringify(r2), /transaksi_order_id_key|Index (Only )?Scan/);
  console.log(`      (asalTransaksi: ${r2[0]["Execution Time"].toFixed(3)} ms lewat indeks unik order_id)`);
});

globalThis.fetch = asli;
await sql.end({ timeout: 2 });
await pg.berhenti();
console.log(`\nLOLOS ${lolos} uji payment gateway (Midtrans <-> iPaymu)`);
process.exit(0);
