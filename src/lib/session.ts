import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_MAX_AGE, createSessionToken, passwordFingerprint, verifySessionToken } from "./auth";
import { db, getSetting, sekarang } from "./db";
import { hakAkun } from "./langganan";
import { hashPassword } from "./password";

export type Peran = "admin" | "user";

export interface User {
  id: number;
  email: string;
  nama: string;
  peran: Peran;
}

export interface UserRow extends User {
  password_hash: string;
  status: "aktif" | "diblokir";
  alasan_blokir: string | null;
  sesi_versi: number;
  gagal_login: number;
  kunci_sampai: number;
}

const KOLOM_ROW = "id, email, nama, peran, password_hash, status, alasan_blokir, sesi_versi, gagal_login, kunci_sampai";

/** Buat admin pertama dari env bila tabel pengguna masih kosong. */
async function seedAdmin(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 10) return;
  const sql = await db();
  const [ada] = await sql`SELECT 1 FROM users LIMIT 1`;
  if (ada) return;
  const hash = await hashPassword(password);
  await sql`INSERT INTO users(email, password_hash, peran, nama, created_at) VALUES (${email}, ${hash}, 'admin', 'Admin', ${sekarang()}) ON CONFLICT (email) DO NOTHING`;
}

const g = globalThis as unknown as { __waSeed?: Promise<void> };

/**
 * Admin pertama dari env dibuat sekali, sebelum akun lain bisa terbentuk: dipanggil saat server mulai, saat login,
 * dan sebelum pendaftaran (formulir & Google), supaya pendaftar pertama di instalasi baru tidak membuat app tanpa admin.
 */
export function pastikanAdminAwal(): Promise<void> {
  return (g.__waSeed ??= seedAdmin().catch((e) => {
    g.__waSeed = undefined; // database belum siap: coba lagi di panggilan berikutnya
    throw e;
  }));
}

export function findUserByEmail(email: string): Promise<UserRow | undefined> {
  return pastikanAdminAwal().then(async () => {
    const sql = await db();
    const [u] = await sql<UserRow[]>`SELECT ${sql.unsafe(KOLOM_ROW)} FROM users WHERE email = ${email}`;
    return u;
  });
}

/**
 * Pengguna dari cookie sesi, atau null. Sesi batal bila password diganti, sesi_versi dinaikkan
 * (blokir / keluar dari semua perangkat), atau akun diblokir.
 * Di-memo per permintaan: layout (sidebar) dan halaman memeriksanya bersamaan dengan satu query.
 */
export const getUser = cache(async (): Promise<User | null> => {
  const payload = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!payload) return null;
  const sql = await db();
  const [row] = await sql<UserRow[]>`SELECT ${sql.unsafe(KOLOM_ROW)} FROM users WHERE id = ${payload.uid}`;
  if (!row || row.status !== "aktif" || row.sesi_versi !== payload.sv) return null;
  if ((await passwordFingerprint(row.password_hash)) !== payload.pv) return null;
  return { id: row.id, email: row.email, nama: row.nama, peran: row.peran };
});

export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

/** Halaman/aksi khusus admin. Bukan admin = 404 (keberadaan halamannya tidak dibocorkan). */
export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.peran !== "admin") notFound();
  return user;
}

export async function mulaiSesi(user: Pick<UserRow, "id" | "password_hash" | "sesi_versi">, https: boolean): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(user.id, user.password_hash, user.sesi_versi), {
    httpOnly: true,
    secure: https,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function akhiriSesi(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

// ---------- Kunci akun setelah login gagal beruntun ----------

export const MAKS_GAGAL_LOGIN = 8;
const KUNCI_DETIK = 15 * 60;

/** Login gagal: hitung, dan kunci akun 15 menit setelah MAKS_GAGAL_LOGIN kali berturut-turut. */
export async function catatLoginGagal(id: number): Promise<void> {
  const sql = await db();
  await sql`
    UPDATE users SET gagal_login = CASE WHEN gagal_login + 1 >= ${MAKS_GAGAL_LOGIN} THEN 0 ELSE gagal_login + 1 END,
                     kunci_sampai = CASE WHEN gagal_login + 1 >= ${MAKS_GAGAL_LOGIN} THEN ${sekarang() + KUNCI_DETIK} ELSE kunci_sampai END
     WHERE id = ${id}`;
}

export async function catatLoginBerhasil(id: number): Promise<void> {
  const sql = await db();
  await sql`UPDATE users SET gagal_login = 0, kunci_sampai = 0, login_terakhir = ${sekarang()} WHERE id = ${id}`;
}

// ---------- Kuota nomor ----------

/** Kuota nomor akun tanpa paket (pengaturan admin); sumbernya langganan.ts. */
export { kuotaNomorGratis as kuotaBawaan } from "./langganan";

/** Jumlah nomor maksimal milik pengguna ini; null = tanpa batas (admin). Dari paket aktif / kuota gratis (langganan.ts). */
export async function kuotaNomor(user: User): Promise<number | null> {
  return (await hakAkun(user)).nomor;
}

export async function pendaftaranDibuka(): Promise<boolean> {
  return (await getSetting("pendaftaran")) !== "tutup";
}
