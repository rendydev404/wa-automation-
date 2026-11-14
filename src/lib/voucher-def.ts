/**
 * Definisi & konstanta Voucher Panduan Produk Digital (akbaralatas.com) & Voucher Promo Admin.
 * Aman diimpor dari komponen klien maupun server.
 */

export type ModeKlaimVoucher = "tambah" | "ganti";
export type StatusVoucher = "belum_diklaim" | "diklaim" | "dibatalkan";
export type SumberVoucher = "panduan" | "admin";

export interface PengaturanVoucher {
  /** Apakah fitur klaim voucher aktif untuk pengguna. */
  aktif: boolean;
  /** Nama paket yang tercatat di langganan saat voucher Panduan diklaim. */
  nama_paket: string;
  /** Masa aktif (hari) yang diberikan voucher Panduan. */
  durasi_hari: number;
  /** Kuota maksimal nomor WhatsApp yang dapat dihubungkan. */
  kuota_nomor: number;
  /** Kuota balasan AI yang didapatkan dari voucher Panduan. */
  kuota_balasan: number;
  /**
   * Perilaku saat pengguna yang sudah punya langganan aktif mengklaim voucher:
   * - "tambah": akumulasi kuota balasan AI & perpanjang masa aktif (kuota lama tidak hangus).
   * - "ganti": mulai periode baru sesuai spesifikasi voucher.
   */
  mode_klaim: ModeKlaimVoucher;
}

export const BAWAAN_PENGATURAN_VOUCHER: PengaturanVoucher = {
  aktif: true,
  nama_paket: "Paket Panduan",
  durasi_hari: 30,
  kuota_nomor: 1,
  kuota_balasan: 1500,
  mode_klaim: "tambah",
};

export interface VoucherTersedia {
  id: number;
  kode: string;
  nama_paket: string;
  durasi_hari: number;
  kuota_nomor: number;
  kuota_balasan: number;
  order_id: string | null;
  dibuat: number;
}

export interface BarisVoucher {
  id: number;
  kode: string;
  sumber: SumberVoucher;
  order_id: string | null;
  pembeli_nama: string | null;
  pembeli_email: string | null;
  pembeli_wa: string | null;
  harga_beli: number | null;
  nama_paket: string;
  durasi_hari: number;
  kuota_nomor: number;
  kuota_balasan: number;
  status: StatusVoucher;
  diklaim_oleh: number | null;
  diklaim_email: string | null;
  diklaim_nama: string | null;
  diklaim_pada: number | null;
  langganan_id: number | null;
  transaksi_id: number | null;
  catatan: string | null;
  dibuat: number;
}

export interface RingkasanVoucher {
  total: number;
  belum_diklaim: number;
  diklaim: number;
  dibatalkan: number;
  dari_panduan: number;
  dari_admin: number;
}

/**
 * Normalisasi kode voucher yang diketik/ditempel pengguna awam:
 * - Mengubah ke huruf besar, menghapus spasi/tanda baca selain strip.
 * - Bila pengguna menempelkan "CG8K2M9P4Q" atau "CG 8K2M 9P4Q" (tanpa strip), otomatis diformat menjadi "CG-8K2M-9P4Q".
 */
export function normalisasiKodeVoucher(mentah: string): string {
  const bersih = String(mentah ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const tanpaStrip = bersih.replace(/-/g, "");
  if (/^[A-Z]{2}[A-Z0-9]{8}$/.test(tanpaStrip)) {
    return `${tanpaStrip.slice(0, 2)}-${tanpaStrip.slice(2, 6)}-${tanpaStrip.slice(6, 10)}`;
  }
  return bersih.slice(0, 32);
}

/** Validasi bentuk dasar kode voucher (mis. CG-XXXX-XXXX). */
export function kodeVoucherSah(kode: string): boolean {
  const norm = normalisasiKodeVoucher(kode);
  return /^[A-Z0-9]{2,6}-[A-Z0-9]{3,8}(-[A-Z0-9]{3,8})?$/.test(norm);
}
