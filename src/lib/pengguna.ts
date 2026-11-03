import "server-only";
import { randomBytes } from "node:crypto";
import type { Penyedia } from "./ai";
import { db, sekarang } from "./db";
import { segarkanAiAkun } from "./langganan";
import { segarkanNomor } from "./numbers";
import { hashPassword } from "./password";
import type { Peran, User } from "./session";

/** Data akun & administrasi pengguna. Semua fungsi di sini dipanggil setelah peran pemanggil diperiksa. */

export class PenggunaError extends Error {}

export interface BarisPengguna {
  id: number;
  email: string;
  nama: string;
  peran: Peran;
  status: "aktif" | "diblokir";
  alasan_blokir: string | null;
  kuota_nomor: number | null;
  jumlah_nomor: number;
  login_terakhir: number | null;
  created_at: number;
  punya_password: boolean; // false = akun dibuat lewat Google dan belum pernah memasang password
  google: boolean; // tertaut ke akun Google
  ai_penyedia: Penyedia | null; // dipaksa admin untuk akun ini; null = ikut pengaturan Mesin AI
}

/** Penanda password_hash akun tanpa password (dibuat lewat Google): bukan format scrypt, jadi tidak pernah cocok. */
export const TANPA_PASSWORD = "!google";

const EMAIL_SAH = /^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$/;

export function normalkanEmail(email: string): string | null {
  const e = email.trim().toLowerCase();
  return e.length <= 254 && EMAIL_SAH.test(e) ? e : null;
}

/** Buat akun. null bila email sudah terdaftar. */
export async function buatAkun(data: { email: string; nama: string; password: string; peran?: Peran; kuota?: number | null }) {
  const sql = await db();
  const hash = await hashPassword(data.password);
  const [u] = await sql<{ id: number; peran: Peran; password_hash: string; sesi_versi: number }[]>`
    INSERT INTO users(email, nama, password_hash, peran, kuota_nomor, created_at)
    VALUES (${data.email}, ${data.nama}, ${hash}, ${data.peran ?? "user"}, ${data.kuota ?? null}, ${sekarang()})
    ON CONFLICT (email) DO NOTHING
    RETURNING id, peran, password_hash, sesi_versi`;
  return u ?? null;
}

// ---------- Masuk dengan Google ----------

export interface AkunGoogle {
  id: number;
  peran: Peran;
  password_hash: string;
  sesi_versi: number;
  status: "aktif" | "diblokir";
  alasan_blokir: string | null;
}

/**
 * Akun untuk identitas Google yang sudah diverifikasi: dicari lewat google_sub, lalu lewat email (akun lama
 * ditautkan, karena Google sudah membuktikan pemilik email itu), dan bila belum ada dibuat baru tanpa password.
 * null = akun baru diperlukan tetapi pendaftaran sedang ditutup.
 */
export async function akunGoogle(g: { sub: string; email: string; nama: string }, bolehDaftar: boolean): Promise<(AkunGoogle & { baru: boolean }) | null> {
  const sql = await db();
  const kolom = sql.unsafe("id, peran, password_hash, sesi_versi, status, alasan_blokir");
  const [lewatSub] = await sql<AkunGoogle[]>`SELECT ${kolom} FROM users WHERE google_sub = ${g.sub}`;
  if (lewatSub) return { ...lewatSub, baru: false };
  const [tertaut] = await sql<AkunGoogle[]>`UPDATE users SET google_sub = ${g.sub} WHERE email = ${g.email} AND google_sub IS NULL RETURNING ${kolom}`;
  if (tertaut) return { ...tertaut, baru: false };
  if (!bolehDaftar) return null;
  const [baru] = await sql<AkunGoogle[]>`
    INSERT INTO users(email, nama, password_hash, google_sub, created_at)
    VALUES (${g.email}, ${g.nama.slice(0, 60)}, ${TANPA_PASSWORD}, ${g.sub}, ${sekarang()})
    ON CONFLICT DO NOTHING
    RETURNING ${kolom}`;
  // Bentrok (email sudah tertaut ke akun Google lain, atau dua permintaan bersamaan): tidak dibuat.
  return baru ? { ...baru, baru: true } : null;
}

// ---------- Daftar & ringkasan untuk admin ----------

export type FilterPengguna = "semua" | "aktif" | "diblokir" | "admin";

/**
 * Satu halaman pengguna, terbaru dulu, dengan kursor id (tanpa OFFSET). Jumlah nomor dihitung per baris
 * lewat indeks numbers_user_idx (LATERAL), bukan GROUP BY seluruh tabel nomor.
 */
export async function daftarPengguna(opsi: { cari?: string; filter?: FilterPengguna; sebelumId?: number; batas?: number }) {
  const sql = await db();
  const batas = Math.min(Math.max(opsi.batas ?? 25, 1), 100);
  const cari = opsi.cari?.trim().toLowerCase().slice(0, 100) ?? "";
  const pola = `%${cari.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const f = opsi.filter ?? "semua";
  const baris = await sql<BarisPengguna[]>`
    SELECT u.id, u.email, u.nama, u.peran, u.status, u.alasan_blokir, u.kuota_nomor, u.ai_penyedia, u.login_terakhir, u.created_at,
           u.password_hash NOT LIKE '!%' AS punya_password, u.google_sub IS NOT NULL AS google,
           COALESCE(n.jumlah, 0) AS jumlah_nomor
      FROM users u
      LEFT JOIN LATERAL (SELECT COUNT(*) AS jumlah FROM numbers WHERE user_id = u.id) n ON true
     WHERE (${opsi.sebelumId ?? null}::integer IS NULL OR u.id < ${opsi.sebelumId ?? null}::integer)
       AND (${cari} = '' OR u.email LIKE ${pola} OR lower(u.nama) LIKE ${pola})
       AND (${f} = 'semua' OR (${f} = 'admin' AND u.peran = 'admin') OR u.status = ${f})
     ORDER BY u.id DESC
     LIMIT ${batas + 1}`;
  return { daftar: baris.slice(0, batas), adaLagi: baris.length > batas };
}

export async function penggunaById(id: number): Promise<BarisPengguna | undefined> {
  const sql = await db();
  const [u] = await sql<BarisPengguna[]>`
    SELECT u.id, u.email, u.nama, u.peran, u.status, u.alasan_blokir, u.kuota_nomor, u.ai_penyedia, u.login_terakhir, u.created_at,
           u.password_hash NOT LIKE '!%' AS punya_password, u.google_sub IS NOT NULL AS google,
           (SELECT COUNT(*) FROM numbers WHERE user_id = u.id) AS jumlah_nomor
      FROM users u WHERE u.id = ${id}`;
  return u;
}

// ---------- Tindakan admin ----------

async function jumlahAdminAktif(): Promise<number> {
  const sql = await db();
  const [r] = await sql<{ n: number }[]>`SELECT COUNT(*) AS n FROM users WHERE peran = 'admin' AND status = 'aktif'`;
  return r.n;
}

/** Tindakan yang tidak boleh dikenakan admin pada dirinya sendiri atau pada admin aktif terakhir. */
async function jagaAdmin(admin: User, sasaran: BarisPengguna, aksi: string): Promise<void> {
  if (sasaran.id === admin.id) throw new PenggunaError(`Anda tidak bisa ${aksi} akun Anda sendiri.`);
  if (sasaran.peran === "admin" && sasaran.status === "aktif" && (await jumlahAdminAktif()) <= 1) throw new PenggunaError("Harus tersisa minimal satu admin aktif.");
}

export async function catatLog(admin: User, aksi: string, sasaran: string | null, detail?: string): Promise<void> {
  const sql = await db();
  await sql`INSERT INTO admin_log(admin_id, admin, aksi, sasaran, detail, waktu) VALUES (${admin.id}, ${admin.email}, ${aksi}, ${sasaran}, ${detail ?? null}, ${sekarang()})`;
}

export async function daftarLog(batas = 30) {
  const sql = await db();
  return [...(await sql<{ id: number; admin: string; aksi: string; sasaran: string | null; detail: string | null; waktu: number }[]>`
    SELECT id, admin, aksi, sasaran, detail, waktu FROM admin_log ORDER BY waktu DESC, id DESC LIMIT ${batas}`)];
}

async function wajib(id: number): Promise<BarisPengguna> {
  const u = await penggunaById(id);
  if (!u) throw new PenggunaError("Pengguna tidak ditemukan.");
  return u;
}

export async function setKuota(admin: User, id: number, kuota: number | null): Promise<void> {
  const u = await wajib(id);
  const sql = await db();
  await sql`UPDATE users SET kuota_nomor = ${kuota} WHERE id = ${id}`;
  await catatLog(admin, "ubah kuota", u.email, kuota === null ? "bawaan" : `${kuota} nomor`);
}

/** Paksa penyedia AI untuk semua nomor akun ini (null = ikut pengaturan Mesin AI); berlaku di pesan berikutnya. */
export async function setAiAkun(admin: User, id: number, penyedia: Penyedia | null): Promise<void> {
  const u = await wajib(id);
  const sql = await db();
  await sql`UPDATE users SET ai_penyedia = ${penyedia} WHERE id = ${id}`;
  segarkanAiAkun(id);
  await catatLog(admin, "ubah mesin AI akun", u.email, penyedia === null ? "ikut pengaturan umum" : penyedia === "anthropic" ? "Claude API" : "Hermes");
}

export async function setPeran(admin: User, id: number, peran: Peran): Promise<void> {
  const u = await wajib(id);
  if (u.peran === peran) return;
  if (peran === "user") await jagaAdmin(admin, u, "menurunkan peran");
  const sql = await db();
  await sql`UPDATE users SET peran = ${peran} WHERE id = ${id}`;
  await catatLog(admin, peran === "admin" ? "jadikan admin" : "jadikan pengguna biasa", u.email);
}

/** Blokir: semua sesi login dicabut dan AI berhenti membalas di semua nomornya (koneksi WhatsApp tidak diputus). */
export async function setBlokir(admin: User, id: number, blokir: boolean, alasan = ""): Promise<void> {
  const u = await wajib(id);
  if (blokir) await jagaAdmin(admin, u, "memblokir");
  const sql = await db();
  if (blokir) await sql`UPDATE users SET status = 'diblokir', alasan_blokir = ${alasan || null}, sesi_versi = sesi_versi + 1 WHERE id = ${id}`;
  else await sql`UPDATE users SET status = 'aktif', alasan_blokir = NULL, gagal_login = 0, kunci_sampai = 0 WHERE id = ${id}`;
  segarkanNomor();
  await catatLog(admin, blokir ? "blokir" : "buka blokir", u.email, alasan || undefined);
}

/** Password sementara acak (ditampilkan sekali ke admin); semua sesi lama pengguna itu ikut batal. */
export async function resetPassword(admin: User, id: number): Promise<string> {
  const u = await wajib(id);
  const sementara = `${randomBytes(9).toString("base64url")}7a`;
  const sql = await db();
  await sql`UPDATE users SET password_hash = ${await hashPassword(sementara)}, sesi_versi = sesi_versi + 1, gagal_login = 0, kunci_sampai = 0 WHERE id = ${id}`;
  await catatLog(admin, "reset password", u.email);
  return sementara;
}

/** Naikkan sesi_versi: semua sesi login akun ini batal. Mengembalikan data untuk membuat sesi baru (akun sendiri). */
export async function cabutSesi(id: number, admin?: User) {
  const sql = await db();
  const [u] = await sql<{ id: number; email: string; password_hash: string; sesi_versi: number }[]>`
    UPDATE users SET sesi_versi = sesi_versi + 1 WHERE id = ${id} RETURNING id, email, password_hash, sesi_versi`;
  if (!u) throw new PenggunaError("Pengguna tidak ditemukan.");
  if (admin) await catatLog(admin, "keluarkan dari semua perangkat", u.email);
  return u;
}

/** Hapus akun beserta semua nomornya. Sesi WhatsApp tiap nomor harus sudah dihapus pemanggil. */
export async function hapusPengguna(admin: User, id: number): Promise<void> {
  const u = await wajib(id);
  await jagaAdmin(admin, u, "menghapus");
  const sql = await db();
  await sql`DELETE FROM users WHERE id = ${id}`; // numbers & turunannya ikut terhapus (ON DELETE CASCADE)
  segarkanNomor();
  segarkanAiAkun(id);
  await catatLog(admin, "hapus akun", u.email, `${u.jumlah_nomor} nomor ikut dihapus`);
}

// ---------- Akun sendiri ----------

export async function ubahNama(id: number, nama: string): Promise<void> {
  const sql = await db();
  await sql`UPDATE users SET nama = ${nama} WHERE id = ${id}`;
}

/** Ganti password sendiri; sesi lain otomatis batal (sidik hash password berubah). Mengembalikan data untuk sesi baru. */
export async function gantiPassword(id: number, baru: string) {
  const sql = await db();
  const [u] = await sql<{ id: number; password_hash: string; sesi_versi: number }[]>`
    UPDATE users SET password_hash = ${await hashPassword(baru)} WHERE id = ${id} RETURNING id, password_hash, sesi_versi`;
  return u;
}

export async function passwordHash(id: number): Promise<string | undefined> {
  const sql = await db();
  const [u] = await sql<{ password_hash: string }[]>`SELECT password_hash FROM users WHERE id = ${id}`;
  return u?.password_hash;
}

// ---------- Tur panduan ----------

export async function turSelesai(id: number): Promise<string[]> {
  const sql = await db();
  const [u] = await sql<{ tur_selesai: string[] }[]>`SELECT tur_selesai FROM users WHERE id = ${id}`;
  return u?.tur_selesai ?? [];
}

export async function tandaiTurSelesai(id: number, nama: string): Promise<void> {
  const sql = await db();
  await sql`UPDATE users SET tur_selesai = array_append(tur_selesai, ${nama}) WHERE id = ${id} AND NOT (${nama} = ANY(tur_selesai))`;
}
