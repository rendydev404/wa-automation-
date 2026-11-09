import "server-only";
import { randomBytes } from "node:crypto";
import { type Tx, db, getSetting, sekarang, transaksi as transaksiDb } from "./db";
import { MODEL_BAWAAN, type Penyedia, kunciAnthropic, kursUsd, pengaturanAi, perkiraanPerBalasan } from "./ai";
import { type KanalBayar, METODE_BAYAR, type MetodeBayar, TAMBAHAN_BIAYA_BALASAN, hargaMinimal, hitungHarga, kuotaDariHarga, nomorDariKuota, sisaBersih } from "./harga";
import { hermesTerkonfigurasi } from "./hermes";
import { type AdapterGateway, type StatusGateway, adapter } from "./gateway";
import { type Gateway, GatewayError, type StatusBayar, labelGateway } from "./gateway-def";
import type { InstruksiBayar } from "./midtrans";
import { KODE_CUSTOM } from "./paket-custom-def";
import { namaBankTampil } from "./afiliasi-def";
import { type JenisKomisi, prosesKomisiTransaksi } from "./afiliasi";
import { type KonteksMeta, kirimCapiEvent } from "./meta-pixel";
import { MASA_ID, MASA_EN_ADJ } from "./jaminan-def";

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

/** Langganan aktif + kode paketnya (lencana paket, tingkat-paket.ts); paket lewat PK, jadi tetap satu query. */
export async function langgananAktif(userId: number): Promise<(Langganan & { kode_paket: string | null }) | undefined> {
  const sql = await db();
  const [l] = await sql<(Langganan & { kode_paket: string | null })[]>`
    SELECT l.id, l.user_id, l.paket_id, l.nama_paket, l.mulai, l.sampai, l.kuota_nomor, l.kuota_balasan, l.sumber, p.kode AS kode_paket
      FROM langganan l LEFT JOIN paket p ON p.id = l.paket_id
     WHERE l.user_id = ${userId} AND l.sampai > ${sekarang()}
     ORDER BY l.sampai DESC, l.id DESC LIMIT 1`;
  return l;
}

/** Bilangan bulat >= 0 dari pengaturan; belum diisi (null) = bawaan. Number(null) = 0, jadi null harus dicek dulu. */
const angkaSetting = (nilai: string | null, bawaan: number): number => {
  const v = nilai === null || nilai.trim() === "" ? NaN : Number(nilai);
  return Number.isInteger(v) && v >= 0 ? v : bawaan;
};

export const KUOTA_NOMOR_GRATIS_AWAL = 1;
/** Kuota percobaan akun tanpa paket (free trial) bila admin belum mengaturnya. */
export const KUOTA_PERCOBAAN_AWAL = 0;
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
  /** Kode paket langganan aktif (lencana); null = gratis/admin atau paket hasil kesepakatan admin. */
  kodePaket: string | null;
  /** Bonus balasan AI dari admin di periode ini (sudah termasuk dalam `balasan`). */
  bonus: number;
  /** Kuota gratis sekali pakai (free trial): dihitung sejak akun dibuat, habis = harus berlangganan. */
  percobaan: boolean;
  /** Akhir masa free trial (detik epoch); null = bukan free trial atau tanpa batas waktu. */
  percobaanSampai: number | null;
  /** Masa free trial sudah lewat: AI tidak membalas walau kuotanya masih tersisa. */
  percobaanBerakhir: boolean;
}

const BUKAN_PERCOBAAN = { percobaan: false, percobaanSampai: null, percobaanBerakhir: false } as const;

export async function hakAkun(user: { id: number; peran: string }): Promise<HakAkun> {
  if (user.peran === "admin") return { nomor: null, balasan: null, periodeMulai: awalBulanWib(), sampai: null, paket: "Admin", kodePaket: null, bonus: 0, ...BUKAN_PERCOBAAN };
  const sql = await db();
  const [[u], l] = await Promise.all([
    sql<{ kuota_nomor: number | null; created_at: number }[]>`SELECT kuota_nomor, created_at FROM users WHERE id = ${user.id}`,
    langgananAktif(user.id),
  ]);
  if (l) {
    const bonus = await bonusKuota(user.id, l.mulai);
    return { nomor: u?.kuota_nomor ?? l.kuota_nomor, balasan: l.kuota_balasan + bonus, periodeMulai: l.mulai, sampai: l.sampai, paket: l.nama_paket, kodePaket: l.kode_paket, bonus, ...BUKAN_PERCOBAAN };
  }
  const [nomorGratis, p] = await Promise.all([kuotaNomorGratis(), aturanPercobaan()]);
  // Free trial: semua balasan AI sejak akun dibuat ikut dihitung, jadi akun yang langganannya berakhir tidak
  // mendapat percobaan baru.
  // Masa berlaku dihitung dari akun dibuat; setelah lewat AI berhenti walau balasannya belum habis.
  // Trial dimatikan (balasan 0, bawaan sejak jaminan uang kembali): bukan "masa percobaan" yang bisa berakhir, cukup
  // akun tanpa paket (AI tidak membalas pelanggan; bonus admin per bulan tetap bisa dipakai).
  const sekali = p.ulang === "sekali" && p.balasan > 0;
  const dibuat = u?.created_at ?? 0;
  const percobaanSampai = sekali && p.hari > 0 ? dibuat + p.hari * 86400 : null;
  const periodeMulai = sekali ? dibuat : awalBulanWib();
  const bonus = await bonusKuota(user.id, periodeMulai);
  return {
    nomor: u?.kuota_nomor ?? nomorGratis,
    balasan: p.balasan + bonus,
    periodeMulai,
    sampai: null,
    paket: "Gratis",
    kodePaket: null,
    bonus,
    percobaan: sekali,
    percobaanSampai,
    // Bonus dari admin tetap bisa dipakai walau masa free trial sudah lewat.
    percobaanBerakhir: percobaanSampai !== null && sekarang() >= percobaanSampai && bonus === 0,
  };
}


/**
 * Bonus balasan AI dari admin (kuota_bonus) yang berlaku di periode kuota yang dimulai `sejak`: bonus berlaku di periode
 * saat diberikan (paket aktif, masa free trial, atau bulan berjalan untuk kuota gratis bulanan). Lewat kuota_bonus_user_idx.
 */
export async function bonusKuota(userId: number, sejak: number): Promise<number> {
  const sql = await db();
  const [r] = await sql<{ n: number }[]>`SELECT COALESCE(SUM(jumlah), 0)::int AS n FROM kuota_bonus WHERE user_id = ${userId} AND dibuat >= ${sejak}`;
  return r.n;
}

export interface BonusKuota {
  id: number;
  jumlah: number;
  catatan: string | null;
  oleh_email: string | null;
  dibuat: number;
}

/** Riwayat bonus satu akun (halaman kelola pengguna admin), terbaru dulu. */
export async function riwayatBonus(userId: number, batas = 10): Promise<BonusKuota[]> {
  const sql = await db();
  return [
    ...(await sql<BonusKuota[]>`
      SELECT b.id, b.jumlah, b.catatan, a.email AS oleh_email, b.dibuat
        FROM kuota_bonus b LEFT JOIN users a ON a.id = b.oleh
       WHERE b.user_id = ${userId} ORDER BY b.dibuat DESC, b.id DESC LIMIT ${batas}`),
  ];
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
  /** Awal periode kuota (kunci anti-dobel notifikasi ambang kuota). */
  periode: number;
}
const gk = globalThis as unknown as { __waKuota?: Map<number, CacheKuota>; __waKuotaGen?: { n: number } };
const cacheKuota = (gk.__waKuota ??= new Map());
/**
 * Naik setiap segarkanKuota(). Hitungan yang dimulai sebelum penyegaran tidak boleh mengisi cache: tanpa ini, pesan
 * yang sedang diproses saat admin memberi paket bisa menyimpan "kuota habis" yang lama, dan AI diam sampai 60 dtk.
 */
const genKuota = (gk.__waKuotaGen ??= { n: 0 });

export async function sisaKuotaAi(userId: number): Promise<number | null> {
  let c = cacheKuota.get(userId);
  if (!c || Date.now() - c.at > 60_000) {
    const gen = genKuota.n;
    const sql = await db();
    const [u] = await sql<{ peran: string }[]>`SELECT peran FROM users WHERE id = ${userId}`;
    const hak = await hakAkun({ id: userId, peran: u?.peran ?? "user" });
    // Masa free trial lewat = kuota dianggap habis (paling lambat 60 dtk setelah lewat, sesuai umur cache).
    c = {
      at: Date.now(),
      batas: hak.percobaanBerakhir ? 0 : hak.balasan,
      terpakai: hak.balasan === null || hak.percobaanBerakhir ? 0 : await balasanTerpakai(userId, hak.periodeMulai),
      periode: hak.periodeMulai,
    };
    if (gen === genKuota.n) cacheKuota.set(userId, c);
  }
  return c.batas === null ? null : Math.max(0, c.batas - c.terpakai);
}

/**
 * Akun trial/gratis yang kuota balasan AI-nya habis boleh diberi tahu lewat chat SEKALI per periode kuota (free trial =
 * sekali seumur akun, kuota gratis bulanan = sekali per bulan). Akun berbayar & admin: tidak pernah (false).
 * Klaim atomik lewat UPDATE ... RETURNING: dua chat yang masuk bersamaan tidak bisa sama-sama mendapat true.
 * Hanya dipanggil saat kuota sudah habis, jadi tidak menambah query di jalur balasan biasa.
 */
export async function klaimPemberitahuanKuota(userId: number): Promise<boolean> {
  const sql = await db();
  const [u] = await sql<{ peran: string }[]>`SELECT peran FROM users WHERE id = ${userId}`;
  if (!u || u.peran === "admin") return false;
  const hak = await hakAkun({ id: userId, peran: u.peran });
  if (hak.sampai !== null) return false;
  const [r] = await sql<{ id: number }[]>`
    UPDATE users SET kuota_habis_diberitahu = ${hak.periodeMulai}
     WHERE id = ${userId} AND kuota_habis_diberitahu IS DISTINCT FROM ${hak.periodeMulai}
     RETURNING id`;
  return !!r;
}

export function catatBalasanLokal(userId: number): void {
  const c = cacheKuota.get(userId);
  if (!c) return;
  c.terpakai += 1;
  // Baru saja melewati 80%: notifikasi sekali per periode (kunci anti-dobel), tanpa query di balasan lainnya.
  if (c.batas && c.batas > 0 && c.terpakai >= Math.ceil(c.batas * 0.8) && c.terpakai - 1 < Math.ceil(c.batas * 0.8)) {
    const sisa = Math.max(0, c.batas - c.terpakai);
    void import("./notifikasi").then((m) =>
      m.kirimNotif(userId, {
        jenis: "kuota",
        judul: { id: "Kuota balasan AI tinggal 20%", en: "Only 20% of your AI replies left" },
        isi: { id: `Sisa ${sisa.toLocaleString("id-ID")} balasan di periode ini. Tambah kuota supaya AI tidak berhenti membalas.`, en: `${sisa.toLocaleString("en-US")} replies left this period. Top up so the AI doesn't stop replying.` },
        tautan: "/langganan",
        kunci: `kuota80:${c.periode}:${c.batas}`,
      }),
    );
  }
}

/**
 * Kuota balasan AI habis (dipanggil jembatan WhatsApp sekali per jendela, bukan tiap pesan): notifikasi in-app sekali
 * per periode, dan untuk akun trial/gratis klaim pemberitahuan lewat chat. true = kirim pemberitahuan di chat.
 */
export async function catatKuotaHabis(userId: number): Promise<boolean> {
  const sql = await db();
  const [u] = await sql<{ peran: string }[]>`SELECT peran FROM users WHERE id = ${userId}`;
  if (!u || u.peran === "admin") return false;
  const hak = await hakAkun({ id: userId, peran: u.peran });
  const gratis = hak.sampai === null;
  const { kirimNotif } = await import("./notifikasi");
  if (gratis && hak.balasan === 0) {
    // Tanpa trial: akun yang belum (atau tidak lagi) berlangganan. Notifikasi in-app + pesan templat berlangganan SEKALI
    // per periode, sebagai balasan di chat pelanggan yang sedang masuk (klaimPemberitahuanKuota; bukan pesan tanpa diminta).
    await kirimNotif(userId, {
      jenis: "kuota",
      judul: { id: "AI belum membalas pelanggan", en: "The AI isn't replying to customers yet" },
      isi: {
        id: `Ada chat pelanggan masuk, tapi AI baru membalas setelah kamu berlangganan. Pembayaran pertama lewat GoPay, ShopeePay, atau QRIS dilindungi jaminan uang kembali ${MASA_ID}.`,
        en: `A customer chat came in, but the AI only replies once you subscribe. A first payment with GoPay, ShopeePay, or QRIS is covered by a ${MASA_EN_ADJ} money-back guarantee.`,
      },
      tautan: "/langganan",
      kunci: `kuota100:${hak.periodeMulai}:0`,
    });
    return klaimPemberitahuanKuota(userId);
  }
  await kirimNotif(userId, {
    jenis: "kuota",
    judul: gratis
      ? { id: "Kuota balasan AI gratis sudah habis", en: "Your free AI replies are used up" }
      : { id: `Kuota balasan AI paket ${hak.paket} sudah habis`, en: `Your ${hak.paket} plan's AI replies are used up` },
    isi: gratis
      ? { id: "AI berhenti membalas pelanggan. Pilih paket berlangganan untuk mengaktifkannya lagi.", en: "The AI has stopped replying to customers. Choose a plan to turn it back on." }
      : { id: "AI berhenti membalas sampai paket diperpanjang atau dinaikkan.", en: "The AI has stopped replying until you renew or upgrade your plan." },
    // Akun gratis: ke halaman hasil trial + pilihan paket (diarahkan ke Langganan bila pernah berlangganan).
    tautan: gratis ? "/trial-habis" : "/langganan",
    kunci: `kuota100:${hak.periodeMulai}:${hak.balasan ?? 0}`,
  });
  return gratis && (await klaimPemberitahuanKuota(userId));
}

/** Setelah pembayaran / perubahan langganan: hitung ulang di pesan berikutnya. */
export function segarkanKuota(userId?: number): void {
  genKuota.n += 1;
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
/** ID pembelian yang boleh dibuka pemiliknya di halaman tagihan: tagihan Midtrans (WA-) + pembayaran dicatat admin (ADM-). */
export const ORDER_TAMPIL = /^(WA|ADM)-\d+-\d+-[0-9a-f]+$/;

const KOLOM_TRX = "id, order_id, user_id, paket_id, nama_paket, jumlah, status, metode, kanal, redirect_url, dibuat, dibayar, kedaluwarsa, catatan";

export async function riwayatTransaksi(opsi: { userId?: number; batas?: number }): Promise<(Transaksi & { email?: string; kode_paket?: string | null })[]> {
  const sql = await db();
  const batas = Math.min(opsi.batas ?? 20, 100);
  return [
    ...(opsi.userId !== undefined
      ? await sql<(Transaksi & { kode_paket: string | null })[]>`
          SELECT ${sql.unsafe(KOLOM_TRX.split(", ").map((k) => `t.${k}`).join(", "))}, p.kode AS kode_paket
            FROM transaksi t LEFT JOIN paket p ON p.id = t.paket_id
           WHERE t.user_id = ${opsi.userId} ORDER BY t.dibuat DESC, t.id DESC LIMIT ${batas}`
      : await sql<(Transaksi & { email: string })[]>`
          SELECT ${sql.unsafe(KOLOM_TRX.split(", ").map((k) => `t.${k}`).join(", "))}, u.email
            FROM transaksi t JOIN users u ON u.id = t.user_id ORDER BY t.dibuat DESC, t.id DESC LIMIT ${batas}`),
  ];
}

/** Satu transaksi milik pengguna ini beserta data instruksi bayarnya (undefined bila tidak ada atau milik orang lain). */
export async function transaksiMilik(userId: number, orderId: string): Promise<(Transaksi & { bayar: InstruksiBayar | null; gateway: Gateway }) | undefined> {
  const sql = await db();
  const [t] = await sql<(Transaksi & { bayar: InstruksiBayar | null; gateway: Gateway })[]>`
    SELECT ${sql.unsafe(KOLOM_TRX)}, bayar, gateway FROM transaksi WHERE order_id = ${orderId} AND user_id = ${userId}`;
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
  g: AdapterGateway,
  user: { id: number; email: string; nama: string },
  paket: Paket,
  kanal: KanalBayar,
  asalApp: string,
  konteksMeta?: KonteksMeta
): Promise<{ orderId: string; baru: boolean }> {
  if (!paket.aktif || paket.harga < 1) throw new GatewayError("Paket ini tidak bisa dibeli."); // harga 0 = hanya diberikan admin
  let lama: string[] = [];
  const hasil = await transaksiDb(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${KUNCI_BAYAR}, ${user.id})`;
    const kini = sekarang();
    const menunggu = await tx<{ order_id: string; paket_id: number | null; kanal: string; jumlah: number; kedaluwarsa: number | null; gateway: Gateway }[]>`
      SELECT order_id, paket_id, kanal, jumlah, kedaluwarsa, gateway FROM transaksi
       WHERE user_id = ${user.id} AND status = 'menunggu' AND kanal IS NOT NULL`;
    // Dipakai ulang hanya bila provider-nya sama dengan provider aktif (admin bisa saja baru mengganti provider).
    const sama = menunggu.find(
      (t) => t.paket_id === paket.id && t.kanal === kanal && t.jumlah === paket.harga && t.gateway === g.nama && (t.kedaluwarsa ?? 0) > kini + SISA_PAKAI_ULANG
    );
    if (sama) return { orderId: sama.order_id, baru: false };
    lama = menunggu.map((t) => t.order_id);
    const orderId = `WA-${user.id}-${kini}-${randomBytes(3).toString("hex")}`;
    const c = await g.buatCharge({
      orderId,
      jumlah: paket.harga,
      kanal,
      item: { id: paket.kode, nama: `Paket ${paket.nama} (${paket.durasi_hari} hari)` },
      pelanggan: { nama: user.nama || user.email.split("@")[0], email: user.email },
      asalApp,
    });
    // Baris ditulis setelah charge berhasil: charge yang ditolak tidak meninggalkan tagihan yatim. Notifikasi "pending"
    // yang tiba sebelum commit diabaikan webhook (order belum ada), dan memang tidak mengubah apa pun.
    await tx`
      INSERT INTO transaksi(order_id, user_id, paket_id, nama_paket, jumlah, status, kanal, bayar, kedaluwarsa, dibuat, meta_konteks, gateway, gateway_ref)
      VALUES (${orderId}, ${user.id}, ${paket.id}, ${paket.nama}, ${paket.harga}, 'menunggu', ${kanal}, ${tx.json(c.bayar as Record<string, string | undefined>)}, ${c.kedaluwarsa}, ${kini}, ${konteksMeta ? tx.json(konteksMeta as Record<string, string | undefined>) : null}, ${g.nama}, ${c.ref})`;
    return { orderId, baru: true };
  });
  if (hasil.baru) {
    catatCek(hasil.orderId); // baru dibuat: pemeriksaan cadangan pertama ke provider setelah JEDA_CEK_MIDTRANS
    // Tagihan lama dibatalkan lewat provider ASALNYA masing-masing (bisa berbeda dari provider aktif).
    if (lama.length) void Promise.all(lama.map((o) => batalkan(o))).catch(() => {});
  }
  return hasil;
}

/** Provider asal satu transaksi (lewat indeks unik order_id); undefined = tidak ada. */
export async function asalTransaksi(orderId: string): Promise<{ gateway: Gateway; gateway_ref: string | null } | undefined> {
  const sql = await db();
  const [t] = await sql<{ gateway: Gateway; gateway_ref: string | null }[]>`SELECT gateway, gateway_ref FROM transaksi WHERE order_id = ${orderId}`;
  return t;
}

/** Batalkan satu tagihan di provider asalnya; ditolak (sudah dibayar / kedaluwarsa) = status sebenarnya diambil ulang. */
async function batalkan(orderId: string, asal?: { gateway: Gateway; gateway_ref: string | null }): Promise<StatusBayar | null> {
  const t = asal ?? (await asalTransaksi(orderId));
  const g = t && (await adapter(t.gateway));
  if (!t || !g) return null;
  if (await g.batalkan(orderId, t.gateway_ref).catch(() => false)) {
    const sql = await db();
    await sql`UPDATE transaksi SET status = 'dibatalkan' WHERE order_id = ${orderId} AND status = 'menunggu'`;
    return "dibatalkan";
  }
  return (await terapkanStatus(orderId, { g, asal: t }).catch(() => null))?.status ?? null;
}

/** Pelanggan membatalkan tagihannya sendiri yang masih menunggu. null = bukan miliknya (atau provider-nya tidak terpasang). */
export async function batalkanBayar(userId: number, orderId: string): Promise<StatusBayar | null> {
  const sql = await db();
  const [t] = await sql<{ status: StatusBayar; gateway: Gateway; gateway_ref: string | null }[]>`
    SELECT status, gateway, gateway_ref FROM transaksi WHERE order_id = ${orderId} AND user_id = ${userId}`;
  if (!t) return null;
  if (t.status !== "menunggu") return t.status;
  return batalkan(orderId, t);
}

/**
 * Status tagihan untuk polling halaman instruksi bayar: satu query lewat indeks unik order_id. Webhook adalah sumber
 * utama; bila terlambat atau tidak sampai, status ditanyakan ke Midtrans paling sering tiap JEDA_CEK_MIDTRANS per
 * tagihan, dan segera sekali setelah batas bayar lewat. null = bukan milik pengguna ini.
 */
export async function statusTagihan(userId: number, orderId: string): Promise<StatusBayar | null> {
  const sql = await db();
  const [t] = await sql<{ status: StatusBayar; kedaluwarsa: number | null; gateway: Gateway; gateway_ref: string | null }[]>`
    SELECT status, kedaluwarsa, gateway, gateway_ref FROM transaksi WHERE order_id = ${orderId} AND user_id = ${userId}`;
  if (!t) return null;
  if (t.status !== "menunggu") return t.status;
  const lalu = cekTerakhir.get(orderId) ?? 0;
  const lewat = t.kedaluwarsa !== null && t.kedaluwarsa * 1000 <= Date.now() && lalu < t.kedaluwarsa * 1000;
  if (!lewat && Date.now() - lalu < JEDA_CEK_MIDTRANS) return t.status;
  const g = await adapter(t.gateway);
  if (!g) return t.status; // provider asal tidak terpasang lagi: status DB saja
  catatCek(orderId);
  return (await terapkanStatus(orderId, { g, asal: t }).catch(() => null))?.status ?? t.status;
}

/**
 * Terapkan status terbaru dari provider ASAL transaksi (transaksi.gateway, bukan provider aktif) ke transaksi
 * (idempoten: aman dipanggil berkali-kali oleh webhook Midtrans/iPaymu dan halaman "selesai bayar"). Paket diaktifkan
 * TEPAT SEKALI saat status berubah menjadi lunas. Nominal harus sama persis dengan tagihan kita.
 * null = order tidak ada di database kita. Provider asal tidak terpasang = galat (webhook dicoba ulang provider).
 */
export async function terapkanStatus(
  orderId: string,
  o: { g?: AdapterGateway; asal?: { gateway: Gateway; gateway_ref: string | null } } = {},
): Promise<{ status: StatusBayar; baruAktif: boolean } | null> {
  const asal = o.asal ?? (await asalTransaksi(orderId));
  if (!asal) return null;
  const g = o.g ?? (await adapter(asal.gateway));
  if (!g) throw new GatewayError(`${labelGateway(asal.gateway)} belum dipasang di server.`);
  const s = await g.cekStatus(orderId, asal.gateway_ref);
  const status = s.status;
  let infoCapi: InfoCapiBeli | null = null;
  let infoRefund: InfoRefund | null = null;
  const hasil = await transaksiDb(async (tx) => {
    const [t] = await tx<(Transaksi & { aktif_id: number | null; meta_konteks: KonteksMeta | null })[]>`
      SELECT ${tx.unsafe(KOLOM_TRX)}, langganan_id AS aktif_id, meta_konteks FROM transaksi WHERE order_id = ${orderId} FOR UPDATE`;
    if (!t) return null;
    if (s.jumlah !== t.jumlah) {
      console.error(`[bayar] nominal tidak cocok order=${orderId}: ${g.nama} ${s.jumlah}, tagihan ${t.jumlah}`);
      return { status: t.status, baruAktif: false };
    }
    // Sudah kita tandai dikembalikan (Refund API menjawab 200 / admin menandai selesai) tapi status provider belum ikut berubah: jangan mundur ke lunas.
    if (t.status === "dikembalikan" && status === "lunas") return { status: t.status, baruAktif: false };
    const kini = sekarang();
    await tx`
      UPDATE transaksi SET status = ${status}, metode = ${s.metode}, dibayar = ${status === "lunas" ? (t.dibayar ?? kini) : t.dibayar}
       WHERE id = ${t.id}`;
    if (status === "dikembalikan") {
      infoRefund = await selesaikanRefund(tx, t, s, g.nama);
      return { status, baruAktif: false };
    }
    if (status !== "lunas" || t.aktif_id) return { status, baruAktif: false };
    const { id } = await aktifkan(tx, { userId: t.user_id, paketId: t.paket_id, sumber: "midtrans" });
    await tx`UPDATE transaksi SET langganan_id = ${id}, meta_konteks = NULL WHERE id = ${t.id}`;
    await prosesKomisiTransaksi(tx, { transaksiId: t.id, userId: t.user_id, paketId: t.paket_id, namaPaket: t.nama_paket, jumlahBayar: t.jumlah });
    segarkanKuota(t.user_id);
    const [u] = await tx<{ email: string; asal_industri: string | null }[]>`SELECT email, asal_industri FROM users WHERE id = ${t.user_id}`;
    infoCapi = { jumlah: t.jumlah, namaPaket: t.nama_paket, userId: t.user_id, email: u?.email, industri: u?.asal_industri ?? null, konteks: t.meta_konteks };
    return { status, baruAktif: true };
  });
  if (infoRefund) notifRefund(infoRefund);
  if (hasil?.baruAktif) void notifPaketAktif(orderId, "midtrans");
  if (hasil?.baruAktif && infoCapi) {
    const c = infoCapi as InfoCapiBeli;
    void kirimCapiEvent({
      ...c.konteks,
      kunci: "purchase",
      eventId: orderId, // sama dengan eventID Pixel di halaman tagihan, supaya Meta menghitungnya sekali
      email: c.email,
      externalId: c.userId,
      // content_category = industri LP asal akun (users.asal_industri), untuk laporan iklan per industri.
      customData: { value: c.jumlah, currency: "IDR", content_name: c.namaPaket, content_type: "product", ...(c.industri ? { content_category: c.industri } : {}) },
    });
  }
  return hasil;
}

// ---------- Pengembalian dana (refund) ----------

/** Hasil satu refund yang baru tuntas, untuk notifikasi sesudah transaksi database selesai. */
interface InfoRefund {
  orderId: string;
  userId: number;
  jumlah: number;
  namaPaket: string;
  /** Paket dicabut saat ini (false = sudah berakhir, atau langganan ikut dibayar transaksi lain sehingga admin yang menyesuaikan). */
  dicabut: boolean;
  /** manual = ditransfer admin ke `tujuan`; otomatis/midtrans = ke metode bayar asal lewat Midtrans. */
  cara: "manual" | "otomatis" | "midtrans";
  tujuan: string | null;
  komisi: { afiliator: number; nominal: number } | null;
}

/**
 * Transaksi lunas yang dananya dikembalikan PENUH (refund/chargeback, dari jaminan uang kembali ATAU dari dashboard
 * Midtrans): paket dari transaksi ini dicabut dan komisi afiliasinya dibatalkan, di transaksi database pemanggil yang
 * sudah mengunci baris transaksi (FOR UPDATE). Idempoten: dipanggil ulang (webhook berulang, jawaban API + webhook)
 * tidak mencabut/mengurangi dua kali; baris pengembalian_dana ditandai selesai. Refund sebagian tidak mencabut paket.
 * null = tidak ada yang baru (sudah dikembalikan sebelumnya / refund sebagian).
 */
async function selesaikanRefund(
  tx: Tx,
  t: Pick<Transaksi, "id" | "order_id" | "user_id" | "jumlah" | "nama_paket" | "status"> & { aktif_id: number | null },
  s: Pick<StatusGateway, "refundPenuh" | "refundDikonfirmasi">,
  gateway: Gateway = "midtrans",
): Promise<InfoRefund | null> {
  if (!s.refundPenuh) {
    console.warn(`[refund] refund sebagian order=${t.order_id}: paket tidak dicabut otomatis`);
    return null;
  }
  const kini = sekarang();
  const konfirmasi = s.refundDikonfirmasi;
  // Pengajuan jaminan (bila ada) jadi selesai; refund dari dashboard provider juga dicatat supaya tampil di admin
  // (cara 'midtrans' = lewat dashboard Midtrans; provider tanpa Refund API dicatat 'manual').
  const [r] = await tx<{ cara: InfoRefund["cara"]; tujuan_bank: string | null; tujuan_nomor: string | null; tujuan_nama: string | null }[]>`
    INSERT INTO pengembalian_dana(transaksi_id, user_id, email, order_id, jumlah, status, cara, alasan, wa_ids, dibuat, selesai, dikonfirmasi)
    SELECT ${t.id}, u.id, u.email, ${t.order_id}, ${t.jumlah}, 'selesai', ${gateway === "midtrans" ? "midtrans" : "manual"}, ${`Dikembalikan lewat dashboard ${labelGateway(gateway)}`},
           ARRAY(SELECT wa_id FROM numbers WHERE user_id = u.id AND wa_id IS NOT NULL), ${kini}, ${kini}, ${konfirmasi}
      FROM users u WHERE u.id = ${t.user_id}
    ON CONFLICT (transaksi_id) DO UPDATE
       SET status = 'selesai', galat = NULL,
           selesai = COALESCE(pengembalian_dana.selesai, EXCLUDED.selesai),
           dikonfirmasi = COALESCE(pengembalian_dana.dikonfirmasi, EXCLUDED.dikonfirmasi)
    RETURNING cara, tujuan_bank, tujuan_nomor, tujuan_nama`;
  if (t.status === "dikembalikan") return null;
  let dicabut = false;
  if (t.aktif_id) {
    // Langganan yang juga diperpanjang transaksi lunas lain tidak dicabut otomatis (admin yang menyesuaikan).
    const [lain] = await tx<{ id: number }[]>`
      SELECT id FROM transaksi WHERE user_id = ${t.user_id} AND langganan_id = ${t.aktif_id} AND id <> ${t.id} AND status = 'lunas' LIMIT 1`;
    if (!lain) dicabut = (await tx`UPDATE langganan SET sampai = ${kini} WHERE id = ${t.aktif_id} AND sampai > ${kini} RETURNING id`).length > 0;
  }
  const [k] = await tx<{ afiliator_id: number; nominal: number }[]>`
    DELETE FROM komisi_afiliasi WHERE transaksi_id = ${t.id} RETURNING afiliator_id, nominal`;
  // Komisi baru bisa ditarik setelah masa jaminan (ajukanPenarikan), jadi saldo masih memuatnya; GREATEST hanya pengaman.
  if (k) await tx`UPDATE afiliator SET saldo = GREATEST(saldo - ${k.nominal}, 0), total_komisi = GREATEST(total_komisi - ${k.nominal}, 0) WHERE user_id = ${k.afiliator_id}`;
  const tujuan = r?.tujuan_bank && r.tujuan_nomor ? `${namaBankTampil(r.tujuan_bank)} ${r.tujuan_nomor}${r.tujuan_nama ? ` a.n. ${r.tujuan_nama}` : ""}` : null;
  return {
    orderId: t.order_id,
    userId: t.user_id,
    jumlah: t.jumlah,
    namaPaket: t.nama_paket,
    dicabut,
    cara: r?.cara ?? "midtrans",
    tujuan,
    komisi: k ? { afiliator: k.afiliator_id, nominal: k.nominal } : null,
  };
}

/**
 * Refund API Midtrans menjawab 200 (src/lib/jaminan.ts): transaksi langsung ditandai dikembalikan dan paketnya dicabut,
 * tanpa menunggu webhook (yang nanti tiba dan tidak mengubah apa pun lagi).
 */
export async function catatRefundBerhasil(orderId: string): Promise<void> {
  const info = await transaksiDb(async (tx) => {
    const [t] = await tx<(Transaksi & { aktif_id: number | null })[]>`
      SELECT ${tx.unsafe(KOLOM_TRX)}, langganan_id AS aktif_id FROM transaksi WHERE order_id = ${orderId} FOR UPDATE`;
    if (!t) return null;
    if (t.status !== "dikembalikan") await tx`UPDATE transaksi SET status = 'dikembalikan' WHERE id = ${t.id}`;
    return selesaikanRefund(tx, t, { refundPenuh: true, refundDikonfirmasi: null });
  });
  if (info) notifRefund(info);
}

/** Notifikasi refund (pembeli, afiliator bila komisinya batal, admin), sesudah transaksi database tuntas. */
function notifRefund(r: InfoRefund): void {
  segarkanKuota(r.userId);
  const rp = (n: number) => `Rp${n.toLocaleString("id-ID")}`;
  void import("./notifikasi")
    .then(async ({ kirimNotif, kirimNotifAdmin }) => {
      await kirimNotif(r.userId, {
        jenis: "pembayaran",
        judul: { id: `Dana ${rp(r.jumlah)} dikembalikan`, en: `${rp(r.jumlah)} has been refunded` },
        isi:
          r.cara === "manual"
            ? {
                id: `Pembayaran paket ${r.namaPaket} (${r.orderId}) sudah ditransfer kembali${r.tujuan ? ` ke ${r.tujuan}` : ""}${r.dicabut ? " dan paketnya dihentikan" : ""}.`,
                en: `Your ${r.namaPaket} plan payment (${r.orderId}) was transferred back${r.tujuan ? ` to ${r.tujuan}` : ""}${r.dicabut ? " and the plan was stopped" : ""}.`,
              }
            : {
                id: `Pembayaran paket ${r.namaPaket} (${r.orderId}) dikembalikan ke metode bayar asal${r.dicabut ? " dan paketnya dihentikan" : ""}. GoPay biasanya masuk dalam 1×24 jam; QRIS dari aplikasi lain bisa sampai 15–20 hari kerja.`,
                en: `Your ${r.namaPaket} plan payment (${r.orderId}) was refunded to the original payment method${r.dicabut ? " and the plan was stopped" : ""}. GoPay usually arrives within 24 hours; QRIS from other apps can take up to 15–20 business days.`,
              },
        tautan: "/langganan",
        kunci: `refund:${r.orderId}`,
      });
      if (r.komisi)
        await kirimNotif(r.komisi.afiliator, {
          jenis: "afiliasi",
          judul: { id: `Komisi ${rp(r.komisi.nominal)} dibatalkan`, en: `Commission of ${rp(r.komisi.nominal)} was canceled` },
          isi: {
            id: `Pembeli paket ${r.namaPaket} memakai jaminan uang kembali, jadi komisinya tidak jadi masuk saldo.`,
            en: `The ${r.namaPaket} buyer used the money-back guarantee, so the commission was removed from your balance.`,
          },
          tautan: "/afiliasi",
          kunci: `refund-komisi:${r.orderId}`,
        });
      await kirimNotifAdmin({
        jenis: "admin_bayar",
        judul: { id: `Dana dikembalikan ${rp(r.jumlah)} · ${r.namaPaket}`, en: `Refunded ${rp(r.jumlah)} · ${r.namaPaket}` },
        isi: {
          id: `${r.orderId}${r.dicabut ? " · paket dicabut" : " · paket TIDAK dicabut otomatis, cek akunnya"}`,
          en: `${r.orderId}${r.dicabut ? " · plan stopped" : " · plan NOT stopped automatically, check the account"}`,
        },
        tautan: `/admin/transaksi/${encodeURIComponent(r.orderId)}`,
      });
    })
    .catch((e) => console.warn("[notifikasi] refund:", e instanceof Error ? e.message : e));
}

interface InfoCapiBeli {
  jumlah: number;
  namaPaket: string;
  userId: number;
  email?: string;
  industri: string | null;
  konteks: KonteksMeta | null;
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
  void notifPaketAktif(hasil.orderId, "admin");
  return hasil;
}

/**
 * Notifikasi setelah paket aktif (sesudah transaksi database tuntas): pembeli, admin (hanya pembayaran Midtrans), dan
 * afiliator bila ada komisi dari transaksi ini. Satu query lewat order_id UNIQUE + komisi lewat transaksi_id UNIQUE.
 */
async function notifPaketAktif(orderId: string, sumber: "midtrans" | "admin"): Promise<void> {
  try {
    const { kirimNotif, kirimNotifAdmin } = await import("./notifikasi");
    const sql = await db();
    const [t] = await sql<{ user_id: number; email: string; nama_paket: string; jumlah: number; sampai: number | null; k_afiliator: number | null; k_nominal: number | null }[]>`
      SELECT t.user_id, u.email, t.nama_paket, t.jumlah, l.sampai, k.afiliator_id AS k_afiliator, k.nominal AS k_nominal
        FROM transaksi t JOIN users u ON u.id = t.user_id
        LEFT JOIN langganan l ON l.id = t.langganan_id
        LEFT JOIN komisi_afiliasi k ON k.transaksi_id = t.id
       WHERE t.order_id = ${orderId}`;
    if (!t) return;
    const rp = (n: number) => `Rp${n.toLocaleString("id-ID")}`;
    const sampai = t.sampai ? new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric" }).format(new Date(t.sampai * 1000)) : "";
    const sampaiEn = t.sampai ? new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric" }).format(new Date(t.sampai * 1000)) : "";
    await kirimNotif(t.user_id, {
      jenis: sumber === "midtrans" ? "pembayaran" : "paket",
      judul:
        sumber === "midtrans"
          ? { id: `Pembayaran diterima · Paket ${t.nama_paket} aktif`, en: `Payment received · ${t.nama_paket} plan active` }
          : { id: `Paket ${t.nama_paket} diaktifkan admin`, en: `The admin activated your ${t.nama_paket} plan` },
      isi: { id: `${sampai ? `Aktif sampai ${sampai}. ` : ""}ID pembelian ${orderId}.`, en: `${sampaiEn ? `Active until ${sampaiEn}. ` : ""}Purchase ID ${orderId}.` },
      tautan: "/langganan",
    });
    if (sumber === "midtrans") {
      await kirimNotifAdmin({
        jenis: "admin_bayar",
        judul: { id: `Pembayaran lunas ${rp(t.jumlah)} · ${t.nama_paket}`, en: `Payment received ${rp(t.jumlah)} · ${t.nama_paket}` },
        isi: { id: `${t.email} · ${orderId}`, en: `${t.email} · ${orderId}` },
        tautan: `/admin/transaksi/${encodeURIComponent(orderId)}`,
      });
    }
    if (t.k_afiliator && t.k_nominal) {
      await kirimNotif(t.k_afiliator, {
        jenis: "afiliasi",
        judul: { id: `Komisi baru ${rp(t.k_nominal)} masuk ke saldo`, en: `New commission of ${rp(t.k_nominal)} added to your balance` },
        isi: { id: `Dari pembelian paket ${t.nama_paket} lewat tautan referral Anda.`, en: `From a ${t.nama_paket} plan purchase through your referral link.` },
        tautan: "/afiliasi",
      });
    }
  } catch (e) {
    console.warn("[notifikasi] paket aktif:", e instanceof Error ? e.message : e);
  }
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
    metode: mt && mt in METODE_BAYAR ? (mt as MetodeBayar) : "otomatis",
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
          const bersih = sisaBersih(p.harga, acuan.margin + kPersen, acuan.metode) - kTetap;
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
          const hargaPas = hargaMinimal(dasar.modal + kTetap, acuan.margin + kPersen, acuan.metode);
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
