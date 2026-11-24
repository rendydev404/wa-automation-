import "server-only";
import { db, sekarang } from "./db";
import { FITUR_BARU, type FiturBaru, KUNCI_LIHAT, jalurFiturBaru } from "./fitur-baru-def";
import { nomorMilik } from "./numbers";

/**
 * Pengumuman fitur baru yang ditampilkan ke pengguna ini sekarang, atau null (lib/fitur-baru-def.ts). Satu query
 * primary key users + daftar nomor dari cache. Tidak untuk akun yang masih di tur awal (belum menyelesaikan tur
 * dasbor), akun yang dibuat setelah fiturnya rilis, atau yang sudah melihatnya / sudah memutar turnya.
 */
export async function pengumumanFiturBaru(userId: number, kini = sekarang()): Promise<{ f: FiturBaru; tujuan: string } | null> {
  const aktif = FITUR_BARU.filter((f) => kini >= f.rilis && kini < f.rilis + f.berlakuHari * 86400);
  if (!aktif.length) return null;
  const sql = await db();
  const [u] = await sql<{ tur_selesai: string[]; created_at: number }[]>`SELECT tur_selesai, created_at FROM users WHERE id = ${userId}`;
  if (!u || !u.tur_selesai.includes("dashboard")) return null;
  const nomorQr = (await nomorMilik(userId)).find((n) => n.jalur !== "resmi");
  for (const f of aktif) {
    if (Number(u.created_at) >= f.rilis || u.tur_selesai.includes(KUNCI_LIHAT(f.kode)) || u.tur_selesai.includes(f.tur)) continue;
    if (f.tujuan === "nomor-qr" && nomorQr) return { f, tujuan: jalurFiturBaru(f, nomorQr.id) };
  }
  return null;
}
