/**
 * Pengumuman fitur baru untuk pengguna lama: kartu sekali tampil di dasbor + notifikasi lonceng, lalu tombolnya
 * membuka halaman tujuan dan memutar tur sorotan fitur itu (tur.tsx). Murni data, aman di server maupun klien.
 *
 * Menambah pengumuman: tulis satu entri di FITUR_BARU (paling baru di atas). Yang ditampilkan hanya satu, yang
 * pertama memenuhi syarat dan belum dilihat. "Dilihat" = `baru:<kode>` atau nama turnya ada di users.tur_selesai.
 */

export interface Teks {
  id: string;
  en: string;
}

export interface FiturBaru {
  kode: string;
  /** Detik epoch fitur dirilis. Akun yang dibuat sesudahnya tidak diberi pengumuman (fiturnya sudah ada sejak daftar). */
  rilis: number;
  /** Lama pengumuman berlaku sejak rilis (hari); lewat dari ini tidak ditampilkan lagi. */
  berlakuHari: number;
  judul: Teks;
  isi: Teks;
  /** Nama tur sorotan yang diputar di halaman tujuan (TUR_SAH di actions.ts). */
  tur: string;
  /** Halaman tujuan. `nomor-qr` = tab Pengaturan nomor pertama yang tersambung lewat scan QR (pengguna tanpa nomor itu dilewati). */
  tujuan: "nomor-qr";
}

export const FITUR_BARU: readonly FiturBaru[] = [
  {
    kode: "kontak-tersimpan",
    rilis: Math.floor(Date.UTC(2026, 10, 24, 7, 0) / 1000), // 24 Nov 2026 14.00 WIB
    berlakuHari: 45,
    judul: { id: "Baru: AI tidak membalas kontak yang tersimpan di HP", en: "New: AI can skip contacts saved on your phone" },
    isi: {
      id: "Chat dari keluarga, teman, atau supplier yang Anda simpan di HP bisa Anda balas sendiri, sementara AI tetap melayani nomor baru. Anda juga bisa memilih kontak yang tetap dibalas AI.",
      en: "Chats from family, friends, or suppliers saved on your phone can be yours to answer, while the AI keeps serving new numbers. You can also pick contacts the AI should still reply to.",
    },
    tur: "kontak",
    tujuan: "nomor-qr",
  },
];

export const KUNCI_LIHAT = (kode: string) => `baru:${kode}`;

/** Jalur halaman tujuan (tanpa awalan bahasa); `?tur=` memutar turnya begitu halaman tampil. */
export const jalurFiturBaru = (f: FiturBaru, numberId: number) => `/nomor/${numberId}?tur=${encodeURIComponent(f.tur)}#pengaturan`;
