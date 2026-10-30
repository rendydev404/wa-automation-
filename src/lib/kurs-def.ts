/** Bentuk data kurs USD → Rp: murni tanpa I/O, jadi dipakai juga oleh komponen di browser. Pengambilannya ada di kurs.ts. */

export interface InfoKurs {
  /** Rupiah per 1 USD (bilangan bulat). */
  kurs: number;
  /** Nama sumber data. */
  sumber: string;
  /** Tanggal data menurut sumber (YYYY-MM-DD); kosong bila tidak diketahui. */
  tanggal: string;
  /** Kapan aplikasi mengambilnya (detik epoch). */
  diambil: number;
  /** Pengambilan terbaru gagal: yang dipakai adalah nilai pasar terakhir yang berhasil diambil. */
  basi: boolean;
  /** Belum pernah berhasil mengambil kurs pasar: yang dipakai hanya perkiraan cadangan. */
  cadangan: boolean;
}

/** Perkiraan terakhir bila kurs pasar belum pernah bisa diambil (sumber mati sejak awal). Selalu ditandai `cadangan`. */
export const KURS_CADANGAN = 18_000;

/** Rentang yang masuk akal untuk 1 USD dalam Rupiah; di luar ini dianggap data rusak dan ditolak. */
export const KURS_MIN = 5_000;
export const KURS_MAKS = 50_000;
