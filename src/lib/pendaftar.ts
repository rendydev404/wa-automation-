import "server-only";
import { db } from "./db";

/**
 * Nama pendaftar terbaru untuk kartu di hero landing. Halaman publik: yang keluar dari server hanya nama depan + inisial
 * ("Budi S."), tanpa email dan id. Hasilnya dimemo per proses supaya kunjungan landing tidak menambah beban database.
 */

export type Pendaftar = { nama: string; detik: number };

const MAKS_TAMPIL = 20;
const UMUR_MEMO_MS = 5 * 60_000;

const kapital = (kata: string): string => kata.charAt(0).toLocaleUpperCase("id") + kata.slice(1).toLocaleLowerCase("id");

/** "BUDI SANTOSO" -> "Budi S.". null bila bukan nama orang (ada angka/email, atau nama depan terlalu pendek/panjang). */
export function namaSamaran(nama: string): string | null {
  const bersih = nama.trim().replace(/\s+/g, " ");
  if (!/^[\p{L}][\p{L}'.\- ]*$/u.test(bersih)) return null;
  const kata = bersih.split(" ").filter((k) => k.replace(/\./g, "").length >= 2);
  const depan = kata[0];
  if (!depan || depan.length > 14) return null;
  return kata[1] ? `${kapital(depan)} ${kata[1].charAt(0).toLocaleUpperCase("id")}.` : kapital(depan);
}

async function ambil(): Promise<Pendaftar[]> {
  const sql = await db();
  // Lebih banyak dari MAKS_TAMPIL karena sebagian baris tersaring namaSamaran. Memakai index id, tanpa sort.
  const baris = await sql<{ nama: string; created_at: number }[]>`
    SELECT nama, created_at FROM users
    WHERE status = 'aktif' AND peran = 'user' AND nama <> ''
    ORDER BY id DESC LIMIT ${MAKS_TAMPIL * 2}`;
  const terlihat = new Set<string>();
  const hasil: Pendaftar[] = [];
  for (const b of baris) {
    const nama = namaSamaran(b.nama);
    if (!nama || terlihat.has(nama)) continue;
    terlihat.add(nama);
    hasil.push({ nama, detik: Number(b.created_at) });
    if (hasil.length === MAKS_TAMPIL) break;
  }
  return hasil;
}

let memo: { sampai: number; isi: Promise<Pendaftar[]> } | null = null;

export function pendaftarTerbaru(): Promise<Pendaftar[]> {
  if (memo && memo.sampai > Date.now()) return memo.isi;
  const isi = ambil();
  const baru = { sampai: Date.now() + UMUR_MEMO_MS, isi };
  memo = baru;
  // Gagal jangan dimemo: permintaan berikutnya mencoba lagi.
  isi.catch(() => {
    if (memo === baru) memo = null;
  });
  return isi;
}
