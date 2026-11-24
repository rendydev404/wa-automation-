// Screenshot free trial yang diatur admin: form Aturan pendaftaran (admin), banner "Free trial siap" sebelum scan QR,
// kartu langganan saat trial berjalan, akun yang ditolak karena nomornya sudah pernah trial, dan kotak garansi di landing. Build standalone lokal + PostgreSQL sementara + data contoh (bukan produksi,
// tanpa kredensial asli, tanpa email/WhatsApp keluar).
// Pakai dari akar proyek (setelah `next build`): node --import ./uji/loader.mjs <skrip ini> <folder keluaran>
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const akar = process.cwd();
const keluar = path.resolve(process.argv[2] ?? "screenshot-free-trial");
mkdirSync(keluar, { recursive: true });
const tmp = path.join(os.tmpdir(), "wa-ss-free-trial");
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

// ---------- Data contoh ----------
const PASS = "Rahasia-uji-2026";
for (const [k, v] of [["kuota_percobaan", "50"], ["kuota_percobaan_hari", "3"], ["kuota_percobaan_ulang", "sekali"], ["kuota_percobaan_mulai", "tersambung"], ["kuota_percobaan_per_nomor", "ya"]]) await setSetting(k, v);
const admin = await P.buatAkun({ email: "admin@contoh.test", nama: "Admin", password: PASS, peran: "admin" });
const baru = await P.buatAkun({ email: "baru@contoh.test", nama: "Rina Laundry", password: PASS });
const jalan = await P.buatAkun({ email: "jalan@contoh.test", nama: "Budi Klinik", password: PASS });
const tolak = await P.buatAkun({ email: "tolak@contoh.test", nama: "Sari Katering", password: PASS });
for (const u of [admin, baru, jalan, tolak]) for (const x of ["dashboard", "nomor", "langganan", "admin"]) await P.tandaiTurSelesai(u.id, x).catch(() => {});
const isi = async (u, label, wa) => {
  const n = await tambahNomor(label, u.id);
  await tambahDokumen({ numberId: n.id, judul: "Usaha", sumber: "teks", teks: `${label}. Harga dan jam buka lengkap.` });
  if (wa) await N.catatTerhubung(n.id, wa, null);
  return n;
};
await isi(baru, "Laundry Melati", null);
const nj = await isi(jalan, "Klinik Sehat", "6281234500002");
const kini = sekarang();
for (let i = 0; i < 18; i++) await sql`INSERT INTO ai_pakai(number_id, waktu, penyedia, ms) VALUES (${nj.id}, ${kini - i * 600}, 'hermes', 900)`;
// Nomor Sari pernah dipakai akun lain (mis. daftar ulang): akun lama dihapus, nomornya tetap tercatat.
const lama = await P.buatAkun({ email: "lama@contoh.test", nama: "Lama", password: PASS });
await isi(lama, "Lama", "6281234500003");
await sql`DELETE FROM users WHERE id = ${lama.id}`;
await isi(tolak, "Katering Sari", "6281234500003");
await sql.end({ timeout: 2 });

// ---------- Server lokal ----------
const port = await portBebas();
const dasar = `http://127.0.0.1:${port}`;
const env = { ...process.env, NODE_ENV: "production", PORT: String(port), HOSTNAME: "127.0.0.1", APP_URL: dasar, HERMES_API_URL: "http://127.0.0.1:9", HERMES_API_KEY: "x" };
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
  for (let i = 0; i < 80; i++) {
    if (await evaluasi(`document.body.innerText.includes(${JSON.stringify(teks)})`)) return;
    await tidur(150);
  }
  throw new Error(`teks tidak muncul: ${teks}`);
};
const FIELDSET = `[...document.querySelectorAll("fieldset")].find((f) => f.querySelector("legend")?.textContent.includes("free trial"))`;

try {
  for (const [lebar, hp, akhiran] of [[1440, false, "desktop"], [390, true, "hp"]]) {
    await ukuran(lebar, hp);
    await masuk("admin@contoh.test");
    await buka("/admin/aturan");
    await tungguTeks("Satu free trial per nomor WhatsApp");
    await foto(`01-admin-aturan-trial-${akhiran}`, { pilih: FIELDSET });
    await masuk("baru@contoh.test");
    await buka("/dashboard");
    await tungguTeks("Free trial siap");
    await foto(`02-belum-scan-qr-banner-${akhiran}`);
    await masuk("jalan@contoh.test");
    await buka("/langganan");
    await tungguTeks("Masa percobaan sampai");
    await foto(`03-trial-berjalan-langganan-${akhiran}`);
    await masuk("tolak@contoh.test");
    await buka("/dashboard");
    await tungguTeks("sudah pernah memakai free trial");
    await foto(`04-ditolak-nomor-sudah-trial-${akhiran}`);
    await cdp("Network.clearBrowserCookies");
    await buka("/#harga");
    await tungguTeks("Coba gratis dulu");
    await foto(`05-landing-harga-trial-${akhiran}`, { pilih: `document.getElementById("harga")` });
  }
} finally {
  chrome.kill();
  server.kill();
  await pg.berhenti().catch(() => {});
}
process.exit(0);
