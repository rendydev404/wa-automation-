// Uji penyimpanan sesi Baileys di PostgreSQL: kebenaran, urutan tulis, rencana query, dan kecepatan.
// Memakai PostgreSQL 15 sungguhan yang dijalankan sementara di mesin ini (uji/pg-lokal.mjs).
// Pakai (dari akar proyek): node --import ./uji/loader.mjs uji/uji-auth.mjs
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { mulaiPg } from "./pg-lokal.mjs";

const akar = process.cwd();
const tmp = path.join(os.tmpdir(), "wa-uji-auth");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const pg = await mulaiPg({ dir: path.join(tmp, "pg"), sementara: true });
process.env.DATABASE_URL = pg.url;
process.env.DATA_DIR = path.join(tmp, "data-kosong");
const lib = (f) => import(pathToFileURL(path.join(akar, f)).href);

const B = await lib("node_modules/baileys/lib/index.js");
const { db } = await lib("src/lib/db.ts");
const { bukaAuth, hapusAuth, sesiTerpasang, rapikanAuthYatim, cacheKunci, tungguTulis, SQL_SESI_TERPASANG } = await lib("src/lib/wa-auth.ts");
const { tambahNomor } = await lib("src/lib/numbers.ts");
const sql = await db();

let lolos = 0;
const cek = async (nama, fn) => {
  await fn();
  lolos += 1;
  console.log(`  ok  ${nama}`);
};
const jumlah = async (sesi) => (await sql`SELECT COUNT(*) AS n FROM wa_auth WHERE sesi = ${sesi}`)[0].n;

console.log("== kebenaran ==");
const n1 = await tambahNomor("uji-1");
const n2 = await tambahNomor("uji-2");

await cek("skema dibuat oleh migrasi; app berjalan sebagai role biasa (bukan superuser)", async () => {
  assert.equal((await sql`SELECT MAX(versi) AS v FROM skema_versi`)[0].v, 35);
  const tabel = (await sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`).map((r) => r.tablename);
  assert.deepEqual(tabel, ["admin_log", "afiliator", "ai_pakai", "analitik_harian", "api_aplikasi", "api_idempoten", "api_instalasi", "api_kirim_lisensi", "api_kunci", "chat_state", "chunks", "documents", "followup", "followup_stop", "komisi_afiliasi", "kuota_bonus", "langganan", "mesin_lisensi", "ml_contoh", "ml_nomor", "ml_potongan", "notifikasi", "numbers", "paket", "pelajaran", "penarikan_afiliasi", "pengembalian_dana", "percakapan", "pesan_chat", "pesan_keluar", "produk", "push_langganan", "reset_password", "settings", "skema_versi", "stats", "teruskan", "transaksi", "users", "wa_auth", "webhook_antrean", "webhook_tujuan"]);
  assert.equal((await sql`SELECT rolsuper FROM pg_roles WHERE rolname = current_user`)[0].rolsuper, false);
  assert.match(n1.sesi, new RegExp(`^n${n1.id}x[0-9a-f]{8}$`));
  assert.equal(n2.id, n1.id + 1);
});

await cek("kredensial baru bila belum ada, lalu tersimpan & terbaca sama persis", async () => {
  const a = await bukaAuth(B, n1.sesi);
  assert.equal(a.creds.me, undefined);
  a.creds.me = { id: "6281234567890:7@s.whatsapp.net", lid: "99887766:7@lid", name: "Toko Uji" };
  a.simpanCreds();
  const b = await bukaAuth(B, n1.sesi); // antre di belakang tulis di atas
  assert.deepEqual(b.creds.me, a.creds.me);
  assert.ok(Buffer.isBuffer(b.creds.noiseKey.private));
  assert.deepEqual(Buffer.from(b.creds.noiseKey.private), Buffer.from(a.creds.noiseKey.private));
  assert.deepEqual(Buffer.from(b.creds.signedPreKey.signature), Buffer.from(a.creds.signedPreKey.signature));
  assert.equal(b.creds.registrationId, a.creds.registrationId);
});

await cek("pemetaan LID milik nomor sendiri yang rusak (bug hook lama) dirapikan saat sesi dibuka; pemetaan pelanggan utuh", async () => {
  // n1: PN 6281234567890, LID 99887766 (dari uji di atas). Pola kerusakan sama dengan yang ditemukan di produksi.
  const teks = (v) => JSON.stringify(v);
  await sql`INSERT INTO wa_auth(sesi, kunci, teks) VALUES
    (${n1.sesi}, 'lid-mapping:628138321263', ${teks("99887766")}),
    (${n1.sesi}, 'lid-mapping:99887766_reverse', ${teks("6285718546991")}),
    (${n1.sesi}, 'lid-mapping:555123_reverse', ${teks("6281234567890")}),
    (${n1.sesi}, 'lid-mapping:628999', ${teks("555999")}),
    (${n1.sesi}, 'lid-mapping:555999_reverse', ${teks("628999")})
    ON CONFLICT (sesi, kunci) DO UPDATE SET teks = EXCLUDED.teks`;
  await bukaAuth(B, n1.sesi);
  const peta = Object.fromEntries((await sql`SELECT kunci, teks FROM wa_auth WHERE sesi = ${n1.sesi} AND kunci LIKE 'lid-mapping:%'`).map((r) => [r.kunci, JSON.parse(r.teks)]));
  assert.deepEqual(peta, {
    "lid-mapping:6281234567890": "99887766",
    "lid-mapping:99887766_reverse": "6281234567890",
    "lid-mapping:628999": "555999",
    "lid-mapping:555999_reverse": "628999",
  });
  // Sudah rapi = tidak ada tulisan lagi (dibuka berkali-kali saat sambung ulang).
  const sebelum = (await sql`SELECT xmin::text AS x FROM wa_auth WHERE sesi = ${n1.sesi} AND kunci = 'lid-mapping:6281234567890'`)[0].x;
  await bukaAuth(B, n1.sesi);
  assert.equal((await sql`SELECT xmin::text AS x FROM wa_auth WHERE sesi = ${n1.sesi} AND kunci = 'lid-mapping:6281234567890'`)[0].x, sebelum);
  await sql`DELETE FROM wa_auth WHERE sesi = ${n1.sesi} AND kunci LIKE 'lid-mapping:%'`;
});

const a1 = await bukaAuth(B, n1.sesi); // penulis (cache-nya terisi)
const dingin = async () => (await bukaAuth(B, n1.sesi)).keys; // pembaca ber-cache kosong: selalu dari database
const sesiBiner = randomBytes(900);
const preKey = { private: randomBytes(32), public: randomBytes(32) };
const appKey = B.proto.Message.AppStateSyncKeyData.fromObject({ keyData: randomBytes(32), timestamp: 123 });

await cek("set campuran tipe; get satu / banyak, dari cache maupun dari database", async () => {
  await a1.keys.set({
    session: { "628111.0": sesiBiner, "628222.0": randomBytes(10) },
    "pre-key": { 1: preKey, 2: preKey, 3: preKey },
    "app-state-sync-key": { AAAA: appKey },
    "lid-mapping": { 628111: "5550001", "5550001_reverse": "628111" },
    "device-list": { 628111: ["0", "3"] },
  });
  for (const [nama, k] of [
    ["cache", a1.keys],
    ["database", await dingin()],
  ]) {
    const s = await k.get("session", ["628111.0"]);
    assert.ok(Buffer.isBuffer(s["628111.0"]), nama);
    assert.deepEqual(Buffer.from(s["628111.0"]), sesiBiner, nama);
    const p = await k.get("pre-key", ["1", "2", "3", "404"]);
    assert.deepEqual(Object.keys(p).sort(), ["1", "2", "3"], nama);
    assert.deepEqual(Buffer.from(p["2"].public), preKey.public, nama);
    assert.ok(Buffer.isBuffer(p["2"].private), nama);
    const ak = await k.get("app-state-sync-key", ["AAAA"]);
    assert.deepEqual(Buffer.from(ak.AAAA.keyData), Buffer.from(appKey.keyData), nama);
    assert.equal(typeof ak.AAAA.toJSON, "function", nama); // objek proto, seperti yang diharapkan Baileys
    assert.equal((await k.get("lid-mapping", ["628111"]))["628111"], "5550001", nama);
    assert.deepEqual((await k.get("device-list", ["628111"]))["628111"], ["0", "3"], nama);
    assert.deepEqual(await k.get("session", []), {}, nama);
  }
});

await cek("kunci biner disimpan sebagai bytea mentah, sisanya teks", async () => {
  const t = async (k) => (await sql`SELECT octet_length(biner) AS b, teks IS NOT NULL AS t FROM wa_auth WHERE sesi = ${n1.sesi} AND kunci = ${k}`)[0];
  assert.deepEqual({ ...(await t("session:628111.0")) }, { b: 900, t: false });
  assert.deepEqual({ ...(await t("pre-key:1")) }, { b: null, t: true });
  assert.deepEqual({ ...(await t("creds")) }, { b: null, t: true });
});

await cek("null menghapus kunci (cache & database); sesi lain tidak tersentuh", async () => {
  const a2 = await bukaAuth(B, n2.sesi);
  await a2.keys.set({ session: { "628111.0": randomBytes(5) } });
  await a1.keys.set({ session: { "628111.0": null }, "pre-key": { 1: null } });
  for (const k of [a1.keys, await dingin()]) {
    const s = await k.get("session", ["628111.0", "628222.0"]);
    assert.equal(s["628111.0"] ?? null, null);
    assert.equal(s["628222.0"].length, 10);
    const p = await k.get("pre-key", ["1", "2", "3"]);
    assert.deepEqual(Object.keys(p).filter((i) => p[i]).sort(), ["2", "3"]);
  }
  assert.equal((await sql`SELECT COUNT(*) AS n FROM wa_auth WHERE sesi = ${n1.sesi} AND kunci IN ('session:628111.0', 'pre-key:1')`)[0].n, 0);
  assert.equal((await (await bukaAuth(B, n2.sesi)).keys.get("session", ["628111.0"]))["628111.0"].length, 5);
});

await cek("nilai yang ditimpa: cache dan database sama-sama berisi yang terbaru", async () => {
  const baru = randomBytes(1200);
  await a1.keys.set({ session: { "628222.0": baru } });
  assert.deepEqual(Buffer.from((await a1.keys.get("session", ["628222.0"]))["628222.0"]), baru);
  assert.deepEqual(Buffer.from((await (await dingin()).get("session", ["628222.0"]))["628222.0"]), baru);
});

await cek("tulis besar sekaligus (812 pre-key saat pairing + hapus) tersimpan lengkap", async () => {
  const banyak = Object.fromEntries(Array.from({ length: 812 }, (_, i) => [i + 1000, { private: randomBytes(32), public: randomBytes(32) }]));
  await a1.keys.set({ "pre-key": { ...banyak, 2: null } });
  assert.equal((await sql`SELECT COUNT(*) AS n FROM wa_auth WHERE sesi = ${n1.sesi} AND kunci LIKE 'pre-key:%'`)[0].n, 813); // 812 baru + nomor 3
  const k = await (await dingin()).get("pre-key", ["1000", "1811", "2"]);
  assert.deepEqual(Buffer.from(k["1811"].public), banyak[1811].public);
  assert.equal(k["2"] ?? null, null);
});

await cek("urutan tulis terjaga: kredensial dibekukan saat dipanggil; logout menang atas tulis sebelumnya", async () => {
  const a = await bukaAuth(B, n2.sesi);
  a.creds.me = { id: "111:1@s.whatsapp.net" };
  a.simpanCreds();
  a.creds.me = { id: "222:1@s.whatsapp.net" }; // berubah SETELAH simpanCreds dipanggil
  assert.equal((await bukaAuth(B, n2.sesi)).creds.me.id, "111:1@s.whatsapp.net");
  a.simpanCreds();
  void a.keys.set({ session: { x: randomBytes(8) } });
  const hapus = hapusAuth(n2.sesi); // diantrekan paling akhir
  const sesudah = bukaAuth(B, n2.sesi); // dan pembukaan berikutnya antre di belakangnya
  await hapus;
  assert.equal(await jumlah(n2.sesi), 0);
  assert.equal((await sesudah).creds.me, undefined);
});

await cek("cacheKunci: LRU berbatas jumlah, tanpa timer", () => {
  const sebelum = process.getActiveResourcesInfo().filter((r) => r === "Timeout").length;
  const c = cacheKunci(3);
  c.set("a", 1);
  c.set("b", 2);
  c.set("c", null); // "diketahui sudah dihapus" juga di-cache
  assert.equal(c.get("a"), 1); // a jadi yang paling baru dipakai
  c.set("d", 4); // melampaui batas: yang terlama (b) dibuang
  assert.equal(c.get("b"), undefined);
  assert.equal(c.get("a"), 1);
  assert.equal(c.get("c"), null);
  assert.equal(c.get("d"), 4);
  c.del("d");
  assert.equal(c.get("d"), undefined);
  c.flushAll();
  assert.equal(c.get("a"), undefined);
  assert.equal(process.getActiveResourcesInfo().filter((r) => r === "Timeout").length, sebelum);
});

await cek("sesiTerpasang hanya sesi yang punya identitas `me`", async () => {
  (await bukaAuth(B, n2.sesi)).simpanCreds(); // n2: kredensial ada tetapi belum dipasangkan
  await tungguTulis(n2.sesi);
  assert.deepEqual(await sesiTerpasang(), [n1.sesi]);
});

await cek("rapikanAuthYatim membuang sesi tanpa nomor; hapusAuth membuang satu sesi", async () => {
  (await bukaAuth(B, "yatim")).simpanCreds();
  await tungguTulis("yatim");
  assert.equal(await jumlah("yatim"), 1);
  await rapikanAuthYatim();
  assert.equal(await jumlah("yatim"), 0);
  await hapusAuth(n2.sesi);
  assert.equal(await jumlah(n2.sesi), 0);
  assert.ok((await jumlah(n1.sesi)) > 0);
});

// ---------------------------------------------------------------------------------------------
console.log("\n== rencana query pada data seukuran 10 nomor (EXPLAIN ANALYZE, BUFFERS) ==");
const pk = JSON.stringify({ private: randomBytes(32).toString("base64"), public: randomBytes(32).toString("base64") });
const nomorBesar = [];
for (let n = 0; n < 10; n++) nomorBesar.push(await tambahNomor(`besar-${n}`));
for (const n of nomorBesar) {
  const baris = [];
  for (let i = 0; i < 812; i++) baris.push({ sesi: n.sesi, kunci: `pre-key:${i}`, biner: null, teks: pk });
  for (let i = 0; i < 1000; i++) baris.push({ sesi: n.sesi, kunci: `session:6281${i}.0`, biner: randomBytes(1500), teks: null });
  for (let i = 0; i < 400; i++) baris.push({ sesi: n.sesi, kunci: `lid-mapping:6281${i}`, biner: null, teks: `"555${i}"` });
  baris.push({ sesi: n.sesi, kunci: "creds", biner: null, teks: JSON.stringify({ me: { id: `62${n.id}:1@s.whatsapp.net` } }) });
  for (let i = 0; i < baris.length; i += 1000) await sql`INSERT INTO wa_auth ${sql(baris.slice(i, i + 1000), "sesi", "kunci", "biner", "teks")}`;
}
await pg_admin("VACUUM ANALYZE wa_auth");
async function pg_admin(q) {
  const { default: postgres } = await lib("node_modules/postgres/src/index.js");
  const admin = postgres(pg.urlAdmin, { max: 1, onnotice() {} });
  await admin.unsafe(q);
  await admin.end();
}
const s0 = nomorBesar[4].sesi;
async function rencana(nama, q, params = []) {
  const baris = await sql.unsafe(`EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING ON) ${q}`, params);
  const teks = baris.map((r) => r["QUERY PLAN"]).join("\n");
  const node = teks.split("\n").filter((l) => /Scan|Insert|Nested|Hash|Sort|Limit|Result/.test(l)).map((l) => l.trim().replace(/^->\s*/, "").replace(/ \(actual.*$/, "")).slice(0, 4).join("  >  ");
  const waktu = /Execution Time: ([\d.]+) ms/.exec(teks)?.[1];
  const buf = /Buffers: ([^\n]+)/.exec(teks)?.[1] ?? "-";
  console.log(`  ${nama.padEnd(26)} ${String(waktu).padStart(7)} ms | ${buf.padEnd(34)} | ${node}`);
  return teks;
}
const jumlahBaris = (await sql`SELECT COUNT(*) AS n, pg_size_pretty(pg_total_relation_size('wa_auth')) AS ukuran FROM wa_auth`)[0];
console.log(`  (tabel wa_auth: ${jumlahBaris.n} baris, ${jumlahBaris.ukuran} termasuk indeks & TOAST)`);
const r1 = await rencana("baca 1 kunci", "SELECT kunci, biner, teks FROM wa_auth WHERE sesi = $1 AND kunci = ANY($2)", [s0, ["session:6281500.0"]]);
const r2 = await rencana("baca 20 kunci", "SELECT kunci, biner, teks FROM wa_auth WHERE sesi = $1 AND kunci = ANY($2)", [s0, Array.from({ length: 20 }, (_, i) => `pre-key:${i * 7}`)]);
const r3 = await rencana("timpa 1 kunci (upsert)", "INSERT INTO wa_auth(sesi, kunci, biner, teks) VALUES ($1, $2, $3, NULL) ON CONFLICT (sesi, kunci) DO UPDATE SET biner = EXCLUDED.biner, teks = EXCLUDED.teks", [s0, "session:6281500.0", randomBytes(1500)]);
const r4 = await rencana("kredensial 1 sesi", "SELECT teks FROM wa_auth WHERE sesi = $1 AND kunci = 'creds'", [s0]);
const r5 = await rencana("sesiTerpasang (saat boot)", SQL_SESI_TERPASANG);
await cek("semua lewat indeks primary key wa_auth, tanpa memindai tabel", () => {
  for (const r of [r1, r2, r4, r5]) assert.match(r, /Index Scan (using|on) wa_auth_pkey/); // termasuk "Bitmap Index Scan on"
  for (const r of [r1, r2, r3, r4, r5]) assert.doesNotMatch(r, /Seq Scan on wa_auth/);
});
await cek("menimpa kunci tidak menyentuh indeks (HOT update) dan tabel tidak membengkak", async () => {
  // Satu koneksi khusus: statistik PostgreSQL dicatat per koneksi dan dikirim atas permintaan.
  const { default: postgres } = await lib("node_modules/postgres/src/index.js");
  const satu = postgres(pg.url, { max: 1, onnotice() {} });
  const baca = async () => (await satu`SELECT pg_stat_force_next_flush()`, (await satu`SELECT n_tup_upd, n_tup_hot_upd, pg_relation_size('wa_auth') AS ukuran FROM pg_stat_user_tables WHERE relname = 'wa_auth'`)[0]);
  const a = await baca();
  for (let i = 0; i < 3000; i++) {
    // pernyataan yang sama dengan yang dijalankan wa-auth.ts untuk tiap pesan
    await satu`INSERT INTO wa_auth(sesi, kunci, biner, teks) VALUES (${s0}, ${`session:6281${(i * 37) % 1000}.0`}, ${randomBytes(1500)}, NULL)
               ON CONFLICT (sesi, kunci) DO UPDATE SET biner = EXCLUDED.biner, teks = EXCLUDED.teks`;
  }
  const b = await baca();
  await satu.end();
  const upd = b.n_tup_upd - a.n_tup_upd;
  const hot = b.n_tup_hot_upd - a.n_tup_hot_upd;
  console.log(`        (${upd} pembaruan, ${Math.round((hot / upd) * 100)}% HOT; ukuran tabel ${(a.ukuran / 1048576).toFixed(1)} MB -> ${(b.ukuran / 1048576).toFixed(1)} MB)`);
  assert.equal(upd, 3000);
  assert.ok(hot / upd > 0.95, `HOT ${hot}/${upd}`);
  assert.ok(b.ukuran <= a.ukuran * 1.05, "tabel tidak membengkak");
});

// ---------------------------------------------------------------------------------------------
console.log("\n== kecepatan lewat jalur yang dipakai app (cache + PostgreSQL lokal) vs berkas per kunci bawaan Baileys ==");
const ukur = async (fn) => {
  const t = performance.now();
  await fn();
  return performance.now() - t;
};
const N = 1000;
const banyakPreKey = Object.fromEntries(Array.from({ length: 812 }, (_, i) => [i + 5000, { private: randomBytes(32), public: randomBytes(32) }]));
const idSesi = Array.from({ length: N }, (_, i) => `62899${i}.0`);
const sesi15 = randomBytes(1500);

async function bangku(nama, tulis, bacaDingin) {
  const sisip = await ukur(async () => {
    for (const id of idSesi) await tulis.set({ session: { [id]: sesi15 } });
  });
  const timpa = await ukur(async () => {
    for (let i = 0; i < N; i++) await tulis.set({ session: { [idSesi[(i * 7) % 300]]: sesi15 } });
  });
  const massal = await ukur(() => tulis.set({ "pre-key": banyakPreKey }));
  const k1 = await bacaDingin();
  const baca = await ukur(async () => {
    for (const id of idSesi) await k1.get("session", [id]);
  });
  const k2 = await bacaDingin();
  const baca20 = await ukur(async () => {
    for (let i = 0; i < 50; i++) await k2.get("session", idSesi.slice(i * 20, i * 20 + 20));
  });
  const hangat = await ukur(async () => {
    for (let i = 0; i < N; i++) await tulis.get("session", [idSesi[(i * 7) % 300]]);
  });
  const u = (ms, n) => ((ms / n) * 1000).toFixed(0).padStart(5);
  console.log(
    `  ${nama.padEnd(22)} sisip kunci baru ${u(sisip, N)} µs | timpa kunci ${u(timpa, N)} µs | 812 pre-key ${massal.toFixed(1).padStart(6)} ms | baca dari penyimpanan ${u(baca, N)} µs | baca 20 kunci ${u(baca20, 50)} µs | baca dari cache ${u(hangat, N)} µs`
  );
  return { sisip, timpa, massal, baca, baca20 };
}

const sB = nomorBesar[0].sesi;
const hasilPg = await bangku("PostgreSQL (wa-auth.ts)", (await bukaAuth(B, sB)).keys, async () => (await bukaAuth(B, sB)).keys);
const dirBerkas = path.join(tmp, "multi-file");
mkdirSync(dirBerkas, { recursive: true });
const mf = (await B.useMultiFileAuthState(dirBerkas)).state.keys;
const hasilBerkas = await bangku("berkas per kunci", B.makeCacheableSignalKeyStore(mf), async () => B.makeCacheableSignalKeyStore(mf));
const kali = (k) => (hasilBerkas[k] / hasilPg[k]).toFixed(1);
console.log(`  -> dibanding berkas per kunci: sisip ${kali("sisip")}x, timpa ${kali("timpa")}x, tulis massal ${kali("massal")}x, baca ${kali("baca")}x, baca banyak ${kali("baca20")}x lebih cepat (${readdirSync(dirBerkas).length} berkas vs 1 tabel)`);

console.log(`\nLOLOS ${lolos} pemeriksaan`);
await sql.end({ timeout: 2 });
await pg.berhenti();
process.exit(0);
