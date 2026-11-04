// Uji multi pengguna: migrasi v5, isolasi nomor antar akun, blokir, pencabutan sesi, aturan password,
// tindakan admin, dan rencana + kecepatan query daftar pengguna. PostgreSQL 15 sungguhan (uji/pg-lokal.mjs).
// Pakai (dari akar proyek): node --import ./uji/loader.mjs uji/uji-pengguna.mjs
import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { mulaiPg } from "./pg-lokal.mjs";

const akar = process.cwd();
const tmp = path.join(os.tmpdir(), "wa-uji-pengguna");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const pg = await mulaiPg({ dir: path.join(tmp, "pg"), sementara: true });
process.env.DATABASE_URL = pg.url;
process.env.DATA_DIR = path.join(tmp, "data-kosong");
process.env.AUTH_SECRET = "x".repeat(40);
const lib = (f) => import(pathToFileURL(path.join(akar, f)).href);

const { db, sekarang } = await lib("src/lib/db.ts");
const { tambahNomor, nomorMilik, nomorById, daftarNomor, statHarian } = await lib("src/lib/numbers.ts");
const P = await lib("src/lib/pengguna.ts");
const K = await lib("src/lib/kpi.ts");
const { bolehAkses } = await lib("src/lib/akses.ts");
const { cekPassword, verifyPassword } = await lib("src/lib/password.ts");
const { createSessionToken, verifySessionToken } = await lib("src/lib/auth.ts");
const sql = await db();

let lolos = 0;
const cek = async (nama, fn) => {
  await fn();
  lolos += 1;
  console.log(`  ok  ${nama}`);
};

console.log("== akun & isolasi ==");
const admin = await P.buatAkun({ email: "admin@uji.test", nama: "Admin", password: "rahasia-admin-01", peran: "admin" });
const budi = await P.buatAkun({ email: "budi@uji.test", nama: "Budi", password: "rahasia-budi-01" });
const sari = await P.buatAkun({ email: "sari@uji.test", nama: "Sari", password: "rahasia-sari-01" });
const A = { id: admin.id, email: "admin@uji.test", nama: "Admin", peran: "admin" };
const B = { id: budi.id, email: "budi@uji.test", nama: "Budi", peran: "user" };
const S = { id: sari.id, email: "sari@uji.test", nama: "Sari", peran: "user" };

await cek("email ganda ditolak (null), peran bawaan 'user', password tersimpan sebagai hash scrypt", async () => {
  assert.equal(await P.buatAkun({ email: "budi@uji.test", nama: "X", password: "rahasia-lain-01" }), null);
  const [u] = await sql`SELECT peran, status, password_hash FROM users WHERE id = ${budi.id}`;
  assert.equal(u.peran, "user");
  assert.equal(u.status, "aktif");
  assert.match(u.password_hash, /^scrypt:16384:8:1:/);
  assert.ok(await verifyPassword("rahasia-budi-01", u.password_hash));
});

const nb = await tambahNomor("Toko Budi", budi.id);
const ns = await tambahNomor("Toko Sari", sari.id);

await cek("nomor hanya terlihat & bisa diakses pemiliknya; admin boleh semua", async () => {
  assert.deepEqual((await nomorMilik(budi.id)).map((n) => n.id), [nb.id]);
  assert.deepEqual((await nomorMilik(sari.id)).map((n) => n.id), [ns.id]);
  const nomorSari = await nomorById(ns.id);
  assert.equal(bolehAkses(B, nomorSari), false);
  assert.equal(bolehAkses(S, nomorSari), true);
  assert.equal(bolehAkses(A, nomorSari), true);
  assert.equal(bolehAkses(B, undefined), false);
  assert.deepEqual((await daftarNomor(budi.id, false)).map((n) => n.id), [nb.id]);
});

await cek("statistik ringkasan hanya menghitung nomor milik pengguna itu", async () => {
  const hari = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  await sql`INSERT INTO stats(number_id, tanggal, masuk, dibalas) VALUES (${nb.id}, ${hari}, 5, 4), (${ns.id}, ${hari}, 9, 9)`;
  const s = await statHarian(hari, { userId: budi.id });
  assert.deepEqual(s.map((r) => [r.number_id, r.masuk]), [[nb.id, 5]]);
});

console.log("== blokir & sesi ==");
await cek("blokir: pemilik_aktif=false di cache nomor (AI berhenti), sesi_versi naik; buka blokir mengembalikannya", async () => {
  const [sebelum] = await sql`SELECT sesi_versi FROM users WHERE id = ${budi.id}`;
  await P.setBlokir(A, budi.id, true, "spam");
  assert.equal((await nomorById(nb.id)).pemilik_aktif, false);
  assert.equal((await nomorById(ns.id)).pemilik_aktif, true);
  const [u] = await sql`SELECT status, alasan_blokir, sesi_versi FROM users WHERE id = ${budi.id}`;
  assert.deepEqual({ ...u }, { status: "diblokir", alasan_blokir: "spam", sesi_versi: sebelum.sesi_versi + 1 });
  await P.setBlokir(A, budi.id, false);
  assert.equal((await nomorById(nb.id)).pemilik_aktif, true);
});

await cek("token sesi memuat sesi_versi; token rusak/dipalsukan/kedaluwarsa ditolak", async () => {
  const t = await createSessionToken(budi.id, "hash", 3);
  const p = await verifySessionToken(t);
  assert.equal(p.uid, budi.id);
  assert.equal(p.sv, 3);
  const [badan, sig] = t.split(".");
  const palsu = Buffer.from(JSON.stringify({ ...p, uid: admin.id })).toString("base64url");
  assert.equal(await verifySessionToken(`${palsu}.${sig}`), null);
  assert.equal(await verifySessionToken(`${badan}.AAAA`), null);
  assert.equal(await verifySessionToken(undefined), null);
});

await cek("cabut sesi & reset password menaikkan sesi_versi; password sementara bisa dipakai login", async () => {
  const v0 = (await sql`SELECT sesi_versi FROM users WHERE id = ${sari.id}`)[0].sesi_versi;
  const r = await P.cabutSesi(sari.id, A);
  assert.equal(r.sesi_versi, v0 + 1);
  const pw = await P.resetPassword(A, sari.id);
  assert.equal(cekPassword(pw), null);
  const [u] = await sql`SELECT sesi_versi, password_hash FROM users WHERE id = ${sari.id}`;
  assert.equal(u.sesi_versi, v0 + 2);
  assert.ok(await verifyPassword(pw, u.password_hash));
  assert.equal(await verifyPassword("rahasia-sari-01", u.password_hash), false);
});

console.log("== aturan admin ==");
await cek("admin tidak bisa memblokir/menurunkan/menghapus dirinya sendiri, dan admin aktif terakhir dijaga", async () => {
  await assert.rejects(P.setBlokir(A, admin.id, true), /akun Anda sendiri/);
  await assert.rejects(P.setPeran(A, admin.id, "user"), /akun Anda sendiri/);
  await assert.rejects(P.hapusPengguna(A, admin.id), /akun Anda sendiri/);
  // Admin lain (mis. akun yang baru dinaikkan) tidak boleh menurunkan/memblokir admin aktif terakhir.
  const lain = { ...S, peran: "admin" };
  await assert.rejects(P.setPeran(lain, admin.id, "user"), /minimal satu admin/);
  await assert.rejects(P.setBlokir(lain, admin.id, true), /minimal satu admin/);
  await P.setPeran(A, sari.id, "admin");
  assert.equal((await P.penggunaById(sari.id)).peran, "admin");
  await P.setPeran(A, sari.id, "user");
  assert.equal((await P.penggunaById(sari.id)).peran, "user");
});

await cek("kuota per akun: null = bawaan, angka disimpan; log admin tercatat terbaru dulu", async () => {
  await P.setKuota(A, budi.id, 3);
  assert.equal((await P.penggunaById(budi.id)).kuota_nomor, 3);
  await P.setKuota(A, budi.id, null);
  assert.equal((await P.penggunaById(budi.id)).kuota_nomor, null);
  const log = await P.daftarLog(3);
  assert.equal(log[0].aksi, "ubah kuota");
  assert.equal(log[0].detail, "bawaan");
  assert.equal(log[0].sasaran, "budi@uji.test");
});

await cek("hapus pengguna ikut menghapus nomornya (cascade) & cache nomor diperbarui", async () => {
  const korban = await P.buatAkun({ email: "hapus@uji.test", nama: "Hapus", password: "rahasia-hapus-01" });
  const nk = await tambahNomor("Akan hilang", korban.id);
  await P.hapusPengguna(A, korban.id);
  assert.equal(await nomorById(nk.id), undefined);
  assert.equal((await sql`SELECT COUNT(*) AS n FROM numbers WHERE id = ${nk.id}`)[0].n, 0);
});

await cek("aturan password: panjang, huruf+angka, umum, memuat email", async () => {
  assert.match(cekPassword("pendek1"), /minimal 10/);
  assert.match(cekPassword("hurufsemuasaja"), /huruf dan angka/);
  assert.match(cekPassword("1234567890"), /huruf dan angka|mudah ditebak/);
  assert.match(cekPassword("password123"), /mudah ditebak/);
  assert.match(cekPassword("budisantoso99", "budisantoso@x.id"), /email/);
  assert.equal(cekPassword("Kopi-Pagi-2026"), null);
  assert.equal(P.normalkanEmail("  Budi@Uji.TEST "), "budi@uji.test");
  assert.equal(P.normalkanEmail("bukan-email"), null);
});

console.log("== masuk dengan Google ==");
process.env.GOOGLE_CLIENT_ID = "klien-uji.apps.googleusercontent.com";
process.env.GOOGLE_CLIENT_SECRET = "rahasia-uji";
const G = await lib("src/lib/google.ts");

await cek("akun Google: dibuat tanpa password, ditautkan ke email yang sudah ada, tidak dibuat saat pendaftaran ditutup", async () => {
  const baru = await P.akunGoogle({ sub: "g-111", email: "rina@gmail.test", nama: "Rina" }, true);
  assert.equal(baru.baru, true);
  assert.equal(baru.password_hash, P.TANPA_PASSWORD);
  assert.equal(await verifyPassword("apa saja", baru.password_hash), false); // penanda tidak pernah cocok
  const lagi = await P.akunGoogle({ sub: "g-111", email: "rina-ganti@gmail.test", nama: "Rina" }, true);
  assert.deepEqual([lagi.id, lagi.baru], [baru.id, false]); // dicari lewat sub, walau email Google berubah
  const taut = await P.akunGoogle({ sub: "g-222", email: "budi@uji.test", nama: "Budi G" }, false);
  assert.deepEqual([taut.id, taut.baru], [budi.id, false]); // email sudah terdaftar: ditautkan, bukan akun baru
  const u = await P.penggunaById(budi.id);
  assert.deepEqual([u.google, u.punya_password], [true, true]);
  assert.equal(await P.akunGoogle({ sub: "g-333", email: "baru@gmail.test", nama: "X" }, false), null);
  // Email yang sudah tertaut ke akun Google lain tidak diambil alih oleh sub berbeda.
  assert.equal(await P.akunGoogle({ sub: "g-444", email: "budi@uji.test", nama: "Penyusup" }, true), null);
});

await cek("callback Google: state, nonce, aud, iss, exp, email_verified diperiksa; PKCE terkirim", async () => {
  const asli = globalThis.fetch;
  const { url, cookie } = G.mulaiGoogle("https://app.uji");
  const q = new URL(url).searchParams;
  assert.equal(q.get("redirect_uri"), "https://app.uji/api/auth/google/callback");
  assert.equal(q.get("code_challenge_method"), "S256");
  const [state, verifier, nonce] = cookie.split(".");
  assert.equal(q.get("state"), state);
  const token = (k) => `x.${Buffer.from(JSON.stringify({ iss: "https://accounts.google.com", aud: process.env.GOOGLE_CLIENT_ID, exp: Math.floor(Date.now() / 1000) + 300, nonce, sub: "g-9", email: "Dewi@Gmail.test", email_verified: true, name: "Dewi", ...k })).toString("base64url")}.sig`;
  let dikirim;
  const pakai = (k) => (globalThis.fetch = async (_u, o) => ((dikirim = new URLSearchParams(o.body)), new Response(JSON.stringify({ id_token: token(k) }))));
  const balik = (s = state) => new URLSearchParams({ state: s, code: "kode-1" });
  try {
    pakai({});
    assert.deepEqual(await G.selesaikanGoogle("https://app.uji", balik(), cookie), { sub: "g-9", email: "dewi@gmail.test", nama: "Dewi" });
    assert.equal(dikirim.get("code_verifier"), verifier);
    await assert.rejects(G.selesaikanGoogle("https://app.uji", balik("state-lain"), cookie), /sesi/);
    await assert.rejects(G.selesaikanGoogle("https://app.uji", balik(), undefined), /sesi/);
    pakai({ nonce: "lain" });
    await assert.rejects(G.selesaikanGoogle("https://app.uji", balik(), cookie), /sesi/);
    pakai({ aud: "klien-lain" });
    await assert.rejects(G.selesaikanGoogle("https://app.uji", balik(), cookie), /google/);
    pakai({ iss: "https://penipu.test" });
    await assert.rejects(G.selesaikanGoogle("https://app.uji", balik(), cookie), /google/);
    pakai({ exp: 1 });
    await assert.rejects(G.selesaikanGoogle("https://app.uji", balik(), cookie), /google/);
    pakai({ email_verified: false });
    await assert.rejects(G.selesaikanGoogle("https://app.uji", balik(), cookie), /email/);
    await assert.rejects(G.selesaikanGoogle("https://app.uji", new URLSearchParams({ state, error: "access_denied" }), cookie), /batal/);
  } finally {
    globalThis.fetch = asli;
  }
});

console.log("== daftar pengguna: kebenaran, rencana query, kecepatan ==");
console.log("== lupa password (OTP email) ==");
await cek("lupa password: kode 6 digit lewat Resend, tersimpan sebagai HMAC; email tak terdaftar/diblokir tanpa email & tanpa galat; jeda kirim ulang; sekali pakai; sesi lama keluar & kunci login dibuka", async () => {
  const LP = await lib("src/lib/lupa-password.ts");
  const terkirim = [];
  const asli = globalThis.fetch;
  globalThis.fetch = async (url, o) => {
    terkirim.push({ url: String(url), auth: o.headers.Authorization, body: JSON.parse(o.body) });
    return new Response(JSON.stringify({ id: "uji" }), { status: 200 });
  };
  // Email dikirim di latar (tidak ditunggu permintaan): tunggu sampai sejumlah n terkirim.
  const tunggu = async (n) => {
    for (let i = 0; i < 100 && terkirim.length < n; i++) await new Promise((r) => setTimeout(r, 10));
  };
  const kodeDari = (e) => e.body.subject.match(/^(\d{6}) adalah kode/)[1];
  const bukan = (k) => (k === "000000" ? "111111" : "000000");
  try {
    delete process.env.RESEND_API_KEY;
    await assert.rejects(LP.mintaOtp("sari@uji.test"), LP.GalatOtp, "belum dikonfigurasi = galat jelas");
    process.env.RESEND_API_KEY = "re_uji";
    process.env.EMAIL_DARI = "ChatGerCep <no-reply@uji.test>";

    await LP.mintaOtp("tidak-ada@uji.test");
    await sql`UPDATE users SET status = 'diblokir' WHERE id = ${budi.id}`;
    await LP.mintaOtp("budi@uji.test");
    await sql`UPDATE users SET status = 'aktif' WHERE id = ${budi.id}`;
    await LP.mintaOtp(" SARI@uji.test ");
    await tunggu(1);
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(terkirim.length, 1, "hanya akun aktif yang terdaftar yang menerima email");
    const e = terkirim[0];
    assert.deepEqual([e.url, e.auth, e.body.from, e.body.to], ["https://api.resend.com/emails", "Bearer re_uji", "ChatGerCep <no-reply@uji.test>", ["sari@uji.test"]]);
    const kode = kodeDari(e);
    assert.ok(e.body.text.includes(kode) && e.body.html.includes(kode));
    const [r] = await sql`SELECT kode_hash, kedaluwarsa - dibuat AS umur FROM reset_password WHERE user_id = ${sari.id}`;
    assert.match(r.kode_hash, /^[0-9a-f]{64}$/);
    assert.ok(!r.kode_hash.includes(kode), "kode asli tidak disimpan");
    assert.equal(r.umur, 600);

    await LP.mintaOtp("sari@uji.test"); // dalam 60 dtk: diabaikan, kode lama tetap berlaku
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(terkirim.length, 1);

    await assert.rejects(LP.pakaiOtp("sari@uji.test", bukan(kode), "PasswordBaru-123"), /Sisa 4 kali/);
    const [lama] = await sql`SELECT sesi_versi FROM users WHERE id = ${sari.id}`;
    await sql`UPDATE users SET gagal_login = 9, kunci_sampai = ${sekarang() + 900} WHERE id = ${sari.id}`;
    const u = await LP.pakaiOtp("Sari@uji.test", ` ${kode.slice(0, 3)} ${kode.slice(3)} `, "PasswordBaru-123");
    assert.deepEqual([u.id, u.status], [sari.id, "aktif"]);
    const [s] = await sql`SELECT password_hash, sesi_versi, gagal_login, kunci_sampai FROM users WHERE id = ${sari.id}`;
    assert.ok(await verifyPassword("PasswordBaru-123", s.password_hash));
    assert.deepEqual([s.sesi_versi, s.gagal_login, s.kunci_sampai], [lama.sesi_versi + 1, 0, 0]);
    await assert.rejects(LP.pakaiOtp("sari@uji.test", kode, "PasswordLain-456"), /kedaluwarsa/, "sekali pakai");
    await tunggu(2);
    assert.match(terkirim[1].body.subject, /baru saja diganti/);
  } finally {
    globalThis.fetch = asli;
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_DARI;
  }
});

await cek("lupa password: 5 kode salah = hangus (kode benar pun ditolak), 10 tebakan serentak tidak melewati batas, kode kedaluwarsa ditolak", async () => {
  const LP = await lib("src/lib/lupa-password.ts");
  const terkirim = [];
  const asli = globalThis.fetch;
  globalThis.fetch = async (_u, o) => {
    terkirim.push(JSON.parse(o.body));
    return new Response("{}", { status: 200 });
  };
  const kodeBaru = async () => {
    const n = terkirim.length;
    await LP.mintaOtp("sari@uji.test");
    for (let i = 0; i < 100 && terkirim.length <= n; i++) await new Promise((r) => setTimeout(r, 10));
    return terkirim.at(-1).subject.slice(0, 6);
  };
  const bukan = (k) => (k === "000000" ? "111111" : "000000");
  process.env.RESEND_API_KEY = "re_uji";
  process.env.EMAIL_DARI = "ChatGerCep <no-reply@uji.test>";
  try {
    const k1 = await kodeBaru();
    for (let sisa = 4; sisa >= 1; sisa--) await assert.rejects(LP.pakaiOtp("sari@uji.test", bukan(k1), "PasswordBaru-123"), new RegExp(`Sisa ${sisa} kali`));
    await assert.rejects(LP.pakaiOtp("sari@uji.test", bukan(k1), "PasswordBaru-123"), /terlalu sering/);
    await assert.rejects(LP.pakaiOtp("sari@uji.test", k1, "PasswordBaru-123"), /kedaluwarsa/);

    const k2 = await kodeBaru();
    const hasil = await Promise.allSettled(Array.from({ length: 10 }, () => LP.pakaiOtp("sari@uji.test", bukan(k2), "PasswordBaru-123")));
    assert.equal(hasil.filter((h) => h.status === "rejected" && /Sisa|terlalu sering/.test(h.reason.message)).length, 5, "tepat 5 tebakan yang dinilai");
    await assert.rejects(LP.pakaiOtp("sari@uji.test", k2, "PasswordBaru-123"), /kedaluwarsa/);

    const k3 = await kodeBaru();
    await sql`UPDATE reset_password SET kedaluwarsa = ${sekarang() - 1} WHERE user_id = ${sari.id}`;
    await assert.rejects(LP.pakaiOtp("sari@uji.test", k3, "PasswordBaru-123"), /kedaluwarsa/);
    await assert.rejects(LP.pakaiOtp("sari@uji.test", "12345", "PasswordBaru-123"), /6 digit/);
  } finally {
    globalThis.fetch = asli;
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_DARI;
  }
});

await cek("cari, saring, dan kursor (tanpa OFFSET) mengembalikan baris yang benar", async () => {
  const semua = await P.daftarPengguna({});
  assert.deepEqual(semua.daftar.map((u) => u.email), ["rina@gmail.test", "sari@uji.test", "budi@uji.test", "admin@uji.test"]);
  assert.equal(semua.daftar.find((u) => u.email === "budi@uji.test").jumlah_nomor, 1);
  assert.deepEqual((await P.daftarPengguna({ cari: "sar" })).daftar.map((u) => u.email), ["sari@uji.test"]);
  assert.deepEqual((await P.daftarPengguna({ cari: "%" })).daftar, []); // wildcard di-escape
  const hal1 = await P.daftarPengguna({ batas: 2 });
  assert.equal(hal1.adaLagi, true);
  const hal2 = await P.daftarPengguna({ batas: 2, sebelumId: hal1.daftar[1].id });
  assert.deepEqual(hal2.daftar.map((u) => u.email), ["budi@uji.test", "admin@uji.test"]);
  assert.equal(hal2.adaLagi, false);
});

// Data berukuran produksi-besar: 20.000 akun, 6.000 nomor.
const kini = sekarang();
await sql`INSERT INTO users(email, nama, password_hash, created_at)
          SELECT 'u' || g || '@massal.test', 'Pengguna ' || g, 'scrypt:x', ${kini} - g FROM generate_series(1, 20000) g`;
await sql`INSERT INTO numbers(user_id, sesi, label, created_at)
          SELECT u.id, 'm' || u.id, 'Nomor', ${kini} FROM users u WHERE u.email LIKE 'u%@massal.test' AND u.id % 10 < 3`;
await sql`ANALYZE users; ANALYZE numbers`.simple();

async function ukur(nama, fn, ulang = 30) {
  await fn();
  const t0 = performance.now();
  for (let i = 0; i < ulang; i++) await fn();
  const ms = (performance.now() - t0) / ulang;
  console.log(`      ${nama}: ${ms.toFixed(2)} ms`);
  return ms;
}

await cek("halaman pertama & kursor memakai indeks primary key + numbers_user_idx (tanpa seq scan numbers)", async () => {
  const rencana = (await sql.unsafe(`EXPLAIN (ANALYZE, BUFFERS)
    SELECT u.id, COALESCE(n.jumlah, 0) FROM users u
    LEFT JOIN LATERAL (SELECT COUNT(*) AS jumlah FROM numbers WHERE user_id = u.id) n ON true
    WHERE u.id < 15000 ORDER BY u.id DESC LIMIT 26`)).map((r) => r["QUERY PLAN"]).join("\n");
  assert.match(rencana, /Index Scan Backward using users_pkey|Index Scan Backward using users_dibuat_idx|Index Only Scan Backward/);
  assert.match(rencana, /numbers_user_idx/);
  assert.doesNotMatch(rencana, /Seq Scan on numbers/);
  const ms = await ukur("daftarPengguna (20 rb akun, halaman 25)", () => P.daftarPengguna({}));
  assert.ok(ms < 15, `terlalu lambat: ${ms} ms`);
  const msKursor = await ukur("daftarPengguna kursor tengah", () => P.daftarPengguna({ sebelumId: 10000 }));
  assert.ok(msKursor < 15);
  const msKpi = await ukur("kpiAdmin (dashboard KPI, 20 rb akun)", () => K.kpiAdmin(), 5);
  assert.ok(msKpi < 250, `terlalu lambat: ${msKpi} ms`);
});

await cek("nomor milik satu pengguna & statistiknya lewat indeks user_id", async () => {
  const rencana = (await sql.unsafe(`EXPLAIN SELECT id FROM numbers WHERE user_id = ${budi.id} ORDER BY id`)).map((r) => r["QUERY PLAN"]).join("\n");
  assert.match(rencana, /numbers_user_idx/);
  await ukur("daftarNomor(user) dengan 6 rb nomor di tabel", () => daftarNomor(budi.id, false));
});

await sql.end({ timeout: 2 });
await pg.berhenti();
console.log(`\n${lolos} uji lolos.`);
process.exit(0);
