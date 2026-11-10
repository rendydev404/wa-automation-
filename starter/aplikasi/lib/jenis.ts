/** Hasil server action untuk ditampilkan di form (lihat komponen/form-aksi.tsx). null = belum dijalankan. */
export type HasilAksi = {
  ok: boolean;
  pesan: string;
  /** Detail dari mesin (kode galat, id permintaan). */
  rinci?: string;
  /** Nilai yang perlu disalin pengguna, mis. rahasia webhook atau kode pairing. */
  tampil?: { label: string; nilai: string; petunjuk?: string };
} | null;
