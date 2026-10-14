import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_MAX_AGE, createSessionToken, passwordFingerprint, verifySessionToken } from "./auth";
import { db, sekarang } from "./db";
import { hashPassword } from "./password";

export interface User {
  id: number;
  email: string;
}

interface UserRow extends User {
  password_hash: string;
}

/** Buat admin pertama dari env bila tabel pengguna masih kosong. */
async function seedAdmin(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 10) return;
  const sql = await db();
  const [ada] = await sql`SELECT 1 FROM users LIMIT 1`;
  if (ada) return;
  const hash = await hashPassword(password);
  await sql`INSERT INTO users(email, password_hash, created_at) VALUES (${email}, ${hash}, ${sekarang()}) ON CONFLICT (email) DO NOTHING`;
}

const g = globalThis as unknown as { __waSeed?: Promise<void> };

export function findUserByEmail(email: string): Promise<UserRow | undefined> {
  return (g.__waSeed ??= seedAdmin().catch((e) => {
    g.__waSeed = undefined; // database belum siap: coba lagi di login berikutnya
    throw e;
  })).then(async () => {
    const sql = await db();
    const [u] = await sql<UserRow[]>`SELECT id, email, password_hash FROM users WHERE email = ${email}`;
    return u;
  });
}

/**
 * Pengguna dari cookie sesi, atau null. Sesi batal bila password sudah diganti.
 * Di-memo per permintaan: layout (sidebar) dan halaman memeriksanya bersamaan dengan satu query.
 */
export const getUser = cache(async (): Promise<User | null> => {
  const payload = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!payload) return null;
  const sql = await db();
  const [row] = await sql<UserRow[]>`SELECT id, email, password_hash FROM users WHERE id = ${payload.uid}`;
  if (!row || (await passwordFingerprint(row.password_hash)) !== payload.pv) return null;
  return { id: row.id, email: row.email };
});

export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export async function mulaiSesi(user: UserRow, https: boolean): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(user.id, user.password_hash), {
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
