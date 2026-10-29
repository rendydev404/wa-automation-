// Uji server hasil `npm run build` (output standalone, persis yang dikirim ke VPS) lewat HTTP:
// PostgreSQL sementara + berkas SQLite lama di DATA_DIR -> impor otomatis saat server mulai ->
// endpoint diukur -> QR sungguhan dari WhatsApp (koneksi keluar; tidak ada nomor yang dipasangkan).
// Pakai (dari akar proyek, setelah `npm run build`): node --import ./uji/loader.mjs uji/uji-next.mjs
import assert from "node:assert/strict";
import { execSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { mulaiPg, portBebas } from "./pg-lokal.mjs";

const akar = process.cwd();
const tmp = path.join(os.tmpdir(), "wa-uji-next");
const app = path.join(tmp, "app");
const dataDir = path.join(tmp, "data");
// ULANG=1: pakai lagi salinan app dari putaran sebelumnya (berkasnya sudah pernah dibaca sistem operasi).
const ulang = !!process.env.ULANG && existsSync(path.join(app, "server.js"));
if (!ulang) rmSync(tmp, { recursive: true, force: true });
rmSync(dataDir, { recursive: true, force: true });
rmSync(path.join(tmp, "pg"), { recursive: true, force: true });
mkdirSync(dataDir, { recursive: true });
const lib = (f) => import(pathToFileURL(path.join(akar, f)).href);
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
const kini = Math.floor(Date.now() / 1000);

assert.ok(existsSync(path.join(akar, ".next/standalone/server.js")), "jalankan `npm run build` dulu");
if (!ulang) {
  cpSync(path.join(akar, ".next/standalone"), app, { recursive: true });
  cpSync(path.join(akar, ".next/static"), path.join(app, ".next/static"), { recursive: true });
  // public/ boleh tidak ada (folder kosong tidak ikut ke git)
  if (existsSync(path.join(akar, "public"))) cpSync(path.join(akar, "public"), path.join(app, "public"), { recursive: true });
}
rmSync(path.join(app, "node_modules/@img"), { recursive: true, force: true }); // seperti deploy.sh
for (const f of [".env", ".env.local", ".env.production"]) rmSync(path.join(app, f), { force: true });

// ---------- database lama (SQLite v4, seperti produksi saat ini): 1 admin, 12 nomor, knowledge ----------
const AUTH_SECRET = randomBytes(32).toString("hex");
process.env.AUTH_SECRET = AUTH_SECRET;
const { hashPassword } = await lib("src/lib/password.ts");
const { createSessionToken } = await lib("src/lib/auth.ts");
const hash = await hashPassword(`Uji-${randomBytes(9).toString("base64url")}`);
{
  const d = new DatabaseSync(path.join(dataDir, "wa.db"));
  d.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE numbers (id INTEGER PRIMARY KEY, sesi TEXT NOT NULL UNIQUE, wa_id TEXT UNIQUE, label TEXT NOT NULL, nama_wa TEXT,
      bot_aktif INTEGER NOT NULL DEFAULT 1, instruksi TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, last_connected_at INTEGER,
      tunggu_detik INTEGER NOT NULL DEFAULT 5, jeda_menit INTEGER NOT NULL DEFAULT 30, tunggu_baca_detik INTEGER NOT NULL DEFAULT 45);
    CREATE TABLE documents (id INTEGER PRIMARY KEY, number_id INTEGER NOT NULL, judul TEXT NOT NULL, sumber TEXT NOT NULL, nama_berkas TEXT,
      ukuran_byte INTEGER NOT NULL DEFAULT 0, jumlah_karakter INTEGER NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE chunks (id INTEGER PRIMARY KEY, document_id INTEGER NOT NULL, number_id INTEGER NOT NULL, urutan INTEGER NOT NULL, isi TEXT NOT NULL);
    CREATE TABLE chat_state (kunci TEXT PRIMARY KEY, sesi_ke INTEGER NOT NULL DEFAULT 1, last_at INTEGER NOT NULL, jeda_sampai INTEGER NOT NULL DEFAULT 0,
      jendela_awal INTEGER NOT NULL DEFAULT 0, jendela_n INTEGER NOT NULL DEFAULT 0) WITHOUT ROWID;
    CREATE TABLE stats (number_id INTEGER NOT NULL, tanggal TEXT NOT NULL, masuk INTEGER NOT NULL DEFAULT 0, dibalas INTEGER NOT NULL DEFAULT 0,
      gagal INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (number_id, tanggal)) WITHOUT ROWID;
    CREATE TABLE settings (kunci TEXT PRIMARY KEY, nilai TEXT NOT NULL) WITHOUT ROWID;
    PRAGMA user_version = 4;
  `);
  d.prepare("INSERT INTO users VALUES (1, 'uji@lokal.test', ?, ?)").run(hash, kini);
  for (let i = 1; i <= 12; i++) {
    d.prepare("INSERT INTO numbers(id, sesi, label, created_at) VALUES (?, ?, ?, ?)").run(i, `n${i}x${randomBytes(4).toString("hex")}`, `Nomor uji ${i}`, kini);
    d.prepare("INSERT INTO documents VALUES (?, ?, 'Info', 'teks', NULL, 0, 60, ?)").run(i, i, kini);
    d.prepare("INSERT INTO chunks VALUES (?, ?, ?, 0, ?)").run(i, i, i, `Kamu asisten usaha nomor ${i}. Buka pukul 09.00 sampai 21.00.`);
  }
  d.close();
}

const pg = await mulaiPg({ dir: path.join(tmp, "pg"), sementara: true });
const port = await portBebas();
const dasar = `http://127.0.0.1:${port}`;
const log = [];
const server = spawn(process.execPath, ["server.js"], {
  cwd: app,
  env: { ...process.env, NODE_ENV: "production", PORT: String(port), HOSTNAME: "127.0.0.1", DATABASE_URL: pg.url, DATA_DIR: dataDir, AUTH_SECRET, HERMES_API_URL: "http://127.0.0.1:9", HERMES_API_KEY: "x", NODE_OPTIONS: "--max-old-space-size=320" },
  stdio: ["ignore", "pipe", "pipe"],
});
const t00 = performance.now();
server.stdout.on("data", (b) => log.push(process.env.WAKTU ? String(b).replace(/^(?=.)/gm, `[+${(performance.now() - t00).toFixed(0)} ms] `) : String(b)));
server.stderr.on("data", (b) => log.push(String(b)));
const rss = () => {
  try {
    if (process.platform === "win32") return Math.round(Number(execSync(`powershell -NoProfile -Command "(Get-Process -Id ${server.pid}).WorkingSet64"`).toString().trim()) / 1048576);
    return Math.round(Number(execSync(`ps -o rss= -p ${server.pid}`).toString().trim()) / 1024);
  } catch {
    return NaN;
  }
};

let kode = 0;
try {
  const tMulai = performance.now();
  for (;;) {
    try {
      if ((await fetch(`${dasar}/api/health`)).ok) break;
    } catch {
      // belum mendengarkan
    }
    if (performance.now() - tMulai > 30_000) throw new Error("server tidak kunjung siap");
    await tidur(100);
  }
  console.log(`server siap; /api/health pertama (termasuk membuka koneksi database + migrasi + impor) dalam ${(performance.now() - tMulai).toFixed(0)} ms`);

  const cookie = `wa_sesi=${await createSessionToken(1, hash, 1)}`; // sesi_versi awal = 1
  const agent = new http.Agent({ keepAlive: true });
  const minta = (metode, jalur, { headers = {}, body } = {}) =>
    new Promise((resolve, reject) => {
      const t = performance.now();
      const req = http.request(dasar + jalur, { method: metode, headers: { cookie, ...headers }, agent }, (res) => {
        const potong = [];
        res.on("data", (c) => potong.push(c));
        res.on("end", () => resolve({ status: res.statusCode, ms: performance.now() - t, bytes: Buffer.concat(potong).length, enc: res.headers["content-encoding"] ?? "-", teks: Buffer.concat(potong).toString() }));
      });
      req.on("error", reject);
      if (body) req.write(body);
      req.end();
    });
  const json = async (jalur) => JSON.parse((await minta("GET", jalur)).teks);
  const manifes = JSON.parse(readFileSync(path.join(app, ".next/server/server-reference-manifest.json"), "utf8")).node;
  const aksi = (nama, args) =>
    minta("POST", "/", { headers: { "next-action": Object.entries(manifes).find(([, v]) => v.exportedName === nama)[0], "content-type": "text/plain;charset=UTF-8", accept: "text/x-component", origin: dasar }, body: JSON.stringify(args) });
  const ukur = async (jalur, n = 300, headers = {}) => {
    const ms = [];
    let r;
    for (let i = 0; i < n; i++) ms.push((r = await minta("GET", jalur, { headers })).ms);
    ms.sort((a, b) => a - b);
    return { p50: ms[Math.floor(n / 2)], p95: ms[Math.floor(n * 0.95)], maks: ms[n - 1], bytes: r.bytes, enc: r.enc, status: r.status };
  };
  const baris = (nama, u) => console.log(`  ${nama.padEnd(44)} p50 ${u.p50.toFixed(2).padStart(6)} ms | p95 ${u.p95.toFixed(2).padStart(6)} ms | maks ${u.maks.toFixed(1).padStart(6)} ms | ${String(u.bytes).padStart(5)} B (${u.enc})`);

  console.log("\n== data lama terimpor otomatis; sesi login lama tetap berlaku ==");
  await tidur(300);
  assert.match(log.join(""), /data lama diimpor dari .*wa\.db -> PostgreSQL \(users 1, numbers 12, documents 12, chunks 12/);
  let st = await json("/api/wa/status");
  assert.equal(Object.keys(st.nomor).length, 12);
  assert.ok(Object.values(st.nomor).every((s) => s.status === "BELUM_ADA"));
  const halaman = await minta("GET", "/nomor/7", { headers: { "accept-encoding": "identity" } });
  assert.equal(halaman.status, 200);
  assert.match(halaman.teks, /Nomor uji 7/);
  console.log("  12 nomor + knowledge dari SQLite muncul di dashboard; cookie login tetap sah");

  console.log("\n== kecepatan endpoint (12 nomor) ==");
  await ukur("/api/wa/status", 30);
  await ukur("/dashboard", 20, { "accept-encoding": "gzip" });
  baris("GET /api/wa/status", await ukur("/api/wa/status"));
  baris("GET /api/health (1 query ke PostgreSQL)", await ukur("/api/health"));
  baris("GET /api/wa/qr (nomor tanpa sesi)", await ukur("/api/wa/qr?id=1&h="));
  baris("GET /dashboard (beranda, gzip)", await ukur("/dashboard", 60, { "accept-encoding": "gzip" }));
  baris("GET / (landing page statis, gzip)", await ukur("/", 60, { "accept-encoding": "gzip" }));
  baris("GET /nomor/7 (halaman nomor, gzip)", await ukur("/nomor/7", 60, { "accept-encoding": "gzip" }));
  await tidur(2500);
  const rss0 = rss();
  console.log(`  memori server (hangat, 0 soket WhatsApp): ${rss0} MB RSS`);

  console.log("\n== tulis lewat aksi server ==");
  let r = await aksi("setBotAktifAction", [3, false]);
  assert.match(r.teks, /"ok":true/);
  console.log(`  setBotAktifAction: ${r.ms.toFixed(0)} ms`);

  // TANPA_WHATSAPP=1 (dipakai CI): lewati bagian yang membuka koneksi sungguhan ke WhatsApp.
  if (!process.env.TANPA_WHATSAPP) {
  console.log("\n== QR sungguhan dari WhatsApp untuk 12 nomor ==");
  r = await aksi("hubungkanWaAction", [1]);
  assert.equal(r.status, 200, r.teks.slice(0, 300));
  assert.match(r.teks, /"ok":true/);
  console.log(`  nomor pertama: ${r.ms.toFixed(0)} ms sampai QR siap (termasuk memuat Baileys)`);
  const q = await json("/api/wa/qr?id=1&h=");
  assert.equal(q.status, "SCAN_QR_CODE");
  assert.ok(q.qr.n > 20 && typeof q.qr.bit === "string");
  const t0 = performance.now();
  for (let i = 2; i <= 12; i++) assert.equal((await aksi("hubungkanWaAction", [i])).status, 200);
  console.log(`  11 nomor berikutnya: rata-rata ${((performance.now() - t0) / 11).toFixed(0)} ms per nomor`);
  st = await json("/api/wa/status");
  const jumlahQr = Object.values(st.nomor).filter((s) => s.status === "SCAN_QR_CODE").length;
  console.log(`  status: ${jumlahQr}/12 SCAN_QR_CODE`);
  assert.equal(jumlahQr, 12);
  baris("GET /api/wa/status (12 soket aktif)", await ukur("/api/wa/status"));
  baris("GET /api/wa/qr (QR belum berubah)", await ukur(`/api/wa/qr?id=1&h=${q.hash}`));
  await tidur(4000);
  console.log(`  memori server dengan 12 soket WhatsApp aktif: ${rss()} MB RSS (tanpa soket: ${rss0} MB)`);

  r = await aksi("logoutWaAction", [1]);
  assert.match(r.teks, /"ok":true/);
  st = await json("/api/wa/status");
  assert.equal(st.nomor[1].status, "STOPPED");
  assert.equal(Object.values(st.nomor).filter((s) => s.status === "SCAN_QR_CODE").length, 11);
  console.log("  logout satu nomor: 11 lainnya tidak terganggu");
  }

  console.log("\n== keadaan di PostgreSQL ==");
  const { default: postgres } = await lib("node_modules/postgres/src/index.js");
  const sql = postgres(pg.url, { max: 1, onnotice() {} });
  const [k] = await sql`SELECT (SELECT bot_aktif FROM numbers WHERE id = 3) AS bot3, (SELECT COUNT(*)::int FROM wa_auth) AS auth, (SELECT COUNT(*)::int FROM pg_stat_activity WHERE application_name = 'wa-dashboard') AS koneksi, pg_size_pretty(pg_database_size(current_database())) AS ukuran`;
  await sql.end();
  console.log(`  bot nomor 3 aktif: ${k.bot3}; baris sesi WhatsApp: ${k.auth} (belum ada yang dipasangkan); koneksi app ke database: ${k.koneksi}; ukuran database: ${k.ukuran}`);
  assert.equal(k.bot3, false);
  assert.ok(k.koneksi >= 1 && k.koneksi <= 4, "pool tidak melebihi 4 koneksi");
  console.log("\nLOLOS");
} catch (e) {
  kode = 1;
  console.error("\nGAGAL:", e);
  console.error("--- log server ---\n" + log.join("").slice(-3000));
} finally {
  writeFileSync(path.join(tmp, "server.log"), log.join(""));
  server.kill();
  await tidur(800);
  await pg.berhenti().catch(() => {});
}
process.exit(kode);
