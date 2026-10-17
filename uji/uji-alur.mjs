// Uji alur gerbang WhatsApp + jembatan AI dengan soket WhatsApp tiruan dan Hermes tiruan.
// Yang asli: kode src/lib (wa.ts, wa-auth.ts, bridge.ts, numbers.ts, knowledge.ts), PostgreSQL 15
// (dijalankan sementara di mesin ini), dan fungsi bantu Baileys (proto, JID, normalisasi pesan).
// Yang tiruan: koneksi ke server WhatsApp.
// Pakai (dari akar proyek): node --import ./uji/loader.mjs uji/uji-alur.mjs
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdirSync, rmSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { mulaiPg } from "./pg-lokal.mjs";

const akar = process.cwd();
const tmp = path.join(os.tmpdir(), "wa-uji-alur");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const pg = await mulaiPg({ dir: path.join(tmp, "pg"), sementara: true });
process.env.DATABASE_URL = pg.url;
process.env.DATA_DIR = path.join(tmp, "data-kosong");
const lib = (f) => import(pathToFileURL(path.join(akar, f)).href);
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
const kini = () => Math.floor(Date.now() / 1000);
async function tunggu(fn, ms = 4000, apa = "") {
  const t = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t > ms) throw new Error(`habis waktu menunggu ${apa || fn}`);
    await tidur(15);
  }
}

// ---------- Hermes tiruan ----------
const hermes = { panggilan: [], jedaMs: 40, gagal: false };
const server = http.createServer((req, res) => {
  let b = "";
  req.on("data", (c) => (b += c));
  req.on("end", () => {
    if (req.url.endsWith("/models")) return res.end("{}");
    const j = JSON.parse(b);
    const p = { sesi: req.headers["x-hermes-session-id"], sistem: j.messages[0].content, pesan: j.messages[1].content, at: Date.now() };
    hermes.panggilan.push(p);
    setTimeout(() => {
      if (hermes.gagal) {
        res.statusCode = 500;
        return res.end("galat");
      }
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ choices: [{ message: { content: `**Jawaban** untuk: ${p.pesan}` } }] }));
    }, hermes.jedaMs);
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
process.env.HERMES_API_URL = `http://127.0.0.1:${server.address().port}`;
process.env.HERMES_API_KEY = "uji";

const B = await lib("node_modules/baileys/lib/index.js");
const { db, getSetting } = await lib("src/lib/db.ts");
const wa = await lib("src/lib/wa.ts");
const bridge = await lib("src/lib/bridge.ts"); // mendaftarkan diri sebagai penerima event
const { tambahNomor, nomorById, setBotAktif } = await lib("src/lib/numbers.ts");
const { tambahDokumen } = await lib("src/lib/knowledge.ts");
const { bukaAuth, tungguTulis } = await lib("src/lib/wa-auth.ts");
const sql = await db();

// ---------- Soket WhatsApp tiruan ----------
const soket = [];
const petaLid = new Map(); // PN -> LID yang "sudah dikenal" penyimpanan Baileys
let versiDiminta = 0;
function buatSoket(config) {
  const ev = new EventEmitter();
  const s = {
    config,
    ev,
    terkirim: [],
    dibaca: [],
    presensi: [],
    urutan: [],
    keluar: 0,
    ditutup: 0,
    gagalKirim: false,
    get user() {
      return config.auth.creds.me;
    },
    signalRepository: { lidMapping: { getLIDForPN: async (pn) => petaLid.get(pn) ?? null } },
    async sendMessage(jid, isi, opsi) {
      if (s.gagalKirim) throw new Error("kirim gagal");
      s.terkirim.push({ jid, isi, id: opsi.messageId, at: Date.now() });
      s.urutan.push("kirim");
      return { key: { id: opsi.messageId } };
    },
    async readMessages(keys) {
      s.dibaca.push(keys);
      s.urutan.push("baca");
    },
    async sendPresenceUpdate(t, jid) {
      s.presensi.push(jid ? `${t}:${jid}` : t);
    },
    async resyncAppState(k) {
      s.resync = k;
    },
    async logout() {
      s.keluar += 1;
    },
    async end() {
      s.ditutup += 1;
    },
    // Seperti soket asli: kredensial di memori diperbarui dulu, baru pendengar dipanggil.
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
globalThis.__waGerbang.lib = Promise.resolve({
  ...B,
  makeWASocket: buatSoket,
  fetchLatestWaWebVersion: async () => {
    versiDiminta += 1;
    return { version: [2, 3000, 999], isLatest: true };
  },
});

// ---------- alat bantu ----------
let lolos = 0;
const gagalList = [];
async function cek(nama, fn) {
  try {
    await fn();
    lolos += 1;
    console.log(`  ok    ${nama}`);
  } catch (e) {
    gagalList.push(nama);
    console.log(`  GAGAL ${nama}\n        ${String(e?.message ?? e).split("\n").slice(0, 6).join("\n        ")}`);
  }
}
const bagian = (j) => console.log(`\n== ${j} ==`);
/** Jumlah baris sesi login di database, setelah tulis yang masih antre selesai. */
const auth = async (sesi) => (await tungguTulis(sesi), (await sql`SELECT COUNT(*) AS n FROM wa_auth WHERE sesi = ${sesi}`)[0].n);
/** Statistik di database, setelah tulis latar jembatan tuntas. */
const stat = async (id) => {
  await bridge.tulisTuntas();
  const [r] = await sql`SELECT COALESCE(SUM(masuk), 0) AS masuk, COALESCE(SUM(dibalas), 0) AS dibalas, COALESCE(SUM(gagal), 0) AS gagal FROM stats WHERE number_id = ${id}`;
  return { masuk: r.masuk, dibalas: r.dibalas, gagal: r.gagal };
};
const kunciChat = (sesi, chat) => createHash("sha256").update(`${sesi}|${chat}`).digest("hex").slice(0, 32);
/** Keadaan chat di memori jembatan (acuan selama chat aktif) dan di database (yang bertahan). */
const chatMemori = (sesi, chat) => globalThis.__waBridge.antre.get(kunciChat(sesi, chat))?.chat ?? null;
const chatDb = async (sesi, chat) => (await bridge.tulisTuntas(), (await sql`SELECT sesi_ke, last_at, jeda_sampai, jendela_awal, jendela_n FROM chat_state WHERE kunci = ${kunciChat(sesi, chat)}`)[0] ?? null);
const cacheNomorBasi = () => (globalThis.__waNomor.janji = null); // setelah mengubah tabel numbers langsung lewat SQL
let urut = 0;
const idBaru = () => `UJI${String(++urut).padStart(5, "0")}`;
function pesan(jid, isi, o = {}) {
  return {
    key: { remoteJid: jid, id: o.id ?? idBaru(), fromMe: !!o.dariSaya, ...(o.alt ? { remoteJidAlt: o.alt } : {}) },
    messageTimestamp: o.waktu ?? kini(),
    pushName: "Pelanggan",
    message: typeof isi === "string" ? { conversation: isi } : isi,
  };
}
const tiba = (s, ...m) => s.pancar("messages.upsert", { messages: m, type: "notify" });
const dibaca = (s, jid, o = {}) => s.pancar("messages.update", [{ key: { remoteJid: jid, id: o.id ?? "X", fromMe: !!o.dariSaya }, update: { status: o.status ?? 4 } }]);

async function nomorCepat(label) {
  const n = await tambahNomor(label);
  // 1 detik: di bawah batas dashboard (2 dtk), hanya supaya uji tidak lama
  await sql`UPDATE numbers SET tunggu_detik = 1, tunggu_baca_detik = 3, jeda_detik = 1800 WHERE id = ${n.id}`;
  cacheNomorBasi();
  return n;
}

/** Buat nomor, pasangkan (QR -> pindai -> mulai ulang -> terhubung), kembalikan soket aktifnya. */
async function nomorTerhubung(label, waId, lid, nama = label) {
  const n = await nomorCepat(label);
  const awal = soket.length;
  const p = wa.hubungkan(n.sesi);
  const s1 = await tunggu(() => soket[awal], 3000, "soket pertama");
  s1.pancar("connection.update", { qr: `2@ref-${label},aaa,bbb,ccc,1` });
  await p;
  s1.pancar("creds.update", { me: { id: `${waId}:5@s.whatsapp.net`, lid: `${lid}:5@lid`, ...(nama ? { name: nama } : {}) } });
  s1.tutup(515);
  const s2 = await tunggu(() => soket[awal + 1], 3000, "soket setelah mulai ulang");
  s2.pancar("connection.update", { connection: "open" });
  await tunggu(async () => (await nomorById(n.id)).wa_id === waId, 3000, "wa_id tercatat");
  return { n, s: s2, s1 };
}

const mulaiSemua = Date.now();

// =====================================================================================
bagian("A. Koneksi, QR, dan pemasangan");
const A = await nomorCepat("Toko A");
await tambahDokumen({ numberId: A.id, judul: "Info", sumber: "teks", teks: "Kamu adalah asisten Toko A. Toko A buka pukul 09.00-21.00 setiap hari. KODEUNIK-A." });
let sA;

await cek("nomor baru tanpa sesi berstatus BELUM_ADA dan tidak membuat soket", () => {
  assert.equal(wa.infoSesi(A.sesi).status, "BELUM_ADA");
  assert.equal(soket.length, 0);
});

await cek("hubungkan() membuat soket hemat: tanpa riwayat, tetap offline, grup/status/saluran dibuang", async () => {
  const p = wa.hubungkan(A.sesi);
  const s = await tunggu(() => soket[0]);
  assert.equal(wa.infoSesi(A.sesi).status, "STARTING");
  const c = s.config;
  assert.equal(c.markOnlineOnConnect, false);
  assert.equal(c.syncFullHistory, false);
  assert.equal(c.emitOwnEvents, false);
  assert.equal(c.shouldSyncHistoryMessage({}), false);
  assert.equal(c.shouldIgnoreJid("120363000000000000@g.us"), true);
  assert.equal(c.shouldIgnoreJid("status@broadcast"), true);
  assert.equal(c.shouldIgnoreJid("120363111111111111@newsletter"), true);
  assert.equal(c.shouldIgnoreJid("6281234567890@s.whatsapp.net"), false);
  assert.equal(c.shouldIgnoreJid("555000111@lid"), false);
  assert.deepEqual(c.version, [2, 3000, 999]); // selalu versi WhatsApp Web terkini, bukan bawaan pustaka
  const t = Date.now();
  s.pancar("connection.update", { qr: "2@REFSATU,noise,identity,adv,1" });
  await p;
  assert.ok(Date.now() - t < 150, "hubungkan() selesai segera setelah QR tersedia");
  assert.equal(wa.infoSesi(A.sesi).status, "SCAN_QR_CODE");
});

await cek("qr(): matriks ringkas + hash, di-cache per kode, berganti bila kode berganti", async () => {
  const q1 = await wa.qr(A.sesi);
  assert.equal(q1.hash.length, 12);
  assert.equal(await wa.qr(A.sesi), q1);
  soket[0].pancar("connection.update", { qr: "2@REFDUA,noise,identity,adv,1" });
  const q2 = await wa.qr(A.sesi);
  assert.notEqual(q2.hash, q1.hash);
});

await cek("gambar QR di browser (jalurQr) sama persis dengan matriks kode QR aslinya", async () => {
  const { encode } = await lib("node_modules/uqr/dist/index.mjs");
  const { jalurQr } = await lib("src/lib/qr.ts");
  const teks = `2@${"R".repeat(140)},${"n".repeat(44)},${"i".repeat(44)},${"a".repeat(44)},1`; // seukuran QR WhatsApp asli
  soket[0].pancar("connection.update", { qr: teks });
  const { kode } = await wa.qr(A.sesi);
  const asli = encode(teks, { ecc: "L", border: 2 });
  assert.equal(kode.n, asli.size);
  // gambar ulang path SVG ke kisi lalu bandingkan modul demi modul
  const kisi = Array.from({ length: kode.n }, () => new Array(kode.n).fill(false));
  for (const [, x, y, p] of jalurQr(kode).matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) for (let i = 0; i < +p; i++) kisi[+y][+x + i] = true;
  assert.deepEqual(kisi, asli.data);
  const muatan = JSON.stringify({ status: "SCAN_QR_CODE", hash: "x".repeat(12), qr: kode }).length;
  assert.ok(muatan < 900, `muatan respons QR ${muatan} B`);
  console.log(`        (QR ${kode.n}x${kode.n} modul: respons ${muatan} B)`);
});

await cek("QR tidak dipindai (408): sesi berhenti, kunci dibuang, tidak menyambung ulang sendiri", async () => {
  soket[0].pancar("creds.update", {}); // kunci sementara sempat tersimpan
  assert.equal(await auth(A.sesi), 1);
  soket[0].tutup(408);
  const i = wa.infoSesi(A.sesi);
  assert.equal(i.status, "FAILED");
  assert.match(i.alasan, /QR tidak dipindai/);
  assert.equal(await auth(A.sesi), 0);
  assert.equal(await wa.qr(A.sesi), null);
  await tidur(1500);
  assert.equal(soket.length, 1);
});

await cek("QR dipindai: kredensial tersimpan, soket dimulai ulang (515), lalu terhubung", async () => {
  const p = wa.hubungkan(A.sesi);
  const s = await tunggu(() => soket[1]);
  s.pancar("connection.update", { qr: "2@REFTIGA,noise,identity,adv,1" });
  await p;
  s.pancar("creds.update", { me: { id: "6281100000001:5@s.whatsapp.net", lid: "777000111:5@lid" } });
  s.pancar("connection.update", { isNewLogin: true, qr: undefined });
  s.tutup(515); // soket baru harus membaca kredensial yang BARU saja ditulis (tulisnya masih di perjalanan)
  sA = await tunggu(() => soket[2], 1000, "soket baru segera setelah 515");
  assert.equal(sA.config.auth.creds.me.id, "6281100000001:5@s.whatsapp.net"); // dimuat dari database
  assert.equal(await auth(A.sesi), 1);
  sA.pancar("connection.update", { connection: "open" });
  const i = wa.infoSesi(A.sesi);
  assert.equal(i.status, "WORKING");
  assert.equal(i.waId, "6281100000001");
  const n = await tunggu(async () => ((await nomorById(A.id)).wa_id ? nomorById(A.id) : null), 2000, "wa_id tercatat");
  assert.equal(n.wa_id, "6281100000001");
  assert.ok(n.last_connected_at);
  assert.deepEqual(sA.resync, ["critical_block"]); // nama profil belum ada -> diminta sekali
});

await cek("nama profil tiba belakangan: tersimpan ke nomor", async () => {
  sA.pancar("creds.update", { me: { ...sA.user, name: "Toko A Resmi" } });
  assert.equal(wa.infoSesi(A.sesi).nama, "Toko A Resmi");
  await tunggu(async () => (await nomorById(A.id)).nama_wa === "Toko A Resmi", 2000, "nama_wa tercatat");
});

await cek("event dari soket lama diabaikan", async () => {
  soket[1].pancar("connection.update", { qr: "2@BASI,x,y,z,1" });
  soket[0].tutup(401);
  assert.equal(wa.infoSesi(A.sesi).status, "WORKING");
  assert.equal(await auth(A.sesi), 1);
});

// =====================================================================================
bagian("B. Balasan AI");
const P1 = "555000111@lid";

await cek("pesan masuk: menunggu manusia dulu (tanpa tanda-baca/mengetik), lalu AI membalas", async () => {
  const id = idBaru();
  const t0 = Date.now();
  tiba(sA, pesan(P1, "Halo, buka jam berapa?", { id }));
  await tidur(500);
  assert.equal(hermes.panggilan.length, 0);
  assert.deepEqual(sA.dibaca, []);
  assert.deepEqual(sA.presensi, []);
  await tunggu(() => sA.terkirim.length === 1, 5000, "balasan terkirim");
  const h = hermes.panggilan[0];
  assert.ok(h.at - t0 >= 950, `AI dipanggil setelah tunggu_detik (${h.at - t0} ms)`);
  assert.ok(h.at - t0 < 1400, `tanpa jeda tambahan dari database (${h.at - t0} ms)`);
  assert.equal(h.pesan, "Halo, buka jam berapa?");
  assert.equal(h.sesi, `wa-${kunciChat(A.sesi, P1).slice(0, 24)}-1`);
  assert.match(h.sistem, /KODEUNIK-A/);
  const k = sA.terkirim[0];
  assert.equal(k.jid, P1);
  assert.equal(k.isi.text, "*Jawaban* untuk: Halo, buka jam berapa?"); // markdown -> format WhatsApp
  assert.equal(k.isi.linkPreview, null);
  // Jeda mengetik minimal dihitung dari mulai memproses (termasuk menyusun konteks), bukan dari panggilan AI.
  assert.ok(k.at - t0 >= 1000 + 1150, `ada jeda mengetik minimal sebelum balasan (${k.at - t0} ms setelah pesan tiba)`);
  assert.deepEqual(sA.dibaca, [[{ remoteJid: P1, id, fromMe: false }]]);
  assert.deepEqual(sA.urutan, ["baca", "kirim"]);
  await tidur(100);
  assert.deepEqual(sA.presensi, ["available", `composing:${P1}`, `paused:${P1}`]);
  assert.deepEqual(await stat(A.id), { masuk: 1, dibalas: 1, gagal: 0 });
});

await cek("keadaan chat tertulis ke database (sesi Hermes ke-1, 1 balasan di jendela ini)", async () => {
  const b = await chatDb(A.sesi, P1);
  assert.equal(b.sesi_ke, 1);
  assert.equal(b.jendela_n, 1);
  assert.equal(b.jeda_sampai, 0);
  assert.ok(kini() - b.last_at < 10);
  assert.deepEqual({ ...b }, { ...chatMemori(A.sesi, P1) });
});

await cek("selesai membalas: nomor kembali offline (HP pemilik tetap dapat notifikasi)", async () => {
  await tunggu(() => sA.presensi.at(-1) === "unavailable", 3500, "presence unavailable");
  assert.equal(sA.presensi.filter((p) => p === "available").length, 1);
});

await cek("pesan beruntun digabung jadi satu giliran AI; semuanya ditandai dibaca", async () => {
  const n0 = hermes.panggilan.length;
  const ids = [idBaru(), idBaru(), idBaru()];
  tiba(sA, pesan(P1, "satu", { id: ids[0] }));
  await tidur(250);
  tiba(sA, pesan(P1, "dua", { id: ids[1] }));
  await tidur(250);
  tiba(sA, pesan(P1, "tiga", { id: ids[2] }));
  await tunggu(() => sA.terkirim.length === 2, 5000);
  assert.equal(hermes.panggilan.length, n0 + 1);
  assert.equal(hermes.panggilan.at(-1).pesan, "satu\ndua\ntiga");
  assert.equal(hermes.panggilan.at(-1).sesi, hermes.panggilan[0].sesi); // percakapan yang sama
  assert.deepEqual(
    sA.dibaca.at(-1).map((k) => k.id),
    ids
  );
});

await cek("jenis pesan: teks panjang, pesan sementara, gambar dengan/ tanpa keterangan, lokasi", async () => {
  const n0 = hermes.panggilan.length;
  tiba(sA, pesan("555000201@lid", { extendedTextMessage: { text: "teks diperluas" } }));
  tiba(sA, pesan("555000202@lid", { ephemeralMessage: { message: { conversation: "pesan sementara" } } }));
  tiba(sA, pesan("555000203@lid", { imageMessage: { caption: "ini fotonya", mimetype: "image/jpeg" } }));
  tiba(sA, pesan("555000204@lid", { audioMessage: { mimetype: "audio/ogg" } }));
  tiba(sA, pesan("555000205@lid", { locationMessage: { degreesLatitude: 1, degreesLongitude: 2 } }));
  await tunggu(() => hermes.panggilan.length === n0 + 5, 5000);
  const isi = hermes.panggilan.slice(n0).map((p) => p.pesan).sort();
  assert.deepEqual(isi, [
    "[Pelanggan mengirim gambar/suara/berkas tanpa teks, yang tidak bisa kamu lihat]",
    "[Pelanggan mengirim gambar/suara/berkas tanpa teks, yang tidak bisa kamu lihat]",
    "ini fotonya\n[Pelanggan juga melampirkan media yang tidak bisa kamu lihat]",
    "pesan sementara",
    "teks diperluas",
  ]);
  await tunggu(() => sA.terkirim.length === 7, 5000);
});

// =====================================================================================
bagian("C. Yang tidak boleh dijawab");

await cek("grup, status, saluran, pesan protokol, reaksi, pesan kosong, chat dengan diri sendiri", async () => {
  const n0 = hermes.panggilan.length;
  const m0 = (await stat(A.id)).masuk;
  const baris0 = (await sql`SELECT COUNT(*) AS n FROM chat_state`)[0].n;
  const antre0 = globalThis.__waBridge.antre.size;
  tiba(sA, pesan("120363000000000000@g.us", "halo grup"));
  tiba(sA, pesan("status@broadcast", "status"));
  tiba(sA, pesan("120363111111111111@newsletter", "saluran"));
  tiba(sA, pesan("555000301@lid", { protocolMessage: { type: 0 } }));
  tiba(sA, pesan("555000301@lid", { reactionMessage: { text: "👍" } }));
  tiba(sA, pesan("555000301@lid", { senderKeyDistributionMessage: { groupId: "x" } }));
  tiba(sA, { key: { remoteJid: "555000301@lid", id: idBaru(), fromMe: false }, messageTimestamp: kini(), messageStubType: 1 });
  // pesan protokol antar-perangkat & "catatan untuk diri sendiri": bukan balasan manusia ke pelanggan
  tiba(sA, pesan("6281100000001@s.whatsapp.net", "catatan sendiri", { dariSaya: true }));
  tiba(sA, pesan("777000111@lid", "catatan sendiri", { dariSaya: true }));
  await tidur(2600);
  assert.equal(hermes.panggilan.length, n0);
  assert.equal((await stat(A.id)).masuk, m0);
  assert.equal((await sql`SELECT COUNT(*) AS n FROM chat_state`)[0].n, baris0);
  assert.equal(globalThis.__waBridge.antre.size, antre0);
});

await cek("pesan lama (menumpuk saat offline) dan pesan ganda", async () => {
  const n0 = hermes.panggilan.length;
  tiba(sA, pesan("555000302@lid", "pesan 5 menit lalu", { waktu: kini() - 300 }));
  const id = idBaru();
  tiba(sA, pesan("555000303@lid", "sekali saja", { id }));
  tiba(sA, pesan("555000303@lid", "sekali saja", { id }));
  sA.pancar("messages.upsert", { messages: [pesan("555000303@lid", "sekali saja", { id })], type: "append" });
  await tidur(2800);
  assert.equal(hermes.panggilan.length, n0 + 1);
  assert.equal(hermes.panggilan.at(-1).pesan, "sekali saja");
});

await cek("balasan otomatis dimatikan: pesan dihitung tetapi tidak dijawab", async () => {
  const n0 = hermes.panggilan.length;
  const m0 = (await stat(A.id)).masuk;
  await setBotAktif(A.id, false); // seperti saklar di dashboard: langsung berlaku tanpa restart
  tiba(sA, pesan("555000304@lid", "ada orang?"));
  await tidur(2600);
  await setBotAktif(A.id, true);
  assert.equal(hermes.panggilan.length, n0);
  assert.equal((await stat(A.id)).masuk, m0 + 1);
});

// =====================================================================================
bagian("D. Serah-terima manusia <-> AI");
const P2 = "555000401@lid";

await cek("manusia membalas dari HP sebelum AI: jawaban AI batal dan chat dijeda", async () => {
  const n0 = hermes.panggilan.length;
  const k0 = sA.terkirim.length;
  tiba(sA, pesan(P2, "kak mau pesan"));
  await tidur(300);
  tiba(sA, pesan(P2, "Siap kak, saya bantu ya", { dariSaya: true }));
  await tidur(2600);
  assert.equal(hermes.panggilan.length, n0);
  assert.equal(sA.terkirim.length, k0);
  const sisa = chatMemori(A.sesi, P2).jeda_sampai - kini();
  assert.ok(sisa > 29 * 60 && sisa <= 30 * 60, `dijeda ±30 menit (${sisa} dtk)`);
  assert.equal((await chatDb(A.sesi, P2)).jeda_sampai, chatMemori(A.sesi, P2).jeda_sampai); // juga tersimpan
  tiba(sA, pesan(P2, "oke kak")); // selama jeda, manusia yang memegang chat
  await tidur(2600);
  assert.equal(hermes.panggilan.length, n0);
});

await cek("jeda bertahan walau server dimulai ulang (dimuat lagi dari database)", async () => {
  const n0 = hermes.panggilan.length;
  const k = kunciChat(A.sesi, P2);
  const catatanLama = globalThis.__waBridge.antre.get(k).catatan;
  globalThis.__waBridge.antre.delete(k); // memori hilang, seperti setelah restart
  tiba(sA, pesan(P2, "masih ada kak?"));
  await tidur(2600);
  assert.equal(hermes.panggilan.length, n0, "chat tetap dijeda");
  assert.ok(chatMemori(A.sesi, P2).jeda_sampai > kini());
  globalThis.__waBridge.antre.get(k).catatan = catatanLama;
});

await cek("jeda habis: AI lanjut dan tahu apa yang dibalas pemilik nomor", async () => {
  const n0 = hermes.panggilan.length;
  chatMemori(A.sesi, P2).jeda_sampai = 0;
  tiba(sA, pesan(P2, "jadi totalnya berapa?"));
  await tunggu(() => hermes.panggilan.length === n0 + 1, 4000);
  const h = hermes.panggilan.at(-1);
  assert.equal(h.pesan, "jadi totalnya berapa?");
  // Isi chat yang tidak dilihat AI, urut waktu: pesan yang sempat batal dijawab, balasan manusia, dan
  // pesan pelanggan selagi AI diam (juga yang tiba setelah memori hilang). Pesan yang sedang dijawab tidak diulang.
  const blok = h.sistem.match(/<catatan_percakapan>([\s\S]*)<\/catatan_percakapan>/)?.[1] ?? "";
  assert.match(blok, /Pelanggan: kak mau pesan\n.*Pemilik nomor: Siap kak, saya bantu ya\n.*Pelanggan: oke kak\n.*Pelanggan: masih ada kak\?/);
  assert.doesNotMatch(blok, /jadi totalnya berapa/);
  assert.match(blok, /^\n.*belum ada di ingatanmu/);
  await tunggu(() => sA.terkirim.at(-1)?.jid === P2, 4000);
});

await cek("giliran berikutnya di sesi yang sama: isi chat yang sudah dilihat AI tidak dikirim ulang", async () => {
  const n0 = hermes.panggilan.length;
  await bridge.tulisTuntas();
  tiba(sA, pesan(P2, "oke ditunggu"));
  await tunggu(() => hermes.panggilan.length === n0 + 1, 4000);
  assert.equal(hermes.panggilan.at(-1).pesan, "oke ditunggu");
  assert.doesNotMatch(hermes.panggilan.at(-1).sistem, /<catatan_percakapan>/);
  await tunggu(() => sA.terkirim.at(-1)?.jid === P2 && sA.terkirim.at(-1).isi.text.includes("oke ditunggu"), 4000);
});

await cek("kiriman bot sendiri tidak pernah dianggap balasan manusia", async () => {
  const milikBot = sA.terkirim.at(-1);
  tiba(sA, pesan(P2, milikBot.isi.text, { dariSaya: true, id: milikBot.id }));
  await tidur(150);
  assert.ok(chatMemori(A.sesi, P2).jeda_sampai <= kini());
});

const P3 = "555000402@lid";
await cek("chat dibuka di HP selagi menunggu: AI menahan diri selama tunggu_baca_detik, lalu mengambil alih", async () => {
  const n0 = hermes.panggilan.length;
  const t0 = Date.now();
  const id = idBaru();
  tiba(sA, pesan(P3, "permisi", { id }));
  await tidur(300);
  dibaca(sA, P3, { id });
  await tidur(2200);
  assert.equal(hermes.panggilan.length, n0, "belum dijawab: manusia sedang membuka chat");
  await tunggu(() => hermes.panggilan.length === n0 + 1, 3000);
  const selang = hermes.panggilan.at(-1).at - t0;
  assert.ok(selang >= 3200 && selang < 4200, `diambil alih ±3 dtk setelah dibuka (${selang} ms)`);
  await tunggu(() => sA.terkirim.at(-1)?.jid === P3, 4000);
});

const P4 = "555000403@lid";
await cek("chat dibuka saat AI sedang menyusun: jawaban ditahan, dikirim tanpa memanggil AI lagi", async () => {
  hermes.jedaMs = 1500;
  const n0 = hermes.panggilan.length;
  const k0 = sA.terkirim.length;
  tiba(sA, pesan(P4, "stok masih ada?"));
  await tunggu(() => hermes.panggilan.length === n0 + 1, 3000);
  await tidur(300);
  const tBuka = Date.now();
  dibaca(sA, P4);
  await tidur(2300); // AI sudah selesai (1,5 dtk), tetapi jawabannya tidak boleh terkirim dulu
  assert.equal(sA.terkirim.length, k0);
  await tunggu(() => sA.terkirim.length === k0 + 1, 3000);
  const selang = sA.terkirim.at(-1).at - tBuka;
  assert.ok(selang >= 2900, `dikirim setelah masa tunggu baca (${selang} ms)`);
  assert.equal(sA.terkirim.at(-1).isi.text, "*Jawaban* untuk: stok masih ada?");
  assert.equal(hermes.panggilan.length, n0 + 1);
  hermes.jedaMs = 40;
});

const P5 = "555000404@lid";
await cek("chat dibuka lalu manusia membalas: jawaban yang ditahan dibuang", async () => {
  hermes.jedaMs = 800;
  const n0 = hermes.panggilan.length;
  const k0 = sA.terkirim.length;
  tiba(sA, pesan(P5, "bisa COD?"));
  await tunggu(() => hermes.panggilan.length === n0 + 1, 3000);
  dibaca(sA, P5);
  await tidur(1500);
  tiba(sA, pesan(P5, "Bisa kak", { dariSaya: true }));
  await tidur(3500);
  assert.equal(sA.terkirim.length, k0);
  assert.ok(chatMemori(A.sesi, P5).jeda_sampai > kini());
  hermes.jedaMs = 40;
});

await cek("tanda terkirim / tanda-baca dari PELANGGAN atas pesan bot tidak dianggap 'chat dibuka'", async () => {
  const P = "555000405@lid";
  const n0 = hermes.panggilan.length;
  const t0 = Date.now();
  tiba(sA, pesan(P, "tes"));
  await tidur(200);
  dibaca(sA, P, { status: 3 }); // baru terkirim ke perangkat, belum dibaca
  dibaca(sA, P, { dariSaya: true, status: 4 }); // pelanggan membaca pesan kita
  await tunggu(() => hermes.panggilan.length === n0 + 1, 3000);
  assert.ok(hermes.panggilan.at(-1).at - t0 < 1800, "tetap dijawab setelah tunggu_detik biasa");
  await tunggu(() => sA.terkirim.at(-1)?.jid === P, 4000);
});

await cek("PN dan LID lawan bicara yang sama = satu percakapan; balasan ke alamat asal pesan", async () => {
  const PN = "6285700000009@s.whatsapp.net";
  const LID = "555000409@lid";
  const n0 = hermes.panggilan.length;
  const t0 = Date.now();
  tiba(sA, pesan(PN, "halo dari nomor", { alt: LID })); // pesan beralamat nomor telepon, LID di atribut
  await tidur(300);
  dibaca(sA, LID); // tanda-baca tiba dalam bentuk LID
  await tidur(1900);
  assert.equal(hermes.panggilan.length, n0, "tanda-baca LID mengenai percakapan yang masuk lewat PN");
  await tunggu(() => hermes.panggilan.length === n0 + 1, 3000);
  assert.ok(hermes.panggilan.at(-1).at - t0 >= 3200);
  assert.equal(hermes.panggilan.at(-1).sesi, `wa-${kunciChat(A.sesi, LID).slice(0, 24)}-1`);
  await tunggu(() => sA.terkirim.at(-1)?.jid === PN, 4000);
  // sebaliknya: tanda-baca berbentuk PN tanpa LID, pemetaannya dikenal penyimpanan Baileys
  const PN2 = "6285700000010@s.whatsapp.net";
  const LID2 = "555000410@lid";
  petaLid.set(PN2, "555000410:0@lid");
  const n1 = hermes.panggilan.length;
  tiba(sA, pesan(LID2, "halo dari lid"));
  await tidur(300);
  dibaca(sA, PN2);
  await tidur(1900);
  assert.equal(hermes.panggilan.length, n1, "tanda-baca PN mengenai percakapan yang masuk lewat LID");
  await tunggu(() => sA.terkirim.at(-1)?.jid === LID2, 5000);
});

await cek("histori percakapan mencatat pesan pelanggan, balasan AI, dan balasan manusia dari HP", async () => {
  await bridge.tulisTuntas();
  const { daftarPercakapan, ambilPesanPercakapan, ringkasanPercakapan } = await lib("src/lib/percakapan.ts");
  const ringkas = await ringkasanPercakapan(A.id);
  assert.ok(ringkas.total_percakapan >= 6);
  assert.ok(ringkas.total_masuk >= 10);
  assert.ok(ringkas.total_bot >= 5);
  assert.ok(ringkas.total_manusia >= 2);
  const { daftar } = await daftarPercakapan(A.id, { batas: 50 });
  const chatPnLid = daftar.find((p) => p.telepon === "6285700000009");
  assert.ok(chatPnLid, "nomor telepon dari PN JID tercatat pada percakapan ber-LID");
  assert.equal(chatPnLid.masuk_n, 1);
  assert.equal(chatPnLid.bot_n, 1);
  const chatManusia = daftar.find((p) => p.manusia_n > 0 && p.bot_n > 0);
  assert.ok(chatManusia, "percakapan dengan serah-terima manusia <-> AI tercatat lengkap");
  const rinci = await ambilPesanPercakapan(A.id, chatManusia.id);
  assert.ok(rinci.pesan.some((m) => m.peran === 0));
  assert.ok(rinci.pesan.some((m) => m.peran === 2 && m.teks === "Siap kak, saya bantu ya"));
  assert.ok(rinci.pesan.some((m) => m.peran === 1));
});

// =====================================================================================
bagian("D2. Belajar dari balasan manusia");
const pl = await lib("src/lib/pelajaran.ts");
const { setBelajar } = await lib("src/lib/numbers.ts");
// Event diproses asinkron: beri waktu sampai tulisnya masuk antrean, baru tunggu antrean itu tuntas.
const pelajaranA = async () => (await tidur(150), await bridge.tulisTuntas(), [...(await sql`SELECT pertanyaan, jawaban, kali FROM pelajaran WHERE number_id = ${A.id} ORDER BY id`)]);
const REK = "Transfer via BCA 0955193763 a/n PT Suka Profit Berkah ya kak, lalu kirim buktinya di sini";

await cek("balasan manusia yang berisi dipelajari bersama pertanyaan pelanggannya; balasan pendek dilewati", async () => {
  const P = "555000420@lid";
  const awal = (await pelajaranA()).length;
  tiba(sA, pesan(P, "kak bayarnya transfer ke rekening mana ya?"));
  await tidur(200);
  tiba(sA, pesan(P, REK, { dariSaya: true }));
  await tidur(100);
  tiba(sA, pesan(P, "ok kak", { dariSaya: true }));
  tiba(sA, pesan(P, { imageMessage: { mimetype: "image/jpeg" } }, { dariSaya: true }));
  const semua = await pelajaranA();
  assert.equal(semua.length, awal + 1);
  assert.deepEqual({ ...semua.at(-1) }, { pertanyaan: "kak bayarnya transfer ke rekening mana ya?", jawaban: REK, kali: 1 });
});

await cek("balasan kembar (beda huruf besar/spasi) dari chat lain = satu baris, dihitung 2x", async () => {
  const P = "555000421@lid";
  const awal = (await pelajaranA()).length;
  tiba(sA, pesan(P, "rekening buat transfer apa kak"));
  await tidur(200);
  tiba(sA, pesan(P, `  ${REK.toUpperCase().replace(/ /g, "  ")} `, { dariSaya: true }));
  const semua = await pelajaranA();
  assert.equal(semua.length, awal);
  const r = semua.find((x) => x.jawaban.includes("0955193763"));
  assert.equal(r.kali, 2);
  assert.equal(r.pertanyaan, "rekening buat transfer apa kak"); // pertanyaan terbaru
});

await cek("pelanggan lain bertanya hal serupa: balasan admin ikut jadi pengetahuan AI", async () => {
  const P = "555000422@lid";
  const n0 = hermes.panggilan.length;
  tiba(sA, pesan(P, "Halo min, mau transfer, nomor rekeningnya berapa?"));
  await tunggu(() => hermes.panggilan.length === n0 + 1, 4000);
  const s = hermes.panggilan.at(-1).sistem;
  const pengetahuan = s.match(/<pengetahuan_nomor>([\s\S]*)<\/pengetahuan_nomor>/)[1];
  assert.match(pengetahuan, /KODEUNIK-A/); // base knowledge tetap ada
  assert.match(pengetahuan, /## Balasan admin sebelumnya[\s\S]*JANGAN menyebut detail milik pelanggan lain[\s\S]*Pelanggan: rekening buat transfer apa kak\nAdmin: .*0955193763/);
  assert.doesNotMatch(s, /<catatan_percakapan>/, "chat baru tanpa riwayat: tidak ada blok isi chat");
  await tunggu(() => sA.terkirim.at(-1)?.jid === P, 4000);
});

await cek("pertanyaan yang tidak berhubungan / hanya sapaan: tidak ada balasan admin yang disisipkan", async () => {
  const P = "555000423@lid";
  const n0 = hermes.panggilan.length;
  tiba(sA, pesan(P, "selamat pagi min"));
  await tunggu(() => hermes.panggilan.length === n0 + 1, 4000);
  assert.doesNotMatch(hermes.panggilan.at(-1).sistem, /Balasan admin sebelumnya/);
  await tunggu(() => sA.terkirim.at(-1)?.jid === P, 4000);
  assert.equal((await pl.konteksPelajaran(A.id, "jam:* | buka:*")).n, 0);
});

await cek("belajar dimatikan: balasan baru tidak disimpan dan yang tersimpan tidak dipakai", async () => {
  await setBelajar(A.id, false);
  try {
    const P = "555000424@lid";
    const awal = (await pelajaranA()).length;
    tiba(sA, pesan(P, "kalau pesan untuk acara kantor bisa?"));
    await tidur(200);
    tiba(sA, pesan(P, "Bisa kak, untuk acara kantor minimal pesan 20 porsi ya", { dariSaya: true }));
    assert.equal((await pelajaranA()).length, awal);
    const P2b = "555000425@lid";
    const n0 = hermes.panggilan.length;
    tiba(sA, pesan(P2b, "nomor rekening transfer berapa?"));
    await tunggu(() => hermes.panggilan.length === n0 + 1, 4000);
    assert.doesNotMatch(hermes.panggilan.at(-1).sistem, /Balasan admin sebelumnya|0955193763/);
    await tunggu(() => sA.terkirim.at(-1)?.jid === P2b, 4000);
  } finally {
    await setBelajar(A.id, true);
  }
});

await cek("dashboard: daftar berkursor, hapus satu & semua hanya untuk nomor itu; batas baris per nomor", async () => {
  const lain = await nomorCepat("Toko Lain");
  await sql`INSERT INTO pelajaran (number_id, sidik, jawaban, terakhir_pada) VALUES (${lain.id}, 'x1', 'jawaban toko lain yang cukup panjang', ${kini()})`;
  const kosong = await pl.konteksPelajaran(lain.id, "rekening:* | transfer:*");
  assert.equal(kosong.n, 0, "pelajaran Toko A tidak bocor ke nomor lain");
  // isi 45 baris tambahan ke Toko A lalu baca berhalaman 20 + 20 + sisa
  const kini0 = kini();
  await sql`INSERT INTO pelajaran ${sql(Array.from({ length: 45 }, (_, i) => ({ number_id: A.id, sidik: `isi${i}`, pertanyaan: `tanya ${i}`, jawaban: `jawaban nomor ${i} yang cukup panjang`, terakhir_pada: kini0 - 1000 - (i % 5) })))}`;
  const total = await pl.jumlahPelajaran(A.id);
  const h1 = await pl.daftarPelajaran(A.id);
  const a1 = h1.daftar.at(-1);
  const h2 = await pl.daftarPelajaran(A.id, { waktu: a1.terakhir_pada, id: a1.id });
  const a2 = h2.daftar.at(-1);
  const h3 = await pl.daftarPelajaran(A.id, { waktu: a2.terakhir_pada, id: a2.id });
  assert.equal(h1.daftar.length, 20);
  assert.ok(h1.adaLagi && h2.adaLagi && !h3.adaLagi);
  const ids = [...h1.daftar, ...h2.daftar, ...h3.daftar].map((x) => x.id);
  assert.equal(new Set(ids).size, total, "tiap baris muncul tepat sekali");
  assert.equal(await pl.hapusPelajaran(lain.id, h1.daftar[0].id), 0, "tidak bisa menghapus milik nomor lain");
  assert.equal(await pl.hapusPelajaran(A.id, h1.daftar[0].id), 1);
  // batas per nomor: setiap 50 tulis, kelebihan di atas BATAS_PELAJARAN (yang paling lama) dibuang
  await sql`INSERT INTO pelajaran ${sql(Array.from({ length: pl.BATAS_PELAJARAN }, (_, i) => ({ number_id: lain.id, sidik: `b${i}`, jawaban: `isi ${i}`, terakhir_pada: kini0 - 5000 + i })))}`;
  globalThis.__waPelajaran.tulis = 49;
  await pl.pelajariBalasan({ numberId: lain.id, kunci: "tidak-ada", jawaban: "Balasan baru yang cukup panjang untuk dipelajari", waktu: kini0 });
  assert.equal(await pl.jumlahPelajaran(lain.id), pl.BATAS_PELAJARAN);
  assert.equal((await sql`SELECT COUNT(*)::int AS n FROM pelajaran WHERE number_id = ${lain.id} AND sidik IN ('b0', 'b1')`)[0].n, 0, "yang paling lama dibuang");
  assert.equal((await sql`SELECT COUNT(*)::int AS n FROM pelajaran WHERE number_id = ${lain.id} AND sidik IN ('x1', 'b2')`)[0].n, 2);
  assert.equal(await pl.hapusPelajaran(lain.id), pl.BATAS_PELAJARAN);
  assert.ok((await pl.jumlahPelajaran(A.id)) > 0);
});

await cek("ukuran: pencarian pelajaran & isi chat untuk AI tetap cepat (30 nomor x 500 pelajaran)", async () => {
  // 29 nomor tiruan (langsung lewat SQL, dihapus lagi di akhir) + Toko A
  const tiruan = (await sql`INSERT INTO numbers (sesi, label, created_at) SELECT 'ukur' || g, 'ukur', 0 FROM generate_series(1, 29) g RETURNING id`).map((r) => r.id);
  const baris = [];
  for (const id of [A.id, ...tiruan])
    for (let i = 0; i < 500; i++) baris.push({ number_id: id, sidik: `ukur${i}`, pertanyaan: `pertanyaan pelanggan ${i} soal menu porsi harga ongkir`, jawaban: `jawaban admin ${i} tentang pengiriman, pembayaran, dan jam buka outlet`, terakhir_pada: kini() - i });
  for (let i = 0; i < baris.length; i += 2000) await sql`INSERT INTO pelajaran ${sql(baris.slice(i, i + 2000))} ON CONFLICT DO NOTHING`;
  await sql`ANALYZE pelajaran`;
  const { kueriCari } = await lib("src/lib/knowledge.ts");
  const q = kueriCari(pl.saringKueri("min ongkir ke bekasi berapa ya, bayarnya transfer bisa?"));
  const rencana = (await sql.unsafe(
    `EXPLAIN (ANALYZE, BUFFERS) SELECT p.pertanyaan, p.jawaban FROM to_tsquery('simple', $1) q, pelajaran p
      WHERE p.number_id = $2 AND p.cari @@ q ORDER BY ts_rank(p.cari, q, 1) DESC, p.kali DESC, p.terakhir_pada DESC LIMIT 3`,
    [q, A.id]
  )).map((r) => r["QUERY PLAN"]);
  const ms = Number(rencana.at(-1).match(/([\d.]+) ms/)[1]);
  assert.match(rencana.join("\n"), /Index Scan|Bitmap Index Scan/, "memakai indeks number_id, bukan memindai semua nomor");
  assert.ok(ms < 20, `pencarian ${ms} ms`);
  const t = performance.now();
  for (let i = 0; i < 20; i++) await pl.konteksPelajaran(A.id, q);
  const rata = (performance.now() - t) / 20;
  const { riwayatUntukAi } = await lib("src/lib/percakapan.ts");
  const t2 = performance.now();
  for (let i = 0; i < 20; i++) await riwayatUntukAi(kunciChat(A.sesi, P2), { sesiBaru: true, tertunda: 0 });
  const rata2 = (performance.now() - t2) / 20;
  console.log(`        (${baris.length} baris: rencana ${ms} ms; konteksPelajaran ${rata.toFixed(2)} ms; riwayatUntukAi ${rata2.toFixed(2)} ms per panggilan)`);
  console.log(`        ${rencana.filter((r) => /Scan|Execution/.test(r)).map((r) => r.trim()).join("\n        ")}`);
  await sql`DELETE FROM pelajaran WHERE sidik LIKE 'ukur%'`;
  await sql`DELETE FROM numbers WHERE id IN ${sql(tiruan)}`;
});

// =====================================================================================
bagian("E. Batas dan galat");

await cek("batas laju per chat (10 balasan / 10 menit): yang ke-11 didiamkan (keadaan dari database)", async () => {
  const P = "555000501@lid";
  // chat ini belum ada di memori: jembatan harus memuat hitungannya dari database
  await sql`INSERT INTO chat_state(kunci, sesi_ke, last_at, jendela_awal, jendela_n) VALUES (${kunciChat(A.sesi, P)}, 3, ${kini()}, ${kini()}, 10)`;
  const n0 = hermes.panggilan.length;
  const k0 = sA.terkirim.length;
  tiba(sA, pesan(P, "spam ke-11"));
  await tidur(2600);
  assert.equal(hermes.panggilan.length, n0);
  assert.equal(sA.terkirim.length, k0);
  assert.equal(chatMemori(A.sesi, P).jendela_n, 10);
  assert.ok(sA.presensi.lastIndexOf(`paused:${P}`) > sA.presensi.lastIndexOf(`composing:${P}`), "indikator mengetik dimatikan lagi");
});

await cek("percakapan lama dilanjutkan dengan nomor sesi Hermes yang tersimpan; diam >12 jam = sesi baru", async () => {
  const P = "555000502@lid";
  await sql`INSERT INTO chat_state(kunci, sesi_ke, last_at, jendela_awal, jendela_n) VALUES (${kunciChat(A.sesi, P)}, 4, ${kini() - 13 * 3600}, ${kini() - 13 * 3600}, 2)`;
  const n0 = hermes.panggilan.length;
  tiba(sA, pesan(P, "halo lagi"));
  await tunggu(() => hermes.panggilan.length === n0 + 1, 4000);
  assert.equal(hermes.panggilan.at(-1).sesi, `wa-${kunciChat(A.sesi, P).slice(0, 24)}-5`);
  await tunggu(() => sA.terkirim.at(-1)?.jid === P, 4000);
  const b = await chatDb(A.sesi, P);
  assert.equal(b.sesi_ke, 5);
  assert.equal(b.jendela_n, 1);
});

await cek("AI gagal menjawab: tercatat sebagai galat, tidak ada pesan terkirim", async () => {
  const P = "555000503@lid";
  hermes.gagal = true;
  const g0 = (await stat(A.id)).gagal;
  const k0 = sA.terkirim.length;
  tiba(sA, pesan(P, "halo?"));
  await tunggu(async () => (await stat(A.id)).gagal === g0 + 1, 4000);
  hermes.gagal = false;
  assert.equal(sA.terkirim.length, k0);
  assert.match(JSON.parse(await getSetting("galat_terakhir")).pesan, /HTTP 500/);
  assert.match(JSON.parse((await sql`SELECT nilai FROM settings WHERE kunci = 'galat_terakhir'`)[0].nilai).pesan, /HTTP 500/);
});

await cek("WhatsApp gagal mengirim: tercatat sebagai galat", async () => {
  const P = "555000504@lid";
  sA.gagalKirim = true;
  const g0 = (await stat(A.id)).gagal;
  const d0 = (await stat(A.id)).dibalas;
  tiba(sA, pesan(P, "halo?"));
  await tunggu(async () => (await stat(A.id)).gagal === g0 + 1, 5000);
  sA.gagalKirim = false;
  assert.equal((await stat(A.id)).dibalas, d0);
});

// =====================================================================================
bagian("F. Putus, sambung ulang, logout");

await cek("koneksi putus (428): menyambung ulang sendiri dengan kredensial yang sama", async () => {
  const awal = soket.length;
  sA.tutup(428);
  assert.equal(wa.infoSesi(A.sesi).status, "STARTING");
  assert.ok((await auth(A.sesi)) > 0);
  await assert.rejects(wa.kirimTeks(A.sesi, P1, "x"), /tidak terhubung/);
  const baru = await tunggu(() => soket[awal], 3000, "soket sambung ulang");
  assert.equal(baru.config.auth.creds.me.id, "6281100000001:5@s.whatsapp.net");
  baru.pancar("connection.update", { connection: "open" });
  assert.equal(wa.infoSesi(A.sesi).status, "WORKING");
  sA = baru;
});

await cek("putus berulang: jeda sambung ulang makin panjang (1 dtk, 2 dtk, ...)", async () => {
  let awal = soket.length;
  let t = Date.now();
  sA.tutup(503);
  let s = await tunggu(() => soket[awal], 3000);
  const j1 = Date.now() - t;
  awal = soket.length;
  t = Date.now();
  s.tutup(503);
  s = await tunggu(() => soket[awal], 5000);
  const j2 = Date.now() - t;
  assert.ok(j1 >= 950 && j1 < 2300, `percobaan 1: ${j1} ms`);
  assert.ok(j2 >= 1950 && j2 < 3400, `percobaan 2: ${j2} ms`);
  s.pancar("connection.update", { connection: "open" });
  sA = s;
});

await cek("versi klien ditolak WhatsApp (405): ambil versi terbaru lalu sambung lagi", async () => {
  const awal = soket.length;
  const diminta = versiDiminta;
  sA.tutup(405);
  const s = await tunggu(() => soket[awal], 3000);
  assert.equal(versiDiminta, diminta + 1); // dipaksa ambil ulang walau masih dalam cache sejam
  assert.deepEqual(s.config.version, [2, 3000, 999]);
  s.pancar("connection.update", { connection: "open" });
  sA = s;
});

await cek("sesi digantikan koneksi lain (440): tidak berebut; hubungkan() memaksa sambung sekarang", async () => {
  const awal = soket.length;
  sA.tutup(440);
  await tidur(2500);
  assert.equal(soket.length, awal, "tidak langsung menyambung ulang");
  assert.equal(wa.infoSesi(A.sesi).status, "STARTING");
  const p = wa.hubungkan(A.sesi);
  const s = await tunggu(() => soket[awal], 1000);
  s.pancar("connection.update", { connection: "open" });
  await p;
  assert.equal(wa.infoSesi(A.sesi).status, "WORKING");
  sA = s;
});

await cek("logout dari dashboard: perangkat dicabut, kredensial dibuang, tidak menyambung ulang", async () => {
  const awal = soket.length;
  await wa.logout(A.sesi);
  assert.equal(sA.keluar, 1);
  assert.equal(await auth(A.sesi), 0);
  const i = wa.infoSesi(A.sesi);
  assert.equal(i.status, "STOPPED");
  assert.equal(i.waId, null);
  sA.tutup(401); // gema penutupan dari soket lama
  await tidur(1500);
  assert.equal(soket.length, awal);
  assert.equal(wa.infoSesi(A.sesi).alasan, null);
});

await cek("dikeluarkan dari HP (401): kredensial dibuang, ada penjelasan, perlu scan ulang", async () => {
  const { n, s } = await nomorTerhubung("Toko Keluar", "6281100000077", "777000177");
  const awal = soket.length;
  s.tutup(401);
  const i = wa.infoSesi(n.sesi);
  assert.equal(i.status, "STOPPED");
  assert.match(i.alasan, /dikeluarkan dari WhatsApp/);
  assert.equal(await auth(n.sesi), 0);
  await tidur(1500);
  assert.equal(soket.length, awal);
  // menautkan lagi setelah dikeluarkan: mulai dari kredensial baru, bukan sisa yang lama
  const p = wa.hubungkan(n.sesi);
  const s3 = await tunggu(() => soket[awal], 2000);
  assert.equal(s3.config.auth.creds.me, undefined);
  s3.pancar("connection.update", { qr: "2@LAGI,a,b,c,1" });
  await p;
  await wa.hapusSesi(n.sesi);
});

await cek("nomor dihapus: sesi hilang dari memori dan database", async () => {
  const { n, s } = await nomorTerhubung("Toko Hapus", "6281100000078", "777000178");
  await wa.hapusSesi(n.sesi);
  assert.equal(s.keluar, 1);
  assert.equal(await auth(n.sesi), 0);
  assert.equal(wa.infoSesi(n.sesi).status, "BELUM_ADA");
});

// =====================================================================================
bagian("G. Banyak nomor sekaligus");
const banyak = [];

await cek("12 nomor terhubung bersamaan, masing-masing dengan knowledge dan soketnya sendiri", async () => {
  for (let i = 1; i <= 12; i++) {
    const r = await nomorTerhubung(`Nomor ${i}`, `62822000000${String(i).padStart(2, "0")}`, `8880000${String(i).padStart(2, "0")}`);
    await tambahDokumen({ numberId: r.n.id, judul: "Info", sumber: "teks", teks: `Kamu asisten usaha nomor ${i}. RAHASIA-${i}-X.` });
    banyak.push(r);
  }
  assert.equal(banyak.filter((r) => wa.infoSesi(r.n.sesi).status === "WORKING").length, 12);
  const wa_id = new Set();
  for (const r of banyak) wa_id.add((await nomorById(r.n.id)).wa_id);
  assert.equal(wa_id.size, 12);
});

await cek("12 pesan tiba serentak: 12 balasan, tiap nomor memakai knowledge-nya sendiri", async () => {
  const n0 = hermes.panggilan.length;
  const PEL = "555000900@lid"; // pelanggan yang sama menghubungi semua nomor
  const t0 = Date.now();
  banyak.forEach((r, i) => tiba(r.s, pesan(PEL, `tanya nomor ${i + 1}`)));
  await tunggu(() => banyak.every((r) => r.s.terkirim.length === 1), 6000, "12 balasan");
  const lama = Date.now() - t0;
  const p = hermes.panggilan.slice(n0);
  assert.equal(p.length, 12);
  assert.equal(new Set(p.map((x) => x.sesi)).size, 12, "percakapan per nomor terpisah walau pelanggannya sama");
  banyak.forEach((r, i) => {
    const h = p.find((x) => x.pesan === `tanya nomor ${i + 1}`);
    assert.match(h.sistem, new RegExp(`RAHASIA-${i + 1}-X`));
    assert.equal((h.sistem.match(/RAHASIA-/g) ?? []).length, 1, "tidak ada knowledge nomor lain yang bocor");
    assert.equal(r.s.terkirim[0].isi.text, `*Jawaban* untuk: tanya nomor ${i + 1}`);
    assert.equal(r.s.terkirim[0].jid, PEL);
  });
  assert.ok(lama < 2600, `12 balasan dalam ${lama} ms`);
  console.log(`        (12 balasan selesai ${lama} ms setelah pesan tiba; 1.000 ms di antaranya masa tunggu manusia, 1.200 ms jeda mengetik)`);
});

await cek("server mulai ulang: hanya nomor terpasang yang disambungkan, bergiliran; sisa kunci yatim dibuang", async () => {
  const belum = await tambahNomor("Belum dipasangkan");
  (await bukaAuth(B, belum.sesi)).simpanCreds(); // punya kunci sementara, belum pernah scan
  (await bukaAuth(B, "sesi-yatim")).simpanCreds();
  await tungguTulis(belum.sesi);
  await tungguTulis("sesi-yatim");
  // tiru proses baru: memori kosong, database tetap
  const st = globalThis.__waGerbang;
  for (const s of st.sesi.values()) if (s.timer) clearTimeout(s.timer);
  st.sesi.clear();
  st.dimulai = false;
  const awal = soket.length;
  const t0 = Date.now();
  await wa.mulaiGerbang();
  assert.equal(await auth("sesi-yatim"), 0);
  assert.equal(wa.infoSesi(belum.sesi).status, "BELUM_ADA");
  assert.equal(banyak.every((r) => wa.infoSesi(r.n.sesi).status === "STARTING"), true);
  await tidur(1000);
  const cepat = soket.length - awal;
  assert.ok(cepat >= 1 && cepat <= 3, `setelah 1 dtk baru ${cepat} soket (bergiliran, bukan serentak)`);
  await tunggu(() => soket.length - awal === 12, 12000, "12 soket");
  const lama = Date.now() - t0;
  assert.ok(lama > 7000 && lama < 10500, `12 nomor tersambung dalam ${lama} ms`);
  await tidur(900);
  assert.equal(soket.length - awal, 12, "nomor yang belum dipasangkan tidak dibuatkan soket");
  const baru = soket.slice(awal);
  assert.deepEqual(baru.map((s) => s.config.auth.creds.me.id).sort(), banyak.map((r) => r.s.user.id).sort());
  baru.forEach((s) => s.pancar("connection.update", { connection: "open" }));
  assert.equal(banyak.every((r) => wa.infoSesi(r.n.sesi).status === "WORKING"), true);
  console.log(`        (12 nomor tersambung ulang dalam ${lama} ms)`);
});

await cek("database sempat tidak terjangkau saat server mulai: gerbang mencoba lagi sendiri", async () => {
  const st = globalThis.__waGerbang;
  for (const s of st.sesi.values()) if (s.timer) clearTimeout(s.timer);
  st.sesi.clear();
  st.dimulai = false;
  const awal = soket.length;
  await tidur(800); // biarkan pencatatan "terhubung" dari uji sebelumnya selesai dulu
  // putuskan pool app, lalu matikan PostgreSQL
  const pool = globalThis.__waPg;
  await pool.sql.end({ timeout: 2 });
  globalThis.__waPg = undefined;
  await pg.berhentiSementara();
  const galat = console.error;
  const catatan = [];
  console.error = (...a) => catatan.push(a.join(" "));
  await wa.mulaiGerbang(); // gagal, menjadwalkan percobaan berikutnya
  console.error = galat;
  assert.equal(soket.length, awal);
  assert.match(catatan.join("\n"), /database belum siap/);
  await pg.lanjut();
  await tunggu(() => soket.length - awal === 12, 25000, "tersambung setelah database kembali");
});

await bridge.tulisTuntas();
console.log(`\n${gagalList.length ? "ADA YANG GAGAL" : "SEMUA LOLOS"}: ${lolos} lolos, ${gagalList.length} gagal, ${((Date.now() - mulaiSemua) / 1000).toFixed(0)} dtk`);
if (gagalList.length) console.log("Gagal:\n- " + gagalList.join("\n- "));
server.close();
for (const s of globalThis.__waGerbang.sesi.values()) if (s.timer) clearTimeout(s.timer);
await globalThis.__waPg?.sql.end({ timeout: 2 }).catch(() => {});
await pg.berhenti().catch(() => {});
process.exit(gagalList.length ? 1 : 0);
