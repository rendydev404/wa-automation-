// Menjalankan seluruh berkas uji secara paralel dengan klaster template PostgreSQL yang disiapkan sekali,
// sehingga tidak perlu menjalankan `initdb` berulang-ulang di setiap berkas uji.
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { mulaiPg } from "./pg-lokal.mjs";

// Jalur 1: berkas uji yang sebagian besar waktunya menunggu timer (hampir 0% pemakaian CPU).
const JALUR_TIMER = [
  "uji/uji-alur.mjs",
  "uji/uji-sinkron.mjs",
];

// Jalur 2: berkas uji DB & CPU (termasuk tolok ukur latensi ketat < 20 ms di uji-data & < 15 ms di uji-pengguna).
// Dijalankan berurutan di jalur ini agar tidak saling berebut CPU/IO dengan sesama instans PostgreSQL.
const JALUR_DB = [
  "uji/uji-data.mjs",
  "uji/uji-pengguna.mjs",
  "uji/uji-auth.mjs",
  "uji/uji-langganan.mjs",
  "uji/uji-ai.mjs",
  "uji/uji-afiliasi.mjs",
  "uji/uji-log.mjs",
];
const TOTAL_BERKAS = JALUR_TIMER.length + JALUR_DB.length;

const t0 = performance.now();
const tplDir = path.join(os.tmpdir(), "wa-pg-template");

// 1. Siapkan template PostgreSQL sekali saja (initdb + role wa + database wa), lalu hentikan bersih.
const tpl = await mulaiPg({ dir: tplDir, sementara: true });
await tpl.berhentiSementara();

let gagal = false;

function jalankanSatu(berkas) {
  return new Promise((resolve) => {
    const mulai = performance.now();
    const out = [];
    const proc = spawn(process.execPath, ["--no-warnings", "--import", "./uji/loader.mjs", berkas], {
      env: { ...process.env, WA_PG_TEMPLATE: tplDir },
      stdio: ["ignore", "pipe", "pipe"],
    });
    proc.stdout.on("data", (b) => out.push(String(b)));
    proc.stderr.on("data", (b) => out.push(String(b)));
    proc.on("close", (code) => {
      const dtk = ((performance.now() - mulai) / 1000).toFixed(1);
      const status = code === 0 ? "LOLOS" : `GAGAL (kode ${code})`;
      console.log(`\n─── ${berkas} [${status} · ${dtk} dtk] ───`);
      process.stdout.write(out.join(""));
      if (code !== 0) gagal = true;
      resolve(code);
    });
  });
}

async function jalankanJalur(daftar) {
  for (const berkas of daftar) {
    if (gagal) break;
    await jalankanSatu(berkas);
  }
}

try {
  await Promise.all([jalankanJalur(JALUR_TIMER), jalankanJalur(JALUR_DB)]);
} finally {
  rmSync(tplDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}

const totalDtk = ((performance.now() - t0) / 1000).toFixed(1);
if (gagal) {
  console.error(`\nUJI GAGAL setelah ${totalDtk} dtk`);
  process.exit(1);
}
console.log(`\nSEMUA ${TOTAL_BERKAS} BERKAS UJI LOLOS dalam ${totalDtk} dtk`);
