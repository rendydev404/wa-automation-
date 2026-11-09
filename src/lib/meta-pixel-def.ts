/**
 * Definisi & ekstraktor pintar Meta Ads Pixel (murni tanpa I/O, aman dipakai di Server maupun Client).
 */

export const EVENT_META_PIXEL = {
  page_view: {
    kode: "PageView",
    label: "PageView (Kunjungan Halaman)",
    ket: "Otomatis melacak setiap kunjungan di halaman Landing, Afiliasi, Login, Daftar, dan perpindahan halaman.",
    bawaan: true,
  },
  view_content: {
    kode: "ViewContent",
    label: "ViewContent (Lihat Landing Page Industri)",
    ket: "Melacak kunjungan ke landing page industri (/laundry, /bengkel, dst.) beserta industrinya, dari browser dan server (CAPI).",
    bawaan: true,
  },
  lead_wa: {
    kode: "Lead",
    label: "Lead (Klik Tombol & Widget WhatsApp)",
    ket: "Melacak saat pengunjung mengklik tombol Coba Tes WA, Widget Chat WA, atau tombol konsultasi WA.",
    bawaan: true,
  },
  complete_registration: {
    kode: "CompleteRegistration",
    label: "CompleteRegistration (Daftar Akun Baru)",
    ket: "Melacak otomatis saat pengunjung selesai mendaftar akun baru (formulir pendaftaran maupun Google).",
    bawaan: true,
  },
  initiate_checkout: {
    kode: "InitiateCheckout",
    label: "InitiateCheckout (Klik Pilih Paket)",
    ket: "Melacak saat pengguna menekan tombol Pilih Paket / Perpanjang di halaman Langganan.",
    bawaan: true,
  },
  purchase: {
    kode: "Purchase",
    label: "Purchase (Pembayaran Paket Lunas)",
    ket: "Melacak transaksi paket berbayar yang lunas beserta nominal harga (IDR) dan nama paket.",
    bawaan: true,
  },
} as const;

export type KunciEventMeta = keyof typeof EVENT_META_PIXEL;

export const KUNCI_EVENT_META = Object.keys(EVENT_META_PIXEL) as KunciEventMeta[];

export interface PengaturanMetaPixel {
  aktif: boolean;
  pixelId: string;
  capiToken: string;
  testEventCode: string;
  event: Record<KunciEventMeta, boolean>;
}

export interface KonfigMetaPixelPublik {
  aktif: boolean;
  pixelId: string;
  event: Record<KunciEventMeta, boolean>;
}

/** Data browser pengunjung yang dipakai Meta untuk mencocokkan event server dengan orang yang melihat iklan. */
export interface KonteksMeta {
  fbp?: string;
  fbc?: string;
  ip?: string;
  userAgent?: string;
  urlSumber?: string;
}

/**
 * Ekstrak ID Meta Pixel (8–25 digit angka) baik dari input angka langsung
 * maupun dari tempelan kode HTML/script lengkap Meta Events Manager.
 * Mengembalikan:
 * - `""` bila input kosong
 * - string angka ID Pixel bila valid
 * - `null` bila input terisi tetapi tidak mengandung ID Pixel yang sah
 */
export function ekstrakPixelId(mentah: string): string | null {
  const bersih = mentah.trim();
  if (!bersih) return "";

  // 1. Jika admin langsung menempelkan angka ID Pixel (8–25 digit, boleh ada spasi)
  const hanyaAngka = bersih.replace(/\s+/g, "");
  if (/^\d{8,25}$/.test(hanyaAngka)) return hanyaAngka;

  // 2. Jika admin menempelkan kode script Meta Pixel: fbq('init', '123456789012345')
  const dariFbq = bersih.match(/fbq\s*\(\s*['"]init['"]\s*,\s*['"](\d{8,25})['"]/i);
  if (dariFbq?.[1]) return dariFbq[1];

  // 3. Jika admin menempelkan tag noscript img: facebook.com/tr?id=123456789012345
  const dariNoscript = bersih.match(/facebook\.com\/tr\?id=(\d{8,25})/i);
  if (dariNoscript?.[1]) return dariNoscript[1];

  return null;
}

export const COOKIE_PIXEL_REG = "wa_px_reg";
