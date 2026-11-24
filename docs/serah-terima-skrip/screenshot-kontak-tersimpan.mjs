// Screenshot fitur "Jangan balas kontak yang tersimpan di HP" (tab Pengaturan nomor): nyala berisi kontak + pengecualian,
// mencari, memilih "Tetap balas", cari tanpa hasil, panduan terbuka, nyala tanpa kontak (nomor belum tersambung), mati,
// nomor resmi, dan panduan sorotan (tombol Panduan + otomatis saat pertama kali dinyalakan). Build standalone lokal + PostgreSQL sementara + data contoh (bukan produksi).
// Pakai dari akar proyek (setelah `next build`): node --import ./uji/loader.mjs <skrip ini> <folder keluaran>
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const akar = process.cwd();
const keluar = path.resolve(process.argv[2] ?? "screenshot-kontak-tersimpan");
mkdirSync(keluar, { recursive: true });
const tmp = path.join(os.tmpdir(), "wa-ss-kontak");
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
const { enkripsiKredensial } = await lib("src/lib/rahasia.ts");
const sql = await db();

// ---------- Data contoh ----------
const PASS = "Rahasia-uji-2026";
const rina = await P.buatAkun({ email: "kue@contoh.test", nama: "Toko Kue Rina", password: PASS });
for (const x of ["dashboard", "nomor"]) await P.tandaiTurSelesai(rina.id, x);
const t = sekarang();
await sql`INSERT INTO langganan(user_id, nama_paket, mulai, sampai, kuota_nomor, kuota_balasan, sumber) VALUES (${rina.id}, 'Bisnis', ${t - 86400}, ${t + 30 * 86400}, 3, 4000, 'admin')`;
const utama = await tambahNomor("Toko Kue Rina", rina.id);
const cabang = await tambahNomor("Cabang Bekasi", rina.id);
const resmi = await tambahNomor("Kue Rina Resmi", rina.id);
for (const [n, wa] of [[utama, "6281200002222"], [cabang, "6281200003333"], [resmi, "6281200004444"]]) {
  await sql`UPDATE numbers SET wa_id = ${wa}, bot_aktif = true, created_at = ${t - 40 * 86400} WHERE id = ${n.id}`;
  await tambahDokumen({ numberId: n.id, judul: "Usaha", sumber: "teks", teks: "Toko Kue Rina. Bolu pandan Rp45.000, brownies Rp55.000. Pesan H-1, antar area Bekasi." });
}
await sql`UPDATE numbers SET abaikan_kontak = true WHERE id IN ${sql([utama.id, cabang.id])}`;
await sql`UPDATE numbers SET jalur = 'resmi' WHERE id = ${resmi.id}`;
await sql`
  INSERT INTO nomor_resmi (number_id, phone_number_id, waba_id, token_enkrip, rahasia_enkrip, kunci_webhook, verify_token, nomor_tampil, nama_tampil, kualitas, tier, status, aktif, diperbarui)
  VALUES (${resmi.id}, '109876543210111', '102345678901111', ${enkripsiKredensial("EAAG" + "x".repeat(56) + "Q7wK")}, ${enkripsiKredensial("0123456789abcdef0123456789abcdef")},
          'Xq3vL9mP2sT8kW1nR6yB4cHe', 'vt_7Gk2Mp9Qa4Lt', '6281200004444', 'Kue Rina Resmi', 'GREEN', 'TIER_250', 'CONNECTED', true, ${t})`;
const NAMA = ["Mama", "Papa", "Adik Dina", "Bu RT Sulastri", "Pak Joko Supplier Telur", "Sari Teman Kuliah", "Andi Kurir", "Bu Wati (langganan)", "Budi Santoso", "Citra Arisan",
  "Dedi Tetangga", "Eka Percetakan", "Fajar Grosir Tepung", "Gita Sepupu", "Hendra Bengkel", "Indah Reseller", "Joni Ojek", "Kiki Kantor", "Lina Pelanggan Setia", "Mega Catering",
  "Nina Guru", "Oki Driver", "Putri Kos", "Rudi Mertua", "Sinta Mitra Kue", "Tono Satpam", "Umi Pengajian", "Vina Desain Kemasan", "Wawan Gas", "Yuni Penjahit",
  "Zaki Bank", "Agus Sopir", "Bayu Teman SMA", "Cahya Fotografer", "Dewi Kakak", "Erna Bu Lurah", "Fitri Reseller Bekasi", "Gilang Kurir 2", "Hana Karyawan", "Irfan Pemasok Mentega"];
const tel = (i) => `62812${String(30000000 + i * 7919).padStart(8, "0")}`;
await sql`INSERT INTO kontak_wa ${sql(NAMA.map((nama, i) => ({ number_id: utama.id, jid: `${tel(i)}@s.whatsapp.net`, telepon: tel(i), lid: `${8e11 + i}@lid`, nama, tetap_balas: nama.includes("langganan") || nama.includes("Pelanggan Setia"), diperbarui: t - 420 })))}`;
const akunBaru = [];
for (const [email, nama] of [["baru1@contoh.test", "Laundry Bersih"], ["baru2@contoh.test", "Bengkel Jaya"]]) {
  const u = await P.buatAkun({ email, nama, password: PASS });
  for (const x of ["dashboard", "nomor"]) await P.tandaiTurSelesai(u.id, x);
  await sql`INSERT INTO langganan(user_id, nama_paket, mulai, sampai, kuota_nomor, kuota_balasan, sumber) VALUES (${u.id}, 'Bisnis', ${t - 86400}, ${t + 30 * 86400}, 3, 4000, 'admin')`;
  const n = await tambahNomor(nama, u.id);
  await sql`UPDATE numbers SET wa_id = ${"62813" + String(u.id).padStart(8, "0")}, bot_aktif = true WHERE id = ${n.id}`;
  await tambahDokumen({ numberId: n.id, judul: "Usaha", sumber: "teks", teks: `${nama}. Buka 08.00-20.00.` });
  akunBaru.push({ email, n });
}
await sql.end({ timeout: 2 });

// ---------- Server lokal ----------
const port = await portBebas();
const dasar = `http://127.0.0.1:${port}`;
const env = { ...process.env, NODE_ENV: "production", PORT: String(port), HOSTNAME: "127.0.0.1", APP_URL: "https://chatgercep.com", META_GRAPH_URL: "http://127.0.0.1:9", HERMES_API_URL: "http://127.0.0.1:9", HERMES_API_KEY: "x" };
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
const klikTeks = async (teks, dalam = "document") =>
  evaluasi(`(() => { const b = [...(${dalam}).querySelectorAll("button, summary, a")].filter((x) => x.offsetParent !== null).find((x) => x.textContent.trim().includes(${JSON.stringify(teks)})); if (!b) return false; b.click(); return true; })()`);
const tungguTeks = async (teks) => {
  for (let i = 0; i < 80; i++) {
    if (await evaluasi(`document.body.innerText.includes(${JSON.stringify(teks)})`)) return;
    await tidur(150);
  }
  throw new Error(`teks tidak muncul: ${teks}`);
};
const PANEL = `document.getElementById("kontak-tersimpan")`;
const isiCari = (v) => evaluasi(`(() => { const el = document.querySelector("#kontak-tersimpan input[type=search]"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, ${JSON.stringify(v)}); el.dispatchEvent(new Event("input", { bubbles: true })); })()`);

try {
  for (const [lebar, hp, akhiran] of [[1440, false, "desktop"], [390, true, "hp"]]) {
    await ukuran(lebar, hp);
    await masuk("kue@contoh.test");
    // Nyala, berisi kontak & pengecualian.
    await buka(`/nomor/${utama.id}#pengaturan`);
    await tungguTeks("kontak tersimpan terbaca");
    // Panduan sorotan dari tombol "Panduan": setiap langkah difoto (layar penuh, apa yang dilihat pengguna).
    await evaluasi(`${PANEL}.querySelector('[data-analitik="Panduan kontak tersimpan"]').click()`);
    await tungguTeks("Nyalakan di sini");
    for (let i = 1; i <= 7; i++) {
      await tidur(700);
      await foto(`00-panduan-sorotan-langkah-${i}-${akhiran}`);
      if (i < 7) await klikTeks("Lanjut", `document.querySelector('[role=dialog]')`);
    }
    await klikTeks("Mengerti", `document.querySelector('[role=dialog]')`);
    await tidur(500);
    await foto(`01-tab-pengaturan-halaman-penuh-${akhiran}`, { penuh: true });
    await foto(`02-panel-nyala-berisi-kontak-${akhiran}`, { pilih: PANEL });
    // Mencari.
    await isiCari("reseller");
    await tungguTeks("Fitri Reseller Bekasi");
    await tidur(500);
    await foto(`03-cari-reseller-${akhiran}`, { pilih: PANEL });
    // Pilih "Tetap balas" pada hasil pertama.
    await klikTeks("Tetap balas", PANEL);
    await tidur(900);
    await foto(`04-setelah-tetap-balas-dipilih-${akhiran}`, { pilih: PANEL });
    // Cari tanpa hasil.
    await isiCari("zzz");
    await tungguTeks("Tidak ada kontak yang cocok");
    await foto(`05-cari-tanpa-hasil-${akhiran}`, { pilih: PANEL });
    // Panduan & tanya jawab terbuka.
    await isiCari("");
    await tidur(500);
    await klikTeks("Panduan & pertanyaan umum", PANEL);
    await tidur(400);
    await foto(`06-panduan-terbuka-${akhiran}`, { pilih: PANEL });
    // Nomor lain: nyala tapi belum ada kontak; tombol "Perbarui daftar" saat nomor belum tersambung.
    await buka(`/nomor/${cabang.id}#pengaturan`);
    await tungguTeks("Belum ada kontak terbaca");
    await foto(`07-nyala-belum-ada-kontak-${akhiran}`, { pilih: PANEL });
    await klikTeks("Perbarui daftar", PANEL);
    await tungguTeks("Nomor belum tersambung");
    await tidur(300);
    await foto(`08-perbarui-saat-nomor-belum-tersambung-${akhiran}`, { pilih: PANEL });
    // Matikan: tampilan mati (bawaan untuk semua nomor).
    await evaluasi(`${PANEL}.querySelector("[role=switch]").click()`);
    await tungguTeks("Mati: AI membalas semua chat");
    await tidur(800);
    await foto(`09-mati-bawaan-${akhiran}`, { pilih: PANEL });
    await evaluasi(`${PANEL}.querySelector("[role=switch]").click()`); // nyalakan lagi untuk putaran HP
    await tidur(1500);
    // Nomor resmi: tidak tersedia.
    await buka(`/nomor/${resmi.id}#pengaturan`);
    await tungguTeks("Hanya untuk nomor yang tersambung lewat scan QR");
    await foto(`10-nomor-resmi-tidak-tersedia-${akhiran}`, { pilih: PANEL });
  }
  // Akun yang belum pernah melihat panduannya: menyalakan fitur memutar panduan sorotan sekali secara otomatis.
  for (const [[lebar, hp, akhiran], a] of [[[1440, false, "desktop"], akunBaru[0]], [[390, true, "hp"], akunBaru[1]]]) {
    await ukuran(lebar, hp);
    await masuk(a.email);
    await buka(`/nomor/${a.n.id}#pengaturan`);
    await tungguTeks("Mati: AI membalas semua chat");
    await evaluasi(`${PANEL}.querySelector("[role=switch]").click()`);
    await tungguTeks("Nyalakan di sini");
    await tidur(900);
    await foto(`12-panduan-otomatis-saat-pertama-dinyalakan-${akhiran}`);
  }
} finally {
  chrome.kill();
  server.kill();
  await pg.berhenti().catch(() => {});
}
process.exit(0);
