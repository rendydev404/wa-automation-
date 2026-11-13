// Uji tingkat minat lead (bridge.ts, percakapan.ts) & follow-up prospek nomor CS (src/lib/followup-prospek.ts).
// Yang asli: wa.ts, bridge.ts, followup.ts, followup-prospek.ts, PostgreSQL 15 (sementara). Tiruan: soket WhatsApp & Hermes.
// Pakai (dari akar proyek): node --import ./uji/loader.mjs uji/uji-followup-prospek.mjs
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdirSync, rmSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { mulaiPg } from "./pg-lokal.mjs";

const akar = process.cwd();
const tmp = path.join(os.tmpdir(), "wa-uji-followup-prospek");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const pg = await mulaiPg({ dir: path.join(tmp, "pg"), sementara: true });
process.env.DATABASE_URL = pg.url;
process.env.DATA_DIR = path.join(tmp, "data-kosong");
process.env.WA_SKALA_WAKTU ??= "0.2";
process.env.ML_PELUANG_AUDIT = "0";
process.env.AUTH_SECRET = "rahasia-uji-followup-prospek";
const SKALA = Number(process.env.WA_SKALA_WAKTU);
const w = (ms) => Math.max(1, Math.round(ms * SKALA));
const lib = (f) => import(pathToFileURL(path.join(akar, f)).href);
const tidur = (ms) => new Promise((r) => setTimeout(r, w(ms)));
const kini = () => Math.floor(Date.now() / 1000);
async function tunggu(fn, ms = 8000, apa = "") {
  const t = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t > ms) throw new Error(`habis waktu menunggu ${apa || fn}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

// ---------- Hermes tiruan ----------
// Balasan CS biasa membawa tag penilaian sesuai isi pesan; follow-up prospek mengembalikan teks per tahap.
const TEKS_FU = {
  1: "Kak, soal paket Bisnis yang tadi ditanyakan, AI-nya bisa langsung membalas chat pelanggan toko Kakak 24 jam. Mau aku bantu cek paket yang pas?",
  2: "Kak, chat pelanggan yang telat dibalas sering pindah ke toko lain. Paket Starter cukup untuk mulai, nanti AI yang menjawab semua chat. Mau aku pandu aktifkan hari ini?",
  3: "Kak, ini pesan terakhir dariku soal ini ya, aku tidak akan mengganggu lagi. Kapan pun siap, cukup balas chat ini.",
};
const DESAK = "Kak, promo paket Bisnis hanya hari ini, sisa 3 slot lagi! Buruan daftar sekarang ya sebelum kehabisan.";
const hermes = { panggilan: [], desak: false };
const server = http.createServer((req, res) => {
  let b = "";
  req.on("data", (c) => (b += c));
  req.on("end", () => {
    if (req.url.endsWith("/models")) return res.end("{}");
    const j = JSON.parse(b);
    const p = { sesi: String(req.headers["x-hermes-session-id"] ?? ""), sistem: j.messages[0].content, pesan: j.messages[1].content };
    hermes.panggilan.push(p);
    let isi;
    if (p.sesi.startsWith("followup-prospek-")) {
      const tahap = Number(/tahap (\d)/.exec(p.pesan)?.[1] ?? 1);
      isi = hermes.desak ? DESAK : TEKS_FU[tahap];
    } else {
      const m = p.pesan.toLowerCase();
      const tag = /transfer|rekening|jadi ambil/.test(m)
        ? "<nilai>prospek</nilai><minat>panas</minat>"
        : /harga|paket|berapa/.test(m)
          ? "<nilai>prospek</nilai><minat>hangat</minat>"
          : /^(halo|p)\b/.test(m)
            ? "<nilai>netral</nilai>"
            : "<nilai>prospek</nilai><minat>dingin</minat>";
      isi = `Jawaban CS untuk: ${p.pesan}\n${tag}`;
    }
    res.setHeader("content-type", "application/json");
    setTimeout(() => res.end(JSON.stringify({ choices: [{ message: { content: isi } }] })), 20);
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
process.env.HERMES_API_URL = `http://127.0.0.1:${server.address().port}`;
process.env.HERMES_API_KEY = "uji";

const B = await lib("node_modules/baileys/lib/index.js");
const { db } = await lib("src/lib/db.ts");
const wa = await lib("src/lib/wa.ts");
const bridge = await lib("src/lib/bridge.ts");
const { tambahNomor, nomorById } = await lib("src/lib/numbers.ts");
const { tambahDokumen } = await lib("src/lib/knowledge.ts");
const { daftarPercakapan } = await lib("src/lib/percakapan.ts");
const fu = await lib("src/lib/followup.ts");
const fp = await lib("src/lib/followup-prospek.ts");
const sql = await db();

// ---------- Soket WhatsApp tiruan (seperti uji-alur.mjs) ----------
const soket = [];
function buatSoket(config) {
  const ev = new EventEmitter();
  const ws = new EventEmitter();
  const s = {
    config,
    ev,
    ws,
    terkirim: [],
    dibaca: [],
    urutan: [],
    get user() {
      return config.auth.creds.me;
    },
    signalRepository: { lidMapping: { getLIDForPN: async () => null, storeLIDPNMappings: async () => {} } },
    async sendMessageAck() {},
    async cleanDirtyBits() {},
    async sendMessage(jid, isi, opsi) {
      s.terkirim.push({ jid, teks: isi.text, id: opsi.messageId, at: Date.now() });
      s.urutan.push("kirim");
      return { key: { id: opsi.messageId } };
    },
    async readMessages(keys) {
      s.dibaca.push(...keys.map((k) => k.id));
      s.urutan.push("baca");
    },
    async sendPresenceUpdate(t) {
      if (t === "composing") s.urutan.push("ketik");
      if (t === "paused") s.urutan.push("berhenti");
      if (t === "available") s.urutan.push("online");
      if (t === "unavailable") s.urutan.push("offline");
    },
    async resyncAppState() {},
    async logout() {},
    async end() {},
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
    console.log(`  GAGAL ${nama}\n        ${String(e?.stack ?? e).split("\n").slice(0, 8).join("\n        ")}`);
  }
}
const cacheNomorBasi = () => (globalThis.__waNomor.janji = null);
let urut = 0;
const pesan = (jid, teks, o = {}) => ({
  key: { remoteJid: jid, id: o.id ?? `FU${String(++urut).padStart(5, "0")}`, fromMe: !!o.dariSaya },
  messageTimestamp: o.waktu ?? kini(),
  pushName: o.nama ?? "Pelanggan",
  message: { conversation: teks },
});
const tiba = (s, ...m) => s.pancar("messages.upsert", { messages: m, type: "notify" });
const jid = (d) => `${d}@s.whatsapp.net`;

async function pengguna(email, nama, o = {}) {
  const [u] = await sql`
    INSERT INTO users(email, nama, password_hash, peran, created_at) VALUES (${email}, ${nama}, 'x', ${o.peran ?? "user"}, ${o.dibuat ?? kini() - 5 * 86400}) RETURNING id`;
  return u.id;
}
async function nomorAkun(userId, label, waId) {
  const n = await tambahNomor(label, userId);
  if (waId) await sql`UPDATE numbers SET wa_id = ${waId} WHERE id = ${n.id}`;
  cacheNomorBasi();
  return n;
}
/** Kuota free trial (2 balasan) habis: dua balasan AI tercatat di nomor akun ini. */
const habiskan = (numberId) => sql`INSERT INTO ai_pakai(number_id, waktu, penyedia, ms) VALUES (${numberId}, ${kini() - 86400}, 'hermes', 10), (${numberId}, ${kini() - 86000}, 'hermes', 10)`;
async function nomorTerhubung(label, waId, userId) {
  const n = await tambahNomor(label, userId);
  await sql`UPDATE numbers SET tunggu_detik = 1, tunggu_baca_detik = 3, jeda_detik = 1800, saring_prospek = false WHERE id = ${n.id}`;
  cacheNomorBasi();
  const awal = soket.length;
  const p = wa.hubungkan(n.sesi);
  const s1 = await tunggu(() => soket[awal], 3000, "soket pertama");
  s1.pancar("connection.update", { qr: `2@ref-${label},aaa,bbb,ccc,1` });
  await p;
  s1.pancar("creds.update", { me: { id: `${waId}:5@s.whatsapp.net`, name: label } });
  s1.tutup(515);
  const s2 = await tunggu(() => soket[awal + 1], 3000, "soket setelah mulai ulang");
  s2.pancar("connection.update", { connection: "open" });
  await tunggu(async () => (await nomorById(n.id)).wa_id === waId, 3000, "wa_id tercatat");
  return { n, s: s2 };
}
const fst = () => globalThis.__waFollowup;
const pst = () => globalThis.__waFollowupProspek;
const chatDari = async (wa_) => (await bridge.tulisTuntas(), (await sql`SELECT * FROM percakapan WHERE number_id = ${CS.id} AND telepon = ${wa_}`)[0]);
const fpBaris = async (wa_) => (await bridge.tulisTuntas(), (await sql`SELECT fp.* FROM followup_prospek fp JOIN percakapan p ON p.kunci = fp.kunci WHERE p.telepon = ${wa_}`)[0]);
/** Mundurkan seluruh chat (histori & penanda waktu) sekian detik: seolah lawan bicara sudah diam selama itu. */
async function mundurkan(wa_, detik) {
  await bridge.tulisTuntas();
  const c = await chatDari(wa_);
  await sql`UPDATE pesan_chat SET waktu = waktu - ${detik} WHERE percakapan_id = ${c.id}`;
  await sql`UPDATE percakapan SET terakhir_pada = terakhir_pada - ${detik}, minat_pada = minat_pada - ${detik} WHERE id = ${c.id}`;
}
/** Satu putaran tanpa jeda acak & dengan pemindaian dipaksa. */
async function putaran() {
  fst().bolehPada = 0;
  pst().pindaiPada = 0;
  await fu.putaranFollowup();
  await bridge.tulisTuntas();
}
async function ngobrol(wa_, teks, nama) {
  const awal = sCS.terkirim.length;
  tiba(sCS, pesan(jid(wa_), teks, { nama }));
  await tunggu(() => sCS.terkirim.length > awal, 8000, `jawaban untuk "${teks}"`);
  await bridge.tulisTuntas();
}

const mulai = Date.now();
console.log("\n== Tingkat minat lead & follow-up prospek nomor CS ==");

const CS_WA = "628111000000";
const pemilikCs = await pengguna("cs@uji.id", "Pemilik CS");
await sql`INSERT INTO langganan(user_id, nama_paket, mulai, sampai, kuota_nomor, kuota_balasan, sumber) VALUES (${pemilikCs}, 'Pro', ${kini() - 86400}, ${kini() + 30 * 86400}, 10, 100000, 'admin')`;
const { n: CS, s: sCS } = await nomorTerhubung("CS ChatGerCep", CS_WA, pemilikCs);
await tambahDokumen({ numberId: CS.id, judul: "CS", sumber: "teks", teks: "Kamu CS ChatGerCep. Paket Starter Rp67.000/bulan, Bisnis Rp246.000/bulan, Pro Rp602.000/bulan. Jaminan uang kembali 1x24 jam." });
// Follow-up akun mati, tetapi jam kirim, batas harian, dan nomor CS-nya dipakai bersama.
await fu.simpanPengaturanFollowup({ aktif: false, nomorId: CS.id, batasHarian: 60, jamMulai: 0, jamSelesai: 24, tundaJam: 24, pengingatHari: 3 });
fu.mulaiFollowup();
clearInterval(fst().timer);
clearInterval(fst().timerPindai);

const L = { hangat: "628333000001", panas: "628333000002", iseng: "628333000003", stop: "628333000004", pelanggan: "628333000005", desak: "628333000006", tono: "628333000007" };

await cek("tingkat minat: tanya harga = hangat, minta rekening = panas, sapaan saja = tanpa minat; hanya naik", async () => {
  await ngobrol(L.hangat, "kak berapa harga paket bisnis?", "Hana");
  await ngobrol(L.panas, "kak berapa harga paket pro?", "Panji");
  await ngobrol(L.panas, "oke jadi ambil, transfer ke rekening mana?", "Panji");
  await ngobrol(L.iseng, "halo", "Iseng");
  const h = await chatDari(L.hangat);
  const p = await chatDari(L.panas);
  const i = await chatDari(L.iseng);
  assert.equal(h.prospek, 1, "status prospek tercatat walau penyaring nomor CS mati");
  assert.equal(h.minat, 1);
  assert.equal(p.minat, 2);
  assert.equal(i.minat, null);
  assert.ok(!sCS.terkirim.some((k) => /<minat|<nilai/.test(k.teks)), "tag tidak pernah sampai ke pelanggan");
  await ngobrol(L.panas, "eh nanti dulu deh", "Panji");
  assert.equal((await chatDari(L.panas)).minat, 2, "tag lebih rendah tidak menurunkan tingkat");
  const sistem = hermes.panggilan.findLast((x) => x.sesi.startsWith("wa-")).sistem;
  assert.match(sistem, /<minat>panas<\/minat>/, "aturan minat ada di prompt nomor CS");
});

await cek("filter lead serius: hanya prospek hangat/panas; luruh 7 hari menurunkan tingkat", async () => {
  const lead = (await daftarPercakapan(CS.id, { filter: "lead" })).daftar.map((x) => x.telepon).sort();
  assert.deepEqual(lead, [L.hangat, L.panas].sort());
  const semua = (await daftarPercakapan(CS.id)).daftar;
  assert.equal(semua.find((x) => x.telepon === L.panas).minat, 2);
  assert.equal(semua.find((x) => x.telepon === L.iseng).minat, null);
  const c = await chatDari(L.hangat);
  await sql`UPDATE percakapan SET minat_pada = minat_pada - ${8 * 86400} WHERE id = ${c.id}`;
  const lalu = (await daftarPercakapan(CS.id, { filter: "lead" })).daftar.map((x) => x.telepon);
  assert.deepEqual(lalu, [L.panas], "hangat yang diam 8 hari jadi dingin, keluar dari lead serius");
  assert.equal((await daftarPercakapan(CS.id)).daftar.find((x) => x.telepon === L.hangat).minat, 0);
  await sql`UPDATE percakapan SET minat_pada = minat_pada + ${8 * 86400} WHERE id = ${c.id}`;
});

await cek("mati (bawaan): tidak ada yang diantrekan atau dikirim", async () => {
  await mundurkan(L.hangat, 4 * 3600);
  const awal = sCS.terkirim.length;
  await putaran();
  assert.equal(sCS.terkirim.length, awal);
  assert.equal((await sql`SELECT COUNT(*)::int AS n FROM followup_prospek`)[0].n, 0);
});

await cek("pesan 1: lead hangat yang diam 3 jam di-follow-up (ritme manusia, tercatat); lead iseng & yang belum lewat jeda tidak", async () => {
  await fp.simpanPengaturanProspek({ aktif: true, jedaPanasJam: 1, jedaHangatJam: 3, tahap2Jam: 24, tahap3Jam: 48, maksTahap: 3 });
  await mundurkan(L.iseng, 5 * 3600);
  const awal = sCS.terkirim.length;
  sCS.urutan.length = 0;
  await putaran();
  assert.equal(sCS.terkirim.length, awal + 1, "satu pesan per putaran");
  const k = sCS.terkirim.at(-1);
  assert.equal(k.jid, jid(L.hangat));
  assert.equal(k.teks, TEKS_FU[1]);
  assert.match(sCS.urutan.join(","), /ketik.*kirim/);
  const r = await fpBaris(L.hangat);
  assert.equal(r.status, "jalan");
  assert.equal(r.tahap, 1);
  assert.equal(r.minat, 1);
  assert.equal(r.pesan1, TEKS_FU[1]);
  assert.ok(Math.abs(r.jadwal - (kini() + 24 * 3600)) < 60, "pesan 2 sehari kemudian");
  assert.equal(await fpBaris(L.iseng), undefined, "sapaan saja bukan lead");
  assert.equal(await fpBaris(L.panas), undefined, "lead panas baru saja chat: belum lewat 1 jam");
  const ai = hermes.panggilan.findLast((x) => x.sesi.startsWith("followup-prospek-"));
  assert.match(ai.sistem, /Lingkaran terbuka/);
  assert.match(ai.sistem, /JANGAN menulis tautan/);
  assert.match(ai.sistem, /Rp67\.000/, "pengetahuan nomor CS (harga) ikut dikirim");
  assert.match(ai.sistem, /kak berapa harga paket bisnis/, "riwayat chat orang itu ikut dikirim");
  const [h] = await sql`SELECT m.teks FROM pesan_chat m JOIN percakapan p ON p.id = m.percakapan_id WHERE p.telepon = ${L.hangat} AND m.peran = 1 ORDER BY m.id DESC LIMIT 1`;
  assert.equal(h.teks, TEKS_FU[1], "tercatat di histori");
});

await cek("putaran berikutnya: tidak mengirim pesan kedua sebelum jadwal; tidak diantrekan dua kali", async () => {
  const awal = sCS.terkirim.length;
  await putaran();
  assert.equal(sCS.terkirim.length, awal);
  assert.equal((await sql`SELECT COUNT(*)::int AS n FROM followup_prospek`)[0].n, 1);
});

await cek("pesan 2: hanya bila pesan 1 sampai ke HP (centang dua); centang satu = berhenti", async () => {
  await sql`UPDATE followup_prospek SET jadwal = ${kini() - 1}`;
  const awal = sCS.terkirim.length;
  const idPesan1 = sCS.terkirim.at(-1).id;
  sCS.pancar("messages.update", [{ key: { remoteJid: jid(L.hangat), id: idPesan1, fromMe: true }, update: { status: 3 } }]);
  await tunggu(async () => (await fpBaris(L.hangat)).ack1 === 3, 3000, "ack1 = 3");
  await putaran();
  assert.equal(sCS.terkirim.length, awal + 1);
  assert.equal(sCS.terkirim.at(-1).teks, TEKS_FU[2]);
  const r = await fpBaris(L.hangat);
  assert.equal(r.tahap, 2);
  const ai = hermes.panggilan.findLast((x) => x.sesi.startsWith("followup-prospek-"));
  assert.match(ai.sistem, /Takut rugi/);
  assert.ok(ai.sistem.includes(TEKS_FU[1]), "pesan sebelumnya diberikan supaya tidak diulang");
  // Pesan 2 tidak pernah sampai (centang satu): pesan 3 tidak dikirim.
  await sql`UPDATE followup_prospek SET jadwal = ${kini() - 1} WHERE kunci = ${r.kunci}`;
  const awal2 = sCS.terkirim.length;
  await putaran();
  assert.equal(sCS.terkirim.length, awal2);
  const r2 = await fpBaris(L.hangat);
  assert.equal(r2.status, "selesai");
  assert.match(r2.alasan, /centang satu/);
});

await cek("dibalas: siklus berhenti, AI diberi konteks follow-up & arahan menutup penjualan", async () => {
  await mundurkan(L.panas, 2 * 3600);
  await putaran();
  const r = await fpBaris(L.panas);
  assert.equal(r.tahap, 1);
  assert.equal(r.minat, 2);
  const ai = hermes.panggilan.findLast((x) => x.sesi.startsWith("followup-prospek-"));
  assert.match(ai.sistem, /SIAP MEMBELI/);
  assert.match(ai.sistem, /\/langganan/);
  await ngobrol(L.panas, "iya kak boleh, caranya gimana?", "Panji");
  const r2 = await fpBaris(L.panas);
  assert.equal(r2.status, "dibalas");
  assert.ok(r2.dibalas);
  const jawab = hermes.panggilan.findLast((x) => x.sesi.startsWith("wa-"));
  assert.match(jawab.sistem, /tadi mengirim follow-up/);
  assert.match(jawab.sistem, /Bantu ia memutuskan berlangganan/);
});

await cek("minta berhenti: dicatat permanen, tidak pernah di-follow-up lagi", async () => {
  await ngobrol(L.stop, "berapa harga paket starter kak?", "Sinta");
  await mundurkan(L.stop, 4 * 3600);
  await putaran();
  assert.equal((await fpBaris(L.stop)).tahap, 1);
  await ngobrol(L.stop, "gak usah kak makasih", "Sinta");
  const r = await fpBaris(L.stop);
  assert.equal(r.status, "stop");
  const c = await chatDari(L.stop);
  assert.equal((await sql`SELECT COUNT(*)::int AS n FROM followup_stop WHERE kunci = ${c.kunci}`)[0].n, 1);
  assert.match(hermes.panggilan.findLast((x) => x.sesi.startsWith("wa-")).sistem, /meminta tidak dihubungi lagi/);
  // Ia bertanya lagi lalu diam: tetap tidak diantrekan.
  await ngobrol(L.stop, "paket bisnis berapa kak?", "Sinta");
  await mundurkan(L.stop, 4 * 3600);
  await putaran();
  assert.equal((await fpBaris(L.stop)).status, "stop");
});

await cek("pelanggan yang sudah berlangganan tidak di-follow-up", async () => {
  const u = await pengguna("langganan@uji.id", "Pelanggan");
  await nomorAkun(u, "Toko Pelanggan", L.pelanggan);
  await sql`INSERT INTO langganan(user_id, nama_paket, mulai, sampai, kuota_nomor, kuota_balasan, sumber) VALUES (${u}, 'Bisnis', ${kini() - 86400}, ${kini() + 30 * 86400}, 1, 4000, 'admin')`;
  await ngobrol(L.pelanggan, "kak paket pro harganya berapa? mau upgrade", "Pelanggan");
  await mundurkan(L.pelanggan, 4 * 3600);
  await putaran();
  assert.equal(await fpBaris(L.pelanggan), undefined);
});

await cek("kelangkaan palsu dari AI ditolak (dua kali) -> templat yang jujur yang terkirim", async () => {
  await ngobrol(L.desak, "harga paket bisnis berapa kak?", "Dewi");
  await mundurkan(L.desak, 4 * 3600);
  hermes.desak = true;
  const awal = sCS.terkirim.length;
  await putaran();
  hermes.desak = false;
  assert.equal(sCS.terkirim.length, awal + 1);
  const t = sCS.terkirim.at(-1).teks;
  assert.notEqual(t, DESAK);
  assert.doesNotMatch(t, /hanya hari ini|sisa \d+ slot/i);
  assert.ok(hermes.panggilan.some((x) => x.sesi.startsWith("followup-prospek-") && x.sistem.includes("DITOLAK")), "umpan balik penolakan dikirim ke AI");
});

await cek("batas harian bersama: kiriman prospek ikut dihitung; penuh = tidak mengirim", async () => {
  const s = await fu.pengaturanFollowup();
  globalThis.__waFollowup.hari = ""; // hitung ulang dari database
  const n = (await fu.statusMesinFollowup()).kirimHariIni;
  assert.ok(n >= 4, `kiriman hari ini ${n}`);
  await fu.simpanPengaturanFollowup({ ...s, batasHarian: n });
  await ngobrol(L.tono, "harga paket starter berapa ya?", "Tono");
  await mundurkan(L.tono, 4 * 3600);
  const awal = sCS.terkirim.length;
  await putaran();
  assert.equal(sCS.terkirim.length, awal, "batas harian tercapai");
  await fu.simpanPengaturanFollowup({ ...s, batasHarian: 60 });
});

await cek("admin: status mesin, riwayat, edit draf, hentikan", async () => {
  const m = await fp.statusMesinProspek();
  assert.ok(m.terkirim >= 3, `terkirim ${m.terkirim}`);
  assert.ok(m.dibalas >= 2, `dibalas ${m.dibalas}`);
  const d = await fp.daftarProspek({ batas: 50 });
  assert.ok(d.length >= 4);
  assert.ok(d.every((x) => x.percakapan_id), "tautan ke percakapan");
  const jalan = d.find((x) => x.status === "jalan");
  assert.ok(jalan, "ada siklus berjalan");
  await fp.simpanDrafProspek(jalan.kunci, "Kak, draf yang diedit admin untuk pesan berikutnya ya.");
  assert.equal((await sql`SELECT draf FROM followup_prospek WHERE kunci = ${jalan.kunci}`)[0].draf, "Kak, draf yang diedit admin untuk pesan berikutnya ya.");
  await fp.hentikanProspek(jalan.kunci);
  assert.equal((await sql`SELECT status FROM followup_prospek WHERE kunci = ${jalan.kunci}`)[0].status, "batal");
  await assert.rejects(() => fp.hentikanProspek(jalan.kunci));
});

await cek("maskot: 'mengetik' menyala hanya selama AI benar-benar mengetik di nomor itu, padam saat balasan terkirim", async () => {
  const { dengarDetak, ringkasAktivitas } = await lib("src/lib/aktivitas.ts");
  const nomorCs = [{ id: CS.id, sesi: CS.sesi }];
  const lain = [{ id: 999_999, sesi: "sesi-lain" }];
  const jejak = [];
  const lepas = dengarDetak((u) => {
    if ("sesi" in u && u.sesi === CS.sesi) jejak.push(ringkasAktivitas(nomorCs).mengetik);
  });
  assert.equal(ringkasAktivitas(nomorCs).mengetik, null, "diam: tidak mengetik");
  await ngobrol("628333000009", "kak ada paket untuk 2 nomor?", "Yoga");
  await tunggu(() => ringkasAktivitas(nomorCs).mengetik === null, 3000, "mengetik padam");
  lepas();
  assert.ok(jejak.includes(CS.id), `sempat mengetik di nomor CS: ${JSON.stringify(jejak)}`);
  assert.equal(jejak.at(-1), null, "terakhir: berhenti mengetik");
  const r = ringkasAktivitas(nomorCs);
  assert.ok(r.kini - r.tDibalas < 5, "balasan baru terkirim tercatat");
  assert.equal(ringkasAktivitas(lain).mengetik, null, "nomor akun lain tidak ikut");
  assert.equal(ringkasAktivitas(lain).tDibalas, 0, "detak akun lain tidak bocor");
});

await cek("efisiensi: pemindaian lewat indeks parsial lead (20.000 chat di nomor CS)", async () => {
  const t = kini();
  await sql`
    INSERT INTO percakapan (number_id, kunci, telepon, nama, cuplikan, pengirim_akhir, masuk_n, bot_n, manusia_n, terakhir_pada, prospek, minat, minat_pada)
    SELECT ${CS.id}, md5('massal' || g), '6290' || g, 'M' || g, 'x', 1, 1, 1, 0, ${t} - (g % 2000) * 3600, CASE WHEN g % 10 = 0 THEN 1 ELSE 0 END,
           CASE WHEN g % 10 = 0 THEN 1 END, ${t} - (g % 2000) * 3600
      FROM generate_series(1, 20000) g`;
  await sql`ANALYZE percakapan`;
  const t0 = performance.now();
  const masuk = await fp.pindaiProspek(await nomorById(CS.id), await fp.pengaturanProspek());
  const ms = performance.now() - t0;
  const rencana = (await sql`
    EXPLAIN (ANALYZE, BUFFERS) SELECT p.kunci FROM percakapan p
     WHERE p.number_id = ${CS.id} AND p.prospek = 1 AND p.minat >= 1 AND p.terakhir_pada >= ${t - 3 * 86400} AND p.terakhir_pada <= ${t - 3600}
     ORDER BY p.terakhir_pada DESC, p.id DESC LIMIT 50`).map((r) => r["QUERY PLAN"]);
  const lead = (await sql`
    EXPLAIN (ANALYZE, BUFFERS) SELECT p.id FROM percakapan p WHERE p.number_id = ${CS.id} AND p.prospek = 1 AND p.minat >= 1
     ORDER BY p.terakhir_pada DESC, p.id DESC LIMIT 26`).map((r) => r["QUERY PLAN"]);
  console.log(`        (pindai 20.000 chat: ${ms.toFixed(0)} ms, ${masuk} masuk antrean · ${rencana.find((r) => /Execution Time/.test(r))?.trim()} · ${rencana.find((r) => /Scan/.test(r))?.trim().replace(/\s+\(cost.*$/, "")})`);
  console.log(`        (filter lead serius halaman 1: ${lead.find((r) => /Execution Time/.test(r))?.trim()} · ${lead.find((r) => /Scan/.test(r))?.trim().replace(/\s+\(cost.*$/, "")})`);
  assert.ok(rencana.some((r) => /percakapan_lead_idx/.test(r)), rencana.join("\n"));
  assert.ok(lead.some((r) => /percakapan_lead_idx/.test(r)), lead.join("\n"));
  assert.ok(ms < 2000, `pindai ${ms} ms`);
});

await bridge.tulisTuntas();
console.log(`\n${gagalList.length ? "ADA YANG GAGAL" : "SEMUA LOLOS"}: ${lolos} lolos, ${gagalList.length} gagal, ${((Date.now() - mulai) / 1000).toFixed(0)} dtk`);
if (gagalList.length) console.log("Gagal:\n- " + gagalList.join("\n- "));
server.close();
for (const s of globalThis.__waGerbang.sesi.values()) if (s.timer) clearTimeout(s.timer);
await globalThis.__waPg?.sql.end({ timeout: 2 }).catch(() => {});
await pg.berhenti().catch(() => {});
process.exit(gagalList.length ? 1 : 0);
