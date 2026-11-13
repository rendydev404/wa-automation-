// Screenshot maskot dasbor yang mengikuti status "mengetik" AI secara langsung (SSE /api/wa/detak): build standalone
// lokal + PostgreSQL sementara + akun contoh (bukan produksi). Aliran asli diperiksa dulu (isi & cakupan akun), lalu
// untuk memotret keadaan "sedang membalas" EventSource di browser diganti tiruan yang mengirim detak buatan, karena
// nomor contoh tidak tersambung WhatsApp sungguhan.
// Pakai dari akar proyek (setelah `next build`): node --import ./uji/loader.mjs <skrip ini> <folder keluaran>
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const akar = process.cwd();
const keluar = path.resolve(process.argv[2] ?? "screenshot-maskot-detak");
mkdirSync(keluar, { recursive: true });
const tmp = path.join(os.tmpdir(), "wa-ss-maskot-detak");
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
const sql = await db();

const PASS = "Rahasia-uji-2026";
const budi = await P.buatAkun({ email: "budi@contoh.test", nama: "Budi", password: PASS });
const sari = await P.buatAkun({ email: "sari@contoh.test", nama: "Sari", password: PASS });
for (const u of [budi, sari]) for (const t of ["dashboard", "nomor", "admin"]) await P.tandaiTurSelesai(u.id, t);
const t = sekarang();
await sql`INSERT INTO langganan(user_id, nama_paket, mulai, sampai, kuota_nomor, kuota_balasan, sumber) VALUES (${budi.id}, 'Bisnis', ${t - 86400}, ${t + 30 * 86400}, 3, 4000, 'admin')`;
const toko = await tambahNomor("Toko Kue Budi", budi.id);
const tokoSari = await tambahNomor("Butik Sari", sari.id);
await sql.end({ timeout: 2 });

// Hermes tiruan yang sehat (hanya /models), supaya maskot tidak menampilkan "AI tidak terjangkau".
const hermes = http.createServer((_q, r) => r.end("{}"));
await new Promise((r) => hermes.listen(0, "127.0.0.1", r));
const port = await portBebas();
const dasar = `http://127.0.0.1:${port}`;
const env = { ...process.env, NODE_ENV: "production", PORT: String(port), HOSTNAME: "127.0.0.1", APP_URL: dasar, HERMES_API_URL: `http://127.0.0.1:${hermes.address().port}`, HERMES_API_KEY: "x" };
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
await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }, { name: "prefers-reduced-motion", value: "reduce" }] });
const evaluasi = async (expr) => (await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result.value;
async function buka(jalur) {
  const muat = new Promise((r) => { const f = (m) => { if (m.method === "Page.loadEventFired") { pendengar.splice(pendengar.indexOf(f), 1); r(); } }; pendengar.push(f); });
  await cdp("Page.navigate", { url: dasar + jalur });
  await muat;
  await tidur(1500);
}
async function ukuran(lebar, hp) {
  await cdp("Emulation.setDeviceMetricsOverride", { width: lebar, height: hp ? 844 : 900, deviceScaleFactor: hp ? 2 : 1, mobile: hp });
}
async function foto(nama, { pojok = false } = {}) {
  await tidur(600);
  const w = await evaluasi("innerWidth");
  const h = await evaluasi("innerHeight");
  const clip = pojok ? { x: Math.max(0, w - 460), y: Math.max(0, h - 330), width: Math.min(460, w), height: 330, scale: 1 } : undefined;
  const { data } = await cdp("Page.captureScreenshot", { format: "png", ...(clip ? { clip } : {}) });
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
const labelMaskot = () =>
  evaluasi(`(document.querySelector('[aria-label^="Maskot GerCep:"]')?.getAttribute("aria-label") ?? "").replace("Maskot GerCep: ", "").replace(". Tekan untuk mengobrol.", "") || null`);
const tutupGelembung = async () => {
  await evaluasi(`document.querySelector('[aria-label="Tutup obrolan"]')?.click()`);
  await tidur(500);
};

try {
  await ukuran(1440, false);
  await masuk("budi@contoh.test");

  // 1) Aliran asli: data awal, hanya nomor milik akun ini, header SSE.
  const asli = await evaluasi(`new Promise((ok) => {
    const es = new EventSource("/api/wa/detak");
    es.onmessage = (e) => { es.close(); ok(e.data); };
    setTimeout(() => { es.close(); ok(null); }, 5000);
  })`);
  assert.ok(asli, "aliran /api/wa/detak mengirim data awal");
  const d = JSON.parse(asli);
  assert.equal(d.mengetik, null, "nomor contoh tidak sedang mengetik");
  const kepala = await evaluasi(`fetch("/api/wa/detak").then(async (r) => { const ct = r.headers.get("content-type"); await r.body.cancel(); return ct; })`);
  assert.match(kepala, /text\/event-stream/);
  const tanpaLogin = await (await fetch(`${dasar}/api/wa/detak`)).status;
  assert.equal(tanpaLogin, 401, "tanpa login ditolak");
  console.log(`  aliran asli: ${kepala}, data awal ${asli.length} B, mengetik=${d.mengetik}, tanpa login ${tanpaLogin}`);

  // 2) Keadaan diam (aliran asli).
  await buka("/dashboard");
  await tutupGelembung();
  console.log(`  label diam: ${await labelMaskot()}`);
  await foto("01-dasbor-maskot-siaga-desktop");
  await foto("01a-maskot-siaga-dekat", { pojok: true });

  // 3) EventSource tiruan: detak buatan "Toko Kue Budi sedang mengetik" lalu "terkirim".
  await cdp("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      const semua = [];
      window.EventSource = class { constructor() { semua.push(this); this.onmessage = null; } close() {} };
      window.__detak = (o) => { for (const es of semua) es.onmessage?.({ data: JSON.stringify({ masuk: 1, dibalas: 0, tMasuk: 0, tDibalas: 0, nomor: null, mengetik: null, kini: Math.floor(Date.now() / 1000) + 3600, ...o }) }); };
    })()`,
  });
  await buka("/dashboard");
  await tutupGelembung();
  await evaluasi(`window.__detak({ mengetik: ${toko.id}, nomor: ${toko.id} })`);
  await tidur(400);
  const lbl = await labelMaskot();
  console.log(`  label mengetik: ${lbl}`);
  assert.match(lbl ?? "", /Membalas chat di Toko Kue Budi/);
  await foto("02-dasbor-maskot-mengetik-desktop");
  await foto("02a-maskot-mengetik-dekat", { pojok: true });
  const k = Math.floor(Date.now() / 1000) + 7200;
  await evaluasi(`window.__detak({ mengetik: null, nomor: ${toko.id}, dibalas: 1, tDibalas: ${k}, kini: ${k} })`);
  await tidur(400);
  console.log(`  label terkirim: ${await labelMaskot()}`);
  await foto("03-maskot-terkirim-dekat", { pojok: true });
  // Pesan masuk tanpa AI mengetik (spam / dibisukan / ditangani manusia): maskot tetap siaga.
  const k2 = k + 120;
  await evaluasi(`window.__detak({ mengetik: null, masuk: 5, tMasuk: ${k2}, tDibalas: ${k}, kini: ${k2} })`);
  await tidur(400);
  const lblMasuk = await labelMaskot();
  console.log(`  label pesan masuk tanpa mengetik: ${lblMasuk}`);
  assert.doesNotMatch(lblMasuk ?? "", /membalas/i, "pesan masuk saja tidak memunculkan 'sedang membalas'");
  await foto("04-maskot-pesan-masuk-tanpa-mengetik-dekat", { pojok: true });

  await ukuran(390, true);
  await buka("/dashboard");
  await tutupGelembung();
  await evaluasi(`window.__detak({ mengetik: ${toko.id}, nomor: ${toko.id} })`);
  await tidur(400);
  await foto("05-dasbor-maskot-mengetik-hp");
} finally {
  chrome.kill();
  server.kill();
  hermes.close();
  await pg.berhenti().catch(() => {});
}
void tokoSari;
process.exit(0);
