/** Definisi follow-up CS yang aman dipakai di server maupun klien (lihat followup.ts). */

export interface SetelanFollowup {
  /** Saklar utama: mati = tidak ada pesan yang dikirim (antrean tetap tersimpan). */
  aktif: boolean;
  /** Nomor CS ChatGerCep yang mengirim follow-up (numbers.id); null = nomor pertama yang memakai data ChatGerCep otomatis. */
  nomorId: number | null;
  /** Paling banyak pesan follow-up (sapaan + pengingat) per hari WIB. */
  batasHarian: number;
  /** Jam kirim WIB: mulai (termasuk) dan selesai (tidak termasuk). */
  jamMulai: number;
  jamSelesai: number;
  /** Jeda setelah kuota habis sebelum disapa: kesempatan pengguna menghubungi CS sendiri. */
  tundaJam: number;
  /** Pengingat sekali bila sapaan tidak dibalas, sekian hari kemudian; 0 = tanpa pengingat. */
  pengingatHari: number;
}

export const SETELAN_FOLLOWUP_AWAL: SetelanFollowup = {
  aktif: false,
  nomorId: null,
  batasHarian: 20,
  jamMulai: 9,
  jamSelesai: 20,
  tundaJam: 24,
  pengingatHari: 3,
};

export const BATAS_SETELAN = {
  batasHarian: [1, 60],
  jamMulai: [0, 23],
  jamSelesai: [1, 24],
  tundaJam: [1, 168],
  pengingatHari: [0, 14],
} as const satisfies Record<string, readonly [number, number]>;

/** Jeda acak antarpesan follow-up (menit): tidak pernah dua pesan beruntun dalam waktu berdekatan. */
export const JEDA_ANTARPESAN_MENIT = [3, 10] as const;

export type StatusFollowup = "antre" | "terkirim" | "dibalas" | "selesai" | "batal" | "stop" | "gagal";

export const LABEL_STATUS: Record<StatusFollowup, string> = {
  antre: "Dalam antrean",
  terkirim: "Sapaan terkirim",
  dibalas: "Dibalas",
  selesai: "Selesai",
  batal: "Dibatalkan",
  stop: "Minta berhenti",
  gagal: "Gagal",
};

/** Status kiriman WhatsApp: 0 belum, 1 tertunda, 2 centang satu (server), 3 centang dua (sampai HP), 4 dibaca (biru). */
export const LABEL_ACK = ["Belum terkirim", "Tertunda", "Centang satu", "Centang dua", "Dibaca"] as const;

export interface BarisFollowup {
  user_id: number;
  email: string;
  nama_akun: string;
  status: StatusFollowup;
  tujuan: string | null;
  nama: string | null;
  tahap: number;
  jadwal: number;
  dibuat: number;
  diperbarui: number;
  terkirim1: number | null;
  terkirim2: number | null;
  ack1: number;
  ack2: number;
  dibalas: number | null;
  alasan: string | null;
}

export interface StatusMesinFollowup {
  setelan: SetelanFollowup;
  /** Nomor CS yang dipakai (setelan atau otomatis). */
  nomor: { id: number; label: string; wa_id: string | null; terhubung: boolean } | null;
  rem: { pada: number; alasan: string } | null;
  kirimHariIni: number;
  hitung: Partial<Record<StatusFollowup, number>>;
}
