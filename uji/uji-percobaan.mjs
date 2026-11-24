// Uji free trial yang diatur admin (langganan.ts aturanPercobaan + numbers.catatPercobaan): mati bawaan, mulai saat
// nomor WhatsApp pertama tersambung (atau sejak daftar), masa berlaku & berakhir, satu trial per nomor WhatsApp
// (termasuk nomor dari akun yang sudah dihapus), akun berbayar/staf, dan teks ringkas trial.
// PostgreSQL 15 sungguhan. Pakai: node --import ./uji/loader.mjs uji/uji-percobaan.mjs
import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { mulaiPg } from "./pg-lokal.mjs";

const akar = process.cwd();
const tmp = path.join(os.tmpdir(), "wa-uji-percobaan");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const pg = await mulaiPg({ dir: path.join(tmp, "pg"), sementara: true });
process.env.DATABASE_URL = pg.url;
process.env.DATA_DIR = path.join(tmp, "kosong");
process.env.AUTH_SECRET = "p".repeat(48);
const lib = (f) => import(pathToFileURL(path.join(akar, f)).href);

const { db, sekarang, setSetting } = await lib("src/lib/db.ts");
const L = await lib("src/lib/langganan.ts");
const P = await lib("src/lib/pengguna.ts");
const N = await lib("src/lib/numbers.ts");
const T = await lib("src/lib/percobaan-def.ts");
const sql = await db();

let lolos = 0;
const cek = async (nama, fn) => {
  await fn();
  lolos += 1;
  console.log(`  ok  ${nama}`);
};

let urut = 0;
const akun = async (peran = "user") => {
  const u = await P.buatAkun({ email: `u${++urut}@uji.test`, nama: `U${urut}`, password: "rahasia-uji-01", peran });
  return { ...u, peran };
};
const sambung = async (u, wa) => {
  const n = await N.tambahNomor(`Nomor ${wa}`, u.id);
  await N.catatTerhubung(n.id, wa, null);
  return n;
};
const hak = (u) => L.hakAkun(u);
const atur = async ({ balasan = 50, hari = 3, mulai = "tersambung", perNomor = "ya", ulang = "sekali" } = {}) => {
  await setSetting("kuota_percobaan", String(balasan));
  await setSetting("kuota_percobaan_hari", String(hari));
  await setSetting("kuota_percobaan_mulai", mulai);
  await setSetting("kuota_percobaan_per_nomor", perNomor);
  await setSetting("kuota_percobaan_ulang", ulang);
};

let akunA;
await cek("bawaan: trial mati (0 balasan); nomor tersambung dicatat (anti daftar ulang) tapi jam trial BELUM berjalan", async () => {
  akunA = await akun();
  const h = await hak(akunA);
  assert.deepEqual([h.balasan, h.percobaan, h.percobaanBelumMulai, h.percobaanDitolak], [0, false, false, false]);
  const p = await L.aturanPercobaan();
  assert.deepEqual([p.mulai, p.perNomor], ["tersambung", true], "bawaan aman: mulai saat tersambung, satu trial per nomor");
  await sambung(akunA, "6281100000001");
  const [u] = await sql`SELECT percobaan_mulai FROM users WHERE id = ${akunA.id}`;
  assert.equal(u.percobaan_mulai, null, "trial mati tidak menghabiskan hari trial");
  const [w] = await sql`SELECT user_id FROM percobaan_wa WHERE wa_id = '6281100000001'`;
  assert.equal(w.user_id, akunA.id);
});

await cek("admin menyalakan trial: akun yang sudah tersambung langsung mulai trialnya (tanpa tersambung ulang)", async () => {
  await atur();
  assert.equal((await hak(akunA)).percobaanBelumMulai, true);
  const t0 = sekarang();
  assert.equal(await N.mulaiPercobaanTersambung(), 1);
  const h = await hak(akunA);
  assert.equal(h.percobaanBelumMulai, false);
  assert.ok(Math.abs(h.percobaanSampai - (t0 + 3 * 86400)) <= 2);
  assert.equal(await N.mulaiPercobaanTersambung(), 0, "sekali saja");
});

await cek("trial 50 balasan / 3 hari: belum mulai sebelum scan QR, mulai tepat saat nomor pertama tersambung", async () => {
  await atur();
  const b = await akun();
  let h = await hak(b);
  assert.deepEqual([h.balasan, h.percobaan, h.percobaanBelumMulai, h.percobaanSampai, h.percobaanBerakhir], [50, true, true, null, false]);
  const t0 = sekarang();
  await sambung(b, "6281100000002");
  h = await hak(b);
  assert.equal(h.percobaanBelumMulai, false);
  assert.ok(Math.abs(h.percobaanSampai - (t0 + 3 * 86400)) <= 2, "berakhir 3 hari sejak tersambung");
  // Tersambung ulang (restart / nomor kedua) tidak memperpanjang trial.
  await sql`UPDATE users SET percobaan_mulai = percobaan_mulai - 3600 WHERE id = ${b.id}`;
  const [{ percobaan_mulai: m1 }] = await sql`SELECT percobaan_mulai FROM users WHERE id = ${b.id}`;
  await sambung(b, "6281100000003");
  const [{ percobaan_mulai: m2 }] = await sql`SELECT percobaan_mulai FROM users WHERE id = ${b.id}`;
  assert.equal(m2, m1);
});

await cek("masa lewat: trial berakhir dan AI berhenti (sisa kuota 0); bonus admin tetap bisa dipakai", async () => {
  const c = await akun();
  await sambung(c, "6281100000004");
  await sql`UPDATE users SET percobaan_mulai = ${sekarang() - 4 * 86400} WHERE id = ${c.id}`;
  L.segarkanKuota(c.id);
  const h = await hak(c);
  assert.equal(h.percobaanBerakhir, true);
  assert.equal(await L.sisaKuotaAi(c.id), 0);
  await sql`INSERT INTO kuota_bonus(user_id, jumlah, dibuat) VALUES (${c.id}, 10, ${sekarang()})`;
  assert.equal((await hak(c)).percobaanBerakhir, false, "bonus admin membuka lagi");
});

await cek("satu trial per nomor: akun baru dengan nomor yang sudah dipakai akun lain = tanpa trial (0 balasan)", async () => {
  const d = await akun();
  await sambung(d, "6281100000002"); // milik akun b sebelumnya
  const h = await hak(d);
  assert.deepEqual([h.percobaanDitolak, h.balasan, h.percobaan, h.percobaanBelumMulai], [true, 0, true, false]);
  assert.equal(await L.sisaKuotaAi(d.id), 0);
  // Admin mematikan aturan per nomor: akun itu mendapat trial, masanya dari saat tersambung.
  await atur({ perNomor: "tidak" });
  const h2 = await hak(d);
  assert.deepEqual([h2.percobaanDitolak, h2.balasan], [false, 50]);
  assert.ok(h2.percobaanSampai > sekarang());
  await atur();
  // Nomor PERTAMA yang menentukan: akun yang trialnya sudah jalan lalu menambah nomor bekas akun lain tetap dapat trial.
  const e = await akun();
  await sambung(e, "6281100000010");
  await sambung(e, "6281100000001");
  assert.equal((await hak(e)).percobaanDitolak, false);
});

await cek("nomor dari akun yang sudah dihapus tetap tidak bisa dipakai trial lagi", async () => {
  const f = await akun();
  await sambung(f, "6281100000020");
  await sql`DELETE FROM users WHERE id = ${f.id}`;
  const [r] = await sql`SELECT user_id FROM percobaan_wa WHERE wa_id = '6281100000020'`;
  assert.equal(r.user_id, null, "baris tetap ada, user_id dikosongkan");
  const g = await akun();
  await sambung(g, "6281100000020");
  assert.equal((await hak(g)).percobaanDitolak, true);
});

await cek("mode 'sejak daftar': masa trial dihitung dari akun dibuat walau belum ada nomor", async () => {
  await atur({ mulai: "daftar" });
  const h0 = await akun();
  const [{ created_at }] = await sql`SELECT created_at FROM users WHERE id = ${h0.id}`;
  const h = await hak(h0);
  assert.deepEqual([h.percobaanBelumMulai, h.percobaanSampai], [false, created_at + 3 * 86400]);
  await atur();
});

await cek("akun berbayar & staf: hak paket/staf tidak berubah; staf tidak tercatat di percobaan_wa", async () => {
  const bayar = await akun();
  const starter = (await L.daftarPaket()).find((p) => p.kode === "starter");
  await sql`INSERT INTO langganan(user_id, paket_id, nama_paket, mulai, sampai, kuota_nomor, kuota_balasan, sumber)
            VALUES (${bayar.id}, ${starter.id}, 'Starter', ${sekarang()}, ${sekarang() + 30 * 86400}, 1, 1000, 'admin')`;
  await sambung(bayar, "6281100000030");
  const hb = await hak(bayar);
  assert.deepEqual([hb.balasan, hb.percobaan, hb.percobaanDitolak], [1000, false, false]);
  const staf = await akun("admin");
  await sambung(staf, "6281100000031");
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM percobaan_wa WHERE wa_id = '6281100000031'`;
  assert.equal(n, 0);
  assert.equal((await hak(staf)).balasan, null);
});

await cek("kuota gratis bulanan tidak terpengaruh aturan trial", async () => {
  await atur({ ulang: "bulanan", balasan: 30 });
  const m = await akun();
  const h = await hak(m);
  assert.deepEqual([h.balasan, h.percobaan, h.percobaanBelumMulai, h.percobaanDitolak], [30, false, false, false]);
  await atur();
});

await cek("teks ringkas trial (landing, LP, banner, GercepBot)", async () => {
  assert.equal(T.teksTrial({ balasan: 50, ulang: "sekali", hari: 3, mulai: "tersambung" }), "50 balasan AI gratis selama 3 hari, mulai saat WhatsApp tersambung");
  assert.equal(T.teksTrial({ balasan: 1000, ulang: "sekali", hari: 7, mulai: "daftar" }), "1.000 balasan AI gratis selama 7 hari, dihitung sejak daftar");
  assert.equal(T.teksTrial({ balasan: 50, ulang: "sekali", hari: 0, mulai: "tersambung" }), "50 balasan AI gratis");
  assert.equal(T.teksTrial({ balasan: 20, ulang: "bulanan", hari: 3, mulai: "tersambung" }, "en"), "20 free AI replies every month");
  assert.equal(T.teksTrial({ balasan: 50, ulang: "sekali", hari: 1, mulai: "tersambung" }, "en"), "50 free AI replies for 1 day, starting when WhatsApp connects");
  assert.equal(T.trialAktif({ balasan: 0, ulang: "sekali", hari: 3, mulai: "tersambung" }), false);
  assert.equal(T.trialAktif({ balasan: 50, ulang: "bulanan", hari: 3, mulai: "tersambung" }), false);
});

await sql.end({ timeout: 2 });
await pg.berhenti().catch(() => {});
console.log(`\nLOLOS ${lolos} uji free trial`);
process.exit(0);
