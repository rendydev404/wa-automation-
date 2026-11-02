// Menjalankan seluruh berkas uji secara paralel dengan klaster template PostgreSQL yang disiapkan sekali,
// sehingga tidak perlu menjalankan `initdb` berulang-ulang di setiap berkas uji.
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { mulaiPg } from "./pg-lokal.mjs";

const DAFTAR_UJI = [
  "uji/uji-alur.mjs",
  "uji/uji-data.mjs",
  "uji/uji-sinkron.mjs",
  "uji/uji-auth.mjs",
  "uji/uji-pengguna.mjs",
  "uji/uji-langganan.mjs",
  "uji/uji-ai.mjs",
  "uji/uji-afiliasi.mjs",
  "uji/uji-log.mjs",
];

const t0 = performance.now();
const tplDir = path.join(os.tmpdir(), "wa-pg-template");

// 1. Siapkan template PostgreSQL sekali saja (initdb + role wa + database wa), lalu hentikan bersih.
const tpl = await mulaiPg({ dir: tplDir, sementara: true });
await tpl.berhentiSementara();

const paralel = Math.max(2, Math.min(os.availableParallelism?.() ?? 4, 4));
let indeks = 0;
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

async function pekerja() {
  while (!gagal && indeks < DAFTAR_UJI.length) {
    const berkas = DAFTAR_UJI[indeks++];
    await jalankanSatu(berkas);
  }
}

try {
  await Promise.all(Array.from({ length: paralel }, () => pekerja()));
} finally {
  rmSync(tplDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}

const totalDtk = ((performance.now() - t0) / 1000).toFixed(1);
if (gagal) {
  console.error(`\nUJI GAGAL setelah ${totalDtk} dtk`);
  process.exit(1);
}
console.log(`\nSEMUA ${DAFTAR_UJI.length} BERKAS UJI LOLOS dalam ${totalDtk} dtk`);
