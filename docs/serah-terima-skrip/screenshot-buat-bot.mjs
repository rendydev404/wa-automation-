// Screenshot bot instan di landing ("Buat bot Anda dalam 60 detik"): keadaan awal, isian contoh, balasan AI + ajakan
// simpan, lalu daftar dan dashboard yang sudah berisi nomor + Informasi Usaha dari demo. Build standalone lokal +
// PostgreSQL sementara; AI = server Hermes TIRUAN di lokal (jawaban kalengan dari data contoh), tanpa AI/WA sungguhan.
// Pakai dari akar proyek (setelah `next build`): node --import ./uji/loader.mjs <skrip ini> <folder keluaran>
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const akar = process.cwd();
const keluar = path.resolve(process.argv[2] ?? "screenshot-buat-bot");
mkdirSync(keluar, { recursive: true });
const tmp = path.join(os.tmpdir(), "wa-ss-buat-bot");
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
const { db, sekarang, setSetting } = await lib("src/lib/db.ts");
const P = await lib("src/lib/pengguna.ts");
const { tambahNomor } = await lib("src/lib/numbers.ts");
const { tambahDokumen } = await lib("src/lib/knowledge.ts");
const N = await lib("src/lib/numbers.ts");
const L = await lib("src/lib/langganan.ts");
const sql = await db();

// ---------- Data contoh & Hermes tiruan ----------
const PASS = "Rahasia-uji-2026";
await sql.end({ timeout: 2 });
const http = await import("node:http");
const hermes = http.createServer((req, res) => {
  let isi = "";
  req.on("data", (c) => (isi += c));
  req.on("end", () => {
    const b = JSON.parse(isi || "{}");
    const tanya = String(b.messages?.at(-1)?.content ?? "").toLowerCase();
    const teks = /harga|price|cost/.test(tanya)
      ? "Halo Kak! Cuci kering setrika Rp8.000/kg (selesai 2 hari), express 1 hari Rp12.000/kg, dan bedcover Rp35.000/pcs. Mau sekalian dijemput Kak? Gratis untuk minimal 5 kg 😊"
      : /jam|buka|open/.test(tanya)
        ? "Kami buka setiap hari jam 07.00-21.00 Kak. Antar-jemput juga tersedia di area Kecamatan Cibeunying ya."
        : "Siap Kak, boleh info nama, perkiraan berat cucian, dan alamat jemputnya? Nanti admin kami konfirmasi di chat ini 🙏";
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content: teks } }], usage: { prompt_tokens: 10 } }));
  });
});
await new Promise((r) => hermes.listen(0, "127.0.0.1", r));
const portHermes = hermes.address().port;

// ---------- Server lokal ----------
const port = await portBebas();
const dasar = `http://127.0.0.1:${port}`;
const env = { ...process.env, NODE_ENV: "production", PORT: String(port), HOSTNAME: "127.0.0.1", APP_URL: dasar, HERMES_API_URL: `http://127.0.0.1:${portHermes}`, HERMES_API_KEY: "x", ANTHROPIC_API_KEY: "" };
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
let kunjungan = 0;
async function buka(jalur) {
  const muat = new Promise((r) => { const f = (m) => { if (m.method === "Page.loadEventFired") { pendengar.splice(pendengar.indexOf(f), 1); r(); } }; pendengar.push(f); });
  const [j, h] = jalur.split("#");
  await cdp("Page.navigate", { url: `${dasar}${j}${j.includes("?") ? "&" : "?"}v=${++kunjungan}${h ? `#${h}` : ""}` });
  await muat;
  await tidur(1400);
}
async function ukuran(lebar, hp) {
  await cdp("Emulation.setDeviceMetricsOverride", { width: lebar, height: hp ? 844 : 900, deviceScaleFactor: hp ? 2 : 1, mobile: hp });
}
async function foto(nama, { pilih, penuh = false } = {}) {
  await tidur(500);
  let clip;
  // Potongan per-elemen: header/tab lengket disembunyikan sementara supaya tidak tergambar di tengah potongan.
  await evaluasi(`(() => { let st = document.getElementById("ss-sembunyi"); if (${!!pilih}) { if (!st) { st = document.createElement("style"); st.id = "ss-sembunyi"; document.head.append(st); } st.textContent = "header, .sticky, [class*='sticky'], .fixed:not([role=dialog]) { visibility: hidden !important; }"; } else if (st) st.remove(); })()`);
  if (pilih) {
    const r = await evaluasi(`(() => { const el = ${pilih}; if (!el) return null; el.scrollIntoView({ block: "start" }); const b = el.getBoundingClientRect(); return { x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height }; })()`);
    if (!r) throw new Error(`elemen tidak ada: ${nama}`);
    clip = { x: Math.max(0, r.x - 12), y: Math.max(0, r.y - 12), width: r.w + 24, height: r.h + 24, scale: 1 };
  }
  const { data } = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: penuh || !!clip, ...(clip ? { clip } : {}) });
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
const tungguTeks = async (teks) => {
  for (let i = 0; i < 100; i++) {
    if (await evaluasi(`document.body.innerText.includes(${JSON.stringify(teks)})`)) return;
    await tidur(150);
  }
  throw new Error(`teks tidak muncul: ${teks}`);
};
const klikTeks = async (teks) =>
  evaluasi(`(() => { const b = [...document.querySelectorAll("button, a")].filter((x) => x.offsetParent !== null).find((x) => x.textContent.trim().includes(${JSON.stringify(teks)})); if (!b) return false; b.click(); return true; })()`);
const BAGIAN = `document.getElementById("buat-bot")`;

try {
  let urut = 0;
  for (const [lebar, hp, akhiran] of [[1440, false, "desktop"], [390, true, "hp"]]) {
    await ukuran(lebar, hp);
    await cdp("Network.enable");
    await cdp("Network.clearBrowserCookies");
    await buka("/");
    await evaluasi(`localStorage.clear()`);
    await buka("/");
    await foto(`01-hero-tombol-buat-bot-${akhiran}`);
    await evaluasi(`${BAGIAN}.scrollIntoView()`);
    await tungguTeks("Isi dengan contoh");
    await foto(`02-awal-${akhiran}`, { pilih: BAGIAN });
    await klikTeks("Laundry");
    await klikTeks("Isi dengan contoh");
    await tidur(300);
    await klikTeks("Coba bot saya");
    await tungguTeks("Anda berperan sebagai pelanggan");
    await foto(`03-isian-contoh-siap-chat-${akhiran}`, { pilih: BAGIAN });
    await klikTeks("harganya berapa");
    await tungguTeks("Bot Anda sudah jadi");
    await evaluasi(`(() => {
      const el = document.querySelector('input[aria-label="Pesan ke bot"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "Buka jam berapa kak?");
      el.dispatchEvent(new Event("input", { bubbles: true }));
      setTimeout(() => el.form.requestSubmit(), 50);
    })()`);
    await tungguTeks("07.00-21.00");
    await tidur(400);
    await foto(`04-balasan-ai-dan-ajakan-simpan-${akhiran}`, { pilih: BAGIAN });
    // Simpan -> daftar -> dashboard: bot dari demo sudah jadi nomor + Informasi Usaha.
    await klikTeks("Simpan & sambungkan WhatsApp");
    await tungguTeks("Daftar");
    await tidur(800);
    await evaluasi(`(() => {
      const isi = (id, v) => { const el = document.getElementById(id); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); };
      isi("nama", "Rina Laundry"); isi("email", "rina${++urut}@contoh.test"); isi("password", ${JSON.stringify(PASS)}); isi("ulang", ${JSON.stringify(PASS)});
      document.querySelector('input[name="setuju"]').click();
      document.querySelector("form").requestSubmit();
    })()`);
    for (let i = 0; i < 80; i++) {
      await tidur(200);
      if (!(await evaluasi("location.pathname")).includes("daftar")) break;
    }
    await buka("/dashboard");
    await tungguTeks("Laundry Melati");
    await foto(`05-setelah-daftar-dashboard-${akhiran}`);
  }
} finally {
  chrome.kill();
  server.kill();
  hermes.close();
  await pg.berhenti().catch(() => {});
}
process.exit(0);
