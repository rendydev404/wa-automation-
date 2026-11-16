// Uji follow-up di nomor pengguna berbayar (src/lib/followup-usaha.ts): prospek yang diam + pengingat order ulang,
// dengan anggaran, pemanasan, rasio, dan rem PER NOMOR. Yang asli: wa.ts, bridge.ts, followup.ts, followup-usaha.ts,
// PostgreSQL 15 (sementara). Tiruan: soket WhatsApp & Hermes.
// Pakai (dari akar proyek): node --import ./uji/loader.mjs uji/uji-followup-usaha.mjs
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdirSync, rmSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { mulaiPg } from "./pg-lokal.mjs";

const akar = process.cwd();
const tmp = path.join(os.tmpdir(), "wa-uji-followup-usaha");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const pg = await mulaiPg({ dir: path.join(tmp, "pg"), sementara: true });
process.env.DATABASE_URL = pg.url;
process.env.DATA_DIR = path.join(tmp, "data-kosong");
process.env.WA_SKALA_WAKTU ??= "0.2";
process.env.WA_FOLLOWUP_STABIL_MENIT ??= "0"; // uji: nomor tiruan langsung dianggap stabil (syarat koneksi stabil diuji tersendiri)
process.env.ML_PELUANG_AUDIT = "0";
process.env.AUTH_SECRET = "rahasia-uji-followup-usaha";
const lib = (f) => import(pathToFileURL(path.join(akar, f)).href);
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
const TEKS = {
  1: "Kak, soal cuci bedcover king yang tadi ditanyakan, bisa dijemput gratis untuk area Jl. Melati. Mau dijadwalkan jemput sore ini atau besok pagi?",
  2: "Kak, bedcover king selesai 2 hari, jadi masih sempat dipakai akhir pekan. Kalau digabung kiloan, jemputnya tetap gratis. Mau aku jadwalkan sekarang?",
  3: "Kak, ini pesan terakhir dariku soal ini ya, aku tidak akan mengganggu lagi. Kapan pun butuh, cukup balas chat ini.",
  ulang: "Kak Rina, kemarin cuci bedcover king di kami. Mau dijemput lagi minggu ini? Jadwal jemput pagi atau sore bisa kak.",
};
const TAUTAN = "Kak, cek katalog lengkap kami di https://contoh-laundry.id/katalog ya, nanti tinggal pilih dan pesan langsung dari sana.";
const hermes = { panggilan: [], tautan: false, lewati: false };
const server = http.createServer((req, res) => {
  let b = "";
  req.on("data", (c) => (b += c));
  req.on("end", () => {
    if (req.url.endsWith("/models")) return res.end("{}");
    const j = JSON.parse(b);
    const p = { sesi: String(req.headers["x-hermes-session-id"] ?? ""), sistem: j.messages[0].content, pesan: j.messages[1].content };
    hermes.panggilan.push(p);
    let isi;
    if (p.sesi.startsWith("followup-usaha-")) {
      isi = hermes.lewati ? "<lewati>ia sudah bilang tidak jadi beli</lewati>" : hermes.tautan ? TAUTAN : /order ulang/.test(p.pesan) ? TEKS.ulang : TEKS[Number(/tahap (\d)/.exec(p.pesan)?.[1] ?? 1)];
    } else {
      const m = p.pesan.toLowerCase();
      const tag = /sudah transfer|sudah bayar/.test(m)
        ? "<nilai>prospek</nilai><minat>beli</minat>"
        : /rekening|jadi ambil/.test(m)
          ? "<nilai>prospek</nilai><minat>panas</minat>"
          : /harga|berapa|bedcover/.test(m)
            ? "<nilai>prospek</nilai><minat>hangat</minat>"
            : "<nilai>netral</nilai>";
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
const { segarkanKuota } = await lib("src/lib/langganan.ts");
const { simpanProduk } = await lib("src/lib/katalog.ts");
const fu = await lib("src/lib/followup.ts");
const fp = await lib("src/lib/followup-prospek.ts");
const fx = await lib("src/lib/followup-usaha.ts");
const def = await lib("src/lib/followup-def.ts");
const sql = await db();

// ---------- Soket WhatsApp tiruan ----------
const soket = [];
function buatSoket(config) {
  const ev = new EventEmitter();
  const ws = new EventEmitter();
  const s = {
    config,
    ev,
    ws,
    terkirim: [],
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
    async readMessages() {},
    async sendPresenceUpdate(t) {
      if (t === "composing") s.urutan.push("ketik");
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
  key: { remoteJid: jid, id: o.id ?? `FX${String(++urut).padStart(5, "0")}`, fromMe: !!o.dariSaya },
  messageTimestamp: o.waktu ?? kini(),
  pushName: o.nama ?? "Pelanggan",
  message: { conversation: teks },
});
const tiba = (s, ...m) => s.pancar("messages.upsert", { messages: m, type: "notify" });
const jid = (d) => `${d}@s.whatsapp.net`;

async function pengguna(email, nama, o = {}) {
  const [u] = await sql`INSERT INTO users(email, nama, password_hash, peran, created_at) VALUES (${email}, ${nama}, 'x', ${o.peran ?? "user"}, ${kini() - 40 * 86400}) RETURNING id`;
  if (o.paket !== false)
    await sql`INSERT INTO langganan(user_id, nama_paket, mulai, sampai, kuota_nomor, kuota_balasan, sumber) VALUES (${u.id}, 'Bisnis', ${kini() - 86400}, ${kini() + 30 * 86400}, 3, ${o.kuota ?? 100000}, 'admin')`;
  return u.id;
}
async function nomorTerhubung(label, waId, userId, o = {}) {
  const n = await tambahNomor(label, userId);
  await sql`UPDATE numbers SET tunggu_detik = 1, tunggu_baca_detik = 3, jeda_detik = 1800, saring_prospek = false, created_at = ${o.dibuat ?? kini() - 30 * 86400} WHERE id = ${n.id}`;
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
  await tambahDokumen({ numberId: n.id, judul: "Usaha", sumber: "teks", teks: "Kamu CS Laundry Melati. Cuci bedcover king Rp35.000, selesai 2 hari. Kiloan Rp8.000/kg. Jemput gratis area Jl. Melati minimal 5 kg." });
  // Balasan biasa yang cukup banyak hari ini supaya batas rasio tidak ikut membatasi (kecuali diuji sendiri).
  await sql`INSERT INTO stats(number_id, tanggal, dibalas) VALUES (${n.id}, (now() AT TIME ZONE 'Asia/Jakarta')::date, ${o.dibalas ?? 200}) ON CONFLICT (number_id, tanggal) DO UPDATE SET dibalas = EXCLUDED.dibalas`;
  return { n: await nomorById(n.id), s: s2 };
}
const xst = () => globalThis.__waFollowupUsaha;
const chatDari = async (numberId, wa_) => (await bridge.tulisTuntas(), (await sql`SELECT * FROM percakapan WHERE number_id = ${numberId} AND telepon = ${wa_}`)[0]);
const prospekDari = async (wa_) => (await bridge.tulisTuntas(), (await sql`SELECT fp.* FROM followup_prospek fp JOIN percakapan p ON p.kunci = fp.kunci WHERE p.telepon = ${wa_}`)[0]);
const ulangDari = async (wa_) => (await bridge.tulisTuntas(), (await sql`SELECT u.* FROM followup_ulang u JOIN percakapan p ON p.kunci = u.kunci WHERE p.telepon = ${wa_}`)[0]);
/** Mundurkan seluruh chat (histori & penanda waktu) sekian detik: seolah pelanggan sudah diam selama itu. */
async function mundurkan(numberId, wa_, detik) {
  await bridge.tulisTuntas();
  const c = await chatDari(numberId, wa_);
  await sql`UPDATE pesan_chat SET waktu = waktu - ${detik} WHERE percakapan_id = ${c.id}`;
  await sql`UPDATE percakapan SET terakhir_pada = terakhir_pada - ${detik}, minat_pada = minat_pada - ${detik}, beli_pada = beli_pada - ${detik} WHERE id = ${c.id}`;
}
/** Satu putaran tanpa jeda acak & dengan pemindaian dipaksa. */
async function putaran() {
  for (const p of xst().per.values()) {
    p.bolehPada = 0;
    p.pindaiPada = 0;
    p.pindaiUlangPada = 0;
    p.cekRemPada = 0;
  }
  await fu.putaranFollowupUsaha();
  await bridge.tulisTuntas();
}
async function ngobrol(s, wa_, teks, nama) {
  const awal = s.terkirim.length;
  tiba(s, pesan(jid(wa_), teks, { nama }));
  await tunggu(() => s.terkirim.length > awal, 8000, `jawaban untuk "${teks}"`);
  await bridge.tulisTuntas();
}
const SETELAN = { ...def.SETELAN_USAHA_AWAL, jamMulai: 0, jamSelesai: 24, batasHarian: 10 };

const mulai = Date.now();
console.log("\n== Follow-up nomor pengguna berbayar: prospek + order ulang ==");

fu.mulaiFollowup();
clearInterval(globalThis.__waFollowup.timer);
clearInterval(globalThis.__waFollowup.timerPindai);
clearInterval(globalThis.__waFollowup.timerUsaha);

const pemilik = await pengguna("laundry@uji.id", "Laundry Melati");
const { n: A, s: sA } = await nomorTerhubung("Laundry Melati", "628222000001", pemilik);
const P = { rina: "628444000001", budi: "628444000002", sari: "628444000003", tari: "628444000004", lama: "628444000005", desi: "628444000006", eko: "628444000007" };

await cek("mati (bawaan): minat tidak dinilai, tidak ada yang diantrekan atau dikirim", async () => {
  await ngobrol(sA, P.budi, "kak cuci bedcover berapa?", "Budi");
  assert.equal((await chatDari(A.id, P.budi)).minat, null, "penyaring prospek mati & follow-up mati = tanpa penilaian");
  assert.doesNotMatch(hermes.panggilan.findLast((x) => x.sesi.startsWith("wa-")).sistem, /<minat>beli<\/minat>/);
  await mundurkan(A.id, P.budi, 4 * 3600);
  const awal = sA.terkirim.length;
  await putaran();
  assert.equal(sA.terkirim.length, awal);
  assert.equal((await sql`SELECT COUNT(*)::int AS n FROM followup_prospek`)[0].n, 0);
});

await cek("menyala: minat & 'sudah beli' dinilai walau penyaring prospek mati; tag tidak sampai ke pelanggan", async () => {
  await fx.simpanSetelanNomor(A.id, { ...SETELAN, aktif: true, ulangAktif: true, siklusUlangHari: 7 });
  assert.ok(fx.nomorFollowupUsaha().has(A.id), "nomor masuk daftar di memori");
  await ngobrol(sA, P.rina, "kak cuci bedcover king berapa? bisa jemput ke jl melati?", "Rina");
  const c = await chatDari(A.id, P.rina);
  assert.equal(c.prospek, 1);
  assert.equal(c.minat, 1);
  assert.match(hermes.panggilan.findLast((x) => x.sesi.startsWith("wa-")).sistem, /<minat>beli<\/minat>/, "aturan tag beli ada di prompt");
  assert.ok(!sA.terkirim.some((k) => /<minat|<nilai/.test(k.teks)));
});

await cek("pesan 1: pelanggan yang diam 3 jam disapa lagi (ritme manusia, dari Informasi Usaha, tanpa tautan, potong kuota)", async () => {
  await mundurkan(A.id, P.rina, 4 * 3600);
  const pakai0 = (await sql`SELECT COUNT(*)::int AS n FROM ai_pakai WHERE number_id = ${A.id} AND NOT abaikan`)[0].n;
  const awal = sA.terkirim.length;
  sA.urutan.length = 0;
  await putaran();
  assert.equal(sA.terkirim.length, awal + 1, "satu pesan per putaran");
  assert.equal(sA.terkirim.at(-1).jid, jid(P.rina));
  assert.equal(sA.terkirim.at(-1).teks, TEKS[1]);
  assert.match(sA.urutan.join(","), /ketik.*kirim/);
  const r = await prospekDari(P.rina);
  assert.equal(r.usaha, true);
  assert.equal(r.tahap, 1);
  assert.ok(Math.abs(r.jadwal - (kini() + 24 * 3600)) < 60);
  const ai = hermes.panggilan.findLast((x) => x.sesi.startsWith("followup-usaha-"));
  assert.match(ai.sistem, /Rp35\.000/, "Informasi Usaha nomor ini ikut dikirim");
  assert.match(ai.sistem, /JANGAN menulis tautan/);
  assert.doesNotMatch(ai.sistem, /ChatGerCep|\/langganan|berlangganan/, "bukan prompt jualan ChatGerCep");
  const pakai1 = (await sql`SELECT COUNT(*)::int AS n FROM ai_pakai WHERE number_id = ${A.id} AND NOT abaikan`)[0].n;
  assert.equal(pakai1, pakai0 + 1, "1 pesan follow-up AI = 1 balasan AI");
});

await cek("terpisah dari GercepBot: panel admin & batas harian nomor CS tidak melihat baris nomor pengguna", async () => {
  assert.equal((await fp.daftarProspek({ batas: 50 })).length, 0);
  assert.equal((await fp.statusMesinProspek()).terkirim, 0);
  assert.equal(await fp.kirimanProspekSejak(kini() - 86400), 0);
});

await cek("pesan 2 hanya bila pesan 1 sampai ke HP; dibalas = berhenti & AI diberi konteks", async () => {
  await sql`UPDATE followup_prospek SET jadwal = ${kini() - 1}`;
  const id1 = sA.terkirim.at(-1).id;
  sA.pancar("messages.update", [{ key: { remoteJid: jid(P.rina), id: id1, fromMe: true }, update: { status: 3 } }]);
  await tunggu(async () => (await prospekDari(P.rina)).ack1 === 3, 3000, "ack1 = 3");
  const awal = sA.terkirim.length;
  await putaran();
  assert.equal(sA.terkirim.length, awal + 1);
  assert.equal(sA.terkirim.at(-1).teks, TEKS[2]);
  assert.match(hermes.panggilan.findLast((x) => x.sesi.startsWith("followup-usaha-")).sistem, /pesan follow-up KEDUA/);
  await ngobrol(sA, P.rina, "oke kak jadwalkan besok pagi ya", "Rina");
  assert.equal((await prospekDari(P.rina)).status, "dibalas");
  assert.match(hermes.panggilan.findLast((x) => x.sesi.startsWith("wa-")).sistem, /Kamu tadi mengirim pesan ini/);
});

await cek("sudah beli: tidak dibujuk sebagai lead, tercatat untuk order ulang", async () => {
  await ngobrol(sA, P.rina, "sudah transfer ya kak 35rb", "Rina");
  const c = await chatDari(A.id, P.rina);
  assert.ok(c.beli_pada && Math.abs(c.beli_pada - kini()) < 30, "beli_pada tercatat");
  assert.equal(c.minat, 2);
  await mundurkan(A.id, P.rina, 4 * 3600);
  await putaran();
  assert.equal((await prospekDari(P.rina)).status, "dibalas", "siklus prospek tidak dimulai lagi");
});

await cek("order ulang: 1 pesan setelah siklus 7 hari, sekali per pembelian; tanpa tautan", async () => {
  await putaran();
  assert.equal(await ulangDari(P.rina), undefined, "belum lewat siklus");
  await mundurkan(A.id, P.rina, 8 * 86400);
  const awal = sA.terkirim.length;
  await putaran();
  assert.equal(sA.terkirim.length, awal + 1);
  assert.equal(sA.terkirim.at(-1).teks, TEKS.ulang);
  const u = await ulangDari(P.rina);
  assert.equal(u.status, "terkirim");
  assert.match(hermes.panggilan.findLast((x) => x.sesi.startsWith("followup-usaha-")).sistem, /order ulang/);
  await putaran();
  assert.equal(sA.terkirim.length, awal + 1, "tidak ada pengingat kedua untuk pembelian yang sama");
});

await cek("order ulang: chat yang sepi > 90 hari tidak disentuh", async () => {
  await ngobrol(sA, P.lama, "sudah bayar ya kak", "Lama");
  await mundurkan(A.id, P.lama, 100 * 86400);
  await putaran();
  assert.equal(await ulangDari(P.lama), undefined);
});

await cek("minta berhenti setelah order ulang: dicatat permanen", async () => {
  await ngobrol(sA, P.rina, "stop ya kak jangan chat lagi", "Rina");
  const u = await ulangDari(P.rina);
  assert.equal(u.status, "stop");
  const c = await chatDari(A.id, P.rina);
  assert.equal((await sql`SELECT COUNT(*)::int AS n FROM followup_stop WHERE kunci = ${c.kunci}`)[0].n, 1);
});

await cek("pemilik membalas sendiri dari HP: chat itu dilewati", async () => {
  await ngobrol(sA, P.sari, "kak harga kiloan berapa?", "Sari");
  tiba(sA, pesan(jid(P.sari), "Rp8.000/kg kak, mau dijemput?", { dariSaya: true }));
  await bridge.tulisTuntas();
  await tunggu(async () => (await sql`SELECT COUNT(*)::int AS n FROM pesan_chat m JOIN percakapan p ON p.id = m.percakapan_id WHERE p.telepon = ${P.sari} AND m.peran = 2`)[0].n > 0, 3000, "balasan pemilik tercatat");
  await mundurkan(A.id, P.sari, 4 * 3600);
  await putaran();
  assert.equal(await prospekDari(P.sari), undefined);
});

await cek("tautan dari AI ditolak (dua kali) -> templat netral tanpa tautan; draf yang ditolak tidak potong kuota", async () => {
  await ngobrol(sA, P.tari, "bedcover queen berapa kak?", "Tari");
  await mundurkan(A.id, P.tari, 4 * 3600);
  const pakai0 = (await sql`SELECT COUNT(*)::int AS n FROM ai_pakai WHERE number_id = ${A.id} AND NOT abaikan`)[0].n;
  hermes.tautan = true;
  const awal = sA.terkirim.length;
  await putaran();
  hermes.tautan = false;
  assert.equal(sA.terkirim.length, awal + 1);
  assert.doesNotMatch(sA.terkirim.at(-1).teks, /https?:|www\./);
  const pakai1 = (await sql`SELECT COUNT(*)::int AS n FROM ai_pakai WHERE number_id = ${A.id} AND NOT abaikan`)[0].n;
  assert.equal(pakai1, pakai0, "dua draf ditolak tidak dihitung kuota");
  const kunciTari = (await prospekDari(P.tari)).kunci;
  await assert.rejects(() => fx.simpanDrafUsaha(A.id, "prospek", kunciTari, "Kak, cek di https://contoh.id ya kak, lengkap di sana."), /tautan/);
});

await cek("batas: nomor baru (<3 hari: 0), pemanasan (3/hari), rasio balasan biasa; akun tanpa paket tidak mengirim", async () => {
  const s = await fx.statusUsaha(await nomorById(A.id));
  assert.equal(s.batasHariIni, 10);
  assert.equal(s.sebabBatas, "setelan");
  assert.ok(s.kirimHariIni >= 4, `kirim ${s.kirimHariIni}`);
  const baru = await pengguna("baru@uji.id", "Toko Baru");
  const { n: N } = await nomorTerhubung("Toko Baru", "628222000002", baru, { dibuat: kini() - 86400 });
  await fx.simpanSetelanNomor(N.id, { ...SETELAN, aktif: true });
  const sb = await fx.statusUsaha(await nomorById(N.id));
  assert.equal(sb.batasHariIni, 0, "nomor 1 hari: belum boleh follow-up sama sekali");
  assert.equal(sb.sebabBatas, "baru");
  await sql`UPDATE numbers SET created_at = ${kini() - 4 * 86400} WHERE id = ${N.id}`;
  cacheNomorBasi();
  const sh = await fx.statusUsaha(await nomorById(N.id));
  assert.equal(sh.batasHariIni, 3, "nomor 4 hari: pemanasan 3/hari");
  assert.equal(sh.sebabBatas, "pemanasan");
  const sepi = await pengguna("sepi@uji.id", "Toko Sepi");
  const { n: Q } = await nomorTerhubung("Toko Sepi", "628222000003", sepi, { dibalas: 4 });
  await fx.simpanSetelanNomor(Q.id, { ...SETELAN, aktif: true });
  const sq = await fx.statusUsaha(await nomorById(Q.id));
  assert.equal(sq.batasHariIni, 3, "20% dari 4 balasan < 3 = 3");
  assert.equal(sq.sebabBatas, "rasio");
  const gratis = await pengguna("gratis@uji.id", "Toko Gratis", { paket: false });
  const { n: G, s: sG } = await nomorTerhubung("Toko Gratis", "628222000004", gratis);
  await fx.simpanSetelanNomor(G.id, { ...SETELAN, aktif: true });
  assert.equal((await fx.statusUsaha(await nomorById(G.id))).boleh, false);
  await sql`UPDATE numbers SET bot_aktif = true WHERE id = ${G.id}`;
  cacheNomorBasi();
  const awal = sG.terkirim.length;
  await putaran();
  assert.equal(sG.terkirim.length, awal);
});

await cek("rem per nomor: banyak centang satu = nomor A berhenti & pemilik diberi tahu; nomor B tetap jalan", async () => {
  const pB = await pengguna("kedai@uji.id", "Kedai B");
  const { n: Bn, s: sB } = await nomorTerhubung("Kedai B", "628222000005", pB);
  await fx.simpanSetelanNomor(Bn.id, { ...SETELAN, aktif: true });
  // 6 kiriman lama nomor A yang tidak pernah sampai ke HP.
  const t = kini() - 7 * 3600;
  for (let i = 0; i < 6; i++)
    await sql`INSERT INTO followup_ulang (kunci, number_id, status, beli_pada, jadwal, pesan, terkirim, ack, dibuat, diperbarui)
              VALUES (${`c0ffee${String(i).padStart(26, "0")}`}, ${A.id}, 'terkirim', ${t - 86400}, ${t}, 'x', ${t - i}, 2, ${t}, ${t})`;
  await ngobrol(sA, P.desi, "kak berapa harga cuci karpet?", "Desi");
  await mundurkan(A.id, P.desi, 4 * 3600);
  await ngobrol(sB, P.eko, "kak harga paket nasi box berapa?", "Eko");
  await mundurkan(Bn.id, P.eko, 4 * 3600);
  const awalA = sA.terkirim.length;
  const awalB = sB.terkirim.length;
  await putaran();
  assert.equal(sA.terkirim.length, awalA, "nomor A direm");
  assert.equal(sB.terkirim.length, awalB + 1, "nomor B tidak ikut berhenti");
  const sa = await fx.statusUsaha(await nomorById(A.id));
  assert.match(sa.rem?.alasan ?? "", /centang satu/);
  const [nt] = await sql`SELECT judul, tautan FROM notifikasi WHERE user_id = ${pemilik} AND jenis = 'nomor' ORDER BY id DESC LIMIT 1`;
  assert.match(nt.judul, /dihentikan otomatis/);
  assert.equal(nt.tautan, `/nomor/${A.id}#followup`);
  await fx.lepasRemNomor(A.id);
  await putaran();
  assert.equal(sA.terkirim.length, awalA + 1, "setelah dilanjutkan pemilik, nomor A mengirim lagi");
});

await cek("kuota AI habis: tidak ada draf maupun kiriman", async () => {
  const pK = await pengguna("kuota@uji.id", "Toko Kuota", { kuota: 2 });
  const { n: K, s: sK } = await nomorTerhubung("Toko Kuota", "628222000006", pK);
  await fx.simpanSetelanNomor(K.id, { ...SETELAN, aktif: true });
  await ngobrol(sK, "628444000099", "kak harga sepatu berapa?", "Yudi");
  await mundurkan(K.id, "628444000099", 4 * 3600);
  await sql`INSERT INTO ai_pakai(number_id, waktu, penyedia, ms) VALUES (${K.id}, ${kini() - 60}, 'hermes', 10), (${K.id}, ${kini() - 50}, 'hermes', 10)`;
  segarkanKuota();
  const awal = sK.terkirim.length;
  await putaran();
  assert.equal(sK.terkirim.length, awal);
  assert.equal((await fx.statusUsaha(await nomorById(K.id))).sisaKuota, 0);
});

await cek("pintar: katalog & Informasi Usaha di prompt hard selling; AI boleh melewati chat yang tidak pantas (tanpa kirim, tanpa potong kuota)", async () => {
  const pL = await pengguna("lewati@uji.id", "Toko Lewati");
  const { n: L, s: sL } = await nomorTerhubung("Toko Lewati", "628222000007", pL);
  await simpanProduk(L.id, { nama: "Sepatu Kanvas Hitam", harga: 150000, deskripsi: "Ukuran 38-44", tersedia: true });
  await fx.simpanSetelanNomor(L.id, { ...SETELAN, aktif: true });
  await ngobrol(sL, "628444000101", "kak harga sepatu berapa?", "Tono");
  await mundurkan(L.id, "628444000101", 4 * 3600);
  const pakai = async () => (await sql`SELECT COUNT(*)::int AS n FROM ai_pakai WHERE number_id = ${L.id} AND NOT abaikan`)[0].n;
  const pakai0 = await pakai();
  const awal = sL.terkirim.length;
  hermes.lewati = true;
  try {
    await putaran();
  } finally {
    hermes.lewati = false;
  }
  assert.equal(sL.terkirim.length, awal, "tidak ada pesan terkirim");
  const r = await prospekDari("628444000101");
  assert.equal(r.status, "batal");
  assert.match(r.alasan, /^Dilewati AI: ia sudah bilang tidak jadi beli/);
  assert.equal(await pakai(), pakai0, "penilaian lewati tidak memotong kuota");
  const ai = hermes.panggilan.findLast((x) => x.sesi.startsWith("followup-usaha-"));
  assert.match(ai.sistem, /Sepatu Kanvas Hitam/, "katalog nomor ini ikut");
  assert.match(ai.sistem, /hard selling/);
  assert.match(ai.sistem, /<lewati>alasan singkat<\/lewati>/, "aturan penilaian ada");
  assert.match(ai.sistem, /JANGAN memakai tag <kirim_produk>/);
  // Pemilik menulis ulang draf: AI tidak boleh menolak (tanpa aturan lewati).
  await sql`UPDATE followup_prospek SET status = 'jalan', alasan = NULL WHERE kunci = ${r.kunci}`;
  await fx.tulisUlangDrafUsaha(L.id, "prospek", r.kunci);
  assert.doesNotMatch(hermes.panggilan.findLast((x) => x.sesi.startsWith("followup-usaha-")).sistem, /<lewati>/);
  await fx.simpanSetelanNomor(L.id, { ...SETELAN, aktif: false });
});

await cek("aman: koneksi belum stabil = tertahan; error 463 / 403 dari WhatsApp = rem nomor + notifikasi, login ulang diperlambat", async () => {
  const pD = await pengguna("bahaya@uji.id", "Toko Bahaya");
  const { n: D, s: sD } = await nomorTerhubung("Toko Bahaya", "628222000008", pD);
  await fx.simpanSetelanNomor(D.id, { ...SETELAN, aktif: true });
  await ngobrol(sD, "628444000102", "kak harga kaos polos berapa?", "Wati");
  await mundurkan(D.id, "628444000102", 4 * 3600);
  const awal = sD.terkirim.length;
  // Baru tersambung (< 60 menit): tidak ada pesan yang kita mulai.
  process.env.WA_FOLLOWUP_STABIL_MENIT = "60";
  try {
    await putaran();
    assert.equal(sD.terkirim.length, awal, "koneksi belum stabil = tidak mengirim");
    assert.equal((await fx.statusUsaha(await nomorById(D.id))).tahan, "stabil");
  } finally {
    process.env.WA_FOLLOWUP_STABIL_MENIT = "0";
  }
  // Baileys melaporkan error 463 (akun dibatasi).
  sD.config.logger.warn({ msgId: "ABC", from: "1@lid" }, "error 463: account restricted or missing tctoken for contact");
  await tunggu(async () => (await fx.statusUsaha(await nomorById(D.id))).rem, 3000, "rem bahaya menyala");
  const sd = await fx.statusUsaha(await nomorById(D.id));
  assert.match(sd.rem.alasan, /error 463/);
  assert.equal(sd.tahan, "bahaya");
  assert.equal(wa.kesehatanSesi(D.sesi).bahaya?.alasan.includes("463"), true);
  const [nt] = await sql`SELECT judul, tautan FROM notifikasi WHERE user_id = ${pD} ORDER BY id DESC LIMIT 1`;
  assert.match(nt.judul, /dihentikan otomatis/);
  assert.equal(nt.tautan, `/nomor/${D.id}#followup`);
  await putaran();
  assert.equal(sD.terkirim.length, awal, "direm = tidak mengirim");
  // 403 berulang: tetap mencoba sendiri, tetapi jedanya panjang dan pemilik diberi tahu nomornya ditolak.
  let s = sD;
  for (let i = 0; i < 3; i++) {
    const n = soket.length;
    s.tutup(403);
    if (i < 2) s = await tunggu(() => soket[n], 5000, `soket setelah 403 ke-${i + 1}`);
  }
  assert.match(wa.infoSesi(D.sesi).alasan ?? "", /403/);
  const n403 = soket.length;
  await new Promise((r) => setTimeout(r, 1500));
  assert.equal(soket.length, n403, "setelah 403 ke-3 tidak langsung mencoba lagi");
  await tunggu(async () => (await sql`SELECT 1 FROM notifikasi WHERE user_id = ${pD} AND judul LIKE '%ditolak WhatsApp%'`).length, 3000, "notifikasi nomor ditolak");
});

await cek("pemilik: daftar, edit draf, hentikan; saklar mati membatalkan antrean", async () => {
  const d = await fx.daftarUsaha(A.id);
  assert.ok(d.some((x) => x.jenis === "ulang") && d.some((x) => x.jenis === "prospek"));
  assert.ok(d.filter((x) => !x.kunci.startsWith("c0ffee")).every((x) => x.percakapan_id), "tautan ke percakapan (selain baris tiruan uji rem)");
  const jalan = d.find((x) => x.status === "jalan");
  assert.ok(jalan, "ada yang berjalan");
  await fx.simpanDrafUsaha(A.id, jalan.jenis, jalan.kunci, "Kak, ini pesan yang saya edit sendiri untuk dikirim berikutnya ya.");
  await assert.rejects(() => fx.simpanDrafUsaha(999999, jalan.jenis, jalan.kunci, "Kak, pesan dari nomor lain tidak boleh mengubah ini ya."), /sudah selesai/);
  await fx.hentikanUsaha(A.id, jalan.jenis, jalan.kunci);
  await assert.rejects(() => fx.hentikanUsaha(A.id, jalan.jenis, jalan.kunci));
  await fx.simpanSetelanNomor(A.id, { ...SETELAN, aktif: false, ulangAktif: false });
  assert.equal((await sql`SELECT COUNT(*)::int AS n FROM followup_prospek WHERE number_id = ${A.id} AND status = 'jalan'`)[0].n, 0);
  assert.ok(!fx.nomorFollowupUsaha().has(A.id));
});

await cek("efisiensi: pemindaian lead & pembeli lama lewat indeks parsial (20.000 chat)", async () => {
  await fx.simpanSetelanNomor(A.id, { ...SETELAN, aktif: true, ulangAktif: true });
  const t = kini();
  await sql`
    INSERT INTO percakapan (number_id, kunci, telepon, nama, cuplikan, pengirim_akhir, masuk_n, bot_n, manusia_n, terakhir_pada, prospek, minat, minat_pada, beli_pada)
    SELECT ${A.id}, md5('massal' || g), '6291' || g, 'M' || g, 'x', 1, 1, 1, 0, ${t} - (g % 2000) * 3600, CASE WHEN g % 10 = 0 THEN 1 ELSE 0 END,
           CASE WHEN g % 10 = 0 THEN 1 END, ${t} - (g % 2000) * 3600, CASE WHEN g % 25 = 0 THEN ${t} - (g % 2000) * 3600 END
      FROM generate_series(1, 20000) g`;
  await sql`ANALYZE percakapan`;
  const nomor = await nomorById(A.id);
  const t0 = performance.now();
  await putaran();
  const ms = performance.now() - t0;
  const lead = (await sql`
    EXPLAIN (ANALYZE, BUFFERS) SELECT p.kunci FROM percakapan p
     WHERE p.number_id = ${A.id} AND p.prospek = 1 AND p.minat >= 1 AND p.terakhir_pada >= ${t - 3 * 86400} AND p.terakhir_pada <= ${t - 3600}
     ORDER BY p.terakhir_pada DESC, p.id DESC LIMIT 50`).map((r) => r["QUERY PLAN"]);
  const beli = (await sql`
    EXPLAIN (ANALYZE, BUFFERS) SELECT p.kunci FROM percakapan p
     WHERE p.number_id = ${A.id} AND p.beli_pada IS NOT NULL AND p.beli_pada <= ${t - 30 * 86400}
       AND p.terakhir_pada <= ${t - 30 * 86400} AND p.terakhir_pada >= ${t - 90 * 86400}
     ORDER BY p.beli_pada, p.id LIMIT 50`).map((r) => r["QUERY PLAN"]);
  const st = await fx.statusUsaha(nomor);
  const t1 = performance.now();
  await fx.daftarUsaha(A.id);
  const msDaftar = performance.now() - t1;
  console.log(`        (putaran penuh nomor 20.000 chat: ${ms.toFixed(0)} ms · lead: ${lead.find((r) => /Execution Time/.test(r))?.trim()} · ${lead.find((r) => /Scan/.test(r))?.trim().replace(/\s+\(cost.*$/, "")})`);
  console.log(`        (pembeli lama: ${beli.find((r) => /Execution Time/.test(r))?.trim()} · ${beli.find((r) => /Scan/.test(r))?.trim().replace(/\s+\(cost.*$/, "")} · daftar tab: ${msDaftar.toFixed(0)} ms · kirim hari ini ${st.kirimHariIni})`);
  assert.ok(lead.some((r) => /percakapan_lead_idx/.test(r)), lead.join("\n"));
  assert.ok(beli.some((r) => /percakapan_beli_idx/.test(r)), beli.join("\n"));
  assert.ok(ms < 3000, `putaran ${ms} ms`);
});

await bridge.tulisTuntas();
console.log(`\n${gagalList.length ? "ADA YANG GAGAL" : "SEMUA LOLOS"}: ${lolos} lolos, ${gagalList.length} gagal, ${((Date.now() - mulai) / 1000).toFixed(0)} dtk`);
if (gagalList.length) console.log("Gagal:\n- " + gagalList.join("\n- "));
server.close();
for (const s of globalThis.__waGerbang.sesi.values()) if (s.timer) clearTimeout(s.timer);
await globalThis.__waPg?.sql.end({ timeout: 2 }).catch(() => {});
await pg.berhenti().catch(() => {});
process.exit(gagalList.length ? 1 : 0);
