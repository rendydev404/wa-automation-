import type { PolaHalaman } from "./analitik-def";

/**
 * Nama ramah per pola halaman (POLA_HALAMAN di analitik-def.ts) untuk laporan analitik admin. Murni, aman dipakai di
 * server maupun klien. Record wajib lengkap: pola halaman baru tanpa nama di sini = galat tsc.
 */
export const NAMA_HALAMAN: Record<PolaHalaman, string> = {
  "/": "Beranda (landing page)",
  "/login": "Masuk",
  "/daftar": "Daftar akun",
  "/lupa-password": "Lupa password",
  "/mode-api": "Mode API (mesin)",
  "/program-afiliasi": "Info program afiliasi",
  "/panduan": "Panduan cara pakai (bergambar)",
  "/docs/api": "Dokumentasi Developer API",
  "/docs/api/mulai-cepat": "Docs API: Mulai cepat",
  "/docs/api/pasang-mesin": "Docs API: Pasang mesin",
  "/docs/api/autentikasi": "Docs API: Autentikasi",
  "/docs/api/referensi": "Docs API: Referensi endpoint",
  "/docs/api/webhook": "Docs API: Webhook",
  "/docs/api/galat": "Docs API: Kode galat",
  "/docs/api/sandbox": "Docs API: Sandbox",
  "/docs/api/ui-sendiri": "Docs API: Bangun UI sendiri",
  "/docs/api/lisensi": "Docs API: Lisensi & batas",
  "/dashboard": "Dashboard",
  "/akun": "Akun saya",
  "/afiliasi": "Afiliasi saya",
  "/notifikasi": "Notifikasi",
  "/trial-habis": "Nyalakan AI lagi (kuota gratis habis)",
  "/langganan": "Langganan & paket",
  "/langganan/bayar/[paket]": "Pembayaran paket",
  "/langganan/tagihan/[order]": "Tagihan pembayaran",
  "/nomor/[id]": "Kelola nomor WhatsApp",
  "/developer": "Developer API (portal)",
  "/developer/[id]": "Developer API · Detail aplikasi",
  "/developer/[id]/bayar": "Developer API · Pembayaran",
  "/admin": "Admin · Ringkasan",
  "/admin/analitik": "Admin · Analitik",
  "/admin/developer-api": "Admin · Developer API",
  "/admin/developer-api/[id]": "Admin · Tinjau aplikasi API",
  "/admin/afiliasi": "Admin · Afiliasi",
  "/admin/ai": "Admin · Mesin AI",
  "/admin/aturan": "Admin · Aturan",
  "/admin/followup": "Admin · Follow-up WA",
  "/admin/log": "Admin · Log admin",
  "/admin/paket": "Admin · Paket & harga",
  "/admin/pengguna": "Admin · Daftar pengguna",
  "/admin/pengguna/[id]": "Admin · Kelola pengguna",
  "/admin/pixel": "Admin · Meta Pixel",
  "/admin/transaksi": "Admin · Transaksi",
  "/admin/transaksi/[order]": "Admin · Detail transaksi",
};

/** Pola halaman -> nama ramah; pola yang tidak dikenal dikembalikan apa adanya. */
export function namaHalaman(pola: string): string {
  return Object.hasOwn(NAMA_HALAMAN, pola) ? NAMA_HALAMAN[pola as PolaHalaman] : pola;
}
