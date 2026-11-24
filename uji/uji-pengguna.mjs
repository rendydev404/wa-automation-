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

console.log("== peran developer ==");
await cek("developer: migrasi v32 menerima peran 'developer', peran lain tetap ditolak database", async () => {
  const dev = await P.buatAkun({ email: "dev@uji.test", nama: "Dev", password: "rahasia-dev-001", peran: "developer" });
  assert.equal((await P.penggunaById(dev.id)).peran, "developer");
  await assert.rejects(sql`UPDATE users SET peran = 'superadmin' WHERE id = ${dev.id}`, /users_peran_check/);
  await P.hapusPengguna(A, dev.id);
});

await cek("developer = staf: buka panel, akses semua nomor, tanpa kuota; tapi tidak bisa atur peran / ubah akun admin", async () => {
  const { staf, labelPeran, peranSah } = await lib("src/lib/peran.ts");
  const { hakAkun } = await lib("src/lib/langganan.ts");
  const dev = await P.buatAkun({ email: "dev2@uji.test", nama: "Dev", password: "rahasia-dev-002", peran: "developer" });
  const D = { id: dev.id, email: "dev2@uji.test", nama: "Dev", peran: "developer" };
  assert.equal(staf("developer"), true);
  assert.equal(staf("admin"), true);
  assert.equal(staf("user"), false);
  assert.equal(staf(undefined), false);
  assert.equal(labelPeran("developer"), "Developer");
  assert.equal(peranSah("developer") && !peranSah("root"), true);
  assert.equal(bolehAkses(D, await nomorById(ns.id)), true);
  const hak = await hakAkun(D);
  assert.equal(hak.nomor, null);
  assert.equal(hak.paket, "Developer");
  // Mengatur peran: hanya admin (developer tidak bisa menaikkan dirinya/siapa pun).
  await assert.rejects(P.setPeran(D, budi.id, "admin"), /Hanya admin yang bisa mengubah peran/);
  await assert.rejects(P.setPeran(D, dev.id, "admin"), /Hanya admin yang bisa mengubah peran/);
  // Akun admin tidak bisa diubah developer: blokir, hapus, reset password, keluarkan sesi.
  await assert.rejects(P.setBlokir(D, admin.id, true), /Hanya admin yang bisa mengubah akun admin/);
  await assert.rejects(P.hapusPengguna(D, admin.id), /Hanya admin yang bisa mengubah akun admin/);
  await assert.rejects(P.resetPassword(D, admin.id), /Hanya admin yang bisa mengubah akun admin/);
  await assert.rejects(P.cabutSesi(admin.id, D), /Hanya admin yang bisa mengubah akun admin/);
  // Akun pengguna biasa tetap bisa dikelola developer.
  await P.setBlokir(D, sari.id, true, "uji");
  await P.setBlokir(D, sari.id, false);
  await P.cabutSesi(dev.id, D); // akun sendiri
  // Admin menaikkan & menurunkan developer; developer bukan admin, jadi admin aktif terakhir tetap dijaga.
  await P.setPeran(A, budi.id, "developer");
  assert.equal((await P.penggunaById(budi.id)).peran, "developer");
  await P.setPeran(A, budi.id, "user");
  const log = await P.daftarLog(2);
  assert.deepEqual(log.map((l) => l.aksi), ["jadikan pengguna biasa", "jadikan developer"]);
  // Tab "Admin & developer" & KPI menghitung developer sebagai staf, bukan pengguna.
  assert.equal((await P.hitungPengguna({ cari: "dev2@" })).admin, 1);
  await P.hapusPengguna(A, dev.id);
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
const { mulaiSmtpTiruan } = await import("./smtp-tiruan.mjs");
const smtp = await mulaiSmtpTiruan();
const pakaiSmtp = () => {
  process.env.GMAIL_USER = smtp.user;
  process.env.GMAIL_APP_PASSWORD = "abcd abcd abcd abcd"; // seperti ditampilkan Google: spasinya dibuang
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = String(smtp.port);
  process.env.APP_URL = "https://app.uji"; // ikon email dimuat dari sini
};
const lepasSmtp = () => {
  for (const k of ["GMAIL_USER", "GMAIL_APP_PASSWORD", "SMTP_HOST", "SMTP_PORT", "APP_URL"]) delete process.env[k];
};
// Email dikirim di latar (tidak ditunggu permintaan): tunggu sampai sejumlah n diterima server SMTP.
const tungguEmail = async (n) => {
  for (let i = 0; i < 300 && smtp.masuk.length < n; i++) await new Promise((r) => setTimeout(r, 10));
};
const bukanKode = (k) => (k === "000000" ? "111111" : "000000");

await cek("lupa password 3 tahap: email tak terdaftar/diblokir ditolak jelas tanpa email; kode lewat SMTP Gmail (HMAC saja yang disimpan); kode benar = token sekali pakai; token = password baru, sesi lama keluar & kunci login dibuka", async () => {
  const LP = await lib("src/lib/lupa-password.ts");
  const EM = await lib("src/lib/email.ts");
  try {
    lepasSmtp();
    await assert.rejects(LP.mintaOtp("sari@uji.test"), LP.GalatOtp, "belum dikonfigurasi = galat jelas");
    pakaiSmtp();
    smtp.masuk.length = 0;

    assert.equal(await LP.mintaOtp("tidak-ada@uji.test"), "tidak-terdaftar");
    await sql`UPDATE users SET status = 'diblokir' WHERE id = ${budi.id}`;
    assert.equal(await LP.mintaOtp("budi@uji.test"), "diblokir");
    await sql`UPDATE users SET status = 'aktif' WHERE id = ${budi.id}`;
    assert.equal(await LP.mintaOtp(" SARI@uji.test "), "terkirim");
    await tungguEmail(1);
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(smtp.masuk.length, 1, "hanya akun aktif yang terdaftar yang menerima email");
    const e = smtp.masuk[0];
    assert.deepEqual([e.user, e.pass, e.dari, e.ke], [smtp.user, smtp.pass, smtp.user, ["sari@uji.test"]], "login App Password tanpa spasi, pengirim = akun Gmail");
    assert.match(e.mentah, /^From: ChatGerCep <uji@gmail\.test>$/m);
    const kode = e.judul.match(/^(\d{6}) adalah kode/)[1];
    assert.ok(e.mentah.split(kode).length - 1 >= 2, "kode ada di judul dan teks biasa");
    // HTML (quoted-printable): kode dalam satu blok teks (sekali pilih = 6 digit tersalin); tombol langsung ke tahap kode
    // dengan email terisi; ikon dari public/email/, tanpa emoji.
    const html = e.mentah.replace(/=\r?\n/g, "").replace(/=3D/g, "=");
    assert.match(html, new RegExp(`user-select:all">${kode}</td>`));
    assert.ok(html.includes('href="https://app.uji/lupa-password?email=sari%40uji.test"'), "tombol membuka tahap kode untuk email ini");
    assert.ok(html.includes(`href="https://app.uji/lupa-password?email=sari%40uji.test#salin=${kode}"`), "tombol Salin kode: kode di #fragmen (tidak terkirim ke server)");
    assert.match(html, />Salin kode</);
    assert.match(html, /\/email\/kunci\.png/);
    assert.ok(!/&#(?:128272|9201|128737|9888);/.test(html), "tanpa emoji");
    assert.match(e.mentah, /multipart\/alternative/);
    const [r] = await sql`SELECT kode_hash, kedaluwarsa - dibuat AS umur FROM reset_password WHERE user_id = ${sari.id}`;
    assert.match(r.kode_hash, /^[0-9a-f]{64}$/);
    assert.ok(!r.kode_hash.includes(kode), "kode asli tidak disimpan");
    assert.equal(r.umur, 600);

    assert.equal(await LP.mintaOtp("sari@uji.test"), "terkirim"); // dalam 60 dtk: tidak dikirim lagi, kode lama tetap berlaku
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(smtp.masuk.length, 1);

    await assert.rejects(LP.verifikasiOtp("sari@uji.test", bukanKode(kode)), /Sisa 4 kali/);
    const [lama] = await sql`SELECT sesi_versi FROM users WHERE id = ${sari.id}`;
    await sql`UPDATE users SET gagal_login = 9, kunci_sampai = ${sekarang() + 900} WHERE id = ${sari.id}`;
    const token = await LP.verifikasiOtp("Sari@uji.test", ` ${kode.slice(0, 3)} ${kode.slice(3)} `);
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    await assert.rejects(LP.verifikasiOtp("sari@uji.test", kode), /kedaluwarsa/, "kode sekali pakai: tidak bisa dipakai lagi setelah benar");
    const [t] = await sql`SELECT token_hash FROM reset_password WHERE user_id = ${sari.id}`;
    assert.ok(t.token_hash && !t.token_hash.includes(token), "token asli tidak disimpan");
    assert.ok(!(await verifyPassword("PasswordBaru-123", (await sql`SELECT password_hash FROM users WHERE id = ${sari.id}`)[0].password_hash)), "kode benar saja belum mengganti password");
    await assert.rejects(LP.gantiPasswordDenganToken("sari@uji.test", token.slice(0, -1) + (token.at(-1) === "A" ? "B" : "A"), "PasswordBaru-123"), /kedaluwarsa/, "token palsu ditolak");
    await assert.rejects(LP.gantiPasswordDenganToken("budi@uji.test", token, "PasswordBaru-123"), /kedaluwarsa/, "token milik akun lain ditolak");
    const u = await LP.gantiPasswordDenganToken("Sari@uji.test", token, "PasswordBaru-123");
    assert.deepEqual([u.id, u.status], [sari.id, "aktif"]);
    const [s] = await sql`SELECT password_hash, sesi_versi, gagal_login, kunci_sampai FROM users WHERE id = ${sari.id}`;
    assert.ok(await verifyPassword("PasswordBaru-123", s.password_hash));
    assert.deepEqual([s.sesi_versi, s.gagal_login, s.kunci_sampai], [lama.sesi_versi + 1, 0, 0]);
    await assert.rejects(LP.gantiPasswordDenganToken("sari@uji.test", token, "PasswordLain-456"), /kedaluwarsa/, "token sekali pakai");
    await tungguEmail(2);
    assert.match(smtp.masuk[1].judul, /baru saja diganti/);

    // App Password salah: Gmail menjawab 535 -> galat yang jelas untuk log.
    smtp.atur.tolakLogin = true;
    await assert.rejects(EM.kirimEmail({ ke: "x@uji.test", judul: "uji", teks: "uji", html: "<p>uji</p>" }), /menolak login/);
  } finally {
    smtp.atur.tolakLogin = false;
    lepasSmtp();
  }
});

await cek("lupa password: 5 kode salah = hangus (kode benar pun ditolak), 10 tebakan serentak tidak melewati batas, kode kedaluwarsa ditolak", async () => {
  const LP = await lib("src/lib/lupa-password.ts");
  const kodeBaru = async () => {
    const n = smtp.masuk.length;
    await LP.mintaOtp("sari@uji.test");
    await tungguEmail(n + 1);
    return smtp.masuk.at(-1).judul.slice(0, 6);
  };
  pakaiSmtp();
  try {
    const k1 = await kodeBaru();
    for (let sisa = 4; sisa >= 1; sisa--) await assert.rejects(LP.verifikasiOtp("sari@uji.test", bukanKode(k1)), new RegExp(`Sisa ${sisa} kali`));
    await assert.rejects(LP.verifikasiOtp("sari@uji.test", bukanKode(k1)), /terlalu sering/);
    await assert.rejects(LP.verifikasiOtp("sari@uji.test", k1), /kedaluwarsa/);

    const k2 = await kodeBaru();
    const hasil = await Promise.allSettled(Array.from({ length: 10 }, () => LP.verifikasiOtp("sari@uji.test", bukanKode(k2))));
    assert.equal(hasil.filter((h) => h.status === "rejected" && /Sisa|terlalu sering/.test(h.reason.message)).length, 5, "tepat 5 tebakan yang dinilai");
    await assert.rejects(LP.verifikasiOtp("sari@uji.test", k2), /kedaluwarsa/);

    const k3 = await kodeBaru();
    await sql`UPDATE reset_password SET kedaluwarsa = ${sekarang() - 1} WHERE user_id = ${sari.id}`;
    await assert.rejects(LP.verifikasiOtp("sari@uji.test", k3), /kedaluwarsa/);
    await assert.rejects(LP.verifikasiOtp("sari@uji.test", "12345"), /6 digit/);
    // Token reset ikut kedaluwarsa (OTP.menit) bila halaman password baru dibiarkan terlalu lama.
    await sql`DELETE FROM reset_password WHERE user_id = ${sari.id}`;
    smtp.masuk.length = 0;
    const k4 = await kodeBaru();
    const tk = await LP.verifikasiOtp("sari@uji.test", k4);
    await sql`UPDATE reset_password SET token_kedaluwarsa = ${sekarang() - 1} WHERE user_id = ${sari.id}`;
    await assert.rejects(LP.gantiPasswordDenganToken("sari@uji.test", tk, "PasswordBaru-789"), /kedaluwarsa/);
  } finally {
    lepasSmtp();
    await smtp.berhenti();
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
  // Total per tab saring = jumlah baris yang benar-benar tampil di tab itu, dan ikut kata kunci pencarian.
  const total = await P.hitungPengguna();
  for (const f of ["semua", "aktif", "diblokir", "admin"]) assert.equal(total[f], (await P.daftarPengguna({ filter: f, batas: 100 })).daftar.length, `total tab ${f}`);
  assert.equal(total.semua, 4);
  assert.deepEqual(await P.hitungPengguna({ cari: "sar" }), { semua: 1, aktif: 1, diblokir: 0, admin: 0 });
  assert.equal((await P.hitungPengguna({ cari: "%" })).semua, 0);
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
  const msTotal = await ukur("hitungPengguna (total per tab, 20 rb akun)", () => P.hitungPengguna());
  assert.ok(msTotal < 30, `terlalu lambat: ${msTotal} ms`);
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
