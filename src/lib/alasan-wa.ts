/**
 * Terjemahan Inggris untuk teks alasan status sesi WhatsApp (SesiNomor.alasan, diisi wa.ts di latar tanpa konteks
 * permintaan). Kuncinya teks Indonesia persis seperti di wa.ts — ubah keduanya bersamaan. Murni: dipakai di browser.
 */
const ALASAN_WA_EN: Record<string, string> = {
  "Sedang menyambung ulang (database atau WhatsApp belum terjangkau).": "Reconnecting (the database or WhatsApp can't be reached yet).",
  "Koneksi gagal dibuat (database atau WhatsApp tidak terjangkau). Coba hubungkan ulang.": "Couldn't connect (the database or WhatsApp can't be reached). Try reconnecting.",
  "Perangkat ini dikeluarkan dari WhatsApp di HP. Pindai QR lagi untuk menautkan.": "This device was logged out from WhatsApp on your phone. Scan the QR code again to link it.",
  "Kode tautan kedaluwarsa sebelum dimasukkan di HP. Minta kode baru atau pindai QR untuk menautkan.": "The link code expired before it was entered on your phone. Get a new code or scan the QR code to link.",
  "Kode QR tidak dipindai tepat waktu. Tampilkan QR baru untuk menautkan.": "The QR code wasn't scanned in time. Show a new QR code to link.",
  "Koneksi ke WhatsApp terputus sebelum nomor ditautkan. Coba lagi.": "The connection to WhatsApp dropped before the number was linked. Try again.",
  "Sedang menyambung ulang secara otomatis ke WhatsApp...": "Reconnecting to WhatsApp automatically...",
};

export const alasanWa = (alasan: string, b: "id" | "en"): string => (b === "en" ? (ALASAN_WA_EN[alasan] ?? alasan) : alasan);
