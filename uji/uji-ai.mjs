// Uji modul AI (src/lib/ai.ts): Hermes sebagai bawaan, Claude API (Anthropic) bila admin memilihnya dan API key
// terpasang di .env server, permintaan ke Anthropic (fetch tiruan), model cadangan, pencatatan token & biaya,
// riwayat lengkap untuk penyedia tanpa ingatan, dan pemeriksa jawaban. PostgreSQL sungguhan.
// Pakai (dari akar proyek): node --import ./uji/loader.mjs uji/uji-ai.mjs
import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { mulaiPg } from "./pg-lokal.mjs";

const akar = process.cwd();
const tmp = path.join(os.tmpdir(), "wa-uji-ai");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const pg = await mulaiPg({ dir: path.join(tmp, "pg"), sementara: true });
process.env.DATABASE_URL = pg.url;
process.env.DATA_DIR = path.join(tmp, "kosong");
process.env.AUTH_SECRET = "r".repeat(48);
process.env.HERMES_API_URL = "http://127.0.0.1:9"; // "terpasang" (tidak dipanggil di uji ini)
process.env.HERMES_API_KEY = "uji";
delete process.env.AI_PENYEDIA;
delete process.env.ANTHROPIC_API_KEY;
const lib = (f) => import(pathToFileURL(path.join(akar, f)).href);

const { db, setSetting, sekarang } = await lib("src/lib/db.ts");
const AI = await lib("src/lib/ai.ts");
const { tambahNomor } = await lib("src/lib/numbers.ts");
const { catatPesan, riwayatUntukAi } = await lib("src/lib/percakapan.ts");
const { teksSoul } = await lib("src/lib/soul.ts");
const sql = await db();

let lolos = 0;
const cek = async (nama, fn) => {
  await fn();
  lolos += 1;
  console.log(`  ok  ${nama}`);
};

const asli = globalThis.fetch;
const permintaan = [];
/** Anthropic tiruan: `balas(body)` -> [status, json]. */
const tiru = (balas) =>
  (globalThis.fetch = async (url, o) => {
    const p = { url: String(url), headers: o.headers, body: o.body ? JSON.parse(o.body) : null };
    permintaan.push(p);
    const [status, json] = balas(p.body, p);
    return new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });
  });
const jawabClaude = (teks, usage = { input_tokens: 4000, output_tokens: 100, cache_read_input_tokens: 3000, cache_creation_input_tokens: 0 }) => ({
  model: "claude-haiku-5-5",
  content: [{ type: "text", text: teks }],
  usage,
});
const KUNCI = "sk-ant-api03-" + "x".repeat(40);

await cek("bawaan Hermes; Claude API hanya bila admin memilihnya DAN developer memasang ANTHROPIC_API_KEY di server", async () => {
  assert.deepEqual(await AI.pengaturanAi(), { penyedia: "hermes", model: "claude-haiku-5-5", cadangan: "claude-sonnet-5-5" });
  await setSetting("ai_penyedia", "anthropic");
  assert.equal((await AI.pengaturanAi()).penyedia, "hermes"); // belum ada kunci di server
  process.env.ANTHROPIC_API_KEY = KUNCI;
  assert.equal(AI.kunciAnthropic(), KUNCI);
  await setSetting("ai_model", "claude-sonnet-5-5");
  await setSetting("ai_cadangan", "bukan model!");
  assert.deepEqual(await AI.pengaturanAi(), { penyedia: "anthropic", model: "claude-sonnet-5-5", cadangan: "claude-sonnet-5-5" });
  await setSetting("ai_cadangan", "");
  assert.equal((await AI.pengaturanAi()).cadangan, ""); // admin memilih tanpa cadangan
  await setSetting("ai_penyedia", "hermes");
  assert.equal((await AI.pengaturanAi()).penyedia, "hermes");
  assert.equal(AI.tanpaIngatan("anthropic"), true);
  assert.equal(AI.tanpaIngatan("hermes"), false);
  await setSetting("ai_penyedia", "anthropic");
  await setSetting("ai_model", "claude-haiku-5-5");
  await setSetting("ai_cadangan", "claude-sonnet-5-5");
});

await cek("permintaan Claude API: header & versi, SOUL di-cache, penalaran mati, foto sebagai blok gambar; biaya dihitung termasuk cache", async () => {
  permintaan.length = 0;
  tiru(() => [200, jawabClaude("Halo Kak!")]);
  let j;
  try {
    j = await AI.tanyaAi({ sessionId: "x", sistem: "<pengetahuan_nomor>uji</pengetahuan_nomor>", pesan: "halo", gambar: [{ mime: "image/png", data: "AAAA" }] });
  } finally {
    globalThis.fetch = asli;
  }
  // 4000 masuk + 3000 baca-cache (0,1x) + 100 keluar dengan harga Haiku 5.5 ($0,10 / $0,50 per juta)
  const biaya = ((4000 + 3000 * 0.1) * 0.1 + 100 * 0.5) / 1e6;
  assert.deepEqual(j, { teks: "Halo Kak!", ms: j.ms, penyedia: "anthropic", model: "claude-haiku-5-5", tokenMasuk: 7000, tokenKeluar: 100, biayaUsd: biaya });
  const p = permintaan[0];
  assert.equal(p.url, "https://api.anthropic.com/v1/messages");
  assert.equal(p.headers["x-api-key"], KUNCI);
  assert.equal(p.headers["anthropic-version"], "2023-06-01");
  const b = p.body;
  assert.equal(b.model, "claude-haiku-5-5");
  assert.deepEqual(b.thinking, { type: "disabled" });
  assert.equal(b.system[0].text, teksSoul());
  assert.deepEqual(b.system[0].cache_control, { type: "ephemeral" });
  assert.equal(b.system[1].text, "<pengetahuan_nomor>uji</pengetahuan_nomor>");
  assert.deepEqual(b.messages[0].content[0], { type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } });
  assert.deepEqual(b.messages[0].content[1], { type: "text", text: "halo" });
  assert.ok(b.max_tokens <= 1000);
  assert.doesNotMatch(teksSoul(), /^<!--/); // baris komentar berkas dibuang
});

await cek("model utama sibuk (529/429/5xx) -> cadangan sekali; kunci salah (401) & permintaan salah (400) TIDAK pindah model; kosong = galat", async () => {
  try {
    permintaan.length = 0;
    tiru((b) => (b.model === "claude-haiku-5-5" ? [529, { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }] : [200, jawabClaude("dari cadangan")]));
    const j = await AI.tanyaAi({ sessionId: "x", sistem: "s", pesan: "p" });
    assert.equal(j.teks, "dari cadangan");
    assert.deepEqual(permintaan.map((x) => x.body.model), ["claude-haiku-5-5", "claude-sonnet-5-5"]);

    permintaan.length = 0;
    tiru(() => [401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }]);
    await assert.rejects(AI.tanyaAi({ sessionId: "x", sistem: "s", pesan: "p" }), /Anthropic HTTP 401: invalid x-api-key/);
    assert.equal(permintaan.length, 1);

    tiru(() => [200, { content: [{ type: "text", text: "  " }], usage: {} }]);
    await assert.rejects(AI.tanyaAi({ sessionId: "x", sistem: "s", pesan: "p" }), /kosong/);
  } finally {
    globalThis.fetch = asli;
  }
});

await cek("daftar model dari Anthropic (juga uji kunci): kunci sah -> daftar; ditolak -> null", async () => {
  try {
    tiru(() => [200, { data: [{ id: "claude-haiku-5-5", display_name: "Claude Haiku 5.5" }] }]);
    assert.deepEqual(await AI.modelAnthropic(KUNCI), [{ id: "claude-haiku-5-5", nama: "Claude Haiku 5.5" }]);
    tiru(() => [401, { error: { message: "invalid" } }]);
    assert.equal(await AI.modelAnthropic("sk-ant-salah"), null);
  } finally {
    globalThis.fetch = asli;
  }
});

const n = await tambahNomor("Uji AI");
await cek("pemakaian tercatat per nomor dan diringkas per model", async () => {
  const j = { teks: "t", ms: 1200, penyedia: "anthropic", model: "claude-haiku-5-5", tokenMasuk: 6000, tokenKeluar: 120, biayaUsd: 0.0009 };
  await AI.catatPakai(n.id, j, false);
  await AI.catatPakai(n.id, { ...j, ms: 1800, biayaUsd: 0.0011 }, true);
  await AI.catatPakai(n.id, { ...j, penyedia: "hermes", model: null, biayaUsd: null, tokenKeluar: null }, false);
  const r = await AI.ringkasPakai(sekarang() - 60);
  const haiku = r.find((x) => x.model === "claude-haiku-5-5");
  assert.deepEqual({ ...haiku }, { penyedia: "anthropic", model: "claude-haiku-5-5", balasan: 2, biaya_usd: 0.002, token_masuk: 12000, token_keluar: 240, ms_rata: 1500 });
  assert.equal(r.find((x) => x.penyedia === "hermes").balasan, 1);
  const rencana = (await sql`EXPLAIN SELECT COUNT(*) FROM ai_pakai WHERE number_id = ${n.id} AND waktu >= ${sekarang() - 86400}`).map((x) => x["QUERY PLAN"]).join("\n");
  assert.match(rencana, /ai_pakai_nomor_waktu_idx/);
});

await cek("riwayat lengkap (penyedia tanpa ingatan): seluruh sesi sampai jeda >12 jam, tanpa pesan yang sedang dijawab", async () => {
  const kunci = "k".repeat(32);
  const t = sekarang();
  const tulis = (peran, teks, waktu) => catatPesan({ numberId: n.id, kunci, peran, teks, waktu, telepon: "62811", nama: "Budi" });
  await tulis(0, "pesan kemarin", t - 20 * 3600); // sesi lama: tidak ikut
  await tulis(0, "halo", t - 600);
  await tulis(1, "Halo Kak, ada yang bisa dibantu?", t - 590);
  await tulis(2, "Harga paket 50rb ya", t - 300);
  await tulis(0, "oke mau pesan", t - 10); // pesan yang sedang dijawab (tertunda)
  const lengkap = await riwayatUntukAi(kunci, { sesiBaru: false, tertunda: 1, lengkap: true });
  assert.equal(lengkap.length, 3);
  assert.match(lengkap[0], /Pelanggan: halo$/);
  assert.match(lengkap[1], /Kamu \(AI\): Halo Kak/);
  assert.match(lengkap[2], /Pemilik nomor: Harga paket 50rb ya$/);
  // Mode Hermes tetap hanya yang belum dilihat AI (setelah balasan AI terakhir).
  const hermes = await riwayatUntukAi(kunci, { sesiBaru: false, tertunda: 1 });
  assert.deepEqual(hermes.map((b) => b.replace(/^\[[^\]]+\] /, "")), ["Pemilik nomor: Harga paket 50rb ya"]);
});

const { periksaJawaban } = await lib("src/lib/pemeriksa.ts");
const SUMBER = "IG @tokouji, situs tokouji.com. Paket Hemat Rp25.000. Ongkir Jl. Melati Rp8.000. Animasi mulai Rp350.000 (15-30 detik). Promo 10% member. Rekening BCA 8830123456 a.n. Toko. Peta https://maps.app/abc. Jam buka 10.00-22.00.";
const jenis = (t) => periksaJawaban(t, SUMBER).map((p) => p.jenis);

await cek("pemeriksa menangkap: mengaku admin/pemilik/orang, janji tindakan, angka/nomor/tautan tak bersumber", async () => {
  for (const t of ["Iya Kak, aku admin VisualStudio AI.", "Iya, ini Pak Akbar.", "Saya adalah pemilik toko ini.", "Betul, saya Bu Rini.", "Aku CS manusia kok, bukan bot."])
    assert.deepEqual(jenis(t), ["identitas"], t);
  for (const t of ["Nanti aku kirim info promonya ya Kak.", "Kami akan segera mengirimkan informasi promo.", "Sudah aku teruskan ke tim ya.", "Tunggu sebentar ya Kak.", "Siap, aku cek dulu stoknya.", "Nanti aku kabari lagi.", "Perlu saya bantu sampaikan apa ke beliau?", "Untuk promonya aku bisa kirimkan detailnya di chat ini.", "Pesan Kakak sudah aku tandai supaya admin cek."])
    assert.deepEqual(jenis(t), ["janji"], t);
  for (const t of ["Harganya Rp45.000 ya Kak.", "Bisa diskon 50% kok.", "Transfer ke BCA 1234567890 ya.", "Cek di https://contoh.palsu/x", "Totalnya 3,5 juta.", "Follow IG @tokopalsu ya.", "Info lengkap di tokopalsu.com"])
    assert.deepEqual(jenis(t), ["angka"], t);
});

await cek("pemeriksa TIDAK menolak jawaban yang benar (angka sesuai sumber dalam bentuk lain, mengaku AI, arahan ke pelanggan)", async () => {
  for (const t of [
    "Paket Hemat Rp25.000 ya Kak, ongkir ke Jl. Melati Rp8.000.",
    "Animasi mulai 350rb untuk 15-30 detik.",
    "Ada promo 10% untuk member, Kak.",
    "Silakan transfer ke BCA 8830123456 a.n. Toko, lalu kirim buktinya di sini ya.",
    "Lokasinya di https://maps.app/abc",
    "Aku asisten virtual (AI) di nomor ini, bukan admin. Pesan Kakak bisa dibaca pemilik nomor di chat ini.",
    "Aku bukan Pak Akbar, Kak. Aku asisten AI-nya.",
    "Untuk itu akan dijawab langsung oleh pemilik nomor di chat ini ya.",
    "Kakak bisa kirim alamat lengkapnya di sini.",
    "Kami buka setiap hari jam 10.00-22.00.",
    "Mau pesan berapa porsi, Kak? Bisa 2 atau 3.",
    "Info promo terbaru ada di IG @tokouji dan tokouji.com ya.",
    "Aku tidak bisa mengirim berkas, tapi pemilik nomor bisa membalas di sini.",
    "Untuk kepastian pesanannya belum bisa aku cek langsung ya, Kak.",
    "Pemesanannya belum bisa aku bantu buatkan lewat chat ini.",
    "Siap Kak, ditunggu balasan langsung dari pemilik nomor di sini ya.",
    "Chat Kakak langsung masuk ke HP admin, jadi tinggal tunggu respon dari admin di sini ya.",
  ])
    assert.deepEqual(jenis(t), [], t);
});

await cek("foto dari pelanggan: angka dari foto (bukti transfer, nomor order) tidak dianggap karangan; identitas & janji tetap diperiksa", async () => {
  const t = "Bukti transfer Rp149.000 untuk order MIT-171026-001 sudah masuk di chat ini.";
  assert.deepEqual(periksaJawaban(t, SUMBER).map((p) => p.jenis), ["angka"]);
  assert.deepEqual(periksaJawaban(t, SUMBER, { adaFoto: true }), []);
  assert.deepEqual(periksaJawaban("Aku admin, buktinya Rp149.000 sudah aku cek.", SUMBER, { adaFoto: true }).map((p) => p.jenis), ["identitas", "janji"]);
});

await cek("penjaga: draf melanggar ditulis ulang sekali; tetap melanggar = jawaban aman; biaya kedua panggilan dijumlah", async () => {
  const P = await lib("src/lib/pemeriksa.ts");
  let panggil = 0;
  const balasan = [];
  globalThis.fetch = async (_u, o) => {
    panggil += 1;
    const b = JSON.parse(o.body);
    balasan.push(b.system[1].text);
    const teks = ["Aku admin di sini, harganya Rp99.000.", "Paket Hemat Rp25.000 ya Kak."][Math.min(panggil - 1, 1)];
    return new Response(JSON.stringify({ content: [{ type: "text", text: teks }], usage: { input_tokens: 100, output_tokens: 10 } }));
  };
  try {
    const j = await AI.tanyaAiTerjaga({ sessionId: "x", sistem: "SISTEM", pesan: "harga?" }, SUMBER);
    assert.equal(j.teks, "Paket Hemat Rp25.000 ya Kak.");
    assert.deepEqual(j.pelanggaran.map((p) => p.jenis), ["identitas", "angka"]);
    assert.equal(j.ditulisUlang, true);
    assert.equal(j.aman, false);
    assert.equal(j.biayaUsd, 2 * ((100 * 0.1 + 10 * 0.5) / 1e6)); // dua panggilan Haiku 5.5
    assert.equal(j.tokenMasuk, 200);
    assert.match(balasan[1], /MELANGGAR aturan inti[\s\S]*mengaku sebagai admin[\s\S]*nominal 99\.000/);

    panggil = 0;
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ content: [{ type: "text", text: "Nanti aku kirim ya." }], usage: { input_tokens: 1, output_tokens: 1 } }));
    const k = await AI.tanyaAiTerjaga({ sessionId: "x", sistem: "S", pesan: "p" }, SUMBER);
    assert.equal(k.teks, P.JAWABAN_AMAN);
    assert.equal(k.aman, true);

    globalThis.fetch = async () => new Response(JSON.stringify({ content: [{ type: "text", text: "Paket Hemat Rp25.000." }], usage: {} }));
    const l = await AI.tanyaAiTerjaga({ sessionId: "x", sistem: "S", pesan: "p" }, SUMBER);
    assert.deepEqual([l.ditulisUlang, l.pelanggaran.length], [false, 0]); // lolos = satu panggilan saja
  } finally {
    globalThis.fetch = asli;
  }
});

await sql.end({ timeout: 2 });
await pg.berhenti();
console.log(`\nLOLOS ${lolos} uji modul AI`);
process.exit(0);
