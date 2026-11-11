// Screenshot mode sandbox Developer API: build standalone lokal (dibangun dengan LISENSI_MODE_UJI=1, hanya untuk uji
// lokal) + PostgreSQL sementara + akun sementara. Dua proses: PUSAT (portal, panel, docs) dan MESIN sandbox yang
// benar-benar aktivasi ke pusat itu lewat key cg_test_. Tanpa database/sesi produksi, tanpa kredensial asli.
// Pakai dari akar proyek: node --import ./uji/loader.mjs docs/serah-terima-skrip/screenshot-fitur-pengguna.mjs <folder keluaran>
import { spawn } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const akar = process.cwd();
const keluar = path.resolve(process.argv[2] ?? "screenshot-fitur-pengguna");
mkdirSync(keluar, { recursive: true });
const tmp = path.join(os.tmpdir(), "wa-ss-sandbox");
rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
mkdirSync(tmp, { recursive: true });
// Folder build (bawaan .next). SS_DIST=.next-ss-sandbox bila build dibuat terpisah (NEXT_DIST_DIR) supaya tidak bentrok.
const DIST = process.env.SS_DIST || ".next";
function salinApp(nama) {
  const app = path.join(tmp, nama);
  cpSync(path.join(akar, DIST, "standalone"), app, { recursive: true });
  cpSync(path.join(akar, DIST, "static"), path.join(app, DIST, "static"), { recursive: true });
  if (existsSync(path.join(akar, "public"))) cpSync(path.join(akar, "public"), path.join(app, "public"), { recursive: true });
  for (const f of [".env", ".env.local", ".env.production"]) rmSync(path.join(app, f), { force: true });
  return app;
}
const appPusat = salinApp("pusat");
const appMesin = salinApp("mesin");

const { mulaiPg, portBebas } = await import(pathToFileURL(path.join(akar, "uji/pg-lokal.mjs")).href);
const pg = await mulaiPg({ dir: path.join(tmp, "pg"), sementara: true });
const kunci = generateKeyPairSync("ed25519");
const PRIV = kunci.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
const PUB = kunci.publicKey.export({ format: "der", type: "spki" }).toString("base64");
const AUTH_SECRET = "s".repeat(48);
Object.assign(process.env, { DATABASE_URL: pg.url, DATA_DIR: path.join(tmp, "data"), AUTH_SECRET, LISENSI_KUNCI_PRIVAT: PRIV });
const lib = (f) => import(pathToFileURL(path.join(akar, f)).href);
const { db, sekarang } = await lib("src/lib/db.ts");
const P = await lib("src/lib/pengguna.ts");
const D = await lib("src/lib/developer-api.ts");
const sql = await db();
// Mesin = database terpisah milik pemilik mesin: instance PostgreSQL sementara kedua.
const pgMesin = await mulaiPg({ dir: path.join(tmp, "pg-mesin"), sementara: true });
const urlMesin = pgMesin.url;

// ---------- data contoh pusat ----------
const PASS = "Rahasia-uji-2026";
const kini = sekarang();
const akun = async (email, nama, peran, akses = true) => {
  const u = await P.buatAkun({ email, nama, password: PASS, ...(peran ? { peran } : {}) });
  for (const t of ["dashboard", "nomor", "admin", "developer"]) await P.tandaiTurSelesai(u.id, t).catch(() => {});
  if (akses) await sql`UPDATE users SET akses_api = true WHERE id = ${u.id}`;
  return { id: u.id, email, nama, peran: peran ?? "user" };
};
const dev = await akun("dev@contoh.test", "Dev Internal", "developer", false);
const budi = await akun("budi@contoh.test", "Budi Kasir");
const sari = await akun("sari@contoh.test", "Sari Laundry");
const rina = await akun("rina@contoh.test", "Rina Klinik");
const tono = await akun("tono@contoh.test", "Tono Travel");
// Sari: sandbox aktif, nomor uji terverifikasi (kunci dipakai mesin sandbox di bawah).
const sbSari = await D.buatSandbox(sari);
await sql`UPDATE api_aplikasi SET uji_telepon = '6281234567890', uji_alamat = '6281234567890@s.whatsapp.net', uji_diverifikasi = ${kini - 3600} WHERE id = ${sbSari.id}`;
// Rina: sandbox kedaluwarsa. Tono: ditangguhkan.
const sbRina = await D.buatSandbox(rina);
await sql`UPDATE api_aplikasi SET sandbox_sampai = ${kini - 86400} WHERE id = ${sbRina.id}`;
const sbTono = await D.buatSandbox(tono);
await D.ubahStatus(dev, sbTono.id, "tangguhkan", "Dipakai di luar testing");
// Pengajuan production menunggu (form setujui menampilkan isian "Balasan AI per hari").
process.env.LISENSI_IZINKAN_HTTP = "1";
const prodId = await D.ajukan(rina, {
  nama: "KlinikKu",
  kegunaan: "Pengingat jadwal kontrol pasien dan jawaban otomatis pertanyaan klinik lewat WhatsApp.",
  situs: "klinikku.id",
  pemilik: "PT Klinik Sehat",
  kontak_wa: "081298765432",
  perkiraan_nomor: "5",
  alamat_mesin: "klinikku.id",
  fitur: ["nomor", "pesan.kirim", "ai"],
  setuju: true,
});
await sql.end({ timeout: 2 });

// ---------- server ----------
const portPusat = await portBebas();
const portMesin = await portBebas();
const dasarPusat = `http://127.0.0.1:${portPusat}`;
const dasarMesin = `http://127.0.0.1:${portMesin}`;
const proses = [];
async function nyalakan(app, port, envTambah) {
  const env = { ...process.env, NODE_ENV: "production", PORT: String(port), HOSTNAME: "127.0.0.1", APP_URL: `http://127.0.0.1:${port}`, HERMES_API_URL: "http://127.0.0.1:9", HERMES_API_KEY: "x", ...envTambah };
  const p = spawn(process.execPath, ["server.js"], { cwd: app, env, stdio: ["ignore", "pipe", "pipe"] });
  p.stderr.on("data", (b) => process.stderr.write(`[${port}] ${b}`));
  p.stdout.on("data", (b) => /mesin|lisensi/.test(String(b)) && process.stdout.write(`[${port}] ${b}`));
  proses.push(p);
  for (let i = 0; i < 200; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`server ${port} tidak siap`);
}
await nyalakan(appPusat, portPusat, { LISENSI_KUNCI_PRIVAT: PRIV });
const envMesin = {
  MODE: "mesin",
  DATABASE_URL: urlMesin,
  DATA_DIR: path.join(tmp, "data-mesin"),
  CHATGERCEP_KEY: sbSari.key,
  CHATGERCEP_PUSAT: dasarPusat,
  LISENSI_MODE_UJI: "1",
  LISENSI_KUNCI_PUBLIK: PUB,
  LISENSI_KUNCI_PRIVAT: "",
  ADMIN_EMAIL: "pemilik@mesin.test",
  ADMIN_PASSWORD: PASS,
  RAHASIA_MESIN: "r".repeat(48),
  AI_PENYEDIA: "openai",
  AI_API_URL: "http://127.0.0.1:9/v1",
  AI_API_KEY: "x",
  AI_MODEL: "model-uji",
};
await nyalakan(appMesin, portMesin, envMesin);

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
async function masuk(email) {
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
const klikTeks = (teks, sel = "button") => evaluasi(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => x.textContent.includes(${JSON.stringify(teks)})); if (!b) return false; b.click(); return true; })()`);
async function tungguTeks(teks, ms = 8000) {
  for (let t = 0; t < ms; t += 200) {
    if (await evaluasi(`document.body.innerText.includes(${JSON.stringify(teks)})`)) return;
    await tidur(200);
  }
  throw new Error(`teks tidak muncul: ${teks}`);
}
const KARTU = `document.getElementById("sandbox")`;


try {
  // Siapkan satu sandbox lewat portal (akun budi).
  await ukuran(1440, false);
  await masuk("budi@contoh.test");
  await buka("/developer");
  await klikTeks("Buat key sandbox");
  await tungguTeks("hanya tampil sekali");

  // ===== Panel developer internal =====
  await masuk("dev@contoh.test");
  // Tab Fitur: grup Bot AI dengan 3 fitur baru yang berdiri sendiri.
  await buka("/admin/developer-api?tab=fitur");
  const GRUP_AI = `[...document.querySelectorAll("main section, main div")].find((el) => el.querySelector("h3,h2,p")?.textContent.trim().startsWith("Bot AI") && el.querySelectorAll("input[type=checkbox]").length >= 6)`;
  await foto("01-fitur-grup-bot-ai-desktop", { pilih: GRUP_AI });
  // Tab Sandbox: baris dibuka -> form "Fitur untuk pengguna ini" (bawaan ikut global).
  await buka("/admin/developer-api?tab=sandbox");
  await evaluasi(`document.querySelector("main details summary")?.click()`);
  await tidur(500);
  await foto("02-sandbox-baris-dibuka-ikut-global-desktop", { pilih: `document.querySelector("main details")` });
  // Atur khusus: daftar centang per grup.
  await klikTeks("Atur khusus");
  await tidur(400);
  await foto("03-sandbox-atur-khusus-desktop", { pilih: `document.querySelector("main details")` });
  // Simpan pilihan khusus (hilangkan dua centang) -> pesan berhasil.
  await evaluasi(`(() => { const cb = [...document.querySelectorAll("main details input[type=checkbox]")]; cb.slice(-2).forEach((c) => c.click()); })()`);
  await tidur(300);
  await klikTeks("Simpan fitur pengguna");
  await tungguTeks("Fitur khusus sandbox ini disimpan");
  await tidur(600);
  await foto("04-sandbox-atur-khusus-tersimpan-desktop", { pilih: `document.querySelector("main details")` });
  // HP
  await ukuran(390, true);
  await buka("/admin/developer-api?tab=sandbox");
  await evaluasi(`document.querySelector("main details summary")?.click()`);
  await tidur(500);
  await foto("05-sandbox-atur-khusus-hp", { pilih: `document.querySelector("main details")` });
  await buka("/admin/developer-api?tab=fitur");
  await foto("06-fitur-grup-bot-ai-hp", { pilih: GRUP_AI });
} finally {
  for (const p of proses) p.kill();
  chrome.kill();
  ws.close();
  await pg.berhenti().catch(() => {});
  await pgMesin.berhenti().catch(() => {});
}
process.exit(0);
