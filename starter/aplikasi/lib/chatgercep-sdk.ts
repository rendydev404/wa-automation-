/**
 * SDK TypeScript untuk ChatGerCep Developer API (mesin self-host).
 *
 * Satu berkas, tanpa dependensi, Node 18+ (memakai `fetch` global). HANYA untuk sisi server: API key tidak boleh
 * sampai ke browser, dan mesin menolak permintaan yang membawa header `Origin`.
 *
 * Contoh:
 *   const cg = new ChatGerCep({ alamat: "http://localhost:1975", key: process.env.CHATGERCEP_KEY! });
 *   const { data } = await cg.nomor.daftar();
 *   await cg.pesan.kirim({ nomor_id: data[0].id, ke: "6281234567890", teks: "Halo!" }, { idempotensi: "order-123" });
 */
import { createHmac, timingSafeEqual } from "node:crypto";

// ---------- Tipe umum ----------

/** Id di API selalu teks ("12"); angka juga diterima supaya nyaman. */
export type Id = string | number;
export type Metode = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type ModeMesin = "sandbox" | "production";

/** Fitur (scope) yang bisa dibuka untuk sebuah aplikasi. */
export type FiturApi =
  | "nomor"
  | "pesan.kirim"
  | "pesan.terima"
  | "kontak.cek"
  | "profil"
  | "ai"
  | "bot"
  | "templat"
  | "ai.rapikan"
  | "ai.transkripsi"
  | "pelajaran"
  | "knowledge"
  | "katalog"
  | "statistik"
  | "spam.cek";

/** Kode galat seragam dari mesin dan status HTTP-nya. */
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

/**
 * Kode galat dari mesin, ditambah tiga kode buatan SDK:
 *  - `jaringan`: mesin tidak bisa dihubungi;
 *  - `batas_waktu`: mesin tidak menjawab dalam `batasWaktuMs`;
 *  - `galat_http`: jawaban non-2xx yang isinya bukan galat ChatGerCep (mis. halaman 404 dari proxy).
 */
export type KodeGalat = keyof typeof KODE_GALAT | "jaringan" | "batas_waktu" | "galat_http";

/** Galat untuk setiap jawaban non-2xx (dan kegagalan jaringan). */
export class GalatChatGerCep extends Error {
  /** Kode galat seragam, mis. `fitur_tidak_dibuka`. Kode baru dari mesin tetap diteruskan apa adanya. */
  readonly kode: KodeGalat | (string & {});
  /** Status HTTP; 0 bila mesin tidak menjawab sama sekali. */
  readonly status: number;
  /** Id permintaan dari mesin (sebutkan saat meminta bantuan); null bila tidak ada. */
  readonly idPermintaan: string | null;
  /**
   * true untuk 429, 503, dan kegagalan jaringan: aman dicoba lagi setelah menunggu. Untuk POST, pakai `idempotensi`
   * yang sama saat mencoba ulang supaya tidak terkirim dua kali.
   */
  readonly bolehDicobaUlang: boolean;
  /** Lama menunggu (detik) dari header Retry-After; null bila mesin tidak menyebutkannya. */
  readonly cobaLagiDetik: number | null;

  constructor(i: { kode: string; pesan: string; status: number; idPermintaan?: string | null; cobaLagiDetik?: number | null }) {
    super(i.pesan);
    this.name = "GalatChatGerCep";
    this.kode = i.kode;
    this.status = i.status;
    this.idPermintaan = i.idPermintaan ?? null;
    this.bolehDicobaUlang = i.status === 429 || i.status === 503 || i.status === 0;
    this.cobaLagiDetik = i.cobaLagiDetik ?? null;
  }
}

/** Halaman hasil berkursor: kirim `berikutnya` sebagai `setelah` untuk halaman selanjutnya (null = habis). */
export interface Halaman<T> {
  data: T[];
  berikutnya: string | null;
}
export interface Paginasi {
  /** Jumlah per halaman (1–100). */
  batas?: number;
  /** Kursor dari `berikutnya` halaman sebelumnya. */
  setelah?: string | null;
}
export interface Berhasil {
  ok: true;
}

/** Opsi untuk POST yang mendukung Idempotency-Key. */
export interface OpsiIdempotensi {
  /** Kunci unik per aksi (maks 200 karakter). Permintaan ulang dengan kunci & isi sama mendapat jawaban pertama (24 jam). */
  idempotensi?: string;
}

export interface OpsiMinta extends OpsiIdempotensi {
  /** Parameter query; nilai undefined/null/"" dilewati. */
  query?: Record<string, string | number | boolean | null | undefined>;
  /** Objek biasa dikirim sebagai JSON; `FormData` dikirim sebagai multipart. */
  body?: unknown;
  /** Untuk membatalkan dari luar. */
  sinyal?: AbortSignal;
}

// ---------- Status & lisensi ----------

export interface BatasApi {
  /** Maks nomor WA di satu mesin. */
  nomor: number;
  /** Maks pesan keluar lewat API per menit per nomor. */
  pesan_menit: number;
  /** Maks kontak baru per hari per nomor. */
  kontak_baru_hari: number;
  /** Maks instalasi mesin aktif per aplikasi. */
  instalasi: number;
}
export type StatusLisensi = "aktif" | "ditangguhkan" | "dicabut" | "belum_bayar" | "belum_aktif";

export interface StatusMesin {
  versi: string;
  mode: ModeMesin;
  /** Hanya sandbox: nomor penguji tersamar (62812****890); null = belum diverifikasi. */
  nomor_uji?: string | null;
  lisensi: {
    status: StatusLisensi;
    /** false = mesin dalam mode terbatas (lihat `alasan`). */
    aktif?: boolean;
    alasan?: string | null;
    aplikasi: string | null;
    fitur: FiturApi[];
    batas: BatasApi | null;
    /** Detik epoch. */
    berlaku_sampai: number | null;
  };
  nomor: { total: number; terhubung: number };
}

// ---------- Nomor ----------

export type StatusNomor = "terhubung" | "menunggu_qr" | "menyambung" | "terputus";

export interface Nomor {
  id: string;
  label: string;
  status: StatusNomor;
  wa_id: string | null;
  nama_wa: string | null;
  bot_aktif: boolean;
  instruksi?: string;
  tunggu_detik?: number;
  tunggu_baca_detik?: number;
  jeda_detik?: number;
  /** Detik epoch. */
  dibuat: number;
}
export interface UbahNomor {
  label?: string;
  bot_aktif?: boolean;
  instruksi?: string;
  tunggu_detik?: number;
  tunggu_baca_detik?: number;
  jeda_detik?: number;
}
export interface QrNomor {
  status?: StatusNomor;
  /** Teks QR mentah; null bila nomor sudah terhubung / QR belum siap. */
  qr: string | null;
  /** Gambar QR (PNG base64, tanpa awalan data:). */
  png_base64: string | null;
  kedaluwarsa_dalam_detik: number | null;
}
export interface ProfilNomor {
  wa_id: string | null;
  nama_wa: string | null;
  status: StatusNomor;
  /** Tautan sementara dari WhatsApp. */
  foto_url: string | null;
}

// ---------- Pesan keluar ----------

export interface GrupWa {
  /** ID grup WhatsApp (mis. `120363041234567890@g.us`), langsung dipakai sebagai `ke` di `cg.pesan.kirim()`. */
  id: string;
  nama: string;
  jumlah_anggota: number;
  hanya_admin: boolean;
}

export interface IsianPesan {
  nomor_id: Id;
  /** Nomor WhatsApp tujuan (mis. `6281234567890`) atau ID grup WhatsApp (mis. `120363041234567890@g.us`). */
  ke: string;
  teks?: string;
  /** Gambar maks 5 MB. Isi `teks`, `gambar`, atau `dokumen`. */
  gambar?: { base64: string; mime: "image/jpeg" | "image/png" | "image/webp"; caption?: string };
  /** Berkas/dokumen maks 100 MB (PDF, CSV, Excel, Word, ZIP, dll.). `mime` otomatis ditebak dari `nama` bila dikosongkan. */
  dokumen?: { base64: string; nama: string; mime?: string; caption?: string };
}
export type StatusPesan = "antre" | "terkirim" | "dibaca" | "gagal";
export interface PesanDiterima {
  id: string;
  status: "antre";
}
export interface PesanKeluar {
  id: string;
  nomor_id: string;
  ke: string;
  status: StatusPesan;
  alasan: string | null;
  dibuat: number;
  berubah: number;
}

// ---------- Percakapan (inbox) ----------

export type PeranPesan = "pelanggan" | "ai" | "manusia";
export interface Percakapan {
  id: string;
  /** Kunci percakapan; sama dengan `data.kunci` di event webhook pesan.*. */
  kunci: string;
  telepon: string | null;
  nama: string | null;
  cuplikan: string;
  pengirim_akhir: PeranPesan;
  jumlah: { masuk: number; ai: number; manusia: number };
  /** Detik epoch. */
  terakhir_pada: number;
  bot: "aktif" | "dijeda" | "dibisukan";
  /** Detik epoch; bot dijeda sampai waktu ini. */
  jeda_sampai: number;
}
export interface OpsiPercakapan extends Paginasi {
  cari?: string;
  filter?: "semua" | "bot" | "manusia";
}
export interface PesanPercakapan {
  id: string;
  peran: PeranPesan;
  teks: string;
  /** Detik epoch. */
  waktu: number;
}
export interface IsiPercakapan {
  percakapan: Percakapan;
  /** Urut lama -> baru. */
  data: PesanPercakapan[];
  /** true = masih ada pesan lebih lama; ambil dengan `sebelum: data[0].id`. */
  ada_sebelumnya: boolean;
}
export interface OpsiPesanPercakapan {
  batas?: number;
  /** Id pesan: ambil pesan yang lebih lama dari ini. */
  sebelum?: string | null;
}
export interface AturBotPercakapan {
  bot: "jeda" | "lanjut";
  /** Lama jeda (menit) saat `bot: "jeda"`. */
  menit?: number;
}

// ---------- Webhook ----------

export const EVENT_WEBHOOK = [
  "pesan.masuk",
  "pesan.dibalas_ai",
  "pesan.manusia",
  "pesan.status",
  "nomor.terhubung",
  "nomor.terputus",
  "nomor.qr",
  "nomor.status",
  "nomor.pairing",
  "lisensi.peringatan",
] as const;
/** Event yang bisa dilanggan lewat `cg.webhook.atur`. */
export type JenisEventLangganan = (typeof EVENT_WEBHOOK)[number];
/** Semua jenis event yang bisa tiba di webhook (`webhook.uji` dikirim oleh `cg.webhook.uji()`). */
export type JenisEvent = JenisEventLangganan | "webhook.uji";

export interface PengaturanWebhook {
  /** null = belum diatur. */
  url: string | null;
  event: JenisEventLangganan[];
  aktif: boolean;
  /** Detik epoch sejak pengiriman gagal beruntun; null = sehat. */
  gagal_sejak: number | null;
  /** Hanya saat belum diatur: event yang didukung mesin ini. */
  pilihan_event?: JenisEventLangganan[];
}
export interface AturWebhook {
  url: string;
  /** Dikosongkan = semua event yang didukung mesin. */
  event?: JenisEventLangganan[];
}
export interface WebhookBaru {
  url: string;
  event: JenisEventLangganan[];
  /** Rahasia penanda tangan (`whsec_…`). HANYA tampil di jawaban ini: simpan segera. */
  rahasia: string;
}
export interface HasilUjiWebhook {
  terkirim: boolean;
  status?: number;
  galat?: string;
  ms?: number;
  id_event?: string;
}

interface Amplop<J extends JenisEvent, D> {
  /** Unik per event. Pengiriman minimal sekali: buang duplikat lewat id ini. */
  id_event: string;
  jenis: J;
  /** Detik epoch. */
  waktu: number;
  nomor_id: string | null;
  data: D;
  /** Hanya ada di mesin sandbox. */
  mode?: "sandbox";
}

export type EventPesanMasuk = Amplop<"pesan.masuk", { kunci: string; dari: string | null; nama: string | null; teks: string }>;
export type EventPesanDibalasAi = Amplop<"pesan.dibalas_ai", { kunci: string; teks: string }>;
export type EventPesanManusia = Amplop<"pesan.manusia", { kunci: string; teks: string }>;
export type EventPesanStatus = Amplop<"pesan.status", { id_pesan: string; status: StatusPesan }>;
export type EventNomorTerhubung = Amplop<"nomor.terhubung", { wa_id: string | null; nama: string | null }>;
export type EventNomorTerputus = Amplop<"nomor.terputus", { kode: number | null; keluar: boolean }>;
/** `png` = gambar QR (PNG base64, tanpa awalan data:). */
export type EventNomorQr = Amplop<"nomor.qr", { qr: string; png: string }>;
export type EventNomorStatus = Amplop<"nomor.status", { status: StatusNomor }>;
export type EventNomorPairing = Amplop<"nomor.pairing", { kode: string }>;
export type EventLisensiPeringatan = Amplop<"lisensi.peringatan", { sisa_detik: number; berlaku_sampai: number; status: string }>;
export type EventWebhookUji = Amplop<"webhook.uji", { pesan: string }>;

/** Event webhook; persempit lewat `event.jenis` (union diskriminasi). */
export type EventWebhook =
  | EventPesanMasuk
  | EventPesanDibalasAi
  | EventPesanManusia
  | EventPesanStatus
  | EventNomorTerhubung
  | EventNomorTerputus
  | EventNomorQr
  | EventNomorStatus
  | EventNomorPairing
  | EventLisensiPeringatan
  | EventWebhookUji;

// ---------- AI ----------

export interface IsianJawab {
  nomor_id: Id;
  pertanyaan: string;
  /** Pemisah ingatan per pelanggan (huruf, angka, _ dan -, maks 64). */
  id_sesi?: string;
  /** Riwayat singkat untuk penyedia AI tanpa ingatan. */
  riwayat?: { ai: boolean; teks: string }[];
}
export interface JawabanAi {
  jawaban: string;
  ms: number;
  token: { masuk: number; keluar: number };
  /** Terisi bila pertanyaan sengaja tidak dijawab (mis. spam); `jawaban` kosong. */
  abaikan?: string;
}
export interface HasilRapikan {
  teks: string;
  /** Info yang masih kurang (pertanyaan untuk pemilik usaha). */
  kurang: string[];
  /** Angka/tautan yang tidak ada di tulisan asli. */
  peringatan: string[];
}
export interface HasilTranskripsi {
  teks: string;
  ms: number;
}
export type MimeSuara = "audio/ogg" | "audio/mpeg" | "audio/mp4" | "audio/aac" | "audio/wav" | "audio/webm";

// ---------- Bot ----------

export interface PengaturanBot {
  nomor_id: string;
  bot_aktif: boolean;
  instruksi: string;
  tunggu_detik: number;
  tunggu_baca_detik: number;
  jeda_detik: number;
  saring_spam: boolean;
  saring_prospek: boolean;
  belajar: boolean;
}
export type UbahBot = Partial<Omit<PengaturanBot, "nomor_id">>;

export interface TemplatAi {
  slug: string;
  nama: string;
  nama_en: string;
}
export interface IsiTemplatAi {
  slug: string;
  nama: string;
  /** Berisi penanda [ ... ] yang wajib diganti data usaha. */
  teks: string;
}

// ---------- Informasi Usaha (knowledge), pelajaran, katalog ----------

export interface Dokumen {
  id: string;
  judul: string;
  sumber: "teks" | "pdf" | "berkas" | (string & {});
  karakter: number;
  dibuat: number;
}
export interface IsiDokumen {
  id: string;
  judul: string;
  teks: string;
}

export interface Pelajaran {
  id: string;
  pertanyaan: string;
  jawaban: string;
  /** Berapa kali dipakai AI. */
  dipakai: number;
  terakhir: number;
}
export interface HalamanPelajaran extends Halaman<Pelajaran> {
  total: number;
}

export interface Produk {
  id: string;
  nama: string;
  /** Rupiah; null = tanpa harga. */
  harga: number | null;
  deskripsi: string;
  tersedia: boolean;
  ada_foto: boolean;
  urutan: number;
  diubah: number;
  /** Hanya bila diminta dengan `{ foto: true }`. */
  foto_base64?: string;
  foto_mime?: string;
}
export interface IsianProduk {
  nama: string;
  harga?: number | null;
  deskripsi?: string;
  tersedia?: boolean;
  /** JPG/PNG/WebP maks 1,5 MB. */
  foto_base64?: string;
}
/** `foto_base64: null` menghapus foto. */
export type UbahProduk = Partial<Omit<IsianProduk, "foto_base64">> & { foto_base64?: string | null };

// ---------- Kontak, statistik, alat ----------

export interface HasilCekKontak {
  data: { nomor: string; sah: boolean; terdaftar: boolean }[];
}
export interface Statistik {
  nomor_id: string;
  /** Tanggal WIB, YYYY-MM-DD. */
  dari: string;
  sampai: string;
  total: { masuk: number; dibalas: number };
  data: { tanggal: string; masuk: number; dibalas: number }[];
}
export interface HasilCekSpam {
  spam: boolean;
  skor: number;
  alasan: string | null;
}

// ---------- Klien ----------

export interface OpsiChatGerCep {
  /** Alamat mesin, mis. `http://localhost:1975` (sandbox) atau `https://mesin.aplikasi-anda.com`. Tanpa `/api/v1`. */
  alamat: string;
  /** API key: `cg_live_…` (production) atau `cg_test_…` (sandbox). */
  key: string;
  /** Pengganti `fetch` global (untuk uji atau proxy). */
  fetch?: typeof fetch;
  /** Batas waktu per permintaan dalam milidetik (bawaan 30.000). */
  batasWaktuMs?: number;
}

const seg = (v: Id): string => encodeURIComponent(String(v));

/** Retry-After: detik, atau tanggal HTTP. */
function bacaRetryAfter(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v);
  if (Number.isFinite(n) && n >= 0) return Math.ceil(n);
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : Math.max(0, Math.ceil((t - Date.now()) / 1000));
}

/** Klien API mesin ChatGerCep. Buat satu instance dan pakai ulang. */
export class ChatGerCep {
  /** Alamat dasar API, mis. `http://localhost:1975/api/v1`. */
  readonly dasar: string;
  /** Mode mesin dari jawaban terakhir (header X-ChatGerCep-Mode); null sebelum ada jawaban. */
  modeTerakhir: ModeMesin | null = null;

  private readonly key: string;
  private readonly ambil: typeof fetch;
  private readonly batasWaktuMs: number;

  constructor(opsi: OpsiChatGerCep) {
    const g = globalThis as { window?: unknown; document?: unknown };
    if (g.window !== undefined && g.document !== undefined) throw new Error("SDK ChatGerCep hanya untuk sisi server: API key tidak boleh dipakai di browser.");
    const alamat = String(opsi.alamat ?? "")
      .trim()
      .replace(/\/+$/, "")
      .replace(/\/api\/v1$/, "");
    if (!/^https?:\/\/[^/]+/i.test(alamat)) throw new Error("`alamat` mesin harus diawali http:// atau https:// (mis. http://localhost:1975).");
    const key = String(opsi.key ?? "").trim();
    if (!key) throw new Error("`key` wajib diisi (cg_live_… atau cg_test_…).");
    const ambil = opsi.fetch ?? globalThis.fetch;
    if (typeof ambil !== "function") throw new Error("`fetch` global tidak ada: pakai Node 18+ atau berikan opsi `fetch`.");
    this.dasar = `${alamat}/api/v1`;
    this.key = key;
    this.ambil = opsi.fetch ? ambil : ambil.bind(globalThis);
    this.batasWaktuMs = opsi.batasWaktuMs && opsi.batasWaktuMs > 0 ? opsi.batasWaktuMs : 30_000;
  }

  /**
   * Jalan keluar untuk endpoint yang belum punya pembungkus: `cg.minta<T>("GET", "/nomor/12/sesuatu", { query })`.
   * Melempar `GalatChatGerCep` untuk jawaban non-2xx dan kegagalan jaringan.
   */
  async minta<T = unknown>(metode: Metode, jalur: string, opsi: OpsiMinta = {}): Promise<T> {
    const url = new URL(this.dasar + (jalur.startsWith("/") ? jalur : `/${jalur}`));
    for (const [k, v] of Object.entries(opsi.query ?? {})) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));

    const kepala: Record<string, string> = { Authorization: `Bearer ${this.key}`, Accept: "application/json" };
    let body: string | FormData | undefined;
    if (typeof FormData !== "undefined" && opsi.body instanceof FormData) body = opsi.body;
    else if (opsi.body !== undefined) {
      body = JSON.stringify(opsi.body);
      kepala["Content-Type"] = "application/json";
    }
    if (opsi.idempotensi) kepala["Idempotency-Key"] = opsi.idempotensi;

    // Batas waktu + sinyal pemanggil digabung manual (AbortSignal.any belum ada di Node 18).
    const pengendali = new AbortController();
    let habis = false;
    const timer = setTimeout(() => {
      habis = true;
      pengendali.abort();
    }, this.batasWaktuMs);
    const batal = () => pengendali.abort();
    if (opsi.sinyal?.aborted) batal();
    else opsi.sinyal?.addEventListener("abort", batal, { once: true });

    let jawab: Response;
    let teks: string;
    try {
      jawab = await this.ambil(url.toString(), { method: metode, headers: kepala, body, signal: pengendali.signal, cache: "no-store" });
      teks = await jawab.text();
    } catch (e) {
      const sebab = e instanceof Error ? e.message : String(e);
      throw new GalatChatGerCep(
        habis
          ? { kode: "batas_waktu", status: 0, pesan: `Mesin tidak menjawab dalam ${Math.round(this.batasWaktuMs / 1000)} detik (${metode} ${url.pathname}).` }
          : { kode: "jaringan", status: 0, pesan: `Mesin tidak bisa dihubungi di ${this.dasar}: ${sebab}` },
      );
    } finally {
      clearTimeout(timer);
      opsi.sinyal?.removeEventListener("abort", batal);
    }

    const mode = jawab.headers.get("x-chatgercep-mode");
    if (mode === "sandbox" || mode === "production") this.modeTerakhir = mode;

    let isi: unknown;
    try {
      isi = teks ? JSON.parse(teks) : undefined;
    } catch {
      isi = undefined;
    }
    if (!jawab.ok) {
      const galat = (isi as { galat?: { kode?: unknown; pesan?: unknown; id_permintaan?: unknown } } | undefined)?.galat;
      throw new GalatChatGerCep({
        kode: typeof galat?.kode === "string" ? galat.kode : "galat_http",
        pesan: typeof galat?.pesan === "string" ? galat.pesan : `HTTP ${jawab.status} dari ${metode} ${url.pathname} (jawaban bukan galat ChatGerCep).`,
        status: jawab.status,
        idPermintaan: typeof galat?.id_permintaan === "string" ? galat.id_permintaan : jawab.headers.get("x-request-id"),
        cobaLagiDetik: bacaRetryAfter(jawab.headers.get("retry-after")),
      });
    }
    return isi as T;
  }

  /** Versi mesin, mode (sandbox/production), status lisensi, fitur aktif, jumlah nomor. Tetap menjawab di mode terbatas. */
  status(): Promise<StatusMesin> {
    return this.minta<StatusMesin>("GET", "/status");
  }

  /** Nomor WhatsApp: tambah, QR / kode pairing, ubah, logout, hapus. Fitur `nomor`. */
  readonly nomor = {
    /** Daftar nomor (kursor `setelah`). */
    daftar: (opsi: Paginasi = {}): Promise<Halaman<Nomor>> => this.minta("GET", "/nomor", { query: { batas: opsi.batas, setelah: opsi.setelah } }),
    /** Tambah nomor baru; QR-nya siap beberapa detik kemudian (`qr(id)` atau event `nomor.qr`). */
    tambah: (isian: { label: string }, opsi: OpsiIdempotensi = {}): Promise<Nomor> => this.minta("POST", "/nomor", { body: isian, idempotensi: opsi.idempotensi }),
    /** Detail satu nomor. */
    ambil: (id: Id): Promise<Nomor> => this.minta("GET", `/nomor/${seg(id)}`),
    /** Ubah label & pengaturan bot dasar (hanya kolom yang dikirim). */
    ubah: (id: Id, isian: UbahNomor): Promise<Nomor> => this.minta("PATCH", `/nomor/${seg(id)}`, { body: isian }),
    /** Hapus nomor beserta sesi WhatsApp & Informasi Usaha-nya. */
    hapus: (id: Id): Promise<Berhasil> => this.minta("DELETE", `/nomor/${seg(id)}`),
    /** QR untuk dipindai (teks + PNG base64). QR WhatsApp berganti kira-kira tiap 20 detik. */
    qr: (id: Id): Promise<QrNomor> => this.minta("GET", `/nomor/${seg(id)}/qr`),
    /** Kode pairing lewat nomor HP (alternatif QR). */
    pairing: (id: Id, nomorHp: string): Promise<{ kode: string }> => this.minta("POST", `/nomor/${seg(id)}/pairing`, { body: { nomor_hp: nomorHp } }),
    /** Logout WhatsApp. Satu-satunya cara API memutus nomor; nomornya tetap ada dan bisa ditautkan lagi. */
    logout: (id: Id): Promise<Berhasil> => this.minta("DELETE", `/nomor/${seg(id)}/sesi`),
    /** Daftar grup WhatsApp yang diikuti nomor yang sedang terhubung (`id` dipakai sebagai `ke` di `pesan.kirim`). Fitur `pesan.kirim`. */
    grup: (id: Id): Promise<{ data: GrupWa[] }> => this.minta("GET", `/nomor/${seg(id)}/grup`),
  };

  /** Kirim pesan lewat antrean anti-blokir (nomor pribadi atau grup WhatsApp). Fitur `pesan.kirim`. */
  readonly pesan = {
    /** Kirim teks/gambar/dokumen ke nomor atau grup WhatsApp (`ke: "120363...@g.us"`); jawabannya `antre`, status akhir lewat `status(id)` atau event `pesan.status`. */
    kirim: (isian: IsianPesan, opsi: OpsiIdempotensi = {}): Promise<PesanDiterima> =>
      this.minta("POST", "/pesan", { body: { ...isian, nomor_id: String(isian.nomor_id) }, idempotensi: opsi.idempotensi }),
    /** Kirim berkas/dokumen lewat multipart/form-data (maks 100 MB, tanpa base64) ke nomor atau grup WhatsApp. */
    kirimBerkas: (
      isian: { nomor_id: Id; ke: string; berkas: Blob; nama: string; mime?: string; caption?: string },
      opsi: OpsiIdempotensi = {},
    ): Promise<PesanDiterima> => {
      const form = new FormData();
      form.set("nomor_id", String(isian.nomor_id));
      form.set("ke", isian.ke);
      form.set("nama", isian.nama);
      if (isian.mime) form.set("mime", isian.mime);
      if (isian.caption) form.set("caption", isian.caption);
      form.set("dokumen", isian.berkas, isian.nama);
      return this.minta("POST", "/pesan", { body: form, idempotensi: opsi.idempotensi });
    },
    /** Status satu pesan (antre / terkirim / dibaca / gagal + alasan). */
    status: (id: Id): Promise<PesanKeluar> => this.minta("GET", `/pesan/${seg(id)}`),
    /** Daftar grup WhatsApp yang diikuti nomor `nomorId` (`id` dipakai sebagai `ke` di `kirim()`). */
    grup: (nomorId: Id): Promise<{ data: GrupWa[] }> => this.minta("GET", `/nomor/${seg(nomorId)}/grup`),
  };

  /** Inbox: daftar percakapan, isi pesan, balas manual, jeda/lanjut bot per percakapan. */
  readonly percakapan = {
    /** Daftar percakapan satu nomor, terbaru dulu. */
    daftar: (nomorId: Id, opsi: OpsiPercakapan = {}): Promise<Halaman<Percakapan>> =>
      this.minta("GET", `/nomor/${seg(nomorId)}/percakapan`, { query: { batas: opsi.batas, setelah: opsi.setelah, cari: opsi.cari, filter: opsi.filter } }),
    /** Isi pesan satu percakapan (urut lama -> baru). */
    pesan: (nomorId: Id, percakapanId: Id, opsi: OpsiPesanPercakapan = {}): Promise<IsiPercakapan> =>
      this.minta("GET", `/nomor/${seg(nomorId)}/percakapan/${seg(percakapanId)}/pesan`, { query: { batas: opsi.batas, sebelum: opsi.sebelum } }),
    /** Balas manual; bot otomatis dijeda untuk percakapan itu. */
    balas: (nomorId: Id, percakapanId: Id, teks: string, opsi: OpsiIdempotensi = {}): Promise<PesanDiterima> =>
      this.minta("POST", `/nomor/${seg(nomorId)}/percakapan/${seg(percakapanId)}/balas`, { body: { teks }, idempotensi: opsi.idempotensi }),
    /** Jeda atau lanjutkan bot untuk satu percakapan. */
    aturBot: (nomorId: Id, percakapanId: Id, isian: AturBotPercakapan): Promise<Percakapan> =>
      this.minta("PATCH", `/nomor/${seg(nomorId)}/percakapan/${seg(percakapanId)}`, { body: isian }),
  };

  /** Webhook ke aplikasi Anda. Fitur `pesan.terima`. */
  readonly webhook = {
    /** Pengaturan webhook saat ini (rahasia tidak pernah ditampilkan ulang). */
    ambil: (): Promise<PengaturanWebhook> => this.minta("GET", "/webhook"),
    /** Pasang/ganti tujuan. `rahasia` hanya ada di jawaban ini. */
    atur: (isian: AturWebhook): Promise<WebhookBaru> => this.minta("PUT", "/webhook", { body: isian }),
    /** Kirim satu event `webhook.uji` ke tujuan dan laporkan hasilnya. */
    uji: (): Promise<HasilUjiWebhook> => this.minta("POST", "/webhook/uji"),
  };

  /** Alat AI: tanya bot, rapikan tulisan usaha, transkripsi suara. */
  readonly ai = {
    /** Jawaban bot berdasarkan Informasi Usaha nomor, tanpa lewat WhatsApp. Fitur `ai`. */
    jawab: (isian: IsianJawab): Promise<JawabanAi> => this.minta("POST", "/ai/jawab", { body: { ...isian, nomor_id: String(isian.nomor_id) } }),
    /** Susun tulisan bebas jadi dokumen siap pakai (tidak menyimpan). Fitur `ai.rapikan`. */
    rapikan: (isian: { teks: string; jenis?: string }): Promise<HasilRapikan> => this.minta("POST", "/ai/rapikan", { body: isian }),
    /** Suara (base64, maks 10 MB) jadi teks. Fitur `ai.transkripsi`. */
    transkripsi: (isian: { audio_base64: string; mime: MimeSuara }): Promise<HasilTranskripsi> => this.minta("POST", "/ai/transkripsi", { body: isian }),
    /** Sama seperti `transkripsi`, tetapi mengunggah berkas (multipart field `berkas`). */
    transkripsiBerkas: (berkas: Blob, namaBerkas = "suara.ogg"): Promise<HasilTranskripsi> => {
      const form = new FormData();
      form.set("berkas", berkas, namaBerkas);
      return this.minta("POST", "/ai/transkripsi", { body: form });
    },
  };

  /** Informasi Usaha (knowledge) per nomor. Fitur `knowledge`. */
  readonly knowledge = {
    daftar: (nomorId: Id): Promise<{ data: Dokumen[] }> => this.minta("GET", `/nomor/${seg(nomorId)}/knowledge`),
    /** Tambah dokumen teks. */
    tambah: (nomorId: Id, isian: { judul: string; teks: string }): Promise<Dokumen> => this.minta("POST", `/nomor/${seg(nomorId)}/knowledge`, { body: isian }),
    /** Unggah PDF / .txt / .md / .csv (maks 10 MB); hanya teksnya yang disimpan. */
    unggah: (nomorId: Id, berkas: Blob, opsi: { namaBerkas: string; judul?: string }): Promise<Dokumen> => {
      const form = new FormData();
      form.set("berkas", berkas, opsi.namaBerkas);
      if (opsi.judul) form.set("judul", opsi.judul);
      return this.minta("POST", `/nomor/${seg(nomorId)}/knowledge`, { body: form });
    },
    /** Isi teks satu dokumen. */
    ambil: (nomorId: Id, dokId: Id): Promise<IsiDokumen> => this.minta("GET", `/nomor/${seg(nomorId)}/knowledge/${seg(dokId)}`),
    hapus: (nomorId: Id, dokId: Id): Promise<Berhasil> => this.minta("DELETE", `/nomor/${seg(nomorId)}/knowledge/${seg(dokId)}`),
  };

  /** Katalog produk per nomor. Fitur `katalog`. */
  readonly produk = {
    daftar: (nomorId: Id): Promise<{ data: Produk[] }> => this.minta("GET", `/nomor/${seg(nomorId)}/produk`),
    tambah: (nomorId: Id, isian: IsianProduk): Promise<Produk> => this.minta("POST", `/nomor/${seg(nomorId)}/produk`, { body: isian }),
    /** `{ foto: true }` menyertakan `foto_base64` & `foto_mime`. */
    ambil: (nomorId: Id, produkId: Id, opsi: { foto?: boolean } = {}): Promise<Produk> =>
      this.minta("GET", `/nomor/${seg(nomorId)}/produk/${seg(produkId)}`, { query: { foto: opsi.foto ? 1 : undefined } }),
    ubah: (nomorId: Id, produkId: Id, isian: UbahProduk): Promise<Produk> => this.minta("PATCH", `/nomor/${seg(nomorId)}/produk/${seg(produkId)}`, { body: isian }),
    hapus: (nomorId: Id, produkId: Id): Promise<Berhasil> => this.minta("DELETE", `/nomor/${seg(nomorId)}/produk/${seg(produkId)}`),
  };
  /** Nama lain `produk`. */
  readonly katalog = this.produk;

  /** Pengaturan bot AI per nomor. Fitur `bot`. */
  readonly bot = {
    ambil: (nomorId: Id): Promise<PengaturanBot> => this.minta("GET", `/nomor/${seg(nomorId)}/bot`),
    /** Hanya kolom yang dikirim yang diubah. */
    ubah: (nomorId: Id, isian: UbahBot): Promise<PengaturanBot> => this.minta("PATCH", `/nomor/${seg(nomorId)}/bot`, { body: isian }),
  };

  /** Template instruksi bot per jenis usaha. Fitur `templat`. */
  readonly templat = {
    daftar: (): Promise<{ data: TemplatAi[] }> => this.minta("GET", "/templat-ai"),
    ambil: (slug: string): Promise<IsiTemplatAi> => this.minta("GET", `/templat-ai/${seg(slug)}`),
  };

  /** Jawaban admin yang dipelajari AI. Fitur `pelajaran`. */
  readonly pelajaran = {
    /** Terbaru dulu, 20 per halaman. */
    daftar: (nomorId: Id, opsi: { setelah?: string | null } = {}): Promise<HalamanPelajaran> =>
      this.minta("GET", `/nomor/${seg(nomorId)}/pelajaran`, { query: { setelah: opsi.setelah } }),
    hapus: (nomorId: Id, pelajaranId: Id): Promise<Berhasil> => this.minta("DELETE", `/nomor/${seg(nomorId)}/pelajaran/${seg(pelajaranId)}`),
    /** Hapus SEMUA pelajaran nomor ini. */
    hapusSemua: (nomorId: Id): Promise<{ dihapus: number }> => this.minta("DELETE", `/nomor/${seg(nomorId)}/pelajaran`),
  };

  /** Pesan masuk & dibalas bot per hari. Fitur `statistik`. */
  readonly statistik = {
    /** `hari`: 1–90 (bawaan 30). */
    harian: (nomorId: Id, opsi: { hari?: number } = {}): Promise<Statistik> => this.minta("GET", `/nomor/${seg(nomorId)}/statistik`, { query: { hari: opsi.hari } }),
  };

  /** Nama & foto profil nomor yang terhubung. Fitur `profil`. */
  readonly profil = {
    ambil: (nomorId: Id): Promise<ProfilNomor> => this.minta("GET", `/nomor/${seg(nomorId)}/profil`),
  };

  /** Fitur `kontak.cek`. */
  readonly kontak = {
    /** Cek nomor HP terdaftar di WhatsApp (maks 20 per panggilan), lewat nomor `nomor_id` yang terhubung. */
    cek: (isian: { nomor_id: Id; nomor: string[] }): Promise<HasilCekKontak> => this.minta("POST", "/kontak/cek", { body: { ...isian, nomor_id: String(isian.nomor_id) } }),
  };

  /** Alat bantu tanpa AI. */
  readonly alat = {
    /** Cek teks promosi judi online. Fitur `spam.cek`. */
    cekSpam: (teks: string): Promise<HasilCekSpam> => this.minta("POST", "/alat/cek-spam", { body: { teks } }),
  };
}

// ---------- Verifikasi webhook ----------

/** Dilempar `verifikasiWebhook` bila kiriman tidak sah. Jawab 400/401 dan jangan proses isinya. */
export class GalatTandaWebhook extends Error {
  readonly alasan: "rahasia_kosong" | "tanda_tidak_ada" | "format_tanda" | "tanda_salah" | "kedaluwarsa" | "body_tidak_sah";
  constructor(alasan: GalatTandaWebhook["alasan"], pesan: string) {
    super(pesan);
    this.name = "GalatTandaWebhook";
    this.alasan = alasan;
  }
}

/** Tanda tangan webhook: hex HMAC-SHA256(rahasia, t + "." + body). */
export function tandaWebhook(rahasia: string, t: number, bodyMentah: string): string {
  return createHmac("sha256", rahasia).update(`${t}.${bodyMentah}`).digest("hex");
}

/**
 * Periksa kiriman webhook dari mesin lalu kembalikan event bertipe.
 *
 * @param rahasia        `whsec_…` dari `cg.webhook.atur()`.
 * @param kepalaTanda    Isi header `X-CG-Tanda` (`t=<epoch detik>,v1=<hex>`).
 * @param bodyMentah     Body persis seperti diterima (`await req.text()`), JANGAN hasil JSON.stringify ulang.
 * @param toleransiDetik Selisih waktu yang diterima (bawaan 300 = 5 menit) untuk menolak kiriman ulang lama.
 * @throws GalatTandaWebhook bila tanda tangan salah, kedaluwarsa, atau body bukan event.
 */
export function verifikasiWebhook(rahasia: string, kepalaTanda: string | null | undefined, bodyMentah: string, toleransiDetik = 300): EventWebhook {
  if (!rahasia) throw new GalatTandaWebhook("rahasia_kosong", "Rahasia webhook belum diisi.");
  if (!kepalaTanda) throw new GalatTandaWebhook("tanda_tidak_ada", "Header X-CG-Tanda tidak ada.");
  const bagian = new Map<string, string>();
  for (const s of kepalaTanda.split(",")) {
    const i = s.indexOf("=");
    if (i > 0) bagian.set(s.slice(0, i).trim(), s.slice(i + 1).trim());
  }
  const t = Number(bagian.get("t"));
  const v1 = bagian.get("v1") ?? "";
  if (!Number.isSafeInteger(t) || t <= 0 || !/^[0-9a-f]{64}$/i.test(v1)) throw new GalatTandaWebhook("format_tanda", "Format X-CG-Tanda tidak dikenal (harus t=<detik>,v1=<hex>).");

  const harap = createHmac("sha256", rahasia).update(`${t}.${bodyMentah}`).digest();
  const dapat = Buffer.from(v1, "hex");
  if (dapat.length !== harap.length || !timingSafeEqual(dapat, harap)) throw new GalatTandaWebhook("tanda_salah", "Tanda tangan webhook tidak cocok.");
  if (Math.abs(Math.floor(Date.now() / 1000) - t) > toleransiDetik) throw new GalatTandaWebhook("kedaluwarsa", "Kiriman webhook terlalu lama (di luar toleransi waktu).");

  let isi: unknown;
  try {
    isi = JSON.parse(bodyMentah);
  } catch {
    isi = null;
  }
  const e = isi as { id_event?: unknown; jenis?: unknown; data?: unknown } | null;
  if (!e || typeof e !== "object" || typeof e.id_event !== "string" || typeof e.jenis !== "string" || typeof e.data !== "object" || e.data === null)
    throw new GalatTandaWebhook("body_tidak_sah", "Body webhook bukan event ChatGerCep.");
  return e as EventWebhook;
}
