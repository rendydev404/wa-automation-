import "server-only";
import { randomBytes } from "node:crypto";
import { type Tx, db, getSetting, sekarang, transaksi as transaksiDb } from "./db";
import { MODEL_BAWAAN, type Penyedia, kunciAnthropic, kursUsd, pengaturanAi, perkiraanPerBalasan } from "./ai";
import { type KanalBayar, METODE_BAYAR, type MetodeBayar, TAMBAHAN_BIAYA_BALASAN, hitungHarga, kuotaDariHarga, nomorDariKuota } from "./harga";
import { hermesTerkonfigurasi } from "./hermes";
import { type InstruksiBayar, type KonfigMidtrans, MidtransError, type StatusBayar, batalkanCharge, buatCharge, petaStatus, statusMidtrans } from "./midtrans";
import { KODE_CUSTOM } from "./paket-custom-def";
import { type JenisKomisi, prosesKomisiTransaksi } from "./afiliasi";
import { kirimCapiEvent } from "./meta-pixel";

/**
 * Paket langganan, masa aktif, transaksi Midtrans, dan kuota.
 *   - Paket dikelola admin (harga, durasi, kuota nomor, kuota balasan AI). Langganan menyimpan SALINAN kuota saat
 *     dibeli, jadi admin mengubah paket tidak mengubah hak pelanggan yang sedang aktif.
 *   - Kuota balasan AI dihitung dari ai_pakai milik semua nomor pengguna dalam periode berjalan:
 *     periode langganan aktif, atau bulan kalender WIB untuk akun tanpa langganan (kuota gratis).
 *   - Admin tanpa batas. Kuota nomor yang diisi admin per akun (users.kuota_nomor) mengalahkan paket.
 */

export interface Paket {
  id: number;
  kode: string;
  nama: string;
  harga: number; // Rupiah
  durasi_hari: number;
  kuota_nomor: number;
  kuota_balasan: number;
  deskripsi: string;
  aktif: boolean;
  unggulan: boolean;
  urutan: number;
  komisi_jenis: JenisKomisi;
  komisi_nilai: number;
}

const KOLOM_PAKET = "id, kode, nama, harga, durasi_hari, kuota_nomor, kuota_balasan, deskripsi, aktif, unggulan, urutan, komisi_jenis, komisi_nilai";

/**
 * Paket biasa. Baris cermin paket Custom (paket-custom.ts) tidak ikut, karena kartunya diatur sendiri; `custom: true`
 * mengikutkannya (mis. daftar "Berikan paket" di halaman pengguna).
 */
export async function daftarPaket(opsi: { semua?: boolean; custom?: boolean } = {}): Promise<Paket[]> {
  const sql = await db();
  return [
    ...(await sql<Paket[]>`
      SELECT ${sql.unsafe(KOLOM_PAKET)} FROM paket
       WHERE ${opsi.semua ? sql`true` : sql`aktif`} AND ${opsi.custom ? sql`true` : sql`kode <> ${KODE_CUSTOM}`}
       ORDER BY urutan, harga, id`),
  ];
}

export async function paketById(id: number): Promise<Paket | undefined> {
  const sql = await db();
  const [p] = await sql<Paket[]>`SELECT ${sql.unsafe(KOLOM_PAKET)} FROM paket WHERE id = ${id}`;
  return p;
}

export async function simpanPaket(p: Omit<Paket, "id" | "komisi_jenis" | "komisi_nilai"> & { id?: number; komisi_jenis?: JenisKomisi; komisi_nilai?: number }): Promise<number> {
  const komisiJenis: JenisKomisi = p.komisi_jenis === "rupiah" ? "rupiah" : "persen";
  const komisiNilai = Number.isInteger(p.komisi_nilai) && (p.komisi_nilai ?? 0) >= 0 ? (p.komisi_nilai as number) : 20;
  const sql = await db();
  if (p.id) {
    // Baris paket Custom hanya diubah lewat paket-custom.ts (isinya cermin pengaturan Custom).
    await sql`
      UPDATE paket SET nama = ${p.nama}, harga = ${p.harga}, durasi_hari = ${p.durasi_hari}, kuota_nomor = ${p.kuota_nomor},
             kuota_balasan = ${p.kuota_balasan}, deskripsi = ${p.deskripsi}, aktif = ${p.aktif}, unggulan = ${p.unggulan}, urutan = ${p.urutan},
             komisi_jenis = ${komisiJenis}, komisi_nilai = ${komisiNilai}
       WHERE id = ${p.id} AND kode <> ${KODE_CUSTOM}`;
    return p.id;
  }
  const [r] = await sql<{ id: number }[]>`
    INSERT INTO paket(kode, nama, harga, durasi_hari, kuota_nomor, kuota_balasan, deskripsi, aktif, unggulan, urutan, komisi_jenis, komisi_nilai, created_at)
    VALUES (${p.kode}, ${p.nama}, ${p.harga}, ${p.durasi_hari}, ${p.kuota_nomor}, ${p.kuota_balasan}, ${p.deskripsi}, ${p.aktif}, ${p.unggulan}, ${p.urutan}, ${komisiJenis}, ${komisiNilai}, ${sekarang()})
    RETURNING id`;
  return r.id;
}

export async function hapusPaket(id: number): Promise<Paket | undefined> {
  const sql = await db();
  const [p] = await sql<Paket[]>`
    DELETE FROM paket WHERE id = ${id} AND kode <> ${KODE_CUSTOM}
    RETURNING ${sql.unsafe(KOLOM_PAKET)}`;
  return p;
}

// ---------- Langganan & hak akun ----------

export interface Langganan {
  id: number;
  user_id: number;
  paket_id: number | null;
  nama_paket: string;
  mulai: number;
  sampai: number;
  kuota_nomor: number;
  kuota_balasan: number;
  sumber: "midtrans" | "admin";
}

export async function langgananAktif(userId: number): Promise<Langganan | undefined> {
  const sql = await db();
  const [l] = await sql<Langganan[]>`
    SELECT id, user_id, paket_id, nama_paket, mulai, sampai, kuota_nomor, kuota_balasan, sumber
      FROM langganan WHERE user_id = ${userId} AND sampai > ${sekarang()}
     ORDER BY sampai DESC, id DESC LIMIT 1`;
  return l;
}

/** Bilangan bulat >= 0 dari pengaturan; belum diisi (null) = bawaan. Number(null) = 0, jadi null harus dicek dulu. */
const angkaSetting = (nilai: string | null, bawaan: number): number => {
  const v = nilai === null || nilai.trim() === "" ? NaN : Number(nilai);
  return Number.isInteger(v) && v >= 0 ? v : bawaan;
};

export const KUOTA_NOMOR_GRATIS_AWAL = 1;
/** Kuota percobaan akun tanpa paket (free trial) bila admin belum mengaturnya. */
export const KUOTA_PERCOBAAN_AWAL = 5;
/** Masa berlaku free trial (hari sejak akun dibuat) bila admin belum mengaturnya. */
export const HARI_PERCOBAAN_AWAL = 7;

/** Kuota nomor akun tanpa paket (pengaturan admin "kuota_bawaan"). */
export async function kuotaNomorGratis(): Promise<number> {
  return angkaSetting(await getSetting("kuota_bawaan"), KUOTA_NOMOR_GRATIS_AWAL);
}

/**
 * Kuota balasan AI akun tanpa paket, diatur admin (Aturan pendaftaran): `balasan` per akun, `ulang` = "sekali" (free
 * trial: dihitung sejak akun dibuat, tidak bertambah lagi) atau "bulanan" (diperbarui tiap awal bulan WIB).
 */
export interface AturanPercobaan {
  balasan: number;
  ulang: "sekali" | "bulanan";
  /** Masa berlaku free trial dalam hari sejak akun dibuat (hanya untuk "sekali"); 0 = tanpa batas waktu. */
  hari: number;
}

export async function aturanPercobaan(): Promise<AturanPercobaan> {
  const [n, u, h] = await Promise.all([getSetting("kuota_percobaan"), getSetting("kuota_percobaan_ulang"), getSetting("kuota_percobaan_hari")]);
  return { balasan: angkaSetting(n, KUOTA_PERCOBAAN_AWAL), ulang: u === "bulanan" ? "bulanan" : "sekali", hari: angkaSetting(h, HARI_PERCOBAAN_AWAL) };
}

/** Awal bulan kalender WIB (detik epoch): periode kuota akun tanpa langganan. */
export function awalBulanWib(t = sekarang()): number {
  const wib = new Date((t + 7 * 3600) * 1000);
  return Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), 1) / 1000 - 7 * 3600;
}

export interface HakAkun {
  /** null = tanpa batas. */
  nomor: number | null;
  balasan: number | null;
  /** Awal periode penghitungan kuota balasan. */
  periodeMulai: number;
  /** Akhir masa langganan; null = kuota gratis. */
  sampai: number | null;
  paket: string;
  /** Kuota gratis sekali pakai (free trial): dihitung sejak akun dibuat, habis = harus berlangganan. */
  percobaan: boolean;
  /** Akhir masa free trial (detik epoch); null = bukan free trial atau tanpa batas waktu. */
  percobaanSampai: number | null;
  /** Masa free trial sudah lewat: AI tidak membalas walau kuotanya masih tersisa. */
  percobaanBerakhir: boolean;
}

const BUKAN_PERCOBAAN = { percobaan: false, percobaanSampai: null, percobaanBerakhir: false } as const;

export async function hakAkun(user: { id: number; peran: string }): Promise<HakAkun> {
  if (user.peran === "admin") return { nomor: null, balasan: null, periodeMulai: awalBulanWib(), sampai: null, paket: "Admin", ...BUKAN_PERCOBAAN };
  const sql = await db();
  const [[u], l] = await Promise.all([
    sql<{ kuota_nomor: number | null; created_at: number }[]>`SELECT kuota_nomor, created_at FROM users WHERE id = ${user.id}`,
    langgananAktif(user.id),
  ]);
  if (l) return { nomor: u?.kuota_nomor ?? l.kuota_nomor, balasan: l.kuota_balasan, periodeMulai: l.mulai, sampai: l.sampai, paket: l.nama_paket, ...BUKAN_PERCOBAAN };
  const [nomorGratis, p] = await Promise.all([kuotaNomorGratis(), aturanPercobaan()]);
  // Free trial: semua balasan AI sejak akun dibuat ikut dihitung, jadi akun yang langganannya berakhir tidak
  // mendapat percobaan baru.
  // Masa berlaku dihitung dari akun dibuat; setelah lewat AI berhenti walau balasannya belum habis.
  const sekali = p.ulang === "sekali";
  const dibuat = u?.created_at ?? 0;
  const percobaanSampai = sekali && p.hari > 0 ? dibuat + p.hari * 86400 : null;
  return {
    nomor: u?.kuota_nomor ?? nomorGratis,
    balasan: p.balasan,
    periodeMulai: sekali ? dibuat : awalBulanWib(),
    sampai: null,
    paket: "Gratis",
    percobaan: sekali,
    percobaanSampai,
    percobaanBerakhir: percobaanSampai !== null && sekarang() >= percobaanSampai,
  };
}


/**
 * Balasan AI yang sudah dipakai semua nomor milik `userId` sejak `sejak`. Lewat numbers_user_idx lalu
 * ai_pakai_nomor_waktu_idx (rentang waktu per nomor), tanpa memindai seluruh ai_pakai.
 */
export async function balasanTerpakai(userId: number, sejak: number): Promise<number> {
  const sql = await db();
  const [r] = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM numbers n JOIN ai_pakai a ON a.number_id = n.id AND a.waktu >= ${sejak}
     WHERE n.user_id = ${userId} AND NOT a.abaikan`;
  return r.n;
}

// ---------- Penjaga kuota untuk jembatan WhatsApp ----------

/**
 * Dipanggil sebelum setiap balasan AI. Hak & pemakaian dipegang di memori per pengguna dan disegarkan paling
 * cepat tiap 60 dtk, jadi pesan WhatsApp tidak menambah query; tiap balasan menambah hitungan lokal.
 * Kelebihan paling banyak sejumlah balasan dalam satu jendela 60 dtk (bila ada beberapa proses), dan itu disengaja.
 */
interface CacheKuota {
  at: number;
  batas: number | null;
  terpakai: number;
}
const gk = globalThis as unknown as { __waKuota?: Map<number, CacheKuota> };
const cacheKuota = (gk.__waKuota ??= new Map());

export async function sisaKuotaAi(userId: number): Promise<number | null> {
  let c = cacheKuota.get(userId);
  if (!c || Date.now() - c.at > 60_000) {
    const sql = await db();
    const [u] = await sql<{ peran: string }[]>`SELECT peran FROM users WHERE id = ${userId}`;
    const hak = await hakAkun({ id: userId, peran: u?.peran ?? "user" });
    // Masa free trial lewat = kuota dianggap habis (paling lambat 60 dtk setelah lewat, sesuai umur cache).
    c = { at: Date.now(), batas: hak.percobaanBerakhir ? 0 : hak.balasan, terpakai: hak.balasan === null || hak.percobaanBerakhir ? 0 : await balasanTerpakai(userId, hak.periodeMulai) };
    cacheKuota.set(userId, c);
  }
  return c.batas === null ? null : Math.max(0, c.batas - c.terpakai);
}

export function catatBalasanLokal(userId: number): void {
  const c = cacheKuota.get(userId);
  if (c) c.terpakai += 1;
}

/** Setelah pembayaran / perubahan langganan: hitung ulang di pesan berikutnya. */
export function segarkanKuota(userId?: number): void {
  // Izin katalog (katalog.ts) bergantung pada langganan juga; dipegang di peta global yang sama namanya.
  const katalog = (globalThis as unknown as { __waKatalogBoleh?: Map<number, unknown> }).__waKatalogBoleh;
  if (userId === undefined) {
    cacheKuota.clear();
    cacheBerbayar.clear();
    katalog?.clear();
  } else {
    cacheKuota.delete(userId);
    cacheBerbayar.delete(userId);
    katalog?.delete(userId);
  }
}

// ---------- Penyedia AI menurut paket ----------

const gb = globalThis as unknown as { __waBerbayar?: Map<number, { at: number; ok: boolean }> };
const cacheBerbayar = (gb.__waBerbayar ??= new Map());

/** Akun punya langganan aktif? Dipegang di memori 60 dtk per akun, jadi tiap pesan WhatsApp tidak menambah query. */
export async function akunBerbayar(userId: number): Promise<boolean> {
  const c = cacheBerbayar.get(userId);
  if (c && Date.now() - c.at < 60_000) return c.ok;
  const ok = !!(await langgananAktif(userId));
  cacheBerbayar.set(userId, { at: Date.now(), ok });
  return ok;
}

const ga = globalThis as unknown as { __waAiAkun?: Map<number, { at: number; p: Penyedia | null }> };
const cacheAiAkun = (ga.__waAiAkun ??= new Map());

/** Penyedia yang dipaksa admin untuk akun ini (users.ai_penyedia); dipegang di memori 60 dtk seperti status paket. */
async function aiPaksaAkun(userId: number): Promise<Penyedia | null> {
  const c = cacheAiAkun.get(userId);
  if (c && Date.now() - c.at < 60_000) return c.p;
  const sql = await db();
  const [u] = await sql<{ ai_penyedia: Penyedia | null }[]>`SELECT ai_penyedia FROM users WHERE id = ${userId}`;
  const p = u?.ai_penyedia ?? null;
  cacheAiAkun.set(userId, { at: Date.now(), p });
  return p;
}

/** Setelah admin mengubah penyedia AI akun: dibaca ulang di pesan berikutnya. */
export function segarkanAiAkun(userId: number): void {
  cacheAiAkun.delete(userId);
}

/**
 * Penyedia AI untuk satu akun. Pilihan admin per akun (halaman pengguna) menang atas mode umum, selama penyedianya
 * tersedia di server (Hermes terpasang / ANTHROPIC_API_KEY ada); Claude API per akun tetap bercadangan Hermes.
 * Tanpa pilihan per akun, mode "per_paket" (admin, /admin/ai): tanpa langganan aktif = Hermes; berlangganan =
 * Claude API, dan `cadanganHermes` menyuruh tanyaAi memakai Hermes bila Claude gagal. Mode lain: sama untuk semua akun.
 * `userId` null (nomor tanpa pemilik) = tanpa paket dan tanpa pilihan per akun.
 */
export async function aiUntukAkun(userId: number | null): Promise<{ penyedia: Penyedia; cadanganHermes: boolean }> {
  const paksa = userId === null ? null : await aiPaksaAkun(userId);
  if (paksa === "anthropic" && kunciAnthropic()) return { penyedia: "anthropic", cadanganHermes: true };
  if (paksa === "hermes" && hermesTerkonfigurasi()) return { penyedia: "hermes", cadanganHermes: false };
  const atur = await pengaturanAi();
  if (atur.mode !== "per_paket") return { penyedia: atur.penyedia, cadanganHermes: false };
  const berbayar = userId !== null && (await akunBerbayar(userId));
  return { penyedia: berbayar ? "anthropic" : "hermes", cadanganHermes: berbayar };
}

// ---------- Transaksi ----------

export interface Transaksi {
  id: number;
  order_id: string;
  user_id: number;
  paket_id: number | null;
  nama_paket: string;
  jumlah: number;
  status: StatusBayar;
  metode: string | null;
  /** Kanal Core API pilihan pelanggan (null = transaksi Snap lama / pembayaran manual admin). */
  kanal: KanalBayar | null;
  redirect_url: string | null;
  dibuat: number;
  dibayar: number | null;
  /** Batas bayar (detik epoch); null = transaksi lama / manual. */
  kedaluwarsa: number | null;
  /** Catatan pembayaran manual dari admin (referensi transfer, dsb.). */
  catatan: string | null;
}

/** Bentuk order_id tagihan Midtrans aplikasi ini (lihat mulaiBayar). */
export const ORDER_SAH = /^WA-\d+-\d+-[0-9a-f]+$/;

const KOLOM_TRX = "id, order_id, user_id, paket_id, nama_paket, jumlah, status, metode, kanal, redirect_url, dibuat, dibayar, kedaluwarsa, catatan";

export async function riwayatTransaksi(opsi: { userId?: number; batas?: number }): Promise<(Transaksi & { email?: string })[]> {
  const sql = await db();
  const batas = Math.min(opsi.batas ?? 20, 100);
  return [
    ...(opsi.userId !== undefined
      ? await sql<Transaksi[]>`SELECT ${sql.unsafe(KOLOM_TRX)} FROM transaksi WHERE user_id = ${opsi.userId} ORDER BY dibuat DESC, id DESC LIMIT ${batas}`
      : await sql<(Transaksi & { email: string })[]>`
          SELECT ${sql.unsafe(KOLOM_TRX.split(", ").map((k) => `t.${k}`).join(", "))}, u.email
            FROM transaksi t JOIN users u ON u.id = t.user_id ORDER BY t.dibuat DESC, t.id DESC LIMIT ${batas}`),
  ];
}

/** Satu transaksi milik pengguna ini beserta data instruksi bayarnya (undefined bila tidak ada atau milik orang lain). */
export async function transaksiMilik(userId: number, orderId: string): Promise<(Transaksi & { bayar: InstruksiBayar | null }) | undefined> {
  const sql = await db();
  const [t] = await sql<(Transaksi & { bayar: InstruksiBayar | null })[]>`
    SELECT ${sql.unsafe(KOLOM_TRX)}, bayar FROM transaksi WHERE order_id = ${orderId} AND user_id = ${userId}`;
  return t;
}

/** Tagihan Core API milik pengguna untuk paket ini yang masih bisa dibayar (lewat indeks parsial transaksi_menunggu_idx). */
export async function tagihanMenunggu(userId: number, paketId: number): Promise<{ order_id: string; kanal: KanalBayar; kedaluwarsa: number } | undefined> {
  const sql = await db();
  const [t] = await sql<{ order_id: string; kanal: KanalBayar; kedaluwarsa: number }[]>`
    SELECT order_id, kanal, kedaluwarsa FROM transaksi
     WHERE user_id = ${userId} AND status = 'menunggu' AND kanal IS NOT NULL AND paket_id = ${paketId} AND kedaluwarsa > ${sekarang()}
     ORDER BY dibuat DESC, id DESC LIMIT 1`;
  return t;
}

/** Kunci advisory (berpasangan dengan id pengguna): satu pembuatan tagihan pada satu waktu per pengguna. */
const KUNCI_BAYAR = 72727402;
/** Tagihan menunggu dengan paket & kanal yang sama dipakai ulang selama sisa waktunya minimal segini (detik). */
const SISA_PAKAI_ULANG = 120;

/** Kapan status tagihan terakhir ditanyakan ke Midtrans (ms), per order: penjatah pemeriksaan cadangan webhook. */
const gc = globalThis as unknown as { __waCekBayar?: Map<string, number> };
const cekTerakhir = (gc.__waCekBayar ??= new Map());
/** Jeda minimal antar-pertanyaan ke Midtrans untuk satu tagihan yang sedang dipantau. */
export const JEDA_CEK_MIDTRANS = 20_000;

function catatCek(orderId: string): void {
  const kini = Date.now();
  if (cekTerakhir.size > 500) for (const [o, t] of cekTerakhir) if (kini - t > 600_000) cekTerakhir.delete(o);
  cekTerakhir.set(orderId, kini);
}

/**
 * Buat tagihan paket lewat Midtrans Core API dengan kanal pilihan pelanggan; mengembalikan order_id untuk halaman
 * instruksi bayar. Idempoten: klik ganda / dua tab mengantre di kunci advisory per pengguna, dan tagihan menunggu
 * dengan paket, kanal, dan nominal yang sama (masih berlaku) dipakai ulang tanpa charge baru. Tagihan lain yang
 * masih menunggu dibatalkan di latar supaya tidak terbayar dua kali.
 */
export async function mulaiBayar(
  k: KonfigMidtrans,
  user: { id: number; email: string; nama: string },
  paket: Paket,
  kanal: KanalBayar,
  asalApp: string
): Promise<{ orderId: string; baru: boolean }> {
  if (!paket.aktif || paket.harga < 1) throw new MidtransError("Paket ini tidak bisa dibeli."); // harga 0 = hanya diberikan admin
  let lama: string[] = [];
  const hasil = await transaksiDb(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${KUNCI_BAYAR}, ${user.id})`;
    const kini = sekarang();
    const menunggu = await tx<{ order_id: string; paket_id: number | null; kanal: string; jumlah: number; kedaluwarsa: number | null }[]>`
      SELECT order_id, paket_id, kanal, jumlah, kedaluwarsa FROM transaksi
       WHERE user_id = ${user.id} AND status = 'menunggu' AND kanal IS NOT NULL`;
    const sama = menunggu.find((t) => t.paket_id === paket.id && t.kanal === kanal && t.jumlah === paket.harga && (t.kedaluwarsa ?? 0) > kini + SISA_PAKAI_ULANG);
    if (sama) return { orderId: sama.order_id, baru: false };
    lama = menunggu.map((t) => t.order_id);
    const orderId = `WA-${user.id}-${kini}-${randomBytes(3).toString("hex")}`;
    const c = await buatCharge(k, {
      orderId,
      jumlah: paket.harga,
      kanal,
      item: { id: paket.kode, nama: `Paket ${paket.nama} (${paket.durasi_hari} hari)` },
      pelanggan: { nama: user.nama || user.email.split("@")[0], email: user.email },
      kembaliUrl: `${asalApp}/langganan/tagihan/${encodeURIComponent(orderId)}`,
    });
    // Baris ditulis setelah charge berhasil: charge yang ditolak tidak meninggalkan tagihan yatim. Notifikasi "pending"
    // yang tiba sebelum commit diabaikan webhook (order belum ada), dan memang tidak mengubah apa pun.
    await tx`
      INSERT INTO transaksi(order_id, user_id, paket_id, nama_paket, jumlah, status, kanal, bayar, kedaluwarsa, dibuat)
      VALUES (${orderId}, ${user.id}, ${paket.id}, ${paket.nama}, ${paket.harga}, 'menunggu', ${kanal}, ${tx.json(c.bayar as Record<string, string | undefined>)}, ${c.kedaluwarsa}, ${kini})`;
    return { orderId, baru: true };
  });
  if (hasil.baru) {
    catatCek(hasil.orderId); // baru dibuat: pemeriksaan cadangan pertama ke Midtrans setelah JEDA_CEK_MIDTRANS
    if (lama.length) void Promise.all(lama.map((o) => batalkan(k, o))).catch(() => {});
  }
  return hasil;
}

/** Batalkan satu tagihan di Midtrans; ditolak (sudah dibayar / kedaluwarsa) = status sebenarnya diambil ulang. */
async function batalkan(k: KonfigMidtrans, orderId: string): Promise<StatusBayar | null> {
  if (await batalkanCharge(k, orderId).catch(() => false)) {
    const sql = await db();
    await sql`UPDATE transaksi SET status = 'dibatalkan' WHERE order_id = ${orderId} AND status = 'menunggu'`;
    return "dibatalkan";
  }
  return (await terapkanStatus(k, orderId).catch(() => null))?.status ?? null;
}

/** Pelanggan membatalkan tagihannya sendiri yang masih menunggu. null = bukan miliknya. */
export async function batalkanBayar(k: KonfigMidtrans, userId: number, orderId: string): Promise<StatusBayar | null> {
  const sql = await db();
  const [t] = await sql<{ status: StatusBayar }[]>`SELECT status FROM transaksi WHERE order_id = ${orderId} AND user_id = ${userId}`;
  if (!t) return null;
  if (t.status !== "menunggu") return t.status;
  return batalkan(k, orderId);
}

/**
 * Status tagihan untuk polling halaman instruksi bayar: satu query lewat indeks unik order_id. Webhook adalah sumber
 * utama; bila terlambat atau tidak sampai, status ditanyakan ke Midtrans paling sering tiap JEDA_CEK_MIDTRANS per
 * tagihan, dan segera sekali setelah batas bayar lewat. null = bukan milik pengguna ini.
 */
export async function statusTagihan(k: KonfigMidtrans | null, userId: number, orderId: string): Promise<StatusBayar | null> {
  const sql = await db();
  const [t] = await sql<{ status: StatusBayar; kedaluwarsa: number | null }[]>`
    SELECT status, kedaluwarsa FROM transaksi WHERE order_id = ${orderId} AND user_id = ${userId}`;
  if (!t) return null;
  if (t.status !== "menunggu" || !k) return t.status;
  const lalu = cekTerakhir.get(orderId) ?? 0;
  const lewat = t.kedaluwarsa !== null && t.kedaluwarsa * 1000 <= Date.now() && lalu < t.kedaluwarsa * 1000;
  if (!lewat && Date.now() - lalu < JEDA_CEK_MIDTRANS) return t.status;
  catatCek(orderId);
  return (await terapkanStatus(k, orderId).catch(() => null))?.status ?? t.status;
}

/**
 * Terapkan status terbaru dari Midtrans ke transaksi (idempoten: aman dipanggil berkali-kali oleh webhook dan
 * halaman "selesai bayar"). Paket diaktifkan TEPAT SEKALI saat status berubah menjadi lunas.
 * Nominal harus sama persis dengan tagihan kita.
 */
export async function terapkanStatus(k: KonfigMidtrans, orderId: string): Promise<{ status: StatusBayar; baruAktif: boolean } | null> {
  const s = await statusMidtrans(k, orderId);
  const status = petaStatus(s);
  let infoCapi: { jumlah: number; namaPaket: string } | null = null;
  const hasil = await transaksiDb(async (tx) => {
    const [t] = await tx<(Transaksi & { aktif_id: number | null })[]>`
      SELECT ${tx.unsafe(KOLOM_TRX)}, langganan_id AS aktif_id FROM transaksi WHERE order_id = ${orderId} FOR UPDATE`;
    if (!t) return null;
    if (Math.round(Number(s.gross_amount)) !== t.jumlah) {
      console.error(`[bayar] nominal tidak cocok order=${orderId}: midtrans ${s.gross_amount}, tagihan ${t.jumlah}`);
      return { status: t.status, baruAktif: false };
    }
    const kini = sekarang();
    await tx`
      UPDATE transaksi SET status = ${status}, metode = ${s.payment_type ?? null}, dibayar = ${status === "lunas" ? (t.dibayar ?? kini) : t.dibayar}
       WHERE id = ${t.id}`;
    if (status !== "lunas" || t.aktif_id) return { status, baruAktif: false };
    const { id } = await aktifkan(tx, { userId: t.user_id, paketId: t.paket_id, sumber: "midtrans" });
    await tx`UPDATE transaksi SET langganan_id = ${id} WHERE id = ${t.id}`;
    await prosesKomisiTransaksi(tx, { transaksiId: t.id, userId: t.user_id, paketId: t.paket_id, namaPaket: t.nama_paket, jumlahBayar: t.jumlah });
    segarkanKuota(t.user_id);
    infoCapi = { jumlah: t.jumlah, namaPaket: t.nama_paket };
    return { status, baruAktif: true };
  });
  if (hasil?.baruAktif && infoCapi) {
    const c = infoCapi as { jumlah: number; namaPaket: string };
    void kirimCapiEvent({
      kunci: "purchase",
      eventId: orderId,
      customData: { value: c.jumlah, currency: "IDR", content_name: c.namaPaket, content_type: "product" },
    });
  }
  return hasil;
}

/** Isi paket yang disepakati khusus untuk satu akun (tidak mengubah paket mana pun). */
export interface IsiKhusus {
  nama: string;
  kuota_nomor: number;
  kuota_balasan: number;
}

/**
 * Aktifkan paket untuk pengguna. Paket sama dengan yang sedang aktif = DIPERPANJANG (masa ditambah, kuota balasan
 * ditambah). Paket lain = mulai baru sekarang (naik/turun paket), sisa paket lama tidak dibawa.
 * `isi` = isi khusus yang disepakati admin dengan akun ini: disalin apa adanya, selalu mulai baru (tidak memperpanjang).
 */
async function aktifkan(
  tx: Tx,
  a: { userId: number; paketId: number | null; sumber: "midtrans" | "admin"; hari?: number; isi?: IsiKhusus }
): Promise<{ id: number; nama: string; mulai: number; sampai: number; kuota_nomor: number; kuota_balasan: number; diperpanjang: boolean }> {
  const [p] = a.paketId ? await tx<Paket[]>`SELECT ${tx.unsafe(KOLOM_PAKET)} FROM paket WHERE id = ${a.paketId}` : [];
  if (!p && !a.isi) throw new Error("Paket tidak ditemukan.");
  const nama = a.isi?.nama ?? p.nama;
  const kuotaNomor = a.isi?.kuota_nomor ?? p.kuota_nomor;
  const kuotaBalasan = a.isi?.kuota_balasan ?? p.kuota_balasan;
  const hari = a.hari ?? p?.durasi_hari;
  if (!hari) throw new Error("Durasi paket belum diisi.");
  const kini = sekarang();
  const durasi = hari * 86400;
  const [l] = await tx<Langganan[]>`
    SELECT id, user_id, paket_id, nama_paket, mulai, sampai, kuota_nomor, kuota_balasan, sumber FROM langganan
     WHERE user_id = ${a.userId} AND sampai > ${kini} ORDER BY sampai DESC, id DESC LIMIT 1 FOR UPDATE`;
  if (l && !a.isi && p && l.paket_id === p.id) {
    const [d] = await tx<{ sampai: number; kuota_balasan: number }[]>`
      UPDATE langganan SET sampai = sampai + ${durasi}, kuota_balasan = kuota_balasan + ${kuotaBalasan} WHERE id = ${l.id}
      RETURNING sampai, kuota_balasan`;
    return { id: l.id, nama: l.nama_paket, mulai: l.mulai, sampai: d.sampai, kuota_nomor: l.kuota_nomor, kuota_balasan: d.kuota_balasan, diperpanjang: true };
  }
  if (l) await tx`UPDATE langganan SET sampai = ${kini} WHERE id = ${l.id}`; // diganti paket baru
  const [baru] = await tx<{ id: number }[]>`
    INSERT INTO langganan(user_id, paket_id, nama_paket, mulai, sampai, kuota_nomor, kuota_balasan, sumber)
    VALUES (${a.userId}, ${p?.id ?? null}, ${nama}, ${kini}, ${kini + durasi}, ${kuotaNomor}, ${kuotaBalasan}, ${a.sumber})
    RETURNING id`;
  return { id: baru.id, nama, mulai: kini, sampai: kini + durasi, kuota_nomor: kuotaNomor, kuota_balasan: kuotaBalasan, diperpanjang: false };
}

/** Admin memberi/memperpanjang paket secara manual tanpa catatan pembayaran (dipakai uji & kompensasi lama). */
export async function berikanPaket(userId: number, paketId: number, hari?: number): Promise<void> {
  await transaksiDb((tx) => aktifkan(tx, { userId, paketId, sumber: "admin", hari }));
  segarkanKuota(userId);
}

/** Cara bayar di luar Midtrans yang dicatat admin. Disimpan di transaksi.metode. */
export const METODE_MANUAL = {
  manual_transfer: "Transfer bank",
  manual_qris: "QRIS / e-wallet",
  manual_tunai: "Tunai",
  manual_lainnya: "Lainnya",
  kompensasi: "Gratis / kompensasi",
} as const;
export type MetodeManual = keyof typeof METODE_MANUAL;

export interface HasilBerikan {
  langgananId: number;
  orderId: string;
  nama: string;
  mulai: number;
  sampai: number;
  kuota_nomor: number;
  kuota_balasan: number;
  diperpanjang: boolean;
  jumlah: number;
}

/**
 * Admin mengaktifkan paket untuk satu akun setelah pembayaran di luar Midtrans (atau sebagai kompensasi): paket
 * terdaftar ATAU isi khusus hasil kesepakatan, dan pembayarannya dicatat sebagai transaksi lunas (tampil di halaman
 * Transaksi admin & riwayat pembayaran pelanggan). Aktivasi dan catatan pembayaran dalam satu transaksi database.
 */
export async function berikanPaketManual(
  userId: number,
  o: { paketId: number | null; isi?: IsiKhusus; hari?: number; metode: MetodeManual; jumlah: number; catatan: string }
): Promise<HasilBerikan> {
  const jumlah = o.metode === "kompensasi" ? 0 : o.jumlah;
  const hasil = await transaksiDb(async (tx) => {
    const l = await aktifkan(tx, { userId, paketId: o.paketId, sumber: "admin", hari: o.hari, isi: o.isi });
    const kini = sekarang();
    const orderId = `ADM-${userId}-${kini}-${randomBytes(3).toString("hex")}`;
    const [trx] = await tx<{ id: number }[]>`
      INSERT INTO transaksi(order_id, user_id, paket_id, nama_paket, jumlah, status, metode, dibuat, dibayar, langganan_id, catatan)
      VALUES (${orderId}, ${userId}, ${o.paketId}, ${l.nama}, ${jumlah}, 'lunas', ${o.metode}, ${kini}, ${kini}, ${l.id}, ${o.catatan || null})
      RETURNING id`;
    if (jumlah > 0 && o.metode !== "kompensasi") {
      await prosesKomisiTransaksi(tx, { transaksiId: trx.id, userId, paketId: o.paketId, namaPaket: l.nama, jumlahBayar: jumlah });
    }
    return { langgananId: l.id, orderId, nama: l.nama, mulai: l.mulai, sampai: l.sampai, kuota_nomor: l.kuota_nomor, kuota_balasan: l.kuota_balasan, diperpanjang: l.diperpanjang, jumlah };
  });
  segarkanKuota(userId);
  return hasil;
}

/** Riwayat langganan satu akun, terbaru dulu (untuk halaman kelola pengguna). */
export async function riwayatLangganan(userId: number, batas = 8): Promise<Langganan[]> {
  const sql = await db();
  return [
    ...(await sql<Langganan[]>`
      SELECT id, user_id, paket_id, nama_paket, mulai, sampai, kuota_nomor, kuota_balasan, sumber FROM langganan
       WHERE user_id = ${userId} ORDER BY mulai DESC, id DESC LIMIT ${batas}`),
  ];
}

/** Admin menghentikan langganan aktif seorang pengguna (kembali ke kuota gratis). */
export async function hentikanLangganan(userId: number): Promise<void> {
  const sql = await db();
  await sql`UPDATE langganan SET sampai = ${sekarang()} WHERE user_id = ${userId} AND sampai > ${sekarang()}`;
  segarkanKuota(userId);
}

// ---------- Acuan harga & margin (diatur admin, lihat src/lib/harga.ts) ----------

export interface AcuanTersimpan {
  margin: number; // persen 0..90
  pemakaian: number; // persen 10..100
  metode: MetodeBayar;
  biayaServerNomor: number; // Rp per nomor per bulan
  kurs: number;
  model: string; // model Claude acuan biaya
}

export async function acuanHarga(): Promise<AcuanTersimpan> {
  const [m, p, mt, bs, kurs, md, atur] = await Promise.all([
    getSetting("margin_target"),
    getSetting("pemakaian_acuan"),
    getSetting("metode_acuan"),
    getSetting("biaya_server_nomor"),
    kursUsd(),
    getSetting("harga_model"),
    pengaturanAi(),
  ]);
  return {
    margin: Math.min(90, angkaSetting(m, 60)),
    pemakaian: Math.min(100, Math.max(10, angkaSetting(p, 100))),
    metode: mt && mt in METODE_BAYAR ? (mt as MetodeBayar) : "kartu",
    biayaServerNomor: angkaSetting(bs, 0),
    kurs,
    model: md && perkiraanPerBalasan(md) !== null ? md : perkiraanPerBalasan(atur.model) !== null ? atur.model : MODEL_BAWAAN,
  };
}

export interface PemakaianNyata {
  /** Rata-rata balasan AI per nomor per bulan (dari hari-hari nomor itu aktif, x30). */
  balasanPerNomorBulan: number;
  nomor: number;
  hari: number;
  /** Balasan terbanyak satu nomor dalam sehari. */
  puncakHarian: number;
}

/**
 * Pemakaian nyata 30 hari terakhir dari tabel stats (semua nomor): dasar simulasi kuota nomor. Belum ada data =
 * 900 balasan per nomor per bulan (±30/hari, kisaran usaha kecil-menengah).
 */
export async function pemakaianNyata(): Promise<PemakaianNyata> {
  const sql = await db();
  const [r] = await sql<{ balasan: number; baris: number; nomor: number; hari: number; puncak: number }[]>`
    SELECT COALESCE(SUM(dibalas), 0)::int AS balasan, COUNT(*)::int AS baris, COUNT(DISTINCT number_id)::int AS nomor,
           COUNT(DISTINCT tanggal)::int AS hari, COALESCE(MAX(dibalas), 0)::int AS puncak
      FROM stats WHERE dibalas > 0 AND tanggal >= (now() AT TIME ZONE 'Asia/Jakarta')::date - 30`;
  return {
    balasanPerNomorBulan: r.baris ? Math.round((r.balasan / r.baris) * 30) : 900,
    nomor: r.nomor,
    hari: r.hari,
    puncakHarian: r.puncak,
  };
}

export type ModeSimulasi = "kunci-harga" | "kunci-kuota";

/**
 * Terapkan hasil simulasi ke paket berbayar yang dipilih (`ids`; kosong/tanpa = semua), dengan rumus yang sama
 * dengan pratinjau (src/lib/harga.ts):
 * - kunci-kuota: harga dihitung ulang dari kuota balasan; kuota nomor dari pemakaian nyata.
 * - kunci-harga: harga tetap; kuota balasan & nomor dihitung supaya margin target tercapai.
 * Simulasi hanya saran: paket yang tidak mungkin mencapai margin target (mis. harga uji Rp1.000) tidak diubah dan
 * dilaporkan di `dilewati`, tidak menggagalkan paket lain. Harga paket tetap bebas diatur admin.
 */
export interface OpsiKomisiSimulasi {
  komisiMap?: Record<number, { jenis: JenisKomisi; nilai: number }>;
  masukkanKomisi?: boolean;
  hanyaKomisi?: boolean;
}

export async function terapkanSimulasi(
  a: AcuanTersimpan,
  mode: ModeSimulasi = "kunci-kuota",
  ids?: ReadonlySet<number>,
  opsiKomisi?: OpsiKomisiSimulasi
): Promise<{ berubah: { nama: string; sebelum: string; sesudah: string }[]; dilewati: { nama: string; alasan: string }[] }> {
  const usd = perkiraanPerBalasan(a.model);
  if (usd === null) throw new Error("Tarif model acuan belum diketahui.");
  const acuan = { biayaBalasanUsd: usd, kurs: a.kurs, margin: a.margin / 100, pemakaian: a.pemakaian / 100, metode: a.metode, biayaServerNomor: a.biayaServerNomor };
  const mBayar = METODE_BAYAR[a.metode] ?? METODE_BAYAR.kartu;
  const { balasanPerNomorBulan: r } = await pemakaianNyata();
  const adaOpsiKomisi = !!opsiKomisi?.komisiMap;
  const ringkas = (p: Pick<Paket, "harga" | "kuota_balasan" | "kuota_nomor" | "komisi_jenis" | "komisi_nilai">) => {
    const dasar = `Rp${p.harga.toLocaleString("id-ID")} · ${p.kuota_balasan.toLocaleString("id-ID")} balasan · ${p.kuota_nomor} nomor`;
    if (!adaOpsiKomisi) return dasar;
    const kom = p.komisi_nilai > 0 ? (p.komisi_jenis === "persen" ? `${p.komisi_nilai}%` : `Rp${p.komisi_nilai.toLocaleString("id-ID")}`) : "0%";
    return `${dasar} · komisi ${kom}`;
  };
  const berubah: { nama: string; sebelum: string; sesudah: string }[] = [];
  const dilewati: { nama: string; alasan: string }[] = [];
  const semua = await daftarPaket({ semua: true });
  const simpan: Paket[] = [];
  for (const p of semua) {
    if (p.harga <= 0) continue; // paket gratis/khusus admin tidak disentuh
    if (ids && !ids.has(p.id)) continue; // tidak dipilih admin: harga & kuotanya tetap seperti yang ia atur
    const kom = opsiKomisi?.komisiMap?.[p.id] ?? { jenis: p.komisi_jenis, nilai: p.komisi_nilai };
    const kPersen = opsiKomisi?.masukkanKomisi && kom.jenis === "persen" ? kom.nilai / 100 : 0;
    const kTetap = opsiKomisi?.masukkanKomisi && kom.jenis === "rupiah" ? kom.nilai : 0;

    let baru: Paket = { ...p, komisi_jenis: kom.jenis, komisi_nilai: kom.nilai };

    if (!opsiKomisi?.hanyaKomisi) {
      if (mode === "kunci-harga") {
        let kuotaBalasan: number;
        let kuotaNomor: number;
        if (!opsiKomisi?.masukkanKomisi) {
          const k = kuotaDariHarga(p.harga, p.durasi_hari, acuan, r);
          kuotaBalasan = k.kuotaBalasan;
          kuotaNomor = k.kuotaNomor;
        } else {
          const bersih = p.harga * (1 - acuan.margin - mBayar.persen - kPersen) - mBayar.tetap - kTetap;
          const perBalasan =
            acuan.biayaBalasanUsd * acuan.kurs * (1 + TAMBAHAN_BIAYA_BALASAN) * acuan.pemakaian +
            (r > 0 ? acuan.biayaServerNomor / r : 0);
          kuotaBalasan = bersih > 0 && perBalasan > 0 ? Math.floor(bersih / perBalasan / 50) * 50 : 0;
          kuotaNomor = nomorDariKuota(kuotaBalasan, p.durasi_hari, r);
        }
        if (kuotaBalasan <= 0) {
          dilewati.push({ nama: p.nama, alasan: `harga ${`Rp${p.harga.toLocaleString("id-ID")}`} terlalu rendah untuk margin ${a.margin}%` });
          continue;
        }
        baru = { ...baru, kuota_balasan: kuotaBalasan, kuota_nomor: kuotaNomor };
      } else {
        const kuotaNomor = nomorDariKuota(p.kuota_balasan, p.durasi_hari, r);
        let hargaSaran: number | null;
        if (!opsiKomisi?.masukkanKomisi) {
          hargaSaran = hitungHarga({ ...p, kuota_nomor: kuotaNomor }, acuan).hargaSaran;
        } else {
          const dasar = hitungHarga({ ...p, kuota_nomor: kuotaNomor }, acuan);
          const penyebut = 1 - acuan.margin - mBayar.persen - kPersen;
          const hargaPas = penyebut > 0 ? (dasar.modal + mBayar.tetap + kTetap) / penyebut : null;
          hargaSaran = hargaPas === null ? null : Math.max(1_000, Math.ceil(hargaPas / 1_000) * 1_000);
        }
        if (hargaSaran === null) {
          dilewati.push({ nama: p.nama, alasan: "margin + biaya bayar mencapai 100%" });
          continue;
        }
        baru = { ...baru, harga: hargaSaran, kuota_nomor: kuotaNomor };
      }
    }

    if (
      baru.harga !== p.harga ||
      baru.kuota_balasan !== p.kuota_balasan ||
      baru.kuota_nomor !== p.kuota_nomor ||
      baru.komisi_jenis !== p.komisi_jenis ||
      baru.komisi_nilai !== p.komisi_nilai
    ) {
      simpan.push(baru);
    }
  }
  for (const baru of simpan) {
    const lama = semua.find((p) => p.id === baru.id)!;
    await simpanPaket(baru);
    berubah.push({ nama: baru.nama, sebelum: ringkas(lama), sesudah: ringkas(baru) });
  }
  return { berubah, dilewati };
}
