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
  /** Draf / teks terkirim: sapaan & pengingat (lihat followup.ts). */
  pesan1: string | null;
  pesan2: string | null;
}

/** Panjang pesan follow-up yang boleh disimpan admin. */
export const BATAS_PESAN = [10, 1500] as const;

export interface StatusMesinFollowup {
  setelan: SetelanFollowup;
  /** Nomor CS yang dipakai (setelan atau otomatis). */
  nomor: { id: number; label: string; wa_id: string | null; terhubung: boolean } | null;
  rem: { pada: number; alasan: string } | null;
  kirimHariIni: number;
  hitung: Partial<Record<StatusFollowup, number>>;
}

/** Balasan atas follow-up yang berarti "jangan hubungi lagi" (dicatat permanen di followup_stop). */
export const POLA_STOP =
  /\b(stop|unsubscribe|berhenti|jangan\s+(di)?(hubungi|chat|kirim|ganggu|spam)\w*|(tidak|gak|ga|nggak|ngga|enggak)\s+tertarik)\b/i;
export const POLA_STOP_PENDEK = /^\W*(gak|ga|nggak|ngga|enggak|tidak)\s+(usah|perlu)(\W*(kak|min|ya|deh|dulu|makasih|terima\s*kasih|thanks|tq))*\W*$/i;

// ---------- Follow-up prospek (followup-prospek.ts) ----------

/**
 * Follow-up prospek nomor CS: orang yang chat duluan, dinilai prospek dengan minat hangat/panas, sudah dijawab, lalu
 * diam. Paling banyak 3 pesan per siklus; berhenti begitu dibalas. Jam kirim, batas harian, jeda, dan rem dipakai
 * bersama dengan follow-up akun (SetelanFollowup).
 */
export interface SetelanProspek {
  aktif: boolean;
  /** Pesan 1 setelah lead panas diam sekian jam. */
  jedaPanasJam: number;
  /** Pesan 1 setelah lead hangat diam sekian jam. */
  jedaHangatJam: number;
  /** Pesan 2 sekian jam setelah pesan 1 tidak dibalas. */
  tahap2Jam: number;
  /** Pesan 3 (pamit) sekian jam setelah pesan 2 tidak dibalas. */
  tahap3Jam: number;
  /** Jumlah pesan per siklus (1–3). */
  maksTahap: number;
}

export const SETELAN_PROSPEK_AWAL: SetelanProspek = {
  aktif: false,
  jedaPanasJam: 1,
  jedaHangatJam: 3,
  tahap2Jam: 24,
  tahap3Jam: 48,
  maksTahap: 3,
};

export const BATAS_SETELAN_PROSPEK = {
  jedaPanasJam: [1, 24],
  jedaHangatJam: [1, 48],
  tahap2Jam: [12, 120],
  tahap3Jam: [24, 168],
  maksTahap: [1, 3],
} as const satisfies Record<string, readonly [number, number]>;

export type StatusProspek = "jalan" | "dibalas" | "selesai" | "batal" | "stop" | "gagal";

export const LABEL_STATUS_PROSPEK: Record<StatusProspek, string> = {
  jalan: "Berjalan",
  dibalas: "Dibalas",
  selesai: "Selesai",
  batal: "Dibatalkan",
  stop: "Minta berhenti",
  gagal: "Gagal",
};

/** Nama tahap pesan follow-up prospek (indeks = tahap - 1). */
export const NAMA_TAHAP_PROSPEK = ["Lanjutan", "Nilai & bukti", "Pamit"] as const;

export const LABEL_MINAT = ["Dingin", "Hangat", "Panas"] as const;

export interface BarisProspek {
  kunci: string;
  status: StatusProspek;
  tujuan: string | null;
  nama: string | null;
  /** Tingkat minat saat diantrekan: 1 hangat, 2 panas. */
  minat: number;
  /** Jumlah pesan yang sudah terkirim di siklus ini (0–3). */
  tahap: number;
  jadwal: number;
  dibuat: number;
  diperbarui: number;
  /** Draf pesan berikutnya (bisa diedit admin; teks inilah yang dikirim). */
  draf: string | null;
  pesan1: string | null;
  pesan2: string | null;
  pesan3: string | null;
  terkirim1: number | null;
  terkirim2: number | null;
  terkirim3: number | null;
  ack1: number;
  ack2: number;
  ack3: number;
  dibalas: number | null;
  alasan: string | null;
  /** Percakapan di histori (tautan ke chat). */
  percakapan_id: number | null;
}

export interface StatusMesinProspek {
  setelan: SetelanProspek;
  hitung: Partial<Record<StatusProspek, number>>;
  /** Siklus dengan minimal satu pesan terkirim, yang dibalas, dan nomornya kemudian berlangganan. */
  terkirim: number;
  dibalas: number;
  berlangganan: number;
}

// ---------- Follow-up di nomor pengguna berbayar (followup-usaha.ts) ----------

/**
 * Setelan follow-up satu nomor pengguna (followup_nomor). Aturan anti-blokir sama dengan nomor CS ChatGerCep, ditambah
 * batas yang lebih ketat per nomor (pemanasan nomor baru, rasio terhadap balasan biasa, rem sendiri).
 */
export interface SetelanUsaha {
  /** Follow-up pelanggan yang tanya lalu diam (maks 3 pesan). */
  aktif: boolean;
  /** Pengingat order ulang ke pembeli lama (1 pesan per pembelian). */
  ulangAktif: boolean;
  /** Jam kirim WIB: mulai (termasuk) dan selesai (tidak termasuk). */
  jamMulai: number;
  jamSelesai: number;
  /** Paling banyak pesan follow-up (prospek + order ulang) per hari WIB, sebelum batas otomatis. */
  batasHarian: number;
  jedaPanasJam: number;
  jedaHangatJam: number;
  tahap2Jam: number;
  tahap3Jam: number;
  maksTahap: number;
  /** Pengingat order ulang dikirim setelah pembeli diam sekian hari sejak terakhir beli. */
  siklusUlangHari: number;
}

export const SETELAN_USAHA_AWAL: SetelanUsaha = {
  aktif: false,
  ulangAktif: false,
  jamMulai: 9,
  jamSelesai: 20,
  batasHarian: 10,
  jedaPanasJam: 1,
  jedaHangatJam: 3,
  tahap2Jam: 24,
  tahap3Jam: 48,
  maksTahap: 3,
  siklusUlangHari: 30,
};

export const BATAS_SETELAN_USAHA = {
  jamMulai: [0, 23],
  jamSelesai: [1, 24],
  batasHarian: [1, 40],
  jedaPanasJam: [1, 24],
  jedaHangatJam: [1, 48],
  tahap2Jam: [12, 120],
  tahap3Jam: [24, 168],
  maksTahap: [1, 3],
  siklusUlangHari: [7, 90],
} as const satisfies Record<string, readonly [number, number]>;

/** Ritme sederhana di tab Follow-up (angka detail tetap bisa diubah di "Lanjutan"). */
export const RITME_USAHA = {
  cepat: { jedaPanasJam: 1, jedaHangatJam: 2, tahap2Jam: 24, tahap3Jam: 48 },
  normal: { jedaPanasJam: 1, jedaHangatJam: 3, tahap2Jam: 24, tahap3Jam: 48 },
  santai: { jedaPanasJam: 3, jedaHangatJam: 6, tahap2Jam: 48, tahap3Jam: 96 },
} as const;

/**
 * Nomor yang baru ditambahkan kurang dari NOMOR_BARU_HARI hari belum boleh mengirim follow-up sama sekali (akun / tautan
 * baru yang langsung mengirim pesan duluan adalah pola yang paling cepat dibatasi WhatsApp); sampai PEMANASAN_HARI hari
 * dibatasi BATAS_PEMANASAN pesan per hari.
 */
export const NOMOR_BARU_HARI = 3;
export const PEMANASAN_HARI = 7;
export const BATAS_PEMANASAN = 3;
/** Follow-up hanya dikirim bila soket nomor sudah tersambung tanpa putus selama ini (bukan tepat setelah scan / putus). */
export const STABIL_MENIT = 60;
/** Setelah tanda bahaya (perangkat dicabut, 403, error 463) follow-up nomor itu berhenti sampai pemilik/admin melepas rem. */
export const BAHAYA_JAM = 24;
/** Pesan follow-up per hari paling banyak sekian bagian dari balasan biasa nomor itu (paling sedikit RASIO_MIN). */
export const RASIO_KIRIMAN = 0.2;
export const RASIO_MIN = 3;
/** Pengingat order ulang paling banyak sekian bagian dari batas harian (lead baru didahulukan). */
export const PORSI_ULANG = 0.5;
/** Chat yang terakhir aktif lebih lama dari ini tidak diberi pengingat order ulang. */
export const UMUR_ULANG_HARI = 90;

/** Nama tahap pesan follow-up prospek nomor pengguna (indeks = tahap - 1). */
export const NAMA_TAHAP_USAHA = { id: ["Lanjutan", "Manfaat", "Pamit"], en: ["Follow-up", "Value", "Goodbye"] } as const;

export type StatusUlang = "jalan" | "terkirim" | "dibalas" | "selesai" | "batal" | "stop" | "gagal";

/** Satu baris di daftar tab Follow-up: siklus prospek (followup_prospek) atau pengingat order ulang (followup_ulang). */
export interface BarisUsaha {
  jenis: "prospek" | "ulang";
  kunci: string;
  status: StatusProspek | StatusUlang;
  tujuan: string | null;
  nama: string | null;
  /** Prospek: tingkat minat saat diantrekan (1 hangat, 2 panas). Order ulang: null. */
  minat: number | null;
  /** Pesan yang sudah terkirim di siklus ini. */
  tahap: number;
  /** Paling banyak pesan untuk baris ini (prospek: maksTahap, order ulang: 1). */
  maks: number;
  jadwal: number;
  diperbarui: number;
  draf: string | null;
  pesan: { teks: string; pada: number; ack: number }[];
  dibalas: number | null;
  alasan: string | null;
  percakapan_id: number | null;
}

export interface StatusUsaha {
  setelan: SetelanUsaha;
  /** Akun boleh memakai follow-up (langganan aktif / staf / mesin self-host). */
  boleh: boolean;
  terhubung: boolean;
  rem: { pada: number; alasan: string } | null;
  kirimHariIni: number;
  /** Batas efektif hari ini dan penyebabnya. */
  batasHariIni: number;
  sebabBatas: "setelan" | "baru" | "pemanasan" | "rasio";
  /** Pengiriman sedang ditahan pengaman (followup-aman.ts): "stabil" = koneksi belum stabil, "bahaya" = tanda pembatasan WhatsApp. */
  tahan: "stabil" | "bahaya" | null;
  /** Sisa kuota balasan AI (null = tanpa batas). 0 = follow-up berhenti. */
  sisaKuota: number | null;
  /** Angka sepanjang waktu (baris yang pernah mengirim minimal satu pesan). */
  terkirim: number;
  dibalas: number;
  stop: number;
  berjalan: number;
}
