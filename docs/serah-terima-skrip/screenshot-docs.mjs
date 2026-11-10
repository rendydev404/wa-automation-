// Screenshot dokumentasi Developer API (/docs/api/*): build standalone lokal + PostgreSQL sementara. Halaman publik,
// tanpa login dan tanpa kredensial. Pakai dari akar proyek:
//   SS_DIST=.next-ss-sandbox node --import ./uji/loader.mjs docs/serah-terima-skrip/screenshot-docs.mjs <folder keluaran>
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const akar = process.cwd();
const keluar = path.resolve(process.argv[2] ?? "screenshot-docs");
mkdirSync(keluar, { recursive: true });
const tmp = path.join(os.tmpdir(), "wa-ss-docs");
rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
mkdirSync(tmp, { recursive: true });
const DIST = process.env.SS_DIST || ".next";
const app = path.join(tmp, "app");
cpSync(path.join(akar, DIST, "standalone"), app, { recursive: true });
cpSync(path.join(akar, DIST, "static"), path.join(app, DIST, "static"), { recursive: true });
if (existsSync(path.join(akar, "public"))) cpSync(path.join(akar, "public"), path.join(app, "public"), { recursive: true });
for (const f of [".env", ".env.local", ".env.production"]) rmSync(path.join(app, f), { force: true });

const { mulaiPg, portBebas } = await import(pathToFileURL(path.join(akar, "uji/pg-lokal.mjs")).href);
const pg = await mulaiPg({ dir: path.join(tmp, "pg"), sementara: true });
const port = await portBebas();
const dasarPusat = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["server.js"], {
  cwd: app,
  env: { ...process.env, NODE_ENV: "production", PORT: String(port), HOSTNAME: "127.0.0.1", APP_URL: dasarPusat, DATABASE_URL: pg.url, DATA_DIR: path.join(tmp, "data"), AUTH_SECRET: "s".repeat(48), HERMES_API_URL: "http://127.0.0.1:9", HERMES_API_KEY: "x" },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stderr.on("data", (b) => process.stderr.write(`[server] ${b}`));
for (let i = 0; i < 200; i++) {
  try {
    if ((await fetch(`${dasarPusat}/api/health`)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 150));
}

// ---------- Chrome headless lewat CDP ----------
const portCdp = await portBebas();
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new",
  `--remote-debugging-port=${portCdp}`,
  `--user-data-dir=${path.join(tmp, "chrome")}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--hide-scrollbars",
  "about:blank",
]);
let ws;
for (let i = 0; i < 100 && !ws; i++) {
  try {
    const daftar = await (await fetch(`http://127.0.0.1:${portCdp}/json/list`)).json();
    const hal = daftar.find((d) => d.type === "page");
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
const cdp = (method, params = {}) =>
  new Promise((ok, gagal) => {
    const id = idBerikut++;
    tunggu.set(id, { ok, gagal });
    ws.send(JSON.stringify({ id, method, params }));
  });
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
await cdp("Page.enable");
await cdp("Runtime.enable");
await cdp("Network.enable");
await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }, { name: "prefers-reduced-motion", value: "reduce" }] });
const evaluasi = async (expr) => (await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result.value;
let dasar = dasarPusat;
async function buka(jalur) {
  const muat = new Promise((r) => {
    const f = (m) => {
      if (m.method === "Page.loadEventFired") {
        pendengar.splice(pendengar.indexOf(f), 1);
        r();
      }
    };
    pendengar.push(f);
  });
  await cdp("Page.navigate", { url: dasar + jalur });
  await muat;
  await tidur(1200);
}
let layarHp = false;
async function ukuran(lebar, hp) {
  layarHp = hp;
  await cdp("Emulation.setDeviceMetricsOverride", { width: lebar, height: hp ? 844 : 900, deviceScaleFactor: hp ? 2 : 1, mobile: hp });
}
async function foto(nama, { pilih, penuh = false } = {}) {
  await tidur(500);
  let clip;
  if (pilih) {
    const r = await evaluasi(`(() => { const el = ${pilih}; if (!el) return null; scrollTo(0, 0); const b = el.getBoundingClientRect(); return { x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height }; })()`);
    if (!r) throw new Error(`elemen tidak ada: ${nama}`);
    clip = { x: Math.max(0, r.x - 12), y: Math.max(0, r.y - 12), width: r.w + 24, height: r.h + 24, scale: 1 };
  }
  // Potret satu elemen: bilah fixed/sticky (header & navigasi bawah HP) disembunyikan sementara supaya tidak ikut
  // tergambar di tengah elemen saat area tangkapan melebihi layar.
  if (clip || (penuh && layarHp)) await evaluasi(`(() => { window.__ssSembunyi = [...document.querySelectorAll("body *")].filter((el) => ["fixed", "sticky"].includes(getComputedStyle(el).position)); for (const el of window.__ssSembunyi) el.style.setProperty("visibility", "hidden", "important"); })()`);
  const { data } = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: penuh || !!clip, ...(clip ? { clip } : {}) });
  if (clip || (penuh && layarHp)) await evaluasi(`(() => { for (const el of window.__ssSembunyi ?? []) el.style.removeProperty("visibility"); })()`);
  writeFileSync(path.join(keluar, `${nama}.png`), Buffer.from(data, "base64"));
  console.log(`  foto ${nama}.png`);
}

try {
  await ukuran(1440, false);
  await buka("/docs/api");
  await foto("01-ikhtisar-desktop", { penuh: true });
  await buka("/docs/api/mulai-cepat");
  await foto("02-mulai-cepat-desktop", { penuh: true });
  await buka("/docs/api/referensi");
  await foto("03-referensi-awal-desktop", { penuh: false });
  await evaluasi(`document.querySelector("#post-pesan button")?.click()`);
  await tidur(400);
  await foto("04-referensi-kirim-pesan-terbuka-desktop", { pilih: `document.getElementById("post-pesan")` });
  await evaluasi(`[...document.querySelectorAll("#post-pesan [role=tab]")].find((b) => b.textContent.includes("SDK"))?.click()`);
  await evaluasi(`[...document.querySelectorAll("[role=radio]")].find((b) => b.textContent === "Production")?.click()`);
  await tidur(300);
  await foto("05-referensi-sdk-production-desktop", { pilih: `document.getElementById("post-pesan")` });
  await evaluasi(`(() => { const i = document.querySelector("input[aria-label]"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, "percakapan"); i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await tidur(400);
  await foto("06-referensi-cari-percakapan-desktop", { penuh: false });
  await buka("/docs/api/webhook");
  await evaluasi(`document.querySelector("#event-nomor-qr button")?.click()`);
  await tidur(300);
  await foto("07-webhook-desktop", { penuh: true });
  await buka("/docs/api/galat");
  await evaluasi(`(() => { const i = document.querySelector("main input"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, "403"); i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await tidur(300);
  await foto("08-galat-cari-403-desktop", { penuh: true });
  await buka("/docs/api/sandbox");
  await foto("09-sandbox-desktop", { penuh: true });
  await buka("/docs/api/lisensi");
  await foto("10-lisensi-desktop", { penuh: true });
  await buka("/docs/api");
  await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "k", code: "KeyK", modifiers: 2, windowsVirtualKeyCode: 75 });
  await tidur(300);
  await evaluasi(`(() => { const i = document.querySelector("[role=dialog] input"); if (!i) return; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, "kirim pesan"); i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await tidur(400);
  await foto("11-cari-ctrl-k-desktop", { penuh: false });

  await ukuran(390, true);
  await buka("/docs/api");
  await foto("12-ikhtisar-hp", { penuh: true });
  await evaluasi(`document.querySelector("aside button[aria-expanded]")?.click()`);
  await tidur(400);
  await foto("13-menu-hp", { penuh: false });
  await buka("/docs/api/referensi");
  await evaluasi(`document.querySelector("#post-pesan button")?.click()`);
  await tidur(400);
  await foto("14-referensi-hp", { pilih: `document.getElementById("post-pesan")` });
  await buka("/docs/api/mulai-cepat");
  await foto("15-mulai-cepat-hp", { penuh: true });
} finally {
  server.kill();
  chrome.kill();
  ws.close();
  await pg.berhenti().catch(() => {});
}
process.exit(0);
