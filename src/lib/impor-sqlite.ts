import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Sql } from "./db";

/**
 * Pindahan sekali jalan dari database lama (SQLite, DATA_DIR/wa.db) ke PostgreSQL.
 * Berjalan otomatis saat app mulai, HANYA bila PostgreSQL masih kosong dan berkas lamanya ada.
 * Seluruhnya dalam satu transaksi (semua masuk atau tidak sama sekali); berkas lama tidak diubah
 * dan dibiarkan sebagai cadangan. Tandanya dicatat di tabel settings supaya tidak terulang.
 */

const TANDA = "impor_sqlite";
const KUNCI_IMPOR = 7272740002;

type Baris = Record<string, unknown>;

export async function imporDariSqlite(sql: Sql): Promise<void> {
  const [sudah] = await sql`SELECT 1 FROM settings WHERE kunci = ${TANDA}`;
  if (sudah) return;
  const berkas = path.join(path.resolve(/* turbopackIgnore: true */ process.env.DATA_DIR || "./data"), "wa.db");
  if (!existsSync(berkas)) return;

  const { DatabaseSync } = await import("node:sqlite");
  const lama = new DatabaseSync(berkas, { readOnly: true });
  try {
    const versi = (lama.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
    const ada = (tabel: string): boolean => !!lama.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tabel);
    const semua = (q: string): Baris[] => lama.prepare(q).all() as Baris[];
    if (versi < 4 || !ada("numbers")) {
      console.warn(`[db] ${berkas} berskema lama (v${versi}); tidak diimpor.`);
      return;
    }

    await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(${KUNCI_IMPOR})`;
      const [dulu] = await tx`SELECT 1 FROM settings WHERE kunci = ${TANDA}`;
      if (dulu) return;
      const [{ n }] = await tx<{ n: number }[]>`SELECT (SELECT COUNT(*) FROM users) + (SELECT COUNT(*) FROM numbers) AS n`;
      if (n > 0) {
        await tx`INSERT INTO settings(kunci, nilai) VALUES (${TANDA}, ${"dilewati: PostgreSQL sudah berisi data"})`;
        return;
      }

      const sisip = async (tabel: string, baris: Baris[], kolom: string[]): Promise<void> => {
        for (let i = 0; i < baris.length; i += 500) await tx`INSERT INTO ${tx(tabel)} ${tx(baris.slice(i, i + 500) as never, ...(kolom as never[]))}`;
      };

      const users = semua("SELECT id, email, password_hash, created_at FROM users");
      await sisip("users", users, ["id", "email", "password_hash", "created_at"]);

      const numbers = semua(
        "SELECT id, sesi, wa_id, label, nama_wa, bot_aktif, instruksi, tunggu_detik, tunggu_baca_detik, jeda_menit * 60 AS jeda_detik, created_at, last_connected_at FROM numbers"
      ).map((r) => ({ ...r, bot_aktif: !!r.bot_aktif }));
      await sisip("numbers", numbers, ["id", "sesi", "wa_id", "label", "nama_wa", "bot_aktif", "instruksi", "tunggu_detik", "tunggu_baca_detik", "jeda_detik", "created_at", "last_connected_at"]);

      const documents = semua("SELECT id, number_id, judul, sumber, nama_berkas, ukuran_byte, jumlah_karakter, created_at FROM documents");
      await sisip("documents", documents, ["id", "number_id", "judul", "sumber", "nama_berkas", "ukuran_byte", "jumlah_karakter", "created_at"]);

      // Potongan yang dokumennya sudah tidak ada (sisa lama) tidak ikut; indeks pencariannya dibuat PostgreSQL sendiri.
      const chunks = semua("SELECT c.id, c.document_id, c.number_id, c.urutan, c.isi FROM chunks c JOIN documents d ON d.id = c.document_id");
      await sisip("chunks", chunks, ["id", "document_id", "number_id", "urutan", "isi"]);

      const chat = semua("SELECT kunci, sesi_ke, last_at, jeda_sampai, jendela_awal, jendela_n FROM chat_state");
      await sisip("chat_state", chat, ["kunci", "sesi_ke", "last_at", "jeda_sampai", "jendela_awal", "jendela_n"]);

      const stats = semua("SELECT s.number_id, s.tanggal, s.masuk, s.dibalas, s.gagal FROM stats s JOIN numbers n ON n.id = s.number_id");
      await sisip("stats", stats, ["number_id", "tanggal", "masuk", "dibalas", "gagal"]);

      const settings = semua("SELECT kunci, nilai FROM settings").filter((r) => r.kunci !== TANDA);
      await sisip("settings", settings, ["kunci", "nilai"]);

      let auth: Baris[] = [];
      if (ada("wa_auth")) {
        auth = semua("SELECT sesi, kunci, nilai FROM wa_auth").map((r) => {
          const v = r.nilai as string | Uint8Array;
          return typeof v === "string" ? { sesi: r.sesi, kunci: r.kunci, biner: null, teks: v } : { sesi: r.sesi, kunci: r.kunci, biner: Buffer.from(v.buffer, v.byteOffset, v.byteLength), teks: null };
        });
        await sisip("wa_auth", auth, ["sesi", "kunci", "biner", "teks"]);
      }

      // Versi SQLite hanya punya satu jenis pengguna (pengelola): semuanya admin, semua nomor milik admin pertama.
      await tx`UPDATE users SET peran = 'admin'`;
      await tx`UPDATE numbers SET user_id = (SELECT MIN(id) FROM users) WHERE user_id IS NULL`;

      // Id lama dipertahankan; pencacah id PostgreSQL dilanjutkan dari yang terbesar.
      for (const tabel of ["users", "numbers", "documents", "chunks"]) {
        await tx.unsafe(`SELECT setval(pg_get_serial_sequence('${tabel}', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM ${tabel}), 1), (SELECT COUNT(*) > 0 FROM ${tabel}))`);
      }

      const ringkas = `users ${users.length}, numbers ${numbers.length}, documents ${documents.length}, chunks ${chunks.length}, chat_state ${chat.length}, stats ${stats.length}, settings ${settings.length}, wa_auth ${auth.length}`;
      await tx`INSERT INTO settings(kunci, nilai) VALUES (${TANDA}, ${`${new Date().toISOString()} dari SQLite v${versi}: ${ringkas}`})`;
      console.info(`[db] data lama diimpor dari ${berkas} -> PostgreSQL (${ringkas})`);
    });
  } finally {
    lama.close();
  }
}
