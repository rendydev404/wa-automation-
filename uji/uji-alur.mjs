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
// Pengali waktu (src/lib/skala-waktu.ts): timer jembatan WhatsApp DAN jeda di uji ini diperpendek dengan faktor yang
// sama, jadi urutan kejadian tetap persis sama. WA_SKALA_WAKTU=1 menjalankan uji dengan waktu sungguhan.
process.env.WA_SKALA_WAKTU ??= "0.2";
const SKALA = Number(process.env.WA_SKALA_WAKTU) > 0 && Number(process.env.WA_SKALA_WAKTU) < 1 ? Number(process.env.WA_SKALA_WAKTU) : 1;
const w = (ms) => Math.max(1, Math.round(ms * SKALA));
process.env.AI_JEDA_ULANG_MS = `${w(300)},${w(600)}`;
process.env.ML_PELUANG_AUDIT = "0"; // audit acak penyaring prospek dimatikan supaya uji pasti
const lib = (f) => import(pathToFileURL(path.join(akar, f)).href);
const tidur = (ms) => new Promise((r) => setTimeout(r, w(ms)));
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
const hermes = { panggilan: [], jedaMs: 40, gagal: false, jawab: null }; // jawab(p): isi jawaban khusus (null = bawaan)
const unduhan = []; // id pesan yang fotonya diunduh (Baileys tiruan)
const server = http.createServer((req, res) => {
  let b = "";
  req.on("data", (c) => (b += c));
  req.on("end", () => {
    if (req.url.endsWith("/models")) return res.end("{}");
    // Transkripsi pesan suara tiruan (API kompatibel OpenAI/Groq).
    if (req.url.endsWith("/audio/transcriptions")) {
      hermes.transkripsi = (hermes.transkripsi ?? 0) + 1;
      return res.end(JSON.stringify({ text: " mau pesan dua ayam geprek ya kak " }));
    }
    const j = JSON.parse(b);
    const isi = j.messages[1].content;
    const p = {
      sesi: req.headers["x-hermes-session-id"],
      sistem: j.messages[0].content,
      pesan: Array.isArray(isi) ? isi.find((x) => x.type === "text").text : isi,
      gambar: Array.isArray(isi) ? isi.filter((x) => x.type === "image_url").map((x) => x.image_url.url) : [],
      at: Date.now(),
    };
    hermes.panggilan.push(p);
    setTimeout(() => {
      // gagal: true = selalu gagal; angka = gagal sebanyak itu lalu pulih.
      if (hermes.gagal === true || hermes.gagal > 0) {
        if (typeof hermes.gagal === "number") hermes.gagal -= 1;
        res.statusCode = 500;
        return res.end("galat");
      }
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ choices: [{ message: { content: hermes.jawab?.(p) ?? `**Jawaban** untuk: ${p.pesan}` } }] }));
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
let gagalBuat = 0; // >0: pembuatan soket berikutnya gagal sebanyak itu (mis. jaringan/database tak terjangkau)
function buatSoket(config) {
  if (gagalBuat > 0) {
    gagalBuat -= 1;
    throw new Error("tidak terjangkau (uji)");
  }
  const ev = new EventEmitter();
  const ws = new EventEmitter();
  const s = {
    config,
    ev,
    ws,
    terkirim: [],
    dibaca: [],
    presensi: [],
    urutan: [],
    acks: [],
    dirtyCleaned: [],
    keluar: 0,
    ditutup: 0,
    gagalKirim: false,
    get user() {
      return config.auth.creds.me;
    },
    peta: [],
    signalRepository: { lidMapping: { getLIDForPN: async (pn) => petaLid.get(pn) ?? null, storeLIDPNMappings: async (daftar) => void s.peta.push(...daftar) } },
    async sendMessageAck(node, errorCode) {
      s.acks.push({ from: node?.attrs?.from, errorCode });
    },
    async cleanDirtyBits(type, ts) {
      s.dirtyCleaned.push({ type, ts });
    },
    async sendMessage(jid, isi, opsi) {
      if (s.gagalKirim) throw new Error("kirim gagal");
      s.terkirim.push({ jid, isi, id: opsi.messageId, kutip: opsi.quoted?.key?.id ?? null, at: Date.now() });
      s.urutan.push("kirim");
      return { key: { id: opsi.messageId } };
    },
    async readMessages(keys) {
      s.dibaca.push(keys);
      s.urutan.push("baca");
    },
    async sendPresenceUpdate(t, jid) {
      s.presensi.push(jid ? `${t}:${jid}` : t);
      if (t === "composing" || t === "paused") s.urutan.push(t === "composing" ? "ketik" : "berhenti");
    },
    async resyncAppState(k) {
      s.resync = k;
    },
    async requestPairingCode(nomorHp) {
      s.pairingNomor = nomorHp;
      config.auth.creds.pairingCode = "ABCD1234";
      config.auth.creds.me = { id: `${nomorHp}@s.whatsapp.net`, name: "~" };
      ev.emit("creds.update", config.auth.creds);
      return "ABCD1234";
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
  // Unduh media tiruan: isi foto = "FOTO-<id pesan>"; keterangan berisi GAGAL = jaringan putus.
  downloadMediaMessage: async (m) => {
    unduhan.push(m.key.id);
    if (/GAGAL/.test(m.message?.imageMessage?.caption ?? "")) throw new Error("unduh gagal");
    return Buffer.from(`FOTO-${m.key.id}`);
  },
  fetchLatestWaWebVersion: async () => {
    versiDiminta += 1;
    return { version: [2, 3000, 999], isLatest: true };
  },
});

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
const chatDb = async (sesi, chat) => (await bridge.tulisTuntas(), (await sql`SELECT sesi_ke, last_at, jeda_sampai, jendela_awal, jendela_n, prospek, strike, bisu_sampai FROM chat_state WHERE kunci = ${kunciChat(sesi, chat)}`)[0] ?? null);
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
  // Penyaring prospek dimatikan di nomor uji biasa (diuji tersendiri di bagian "Penyaring prospek").
  await sql`UPDATE numbers SET tunggu_detik = 1, tunggu_baca_detik = 3, jeda_detik = 1800, saring_prospek = false WHERE id = ${n.id}`;
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

await cek("hubungkan() membuat soket hemat: tanpa riwayat, tetap offline, grup/saluran/daftar siaran dibuang, status diproses Baileys", async () => {
  const p = wa.hubungkan(A.sesi);
  const s = await tunggu(() => soket[0]);
  assert.equal(wa.infoSesi(A.sesi).status, "STARTING");
  const c = s.config;
  assert.equal(c.markOnlineOnConnect, false);
  assert.equal(c.syncFullHistory, false);
  assert.equal(c.emitOwnEvents, false);
  assert.equal(c.shouldSyncHistoryMessage({}), false);
  assert.equal(c.shouldIgnoreJid("120363000000000000@g.us"), true);
  // Status (story) kontak wajib diberi tanda terima resmi oleh Baileys; ditolak/di-ack polos = pesan tertahan.
  assert.equal(c.shouldIgnoreJid("status@broadcast"), false);
  assert.equal(c.shouldIgnoreJid("1234567890@broadcast"), true);
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
  // creds + pasangan LID<->PN milik nomor ini (ditulis saat kredensial dibuka, lihat rapikanPemetaanDiri)
  assert.equal(await auth(A.sesi), 3);
  sA.pancar("connection.update", { connection: "open" });
  const i = wa.infoSesi(A.sesi);
  assert.equal(i.status, "WORKING");
  assert.equal(i.waId, "6281100000001");
  const n = await tunggu(async () => ((await nomorById(A.id)).wa_id ? nomorById(A.id) : null), 2000, "wa_id tercatat");
  assert.equal(n.wa_id, "6281100000001");
  assert.ok(n.last_connected_at);
  assert.deepEqual(sA.resync, ["critical_block", "critical_unblock_low", "regular_high", "regular_low", "regular"]); // tautan pertama -> semua koleksi diminta, seperti WA Web
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
  assert.equal(await auth(A.sesi), 3, "kredensial + pasangan LID milik sendiri tetap utuh");
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
  // AI baru menyusun jawaban: belum ada tanda-baca maupun "mengetik" (manusia tidak mengetik di chat yang belum dibuka).
  await tunggu(() => hermes.panggilan.length === 1, 3000, "AI dipanggil");
  assert.deepEqual(sA.dibaca, []);
  assert.deepEqual(sA.presensi, []);
  await tunggu(() => sA.terkirim.length === 1, 7000, "balasan terkirim");
  const h = hermes.panggilan[0];
  // tunggu_detik 1 dtk dipakai sebagai batas bawah, ditambah acak sampai 40%.
  assert.ok(h.at - t0 >= w(950), `AI dipanggil setelah tunggu_detik (${h.at - t0} ms)`);
  assert.ok(h.at - t0 < w(1400 * 1.4) + 250, `tanpa jeda tambahan dari database (${h.at - t0} ms)`);
  assert.equal(h.pesan, "Halo, buka jam berapa?");
  assert.equal(h.sesi, `wa-${kunciChat(A.sesi, P1).slice(0, 24)}-1`);
  assert.match(h.sistem, /KODEUNIK-A/);
  const k = sA.terkirim[0];
  assert.equal(k.jid, P1);
  assert.equal(k.isi.text, "*Jawaban* untuk: Halo, buka jam berapa?"); // markdown -> format WhatsApp
  assert.equal(k.isi.linkPreview, null);
  // Lama mengetik ikut panjang jawaban (39 huruf: 1.500 + 39 x 25 ms = 2.475 ms, diacak ±20%), dihitung setelah dibaca.
  assert.ok(k.at - h.at >= w(2475 * 0.8) - 50, `ada jeda mengetik sebelum balasan (${k.at - h.at} ms setelah AI dipanggil)`);
  assert.deepEqual(sA.dibaca, [[{ remoteJid: P1, id, fromMe: false }]]);
  // Urutan seperti manusia: baca, mengetik, berhenti, baru kirim.
  assert.deepEqual(sA.urutan, ["baca", "ketik", "berhenti", "kirim"]);
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
  await tunggu(() => sA.terkirim.length === 2, 8000);
  assert.equal(hermes.panggilan.length, n0 + 1);
  assert.equal(hermes.panggilan.at(-1).pesan, "satu\ndua\ntiga");
  assert.equal(hermes.panggilan.at(-1).sesi, hermes.panggilan[0].sesi); // percakapan yang sama
  assert.deepEqual(
    sA.dibaca.at(-1).map((k) => k.id),
    ids
  );
});

// Setelah lama mengetik & tunggu_detik (1.000 ms + acak) terbukti di atas, percepat untuk Bagian C.
globalThis.__waBridge.minMengetikMs = 20;
globalThis.__waBridge.tungguMs = w(300);

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
    "[Pelanggan mengirim lokasi https://maps.google.com/?q=1,2]",
    "[Pelanggan mengirim pesan suara yang tidak bisa kamu dengar. Minta dengan sopan agar ia mengetik pesannya.]",
    "ini fotonya\n[Pelanggan melampirkan foto]",
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
  await tidur(750);
  assert.equal(hermes.panggilan.length, n0);
  assert.equal((await stat(A.id)).masuk, m0);
  assert.equal((await sql`SELECT COUNT(*) AS n FROM chat_state`)[0].n, baris0);
  assert.equal(globalThis.__waBridge.antre.size, antre0);
});

await cek("pesan lama (menumpuk saat offline / ditahan WhatsApp): tidak dijawab tapi TETAP tercatat; pesan ganda sekali", async () => {
  const n0 = hermes.panggilan.length;
  const m0 = (await stat(A.id)).masuk;
  tiba(sA, pesan("555000302@lid", "pesan 5 menit lalu", { waktu: kini() - 300 }));
  const id = idBaru();
  tiba(sA, pesan("555000303@lid", "sekali saja", { id }));
  tiba(sA, pesan("555000303@lid", "sekali saja", { id }));
  sA.pancar("messages.upsert", { messages: [pesan("555000303@lid", "sekali saja", { id })], type: "append" });
  await tidur(850);
  assert.equal(hermes.panggilan.length, n0 + 1);
  assert.equal(hermes.panggilan.at(-1).pesan, "sekali saja");
  assert.equal((await stat(A.id)).masuk, m0 + 2, "pesan terlambat ikut dihitung");
  assert.equal((await sql`SELECT COUNT(*)::int AS n FROM pesan_chat WHERE teks = 'pesan 5 menit lalu'`)[0].n, 1, "pesan terlambat masuk histori");
});

await cek("balasan otomatis dimatikan: pesan dihitung tetapi tidak dijawab", async () => {
  const n0 = hermes.panggilan.length;
  const m0 = (await stat(A.id)).masuk;
  await setBotAktif(A.id, false); // seperti saklar di dashboard: langsung berlaku tanpa restart
  tiba(sA, pesan("555000304@lid", "ada orang?"));
  await tidur(750);
  await setBotAktif(A.id, true);
  assert.equal(hermes.panggilan.length, n0);
  assert.equal((await stat(A.id)).masuk, m0 + 1);
});

await cek("balasan AI mengutip (reply) pesan pelanggan terakhir yang dijawab", async () => {
  const P = "555000320@lid";
  const k0 = sA.terkirim.length;
  tiba(sA, pesan(P, "kak buka jam berapa?", { id: "KUTIP1" }));
  tiba(sA, pesan(P, "hari minggu juga?", { id: "KUTIP2" }));
  await tunggu(() => sA.terkirim.length === k0 + 1, 5000);
  assert.equal(sA.terkirim.at(-1).jid, P);
  assert.equal(sA.terkirim.at(-1).kutip, "KUTIP2");
});

await cek("spam judi: tidak dijawab (tanpa memanggil AI), tidak ditandai dibaca, tercatat di histori dengan tanda Spam", async () => {
  const P = "555000321@lid";
  const n0 = hermes.panggilan.length;
  const k0 = sA.terkirim.length;
  const d0 = sA.dibaca.length;
  tiba(sA, pesan(P, "SLOT GACOR hari ini!! bonus new member 100%, daftar sekarang bit.ly/gacor88 🔥🔥"));
  tiba(sA, pesan(P, "s1ot g4c0r min depo 5rb, anti rungkad, wd cepat"));
  await tidur(750);
  await bridge.tulisTuntas();
  assert.equal(hermes.panggilan.length, n0);
  assert.equal(sA.terkirim.length, k0);
  assert.equal(sA.dibaca.length, d0);
  const [r] = await sql`SELECT spam, spam_alasan, masuk_n FROM percakapan WHERE kunci = ${kunciChat(A.sesi, P)}`;
  assert.equal(r.spam, 1);
  assert.equal(r.masuk_n, 2);
  assert.match(r.spam_alasan, /^Promosi judi online \(/);
  // Pelanggan sungguhan dengan kata jebakan (jadwal slot, burung gacor, DP) tetap dijawab.
  tiba(sA, pesan("555000322@lid", "kak slot jadwal besok masih ada? murai yang gacor juga ready? DP nya 50rb ya"));
  await tunggu(() => sA.terkirim.length === k0 + 1 && sA.terkirim.at(-1).jid === "555000322@lid", 5000);
});

await cek("spam judi di chat yang pernah dibalas pemilik / ditandai bukan spam: tetap dijawab", async () => {
  const P = "555000323@lid";
  const n0 = hermes.panggilan.length;
  const k0 = sA.terkirim.length;
  tiba(sA, pesan(P, "Siap kak, ditunggu orderannya", { dariSaya: true })); // pemilik pernah membalas: kontak dikenal
  await tunggu(() => chatMemori(A.sesi, P)?.jeda_sampai > 0, 3000);
  chatMemori(A.sesi, P).jeda_sampai = 0;
  tiba(sA, pesan(P, "kak ini ada info slot gacor maxwin, depo 10rb bisa wd, link: hoki88.xyz"));
  await tunggu(() => sA.terkirim.length === k0 + 1, 5000);
  // Ditandai bukan spam dari dashboard: penyaring lokal dan AI dilewati.
  const P2b = "555000324@lid";
  tiba(sA, pesan(P2b, "SLOT GACOR hari ini!! bonus new member 100%, daftar sekarang bit.ly/gacor88"));
  await tidur(600);
  await bridge.tulisTuntas();
  const { tandaiBukanSpam } = await lib("src/lib/percakapan.ts");
  const [p] = await sql`SELECT id FROM percakapan WHERE kunci = ${kunciChat(A.sesi, P2b)}`;
  assert.equal(await tandaiBukanSpam(A.id, p.id), 1);
  tiba(sA, pesan(P2b, "SLOT GACOR lagi kak, maxwin x500, daftar sekarang bit.ly/gacor88"));
  await tunggu(() => sA.terkirim.length === k0 + 2, 5000);
  assert.equal(hermes.panggilan.length, n0 + 2);
  assert.doesNotMatch(hermes.panggilan.at(-1).sistem, /<aturan_spam>/, "chat dipercaya: AI tidak diberi aturan spam");
});

await cek("spam yang dinilai AI (tag <abaikan>): tidak dikirim, tidak memotong kuota, tercatat; chat baru diberi aturan spam", async () => {
  const P = "555000325@lid";
  const k0 = sA.terkirim.length;
  hermes.jawab = (p) => (/followers/.test(p.pesan) ? '<abaikan jenis="promosi">jual followers</abaikan>' : null);
  tiba(sA, pesan(P, "Jual followers instagram aktif 1000 = 25rb, proses cepat"));
  await tunggu(() => /followers/.test(hermes.panggilan.at(-1)?.pesan ?? ""), 5000);
  await tidur(600);
  await bridge.tulisTuntas();
  hermes.jawab = null;
  assert.match(hermes.panggilan.at(-1).sistem, /<aturan_spam>/);
  assert.equal(sA.terkirim.length, k0);
  const [r] = await sql`SELECT spam, spam_alasan FROM percakapan WHERE kunci = ${kunciChat(A.sesi, P)}`;
  assert.deepEqual({ ...r }, { spam: 1, spam_alasan: "Dinilai AI: promosi (jual followers)" });
  const [u] = await sql`SELECT abaikan FROM ai_pakai WHERE number_id = ${A.id} ORDER BY id DESC LIMIT 1`;
  assert.equal(u.abaikan, true);
  // Tag dengan teks lain di sekitarnya = model ragu: jawabannya dikirim, tagnya dibuang.
  hermes.jawab = () => 'Halo kak, ada yang bisa dibantu?\n<abaikan jenis="promosi">x</abaikan>';
  tiba(sA, pesan(P, "halo"));
  await tunggu(() => sA.terkirim.length === k0 + 1, 5000);
  hermes.jawab = null;
  assert.equal(sA.terkirim.at(-1).isi.text, "Halo kak, ada yang bisa dibantu?");
});

await cek("kuota balasan AI pemilik habis: pesan tercatat tetapi AI diam; kuota ditambah = AI membalas lagi", async () => {
  const L = await lib("src/lib/langganan.ts");
  const { setSetting } = await lib("src/lib/db.ts");
  const [u] = await sql`INSERT INTO users(email, password_hash, created_at) VALUES ('kuota@uji.test', 'x', ${kini()}) RETURNING id`;
  await sql`UPDATE numbers SET user_id = ${u.id} WHERE id = ${A.id}`;
  cacheNomorBasi();
  await setSetting("kuota_percobaan", "0");
  L.segarkanKuota();
  const n0 = hermes.panggilan.length;
  const m0 = (await stat(A.id)).masuk;
  const kirim0 = sA.terkirim.length;
  const pakai0 = (await sql`SELECT COUNT(*)::int AS n FROM ai_pakai`)[0].n;
  tiba(sA, pesan("555000305@lid", "masih bisa dibalas?"));
  tiba(sA, pesan("555000315@lid", "halo kak"));
  await tidur(750);
  assert.equal(hermes.panggilan.length, n0, "AI tidak dipanggil saat kuota habis");
  assert.equal((await stat(A.id)).masuk, m0 + 2, "pesan tetap dihitung masuk");
  // Tidak ada pesan apa pun yang dikirim, juga tidak ke pemilik: pesan tanpa diminta memicu blokir WhatsApp.
  assert.equal(sA.terkirim.length, kirim0, "tidak ada pesan keluar saat kuota habis");
  assert.equal((await sql`SELECT COUNT(*)::int AS n FROM ai_pakai`)[0].n, pakai0, "kuota balasan AI tidak terpotong");
  await setSetting("kuota_percobaan", "100");
  L.segarkanKuota();
  const k0 = sA.terkirim.length;
  tiba(sA, pesan("555000306@lid", "sekarang bagaimana?"));
  await tunggu(() => hermes.panggilan.length === n0 + 1, 4000, "AI membalas lagi setelah kuota ditambah");
  await tunggu(() => sA.terkirim.length > k0, 4000, "balasan terkirim"); // tuntas sebelum uji berikutnya menghitung
  await sql`UPDATE numbers SET user_id = NULL WHERE id = ${A.id}`; // kembali seperti semula untuk uji berikutnya
  cacheNomorBasi();
});

await cek("bot hanya membalas chat yang masuk: sisa tag <teruskan> dibuang, tidak ada pesan ke nomor lain, AI diberi aturan serah ke tim", async () => {
  // Kolom lama nomor penerus diabaikan: walau terisi, tidak ada yang dikirim ke sana dan chat dari nomor itu dibalas biasa.
  const LAMA = "6281200001111";
  await sql`UPDATE numbers SET teruskan_ke = ${LAMA}, teruskan_aktif = true WHERE id = ${A.id}`;
  cacheNomorBasi();
  hermes.jawab = (p) =>
    /pesan 2 nasi/.test(p.pesan) ? 'Siap Kak, datanya sudah lengkap. Tim kami balas langsung di chat ini ya 🙏\n<teruskan jenis="pesanan">Nama: Rina\nPesanan: 2 nasi ayam</teruskan>' : null;
  const n0 = hermes.panggilan.length;
  const k0 = sA.terkirim.length;
  tiba(sA, { ...pesan("6285500000307@s.whatsapp.net", "mau pesan 2 nasi ayam, ambil jam 12, atas nama Rina"), pushName: "Rina" });
  await tunggu(() => sA.terkirim.length > k0, 5000, "balasan pelanggan");
  await tidur(300);
  const baru = sA.terkirim.slice(k0);
  assert.deepEqual(baru.map((b) => b.jid), ["6285500000307@s.whatsapp.net"], "hanya satu pesan, ke chat yang bertanya");
  assert.equal(baru[0].isi.text, "Siap Kak, datanya sudah lengkap. Tim kami balas langsung di chat ini ya 🙏");
  const p = hermes.panggilan[n0];
  assert.match(p.sistem, /<aturan_serah_tim>/);
  assert.doesNotMatch(p.sistem, /meneruskan pesan ke pemilik|<teruskan jenis/);
  assert.equal((await sql`SELECT COUNT(*)::int AS n FROM teruskan WHERE created_at >= ${kini() - 60}`)[0].n, 0, "tidak ada penerusan tercatat");
  hermes.jawab = null;
  // Chat dari nomor lama itu kini chat biasa: dibalas seperti pelanggan lain.
  const n1 = hermes.panggilan.length;
  tiba(sA, pesan(`${LAMA}@s.whatsapp.net`, "halo, masih buka?"));
  await tunggu(() => hermes.panggilan.length === n1 + 1, 4000, "chat dari nomor lama dibalas");
  await tunggu(() => sA.terkirim.length > k0 + 1, 4000, "balasan terkirim");
  await sql`UPDATE numbers SET teruskan_ke = NULL, teruskan_aktif = false WHERE id = ${A.id}`;
  cacheNomorBasi();
});

// =====================================================================================
bagian("D. Serah-terima manusia <-> AI");
globalThis.__waBridge.tungguMs = undefined;
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

await cek("jeda habis: pesan yang masuk selama jeda dan tidak dibalas manusia ikut dijawab AI; AI tahu balasan pemilik", async () => {
  const n0 = hermes.panggilan.length;
  chatMemori(A.sesi, P2).jeda_sampai = 0;
  tiba(sA, pesan(P2, "jadi totalnya berapa?"));
  await tunggu(() => hermes.panggilan.length === n0 + 1, 4000);
  const h = hermes.panggilan.at(-1);
  // "masih ada kak?" tiba selagi AI diam dan tidak dibalas manusia: tidak dibiarkan, dijawab bersama pesan baru.
  assert.equal(h.pesan, "masih ada kak?\njadi totalnya berapa?");
  // Isi chat yang tidak dilihat AI, urut waktu: pesan yang sempat batal dijawab, balasan manusia, dan
  // pesan pelanggan selagi AI diam. Pesan yang sedang dijawab tidak diulang.
  const blok = h.sistem.match(/<catatan_percakapan>([\s\S]*)<\/catatan_percakapan>/)?.[1] ?? "";
  assert.match(blok, /Pelanggan: kak mau pesan\n.*Pemilik nomor: Siap kak, saya bantu ya\n.*Pelanggan: oke kak/);
  assert.doesNotMatch(blok, /jadi totalnya berapa|masih ada kak/);
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
  // tunggu_baca_detik 3 dtk = batas bawah, ditambah acak sampai 40% (3–4,2 dtk setelah dibuka).
  assert.ok(selang >= w(3200) && selang < w(4200 + 1300) + 150, `diambil alih 3–4,2 dtk setelah dibuka (${selang} ms)`);
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
  assert.ok(selang >= w(2900), `dikirim setelah masa tunggu baca (${selang} ms)`);
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
  assert.ok(hermes.panggilan.at(-1).at - t0 < w(1800) + 150, "tetap dijawab setelah tunggu_detik biasa");
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
  assert.ok(hermes.panggilan.at(-1).at - t0 >= w(3200));
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
globalThis.__waBridge.tungguMs = w(450);
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
bagian("D3. Batas topik: tanpa kode program");
const pj = await lib("src/lib/penjaga.ts");

await cek("penjaga mengenali kode: Python, JS, PHP, Java, C, SQL, HTML, terminal, rumus Excel, blok ```", () => {
  const kode = [
    "Ini contohnya:\n```python\nprint('halo')\n```",
    "def hitung(a, b):\n    return a + b",
    "const total = harga * jumlah;",
    "function sapa(nama) {\n  alert(nama)\n}",
    "console.log('halo dunia')",
    "<?php echo 'hai'; ?>",
    "#include <stdio.h>\nint main() { printf(\"hai\"); }",
    "public static void main(String[] args) {}",
    "SELECT nama, harga FROM menu WHERE harga < 20000",
    "<div class=\"kartu\">Promo</div>",
    "Jalankan: npm install express",
    "sudo apt update",
    "import pandas as pd",
    "from flask import Flask",
    "Pakai rumus =VLOOKUP(A2, B:C, 2, FALSE)",
    "if (a === b) {\n  x++;\n}",
    "$('#tombol').click()",
  ];
  for (const k of kode) assert.equal(pj.adaKode(k), true, `harus diblokir: ${k}`);
});

await cek("penjaga TIDAK salah blokir balasan CS biasa (harga, rekening, kode promo, daftar, bahasa Inggris)", () => {
  const biasa = [
    "Halo Kak! Kami buka setiap hari pukul 09.00-21.00 WIB 😊",
    "Transfer via BCA 0955193763 a/n PT Suka Profit Berkah ya kak, lalu kirim buktinya di sini.",
    "Pakai kode promo *SHAWARMA10* untuk potongan 10% ya Kak (min. belanja Rp 50.000).",
    "Menu favorit:\n- Shawarma Ayam (Rp 25.000)\n- Shawarma Sapi (Rp 30.000)\n- Kebab Mini (Rp 15.000)",
    "Ongkir ke Bekasi: Rp 10.000; ke Depok: Rp 12.000.",
    "Sure! We're open from 9 AM to 9 PM every day. Let me know if you'd like to order.",
    "Bisa Kak, untuk pemesanan big order (≥ 50 porsi) mohon info tanggal & alamat acara ya.",
    "Return/refund akan dicek dulu oleh tim kami ya Kak.",
    "Silakan cek di https://sukashawarma.com/menu ya Kak",
    "Maaf, untuk hal itu aku tidak bisa bantu ya. Aku hanya melayani pertanyaan seputar layanan di nomor ini 🙏",
    "Pesanan atas nama (Valen) sudah kami terima. Total Rp 75.000 = 3 porsi.",
  ];
  for (const t of biasa) assert.equal(pj.adaKode(t), false, `tidak boleh diblokir: ${t}`);
});

await cek("WhatsApp: jawaban AI berisi kode tidak terkirim (diganti penolakan); giliran berikutnya tahu itu", async () => {
  const P = "555000430@lid";
  const n0 = hermes.panggilan.length;
  tiba(sA, pesan(P, "tolong buatkan def hitung(a, b): return a + b dong"));
  await tunggu(() => hermes.panggilan.length === n0 + 1, 4000);
  const s = hermes.panggilan.at(-1).sistem;
  assert.ok(s.trimEnd().endsWith("</aturan_inti>"), "aturan inti (identitas, janji, angka) ada di paling akhir pesan sistem");
  assert.match(s, /<batasan_topik>[\s\S]*<\/batasan_topik>\s*<aturan_inti>/, "batas topik tepat sebelum aturan inti");
  assert.match(s, /DILARANG menulis[^\n]*kode program/);
  assert.match(s, /<\/pengetahuan_nomor>[\s\S]*<sapaan>[\s\S]*"Kak" atau "Kakak"[\s\S]*Pak, Bu, Mas, Mbak[\s\S]*<\/sapaan>/, "sapaan menyesuaikan pelanggan, sesudah pengetahuan nomor");
  await tunggu(() => sA.terkirim.at(-1)?.jid === P, 4000);
  assert.equal(sA.terkirim.at(-1).isi.text, pj.TOLAK_KODE);
  assert.ok(!sA.terkirim.some((k) => /def hitung/.test(k.isi.text ?? "")), "kode tidak pernah terkirim");
  await bridge.tulisTuntas();
  const [{ teks }] = await sql`SELECT m.teks FROM pesan_chat m JOIN percakapan p ON p.id = m.percakapan_id WHERE p.kunci = ${kunciChat(A.sesi, P)} AND m.peran = 1 ORDER BY m.id DESC LIMIT 1`;
  assert.equal(teks, pj.TOLAK_KODE, "histori mencatat yang benar-benar terkirim");
  tiba(sA, pesan(P, "ya udah, jam buka kapan?"));
  await tunggu(() => hermes.panggilan.length === n0 + 2, 4000);
  assert.match(hermes.panggilan.at(-1).sistem, /<catatan_percakapan>[\s\S]*berisi kode program sehingga TIDAK dikirim/);
  await tunggu(() => sA.terkirim.at(-1)?.jid === P && sA.terkirim.at(-1).isi.text.includes("jam buka"), 4000);
});

// =====================================================================================
bagian("D4. Foto dari pelanggan");
const fotoUrl = (id) => `data:image/jpeg;base64,${Buffer.from(`FOTO-${id}`).toString("base64")}`;

await cek("foto pelanggan diunduh saat AI menjawab dan ikut dikirim ke AI; histori mencatat [Foto]", async () => {
  const P = "555000440@lid";
  const n0 = hermes.panggilan.length;
  const id = idBaru();
  tiba(sA, pesan(P, { imageMessage: { mimetype: "image/jpeg", fileLength: 120_000 } }, { id }));
  await tidur(300);
  assert.ok(!unduhan.includes(id), "belum diunduh selama masa tunggu manusia");
  await tunggu(() => hermes.panggilan.length === n0 + 1, 4000);
  const h = hermes.panggilan.at(-1);
  assert.equal(h.pesan, "[Pelanggan mengirim foto]");
  assert.deepEqual(h.gambar, [fotoUrl(id)]);
  assert.match(h.sistem, /<foto_pelanggan>[\s\S]*Jangan bilang pembayaran sudah diterima[\s\S]*<\/foto_pelanggan>/);
  assert.ok(h.sistem.trimEnd().endsWith("</aturan_inti>"));
  await tunggu(() => sA.terkirim.at(-1)?.jid === P, 4000);
  await bridge.tulisTuntas();
  const log = await sql`SELECT m.peran, m.teks FROM pesan_chat m JOIN percakapan p ON p.id = m.percakapan_id WHERE p.kunci = ${kunciChat(A.sesi, P)} ORDER BY m.id`;
  assert.equal(log[0].teks, "[Foto]");
});

await cek("foto + keterangan; beberapa foto beruntun = satu giliran (paling banyak 3, yang terbaru)", async () => {
  const P = "555000441@lid";
  const n0 = hermes.panggilan.length;
  const ids = [idBaru(), idBaru(), idBaru(), idBaru()];
  tiba(sA, pesan(P, { imageMessage: { mimetype: "image/jpeg", caption: "ini bukti transfernya kak" } }, { id: ids[0] }));
  for (const id of ids.slice(1)) tiba(sA, pesan(P, { imageMessage: { mimetype: "image/png" } }, { id }));
  await tunggu(() => hermes.panggilan.length === n0 + 1, 4000);
  const h = hermes.panggilan.at(-1);
  assert.match(h.pesan, /^ini bukti transfernya kak\n\[Pelanggan melampirkan foto\]\n\[Pelanggan mengirim foto\]/);
  assert.equal(h.gambar.length, 3);
  assert.deepEqual(h.gambar, ids.slice(1).map((id) => fotoUrl(id).replace("image/jpeg", "image/png")));
  assert.ok(!unduhan.includes(ids[0]), "foto ke-4 dari belakang tidak diunduh sama sekali");
  await tunggu(() => sA.terkirim.at(-1)?.jid === P, 4000);
});

await cek("foto gagal diunduh / terlalu besar / format tak didukung: AI diberi tahu, tanpa gambar", async () => {
  const P = "555000442@lid";
  const n0 = hermes.panggilan.length;
  const u0 = unduhan.length;
  const besar = idBaru();
  const heic = idBaru();
  tiba(sA, pesan(P, { imageMessage: { mimetype: "image/jpeg", caption: "GAGAL" } }));
  tiba(sA, pesan(P, { imageMessage: { mimetype: "image/jpeg", fileLength: 9_000_000 } }, { id: besar }));
  tiba(sA, pesan(P, { imageMessage: { mimetype: "image/heic" } }, { id: heic }));
  await tunggu(() => hermes.panggilan.length === n0 + 1, 4000);
  const h = hermes.panggilan.at(-1);
  assert.deepEqual(h.gambar, []);
  assert.match(h.pesan, /\[3 foto gagal dimuat sehingga tidak bisa kamu lihat/);
  assert.doesNotMatch(h.sistem, /<foto_pelanggan>/);
  assert.equal(unduhan.length, u0 + 1, "yang terlalu besar dan format tak didukung tidak diunduh");
  await tunggu(() => sA.terkirim.at(-1)?.jid === P, 4000);
});

await cek("manusia sedang memegang chat: foto pelanggan tidak diunduh sama sekali", async () => {
  const P = "555000443@lid";
  tiba(sA, pesan(P, "kak mau tanya"));
  await tidur(200);
  tiba(sA, pesan(P, "Iya kak silakan, ada yang bisa dibantu?", { dariSaya: true }));
  await tidur(200);
  const id = idBaru();
  const n0 = hermes.panggilan.length;
  tiba(sA, pesan(P, { imageMessage: { mimetype: "image/jpeg" } }, { id }));
  await tidur(2000);
  assert.equal(hermes.panggilan.length, n0);
  assert.ok(!unduhan.includes(id));
});

// =====================================================================================
bagian("D5. Konteks WhatsApp: reply, pesan suara, lokasi, kontak, dokumen, suntingan");

await cek("pelanggan me-reply foto produk yang dikirim bot: isi & foto yang di-reply ikut dibaca AI; histori mencatat kutipannya", async () => {
  const P = "555000450@lid";
  const n0 = hermes.panggilan.length;
  const kami = sA.user.id;
  tiba(
    sA,
    pesan(P, {
      extendedTextMessage: {
        text: "Yg ini astaga",
        contextInfo: { stanzaId: "BOTFOTO1", participant: kami, quotedMessage: { imageMessage: { caption: "test\nRp5.000\ntesting ajah", mimetype: "image/jpeg" } } },
      },
    })
  );
  await tunggu(() => hermes.panggilan.length === n0 + 1, 4000);
  const h = hermes.panggilan.at(-1);
  assert.match(h.pesan, /^\[Pelanggan me-reply pesan dari pihak kita \(balasanmu\/tim kita\): "test\nRp5\.000\ntesting ajah"; foto yang di-reply ikut terlampir\. Pesannya di bawah ini merujuk ke situ\.\]\nYg ini astaga$/);
  assert.deepEqual(h.gambar, [fotoUrl("BOTFOTO1")], "foto yang di-reply diunduh & dilihat AI");
  await tunggu(() => sA.terkirim.at(-1)?.jid === P, 4000);
  await bridge.tulisTuntas();
  const [log] = await sql`SELECT m.teks FROM pesan_chat m JOIN percakapan p ON p.id = m.percakapan_id WHERE p.kunci = ${kunciChat(A.sesi, P)} AND m.peran = 0`;
  assert.equal(log.teks, '↩ "test\nRp5.000\ntesting ajah"\nYg ini astaga');
});

await cek("reply ke pesannya sendiri: AI tahu yang dirujuk adalah pesan pelanggan", async () => {
  const P = "555000451@lid";
  const n0 = hermes.panggilan.length;
  tiba(sA, pesan(P, { extendedTextMessage: { text: "jadi bisa kan kak?", contextInfo: { stanzaId: "X9", participant: P, quotedMessage: { conversation: "mau antar ke Bekasi besok jam 10" } } } }));
  await tunggu(() => hermes.panggilan.length === n0 + 1, 4000);
  assert.match(hermes.panggilan.at(-1).pesan, /^\[Pelanggan me-reply pesannya sendiri: "mau antar ke Bekasi besok jam 10"\. .*\]\njadi bisa kan kak\?$/);
  assert.deepEqual(hermes.panggilan.at(-1).gambar, []);
  await tunggu(() => sA.terkirim.at(-1)?.jid === P, 4000);
});

await cek("lokasi (dengan tautan peta), kartu kontak, dokumen, dan suntingan pesan dipahami AI", async () => {
  const P = "555000452@lid";
  const n0 = hermes.panggilan.length;
  tiba(sA, pesan(P, { locationMessage: { degreesLatitude: -6.2383, degreesLongitude: 106.9756, name: "Rumah Rina", address: "Jl. Melati 5" } }));
  tiba(sA, pesan(P, { contactMessage: { displayName: "Budi Kurir", vcard: "BEGIN:VCARD\nFN:Budi Kurir\nTEL;type=CELL;waid=6281234567890:+62 812-3456-7890\nEND:VCARD" } }));
  tiba(sA, pesan(P, { documentMessage: { fileName: "daftar-pesanan.pdf", mimetype: "application/pdf" } }));
  tiba(sA, pesan(P, { protocolMessage: { type: 14, key: { id: "LAMA1" }, editedMessage: { conversation: "jadi 3 porsi ya" } } }));
  await tunggu(() => hermes.panggilan.length === n0 + 1, 4000);
  assert.equal(
    hermes.panggilan.at(-1).pesan,
    [
      '[Pelanggan mengirim lokasi "Rumah Rina, Jl. Melati 5" https://maps.google.com/?q=-6.2383,106.9756]',
      '[Pelanggan mengirim kartu kontak "Budi Kurir" (6281234567890)]',
      '[Pelanggan mengirim dokumen "daftar-pesanan.pdf"]',
      "[Pelanggan mengedit pesan sebelumnya menjadi:]\njadi 3 porsi ya",
    ].join("\n")
  );
  await tunggu(() => sA.terkirim.at(-1)?.jid === P, 4000);
  await bridge.tulisTuntas();
  const log = await sql`SELECT m.teks FROM pesan_chat m JOIN percakapan p ON p.id = m.percakapan_id WHERE p.kunci = ${kunciChat(A.sesi, P)} AND m.peran = 0 ORDER BY m.id`;
  assert.deepEqual(
    log.map((r) => r.teks),
    ['[Lokasi "Rumah Rina, Jl. Melati 5" https://maps.google.com/?q=-6.2383,106.9756]', '[Kartu kontak "Budi Kurir" (6281234567890)]', '[Dokumen "daftar-pesanan.pdf"]', "(diedit) jadi 3 porsi ya"]
  );
});

await cek("pesan suara: ditranskrip (selagi menunggu jeda balas) lalu dibaca AI; tanpa layanan transkripsi AI meminta pelanggan mengetik", async () => {
  const P = "555000453@lid";
  // Tanpa STT_API_KEY
  let n0 = hermes.panggilan.length;
  tiba(sA, pesan(P, { audioMessage: { ptt: true, seconds: 6, mimetype: "audio/ogg; codecs=opus" } }));
  await tunggu(() => hermes.panggilan.length === n0 + 1, 4000);
  assert.equal(hermes.panggilan.at(-1).pesan, "[Pelanggan mengirim pesan suara yang tidak bisa kamu dengar. Minta dengan sopan agar ia mengetik pesannya.]");
  await tunggu(() => sA.terkirim.at(-1)?.jid === P, 4000);
  // Dengan layanan transkripsi
  process.env.STT_API_URL = process.env.HERMES_API_URL;
  process.env.STT_API_KEY = "uji";
  try {
    const t0 = hermes.transkripsi ?? 0;
    n0 = hermes.panggilan.length;
    tiba(sA, pesan(P, { audioMessage: { ptt: true, seconds: 6, mimetype: "audio/ogg; codecs=opus" } }));
    await tunggu(() => hermes.panggilan.length === n0 + 1, 4000);
    assert.equal(hermes.panggilan.at(-1).pesan, '[Pesan suara pelanggan, sudah ditranskrip: "mau pesan dua ayam geprek ya kak"]');
    assert.equal(hermes.transkripsi, t0 + 1);
    // Terlalu panjang (> 5 menit): tidak diunduh, AI diminta meminta pelanggan mengetik.
    n0 = hermes.panggilan.length;
    tiba(sA, pesan(P, { audioMessage: { ptt: true, seconds: 900, mimetype: "audio/ogg" } }));
    await tunggu(() => hermes.panggilan.length === n0 + 1, 4000);
    assert.match(hermes.panggilan.at(-1).pesan, /pesan suara yang gagal diputar/);
    assert.equal(hermes.transkripsi, t0 + 1);
    await tunggu(() => sA.terkirim.at(-1)?.jid === P, 4000);
    await bridge.tulisTuntas();
    const log = await sql`SELECT m.teks FROM pesan_chat m JOIN percakapan p ON p.id = m.percakapan_id WHERE p.kunci = ${kunciChat(A.sesi, P)} AND m.peran = 0 ORDER BY m.id`;
    assert.ok(log.every((r) => r.teks === "[Pesan suara]"));
  } finally {
    delete process.env.STT_API_KEY;
    delete process.env.STT_API_URL;
  }
});

bagian("D6. Penyaring prospek (label AI utama + ML lokal)");
// Giliran AI sisa uji sebelumnya dituntaskan dulu supaya hitungan balasan di bagian ini tidak tercampur.
{
  // Diam = tidak ada panggilan AI baru selama 1,5 dtk dan tidak ada giliran yang sedang diproses.
  let n = -1;
  await tunggu(async () => {
    const diam = hermes.panggilan.length === n && ![...globalThis.__waBridge.antre.values()].some((x) => x.sedangProses);
    n = hermes.panggilan.length;
    if (!diam) await tidur(1500);
    return diam;
  }, 30000, "jembatan diam");
}
await bridge.tulisTuntas();
await sql`UPDATE numbers SET saring_prospek = true WHERE id = ${A.id}`;
cacheNomorBasi();
const PR = await lib("src/lib/prospek.ts");
const antreChat = (P) => globalThis.__waBridge.antre.get(kunciChat(A.sesi, P));
/** Lawan bicara membalas seperti manusia (tidak dalam 2 dtk setelah balasan kita): detektor bot tidak menghitungnya. */
const santai = (P) => {
  const a = antreChat(P);
  if (a) a.kirimAkhirMs = 0;
};
const statusProspek = async (P) => {
  await bridge.tulisTuntas();
  await PR.tulisProspekTuntas();
  return (await sql`SELECT prospek, prospek_alasan FROM percakapan WHERE kunci = ${kunciChat(A.sesi, P)}`)[0];
};
const jawabBernilai = (p) =>
  /harga|pesan|order/i.test(p.pesan)
    ? "Harganya ada di daftar kak.\n<nilai>prospek</nilai>"
    : /makasih/i.test(p.pesan)
      ? "<nilai>selesai</nilai>"
      : "Maaf kak, aku bantu seputar Toko A ya.\n<nilai>bukan</nilai>";
async function kirimTunggu(P, teks, ke) {
  santai(P);
  tiba(sA, pesan(P, teks));
  await tunggu(() => sA.terkirim.length === ke, 6000, `balasan ke-${ke} untuk "${teks}"`);
}
async function bisukan(P) {
  for (const t of ["wkwk kamu bot ya", "ceritain lelucon dong", "presiden indonesia siapa"]) await kirimTunggu(P, t, sA.terkirim.length + 1);
  assert.equal((await statusProspek(P)).prospek, 2, "dibisukan setelah 3 strike");
}

await cek("label AI tidak sampai ke pelanggan; 3 pesan bukan prospek beruntun = dibisukan; minat = dilayani lagi", async () => {
  hermes.jawab = jawabBernilai;
  const P = "555000701@lid";
  const k0 = sA.terkirim.length;
  await bisukan(P);
  assert.equal(sA.terkirim.length, k0 + 3, "3 pesan pertama tetap dijawab (kalimat pengarah)");
  for (const t of sA.terkirim.slice(-3)) assert.doesNotMatch(t.isi.text, /nilai|bukan</);
  assert.match(hermes.panggilan.at(-1).sistem, /<penilaian_pesan>/);
  const s = await statusProspek(P);
  assert.match(s.prospek_alasan, /^Bukan prospek: 3 pesan beruntun/);
  // ML masih magang: pesan di chat yang dibisukan dicek AI utama, tetap bukan prospek = tidak dibalas, tidak ditandai dibaca.
  const n0 = hermes.panggilan.length;
  const d0 = sA.dibaca.length;
  santai(P);
  tiba(sA, pesan(P, "lagi apa kak"));
  await tunggu(() => hermes.panggilan.length === n0 + 1, 6000);
  await tidur(400);
  assert.equal(sA.terkirim.length, k0 + 3);
  assert.equal(sA.dibaca.length, d0);
  const [u] = await sql`SELECT abaikan FROM ai_pakai WHERE number_id = ${A.id} ORDER BY id DESC LIMIT 1`;
  assert.equal(u.abaikan, true, "tidak memotong kuota balasan");
  // Menanyakan hal seputar usaha: dicek, dinilai prospek, dijawab, dan chat jadi prospek.
  await kirimTunggu(P, "kak harga paket A berapa?", k0 + 4);
  assert.equal((await statusProspek(P)).prospek, 1);
  await PR.tulisProspekTuntas();
  const [c] = await sql`SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE sumber = 3)::int AS koreksi FROM ml_contoh WHERE number_id = ${A.id}`;
  assert.ok(c.n >= 5, `pengalaman tercatat (${c.n})`);
  assert.equal(c.koreksi, 1, "chat dibisukan yang ternyata prospek dipelajari sebagai koreksi");
  hermes.jawab = null;
});

await cek("chat yang sudah prospek tidak pernah dibisukan dan tidak dibatasi jumlah balasannya", async () => {
  hermes.jawab = jawabBernilai;
  const P = "555000702@lid";
  const k0 = sA.terkirim.length;
  await kirimTunggu(P, "mau pesan 2 ya kak", k0 + 1);
  for (let i = 0; i < 4; i++) await kirimTunggu(P, `wkwk lucu banget ${i}`, k0 + 2 + i);
  assert.equal((await statusProspek(P)).prospek, 1);
  hermes.jawab = null;
});

await cek("ucapan penutup yang dinilai 'selesai': tidak dibalas dan tidak memotong kuota", async () => {
  hermes.jawab = jawabBernilai;
  const P = "555000703@lid";
  const k0 = sA.terkirim.length;
  await kirimTunggu(P, "harga paket B berapa kak", k0 + 1);
  const n0 = hermes.panggilan.length;
  santai(P);
  tiba(sA, pesan(P, "ok makasih kak"));
  await tunggu(() => hermes.panggilan.length === n0 + 1, 6000);
  await tidur(400);
  assert.equal(sA.terkirim.length, k0 + 1);
  const [u] = await sql`SELECT abaikan FROM ai_pakai WHERE number_id = ${A.id} ORDER BY id DESC LIMIT 1`;
  assert.equal(u.abaikan, true);
  hermes.jawab = null;
});

await cek("detektor bot tanpa AI: gema balasan kita, pesan panjang berulang, balasan secepat mesin", async () => {
  hermes.jawab = jawabBernilai;
  // Gema: lawan bicara memantulkan balasan kita persis.
  const P1 = "555000704@lid";
  await kirimTunggu(P1, "harga berapa kak", sA.terkirim.length + 1);
  santai(P1);
  tiba(sA, pesan(P1, sA.terkirim.at(-1).isi.text));
  await tunggu(async () => (await statusProspek(P1))?.prospek === 3, 4000, "gema = bot");
  assert.match((await statusProspek(P1)).prospek_alasan, /memantulkan/);
  // Pesan panjang yang sama berulang (broadcast/auto-reply).
  const P2 = "555000705@lid";
  const promo = "Halo, kami menawarkan jasa pembuatan website murah meriah mulai 500rb";
  await kirimTunggu(P2, promo, sA.terkirim.length + 1);
  await kirimTunggu(P2, promo, sA.terkirim.length + 1);
  santai(P2);
  tiba(sA, pesan(P2, promo));
  await tunggu(async () => (await statusProspek(P2))?.prospek === 3, 4000, "berulang = bot");
  // Secepat mesin: 5 balasan beruntun < 2 dtk setelah balasan kita.
  const P3 = "555000706@lid";
  let k = sA.terkirim.length;
  await kirimTunggu(P3, "harga 1", ++k);
  // Balasan lawan bicara dibuat tiba tepat setelah balasan kita (tidak bergantung pada beban CPU mesin uji).
  const cepat = () => (antreChat(P3).kirimAkhirMs = Date.now());
  for (let i = 2; i <= 5; i++) {
    cepat();
    tiba(sA, pesan(P3, `harga ${i}`));
    await tunggu(() => sA.terkirim.length === k + 1, 6000);
    k += 1;
  }
  cepat();
  tiba(sA, pesan(P3, "harga 6"));
  await tunggu(async () => (await statusProspek(P3))?.prospek === 3, 4000, "cepat = bot");
  await tidur(1500);
  assert.equal(sA.terkirim.length, k, "pesan bot terakhir tidak dijawab");
  hermes.jawab = null;
});

await cek("pemilik membalas chat yang dibisukan: pembisuan keliru dicatat, kontak jadi dikenal", async () => {
  hermes.jawab = jawabBernilai;
  const P = "555000707@lid";
  await bisukan(P);
  tiba(sA, pesan(P, "Halo kak, maaf baru balas. Ada yang bisa dibantu?", { dariSaya: true }));
  await tunggu(async () => (await statusProspek(P))?.prospek === 1, 4000, "dipulihkan pemilik");
  assert.equal(antreChat(P).dikenal, true);
  await PR.tulisProspekTuntas();
  const [m] = await sql`SELECT salah_bisu, dibisukan FROM ml_nomor WHERE number_id = ${A.id}`;
  assert.ok(m.salah_bisu >= 1 && m.dibisukan >= 2);
  hermes.jawab = null;
});

await cek("ML aktif: pesan iseng di chat yang dibisukan & penutup dilewati tanpa memanggil AI; kata minat tetap dicek", async () => {
  hermes.jawab = jawabBernilai;
  const P = "555000708@lid";
  await bisukan(P);
  await sql`INSERT INTO ml_nomor(number_id, aktif, ambang) VALUES (${A.id}, true, 0.6) ON CONFLICT (number_id) DO UPDATE SET aktif = true, ambang = 0.6`;
  globalThis.__waProspek.nomor.delete(A.id); // muat ulang setelan dari database
  const n0 = hermes.panggilan.length;
  santai(P);
  tiba(sA, pesan(P, "putar lagu kesukaanku dong"));
  await tidur(1800);
  assert.equal(hermes.panggilan.length, n0, "dilewati ML tanpa AI");
  await kirimTunggu(P, "kak mau order paket A", sA.terkirim.length + 1);
  // Penutup setelah jawaban yang tidak bertanya: ML mengenalinya dari pengalaman tadi ("ok makasih kak" = selesai).
  const n1 = hermes.panggilan.length;
  santai(P);
  tiba(sA, pesan(P, "ok makasih kak"));
  await tidur(1800);
  assert.equal(hermes.panggilan.length, n1, "penutup dilewati tanpa AI");
  await PR.tulisProspekTuntas();
  const [m] = await sql`SELECT dihemat FROM ml_nomor WHERE number_id = ${A.id}`;
  assert.ok(m.dihemat >= 2);
  await sql`UPDATE ml_nomor SET aktif = false WHERE number_id = ${A.id}`;
  globalThis.__waProspek.nomor.delete(A.id);
  hermes.jawab = null;
});

await cek("ujian malam berjalan pada pengalaman nomor; tombol 'Layani lagi' membangunkan chat", async () => {
  const h = await PR.ujiNomor(A.id);
  assert.ok(h.contoh >= 10);
  assert.equal(h.aktif, false, "pengalaman masih sedikit: tetap magang");
  const P = "555000701@lid";
  await bridge.tulisTuntas();
  globalThis.__waBridge.antre.delete(kunciChat(A.sesi, P));
  await sql`UPDATE chat_state SET prospek = 2 WHERE kunci = ${kunciChat(A.sesi, P)}`;
  await bridge.bangunkanChat(A.id, kunciChat(A.sesi, P));
  assert.equal((await statusProspek(P)).prospek, 0);
  const [c] = await sql`SELECT prospek FROM chat_state WHERE kunci = ${kunciChat(A.sesi, P)}`;
  assert.equal(c.prospek, 0);
});
await sql`UPDATE numbers SET saring_prospek = false WHERE id = ${A.id}`;
cacheNomorBasi();

bagian("E. Batas dan galat");

// Tidak ada batas jumlah balasan per chat dan tidak ada sesi baru karena pelanggan diam lama:
// AI membalas setiap pesan dan obrolan selalu dilanjutkan.
await cek("tanpa batas laju: chat yang sudah dibalas 10x dalam 10 menit tetap dijawab", async () => {
  const P = "555000500@lid";
  await sql`INSERT INTO chat_state(kunci, sesi_ke, last_at, jendela_awal, jendela_n) VALUES (${kunciChat(A.sesi, P)}, 3, ${kini()}, ${kini()}, 10)`;
  const n0 = hermes.panggilan.length;
  tiba(sA, pesan(P, "tanpa batas"));
  await tunggu(() => hermes.panggilan.length === n0 + 1, 4000);
  await tunggu(() => sA.terkirim.at(-1)?.jid === P, 4000);
});

await cek("tanpa sesi baru: diam >12 jam tetap melanjutkan nomor sesi Hermes yang tersimpan", async () => {
  const P = "555000502@lid";
  await sql`INSERT INTO chat_state(kunci, sesi_ke, last_at, jendela_awal, jendela_n) VALUES (${kunciChat(A.sesi, P)}, 4, ${kini() - 13 * 3600}, ${kini() - 13 * 3600}, 2)`;
  const n0 = hermes.panggilan.length;
  tiba(sA, pesan(P, "halo lagi"));
  await tunggu(() => hermes.panggilan.length === n0 + 1, 4000);
  assert.equal(hermes.panggilan.at(-1).sesi, `wa-${kunciChat(A.sesi, P).slice(0, 24)}-4`);
  await tunggu(() => sA.terkirim.at(-1)?.jid === P, 4000);
  assert.equal((await chatDb(A.sesi, P)).sesi_ke, 4);
});

await cek("AI gagal sekali: pesan dicoba lagi lalu terjawab sekali", async () => {
  const P = "555000502@lid";
  hermes.gagal = 1;
  const g0 = (await stat(A.id)).gagal;
  const k0 = sA.terkirim.length;
  tiba(sA, pesan(P, "masih ada slot?"));
  await tunggu(() => sA.terkirim.length === k0 + 1, 6000, "balasan setelah dicoba ulang");
  assert.equal((await stat(A.id)).gagal, g0 + 1);
  assert.match(sA.terkirim.at(-1).isi.text, /masih ada slot/);
  await tidur(900);
  assert.equal(sA.terkirim.length, k0 + 1, "tidak terkirim dua kali");
  hermes.gagal = false;
});

await cek("AI terus gagal: dicoba 2x lagi lalu menyerah, tidak ada pesan terkirim", async () => {
  const P = "555000503@lid";
  hermes.gagal = true;
  const g0 = (await stat(A.id)).gagal;
  const k0 = sA.terkirim.length;
  tiba(sA, pesan(P, "halo?"));
  await tunggu(async () => (await stat(A.id)).gagal === g0 + 3, 8000);
  await tidur(1200);
  assert.equal((await stat(A.id)).gagal, g0 + 3, "berhenti setelah 3 percobaan");
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
  assert.ok(j1 >= w(950) && j1 < w(2300) + 150, `percobaan 1: ${j1} ms`);
  assert.ok(j2 >= w(1950) && j2 < w(3400) + 150, `percobaan 2: ${j2} ms`);
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

await cek("440 berulang kali: nomor tertaut tidak pernah berhenti menyambung (hanya pemilik yang boleh memutus)", async () => {
  const s = globalThis.__waGerbang.sesi.get(A.sesi);
  s.gagal = 10;
  const awal = soket.length;
  sA.tutup(440);
  assert.equal(wa.infoSesi(A.sesi).status, "STARTING", "bukan FAILED");
  assert.ok(s.timer, "sambung ulang terjadwal");
  const p = wa.hubungkan(A.sesi);
  const baru = await tunggu(() => soket[awal], 1000);
  baru.pancar("connection.update", { connection: "open" });
  await p;
  assert.equal(wa.infoSesi(A.sesi).status, "WORKING");
  sA = baru;
});

await cek("proteksi anti-putus: ACK bersih JID diabaikan (tanpa NACK 500), sinkronisasi WA Business, & sambung ulang 403/411", async () => {
  let cbTerpanggil = 0;
  sA.ws.on("CB:message", () => {
    cbTerpanggil += 1;
  });
  sA.ws.emit("CB:message", { tag: "message", attrs: { from: "120363000000000000@g.us", id: "MSG-G1" } });
  sA.ws.emit("CB:message", { tag: "message", attrs: { from: "status@broadcast", id: "MSG-S1" } });
  sA.ws.emit("CB:message", { tag: "message", attrs: { from: "6281234567890@s.whatsapp.net", id: "MSG-P1" } });
  assert.equal(cbTerpanggil, 2, "chat pribadi & status diteruskan ke Baileys (status butuh tanda terima resmi)");
  assert.deepEqual(sA.acks, [{ from: "120363000000000000@g.us", errorCode: undefined }]);

  // Pemetaan PN<->LID: pesan dari HP pemilik dipetakan untuk PENERIMA, tidak pernah ke alamat pemilik sendiri.
  const me = sA.config.auth.creds.me;
  sA.peta.length = 0;
  sA.ws.emit("CB:message", { tag: "message", attrs: { from: me.id, recipient: "6281299990000@s.whatsapp.net", peer_recipient_lid: "555000901@lid", id: "MSG-P2" } });
  sA.ws.emit("CB:message", { tag: "message", attrs: { from: "555000902@lid", sender_pn: "6281299990002@s.whatsapp.net", id: "MSG-P3" } });
  sA.ws.emit("CB:message", { tag: "message", attrs: { from: "555000903@lid", sender_pn: me.id.replace(/:\d+@/, "@"), id: "MSG-P4" } });
  await tidur(20);
  assert.deepEqual(sA.peta, [
    { lid: "555000901@lid", pn: "6281299990000@s.whatsapp.net" },
    { lid: "555000902@lid", pn: "6281299990002@s.whatsapp.net" },
  ]);

  // Simulasi WA Business: accountSyncCounter diset ke 0 lalu kunci app-state & dirty bit tiba
  sA.config.auth.creds.accountSyncCounter = 0;
  sA.config.auth.creds.routingInfo = Buffer.from([1, 2, 3, 4]);
  sA.pancar("creds.update", { myAppStateKeyId: "KEY-BIZ-1", lastAccountSyncTimestamp: 1777700000 });
  await tidur(50);
  assert.deepEqual(sA.resync, ["critical_block", "critical_unblock_low", "regular_high", "regular_low", "regular"]);
  assert.equal(sA.config.auth.creds.accountSyncCounter, 1);
  assert.deepEqual(sA.dirtyCleaned, [{ type: "account_sync", ts: 1777700000 }]);

  // 403 / 411 pada nomor tertaut tetap menyambung ulang & membuang routingInfo usang
  const s = globalThis.__waGerbang.sesi.get(A.sesi);
  const awal = soket.length;
  sA.tutup(403);
  assert.equal(wa.infoSesi(A.sesi).status, "STARTING");
  assert.ok(s.timer, "tetap dijadwalkan sambung ulang saat 403");
  assert.equal(sA.config.auth.creds.routingInfo, undefined, "routingInfo usang dibersihkan");
  const p = wa.hubungkan(A.sesi);
  const baru = await tunggu(() => soket[awal], 1000);
  baru.pancar("connection.update", { connection: "open" });
  await p;
  assert.equal(wa.infoSesi(A.sesi).status, "WORKING");
  sA = baru;
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

await cek("kompatibilitas iOS (iPhone) & kode tautan nomor telepon (pairing code 8 digit)", async () => {
  const n = await nomorCepat("Toko iOS");
  const awal = soket.length;
  const p = wa.hubungkan(n.sesi);
  const s1 = await tunggu(() => soket[awal], 2000);
  s1.pancar("connection.update", { qr: "2@IOS-QR-1,a,b,c,1" });
  await p;

  // 1) Minta kode pairing dengan nomor 08xx -> dinormalisasi ke 628xx, menghasilkan kode 8 karakter
  const kode = await wa.mintaKodePairing(n.sesi, "0812-3456-7890");
  assert.equal(kode, "ABCD1234");
  assert.equal(s1.pairingNomor, "6281234567890");
  assert.equal(wa.kodePairing(n.sesi), "ABCD1234");
  // Kredensial sementara `{ id: "628...@s.whatsapp.net", name: "~" }` tidak boleh disimpan sebagai `me` di DB sebelum tertaut
  await tungguTulis(n.sesi);
  const [barisSementara] = await sql`SELECT teks FROM wa_auth WHERE sesi = ${n.sesi} AND kunci = 'creds'`;
  assert.equal(JSON.parse(barisSementara.teks).me, undefined, "placeholder pairing belum dianggap tertaut di DB");

  // 2) Bila kode pairing kedaluwarsa (408) sebelum dimasukkan di HP: sesi bersih & pesan jelas
  s1.tutup(408);
  assert.equal(wa.infoSesi(n.sesi).status, "FAILED");
  assert.match(wa.infoSesi(n.sesi).alasan, /Kode tautan kedaluwarsa/);
  assert.equal(await auth(n.sesi), 0);

  // 3) Tautkan ulang dengan kode pairing sampai selesai + simulasi urutan event khas iPhone (iOS)
  const p2 = wa.hubungkan(n.sesi);
  const s2 = await tunggu(() => soket[awal + 1], 2000);
  s2.pancar("connection.update", { qr: "2@IOS-QR-2,a,b,c,1" });
  await p2;
  await wa.mintaKodePairing(n.sesi, "+62 811-0000-0099");
  // HP memasukkan kode -> stage companion_finish (`registered: true`) langsung mengubah status ke STARTING
  s2.pancar("creds.update", { registered: true });
  assert.equal(wa.infoSesi(n.sesi).status, "STARTING");
  assert.equal(wa.kodePairing(n.sesi), null);
  // Lalu pair-success tiba membawa me.id (:device) & me.lid
  s2.pancar("creds.update", {
    account: { details: "x" },
    me: { id: "6281100000099:4@s.whatsapp.net", lid: "777000199:4@lid" },
  });
  s2.pancar("connection.update", { isNewLogin: true, qr: undefined });
  s2.tutup(515);

  const s3 = await tunggu(() => soket[awal + 2], 2000);
  // Di beberapa akun/server, `<success>` mengirim `me: { ...me, lid: undefined }` — `lid` tidak boleh hilang!
  s3.pancar("creds.update", { me: { id: "6281100000099:4@s.whatsapp.net", lid: undefined } });
  assert.equal(s3.config.auth.creds.me.lid, "777000199:4@lid", "me.lid tetap terjaga agar pesan peer iOS tidak dibuang");
  s3.pancar("connection.update", { connection: "open" });
  await tidur(30);
  // Saat `open` di iPhone reguler (belum ada `name` dan belum ada `myAppStateKeyId`), semua koleksi diminta
  // tetapi `accountSyncCounter` tetap 0 sampai `myAppStateKeyId` benar-benar tiba dari iPhone.
  assert.deepEqual(s3.resync, ["critical_block", "critical_unblock_low", "regular_high", "regular_low", "regular"]);
  assert.equal(s3.config.auth.creds.accountSyncCounter ?? 0, 0);

  // Kunci app-state & dirty bit tiba belakangan dari iPhone -> wajib disinkronkan penuh & dirty bit dibersihkan
  s3.pancar("creds.update", { myAppStateKeyId: "IOS-KEY-1", lastAccountSyncTimestamp: 1777700999 });
  await tidur(50);
  assert.deepEqual(s3.resync, ["critical_block", "critical_unblock_low", "regular_high", "regular_low", "regular"]);
  assert.equal(s3.config.auth.creds.accountSyncCounter, 1);
  assert.deepEqual(s3.dirtyCleaned, [{ type: "account_sync", ts: 1777700999 }]);

  await wa.hapusSesi(n.sesi);
});

await cek("WA Business iPhone: tautan pertama langsung meminta semua koleksi walau nama bisnis sudah terisi", async () => {
  const n = await nomorCepat("Toko Bisnis iOS");
  const awal = soket.length;
  const p = wa.hubungkan(n.sesi);
  const s1 = await tunggu(() => soket[awal], 2000);
  s1.pancar("connection.update", { qr: "2@BIZ-QR-1,a,b,c,1" });
  await p;
  // pair-success WA Business: nama bisnis ikut terisi dari sertifikat, platform smbi (WA Business iOS)
  s1.pancar("creds.update", { me: { id: "6281100000098:3@s.whatsapp.net", lid: "777000198:3@lid", name: "Toko Bisnis Resmi" }, platform: "smbi" });
  s1.pancar("connection.update", { isNewLogin: true, qr: undefined });
  s1.tutup(515);
  const s2 = await tunggu(() => soket[awal + 1], 2000);
  s2.pancar("connection.update", { connection: "open" });
  await tidur(30);
  // Dulu Business tidak meminta apa pun di sini dan hanya menunggu kunci dari iPhone -> tautan tidak tuntas.
  assert.deepEqual(s2.resync, ["critical_block", "critical_unblock_low", "regular_high", "regular_low", "regular"]);
  assert.equal(s2.config.auth.creds.accountSyncCounter ?? 0, 0, "belum selesai sebelum kunci app-state tiba");

  // Sudah pernah tersinkron & nama ada: tersambung ulang tidak meminta sinkron lagi.
  s2.pancar("creds.update", { accountSyncCounter: 1 });
  s2.tutup(428);
  const s3 = await tunggu(() => soket[awal + 2], 5000, "sambung ulang");
  s3.pancar("connection.update", { connection: "open" });
  await tidur(30);
  assert.equal(s3.resync, undefined);

  await wa.hapusSesi(n.sesi);
});

// =====================================================================================
bagian("G. Banyak nomor sekaligus");
globalThis.__waBridge.tungguMs = undefined;
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
  assert.ok(lama > w(7000) && lama < w(10500) + 400, `12 nomor tersambung dalam ${lama} ms`);
  await tidur(900);
  assert.equal(soket.length - awal, 12, "nomor yang belum dipasangkan tidak dibuatkan soket");
  const baru = soket.slice(awal);
  assert.deepEqual(baru.map((s) => s.config.auth.creds.me.id).sort(), banyak.map((r) => r.s.user.id).sort());
  baru.forEach((s) => s.pancar("connection.update", { connection: "open" }));
  assert.equal(banyak.every((r) => wa.infoSesi(r.n.sesi).status === "WORKING"), true);
  console.log(`        (12 nomor tersambung ulang dalam ${lama} ms)`);
});

await cek("proses dimatikan (SIGTERM): soket ditutup tanpa logout, tulisan kunci yang masih antre tuntas dulu", async () => {
  const r = banyak[0];
  const sok = soket.filter((x) => x.config.auth.creds.me?.id === r.s.user.id).at(-1);
  const ditutup0 = sok.ditutup;
  const keluar0 = sok.keluar;
  const sebelum = await auth(r.n.sesi);
  // Seperti tepat setelah QR dipindai: ratusan pre-key + kredensial baru ditulis, tidak ditunggu.
  const kunci = {};
  for (let i = 0; i < 1500; i++) kunci[`${90000 + i}`] = { public: Buffer.alloc(32, i % 256), private: Buffer.alloc(32, (i + 1) % 256) };
  void sok.config.auth.keys.set({ "pre-key": kunci });
  sok.pancar("creds.update", { nextPreKeyId: 91500, firstUnuploadedPreKeyId: 91500 });
  await wa.matikanGerbang();
  const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM wa_auth WHERE sesi = ${r.n.sesi}`;
  assert.equal(n, sebelum + 1500, "semua pre-key sudah tertulis saat matikanGerbang selesai");
  const [c] = await sql`SELECT teks FROM wa_auth WHERE sesi = ${r.n.sesi} AND kunci = 'creds'`;
  assert.equal(JSON.parse(c.teks).nextPreKeyId, 91500, "kredensial terbaru tertulis");
  assert.equal(sok.ditutup, ditutup0 + 1, "soket ditutup");
  assert.equal(sok.keluar, keluar0, "tanpa logout (perangkat tetap tertaut)");
  assert.equal(banyak.every((x) => wa.infoSesi(x.n.sesi).status === "STOPPED"), true);
  const jumlah = soket.length;
  sok.tutup(428); // event dari soket lama tidak memicu sambung ulang
  await tidur(1500);
  assert.equal(soket.length, jumlah);
});

await cek("database mati sesaat ketika kunci ditulis: tulisan dicoba ulang, tidak hilang", async () => {
  const r = banyak[1];
  const sok = soket.filter((x) => x.config.auth.creds.me?.id === r.s.user.id).at(-1);
  const sebelum = await auth(r.n.sesi);
  const peringatan = console.warn;
  const catatan = [];
  console.warn = (...a) => catatan.push(a.join(" "));
  try {
    await pg.berhentiSementara();
    void sok.config.auth.keys.set({ "pre-key": { 77777: { public: Buffer.alloc(32, 7), private: Buffer.alloc(32, 8) } } });
    await tidur(1500);
    await pg.lanjut();
    await tungguTulis(r.n.sesi);
  } finally {
    console.warn = peringatan;
  }
  assert.match(catatan.join("\n"), /tulis kunci gagal/);
  assert.equal(await auth(r.n.sesi), sebelum + 1, "kunci tertulis setelah database kembali");
});

await cek("nomor tertaut gagal dibuat koneksinya berkali-kali: tetap dijadwalkan ulang, tidak pernah FAILED", async () => {
  const st = globalThis.__waGerbang;
  for (const x of st.sesi.values()) if (x.timer) clearTimeout(x.timer);
  st.sesi.clear();
  st.dimulai = false;
  await wa.mulaiGerbang();
  const s = st.sesi.get(banyak[0].n.sesi); // giliran pertama (±0-200 ms)
  s.gagal = 10; // dulu: menyerah setelah 5 kali
  gagalBuat = 1;
  await tunggu(() => s.gagal === 11, 3000, "percobaan gagal");
  assert.equal(wa.infoSesi(banyak[0].n.sesi).status, "STARTING", "bukan FAILED");
  assert.ok(s.timer, "dijadwalkan lagi");
  assert.match(s.alasan, /menyambung ulang/);
  for (const x of st.sesi.values()) if (x.timer) clearTimeout(x.timer);
});

await cek("database sempat tidak terjangkau saat server mulai: gerbang mencoba lagi sendiri", async () => {
  const st = globalThis.__waGerbang;
  st.jedaDbMs = w(250);
  st.jedaMulaiMs = 30;
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
