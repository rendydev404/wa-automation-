import type { BitQr } from "./qr";

export type StatusSesiWa ="BELUM_ADA" | "STOPPED" | "STARTING" | "SCAN_QR_CODE" | "WORKING" | "FAILED";

export interface SesiNomor {
  status: StatusSesiWa;
  waId: string | null;
  nama: string | null;
  /** Penjelasan untuk pengguna bila sesi berhenti (QR kedaluwarsa, dikeluarkan dari HP, ditolak WhatsApp). */
  alasan: string | null;
}

export interface StatusWa {
  hermes: boolean;
  galatAi: { at: number; pesan: string } | null;
  /** Status per nomor, kunci = id nomor. */
  nomor: Record<number, SesiNomor>;
}

export interface QrWa {
  status: StatusSesiWa;
  /** Matriks kode QR; hanya dikirim bila berbeda dari `h` yang dipegang klien. */
  qr?: BitQr;
  hash?: string;
}
