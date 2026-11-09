import "server-only";
import { db } from "./db";
import type { AsalDaftar } from "./asal-def";

/**
 * Simpan asal pendaftar ke akun yang baru dibuat. Hanya mengisi akun yang belum punya asal (first touch saat daftar
 * tidak ditimpa). Gagal = diabaikan: atribusi tidak boleh menggagalkan pendaftaran.
 */
export async function simpanAsal(userId: number, a: AsalDaftar | null): Promise<void> {
  if (!a) return;
  try {
    const sql = await db();
    await sql`
      UPDATE users SET asal_industri = ${a.industri}, asal_lp = ${a.lp}, asal_utm = ${Object.keys(a.utm).length ? sql.json(a.utm) : null}
      WHERE id = ${userId} AND asal_industri IS NULL AND asal_lp IS NULL AND asal_utm IS NULL`;
  } catch (e) {
    console.warn(`[asal] gagal menyimpan asal user=${userId}:`, e instanceof Error ? e.message : e);
  }
}

export interface AsalAkun {
  industri: string | null;
  lp: string | null;
  utm: Record<string, string> | null;
}

/** Asal satu akun untuk panel admin (satu baris, kolom eksplisit). */
export async function asalAkun(userId: number): Promise<AsalAkun | null> {
  const sql = await db();
  const [r] = await sql<AsalAkun[]>`SELECT asal_industri AS industri, asal_lp AS lp, asal_utm AS utm FROM users WHERE id = ${userId}`;
  return r ?? null;
}
