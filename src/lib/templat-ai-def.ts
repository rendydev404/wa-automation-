/**
 * Template AI per industri untuk kolom "Instruksi khusus" nomor (isi di lp/prompt/<slug>.md, sama dengan yang
 * dijanjikan landing page industri langkah 4). Tanpa I/O dan tanpa "server-only": dipakai pengaturan nomor di browser,
 * server action penyimpan, dan uji. Teks templat sendiri dimuat saat dipilih (GET /api/templat-ai), tidak dibundel.
 */
import { SLUG_LP, type SlugLp } from "./lp/def";

/** Batas panjang instruksi khusus per nomor (karakter). Template terpanjang ±2.800 karakter sebelum diisi pemilik. */
export const MAKS_INSTRUKSI = 5000;

export const TEMPLAT_AI: readonly { slug: SlugLp; label: string; labelEn: string }[] = [
  { slug: "toko-online", label: "Toko online / olshop", labelEn: "Online store" },
  { slug: "laundry", label: "Laundry", labelEn: "Laundry" },
  { slug: "klinik-kecantikan", label: "Klinik kecantikan", labelEn: "Beauty clinic" },
  { slug: "rental-mobil", label: "Rental mobil", labelEn: "Car rental" },
  { slug: "maklon-kosmetik", label: "Maklon kosmetik", labelEn: "Cosmetics OEM" },
  { slug: "bengkel", label: "Bengkel", labelEn: "Auto repair shop" },
  { slug: "distributor", label: "Distributor / grosir", labelEn: "Distributor / wholesale" },
  { slug: "travel-umrah", label: "Travel umrah", labelEn: "Umrah travel" },
  { slug: "catering", label: "Catering", labelEn: "Catering" },
  { slug: "kursus-les", label: "Kursus & les", labelEn: "Courses & tutoring" },
];

export const slugTemplatSah = (s: unknown): s is SlugLp => typeof s === "string" && (SLUG_LP as readonly string[]).includes(s);

/**
 * Berkas .md -> teks siap tempel: judul & catatan "Salin ke dashboard" dibuang, dan baris "Contoh baris: ..." dijadikan
 * penanda [...] supaya data contoh (harga fiktif) wajib diganti/dihapus dan tidak pernah terbaca AI sebagai fakta.
 */
export function siapkanTemplat(md: string): string {
  return md
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((b) => !/^#\s/.test(b) && !/^>\s/.test(b))
    .map((b) => b.replace(/^(\s*)Contoh baris:\s*(.+)$/i, "$1[Contoh, ganti dengan data Anda: $2]"))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Penanda isian template yang belum diganti, mis. "[Nama Laundry]" (unik, urut kemunculan). */
export function sisaPenanda(teks: string): string[] {
  return [...new Set(teks.match(/\[[^\]\n]{2,}\]/g) ?? [])];
}
