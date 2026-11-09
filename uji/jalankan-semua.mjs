// Menjalankan seluruh berkas uji secara paralel dengan klaster template PostgreSQL yang disiapkan sekali,
// sehingga tidak perlu menjalankan `initdb` berulang-ulang di setiap berkas uji.
//
// Tiga jalur berjalan bersamaan. CI menjalankan tiap jalur di mesin sendiri (matrix di deploy.yml):
//   node uji/jalankan-semua.mjs --jalur=alur        (atau --jalur=tolok,fitur; tanpa --jalur = semua)
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { mulaiPg } from "./pg-lokal.mjs";

const JALUR = {
  // Alur WhatsApp <-> AI (termasuk follow-up nomor CS): sebagian besar menunggu timer jembatan (dipercepat lewat WA_SKALA_WAKTU).
  alur: { berkas: ["uji/uji-alur.mjs", "uji/uji-followup.mjs"], sekaligus: 1 },
  // Tolok ukur latensi ketat (< 20 ms di uji-data, < 15 ms di uji-pengguna): berurutan, tidak berebut CPU sesamanya.
  tolok: { berkas: ["uji/uji-data.mjs", "uji/uji-pengguna.mjs"], sekaligus: 1 },
  // Kebenaran fitur tanpa tolok ukur waktu: boleh berjalan bersamaan.
  fitur: {
    berkas: ["uji/uji-auth.mjs", "uji/uji-langganan.mjs", "uji/uji-jaminan.mjs", "uji/uji-gateway.mjs", "uji/uji-sinkron.mjs", "uji/uji-ai.mjs", "uji/uji-afiliasi.mjs", "uji/uji-analitik.mjs", "uji/uji-pixel.mjs", "uji/uji-pendaftar.mjs", "uji/uji-log.mjs", "uji/uji-push.mjs"],
    sekaligus: 3,
  },
};

const pilihan = (process.argv.find((a) => a.startsWith("--jalur="))?.slice(8) ?? process.env.UJI_JALUR ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
for (const p of pilihan) if (!JALUR[p]) throw new Error(`jalur tidak dikenal: ${p} (pilihan: ${Object.keys(JALUR).join(", ")})`);
const dipakai = pilihan.length ? pilihan : Object.keys(JALUR);
const TOTAL_BERKAS = dipakai.reduce((n, j) => n + JALUR[j].berkas.length, 0);

const t0 = performance.now();
const tplDir = path.join(os.tmpdir(), `wa-pg-template-${dipakai.join("-")}`);

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

/** Satu jalur: berkasnya diambil bergiliran oleh `sekaligus` pekerja. Ada yang gagal = berkas berikutnya tidak dimulai. */
async function jalankanJalur({ berkas, sekaligus }) {
  const antre = [...berkas];
  const pekerja = async () => {
    for (let b = antre.shift(); b && !gagal; b = antre.shift()) await jalankanSatu(b);
  };
  await Promise.all(Array.from({ length: Math.min(sekaligus, antre.length) }, pekerja));
}

try {
  await Promise.all(dipakai.map((j) => jalankanJalur(JALUR[j])));
} finally {
  rmSync(tplDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}

const totalDtk = ((performance.now() - t0) / 1000).toFixed(1);
if (gagal) {
  console.error(`\nUJI GAGAL setelah ${totalDtk} dtk`);
  process.exit(1);
}
console.log(`\nSEMUA ${TOTAL_BERKAS} BERKAS UJI LOLOS (jalur ${dipakai.join(", ")}) dalam ${totalDtk} dtk`);
