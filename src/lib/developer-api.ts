import "server-only";
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  BATAS_BAWAAN,
  BATAS_TETAP_SANDBOX,
  type BatasApi,
  type BiayaAplikasi,
  type BiayaEfektif,
  type FiturApi,
  type IsiLisensi,
  JALUR_WEBHOOK_MESIN,
  JEDA_PERPANJANG_DETIK,
  type JawabanLisensiMesin,
  KODE_FITUR,
  type KodeGalat,
  MASA_KODE_UJI_DETIK,
  MASA_LISENSI_DETIK,
  type ModeApi,
  type PermintaanAktivasi,
  type PermintaanKondisi,
  type PermintaanNomorUji,
  RENTANG_SANDBOX,
  SANDBOX_AI_BAWAAN,
  SANDBOX_HARI_BAWAAN,
  type StatusAplikasi,
  type StatusLisensi,
  fiturSah,
  rapikanBatas,
} from "./api-def";
import { type Tx, db, getSetting, sekarang, setSetting, transaksi } from "./db";
import type { KanalBayar } from "./harga";
import { type AdapterGateway } from "./gateway";
import { GatewayError } from "./gateway-def";
import { buatKunciApi, hashRahasia, jawabTantangan, tandatanganiLisensi, uraiKunciApi } from "./lisensi-def";
import { modeMesin } from "./mode";
import { kirimNotif, kirimNotifDeveloper } from "./notifikasi";
import { catatLog } from "./pengguna";
import type { User } from "./session";

/**
 * Developer API di server pusat (chatgercep.com): pengajuan aplikasi, tinjauan developer internal, API key, penerbitan
 * lisensi bertanda tangan, aktivasi mesin self-host, pengiriman lisensi lewat webhook (tanpa polling), dan penagihan
 * aplikasi berbayar. Rencana: docs/plans/2026-11-09-developer-api.md.
 *
 * Beban di pusat sengaja kecil: panggilan API developer tidak pernah sampai ke sini (mesin memverifikasi lisensi
 * sendiri). Pusat hanya melayani aktivasi/cek saat mesin menyala dan mengirim webhook lisensi saat ada perubahan +
 * perpanjangan tiap 3 hari.
 */

export class ApiError extends Error {
  kode: KodeGalat;
  constructor(kode: KodeGalat, pesan: string) {
    super(pesan);
    this.kode = kode;
  }
}

// ---------- Pengaturan umum ----------

export interface PengaturanApi {
  biaya: BiayaEfektif;
  /** Harga bawaan per bulan (Rp) untuk aplikasi berbayar tanpa harga khusus. */
  harga: number;
  /** Fitur yang boleh dibuka sama sekali. */
  fitur: FiturApi[];
}

export const MAKS_HARGA_API = 100_000_000;

export async function pengaturanApi(): Promise<PengaturanApi> {
  const [b, h, f] = await Promise.all([getSetting("api_biaya_bawaan"), getSetting("api_harga_bawaan"), getSetting("api_fitur_global")]);
  let fitur: FiturApi[] = [...KODE_FITUR];
  if (f !== null) {
    try {
      const x = JSON.parse(f);
      if (Array.isArray(x)) fitur = KODE_FITUR.filter((k) => x.includes(k));
    } catch {}
  }
  const harga = Number(h);
  return { biaya: b === "berbayar" ? "berbayar" : "gratis", harga: Number.isInteger(harga) && harga >= 0 ? harga : 0, fitur };
}

/** Simpan biaya & harga bawaan (dan fitur bila dikirim). Lisensi semua aplikasi aktif dikirim ulang. */
export async function simpanPengaturanApi(pelaku: User, p: Omit<PengaturanApi, "fitur"> & { fitur?: FiturApi[] }): Promise<void> {
  if (!Number.isInteger(p.harga) || p.harga < 0 || p.harga > MAKS_HARGA_API) throw new ApiError("isian_tidak_sah", "Harga bawaan tidak valid.");
  if (p.biaya === "berbayar" && p.harga < 1000) throw new ApiError("isian_tidak_sah", "Harga bawaan minimal Rp1.000 bila biaya bawaan berbayar.");
  const fitur = p.fitur && KODE_FITUR.filter((k) => p.fitur!.includes(k));
  await setSetting("api_biaya_bawaan", p.biaya);
  await setSetting("api_harga_bawaan", String(p.harga));
  if (fitur) await setSetting("api_fitur_global", JSON.stringify(fitur));
  await catatLog(pelaku, "ubah pengaturan Developer API", null, `biaya bawaan ${p.biaya}, harga Rp${p.harga.toLocaleString("id-ID")}${fitur ? `, fitur ${fitur.join(", ") || "-"}` : ""}`);
  // Biaya/fitur umum bisa mengubah lisensi semua aplikasi aktif: kirim ulang.
  await jadwalkanSemua();
}

/**
 * Katalog fitur yang dibagikan ke developer luar (centang di tab Fitur). Fitur yang dimatikan langsung hilang dari
 * lisensi semua mesin (dikirim ulang lewat webhook) dan dari formulir pengajuan; pilihan per aplikasi tetap tersimpan,
 * jadi menyalakannya lagi memulihkan akses tanpa menyetujui ulang.
 */
export async function simpanFiturGlobal(pelaku: User, masukan: readonly string[]): Promise<FiturApi[]> {
  const fitur = KODE_FITUR.filter((k) => masukan.includes(k));
  const lama = (await pengaturanApi()).fitur;
  await setSetting("api_fitur_global", JSON.stringify(fitur));
  const nyala = fitur.filter((f) => !lama.includes(f));
  const mati = lama.filter((f) => !fitur.includes(f));
  await catatLog(pelaku, "ubah fitur Developer API", null, `dibagikan ${fitur.length}/${KODE_FITUR.length}${nyala.length ? ` · nyala ${nyala.join(", ")}` : ""}${mati.length ? ` · mati ${mati.join(", ")}` : ""}`);
  if (nyala.length || mati.length) await jadwalkanSemua();
  return fitur;
}

/** Jumlah aplikasi aktif/ditangguhkan yang memakai tiap fitur: satu query agregat (unnest), bukan baris mentah. */
export async function pemakaianFitur(): Promise<Record<string, number>> {
  const sql = await db();
  const baris = await sql<{ f: string; n: number }[]>`
    SELECT f, COUNT(*)::int AS n FROM api_aplikasi, unnest(fitur) AS f
     WHERE status IN ('disetujui', 'ditangguhkan') AND mode = 'produksi' GROUP BY f`;
  return Object.fromEntries(baris.map((b) => [b.f, b.n]));
}

// ---------- Aplikasi ----------

export interface Aplikasi {
  id: number;
  user_id: number;
  nama: string;
  kegunaan: string;
  situs: string | null;
  pemilik: string;
  kontak_wa: string;
  perkiraan_nomor: number | null;
  alamat_mesin: string | null;
  fitur_diminta: FiturApi[];
  fitur: FiturApi[];
  batas: BatasApi;
  biaya: BiayaAplikasi;
  harga_bulan: number | null;
  dibayar_sampai: number | null;
  status: StatusAplikasi;
  alasan: string | null;
  ditinjau_pada: number | null;
  created_at: number;
  mode: ModeApi;
  /** Sandbox: key & lisensi berlaku sampai (detik epoch). */
  sandbox_sampai: number | null;
  uji_telepon: string | null;
  uji_alamat: string | null;
  uji_diverifikasi: number | null;
  uji_kode_sampai: number | null;
}

export interface AplikasiDenganPemilik extends Aplikasi {
  email: string;
  nama_akun: string;
}

const KOLOM_APLIKASI =
  "a.id, a.user_id, a.nama, a.kegunaan, a.situs, a.pemilik, a.kontak_wa, a.perkiraan_nomor, a.alamat_mesin, a.fitur_diminta, a.fitur, a.batas, a.biaya, a.harga_bulan, a.dibayar_sampai, a.status, a.alasan, a.ditinjau_pada, a.created_at, a.mode, a.sandbox_sampai, a.uji_telepon, a.uji_alamat, a.uji_diverifikasi, a.uji_kode_sampai";

const rapikan = <T extends Aplikasi>(a: T): T => ({ ...a, batas: rapikanBatas(a.batas), fitur: a.fitur.filter(fiturSah), fitur_diminta: a.fitur_diminta.filter(fiturSah) });

/** Biaya yang berlaku untuk aplikasi ini (pengaturan per aplikasi mengalahkan sakelar umum). */
export const biayaEfektif = (a: Pick<Aplikasi, "biaya">, umum: PengaturanApi): BiayaEfektif => (a.biaya === "ikut_umum" ? umum.biaya : a.biaya);
export const hargaEfektif = (a: Pick<Aplikasi, "harga_bulan">, umum: PengaturanApi): number => a.harga_bulan ?? umum.harga;

/** Status layanan yang dibawa lisensi; null = aplikasi belum/tidak disetujui (tidak ada lisensi sama sekali). */
export function statusLisensi(a: Pick<Aplikasi, "status" | "biaya" | "dibayar_sampai"> & { mode?: ModeApi }, umum: PengaturanApi, kini = sekarang()): StatusLisensi | null {
  if (a.status === "ditangguhkan") return "ditangguhkan";
  if (a.status === "dicabut") return "dicabut";
  if (a.status !== "disetujui") return null;
  if (a.mode === "sandbox") return "aktif"; // sandbox selalu gratis; masa berlakunya lewat berlaku_sampai
  if (biayaEfektif(a, umum) === "berbayar" && (a.dibayar_sampai ?? 0) <= kini) return "belum_bayar";
  return "aktif";
}

export interface IsianPengajuan {
  nama: string;
  kegunaan: string;
  situs: string;
  pemilik: string;
  kontak_wa: string;
  perkiraan_nomor: string | number;
  alamat_mesin: string;
  fitur: string[];
  setuju: boolean;
}

const MAKS_MENUNGGU = 3;

function bersih(v: unknown, maks: number): string {
  return String(v ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maks);
}

function periksaSitus(v: string): string | null {
  if (!v) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw 0;
    return u.toString().replace(/\/$/, "").slice(0, 300);
  } catch {
    throw new ApiError("isian_tidak_sah", "Situs aplikasi tidak valid.");
  }
}

/** Alamat mesin: https://domain[:port][/awalan] tanpa kredensial/query. Belum dicek DNS-nya di sini (lihat periksaAlamatMesin). */
/**
 * Rapikan alamat HTTPS publik. Boleh domain saja ("kasirku.id") atau URL lengkap; hasilnya selalu https://host[/jalur].
 * `nama` = sebutan kolom di pesan galat; `wajibDomain` = tolak alamat IP (formulir pengajuan: "Domain aplikasi"). Aktivasi mesin tetap menerima IP publik.
 */
export function rapikanAlamatMesin(v: string, nama = "Alamat mesin", wajibDomain = false): string | null {
  let s = bersih(v, 300);
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new ApiError("alamat_tidak_sah", `${nama} tidak sah, mis. kasirku.id`);
  }
  const http = process.env.LISENSI_IZINKAN_HTTP === "1";
  if (u.protocol !== "https:" && !(http && u.protocol === "http:")) throw new ApiError("alamat_tidak_sah", `${nama} wajib memakai HTTPS.`);
  if (u.username || u.password || u.search || u.hash) throw new ApiError("alamat_tidak_sah", `${nama} tidak boleh berisi kredensial, query, atau tanda #.`);
  if (wajibDomain && !http && !/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(u.hostname))
    throw new ApiError("alamat_tidak_sah", `${nama} harus domain publik, mis. kasirku.id`);
  return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, "")}`;
}

export async function ajukan(user: User, i: IsianPengajuan): Promise<number> {
  const nama = bersih(i.nama, 80);
  const kegunaan = bersih(i.kegunaan, 1000);
  const pemilik = bersih(i.pemilik, 120);
  const kontak = String(i.kontak_wa ?? "").replace(/\D/g, "").replace(/^0/, "62").slice(0, 15);
  const perkiraan = String(i.perkiraan_nomor ?? "").trim() === "" ? null : Number(i.perkiraan_nomor);
  // Hanya fitur yang sedang dibagikan (tab Fitur di panel developer internal) yang bisa diajukan.
  const dibagikan = (await pengaturanApi()).fitur;
  const fitur = dibagikan.filter((k) => (i.fitur ?? []).includes(k));
  if (nama.length < 3) throw new ApiError("isian_tidak_sah", "Nama aplikasi minimal 3 karakter.");
  if (kegunaan.length < 20) throw new ApiError("isian_tidak_sah", "Ceritakan kegunaan aplikasi minimal 20 karakter.");
  if (pemilik.length < 2) throw new ApiError("isian_tidak_sah", "Isi nama pemilik (perusahaan atau perorangan).");
  if (!/^[0-9]{9,15}$/.test(kontak)) throw new ApiError("isian_tidak_sah", "Nomor WhatsApp kontak tidak valid.");
  if (perkiraan !== null && !(Number.isInteger(perkiraan) && perkiraan >= 1 && perkiraan <= 100_000)) throw new ApiError("isian_tidak_sah", "Perkiraan jumlah nomor harus angka 1–100.000.");
  if (!fitur.length) throw new ApiError("isian_tidak_sah", "Pilih minimal satu fitur.");
  if (!i.setuju) throw new ApiError("isian_tidak_sah", "Setujui syarat pemakaian dulu.");
  const situs = periksaSitus(bersih(i.situs, 300));
  const alamat = rapikanAlamatMesin(i.alamat_mesin, "Domain aplikasi", true);
  if (!alamat) throw new ApiError("alamat_tidak_sah", "Isi domain aplikasi Anda, mis. kasirku.id");
  const id = await transaksi(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(72727410, ${user.id})`;
    const [{ n }] = await tx<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM api_aplikasi WHERE user_id = ${user.id} AND status = 'menunggu'`;
    if (n >= MAKS_MENUNGGU) throw new ApiError("terlalu_sering", `Maksimal ${MAKS_MENUNGGU} pengajuan yang menunggu tinjauan.`);
    const [r] = await tx<{ id: number }[]>`
      INSERT INTO api_aplikasi (user_id, nama, kegunaan, situs, pemilik, kontak_wa, perkiraan_nomor, alamat_mesin, fitur_diminta, created_at)
      VALUES (${user.id}, ${nama}, ${kegunaan}, ${situs}, ${pemilik}, ${kontak}, ${perkiraan}, ${alamat}, ${fitur}, ${sekarang()})
      RETURNING id`;
    return r.id;
  });
  await kirimNotifDeveloper({
    jenis: "admin_developer_api",
    judul: { id: `Pengajuan Developer API baru: ${nama}`, en: `New Developer API application: ${nama}` },
    isi: { id: `Dari ${user.email}. Tinjau dan setujui atau tolak.`, en: `From ${user.email}. Review and approve or reject.` },
    tautan: `/admin/developer-api/${id}`,
  });
  return id;
}

// ---------- Akses portal (dipilih developer internal) ----------

export interface AkunAksesApi {
  id: number;
  email: string;
  nama: string;
  peran: string;
  akses_api: boolean;
}

export const MAKS_AKSES_API = 200;
export const BATAS_CARI_AKSES = 30;

/**
 * Pemilih akses portal: akun yang cocok dengan kata kunci (email / nama), yang sudah punya akses di atas.
 * `hanyaAkses` lewat indeks parsial users_akses_api_idx. Tanpa kata kunci = akun dengan akses lalu akun terbaru.
 */
export async function cariAkunAkses(o: { cari?: string; hanyaAkses?: boolean } = {}): Promise<{ daftar: AkunAksesApi[]; jumlahAkses: number }> {
  const cari = String(o.cari ?? "").trim().toLowerCase().slice(0, 100);
  const pola = `%${cari.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const hanya = !!o.hanyaAkses;
  const sql = await db();
  const [daftar, [{ n }]] = await Promise.all([
    sql<AkunAksesApi[]>`
      SELECT id, email, nama, peran, akses_api FROM users
       WHERE (${cari} = '' OR email LIKE ${pola} OR lower(nama) LIKE ${pola})
         AND (${!hanya} OR akses_api)
       ORDER BY akses_api DESC, id DESC
       LIMIT ${BATAS_CARI_AKSES}`,
    sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM users WHERE akses_api`,
  ]);
  return { daftar: [...daftar], jumlahAkses: n };
}

/** Nyalakan / matikan akses portal satu akun. Mengembalikan email akun itu. */
export async function aturAksesApi(pelaku: User, userId: number, aktif: boolean): Promise<string> {
  if (!Number.isInteger(userId) || userId <= 0) throw new ApiError("isian_tidak_sah", "Akun tidak valid.");
  const sql = await db();
  if (aktif) {
    const [{ n }] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM users WHERE akses_api`;
    if (n >= MAKS_AKSES_API) throw new ApiError("isian_tidak_sah", `Maksimal ${MAKS_AKSES_API} akun.`);
  }
  const [u] = await sql<{ email: string }[]>`UPDATE users SET akses_api = ${aktif} WHERE id = ${userId} AND akses_api <> ${aktif} RETURNING email`;
  if (!u) {
    const [ada] = await sql<{ email: string }[]>`SELECT email FROM users WHERE id = ${userId}`;
    if (!ada) throw new ApiError("isian_tidak_sah", "Akun tidak ditemukan.");
    return ada.email; // sudah dalam keadaan yang diminta
  }
  await catatLog(pelaku, aktif ? "developer_api.beri_akses" : "developer_api.cabut_akses", u.email);
  return u.email;
}

/** Aplikasi milik satu akun (portal developer luar), terbaru dulu. */
export async function aplikasiMilik(userId: number): Promise<Aplikasi[]> {
  const sql = await db();
  const r = await sql<Aplikasi[]>`SELECT ${sql.unsafe(KOLOM_APLIKASI)} FROM api_aplikasi a WHERE a.user_id = ${userId} AND a.mode = 'produksi' ORDER BY a.id DESC LIMIT 50`;
  return r.map(rapikan);
}

/** Satu aplikasi milik akun ini; milik orang lain = undefined (tidak membocorkan keberadaannya). */
export async function aplikasiMilikById(userId: number, id: number): Promise<Aplikasi | undefined> {
  if (!Number.isInteger(id) || id <= 0) return undefined;
  const sql = await db();
  const [a] = await sql<Aplikasi[]>`SELECT ${sql.unsafe(KOLOM_APLIKASI)} FROM api_aplikasi a WHERE a.id = ${id} AND a.user_id = ${userId}`;
  return a && rapikan(a);
}

export async function aplikasiById(id: number): Promise<AplikasiDenganPemilik | undefined> {
  if (!Number.isInteger(id) || id <= 0) return undefined;
  const sql = await db();
  const [a] = await sql<AplikasiDenganPemilik[]>`
    SELECT ${sql.unsafe(KOLOM_APLIKASI)}, u.email, u.nama AS nama_akun FROM api_aplikasi a JOIN users u ON u.id = a.user_id WHERE a.id = ${id}`;
  return a && rapikan(a);
}

export type FilterAplikasi = "menunggu" | "aktif" | "ditolak" | "semua";

/** Daftar untuk panel (kursor id, tanpa OFFSET). "menunggu" = antrean, terlama dulu; lainnya terbaru dulu. */
export async function daftarAplikasi(o: { filter?: FilterAplikasi; cari?: string; setelah?: number; batas?: number } = {}): Promise<{ daftar: AplikasiDenganPemilik[]; adaLagi: boolean }> {
  const sql = await db();
  const batas = Math.min(Math.max(o.batas ?? 25, 1), 100);
  const f = o.filter ?? "menunggu";
  const cari = (o.cari ?? "").trim().toLowerCase().slice(0, 100);
  const pola = `%${cari.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const kursor = o.setelah ?? null;
  const saringCari = cari ? sql`AND (lower(a.nama) LIKE ${pola} OR u.email LIKE ${pola} OR lower(a.pemilik) LIKE ${pola})` : sql``;
  const baris =
    f === "menunggu"
      ? await sql<AplikasiDenganPemilik[]>`
          SELECT ${sql.unsafe(KOLOM_APLIKASI)}, u.email, u.nama AS nama_akun FROM api_aplikasi a JOIN users u ON u.id = a.user_id
           WHERE a.status = 'menunggu' AND a.mode = 'produksi' ${saringCari} AND (${kursor}::integer IS NULL OR a.id > ${kursor}::integer)
           ORDER BY a.id ASC LIMIT ${batas + 1}`
      : await sql<AplikasiDenganPemilik[]>`
          SELECT ${sql.unsafe(KOLOM_APLIKASI)}, u.email, u.nama AS nama_akun FROM api_aplikasi a JOIN users u ON u.id = a.user_id
           WHERE a.mode = 'produksi' AND ${f === "aktif" ? sql`a.status IN ('disetujui', 'ditangguhkan')` : f === "ditolak" ? sql`a.status IN ('ditolak', 'dicabut')` : sql`true`}
             ${saringCari} AND (${kursor}::integer IS NULL OR a.id < ${kursor}::integer)
           ORDER BY a.id DESC LIMIT ${batas + 1}`;
  return { daftar: baris.slice(0, batas).map(rapikan), adaLagi: baris.length > batas };
}

export async function hitungAplikasi(): Promise<Record<FilterAplikasi, number>> {
  const sql = await db();
  const [r] = await sql<Record<FilterAplikasi, number>[]>`
    SELECT COUNT(*) FILTER (WHERE status = 'menunggu')::int AS menunggu,
           COUNT(*) FILTER (WHERE status IN ('disetujui', 'ditangguhkan'))::int AS aktif,
           COUNT(*) FILTER (WHERE status IN ('ditolak', 'dicabut'))::int AS ditolak,
           COUNT(*)::int AS semua
      FROM api_aplikasi WHERE mode = 'produksi'`;
  return r;
}

/** Jumlah pengajuan menunggu (lencana menu), lewat indeks parsial antrean. */
export async function jumlahMenunggu(): Promise<number> {
  const sql = await db();
  const [r] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM api_aplikasi WHERE status = 'menunggu'`;
  return r.n;
}

export interface Keputusan {
  fitur: string[];
  biaya: BiayaAplikasi;
  harga_bulan: number | null;
  batas: Partial<Record<keyof BatasApi, unknown>>;
}

async function periksaKeputusan(k: Keputusan): Promise<{ fitur: FiturApi[]; biaya: BiayaAplikasi; harga: number | null; batas: BatasApi }> {
  const umum = await pengaturanApi();
  const fitur = umum.fitur.filter((f) => k.fitur.includes(f));
  if (!fitur.length) throw new ApiError("isian_tidak_sah", "Buka minimal satu fitur (yang diizinkan di pengaturan umum).");
  if (!["ikut_umum", "gratis", "berbayar"].includes(k.biaya)) throw new ApiError("isian_tidak_sah", "Pilihan biaya tidak valid.");
  const harga = k.harga_bulan === null || k.harga_bulan === undefined ? null : Number(k.harga_bulan);
  if (harga !== null && !(Number.isInteger(harga) && harga >= 0 && harga <= MAKS_HARGA_API)) throw new ApiError("isian_tidak_sah", "Harga per bulan tidak valid.");
  const efektif = k.biaya === "ikut_umum" ? umum.biaya : k.biaya;
  if (efektif === "berbayar" && (harga ?? umum.harga) < 1000) throw new ApiError("isian_tidak_sah", "Aplikasi berbayar butuh harga per bulan minimal Rp1.000.");
  return { fitur, biaya: k.biaya, harga, batas: rapikanBatas(k.batas) };
}

async function wajibAplikasi(tx: Tx, id: number, mode?: ModeApi): Promise<Aplikasi & { email: string }> {
  const [a] = await tx<(Aplikasi & { email: string })[]>`
    SELECT ${tx.unsafe(KOLOM_APLIKASI)}, u.email FROM api_aplikasi a JOIN users u ON u.id = a.user_id WHERE a.id = ${id} FOR UPDATE OF a`;
  if (!a || (mode && a.mode !== mode)) throw new ApiError("tidak_ditemukan", "Aplikasi tidak ditemukan.");
  return a;
}

export async function setujui(pelaku: User, id: number, k: Keputusan): Promise<void> {
  const d = await periksaKeputusan(k);
  const a = await transaksi(async (tx) => {
    const a = await wajibAplikasi(tx, id, "produksi");
    if (a.status !== "menunggu" && a.status !== "ditolak") throw new ApiError("isian_tidak_sah", "Aplikasi ini sudah pernah disetujui.");
    await tx`
      UPDATE api_aplikasi SET status = 'disetujui', fitur = ${d.fitur}, biaya = ${d.biaya}, harga_bulan = ${d.harga}, batas = ${tx.json({ ...d.batas })},
             alasan = NULL, ditinjau_oleh = ${pelaku.id}, ditinjau_pada = ${sekarang()}, versi_lisensi = versi_lisensi + 1
       WHERE id = ${id}`;
    return a;
  });
  await catatLog(pelaku, "setujui aplikasi API", a.email, `${a.nama} · ${d.fitur.join(", ")} · biaya ${d.biaya}`);
  await kirimNotif(a.user_id, {
    jenis: "developer_api",
    judul: { id: `Pengajuan "${a.nama}" disetujui`, en: `"${a.nama}" was approved` },
    isi: { id: "Buat API key Anda lalu pasang mesin ChatGerCep di server Anda.", en: "Create your API key, then install the ChatGerCep engine on your server." },
    tautan: `/developer/${id}`,
  });
}

export async function tolak(pelaku: User, id: number, alasan: string): Promise<void> {
  const teks = bersih(alasan, 500);
  if (teks.length < 5) throw new ApiError("isian_tidak_sah", "Tulis alasan penolakan (minimal 5 karakter).");
  const a = await transaksi(async (tx) => {
    const a = await wajibAplikasi(tx, id, "produksi");
    if (a.status !== "menunggu") throw new ApiError("isian_tidak_sah", "Hanya pengajuan yang menunggu yang bisa ditolak.");
    await tx`UPDATE api_aplikasi SET status = 'ditolak', alasan = ${teks}, ditinjau_oleh = ${pelaku.id}, ditinjau_pada = ${sekarang()} WHERE id = ${id}`;
    return a;
  });
  await catatLog(pelaku, "tolak aplikasi API", a.email, `${a.nama}: ${teks}`);
  await kirimNotif(a.user_id, {
    jenis: "developer_api",
    judul: { id: `Pengajuan "${a.nama}" ditolak`, en: `"${a.nama}" was rejected` },
    isi: { id: `Alasan: ${teks}`, en: `Reason: ${teks}` },
    tautan: `/developer/${id}`,
  });
}

/** Ubah fitur/biaya/harga/batas aplikasi yang sudah disetujui; perubahan langsung dikirim ke mesin lewat webhook. */
export async function ubahAplikasi(pelaku: User, id: number, k: Keputusan): Promise<void> {
  const d = await periksaKeputusan(k);
  const a = await transaksi(async (tx) => {
    const a = await wajibAplikasi(tx, id, "produksi");
    if (a.status === "menunggu" || a.status === "ditolak") throw new ApiError("isian_tidak_sah", "Setujui pengajuan ini dulu.");
    await tx`
      UPDATE api_aplikasi SET fitur = ${d.fitur}, biaya = ${d.biaya}, harga_bulan = ${d.harga}, batas = ${tx.json({ ...d.batas })}, versi_lisensi = versi_lisensi + 1
       WHERE id = ${id}`;
    return a;
  });
  await catatLog(pelaku, "ubah aplikasi API", a.email, `${a.nama} · ${d.fitur.join(", ")} · biaya ${d.biaya}${d.harga !== null ? ` Rp${d.harga.toLocaleString("id-ID")}` : ""}`);
  await jadwalkanAplikasi(id);
}

/** Tangguhkan / aktifkan lagi / cabut (final). Koneksi WA di mesin tidak pernah diputus oleh tindakan ini. */
export async function ubahStatus(pelaku: User, id: number, aksi: "tangguhkan" | "aktifkan" | "cabut", alasan = ""): Promise<void> {
  const teks = bersih(alasan, 500) || null;
  if (aksi !== "aktifkan" && !teks) throw new ApiError("isian_tidak_sah", "Tulis alasannya (dikirim ke developer).");
  const a = await transaksi(async (tx) => {
    const a = await wajibAplikasi(tx, id);
    const boleh = aksi === "tangguhkan" ? a.status === "disetujui" : aksi === "aktifkan" ? a.status === "ditangguhkan" : a.status === "disetujui" || a.status === "ditangguhkan";
    if (!boleh) throw new ApiError("isian_tidak_sah", "Tindakan ini tidak berlaku untuk status aplikasi sekarang.");
    const baru: StatusAplikasi = aksi === "tangguhkan" ? "ditangguhkan" : aksi === "aktifkan" ? "disetujui" : "dicabut";
    await tx`UPDATE api_aplikasi SET status = ${baru}, alasan = ${aksi === "aktifkan" ? null : teks}, versi_lisensi = versi_lisensi + 1 WHERE id = ${id}`;
    if (aksi === "cabut") await tx`UPDATE api_kunci SET dicabut_pada = ${sekarang()} WHERE aplikasi_id = ${id} AND dicabut_pada IS NULL`;
    return a;
  });
  const label = aksi === "tangguhkan" ? "ditangguhkan" : aksi === "aktifkan" ? "diaktifkan kembali" : "dicabut";
  const sb = a.mode === "sandbox";
  const en = aksi === "tangguhkan" ? "suspended" : aksi === "aktifkan" ? "reactivated" : "revoked";
  await catatLog(pelaku, `${sb ? "sandbox" : "aplikasi"} API ${label}`, a.email, `${a.nama}${teks ? `: ${teks}` : ""}`);
  await kirimNotif(a.user_id, {
    jenis: "developer_api",
    judul: sb ? { id: `Sandbox Developer API ${label}`, en: `Developer API sandbox was ${en}` } : { id: `Aplikasi "${a.nama}" ${label}`, en: `"${a.nama}" was ${en}` },
    isi: sb
      ? { id: `${teks ? `Alasan: ${teks}. ` : ""}Berlaku saat mesin sandbox dinyalakan ulang atau menekan Perbarui lisensi.`, en: `${teks ? `Reason: ${teks}. ` : ""}Takes effect when the sandbox engine restarts or refreshes its license.` }
      : teks
        ? { id: `Alasan: ${teks}`, en: `Reason: ${teks}` }
        : undefined,
    tautan: sb ? "/developer#sandbox" : `/developer/${id}`,
  });
  await jadwalkanAplikasi(id);
}

// ---------- API key ----------

export interface InfoKunci {
  id: number;
  awalan: string;
  dibuat: number;
  berlaku_sampai: number | null;
  dicabut_pada: number | null;
}

export async function daftarKunci(aplikasiId: number): Promise<InfoKunci[]> {
  const sql = await db();
  return [...(await sql<InfoKunci[]>`
    SELECT id, awalan, dibuat, berlaku_sampai, dicabut_pada FROM api_kunci WHERE aplikasi_id = ${aplikasiId} ORDER BY id DESC LIMIT 20`)];
}

/** Masa key lama tetap berlaku setelah diganti (tanpa waktu mati di aplikasi developer). */
export const MASA_ROTASI_DETIK = 24 * 3600;

/**
 * Buat key baru untuk aplikasi milik akun ini (tampil SEKALI: hanya hash yang disimpan). Bila sudah ada key aktif,
 * ini rotasi: key lama tetap berlaku 24 jam. Lisensi baru (berisi daftar key) dikirim ke mesin.
 */
export async function buatKunci(user: User, aplikasiId: number): Promise<{ key: string; rotasi: boolean }> {
  const kini = sekarang();
  let key = "";
  const rotasi = await transaksi(async (tx) => {
    const a = await wajibAplikasi(tx, aplikasiId);
    if (a.user_id !== user.id) throw new ApiError("tidak_ditemukan", "Aplikasi tidak ditemukan.");
    if (a.status !== "disetujui" && a.status !== "ditangguhkan") throw new ApiError("aplikasi_dicabut", "API key hanya bisa dibuat untuk aplikasi yang disetujui.");
    const k = buatKunciApi(a.mode);
    key = k.key;
    if (a.mode === "sandbox") {
      // Sandbox tanpa rotasi 24 jam: key lama langsung tidak berlaku di pusat.
      const lama = await tx`UPDATE api_kunci SET dicabut_pada = ${kini} WHERE aplikasi_id = ${aplikasiId} AND dicabut_pada IS NULL RETURNING id`;
      await tx`INSERT INTO api_kunci (aplikasi_id, awalan, hash, dibuat) VALUES (${aplikasiId}, ${k.awalan}, ${k.hash}, ${kini})`;
      await tx`UPDATE api_aplikasi SET versi_lisensi = versi_lisensi + 1 WHERE id = ${aplikasiId}`;
      return lama.length > 0;
    }
    const lama = await tx`
      UPDATE api_kunci SET berlaku_sampai = ${kini + MASA_ROTASI_DETIK}
       WHERE aplikasi_id = ${aplikasiId} AND dicabut_pada IS NULL AND (berlaku_sampai IS NULL OR berlaku_sampai > ${kini + MASA_ROTASI_DETIK})
       RETURNING id`;
    await tx`INSERT INTO api_kunci (aplikasi_id, awalan, hash, dibuat) VALUES (${aplikasiId}, ${k.awalan}, ${k.hash}, ${kini})`;
    await tx`UPDATE api_aplikasi SET versi_lisensi = versi_lisensi + 1 WHERE id = ${aplikasiId}`;
    return lama.length > 0;
  });
  await jadwalkanAplikasi(aplikasiId);
  return { key, rotasi };
}

/** Developer internal mencabut semua key aplikasi (mis. bocor); developer luar lalu membuat key baru. */
export async function cabutSemuaKunci(pelaku: User, aplikasiId: number): Promise<number> {
  const sql = await db();
  const r = await sql`UPDATE api_kunci SET dicabut_pada = ${sekarang()} WHERE aplikasi_id = ${aplikasiId} AND dicabut_pada IS NULL RETURNING id`;
  await sql`UPDATE api_aplikasi SET versi_lisensi = versi_lisensi + 1 WHERE id = ${aplikasiId}`;
  const a = await aplikasiById(aplikasiId);
  if (a) await catatLog(pelaku, "cabut API key", a.email, `${a.nama} · ${r.length} key`);
  if (a) await kirimNotif(a.user_id, { jenis: "developer_api", judul: { id: `API key "${a.nama}" dicabut`, en: `API keys for "${a.nama}" were revoked` }, isi: { id: "Buat key baru di portal Developer.", en: "Create a new key in the Developer portal." }, tautan: `/developer/${aplikasiId}` });
  await jadwalkanAplikasi(aplikasiId);
  return r.length;
}

async function cariKunci(key: string): Promise<{ aplikasi_id: number; mode: ModeApi } | null> {
  const k = uraiKunciApi(key);
  if (!k) return null;
  const sql = await db();
  const [r] = await sql<{ aplikasi_id: number; hash: string; berlaku_sampai: number | null; dicabut_pada: number | null }[]>`
    SELECT aplikasi_id, hash, berlaku_sampai, dicabut_pada FROM api_kunci WHERE awalan = ${k.awalan}`;
  if (!r || r.dicabut_pada || (r.berlaku_sampai !== null && r.berlaku_sampai <= sekarang())) return null;
  const a = Buffer.from(hashRahasia(k.rahasia), "hex");
  const b = Buffer.from(r.hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b) ? { aplikasi_id: r.aplikasi_id, mode: k.mode } : null;
}

// ---------- Instalasi ----------

export interface Instalasi {
  id: string;
  /** null = mesin sandbox (tanpa alamat publik). */
  alamat: string | null;
  versi_mesin: string | null;
  jumlah_nomor: number;
  terakhir_sukses: number | null;
  gagal_sejak: number | null;
  galat_terakhir: string | null;
  dibuat: number;
}

export async function daftarInstalasi(aplikasiId: number): Promise<Instalasi[]> {
  const sql = await db();
  return [...(await sql<Instalasi[]>`
    SELECT id, alamat, versi_mesin, jumlah_nomor, terakhir_sukses, gagal_sejak, galat_terakhir, dibuat
      FROM api_instalasi WHERE aplikasi_id = ${aplikasiId} AND dilepas_pada IS NULL ORDER BY dibuat DESC`)];
}

/** Lepas instalasi (pemilik aplikasi atau staf). Mesin itu tidak lagi menerima perpanjangan, lalu masuk mode terbatas. */
export async function lepasInstalasi(pelaku: User, aplikasiId: number, instalasiId: string, olehStaf: boolean): Promise<void> {
  const sql = await db();
  const a = olehStaf ? await aplikasiById(aplikasiId) : await aplikasiMilikById(pelaku.id, aplikasiId);
  if (!a) throw new ApiError("tidak_ditemukan", "Aplikasi tidak ditemukan.");
  const r = await sql`UPDATE api_instalasi SET dilepas_pada = ${sekarang()} WHERE id = ${instalasiId}::uuid AND aplikasi_id = ${aplikasiId} AND dilepas_pada IS NULL RETURNING id`;
  if (!r.length) throw new ApiError("tidak_ditemukan", "Instalasi tidak ditemukan.");
  await sql`DELETE FROM api_kirim_lisensi WHERE instalasi_id = ${instalasiId}::uuid`;
  if (olehStaf) await catatLog(pelaku, "lepas instalasi mesin", (a as AplikasiDenganPemilik).email ?? null, `${a.nama} · ${instalasiId}`);
}

// ---------- Lisensi ----------

const kunciPrivat = (): string | null => process.env.LISENSI_KUNCI_PRIVAT?.trim() || null;
export const lisensiSiap = (): boolean => !!kunciPrivat();

/** Terbitkan lisensi bertanda tangan untuk satu instalasi (versi_urut selalu naik). null = aplikasi tidak berhak lisensi. */
async function terbitkan(instalasiId: string): Promise<{ token: string; isi: IsiLisensi; alamat: string | null; userId: number } | null> {
  const priv = kunciPrivat();
  if (!priv) throw new ApiError("galat_server", "Penerbit lisensi belum dipasang di server (LISENSI_KUNCI_PRIVAT).");
  const sql = await db();
  const umum = await pengaturanApi();
  const [i] = await sql<(Aplikasi & { alamat: string | null; versi: number })[]>`
    WITH naik AS (
      UPDATE api_aplikasi a SET versi_lisensi = a.versi_lisensi + 1
        FROM api_instalasi i WHERE i.id = ${instalasiId}::uuid AND i.dilepas_pada IS NULL AND a.id = i.aplikasi_id
      RETURNING a.*, i.alamat
    )
    SELECT ${sql.unsafe(KOLOM_APLIKASI)}, a.alamat, a.versi_lisensi AS versi FROM naik a`;
  if (!i) return null;
  const a = rapikan(i);
  const sb = a.mode === "sandbox";
  const umumSb = sb ? await pengaturanSandbox() : null;
  let status = statusLisensi(a, umum);
  if (!status) return null;
  // Sakelar umum sandbox dimatikan developer internal: semua mesin sandbox masuk mode terbatas.
  if (sb && status === "aktif" && !umumSb!.aktif) status = "ditangguhkan";
  const kini = sekarang();
  const kunci = await sql<{ awalan: string; hash: string; sampai: number | null }[]>`
    SELECT awalan, hash, berlaku_sampai AS sampai FROM api_kunci
     WHERE aplikasi_id = ${a.id} AND dicabut_pada IS NULL AND (berlaku_sampai IS NULL OR berlaku_sampai > ${kini})`;
  const daftarKunci = kunci.map((k) => ({ awalan: k.awalan, hash: k.hash, sampai: k.sampai }));
  const isi: IsiLisensi = sb
    ? {
        // Sandbox: v2 (mesin lama menolaknya), semua fitur yang dibagikan, 1 nomor, limit AI, berlaku sampai masa sandbox
        // (tanpa webhook perpanjangan: sandbox tidak punya alamat publik).
        v: 2,
        mode: "sandbox",
        versi_urut: i.versi,
        aplikasi_id: a.id,
        nama_aplikasi: a.nama,
        id_instalasi: instalasiId,
        status,
        fitur: [...umum.fitur],
        batas: { ...BATAS_BAWAAN, ...BATAS_TETAP_SANDBOX, ai_hari: aiSandbox(a, umumSb!) },
        biaya: "gratis",
        dibayar_sampai: null,
        kunci: daftarKunci,
        uji: a.uji_diverifikasi ? { telepon: a.uji_telepon, alamat: a.uji_alamat } : null,
        diterbitkan: kini,
        berlaku_sampai: a.sandbox_sampai ?? kini,
      }
    : {
        v: 1,
        versi_urut: i.versi,
        aplikasi_id: a.id,
        nama_aplikasi: a.nama,
        id_instalasi: instalasiId,
        status,
        fitur: a.fitur.filter((f) => umum.fitur.includes(f)),
        batas: a.batas,
        biaya: biayaEfektif(a, umum),
        dibayar_sampai: a.dibayar_sampai,
        kunci: daftarKunci,
        diterbitkan: kini,
        berlaku_sampai: kini + MASA_LISENSI_DETIK,
      };
  return { token: tandatanganiLisensi(isi, priv), isi, alamat: i.alamat, userId: a.user_id };
}

// ---------- Alamat mesin & kiriman (anti-SSRF) ----------

function ipPrivat(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const x = ip.toLowerCase();
  if (x.startsWith("::ffff:")) return ipPrivat(x.slice(7));
  return x === "::" || x === "::1" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe80") || x.startsWith("ff");
}

/** Pastikan host alamat mesin tidak menunjuk jaringan privat/lokal (kecuali mode uji LISENSI_IZINKAN_HTTP=1). */
async function periksaAlamatMesin(alamat: string): Promise<void> {
  if (process.env.LISENSI_IZINKAN_HTTP === "1") return;
  const host = new URL(alamat).hostname.replace(/^\[|\]$/g, "");
  const ip = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!ip.length) throw new ApiError("alamat_tidak_sah", "Domain alamat mesin tidak ditemukan (DNS).");
  if (ip.some((x) => ipPrivat(x.address))) throw new ApiError("alamat_tidak_sah", "Alamat mesin menunjuk ke jaringan privat/lokal.");
}

const BATAS_JAWABAN = 4096;

/** POST JSON ke mesin: tanpa ikut redirect, batas waktu 5 dtk, jawaban maks 4 KB. */
async function kirimKeMesin(alamat: string, isi: unknown): Promise<{ ok: boolean; status: number; json: unknown; galat?: string }> {
  try {
    await periksaAlamatMesin(alamat);
    const r = await fetch(alamat + JALUR_WEBHOOK_MESIN, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "ChatGerCep-Lisensi/1" },
      body: JSON.stringify(isi),
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    const teks = (await r.text()).slice(0, BATAS_JAWABAN);
    let json: unknown = null;
    try {
      json = JSON.parse(teks);
    } catch {}
    return { ok: r.ok, status: r.status, json, galat: r.ok ? undefined : `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, status: 0, json: null, galat: e instanceof ApiError ? e.message : e instanceof Error ? (e.name === "TimeoutError" ? "batas waktu 5 dtk" : e.message) : String(e) };
  }
}

// ---------- Aktivasi & cek saat mesin menyala ----------

const uuidSah = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

async function aplikasiUntukKunci(key: string): Promise<Aplikasi> {
  const k = await cariKunci(key);
  if (!k) throw new ApiError("key_tidak_sah", "API key tidak sah atau sudah dicabut.");
  const a = await aplikasiById(k.aplikasi_id);
  // Awalan key harus sesuai jenis aplikasinya (cg_test_ hanya untuk sandbox, cg_live_ hanya untuk production).
  if (!a || a.mode !== k.mode) throw new ApiError("key_tidak_sah", "API key tidak sah atau sudah dicabut.");
  if (a.mode === "sandbox") {
    if (!(await pengaturanSandbox()).aktif) throw new ApiError("sandbox_nonaktif", "Sandbox Developer API sedang dimatikan oleh ChatGerCep.");
    if (a.status === "disetujui" && (a.sandbox_sampai ?? 0) <= sekarang()) throw new ApiError("sandbox_kedaluwarsa", "Masa berlaku key sandbox habis. Perpanjang di portal Developer, lalu nyalakan ulang mesin.");
  }
  if (a.status === "dicabut") throw new ApiError("aplikasi_dicabut", "Aplikasi ini sudah dicabut.");
  if (a.status !== "disetujui" && a.status !== "ditangguhkan") throw new ApiError("key_tidak_sah", "Aplikasi belum disetujui.");
  return a;
}

/**
 * Aktivasi mesin: key sah, alamat HTTPS publik, tantangan ke alamat itu dijawab dengan benar (membuktikan server di
 * alamat itu memegang key yang sama), dan batas instalasi belum penuh. Mengembalikan token lisensi.
 */
export async function aktivasi(p: PermintaanAktivasi): Promise<string> {
  if (!uuidSah(p?.id_instalasi)) throw new ApiError("isian_tidak_sah", "id_instalasi harus UUID.");
  const a = await aplikasiUntukKunci(p.key);
  if (a.mode === "sandbox") return aktivasiSandbox(a, p);
  const alamat = rapikanAlamatMesin(String(p.alamat ?? ""));
  if (!alamat) throw new ApiError("alamat_tidak_sah", "Alamat publik mesin wajib diisi (ALAMAT_PUBLIK).");
  await periksaAlamatMesin(alamat);
  const sql = await db();
  const [ada] = await sql<{ aplikasi_id: number; dilepas_pada: number | null }[]>`SELECT aplikasi_id, dilepas_pada FROM api_instalasi WHERE id = ${p.id_instalasi}::uuid`;
  if (ada && (ada.aplikasi_id !== a.id || ada.dilepas_pada)) throw new ApiError("instalasi_penuh", "ID instalasi ini sudah dilepas atau dipakai aplikasi lain. Hapus data mesin lalu pasang ulang.");
  if (!ada) {
    const [{ n }] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM api_instalasi WHERE aplikasi_id = ${a.id} AND dilepas_pada IS NULL`;
    if (n >= a.batas.instalasi) throw new ApiError("instalasi_penuh", `Batas ${a.batas.instalasi} instalasi untuk aplikasi ini sudah penuh. Lepas instalasi lama di portal Developer.`);
  }
  const nonce = randomBytes(24).toString("base64url");
  const t = await kirimKeMesin(alamat, { jenis: "tantangan", nonce, id_instalasi: p.id_instalasi });
  const jawaban = (t.json as { jawaban?: unknown } | null)?.jawaban;
  if (!t.ok || typeof jawaban !== "string" || jawaban !== jawabTantangan(p.key.trim(), nonce)) {
    throw new ApiError("tantangan_gagal", `Server kami tidak bisa memverifikasi mesin di ${alamat} (${t.galat ?? "jawaban tantangan salah"}). Pastikan alamat bisa diakses publik lewat HTTPS dan CHATGERCEP_KEY sama.`);
  }
  const kini = sekarang();
  await transaksi(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(72727411, ${a.id})`;
    if (!ada) {
      const [{ n }] = await tx<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM api_instalasi WHERE aplikasi_id = ${a.id} AND dilepas_pada IS NULL`;
      if (n >= a.batas.instalasi) throw new ApiError("instalasi_penuh", `Batas ${a.batas.instalasi} instalasi untuk aplikasi ini sudah penuh.`);
    }
    await tx`
      INSERT INTO api_instalasi (id, aplikasi_id, alamat, versi_mesin, dibuat, terakhir_sukses)
      VALUES (${p.id_instalasi}::uuid, ${a.id}, ${alamat}, ${bersih(p.versi, 40) || null}, ${kini}, ${kini})
      ON CONFLICT (id) DO UPDATE SET alamat = EXCLUDED.alamat, versi_mesin = EXCLUDED.versi_mesin, terakhir_sukses = EXCLUDED.terakhir_sukses, gagal_sejak = NULL, galat_terakhir = NULL`;
    await tx`UPDATE api_aplikasi SET alamat_mesin = ${alamat} WHERE id = ${a.id}`;
  });
  const l = await terbitkan(p.id_instalasi);
  if (!l) throw new ApiError("aplikasi_dicabut", "Aplikasi tidak lagi berhak atas lisensi.");
  return l.token;
}

/** Cek sekali saat mesin menyala: lisensi terbaru untuk instalasi yang sudah aktif (tanpa tantangan ulang). */
export async function kondisi(p: PermintaanKondisi): Promise<string> {
  if (!uuidSah(p?.id_instalasi)) throw new ApiError("isian_tidak_sah", "id_instalasi harus UUID.");
  const a = await aplikasiUntukKunci(p.key);
  const sql = await db();
  const [i] = await sql<{ aplikasi_id: number }[]>`SELECT aplikasi_id FROM api_instalasi WHERE id = ${p.id_instalasi}::uuid AND dilepas_pada IS NULL`;
  if (!i || i.aplikasi_id !== a.id) throw new ApiError("tidak_ditemukan", "Instalasi belum diaktifkan atau sudah dilepas. Mesin akan mengaktivasi ulang.");
  await sql`UPDATE api_instalasi SET versi_mesin = ${bersih(p.versi, 40) || null}, terakhir_sukses = ${sekarang()}, gagal_sejak = NULL, galat_terakhir = NULL WHERE id = ${p.id_instalasi}::uuid`;
  const l = await terbitkan(p.id_instalasi);
  if (!l) throw new ApiError("aplikasi_dicabut", "Aplikasi tidak lagi berhak atas lisensi.");
  return l.token;
}

// ---------- Pengiriman lisensi lewat webhook ----------

/** Jadwalkan kiriman lisensi ke semua instalasi aktif aplikasi ini (segera). */
export async function jadwalkanAplikasi(aplikasiId: number): Promise<void> {
  const sql = await db();
  await sql`
    INSERT INTO api_kirim_lisensi (instalasi_id, berikut_pada)
    SELECT id, ${sekarang()} FROM api_instalasi WHERE aplikasi_id = ${aplikasiId} AND dilepas_pada IS NULL AND alamat IS NOT NULL
    ON CONFLICT (instalasi_id) DO UPDATE SET berikut_pada = EXCLUDED.berikut_pada, coba = 0, galat = NULL`;
  pantik();
}

async function jadwalkanSemua(): Promise<void> {
  const sql = await db();
  await sql`
    INSERT INTO api_kirim_lisensi (instalasi_id, berikut_pada)
    SELECT i.id, ${sekarang()} FROM api_instalasi i JOIN api_aplikasi a ON a.id = i.aplikasi_id
     WHERE i.dilepas_pada IS NULL AND i.alamat IS NOT NULL AND a.status IN ('disetujui', 'ditangguhkan', 'dicabut')
    ON CONFLICT (instalasi_id) DO UPDATE SET berikut_pada = EXCLUDED.berikut_pada, coba = 0, galat = NULL`;
  pantik();
}

/** Jeda coba ulang (detik) per percobaan gagal; setelah habis, tiap 6 jam sampai berhasil. */
export const JEDA_COBA = [10, 60, 300, 1800, 7200] as const;
const jedaCoba = (coba: number): number => JEDA_COBA[coba - 1] ?? 21_600;
const PARALEL_KIRIM = 8;
const BATAS_PUTARAN = 50;

const gk = globalThis as unknown as { __waDevApi?: { janji: Promise<number> | null; lagi: boolean; timer: NodeJS.Timeout | null; jam: NodeJS.Timeout | null } };
const st = (gk.__waDevApi ??= { janji: null, lagi: false, timer: null, jam: null });

/** Picu putaran kirim secepatnya (tanpa menunggu interval). */
function pantik(): void {
  if (!lisensiSiap() || modeMesin()) return;
  setImmediate(() => void putaranKirim().catch((e) => console.warn("[devapi] putaran kirim gagal:", e instanceof Error ? e.message : e)));
}

/**
 * Satu putaran: ambil antrean yang jatuh tempo (indeks berikut_pada), kirim paralel terbatas. Hanya satu putaran
 * berjalan pada satu waktu; pemanggil saat putaran berjalan ikut menunggu putaran itu (yang mengulang sekali lagi
 * supaya perubahan yang baru masuk ikut terkirim). Mengembalikan jumlah terkirim.
 */
export function putaranKirim(): Promise<number> {
  if (st.janji) {
    st.lagi = true;
    return st.janji;
  }
  st.janji = jalankanPutaran().finally(() => {
    st.janji = null;
  });
  return st.janji;
}

async function jalankanPutaran(): Promise<number> {
  let terkirim = 0;
  {
    do {
      st.lagi = false;
      const sql = await db();
      const kini = sekarang();
      const antre = await sql<{ instalasi_id: string; coba: number }[]>`
        SELECT instalasi_id, coba FROM api_kirim_lisensi WHERE berikut_pada <= ${kini} ORDER BY berikut_pada LIMIT ${BATAS_PUTARAN}`;
      for (let i = 0; i < antre.length; i += PARALEL_KIRIM) {
        const hasil = await Promise.all(antre.slice(i, i + PARALEL_KIRIM).map((r) => kirimSatu(r.instalasi_id, r.coba)));
        terkirim += hasil.filter(Boolean).length;
      }
      if (antre.length === BATAS_PUTARAN) st.lagi = true;
    } while (st.lagi);
  }
  return terkirim;
}

async function kirimSatu(instalasiId: string, coba: number): Promise<boolean> {
  const sql = await db();
  const kini = sekarang();
  let l: Awaited<ReturnType<typeof terbitkan>>;
  try {
    l = await terbitkan(instalasiId);
  } catch (e) {
    await sql`UPDATE api_kirim_lisensi SET coba = coba + 1, berikut_pada = ${kini + jedaCoba(coba + 1)}, galat = ${e instanceof Error ? e.message : String(e)} WHERE instalasi_id = ${instalasiId}::uuid`;
    return false;
  }
  if (!l || !l.alamat) {
    await sql`DELETE FROM api_kirim_lisensi WHERE instalasi_id = ${instalasiId}::uuid`;
    return false;
  }
  const r = await kirimKeMesin(l.alamat, { jenis: "lisensi", lisensi: l.token });
  const j = r.json as Partial<JawabanLisensiMesin> | null;
  if (r.ok && j && typeof j.versi_urut_diterima === "number") {
    await sql.begin(async (tx) => {
      await tx`DELETE FROM api_kirim_lisensi WHERE instalasi_id = ${instalasiId}::uuid`;
      await tx`
        UPDATE api_instalasi SET terakhir_sukses = ${kini}, gagal_sejak = NULL, galat_terakhir = NULL, diperingatkan = NULL,
               versi_diterima = ${Math.trunc(j.versi_urut_diterima ?? 0)}, versi_mesin = ${bersih(j.versi_mesin, 40) || null},
               jumlah_nomor = ${Math.max(0, Math.min(100_000, Math.trunc(Number(j.jumlah_nomor) || 0)))}
         WHERE id = ${instalasiId}::uuid`;
    });
    return true;
  }
  const galat = r.galat ?? "jawaban mesin tidak dikenal";
  const [i] = await sql<{ gagal_sejak: number | null; diperingatkan: number | null }[]>`
    UPDATE api_instalasi SET gagal_sejak = COALESCE(gagal_sejak, ${kini}), galat_terakhir = ${galat} WHERE id = ${instalasiId}::uuid
    RETURNING gagal_sejak, diperingatkan`;
  await sql`UPDATE api_kirim_lisensi SET coba = coba + 1, berikut_pada = ${kini + jedaCoba(coba + 1)}, galat = ${galat} WHERE instalasi_id = ${instalasiId}::uuid`;
  if (i?.gagal_sejak && kini - i.gagal_sejak >= 24 * 3600 && !i.diperingatkan) {
    await sql`UPDATE api_instalasi SET diperingatkan = ${kini} WHERE id = ${instalasiId}::uuid`;
    await kirimNotif(l.userId, {
      jenis: "developer_api",
      judul: { id: `Mesin "${l.isi.nama_aplikasi}" tidak bisa dihubungi`, en: `Engine "${l.isi.nama_aplikasi}" is unreachable` },
      isi: {
        id: `Perpanjangan lisensi gagal dikirim ke ${l.alamat} sejak 24 jam lalu (${galat}). Tanpa perpanjangan, mesin berhenti melayani saat lisensi habis (koneksi WhatsApp tetap tersambung).`,
        en: `License renewals to ${l.alamat} have failed for 24 hours (${galat}). Without a renewal the engine stops serving when the license expires (WhatsApp stays connected).`,
      },
      tautan: `/developer/${l.isi.aplikasi_id}`,
    });
  }
  return false;
}

/**
 * Tiap jam: jadwalkan perpanjangan untuk instalasi yang terakhir sukses > 3 hari lalu, kirim ulang lisensi aplikasi
 * berbayar yang masa bayarnya baru habis (status jadi belum_bayar), dan pengingat bayar H-3 / H-1 / habis.
 */
export async function putaranJam(kini = sekarang()): Promise<void> {
  const sql = await db();
  await sql`
    INSERT INTO api_kirim_lisensi (instalasi_id, berikut_pada)
    SELECT i.id, ${kini} FROM api_instalasi i JOIN api_aplikasi a ON a.id = i.aplikasi_id
     WHERE i.dilepas_pada IS NULL AND i.alamat IS NOT NULL AND a.status IN ('disetujui', 'ditangguhkan', 'dicabut')
       AND (i.terakhir_sukses IS NULL OR i.terakhir_sukses < ${kini - JEDA_PERPANJANG_DETIK})
    ON CONFLICT (instalasi_id) DO NOTHING`;
  const umum = await pengaturanApi();
  const bayar = await sql<{ id: number; user_id: number; nama: string; biaya: BiayaAplikasi; dibayar_sampai: number | null; pengingat_bayar: string | null }[]>`
    SELECT id, user_id, nama, biaya, dibayar_sampai, pengingat_bayar FROM api_aplikasi
     WHERE status = 'disetujui' AND dibayar_sampai IS NOT NULL AND dibayar_sampai < ${kini + 3 * 86_400} AND dibayar_sampai > ${kini - 2 * 86_400}`;
  for (const a of bayar) {
    if (biayaEfektif(a, umum) !== "berbayar" || a.dibayar_sampai === null) continue;
    const sisa = a.dibayar_sampai - kini;
    const tahap = sisa <= 0 ? "habis" : sisa <= 86_400 ? "h1" : "h3";
    const kunci = `${a.dibayar_sampai}:${tahap}`;
    if (a.pengingat_bayar === kunci) continue;
    await sql`UPDATE api_aplikasi SET pengingat_bayar = ${kunci} WHERE id = ${a.id}`;
    if (tahap === "habis") await jadwalkanAplikasi(a.id);
    await kirimNotif(a.user_id, {
      jenis: "developer_api",
      judul:
        tahap === "habis"
          ? { id: `Masa bayar "${a.nama}" habis`, en: `"${a.nama}" payment period ended` }
          : { id: `Masa bayar "${a.nama}" berakhir ${tahap === "h1" ? "besok" : "dalam 3 hari"}`, en: `"${a.nama}" payment period ends ${tahap === "h1" ? "tomorrow" : "in 3 days"}` },
      isi: {
        id: tahap === "habis" ? "Mesin akan berhenti melayani API & bot sampai pembayaran diterima (WhatsApp tetap tersambung)." : "Bayar sekarang supaya mesin tetap melayani tanpa jeda.",
        en: tahap === "habis" ? "The engine stops serving the API & bot until payment is received (WhatsApp stays connected)." : "Pay now so the engine keeps serving without interruption.",
      },
      tautan: `/developer/${a.id}`,
    });
  }
  await putaranKirim();
}

/** Pekerja latar di server pusat (hanya bila penerbit lisensi dipasang; tidak berjalan di mesin). */
export function mulaiDeveloperApi(): void {
  if (modeMesin() || !lisensiSiap() || st.timer) return;
  st.timer = setInterval(() => void putaranKirim().catch((e) => console.warn("[devapi] kirim:", e instanceof Error ? e.message : e)), 10_000);
  st.jam = setInterval(() => void putaranJam().catch((e) => console.warn("[devapi] putaran jam:", e instanceof Error ? e.message : e)), 3_600_000);
  st.timer.unref?.();
  st.jam.unref?.();
  setTimeout(() => void putaranJam().catch(() => {}), 30_000).unref?.();
}

// ---------- Sandbox ----------

export interface PengaturanSandbox {
  /** Sakelar umum: mati = tidak bisa membuat/mengaktifkan sandbox dan mesin sandbox masuk mode terbatas saat menyala. */
  aktif: boolean;
  /** Masa berlaku key sandbox (hari) saat dibuat / diperpanjang. */
  hari: number;
  /** Limit balasan AI per hari bawaan untuk sandbox tanpa limit khusus. */
  ai_hari: number;
}

const dalamRentang = (v: unknown, r: { min: number; maks: number }, bawaan: number): number => {
  const n = Number(v);
  return Number.isInteger(n) && n >= r.min && n <= r.maks ? n : bawaan;
};

export async function pengaturanSandbox(): Promise<PengaturanSandbox> {
  const [a, h, ai] = await Promise.all([getSetting("api_sandbox_aktif"), getSetting("api_sandbox_hari"), getSetting("api_sandbox_ai_hari")]);
  return {
    aktif: a !== "0",
    hari: dalamRentang(h, RENTANG_SANDBOX.hari, SANDBOX_HARI_BAWAAN),
    ai_hari: dalamRentang(ai, RENTANG_SANDBOX.ai_hari, SANDBOX_AI_BAWAAN),
  };
}

/** Limit AI sandbox: limit khusus (batas.ai_hari > 0) atau bawaan umum. */
export const aiSandbox = (a: Pick<Aplikasi, "batas">, umum: PengaturanSandbox): number => (a.batas.ai_hari > 0 ? a.batas.ai_hari : umum.ai_hari);

/** Simpan pengaturan umum sandbox. Tidak mengirim apa pun ke mesin (sandbox tanpa webhook): berlaku saat mesin menyala. */
export async function simpanPengaturanSandbox(pelaku: User, p: PengaturanSandbox): Promise<void> {
  const hari = dalamRentang(p.hari, RENTANG_SANDBOX.hari, -1);
  const ai = dalamRentang(p.ai_hari, RENTANG_SANDBOX.ai_hari, -1);
  if (hari < 0) throw new ApiError("isian_tidak_sah", `Masa key sandbox harus ${RENTANG_SANDBOX.hari.min}–${RENTANG_SANDBOX.hari.maks} hari.`);
  if (ai < 0) throw new ApiError("isian_tidak_sah", `Limit AI harus ${RENTANG_SANDBOX.ai_hari.min}–${RENTANG_SANDBOX.ai_hari.maks.toLocaleString("id-ID")} balasan per hari.`);
  await setSetting("api_sandbox_aktif", p.aktif ? "1" : "0");
  await setSetting("api_sandbox_hari", String(hari));
  await setSetting("api_sandbox_ai_hari", String(ai));
  await catatLog(pelaku, "ubah pengaturan sandbox API", null, `${p.aktif ? "nyala" : "mati"}, masa ${hari} hari, limit AI ${ai}/hari`);
}

/** Sandbox milik akun ini (paling banyak satu), lewat indeks unik parsial. */
export async function sandboxMilik(userId: number): Promise<Aplikasi | undefined> {
  const sql = await db();
  const [a] = await sql<Aplikasi[]>`SELECT ${sql.unsafe(KOLOM_APLIKASI)} FROM api_aplikasi a WHERE a.user_id = ${userId} AND a.mode = 'sandbox'`;
  return a && rapikan(a);
}

/**
 * Buat sandbox (bila belum ada) + key `cg_test_` baru (tampil SEKALI). Sandbox yang sudah ada: key diganti (lama
 * langsung mati). Langsung aktif tanpa peninjauan; hanya akun yang punya akses portal (dicek pemanggil).
 */
export async function buatSandbox(user: User): Promise<{ id: number; key: string; baru: boolean }> {
  const umum = await pengaturanSandbox();
  if (!umum.aktif) throw new ApiError("sandbox_nonaktif", "Sandbox sedang dimatikan oleh ChatGerCep.");
  const kini = sekarang();
  const { id, baru } = await transaksi(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(72727413, ${user.id})`;
    const [ada] = await tx<{ id: number; status: StatusAplikasi }[]>`SELECT id, status FROM api_aplikasi WHERE user_id = ${user.id} AND mode = 'sandbox'`;
    if (ada) {
      if (ada.status === "dicabut") throw new ApiError("aplikasi_dicabut", "Sandbox akun ini sudah dicabut. Hubungi ChatGerCep.");
      return { id: ada.id, baru: false };
    }
    const [r] = await tx<{ id: number }[]>`
      INSERT INTO api_aplikasi (user_id, mode, nama, kegunaan, pemilik, kontak_wa, status, biaya, batas, sandbox_sampai, ditinjau_pada, created_at)
      VALUES (${user.id}, 'sandbox', 'Sandbox', 'Mencoba Developer API sebelum production', ${bersih(user.nama || user.email, 120)}, '', 'disetujui',
              'gratis', ${tx.json({})}, ${kini + umum.hari * 86_400}, ${kini}, ${kini})
      RETURNING id`;
    return { id: r.id, baru: true };
  });
  const { key } = await buatKunci(user, id);
  return { id, key, baru };
}

/** Perpanjang masa sandbox ke kini + masa umum. Mesin menerimanya saat menyala / Perbarui lisensi. */
export async function perpanjangSandbox(user: User): Promise<number> {
  const umum = await pengaturanSandbox();
  if (!umum.aktif) throw new ApiError("sandbox_nonaktif", "Sandbox sedang dimatikan oleh ChatGerCep.");
  const sampai = sekarang() + umum.hari * 86_400;
  const sql = await db();
  const r = await sql`
    UPDATE api_aplikasi SET sandbox_sampai = ${sampai}, versi_lisensi = versi_lisensi + 1
     WHERE user_id = ${user.id} AND mode = 'sandbox' AND status IN ('disetujui', 'ditangguhkan') RETURNING id`;
  if (!r.length) throw new ApiError("tidak_ditemukan", "Sandbox tidak ditemukan.");
  return sampai;
}

const hashKode = (aplikasiId: number, kode: string): string => createHash("sha256").update(`cg-uji:${aplikasiId}:${kode}`).digest("hex");
const MAKS_COBA_KODE = 5;

/**
 * Mulai daftarkan / ganti nomor uji: kode 6 angka berlaku 10 menit (hanya hash yang disimpan). Pemilik HP yang akan
 * menjadi nomor uji mengirim WA "UJI <kode>" ke nomor sandbox; mesin meneruskannya ke verifikasiNomorUji.
 */
export async function mulaiNomorUji(user: User): Promise<{ kode: string; sampai: number }> {
  const kode = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const sampai = sekarang() + MASA_KODE_UJI_DETIK;
  const sql = await db();
  const [a] = await sql<{ id: number }[]>`SELECT id FROM api_aplikasi WHERE user_id = ${user.id} AND mode = 'sandbox' AND status = 'disetujui'`;
  if (!a) throw new ApiError("tidak_ditemukan", "Buat key sandbox dulu.");
  await sql`UPDATE api_aplikasi SET uji_kode_hash = ${hashKode(a.id, kode)}, uji_kode_sampai = ${sampai}, uji_kode_coba = 0 WHERE id = ${a.id}`;
  return { kode, sampai };
}

const teleponSah = (v: unknown): string | null => {
  const d = String(v ?? "").replace(/\D/g, "");
  return /^[1-9][0-9]{7,14}$/.test(d) ? d : null;
};
const alamatWaSah = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return /^[0-9:]{5,40}@(s\.whatsapp\.net|lid)$/.test(s) ? s : null;
};

/**
 * Mesin sandbox menerima "UJI <kode>": cocokkan kode, simpan nomor uji (menggantikan yang lama), lalu kembalikan lisensi
 * baru di jawaban (sandbox tanpa webhook). Kode sekali pakai; maks 5 percobaan salah per kode.
 */
export async function verifikasiNomorUji(p: PermintaanNomorUji): Promise<string> {
  if (!uuidSah(p?.id_instalasi)) throw new ApiError("isian_tidak_sah", "id_instalasi harus UUID.");
  const kode = String(p.kode ?? "").trim();
  if (!/^\d{6}$/.test(kode)) throw new ApiError("isian_tidak_sah", "Kode harus 6 angka.");
  const telepon = teleponSah(p.telepon);
  const alamat = alamatWaSah(p.alamat);
  if (!telepon && !alamat) throw new ApiError("isian_tidak_sah", "Nomor pengirim tidak dikenali.");
  const a = await aplikasiUntukKunci(p.key);
  if (a.mode !== "sandbox") throw new ApiError("isian_tidak_sah", "Nomor uji hanya untuk key sandbox.");
  if (a.status !== "disetujui") throw new ApiError("aplikasi_ditangguhkan", "Sandbox ini sedang ditangguhkan.");
  const kini = sekarang();
  const ok = await transaksi(async (tx) => {
    const [i] = await tx<{ aplikasi_id: number }[]>`SELECT aplikasi_id FROM api_instalasi WHERE id = ${p.id_instalasi}::uuid AND dilepas_pada IS NULL`;
    if (!i || i.aplikasi_id !== a.id) throw new ApiError("tidak_ditemukan", "Instalasi belum diaktifkan atau sudah dilepas.");
    const [r] = await tx<{ uji_kode_hash: string | null; uji_kode_sampai: number | null; uji_kode_coba: number }[]>`
      SELECT uji_kode_hash, uji_kode_sampai, uji_kode_coba FROM api_aplikasi WHERE id = ${a.id} FOR UPDATE`;
    if (!r.uji_kode_hash || (r.uji_kode_sampai ?? 0) <= kini || r.uji_kode_coba >= MAKS_COBA_KODE) return false;
    const x = Buffer.from(hashKode(a.id, kode), "hex");
    const y = Buffer.from(r.uji_kode_hash, "hex");
    if (x.length !== y.length || !timingSafeEqual(x, y)) {
      await tx`UPDATE api_aplikasi SET uji_kode_coba = uji_kode_coba + 1 WHERE id = ${a.id}`;
      return false;
    }
    await tx`
      UPDATE api_aplikasi SET uji_telepon = ${telepon}, uji_alamat = ${alamat}, uji_diverifikasi = ${kini},
             uji_kode_hash = NULL, uji_kode_sampai = NULL, uji_kode_coba = 0
       WHERE id = ${a.id}`;
    await tx`UPDATE api_instalasi SET versi_mesin = ${bersih(p.versi, 40) || null}, terakhir_sukses = ${kini} WHERE id = ${p.id_instalasi}::uuid`;
    return true;
  });
  if (!ok) throw new ApiError("isian_tidak_sah", "Kode salah atau sudah habis. Buat kode baru di portal Developer.");
  const l = await terbitkan(p.id_instalasi);
  if (!l) throw new ApiError("aplikasi_dicabut", "Sandbox tidak lagi berhak atas lisensi.");
  return l.token;
}

/**
 * Aktivasi mesin sandbox: tanpa alamat publik & tanpa tantangan (sandbox boleh di laptop). Satu instalasi aktif: mesin
 * sandbox lain milik key ini dilepas otomatis (mis. pindah dari laptop ke server uji).
 */
async function aktivasiSandbox(a: Aplikasi, p: PermintaanAktivasi): Promise<string> {
  if (a.status !== "disetujui") throw new ApiError("aplikasi_ditangguhkan", "Sandbox ini sedang ditangguhkan.");
  const kini = sekarang();
  await transaksi(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(72727411, ${a.id})`;
    const [ada] = await tx<{ aplikasi_id: number; dilepas_pada: number | null }[]>`SELECT aplikasi_id, dilepas_pada FROM api_instalasi WHERE id = ${p.id_instalasi}::uuid`;
    if (ada && (ada.aplikasi_id !== a.id || ada.dilepas_pada)) throw new ApiError("instalasi_penuh", "ID instalasi ini sudah dilepas atau dipakai aplikasi lain. Hapus data mesin lalu pasang ulang.");
    await tx`UPDATE api_instalasi SET dilepas_pada = ${kini} WHERE aplikasi_id = ${a.id} AND dilepas_pada IS NULL AND id <> ${p.id_instalasi}::uuid`;
    await tx`
      INSERT INTO api_instalasi (id, aplikasi_id, alamat, versi_mesin, dibuat, terakhir_sukses)
      VALUES (${p.id_instalasi}::uuid, ${a.id}, NULL, ${bersih(p.versi, 40) || null}, ${kini}, ${kini})
      ON CONFLICT (id) DO UPDATE SET versi_mesin = EXCLUDED.versi_mesin, terakhir_sukses = EXCLUDED.terakhir_sukses`;
  });
  const l = await terbitkan(p.id_instalasi);
  if (!l) throw new ApiError("aplikasi_dicabut", "Sandbox tidak lagi berhak atas lisensi.");
  return l.token;
}

export interface SandboxPanel {
  id: number;
  user_id: number;
  email: string;
  nama_akun: string;
  status: StatusAplikasi;
  sandbox_sampai: number | null;
  uji_telepon: string | null;
  uji_alamat: string | null;
  uji_diverifikasi: number | null;
  ai_khusus: number;
  terakhir_menyala: number | null;
  versi_mesin: string | null;
  created_at: number;
}

/** Daftar sandbox untuk panel developer internal: indeks parsial api_aplikasi_sandbox_idx, kursor id, tanpa OFFSET. */
export async function daftarSandbox(o: { cari?: string; setelah?: number; batas?: number } = {}): Promise<{ daftar: SandboxPanel[]; adaLagi: boolean; jumlah: number }> {
  const sql = await db();
  const batas = Math.min(Math.max(o.batas ?? 50, 1), 100);
  const cari = (o.cari ?? "").trim().toLowerCase().slice(0, 100);
  const pola = `%${cari.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const kursor = o.setelah ?? null;
  const [baris, [{ n }]] = await Promise.all([
    sql<SandboxPanel[]>`
      SELECT a.id, a.user_id, u.email, u.nama AS nama_akun, a.status, a.sandbox_sampai, a.uji_telepon, a.uji_alamat, a.uji_diverifikasi,
             COALESCE((a.batas->>'ai_hari')::int, 0) AS ai_khusus, i.terakhir_sukses AS terakhir_menyala, i.versi_mesin, a.created_at
        FROM api_aplikasi a
        JOIN users u ON u.id = a.user_id
        LEFT JOIN LATERAL (
          SELECT terakhir_sukses, versi_mesin FROM api_instalasi WHERE aplikasi_id = a.id AND dilepas_pada IS NULL ORDER BY dibuat DESC LIMIT 1
        ) i ON true
       WHERE a.mode = 'sandbox' AND (${kursor}::integer IS NULL OR a.id < ${kursor}::integer)
         ${cari ? sql`AND (u.email LIKE ${pola} OR lower(u.nama) LIKE ${pola})` : sql``}
       ORDER BY a.id DESC LIMIT ${batas + 1}`,
    sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM api_aplikasi WHERE mode = 'sandbox'`,
  ]);
  return { daftar: baris.slice(0, batas), adaLagi: baris.length > batas, jumlah: n };
}

/**
 * Developer internal: ubah limit AI khusus (0 = ikut bawaan) dan/atau perpanjang masa sandbox satu akun. Berlaku di
 * mesin saat menyala / Perbarui lisensi (sandbox tanpa webhook).
 */
export async function ubahSandbox(pelaku: User, id: number, u: { ai_hari?: number; perpanjang?: boolean }): Promise<void> {
  const umum = await pengaturanSandbox();
  let ai: number | undefined;
  if (u.ai_hari !== undefined) {
    ai = Number(u.ai_hari);
    if (!(Number.isInteger(ai) && (ai === 0 || (ai >= RENTANG_SANDBOX.ai_hari.min && ai <= RENTANG_SANDBOX.ai_hari.maks))))
      throw new ApiError("isian_tidak_sah", `Limit AI harus 0 (ikut bawaan) atau ${RENTANG_SANDBOX.ai_hari.min}–${RENTANG_SANDBOX.ai_hari.maks.toLocaleString("id-ID")}.`);
  }
  const a = await transaksi(async (tx) => {
    const a = await wajibAplikasi(tx, id, "sandbox");
    const batas = ai === undefined ? a.batas : { ...a.batas, ai_hari: ai };
    const sampai = u.perpanjang ? sekarang() + umum.hari * 86_400 : a.sandbox_sampai;
    await tx`UPDATE api_aplikasi SET batas = ${tx.json({ ai_hari: batas.ai_hari })}, sandbox_sampai = ${sampai}, versi_lisensi = versi_lisensi + 1 WHERE id = ${id}`;
    return a;
  });
  await catatLog(pelaku, "ubah sandbox API", a.email, `${ai !== undefined ? `limit AI ${ai || `bawaan (${umum.ai_hari})`}/hari` : ""}${u.perpanjang ? `${ai !== undefined ? " · " : ""}diperpanjang ${umum.hari} hari` : ""}`);
}

// ---------- Penagihan aplikasi berbayar ----------

export const HARI_PER_BAYAR = 30;
const KUNCI_BAYAR_API = 72727412;

/**
 * Buat tagihan 30 hari untuk aplikasi berbayar milik akun ini (lewat provider kanal pilihan). Tagihan menunggu dengan
 * aplikasi, kanal, dan nominal yang sama dipakai ulang. Setelah lunas, terapkanStatus (langganan.ts) memanggil
 * perpanjangDibayar, lalu lisensi baru dikirim ke mesin.
 */
export async function mulaiBayarApi(g: AdapterGateway, user: User, aplikasiId: number, kanal: KanalBayar, asalApp: string): Promise<{ orderId: string; baru: boolean }> {
  const a = await aplikasiMilikById(user.id, aplikasiId);
  if (!a || (a.status !== "disetujui" && a.status !== "ditangguhkan")) throw new GatewayError("Aplikasi tidak ditemukan atau belum disetujui.");
  const umum = await pengaturanApi();
  if (biayaEfektif(a, umum) !== "berbayar") throw new GatewayError("Aplikasi ini gratis, tidak perlu dibayar.");
  const harga = hargaEfektif(a, umum);
  if (harga < 1000) throw new GatewayError("Harga aplikasi belum diatur. Hubungi admin.");
  return transaksi(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${KUNCI_BAYAR_API}, ${user.id})`;
    const kini = sekarang();
    const [sama] = await tx<{ order_id: string }[]>`
      SELECT order_id FROM transaksi
       WHERE user_id = ${user.id} AND api_aplikasi_id = ${a.id} AND status = 'menunggu' AND kanal = ${kanal} AND jumlah = ${harga}
         AND gateway = ${g.nama} AND kedaluwarsa > ${kini + 120}
       ORDER BY dibuat DESC LIMIT 1`;
    if (sama) return { orderId: sama.order_id, baru: false };
    // Awalan WA- sama dengan tagihan paket: webhook provider & halaman tagihan mengenali formatnya; jenisnya dibedakan kolom api_aplikasi_id.
    const orderId = `WA-${user.id}-${kini}-${randomBytes(3).toString("hex")}`;
    const nama = `Developer API ${a.nama} (${HARI_PER_BAYAR} hari)`;
    const c = await g.buatCharge({
      orderId,
      jumlah: harga,
      kanal,
      item: { id: `API-${a.id}`, nama },
      pelanggan: { nama: user.nama || user.email.split("@")[0], email: user.email },
      asalApp,
    });
    await tx`
      INSERT INTO transaksi (order_id, user_id, paket_id, nama_paket, jumlah, status, kanal, bayar, kedaluwarsa, dibuat, gateway, gateway_ref, api_aplikasi_id)
      VALUES (${orderId}, ${user.id}, NULL, ${nama}, ${harga}, 'menunggu', ${kanal}, ${tx.json(c.bayar as Record<string, string | undefined>)}, ${c.kedaluwarsa}, ${kini}, ${g.nama}, ${c.ref}, ${a.id})`;
    return { orderId, baru: true };
  });
}

/** Dipanggil di dalam transaksi terapkanStatus saat tagihan API lunas: masa bayar diperpanjang 30 hari dari yang lebih akhir. */
export async function perpanjangDibayar(tx: Tx, aplikasiId: number, kini = sekarang()): Promise<void> {
  await tx`
    UPDATE api_aplikasi SET dibayar_sampai = GREATEST(COALESCE(dibayar_sampai, 0), ${kini}) + ${HARI_PER_BAYAR * 86_400},
           pengingat_bayar = NULL, versi_lisensi = versi_lisensi + 1
     WHERE id = ${aplikasiId}`;
}

/** Sesudah transaksi lunas di-commit: kirim lisensi baru + notifikasi. */
export async function setelahDibayar(aplikasiId: number): Promise<void> {
  const a = await aplikasiById(aplikasiId);
  if (!a) return;
  await jadwalkanAplikasi(aplikasiId);
  await kirimNotif(a.user_id, {
    jenis: "developer_api",
    judul: { id: `Pembayaran "${a.nama}" diterima`, en: `Payment for "${a.nama}" received` },
    isi: { id: `Aktif sampai ${new Date((a.dibayar_sampai ?? 0) * 1000).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric" })}.`, en: "Your engine license has been renewed." },
    tautan: `/developer/${aplikasiId}`,
  });
  await kirimNotifDeveloper({ jenis: "admin_bayar", judul: { id: `Pembayaran Developer API: ${a.nama}`, en: `Developer API payment: ${a.nama}` }, tautan: `/admin/developer-api/${aplikasiId}` });
}

export const idInstalasiBaru = (): string => randomUUID();
export { BATAS_BAWAAN };

/** Aplikasi Developer API yang ditagih transaksi ini (halaman tagihan); null = transaksi paket biasa / bukan milik akun ini. */
export async function aplikasiTransaksi(userId: number, orderId: string): Promise<number | null> {
  const sql = await db();
  const [r] = await sql<{ api_aplikasi_id: number | null }[]>`SELECT api_aplikasi_id FROM transaksi WHERE order_id = ${orderId} AND user_id = ${userId}`;
  return r?.api_aplikasi_id ?? null;
}
