// Uji push notification admin (src/lib/push.ts): pesan benar-benar dienkripsi & dikirim ke "layanan push" tiruan
// (server HTTPS lokal), isinya didekripsi dengan kunci perangkat, hanya admin aktif yang menerima, perangkat basi
// (410) dibuang, dan notifikasi untuk pengguna tanpa perangkat tidak menambah query.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import https from "node:https";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { mulaiPg } from "./pg-lokal.mjs";

const akar = process.cwd();
const tmp = path.join(os.tmpdir(), "wa-uji-push");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const pg = await mulaiPg({ dir: path.join(tmp, "pg"), sementara: true });
process.env.DATABASE_URL = pg.url;
process.env.DATA_DIR = path.join(tmp, "data-kosong");
process.env.APP_URL = "https://chatgercep.test";
const lib = (f) => import(pathToFileURL(path.join(akar, f)).href);
const ece = createRequire(path.join(akar, "package.json"))("http_ece");

// Layanan push tiruan: sertifikat sendiri, jadi TLS untuk proses uji ini tidak diverifikasi.
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-subj", "/CN=127.0.0.1", "-days", "1", "-keyout", path.join(tmp, "k.pem"), "-out", path.join(tmp, "c.pem")], { stdio: "ignore" });
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const diterima = [];
let balasan = 201;
const server = https.createServer({ key: readFileSync(path.join(tmp, "k.pem")), cert: readFileSync(path.join(tmp, "c.pem")) }, (req, res) => {
  const potong = [];
  req.on("data", (c) => potong.push(c));
  req.on("end", () => {
    diterima.push({ jalur: req.url, headers: req.headers, badan: Buffer.concat(potong) });
    res.statusCode = balasan;
    res.end();
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const asal = `https://127.0.0.1:${server.address().port}`;

/** Perangkat tiruan: pasangan kunci ECDH P-256 + rahasia auth, seperti PushSubscription di browser. */
function perangkat(nama) {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  return {
    ecdh,
    auth,
    langganan: { endpoint: `${asal}/kirim/${nama}`, keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: auth.toString("base64url") } },
  };
}
const buka = (p, badan) => JSON.parse(ece.decrypt(badan, { version: "aes128gcm", privateKey: p.ecdh, authSecret: p.auth }).toString("utf8"));

const { db } = await lib("src/lib/db.ts");
const push = await lib("src/lib/push.ts");
const { kirimNotif, notifPendaftarBaru } = await lib("src/lib/notifikasi.ts");

try {
  const sql = await db();
  const [admin] = await sql`INSERT INTO users(email, nama, password_hash, peran, created_at) VALUES ('admin@contoh.test', 'Admin', 'x', 'admin', 1) RETURNING id`;
  const [admin2] = await sql`INSERT INTO users(email, nama, password_hash, peran, created_at) VALUES ('admin2@contoh.test', 'Admin Dua', 'x', 'admin', 1) RETURNING id`;
  const [biasa] = await sql`INSERT INTO users(email, nama, password_hash, created_at) VALUES ('biasa@contoh.test', 'Biasa', 'x', 1) RETURNING id`;

  // --- Validasi bentuk langganan ---
  assert.equal(push.uraiLangganan(null), null);
  assert.equal(push.uraiLangganan({ endpoint: "http://tidak-aman", keys: { p256dh: "a", auth: "b" } }), null);
  assert.equal(push.uraiLangganan({ endpoint: "https://x", keys: { p256dh: "a" } }), null);
  assert.ok(push.uraiLangganan(perangkat("cek").langganan));

  // --- Kunci VAPID dibuat sekali & menetap ---
  const kunci = await push.kunciPublikPush();
  assert.match(kunci, /^[A-Za-z0-9_-]{80,90}$/);
  const [simpan] = await sql`SELECT nilai FROM settings WHERE kunci = 'push_vapid'`;
  assert.equal(JSON.parse(simpan.nilai).publicKey, kunci);

  // --- Admin dengan dua perangkat; admin kedua & pengguna biasa tanpa perangkat ---
  const hp = perangkat("hp");
  const laptop = perangkat("laptop");
  const idHp = await push.simpanLangganan(admin.id, hp.langganan, "HP Android");
  await push.simpanLangganan(admin.id, laptop.langganan, "Laptop");
  // Mendaftar ulang endpoint yang sama tidak membuat baris dobel.
  assert.equal(await push.simpanLangganan(admin.id, hp.langganan, "HP Android"), idHp);
  assert.equal((await sql`SELECT COUNT(*)::int AS n FROM push_langganan`)[0].n, 2);

  // --- Peristiwa admin (pendaftar baru) -> push ke kedua perangkat admin, isi terenkripsi & benar ---
  notifPendaftarBaru(biasa.id, "biasa@contoh.test", "google");
  for (let i = 0; i < 100 && diterima.length < 2; i++) await new Promise((r) => setTimeout(r, 20));
  assert.equal(diterima.length, 2, "dua perangkat admin menerima");
  const keHp = diterima.find((d) => d.jalur === "/kirim/hp");
  assert.equal(keHp.headers["content-encoding"], "aes128gcm");
  assert.equal(keHp.headers.urgency, "high");
  assert.match(keHp.headers.authorization, /^vapid t=.+, k=/);
  assert.ok(!keHp.badan.toString("latin1").includes("biasa@contoh.test"), "isi tidak terbaca tanpa kunci perangkat");
  const isi = buka(hp, keHp.badan);
  assert.equal(isi.judul, "Pendaftar baru: biasa@contoh.test");
  assert.equal(isi.isi, "Mendaftar dengan Google.");
  assert.equal(isi.tautan, `/admin/pengguna/${biasa.id}`);
  const [notifAdmin] = await sql`SELECT id::int AS id FROM notifikasi WHERE user_id = ${admin.id}`;
  assert.equal(isi.id, notifAdmin.id, "id notifikasi ikut, untuk ditandai dibaca saat diklik");
  assert.equal(buka(laptop, diterima.find((d) => d.jalur === "/kirim/laptop").badan).judul, isi.judul);
  // Admin kedua tetap dapat notifikasi lonceng walau tanpa perangkat push.
  assert.equal((await sql`SELECT COUNT(*)::int AS n FROM notifikasi WHERE user_id = ${admin2.id}`)[0].n, 1);

  // --- Notifikasi untuk pengguna tanpa perangkat: tidak ada pengiriman dan tidak ada query push ---
  diterima.length = 0;
  const t0 = performance.now();
  const kosong = await push.kirimPush([biasa.id, admin2.id], { judul: "x" });
  const msKosong = performance.now() - t0;
  assert.deepEqual(kosong, { terkirim: 0, gagal: 0 });
  assert.ok(msKosong < 5, `tanpa perangkat harus instan dari memori (${msKosong.toFixed(2)} ms)`);
  await kirimNotif(biasa.id, { jenis: "kuota", judul: { id: "Kuota", en: "Quota" } });
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(diterima.length, 0);

  // --- Perangkat milik non-admin tidak pernah dikirimi (walau barisnya ada) ---
  const nakal = perangkat("nakal");
  await push.simpanLangganan(biasa.id, nakal.langganan, null);
  assert.deepEqual(await push.kirimPush([biasa.id], { judul: "x" }), { terkirim: 0, gagal: 0 });

  // --- Admin yang diturunkan / diblokir berhenti menerima ---
  await sql`UPDATE users SET status = 'diblokir' WHERE id = ${admin.id}`;
  assert.deepEqual(await push.kirimPush([admin.id], { judul: "x" }), { terkirim: 0, gagal: 0 });
  await sql`UPDATE users SET status = 'aktif' WHERE id = ${admin.id}`;
  assert.equal(diterima.length, 0);

  // --- Perangkat basi (410 Gone) dibuang otomatis ---
  balasan = 410;
  assert.deepEqual(await push.kirimPush([admin.id], { judul: "Basi" }), { terkirim: 0, gagal: 2 });
  assert.equal((await sql`SELECT COUNT(*)::int AS n FROM push_langganan WHERE user_id = ${admin.id}`)[0].n, 0);
  balasan = 201;

  // --- Hapus lewat endpoint / id hanya untuk pemiliknya; batas 10 perangkat per akun ---
  const idLagi = await push.simpanLangganan(admin.id, hp.langganan, null);
  await push.hapusLangganan(admin2.id, { id: idLagi });
  assert.equal((await sql`SELECT COUNT(*)::int AS n FROM push_langganan WHERE id = ${idLagi}`)[0].n, 1, "admin lain tidak bisa menghapus");
  await push.hapusLangganan(admin.id, { id: idLagi });
  assert.equal((await sql`SELECT COUNT(*)::int AS n FROM push_langganan WHERE id = ${idLagi}`)[0].n, 0);
  for (let i = 0; i < 12; i++) await push.simpanLangganan(admin.id, perangkat(`p${i}`).langganan, null);
  assert.equal((await sql`SELECT COUNT(*)::int AS n FROM push_langganan WHERE user_id = ${admin.id}`)[0].n, 10);

  console.log(`pengguna tanpa perangkat: ${msKosong.toFixed(3)} ms tanpa query; payload terenkripsi ${keHp.badan.length} byte`);
  console.log("LULUS uji-push");
} finally {
  server.close();
  (await db()).end?.().catch?.(() => {});
  await pg.berhenti();
}
process.exit(0);
