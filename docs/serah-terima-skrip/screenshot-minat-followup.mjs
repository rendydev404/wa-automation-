// Screenshot tingkat minat lead (histori percakapan) & follow-up prospek (admin): build standalone lokal + PostgreSQL
// sementara + akun & chat contoh (bukan produksi, tanpa kredensial asli).
// Pakai dari akar proyek (setelah `next build`): node --import ./uji/loader.mjs <skrip ini> <folder keluaran>
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const akar = process.cwd();
const keluar = path.resolve(process.argv[2] ?? "screenshot-minat-followup");
mkdirSync(keluar, { recursive: true });
const tmp = path.join(os.tmpdir(), "wa-ss-minat");
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
const sql = await db();

// ---------- Data contoh ----------
const PASS = "Rahasia-uji-2026";
const admin = await P.buatAkun({ email: "admin@contoh.test", nama: "Admin Uji", password: PASS, peran: "admin" });
const budi = await P.buatAkun({ email: "budi@contoh.test", nama: "Budi Uji", password: PASS });
for (const u of [admin, budi]) for (const t of ["dashboard", "nomor", "admin"]) await P.tandaiTurSelesai(u.id, t);
const t = sekarang();
await sql`INSERT INTO langganan(user_id, nama_paket, mulai, sampai, kuota_nomor, kuota_balasan, sumber) VALUES (${budi.id}, 'Bisnis', ${t - 86400}, ${t + 30 * 86400}, 3, 4000, 'admin')`;
const toko = await tambahNomor("Toko Kue Budi", budi.id);
const kosong = await tambahNomor("Cabang Baru", budi.id);
const cs = await tambahNomor("GercepBot", admin.id);
await sql`UPDATE numbers SET wa_id = '6281100002222' WHERE id = ${cs.id}`;
const lain = await tambahNomor("Admin GCB", admin.id);
await sql`UPDATE numbers SET wa_id = '6281100003333' WHERE id = ${lain.id}`;

let urut = 0;
/** Satu chat lengkap: [peran, teks, menit lalu]... (peran 0 pelanggan, 1 AI, 2 pemilik). */
async function chat(numberId, { nama, telepon, prospek = 0, minat = null, minatHariLalu = 0, spam = 0, pesan }) {
  const kunci = `${String(++urut).padStart(4, "0")}${"a".repeat(28)}`;
  const akhir = pesan.at(-1);
  const terakhir = t - akhir[2] * 60;
  const [p] = await sql`
    INSERT INTO percakapan (number_id, kunci, telepon, nama, cuplikan, pengirim_akhir, masuk_n, bot_n, manusia_n, terakhir_pada, prospek, minat, minat_pada, spam)
    VALUES (${numberId}, ${kunci}, ${telepon}, ${nama}, ${akhir[1].slice(0, 120)}, ${akhir[0]},
            ${pesan.filter((m) => m[0] === 0).length}, ${pesan.filter((m) => m[0] === 1).length}, ${pesan.filter((m) => m[0] === 2).length},
            ${terakhir}, ${prospek}, ${minat}, ${minat === null ? null : terakhir - minatHariLalu * 86400}, ${spam})
    RETURNING id, kunci`;
  for (const [peran, teks, menit] of pesan) await sql`INSERT INTO pesan_chat (percakapan_id, peran, teks, waktu) VALUES (${p.id}, ${peran}, ${teks}, ${t - menit * 60})`;
  return p;
}

await chat(toko.id, {
  nama: "Rina Anggraini", telepon: "6281234500001", prospek: 1, minat: 2,
  pesan: [
    [0, "Kak, kue lapis legit ukuran 20x20 ready?", 42],
    [1, "Ready Kak 😊 Lapis legit 20x20 Rp185.000, bisa dikirim hari ini untuk area Jakarta.", 41],
    [0, "Oke jadi ambil 2 ya kak, kirim ke Kemang. Transfer ke rekening mana?", 12],
    [1, "Siap Kak, totalnya Rp370.000 + ongkir Rp15.000 = Rp385.000. Transfer ke BCA 123-456-7890 a.n. Toko Kue Budi ya.", 11],
  ],
});
await chat(toko.id, {
  nama: "Andi Pratama", telepon: "6281234500002", prospek: 1, minat: 1,
  pesan: [
    [0, "Halo kak, brownies panggang harganya berapa?", 95],
    [1, "Halo Kak! Brownies panggang Rp65.000 per loyang (20x10).", 94],
    [0, "Ongkir ke Bekasi berapa kak?", 60],
    [1, "Ke Bekasi Rp20.000 Kak, sampai di hari yang sama kalau pesan sebelum jam 12.", 59],
  ],
});
await chat(toko.id, {
  nama: "Sari Wulandari", telepon: "6281234500003", prospek: 1, minat: 0,
  pesan: [
    [0, "Kak ada menu apa aja ya?", 180],
    [1, "Ada lapis legit, brownies, bolu pandan, dan kue kering Kak. Mau aku kirimkan daftarnya?", 179],
    [0, "Lihat-lihat dulu ya kak", 175],
    [1, "Siap Kak, kabari saja kalau ada yang mau dipesan 😊", 174],
  ],
});
await chat(toko.id, {
  nama: "Dodi", telepon: "6281234500004", prospek: 1, minat: 1, minatHariLalu: 8,
  pesan: [
    [0, "Bolu pandan masih ada kak?", 8 * 1440 + 30],
    [1, "Masih ada Kak, Rp55.000 per loyang.", 8 * 1440 + 29],
  ],
});
await chat(toko.id, {
  nama: "~ akun iseng", telepon: "6281234500005", prospek: 2,
  pesan: [
    [0, "wkwk iseng doang", 300],
    [1, "Hehe siap Kak, kalau butuh kue untuk acara kabari aku ya.", 299],
    [0, "kamu robot ya", 296],
  ],
});
await chat(toko.id, { nama: "Pelanggan baru", telepon: "6281234500006", pesan: [[0, "halo", 400], [1, "Halo Kak! Ada yang bisa aku bantu?", 399]] });
await chat(kosong.id, { nama: "Tes", telepon: "6281234500007", pesan: [[0, "p", 500], [1, "Halo Kak, ada yang bisa aku bantu?", 499]] });

// Follow-up prospek nomor CS: berbagai status.
const fu = async (o) => {
  const p = await chat(cs.id, { nama: o.nama, telepon: o.telepon, prospek: 1, minat: o.minat, pesan: o.chat });
  await sql`
    INSERT INTO followup_prospek (kunci, number_id, status, tujuan, nama, minat, tahap, jadwal, siklus, dibuat, diperbarui, draf,
                                  pesan1, pesan2, pesan3, terkirim1, terkirim2, terkirim3, ack1, ack2, ack3, dibalas, alasan)
    VALUES (${p.kunci}, ${cs.id}, ${o.status}, ${o.telepon}, ${o.nama}, ${o.minat}, ${o.tahap}, ${t + (o.jadwalMenit ?? 120) * 60}, ${t - 3 * 3600},
            ${t - 3 * 3600}, ${t - (o.diperbaruiMenit ?? 5) * 60}, ${o.draf ?? null},
            ${o.p?.[0] ?? null}, ${o.p?.[1] ?? null}, ${o.p?.[2] ?? null},
            ${o.p?.[0] ? t - 26 * 3600 : null}, ${o.p?.[1] ? t - 2 * 3600 : null}, ${o.p?.[2] ? t - 3600 : null},
            ${o.p?.[0] ? 4 : 0}, ${o.p?.[1] ? 3 : 0}, ${o.p?.[2] ? 3 : 0}, ${o.dibalas ? t - 30 * 60 : null}, ${o.alasan ?? null})`;
};
await fu({
  nama: "Hana Kusuma", telepon: "6285700000001", minat: 1, status: "jalan", tahap: 0, jadwalMenit: 95, diperbaruiMenit: 2,
  chat: [[0, "Kak, paket Bisnis ChatGerCep berapa ya?", 200], [1, "Paket Bisnis Rp246.000/bulan Kak, untuk 4.000 balasan AI.", 199]],
  draf: "Kak Hana, soal paket Bisnis yang tadi ditanyakan: 4.000 balasan itu cukup untuk sekitar 130 chat pelanggan per hari, dan AI-nya langsung membalas 24 jam termasuk malam hari. Banyak yang awalnya ragu soal setting, padahal cukup scan QR lalu isi info usaha. Mau aku bantu cek paket yang paling pas untuk toko Kakak?",
});
await fu({
  nama: "Panji Saputra", telepon: "6285700000002", minat: 2, status: "jalan", tahap: 1, jadwalMenit: 300, diperbaruiMenit: 8,
  chat: [[0, "Oke kak saya mau paket Pro, bayarnya gimana?", 1600], [1, "Bisa lewat GoPay, ShopeePay, atau QRIS Kak di halaman langganan.", 1599]],
  p: ["Kak Panji, paket Pro-nya tinggal satu langkah lagi 🙂 Pilih Pro di halaman langganan, bayar lewat GoPay/ShopeePay/QRIS, AI langsung aktif. Mau aku pandu sekarang?"],
  draf: "Kak Panji, sekadar gambaran: tiap chat yang baru dibalas besok pagi sering keburu pindah ke toko lain. Paket Pro Rp602.000/bulan itu sekitar Rp20.100 per hari, lebih murah dari satu pesanan yang hilang. Kalau mau, aku bantu aktifkan hari ini: https://chatgercep.com/langganan",
});
await fu({
  nama: "Wulan Sari", telepon: "6285700000003", minat: 1, status: "dibalas", tahap: 1, diperbaruiMenit: 30, dibalas: true,
  chat: [[0, "Starter itu bisa berapa nomor kak?", 1700], [1, "Starter untuk 1 nomor WhatsApp Kak.", 1699], [0, "Oke kak saya coba Starter dulu", 30]],
  p: ["Kak Wulan, tadi tanya soal Starter untuk 1 nomor ya. Mau aku tunjukkan contoh AI membalas pelanggan toko Kakak dulu sebelum mulai?"],
});
await fu({
  nama: "Tono", telepon: "6285700000004", minat: 1, status: "selesai", tahap: 3, diperbaruiMenit: 60, alasan: "Semua pesan follow-up terkirim",
  chat: [[0, "Harga paket berapa aja kak?", 5000], [1, "Starter Rp67.000, Bisnis Rp246.000, Pro Rp602.000 per bulan Kak.", 4999]],
  p: [
    "Kak Tono, dari tiga paket tadi, untuk mulai biasanya Starter sudah cukup. Mau aku bantu pilihkan sesuai jumlah chat harian toko Kakak?",
    "Kak, chat pelanggan yang telat dibalas sering pindah ke toko lain. Starter Rp67.000/bulan itu sekitar Rp2.300 per hari, dan AI menjawab semua chat 24 jam. Mau aku pandu mulai hari ini?",
    "Kak Tono, ini pesan terakhir dariku soal ini ya, aku tidak akan mengganggu lagi 🙏 Kapan pun siap, pembayaran pertama dilindungi jaminan uang kembali 1×24 jam. Cukup balas chat ini.",
  ],
});
await fu({
  nama: "Sinta", telepon: "6285700000005", minat: 1, status: "stop", tahap: 1, diperbaruiMenit: 90, dibalas: true, alasan: "Lawan bicara meminta tidak dihubungi lagi",
  chat: [[0, "Berapa harga starter kak?", 2000], [1, "Starter Rp67.000/bulan Kak.", 1999], [0, "gak usah kak makasih", 90]],
  p: ["Kak Sinta, soal Starter tadi, ada yang masih bikin ragu? Kalau mau, aku bantu hitungkan dulu kebutuhannya."],
});
await setSetting("followup", JSON.stringify({ aktif: false, nomorId: cs.id, batasHarian: 20, jamMulai: 9, jamSelesai: 20, tundaJam: 24, pengingatHari: 3 }));
await setSetting("followup_prospek", JSON.stringify({ aktif: true, jedaPanasJam: 1, jedaHangatJam: 3, tahap2Jam: 24, tahap3Jam: 48, maksTahap: 3 }));
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
async function buka(jalur) {
  const muat = new Promise((r) => { const f = (m) => { if (m.method === "Page.loadEventFired") { pendengar.splice(pendengar.indexOf(f), 1); r(); } }; pendengar.push(f); });
  await cdp("Page.navigate", { url: dasar + jalur });
  await muat;
  await tidur(1200);
}
async function ukuran(lebar, hp) {
  await cdp("Emulation.setDeviceMetricsOverride", { width: lebar, height: hp ? 844 : 900, deviceScaleFactor: hp ? 2 : 1, mobile: hp });
}
async function foto(nama, { pilih, penuh = false } = {}) {
  await tidur(500);
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
const HISTORI = `[...document.querySelectorAll("section")].find((s) => s.querySelector("h2")?.textContent.includes("Histori percakapan"))`;
const klikTeks = async (teks, dalam = "document") =>
  evaluasi(`(() => { const b = [...(${dalam}).querySelectorAll("button, summary, a")].find((x) => x.textContent.trim().includes(${JSON.stringify(teks)})); if (!b) return false; b.click(); return true; })()`);
const tungguTeks = async (teks) => {
  for (let i = 0; i < 50; i++) {
    if (await evaluasi(`document.body.innerText.includes(${JSON.stringify(teks)})`)) return;
    await tidur(150);
  }
  throw new Error(`teks tidak muncul: ${teks}`);
};

try {
  // ---------- Pemilik nomor: histori percakapan ----------
  await ukuran(1440, false);
  await masuk("budi@contoh.test");
  await buka(`/nomor/${toko.id}#histori`);
  await tungguTeks("Rina Anggraini");
  await foto("01-histori-semua-desktop", { pilih: HISTORI });
  await klikTeks("Andi Pratama", HISTORI);
  await tungguTeks("Ongkir ke Bekasi");
  await foto("02-histori-chat-hangat-desktop", { pilih: HISTORI });
  await klikTeks("Lead serius", HISTORI);
  await tidur(1200);
  await foto("03-histori-filter-lead-serius-desktop", { pilih: HISTORI });
  await buka(`/nomor/${kosong.id}#histori`);
  await tungguTeks("Tes");
  await klikTeks("Lead serius", HISTORI);
  await tungguTeks("Belum ada lead serius");
  await foto("04-histori-lead-kosong-desktop", { pilih: HISTORI });

  await ukuran(390, true);
  await buka(`/nomor/${toko.id}#histori`);
  await tungguTeks("Rina Anggraini");
  await foto("05-histori-semua-hp", { pilih: HISTORI });
  await klikTeks("Lead serius", HISTORI);
  await tidur(1200);
  await foto("06-histori-filter-lead-hp", { pilih: HISTORI });
  await klikTeks("Rina Anggraini", HISTORI);
  await tungguTeks("rekening mana");
  await foto("07-histori-chat-panas-hp", { pilih: HISTORI });

  // ---------- Admin: follow-up ----------
  await ukuran(1440, false);
  await masuk("admin@contoh.test");
  await buka("/admin/followup");
  await foto("08-admin-followup-tab-akun-desktop");
  await buka("/admin/followup/prospek");
  await tungguTeks("Hana Kusuma");
  await foto("09-admin-prospek-atas-desktop");
  const FORM = `document.querySelector("#fp-nomor")?.closest("section")`;
  await foto("09a-admin-prospek-pilih-nomor-desktop", { pilih: FORM });
  await evaluasi(`document.querySelector("#fp-nomor").click()`);
  await tidur(500);
  await foto("09b-admin-prospek-pilih-nomor-terbuka-desktop", { pilih: FORM });
  await evaluasi(`[...document.querySelectorAll('[role="option"]')].find((o) => o.textContent.includes("Admin GCB"))?.click()`);
  await tidur(300);
  await foto("09c-admin-prospek-belum-disimpan-desktop", { pilih: FORM });
  await buka("/admin/followup/prospek");
  await tungguTeks("Hana Kusuma");
  await foto("10-admin-prospek-halaman-penuh-desktop", { penuh: true });
  await evaluasi(`[...document.querySelectorAll("details")].forEach((d) => (d.open = true))`);
  await foto("11-admin-prospek-semua-pesan-dibuka-desktop", { pilih: `[...document.querySelectorAll("section")].find((s) => s.textContent.includes("Riwayat follow-up prospek"))` });
  await klikTeks("Edit");
  await tidur(400);
  await foto("12-admin-prospek-edit-draf-desktop", { pilih: `document.querySelector("textarea")?.closest("li")` });
  await buka("/admin/followup/prospek?status=dibalas");
  await tungguTeks("Wulan Sari");
  await foto("13-admin-prospek-saring-dibalas-desktop", { pilih: `[...document.querySelectorAll("section")].find((s) => s.textContent.includes("Riwayat follow-up prospek"))` });

  await ukuran(390, true);
  await buka("/admin/followup/prospek");
  await tungguTeks("Hana Kusuma");
  await foto("14-admin-prospek-atas-hp");
  await foto("15-admin-prospek-halaman-penuh-hp", { penuh: true });
} finally {
  chrome.kill();
  server.kill();
  await pg.berhenti().catch(() => {});
}
process.exit(0);
