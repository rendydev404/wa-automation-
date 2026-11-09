// Uji landing page industri (lp/industri/*.json + src/lib/lp/template.ts), tanpa database:
// isi tiap industri lengkap (aturan build paket asli: field wajib, demo >= 3 skenario, FAQ 6–8), slug terdaftar di
// SLUG_LP + punya route, dan HTML hasil render ter-escape (teks JSON tidak bisa menyisipkan tag/skrip).
// Pakai: node --import ./uji/loader.mjs uji/uji-lp.mjs
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const akar = process.cwd();
const lib = (f) => import(pathToFileURL(path.join(akar, f)).href);
const { SLUG_LP, JALUR_LP_PUBLIK } = await lib("src/lib/lp/def.ts");
const { renderLp, renderGaransi } = await lib("src/lib/lp/template.ts");

const dirInd = path.join(akar, "lp/industri");
const semua = readdirSync(dirInd)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(path.join(dirInd, f), "utf8")));
assert.deepEqual(semua.map((i) => i.slug).sort(), [...SLUG_LP].sort(), "tiap JSON di lp/industri terdaftar di SLUG_LP (dan sebaliknya)");

const WAJIB = ["slug", "industry_name", "industry_short", "theme", "hero", "pain_points", "solutions", "demo_conversations", "benefits", "faq", "seo_metadata", "cta_tracking", "image_assets"];
for (const ind of semua) {
  for (const k of WAJIB) assert.ok(ind[k], `${ind.slug}: field "${k}" kosong`);
  assert.ok(ind.demo_conversations.scenarios.length >= 3, `${ind.slug}: minimal 3 skenario demo`);
  assert.ok(ind.faq.length >= 6 && ind.faq.length <= 8, `${ind.slug}: FAQ harus 6–8`);
  for (const s of ind.demo_conversations.scenarios) assert.ok(s.messages.length && s.messages[0].text, `${ind.slug}/${s.id}: skenario tanpa pesan`);
  assert.match(ind.theme.accent, /^#[0-9a-f]{6}$/i, `${ind.slug}: warna aksen`);
  assert.ok(existsSync(path.join(akar, "src/app/[lang]/(lp)", ind.slug, "route.ts")), `${ind.slug}: route belum dibuat`);
  assert.ok(JALUR_LP_PUBLIK.includes(`/${ind.slug}`), `${ind.slug}: belum publik di proxy`);
  assert.ok(existsSync(path.join(akar, "lp/prompt", `${ind.slug}.md`)), `${ind.slug}: template prompt AI belum ada`);
}
assert.ok(JALUR_LP_PUBLIK.includes("/garansi"));

// ---- render: harga dari data, escape, tanpa "undefined" ----
const paket = [
  { kode: "starter", nama: "Starter", harga: 67000, durasi_hari: 30, kuota_nomor: 1, kuota_balasan: 1000, deskripsi: "Untuk 1 nomor.", unggulan: false },
  { kode: "bisnis", nama: "Bisnis", harga: 246000, durasi_hari: 30, kuota_nomor: 3, kuota_balasan: 4000, deskripsi: "", unggulan: true },
];
const data = { paket, custom: null, metaPixelId: "", adaOg: false, asal: "https://contoh.test", css: "", js: "" };
for (const ind of semua) {
  const html = renderLp(ind, semua, data);
  assert.ok(!/undefined|NaN|\[object Object\]/.test(html.replace(/<script>window\.CG_LP=[\s\S]*?<\/script>/, "")), `${ind.slug}: ada nilai kosong di HTML`);
  assert.ok(html.includes("Rp67.000") && html.includes("Rp246.000"), `${ind.slug}: harga paket dari data`);
  assert.ok(html.includes('data-plan="bisnis"') && html.includes("--kolom:2"), `${ind.slug}: kartu paket`);
  assert.ok(html.includes("Simulasi percakapan"), `${ind.slug}: label Simulasi wajib ada`);
  assert.ok(!html.includes("og:image"), `${ind.slug}: tanpa gambar OG, meta og:image tidak dipasang`);
}
const jahat = structuredClone(semua[0]);
jahat.hero.title = '<img src=x onerror=alert(1)>"';
jahat.demo_conversations.scenarios[0].messages[0].text = "</script><script>alert(1)</script>";
const h = renderLp(jahat, semua, { ...data, paket: [], custom: null, adaOg: true });
assert.ok(!h.includes("<img src=x") && h.includes("&lt;img src=x"), "teks hero di-escape");
assert.ok(!h.includes("</script><script>alert(1)"), "teks demo di dalam <script> tidak bisa menutup tag");
assert.ok(h.includes('href="/#harga"') && !h.includes('id="sticky"'), "tanpa paket (database gagal): arahkan ke harga di halaman utama");
assert.ok(h.includes(`og:image" content="https://contoh.test/lp-assets/og/${jahat.slug}.png`));

const g = renderGaransi(["Syarat <satu>", "Syarat dua"], { asal: "https://contoh.test", css: "" });
assert.ok(g.includes("Syarat &lt;satu&gt;") && g.includes("1×24 jam"), "halaman garansi");

console.log(`uji-lp: ${semua.length} industri OK`);
