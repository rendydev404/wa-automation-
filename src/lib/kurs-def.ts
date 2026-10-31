/** Bentuk data kurs USD → Rp: murni tanpa I/O, jadi dipakai juga oleh komponen di browser. Pengambilannya ada di kurs.ts. */

export interface InfoKurs {
  /** Rupiah per 1 USD (bilangan bulat). */
  kurs: number;
  /** Nama sumber data. */
  sumber: string;
  /** Tanggal data menurut sumber (YYYY-MM-DD); kosong bila tidak diketahui. */
  tanggal: string;
  /** Waktu data menurut sumber (detik epoch); null bila sumber hanya memberi tanggal (kurs referensi harian). */
  waktuData: number | null;
  /** Sumbernya kurs pasar berjalan (diperbarui sepanjang hari), bukan kurs referensi harian. */
  langsung: boolean;
  /** Kapan aplikasi mengambilnya (detik epoch). */
  diambil: number;
  /** Pengambilan terbaru gagal: yang dipakai adalah nilai pasar terakhir yang berhasil diambil. */
  basi: boolean;
  /** Belum pernah berhasil mengambil kurs pasar: yang dipakai hanya perkiraan cadangan. */
  cadangan: boolean;
  /** Sumber lain yang ikut dicek; `cocok` = selisihnya dengan kurs yang dipakai masih dalam batas wajar. */
  pembanding: { sumber: string; kurs: number; cocok: boolean }[];
}

/** Perkiraan terakhir bila kurs pasar belum pernah bisa diambil (sumber mati sejak awal). Selalu ditandai `cadangan`. */
export const KURS_CADANGAN = 18_000;

/** Rentang yang masuk akal untuk 1 USD dalam Rupiah; di luar ini dianggap data rusak dan ditolak. */
export const KURS_MIN = 5_000;
export const KURS_MAKS = 50_000;

/** Dua sumber dianggap sejalan bila selisihnya paling banyak sekian (3%); lebih dari itu salah satunya data rusak. */
export const SELISIH_KURS_MAKS = 0.03;
