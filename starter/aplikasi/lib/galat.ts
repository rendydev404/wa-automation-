import "server-only";
import type { HasilAksi } from "./jenis";
import { KonfigurasiKurang } from "./klien";
import { GalatChatGerCep } from "./sdk";

/** Galat yang sudah diterjemahkan jadi pesan untuk pengguna. */
export interface GalatRamah {
  kode: string;
  /** Pesan utama, bahasa awam. */
  pesan: string;
  /** Keterangan asli dari mesin + id permintaan (untuk developer). */
  rinci?: string;
}

/**
 * Pesan ramah per kode galat. Kode yang tidak ada di sini (mis. `isian_tidak_sah`, `ditolak_anti_blokir`) memakai
 * pesan dari mesin apa adanya, karena pesannya sudah menjelaskan apa yang salah. Ubah teksnya sesuka Anda.
 */
const PESAN: Record<string, string> = {
  key_tidak_sah: "API key ditolak mesin. Periksa CHATGERCEP_KEY di .env.local (cg_test_… untuk sandbox, cg_live_… untuk production).",
  fitur_tidak_dibuka: "Fitur ini belum dibuka untuk aplikasi Anda. Minta fiturnya dibuka di portal Developer ChatGerCep.",
  bukan_nomor_penguji: "Mode sandbox hanya boleh berkomunikasi dengan satu nomor penguji yang sudah diverifikasi. Kirim ke nomor penguji Anda, atau pakai key production.",
  nomor_penguji_belum_ada: "Sandbox belum punya nomor penguji. Daftarkan di portal Developer: kirim WhatsApp berisi UJI <kode> ke nomor bot.",
  sandbox_kedaluwarsa: "Masa berlaku key sandbox habis. Perpanjang di portal Developer ChatGerCep.",
  sandbox_nonaktif: "Sandbox sedang dinonaktifkan untuk aplikasi ini.",
  lisensi_kedaluwarsa: "Lisensi mesin belum aktif atau kedaluwarsa. Buka dashboard mesin untuk melihat sebabnya.",
  belum_bayar: "Masa bayar aplikasi sudah habis. Bayar di portal Developer ChatGerCep.",
  aplikasi_ditangguhkan: "Aplikasi ini sedang ditangguhkan. Hubungi ChatGerCep.",
  aplikasi_dicabut: "Lisensi aplikasi ini sudah dicabut.",
  batas_nomor: "Batas jumlah nomor WhatsApp untuk mesin ini sudah tercapai.",
  nomor_belum_terhubung: "Nomor ini belum terhubung ke WhatsApp. Sambungkan dulu di halaman Sambungkan.",
  wa_sedang_menyambung: "WhatsApp sedang menyambung. Coba lagi beberapa detik lagi.",
  ai_tidak_tersedia: "AI sedang tidak bisa menjawab. Coba lagi sebentar lagi.",
  terlalu_sering: "Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.",
  bentrok_idempotensi: "Permintaan ini bentrok dengan permintaan sebelumnya. Muat ulang halaman lalu coba lagi.",
  galat_server: "Terjadi galat di mesin. Coba lagi.",
  jaringan: "Mesin ChatGerCep tidak bisa dihubungi. Pastikan mesin menyala dan CHATGERCEP_ALAMAT benar.",
  batas_waktu: "Mesin ChatGerCep terlalu lama menjawab. Coba lagi.",
};

export function galatRamah(e: unknown): GalatRamah {
  if (e instanceof KonfigurasiKurang) return { kode: "konfigurasi", pesan: e.message };
  if (e instanceof GalatChatGerCep) {
    const id = e.idPermintaan ? ` · id permintaan ${e.idPermintaan}` : "";
    if (e.kode === "galat_http" && e.status === 404)
      return { kode: e.kode, pesan: "Endpoint ini belum ada di mesin Anda. Perbarui mesin ChatGerCep ke versi terbaru.", rinci: `${e.message}${id}` };
    const ramah = PESAN[e.kode];
    return ramah ? { kode: e.kode, pesan: ramah, rinci: `${e.kode}: ${e.message}${id}` } : { kode: e.kode, pesan: e.message, rinci: `${e.kode}${id}` };
  }
  console.error("[starter] galat tak terduga:", e);
  return { kode: "tak_terduga", pesan: "Terjadi galat tak terduga. Lihat log server aplikasi." };
}

export type Hasil<T> = { ok: true; data: T } | { ok: false; galat: GalatRamah };

/** Jalankan panggilan SDK; galat dikembalikan sebagai nilai supaya halaman tetap tampil dengan pesan ramah. */
export async function coba<T>(fn: () => Promise<T>): Promise<Hasil<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, galat: galatRamah(e) };
  }
}

/** Galat -> hasil server action. */
export function hasilGagal(e: unknown): NonNullable<HasilAksi> {
  const g = galatRamah(e);
  return { ok: false, pesan: g.pesan, rinci: g.rinci };
}
