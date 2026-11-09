// Uji asal pendaftar (atribusi industri LP & UTM): penyaringan nilai dari URL/cookie, cookie cg_asal dipasang proxy
// saat /daftar dibuka dari LP, kolom users.asal_* dibuat otomatis, dan tersimpan sekali (tidak ditimpa).
// Pakai: node --import ./uji/loader.mjs uji/uji-asal.mjs
import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { mulaiPg } from "./pg-lokal.mjs";

const akar = process.cwd();
const lib = (f) => import(pathToFileURL(path.join(akar, f)).href);
const { asalDariUrl, bacaAsal, kodeAsal, COOKIE_ASAL } = await lib("src/lib/asal-def.ts");
const q = (s) => new URLSearchParams(s);

// --- Penyaringan ---
const a = asalDariUrl(q("industry=laundry&landing_page=/laundry&paket=Bisnis&utm_source=meta&utm_campaign=Promo%20Nov&fbclid=IwAR0_ab-c.1"));
assert.deepEqual(a, { industri: "laundry", lp: "/laundry", utm: { utm_source: "meta", utm_campaign: "Promo Nov", fbclid: "IwAR0_ab-c.1", paket: "bisnis" } });
assert.deepEqual(bacaAsal(kodeAsal(a)), a, "cookie bolak-balik sama");
assert.equal(asalDariUrl(q("")), null, "tanpa parameter = tidak ada asal");
assert.equal(asalDariUrl(q("ref=abc&lanjut=/dashboard")), null, "parameter lain tidak dianggap asal");
const b = asalDariUrl(q("industry=pabrik-senjata&landing_page=https://jahat.test&utm_source=meta&gclid=<script>"));
assert.deepEqual(b, { industri: null, lp: null, utm: { utm_source: "meta" } }, "industri di luar daftar, LP bukan jalur lokal, click id aneh = dibuang");
assert.equal(asalDariUrl(q(`utm_campaign=${"x".repeat(500)}`)).utm.utm_campaign.length, 200, "nilai panjang dipotong");
assert.equal(asalDariUrl(q("utm_source=%01%02meta%0A")).utm.utm_source, "meta", "karakter kontrol dibuang");
assert.equal(bacaAsal("bukan json"), null);
assert.equal(bacaAsal("[1,2]"), null);
assert.equal(bacaAsal(JSON.stringify({ industry: "laundry", nyusup: "x" })).utm.nyusup, undefined, "kunci tak dikenal di cookie dibuang");
assert.equal(bacaAsal("x".repeat(3000)), null, "cookie kebesaran ditolak");

// --- Proxy memasang cookie di /daftar (dan tidak di halaman lain) ---
const { NextRequest } = await import("next/server.js");
const { proxy } = await lib("src/proxy.ts");
const r1 = await proxy(new NextRequest("http://localhost/daftar?industry=laundry&landing_page=/laundry&utm_source=meta"));
const c1 = r1.cookies.get(COOKIE_ASAL);
assert.ok(c1, "cookie cg_asal dipasang di /daftar");
assert.equal(bacaAsal(c1.value).industri, "laundry");
assert.ok(c1.httpOnly && c1.sameSite === "lax" && c1.maxAge === 30 * 24 * 60 * 60, "cookie httpOnly, lax, 30 hari");
assert.ok((await proxy(new NextRequest("http://localhost/login?utm_source=google"))).cookies.get(COOKIE_ASAL), "juga di /login (tombol Google)");
assert.equal((await proxy(new NextRequest("http://localhost/daftar"))).cookies.get(COOKIE_ASAL), undefined, "tanpa parameter tidak menimpa cookie lama");
assert.equal((await proxy(new NextRequest("http://localhost/lupa-password?utm_source=x"))).cookies.get(COOKIE_ASAL), undefined);

// --- Database: kolom dibuat otomatis, simpan sekali ---
const tmp = path.join(os.tmpdir(), "wa-uji-asal");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const pg = await mulaiPg({ dir: path.join(tmp, "pg"), sementara: true });
process.env.DATABASE_URL = pg.url;
process.env.DATA_DIR = path.join(tmp, "data-kosong");
try {
  const { db } = await lib("src/lib/db.ts");
  const { simpanAsal, asalAkun } = await lib("src/lib/asal.ts");
  const sql = await db();
  const kolom = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users' AND column_name LIKE 'asal_%' ORDER BY 1`;
  assert.deepEqual(kolom.map((k) => `${k.column_name}:${k.data_type}`), ["asal_industri:text", "asal_lp:text", "asal_utm:jsonb"]);
  const [u] = await sql`INSERT INTO users(email, nama, password_hash, created_at) VALUES ('a@uji.test', 'A', 'x', 1) RETURNING id`;
  const [v] = await sql`INSERT INTO users(email, nama, password_hash, created_at) VALUES ('b@uji.test', 'B', 'x', 1) RETURNING id`;
  assert.deepEqual(await asalAkun(u.id), { industri: null, lp: null, utm: null }, "akun tanpa asal");
  await simpanAsal(u.id, a);
  assert.deepEqual(await asalAkun(u.id), { industri: "laundry", lp: "/laundry", utm: a.utm });
  await simpanAsal(u.id, asalDariUrl(q("industry=bengkel")));
  assert.equal((await asalAkun(u.id)).industri, "laundry", "asal pertama tidak ditimpa");
  await simpanAsal(v.id, null);
  assert.deepEqual(await asalAkun(v.id), { industri: null, lp: null, utm: null }, "tanpa asal = tidak menulis apa pun");
  await simpanAsal(v.id, asalDariUrl(q("utm_source=tiktok")));
  assert.deepEqual(await asalAkun(v.id), { industri: null, lp: null, utm: { utm_source: "tiktok" } });
  await sql.end();
  console.log("uji-asal: penyaringan, cookie proxy, kolom otomatis, simpan sekali OK");
} finally {
  await pg.berhenti();
}
