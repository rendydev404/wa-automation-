import "server-only";
import { randomBytes } from "node:crypto";
import { type Tx, db, getSetting, sekarang, transaksi as transaksiDb } from "./db";
import { type KonfigMidtrans, MidtransError, type StatusBayar, buatSnap, petaStatus, statusMidtrans } from "./midtrans";

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
}

const KOLOM_PAKET = "id, kode, nama, harga, durasi_hari, kuota_nomor, kuota_balasan, deskripsi, aktif, unggulan, urutan";

export async function daftarPaket(opsi: { semua?: boolean } = {}): Promise<Paket[]> {
  const sql = await db();
  return [...(await sql<Paket[]>`SELECT ${sql.unsafe(KOLOM_PAKET)} FROM paket WHERE ${opsi.semua ? sql`true` : sql`aktif`} ORDER BY urutan, harga, id`)];
}

export async function paketById(id: number): Promise<Paket | undefined> {
  const sql = await db();
  const [p] = await sql<Paket[]>`SELECT ${sql.unsafe(KOLOM_PAKET)} FROM paket WHERE id = ${id}`;
  return p;
}

export async function simpanPaket(p: Omit<Paket, "id"> & { id?: number }): Promise<number> {
  const sql = await db();
  if (p.id) {
    await sql`
      UPDATE paket SET nama = ${p.nama}, harga = ${p.harga}, durasi_hari = ${p.durasi_hari}, kuota_nomor = ${p.kuota_nomor},
             kuota_balasan = ${p.kuota_balasan}, deskripsi = ${p.deskripsi}, aktif = ${p.aktif}, unggulan = ${p.unggulan}, urutan = ${p.urutan}
       WHERE id = ${p.id}`;
    return p.id;
  }
  const [r] = await sql<{ id: number }[]>`
    INSERT INTO paket(kode, nama, harga, durasi_hari, kuota_nomor, kuota_balasan, deskripsi, aktif, unggulan, urutan, created_at)
    VALUES (${p.kode}, ${p.nama}, ${p.harga}, ${p.durasi_hari}, ${p.kuota_nomor}, ${p.kuota_balasan}, ${p.deskripsi}, ${p.aktif}, ${p.unggulan}, ${p.urutan}, ${sekarang()})
    RETURNING id`;
  return r.id;
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
export const KUOTA_BALASAN_GRATIS_AWAL = 100;

/** Kuota nomor akun tanpa paket (pengaturan admin "kuota_bawaan"). */
export async function kuotaNomorGratis(): Promise<number> {
  return angkaSetting(await getSetting("kuota_bawaan"), KUOTA_NOMOR_GRATIS_AWAL);
}

export async function kuotaBalasanGratis(): Promise<number> {
  return angkaSetting(await getSetting("kuota_balasan_gratis"), KUOTA_BALASAN_GRATIS_AWAL);
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
  /** Akhir masa langganan; null = kuota gratis (berulang tiap bulan). */
  sampai: number | null;
  paket: string;
}

export async function hakAkun(user: { id: number; peran: string }): Promise<HakAkun> {
  if (user.peran === "admin") return { nomor: null, balasan: null, periodeMulai: awalBulanWib(), sampai: null, paket: "Admin" };
  const sql = await db();
  const [[u], l] = await Promise.all([sql<{ kuota_nomor: number | null }[]>`SELECT kuota_nomor FROM users WHERE id = ${user.id}`, langgananAktif(user.id)]);
  if (l) return { nomor: u?.kuota_nomor ?? l.kuota_nomor, balasan: l.kuota_balasan, periodeMulai: l.mulai, sampai: l.sampai, paket: l.nama_paket };
  const [nomorGratis, balasanGratis] = await Promise.all([kuotaNomorGratis(), kuotaBalasanGratis()]);
  return { nomor: u?.kuota_nomor ?? nomorGratis, balasan: balasanGratis, periodeMulai: awalBulanWib(), sampai: null, paket: "Gratis" };
}

/**
 * Balasan AI yang sudah dipakai semua nomor milik `userId` sejak `sejak`. Lewat numbers_user_idx lalu
 * ai_pakai_nomor_waktu_idx (rentang waktu per nomor), tanpa memindai seluruh ai_pakai.
 */
export async function balasanTerpakai(userId: number, sejak: number): Promise<number> {
  const sql = await db();
  const [r] = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM numbers n JOIN ai_pakai a ON a.number_id = n.id AND a.waktu >= ${sejak}
     WHERE n.user_id = ${userId}`;
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
    c = { at: Date.now(), batas: hak.balasan, terpakai: hak.balasan === null ? 0 : await balasanTerpakai(userId, hak.periodeMulai) };
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
  if (userId === undefined) cacheKuota.clear();
  else cacheKuota.delete(userId);
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
  redirect_url: string | null;
  dibuat: number;
  dibayar: number | null;
}

const KOLOM_TRX = "id, order_id, user_id, paket_id, nama_paket, jumlah, status, metode, redirect_url, dibuat, dibayar";

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

/** Buat tagihan paket di Midtrans Snap; mengembalikan halaman pembayaran. */
export async function mulaiBayar(k: KonfigMidtrans, user: { id: number; email: string; nama: string }, paket: Paket, asalApp: string): Promise<string> {
  if (!paket.aktif || paket.harga < 1000) throw new MidtransError("Paket ini tidak bisa dibeli.");
  const orderId = `WA-${user.id}-${sekarang()}-${randomBytes(3).toString("hex")}`;
  const sql = await db();
  await sql`
    INSERT INTO transaksi(order_id, user_id, paket_id, nama_paket, jumlah, status, dibuat)
    VALUES (${orderId}, ${user.id}, ${paket.id}, ${paket.nama}, ${paket.harga}, 'menunggu', ${sekarang()})`;
  const snap = await buatSnap(k, {
    orderId,
    jumlah: paket.harga,
    item: { id: paket.kode, nama: `Paket ${paket.nama} (${paket.durasi_hari} hari)` },
    pelanggan: { nama: user.nama || user.email.split("@")[0], email: user.email },
    selesaiUrl: `${asalApp}/langganan?order=${encodeURIComponent(orderId)}`,
  });
  await sql`UPDATE transaksi SET snap_token = ${snap.token}, redirect_url = ${snap.redirectUrl} WHERE order_id = ${orderId}`;
  return snap.redirectUrl;
}

/**
 * Terapkan status terbaru dari Midtrans ke transaksi (idempoten: aman dipanggil berkali-kali oleh webhook dan
 * halaman "selesai bayar"). Paket diaktifkan TEPAT SEKALI saat status berubah menjadi lunas.
 * Nominal harus sama persis dengan tagihan kita.
 */
export async function terapkanStatus(k: KonfigMidtrans, orderId: string): Promise<{ status: StatusBayar; baruAktif: boolean } | null> {
  const s = await statusMidtrans(k, orderId);
  const status = petaStatus(s);
  return transaksiDb(async (tx) => {
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
    const id = await aktifkan(tx, { userId: t.user_id, paketId: t.paket_id, sumber: "midtrans" });
    await tx`UPDATE transaksi SET langganan_id = ${id} WHERE id = ${t.id}`;
    segarkanKuota(t.user_id);
    return { status, baruAktif: true };
  });
}

/**
 * Aktifkan paket untuk pengguna. Paket sama dengan yang sedang aktif = DIPERPANJANG (masa ditambah, kuota balasan
 * ditambah). Paket lain = mulai baru sekarang (naik/turun paket), sisa paket lama tidak dibawa.
 */
async function aktifkan(tx: Tx, a: { userId: number; paketId: number | null; sumber: "midtrans" | "admin"; hari?: number }): Promise<number> {
  const [p] = a.paketId ? await tx<Paket[]>`SELECT ${tx.unsafe(KOLOM_PAKET)} FROM paket WHERE id = ${a.paketId}` : [];
  if (!p) throw new Error("Paket tidak ditemukan.");
  const kini = sekarang();
  const durasi = (a.hari ?? p.durasi_hari) * 86400;
  const [l] = await tx<Langganan[]>`
    SELECT id, user_id, paket_id, nama_paket, mulai, sampai, kuota_nomor, kuota_balasan, sumber FROM langganan
     WHERE user_id = ${a.userId} AND sampai > ${kini} ORDER BY sampai DESC, id DESC LIMIT 1 FOR UPDATE`;
  if (l && l.paket_id === p.id) {
    await tx`UPDATE langganan SET sampai = sampai + ${durasi}, kuota_balasan = kuota_balasan + ${p.kuota_balasan} WHERE id = ${l.id}`;
    return l.id;
  }
  if (l) await tx`UPDATE langganan SET sampai = ${kini} WHERE id = ${l.id}`; // diganti paket baru
  const [baru] = await tx<{ id: number }[]>`
    INSERT INTO langganan(user_id, paket_id, nama_paket, mulai, sampai, kuota_nomor, kuota_balasan, sumber)
    VALUES (${a.userId}, ${p.id}, ${p.nama}, ${kini}, ${kini + durasi}, ${p.kuota_nomor}, ${p.kuota_balasan}, ${a.sumber})
    RETURNING id`;
  return baru.id;
}

/** Admin memberi/memperpanjang paket secara manual (mis. bayar tunai, kompensasi). */
export async function berikanPaket(userId: number, paketId: number, hari?: number): Promise<void> {
  await transaksiDb((tx) => aktifkan(tx, { userId, paketId, sumber: "admin", hari }));
  segarkanKuota(userId);
}

/** Admin menghentikan langganan aktif seorang pengguna (kembali ke kuota gratis). */
export async function hentikanLangganan(userId: number): Promise<void> {
  const sql = await db();
  await sql`UPDATE langganan SET sampai = ${sekarang()} WHERE user_id = ${userId} AND sampai > ${sekarang()}`;
  segarkanKuota(userId);
}
