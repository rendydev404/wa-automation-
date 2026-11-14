import "server-only";
import { db, sekarang } from "./db";
import { kanalSah, labelKanal } from "./harga";
import { METODE_MANUAL, type Transaksi } from "./langganan";
import type { InstruksiBayar, StatusBayar } from "./midtrans";

/**
 * Data halaman Transaksi admin: pencarian (ID pembelian, email/nama, ID pengguna), saringan status/paket/tanggal,
 * paginasi keyset (dibuat, id), ringkasan pendapatan, dan detail satu transaksi. Semua agregasi di PostgreSQL.
 *
 * Indeks yang dipakai: transaksi_dibuat_idx (urutan & keyset), transaksi_user_idx (cari per pengguna),
 * transaksi_order_pola_idx (awalan ID pembelian, migrasi v21), order_id UNIQUE (detail).
 */

export type FilterStatusTrx = "semua" | "lunas" | "menunggu" | "gagal" | "dikembalikan";
export const FILTER_STATUS_TRX: readonly { nilai: FilterStatusTrx; label: string }[] = [
  { nilai: "semua", label: "Semua" },
  { nilai: "lunas", label: "Lunas" },
  { nilai: "menunggu", label: "Menunggu" },
  { nilai: "gagal", label: "Gagal / batal" },
  { nilai: "dikembalikan", label: "Dikembalikan" },
];
/** "Gagal / batal" = tagihan yang tidak jadi dibayar. */
const STATUS_GAGAL: StatusBayar[] = ["gagal", "kedaluwarsa", "dibatalkan"];

export interface OpsiCariTrx {
  q?: string;
  status?: FilterStatusTrx;
  paketId?: number;
  /** Rentang tanggal dibuat (detik epoch, [dari, sampai)). */
  dari?: number;
  sampai?: number;
}

export interface BarisTrxAdmin extends Transaksi {
  email: string;
  nama_user: string;
  kode_paket: string | null;
  langganan_mulai: number | null;
  langganan_sampai: number | null;
}

const KOLOM = `t.id, t.order_id, t.user_id, t.paket_id, t.nama_paket, t.jumlah, t.status, t.metode, t.kanal, t.redirect_url,
  t.dibuat, t.dibayar, t.kedaluwarsa, t.catatan, u.email, u.nama AS nama_user, p.kode AS kode_paket,
  l.mulai AS langganan_mulai, l.sampai AS langganan_sampai`;

const lolosLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Kata kunci -> syarat SQL. ID pembelian ("WA-…", "ADM-…", "VCR-…") dicari dari awalannya lewat indeks pola. */
function syarat(sql: Awaited<ReturnType<typeof db>>, o: OpsiCariTrx, denganStatus: boolean) {
  const q = (o.q ?? "").trim().slice(0, 100);
  const awalan = /^(wa|adm|vcr)-/i.exec(q);
  const cari = !q
    ? sql`true`
    : awalan
      ? sql`t.order_id LIKE ${`${lolosLike(awalan[1].toUpperCase() + q.slice(awalan[1].length).toLowerCase())}%`}`
      : /^\d{1,9}$/.test(q)
        ? sql`(t.user_id = ${Number(q)} OR t.id = ${Number(q)})`
        : sql`t.user_id IN (SELECT id FROM users WHERE email LIKE ${`%${lolosLike(q.toLowerCase())}%`} OR lower(nama) LIKE ${`%${lolosLike(q.toLowerCase())}%`})`;
  const st = o.status ?? "semua";
  const status = !denganStatus || st === "semua" ? sql`true` : st === "gagal" ? sql`t.status IN ${sql(STATUS_GAGAL)}` : sql`t.status = ${st}`;
  const paket = o.paketId ? sql`t.paket_id = ${o.paketId}` : sql`true`;
  const dari = o.dari ? sql`t.dibuat >= ${o.dari}` : sql`true`;
  const sampai = o.sampai ? sql`t.dibuat < ${o.sampai}` : sql`true`;
  return sql`${cari} AND ${status} AND ${paket} AND ${dari} AND ${sampai}`;
}

export async function cariTransaksi(o: OpsiCariTrx & { sebelum?: { dibuat: number; id: number }; batas?: number }): Promise<{ daftar: BarisTrxAdmin[]; adaLagi: boolean }> {
  const sql = await db();
  const batas = Math.min(Math.max(o.batas ?? 30, 1), 5000);
  const kursor = o.sebelum ? sql`(t.dibuat, t.id) < (${o.sebelum.dibuat}, ${o.sebelum.id})` : sql`true`;
  const baris = await sql<BarisTrxAdmin[]>`
    SELECT ${sql.unsafe(KOLOM)}
      FROM transaksi t
      JOIN users u ON u.id = t.user_id
      LEFT JOIN paket p ON p.id = t.paket_id
      LEFT JOIN langganan l ON l.id = t.langganan_id
     WHERE ${syarat(sql, o, true)} AND ${kursor}
     ORDER BY t.dibuat DESC, t.id DESC
     LIMIT ${batas + 1}`;
  return { daftar: baris.slice(0, batas), adaLagi: baris.length > batas };
}

/** Jumlah per tab status (mengikuti kata kunci, paket & tanggal) dalam satu pemindaian. */
export async function hitungTransaksi(o: OpsiCariTrx): Promise<Record<FilterStatusTrx, number> & { nominal: number }> {
  const sql = await db();
  const [r] = await sql<(Record<FilterStatusTrx, number> & { nominal: number })[]>`
    SELECT COUNT(*)::int AS semua,
           COUNT(*) FILTER (WHERE t.status = 'lunas')::int AS lunas,
           COUNT(*) FILTER (WHERE t.status = 'menunggu')::int AS menunggu,
           COUNT(*) FILTER (WHERE t.status IN ${sql(STATUS_GAGAL)})::int AS gagal,
           COUNT(*) FILTER (WHERE t.status = 'dikembalikan')::int AS dikembalikan,
           COALESCE(SUM(t.jumlah) FILTER (WHERE t.status = 'lunas'), 0)::bigint AS nominal
      FROM transaksi t
     WHERE ${syarat(sql, o, false)}`;
  return { ...r, nominal: Number(r.nominal) };
}

export interface RingkasanTrx {
  pendapatan: number;
  lunas: number;
  pembeli: number;
  bulanIni: number;
  bulanIniN: number;
  bulanLalu: number;
  menunggu: number;
  perPaket: { nama_paket: string; kode: string | null; n: number; total: number }[];
}

/** Kartu ringkasan: dua query paralel (agregat + per paket), tanpa menarik baris mentah. */
export async function ringkasanTransaksi(): Promise<RingkasanTrx> {
  const sql = await db();
  const wib = new Date((sekarang() + 7 * 3600) * 1000);
  const awalBulan = Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), 1) / 1000 - 7 * 3600;
  const awalLalu = Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth() - 1, 1) / 1000 - 7 * 3600;
  const [[r], perPaket] = await Promise.all([
    sql<{ pendapatan: string; lunas: number; pembeli: number; bulan_ini: string; bulan_ini_n: number; bulan_lalu: string; menunggu: number }[]>`
      SELECT COALESCE(SUM(jumlah) FILTER (WHERE status = 'lunas'), 0)::bigint AS pendapatan,
             COUNT(*) FILTER (WHERE status = 'lunas')::int AS lunas,
             COUNT(DISTINCT user_id) FILTER (WHERE status = 'lunas' AND jumlah > 0)::int AS pembeli,
             COALESCE(SUM(jumlah) FILTER (WHERE status = 'lunas' AND COALESCE(dibayar, dibuat) >= ${awalBulan}), 0)::bigint AS bulan_ini,
             COUNT(*) FILTER (WHERE status = 'lunas' AND COALESCE(dibayar, dibuat) >= ${awalBulan})::int AS bulan_ini_n,
             COALESCE(SUM(jumlah) FILTER (WHERE status = 'lunas' AND COALESCE(dibayar, dibuat) >= ${awalLalu} AND COALESCE(dibayar, dibuat) < ${awalBulan}), 0)::bigint AS bulan_lalu,
             COUNT(*) FILTER (WHERE status = 'menunggu' AND (kedaluwarsa IS NULL OR kedaluwarsa > ${sekarang()}))::int AS menunggu
        FROM transaksi`,
    sql<{ nama_paket: string; kode: string | null; n: number; total: string }[]>`
      SELECT t.nama_paket, MAX(p.kode) AS kode, COUNT(*)::int AS n, SUM(t.jumlah)::bigint AS total
        FROM transaksi t LEFT JOIN paket p ON p.id = t.paket_id
       WHERE t.status = 'lunas'
       GROUP BY t.nama_paket
       ORDER BY total DESC, n DESC
       LIMIT 8`,
  ]);
  return {
    pendapatan: Number(r.pendapatan),
    lunas: r.lunas,
    pembeli: r.pembeli,
    bulanIni: Number(r.bulan_ini),
    bulanIniN: r.bulan_ini_n,
    bulanLalu: Number(r.bulan_lalu),
    menunggu: r.menunggu,
    perPaket: perPaket.map((x) => ({ ...x, total: Number(x.total) })),
  };
}

export interface DetailTrx extends BarisTrxAdmin {
  bayar: InstruksiBayar | null;
  /** Provider pembayaran asal transaksi ini (src/lib/gateway.ts). */
  gateway: string;
  langganan_id: number | null;
  kuota_nomor: number | null;
  kuota_balasan: number | null;
  komisi: { afiliator_id: number; email: string; nominal: number; komisi_jenis: "persen" | "rupiah"; komisi_acuan: number } | null;
  /** Transaksi lain milik pengguna yang sama (terbaru dulu). */
  lain: Pick<Transaksi, "order_id" | "nama_paket" | "jumlah" | "status" | "dibuat">[];
}

/** Satu transaksi lewat indeks unik order_id + data terkait (langganan, komisi afiliasi, transaksi lain pengguna itu). */
export async function detailTransaksi(orderId: string): Promise<DetailTrx | undefined> {
  const sql = await db();
  const [t] = await sql<(Omit<DetailTrx, "komisi" | "lain"> & { k_id: number | null; k_email: string | null; k_nominal: number | null; k_jenis: "persen" | "rupiah" | null; k_acuan: number | null })[]>`
    SELECT ${sql.unsafe(KOLOM)}, t.bayar, t.gateway, t.langganan_id, l.kuota_nomor, l.kuota_balasan,
           k.afiliator_id AS k_id, ka.email AS k_email, k.nominal AS k_nominal, k.komisi_jenis AS k_jenis, k.komisi_acuan AS k_acuan
      FROM transaksi t
      JOIN users u ON u.id = t.user_id
      LEFT JOIN paket p ON p.id = t.paket_id
      LEFT JOIN langganan l ON l.id = t.langganan_id
      LEFT JOIN komisi_afiliasi k ON k.transaksi_id = t.id
      LEFT JOIN users ka ON ka.id = k.afiliator_id
     WHERE t.order_id = ${orderId}`;
  if (!t) return undefined;
  const lain = await sql<DetailTrx["lain"]>`
    SELECT order_id, nama_paket, jumlah, status, dibuat FROM transaksi
     WHERE user_id = ${t.user_id} AND id <> ${t.id} ORDER BY dibuat DESC, id DESC LIMIT 6`;
  const { k_id, k_email, k_nominal, k_jenis, k_acuan, ...isi } = t;
  return {
    ...isi,
    komisi: k_id !== null && k_nominal !== null && k_jenis ? { afiliator_id: k_id, email: k_email ?? "", nominal: k_nominal, komisi_jenis: k_jenis, komisi_acuan: k_acuan ?? 0 } : null,
    lain: [...lain],
  };
}

type Cari = Record<string, string | string[] | undefined>;

/** Cara bayar yang dibaca manusia: kanal Midtrans, metode manual admin, klaim voucher, atau kode metode lama. */
export function labelMetode(t: { kanal: string | null; metode: string | null }): string {
  if (t.kanal && kanalSah(t.kanal)) return labelKanal(t.kanal);
  if (t.metode === "voucher") return "Voucher Panduan";
  if (t.metode && t.metode in METODE_MANUAL) return `${METODE_MANUAL[t.metode as keyof typeof METODE_MANUAL]} (dicatat admin)`;
  return t.metode ? t.metode.replace(/_/g, " ") : "—";
}

export const satu = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const TGL = /^\d{4}-\d{2}-\d{2}$/;
/** "2026-11-05" (WIB) -> detik epoch awal hari itu. */
const awalHariWib = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 1000 - 7 * 3600;
};

/** searchParams -> opsi pencarian (dipakai halaman & ekspor CSV, jadi hasilnya selalu sama). */
export function opsiDariParam(sp: Cari): OpsiCariTrx & { status: FilterStatusTrx } {
  const status = (FILTER_STATUS_TRX.find((f) => f.nilai === sp.s)?.nilai ?? "semua") as FilterStatusTrx;
  const paketId = Number(sp.paket);
  const dari = satu(sp.dari);
  const sampai = satu(sp.sampai);
  return {
    q: satu(sp.q),
    status,
    paketId: Number.isInteger(paketId) && paketId > 0 ? paketId : undefined,
    dari: TGL.test(dari) ? awalHariWib(dari) : undefined,
    sampai: TGL.test(sampai) ? awalHariWib(sampai) + 86400 : undefined,
  };
}

