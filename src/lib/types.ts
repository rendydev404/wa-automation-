import type { RingkasAktivitas } from "./aktivitas";
import type { BitQr } from "./qr";

export type StatusSesiWa ="BELUM_ADA" | "STOPPED" | "STARTING" | "SCAN_QR_CODE" | "WORKING" | "FAILED";

export interface SesiNomor {
  status: StatusSesiWa;
  waId: string | null;
  nama: string | null;
  /** Penjelasan untuk pengguna bila sesi berhenti (QR kedaluwarsa, dikeluarkan dari HP, ditolak WhatsApp). */
  alasan: string | null;
}

/** Foto dari pelanggan, siap dikirim ke AI (base64 tanpa awalan data:). */
export interface Foto {
  mime: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  data: string;
}

/** Batas ukuran satu foto mentah; base64-nya (×4/3) tetap di bawah batas 5 MB per gambar model. */
export const MAKS_FOTO_BYTE = 3_700_000;

export const MIME_FOTO: readonly Foto["mime"][] = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export interface StatusWa {
  /** Mesin AI aktif bisa dihubungi. Nama mesinnya sengaja tidak dikirim: pengguna tidak perlu (dan tidak boleh) tahu. */
  ai: boolean;
  galatAi: { at: number; pesan: string } | null;
  /** Status per nomor, kunci = id nomor. */
  nomor: Record<number, SesiNomor>;
  /** Jumlah notifikasi in-app yang belum dibaca (lonceng). */
  notif: number;
  /** Detak aktivitas nomor-nomor ini sejak proses jalan (lib/aktivitas.ts), untuk maskot dashboard. */
  aktivitas: RingkasAktivitas;
}

export interface QrWa {
  status: StatusSesiWa;
  /** Matriks kode QR; hanya dikirim bila berbeda dari `h` yang dipegang klien. */
  qr?: BitQr;
  hash?: string;
  /** Kode tautan 8 karakter bila pengguna memilih menautkan dengan nomor telepon. */
  kodePairing?: string | null;
}
