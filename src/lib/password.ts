import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// Format: scrypt:N:r:p:saltBase64:hashBase64
const KEY_LEN = 64;

function derive(password: string, salt: Buffer, N: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LEN, { N, r, p, maxmem: 128 * N * r * 2 }, (err, key) =>
      err ? reject(err) : resolve(key)
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const N = 16384;
  const r = 8;
  const p = 1;
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, r, p);
  return `scrypt:${N}:${r}:${p}:${salt.toString("base64")}:${key.toString("base64")}`;
}

const UMUM = new Set(["1234567890", "12345678910", "qwertyuiop", "password123", "passw0rd123", "katasandi123", "bismillah123", "indonesia123", "asdfghjkl1", "0987654321"]);

/** Aturan password akun: null = boleh dipakai, selain itu pesan penjelasannya. */
export function cekPassword(password: string, email = ""): string | null {
  if (password.length < 10) return "Password minimal 10 karakter.";
  if (password.length > 200) return "Password maksimal 200 karakter.";
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return "Password harus memuat huruf dan angka.";
  if (/^(.)\1+$/.test(password) || UMUM.has(password.toLowerCase())) return "Password terlalu mudah ditebak.";
  const lokal = email.split("@")[0]?.toLowerCase();
  if (lokal && lokal.length >= 4 && password.toLowerCase().includes(lokal)) return "Password tidak boleh memuat email Anda.";
  return null;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltB64, hashB64] = stored.split(":");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  try {
    const expected = Buffer.from(hashB64, "base64");
    const actual = await derive(password, Buffer.from(saltB64, "base64"), Number(n), Number(r), Number(p));
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
