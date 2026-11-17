// Uji mesin self-host dalam mode sandbox (key cg_test_): aktivasi tanpa ALAMAT_PUBLIK, gerbang SATU nomor penguji (kirim,
// pesan masuk, bot, webhook, cek kontak), verifikasi nomor penguji lewat pesan WA "UJI <kode>", limit balasan AI per hari
// header & amplop sandbox, sandbox > 1 nomor, dan ganti key
// sandbox -> production tanpa memutus WhatsApp.
// Asli: kode src/lib & route src/app/api/v1/**, PostgreSQL 15. Tiruan: pusat, soket WhatsApp, server AI, penerima webhook.
// Pakai (dari akar proyek): node --import ./uji/loader.mjs uji/uji-sandbox-mesin.mjs
import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdirSync, rmSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { mulaiPg, portBebas } from "./pg-lokal.mjs";

const akar = process.cwd();
const tmp = path.join(os.tmpdir(), "wa-uji-sandbox-mesin");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const pg = await mulaiPg({ dir: path.join(tmp, "pg"), sementara: true });

const kunciUji = generateKeyPairSync("ed25519");
const PRIV = kunciUji.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
const portPusat = await portBebas();
const portAi = await portBebas();
const portWh = await portBebas();
Object.assign(process.env, {
  DATABASE_URL: pg.url,
  DATA_DIR: path.join(tmp, "data-kosong"),
  AUTH_SECRET: "x".repeat(40),
  MODE: "mesin",
  LISENSI_MODE_UJI: "1",
  LISENSI_KUNCI_PUBLIK: kunciUji.publicKey.export({ format: "der", type: "spki" }).toString("base64"),
  CHATGERCEP_PUSAT: `http://127.0.0.1:${portPusat}`,
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
delete process.env.ALAMAT_PUBLIK; // sandbox tidak butuh alamat publik
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
await lib("src/lib/bridge.ts");
const { tambahNomor, nomorById } = await lib("src/lib/numbers.ts");
const { tambahDokumen } = await lib("src/lib/knowledge.ts");
const L = await lib("src/lib/lisensi-def.ts");
const ML = await lib("src/lib/mesin/lisensi.ts");
const AN = await lib("src/lib/mesin/antrean.ts");
const WH = await lib("src/lib/mesin/webhook.ts");
const rute = {
  percakapan: await lib("src/app/api/v1/nomor/[id]/percakapan/route.ts"),
  percakapanPesan: await lib("src/app/api/v1/nomor/[id]/percakapan/[pid]/pesan/route.ts"),
  percakapanBalas: await lib("src/app/api/v1/nomor/[id]/percakapan/[pid]/balas/route.ts"),
  percakapanId: await lib("src/app/api/v1/nomor/[id]/percakapan/[pid]/route.ts"),
  status: await lib("src/app/api/v1/status/route.ts"),
  pesan: await lib("src/app/api/v1/pesan/route.ts"),
  webhook: await lib("src/app/api/v1/webhook/route.ts"),
  webhookUji: await lib("src/app/api/v1/webhook/uji/route.ts"),
  ai: await lib("src/app/api/v1/ai/jawab/route.ts"),
  kontakCek: await lib("src/app/api/v1/kontak/cek/route.ts"),
  nomor: await lib("src/app/api/v1/nomor/route.ts"),
};
const sql = await db();

// ---------- soket WhatsApp tiruan ----------
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
      return jid.map((j) => ({ jid: j, exists: true }));
    },
    async profilePictureUrl() {
      return null;
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

// ---------- server AI tiruan ----------
let aiDipanggil = 0;
let aiGagal = false;
const serverAi = http.createServer((req, res) => {
  let b = "";
  req.on("data", (c) => (b += c));
  req.on("end", () => {
    res.setHeader("content-type", "application/json");
    if (req.url.endsWith("/models")) return res.end(JSON.stringify({ data: [] }));
    aiDipanggil += 1;
    if (aiGagal) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: { message: "mati" } }));
    }
    res.end(JSON.stringify({ model: "model-uji", choices: [{ message: { content: "Toko kami buka pukul 09.00 sampai 21.00 kak." } }], usage: { prompt_tokens: 120, completion_tokens: 12 } }));
  });
});
await new Promise((r) => serverAi.listen(portAi, "127.0.0.1", r));

// ---------- pusat tiruan (perilaku sama dengan developer-api.ts untuk sandbox) ----------
const KT = L.buatKunciApi("sandbox");
const KL = L.buatKunciApi("produksi");
const KODE = "246810";
const pusat = { versi: 0, ai: 100, uji: null, panggil: [], status: "aktif", sampai: kini() + 30 * 86400 };
function token(id, isi = {}) {
  pusat.versi += 1;
  return L.tandatanganiLisensi(
    {
      v: 2,
      mode: "sandbox",
      versi_urut: pusat.versi,
      aplikasi_id: 9,
      nama_aplikasi: "Sandbox",
      id_instalasi: id,
      status: pusat.status,
      fitur: ["nomor", "pesan.kirim", "pesan.terima", "kontak.cek", "ai", "knowledge", "bot", "percakapan", "dashboard"],
      batas: { nomor: 1, pesan_menit: 20, kontak_baru_hari: 50, instalasi: 1 },
      biaya: "gratis",
      dibayar_sampai: null,
      kunci: [{ awalan: KT.awalan, hash: KT.hash, sampai: null }],
      uji: pusat.uji,
      diterbitkan: kini(),
      berlaku_sampai: pusat.sampai,
      ...isi,
    },
    PRIV,
  );
}
const tokenLive = (id) => {
  pusat.versi += 1;
  return L.tandatanganiLisensi(
    {
      v: 1,
      versi_urut: pusat.versi,
      aplikasi_id: 10,
      nama_aplikasi: "Aplikasi Live",
      id_instalasi: id,
      status: "aktif",
      fitur: ["nomor", "pesan.kirim"],
      batas: { nomor: 50, pesan_menit: 20, kontak_baru_hari: 50, instalasi: 1 },
      biaya: "gratis",
      dibayar_sampai: null,
      kunci: [{ awalan: KL.awalan, hash: KL.hash, sampai: null }],
      diterbitkan: kini(),
      berlaku_sampai: kini() + 7 * 86400,
    },
    PRIV,
  );
};
const serverPusat = http.createServer(async (req, res) => {
  let b = "";
  for await (const c of req) b += c;
  const isi = JSON.parse(b || "{}");
  pusat.panggil.push({ url: req.url, isi });
  const jawab = (status, x) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(x));
  };
  if (isi.key === KL.key && (req.url === "/api/lisensi/aktivasi" || req.url === "/api/lisensi/kondisi")) return jawab(200, { lisensi: tokenLive(isi.id_instalasi) });
  if (isi.key !== KT.key) return jawab(401, { galat: { kode: "key_tidak_sah", pesan: "key salah" } });
  if (req.url === "/api/lisensi/aktivasi" || req.url === "/api/lisensi/kondisi") return jawab(200, { lisensi: token(isi.id_instalasi) });
  if (req.url === "/api/lisensi/nomor-uji") {
    if (isi.kode !== KODE) return jawab(400, { galat: { kode: "isian_tidak_sah", pesan: "Kode salah atau sudah habis." } });
    pusat.uji = { telepon: isi.telepon, alamat: isi.alamat };
    return jawab(200, { lisensi: token(isi.id_instalasi) });
  }
  jawab(404, {});
});
await new Promise((r) => serverPusat.listen(portPusat, "127.0.0.1", r));

// ---------- penerima webhook aplikasi tiruan ----------
const diterimaWh = [];
const serverWh = http.createServer(async (req, res) => {
  let b = "";
  for await (const c of req) b += c;
  diterimaWh.push(JSON.parse(b));
  res.writeHead(200);
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
function minta(jalur, { metode = "GET", key = KT.key, body } = {}) {
  const h = {};
  if (key) h.authorization = `Bearer ${key}`;
  if (body !== undefined) h["content-type"] = "application/json";
  return new Request(`http://127.0.0.1/api/v1${jalur}`, { method: metode, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
}
const json = async (r) => ({ status: r.status, h: r.headers, j: await r.json() });
async function kirimWh() {
  await WH.tulisBuffer();
  while (globalThis.__waMesinWebhook.jalan) await tidur(5);
  await WH.putaranKirim();
}
WH.mulaiWebhookMesin();
AN.mulaiAntreanMesin();

const UJI_TEL = "628333000333";
const ASING_TEL = "628444000444";
let urut = 0;
const pesanDari = (s, telepon, teks) =>
  s.pancar("messages.upsert", { type: "notify", messages: [{ key: { remoteJid: `${telepon}@s.whatsapp.net`, id: `SBX${++urut}`, fromMe: false }, messageTimestamp: kini(), pushName: "Penguji", message: { conversation: teks } }] });
/** Jumlah pesan tercatat dengan lawan bicara ini (percakapan = satu baris per chat, pesan_chat = per pesan). */
const jumlahChat = async (telepon) =>
  (await sql`SELECT COUNT(*)::int AS n FROM pesan_chat m JOIN percakapan p ON p.id = m.percakapan_id WHERE p.telepon = ${telepon}`)[0].n;

// =====================================================================================
bagian("A. Aktivasi sandbox tanpa alamat publik");
process.env.CHATGERCEP_KEY = KT.key;
await cek("key cg_test_ tanpa ALAMAT_PUBLIK: aktivasi berhasil, lisensi v2 sandbox, nomor penguji belum ada", async () => {
  await ML.sinkronSekali();
  assert.equal(ML.sandboxAktif(), true);
  const akt = pusat.panggil.find((p) => p.url === "/api/lisensi/aktivasi");
  assert.equal(akt.isi.alamat, ""); // tidak butuh alamat publik
  const info = ML.infoLisensi();
  assert.equal(info.mode, "sandbox");
  assert.equal(info.nomor_uji, null);
  assert.equal(ML.layananBoleh(), true);
});

const { n: N, s: SK } = await nomorTerhubung("Nomor Sandbox", "628999000999");
await tambahDokumen({ numberId: N.id, judul: "Info", sumber: "teks", teks: "Toko Sandbox buka pukul 09.00 sampai 21.00 setiap hari." });

await cek("nomor bot terhubung -> mesin melapor ke pusat SEKALI (kondisi + nomor_bot), untuk ditampilkan di portal", async () => {
  ML.mulaiLisensiMesin(60_000); // pasang pendengar nomor.terhubung (sinkron awal ditunda jauh)
  const awal = pusat.panggil.length;
  const { pancarkan } = await lib("src/lib/peristiwa.ts");
  pancarkan({ jenis: "nomor.terhubung", sesi: N.sesi, waId: "628999000999", nama: "Nomor Sandbox" });
  await tunggu(() => pusat.panggil.slice(awal).find((p) => p.url === "/api/lisensi/kondisi" && p.isi.nomor_bot === "628999000999"), 6000, "laporan nomor bot");
});

await cek("API: header X-ChatGerCep-Mode sandbox; GET /status berisi mode, nomor penguji, pemakaian AI; key live di mesin sandbox = 401", async () => {
  const r = await json(await rute.status.GET(minta("/status")));
  assert.equal(r.status, 200);
  assert.equal(r.h.get("x-chatgercep-mode"), "sandbox");
  assert.equal(r.j.mode, "sandbox");
  assert.equal(r.j.nomor_uji, null);
  assert.equal(r.j.ai_hari, undefined); // tanpa limit AI: AI memakai kunci milik developer
  const tukar = KT.key.replace("cg_test_", "cg_live_");
  assert.equal((await rute.status.GET(minta("/status", { key: tukar }))).status, 401);
});

await cek("sandbox hanya 1 nomor: POST /nomor kedua = 403 batas_nomor", async () => {
  const r = await json(await rute.nomor.POST(minta("/nomor", { metode: "POST", body: { label: "Kedua" } })));
  assert.equal(r.status, 403);
  assert.equal(r.j.galat.kode, "batas_nomor");
});

await cek("PUT /webhook di laptop (http://127.0.0.1) diterima; webhook uji membawa \"mode\": \"sandbox\"", async () => {
  const r = await json(await rute.webhook.PUT(minta("/webhook", { metode: "PUT", body: { url: `http://127.0.0.1:${portWh}/wh`, event: ["pesan.masuk", "pesan.dibalas_ai", "pesan.status"] } })));
  assert.equal(r.status, 200);
  const awal = diterimaWh.length;
  await rute.webhookUji.POST(minta("/webhook/uji", { metode: "POST", body: {} }));
  await tunggu(() => diterimaWh.length > awal, 3000, "webhook uji");
  assert.equal(diterimaWh.at(-1).mode, "sandbox");
});

bagian("B. Gerbang nomor penguji");
await cek("belum ada nomor penguji: POST /pesan = 409 nomor_penguji_belum_ada", async () => {
  const r = await json(await rute.pesan.POST(minta("/pesan", { metode: "POST", body: { nomor_id: N.id, ke: UJI_TEL, teks: "halo" } })));
  assert.equal(r.status, 409);
  assert.equal(r.j.galat.kode, "nomor_penguji_belum_ada");
});

await cek("chat dari nomor asing diabaikan seluruhnya: tidak dicatat, tanpa webhook, AI tidak dipanggil, tidak dibalas", async () => {
  const awalAi = aiDipanggil;
  const awalWh = diterimaWh.length;
  const awalKirim = SK.terkirim.length;
  pesanDari(SK, ASING_TEL, "jam buka?");
  await tidur(2500);
  await kirimWh();
  assert.equal(await jumlahChat(ASING_TEL), 0);
  assert.equal(aiDipanggil, awalAi);
  assert.equal(diterimaWh.length, awalWh);
  assert.equal(SK.terkirim.length, awalKirim);
});

await cek("\"UJI <kode salah>\" dari nomor mana pun: diteruskan ke pusat, dibalas sekali per 10 menit, nomor tetap bukan nomor penguji", async () => {
  const awal = SK.terkirim.length;
  pesanDari(SK, ASING_TEL, "UJI 111111");
  await tunggu(() => SK.terkirim.length > awal, 4000, "balasan kode salah");
  assert.match(SK.terkirim.at(-1).isi.text, /Kode salah/);
  pesanDari(SK, ASING_TEL, "UJI 222222");
  await tidur(800);
  assert.equal(SK.terkirim.length, awal + 1); // tidak dibalas lagi dalam 10 menit
  assert.equal(ML.nomorUji(), null);
});

await cek("\"UJI <kode benar>\" dari HP penguji: lisensi baru berisi nomor penguji, mesin membalas ✅, portal-nya jadi terverifikasi", async () => {
  const awal = SK.terkirim.length;
  pesanDari(SK, UJI_TEL, `UJI ${KODE}`);
  await tunggu(() => SK.terkirim.length > awal, 4000, "balasan verifikasi");
  assert.match(SK.terkirim.at(-1).isi.text, /✅/);
  assert.equal(SK.terkirim.at(-1).jid, `${UJI_TEL}@s.whatsapp.net`);
  assert.equal(ML.nomorUji().telepon, UJI_TEL);
  assert.equal(ML.infoLisensi().nomor_uji, "62833****333");
  const p = pusat.panggil.filter((x) => x.url === "/api/lisensi/nomor-uji").at(-1);
  assert.equal(p.isi.telepon, UJI_TEL);
  assert.equal(await jumlahChat(UJI_TEL), 0); // pesan kode tidak masuk histori
});

await cek("POST /pesan ke nomor penguji = 202 dan terkirim; ke nomor lain = 403 bukan_nomor_penguji", async () => {
  const ok = await json(await rute.pesan.POST(minta("/pesan", { metode: "POST", body: { nomor_id: N.id, ke: "0833-3000-333", teks: "Halo dari sandbox" } })));
  assert.equal(ok.status, 202);
  await tunggu(() => SK.terkirim.some((x) => x.isi.text === "Halo dari sandbox"), 3000, "pesan API terkirim");
  const tolak = await json(await rute.pesan.POST(minta("/pesan", { metode: "POST", body: { nomor_id: N.id, ke: ASING_TEL, teks: "spam" } })));
  assert.equal(tolak.status, 403);
  assert.equal(tolak.j.galat.kode, "bukan_nomor_penguji");
  const tolakGrup = await json(await rute.pesan.POST(minta("/pesan", { metode: "POST", body: { nomor_id: N.id, ke: "120363041234567890@g.us", teks: "halo grup" } })));
  assert.equal(tolakGrup.status, 403);
  assert.equal(tolakGrup.j.galat.kode, "bukan_nomor_penguji");
});

await cek("kontak/cek di sandbox hanya untuk nomor penguji", async () => {
  const ok = await json(await rute.kontakCek.POST(minta("/kontak/cek", { metode: "POST", body: { nomor_id: N.id, nomor: [UJI_TEL] } })));
  assert.equal(ok.status, 200);
  const tolak = await json(await rute.kontakCek.POST(minta("/kontak/cek", { metode: "POST", body: { nomor_id: N.id, nomor: [UJI_TEL, ASING_TEL] } })));
  assert.equal(tolak.status, 403);
  assert.equal(tolak.j.galat.kode, "bukan_nomor_penguji");
});

await cek("chat dari nomor penguji: dicatat, webhook pesan.masuk (mode sandbox), bot AI menjawab ke HP penguji", async () => {
  const awalWh = diterimaWh.length;
  const awal = SK.terkirim.length;
  pesanDari(SK, UJI_TEL, "jam buka?");
  await tunggu(() => SK.terkirim.slice(awal).some((x) => /09\.00/.test(x.isi.text ?? "")), 8000, "balasan bot");
  await tunggu(async () => (await kirimWh(), diterimaWh.slice(awalWh).some((x) => x.jenis === "pesan.masuk")), 5000, "webhook pesan.masuk");
  const e = diterimaWh.slice(awalWh).find((x) => x.jenis === "pesan.masuk");
  assert.equal(e.mode, "sandbox");
  assert.equal(e.data.dari, UJI_TEL);
  assert.ok((await jumlahChat(UJI_TEL)) >= 1);
});

bagian("C. Core API headless: penegakan fitur, riwayat percakapan, event realtime");
const FITUR_PENUH = ["nomor", "pesan.kirim", "pesan.terima", "kontak.cek", "ai", "knowledge", "bot", "percakapan", "dashboard"];
const pakaiFitur = async (fitur) => ML.terimaLisensi(token(await ML.idInstalasi(), { fitur }));
const ctxP = (pid) => ({ params: Promise.resolve({ id: String(N.id), pid: String(pid) }) });

await cek("fitur dimatikan berlaku di semua jalur: API 403, fiturBoleh false (dashboard/aksi), bot berhenti; WA tidak putus", async () => {
  await pakaiFitur(FITUR_PENUH.filter((f) => f !== "percakapan" && f !== "bot"));
  assert.equal(ML.fiturBoleh("percakapan"), false);
  assert.equal(ML.botBoleh(), false);
  const r = await json(await rute.percakapan.GET(minta(`/nomor/${N.id}/percakapan`), { params: Promise.resolve({ id: String(N.id) }) }));
  assert.equal(r.status, 403);
  assert.equal(r.j.galat.kode, "fitur_tidak_dibuka");
  const awal = SK.terkirim.length;
  const awalAi = aiDipanggil;
  pesanDari(SK, UJI_TEL, "jam buka? (bot dimatikan)");
  await tidur(2500);
  assert.equal(SK.terkirim.length, awal); // bot diam
  assert.equal(aiDipanggil, awalAi);
  assert.equal(SK.keluar + SK.ditutup, 0);
  await pakaiFitur(FITUR_PENUH);
  assert.equal(ML.fiturBoleh("percakapan"), true);
  assert.equal(ML.botBoleh(), true);
});

await cek("dashboard bawaan: .env DASHBOARD_MESIN=mati atau fitur `dashboard` tidak dibuka -> tertutup; dibuka lagi -> terbuka", async () => {
  assert.equal(await ML.dashboardMesinBoleh(), true);
  process.env.DASHBOARD_MESIN = "mati";
  assert.equal(await ML.dashboardMesinBoleh(), false);
  delete process.env.DASHBOARD_MESIN;
  await pakaiFitur(FITUR_PENUH.filter((f) => f !== "dashboard"));
  assert.equal(await ML.dashboardMesinBoleh(), false); // blokir dari pusat mengalahkan .env
  await pakaiFitur(FITUR_PENUH);
  assert.equal(await ML.dashboardMesinBoleh(), true);
});

let pidUji;
await cek("riwayat percakapan: daftar berkursor, isi pesan, jeda/lanjut bot, balas manual (antrean + bot dijeda), hapus", async () => {
  const d = await json(await rute.percakapan.GET(minta(`/nomor/${N.id}/percakapan?batas=1`), { params: Promise.resolve({ id: String(N.id) }) }));
  assert.equal(d.status, 200);
  assert.equal(d.j.data.length, 1);
  const c = d.j.data[0];
  assert.equal(c.telepon, UJI_TEL);
  assert.ok(c.kunci && typeof c.id === "string" && ["aktif", "dijeda", "dibisukan"].includes(c.bot));
  pidUji = c.id;
  const m = await json(await rute.percakapanPesan.GET(minta(`/nomor/${N.id}/percakapan/${pidUji}/pesan?batas=50`), ctxP(pidUji)));
  assert.equal(m.status, 200);
  assert.ok(m.j.data.length >= 1 && m.j.data.every((x) => ["pelanggan", "ai", "manusia"].includes(x.peran)));
  const j = await json(await rute.percakapanId.PATCH(minta(`/nomor/${N.id}/percakapan/${pidUji}`, { metode: "PATCH", body: { bot: "jeda", menit: 30 } }), ctxP(pidUji)));
  assert.equal(j.status, 200);
  assert.equal(j.j.bot, "dijeda");
  const l = await json(await rute.percakapanId.PATCH(minta(`/nomor/${N.id}/percakapan/${pidUji}`, { metode: "PATCH", body: { bot: "lanjut" } }), ctxP(pidUji)));
  assert.equal(l.j.bot, "aktif");
  const salah = await json(await rute.percakapanId.PATCH(minta(`/nomor/${N.id}/percakapan/${pidUji}`, { metode: "PATCH", body: { bot: "tidur" } }), ctxP(pidUji)));
  assert.equal(salah.status, 400);
  const b = await json(await rute.percakapanBalas.POST(minta(`/nomor/${N.id}/percakapan/${pidUji}/balas`, { metode: "POST", body: { teks: "Halo kak, saya bantu manual ya" } }), ctxP(pidUji)));
  assert.equal(b.status, 202, JSON.stringify(b.j));
  await tunggu(() => SK.terkirim.some((x) => x.isi.text === "Halo kak, saya bantu manual ya"), 4000, "balasan manual terkirim");
  const s2 = await json(await rute.percakapanPesan.GET(minta(`/nomor/${N.id}/percakapan/${pidUji}/pesan`), ctxP(pidUji)));
  assert.equal(s2.j.percakapan.bot, "dijeda"); // bot mundur setelah balasan manual
  assert.ok(s2.j.data.some((x) => x.peran === "manusia" && x.teks === "Halo kak, saya bantu manual ya"));
  const tak = await json(await rute.percakapanPesan.GET(minta(`/nomor/${N.id}/percakapan/999999/pesan`), ctxP(999999)));
  assert.equal(tak.status, 404);
});

await cek("event realtime: QR baru -> nomor.status menunggu_qr + nomor.qr (teks + PNG); pairing -> nomor.pairing", async () => {
  await rute.webhook.PUT(minta("/webhook", { metode: "PUT", body: { url: `http://127.0.0.1:${portWh}/wh`, event: ["nomor.qr", "nomor.status", "nomor.pairing", "pesan.masuk"] } }));
  const awal = diterimaWh.length;
  const { pancarkan } = await lib("src/lib/peristiwa.ts");
  pancarkan({ jenis: "nomor.qr", sesi: N.sesi, qr: "2@uji-qr,aaa,bbb,ccc,1" });
  pancarkan({ jenis: "nomor.pairing", sesi: N.sesi, kode: "ABCD1234" });
  await tunggu(async () => (await kirimWh(), ["nomor.qr", "nomor.status", "nomor.pairing"].every((j) => diterimaWh.slice(awal).some((x) => x.jenis === j))), 6000, "event realtime");
  const q = diterimaWh.slice(awal).find((x) => x.jenis === "nomor.qr");
  assert.equal(q.data.qr, "2@uji-qr,aaa,bbb,ccc,1");
  assert.equal(diterimaWh.slice(awal).find((x) => x.jenis === "nomor.status").data.status, "menunggu_qr");
  assert.equal(diterimaWh.slice(awal).find((x) => x.jenis === "nomor.pairing").data.kode, "ABCD1234");
});

await cek("fiturBoleh: cek di memori <= 0,01 ms (tanpa query)", async () => {
  const t0 = performance.now();
  for (let i = 0; i < 100000; i++) ML.fiturBoleh(i % 2 ? "bot" : "percakapan");
  const per = (performance.now() - t0) / 100000;
  console.log(`      fiturBoleh: ${(per * 1000).toFixed(2)} µs/cek`);
  assert.ok(per < 0.01);
});

bagian("D. Batas nomor, kedaluwarsa, ganti key");
await cek("sandbox kedaluwarsa: API 402 sandbox_kedaluwarsa, bot diam, WA tetap tersambung", async () => {
  await ML.terimaLisensi(token(await ML.idInstalasi(), { berlaku_sampai: kini() - 1 }));
  const r = await json(await rute.status.GET(minta("/status")));
  assert.equal(r.j.lisensi.aktif, false);
  const p = await json(await rute.pesan.POST(minta("/pesan", { metode: "POST", body: { nomor_id: N.id, ke: UJI_TEL, teks: "x" } })));
  assert.equal(p.status, 402);
  assert.equal(p.j.galat.kode, "sandbox_kedaluwarsa");
  assert.equal(SK.keluar + SK.ditutup, 0);
  pusat.sampai = kini() + 30 * 86400;
  const h = await ML.perbaruiLisensi(); // tombol "Perbarui lisensi" (sekali ke pusat)
  assert.equal(h.ok, true, h.pesan);
  assert.equal(ML.layananBoleh(), true);
});

await cek("sandbox dengan > 1 nomor tersimpan (mis. data production lama): mode terbatas sampai nomor lain dihapus", async () => {
  const n2 = await tambahNomor("Nomor lama");
  globalThis.__waMesinLisensi.perbaruiTerakhir = 0; // lewati jeda 15 dtk tombol Perbarui lisensi
  await ML.perbaruiLisensi();
  assert.equal(ML.layananBoleh(), false);
  assert.equal(ML.alasanTerbatas().kode, "batas_nomor");
  await sql`DELETE FROM numbers WHERE id = ${n2.id}`;
  globalThis.__waNomor.janji = null;
  globalThis.__waMesinLisensi.perbaruiTerakhir = 0;
  const h = await ML.perbaruiLisensi();
  assert.equal(h.ok, true, h.pesan);
  assert.equal(ML.layananBoleh(), true);
});

await cek("ganti CHATGERCEP_KEY sandbox -> production: instalasi baru, gerbang hilang, data & sesi WA utuh (tidak diputus)", async () => {
  const idLama = await ML.idInstalasi();
  const putusAwal = SK.keluar + SK.ditutup;
  process.env.CHATGERCEP_KEY = KL.key;
  process.env.ALAMAT_PUBLIK = "http://127.0.0.1:9"; // pusat tiruan tidak mengirim tantangan
  await ML.sinkronSekali();
  assert.notEqual(await ML.idInstalasi(), idLama);
  assert.equal(ML.sandboxAktif(), false);
  assert.equal(ML.lawanNomorUji({ telepon: ASING_TEL }), true);
  assert.equal(ML.infoLisensi().mode, "produksi");
  assert.ok(await nomorById(N.id));
  assert.equal(SK.keluar + SK.ditutup, putusAwal);
  const r = await rute.status.GET(minta("/status", { key: KL.key }));
  assert.equal(r.headers.get("x-chatgercep-mode"), "production");
  assert.equal((await rute.status.GET(minta("/status", { key: KT.key }))).status, 401); // key sandbox tidak berlaku lagi
});

await cek("gerbang nomor penguji: cek di memori <= 0,01 ms per pesan (tanpa query)", async () => {
  process.env.CHATGERCEP_KEY = KT.key;
  delete process.env.ALAMAT_PUBLIK;
  await ML.sinkronSekali();
  const t0 = performance.now();
  for (let i = 0; i < 100000; i++) ML.lawanNomorUji({ telepon: i % 2 ? UJI_TEL : ASING_TEL, alamat: null });
  const gerbang = (performance.now() - t0) / 100000;
  console.log(`      gerbang nomor penguji: ${(gerbang * 1000).toFixed(2)} µs/cek`);
  assert.ok(gerbang < 0.01);
});

console.log(`\n${gagalList.length ? `ADA YANG GAGAL: ${lolos} lolos, ${gagalList.length} gagal` : `LOLOS ${lolos} uji sandbox mesin`}`);
for (const g of gagalList) console.log(`  - ${g}`);
for (const s of [serverAi, serverPusat, serverWh]) s.close();
await sql.end({ timeout: 2 }).catch(() => {});
await pg.berhenti();
process.exit(gagalList.length ? 1 : 0);
