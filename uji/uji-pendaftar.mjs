// Uji kartu pendaftar di hero landing: nama disamarkan, email/id tidak keluar, admin & akun diblokir tidak tampil,
// query memakai index tanpa sort, dan hasilnya dimemo (kunjungan landing tidak menambah query).
import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { mulaiPg } from "./pg-lokal.mjs";

const akar = process.cwd();
const tmp = path.join(os.tmpdir(), "wa-uji-pendaftar");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const pg = await mulaiPg({ dir: path.join(tmp, "pg"), sementara: true });
process.env.DATABASE_URL = pg.url;
process.env.DATA_DIR = path.join(tmp, "data-kosong");
const lib = (f) => import(pathToFileURL(path.join(akar, f)).href);

const { db } = await lib("src/lib/db.ts");
const { namaSamaran, pendaftarTerbaru } = await lib("src/lib/pendaftar.ts");

try {
  // --- Penyamaran nama ---
  assert.equal(namaSamaran("BUDI SANTOSO"), "Budi S.");
  assert.equal(namaSamaran("  siti   nur  aisyah "), "Siti N.");
  assert.equal(namaSamaran("Rendy"), "Rendy");
  assert.equal(namaSamaran("H. Ahmad Dahlan"), "Ahmad D.");
  assert.equal(namaSamaran("budi@gmail.com"), null);
  assert.equal(namaSamaran("08123456789"), null);
  assert.equal(namaSamaran("toko123"), null);
  assert.equal(namaSamaran("A"), null);
  assert.equal(namaSamaran("Namadepanyangterlalupanjang Sekali"), null);
  assert.equal(namaSamaran(""), null);

  // --- Data ---
  const sql = await db();
  await sql`
    INSERT INTO users(email, nama, password_hash, created_at)
    SELECT 'u' || g || '@contoh.test', 'Pengguna' || chr(65 + g % 26) || ' Santoso', 'x', 1700000000 + g FROM generate_series(1, 50000) g`;
  await sql`INSERT INTO users(email, nama, password_hash, peran, created_at) VALUES ('bos@contoh.test', 'Admin Rahasia', 'x', 'admin', 1800000000)`;
  await sql`INSERT INTO users(email, nama, password_hash, status, created_at) VALUES ('blokir@contoh.test', 'Blokir Rahasia', 'x', 'diblokir', 1800000000)`;
  await sql`INSERT INTO users(email, nama, password_hash, created_at) VALUES ('terbaru@contoh.test', 'Terbaru Sekali', 'x', 1800000000)`;
  await sql`ANALYZE users`;

  const mulai = performance.now();
  const daftar = await pendaftarTerbaru();
  const msPertama = performance.now() - mulai;
  assert.equal(daftar[0].nama, "Terbaru S.");
  assert.equal(daftar[0].detik, 1800000000);
  assert.ok(daftar.length <= 20);
  assert.equal(new Set(daftar.map((d) => d.nama)).size, daftar.length, "nama tidak kembar");

  const json = JSON.stringify(daftar);
  for (const bocor of ["Admin", "Blokir", "Santoso", "@contoh", "email", "password"]) assert.ok(!json.includes(bocor), `tidak boleh bocor: ${bocor}`);
  assert.deepEqual(Object.keys(daftar[0]).sort(), ["detik", "nama"]);

  // --- Memo: baris baru belum tampil, berarti tidak ada query kedua ---
  await sql`INSERT INTO users(email, nama, password_hash, created_at) VALUES ('baru2@contoh.test', 'Belumtampil Dulu', 'x', 1800000001)`;
  const mulai2 = performance.now();
  const lagi = await pendaftarTerbaru();
  const msMemo = performance.now() - mulai2;
  assert.equal(lagi[0].nama, "Terbaru S.");

  // --- Rencana query ---
  const rencana = await sql.unsafe(`EXPLAIN (ANALYZE, BUFFERS)
    SELECT nama, created_at FROM users WHERE status = 'aktif' AND peran = 'user' AND nama <> '' ORDER BY id DESC LIMIT 40`);
  const teks = rencana.map((r) => r["QUERY PLAN"]).join("\n");
  assert.match(teks, /Index Scan/, "harus memakai index");
  assert.doesNotMatch(teks, /Sort|Seq Scan/, "tanpa sort & seq scan");

  const waktu = teks.match(/Execution Time: ([\d.]+) ms/)?.[1];
  const penyangga = teks.match(/Buffers: shared hit=(\d+)/)?.[1];
  console.log(`50.003 baris: eksekusi ${waktu} ms, ${penyangga} buffer; panggilan pertama ${msPertama.toFixed(1)} ms, memo ${msMemo.toFixed(3)} ms; payload ${Buffer.byteLength(JSON.stringify({ daftar }))} byte`);
  console.log("LULUS uji-pendaftar");
} finally {
  (await db()).end?.().catch?.(() => {});
  await pg.berhenti();
}
process.exit(0);
