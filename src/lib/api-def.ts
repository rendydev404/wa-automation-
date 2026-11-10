/**
 * Kontrak bersama Developer API (dipakai server pusat chatgercep.com, mesin self-host, UI, dan uji). Murni: tanpa I/O.
 * Rencana lengkap: docs/plans/2026-11-09-developer-api.md.
 */

/** Grup fitur di katalog (urutan = urutan tampil). */
export const GRUP_FITUR = [
  { kode: "wa", label: "WhatsApp", keterangan: "Sambungkan nomor, kirim & terima pesan" },
  { kode: "ai", label: "Bot AI", keterangan: "Jawaban AI, pengaturan bot, dan alat AI" },
  { kode: "data", label: "Data usaha", keterangan: "Bahan yang dipakai AI untuk menjawab" },
  { kode: "laporan", label: "Laporan & alat", keterangan: "Angka harian dan alat bantu tanpa AI" },
] as const;
export type GrupFitur = (typeof GRUP_FITUR)[number]["kode"];

/**
 * Fitur (scope) yang bisa dibagikan ke developer luar. Developer internal mencentang mana yang dibagikan (pengaturan
 * umum), lalu memilih per aplikasi saat menyetujui. Urutan = urutan tampil di UI. Kode yang sudah terbit tidak boleh
 * diganti (tersimpan di aplikasi & lisensi mesin).
 */
export const FITUR_API = [
  { kode: "nomor", grup: "wa", label: "Nomor & QR", keterangan: "Tambah nomor, QR / kode pairing, status, logout" },
  { kode: "pesan.kirim", grup: "wa", label: "Kirim pesan", keterangan: "Kirim teks & gambar lewat antrean anti-blokir, cek status" },
  { kode: "pesan.terima", grup: "wa", label: "Webhook pesan masuk", keterangan: "Pesan masuk, balasan AI, status pesan, nomor terhubung/terputus" },
  { kode: "kontak.cek", grup: "wa", label: "Cek nomor WhatsApp", keterangan: "Cek nomor HP terdaftar di WhatsApp sebelum mengirim (maks 20 per panggilan)" },
  { kode: "profil", grup: "wa", label: "Profil WhatsApp", keterangan: "Nama & foto profil nomor yang terhubung" },
  { kode: "ai", grup: "ai", label: "Tanya AI", keterangan: "Jawaban bot berdasarkan Informasi Usaha nomor, tanpa lewat WhatsApp" },
  { kode: "bot", grup: "ai", label: "Pengaturan bot", keterangan: "Bot nyala/mati, instruksi, waktu tunggu, saring spam & prospek, belajar dari admin" },
  { kode: "templat", grup: "ai", label: "Template instruksi industri", keterangan: "Template instruksi bot siap pakai per jenis usaha (laundry, klinik, travel, dll.)" },
  { kode: "ai.rapikan", grup: "ai", label: "Rapikan tulisan usaha", keterangan: "Tulisan bebas pemilik usaha disusun AI jadi dokumen siap pakai + daftar info yang kurang" },
  { kode: "ai.transkripsi", grup: "ai", label: "Transkripsi suara", keterangan: "Rekaman suara (maks 10 MB) jadi teks, memakai kunci STT di mesin" },
  { kode: "pelajaran", grup: "ai", label: "Pelajaran dari admin", keterangan: "Lihat & hapus jawaban admin yang dipelajari AI" },
  { kode: "knowledge", grup: "data", label: "Product knowledge", keterangan: "Tambah, lihat, dan hapus product knowledge (teks, PDF, berkas)" },
  { kode: "katalog", grup: "data", label: "Katalog produk", keterangan: "Tambah, ubah, hapus produk + foto; AI mengirim foto produk ke pelanggan" },
  { kode: "statistik", grup: "laporan", label: "Statistik harian", keterangan: "Pesan masuk & dibalas bot per hari per nomor (maks 90 hari)" },
  { kode: "spam.cek", grup: "laporan", label: "Cek spam judi", keterangan: "Periksa teks: promosi judi online atau bukan, tanpa AI" },
] as const satisfies readonly { kode: string; grup: GrupFitur; label: string; keterangan: string }[];

export type FiturApi = (typeof FITUR_API)[number]["kode"];
export const KODE_FITUR: readonly FiturApi[] = FITUR_API.map((f) => f.kode);
export const fiturSah = (v: unknown): v is FiturApi => typeof v === "string" && (KODE_FITUR as readonly string[]).includes(v);
export const labelFitur = (k: string): string => FITUR_API.find((f) => f.kode === k)?.label ?? k;
/** Fitur per grup, urut seperti katalog (grup kosong dibuang). `saring` = hanya kode ini (mis. yang dibagikan). */
export function fiturPerGrup(saring?: readonly string[]) {
  return GRUP_FITUR.map((g) => ({ ...g, fitur: FITUR_API.filter((f) => f.grup === g.kode && (!saring || saring.includes(f.kode))) })).filter((g) => g.fitur.length);
}

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

// ---------- Sandbox ----------

/**
 * Mode aplikasi. Sandbox = key `cg_test_…` untuk mencoba API dengan WhatsApp asli sebelum production: keluar tanpa
 * peninjauan, 1 nomor WA, hanya boleh berkomunikasi dengan SATU nomor penguji yang terverifikasi. Resource (server, WA,
 * kunci AI) milik developer: kita hanya meminjamkan fitur & logika inti, jadi tidak ada limit AI.
 * Rencana: docs/plans/2026-11-10-sandbox-developer-api.md.
 */
export type ModeApi = "produksi" | "sandbox";

/** Bawaan pengaturan umum sandbox (diubah developer internal di tab Sandbox). */
export const SANDBOX_HARI_BAWAAN = 30;
/** Port dashboard mesin sandbox di komputer developer (http://localhost:<port>); masuk ke .env sandbox sebagai PORT_MESIN. */
export const SANDBOX_PORT_BAWAAN = 1975;
export const RENTANG_SANDBOX = {
  hari: { min: 1, maks: 365 },
  port: { min: 1024, maks: 65_535 },
} as const;
/** Batas tetap sandbox (tidak bisa diubah): 1 nomor WA, 1 instalasi. */
export const BATAS_TETAP_SANDBOX = { nomor: 1, instalasi: 1 } as const;
/** Kode verifikasi nomor penguji: 6 angka, berlaku 10 menit. Pesan WA-nya: "UJI 123456". */
export const MASA_KODE_UJI_DETIK = 600;
export const POLA_PESAN_UJI = /^\s*UJI\s+(\d{6})\s*$/i;

/** Nomor penguji di lisensi sandbox. Gerbang mencocokkan telepon ATAU alamat WA (JID/LID), karena WA kadang hanya memberi LID. */
export interface NomorUji {
  /** 628… tanpa tanda +; null bila WhatsApp hanya memberi LID. */
  telepon: string | null;
  /** Alamat WA pengirim saat verifikasi (…@s.whatsapp.net / …@lid). */
  alamat: string | null;
}

/** Samarkan nomor untuk tampilan: 6281234567890 -> 62812****890. */
export function samarkanNomor(n: string | null | undefined): string {
  const d = String(n ?? "").replace(/\D/g, "");
  if (!d) return "-";
  return d.length <= 7 ? `${d.slice(0, 2)}****` : `${d.slice(0, 5)}****${d.slice(-3)}`;
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
  /** 1 = production (format awal). 2 = sandbox: mesin versi lama hanya menerima 1, jadi tidak pernah menjalankan sandbox tanpa gerbang. */
  v: 1 | 2;
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
  /** Hanya v2. Tidak ada = produksi. */
  mode?: ModeApi;
  /** Hanya sandbox: satu-satunya nomor yang boleh berkomunikasi dengan mesin; null = belum diverifikasi. */
  uji?: NomorUji | null;
}

/** Mode lisensi (lisensi v1 lama selalu produksi). */
export const modeLisensi = (i: Pick<IsiLisensi, "mode"> | null | undefined): ModeApi => (i?.mode === "sandbox" ? "sandbox" : "produksi");

/** Lisensi berlaku 7 hari; pusat mengirim perpanjangan tiap 3 hari. */
export const MASA_LISENSI_DETIK = 7 * 86_400;
export const JEDA_PERPANJANG_DETIK = 3 * 86_400;

/** Jalur di mesin yang menerima webhook dari pusat (tantangan & lisensi). */
export const JALUR_WEBHOOK_MESIN = "/api/lisensi/webhook";
/** Jalur di pusat. */
export const JALUR_AKTIVASI = "/api/lisensi/aktivasi";
export const JALUR_KONDISI = "/api/lisensi/kondisi";
/** Mesin sandbox -> pusat saat menerima pesan "UJI ######": verifikasi nomor penguji, jawabannya lisensi baru. */
export const JALUR_NOMOR_UJI = "/api/lisensi/nomor-uji";

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
  /** Nomor bot (WA yang sedang terhubung di mesin, 628…); ditampilkan di portal Developer. */
  nomor_bot?: string | null;
}
export interface PermintaanKondisi {
  key: string;
  id_instalasi: string;
  versi: string;
  nomor_bot?: string | null;
}
export interface PermintaanNomorUji {
  key: string;
  id_instalasi: string;
  kode: string;
  telepon: string | null;
  alamat: string | null;
  versi: string;
  nomor_bot?: string | null;
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
  bukan_nomor_penguji: 403,
  nomor_penguji_belum_ada: 409,
  sandbox_kedaluwarsa: 402,
  sandbox_nonaktif: 403,
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
