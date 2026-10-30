import "server-only";
import { getSetting, setSetting } from "./db";

/**
 * Kartu paket "Custom" di daftar harga (landing & halaman Langganan): bukan paket yang bisa dibeli, melainkan ajakan
 * menghubungi admin lewat WhatsApp untuk kebutuhan di luar paket biasa (banyak nomor, kuota besar, harga khusus).
 * Satu kartu saja, isinya diatur admin di Paket & harga dan disimpan sebagai JSON di settings.
 */
export interface PaketCustom {
  aktif: boolean;
  nama: string;
  deskripsi: string;
  harga: string; // teks bebas, mis. "Hubungi kami" atau "Mulai Rp1 juta"
  fitur: string[]; // satu poin per baris
  wa: string; // nomor WhatsApp admin (digit berawalan kode negara)
  pesan: string; // teks pembuka chat WhatsApp
  tombol: string;
}

const KUNCI = "paket_custom";

export const BAWAAN_CUSTOM: PaketCustom = {
  aktif: false,
  nama: "Custom",
  deskripsi: "Untuk kebutuhan khusus: banyak cabang, kuota besar, atau harga khusus.",
  harga: "Hubungi kami",
  fitur: ["Jumlah nomor WhatsApp sesuai kebutuhan", "Kuota balasan AI sesuai kebutuhan", "Durasi & harga bisa dinegosiasikan", "Bantuan penyiapan base knowledge"],
  wa: "",
  pesan: "Halo, saya tertarik dengan paket Custom WhatsApp Automation.",
  tombol: "Hubungi kami",
};

export const BATAS_CUSTOM = { nama: 40, deskripsi: 200, harga: 40, fitur: 8, panjangFitur: 80, pesan: 300, tombol: 30 } as const;

export async function paketCustom(): Promise<PaketCustom> {
  const mentah = await getSetting(KUNCI);
  if (!mentah) return BAWAAN_CUSTOM;
  try {
    return { ...BAWAAN_CUSTOM, ...(JSON.parse(mentah) as Partial<PaketCustom>) };
  } catch {
    return BAWAAN_CUSTOM;
  }
}

export async function simpanPaketCustom(p: PaketCustom): Promise<void> {
  await setSetting(KUNCI, JSON.stringify(p));
}

/** Kartu tampil hanya bila dinyalakan admin dan nomor WhatsApp tujuannya terisi. */
export const customTampil = (p: PaketCustom): boolean => p.aktif && !!p.wa;

/** Tautan chat WhatsApp ke admin; `tambahan` (mis. email akun) ditempel di bawah pesan pembuka. */
export function tautanCustom(p: PaketCustom, tambahan?: string): string {
  const teks = [p.pesan.trim(), tambahan?.trim()].filter(Boolean).join("\n");
  return `https://wa.me/${p.wa}${teks ? `?text=${encodeURIComponent(teks)}` : ""}`;
}
