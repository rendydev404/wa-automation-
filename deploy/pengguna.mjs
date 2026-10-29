// Tambah admin dashboard, atau ganti password akun yang sudah ada (darurat: mis. semua admin terkunci).
// Pengguna biasa mendaftar sendiri di /daftar; admin mengelolanya di /admin.
// Email dan password lewat variabel lingkungan supaya tidak tertinggal di berkas mana pun.
//
// Lokal (PostgreSQL dev, `npm run db` harus jalan):
//   EMAIL_BARU=a@b.c PW_BARU=... DATABASE_URL=postgres://wa:wa@127.0.0.1:5434/wa node deploy/pengguna.mjs
// Produksi (dijalankan di dalam container app, yang sudah punya koneksi databasenya sendiri):
//   ssh root@HOST "cd /opt/wa-automation && docker compose exec -T -e EMAIL_BARU=a@b.c -e PW_BARU=... app node --input-type=module -" < deploy/pengguna.mjs
//
// Memakai PostgreSQL bila DATABASE_URL ada; kalau tidak, wa.db (SQLite) versi lama di DATA_DIR.
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import path from "node:path";

const email = (process.env.EMAIL_BARU ?? "").trim().toLowerCase();
const password = process.env.PW_BARU ?? "";
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("EMAIL_BARU tidak sah.");
if (!password || password.length > 200) throw new Error("PW_BARU kosong atau terlalu panjang.");

// Format yang sama dengan src/lib/password.ts: scrypt:N:r:p:garam:hash
const turunkan = (pw, garam, N, r, p) => new Promise((ok, gagal) => scrypt(pw, garam, 64, { N, r, p, maxmem: 128 * N * r * 2 }, (e, k) => (e ? gagal(e) : ok(k))));
const garam = randomBytes(16);
const hash = `scrypt:16384:8:1:${garam.toString("base64")}:${(await turunkan(password, garam, 16384, 8, 1)).toString("base64")}`;
const cocok = async (tersimpan) => {
  const [, n, r, p, g, h] = tersimpan.split(":");
  const a = await turunkan(password, Buffer.from(g, "base64"), +n, +r, +p);
  const b = Buffer.from(h, "base64");
  return a.length === b.length && timingSafeEqual(a, b);
};
const kini = Math.floor(Date.now() / 1000);

let di;
let sebelum;
let tersimpan;
let semua;
if (process.env.DATABASE_URL) {
  di = "PostgreSQL";
  const { default: postgres } = await import("postgres");
  const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice() {} });
  try {
    sebelum = (await sql`SELECT 1 FROM users WHERE email = ${email}`).length > 0;
    // Skrip ini alat pengelola server: akun yang dibuat/diubah lewat sini menjadi admin aktif, dan semua sesi lamanya dicabut.
    await sql`INSERT INTO users(email, password_hash, peran, created_at) VALUES (${email}, ${hash}, 'admin', ${kini})
              ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, peran = 'admin', status = 'aktif',
                                                sesi_versi = users.sesi_versi + 1, gagal_login = 0, kunci_sampai = 0`;
    tersimpan = (await sql`SELECT password_hash FROM users WHERE email = ${email}`)[0].password_hash;
    semua = (await sql`SELECT email FROM users ORDER BY id`).map((r) => r.email);
  } finally {
    await sql.end();
  }
} else {
  di = "SQLite (wa.db)";
  const { DatabaseSync } = await import("node:sqlite");
  const d = new DatabaseSync(path.join(path.resolve(process.env.DATA_DIR || "./data"), "wa.db"));
  try {
    d.exec("PRAGMA busy_timeout = 5000");
    sebelum = !!d.prepare("SELECT 1 FROM users WHERE email = ?").get(email);
    d.prepare("INSERT INTO users(email, password_hash, created_at) VALUES (?, ?, ?) ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash").run(email, hash, kini);
    tersimpan = d.prepare("SELECT password_hash FROM users WHERE email = ?").get(email).password_hash;
    semua = d.prepare("SELECT email FROM users ORDER BY id").all().map((r) => r.email);
  } finally {
    d.close();
  }
}
if (!(await cocok(tersimpan))) throw new Error("Password yang tersimpan tidak cocok saat diperiksa ulang.");
console.log(`${di}: pengguna ${email} ${sebelum ? "sudah ada, password-nya diganti" : "dibuat"}; password yang tersimpan cocok saat diperiksa ulang.`);
console.log(`Pengguna yang ada sekarang (${semua.length}): ${semua.map((e) => e.replace(/^(.).*(@.*)$/, "$1***$2")).join(", ")}`);
