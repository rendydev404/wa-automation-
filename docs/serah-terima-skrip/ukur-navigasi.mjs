// Ukur kecepatan halaman & perpindahan halaman: build standalone lokal + PostgreSQL sementara berisi data seukuran
// produksi (akun, nomor, statistik, percakapan, pemakaian AI, transaksi, log) + Chrome headless lewat CDP dengan latensi
// jaringan tiruan. Bukan database/sesi produksi.
// Pakai dari akar proyek (setelah `npm run build`):
//   node --import ./uji/loader.mjs docs/serah-terima-skrip/ukur-navigasi.mjs <label> [folder-keluaran]
// Hasil: <folder>/ukur-<label>.json + ringkasan di konsol.
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const akar = process.cwd();
const label = process.argv[2] ?? "uji";
const keluar = path.resolve(process.argv[3] ?? path.join(os.tmpdir(), "wa-ukur-hasil"));
mkdirSync(keluar, { recursive: true });
const tmp = path.join(os.tmpdir(), "wa-ukur-navigasi");
const app = path.join(tmp, "app");
rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
mkdirSync(tmp, { recursive: true });
// BUILD=<folder> memakai salinan build lain (berisi .next/standalone, .next/static, public), mis. build sebelum perubahan.
const sumber = path.resolve(process.env.BUILD ?? akar);
cpSync(path.join(sumber, ".next/standalone"), app, { recursive: true });
cpSync(path.join(sumber, ".next/static"), path.join(app, ".next/static"), { recursive: true });
if (existsSync(path.join(sumber, "public"))) cpSync(path.join(sumber, "public"), path.join(app, "public"), { recursive: true });
for (const f of [".env", ".env.local", ".env.production"]) rmSync(path.join(app, f), { force: true });

const { mulaiPg, portBebas } = await import(pathToFileURL(path.join(akar, "uji/pg-lokal.mjs")).href);
const pg = await mulaiPg({ dir: path.join(tmp, "pg"), sementara: true });
const AUTH_SECRET = "u".repeat(48);
process.env.DATABASE_URL = pg.url;
process.env.DATA_DIR = path.join(tmp, "data");
process.env.AUTH_SECRET = AUTH_SECRET;
const lib = (f) => import(pathToFileURL(path.join(akar, f)).href);
const { db, sekarang } = await lib("src/lib/db.ts");
const P = await lib("src/lib/pengguna.ts");
const { createSessionToken } = await lib("src/lib/auth.ts");
const { isiData } = await import(pathToFileURL(path.join(akar, "docs/serah-terima-skrip/data-ukur.mjs")).href);
const sql = await db();

// ---------- data seukuran produksi ----------
const PASS = "Rahasia-uji-2026";
const admin = await P.buatAkun({ email: "admin@contoh.test", nama: "Admin Uji", password: PASS, peran: "admin" });
const dev = await P.buatAkun({ email: "dev@contoh.test", nama: "Developer Uji", password: PASS, peran: "developer" });
await P.tandaiTurSelesai(dev.id, "admin");
const user = await P.buatAkun({ email: "budi@contoh.test", nama: "Budi Uji", password: PASS });
for (const u of [admin, user]) for (const t of ["dashboard", "nomor", "admin"]) await P.tandaiTurSelesai(u.id, t);
const kini = sekarang();
const tSeed = performance.now();
await isiData(sql, { admin, user, kini });
const nomorBudi = (await sql`SELECT id FROM numbers WHERE user_id = ${user.id} ORDER BY id LIMIT 1`)[0].id;
const akunContoh = (await sql`SELECT id FROM users WHERE email = 'akun7@contoh.test'`)[0].id;
console.log(`data contoh siap dalam ${((performance.now() - tSeed) / 1000).toFixed(1)} dtk`);
await sql.end({ timeout: 2 });

const cookieAdmin = `wa_sesi=${await createSessionToken(admin.id, admin.password_hash, admin.sesi_versi)}`;
const cookieDev = `wa_sesi=${await createSessionToken(dev.id, dev.password_hash, dev.sesi_versi)}`;
const cookieUser = `wa_sesi=${await createSessionToken(user.id, user.password_hash, user.sesi_versi)}`;

const port = await portBebas();
const dasar = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["server.js"], {
  cwd: app,
  env: { ...process.env, NODE_ENV: "production", PORT: String(port), HOSTNAME: "127.0.0.1", APP_URL: dasar, HERMES_API_URL: "http://127.0.0.1:9", HERMES_API_KEY: "x", WA_TANPA_SAMBUNG: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stderr.on("data", (b) => process.stderr.write(`[server] ${b}`));
for (let i = 0; ; i++) {
  try {
    if ((await fetch(`${dasar}/api/health`)).ok) break;
  } catch {}
  if (i > 300) throw new Error("server tidak siap");
  await new Promise((r) => setTimeout(r, 100));
}

const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
const hasil = { label, waktu: new Date().toISOString(), ttfb: {}, muat: {}, navigasi: {} };

// ---------- 1) TTFB & total server (tanpa latensi jaringan), 3 pemanasan + 15 ukur ----------
const agent = new http.Agent({ keepAlive: true });
const minta = (jalur, cookie) =>
  new Promise((resolve, reject) => {
    const t = performance.now();
    let ttfb = 0;
    const req = http.request(dasar + jalur, { headers: { cookie: cookie ?? "", "accept-encoding": "gzip" }, agent }, (res) => {
      let n = 0;
      res.once("data", () => (ttfb = performance.now() - t));
      res.on("data", (c) => (n += c.length));
      res.on("end", () => resolve({ status: res.statusCode, ttfb, total: performance.now() - t, bytes: n }));
    });
    req.on("error", reject);
    req.end();
  });
const HAL_PUBLIK = ["/", "/laundry", "/program-afiliasi", "/panduan", "/docs/api", "/login", "/daftar"];
const HAL_USER = ["/dashboard", `/nomor/${nomorBudi}`, "/langganan", "/afiliasi", "/akun", "/notifikasi"];
const HAL_ADMIN = ["/admin", "/admin/pengguna", `/admin/pengguna/${akunContoh}`, "/admin/paket", "/admin/transaksi", "/admin/analitik", "/admin/afiliasi", "/admin/followup", "/admin/pixel", "/admin/ai", "/admin/aturan", "/admin/log"];
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
for (const [daftar, cookie] of process.env.DIAG || process.env.DIAG_NAV || process.env.DIAG_TAB ? [] : [[HAL_PUBLIK, null], [HAL_USER, cookieUser], [HAL_ADMIN, cookieAdmin]]) {
  for (const j of daftar) {
    for (let i = 0; i < 3; i++) await minta(j, cookie);
    const r = [];
    for (let i = 0; i < 15; i++) r.push(await minta(j, cookie));
    hasil.ttfb[j] = { status: r[0].status, ttfbP50: +median(r.map((x) => x.ttfb)).toFixed(1), totalP50: +median(r.map((x) => x.total)).toFixed(1), gzipKB: +(r[0].bytes / 1024).toFixed(1) };
  }
}
console.log("\n== Server (tanpa latensi): TTFB p50 / selesai p50 / HTML gzip ==");
for (const [j, v] of Object.entries(hasil.ttfb)) console.log(`  ${j.padEnd(28)} ${String(v.status)}  ttfb ${String(v.ttfbP50).padStart(6)} ms  selesai ${String(v.totalP50).padStart(6)} ms  ${String(v.gzipKB).padStart(6)} KB`);

// ---------- 2) Chrome headless: muat penuh & perpindahan halaman lewat klik menu ----------
const portCdp = await portBebas();
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new", `--remote-debugging-port=${portCdp}`, `--user-data-dir=${path.join(tmp, "chrome")}`,
  "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "about:blank",
]);
let ws;
for (let i = 0; i < 100 && !ws; i++) {
  try {
    const hal = (await (await fetch(`http://127.0.0.1:${portCdp}/json/list`)).json()).find((d) => d.type === "page");
    if (hal) ws = new WebSocket(hal.webSocketDebuggerUrl);
  } catch {}
  if (!ws) await tidur(150);
}
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let idB = 1;
const tunggu = new Map();
const pendengar = [];
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && tunggu.has(m.id)) {
    const { ok, gagal } = tunggu.get(m.id);
    tunggu.delete(m.id);
    if (m.error) gagal(new Error(m.error.message));
    else ok(m.result);
  } else if (m.method) for (const f of pendengar) f(m);
});
const cdp = (method, params = {}) => new Promise((ok, gagal) => { const id = idB++; tunggu.set(id, { ok, gagal }); ws.send(JSON.stringify({ id, method, params })); });
const evaluasi = async (expr) => (await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result.value;

// Catatan jaringan: tiap permintaan (jenis, byte terkirim).
const req = new Map();
let catatan = [];
pendengar.push((m) => {
  if (m.method === "Network.requestWillBeSent") req.set(m.params.requestId, { url: m.params.request.url, jenis: m.params.type, t: m.params.timestamp });
  if (m.method === "Network.responseReceived" && req.has(m.params.requestId)) {
    const r = req.get(m.params.requestId), w = m.params.response.timing;
    r.jenis = m.params.type;
    // Waktu tunggu server (kirim selesai -> header diterima) dikurangi latensi tiruan.
    if (w) r.srv = Math.max(0, Math.round(w.receiveHeadersEnd - w.sendEnd - JARINGAN.latency));
  }
  if (m.method === "Network.loadingFinished" && req.has(m.params.requestId)) catatan.push({ ...req.get(m.params.requestId), bytes: m.params.encodedDataLength, akhir: m.params.timestamp });
});
await cdp("Page.enable");
await cdp("Runtime.enable");
await cdp("Network.enable");
await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
// Jaringan tiruan seperti pengguna di Indonesia ke VPS: RTT 100 ms, 10 Mbps turun / 5 Mbps naik.
const JARINGAN = { offline: false, latency: 100, downloadThroughput: (10 * 1024 * 1024) / 8, uploadThroughput: (5 * 1024 * 1024) / 8 };
await cdp("Network.emulateNetworkConditions", JARINGAN);

async function pasangCookie(cookie) {
  await cdp("Network.clearBrowserCookies");
  const [nama, nilai] = cookie.split(/=(.*)/s);
  await cdp("Network.setCookie", { name: nama, value: nilai, url: dasar, httpOnly: true });
}
async function muat(jalur) {
  await cdp("Network.clearBrowserCache");
  catatan = [];
  const selesai = new Promise((r) => { const f = (m) => { if (m.method === "Page.loadEventFired") { pendengar.splice(pendengar.indexOf(f), 1); r(); } }; pendengar.push(f); });
  const t0 = performance.now();
  await cdp("Page.navigate", { url: dasar + jalur });
  await selesai;
  const load = performance.now() - t0;
  await tidur(1500); // prefetch tautan yang terlihat & data susulan
  const m = await evaluasi(`(() => { const n = performance.getEntriesByType("navigation")[0]; const fcp = performance.getEntriesByName("first-contentful-paint")[0]; return { ttfb: n.responseStart, fcp: fcp ? fcp.startTime : null, dcl: n.domContentLoadedEventEnd }; })()`);
  const js = catatan.filter((c) => c.jenis === "Script");
  const awal = catatan.filter((c) => c.t <= catatan[0]?.t + load / 1000);
  return {
    ttfb: Math.round(m.ttfb), fcp: m.fcp && Math.round(m.fcp), load: Math.round(load),
    permintaan: catatan.length, permintaanAwal: awal.length,
    jsKB: +(js.reduce((a, c) => a + c.bytes, 0) / 1024).toFixed(1), jsBerkas: js.length,
    totalKB: +(catatan.reduce((a, c) => a + c.bytes, 0) / 1024).toFixed(1),
    prefetch: catatan.filter((c) => c.jenis === "Fetch" || c.jenis === "XHR").length,
  };
}

// Klik tautan menu lalu catat: kapan URL & tampilan berganti (kerangka/static shell muncul) dan kapan semua kerangka
// berdenyut (animate-denyut) di <main> hilang (data lengkap).
const UKUR_KLIK = `(href, niatMs = 0) => new Promise(async (res) => {
  const a = [...document.querySelectorAll('a[href="' + href + '"]')].find((x) => x.offsetParent !== null);
  if (!a) return res({ galat: "tautan tidak ada: " + href });
  const main = document.querySelector("main");
  const lama = main ? main.innerHTML.length + ":" + (main.querySelector("h1")?.textContent ?? "") : "";
  let tampil = null;
  const cek = (t0) => {
    const now = performance.now() - t0;
    const m = document.querySelector("main");
    const kini = m ? m.innerHTML.length + ":" + (m.querySelector("h1")?.textContent ?? "") : "";
    if (tampil === null && location.pathname === href && kini !== lama) tampil = now;
    if (tampil !== null && !m.querySelector(".animate-denyut")) return res({ tampil: Math.round(tampil), lengkap: Math.round(now) });
    if (now > 20000) return res({ tampil, lengkap: null, galat: "batas waktu" });
    requestAnimationFrame(() => cek(t0));
  };
  if (niatMs) {
    // Kursor mendekat dulu (seperti pengguna sungguhan), baru klik.
    for (const jenis of ["pointerover", "pointerenter", "mouseover", "mouseenter"]) a.dispatchEvent(new (jenis.startsWith("pointer") ? PointerEvent : MouseEvent)(jenis, { bubbles: !jenis.endsWith("enter") }));
    await new Promise((r) => setTimeout(r, niatMs));
  }
  const t1 = performance.now();
  a.click();
  const cek2 = () => cek(t1);
  requestAnimationFrame(cek2);
})`;
async function rangkaian(nama, cookie, mulai, urutan, jeda = 1200, putaranN = [1, 2]) {
  await pasangCookie(cookie);
  await cdp("Network.clearBrowserCache");
  await muat(mulai);
  const baris = [];
  for (const putaran of putaranN) {
    for (const href of urutan) {
      catatan = [];
      const r = await evaluasi(`(${UKUR_KLIK})(${JSON.stringify(href)})`);
      await tidur(jeda); // 1200 = pengguna santai (prefetch sempat jalan); 300 = pengguna mengeklik menu beruntun
      const rsc = catatan.filter((c) => c.jenis === "Fetch" && c.srv !== undefined);
      baris.push({ putaran, href, ...r, permintaan: catatan.length, kb: +(catatan.reduce((a, c) => a + c.bytes, 0) / 1024).toFixed(1), srvTotal: rsc.reduce((a, c) => a + c.srv, 0) });
    }
  }
  hasil.navigasi[nama] = baris;
}

// DIAG_TAB=1 -> waktu pindah tab: tab halaman nomor (di klien) dan tab panel Developer API (lewat URL ?tab=).
if (process.env.DIAG_TAB) {
  await cdp("Page.addScriptToEvaluateOnNewDocument", {
    source: `window.__lt=[];new PerformanceObserver((l)=>{for(const e of l.getEntries())window.__lt.push([Math.round(e.startTime),Math.round(e.duration)])}).observe({type:"longtask",buffered:true});`,
  });
  const UKUR_TAB = `(sel) => new Promise((res) => {
    const b = document.querySelector(sel);
    if (!b) return res({ galat: "tidak ada " + sel });
    const lt0 = window.__lt.length;
    const t0 = performance.now();
    b.click();
    const id = b.getAttribute("aria-controls");
    const cek = () => {
      const p = document.getElementById(id);
      if (p && !p.hidden) requestAnimationFrame(() => setTimeout(() => res({ tampil: Math.round(performance.now() - t0), longTask: window.__lt.slice(lt0).reduce((a, x) => a + x[1], 0) })));
      else requestAnimationFrame(cek);
    };
    cek();
  })`;
  // Tautan yang hanya mengganti parameter URL (saring/tab/halaman) di halaman yang sama, plus satu lintas halaman.
  const UKUR_PARAM = (href) => `new Promise((res) => {
    const a = [...document.querySelectorAll('main a[href="${href}"]')].find((x) => x.offsetParent !== null);
    if (!a) return res({ galat: "tidak ada tautan" });
    const t0 = performance.now(); let tampil = null;
    a.click();
    const cek = () => {
      const now = performance.now() - t0;
      const b = [...document.querySelectorAll('main a[href="${href}"]')].find((x) => x.offsetParent !== null);
      const sampai = location.pathname + location.search === "${href}";
      if (tampil === null && sampai && (!b || b.getAttribute("aria-current") === "page" || !document.querySelector('main [aria-current="page"]'))) tampil = now;
      if (tampil !== null && !document.querySelector("main .animate-denyut")) return res({ tampil: Math.round(tampil), lengkap: Math.round(now) });
      if (now > 8000) return res({ tampil, galat: "TIDAK BERGANTI dalam 8 dtk (url " + location.pathname + location.search + ")" });
      requestAnimationFrame(cek);
    };
    requestAnimationFrame(cek);
  })`;
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp("Emulation.setCPUThrottlingRate", { rate: 1 });
  for (const [cookie, hal, href] of [
    [cookieAdmin, "/admin/pengguna", "/admin/pengguna?f=aktif"],
    [cookieAdmin, "/admin/transaksi", "/admin/transaksi?s=lunas"],
    [cookieAdmin, "/admin/followup", "/admin/followup?status=antre"],
    [cookieAdmin, `/admin/pengguna/${akunContoh}`, `/admin/transaksi?q=${akunContoh}`],
    [cookieDev, "/admin/developer-api", "/admin/developer-api?tab=fitur"],
  ]) {
    await pasangCookie(cookie);
    await muat(hal);
    catatan = [];
    const r = await evaluasi(UKUR_PARAM(href));
    await tidur(300);
    console.log(`param ${hal} -> ${href}: tampil ${r.tampil} lengkap ${r.lengkap} | ${catatan.length} req ${r.galat ?? ""}`);
  }
  for (const lebar of (process.env.LEBAR ?? "1440,390").split(",").map(Number)) {
    await cdp("Emulation.setDeviceMetricsOverride", { width: lebar, height: lebar > 500 ? 900 : 844, deviceScaleFactor: lebar > 500 ? 1 : 2, mobile: lebar < 500 });
    // HP: CPU 4x lebih lambat (setara HP kelas menengah).
    await cdp("Emulation.setCPUThrottlingRate", { rate: lebar < 500 ? 4 : 1 });
    await pasangCookie(cookieUser);
    await muat(`/nomor/${nomorBudi}`);
    for (const putaran of [1, 2])
      for (const t of ["knowledge", "uji-bot", "percakapan", "katalog", "pengaturan", "koneksi"]) {
        const r = await evaluasi(`(${UKUR_TAB})('#tab-${t}')`);
        console.log(`[${lebar}px] nomor tab ${t.padEnd(11)} #${putaran}: ${r.tampil} ms (long task ${r.longTask} ms) ${r.galat ?? ""}`);
        await tidur(300);
      }
    await pasangCookie(cookieDev);
    await muat("/admin/developer-api");
    for (const putaran of [1, 2])
      for (const t of ["sandbox", "fitur", "akses", "pengaturan", "aplikasi"]) {
        const href = t === "aplikasi" ? "/admin/developer-api" : `/admin/developer-api?tab=${t}`;
        catatan = [];
        const r = await evaluasi(`new Promise((res) => {
          const a = [...document.querySelectorAll('a[href="${href}"]')].find((x) => x.offsetParent !== null);
          if (!a) return res({ galat: "tidak ada tab ${t}" });
          const t0 = performance.now(); let tampil = null;
          a.click();
          const cek = () => {
            const now = performance.now() - t0;
            const aktif = document.querySelector('nav[aria-label="Bagian Developer API"] a[aria-current="page"]');
            if (tampil === null && aktif && aktif.getAttribute("href") === "${href}") tampil = now;
            if (tampil !== null && !document.querySelector("main .animate-denyut")) return res({ tampil: Math.round(tampil), lengkap: Math.round(now) });
            if (now > 15000) return res({ tampil, galat: "batas waktu " + location.search + " " + JSON.stringify([...document.querySelectorAll('nav[aria-label="Bagian Developer API"] a')].map((x) => x.getAttribute("href") + ":" + x.getAttribute("aria-current"))) + " denyut=" + document.querySelectorAll("main .animate-denyut").length + " " + (document.querySelector("main h1, main h2")?.textContent ?? "") });
            requestAnimationFrame(cek);
          };
          requestAnimationFrame(cek);
        })`);
        await tidur(500);
        console.log(`[${lebar}px] developer-api tab ${t.padEnd(10)} #${putaran}: tab aktif ${r.tampil} ms, isi lengkap ${r.lengkap} ms | ${catatan.length} req, server ${catatan.filter((c) => c.jenis === "Fetch").reduce((a, c) => a + (c.srv ?? 0), 0)} ms ${r.galat ?? ""}`);
      }
  }
  ws.close();
  chrome.kill();
  server.kill();
  await pg.berhenti?.().catch(() => {});
  process.exit(0);
}

// DIAG_NAV=/dashboard>/langganan,/admin>/admin/pengguna -> rincian permintaan selama perpindahan halaman.
if (process.env.DIAG_NAV) {
  for (const pasangan of process.env.DIAG_NAV.split(",")) {
    const [dari, ke] = pasangan.split(">").map((x) => x.replace("%ID%", nomorBudi));
    await pasangCookie(dari.startsWith("/admin") ? cookieAdmin : cookieUser);
    for (let i = 0; i < 2; i++) {
      await muat(dari);
      catatan = [];
      const tKlik = (await cdp("Runtime.evaluate", { expression: "0" }), Date.now());
      const r = await evaluasi(`(${UKUR_KLIK})(${JSON.stringify(ke)})`);
      await tidur(600);
      console.log(`${dari} -> ${ke} #${i + 1}: tampil ${r.tampil} lengkap ${r.lengkap} ms`);
      const t0 = Math.min(...catatan.map((c) => c.t));
      for (const c of [...catatan].sort((a, b) => a.t - b.t))
        console.log(`   +${Math.round((c.t - t0) * 1000).toString().padStart(5)}..${Math.round((c.akhir - t0) * 1000).toString().padStart(5)} ms srv ${String(c.srv ?? "-").padStart(4)} ${c.jenis.padEnd(10)} ${(c.bytes / 1024).toFixed(1).padStart(6)} KB ${c.url.replace(dasar, "").slice(0, 100)}`);
      void tKlik;
    }
  }
  ws.close();
  chrome.kill();
  server.kill();
  await pg.berhenti?.().catch(() => {});
  process.exit(0);
}

// DIAG=/nomor/1,/dashboard -> hanya muat jalur itu 3x dan cetak rincian (long task, permintaan terbesar).
if (process.env.DIAG) {
  await cdp("Page.addScriptToEvaluateOnNewDocument", {
    source: `window.__lt=[];new PerformanceObserver((l)=>{for(const e of l.getEntries())window.__lt.push([Math.round(e.startTime),Math.round(e.duration)])}).observe({type:"longtask",buffered:true});`,
  });
  for (const j of process.env.DIAG.split(",")) {
    const jalur = j.replace("%ID%", nomorBudi);
    if (HAL_PUBLIK.includes(jalur)) await cdp("Network.clearBrowserCookies");
    else await pasangCookie(jalur.startsWith("/admin") ? cookieAdmin : cookieUser);
    for (let i = 0; i < 3; i++) {
      const v = await muat(jalur);
      const lt = await evaluasi("window.__lt");
      console.log(`${jalur} #${i + 1} ttfb ${v.ttfb} fcp ${v.fcp} load ${v.load} | req ${v.permintaan} prefetch ${v.prefetch} JS ${v.jsKB} KB | long task ${lt.length} total ${lt.reduce((a, x) => a + x[1], 0)} ms ${JSON.stringify(lt.slice(0, 8))}`);
      if (i === 2)
        for (const c of [...catatan].sort((a, b) => a.t - b.t).slice(0, 40))
          console.log(`   +${Math.round((c.t - catatan[0].t) * 1000).toString().padStart(5)} ms srv ${String(c.srv ?? "-").padStart(4)} ${c.jenis.padEnd(10)} ${(c.bytes / 1024).toFixed(1).padStart(6)} KB ${c.url.replace(dasar, "").slice(0, 110)}`);
    }
  }
  ws.close();
  chrome.kill();
  server.kill();
  await pg.berhenti?.().catch(() => {});
  process.exit(0);
}

try {
  console.log("\n== Chrome (RTT 100 ms, 10 Mbps): muat penuh tanpa cache ==");
  for (const [daftar, cookie] of [[HAL_PUBLIK, null], [HAL_USER, cookieUser], [HAL_ADMIN, cookieAdmin]]) {
    if (cookie) await pasangCookie(cookie);
    else await cdp("Network.clearBrowserCookies");
    for (const j of daftar) {
      hasil.muat[j] = await muat(j);
      const v = hasil.muat[j];
      console.log(`  ${j.padEnd(28)} ttfb ${String(v.ttfb).padStart(5)}  fcp ${String(v.fcp).padStart(5)}  load ${String(v.load).padStart(5)} ms | ${String(v.permintaan).padStart(3)} req (prefetch ${v.prefetch}) | JS ${String(v.jsKB).padStart(6)} KB/${v.jsBerkas} berkas | total ${v.totalKB} KB`);
    }
  }
  await rangkaian("pengguna", cookieUser, "/dashboard", [`/nomor/${nomorBudi}`, "/langganan", "/akun", "/afiliasi", "/dashboard"]);
  const MENU_ADMIN = ["/admin/pengguna", "/admin/paket", "/admin/transaksi", "/admin/analitik", "/admin/afiliasi", "/admin/followup", "/admin/pixel", "/admin/ai", "/admin/aturan", "/admin/log", "/admin"];
  await rangkaian("admin", cookieAdmin, "/admin", MENU_ADMIN);
  // Pengguna mengeklik menu beruntun (300 ms setelah halaman sebelumnya lengkap): prefetch halaman baru belum selesai.
  await rangkaian("pengguna-cepat", cookieUser, "/dashboard", [`/nomor/${nomorBudi}`, "/langganan", "/akun", "/afiliasi", "/dashboard"], 300, [1]);
  await rangkaian("admin-cepat", cookieAdmin, "/admin", MENU_ADMIN, 300, [1]);
  // Klik baris tabel admin: dengan niat (kursor di atas tautan 150 ms) dan tanpa niat (langsung klik).
  {
    await pasangCookie(cookieAdmin);
    const baris = [];
    for (const [hal, awalan] of [["/admin/pengguna", "/admin/pengguna/"], ["/admin/transaksi", "/admin/transaksi/"]]) {
      for (const niat of [150, 0]) {
        await muat(hal);
        const href = await evaluasi(`[...document.querySelectorAll('main a[href^="${awalan}"]')].filter((x) => x.offsetParent !== null)[${niat ? 2 : 5}]?.getAttribute("href")`);
        catatan = [];
        const r = await evaluasi(`(${UKUR_KLIK})(${JSON.stringify(href)}, ${niat})`);
        await tidur(800);
        baris.push({ putaran: niat ? "niat" : "langsung", href, ...r, permintaan: catatan.length, kb: +(catatan.reduce((a, c) => a + c.bytes, 0) / 1024).toFixed(1), srvTotal: catatan.filter((c) => c.jenis === "Fetch").reduce((a, c) => a + (c.srv ?? 0), 0) });
      }
    }
    hasil.navigasi["baris-admin"] = baris;
  }
  console.log("\n== Perpindahan halaman (klik menu; tampil = halaman baru/kerangka muncul, lengkap = data selesai) ==");
  for (const [nama, baris] of Object.entries(hasil.navigasi)) {
    console.log(` [${nama}]`);
    for (const b of baris) console.log(`  #${b.putaran} ${b.href.padEnd(22)} tampil ${String(b.tampil).padStart(5)} ms  lengkap ${String(b.lengkap).padStart(5)} ms  | ${b.permintaan} req ${b.kb} KB, server ${b.srvTotal} ms ${b.galat ?? ""}`);
  }
  writeFileSync(path.join(keluar, `ukur-${label}.json`), JSON.stringify(hasil, null, 2));
  console.log(`\nhasil: ${path.join(keluar, `ukur-${label}.json`)}`);
} finally {
  ws.close();
  chrome.kill();
  server.kill();
  await pg.berhenti?.().catch(() => {});
  await tidur(500);
  process.exit(0);
}
