// Screenshot fitur ganti payment gateway: build standalone lokal + PostgreSQL sementara + akun sementara (bukan
// produksi, tanpa kredensial asli). Pakai dari akar proyek: node --import ./uji/loader.mjs <skrip ini> <folder keluaran>
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const akar = process.cwd();
const keluar = path.resolve(process.argv[2] ?? "screenshot-gateway");
mkdirSync(keluar, { recursive: true });
const tmp = path.join(os.tmpdir(), "wa-ss-gateway");
const app = path.join(tmp, "app");
rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
mkdirSync(tmp, { recursive: true });
cpSync(path.join(akar, ".next/standalone"), app, { recursive: true });
cpSync(path.join(akar, ".next/static"), path.join(app, ".next/static"), { recursive: true });
if (existsSync(path.join(akar, "public"))) cpSync(path.join(akar, "public"), path.join(app, "public"), { recursive: true });
for (const f of [".env", ".env.local", ".env.production"]) rmSync(path.join(app, f), { force: true });

const { mulaiPg, portBebas } = await import(pathToFileURL(path.join(akar, "uji/pg-lokal.mjs")).href);
const pg = await mulaiPg({ dir: path.join(tmp, "pg"), sementara: true });
const AUTH_SECRET = "s".repeat(48);
process.env.DATABASE_URL = pg.url;
process.env.DATA_DIR = path.join(tmp, "data");
process.env.AUTH_SECRET = AUTH_SECRET;
const lib = (f) => import(pathToFileURL(path.join(akar, f)).href);
const { db, sekarang } = await lib("src/lib/db.ts");
const P = await lib("src/lib/pengguna.ts");
const L = await lib("src/lib/langganan.ts");
const sql = await db();

const PASS = "Rahasia-uji-2026";
const admin = await P.buatAkun({ email: "admin@contoh.test", nama: "Admin Uji", password: PASS, peran: "admin" });
const user = await P.buatAkun({ email: "budi@contoh.test", nama: "Budi Uji", password: PASS });
for (const u of [admin, user]) for (const t of ["dashboard", "nomor", "admin"]) await P.tandaiTurSelesai(u.id, t);
const bisnis = (await L.daftarPaket()).find((p) => p.kode === "bisnis");
// Tagihan iPaymu Mandiri VA yang masih menunggu (dimasukkan langsung: tanpa memanggil iPaymu) untuk halaman instruksi.
const kini = sekarang();
const orderIpaymu = `WA-${user.id}-${kini}-a1b2c3`;
await sql`INSERT INTO transaksi(order_id, user_id, paket_id, nama_paket, jumlah, status, kanal, bayar, kedaluwarsa, dibuat, gateway, gateway_ref)
          VALUES (${orderIpaymu}, ${user.id}, ${bisnis.id}, ${bisnis.nama}, ${bisnis.harga}, 'menunggu', 'mandiri', ${sql.json({ va: "880800123456" })}, ${kini + 86400}, ${kini}, 'ipaymu', '880001')`;
const starter = (await L.daftarPaket()).find((p) => p.kode === "starter");
const orderDana = `WA-${user.id}-${kini}-d4e5f6`;
await sql`INSERT INTO transaksi(order_id, user_id, paket_id, nama_paket, jumlah, status, kanal, bayar, kedaluwarsa, dibuat, gateway, gateway_ref)
          VALUES (${orderDana}, ${user.id}, ${starter.id}, ${starter.nama}, ${starter.harga}, 'menunggu', 'dana', ${sql.json({ deeplink: "https://m.dana.id/n/cashier/new/checkout?contoh=1" })}, ${kini + 900}, ${kini}, 'ipaymu', '880002')`;
await sql.end({ timeout: 2 });

const port = await portBebas();
const dasar = `http://127.0.0.1:${port}`;
let server = null;
async function mulaiServer(ipaymu) {
  if (server) {
    server.kill();
    await new Promise((r) => server.once("exit", r));
  }
  const env = {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    APP_URL: dasar,
    HERMES_API_URL: "http://127.0.0.1:9",
    HERMES_API_KEY: "x",
    MIDTRANS_SERVER_KEY: "Mid-server-SCREENSHOT-palsu",
    MIDTRANS_MODE: "sandbox",
    IPAYMU_SANDBOX: "1",
  };
  delete env.IPAYMU_VA;
  delete env.IPAYMU_API_KEY;
  // Kunci iPaymu dari env pemanggil (hanya untuk MEMBACA daftar kanal akun; skrip ini tidak membuat tagihan).
  if (ipaymu) Object.assign(env, { IPAYMU_VA: process.env.SS_IPAYMU_VA ?? "0000000000000000", IPAYMU_API_KEY: process.env.SS_IPAYMU_KEY ?? "palsu" });
  if (ipaymu && process.env.SS_IPAYMU_VA) delete env.IPAYMU_SANDBOX;
  server = spawn(process.execPath, ["server.js"], { cwd: app, env, stdio: ["ignore", "pipe", "pipe"] });
  server.stderr.on("data", (b) => process.stderr.write(`[server] ${b}`));
  for (let i = 0; i < 200; i++) {
    try {
      if ((await fetch(`${dasar}/api/health`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("server tidak siap");
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
await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }, { name: "prefers-reduced-motion", value: "reduce" }] });

const evaluasi = async (expr) => (await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result.value;
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
  await tidur(900);
}
async function ukuran(lebar, hp) {
  await cdp("Emulation.setDeviceMetricsOverride", { width: lebar, height: hp ? 844 : 900, deviceScaleFactor: hp ? 2 : 1, mobile: hp });
}
async function foto(nama, { pilih, penuh = false } = {}) {
  await tidur(400);
  let clip;
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
  await cdp("Network.clearBrowserCookies").catch(() => {});
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
    const u = await evaluasi("location.pathname");
    if (u !== "/login") break;
  }
  await tidur(800);
}
const SEKSI_GATEWAY = `[...document.querySelectorAll("section")].find((s) => s.textContent.includes("Payment gateway & metode pembayaran"))`;
const KARTU_METODE = `document.querySelector("main form")?.closest("section") ?? document.querySelector("main section")`;

const simpanMode = async (mode, pesan) => {
  await evaluasi(`document.querySelector('input[name="mode"][value="${mode}"]').click()`);
  await tidur(300);
  await evaluasi(`(${SEKSI_GATEWAY}).querySelector('button[type="submit"]').click()`);
  for (let i = 0; i < 60; i++) {
    await tidur(200);
    if (await evaluasi(`document.body.innerText.includes(${JSON.stringify(pesan)})`)) break;
  }
  await tidur(900);
};

try {
  // 1) iPaymu belum dipasang (.env tanpa IPAYMU_*): hanya "Hanya Midtrans" yang bisa dipilih.
  await mulaiServer(false);
  await ukuran(1440, false);
  await masuk("admin@contoh.test");
  await buka("/admin/transaksi");
  await foto("01-admin-ipaymu-belum-dipasang-desktop", { pilih: SEKSI_GATEWAY });

  // 2) Kedua provider dipasang: mode bawaan Hanya Midtrans.
  await mulaiServer(true);
  await ukuran(1440, false);
  await masuk("admin@contoh.test");
  await buka("/admin/transaksi");
  await foto("02-admin-hanya-midtrans-desktop", { pilih: SEKSI_GATEWAY });
  await ukuran(390, true);
  await buka("/admin/transaksi");
  await foto("02-admin-hanya-midtrans-hp", { pilih: SEKSI_GATEWAY });

  // 3) Admin memilih Hybrid.
  await ukuran(1440, false);
  await buka("/admin/transaksi");
  await simpanMode("hybrid", "Mode hybrid aktif");
  await foto("03-admin-hybrid-desktop", { pilih: SEKSI_GATEWAY });
  await ukuran(390, true);
  await buka("/admin/transaksi");
  await foto("03-admin-hybrid-hp", { pilih: SEKSI_GATEWAY });

  // 4) Pengguna: pilih metode dalam mode hybrid (GoPay dari Midtrans, DANA dari iPaymu); pilih DANA.
  await masuk("budi@contoh.test");
  await ukuran(1440, false);
  await buka(`/langganan/bayar/${starter.id}`);
  await foto("04-pilih-metode-hybrid-desktop", { penuh: true });
  await evaluasi(`[...document.querySelectorAll("main label, main button")].find((e) => e.textContent.includes("DANA") && e.textContent.includes("aplikasi DANA"))?.click()`);
  await tidur(500);
  await foto("04b-pilih-metode-hybrid-dana-dipilih-desktop", { penuh: true });
  await ukuran(390, true);
  await buka(`/langganan/bayar/${starter.id}`);
  await foto("04-pilih-metode-hybrid-hp", { penuh: true });

  // 5) Instruksi tagihan iPaymu: DANA dan Mandiri VA.
  await ukuran(1440, false);
  await buka(`/langganan/tagihan/${orderDana}`);
  await foto("05-tagihan-ipaymu-dana-desktop", { penuh: true });
  await ukuran(390, true);
  await buka(`/langganan/tagihan/${orderDana}`);
  await foto("05-tagihan-ipaymu-dana-hp", { penuh: true });
  await ukuran(1440, false);
  await buka(`/langganan/tagihan/${orderIpaymu}`);
  await foto("06-tagihan-ipaymu-mandiri-va-desktop", { penuh: true });

  // 6) Hanya iPaymu (kanal mengikuti akun iPaymu), lalu kembali ke Hanya Midtrans.
  await masuk("admin@contoh.test");
  await ukuran(1440, false);
  await buka("/admin/transaksi");
  await simpanMode("ipaymu", "Semua tagihan baru sekarang lewat iPaymu");
  await foto("07-admin-hanya-ipaymu-desktop", { pilih: SEKSI_GATEWAY });
  await masuk("budi@contoh.test");
  await ukuran(390, true);
  await buka(`/langganan/bayar/${starter.id}`);
  await foto("07-pilih-metode-hanya-ipaymu-hp", { penuh: true });
  await masuk("admin@contoh.test");
  await ukuran(1440, false);
  await buka("/admin/transaksi");
  await simpanMode("midtrans", "Semua tagihan baru sekarang lewat Midtrans");
  await foto("08-admin-kembali-hanya-midtrans-desktop", { pilih: SEKSI_GATEWAY });
} finally {
  ws.close();
  chrome.kill();
  server?.kill();
  await pg.berhenti();
}
console.log(`selesai -> ${keluar}`);
process.exit(0);
