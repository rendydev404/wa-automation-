/**
 * Landing page per industri (chatgercep.com/<slug>). Tanpa "server-only" dan tanpa impor data: dipakai proxy.ts
 * (jalur publik tanpa login) tanpa ikut membawa isi JSON tiap industri.
 *
 * Menambah industri: buat lp/industri/<slug>.json (salin yang sudah ada), daftarkan di src/lib/lp/industri.ts, tambahkan
 * slugnya di sini, lalu buat src/app/[lang]/(lp)/<slug>/route.ts (satu baris, sama seperti yang lain).
 */
export const SLUG_LP = [
  "toko-online",
  "laundry",
  "klinik-kecantikan",
  "rental-mobil",
  "maklon-kosmetik",
  "bengkel",
  "distributor",
  "travel-umrah",
  "catering",
  "kursus-les",
] as const;
export type SlugLp = (typeof SLUG_LP)[number];

/** Jalur publik halaman LP (tanpa login), termasuk syarat garansi dan sitemap-nya. */
export const JALUR_LP_PUBLIK: readonly string[] = [...SLUG_LP.map((s) => `/${s}`), "/garansi", "/sitemap-lp.xml"];

/** Nama industri untuk landing versi Inggris (isi LP sendiri hanya berbahasa Indonesia). */
export const NAMA_LP_EN: Record<SlugLp, string> = {
  "toko-online": "Online store",
  laundry: "Laundry",
  "klinik-kecantikan": "Beauty clinic",
  "rental-mobil": "Car rental",
  "maklon-kosmetik": "Cosmetics OEM",
  bengkel: "Auto repair shop",
  distributor: "Distributor & wholesale",
  "travel-umrah": "Umrah travel",
  catering: "Catering",
  "kursus-les": "Courses & tutoring",
};
