/**
 * Definisi & rumus murni sistem afiliasi (bisa diimpor komponen client maupun server).
 */

export const COOKIE_REF = "wa_ref";
export const UMUR_COOKIE_REF = 30 * 86400; // 30 hari

export type JenisKomisi = "persen" | "rupiah";
export type StatusAfiliator = "menunggu" | "aktif" | "nonaktif";
export type StatusPenarikan = "menunggu" | "selesai" | "ditolak";
export type SiklusKomisi = "pertama" | "berulang";
export type ModePersetujuanAfiliasi = "otomatis" | "manual";

export interface PengaturanAfiliasi {
  aktif: boolean;
  persetujuan: ModePersetujuanAfiliasi;
  siklus: SiklusKomisi;
  minTarik: number;
}

export interface OpsiBank {
  id: string;
  nama: string;
  /** Kode beneficiary_bank untuk Midtrans Iris Payouts API. */
  iris: string;
  kategori: "Bank" | "E-Wallet";
}

export const DAFTAR_BANK: readonly OpsiBank[] = [
  { id: "bca", nama: "BCA", iris: "bca", kategori: "Bank" },
  { id: "mandiri", nama: "Bank Mandiri", iris: "mandiri", kategori: "Bank" },
  { id: "bni", nama: "BNI", iris: "bni", kategori: "Bank" },
  { id: "bri", nama: "BRI", iris: "bri", kategori: "Bank" },
  { id: "bsi", nama: "BSI (Bank Syariah Indonesia)", iris: "bsi", kategori: "Bank" },
  { id: "cimb", nama: "CIMB Niaga", iris: "cimb", kategori: "Bank" },
  { id: "permata", nama: "Bank Permata", iris: "permata", kategori: "Bank" },
  { id: "seabank", nama: "SeaBank", iris: "seabank", kategori: "Bank" },
  { id: "jago", nama: "Bank Jago", iris: "jago", kategori: "Bank" },
  { id: "danamon", nama: "Bank Danamon", iris: "danamon", kategori: "Bank" },
  { id: "gopay", nama: "GoPay", iris: "gopay", kategori: "E-Wallet" },
  { id: "ovo", nama: "OVO", iris: "ovo", kategori: "E-Wallet" },
  { id: "dana", nama: "DANA", iris: "dana", kategori: "E-Wallet" },
  { id: "shopeepay", nama: "ShopeePay", iris: "shopeepay", kategori: "E-Wallet" },
] as const;

export const MIN_PENARIKAN_BAWAAN = 50_000;
export const POLA_KODE_REF = /^[a-z0-9][a-z0-9-]{1,22}[a-z0-9]$/;

export function normalkanKodeRef(mentah: string): string | null {
  const k = mentah.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  return k.length >= 3 && k.length <= 24 && POLA_KODE_REF.test(k) ? k : null;
}

export function namaBankTampil(idAtauNama: string): string {
  return DAFTAR_BANK.find((b) => b.id === idAtauNama || b.nama.toLowerCase() === idAtauNama.toLowerCase())?.nama ?? idAtauNama;
}

export function kodeIrisBank(idAtauNama: string): string {
  return DAFTAR_BANK.find((b) => b.id === idAtauNama || b.nama.toLowerCase() === idAtauNama.toLowerCase())?.iris ?? idAtauNama.toLowerCase();
}

/**
 * Hitung nominal komisi (Rp) dari jumlah yang dibayar pelanggan.
 * - persen: dibulatkan ke bawah (Math.floor) dari harga × persen / 100.
 * - rupiah: nominal tetap, tetapi tidak pernah melebihi jumlah yang dibayar.
 */
export function hitungKomisiPaket(jumlahBayar: number, jenis: JenisKomisi, nilai: number): number {
  if (jumlahBayar <= 0 || nilai <= 0) return 0;
  if (jenis === "persen") {
    const p = Math.min(100, Math.max(0, nilai));
    return Math.floor((jumlahBayar * p) / 100);
  }
  return Math.min(jumlahBayar, Math.round(nilai));
}

export function labelKomisiPaket(jenis: JenisKomisi, nilai: number, hargaPaket?: number): string {
  if (nilai <= 0) return "Tanpa komisi";
  if (jenis === "persen") {
    const perkiraan = hargaPaket && hargaPaket > 0 ? ` (Rp${hitungKomisiPaket(hargaPaket, "persen", nilai).toLocaleString("id-ID")})` : "";
    return `${nilai}%${perkiraan}`;
  }
  return `Rp${nilai.toLocaleString("id-ID")}`;
}
