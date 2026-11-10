/**
 * Kontrak bersama Developer API (dipakai server pusat chatgercep.com, mesin self-host, UI, dan uji). Murni: tanpa I/O.
 * Rencana lengkap: docs/plans/2026-11-09-developer-api.md.
 */

/** Fitur (scope) yang bisa dibuka per aplikasi. Urutan = urutan tampil di UI. */
export const FITUR_API = [
  { kode: "nomor", label: "Nomor & QR", keterangan: "Tambah nomor, QR / kode pairing, status, atur bot, logout" },
  { kode: "pesan.kirim", label: "Kirim pesan", keterangan: "Kirim teks & gambar lewat antrean anti-blokir, cek status" },
  { kode: "pesan.terima", label: "Webhook pesan masuk", keterangan: "Pesan masuk, balasan AI, status pesan, nomor terhubung/terputus" },
  { kode: "ai", label: "Tanya AI", keterangan: "Jawaban bot berdasarkan product knowledge nomor, tanpa lewat WhatsApp" },
  { kode: "knowledge", label: "Product knowledge", keterangan: "Tambah, lihat, dan hapus product knowledge (teks, PDF, berkas)" },
] as const;

export type FiturApi = (typeof FITUR_API)[number]["kode"];
export const KODE_FITUR: readonly FiturApi[] = FITUR_API.map((f) => f.kode);
export const fiturSah = (v: unknown): v is FiturApi => typeof v === "string" && (KODE_FITUR as readonly string[]).includes(v);
export const labelFitur = (k: string): string => FITUR_API.find((f) => f.kode === k)?.label ?? k;

export type StatusAplikasi = "menunggu" | "disetujui" | "ditolak" | "ditangguhkan" | "dicabut";
export const LABEL_STATUS_APLIKASI: Record<StatusAplikasi, string> = {
  menunggu: "Menunggu tinjauan",
  disetujui: "Aktif",
  ditolak: "Ditolak",
  ditangguhkan: "Ditangguhkan",
  dicabut: "Dicabut",
};

/** Pengaturan biaya per aplikasi; `ikut_umum` = ikut sakelar umum (settings.api_biaya_bawaan). */
export type BiayaAplikasi = "ikut_umum" | "gratis" | "berbayar";
export type BiayaEfektif = "gratis" | "berbayar";

/** Batas per aplikasi (diatur developer internal, dibawa lisensi ke mesin). */
export interface BatasApi {
  /** Maks nomor WA di satu mesin. */
  nomor: number;
  /** Maks pesan keluar lewat API per menit per nomor. */
  pesan_menit: number;
  /** Maks kontak baru (belum pernah chat) per hari per nomor. */
  kontak_baru_hari: number;
  /** Maks instalasi mesin aktif per aplikasi. */
  instalasi: number;
}

export const BATAS_BAWAAN: BatasApi = { nomor: 50, pesan_menit: 20, kontak_baru_hari: 50, instalasi: 1 };
export const RENTANG_BATAS: Record<keyof BatasApi, { min: number; maks: number; label: string; satuan: string }> = {
  nomor: { min: 1, maks: 1000, label: "Maks nomor per mesin", satuan: "nomor" },
  pesan_menit: { min: 1, maks: 60, label: "Pesan per menit per nomor", satuan: "pesan" },
  kontak_baru_hari: { min: 0, maks: 1000, label: "Kontak baru per hari per nomor", satuan: "kontak" },
  instalasi: { min: 1, maks: 20, label: "Maks instalasi mesin", satuan: "mesin" },
};

/** Lengkapi batas tersimpan (jsonb) dengan nilai bawaan & potong ke rentang sah. */
export function rapikanBatas(b: Partial<Record<keyof BatasApi, unknown>> | null | undefined): BatasApi {
  const hasil = { ...BATAS_BAWAAN };
  for (const k of Object.keys(RENTANG_BATAS) as (keyof BatasApi)[]) {
    const v = Number(b?.[k]);
    if (Number.isInteger(v)) hasil[k] = Math.min(Math.max(v, RENTANG_BATAS[k].min), RENTANG_BATAS[k].maks);
  }
  return hasil;
}

// ---------- Lisensi (pusat -> mesin) ----------

/** Status layanan yang dibawa lisensi. Selain "aktif" = mesin masuk mode terbatas (WA tetap tersambung). */
export type StatusLisensi = "aktif" | "ditangguhkan" | "dicabut" | "belum_bayar";

export interface KunciLisensi {
  /** Bagian awalan key (8 karakter), untuk mencari entri tanpa membandingkan semua. */
  awalan: string;
  /** SHA-256 (hex) dari bagian rahasia key. */
  hash: string;
  /** Batas berlaku (detik epoch) untuk key lama yang sedang dirotasi; null = tanpa batas. */
  sampai: number | null;
}

export interface IsiLisensi {
  v: 1;
  /** Naik setiap ada perubahan di pusat. Mesin mengabaikan lisensi dengan nilai lebih kecil dari yang tersimpan. */
  versi_urut: number;
  aplikasi_id: number;
  nama_aplikasi: string;
  id_instalasi: string;
  status: StatusLisensi;
  fitur: FiturApi[];
  batas: BatasApi;
  biaya: BiayaEfektif;
  /** Aplikasi berbayar: dibayar sampai (detik epoch). */
  dibayar_sampai: number | null;
  kunci: KunciLisensi[];
  /** Detik epoch. */
  diterbitkan: number;
  /** Detik epoch: lewat dari ini lisensi tidak berlaku (mode terbatas). */
  berlaku_sampai: number;
}

/** Lisensi berlaku 7 hari; pusat mengirim perpanjangan tiap 3 hari. */
export const MASA_LISENSI_DETIK = 7 * 86_400;
export const JEDA_PERPANJANG_DETIK = 3 * 86_400;

/** Jalur di mesin yang menerima webhook dari pusat (tantangan & lisensi). */
export const JALUR_WEBHOOK_MESIN = "/api/lisensi/webhook";
/** Jalur di pusat. */
export const JALUR_AKTIVASI = "/api/lisensi/aktivasi";
export const JALUR_KONDISI = "/api/lisensi/kondisi";

/**
 * Isi permintaan & jawaban antar pusat dan mesin.
 *  - Mesin -> pusat  POST JALUR_AKTIVASI  { key, id_instalasi, alamat, versi }       -> 200 { lisensi } | galat
 *      Pusat lebih dulu mengirim tantangan ke alamat mesin: POST alamat + JALUR_WEBHOOK_MESIN
 *      { jenis: "tantangan", nonce, id_instalasi } -> mesin menjawab 200 { jawaban: hmacHex(key, nonce) }.
 *  - Mesin -> pusat  POST JALUR_KONDISI   { key, id_instalasi, versi }                -> 200 { lisensi } | galat
 *  - Pusat -> mesin  POST alamat + JALUR_WEBHOOK_MESIN { jenis: "lisensi", lisensi }
 *      -> 200 { versi_urut_diterima, versi_mesin, jumlah_nomor }
 */
export interface PermintaanAktivasi {
  key: string;
  id_instalasi: string;
  alamat: string;
  versi: string;
}
export interface PermintaanKondisi {
  key: string;
  id_instalasi: string;
  versi: string;
}
export type WebhookKeMesin = { jenis: "tantangan"; nonce: string; id_instalasi: string } | { jenis: "lisensi"; lisensi: string };
export interface JawabanLisensiMesin {
  versi_urut_diterima: number;
  versi_mesin: string;
  jumlah_nomor: number;
}

/** Kode galat seragam (API v1 & endpoint lisensi). */
export const KODE_GALAT = {
  isian_tidak_sah: 400,
  key_tidak_sah: 401,
  lisensi_kedaluwarsa: 402,
  fitur_tidak_dibuka: 403,
  aplikasi_ditangguhkan: 403,
  aplikasi_dicabut: 403,
  belum_bayar: 402,
  batas_nomor: 403,
  tidak_ditemukan: 404,
  nomor_belum_terhubung: 409,
  instalasi_penuh: 409,
  bentrok_idempotensi: 409,
  alamat_tidak_sah: 422,
  tantangan_gagal: 422,
  ditolak_anti_blokir: 422,
  terlalu_sering: 429,
  wa_sedang_menyambung: 503,
  ai_tidak_tersedia: 503,
  galat_server: 500,
} as const;
export type KodeGalat = keyof typeof KODE_GALAT;
