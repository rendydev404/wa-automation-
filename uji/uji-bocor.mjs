// Uji kebocoran: sambung 12 soket SUNGGUHAN ke WhatsApp lalu putuskan, berulang, dan ukur heap
// setelah GC paksa serta jumlah timer yang masih hidup. Tidak ada nomor yang dipasangkan (hanya
// sampai tahap QR). Database: PostgreSQL sementara di mesin ini.
// Pakai (dari akar proyek): node --expose-gc --import ./uji/loader.mjs uji/uji-bocor.mjs
import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { mulaiPg } from "./pg-lokal.mjs";

const akar = process.cwd();
const tmp = path.join(os.tmpdir(), "wa-uji-bocor");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const pg = await mulaiPg({ dir: path.join(tmp, "pg"), sementara: true });
process.env.DATABASE_URL = pg.url;
process.env.DATA_DIR = path.join(tmp, "data-kosong");
const lib = (f) => import(pathToFileURL(path.join(akar, f)).href);
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
const heap = () => {
  globalThis.gc();
  globalThis.gc();
  return process.memoryUsage().heapUsed / 1048576;
};
// Timer milik pool database (penutup koneksi menganggur) tidak dihitung: jumlahnya tetap.
const timer = () => process.getActiveResourcesInfo().filter((r) => r === "Timeout").length;

const { db } = await lib("src/lib/db.ts");
const wa = await lib("src/lib/wa.ts");
const { tambahNomor } = await lib("src/lib/numbers.ts");
const sql = await db();
const nomor = [];
for (let i = 1; i <= 12; i++) nomor.push(await tambahNomor(`Uji ${i}`));

// pemanasan: satu siklus dulu supaya pustaka, JIT, dan cache modul sudah termuat
await Promise.all(nomor.map((n) => wa.hubungkan(n.sesi)));
for (const n of nomor) await wa.hapusSesi(n.sesi);
await tidur(2500);
const h0 = heap();
const t0 = timer();
console.log(`setelah pemanasan (0 soket): heap ${h0.toFixed(1)} MB, timer aktif ${t0}`);

const hasil = [];
for (let i = 1; i <= 5; i++) {
  await Promise.all(nomor.map((n) => wa.hubungkan(n.sesi)));
  const qr = nomor.filter((n) => wa.infoSesi(n.sesi).status === "SCAN_QR_CODE").length;
  await tidur(1500);
  const hAktif = heap();
  const tAktif = timer();
  for (const n of nomor) await wa.hapusSesi(n.sesi);
  await tidur(2500);
  const h = heap();
  hasil.push(h);
  console.log(`siklus ${i}: ${qr}/12 QR | 12 soket aktif: heap ${hAktif.toFixed(1)} MB, timer ${tAktif} | setelah diputus: heap ${h.toFixed(1)} MB, timer ${timer()}`);
}
const naik = (hasil.at(-1) - hasil[0]) / 4;
console.log(`kenaikan heap per siklus (12 sambung + 12 putus): ${naik.toFixed(2)} MB  => ${((naik * 1024) / 12).toFixed(0)} KB per soket`);
console.log(`timer aktif: ${timer()} (awal ${t0}); baris wa_auth tersisa: ${(await sql`SELECT COUNT(*) AS n FROM wa_auth`)[0].n}; koneksi database terpakai: ${(await sql`SELECT COUNT(*) AS n FROM pg_stat_activity WHERE datname = current_database()`)[0].n}`);
await sql.end({ timeout: 2 });
await pg.berhenti();
process.exit(0);
