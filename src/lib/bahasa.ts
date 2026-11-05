/**
 * Bahasa tampilan: Indonesia (bawaan, tanpa awalan URL) dan Inggris (awalan /eng, mis. /eng/dashboard).
 * Murni tanpa I/O — dipakai server maupun browser. Di dalam aplikasi, rute ada di src/app/[lang]/ dengan
 * lang = "id" | "en"; proxy.ts menulis ulang /eng/... -> /en/... dan jalur lain -> /id/... (URL di browser tetap).
 *
 * Teks diterjemahkan langsung di tempat: t("Masuk", "Sign in"). Kalimat Indonesia tetap terbaca di kode,
 * terjemahannya tepat di sebelahnya.
 */

export type Bahasa = "id" | "en";
export const DAFTAR_BAHASA: readonly Bahasa[] = ["id", "en"];
export const bahasaSah = (x: unknown): x is Bahasa => x === "id" || x === "en";

/** Awalan URL versi Inggris. */
export const AWALAN_EN = "/eng";

/** Header permintaan yang dipasang proxy.ts: bahasa halaman asal (untuk server action & route handler). */
export const HEADER_BAHASA = "x-bahasa";

export type T = (id: string, en: string) => string;
const tId: T = (id) => id;
const tEn: T = (_id, en) => en;
export const pembuatT = (b: Bahasa): T => (b === "en" ? tEn : tId);

/** Locale Intl untuk angka & tanggal. */
export const LOKAL: Record<Bahasa, string> = { id: "id-ID", en: "en-US" };

/** Jalur internal ("/dashboard", "/login?x=1") -> URL sesuai bahasa ("/eng/dashboard"). Tautan luar & "#..." dibiarkan. */
export function tautan(b: Bahasa, jalur: string): string {
  if (b !== "en" || !jalur.startsWith("/") || jalur.startsWith("//") || jalur.startsWith("/api/")) return jalur;
  if (jalur === AWALAN_EN || jalur.startsWith(`${AWALAN_EN}/`) || jalur.startsWith(`${AWALAN_EN}?`) || jalur.startsWith(`${AWALAN_EN}#`)) return jalur;
  if (jalur === "/") return AWALAN_EN;
  if (jalur.startsWith("/?") || jalur.startsWith("/#")) return AWALAN_EN + jalur.slice(1);
  // Panel admin hanya berbahasa Indonesia.
  if (jalur === "/admin" || jalur.startsWith("/admin/") || jalur.startsWith("/admin?")) return jalur;
  return AWALAN_EN + jalur;
}

/** Pathname browser ("/eng/nomor/3") -> bahasa + jalur logis ("/nomor/3"). */
export function urai(pathname: string): { bahasa: Bahasa; jalur: string } {
  if (pathname === AWALAN_EN) return { bahasa: "en", jalur: "/" };
  if (pathname.startsWith(`${AWALAN_EN}/`)) return { bahasa: "en", jalur: pathname.slice(AWALAN_EN.length) };
  return { bahasa: "id", jalur: pathname };
}
