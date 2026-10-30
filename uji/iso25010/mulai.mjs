// Server produksi (output standalone `npm run build`) + PostgreSQL sementara untuk evaluasi ISO/IEC 25010.
// Pakai (dari akar proyek, setelah `npm run build`): node --import ./uji/loader.mjs uji/iso25010/mulai.mjs
// Server di http://127.0.0.1:3999, admin: admin@uji.test / AdminUji#2026. Hentikan dengan Ctrl+C.
import { spawn } from "node:child_process";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { mulaiPg } from "../pg-lokal.mjs";

const akar = process.cwd();
const tmp = path.join(os.tmpdir(), "wa-iso25010");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const app = path.join(tmp, "app");
cpSync(path.join(akar, ".next/standalone"), app, { recursive: true });
cpSync(path.join(akar, ".next/static"), path.join(app, ".next/static"), { recursive: true });
for (const f of [".env", ".env.local", ".env.production"]) rmSync(path.join(app, f), { force: true });
const pg = await mulaiPg({ dir: path.join(tmp, "pg"), sementara: true });
const env = {
  ...process.env, NODE_ENV: "production", PORT: "3999", HOSTNAME: "127.0.0.1", DATABASE_URL: pg.url, DATA_DIR: path.join(tmp, "data"),
  AUTH_SECRET: "e".repeat(64), ADMIN_EMAIL: "admin@uji.test", ADMIN_PASSWORD: "AdminUji#2026",
  HERMES_API_URL: "http://127.0.0.1:9", HERMES_API_KEY: "x", NODE_OPTIONS: "--max-old-space-size=320",
};
const s = spawn(process.execPath, ["server.js"], { cwd: app, env, stdio: "inherit" });
s.on("exit", async (c) => {
  await pg.berhenti();
  process.exit(c ?? 0);
});
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => s.kill("SIGTERM"));
