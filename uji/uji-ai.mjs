// Uji modul AI (src/lib/ai.ts): pilihan penyedia dari pengaturan admin, permintaan ke OpenRouter (dengan fetch
// tiruan), pencatatan token & biaya, dan riwayat lengkap untuk penyedia tanpa ingatan. PostgreSQL sungguhan.
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
delete process.env.HERMES_API_URL;
delete process.env.HERMES_API_KEY;
delete process.env.AI_PENYEDIA;
process.env.OPENROUTER_API_KEY = "sk-or-uji";
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
let terakhir;
const tiru = (balas, status = 200) =>
  (globalThis.fetch = async (url, o) => {
    terakhir = { url: String(url), headers: o.headers, body: JSON.parse(o.body) };
    return new Response(JSON.stringify(balas), { status, headers: { "content-type": "application/json" } });
  });

await cek("tanpa pengaturan & tanpa Hermes: OpenRouter dengan model bawaan; pilihan admin berlaku langsung", async () => {
  assert.deepEqual(await AI.pengaturanAi(), { penyedia: "openrouter", model: "anthropic/claude-haiku-5.5", cadangan: "google/gemini-2.5-flash-lite" });
  await setSetting("ai_penyedia", "hermes");
  assert.equal((await AI.pengaturanAi()).penyedia, "hermes");
  await setSetting("ai_penyedia", "openrouter");
  await setSetting("ai_model", "openai/gpt-5-mini");
  await setSetting("ai_cadangan", "bukan model valid!");
  assert.deepEqual(await AI.pengaturanAi(), { penyedia: "openrouter", model: "openai/gpt-5-mini", cadangan: "google/gemini-2.5-flash-lite" });
  assert.equal(AI.tanpaIngatan("openrouter"), true);
  assert.equal(AI.tanpaIngatan("hermes"), false);
});

await cek("permintaan OpenRouter: SOUL di-cache, model cadangan, data tidak disimpan penyedia, foto ikut; biaya & token terbaca", async () => {
  tiru({ model: "openai/gpt-5-mini", choices: [{ message: { content: "Halo Kak!" } }], usage: { prompt_tokens: 5100, completion_tokens: 40, cost: 0.0012 } });
  try {
    const j = await AI.tanyaAi({ sessionId: "x", sistem: "<pengetahuan_nomor>uji</pengetahuan_nomor>", pesan: "halo", gambar: [{ mime: "image/png", data: "AAAA" }] });
    assert.deepEqual(j, { teks: "Halo Kak!", ms: j.ms, penyedia: "openrouter", model: "openai/gpt-5-mini", tokenMasuk: 5100, tokenKeluar: 40, biayaUsd: 0.0012 });
  } finally {
    globalThis.fetch = asli;
  }
  assert.equal(terakhir.url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(terakhir.headers.Authorization, "Bearer sk-or-uji");
  const b = terakhir.body;
  assert.deepEqual(b.models, ["openai/gpt-5-mini", "google/gemini-2.5-flash-lite"]);
  assert.equal(b.messages[0].role, "system");
  assert.equal(b.messages[0].content[0].text, teksSoul());
  assert.deepEqual(b.messages[0].content[0].cache_control, { type: "ephemeral" });
  assert.equal(b.messages[0].content[1].text, "<pengetahuan_nomor>uji</pengetahuan_nomor>");
  assert.equal(b.messages[1].content[1].image_url.url, "data:image/png;base64,AAAA");
  assert.deepEqual(b.provider, { data_collection: "deny" });
  assert.deepEqual(b.usage, { include: true });
  assert.ok(b.max_tokens <= 1000);
  assert.doesNotMatch(teksSoul(), /^<!--/); // baris komentar berkas dibuang
});

await cek("galat & balasan kosong dari OpenRouter dilempar (bridge lalu mencoba ulang)", async () => {
  try {
    tiru({ error: { message: "Insufficient credits", code: 402 } }, 402);
    await assert.rejects(AI.tanyaAi({ sessionId: "x", sistem: "s", pesan: "p" }), /OpenRouter HTTP 402: Insufficient credits/);
    tiru({ choices: [{ message: { content: "  " } }] });
    await assert.rejects(AI.tanyaAi({ sessionId: "x", sistem: "s", pesan: "p" }), /kosong/);
  } finally {
    globalThis.fetch = asli;
  }
});

const n = await tambahNomor("Uji AI");
await cek("pemakaian tercatat per nomor dan diringkas per model", async () => {
  const j = { teks: "t", ms: 1200, penyedia: "openrouter", model: "anthropic/claude-haiku-5.5", tokenMasuk: 6000, tokenKeluar: 120, biayaUsd: 0.0009 };
  await AI.catatPakai(n.id, j, false);
  await AI.catatPakai(n.id, { ...j, ms: 1800, biayaUsd: 0.0011 }, true);
  await AI.catatPakai(n.id, { ...j, penyedia: "hermes", model: null, biayaUsd: null, tokenKeluar: null }, false);
  const r = await AI.ringkasPakai(sekarang() - 60);
  const haiku = r.find((x) => x.model === "anthropic/claude-haiku-5.5");
  assert.deepEqual({ ...haiku }, { penyedia: "openrouter", model: "anthropic/claude-haiku-5.5", balasan: 2, biaya_usd: 0.002, token_masuk: 12000, token_keluar: 240, ms_rata: 1500 });
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
    balasan.push(b.messages[0].content[1].text);
    const teks = ["Aku admin di sini, harganya Rp99.000.", "Paket Hemat Rp25.000 ya Kak."][Math.min(panggil - 1, 1)];
    return new Response(JSON.stringify({ choices: [{ message: { content: teks } }], usage: { prompt_tokens: 100, completion_tokens: 10, cost: 0.001 } }));
  };
  try {
    const j = await AI.tanyaAiTerjaga({ sessionId: "x", sistem: "SISTEM", pesan: "harga?" }, SUMBER);
    assert.equal(j.teks, "Paket Hemat Rp25.000 ya Kak.");
    assert.deepEqual(j.pelanggaran.map((p) => p.jenis), ["identitas", "angka"]);
    assert.equal(j.ditulisUlang, true);
    assert.equal(j.aman, false);
    assert.equal(j.biayaUsd, 0.002);
    assert.equal(j.tokenMasuk, 200);
    assert.match(balasan[1], /MELANGGAR aturan inti[\s\S]*mengaku sebagai admin[\s\S]*nominal 99\.000/);

    panggil = 0;
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "Nanti aku kirim ya." } }], usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0 } }));
    const k = await AI.tanyaAiTerjaga({ sessionId: "x", sistem: "S", pesan: "p" }, SUMBER);
    assert.equal(k.teks, P.JAWABAN_AMAN);
    assert.equal(k.aman, true);

    globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: "Paket Hemat Rp25.000." } }], usage: {} }));
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
