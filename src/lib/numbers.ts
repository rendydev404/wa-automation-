import "server-only";
import { randomBytes } from "node:crypto";
import { db, sekarang, transaksi } from "./db";

export interface Nomor {
  id: number;
  sesi: string; // nama sesi WhatsApp milik nomor ini (kunci wa_auth)
  wa_id: string | null; // digit saja; kosong sebelum QR dipindai
  label: string;
  nama_wa: string | null;
  bot_aktif: boolean;
  instruksi: string;
  tunggu_detik: number; // AI menunggu balasan manusia selama ini sebelum menjawab
  tunggu_baca_detik: number; // chat sudah dibuka manusia di HP tapi tidak dibalas: AI mengambil alih setelah ini
  jeda_menit: number; // setelah manusia membalas, AI diam di chat itu selama ini (0 = hanya pesan itu)
  created_at: number;
  last_connected_at: number | null;
}

export interface NomorRingkas extends Nomor {
  jumlah_dokumen: number;
  jumlah_karakter: number;
  dibalas_hari_ini: number;
  masuk_hari_ini: number;
}

export const tanggalWib = (): string => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

/**
 * Semua nomor dipegang di memori (paling banyak puluhan baris) dan dimuat ulang hanya setelah ada
 * yang berubah. Tiap pesan WhatsApp dan tiap polling status membaca tabel ini; tanpa cache itu
 * berarti satu query per pesan. Aman karena hanya proses ini yang menulis tabel numbers, dan semua
 * tulisnya lewat modul ini.
 */
interface Cache {
  semua: Nomor[];
  perId: Map<number, Nomor>;
  perSesi: Map<string, Nomor>;
}
const g = globalThis as unknown as { __waNomor?: { janji: Promise<Cache> | null } };
const st = (g.__waNomor ??= { janji: null });

async function muat(): Promise<Cache> {
  const sql = await db();
  const semua = await sql<Nomor[]>`
    SELECT id, sesi, wa_id, label, nama_wa, bot_aktif, instruksi, tunggu_detik, tunggu_baca_detik, jeda_menit, created_at, last_connected_at
      FROM numbers ORDER BY id`;
  return { semua: [...semua], perId: new Map(semua.map((n) => [n.id, n])), perSesi: new Map(semua.map((n) => [n.sesi, n])) };
}

function cache(): Promise<Cache> {
  return (st.janji ??= muat().catch((e) => {
    st.janji = null;
    throw e;
  }));
}

const basi = (): void => {
  st.janji = null;
};

export async function semuaNomor(): Promise<Nomor[]> {
  return (await cache()).semua;
}

export async function nomorById(id: number): Promise<Nomor | undefined> {
  return (await cache()).perId.get(id);
}

export async function nomorBySesi(sesi: string): Promise<Nomor | undefined> {
  return (await cache()).perSesi.get(sesi);
}

/** Daftar nomor + ringkasan knowledge & statistik hari ini, satu query (tanpa N+1). */
export async function daftarNomor(): Promise<NomorRingkas[]> {
  const sql = await db();
  const baris = await sql<NomorRingkas[]>`
    SELECT n.id, n.sesi, n.wa_id, n.label, n.nama_wa, n.bot_aktif, n.instruksi, n.tunggu_detik, n.tunggu_baca_detik, n.jeda_menit, n.created_at, n.last_connected_at,
           COALESCE(d.jumlah, 0)   AS jumlah_dokumen,
           COALESCE(d.karakter, 0) AS jumlah_karakter,
           COALESCE(s.dibalas, 0)  AS dibalas_hari_ini,
           COALESCE(s.masuk, 0)    AS masuk_hari_ini
      FROM numbers n
      LEFT JOIN (SELECT number_id, COUNT(*) AS jumlah, SUM(jumlah_karakter) AS karakter
                   FROM documents GROUP BY number_id) d ON d.number_id = n.id
      LEFT JOIN stats s ON s.number_id = n.id AND s.tanggal = ${tanggalWib()}
     ORDER BY n.id`;
  return [...baris];
}

/**
 * Buat jalur baru. Nama sesinya = id + akhiran acak, supaya nama sesi tidak pernah terpakai ulang
 * dan mewarisi keadaan chat serta riwayat percakapan (di Hermes) milik nomor yang sudah dihapus.
 */
export async function tambahNomor(label: string): Promise<Nomor> {
  const sql = await db();
  const [n] = await sql<Nomor[]>`
    WITH baru AS (SELECT nextval(pg_get_serial_sequence('numbers', 'id'))::integer AS id)
    INSERT INTO numbers(id, sesi, label, created_at)
    SELECT id, 'n' || id || 'x' || ${randomBytes(4).toString("hex")}, ${label}, ${sekarang()} FROM baru
    RETURNING id, sesi, wa_id, label, nama_wa, bot_aktif, instruksi, tunggu_detik, tunggu_baca_detik, jeda_menit, created_at, last_connected_at`;
  basi();
  return n;
}

/** Dipanggil saat sesi WhatsApp sebuah jalur terhubung: catat nomor yang dipasangkan. */
export async function catatTerhubung(id: number, waId: string, namaWa: string | null): Promise<void> {
  await transaksi(async (tx) => {
    // Nomor yang sama pindah jalur: lepaskan dari jalur lama (wa_id unik).
    await tx`UPDATE numbers SET wa_id = NULL WHERE wa_id = ${waId} AND id <> ${id}`;
    await tx`UPDATE numbers SET wa_id = ${waId}, nama_wa = COALESCE(${namaWa}, nama_wa), last_connected_at = ${sekarang()} WHERE id = ${id}`;
  });
  basi();
}

export const BATAS_TUNGGU_DETIK = { min: 2, maks: 120 } as const;
export const BATAS_TUNGGU_BACA_DETIK = { min: 10, maks: 600 } as const;
export const BATAS_JEDA_MENIT = { min: 0, maks: 1440 } as const;

export async function ubahNomor(id: number, data: { label: string; instruksi: string; tungguDetik: number; tungguBacaDetik: number; jedaMenit: number }): Promise<void> {
  const sql = await db();
  await sql`
    UPDATE numbers SET label = ${data.label}, instruksi = ${data.instruksi}, tunggu_detik = ${data.tungguDetik},
           tunggu_baca_detik = ${data.tungguBacaDetik}, jeda_menit = ${data.jedaMenit}
     WHERE id = ${id}`;
  basi();
}

export async function setBotAktif(id: number, aktif: boolean): Promise<void> {
  const sql = await db();
  await sql`UPDATE numbers SET bot_aktif = ${aktif} WHERE id = ${id}`;
  basi();
}

export async function hapusNomor(id: number): Promise<void> {
  // documents, chunks, dan stats ikut terhapus (ON DELETE CASCADE).
  const sql = await db();
  await sql`DELETE FROM numbers WHERE id = ${id}`;
  basi();
}

export async function catatStat(numberId: number, kolom: "masuk" | "dibalas" | "gagal", n = 1): Promise<void> {
  const sql = await db();
  const k = sql(kolom);
  await sql`
    INSERT INTO stats(number_id, tanggal, ${k}) VALUES (${numberId}, ${tanggalWib()}, ${n})
    ON CONFLICT (number_id, tanggal) DO UPDATE SET ${k} = stats.${k} + EXCLUDED.${k}`;
}
