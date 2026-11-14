// Screenshot tab Follow-up di halaman nomor pengguna (src/components/panel-followup.tsx): build standalone lokal +
// PostgreSQL sementara + akun & chat contoh (bukan produksi, tanpa kredensial asli).
// Pakai dari akar proyek (setelah `next build`): node --import ./uji/loader.mjs <skrip ini> <folder keluaran>
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const akar = process.cwd();
const keluar = path.resolve(process.argv[2] ?? "screenshot-followup-usaha");
mkdirSync(keluar, { recursive: true });
const tmp = path.join(os.tmpdir(), "wa-ss-followup-usaha");
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
const sql = await db();

// ---------- Data contoh ----------
const PASS = "Rahasia-uji-2026";
const rina = await P.buatAkun({ email: "laundry@contoh.test", nama: "Laundry Melati", password: PASS });
const gratis = await P.buatAkun({ email: "gratis@contoh.test", nama: "Toko Gratis", password: PASS });
for (const u of [rina, gratis]) for (const x of ["dashboard", "nomor"]) await P.tandaiTurSelesai(u.id, x);
const t = sekarang();
await sql`INSERT INTO langganan(user_id, nama_paket, mulai, sampai, kuota_nomor, kuota_balasan, sumber) VALUES (${rina.id}, 'Bisnis', ${t - 86400}, ${t + 30 * 86400}, 3, 4000, 'admin')`;
const melati = await tambahNomor("Laundry Melati", rina.id);
const kemang = await tambahNomor("Cabang Kemang", rina.id);
const baru = await tambahNomor("Cabang Baru", rina.id);
const tokoGratis = await tambahNomor("Toko Gratis", gratis.id);
for (const [n, wa] of [[melati, "6281200001111"], [kemang, "6281200002222"], [baru, "6281200003333"], [tokoGratis, "6281200004444"]]) {
  await sql`UPDATE numbers SET wa_id = ${wa}, bot_aktif = true, created_at = ${t - 40 * 86400} WHERE id = ${n.id}`;
  await tambahDokumen({ numberId: n.id, judul: "Usaha", sumber: "teks", teks: "Laundry Melati. Cuci bedcover king Rp35.000, selesai 2 hari. Kiloan Rp8.000/kg. Jemput gratis area Jl. Melati minimal 5 kg." });
  await sql`INSERT INTO stats(number_id, tanggal, masuk, dibalas) VALUES (${n.id}, (now() AT TIME ZONE 'Asia/Jakarta')::date, 140, 120)`;
}
const setelan = (o) => ({ jamMulai: 9, jamSelesai: 20, batasHarian: 10, jedaPanasJam: 1, jedaHangatJam: 3, tahap2Jam: 24, tahap3Jam: 48, maksTahap: 3, siklusUlangHari: 7, ...o });
await sql`INSERT INTO followup_nomor (number_id, aktif, ulang_aktif, setelan, diperbarui) VALUES (${melati.id}, true, true, ${sql.json(setelan())}, ${t})`;
await sql`INSERT INTO followup_nomor (number_id, aktif, ulang_aktif, setelan, rem_pada, rem_alasan, diperbarui)
          VALUES (${kemang.id}, true, false, ${sql.json(setelan({ siklusUlangHari: 14 }))}, ${t - 40 * 60}, '4 dari 7 pesan follow-up terakhir tidak sampai ke HP penerima (centang satu).', ${t})`;

let urut = 0;
async function chat(numberId, { nama, telepon, minat = 1, pesan }) {
  const kunci = `${String(++urut).padStart(4, "0")}${"b".repeat(28)}`;
  const akhir = pesan.at(-1);
  const [p] = await sql`
    INSERT INTO percakapan (number_id, kunci, telepon, nama, cuplikan, pengirim_akhir, masuk_n, bot_n, manusia_n, terakhir_pada, prospek, minat, minat_pada)
    VALUES (${numberId}, ${kunci}, ${telepon}, ${nama}, ${akhir[1].slice(0, 120)}, ${akhir[0]},
            ${pesan.filter((m) => m[0] === 0).length}, ${pesan.filter((m) => m[0] === 1).length}, 0, ${t - akhir[2] * 60}, 1, ${minat}, ${t - akhir[2] * 60})
    RETURNING id, kunci`;
  for (const [peran, teks, menit] of pesan) await sql`INSERT INTO pesan_chat (percakapan_id, peran, teks, waktu) VALUES (${p.id}, ${peran}, ${teks}, ${t - menit * 60})`;
  return p;
}
const prospek = async (numberId, o) => {
  const p = await chat(numberId, { nama: o.nama, telepon: o.telepon, minat: o.minat, pesan: o.chat });
  await sql`
    INSERT INTO followup_prospek (kunci, number_id, status, tujuan, nama, minat, tahap, jadwal, siklus, dibuat, diperbarui, draf,
                                  pesan1, pesan2, pesan3, terkirim1, terkirim2, terkirim3, ack1, ack2, ack3, dibalas, alasan, usaha)
    VALUES (${p.kunci}, ${numberId}, ${o.status}, ${o.telepon}, ${o.nama}, ${o.minat}, ${o.tahap}, ${t + (o.jadwalMenit ?? 120) * 60}, ${t - 3 * 3600},
            ${t - 3 * 3600}, ${t - (o.diperbaruiMenit ?? 5) * 60}, ${o.draf ?? null},
            ${o.p?.[0] ?? null}, ${o.p?.[1] ?? null}, ${o.p?.[2] ?? null},
            ${o.p?.[0] ? t - 26 * 3600 : null}, ${o.p?.[1] ? t - 2 * 3600 : null}, ${o.p?.[2] ? t - 3600 : null},
            ${o.p?.[0] ? 4 : 0}, ${o.p?.[1] ? 3 : 0}, ${o.p?.[2] ? 3 : 0}, ${o.dibalas ? t - 30 * 60 : null}, ${o.alasan ?? null}, true)`;
};
const ulang = async (numberId, o) => {
  const p = await chat(numberId, { nama: o.nama, telepon: o.telepon, minat: 2, pesan: o.chat });
  await sql`
    INSERT INTO followup_ulang (kunci, number_id, status, tujuan, nama, beli_pada, jadwal, draf, pesan, terkirim, ack, dibalas, alasan, dibuat, diperbarui)
    VALUES (${p.kunci}, ${numberId}, ${o.status}, ${o.telepon}, ${o.nama}, ${t - 9 * 86400}, ${t + (o.jadwalMenit ?? 40) * 60}, ${o.draf ?? null},
            ${o.pesan ?? null}, ${o.pesan ? t - 5 * 3600 : null}, ${o.pesan ? 4 : 0}, ${o.dibalas ? t - 4 * 3600 : null}, ${o.alasan ?? null}, ${t - 6 * 3600}, ${t - (o.diperbaruiMenit ?? 3) * 60})`;
};

await prospek(melati.id, {
  nama: "Rina Anggraini", telepon: "6281234500001", minat: 1, status: "jalan", tahap: 0, jadwalMenit: 50, diperbaruiMenit: 2,
  chat: [[0, "Kak cuci bedcover king berapa? Bisa jemput ke Jl. Melati?", 200], [1, "Bedcover king Rp35.000, selesai 2 hari. Jemput gratis area Jl. Melati minimal 5 kg ya Kak 😊", 199]],
  draf: "Kak Rina, soal cuci bedcover king yang tadi ditanyakan: bisa dijemput gratis ke Jl. Melati kalau digabung kiloan minimal 5 kg. Selesai 2 hari, jadi masih sempat dipakai akhir pekan. Mau dijadwalkan jemput sore ini atau besok pagi?",
});
await prospek(melati.id, {
  nama: "Andi Pratama", telepon: "6281234500002", minat: 2, status: "jalan", tahap: 1, jadwalMenit: 300, diperbaruiMenit: 8,
  chat: [[0, "Oke kak jadi cuci 7 kg, kirim ke Jl. Melati no 12. Bayarnya gimana?", 1600], [1, "Siap Kak, totalnya Rp56.000. Bisa bayar saat kurir jemput ya.", 1599]],
  p: ["Kak Andi, cucian 7 kg-nya mau dijemput jam berapa? Tinggal pilih pagi atau sore, nanti kurir kami datang ke Jl. Melati no 12."],
  draf: "Kak Andi, kurir kami lewat Jl. Melati besok pagi jam 9 dan sore jam 4. Totalnya tetap Rp56.000 dan bisa dibayar saat dijemput. Mau dijadwalkan yang pagi atau sore?",
});
await prospek(melati.id, {
  nama: "Wulan Sari", telepon: "6281234500003", minat: 1, status: "dibalas", tahap: 1, diperbaruiMenit: 30, dibalas: true,
  chat: [[0, "Kiloan per kg berapa kak?", 1700], [1, "Kiloan Rp8.000/kg Kak.", 1699], [0, "Oke kak besok saya antar sendiri", 30]],
  p: ["Kak Wulan, tadi tanya kiloan ya. Kalau minimal 5 kg, jemputnya gratis untuk area Jl. Melati. Mau dijemput saja biar tidak repot?"],
});
await prospek(melati.id, {
  nama: "Tono", telepon: "6281234500004", minat: 1, status: "selesai", tahap: 3, diperbaruiMenit: 60, alasan: "Semua pesan follow-up terkirim",
  chat: [[0, "Cuci sepatu bisa kak?", 5000], [1, "Belum ada layanan cuci sepatu Kak, kami melayani kiloan dan bedcover.", 4999]],
  p: [
    "Kak Tono, untuk sepatu memang belum ada, tapi kalau ada cucian kiloan atau bedcover, kami bisa jemput gratis di area Jl. Melati. Ada yang mau dicuci?",
    "Kak, kiloan Rp8.000/kg dan selesai 2 hari. Kalau digabung 5 kg, jemput & antar gratis. Mau aku jadwalkan minggu ini?",
    "Kak Tono, ini pesan terakhir dariku soal ini ya, aku tidak akan mengganggu lagi 🙏 Kapan pun butuh, cukup balas chat ini.",
  ],
});
await prospek(melati.id, {
  nama: "Sinta", telepon: "6281234500005", minat: 1, status: "stop", tahap: 1, diperbaruiMenit: 90, dibalas: true, alasan: "Pelanggan meminta tidak dihubungi lagi",
  chat: [[0, "Bedcover queen berapa kak?", 2000], [1, "Bedcover queen Rp30.000 Kak.", 1999], [0, "gak usah kak makasih", 90]],
  p: ["Kak Sinta, soal bedcover queen tadi, mau sekalian dijemput? Selesai 2 hari kok."],
});
await ulang(melati.id, {
  nama: "Bu Ratna", telepon: "6281234500006", status: "jalan", jadwalMenit: 25, diperbaruiMenit: 1,
  chat: [[0, "Sudah transfer ya kak 56rb", 9 * 1440], [1, "Terima kasih Bu Ratna, cuciannya kami antar besok sore ya 🙏", 9 * 1440 - 1]],
  draf: "Bu Ratna, minggu lalu cuci kiloan 7 kg di kami. Mau dijemput lagi minggu ini? Jadwal jemput pagi atau sore bisa, Bu 😊",
});
await ulang(melati.id, {
  nama: "Pak Hendra", telepon: "6281234500007", status: "dibalas", diperbaruiMenit: 240, dibalas: true,
  chat: [[0, "Bedcover sudah sampai kak, makasih", 10 * 1440], [1, "Sama-sama Pak Hendra 🙏", 10 * 1440 - 1], [0, "Iya kak jemput lagi besok ya", 240]],
  pesan: "Pak Hendra, minggu lalu cuci bedcover king di kami. Mau dijemput lagi minggu ini? Pagi atau sore bisa, Pak.",
});
await prospek(kemang.id, {
  nama: "Dewi", telepon: "6281234500008", minat: 1, status: "jalan", tahap: 1, jadwalMenit: 600, diperbaruiMenit: 50,
  chat: [[0, "Kak setrika saja berapa?", 1500], [1, "Setrika saja Rp5.000/kg Kak.", 1499]],
  p: ["Kak Dewi, untuk setrika saja Rp5.000/kg ya. Mau dijemput sekalian?"],
});
await sql`INSERT INTO followup_prospek (kunci, number_id, status, minat, tahap, jadwal, siklus, dibuat, diperbarui, terkirim1, ack1, usaha)
          SELECT md5('kemang' || g), ${kemang.id}, 'selesai', 1, 1, ${t}, ${t}, ${t - 3600}, ${t - 3600}, ${t - 7 * 3600}, CASE WHEN g <= 4 THEN 2 ELSE 3 END, true
            FROM generate_series(1, 7) g`;
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
const klikTeks = async (teks, dalam = "document") =>
  evaluasi(`(() => { const b = [...(${dalam}).querySelectorAll("button, summary, a")].filter((x) => x.offsetParent !== null).find((x) => x.textContent.trim().includes(${JSON.stringify(teks)})); if (!b) return false; b.click(); return true; })()`);
const tungguTeks = async (teks) => {
  for (let i = 0; i < 60; i++) {
    if (await evaluasi(`document.body.innerText.includes(${JSON.stringify(teks)})`)) return;
    await tidur(150);
  }
  throw new Error(`teks tidak muncul: ${teks}`);
};
const DAFTAR = `[...document.querySelectorAll("section")].find((s) => s.querySelector("h2")?.textContent.includes("Pelanggan yang di-follow-up"))`;
const PENGATURAN = `[...document.querySelectorAll("section")].find((s) => s.querySelector("h2")?.textContent.trim() === "Pengaturan" && s.querySelector("#fu-batas"))`;
const TAB = `document.querySelector('[role="tablist"]')`;
let kunjungan = 0;
const bukaTab = async (id) => {
  // Parameter unik: URL yang hanya beda hash tidak memuat ulang halaman (tanpa loadEventFired).
  await buka(`/nomor/${id}?v=${++kunjungan}#followup`);
  await tungguTeks("Aturan anti-blokir");
};

try {
  await ukuran(1440, false);
  await masuk("laundry@contoh.test");
  await bukaTab(melati.id);
  await foto("01-tab-followup-atas-desktop");
  await foto("02-tab-bar-followup-desktop", { pilih: TAB });
  await foto("03-tab-followup-halaman-penuh-desktop", { penuh: true });
  await foto("04-daftar-pelanggan-desktop", { pilih: DAFTAR });
  await evaluasi(`[...document.querySelectorAll("details")].filter((d) => d.closest("li")).forEach((d) => (d.open = true))`);
  await foto("05-daftar-semua-pesan-dibuka-desktop", { pilih: DAFTAR });
  await klikTeks("Edit", DAFTAR);
  await tidur(400);
  await foto("06-edit-draf-desktop", { pilih: `document.querySelector('textarea[id^="fu-pesan-"]')?.closest("li")` });
  await bukaTab(melati.id);
  await klikTeks("Dibalas", DAFTAR);
  await tidur(400);
  await foto("07-saring-dibalas-desktop", { pilih: DAFTAR });
  await klikTeks("Santai", PENGATURAN);
  await evaluasi(`document.querySelector("${"details"}") && [...document.querySelectorAll("details")].find((d) => d.textContent.includes("Pengaturan lanjutan")).setAttribute("open", "")`);
  await tidur(300);
  await foto("08-pengaturan-santai-lanjutan-belum-disimpan-desktop", { pilih: PENGATURAN });
  await bukaTab(kemang.id);
  await foto("09-rem-otomatis-desktop");
  await bukaTab(baru.id);
  await foto("10-nomor-baru-mati-kosong-desktop", { penuh: true });

  await ukuran(390, true);
  await bukaTab(melati.id);
  await foto("11-tab-followup-atas-hp");
  await foto("12-tab-followup-halaman-penuh-hp", { penuh: true });
  await evaluasi(`[...document.querySelectorAll("details")].filter((d) => d.closest("li")).forEach((d) => (d.open = true))`);
  await foto("13-daftar-pesan-dibuka-hp", { pilih: DAFTAR });
  await bukaTab(kemang.id);
  await foto("14-rem-otomatis-hp");

  await ukuran(1440, false);
  await masuk("gratis@contoh.test");
  await bukaTab(tokoGratis.id);
  await foto("15-akun-tanpa-paket-terkunci-desktop");
  await ukuran(390, true);
  await bukaTab(tokoGratis.id);
  await foto("16-akun-tanpa-paket-terkunci-hp");
} finally {
  chrome.kill();
  server.kill();
  await pg.berhenti().catch(() => {});
}
process.exit(0);
