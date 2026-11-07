// Uji follow-up WhatsApp nomor CS (src/lib/followup.ts) ke akun gratis yang kuotanya habis.
// Yang asli: wa.ts, bridge.ts, followup.ts, langganan.ts, PostgreSQL 15 (sementara). Yang tiruan: soket WhatsApp & Hermes.
// Pakai (dari akar proyek): node --import ./uji/loader.mjs uji/uji-followup.mjs
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdirSync, rmSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { mulaiPg } from "./pg-lokal.mjs";

const akar = process.cwd();
const tmp = path.join(os.tmpdir(), "wa-uji-followup");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const pg = await mulaiPg({ dir: path.join(tmp, "pg"), sementara: true });
process.env.DATABASE_URL = pg.url;
process.env.DATA_DIR = path.join(tmp, "data-kosong");
process.env.WA_SKALA_WAKTU ??= "0.2";
process.env.ML_PELUANG_AUDIT = "0";
process.env.AUTH_SECRET = "rahasia-uji-followup";
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
const SAPAAN_AI = "Halo Kak Budi, ini CS ChatGerCep 👋 Bot WhatsApp Kakak sudah membalas 2 chat pelanggan, tapi kuota gratisnya sudah habis jadi AI-nya berhenti. Mau saya bantu aktifkan lagi?";
const hermes = { panggilan: [] };
const server = http.createServer((req, res) => {
  let b = "";
  req.on("data", (c) => (b += c));
  req.on("end", () => {
    if (req.url.endsWith("/models")) return res.end("{}");
    const j = JSON.parse(b);
    const p = { sesi: String(req.headers["x-hermes-session-id"] ?? ""), sistem: j.messages[0].content, pesan: j.messages[1].content };
    hermes.panggilan.push(p);
    const isi = p.sesi.startsWith("followup-")
      ? p.sesi.includes("pengingat")
        ? "Kak, maaf ganggu lagi 🙏 kalau mau AI-nya aktif lagi, balas chat ini saja ya. Kalau belum perlu juga tidak apa-apa."
        : SAPAAN_AI
      : `Jawaban CS untuk: ${p.pesan}`;
    res.setHeader("content-type", "application/json");
    setTimeout(() => res.end(JSON.stringify({ choices: [{ message: { content: isi } }] })), 20);
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
process.env.HERMES_API_URL = `http://127.0.0.1:${server.address().port}`;
process.env.HERMES_API_KEY = "uji";

const B = await lib("node_modules/baileys/lib/index.js");
const { db, setSetting, getSetting } = await lib("src/lib/db.ts");
const wa = await lib("src/lib/wa.ts");
const bridge = await lib("src/lib/bridge.ts");
const { tambahNomor, nomorById } = await lib("src/lib/numbers.ts");
const { tambahDokumen } = await lib("src/lib/knowledge.ts");
const fu = await lib("src/lib/followup.ts");
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
const baris = async (userId) => (await bridge.tulisTuntas(), (await sql`SELECT * FROM followup WHERE user_id = ${userId}`)[0]);
const fst = () => globalThis.__waFollowup;
/** Jatuhkan tempo satu akun lalu jalankan satu putaran tanpa jeda acak dari kiriman sebelumnya. */
async function putaranUntuk(userId) {
  await sql`UPDATE followup SET jadwal = ${kini() - 1} WHERE user_id = ${userId}`;
  fst().bolehPada = 0;
  await fu.putaranFollowup();
}

const mulai = Date.now();
console.log("\n== Follow-up WhatsApp nomor CS ==");

// ---------- Penyiapan ----------
const CS_WA = "628111000000";
await setSetting("kuota_percobaan", "2");
await setSetting("kuota_percobaan_ulang", "sekali");
await setSetting("kuota_percobaan_hari", "0");
const admin = await pengguna("admin@uji.id", "Admin", { peran: "admin" });
const pemilikCs = await pengguna("cs@uji.id", "Pemilik CS");
await sql`INSERT INTO langganan(user_id, nama_paket, mulai, sampai, kuota_nomor, kuota_balasan, sumber) VALUES (${pemilikCs}, 'Pro', ${kini() - 86400}, ${kini() + 30 * 86400}, 10, 100000, 'admin')`;
const { n: CS, s: sCS } = await nomorTerhubung("CS ChatGerCep", CS_WA, pemilikCs);
await tambahDokumen({ numberId: CS.id, judul: "CS", sumber: "teks", teks: "Kamu CS ChatGerCep. Paket Starter, Bisnis, dan Pro tersedia di halaman langganan." });
fu.mulaiFollowup();
clearInterval(fst().timer);
clearInterval(fst().timerPindai);

// Akun-akun gratis yang kuota percobaannya habis.
const akun = {};
for (const [k, nama, wa_] of [
  ["budi", "Budi Santoso", "628222000001"],
  ["sari", "Sari", "628222000002"],
  ["rina", "Rina", "628222000003"],
  ["dodi", "Dodi", "628222000004"], // tidak pernah chat CS
  ["eka", "Eka", null], // menghubungi lewat tombol Chat CS berkode akun
  ["fajar", "Fajar", "628222000006"], // berlangganan sebelum disapa
  ["gita", "Gita", "628222000007"], // chat CS duluan
]) {
  const id = await pengguna(`${k}@uji.id`, nama);
  const n = await nomorAkun(id, `Toko ${nama}`, wa_);
  await habiskan(n.id);
  akun[k] = { id, wa: wa_, n };
}
// Chat lama dengan nomor CS (3 hari lalu: tercatat tanpa dibalas AI) dari nomor yang sama dengan nomor yang di-scan.
for (const k of ["budi", "sari", "rina", "fajar", "gita"]) tiba(sCS, pesan(jid(akun[k].wa), "halo kak mau tanya soal bot", { waktu: kini() - 3 * 86400, nama: akun[k].id === akun.budi.id ? "Budi" : k }));
await tunggu(async () => (await bridge.tulisTuntas(), (await sql`SELECT COUNT(*)::int AS n FROM percakapan WHERE number_id = ${CS.id}`)[0].n === 5), 5000, "chat lama tercatat");

await cek("mati (bawaan): pemindaian tidak mengantrekan siapa pun", async () => {
  assert.equal(await fu.pindai(), 0);
  assert.equal((await sql`SELECT COUNT(*)::int AS n FROM followup`)[0].n, 0);
});

await cek("menyala: hanya akun gratis yang kuotanya habis DAN sudah pernah chat CS diantrekan (sekali, disapa setelah tundaJam)", async () => {
  await fu.simpanPengaturanFollowup({ aktif: true, nomorId: CS.id, batasHarian: 20, jamMulai: 0, jamSelesai: 24, tundaJam: 24, pengingatHari: 3 });
  await tunggu(async () => (await sql`SELECT COUNT(*)::int AS n FROM followup`)[0].n === 5, 5000, "5 akun diantrekan");
  await tidur(300);
  const ids = (await sql`SELECT user_id FROM followup ORDER BY user_id`).map((r) => r.user_id);
  assert.deepEqual(ids, ["budi", "sari", "rina", "fajar", "gita"].map((k) => akun[k].id).sort((a, b) => a - b), "dodi & eka belum pernah chat CS");
  const r = await baris(akun.budi.id);
  assert.equal(r.status, "antre");
  assert.equal(r.tujuan, akun.budi.wa, "chat CS-nya langsung tampil di daftar");
  assert.equal(r.nama, "Budi");
  assert.ok(Math.abs(r.jadwal - (kini() + 24 * 3600)) < 30, "disapa 24 jam kemudian");
  assert.equal((await sql`SELECT COUNT(*)::int AS n FROM followup WHERE user_id IN (${admin}, ${pemilikCs})`)[0].n, 0);
  assert.equal(await fu.pindai(), 0, "tidak diantrekan dua kali");
});

await cek("belum jatuh tempo: putaran tidak mengirim apa pun", async () => {
  const awal = sCS.terkirim.length;
  fst().bolehPada = 0;
  await fu.putaranFollowup();
  assert.equal(sCS.terkirim.length, awal);
});

await cek("pratinjau: draf sapaan disiapkan otomatis menjelang jadwal (maks 3 per putaran), tanpa mengirim apa pun", async () => {
  const awal = sCS.terkirim.length;
  const hitungDraf = async () => (await sql`SELECT COUNT(*)::int AS n FROM followup WHERE pesan1 IS NOT NULL`)[0].n;
  const d0 = await hitungDraf();
  fst().bolehPada = 0;
  await fu.putaranFollowup();
  assert.equal(sCS.terkirim.length, awal, "draf saja, tidak ada pesan terkirim");
  const d1 = await hitungDraf();
  assert.ok(d1 >= 1 && d1 - d0 <= 3, `draf ${d0} -> ${d1}`);
  const [rb] = await sql`SELECT pesan1, tujuan FROM followup WHERE user_id = ${akun.budi.id}`;
  assert.equal(rb.pesan1, SAPAAN_AI);
  assert.equal(rb.tujuan, akun.budi.wa, "chat tujuan sudah tampil sebelum terkirim");
  const f = (await fu.daftarFollowup({ batas: 100 })).find((x) => x.user_id === akun.budi.id);
  assert.equal(f.pesan1, SAPAAN_AI, "riwayat admin membawa draf");
});

let idSapaan;
await cek("sapaan: ditulis AI, dikirim ke chat lama dengan ritme manusia (online, mengetik, berhenti, kirim), tercatat di histori", async () => {
  const awal = sCS.terkirim.length;
  sCS.urutan.length = 0;
  await putaranUntuk(akun.budi.id);
  assert.equal(sCS.terkirim.length, awal + 1);
  const k = sCS.terkirim.at(-1);
  assert.equal(k.jid, jid(akun.budi.wa));
  assert.equal(k.teks, SAPAAN_AI);
  idSapaan = k.id;
  const u = sCS.urutan.join(",");
  assert.match(u, /ketik.*kirim/, `urutan: ${u}`);
  assert.ok(u.indexOf("ketik") < u.indexOf("kirim"));
  const r = await baris(akun.budi.id);
  assert.equal(r.status, "terkirim");
  assert.equal(r.tahap, 1);
  assert.equal(r.tujuan, akun.budi.wa);
  assert.ok(Math.abs(r.jadwal - (kini() + 3 * 86400)) < 30, "pengingat 3 hari kemudian");
  const [h] = await sql`SELECT m.teks FROM pesan_chat m JOIN percakapan p ON p.id = m.percakapan_id WHERE p.number_id = ${CS.id} AND p.telepon = ${akun.budi.wa} AND m.peran = 1`;
  assert.equal(h?.teks, SAPAAN_AI);
  const ai = hermes.panggilan.find((p) => p.sesi.startsWith(`followup-${akun.budi.id}-sapaan`));
  assert.ok(ai, "AI menulis sapaannya");
  assert.match(ai.sistem, /JANGAN menulis tautan/);
  assert.match(ai.sistem, /Panggil lawan bicara "kamu"/);
  assert.equal(r.pesan1, SAPAAN_AI, "teks yang terkirim tersimpan untuk riwayat");
  const [pakai] = await sql`SELECT COUNT(*)::int AS n FROM ai_pakai WHERE number_id = ${CS.id} AND abaikan`;
  assert.ok(pakai.n >= 1, "biaya AI tercatat tanpa memotong kuota nomor CS");
});

await cek("jeda acak antarpesan: putaran berikutnya tidak langsung mengirim walau ada yang jatuh tempo", async () => {
  await sql`UPDATE followup SET jadwal = ${kini() - 1} WHERE user_id = ${akun.sari.id}`;
  const awal = sCS.terkirim.length;
  await fu.putaranFollowup();
  assert.equal(sCS.terkirim.length, awal);
  const sisa = fst().bolehPada - Date.now();
  assert.ok(sisa > 2.9 * 60_000 && sisa <= 10 * 60_000, `jeda ${sisa} ms`);
});

await cek("status kiriman: centang dua & biru tercatat dari event WhatsApp", async () => {
  sCS.pancar("messages.update", [{ key: { remoteJid: jid(akun.budi.wa), id: idSapaan, fromMe: true }, update: { status: 3 } }]);
  await tunggu(async () => (await baris(akun.budi.id)).ack1 === 3, 3000, "ack1 = 3");
  sCS.pancar("messages.update", [{ key: { remoteJid: jid(akun.budi.wa), id: idSapaan, fromMe: true }, update: { status: 4 } }]);
  await tunggu(async () => (await baris(akun.budi.id)).ack1 === 4, 3000, "ack1 = 4");
});

await cek("dibalas: pesan dibaca (centang biru) lalu dijawab AI CS dengan konteks akun; follow-up berstatus dibalas", async () => {
  const awal = sCS.terkirim.length;
  sCS.urutan.length = 0;
  const m = pesan(jid(akun.budi.wa), "iya kak mau, gimana caranya?", { nama: "Budi" });
  tiba(sCS, m);
  await tunggu(() => sCS.terkirim.length > awal, 8000, "jawaban CS");
  assert.ok(sCS.dibaca.includes(m.key.id), "pesan ditandai dibaca");
  const u = sCS.urutan.join(",");
  assert.ok(u.indexOf("baca") < u.indexOf("kirim"), `urutan: ${u}`);
  const ai = hermes.panggilan.findLast((p) => !p.sesi.startsWith("followup-"));
  assert.match(ai.sistem, /Konteks CS/);
  assert.match(ai.sistem, /budi@uji\.id/);
  assert.match(ai.sistem, /HABIS/);
  const r = await baris(akun.budi.id);
  assert.equal(r.status, "dibalas");
  assert.ok(r.dibalas);
});

await cek("balasan berikutnya di chat itu tidak dinilai ulang (kata \"berhenti\" di tengah obrolan bukan penolakan)", async () => {
  const awal = sCS.terkirim.length;
  tiba(sCS, pesan(jid(akun.budi.wa), "kalau nanti mau berhenti langganan gimana kak?", { nama: "Budi" }));
  await tunggu(() => sCS.terkirim.length > awal, 8000, "jawaban CS");
  assert.equal((await baris(akun.budi.id)).status, "dibalas");
  assert.equal((await sql`SELECT COUNT(*)::int AS n FROM followup_stop`)[0].n, 0);
});

await cek("minta berhenti: dicatat permanen, AI diminta meminta maaf tanpa menawarkan", async () => {
  // Admin mengedit draf: teks editan itulah yang terkirim, persis.
  const EDIT = "Halo Sari, ini pesan editan admin untuk uji pratinjau.";
  await fu.simpanPesan(akun.sari.id, EDIT);
  await putaranUntuk(akun.sari.id);
  assert.equal(sCS.terkirim.at(-1).teks, EDIT);
  assert.equal((await baris(akun.sari.id)).status, "terkirim");
  const awal = sCS.terkirim.length;
  tiba(sCS, pesan(jid(akun.sari.wa), "stop, jangan hubungi saya lagi"));
  await tunggu(() => sCS.terkirim.length > awal, 8000, "jawaban CS");
  const r = await baris(akun.sari.id);
  assert.equal(r.status, "stop");
  assert.equal((await sql`SELECT COUNT(*)::int AS n FROM followup_stop`)[0].n, 1);
  assert.match(hermes.panggilan.findLast((p) => !p.sesi.startsWith("followup-")).sistem, /meminta tidak dihubungi lagi/);
});

await cek("pengingat: sekali bila sapaan sampai tapi tidak dibalas, lalu selesai (maks 2 pesan seumur akun)", async () => {
  await putaranUntuk(akun.rina.id);
  let r = await baris(akun.rina.id);
  assert.equal(r.status, "terkirim");
  const id1 = sCS.terkirim.at(-1).id;
  sCS.pancar("messages.update", [{ key: { remoteJid: jid(akun.rina.wa), id: id1, fromMe: true }, update: { status: 3 } }]);
  await tunggu(async () => (await baris(akun.rina.id)).ack1 === 3, 3000, "ack1");
  const awal = sCS.terkirim.length;
  await putaranUntuk(akun.rina.id);
  assert.equal(sCS.terkirim.length, awal + 1);
  assert.match(sCS.terkirim.at(-1).teks, /maaf ganggu lagi/);
  r = await baris(akun.rina.id);
  assert.equal(r.status, "selesai");
  assert.equal(r.tahap, 2);
  assert.ok(hermes.panggilan.some((p) => p.sesi.startsWith(`followup-${akun.rina.id}-pengingat`) && /tidak dibalas/.test(p.pesan)), "AI melihat sapaan sebelumnya");
  // Tidak ada pesan ketiga.
  await putaranUntuk(akun.rina.id);
  assert.equal(sCS.terkirim.length, awal + 1);
});

await cek("tanpa chat CS yang cocok: tidak masuk antrean / daftar admin, tidak dikirimi apa pun; baris antre lama dikeluarkan", async () => {
  const awal = sCS.terkirim.length;
  assert.equal(await baris(akun.dodi.id), undefined, "tidak diantrekan");
  assert.ok(!(await fu.daftarFollowup({ batas: 100 })).some((x) => x.user_id === akun.dodi.id), "tidak tampil di daftar");
  const f = await fu.followupAkun(akun.dodi.id);
  assert.equal(f.chat, null);
  assert.equal(f.baris, null);
  // Baris dari versi lama (semua akun diantrekan): dikeluarkan saat jatuh tempo...
  const lama = () => sql`INSERT INTO followup(user_id, status, jadwal, dibuat, diperbarui) VALUES (${akun.dodi.id}, 'antre', ${kini() - 1}, ${kini() - 86400}, ${kini() - 86400})`;
  await lama();
  await putaranUntuk(akun.dodi.id);
  assert.equal(sCS.terkirim.length, awal);
  assert.equal(await baris(akun.dodi.id), undefined, "dikeluarkan putaran");
  // ...dan oleh pemindaian (berjalan 90 detik setelah server mulai / tiap 30 menit), tanpa menunggu jadwal.
  await lama();
  await sql`UPDATE followup SET jadwal = ${kini() + 86400} WHERE user_id = ${akun.dodi.id}`;
  await fu.pindai();
  assert.equal(await baris(akun.dodi.id), undefined, "dikeluarkan pemindaian");
  assert.equal(sCS.terkirim.length, awal);
});

await cek("admin: nomor yang belum pernah chat CS ditolak; nomor lain yang pernah chat ditautkan, langsung masuk antrean dan dipakai", async () => {
  await assert.rejects(fu.tautkanChatCs(akun.dodi.id, "0812 9999 0000"), /belum pernah chat nomor CS/);
  await assert.rejects(fu.tulisUlangPesan(akun.dodi.id), /Tidak ada pesan yang menunggu dikirim/);
  tiba(sCS, pesan(jid("6289900001111"), "halo cs, ini dodi dari hp lain", { waktu: kini() - 2 * 86400, nama: "Dodi HP2" }));
  await tunggu(async () => (await bridge.tulisTuntas(), (await sql`SELECT 1 FROM percakapan WHERE telepon = '6289900001111'`).length), 4000, "chat HP lain");
  assert.match(await fu.tautkanChatCs(akun.dodi.id, "+62 899-0000-1111"), /Tertaut/);
  const f = await fu.followupAkun(akun.dodi.id);
  assert.equal(f.chat.telepon, "6289900001111");
  assert.equal(f.chat.manual, true);
  assert.equal(f.baris?.status, "antre", "langsung diantrekan setelah ditautkan");
  assert.equal(f.baris.tujuan, "6289900001111");
  // Pratinjau sekarang bisa dibuat.
  assert.equal(await fu.tulisUlangPesan(akun.dodi.id), SAPAAN_AI);
  await putaranUntuk(akun.dodi.id);
  assert.equal(sCS.terkirim.at(-1).jid, jid("6289900001111"));
  assert.equal((await baris(akun.dodi.id)).status, "terkirim");
  // Pengingat berikutnya bisa ditulis ulang; sapaan yang sudah terkirim tidak bisa diubah lagi.
  const ulang = await fu.tulisUlangPesan(akun.dodi.id);
  assert.match(ulang, /maaf ganggu lagi/);
  assert.equal((await baris(akun.dodi.id)).pesan2, ulang);
  await assert.rejects(fu.simpanPesan(akun.budi.id, "ubah pesan yang sudah terkirim"), /sudah terkirim/);
  await assert.rejects(fu.simpanPesan(akun.dodi.id, "pendek"), /10–1500 karakter/);
});

await cek("tombol Chat CS: tautan wa.me berkode akun; pesan berkode menautkan chat & membatalkan follow-up (pengguna chat duluan)", async () => {
  const t = await fu.tautanChatCs(akun.eka.id);
  assert.ok(t.startsWith(`https://wa.me/${CS_WA}?text=`));
  const teks = decodeURIComponent(t.split("text=")[1]);
  assert.match(teks, new RegExp(`Kode akun: ${fu.kodeAkun(akun.eka.id)}`));
  const awal = sCS.terkirim.length;
  tiba(sCS, pesan(jid("6287700002222"), teks, { nama: "Eka" }));
  await tunggu(() => sCS.terkirim.length > awal, 8000, "jawaban CS");
  const [u] = await sql`SELECT cs_kunci FROM users WHERE id = ${akun.eka.id}`;
  assert.ok(u.cs_kunci);
  const r = await baris(akun.eka.id);
  assert.equal(r.status, "batal");
  assert.match(r.alasan, /tombol Chat CS/);
  assert.match(hermes.panggilan.findLast((p) => !p.sesi.startsWith("followup-")).sistem, /eka@uji\.id/);
  // Kode palsu (HMAC salah) diabaikan.
  tiba(sCS, pesan(jid("6287700003333"), `halo (Kode akun: ${akun.fajar.id}-ffff)`));
  await tunggu(async () => (await bridge.tulisTuntas(), (await sql`SELECT 1 FROM percakapan WHERE telepon = '6287700003333'`).length), 4000, "chat kode palsu");
  assert.equal((await sql`SELECT cs_kunci FROM users WHERE id = ${akun.fajar.id}`)[0].cs_kunci, null);
  // Balasan AI CS untuk chat kode palsu ditunggu tuntas, supaya tidak terhitung di uji berikutnya.
  await tunggu(() => sCS.terkirim.some((k) => k.jid === jid("6287700003333")), 8000, "jawaban CS untuk kode palsu");
});

await cek("sudah berlangganan sebelum disapa: dibatalkan tanpa pesan", async () => {
  await sql`INSERT INTO langganan(user_id, nama_paket, mulai, sampai, kuota_nomor, kuota_balasan, sumber) VALUES (${akun.fajar.id}, 'Starter', ${kini()}, ${kini() + 30 * 86400}, 1, 1000, 'admin')`;
  const { segarkanKuota } = await lib("src/lib/langganan.ts");
  segarkanKuota(akun.fajar.id);
  const awal = sCS.terkirim.length;
  await putaranUntuk(akun.fajar.id);
  assert.equal(sCS.terkirim.length, awal);
  const r = await baris(akun.fajar.id);
  assert.equal(r.status, "batal");
  assert.equal(r.alasan, "Sudah berlangganan");
});

await cek("pengguna chat CS duluan setelah kuota habis: follow-up dibatalkan", async () => {
  await sql`UPDATE followup SET dibuat = ${kini() - 3600} WHERE user_id = ${akun.gita.id}`;
  // Dihitung hanya kiriman ke chat Gita: balasan AI CS untuk chat lain (uji sebelumnya) bisa tiba kapan saja.
  const keGita = () => sCS.terkirim.filter((k) => k.jid === jid(akun.gita.wa)).length;
  const awal = keGita();
  tiba(sCS, pesan(jid(akun.gita.wa), "kak kuota saya habis nih"));
  await tunggu(() => keGita() > awal, 8000, "jawaban CS");
  await putaranUntuk(akun.gita.id);
  assert.equal(keGita(), awal + 1, "hanya jawaban CS, tanpa follow-up");
  assert.equal((await baris(akun.gita.id)).alasan, "Pengguna sudah chat CS duluan");
});

await cek("anti saling-balas: bot pelanggan tidak membalas pesan dari nomor CS (tapi tetap membalas pelanggan lain)", async () => {
  const pemilikW = await pengguna("w@uji.id", "Toko W");
  await sql`INSERT INTO langganan(user_id, nama_paket, mulai, sampai, kuota_nomor, kuota_balasan, sumber) VALUES (${pemilikW}, 'Pro', ${kini() - 60}, ${kini() + 30 * 86400}, 10, 100000, 'admin')`;
  const { n: W, s: sW } = await nomorTerhubung("Toko W", "628333000000", pemilikW);
  await tambahDokumen({ numberId: W.id, judul: "W", sumber: "teks", teks: "Toko W menjual kopi." });
  tiba(sW, pesan(jid(CS_WA), "Halo kak, ini CS ChatGerCep"));
  tiba(sW, pesan(jid("628444000000"), "kopi ada?"));
  await tunggu(() => sW.terkirim.length >= 1, 8000, "jawaban ke pelanggan biasa");
  await tidur(2500);
  assert.deepEqual(sW.terkirim.map((k) => k.jid), [jid("628444000000")]);
  await bridge.tulisTuntas();
  assert.equal((await sql`SELECT COUNT(*)::int AS n FROM percakapan WHERE number_id = ${W.id} AND telepon = ${CS_WA}`)[0].n, 1, "pesan CS tetap tercatat");
});

await cek("rem otomatis: banyak centang satu menghentikan semua kiriman + notifikasi admin; dilepas admin = jalan lagi", async () => {
  const lama = kini() - 7 * 3600;
  for (let i = 0; i < 5; i++) {
    const id = await pengguna(`rem${i}@uji.id`, `Rem ${i}`);
    await sql`INSERT INTO followup(user_id, status, tahap, jadwal, dibuat, diperbarui, terkirim1, ack1) VALUES (${id}, 'selesai', 1, ${lama}, ${lama}, ${lama}, ${lama}, ${i < 3 ? 2 : 3})`;
  }
  const korban = await pengguna("korban@uji.id", "Korban");
  const n = await nomorAkun(korban, "Toko Korban", "628222000099");
  await habiskan(n.id);
  tiba(sCS, pesan(jid("628222000099"), "halo", { waktu: kini() - 3 * 86400 }));
  await tunggu(async () => (await bridge.tulisTuntas(), (await sql`SELECT 1 FROM percakapan WHERE telepon = '628222000099'`).length), 4000, "chat korban");
  await sql`INSERT INTO followup(user_id, status, jadwal, dibuat, diperbarui) VALUES (${korban}, 'antre', ${kini() - 1}, ${kini() - 86400}, ${kini() - 86400})
            ON CONFLICT (user_id) DO UPDATE SET status = 'antre', jadwal = EXCLUDED.jadwal, dibuat = EXCLUDED.dibuat`;
  const awal = sCS.terkirim.length;
  await putaranUntuk(korban);
  assert.equal(sCS.terkirim.length, awal, "tidak ada kiriman selama direm");
  const rem = JSON.parse((await getSetting("followup_rem")) || "null");
  assert.match(rem.alasan, /3 dari 5/);
  assert.equal((await sql`SELECT COUNT(*)::int AS n FROM notifikasi WHERE user_id = ${admin} AND jenis = 'admin_followup'`)[0].n, 1);
  await fu.lepasRemFollowup();
  await putaranUntuk(korban);
  assert.equal(sCS.terkirim.length, awal + 1, "jalan lagi setelah rem dilepas");
});

await cek("batas harian & jam kirim dihormati", async () => {
  const s = await fu.pengaturanFollowup();
  await fu.simpanPengaturanFollowup({ ...s, batasHarian: 1 });
  const awal = sCS.terkirim.length;
  await sql`UPDATE followup SET status = 'antre', tahap = 0, terkirim1 = NULL WHERE user_id = ${akun.gita.id}`;
  await sql`UPDATE followup SET dibuat = ${kini() - 86400 * 10} WHERE user_id = ${akun.gita.id}`;
  await putaranUntuk(akun.gita.id);
  assert.equal(sCS.terkirim.length, awal, "batas harian penuh");
  const jam = new Date(Date.now() + 7 * 3600_000).getUTCHours();
  const jamMulai = (jam + 1) % 24; // satu jam setelah sekarang, sejam saja: sekarang di luar jam kirim
  await fu.simpanPengaturanFollowup({ ...s, batasHarian: 20, jamMulai, jamSelesai: jamMulai + 1 });
  await putaranUntuk(akun.gita.id);
  assert.equal(sCS.terkirim.length, awal, "di luar jam kirim");
});

await cek("efisiensi (3.000 akun gratis, 2.000 baris ai_pakai, 1.500 chat CS): pemindaian & putaran cepat, antrean lewat indeks", async () => {
  const s = await fu.pengaturanFollowup();
  await fu.simpanPengaturanFollowup({ ...s, jamMulai: 0, jamSelesai: 24 });
  await tunggu(() => !fst().pindaiJalan, 5000, "pemindaian latar selesai");
  const t = kini();
  // 3.000 akun gratis, masing-masing satu nomor; sepertiga kuotanya habis (2 balasan), sisanya belum terpakai.
  await sql`INSERT INTO users(email, nama, password_hash, created_at) SELECT 'massal' || i || '@uji.id', 'Massal ' || i, 'x', ${t - 10 * 86400} FROM generate_series(1, 3000) i`;
  await sql`INSERT INTO numbers(user_id, sesi, label, wa_id, created_at)
            SELECT u.id, 'massal' || u.id, 'Toko', '6285' || lpad(u.id::text, 9, '0'), ${t} FROM users u WHERE u.email LIKE 'massal%'`;
  await sql`INSERT INTO ai_pakai(number_id, waktu, penyedia, ms)
            SELECT n.id, ${t - 3600} - g, 'hermes', 10 FROM numbers n CROSS JOIN generate_series(1, 2) g WHERE n.sesi LIKE 'massal%' AND n.user_id % 3 = 0`;
  // Separuh akun pernah chat nomor CS (chat masih ramai sejam lalu: sapaan ditunda, putaran tidak mengirim).
  await sql`INSERT INTO percakapan(number_id, kunci, telepon, nama, terakhir_pada)
            SELECT ${CS.id}, 'massal-' || n.id, n.wa_id, 'Massal', ${t - 3600} FROM numbers n WHERE n.sesi LIKE 'massal%' AND n.user_id % 2 = 0`;
  await sql`ANALYZE`;
  cacheNomorBasi();
  const t0 = performance.now();
  const masuk = await fu.pindai();
  const tPindai = performance.now() - t0;
  assert.equal(masuk, 100, "paling banyak 100 akun per pemindaian (LIMIT); sisanya di pemindaian berikutnya");
  const [tanpaChat] = await sql`
    SELECT COUNT(*)::int AS n FROM followup f JOIN numbers n ON n.user_id = f.user_id
     WHERE n.sesi LIKE 'massal%' AND NOT EXISTS (SELECT 1 FROM percakapan p WHERE p.number_id = ${CS.id} AND p.telepon = n.wa_id)`;
  assert.equal(tanpaChat.n, 0, "akun yang belum pernah chat CS tidak ikut diantrekan");
  const t2 = performance.now();
  assert.equal(await fu.pindai(), 100, "pemindaian berikutnya mengantrekan 100 berikutnya, bukan yang tanpa chat");
  const tPindai2 = performance.now() - t2;
  await sql`UPDATE followup SET jadwal = ${kini() - 1} WHERE status = 'antre'`;
  fst().bolehPada = 0;
  const t1 = performance.now();
  await fu.putaranFollowup();
  const tPutaran = performance.now() - t1;
  const rencana = (await sql`EXPLAIN (ANALYZE, BUFFERS) SELECT user_id, status, tahap, dibuat, terkirim1, ack1, kunci FROM followup WHERE status IN ('antre', 'terkirim') AND jadwal <= ${kini()} ORDER BY jadwal, user_id LIMIT 10`).map((r) => r["QUERY PLAN"]);
  const csId = CS.id;
  const satu = (await sql`SELECT n.user_id FROM numbers n JOIN percakapan p ON p.number_id = ${csId} AND p.telepon = n.wa_id WHERE n.sesi LIKE 'massal%' LIMIT 1`)[0].user_id;
  const rencanaChat = (await sql`
    EXPLAIN (ANALYZE, BUFFERS) SELECT c.* FROM users u CROSS JOIN LATERAL (
      SELECT p.id, p.terakhir_pada, true AS manual FROM percakapan p WHERE p.kunci = u.cs_kunci AND p.number_id = ${csId}
      UNION ALL
      SELECT p.id, p.terakhir_pada, false FROM percakapan p WHERE p.number_id = ${csId} AND p.telepon IN (
        SELECT n.wa_id FROM numbers n WHERE n.user_id = u.id AND n.wa_id IS NOT NULL
        UNION ALL SELECT n.teruskan_ke FROM numbers n WHERE n.user_id = u.id AND n.teruskan_ke IS NOT NULL)
      ORDER BY manual DESC, terakhir_pada DESC LIMIT 1) c WHERE u.id = ${satu}`).map((r) => r["QUERY PLAN"]);
  console.log(`        (pindai 3.000 akun: ${tPindai.toFixed(0)} ms, ${masuk} diantrekan; pindai berikutnya ${tPindai2.toFixed(0)} ms; satu putaran: ${tPutaran.toFixed(0)} ms)`);
  console.log(`        (query antrean: ${rencana.find((r) => /Execution Time/.test(r))?.trim()} · ${rencana.find((r) => /Scan/.test(r))?.trim()})`);
  console.log(`        (chat CS satu akun: ${rencanaChat.find((r) => /Execution Time/.test(r))?.trim()} · ${rencanaChat.filter((r) => /percakapan/.test(r)).map((r) => r.trim().replace(/\s+\(cost.*$/, "")).join(" | ")})`);
  assert.ok(!rencanaChat.some((r) => /Seq Scan on percakapan/.test(r)), "chat CS dicari lewat indeks, bukan memindai semua chat");
  assert.ok(tPindai < 2000, `pindai ${tPindai} ms`);
});

await bridge.tulisTuntas();
console.log(`\n${gagalList.length ? "ADA YANG GAGAL" : "SEMUA LOLOS"}: ${lolos} lolos, ${gagalList.length} gagal, ${((Date.now() - mulai) / 1000).toFixed(0)} dtk`);
if (gagalList.length) console.log("Gagal:\n- " + gagalList.join("\n- "));
server.close();
for (const s of globalThis.__waGerbang.sesi.values()) if (s.timer) clearTimeout(s.timer);
await globalThis.__waPg?.sql.end({ timeout: 2 }).catch(() => {});
await pg.berhenti().catch(() => {});
process.exit(gagalList.length ? 1 : 0);
