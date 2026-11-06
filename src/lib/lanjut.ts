/**
 * Halaman tujuan setelah login (`?lanjut=` di /login): mis. pemilik akun membuka tautan /trial-habis dari WhatsApp
 * dalam keadaan belum login. Hanya jalur internal halaman: harus diawali satu "/", tanpa skema/host, tanpa "//" atau
 * "\" (open redirect), bukan /api, /login, /daftar. Aman dipakai di server maupun klien. null = pakai halaman awal.
 */
const DILARANG = /^\/(api|login|daftar|lupa-password)(\/|\?|$)/;

export function jalurLanjut(v: unknown): string | null {
  if (typeof v !== "string" || v.length < 2 || v.length > 200) return null;
  if (!v.startsWith("/") || v.startsWith("//") || /[\\\s]/.test(v) || v.includes("://")) return null;
  if (DILARANG.test(v)) return null;
  return v;
}
