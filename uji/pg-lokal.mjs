// PostgreSQL 15 sungguhan di mesin ini (biner dari paket dev `embedded-postgres`), untuk dev dan uji.
// Disiapkan seperti produksi: locale C, role aplikasi `wa` yang bukan superuser, database `wa`.
//
// Sebagai skrip (database dev yang menetap di ./data/pg, port 5434):
//   npm run db        -> lalu isi .env.local: DATABASE_URL=postgres://wa:wa@127.0.0.1:5434/wa
// Sebagai modul: mulaiPg({ dir, port, sementara }) dipakai skrip uji.
import { existsSync, rmSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const akar = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const impor = (f) => import(pathToFileURL(path.join(akar, "node_modules", f)).href);

export function portBebas() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

/**
 * @param {{ dir: string, port?: number, sementara?: boolean }} o `sementara`: data dibuat baru dan
 *   fsync dimatikan (cepat, untuk uji); tanpa itu data menetap dan aman seperti biasa.
 */
export async function mulaiPg({ dir, port, sementara = false }) {
  const { default: EmbeddedPostgres } = await impor("embedded-postgres/dist/index.js");
  const { default: postgres } = await impor("postgres/src/index.js");
  if (sementara) rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); // Windows: proses postgres bisa masih melepas berkas sesaat
  const p = port ?? (await portBebas());
  const baru = !existsSync(path.join(dir, "PG_VERSION"));
  const pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: "postgres",
    password: "postgres",
    port: p,
    persistent: true, // folder data dihapus oleh berhenti() di bawah, bukan oleh pustaka (supaya bisa dijeda)
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    // Setelan yang sama dengan deploy/postgres/postgresql.conf, supaya perilakunya serupa produksi.
    postgresFlags: ["-c", "shared_buffers=32MB", "-c", "max_connections=20", "-c", "jit=off", "-c", "max_parallel_workers_per_gather=0", ...(sementara ? ["-c", "fsync=off", "-c", "synchronous_commit=off"] : [])],
    onLog: () => {},
    onError: (e) => {
      const t = String(e?.message ?? e);
      if (/FATAL|PANIC/.test(t)) console.error("[pg-lokal]", t.trim());
    },
  });
  if (baru) await pg.initialise();
  await pg.start();
  if (baru) {
    const admin = postgres(`postgres://postgres:postgres@127.0.0.1:${p}/postgres`, { max: 1, onnotice: () => {} });
    await admin.unsafe("CREATE ROLE wa LOGIN PASSWORD 'wa' CONNECTION LIMIT 15");
    await admin.unsafe("CREATE DATABASE wa OWNER wa ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0");
    await admin.end();
  }
  return {
    url: `postgres://wa:wa@127.0.0.1:${p}/wa`,
    urlAdmin: `postgres://postgres:postgres@127.0.0.1:${p}/wa`,
    port: p,
    /** Matikan server tanpa membuang data (meniru database yang sedang tidak terjangkau). */
    berhentiSementara: () => pg.stop(),
    lanjut: () => pg.start(),
    async berhenti() {
      await pg.stop();
      if (sementara) rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); // Windows: proses postgres bisa masih melepas berkas sesaat
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const db = await mulaiPg({ dir: path.join(akar, "data", "pg"), port: Number(process.env.PGPORT) || 5434 });
  console.log(`PostgreSQL dev berjalan.\n  DATABASE_URL=${db.url}\nCtrl+C untuk berhenti (data tetap di ./data/pg).`);
  const tutup = async () => {
    await db.berhenti().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", tutup);
  process.on("SIGTERM", tutup);
}
