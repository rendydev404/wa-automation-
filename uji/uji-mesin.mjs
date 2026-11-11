// Uji mesin self-host (MODE=mesin): lisensi dari pusat (aktivasi + tantangan, webhook lisensi, versi, tanda tangan),
// mode terbatas tanpa memutus WhatsApp, API v1 (auth, scope, batas laju, idempotensi, paginasi, CORS), antrean pesan
// keluar + anti-blokir, dan webhook ke aplikasi (tanda tangan, coba ulang).
// Yang asli: kode src/lib & route handler src/app/api/v1/**, PostgreSQL 15 (sementara). Yang tiruan: server pusat,
// soket WhatsApp, server AI kompatibel OpenAI, server penerima webhook aplikasi.
// Pakai (dari akar proyek): node --import ./uji/loader.mjs uji/uji-mesin.mjs
import assert from "node:assert/strict";
import { createHmac, generateKeyPairSync, randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdirSync, rmSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { mulaiPg, portBebas } from "./pg-lokal.mjs";

const akar = process.cwd();
const tmp = path.join(os.tmpdir(), "wa-uji-mesin");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const pg = await mulaiPg({ dir: path.join(tmp, "pg"), sementara: true });

// ---------- pasangan kunci uji (pusat tiruan) ----------
const kunciUji = generateKeyPairSync("ed25519");
const PRIV = kunciUji.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
const kunciLain = generateKeyPairSync("ed25519");
const PRIV_PALSU = kunciLain.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");

const portPusat = await portBebas();
const portMesin = await portBebas();
const portAi = await portBebas();
const portWh = await portBebas();
Object.assign(process.env, {
  DATABASE_URL: pg.url,
  DATA_DIR: path.join(tmp, "data-kosong"),
  AUTH_SECRET: "x".repeat(40),
  MODE: "mesin",
  VERSI_APLIKASI: "1.0.0", // rolling release: dibandingkan dengan info rilis di lisensi
  LISENSI_MODE_UJI: "1",
  LISENSI_KUNCI_PUBLIK: kunciUji.publicKey.export({ format: "der", type: "spki" }).toString("base64"),
  CHATGERCEP_PUSAT: `http://127.0.0.1:${portPusat}`,
  ALAMAT_PUBLIK: `http://127.0.0.1:${portMesin}`,
  RAHASIA_MESIN: randomBytes(24).toString("hex"),
  ADMIN_EMAIL: "pemilik@mesin.test",
  ADMIN_PASSWORD: "rahasia-mesin-01",
  API_BATAS_PER_DETIK: "200",
  ANTREAN_JEDA_MS: "5",
  AI_PENYEDIA: "openai",
  AI_API_KEY: "uji",
  AI_MODEL: "model-uji",
  AI_API_URL: `http://127.0.0.1:${portAi}/v1`,
  WA_SKALA_WAKTU: process.env.WA_SKALA_WAKTU ?? "0.2",
  ML_PELUANG_AUDIT: "0",
});
const lib = (f) => import(pathToFileURL(path.join(akar, f)).href);
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
const kini = () => Math.floor(Date.now() / 1000);
async function tunggu(fn, ms = 5000, apa = "") {
  const t = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t > ms) throw new Error(`habis waktu menunggu ${apa}`);
    await tidur(20);
  }
}

const B = await lib("node_modules/baileys/lib/index.js");
const { db } = await lib("src/lib/db.ts");
const wa = await lib("src/lib/wa.ts");
await lib("src/lib/bridge.ts"); // penerima event WhatsApp (gerbang AI)
const { tambahNomor, nomorById } = await lib("src/lib/numbers.ts");
const { tambahDokumen } = await lib("src/lib/knowledge.ts");
const L = await lib("src/lib/lisensi-def.ts");
const ML = await lib("src/lib/mesin/lisensi.ts");
const MA = await lib("src/lib/mesin/api.ts");
const AN = await lib("src/lib/mesin/antrean.ts");
const WH = await lib("src/lib/mesin/webhook.ts");
const { dengar } = await lib("src/lib/peristiwa.ts");
const rute = {
  webhookLisensi: await lib("src/app/api/lisensi/webhook/route.ts"),
  status: await lib("src/app/api/v1/status/route.ts"),
  nomor: await lib("src/app/api/v1/nomor/route.ts"),
  nomorId: await lib("src/app/api/v1/nomor/[id]/route.ts"),
  qr: await lib("src/app/api/v1/nomor/[id]/qr/route.ts"),
  sesi: await lib("src/app/api/v1/nomor/[id]/sesi/route.ts"),
  knowledge: await lib("src/app/api/v1/nomor/[id]/knowledge/route.ts"),
  dok: await lib("src/app/api/v1/nomor/[id]/knowledge/[dok]/route.ts"),
  pesan: await lib("src/app/api/v1/pesan/route.ts"),
  pesanId: await lib("src/app/api/v1/pesan/[id]/route.ts"),
  webhook: await lib("src/app/api/v1/webhook/route.ts"),
  webhookUji: await lib("src/app/api/v1/webhook/uji/route.ts"),
  ai: await lib("src/app/api/v1/ai/jawab/route.ts"),
  kontakCek: await lib("src/app/api/v1/kontak/cek/route.ts"),
  profil: await lib("src/app/api/v1/nomor/[id]/profil/route.ts"),
  bot: await lib("src/app/api/v1/nomor/[id]/bot/route.ts"),
  pelajaran: await lib("src/app/api/v1/nomor/[id]/pelajaran/route.ts"),
  pelajaranId: await lib("src/app/api/v1/nomor/[id]/pelajaran/[pid]/route.ts"),
  produk: await lib("src/app/api/v1/nomor/[id]/produk/route.ts"),
  produkId: await lib("src/app/api/v1/nomor/[id]/produk/[pid]/route.ts"),
  statistik: await lib("src/app/api/v1/nomor/[id]/statistik/route.ts"),
  rapikan: await lib("src/app/api/v1/ai/rapikan/route.ts"),
  transkripsi: await lib("src/app/api/v1/ai/transkripsi/route.ts"),
  templat: await lib("src/app/api/v1/templat-ai/route.ts"),
  templatSlug: await lib("src/app/api/v1/templat-ai/[slug]/route.ts"),
  cekSpam: await lib("src/app/api/v1/alat/cek-spam/route.ts"),
};
const sql = await db();

// ---------- soket WhatsApp tiruan (pola uji-alur) ----------
const soket = [];
function buatSoket(config) {
  const ev = new EventEmitter();
  const s = {
    config,
    ev,
    ws: new EventEmitter(),
    terkirim: [],
    keluar: 0,
    ditutup: 0,
    get user() {
      return config.auth.creds.me;
    },
    signalRepository: { lidMapping: { getLIDForPN: async () => null, storeLIDPNMappings: async () => {} } },
    async sendMessageAck() {},
    async cleanDirtyBits() {},
    async sendMessage(jid, isi, opsi) {
      s.terkirim.push({ jid, isi, id: opsi.messageId });
      return { key: { id: opsi.messageId } };
    },
    async readMessages() {},
    async onWhatsApp(...jid) {
      s.dicek = (s.dicek ?? 0) + jid.length;
      return jid.map((j) => ({ jid: j, exists: !j.startsWith("62899") }));
    },
    async profilePictureUrl(jid) {
      return `https://pps.whatsapp.net/uji/${jid.split("@")[0]}.jpg`;
    },
    async sendPresenceUpdate() {},
    async resyncAppState() {},
    async logout() {
      s.keluar += 1;
    },
    async end() {
      s.ditutup += 1;
    },
    pancar(nama, data) {
      if (nama === "creds.update") Object.assign(config.auth.creds, data);
      ev.emit(nama, data);
    },
    tutup(kode) {
      ev.emit("connection.update", { connection: "close", lastDisconnect: { error: { output: { statusCode: kode } }, date: new Date() } });
    },
  };
  soket.push(s);
  return s;
}
globalThis.__waGerbang.lib = Promise.resolve({ ...B, makeWASocket: buatSoket, fetchLatestWaWebVersion: async () => ({ version: [2, 3000, 999], isLatest: true }) });

async function nomorTerhubung(label, waId) {
  const n = await tambahNomor(label);
  await sql`UPDATE numbers SET tunggu_detik = 1, tunggu_baca_detik = 3, saring_prospek = false, saring_spam = false WHERE id = ${n.id}`;
  globalThis.__waNomor.janji = null;
  const awal = soket.length;
  const p = wa.hubungkan(n.sesi);
  const s1 = await tunggu(() => soket[awal], 3000, "soket pertama");
  s1.pancar("connection.update", { qr: `2@ref-${label},aaa,bbb,ccc,1` });
  await p;
  s1.pancar("creds.update", { me: { id: `${waId}:5@s.whatsapp.net`, name: label } });
  s1.tutup(515);
  const s2 = await tunggu(() => soket[awal + 1], 3000, "soket setelah mulai ulang");
  s2.pancar("connection.update", { connection: "open" });
  await tunggu(async () => (await nomorById(n.id))?.wa_id === waId, 3000, "wa_id tercatat");
  return { n, s: s2 };
}

// ---------- server AI tiruan (kompatibel OpenAI) ----------
let aiDipanggil = 0;
let aiRapikan = null;
const serverAi = http.createServer((req, res) => {
  let b = "";
  req.on("data", (c) => (b += c));
  req.on("end", () => {
    aiDipanggil += 1;
    res.setHeader("content-type", "application/json");
    if (req.url.endsWith("/models")) return res.end(JSON.stringify({ data: [] }));
    if (b.includes("Catatan pemilik usaha")) {
      aiRapikan = JSON.parse(b);
      return res.end(JSON.stringify({ model: "model-uji", choices: [{ message: { content: "<knowledge>\n# PRODUK & HARGA\n- Ayam geprek: Rp15.000\n</knowledge>\n<kurang>\n- Cara bayar apa saja?\n</kurang>" } }], usage: { prompt_tokens: 300, completion_tokens: 40 } }));
    }
    res.end(JSON.stringify({ model: "model-uji", choices: [{ message: { content: "Toko kami buka pukul 09.00 sampai 21.00 kak." } }], usage: { prompt_tokens: 120, completion_tokens: 12 } }));
  });
});
await new Promise((r) => serverAi.listen(portAi, "127.0.0.1", r));

// ---------- adaptor HTTP mesin: hanya route webhook lisensi (pusat tiruan mengirim tantangan & lisensi ke sini) ----------
const serverMesin = http.createServer(async (req, res) => {
  let b = "";
  for await (const c of req) b += c;
  const r = await rute.webhookLisensi.POST(new Request(`http://127.0.0.1:${portMesin}${req.url}`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` }, body: b }));
  res.writeHead(r.status, { "content-type": "application/json" });
  res.end(await r.text());
});
await new Promise((r) => serverMesin.listen(portMesin, "127.0.0.1", r));

// ---------- pusat tiruan ----------
const K1 = L.buatKunciApi(); // key utama
const K2 = L.buatKunciApi(); // key kedua (uji batas laju terpisah)
const pusat = {
  versi: 0,
  status: "aktif",
  fitur: ["nomor", "pesan.kirim", "pesan.terima", "knowledge", "bot"],
  batas: { nomor: 50, pesan_menit: 20, kontak_baru_hari: 2, instalasi: 1 },
  instalasi: new Map(), // id -> alamat
  tantangan: [],
  berlaku: 7 * 86400,
};
function tokenPusat(id, ubah = {}, priv = PRIV) {
  pusat.versi += 1;
  return L.tandatanganiLisensi(
    {
      v: 1,
      versi_urut: pusat.versi,
      aplikasi_id: 1,
      nama_aplikasi: "Aplikasi Uji",
      id_instalasi: id,
      status: pusat.status,
      fitur: pusat.fitur,
      batas: pusat.batas,
      biaya: "gratis",
      dibayar_sampai: null,
      kunci: [K1, K2].map((k) => ({ awalan: k.awalan, hash: k.hash, sampai: null })),
      diterbitkan: kini(),
      berlaku_sampai: kini() + pusat.berlaku,
      ...ubah,
    },
    priv,
  );
}
const serverPusat = http.createServer(async (req, res) => {
  let b = "";
  for await (const c of req) b += c;
  const isi = JSON.parse(b || "{}");
  const jawab = (status, x) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(x));
  };
  if (isi.key !== K1.key && isi.key !== K2.key) return jawab(401, { galat: { kode: "key_tidak_sah", pesan: "key salah" } });
  if (req.url === "/api/lisensi/aktivasi") {
    const nonce = randomBytes(24).toString("base64url");
    const r = await fetch(`${isi.alamat}/api/lisensi/webhook`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jenis: "tantangan", nonce, id_instalasi: isi.id_instalasi }) });
    const j = await r.json().catch(() => null);
    const benar = j?.jawaban === L.jawabTantangan(isi.key, nonce);
    pusat.tantangan.push({ ok: r.ok, benar });
    if (!benar) return jawab(422, { galat: { kode: "tantangan_gagal", pesan: "jawaban tantangan salah" } });
    pusat.instalasi.set(isi.id_instalasi, isi.alamat);
    return jawab(200, { lisensi: tokenPusat(isi.id_instalasi) });
  }
  if (req.url === "/api/lisensi/kondisi") {
    if (!pusat.instalasi.has(isi.id_instalasi)) return jawab(404, { galat: { kode: "tidak_ditemukan", pesan: "instalasi tidak dikenal" } });
    return jawab(200, { lisensi: tokenPusat(isi.id_instalasi) });
  }
  jawab(404, {});
});
await new Promise((r) => serverPusat.listen(portPusat, "127.0.0.1", r));

/** Pusat mengirim lisensi lewat webhook ke mesin (lewat HTTP sungguhan ke adaptor). */
async function kirimLisensi(token) {
  const r = await fetch(`http://127.0.0.1:${portMesin}/api/lisensi/webhook`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jenis: "lisensi", lisensi: token }) });
  return { status: r.status, json: await r.json() };
}

// ---------- penerima webhook aplikasi tiruan ----------
const diterimaWh = [];
let whGagal = false;
const serverWh = http.createServer(async (req, res) => {
  let b = "";
  for await (const c of req) b += c;
  diterimaWh.push({ tanda: req.headers["x-cg-tanda"], body: b });
  res.writeHead(whGagal ? 500 : 200);
  res.end("ok");
});
await new Promise((r) => serverWh.listen(portWh, "127.0.0.1", r));

// ---------- alat bantu ----------
let lolos = 0;
const gagalList = [];
async function cek(nama, fn) {
  const t0 = performance.now();
  try {
    await fn();
    lolos += 1;
    console.log(`  ok    ${nama} (${((performance.now() - t0) / 1000).toFixed(1)} dtk)`);
  } catch (e) {
    gagalList.push(nama);
    console.log(`  GAGAL ${nama}\n        ${String(e?.stack ?? e).split("\n").slice(0, 6).join("\n        ")}`);
  }
}
const bagian = (j) => console.log(`\n== ${j} ==`);
const ctx = (p) => ({ params: Promise.resolve(p) });
function minta(jalur, { metode = "GET", key = K1.key, body, kepala = {} } = {}) {
  const h = { ...kepala };
  if (key) h.authorization = `Bearer ${key}`;
  if (body !== undefined && !(body instanceof FormData)) h["content-type"] = "application/json";
  return new Request(`http://127.0.0.1/api/v1${jalur}`, { method: metode, headers: h, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
}
const json = async (r) => ({ status: r.status, h: r.headers, j: await r.json() });
/** Satu putaran kirim webhook yang pasti berjalan (menunggu putaran lain yang sedang jalan selesai dulu). */
async function kirimWh() {
  await WH.tulisBuffer();
  while (globalThis.__waMesinWebhook.jalan) await tidur(5);
  await WH.putaranKirim();
}
// Pekerja mesin seperti di instrumentation (tanpa sinkron lisensi otomatis: lisensi diatur uji).
WH.mulaiWebhookMesin();
AN.mulaiAntreanMesin();

// =====================================================================================
bagian("A. Lisensi: aktivasi + tantangan");
const peristiwa = [];
dengar((p) => void peristiwa.push(p));

await cek("tanpa lisensi: mode terbatas, alasan jelas; id_instalasi UUID dibuat sekali", async () => {
  await ML.muatLisensi();
  const id = await ML.idInstalasi();
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.equal(ML.layananBoleh(), false);
  assert.equal(ML.alasanTerbatas().kode, "lisensi_kedaluwarsa");
  const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM mesin_lisensi`;
  assert.equal(n, 1);
});

process.env.CHATGERCEP_KEY = K1.key;
await cek("aktivasi: pusat mengirim tantangan ke alamat mesin, jawaban HMAC benar, lisensi tersimpan & layanan aktif", async () => {
  await ML.sinkronSekali();
  assert.deepEqual(pusat.tantangan, [{ ok: true, benar: true }]);
  assert.equal(ML.layananBoleh(), true);
  assert.equal(ML.lisensiSekarang().nama_aplikasi, "Aplikasi Uji");
  const [r] = await sql`SELECT versi_urut, lisensi IS NOT NULL AS ada FROM mesin_lisensi`;
  assert.equal(r.versi_urut, pusat.versi);
  assert.equal(r.ada, true);
});

await cek("menyala ulang: lisensi tersimpan langsung dipakai (pusat mati pun tetap melayani); sinkron berikutnya = kondisi", async () => {
  ML.aturUlangLisensiUji();
  process.env.CHATGERCEP_PUSAT = `http://127.0.0.1:${await portBebas()}`; // pusat tak terjangkau
  await ML.muatLisensi();
  assert.equal(ML.layananBoleh(), true);
  await assert.rejects(ML.sinkronSekali(), /tidak terjangkau/);
  assert.equal(ML.layananBoleh(), true);
  process.env.CHATGERCEP_PUSAT = `http://127.0.0.1:${portPusat}`;
  const sebelum = pusat.tantangan.length;
  await ML.sinkronSekali();
  assert.equal(pusat.tantangan.length, sebelum); // kondisi, bukan aktivasi ulang
});

await cek("pusat tidak mengenal instalasi (dilepas): kondisi 404 -> aktivasi ulang otomatis", async () => {
  pusat.instalasi.clear();
  const sebelum = pusat.tantangan.length;
  await ML.sinkronSekali();
  assert.equal(pusat.tantangan.length, sebelum + 1);
  assert.equal(ML.layananBoleh(), true);
});

await cek("jeda coba ulang sinkron awal: 10 dtk, berlipat, maks 15 menit (bukan polling)", () => {
  assert.deepEqual([1, 2, 3, 8, 20].map(ML.jedaUlangSinkron), [10_000, 20_000, 40_000, 900_000, 900_000]);
});

bagian("B. Webhook lisensi dari pusat");
const idMesin = await ML.idInstalasi();
await cek("lisensi baru (versi naik) diterima; jawaban berisi versi_urut_diterima, versi_mesin, jumlah_nomor", async () => {
  const r = await kirimLisensi(tokenPusat(idMesin));
  assert.equal(r.status, 200);
  assert.equal(r.json.versi_urut_diterima, pusat.versi);
  assert.equal(typeof r.json.versi_mesin, "string");
  assert.equal(typeof r.json.jumlah_nomor, "number");
});

await cek("versi_urut lama diabaikan (kiriman terlambat tidak menimpa yang baru)", async () => {
  const lama = tokenPusat(idMesin);
  const baru = tokenPusat(idMesin, { batas: { ...pusat.batas, nomor: 7 } });
  await kirimLisensi(baru);
  const r = await kirimLisensi(lama);
  assert.equal(r.status, 200);
  assert.equal(r.json.versi_urut_diterima, pusat.versi);
  assert.equal(ML.lisensiSekarang().batas.nomor, 7);
});

await cek("tanda tangan palsu & instalasi lain ditolak (422), lisensi tetap", async () => {
  const v = ML.lisensiSekarang().versi_urut;
  const palsu = await kirimLisensi(tokenPusat(idMesin, {}, PRIV_PALSU));
  assert.equal(palsu.status, 422);
  const lain = await kirimLisensi(tokenPusat("00000000-0000-4000-8000-000000000000"));
  assert.equal(lain.status, 422);
  const rusak = await kirimLisensi("bukan.token");
  assert.equal(rusak.status, 422);
  assert.equal(ML.lisensiSekarang().versi_urut, v);
});

await cek("pemilik mesin memasang kunci publiknya sendiri di .env (image produksi): lisensi buatannya tetap ditolak", async () => {
  // Image produksi: LISENSI_MODE_UJI tertanam kosong saat build, apa pun isi .env. Di sini disimulasikan dengan
  // menghapusnya, lalu .env "pemilik" menunjuk ke kunci publik miliknya sendiri, dan NODE_ENV diubah ke development.
  const simpan = { mode: process.env.LISENSI_MODE_UJI, pub: process.env.LISENSI_KUNCI_PUBLIK, env: process.env.NODE_ENV };
  try {
    delete process.env.LISENSI_MODE_UJI;
    process.env.LISENSI_KUNCI_PUBLIK = kunciLain.publicKey.export({ format: "der", type: "spki" }).toString("base64");
    process.env.NODE_ENV = "development";
    const v = ML.lisensiSekarang().versi_urut;
    const buatan = await kirimLisensi(tokenPusat(idMesin, { fitur: ["nomor", "pesan.kirim", "pesan.terima", "ai", "knowledge"] }, PRIV_PALSU));
    assert.equal(buatan.status, 422);
    assert.equal(ML.lisensiSekarang().versi_urut, v);
  } finally {
    process.env.LISENSI_MODE_UJI = simpan.mode;
    process.env.LISENSI_KUNCI_PUBLIK = simpan.pub;
    if (simpan.env === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = simpan.env;
  }
});

await cek("tantangan untuk id_instalasi lain ditolak (404)", async () => {
  const r = await fetch(`http://127.0.0.1:${portMesin}/api/lisensi/webhook`, { method: "POST", body: JSON.stringify({ jenis: "tantangan", nonce: "x".repeat(20), id_instalasi: "00000000-0000-4000-8000-000000000000" }) });
  assert.equal(r.status, 404);
});

bagian("C. Mode terbatas tidak memutus WhatsApp");
const { n: N1, s: S1 } = await nomorTerhubung("Toko Mesin", "628111000111");
await tambahDokumen({ numberId: N1.id, judul: "Info", sumber: "teks", teks: "Toko Mesin buka pukul 09.00 sampai 21.00 setiap hari. Alamat Jalan Uji 1." });
const pelanggan = "628222000222@s.whatsapp.net";
let urutPesan = 0;
const pesanMasuk = (s, teks) =>
  s.pancar("messages.upsert", { type: "notify", messages: [{ key: { remoteJid: pelanggan, id: `MSN${++urutPesan}`, fromMe: false }, messageTimestamp: kini(), pushName: "Budi", message: { conversation: teks } }] });

await cek("layanan aktif: bot menjawab lewat AI kompatibel OpenAI (kontrol positif)", async () => {
  const awal = S1.terkirim.length;
  pesanMasuk(S1, "jam buka?");
  await tunggu(() => S1.terkirim.length > awal, 8000, "balasan bot");
  assert.match(S1.terkirim.at(-1).isi.text, /09\.00/);
});

await cek("lisensi kedaluwarsa / ditangguhkan: bot diam, API ditolak, TIDAK ada logout/tutup soket/terputus", async () => {
  await kirimLisensi(tokenPusat(idMesin, { berlaku_sampai: kini() - 1 }));
  assert.equal(ML.layananBoleh(), false);
  const awal = S1.terkirim.length;
  const aiAwal = aiDipanggil;
  pesanMasuk(S1, "masih buka?");
  await tidur(2500);
  assert.equal(S1.terkirim.length, awal);
  assert.equal(aiDipanggil, aiAwal);
  const r = await json(await rute.nomor.GET(minta("/nomor")));
  assert.equal(r.status, 402);
  assert.equal(r.j.galat.kode, "lisensi_kedaluwarsa");
  pusat.status = "ditangguhkan";
  await kirimLisensi(tokenPusat(idMesin));
  const r2 = await json(await rute.nomor.GET(minta("/nomor")));
  assert.equal(r2.status, 403);
  assert.equal(r2.j.galat.kode, "aplikasi_ditangguhkan");
  // /status tetap menjawab supaya developer tahu sebabnya.
  const st = await json(await rute.status.GET(minta("/status")));
  assert.equal(st.status, 200);
  assert.equal(st.j.lisensi.status, "ditangguhkan");
  assert.equal(S1.keluar, 0);
  assert.equal(S1.ditutup, 0);
  assert.equal(wa.infoSesi(N1.sesi).status, "WORKING");
  assert.equal(peristiwa.filter((p) => p.jenis === "nomor.terputus").length, 0);
  const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM wa_auth WHERE sesi = ${N1.sesi}`;
  assert.ok(n > 0);
  pusat.status = "aktif";
  await kirimLisensi(tokenPusat(idMesin));
  assert.equal(ML.layananBoleh(), true);
});

await cek("peringatan lisensi (sisa < 24 jam) dipancarkan sekali", async () => {
  await kirimLisensi(tokenPusat(idMesin, { berlaku_sampai: kini() + 20 * 3600 }));
  const awal = peristiwa.filter((p) => p.jenis === "lisensi.peringatan").length;
  ML.periksaPeringatan();
  ML.periksaPeringatan();
  assert.equal(peristiwa.filter((p) => p.jenis === "lisensi.peringatan").length, awal + 1);
  await kirimLisensi(tokenPusat(idMesin));
});

await cek("rolling release: versi baru = peringatan di /status & header X-CG-Update; wajib lewat tenggat = 426, WhatsApp tetap tersambung", async () => {
  const rilis = (r) => ({ rilis: { terbaru: null, minimal: null, wajib_sampai: null, catatan: null, ...r } });
  // 1. Ada versi baru: dilayani normal + peringatan.
  await kirimLisensi(tokenPusat(idMesin, rilis({ terbaru: "1.0.3", catatan: "Perbaikan antrean" })));
  const s1 = await json(await rute.status.GET(minta("/status")));
  assert.equal(s1.j.update.tersedia, true);
  assert.equal(s1.j.update.versi_kini, "1.0.0");
  assert.equal(s1.j.update.versi_terbaru, "1.0.3");
  assert.equal(s1.j.update.wajib, false);
  assert.equal(s1.j.update.perintah, "docker compose pull && docker compose up -d");
  assert.equal(s1.j.update.catatan, "Perbaikan antrean");
  const n1 = await json(await rute.nomor.GET(minta("/nomor")));
  assert.equal(n1.status, 200);
  assert.equal(n1.h.get("x-cg-update"), "1.0.3");
  assert.equal(n1.h.get("x-cg-update-wajib"), null);
  // 2. Wajib, tenggat belum lewat: masih dilayani, header wajib berisi tenggat.
  const tenggat = kini() + 3600;
  await kirimLisensi(tokenPusat(idMesin, rilis({ terbaru: "1.0.3", minimal: "1.0.2", wajib_sampai: tenggat })));
  const n2 = await json(await rute.nomor.GET(minta("/nomor")));
  assert.equal(n2.status, 200);
  assert.equal(n2.h.get("x-cg-update-wajib"), new Date(tenggat * 1000).toISOString());
  // 3. Tenggat lewat: 426 update_wajib, /status tetap menjawab, WhatsApp tidak diputus.
  await kirimLisensi(tokenPusat(idMesin, rilis({ terbaru: "1.0.3", minimal: "1.0.2", wajib_sampai: kini() - 1 })));
  const n3 = await json(await rute.nomor.GET(minta("/nomor")));
  assert.equal(n3.status, 426);
  assert.equal(n3.j.galat.kode, "update_wajib");
  assert.match(n3.j.galat.pesan, /docker compose pull/);
  const s3 = await json(await rute.status.GET(minta("/status")));
  assert.equal(s3.status, 200);
  assert.equal(s3.j.update.terblokir, true);
  assert.equal(wa.infoSesi(N1.sesi).status, "WORKING");
  assert.equal(S1.ditutup, 0);
  // 4. Mesin sudah versi terbaru: tanpa peringatan sama sekali.
  await kirimLisensi(tokenPusat(idMesin, rilis({ terbaru: "1.0.0", minimal: "1.0.0" })));
  const n4 = await json(await rute.nomor.GET(minta("/nomor")));
  assert.equal(n4.status, 200);
  assert.equal(n4.h.get("x-cg-update"), null);
  assert.equal((await json(await rute.status.GET(minta("/status")))).j.update.tersedia, false);
});

bagian("D. API v1: autentikasi, scope, batas laju, idempotensi, paginasi");
await cek("tanpa key / key salah / key dari browser (CORS) = 401; key sah = 200 + header batas laju", async () => {
  assert.equal((await rute.status.GET(minta("/status", { key: null }))).status, 401);
  assert.equal((await rute.status.GET(minta("/status", { key: L.buatKunciApi().key }))).status, 401);
  const cors = await json(await rute.status.GET(minta("/status", { kepala: { origin: "https://situs-lain.test" } })));
  assert.equal(cors.status, 401);
  assert.match(cors.j.galat.pesan, /browser/);
  const r = await json(await rute.status.GET(minta("/status")));
  assert.equal(r.status, 200);
  assert.equal(r.j.lisensi.status, "aktif");
  assert.deepEqual(r.j.nomor, { total: 1, terhubung: 1 });
  assert.equal(r.h.get("x-ratelimit-limit"), "200");
  assert.ok(r.h.get("x-request-id").startsWith("req_"));
});

await cek("scope belum dibuka: 403 fitur_tidak_dibuka (ai tidak ada di lisensi)", async () => {
  const r = await json(await rute.ai.POST(minta("/ai/jawab", { metode: "POST", body: { nomor_id: N1.id, pertanyaan: "halo" } })));
  assert.equal(r.status, 403);
  assert.equal(r.j.galat.kode, "fitur_tidak_dibuka");
  assert.ok(r.j.galat.id_permintaan);
});

await cek("ai dibuka: POST /ai/jawab -> {jawaban, ms, token}", async () => {
  pusat.fitur = [...pusat.fitur, "ai"];
  await kirimLisensi(tokenPusat(idMesin));
  const r = await json(await rute.ai.POST(minta("/ai/jawab", { metode: "POST", body: { nomor_id: String(N1.id), pertanyaan: "jam buka?" } })));
  assert.equal(r.status, 200, JSON.stringify(r.j));
  assert.match(r.j.jawaban, /09\.00/);
  assert.deepEqual(r.j.token, { masuk: 120, keluar: 12 });
});

await cek("batas laju per key: lewat batas = 429 + Retry-After; key lain tidak terpengaruh", async () => {
  let r429;
  for (let i = 0; i < 230 && !r429; i++) {
    const r = await rute.status.GET(minta("/status", { key: K2.key }));
    if (r.status === 429) r429 = r;
  }
  assert.ok(r429, "tidak pernah 429");
  assert.equal((await r429.json()).galat.kode, "terlalu_sering");
  assert.ok(Number(r429.headers.get("retry-after")) >= 1);
  assert.equal(r429.headers.get("x-ratelimit-remaining"), "0");
  assert.equal((await rute.status.GET(minta("/status"))).status, 200);
});

await cek("nomor: POST (201, sesi dinyalakan), GET, PATCH (validasi), paginasi kursor", async () => {
  const awalSoket = soket.length;
  const b = await json(await rute.nomor.POST(minta("/nomor", { metode: "POST", body: { label: "Cabang 2" } })));
  assert.equal(b.status, 201);
  assert.equal(typeof b.j.id, "string");
  await tunggu(() => soket.length > awalSoket, 3000, "soket nomor baru");
  const c = await json(await rute.nomor.POST(minta("/nomor", { metode: "POST", body: { label: "Cabang 3" } })));
  const hal1 = await json(await rute.nomor.GET(minta("/nomor?batas=2")));
  assert.equal(hal1.j.data.length, 2);
  assert.equal(hal1.j.berikutnya, hal1.j.data[1].id);
  const hal2 = await json(await rute.nomor.GET(minta(`/nomor?batas=2&setelah=${hal1.j.berikutnya}`)));
  assert.deepEqual(hal2.j.data.map((x) => x.id), [c.j.id]);
  assert.equal(hal2.j.berikutnya, null);
  const satu = await json(await rute.nomorId.GET(minta(`/nomor/${N1.id}`), ctx({ id: String(N1.id) })));
  assert.equal(satu.j.status, "terhubung");
  assert.equal(satu.j.wa_id, "628111000111");
  const salah = await json(await rute.nomorId.PATCH(minta(`/nomor/${b.j.id}`, { metode: "PATCH", body: { tunggu_detik: 999 } }), ctx({ id: b.j.id })));
  assert.equal(salah.status, 400);
  const ubah = await json(await rute.nomorId.PATCH(minta(`/nomor/${b.j.id}`, { metode: "PATCH", body: { label: "Cabang Dua", bot_aktif: false, jeda_detik: 60 } }), ctx({ id: b.j.id })));
  assert.equal(ubah.j.label, "Cabang Dua");
  assert.equal(ubah.j.bot_aktif, false);
  assert.equal(ubah.j.jeda_detik, 60);
  assert.equal((await rute.nomorId.GET(minta("/nomor/99999"), ctx({ id: "99999" }))).status, 404);
  const qr = await json(await rute.qr.GET(minta(`/nomor/${b.j.id}/qr`), ctx({ id: b.j.id })));
  assert.equal(qr.status, 200);
  const del = await json(await rute.nomorId.DELETE(minta(`/nomor/${c.j.id}`, { metode: "DELETE" }), ctx({ id: c.j.id })));
  assert.deepEqual(del.j, { ok: true });
});

await cek("QR: teks + PNG base64 sah saat menunggu pindai", async () => {
  const n = await tambahNomor("Cabang QR");
  globalThis.__waNomor.janji = null;
  const awal = soket.length;
  const p = rute.qr.GET(minta(`/nomor/${n.id}/qr`), ctx({ id: String(n.id) }));
  const s = await tunggu(() => soket[awal], 3000, "soket QR");
  s.pancar("connection.update", { qr: "2@qr-uji,aaa,bbb,ccc,1" });
  const r = await json(await p);
  assert.equal(r.j.status, "menunggu_qr");
  assert.equal(r.j.qr, "2@qr-uji,aaa,bbb,ccc,1");
  const png = Buffer.from(r.j.png_base64, "base64");
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  assert.ok(r.j.kedaluwarsa_dalam_detik > 0 && r.j.kedaluwarsa_dalam_detik <= 20);
  await rute.nomorId.DELETE(minta(`/nomor/${n.id}`, { metode: "DELETE" }), ctx({ id: String(n.id) }));
});

await cek("batas nomor dari lisensi: POST /nomor = 403 batas_nomor", async () => {
  pusat.batas = { ...pusat.batas, nomor: 2 };
  await kirimLisensi(tokenPusat(idMesin));
  const r = await json(await rute.nomor.POST(minta("/nomor", { metode: "POST", body: { label: "Kelebihan" } })));
  assert.equal(r.status, 403);
  assert.equal(r.j.galat.kode, "batas_nomor");
  pusat.batas = { ...pusat.batas, nomor: 50 };
  await kirimLisensi(tokenPusat(idMesin));
});

await cek("knowledge: POST JSON & multipart, GET daftar & isi, DELETE", async () => {
  const id = String(N1.id);
  const t = await json(await rute.knowledge.POST(minta(`/nomor/${id}/knowledge`, { metode: "POST", body: { judul: "Promo", teks: "Promo bulan ini: diskon 10% untuk semua menu sampai akhir bulan." } }), ctx({ id })));
  assert.equal(t.status, 201);
  assert.equal(t.j.sumber, "teks");
  const f = new FormData();
  f.set("berkas", new File(["Menu: nasi goreng Rp20.000, mie goreng Rp18.000, es teh Rp5.000."], "menu.txt", { type: "text/plain" }));
  const m = await json(await rute.knowledge.POST(minta(`/nomor/${id}/knowledge`, { metode: "POST", body: f }), ctx({ id })));
  assert.equal(m.status, 201, JSON.stringify(m.j));
  assert.equal(m.j.judul, "menu");
  const daftar = await json(await rute.knowledge.GET(minta(`/nomor/${id}/knowledge`), ctx({ id })));
  assert.equal(daftar.j.data.length, 3);
  const isi = await json(await rute.dok.GET(minta(`/nomor/${id}/knowledge/${m.j.id}`), ctx({ id, dok: m.j.id })));
  assert.match(isi.j.teks, /nasi goreng/);
  assert.deepEqual((await json(await rute.dok.DELETE(minta(`/nomor/${id}/knowledge/${t.j.id}`, { metode: "DELETE" }), ctx({ id, dok: t.j.id })))).j, { ok: true });
  assert.equal((await rute.dok.GET(minta(`/nomor/${id}/knowledge/${t.j.id}`), ctx({ id, dok: t.j.id }))).status, 404);
});

bagian("D2. Fitur tambahan katalog (scope per fitur)");

const FITUR_BARU = ["kontak.cek", "profil", "bot", "templat", "ai.rapikan", "ai.transkripsi", "pelajaran", "katalog", "statistik", "spam.cek"];

await cek("fitur baru tertutup sampai dibuka lisensi: 403 fitur_tidak_dibuka", async () => {
  const id = String(N1.id);
  const r = [
    await rute.produk.GET(minta(`/nomor/${id}/produk`), ctx({ id })),
    await rute.cekSpam.POST(minta("/alat/cek-spam", { metode: "POST", body: { teks: "halo" } })),
    await rute.templat.GET(minta("/templat-ai")),
  ];
  for (const x of r) assert.equal((await json(x)).j.galat.kode, "fitur_tidak_dibuka");
  pusat.fitur = [...new Set([...pusat.fitur, ...FITUR_BARU])];
  await kirimLisensi(tokenPusat(idMesin));
});

await cek("spam / belajar / ml berdiri sendiri: lisensi baru tanpa fiturnya = sakelar 403 & nilai efektif false; lisensi lama dengan bot = tetap boleh", async () => {
  const id = String(N1.id);
  const dasar = pusat.fitur.filter((f) => f !== "spam" && f !== "belajar" && f !== "ml");
  // Lisensi dari pusat lama (tanpa fitur_v): bot masih mencakup ketiganya.
  await kirimLisensi(tokenPusat(idMesin, { fitur: dasar }));
  assert.deepEqual([ML.fiturBoleh("spam"), ML.fiturBoleh("belajar"), ML.fiturBoleh("ml")], [true, true, true]);
  // Lisensi baru: hanya belajar yang dibuka.
  await kirimLisensi(tokenPusat(idMesin, { fitur: [...dasar, "belajar"], fitur_v: 2 }));
  assert.deepEqual([ML.fiturBoleh("spam"), ML.fiturBoleh("belajar"), ML.fiturBoleh("ml")], [false, true, false]);
  const ditolak = await json(await rute.bot.PATCH(minta(`/nomor/${id}/bot`, { metode: "PATCH", body: { saring_spam: true } }), ctx({ id })));
  assert.equal(ditolak.status, 403);
  assert.equal(ditolak.j.galat.kode, "fitur_tidak_dibuka");
  assert.match(ditolak.j.galat.pesan, /spam/);
  const boleh = await json(await rute.bot.PATCH(minta(`/nomor/${id}/bot`, { metode: "PATCH", body: { belajar: true } }), ctx({ id })));
  assert.equal(boleh.status, 200);
  assert.equal(boleh.j.belajar, true);
  await sql`UPDATE numbers SET saring_spam = true, saring_prospek = true WHERE id = ${N1.id}`;
  globalThis.__waNomor.janji = null; // cache nomor dibaca ulang setelah SQL langsung
  const g = await json(await rute.bot.GET(minta(`/nomor/${id}/bot`), ctx({ id })));
  assert.equal(g.j.saring_spam, false); // tersimpan menyala, efektif mati
  assert.equal(g.j.saring_prospek, false);
  // Dibuka lagi: nilai tersimpan langsung berlaku tanpa diatur ulang.
  await kirimLisensi(tokenPusat(idMesin, { fitur: [...dasar, "spam", "belajar", "ml"], fitur_v: 2 }));
  const g2 = await json(await rute.bot.GET(minta(`/nomor/${id}/bot`), ctx({ id })));
  assert.equal(g2.j.saring_spam, true);
  assert.equal(g2.j.saring_prospek, true);
  await sql`UPDATE numbers SET saring_prospek = false WHERE id = ${N1.id}`;
  globalThis.__waNomor.janji = null;
  await kirimLisensi(tokenPusat(idMesin));
});

await cek("bot: GET & PATCH sebagian (sakelar saring/belajar, validasi angka & tipe)", async () => {
  const id = String(N1.id);
  const awal = await json(await rute.bot.GET(minta(`/nomor/${id}/bot`), ctx({ id })));
  assert.equal(awal.status, 200, JSON.stringify(awal.j));
  const u = await json(await rute.bot.PATCH(minta(`/nomor/${id}/bot`, { metode: "PATCH", body: { saring_spam: !awal.j.saring_spam, belajar: false, tunggu_detik: 9 } }), ctx({ id })));
  assert.equal(u.status, 200, JSON.stringify(u.j));
  assert.equal(u.j.saring_spam, !awal.j.saring_spam);
  assert.equal(u.j.belajar, false);
  assert.equal(u.j.tunggu_detik, 9);
  assert.equal(u.j.instruksi, awal.j.instruksi); // tidak dikirim = tetap
  assert.equal((await nomorById(N1.id)).saring_spam, !awal.j.saring_spam);
  for (const body of [{ bot_aktif: "ya" }, { tunggu_detik: 9999 }, { instruksi: 5 }]) {
    const s = await json(await rute.bot.PATCH(minta(`/nomor/${id}/bot`, { metode: "PATCH", body }), ctx({ id })));
    assert.equal(s.status, 400, JSON.stringify(body));
  }
});

await cek("katalog: POST (foto base64), GET daftar & ?foto=1, PATCH sebagian, hapus foto, DELETE", async () => {
  const id = String(N1.id);
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const p = await json(await rute.produk.POST(minta(`/nomor/${id}/produk`, { metode: "POST", body: { nama: "Paket Hemat", harga: 25000, foto_base64: png } }), ctx({ id })));
  assert.equal(p.status, 201, JSON.stringify(p.j));
  assert.equal(p.j.ada_foto, true);
  assert.equal(p.j.tersedia, true);
  const d = await json(await rute.produk.GET(minta(`/nomor/${id}/produk`), ctx({ id })));
  assert.equal(d.j.data.length, 1);
  assert.equal(d.j.data[0].foto_base64, undefined); // daftar tanpa data foto
  const pid = p.j.id;
  const f = await json(await rute.produkId.GET(minta(`/nomor/${id}/produk/${pid}?foto=1`), ctx({ id, pid })));
  assert.equal(f.j.foto_mime, "image/png");
  assert.equal(f.j.foto_base64, png);
  const u = await json(await rute.produkId.PATCH(minta(`/nomor/${id}/produk/${pid}`, { metode: "PATCH", body: { harga: 27000, tersedia: false, foto_base64: null } }), ctx({ id, pid })));
  assert.equal(u.status, 200, JSON.stringify(u.j));
  assert.deepEqual([u.j.nama, u.j.harga, u.j.tersedia, u.j.ada_foto], ["Paket Hemat", 27000, false, false]);
  for (const body of [{ nama: "" }, { harga: -1 }, { foto_base64: "bukan base64!" }]) {
    const s = await json(await rute.produkId.PATCH(minta(`/nomor/${id}/produk/${pid}`, { metode: "PATCH", body }), ctx({ id, pid })));
    assert.equal(s.status, 400, JSON.stringify(body));
  }
  assert.deepEqual((await json(await rute.produkId.DELETE(minta(`/nomor/${id}/produk/${pid}`, { metode: "DELETE" }), ctx({ id, pid })))).j, { ok: true });
  assert.equal((await rute.produkId.GET(minta(`/nomor/${id}/produk/${pid}`), ctx({ id, pid }))).status, 404);
});

await cek("pelajaran: daftar berkursor, hapus satu & semua; statistik harian terisi 0 untuk hari kosong", async () => {
  const id = String(N1.id);
  const sql = await db();
  await sql`INSERT INTO pelajaran (number_id, sidik, pertanyaan, jawaban, terakhir_pada)
            SELECT ${N1.id}, 'uji' || g, 'tanya ' || g, 'jawab ' || g, ${kini()} - g FROM generate_series(1, 25) g`;
  const h1 = await json(await rute.pelajaran.GET(minta(`/nomor/${id}/pelajaran`), ctx({ id })));
  assert.equal(h1.status, 200, JSON.stringify(h1.j));
  assert.equal(h1.j.total, 25);
  assert.equal(h1.j.data.length, 20);
  const h2 = await json(await rute.pelajaran.GET(minta(`/nomor/${id}/pelajaran?setelah=${h1.j.berikutnya}`), ctx({ id })));
  assert.equal(h2.j.data.length, 5);
  assert.equal(h2.j.berikutnya, null);
  const pid = h2.j.data[0].id;
  assert.equal((await rute.pelajaranId.DELETE(minta(`/nomor/${id}/pelajaran/${pid}`, { metode: "DELETE" }), ctx({ id, pid }))).status, 200);
  assert.equal((await rute.pelajaranId.DELETE(minta(`/nomor/${id}/pelajaran/${pid}`, { metode: "DELETE" }), ctx({ id, pid }))).status, 404);
  assert.equal((await json(await rute.pelajaran.DELETE(minta(`/nomor/${id}/pelajaran`, { metode: "DELETE" }), ctx({ id })))).j.dihapus, 24);
  const st = await json(await rute.statistik.GET(minta(`/nomor/${id}/statistik?hari=7`), ctx({ id })));
  assert.equal(st.status, 200, JSON.stringify(st.j));
  assert.equal(st.j.data.length, 7);
  assert.equal(st.j.total.masuk, st.j.data.reduce((a, d) => a + d.masuk, 0));
  assert.equal((await json(await rute.statistik.GET(minta(`/nomor/${id}/statistik?hari=999`), ctx({ id })))).j.data.length, 90);
});

await cek("kontak.cek (maks 20, nomor tak sah ditandai) & profil lewat soket WA; nomor belum terhubung = 409", async () => {
  const r = await json(await rute.kontakCek.POST(minta("/kontak/cek", { metode: "POST", body: { nomor_id: String(N1.id), nomor: ["081234567890", "6289912345678", "abc"] } })));
  assert.equal(r.status, 200, JSON.stringify(r.j));
  assert.deepEqual(r.j.data, [
    { nomor: "6281234567890", sah: true, terdaftar: true },
    { nomor: "6289912345678", sah: true, terdaftar: false },
    { nomor: "abc", sah: false, terdaftar: false },
  ]);
  assert.equal(soket.reduce((a, x) => a + (x.dicek ?? 0), 0), 2); // satu permintaan berisi 2 nomor sah
  const banyak = Array.from({ length: 21 }, (_, i) => `6281234567${String(i).padStart(3, "0")}`);
  assert.equal((await rute.kontakCek.POST(minta("/kontak/cek", { metode: "POST", body: { nomor_id: String(N1.id), nomor: banyak } }))).status, 400);
  const id = String(N1.id);
  const p = await json(await rute.profil.GET(minta(`/nomor/${id}/profil`), ctx({ id })));
  assert.equal(p.status, 200, JSON.stringify(p.j));
  assert.match(p.j.foto_url, /^https:\/\/pps\.whatsapp\.net\//);
  const baru = await tambahNomor("Belum tersambung", null);
  const b = String(baru.id);
  assert.equal((await json(await rute.profil.GET(minta(`/nomor/${b}/profil`), ctx({ id: b })))).j.galat.kode, "nomor_belum_terhubung");
  const k = await json(await rute.kontakCek.POST(minta("/kontak/cek", { metode: "POST", body: { nomor_id: b, nomor: ["081234567890"] } })));
  assert.equal(k.j.galat.kode, "nomor_belum_terhubung");
});

await cek("templat, cek spam, rapikan (penyedia mesin tanpa SOUL, token panjang), transkripsi tanpa STT_API_KEY = 503", async () => {
  const t = await json(await rute.templat.GET(minta("/templat-ai")));
  assert.ok(t.j.data.length >= 10);
  const slug = t.j.data[0].slug;
  const isi = await json(await rute.templatSlug.GET(minta(`/templat-ai/${slug}`), ctx({ slug })));
  assert.equal(isi.status, 200, JSON.stringify(isi.j));
  assert.ok(isi.j.teks.length > 200);
  assert.equal((await rute.templatSlug.GET(minta("/templat-ai/tidak-ada"), ctx({ slug: "tidak-ada" }))).status, 404);
  const sp = await json(await rute.cekSpam.POST(minta("/alat/cek-spam", { metode: "POST", body: { teks: "SLOT GACOR hari ini maxwin! Depo 10rb wd berapapun dibayar, daftar di link bio" } })));
  assert.equal(sp.j.spam, true, JSON.stringify(sp.j));
  assert.equal((await json(await rute.cekSpam.POST(minta("/alat/cek-spam", { metode: "POST", body: { teks: "Kak, ayam geprek masih ada?" } })))).j.spam, false);
  const r = await json(await rute.rapikan.POST(minta("/ai/rapikan", { metode: "POST", body: { teks: "jual ayam geprek 15rb, buka jam 10 sampai 21, antar area kota, bayar transfer" } })));
  assert.equal(r.status, 200, JSON.stringify(r.j));
  assert.match(r.j.teks, /Ayam geprek/);
  assert.deepEqual(r.j.kurang, ["Cara bayar apa saja?"]);
  assert.equal(aiRapikan.max_tokens, 6000);
  assert.doesNotMatch(aiRapikan.messages[0].content, /Kamu membalas chat WhatsApp atas nama/); // SOUL bot CS tidak ikut
  const s = await json(await rute.transkripsi.POST(minta("/ai/transkripsi", { metode: "POST", body: { audio_base64: "T2dnUw==", mime: "audio/ogg" } })));
  assert.equal(s.status, 503);
  assert.equal(s.j.galat.kode, "ai_tidak_tersedia");
});

bagian("E. Antrean pesan keluar + anti-blokir + idempotensi");
await cek("POST /pesan: 202 antre -> pekerja mengirim lewat WA -> terkirim (wa_id) -> centang biru = dibaca", async () => {
  const r = await json(await rute.pesan.POST(minta("/pesan", { metode: "POST", body: { nomor_id: N1.id, ke: "0822-2000-2222", teks: "Pesanan kakak siap diambil!" } })));
  assert.equal(r.status, 202);
  assert.deepEqual(Object.keys(r.j).sort(), ["id", "status"]);
  assert.equal(r.j.status, "antre");
  await tunggu(async () => (await AN.putaranAntrean(), (await AN.pesanById(Number(r.j.id))).status === "terkirim"), 5000, "terkirim");
  const p = await AN.pesanById(Number(r.j.id));
  const kirim = S1.terkirim.find((x) => x.isi.text === "Pesanan kakak siap diambil!");
  assert.equal(kirim.jid, "6282220002222@s.whatsapp.net");
  S1.pancar("messages.update", [{ key: { remoteJid: kirim.jid, id: kirim.id, fromMe: true }, update: { status: 4 } }]);
  await tunggu(async () => (await AN.pesanById(p.id)).status === "dibaca", 3000, "dibaca");
  const g = await json(await rute.pesanId.GET(minta(`/pesan/${r.j.id}`), ctx({ id: r.j.id })));
  assert.equal(g.j.status, "dibaca");
  assert.equal(g.j.ke, "6282220002222");
});

await cek("anti-blokir: kontak baru per hari dibatasi (lisensi: 2) -> 422; kontak lama tetap boleh", async () => {
  // 6282220002222 sudah dikirimi (kontak baru #1); 628222000222 pernah chat (bukan kontak baru).
  const a = await rute.pesan.POST(minta("/pesan", { metode: "POST", body: { nomor_id: N1.id, ke: "6283300000001", teks: "Halo" } }));
  assert.equal(a.status, 202);
  const b = await json(await rute.pesan.POST(minta("/pesan", { metode: "POST", body: { nomor_id: N1.id, ke: "6283300000002", teks: "Halo" } })));
  assert.equal(b.status, 422);
  assert.equal(b.j.galat.kode, "ditolak_anti_blokir");
  assert.equal((await rute.pesan.POST(minta("/pesan", { metode: "POST", body: { nomor_id: N1.id, ke: "628222000222", teks: "Halo lagi" } }))).status, 202);
  assert.equal((await rute.pesan.POST(minta("/pesan", { metode: "POST", body: { nomor_id: N1.id, ke: "6283300000001", teks: "Halo 2" } }))).status, 202);
});

await cek("validasi pesan: teks > 4096, gambar mime/base64 salah, ke salah = 400", async () => {
  const kirim = (body) => rute.pesan.POST(minta("/pesan", { metode: "POST", body: { nomor_id: N1.id, ...body } }));
  assert.equal((await kirim({ ke: "628222000222", teks: "x".repeat(4097) })).status, 400);
  assert.equal((await kirim({ ke: "628222000222", gambar: { base64: "AAAA", mime: "image/bmp" } })).status, 400);
  assert.equal((await kirim({ ke: "628222000222", gambar: { base64: "!!", mime: "image/png" } })).status, 400);
  assert.equal((await kirim({ ke: "12", teks: "a" })).status, 400);
  assert.equal((await kirim({ ke: "628222000222" })).status, 400);
});

await cek("batas pesan per menit per nomor ditegakkan pekerja (sisanya tetap antre)", async () => {
  AN.aturUlangAntreanUji();
  pusat.batas = { ...pusat.batas, pesan_menit: 3, kontak_baru_hari: 100 };
  await kirimLisensi(tokenPusat(idMesin));
  // Habiskan SEMUA antrean sisa uji sebelumnya (satu putaran hanya mengirim satu pesan per nomor). Kalau tersisa,
  // pesan sisa itu ikut memakai jatah 3/menit di bawah dan uji tampak gagal padahal batasnya bekerja benar.
  const sisaAntre = async () => (await sql`SELECT COUNT(*)::int AS n FROM pesan_keluar WHERE status = 'antre'`)[0].n;
  const tenggatSisa = Date.now() + 5000;
  while ((await sisaAntre()) > 0 && Date.now() < tenggatSisa) {
    AN.aturUlangAntreanUji();
    await AN.putaranAntrean();
    await tidur(15);
  }
  assert.equal(await sisaAntre(), 0);
  await tidur(20);
  AN.aturUlangAntreanUji();
  for (let i = 0; i < 5; i++) await rute.pesan.POST(minta("/pesan", { metode: "POST", body: { nomor_id: N1.id, ke: "628222000222", teks: `Massal ${i}` } }));
  // Putaran yang bertepatan dengan pekerja latar (st.jalan) dilewati, jadi tunggu berdasarkan hasil, bukan jumlah
  // putaran tetap: sampai 3 terkirim (maks 5 dtk), lalu beberapa putaran lagi untuk memastikan yang ke-4 tertahan.
  const massal = () => S1.terkirim.filter((x) => /^Massal/.test(x.isi.text ?? "")).length;
  const tenggat = Date.now() + 5000;
  while (massal() < 3 && Date.now() < tenggat) {
    await AN.putaranAntrean();
    await tidur(15);
  }
  for (let i = 0; i < 10; i++) {
    await AN.putaranAntrean();
    await tidur(15);
  }
  assert.equal(massal(), 3);
  const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM pesan_keluar WHERE status = 'antre'`;
  assert.equal(n, 2);
  pusat.batas = { ...pusat.batas, pesan_menit: 20, kontak_baru_hari: 2 };
  await kirimLisensi(tokenPusat(idMesin));
});

await cek("Idempotency-Key: ulang = jawaban sama tanpa pesan ganda; isi beda = 409", async () => {
  const body = { nomor_id: N1.id, ke: "628222000222", teks: "Sekali saja" };
  const kepala = { "idempotency-key": "pesanan-77" };
  const a = await json(await rute.pesan.POST(minta("/pesan", { metode: "POST", body, kepala })));
  const b = await rute.pesan.POST(minta("/pesan", { metode: "POST", body, kepala }));
  assert.equal(b.headers.get("idempotent-replayed"), "true");
  assert.deepEqual(await b.json(), a.j);
  const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM pesan_keluar WHERE isi->>'teks' = 'Sekali saja'`;
  assert.equal(n, 1);
  const c = await json(await rute.pesan.POST(minta("/pesan", { metode: "POST", body: { ...body, teks: "Beda" }, kepala })));
  assert.equal(c.status, 409);
  assert.equal(c.j.galat.kode, "bentrok_idempotensi");
  // Serentak dengan key sama: tetap satu pesan.
  const k2 = { "idempotency-key": "serentak-1" };
  await Promise.all([1, 2, 3].map(() => rute.pesan.POST(minta("/pesan", { metode: "POST", body: { ...body, teks: "Serentak" }, kepala: k2 }))));
  const [{ m }] = await sql`SELECT COUNT(*)::int AS m FROM pesan_keluar WHERE isi->>'teks' = 'Serentak'`;
  assert.equal(m, 1);
});

bagian("F. Webhook ke aplikasi");
let rahasiaWh;
await cek("PUT /webhook: rahasia tampil sekali & tersimpan terenkripsi; GET tanpa rahasia; event tak dikenal = 400", async () => {
  const salah = await rute.webhook.PUT(minta("/webhook", { metode: "PUT", body: { url: `http://127.0.0.1:${portWh}/wh`, event: ["pesan.aneh"] } }));
  assert.equal(salah.status, 400);
  const r = await json(await rute.webhook.PUT(minta("/webhook", { metode: "PUT", body: { url: `http://127.0.0.1:${portWh}/wh`, event: ["pesan.masuk", "pesan.status", "nomor.terputus"] } })));
  assert.equal(r.status, 200);
  assert.match(r.j.rahasia, /^whsec_/);
  rahasiaWh = r.j.rahasia;
  const [t] = await sql`SELECT rahasia FROM webhook_tujuan`;
  assert.ok(!t.rahasia.includes(rahasiaWh));
  assert.equal(WH.dekripsi(t.rahasia), rahasiaWh);
  const g = await json(await rute.webhook.GET(minta("/webhook")));
  assert.equal(g.j.rahasia, undefined);
  assert.deepEqual(g.j.event, ["pesan.masuk", "pesan.status", "nomor.terputus"]);
});

const sahTanda = (x) => {
  const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(x.tanda ?? "");
  return !!m && createHmac("sha256", rahasiaWh).update(`${m[1]}.${x.body}`).digest("hex") === m[2];
};

await cek("POST /webhook/uji terkirim dengan tanda tangan sah", async () => {
  const r = await json(await rute.webhookUji.POST(minta("/webhook/uji", { metode: "POST" })));
  assert.equal(r.j.terkirim, true);
  assert.equal(r.j.status, 200);
  assert.ok(sahTanda(diterimaWh.at(-1)));
});

await cek("pesan masuk WA -> event pesan.masuk {kunci, dari, nama, teks} bertanda tangan; event tak dilanggan tidak dikirim", async () => {
  const awal = diterimaWh.length;
  pesanMasuk(S1, "Halo, mau pesan");
  await tunggu(async () => (await kirimWh(), diterimaWh.slice(awal).some((x) => JSON.parse(x.body).jenis === "pesan.masuk")), 6000, "event pesan.masuk");
  const e = diterimaWh.slice(awal).map((x) => ({ x, b: JSON.parse(x.body) })).find((y) => y.b.jenis === "pesan.masuk");
  assert.ok(sahTanda(e.x));
  assert.equal(e.b.nomor_id, String(N1.id));
  assert.match(e.b.id_event, /^evt_/);
  assert.equal(typeof e.b.waktu, "number");
  assert.equal(e.b.data.teks, "Halo, mau pesan");
  assert.equal(e.b.data.nama, "Budi");
  assert.ok("kunci" in e.b.data && "dari" in e.b.data);
  await tidur(2500); // bot menjawab -> pesan.dibalas_ai (tidak dilanggan)
  await kirimWh();
  assert.ok(!diterimaWh.slice(awal).some((x) => JSON.parse(x.body).jenis === "pesan.dibalas_ai"));
});

await cek("penerima gagal (500): dicoba ulang dengan jeda 10 dtk, lalu 60 dtk; pulih = terkirim", async () => {
  whGagal = true;
  await WH.antrekanEvent("nomor.terputus", N1.id, { kode: 428, keluar: false });
  await kirimWh();
  const [a] = await sql`SELECT id, coba, berikut_pada, status FROM webhook_antrean WHERE jenis = 'nomor.terputus' ORDER BY id DESC LIMIT 1`;
  assert.equal(a.coba, 1);
  assert.equal(a.status, "antre");
  assert.ok(a.berikut_pada - kini() >= 9 && a.berikut_pada - kini() <= 10);
  const [t] = await sql`SELECT gagal_sejak FROM webhook_tujuan`;
  assert.ok(t.gagal_sejak);
  await sql`UPDATE webhook_antrean SET berikut_pada = 0 WHERE id = ${a.id}`;
  await kirimWh();
  const [b] = await sql`SELECT coba, berikut_pada FROM webhook_antrean WHERE id = ${a.id}`;
  assert.equal(b.coba, 2);
  assert.ok(b.berikut_pada - kini() >= 59);
  whGagal = false;
  await sql`UPDATE webhook_antrean SET berikut_pada = 0 WHERE id = ${a.id}`;
  await kirimWh();
  const [c] = await sql`SELECT status FROM webhook_antrean WHERE id = ${a.id}`;
  assert.equal(c.status, "terkirim");
  const [t2] = await sql`SELECT gagal_sejak FROM webhook_tujuan`;
  assert.equal(t2.gagal_sejak, null);
});

await cek("6 kali gagal = status gagal; kirim ulang manual mengantrekan lagi", async () => {
  whGagal = true;
  await WH.antrekanEvent("nomor.terputus", N1.id, { kode: 500, keluar: false });
  await kirimWh();
  const [a] = await sql`SELECT id FROM webhook_antrean ORDER BY id DESC LIMIT 1`;
  for (let i = 0; i < 6; i++) {
    await sql`UPDATE webhook_antrean SET berikut_pada = 0 WHERE id = ${a.id} AND status = 'antre'`;
    await kirimWh();
  }
  const [b] = await sql`SELECT status, coba FROM webhook_antrean WHERE id = ${a.id}`;
  assert.deepEqual([b.status, b.coba], ["gagal", 6]);
  whGagal = false;
  assert.ok((await WH.kirimUlangGagal()) >= 1);
  await tunggu(async () => (await kirimWh(), (await sql`SELECT status FROM webhook_antrean WHERE id = ${a.id}`)[0].status === "terkirim"), 3000, "terkirim ulang");
});

bagian("G. Kecepatan & rencana query");
await cek("cek autentikasi API (key + lisensi di memori) rata-rata <= 1 ms", async () => {
  const t0 = performance.now();
  const N = 150;
  for (let i = 0; i < N; i++) {
    const k = await MA.otorisasi(minta("/status"), "nomor");
    assert.ok(!(k instanceof Response));
  }
  const ms = (performance.now() - t0) / N;
  console.log(`        otorisasi(): ${ms.toFixed(3)} ms/panggilan`);
  assert.ok(ms <= 1, `${ms} ms`);
  MA.hitungLaju("reset", 1); // tidak memengaruhi key lain
});

await cek("antrean webhook & pesan keluar diambil lewat indeks parsial (data 50 rb baris riwayat)", async () => {
  const [{ id: tid }] = await sql`SELECT id FROM webhook_tujuan`;
  await sql`INSERT INTO webhook_antrean (tujuan_id, id_event, jenis, isi, status, berikut_pada, dibuat)
            SELECT ${tid}, 'evt_x' || g, 'pesan.masuk', '{}'::jsonb, 'terkirim', 0, ${kini()} FROM generate_series(1, 50000) g`;
  await sql`INSERT INTO pesan_keluar (number_id, ke, isi, status, dibuat, berubah)
            SELECT ${N1.id}, '62899' || g, '{}'::jsonb, 'terkirim', ${kini()}, ${kini()} FROM generate_series(1, 50000) g`;
  await sql`ANALYZE webhook_antrean`;
  await sql`ANALYZE pesan_keluar`;
  const rencana = async (q) => (await sql.unsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${q}`))[0]["QUERY PLAN"][0];
  const w = await rencana(`SELECT id, coba, isi FROM webhook_antrean WHERE status = 'antre' AND berikut_pada <= ${kini()} AND tujuan_id = ${tid} ORDER BY berikut_pada, id LIMIT 50`);
  const p = await rencana(`SELECT DISTINCT number_id FROM pesan_keluar WHERE status = 'antre'`);
  const kb = await rencana(`SELECT EXISTS (SELECT 1 FROM pesan_keluar WHERE number_id = ${N1.id} AND ke = '6281') OR EXISTS (SELECT 1 FROM percakapan WHERE number_id = ${N1.id} AND telepon = '6281') AS ada`);
  const tampil = (r) => JSON.stringify(r.Plan);
  console.log(`        ambil antrean webhook: ${w["Execution Time"].toFixed(3)} ms; nomor ber-antrean: ${p["Execution Time"].toFixed(3)} ms; cek kontak baru: ${kb["Execution Time"].toFixed(3)} ms`);
  assert.match(tampil(w), /webhook_antrean_ambil_idx/);
  assert.match(tampil(p), /pesan_keluar_antre_idx/);
  assert.doesNotMatch(tampil(kb), /Seq Scan/);
  assert.ok(w["Execution Time"] < 5 && p["Execution Time"] < 5 && kb["Execution Time"] < 5);
});

// ---------- selesai ----------
console.log(`\n${gagalList.length ? `ADA YANG GAGAL: ${lolos} lolos, ${gagalList.length} gagal` : `LOLOS ${lolos} uji mesin`}`);
for (const n of gagalList) console.log(`  - ${n}`);
await wa.matikanGerbang(3000).catch(() => {});
for (const s of [serverAi, serverMesin, serverPusat, serverWh]) s.close();
await sql.end({ timeout: 2 });
await pg.berhenti();
process.exit(gagalList.length ? 1 : 0);
