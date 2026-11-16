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

const { db, getSetting, setSetting, sekarang } = await lib("src/lib/db.ts");
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
  assert.deepEqual(await AI.pengaturanAi(), { penyedia: "hermes", mode: "hermes", model: "claude-haiku-5-5", cadangan: "claude-sonnet-5-5" });
  await setSetting("ai_penyedia", "anthropic");
  assert.equal((await AI.pengaturanAi()).penyedia, "hermes"); // belum ada kunci di server
  process.env.ANTHROPIC_API_KEY = KUNCI;
  assert.equal(AI.kunciAnthropic(), KUNCI);
  await setSetting("ai_model", "claude-sonnet-5-5");
  await setSetting("ai_cadangan", "bukan model!");
  assert.deepEqual(await AI.pengaturanAi(), { penyedia: "anthropic", mode: "anthropic", model: "claude-sonnet-5-5", cadangan: "claude-sonnet-5-5" });
  await setSetting("ai_cadangan", "");
  assert.equal((await AI.pengaturanAi()).cadangan, ""); // admin memilih tanpa cadangan
  // Mode per paket: penyedia umum tetap Hermes (penyedia tiap akun ditentukan aiUntukAkun); butuh kunci seperti Claude API.
  await setSetting("ai_penyedia", "per_paket");
  const pp = await AI.pengaturanAi();
  assert.deepEqual([pp.penyedia, pp.mode], ["hermes", "per_paket"]);
  const kunciLama = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal((await AI.pengaturanAi()).mode, "hermes"); // tanpa kunci di server: mode per paket tidak berlaku
  process.env.ANTHROPIC_API_KEY = kunciLama;
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
  assert.equal("temperature" in b, false, "model generasi baru menolak parameter sampling");
  assert.equal(b.system[0].text, teksSoul());
  assert.deepEqual(b.system[0].cache_control, { type: "ephemeral" });
  assert.equal(b.system[1].text, "<pengetahuan_nomor>uji</pengetahuan_nomor>");
  assert.deepEqual(b.messages[0].content[0], { type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } });
  assert.deepEqual(b.messages[0].content[1], { type: "text", text: "halo" });
  assert.ok(b.max_tokens <= 1000);
  assert.doesNotMatch(teksSoul(), /^<!--/); // baris komentar berkas dibuang
});

await cek("penalaran per model: Haiku 5.5 dimatikan; Sonnet 5.5 between_tools; Opus 5.5/Fable tanpa parameter + effort low (batas token ditambah)", async () => {
  assert.deepEqual(AI.opsiPenalaran("claude-haiku-5-5", 700), { max_tokens: 700, thinking: { type: "disabled" } });
  assert.deepEqual(AI.opsiPenalaran("claude-sonnet-5-5", 700), { max_tokens: 700, thinking: { type: "between_tools" } });
  for (const m of ["claude-opus-5-5", "claude-fable-5-1", "claude-fable-5"]) assert.deepEqual(AI.opsiPenalaran(m, 700), { max_tokens: 3700, output_config: { effort: "low" } }, m);
  assert.deepEqual(AI.opsiPenalaran("claude-haiku-4-5-20251001", 700), { max_tokens: 700, thinking: { type: "disabled" } });
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

await cek("tarif resmi Anthropic per model (termasuk cache) & perkiraan per balasan dari profil token nyata", async () => {
  const dekat = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);
  // Haiku 5.5: $0,10 masuk, $0,50 keluar, tulis cache $0,125, baca cache $0,01 (per juta token)
  dekat(AI.biayaAnthropic("claude-haiku-5-5", { input_tokens: 1e6 }), 0.1);
  dekat(AI.biayaAnthropic("claude-haiku-5-5", { output_tokens: 1e6 }), 0.5);
  dekat(AI.biayaAnthropic("claude-haiku-5-5", { cache_creation_input_tokens: 1e6 }), 0.125);
  dekat(AI.biayaAnthropic("claude-haiku-5-5", { cache_read_input_tokens: 1e6 }), 0.01);
  // Sonnet 5.5: baca cache $0,10 (bukan 10% x $2 = $0,20)
  dekat(AI.biayaAnthropic("claude-sonnet-5-5", { cache_read_input_tokens: 1e6 }), 0.1);
  dekat(AI.biayaAnthropic("claude-sonnet-5-5-20261001", { input_tokens: 1e6 }), 2); // id bertanggal
  assert.equal(AI.biayaAnthropic("claude-model-belum-dicek", { input_tokens: 1e6 }), null);
  // Profil nyata: 7.500 input + 4.100 cache + 110 keluar
  dekat(AI.perkiraanPerBalasan("claude-haiku-5-5"), 0.000846); // ±Rp14 pada kurs 16.500
  dekat(AI.perkiraanPerBalasan("claude-sonnet-5-5"), 0.01651); // ±Rp272
  assert.equal(await AI.kursUsd(), 16500); // KURS_USD_TETAP dari loader.mjs (tanpa jaringan)
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

// ---------- Kurs USD → Rp: data pasar otomatis ----------
const K = await lib("src/lib/kurs.ts");
const keadaanKurs = () => globalThis.__waKurs;
const resetKurs = async () => {
  const s = keadaanKurs();
  for (const k of Object.keys(s)) delete s[k]; // seperti proses baru (memori kosong)
  await setSetting("kurs_usd_pasar", ""); // dan database kosong
};
/** Sumber kurs tiruan: peta potongan-URL -> () => [status, json]; tanpa entri = jaringan mati. */
const tiruKurs = (peta) =>
  (globalThis.fetch = async (url) => {
    permintaan.push({ url: String(url) });
    const k = Object.keys(peta).find((x) => String(url).includes(x));
    if (!k) throw new Error("jaringan mati (uji)");
    const [status, json] = peta[k]();
    return new Response(JSON.stringify(json), { status });
  });
const denganKursPasar = async (fn) => {
  const tetap = process.env.KURS_USD_TETAP;
  delete process.env.KURS_USD_TETAP;
  try {
    await resetKurs();
    await fn();
  } finally {
    globalThis.fetch = asli;
    process.env.KURS_USD_TETAP = tetap;
    await resetKurs();
  }
};
const FRANKFURTER = () => [200, { amount: 1, base: "USD", date: "2026-10-29", rates: { IDR: 18143.4 } }];
const ER_API = () => [200, { result: "success", time_last_update_unix: 1793318551, rates: { IDR: 18150.37 } }];
const COINBASE = (idr) => () => [200, { data: { currency: "USD", rates: { EUR: "0.92", IDR: idr } } }];
/** Waktu berjalan sekian detik: semua cap waktu keadaan kurs dimundurkan (tanpa menunggu sungguhan). */
const majukanWaktu = (detik) => {
  const s = keadaanKurs();
  if (s.info) s.info.diambil -= detik;
  if (s.ronde !== undefined) s.ronde -= detik;
  if (s.paksaPada !== undefined) s.paksaPada -= detik;
  for (const b of Object.values(s.per ?? {})) {
    b.diambil -= detik;
    if (b.waktu !== null) b.waktu -= detik;
  }
};

await cek("kurs pasar: semua sumber ditanya bersamaan, dibulatkan, satu putaran untuk panggilan serentak, di-cache, tersimpan di database", () =>
  denganKursPasar(async () => {
    tiruKurs({ frankfurter: FRANKFURTER });
    permintaan.length = 0;
    const [i] = await Promise.all([K.infoKurs(), K.infoKurs(), K.infoKurs()]);
    assert.equal(i.kurs, 18143);
    assert.match(i.sumber, /Frankfurter/);
    assert.equal(i.tanggal, "2026-10-29");
    assert.deepEqual([i.basi, i.cadangan, i.langsung, i.waktuData], [false, false, false, null]);
    assert.equal(permintaan.length, 3, "tiga panggilan serentak = satu putaran (tiap sumber sekali)");
    await K.infoKurs();
    assert.equal(permintaan.length, 3, "dalam 10 menit dipakai dari cache");
    const simpan = JSON.parse(await getSetting("kurs_usd_pasar"));
    assert.deepEqual([simpan.k, simpan.tgl], [18143, "2026-10-29"]);
  })
);

await cek("kurs pasar: sumber menolak/rusak dilewati; angka di luar rentang wajar ditolak", () =>
  denganKursPasar(async () => {
    tiruKurs({ frankfurter: () => [200, { rates: { IDR: 5 }, date: "2026-10-29" }], "er-api": ER_API, coinbase: () => [200, { data: { currency: "USD", rates: { IDR: "abc" } } }] });
    const i = await K.infoKurs();
    assert.equal(i.kurs, 18150);
    assert.match(i.sumber, /ExchangeRate/);
    assert.equal(i.tanggal, "2026-10-30");
    assert.equal(i.waktuData, 1793318551);
    assert.deepEqual(i.pembanding, []);
    await resetKurs();
    tiruKurs({ frankfurter: () => [500, {}], "er-api": () => [200, { result: "error" }], coinbase: () => [200, { errors: [{ id: "not_found" }] }] });
    assert.equal((await K.infoKurs()).cadangan, true, "semua sumber tidak sah = belum ada data pasar");
  })
);

await cek("kurs real-time: Coinbase dipakai bila sejalan dengan kurs referensi (dicek silang); pencilan dibuang; dua sumber berselisih = kurs referensi", () =>
  denganKursPasar(async () => {
    tiruKurs({ coinbase: COINBASE("18170.6"), frankfurter: FRANKFURTER, "er-api": ER_API });
    const i = await K.infoKurs();
    assert.equal(i.kurs, 18171);
    assert.match(i.sumber, /Coinbase/);
    assert.equal(i.langsung, true);
    assert.ok(Math.abs(i.waktuData - sekarang()) <= 2, "kurs berjalan tanpa cap waktu = saat diambil");
    assert.deepEqual(
      i.pembanding.map((p) => [p.kurs, p.cocok]),
      [
        [18143, true],
        [18150, true],
      ]
    );
    // Coinbase menyimpang jauh (data rusak): dibuang, dipakai yang paling baru dari yang sejalan (ER-API lebih baru dari ECB).
    await resetKurs();
    tiruKurs({ coinbase: COINBASE("16000"), frankfurter: FRANKFURTER, "er-api": ER_API });
    const j = await K.infoKurs();
    assert.equal(j.kurs, 18150);
    assert.match(j.sumber, /ExchangeRate/);
    assert.deepEqual(j.pembanding.find((p) => p.kurs === 16000).cocok, false);
    // Hanya dua sumber dan keduanya berselisih >3%: tidak bisa ditentukan mana yang benar -> kurs referensi ECB.
    await resetKurs();
    tiruKurs({ coinbase: COINBASE("16000"), frankfurter: FRANKFURTER });
    assert.match((await K.infoKurs()).sumber, /Frankfurter/);
  })
);

await cek("kurs real-time: tiap 10 menit hanya Coinbase yang ditanya ulang (kurs referensi harian paling sering tiap jam)", () =>
  denganKursPasar(async () => {
    tiruKurs({ coinbase: COINBASE("18170"), frankfurter: FRANKFURTER, "er-api": ER_API });
    await K.infoKurs();
    majukanWaktu(11 * 60);
    tiruKurs({ coinbase: COINBASE("18190"), frankfurter: FRANKFURTER, "er-api": ER_API });
    permintaan.length = 0;
    const i = await K.infoKurs({ tunggu: true }); // kalkulator admin: menunggu putaran yang jatuh tempo
    assert.equal(i.kurs, 18190);
    assert.deepEqual(permintaan.map((p) => new URL(p.url).hostname), ["api.coinbase.com"]);
    majukanWaktu(61 * 60);
    permintaan.length = 0;
    await K.infoKurs({ tunggu: true });
    assert.equal(permintaan.length, 3, "lewat 1 jam: kurs referensi ikut ditanya ulang");
  })
);

await cek("kurs: tombol Perbarui mengambil ulang dari semua sumber sekarang juga, paling sering sekali per 30 detik", () =>
  denganKursPasar(async () => {
    tiruKurs({ coinbase: COINBASE("18170"), frankfurter: FRANKFURTER, "er-api": ER_API });
    await K.infoKurs();
    tiruKurs({ coinbase: COINBASE("18200"), frankfurter: FRANKFURTER, "er-api": ER_API });
    permintaan.length = 0;
    assert.equal((await K.perbaruiKurs()).kurs, 18200);
    assert.equal(permintaan.length, 3, "dipaksa: kurs referensi ikut ditanya walau belum 1 jam");
    tiruKurs({ coinbase: COINBASE("18300"), frankfurter: FRANKFURTER, "er-api": ER_API });
    assert.equal((await K.perbaruiKurs()).kurs, 18200, "kurang dari 30 detik: tidak mengambil ulang");
    assert.equal(permintaan.length, 3);
    majukanWaktu(31);
    assert.equal((await K.perbaruiKurs()).kurs, 18300);
  })
);

await cek("kurs pasar: sumber mati setelah ada data = nilai pasar terakhir tetap dipakai (basi), tidak membanjiri sumber, tahan restart", () =>
  denganKursPasar(async () => {
    tiruKurs({ "er-api": ER_API });
    assert.equal((await K.infoKurs()).kurs, 18150);
    majukanWaktu(2 * 3600); // data sudah lewat 2 jam
    tiruKurs({}); // jaringan mati
    permintaan.length = 0;
    const langsung = await K.infoKurs(); // nilai lama langsung dipakai, pembaruan jalan di latar
    assert.equal(langsung.kurs, 18150);
    await new Promise((r) => setTimeout(r, 80));
    const sesudah = await K.infoKurs();
    assert.deepEqual([sesudah.kurs, sesudah.basi, sesudah.cadangan], [18150, true, false]);
    assert.equal(permintaan.length, 3, "tiap sumber dicoba sekali; tidak diulang sebelum 5 menit");
    // server dimulai ulang & sumber masih mati: nilai pasar terakhir dimuat dari database
    const s = keadaanKurs();
    for (const k of Object.keys(s)) delete s[k];
    const baru = await K.infoKurs();
    assert.deepEqual([baru.kurs, baru.cadangan], [18150, false]);
    await new Promise((r) => setTimeout(r, 80)); // putaran latar (gagal) selesai sebelum keadaan dibersihkan
  })
);

await cek("kurs pasar: belum pernah berhasil sama sekali = perkiraan cadangan yang ditandai, tanpa menunggu jaringan di tiap permintaan", () =>
  denganKursPasar(async () => {
    tiruKurs({});
    const i = await K.infoKurs();
    assert.deepEqual([i.kurs, i.cadangan], [K.KURS_CADANGAN, true]);
    permintaan.length = 0;
    assert.equal((await K.infoKurs()).cadangan, true);
    assert.equal(permintaan.length, 0, "baru gagal: dicoba lagi paling cepat 5 menit kemudian");
  })
);

// ---------- Tarif resmi model Claude: dari halaman harga Anthropic ----------
const TR = await lib("src/lib/tarif.ts");
const dekat = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);
const halamanHarga = (haikuMasuk = "$0.10") => `# Pricing

## Model pricing

The following table shows pricing for all Claude models:

| Model | Base input tokens | 5m cache writes | 1h cache writes | Cache hits and refreshes | Output tokens |
| :---- | :---- | :---- | :---- | :---- | :---- |
| Claude Fable 5.1 | $10 / MTok | $12.50 / MTok | $20 / MTok | $0.25 / MTok<sup>1</sup> | $50 / MTok |
| Claude Opus 4.1 ([retired](https://x.test/deprecations)) | $15 / MTok | $18.75 / MTok | $30 / MTok | $1.50 / MTok | $75 / MTok |
| Claude Sonnet 5.5 | $2 / MTok | $2.50 / MTok | $4 / MTok | $0.10 / MTok<sup>2</sup> | $10 / MTok |
| Claude Haiku 5.5 (for prompts up to 100,000 tokens) | ${haikuMasuk} / MTok | $0.125 / MTok | $0.20 / MTok | $0.01 / MTok | $0.50 / MTok |
| Claude Haiku 5.5 (for prompts over 100,000 tokens) | $0.50 / MTok | $0.625 / MTok | $1 / MTok | $0.05 / MTok | $2.50 / MTok |
| Claude Haiku 4.5 | $1 / MTok | $1.25 / MTok | $2 / MTok | $0.10 / MTok | $5 / MTok |

## Batch processing

| Model | Batch input | Batch output |
| :---- | :---- | :---- |
| Claude Haiku 5.5 | $0.05 / MTok | $0.25 / MTok |
`;

await cek("tarif: tabel 'Model pricing' resmi terbaca per model (kolom dari judul, baris pertama Haiku 5.5, tautan & catatan kaki diabaikan)", async () => {
  const t = TR.bacaTabelTarif(halamanHarga());
  assert.deepEqual(Object.keys(t), ["fable 5.1", "opus 4.1", "sonnet 5.5", "haiku 5.5", "haiku 4.5"]);
  assert.deepEqual(t["haiku 5.5"], { masuk: 0.1, keluar: 0.5, tulisCache: 0.125, tulisCache1j: 0.2, bacaCache: 0.01 });
  assert.deepEqual(t["fable 5.1"], { masuk: 10, keluar: 50, tulisCache: 12.5, tulisCache1j: 20, bacaCache: 0.25 });
  // Kolom ditukar: tetap benar karena dicari dari judulnya
  const tukar = halamanHarga().replace("| Model | Base input tokens | 5m cache writes | 1h cache writes | Cache hits and refreshes | Output tokens |", "| Model | Output tokens | 5m cache writes | 1h cache writes | Cache hits and refreshes | Base input tokens |");
  assert.equal(TR.bacaTabelTarif(tukar)["sonnet 5.5"].keluar, 2);
  // Bentuk halaman berubah / rusak: ditolak utuh (null), bukan angka setengah benar
  assert.equal(TR.bacaTabelTarif("# Pricing\n\nSegera hadir"), null);
  assert.equal(TR.bacaTabelTarif(halamanHarga().replace("Base input tokens", "Input")), null);
  for (const [id, k] of [["claude-haiku-5-5", "haiku 5.5"], ["claude-opus-4-5-20251101", "opus 4.5"], ["claude-3-5-haiku-20241022", "haiku 3.5"], ["claude-fable-5", "fable 5"], ["gpt-4", null]])
    assert.equal(TR.kunciModel(id), k, id);
});

const denganTarifResmi = async (fn) => {
  const tetap = process.env.TARIF_TETAP;
  delete process.env.TARIF_TETAP;
  const reset = async () => {
    for (const k of Object.keys(globalThis.__waTarif ?? {})) delete globalThis.__waTarif[k];
    await setSetting("tarif_anthropic", "");
  };
  try {
    await reset();
    await fn();
  } finally {
    globalThis.fetch = asli;
    process.env.TARIF_TETAP = tetap;
    await reset();
  }
};
const tiruHarga = (fn) =>
  (globalThis.fetch = async (url) => {
    permintaan.push({ url: String(url) });
    const h = fn(String(url));
    if (!h) throw new Error("jaringan mati (uji)");
    return new Response(h, { status: 200, headers: { "content-type": "text/markdown" } });
  });

await cek("tarif: biaya per balasan memakai tarif resmi terbaru; harga Anthropic berubah -> biaya ikut berubah & tercatat; cek ulang paling cepat tiap jam", () =>
  denganTarifResmi(async () => {
    tiruHarga((u) => (u.includes("platform.claude.com") ? halamanHarga() : null));
    permintaan.length = 0;
    const i = await TR.infoTarif();
    assert.deepEqual([i.sumber, i.jumlahModel, i.berubah], ["resmi", 5, 0]);
    assert.equal(permintaan.length, 1);
    dekat(AI.perkiraanPerBalasan("claude-haiku-5-5"), 0.000846);
    assert.ok(AI.perkiraanPerBalasan("claude-fable-5-1") > 0.07, "model baru di halaman harga langsung punya biaya");
    assert.equal(AI.perkiraanPerBalasan("claude-opus-5-5"), null, "tidak tercantum = tidak dikira-kira");
    await TR.infoTarif();
    assert.equal(permintaan.length, 1, "dalam 1 jam tidak membaca ulang");
    // Anthropic menaikkan harga input Haiku 5.5: tombol Perbarui -> biaya per balasan ikut naik
    tiruHarga((u) => (u.includes("platform.claude.com") ? halamanHarga("$0.20") : null));
    const j = await TR.perbaruiTarif();
    assert.ok(j.berubah > 0);
    assert.equal(TR.tarifModel("claude-haiku-5-5").masuk, 0.2);
    dekat(AI.perkiraanPerBalasan("claude-haiku-5-5"), 0.001596); // 7.500 x 0,2 + 4.100 x 0,01 + 110 x 0,5, per juta
    assert.equal(AI.biayaAnthropic("claude-haiku-5-5", { input_tokens: 1_000_000 }), 0.2);
    assert.equal(JSON.parse(await getSetting("tarif_anthropic")).t["haiku 5.5"].masuk, 0.2);
  })
);

await cek("tarif: halaman harga gagal/berubah bentuk = tarif terakhir tetap dipakai & tahan restart; belum pernah berhasil = tarif cadangan yang ditandai", () =>
  denganTarifResmi(async () => {
    tiruHarga(() => null);
    const awal = await TR.infoTarif();
    assert.equal(awal.sumber, "cadangan");
    dekat(AI.perkiraanPerBalasan("claude-haiku-5-5"), 0.000846); // TARIF_CADANGAN
    tiruHarga(() => halamanHarga());
    globalThis.__waTarif.ronde -= 3600; // lewat jeda coba ulang
    assert.equal((await TR.infoTarif({ tunggu: true })).sumber, "resmi");
    tiruHarga(() => "# Pricing\n\n(halaman diganti)");
    globalThis.__waTarif.ronde -= 3600;
    const gagal = await TR.infoTarif({ tunggu: true });
    assert.deepEqual([gagal.sumber, gagal.jumlahModel], ["tersimpan", 5]);
    assert.ok(AI.perkiraanPerBalasan("claude-fable-5-1") > 0, "tabel lama tetap dipakai");
    for (const k of Object.keys(globalThis.__waTarif)) delete globalThis.__waTarif[k]; // server dimulai ulang
    tiruHarga(() => null);
    const baru = await TR.infoTarif();
    assert.notEqual(baru.sumber, "cadangan");
    assert.equal(baru.jumlahModel, 5);
    await new Promise((r) => setTimeout(r, 50));
  })
);

await cek("riwayat lengkap (penyedia tanpa ingatan): seluruh percakapan (tidak dipotong karena lama diam), tanpa pesan yang sedang dijawab", async () => {
  const kunci = "k".repeat(32);
  const t = sekarang();
  const tulis = (peran, teks, waktu) => catatPesan({ numberId: n.id, kunci, peran, teks, waktu, telepon: "62811", nama: "Budi" });
  await tulis(0, "pesan kemarin", t - 20 * 3600); // tidak ada sesi baru karena diam lama: tetap ikut
  await tulis(0, "halo", t - 600);
  await tulis(1, "Halo Kak, ada yang bisa dibantu?", t - 590);
  await tulis(2, "Harga paket 50rb ya", t - 300);
  await tulis(0, "oke mau pesan", t - 10); // pesan yang sedang dijawab (tertunda)
  const lengkap = await riwayatUntukAi(kunci, { sesiBaru: false, tertunda: 1, lengkap: true });
  assert.equal(lengkap.length, 4);
  assert.match(lengkap[0], /Pelanggan: pesan kemarin$/);
  assert.match(lengkap[1], /Pelanggan: halo$/);
  assert.match(lengkap[2], /Kamu \(AI\): Halo Kak/);
  assert.match(lengkap[3], /Pemilik nomor: Harga paket 50rb ya$/);
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

await cek("gaya manusiawi: menyebut diri AI/bot atau menjelaskan cara kerja chat tanpa ditanya = robotik; ditanya 'ini bot?' boleh jujur; mengaku manusia tetap ditolak", async () => {
  const g = (t, pesan = "kak ada promo?") => periksaJawaban(t, SUMBER, { pesanPelanggan: pesan }).map((p) => p.jenis);
  for (const t of [
    "Maaf Kak, aku asisten virtual jadi belum bisa memastikan.",
    "Sebagai AI, aku belum tahu jadwalnya.",
    "Untuk biayanya pemilik nomor perlu menjawab langsung.",
    "Pesan ini bisa dibaca admin di chat ini ya.",
    "Berdasarkan informasi yang tersedia, belum ada promo.",
    "Aku tidak memiliki akses ke data stok.",
  ])
    assert.deepEqual(g(t), ["robotik"], t);
  for (const t of ["Saat ini belum ada promo, Kak. Mau pesan apa?", "Untuk yang ini nanti dijawab langsung sama tim kami di chat ini ya.", "AC-nya kenapa Kak? Boleh kirim alamatnya juga ya."]) assert.deepEqual(g(t), [], t);
  assert.deepEqual(g("Iya Kak, aku asisten otomatis dari tim Toko Uji. Ada yang mau ditanyakan?", "ini bot ya?"), []);
  assert.deepEqual(g("Iya Kak, aku asisten otomatis.", "kamu manusia atau bukan?"), []);
  assert.deepEqual(g("Aku manusia kok Kak, bukan bot.", "ini bot ya?"), ["identitas"]);
  assert.deepEqual(periksaJawaban("Aku asisten virtual di nomor ini.", SUMBER), []); // tanpa pesan pelanggan: gaya tidak diperiksa
});

await cek("gaya manusiawi: draf robotik ditulis ulang; bila tulisan ulang masih sedikit kaku tetap dikirim (bukan jawaban aman)", async () => {
  const P = await lib("src/lib/pemeriksa.ts");
  let n = 0;
  globalThis.fetch = async () => {
    n += 1;
    const teks = n === 1 ? "Maaf, aku asisten virtual jadi tidak bisa memastikan biayanya." : "Untuk biayanya aku belum bisa pastikan, Kak; pemilik nomor nanti yang jawab.";
    return new Response(JSON.stringify({ content: [{ type: "text", text: teks }], usage: { input_tokens: 1, output_tokens: 1 } }));
  };
  try {
    const j = await AI.tanyaAiTerjaga({ sessionId: "x", sistem: "S", pesan: "biaya servis AC berapa?" }, SUMBER, { gaya: true });
    assert.deepEqual(j.pelanggaran.map((p) => p.jenis), ["robotik"]);
    assert.notEqual(j.teks, P.JAWABAN_AMAN);
    assert.match(j.teks, /belum bisa pastikan/);
  } finally {
    globalThis.fetch = asli;
  }
});

await cek("mesin AI dirahasiakan: menyebut Claude/Anthropic/GPT/'model bahasa' = pelanggaran 'mesin'; nama yang ada di pengetahuan toko & arti lain (tas Hermes) tetap boleh", async () => {
  const P = await lib("src/lib/pemeriksa.ts");
  const sistem = `${P.ATURAN_INTI}\n${SUMBER}`; // aturan inti memuat contoh nama mesin: tidak boleh membuat semuanya lolos
  const g = (t, pesan = "kamu pakai AI apa?", sumber = sistem) => periksaJawaban(t, sumber, { pesanPelanggan: pesan }).map((p) => p.jenis);
  for (const t of [
    "Aku Claude, asisten AI buatan Anthropic.",
    "Saya menggunakan model GPT-4o dari OpenAI.",
    "Asisten ini ditenagai Hermes.",
    "Aku berbasis model bahasa besar, Kak.",
    "Kami pakai ChatGPT untuk membalas chat ini.",
    "Jawaban ini dari model AI Claude ya Kak.",
  ])
    assert.ok(g(t).includes("mesin"), t);
  // Pelanggan menyebut namanya sendiri: tetap tidak boleh diiyakan.
  assert.ok(g("Iya Kak, aku Claude.", "kamu claude ya?").includes("mesin"));
  // Jawaban yang benar: tidak menyebut nama mesin.
  assert.deepEqual(g("Aku asisten dari tim Toko Uji, Kak; detail teknisnya tidak bisa kami bagikan. Ada yang bisa dibantu?"), []);
  // Toko yang memang menjual akun ChatGPT/Claude: namanya ada di pengetahuan, jadi sah.
  const toko = `${sistem}\nProduk: akun ChatGPT Plus 1 bulan Rp${(85000).toLocaleString("id-ID")}; akun Claude Pro tersedia.`;
  assert.deepEqual(g("Aku rekomendasikan akun ChatGPT Plus 1 bulan ya Kak, Rp85.000.", "ada akun chatgpt?", toko), []);
  // Arti lain dari nama bermakna ganda: tas Hermes, zodiak Gemini.
  assert.deepEqual(g("Untuk tas Hermes kami belum ada stoknya, Kak.", "ada tas hermes?"), []);
  assert.deepEqual(g("Wah, Gemini ya Kak! Untuk ukuran cincinnya mau yang mana?", "aku gemini kak"), []);
  // Aturan inti meminta AI merahasiakan mesinnya.
  assert.match(P.ATURAN_INTI, /Jangan pernah menyebut nama mesin, model, atau perusahaan AI/);
});

await cek("mesin AI dirahasiakan: draf yang menyebut nama mesin ditulis ulang; bila tulisan ulang masih menyebutnya, yang terkirim jawaban aman", async () => {
  const P = await lib("src/lib/pemeriksa.ts");
  for (const [kedua, aman] of [
    ["Aku asisten dari tim Toko Uji, Kak; detail teknisnya tidak bisa kami bagikan.", false],
    ["Aku pakai Claude dari Anthropic kok Kak.", true],
  ]) {
    let n = 0;
    globalThis.fetch = async () => {
      n += 1;
      const teks = n === 1 ? "Aku Claude, model AI buatan Anthropic." : kedua;
      return new Response(JSON.stringify({ content: [{ type: "text", text: teks }], usage: { input_tokens: 1, output_tokens: 1 } }));
    };
    try {
      const j = await AI.tanyaAiTerjaga({ sessionId: "x", sistem: "S", pesan: "kamu pakai AI apa?" }, `${P.ATURAN_INTI}\n${SUMBER}`, { gaya: true });
      assert.ok(j.pelanggaran.some((p) => p.jenis === "mesin"));
      assert.equal(j.aman, aman);
      assert.equal(j.teks, aman ? P.JAWABAN_AMAN : kedua);
      assert.doesNotMatch(j.teks, /claude|anthropic/i);
    } finally {
      globalThis.fetch = asli;
    }
  }
});

const KT = await lib("src/lib/katalog-def.ts");
const produkUji = [
  { id: 12, nama: "Kopi Susu Aren", harga: 18000, deskripsi: "Es, 250 ml", tersedia: true, adaFoto: true, urutan: 1, diubah: 1 },
  { id: 13, nama: "Roti Bakar", harga: null, deskripsi: "", tersedia: true, adaFoto: false, urutan: 2, diubah: 1 },
  { id: 14, nama: "Matcha Latte", harga: 22000, deskripsi: "", tersedia: false, adaFoto: true, urutan: 3, diubah: 1 },
];

await cek("katalog: tag <kirim_produk> dipisah dari jawaban (kode P, 'semua', tag terpotong); blok sistem memuat harga & status; yang dikirim hanya produk tersedia berfoto", async () => {
  assert.deepEqual(KT.ambilKirimProduk("Ini fotonya ya Kak 👇\n<kirim_produk>P12, P14,p12</kirim_produk>"), { teks: "Ini fotonya ya Kak 👇", produk: [12, 14] });
  assert.deepEqual(KT.ambilKirimProduk("Ini katalog kami ya\n<kirim_produk>semua</kirim_produk>"), { teks: "Ini katalog kami ya", produk: "semua" });
  assert.deepEqual(KT.ambilKirimProduk("Oke\n<kirim_produk>P12"), { teks: "Oke", produk: [12] });
  assert.deepEqual(KT.ambilKirimProduk("Biasa saja."), { teks: "Biasa saja.", produk: null });
  assert.equal(KT.ambilKirimProduk("<kirim_produk>abc</kirim_produk>").produk, null);
  const b = KT.blokKatalog(produkUji);
  assert.match(b, /\[P12\] Kopi Susu Aren — Rp18\.000 — Es, 250 ml \(ada foto\)/);
  assert.match(b, /\[P13\] Roti Bakar — harga tanya admin/);
  assert.match(b, /\[P14\] Matcha Latte — Rp22\.000 — HABIS \(ada foto\)/);
  assert.equal(KT.blokKatalog([]), "");
  assert.deepEqual(KT.pilihUntukKirim(produkUji, [12, 13, 14, 99]).foto.map((p) => p.id), [12]);
  const semua = KT.pilihUntukKirim(produkUji, "semua");
  assert.deepEqual([semua.daftarTeks, semua.foto.map((p) => p.id)], [true, [12]]);
  assert.equal(KT.teksKatalog(produkUji), "*Katalog produk*\n1. *Kopi Susu Aren* — Rp18.000\n   Es, 250 ml\n2. *Roti Bakar* — harga tanya admin");
  assert.equal(KT.captionProduk(produkUji[0]), "*Kopi Susu Aren*\nRp18.000\nEs, 250 ml");
  // Jawaban AI sudah memuat daftarnya sendiri: daftar katalog tidak dikirim dua kali (fotonya tetap)
  assert.equal(KT.perluDaftar("Ini katalog kami ya 👇", produkUji), true);
  assert.equal(KT.perluDaftar("Ini katalognya:\n*Kopi Susu Aren* Rp18.000\n*Roti Bakar*", produkUji), false);
});

await cek("katalog gambar panduan (nomor CS ChatGerCep): bukan produk, tanpa harga, tidak ikut 'semua', blok terpisah ringkas", async () => {
  const panduan = [
    { id: 30, nama: `${KT.AWALAN_PANDUAN}2 · Sambungkan WhatsApp (laptop + HP) (1/4)`, harga: null, deskripsi: "Beri nama nomor: Tulis nama bebas.", tersedia: true, adaFoto: true, urutan: 1000, diubah: 1 },
    { id: 31, nama: `${KT.AWALAN_PANDUAN}2 · Sambungkan WhatsApp (laptop + HP) (2/4)`, harga: null, deskripsi: "Kode QR muncul.", tersedia: true, adaFoto: true, urutan: 1001, diubah: 1 },
  ];
  const campur = [...produkUji, ...panduan];
  assert.equal(KT.captionProduk(panduan[0]), `*${panduan[0].nama}*\nBeri nama nomor: Tulis nama bebas.`, "tanpa 'harga tanya admin'");
  assert.deepEqual(KT.pilihUntukKirim(campur, "semua").foto.map((p) => p.id), [12]);
  assert.deepEqual(KT.pilihUntukKirim(campur, [30, 31]).foto.map((p) => p.id), [30, 31]);
  assert.ok(!KT.teksKatalog(campur).includes("Panduan"));
  const b = KT.blokKatalog(campur);
  assert.match(b, /<katalog_produk>[\s\S]*<\/katalog_produk>\n<gambar_panduan>/);
  assert.ok(!b.match(/<katalog_produk>[\s\S]*<\/katalog_produk>/)[0].includes("Panduan"), "panduan tidak dicampur ke daftar produk");
  assert.match(b, /\[P30\] 2 · Sambungkan WhatsApp \(laptop \+ HP\) \(1\/4\)\n/);
  assert.ok(!b.includes("Tulis nama bebas"), "deskripsi panduan tidak dimuat (hemat token)");
  // Hanya gambar panduan (GercepBot tanpa produk): blok panduan saja.
  assert.match(KT.blokKatalog(panduan), /^<gambar_panduan>/);
});

await cek("katalog + pemeriksa: 'aku kirimkan fotonya' sah HANYA dengan tag & katalog aktif; harga dari katalog lolos; harga karangan ditolak", async () => {
  const sumber = `${SUMBER}\n${KT.blokKatalog(produkUji)}`;
  const j = (t, o = {}) => periksaJawaban(t, sumber, o).map((p) => p.jenis);
  assert.deepEqual(j("Siap Kak, aku kirimkan fotonya ya 👇\n<kirim_produk>P12</kirim_produk>", { katalog: true }), []);
  assert.deepEqual(j("Siap Kak, aku kirimkan fotonya ya.", { katalog: true }), ["janji"]); // tanpa tag = bohong
  assert.deepEqual(j("Siap Kak, aku kirimkan fotonya ya.\n<kirim_produk>P12</kirim_produk>"), ["janji"]); // katalog tidak aktif
  assert.deepEqual(j("Mau aku kirimkan katalognya, Kak?", { katalog: true }), []); // tawaran
  assert.deepEqual(j("Mau aku kirimkan katalognya, Kak?"), ["janji"]); // tanpa katalog tidak bisa ditepati
  assert.deepEqual(j("Kopi Susu Aren Rp18.000 ya Kak.", { katalog: true }), []);
  assert.deepEqual(j("Kopi Susu Aren Rp15.000 ya Kak.", { katalog: true }), ["angka"]);
});

const T = await lib("src/lib/teruskan.ts");
const { rapikanNomorWa } = await lib("src/lib/numbers.ts");

await cek("teruskan dicabut: sisa tag <teruskan> lama dibuang dari teks pelanggan (tertutup, terpotong, atau nyasar)", async () => {
  assert.equal(T.buangTagTeruskan('Siap Kak, tim kami balas di chat ini ya.\n<teruskan jenis="pesanan">\nNama: Rina\n</teruskan>'), "Siap Kak, tim kami balas di chat ini ya.");
  assert.equal(T.buangTagTeruskan('Oke.\n<teruskan jenis="keluhan">Barang rusak'), "Oke.");
  assert.equal(T.buangTagTeruskan("a </teruskan> b"), "a  b");
  assert.equal(T.buangTagTeruskan("Biasa saja."), "Biasa saja.");
  assert.match(T.ATURAN_SERAH_TIM, /hanya bisa membalas chat ini/);
  assert.doesNotMatch(T.ATURAN_SERAH_TIM, /<teruskan|WhatsApp pribadi/);
});

await cek("nomor WA penerima dirapikan: 08xx / +62 / 62 / 8xx / spasi & strip; selain itu ditolak", async () => {
  for (const m of ["0812-3456-7890", "+62 812 3456 7890", "6281234567890", "812 3456 7890"]) assert.equal(rapikanNomorWa(m), "6281234567890", m);
  assert.equal(rapikanNomorWa("+1 (415) 555-0100"), "14155550100");
  for (const m of ["", "123", "abc", "0", "+0812345678"]) assert.equal(rapikanNomorWa(m), null, m);
});

await cek("pemeriksa tanpa teruskan: 'sudah aku teruskan' selalu janji palsu, juga bila AI menulis tag lama", async () => {
  const j = (t, o = {}) => periksaJawaban(t, SUMBER, o).map((p) => p.jenis);
  assert.deepEqual(j("Siap Kak, pesanannya sudah aku teruskan ke pemilik ya."), ["janji"]);
  assert.deepEqual(j("Boleh kirim alamatnya Kak? Setelah itu aku teruskan ke tim ya."), ["janji"]);
  assert.deepEqual(j("Siap Kak, nanti tim kami yang balas langsung di chat ini ya."), []);
});

await cek("editor knowledge: kerangka per jenis usaha tanpa data contoh yang tersimpan; baris kosong & pertanyaan belum dijawab dibuang; cek kelengkapan", async () => {
  const TU = await lib("src/lib/templat-usaha.ts");
  for (const k of Object.keys(TU.JENIS_USAHA)) {
    const kr = TU.kerangka(k);
    assert.match(kr, /\(contoh: /, k);
    const b = TU.bersihkanKerangka(kr);
    assert.doesNotMatch(b, /contoh|\d+rb|Rp\d/i, `${k}: data contoh tidak ikut tersimpan`);
    assert.match(b, /^Gaya bahasa: /m, k); // saran non-fakta tetap ada
    assert.deepEqual(Object.values(TU.cekKelengkapan(kr)), [false, false, false, false, false], `${k}: kerangka kosong belum lengkap`);
  }
  const isi = TU.kerangka("kuliner")
    .replace("Nama usaha: ", "Nama usaha: Warung Uji")
    .replace("- \n", "- Mie ayam 15rb\n")
    .replace("Alamat: ", "Alamat: Jl. Mawar 3");
  const b = TU.bersihkanKerangka(`${isi}\nJam buka setiap hari jam berapa? → \nCara bayar apa saja? → QRIS`);
  assert.match(b, /Menu & harga \(satu per baris, dengan harga\):\n- Mie ayam 15rb/, "judul daftar tetap ada bila diikuti butir");
  assert.doesNotMatch(b, /Jam buka setiap hari/, "pertanyaan yang belum dijawab dibuang");
  assert.match(b, /Cara bayar apa saja\? → QRIS/);
  assert.doesNotMatch(b, /^Pengiriman:/m);
  const lk = TU.cekKelengkapan(b);
  assert.deepEqual([lk.nama, lk.harga, lk.lokasi, lk.bayar, lk.jam], [true, true, true, true, false]);
  assert.equal(TU.cekKelengkapan("Warung Bu Sari jual ayam geprek 18rb, buka jam 10-21, Jl. Melati 5, bayar QRIS").jam, true);
  // Jenis usaha = 10 industri landing page (kunci = slug LP) + kuliner + lainnya; isian & pertanyaan khas tiap industri.
  const { SLUG_LP } = await lib("src/lib/lp/def.ts");
  assert.deepEqual(Object.keys(TU.JENIS_USAHA), [...SLUG_LP, "kuliner", "umum"], "urutan jenis usaha = urutan LP");
  assert.equal(TU.jenisUsahaSah("laundry"), true);
  assert.equal(TU.jenisUsahaSah("constructor"), false, "properti bawaan objek bukan jenis usaha");
  assert.equal(TU.jenisUsahaSah("kecantikan"), false, "kunci lama tidak lagi dikenal");
  const ld = TU.kerangka("laundry");
  assert.match(ld, /^Antar-jemput: /m);
  assert.match(ld, /^Saat pelanggan memesan, tanyakan: .*perkiraan berat/m);
  assert.match(ld, /^Serahkan ke pemilik bila: keluhan cucian rusak/m);
  assert.match(TU.kerangka("rental-mobil"), /^Saat pelanggan booking, tanyakan: .*tanggal dan jam ambil/m);
  assert.match(TU.kerangka("travel-umrah"), /^Saat pelanggan mendaftar, tanyakan: .*jumlah jamaah/m);
  assert.match(TU.kerangka("maklon-kosmetik"), /^Saat pelanggan minta konsultasi, tanyakan: /m);
  assert.match(TU.kerangka("klinik-kecantikan", "en"), /^When a customer books, ask for: .*skin concern/m);
  assert.match(TU.bersihkanKerangka(TU.kerangka("bengkel")), /^Serahkan ke pemilik bila: permintaan diagnosa/m, "saran serah-terima tetap ada setelah dibersihkan");
});

await cek("rapikan knowledge dengan AI: hanya merapikan; angka yang dikarang ditandai; kekurangan dicatat; galat jelas tanpa nama mesin", async () => {
  const R = await lib("src/lib/rapikan-knowledge.ts");
  const TU = await lib("src/lib/templat-usaha.ts");
  // Pengurai
  assert.deepEqual(R.uraiRapikan("<knowledge>\n# TENTANG USAHA\nWarung Uji\n</knowledge>\n<kurang>\n- Jam buka?\n- Alamat lengkapnya di mana?\n</kurang>"), { teks: "# TENTANG USAHA\nWarung Uji", kurang: ["Jam buka?", "Alamat lengkapnya di mana?"] });
  assert.deepEqual(R.uraiRapikan("# MENU\n- Mie: Rp15.000"), { teks: "# MENU\n- Mie: Rp15.000", kurang: [] });
  assert.equal(R.uraiRapikan("Halo Kak, ada yang bisa dibantu?"), null);
  assert.match(R.sistemRapikan("klinik-kecantikan"), /Jenis usaha: Klinik kecantikan/);
  assert.match(R.sistemRapikan("klinik-kecantikan"), /# CARA BOOKING/);
  assert.match(R.sistemRapikan(null), /Pakai HANYA fakta yang ditulis pemilik/);

  process.env.HERMES_API_KEY ??= "uji";
  let kiriman;
  const balasan = "<knowledge>\n# PERAN & GAYA BAHASA\nKamu membalas chat WhatsApp untuk Warung Uji.\n# MENU & HARGA\n- Mie ayam: Rp15.000\n- Es teh: Rp5.000\n# LOKASI\nAlamat: Jl. Mawar 3\n</knowledge>\n<kurang>\n- Jam buka setiap hari jam berapa?\n</kurang>";
  globalThis.fetch = async (url, init) => {
    kiriman = { url: String(url), body: JSON.parse(init.body), sesi: init.headers["X-Hermes-Session-Id"] };
    return new Response(JSON.stringify({ choices: [{ message: { content: balasan } }], usage: { prompt_tokens: 10 } }));
  };
  try {
    const teks = TU.kerangka("kuliner").replace("Nama usaha: ", "Nama usaha: Warung Uji").replace("- \n", "- mie ayam 15rb\n").replace("Alamat: ", "Alamat: Jl. Mawar 3");
    const h = await R.rapikanKnowledge({ teks, jenis: "kuliner", userId: 7 });
    assert.match(kiriman.url, /\/chat\/completions$/);
    assert.match(kiriman.sesi, /^rapikan-7-[0-9a-f]{12}$/, "sesi baru tiap permintaan");
    assert.match(kiriman.body.messages[0].content, /Jenis usaha: Kuliner/);
    assert.doesNotMatch(kiriman.body.messages[1].content, /contoh/i, "petunjuk contoh tidak dikirim ke AI");
    assert.match(kiriman.body.messages[1].content, /mie ayam 15rb/);
    assert.deepEqual(h.kurang, ["Jam buka setiap hari jam berapa?"]);
    assert.match(h.teks, /- Mie ayam: Rp15\.000/);
    // "15rb" -> Rp15.000 sah; Rp5.000 (es teh) tidak ada di tulisan asli -> ditandai
    assert.deepEqual(h.peringatan, ["Rp5.000"]);
    assert.doesNotMatch(h.asli, /contoh/i);
    await assert.rejects(R.rapikanKnowledge({ teks: TU.kerangka("toko-online"), jenis: "toko-online", userId: 7 }), (e) => e instanceof R.GalatRapikan && /Tulis dulu/.test(e.message));
    globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: "Halo Kak 🙏" } }] }));
    await assert.rejects(R.rapikanKnowledge({ teks, jenis: null, userId: 7 }), (e) => e instanceof R.GalatRapikan && !/hermes|claude/i.test(e.message));
  } finally {
    globalThis.fetch = asli;
  }
});

await cek("penyedia AI per akun dari admin menang atas mode umum; tanpa kunci di server kembali ke mode umum", async () => {
  const L = await lib("src/lib/langganan.ts");
  const PG = await lib("src/lib/pengguna.ts");
  const [admin] = await sql`INSERT INTO users(email, nama, password_hash, peran, created_at) VALUES ('admin-ai@uji', 'Admin', 'x', 'admin', ${sekarang()}) RETURNING id, email`;
  const [u] = await sql`INSERT INTO users(email, nama, password_hash, created_at) VALUES ('akun-ai@uji', 'Akun', 'x', ${sekarang()}) RETURNING id`;
  const simpan = await getSetting("ai_penyedia");
  const kunciLama = process.env.ANTHROPIC_API_KEY;

  await setSetting("ai_penyedia", "per_paket"); // akun tanpa paket = Hermes
  assert.deepEqual(await L.aiUntukAkun(u.id), { penyedia: "hermes", cadanganHermes: false });
  await PG.setAiAkun(admin, u.id, "anthropic");
  assert.equal((await PG.penggunaById(u.id)).ai_penyedia, "anthropic");
  assert.deepEqual(await L.aiUntukAkun(u.id), { penyedia: "anthropic", cadanganHermes: true }); // cache dibersihkan: langsung berlaku
  delete process.env.ANTHROPIC_API_KEY;
  assert.deepEqual(await L.aiUntukAkun(u.id), { penyedia: "hermes", cadanganHermes: false }); // kunci dicabut: ikut mode umum
  process.env.ANTHROPIC_API_KEY = kunciLama;

  await setSetting("ai_penyedia", "anthropic"); // semua nomor Claude API, kecuali akun yang dipaksa Hermes
  await PG.setAiAkun(admin, u.id, "hermes");
  assert.deepEqual(await L.aiUntukAkun(u.id), { penyedia: "hermes", cadanganHermes: false });
  await PG.setAiAkun(admin, u.id, null);
  assert.deepEqual(await L.aiUntukAkun(u.id), { penyedia: "anthropic", cadanganHermes: false });
  assert.deepEqual(await L.aiUntukAkun(null), { penyedia: "anthropic", cadanganHermes: false });

  const log = await sql`SELECT detail FROM admin_log WHERE aksi = 'ubah mesin AI akun' ORDER BY id`;
  assert.deepEqual(log.map((r) => r.detail), ["Claude API", "Hermes", "ikut pengaturan umum"]);
  await assert.rejects(sql`UPDATE users SET ai_penyedia = 'openai' WHERE id = ${u.id}`); // hanya penyedia yang dikenal
  await setSetting("ai_penyedia", simpan);
});

await cek("penyaring spam lokal (uji/data-spam.json): 0 pesan pelanggan salah tandai, promosi judi tertangkap >= 95%", async () => {
  const { readFileSync } = await import("node:fs");
  const S = await lib("src/lib/spam.ts");
  const d = JSON.parse(readFileSync(path.join(akar, "uji/data-spam.json"), "utf8"));
  const salah = d.pelanggan.filter((t) => S.periksaSpam(t).spam);
  assert.deepEqual(salah, [], "pesan pelanggan tidak boleh ada yang tertandai spam");
  const kena = d.judi.filter((t) => S.periksaSpam(t).spam).length;
  assert.ok(kena / d.judi.length >= 0.95, `tertangkap ${kena}/${d.judi.length}`);
  // Spam bukan judi sengaja tidak diputuskan lokal (diserahkan ke AI yang tahu konteks usaha).
  assert.deepEqual(d.lain.filter((t) => S.periksaSpam(t).spam), []);
  console.log(`        (judi tertangkap ${kena}/${d.judi.length}; pelanggan salah tandai 0/${d.pelanggan.length})`);
  // Ejaan samaran dinormalkan; angka+satuan tidak diubah.
  assert.equal(S.normalisasi("𝐒𝐋𝐎𝐓 g4c0r").kata, "slot gacor");
  assert.equal(S.normalisasi("s.l.o.t g a c o r").padat, "slotgacor");
  assert.equal(S.normalisasi("deposit 100rb 4D").kata, "deposit 100rb 4d");
  // Tag abaikan: hanya bila tag itu satu-satunya isi jawaban.
  assert.deepEqual(S.ambilAbaikan('<abaikan jenis="judi">promosi slot</abaikan>'), { jenis: "judi", alasan: "promosi slot" });
  assert.deepEqual(S.ambilAbaikan("<abaikan>x</abaikan>"), { jenis: "promosi", alasan: "x" });
  assert.equal(S.ambilAbaikan('Halo kak!\n<abaikan jenis="judi">x</abaikan>'), null);
  assert.equal(S.buangTagAbaikan('Halo kak!\n<abaikan jenis="judi">alasan untuk sistem</abaikan>'), "Halo kak!");
  assert.equal(S.buangTagAbaikan("Halo kak!\n<abaikan>terpotong"), "Halo kak!");
});

await cek("penyaring prospek: tag penilaian dipisah dari jawaban; penutup, kata minat, detektor bot; kNN & vektor int8", async () => {
  const P = await lib("src/lib/prospek-def.ts");
  assert.deepEqual(P.ambilNilai("Halo kak, ada yang bisa dibantu?\n<nilai>netral</nilai>"), { teks: "Halo kak, ada yang bisa dibantu?", nilai: "netral", minat: null });
  assert.deepEqual(P.ambilNilai("<nilai>selesai</nilai>"), { teks: "", nilai: "selesai", minat: null });
  assert.deepEqual(P.ambilNilai('Maaf kak\n<nilai label="bukan"/>'), { teks: "Maaf kak", nilai: "bukan", minat: null });
  assert.deepEqual(P.ambilNilai("Siap kak\n<nilai>entah</nilai>"), { teks: "Siap kak", nilai: null, minat: null }, "label tak dikenal diabaikan, tag tetap dibuang");
  // Pembatas rusak dari model: dibakukan dulu (ai.ts), sisanya ditangkap cadangan baris terakhir.
  const yangMana = "Harga di outlet bervariasi, Kak. Menu yang Kakak mau yang mana?";
  for (const t of ["<|nilai>prospek", "<|nilai|>prospek<|/nilai|>", "<nilai|>prospek</nilai|>", "< nilai >prospek</ nilai >", "</|nilai>prospek"])
    assert.deepEqual(P.ambilNilai(AI.bakukanTag(`${yangMana}\n${t}`)), { teks: yangMana, nilai: "prospek", minat: null }, t);
  for (const t of ["[nilai: prospek]", "nilai=prospek", "|nilai>prospek", "(nilai: prospek)"])
    assert.deepEqual(P.ambilNilai(`${yangMana}\n${t}`), { teks: yangMana, nilai: "prospek", minat: null }, t);
  assert.deepEqual(P.ambilNilai("Kami bantu menilai prospek usaha Kakak"), { teks: "Kami bantu menilai prospek usaha Kakak", nilai: null, minat: null }, "kalimat biasa tidak dipotong");
  // Tingkat minat beli: hanya bersama nilai prospek; bentuk rusak ditangkap; teks pelanggan tidak terpotong.
  assert.deepEqual(P.ambilNilai(`${yangMana}\n<nilai>prospek</nilai><minat>panas</minat>`), { teks: yangMana, nilai: "prospek", minat: "panas" });
  assert.deepEqual(P.ambilNilai(`${yangMana}\n<minat>hangat</minat>\n<nilai>prospek</nilai>`), { teks: yangMana, nilai: "prospek", minat: "hangat" });
  assert.deepEqual(P.ambilNilai(AI.bakukanTag(`${yangMana}\n<|nilai>prospek<|minat>dingin`)), { teks: yangMana, nilai: "prospek", minat: "dingin" });
  assert.deepEqual(P.ambilNilai(`${yangMana}\n[nilai: prospek] [minat: panas]`), { teks: yangMana, nilai: "prospek", minat: "panas" });
  assert.deepEqual(P.ambilNilai("Maaf kak\n<nilai>bukan</nilai><minat>panas</minat>"), { teks: "Maaf kak", nilai: "bukan", minat: null }, "minat diabaikan bila bukan prospek");
  assert.deepEqual(P.ambilNilai("Siap kak\n<nilai>prospek</nilai><minat>entah</minat>"), { teks: "Siap kak", nilai: "prospek", minat: null }, "tingkat tak dikenal diabaikan");
  assert.deepEqual(P.ambilNilai("Saya minat panas-panasnya kak\n<nilai>prospek</nilai>"), { teks: "Saya minat panas-panasnya kak", nilai: "prospek", minat: null }, "kata minat di kalimat biasa tidak dipotong");
  // Luruh: turun satu tingkat per 7 hari diam, tidak di bawah dingin.
  assert.equal(P.minatEfektif(2, 1000, 1000 + 6 * 86400), 2);
  assert.equal(P.minatEfektif(2, 1000, 1000 + 7 * 86400), 1);
  assert.equal(P.minatEfektif(1, 1000, 1000 + 30 * 86400), 0);
  assert.equal(P.minatEfektif(null, null, 1000), null);
  assert.ok(P.ATURAN_NILAI.includes("<minat>panas</minat>"), "aturan prompt memuat tag minat");
  // Sudah beli: kunci `beli` hanya ada bila benar, hanya bersama nilai prospek; bentuk rusak ditangkap.
  assert.deepEqual(P.ambilNilai(`${yangMana}\n<nilai>prospek</nilai><minat>beli</minat>`), { teks: yangMana, nilai: "prospek", minat: null, beli: true });
  assert.deepEqual(P.ambilNilai(`${yangMana}\n[nilai: prospek] [minat: beli]`), { teks: yangMana, nilai: "prospek", minat: null, beli: true });
  assert.deepEqual(P.ambilNilai("Maaf kak\n<nilai>bukan</nilai><minat>beli</minat>"), { teks: "Maaf kak", nilai: "bukan", minat: null }, "beli diabaikan bila bukan prospek");
  assert.deepEqual(P.ambilNilai("Terima kasih sudah beli kak\n<nilai>prospek</nilai><minat>hangat</minat>"), { teks: "Terima kasih sudah beli kak", nilai: "prospek", minat: "hangat" }, "kata beli di kalimat biasa bukan tag");
  assert.ok(P.ATURAN_NILAI.includes("<minat>beli</minat>"), "aturan prompt memuat tag beli");
  assert.equal(AI.bakukanTag('Oke\n<|teruskan jenis="pesanan"|>Nama: Rina<|/teruskan|>'), 'Oke\n<teruskan jenis="pesanan">Nama: Rina</teruskan>');
  assert.equal(AI.bakukanTag('Maaf kak\n<nilai label="bukan"/>'), 'Maaf kak\n<nilai label="bukan"/>', "tag baku tidak berubah");
  globalThis.fetch = async () => new Response(JSON.stringify({ content: [{ type: "text", text: `${yangMana}\n<|nilai>prospek` }], usage: {} }));
  try {
    const j = await AI.tanyaAiTerjaga({ sessionId: "x", sistem: "S", pesan: "harga menu gimna?" }, `${SUMBER}\n${yangMana}`, { nilai: true });
    assert.deepEqual([j.teks, j.nilai], [yangMana, "prospek"]);
  } finally {
    globalThis.fetch = asli;
  }
  for (const t of ["ok makasih kak 🙏", "siap kak", "👍", "Terima kasih banyak min", "oke deh"]) assert.equal(P.penutupSaja(t), true, t);
  for (const t of ["baik kak saya pesan 2", "oke, berapa ongkirnya?", "makasih, besok ambil jam 3", "halo kak"]) assert.equal(P.penutupSaja(t), false, t);
  assert.equal(P.adaKataMinat("kak brp hrg nya"), true);
  assert.equal(P.adaKataMinat("wkwk lucu"), false);
  const balasan = "Halo Kak, terima kasih sudah menghubungi Toko A. Ada yang bisa dibantu?";
  assert.equal(P.gema(`${balasan} 😊`, balasan), true);
  assert.equal(P.gema("terima kasih", balasan), false, "pesan pendek tidak dianggap gema");
  const promo = "Promo spesial hari ini diskon 50% untuk semua produk kami";
  assert.equal(P.berulang(promo, [promo, promo]), true);
  assert.equal(P.berulang("p", ["p", "p"]), false, "'p' berulang dari pelanggan yang tidak sabar bukan bot");
  // Vektor int8: kemiripan nyaris sama dengan float32; kNN memilih label tetangga terdekat.
  const acak = (s) => {
    const v = new Float32Array(P.DIM).map((_, i) => Math.sin(i * s));
    const n = Math.hypot(...v);
    return v.map((x) => x / n);
  };
  const [a, b, c] = [acak(1.1), acak(2.3), acak(3.7)];
  const bank = P.bankKosong(3);
  P.tambahKeBank(bank, P.kodeVektor(a), P.idLabel("prospek"), 1);
  P.tambahKeBank(bank, P.kodeVektor(b), P.idLabel("bukan"), 1);
  P.tambahKeBank(bank, P.kodeVektor(c), P.idLabel("selesai"), 1);
  assert.equal(P.kodeVektor(a).length, 388);
  assert.equal(P.nilaiKnn(a, [bank]).label, "prospek");
  assert.equal(P.nilaiKnn(b, [bank]).label, "bukan");
  assert.ok(Math.abs(P.nilaiKnn(a, [bank]).simMaks - 1) < 0.005);
  assert.ok(P.peluangLewati(P.nilaiKnn(c, [bank])) > 0.9);
  assert.equal(P.nilaiKnn(a, [bank], { lewati: (_, i) => i === 0 }).label !== "prospek" || bank.n === 1, true, "leave-one-out melewati contoh itu sendiri");
});

await sql.end({ timeout: 2 });
await pg.berhenti();
console.log(`\nLOLOS ${lolos} uji modul AI`);
process.exit(0);
