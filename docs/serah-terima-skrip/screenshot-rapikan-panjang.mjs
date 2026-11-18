// Screenshot "Rapikan dengan AI" untuk dokumen panjang (src/components/editor-knowledge.tsx, loading-ai.tsx): build
// standalone lokal + PostgreSQL sementara + AI (Hermes) palsu lokal yang sengaja lambat per bagian, supaya progres
// "Bagian x dari y" bisa difoto. Bukan produksi, tanpa kredensial asli.
// Pakai dari akar proyek (setelah `next build`): node --import ./uji/loader.mjs <skrip ini> <folder keluaran>
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const akar = process.cwd();
const keluar = path.resolve(process.argv[2] ?? "screenshot-rapikan-panjang");
mkdirSync(keluar, { recursive: true });
const tmp = path.join(os.tmpdir(), "wa-ss-rapikan-panjang");
const app = path.join(tmp, "app");
rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
mkdirSync(tmp, { recursive: true });
cpSync(path.join(akar, ".next/standalone"), app, { recursive: true });
cpSync(path.join(akar, ".next/static"), path.join(app, ".next/static"), { recursive: true });
if (existsSync(path.join(akar, "public"))) cpSync(path.join(akar, "public"), path.join(app, "public"), { recursive: true });
for (const f of [".env", ".env.local", ".env.production"]) rmSync(path.join(app, f), { force: true });

const { mulaiPg, portBebas } = await import(pathToFileURL(path.join(akar, "uji/pg-lokal.mjs")).href);
const pg = await mulaiPg({ dir: path.join(tmp, "pg"), sementara: true });
process.env.DATABASE_URL = pg.url;
process.env.DATA_DIR = path.join(tmp, "data");
process.env.AUTH_SECRET = "s".repeat(48);
const lib = (f) => import(pathToFileURL(path.join(akar, f)).href);
const { db, sekarang } = await lib("src/lib/db.ts");
const P = await lib("src/lib/pengguna.ts");
const { tambahNomor } = await lib("src/lib/numbers.ts");
const { tambahDokumen } = await lib("src/lib/knowledge.ts");
const sql = await db();

// ---------- Data contoh: dokumen ±40 ribu karakter (seperti "product-knowledge" pengguna) ----------
const KAT = ["Shawarma", "Kebab", "Rice Bowl", "Minuman", "Paket Hemat", "Camilan"];
const VAR = ["Ayam", "Sapi", "Mix", "Keju", "Pedas", "Original", "Jumbo", "Mini"];
let dok = "- Bahasa materi: Bahasa Indonesia yang santai.\n\n## Kategori produk\n\n";
for (let i = 0; dok.length < 40_000; i++) {
  const k = KAT[i % KAT.length];
  const v = VAR[(i * 3) % VAR.length];
  dok += `- ${k} ${v} ${i + 1}: ${15 + (i % 20)}rb, isi ${v.toLowerCase()} pilihan, sayur segar, saus garlic racikan sendiri, cocok buat makan siang\n`;
  if (i % 25 === 24) dok += `\n## ${KAT[(i + 1) % KAT.length]} lainnya\n\n`;
}
dok += "\nJam buka setiap hari 10.00-22.00. Alamat Jl. Melati 12, Bandung. Bayar QRIS, transfer BCA, atau tunai.\n";
const panjang = dok.repeat(6).slice(0, 240_000);

const PASS = "Rahasia-uji-2026";
const u = await P.buatAkun({ email: "shawarma@contoh.test", nama: "Suka Shawarma Uji", password: PASS });
for (const x of ["dashboard", "nomor"]) await P.tandaiTurSelesai(u.id, x);
const t = sekarang();
await sql`INSERT INTO langganan(user_id, nama_paket, mulai, sampai, kuota_nomor, kuota_balasan, sumber) VALUES (${u.id}, 'Bisnis', ${t - 86400}, ${t + 30 * 86400}, 3, 4000, 'admin')`;
const n = await tambahNomor("Suka Shawarma", u.id);
await sql`UPDATE numbers SET wa_id = '6281200009999', bot_aktif = true WHERE id = ${n.id}`;
await tambahDokumen({ numberId: n.id, judul: "product-knowledge", sumber: "teks", teks: dok });
console.log(`dokumen contoh ${dok.length.toLocaleString("id-ID")} karakter; tulisan panjang ${panjang.length.toLocaleString("id-ID")} karakter`);
await sql.end({ timeout: 2 });

// ---------- AI palsu: tiap bagian makin lama (bagian ke-i = i × JEDA ms) supaya progres naik bertahap ----------
const JEDA = 3500;
const portAi = await portBebas();
const ai = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (!req.url.endsWith("/chat/completions")) return res.writeHead(200, { "Content-Type": "application/json" }).end('{"data":[]}');
    const isi = JSON.parse(body).messages[1].content;
    const ke = Number(isi.match(/bagian (\d+) dari/)?.[1] ?? 1);
    const butir = [...isi.matchAll(/^- (.+?): (\d+)rb, (.+)$/gm)].slice(0, 6).map((m) => `- ${m[1]}: Rp${m[2]}.000 (${m[3]})`);
    const awal = ke === 1 ? "# PERAN & GAYA BAHASA\nKamu membalas chat WhatsApp untuk Suka Shawarma seperti CS yang ramah. Bahasa santai, panggil pelanggan \"Kak\".\n# TENTANG USAHA\nSuka Shawarma menjual shawarma, kebab, rice bowl, dan minuman.\n" : "";
    const akhir = /Jam buka setiap hari/.test(isi) ? "# JAM BUKA\nSetiap hari 10.00-22.00\n# LOKASI\nJl. Melati 12, Bandung\n# PEMBAYARAN\nQRIS, transfer BCA, atau tunai.\n" : "";
    const teks = `<knowledge>\n${awal}# PRODUK & HARGA\n${butir.join("\n")}\nIni harga resmi: sebutkan persis seperti tertulis, jangan memberi diskon atau menghitung total sendiri.\n${akhir}</knowledge>\n<kurang></kurang>`;
    setTimeout(() => res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ choices: [{ message: { content: teks } }], usage: { prompt_tokens: 100 } })), ke * JEDA);
  });
});
await new Promise((r) => ai.listen(portAi, "127.0.0.1", r));

// ---------- Server lokal ----------
const port = await portBebas();
const dasar = `http://127.0.0.1:${port}`;
const env = { ...process.env, NODE_ENV: "production", PORT: String(port), HOSTNAME: "127.0.0.1", APP_URL: dasar, HERMES_API_URL: `http://127.0.0.1:${portAi}`, HERMES_API_KEY: "x" };
const server = spawn(process.execPath, ["server.js"], { cwd: app, env, stdio: ["ignore", "pipe", "pipe"] });
server.stderr.on("data", (b) => process.stderr.write(`[server] ${b}`));
let siap = false;
for (let i = 0; i < 200 && !siap; i++) {
  try {
    siap = (await fetch(`${dasar}/api/health`)).ok;
  } catch {}
  if (!siap) await new Promise((r) => setTimeout(r, 150));
}
if (!siap) throw new Error("server tidak siap");

// ---------- Chrome headless lewat CDP ----------
const portCdp = await portBebas();
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new", `--remote-debugging-port=${portCdp}`, `--user-data-dir=${path.join(tmp, "chrome")}`, "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "about:blank",
]);
let ws;
for (let i = 0; i < 100 && !ws; i++) {
  try {
    const hal = (await (await fetch(`http://127.0.0.1:${portCdp}/json/list`)).json()).find((d) => d.type === "page");
    if (hal) ws = new WebSocket(hal.webSocketDebuggerUrl);
  } catch {}
  if (!ws) await new Promise((r) => setTimeout(r, 150));
}
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let idBerikut = 1;
const tunggu = new Map();
const pendengar = [];
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && tunggu.has(m.id)) {
    const { ok, gagal } = tunggu.get(m.id);
    tunggu.delete(m.id);
    m.error ? gagal(new Error(m.error.message)) : ok(m.result);
  } else if (m.method) for (const f of pendengar) f(m);
});
const cdp = (method, params = {}) => new Promise((ok, gagal) => { const id = idBerikut++; tunggu.set(id, { ok, gagal }); ws.send(JSON.stringify({ id, method, params })); });
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
await cdp("Page.enable");
await cdp("Runtime.enable");
await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
const evaluasi = async (expr) => (await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result.value;
async function buka(jalur) {
  const muat = new Promise((r) => { const f = (m) => { if (m.method === "Page.loadEventFired") { pendengar.splice(pendengar.indexOf(f), 1); r(); } }; pendengar.push(f); });
  await cdp("Page.navigate", { url: dasar + jalur });
  await muat;
  await tidur(1200);
}
async function ukuran(lebar, hp) {
  await cdp("Emulation.setDeviceMetricsOverride", { width: lebar, height: hp ? 844 : 900, deviceScaleFactor: hp ? 2 : 1, mobile: hp });
}
async function foto(nama, { pilih } = {}) {
  let clip;
  if (pilih) {
    const r = await evaluasi(`(() => { const el = ${pilih}; if (!el) return null; el.scrollIntoView({ block: "start" }); const b = el.getBoundingClientRect(); return { x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height }; })()`);
    if (!r) throw new Error(`elemen tidak ada: ${nama}`);
    clip = { x: Math.max(0, r.x - 12), y: Math.max(0, r.y - 12), width: r.w + 24, height: r.h + 24, scale: 1 };
  }
  const { data } = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: !!clip, ...(clip ? { clip } : {}) });
  writeFileSync(path.join(keluar, `${nama}.png`), Buffer.from(data, "base64"));
  console.log(`  foto ${nama}.png`);
}
async function masuk(email) {
  await cdp("Network.enable");
  await cdp("Network.clearBrowserCookies");
  await buka("/login");
  await evaluasi(`(() => {
    const isi = (id, v) => { const el = document.getElementById(id); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); };
    isi("email", ${JSON.stringify(email)}); isi("password", ${JSON.stringify(PASS)});
    document.querySelector("form").requestSubmit();
  })()`);
  for (let i = 0; i < 60; i++) {
    await tidur(200);
    if ((await evaluasi("location.pathname")) !== "/login") break;
  }
  await tidur(800);
}
const tungguTeks = async (teks, kali = 120) => {
  for (let i = 0; i < kali; i++) {
    if (await evaluasi(`document.body.innerText.includes(${JSON.stringify(teks)})`)) return;
    await tidur(150);
  }
  throw new Error(`teks tidak muncul: ${teks}`);
};
const PANEL = `document.querySelector('[data-tur="knowledge"]')`;
const STATUS = `document.querySelector('[role="status"]')`;
let kunjungan = 0;
const bukaTab = async () => {
  await buka(`/nomor/${n.id}?v=${++kunjungan}#knowledge`);
  await tungguTeks("product-knowledge");
};
const sempurnakan = () => evaluasi(`[...document.querySelectorAll('button[data-analitik="Sempurnakan dokumen"]')].find((b) => b.offsetParent !== null).click()`);
const isiTulisan = (teks) =>
  evaluasi(`(() => { const el = document.querySelector('textarea[aria-label="Info usaha"]'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(el, ${JSON.stringify(teks)}); el.dispatchEvent(new Event("input", { bubbles: true })); })()`);
const klikTeks = async (teks) =>
  evaluasi(`(() => { const b = [...document.querySelectorAll("button")].filter((x) => x.offsetParent !== null).find((x) => x.textContent.trim().includes(${JSON.stringify(teks)})); if (!b) return false; b.click(); return true; })()`);

try {
  // Desktop: menyempurnakan dokumen tersimpan ±40 ribu karakter (dulu ditolak "maks 15.000 karakter").
  await ukuran(1440, false);
  await masuk("shawarma@contoh.test");
  await bukaTab();
  await foto("01-panel-informasi-usaha-awal-desktop", { pilih: PANEL });
  await sempurnakan();
  await tidur(1500);
  await foto("02-sempurnakan-40rb-progres-0-dari-3-desktop", { pilih: PANEL });
  await tungguTeks("Bagian 1 dari 3");
  await tidur(300);
  await foto("03-sempurnakan-progres-1-dari-3-desktop", { pilih: STATUS });
  await tungguTeks("Bagian 2 dari 3");
  await tidur(300);
  await foto("04-sempurnakan-progres-2-dari-3-desktop", { pilih: STATUS });
  await tungguTeks("Periksa hasilnya", 200);
  await tidur(500);
  await foto("05-hasil-gabungan-siap-disimpan-desktop", { pilih: PANEL });

  // Desktop: menulis/menempel tulisan 240 ribu karakter lalu "Rapikan dengan AI" (16 bagian, 4 bersamaan).
  await bukaTab();
  await isiTulisan(panjang);
  await tidur(800);
  await foto("06-tulis-240rb-karakter-sebelum-rapikan-desktop", { pilih: PANEL });
  await klikTeks("Rapikan dengan AI");
  await tungguTeks("Bagian 2 dari", 200);
  await tidur(300);
  await foto("07-rapikan-240rb-progres-desktop", { pilih: STATUS });

  // HP: alur yang sama.
  await ukuran(390, true);
  await bukaTab();
  await foto("08-panel-informasi-usaha-awal-hp", { pilih: PANEL });
  await sempurnakan();
  await tungguTeks("Bagian 1 dari 3");
  await tidur(300);
  await foto("09-sempurnakan-progres-1-dari-3-hp", { pilih: STATUS });
  await tungguTeks("Periksa hasilnya", 200);
  await tidur(500);
  await foto("10-hasil-gabungan-hp", { pilih: PANEL });
  await bukaTab();
  await isiTulisan(panjang);
  await tidur(800);
  await foto("11-tulis-240rb-karakter-hp", { pilih: PANEL });
} finally {
  chrome.kill();
  server.kill();
  ai.close();
  await pg.berhenti().catch(() => {});
}
process.exit(0);
