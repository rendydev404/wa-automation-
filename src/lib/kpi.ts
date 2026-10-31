import "server-only";
import { db, sekarang } from "./db";

/**
 * Angka KPI untuk Ringkasan panel admin, dihitung langsung dari data (tanpa tabel ringkasan terpisah). Periode
 * utama = 30 hari terakhir, dibandingkan dengan 30 hari sebelumnya. Tanggal dikelompokkan menurut WIB, sama dengan
 * cara stats menyimpan tanggal. Status sambungan nomor (memori proses WhatsApp) dibaca di halaman, bukan di sini.
 */

const HARI = 86400;
export const PERIODE_HARI = 30;

export interface DeretHari {
  tanggal: string; // YYYY-MM-DD WIB
  nilai: number;
}

export interface KpiAdmin {
  /** Hari-hari periode (YYYY-MM-DD WIB, terlama dulu); hari terakhir = hari ini. */
  hari: string[];
  pendapatan: { kini: number; lalu: number; transaksi: number; harian: DeretHari[] };
  /** Akun bukan admin dengan langganan aktif: sekarang, 30 hari lalu, dan per hari. */
  berbayar: { kini: number; lalu: number; harian: DeretHari[]; perPaket: { nama: string; jumlah: number }[] };
  balasan: { kini: number; lalu: number; masuk: number; harian: { tanggal: string; masuk: number; dibalas: number }[] };
  biayaAiUsd: { kini: number; lalu: number };
  akun: { total: number; pengguna: number; aktif: number; diblokir: number; admin: number; baruKini: number; baruLalu: number };
  diteruskan: { kini: number; lalu: number };
  /** Pembayaran Midtrans yang dibuat 7 hari terakhir dan belum lunas. */
  menunggu: { jumlah: number; nilai: number };
  /** Langganan yang berakhir dalam 7 hari (belum diperpanjang). */
  berakhir: { userId: number; email: string; paket: string; sampai: number }[];
  /** Langganan aktif yang sudah memakai >= 80% kuota balasan. */
  kuotaMenipis: { userId: number; email: string; paket: string; terpakai: number; kuota: number }[];
  nomor: { total: number; tertaut: { sesi: string; label: string; userId: number; email: string }[] };
}

/** Kunci tanggal WIB `n` hari terakhir yang berakhir di `kini` (terlama dulu). */
function tanggalTerakhir(kini: number, n: number): string[] {
  const wib = (t: number) => new Date((t + 7 * 3600) * 1000).toISOString().slice(0, 10);
  return Array.from({ length: n }, (_, i) => wib(kini - (n - 1 - i) * HARI));
}

const isiDeret = (hari: string[], baris: { tanggal: string; nilai: number }[]): DeretHari[] => {
  const per = new Map(baris.map((b) => [b.tanggal, Number(b.nilai)]));
  return hari.map((t) => ({ tanggal: t, nilai: per.get(t) ?? 0 }));
};

export async function kpiAdmin(): Promise<KpiAdmin> {
  const sql = await db();
  const kini = sekarang();
  const awal = kini - PERIODE_HARI * HARI;
  const awalLalu = kini - 2 * PERIODE_HARI * HARI;
  const [tglLalu] = tanggalTerakhir(kini, 2 * PERIODE_HARI);
  const hari = tanggalTerakhir(kini, PERIODE_HARI);
  const tglAwal = hari[0];

  const [pend, pendHarian, bayar, bayarHarian, perPaket, stat, statHarian, biaya, akun, terus, tunggu, berakhir, menipis, nomor] = await Promise.all([
    sql<{ kini: string; lalu: string; n: number }[]>`
      SELECT COALESCE(SUM(jumlah) FILTER (WHERE dibayar >= ${awal}), 0)::bigint AS kini,
             COALESCE(SUM(jumlah) FILTER (WHERE dibayar < ${awal}), 0)::bigint AS lalu,
             COUNT(*) FILTER (WHERE dibayar >= ${awal} AND jumlah > 0)::int AS n
        FROM transaksi WHERE status = 'lunas' AND dibayar >= ${awalLalu}`,
    sql<{ tanggal: string; nilai: number }[]>`
      SELECT to_char(to_timestamp(dibayar) AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD') AS tanggal, SUM(jumlah)::bigint AS nilai
        FROM transaksi WHERE status = 'lunas' AND dibayar >= ${awal} GROUP BY 1`,
    sql<{ kini: number; lalu: number }[]>`
      SELECT COUNT(DISTINCT l.user_id) FILTER (WHERE l.mulai <= ${kini} AND l.sampai > ${kini})::int AS kini,
             COUNT(DISTINCT l.user_id) FILTER (WHERE l.mulai <= ${awal} AND l.sampai > ${awal})::int AS lalu
        FROM langganan l JOIN users u ON u.id = l.user_id AND u.peran <> 'admin'
       WHERE l.sampai > ${awal}`,
    // Satu titik per hari (pada jam yang sama dengan sekarang): jumlah akun berbayar saat itu.
    sql<{ tanggal: string; nilai: number }[]>`
      SELECT to_char(to_timestamp(t) AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD') AS tanggal, COUNT(DISTINCT l.user_id)::int AS nilai
        FROM generate_series(${awal + HARI}::bigint, ${kini}::bigint, ${HARI}::bigint) AS t
        JOIN langganan l ON l.mulai <= t AND l.sampai > t
        JOIN users u ON u.id = l.user_id AND u.peran <> 'admin'
       GROUP BY 1`,
    sql<{ nama: string; jumlah: number }[]>`
      SELECT l.nama_paket AS nama, COUNT(DISTINCT l.user_id)::int AS jumlah
        FROM langganan l JOIN users u ON u.id = l.user_id AND u.peran <> 'admin'
       WHERE l.mulai <= ${kini} AND l.sampai > ${kini} GROUP BY 1 ORDER BY 2 DESC, 1`,
    sql<{ dibalas: number; dibalas_lalu: number; masuk: number }[]>`
      SELECT COALESCE(SUM(dibalas) FILTER (WHERE tanggal >= ${tglAwal}::date), 0)::int AS dibalas,
             COALESCE(SUM(dibalas) FILTER (WHERE tanggal < ${tglAwal}::date), 0)::int AS dibalas_lalu,
             COALESCE(SUM(masuk) FILTER (WHERE tanggal >= ${tglAwal}::date), 0)::int AS masuk
        FROM stats WHERE tanggal >= ${tglLalu}::date`,
    sql<{ tanggal: string; masuk: number; dibalas: number }[]>`
      SELECT to_char(tanggal, 'YYYY-MM-DD') AS tanggal, SUM(masuk)::int AS masuk, SUM(dibalas)::int AS dibalas
        FROM stats WHERE tanggal >= ${tglAwal}::date GROUP BY 1`,
    sql<{ kini: number; lalu: number }[]>`
      SELECT COALESCE(SUM(biaya_usd) FILTER (WHERE waktu >= ${awal}), 0)::float8 AS kini,
             COALESCE(SUM(biaya_usd) FILTER (WHERE waktu < ${awal}), 0)::float8 AS lalu
        FROM ai_pakai WHERE waktu >= ${awalLalu}`,
    sql<KpiAdmin["akun"][]>`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE peran <> 'admin')::int AS pengguna,
             COUNT(*) FILTER (WHERE status = 'aktif')::int AS aktif,
             COUNT(*) FILTER (WHERE status = 'diblokir')::int AS diblokir,
             COUNT(*) FILTER (WHERE peran = 'admin')::int AS admin,
             COUNT(*) FILTER (WHERE created_at >= ${awal})::int AS "baruKini",
             COUNT(*) FILTER (WHERE created_at >= ${awalLalu} AND created_at < ${awal})::int AS "baruLalu"
        FROM users`,
    sql<{ kini: number; lalu: number }[]>`
      SELECT COUNT(*) FILTER (WHERE created_at >= ${awal})::int AS kini, COUNT(*) FILTER (WHERE created_at < ${awal})::int AS lalu
        FROM teruskan WHERE status = 'terkirim' AND jenis <> 'uji' AND created_at >= ${awalLalu}`,
    sql<{ jumlah: number; nilai: string }[]>`
      SELECT COUNT(*)::int AS jumlah, COALESCE(SUM(jumlah), 0)::bigint AS nilai
        FROM transaksi WHERE status = 'menunggu' AND dibuat >= ${kini - 7 * HARI}`,
    // Langganan terakhir tiap akun; hanya yang berakhir dalam 7 hari.
    sql<KpiAdmin["berakhir"]>`
      SELECT * FROM (
        SELECT DISTINCT ON (l.user_id) l.user_id AS "userId", u.email, l.nama_paket AS paket, l.sampai
          FROM langganan l JOIN users u ON u.id = l.user_id AND u.peran <> 'admin'
         WHERE l.sampai > ${kini}
         ORDER BY l.user_id, l.sampai DESC) x
       WHERE sampai <= ${kini + 7 * HARI} ORDER BY sampai LIMIT 6`,
    // Pemakaian dihitung sama dengan balasanTerpakai (langganan.ts): balasan AI semua nomor akun sejak langganan mulai.
    sql<KpiAdmin["kuotaMenipis"]>`
      SELECT l.user_id AS "userId", u.email, l.nama_paket AS paket, l.kuota_balasan AS kuota, p.terpakai
        FROM langganan l JOIN users u ON u.id = l.user_id AND u.peran <> 'admin'
        CROSS JOIN LATERAL (
          SELECT COUNT(*)::int AS terpakai FROM numbers n JOIN ai_pakai a ON a.number_id = n.id AND a.waktu >= l.mulai AND NOT a.abaikan
           WHERE n.user_id = l.user_id) p
       WHERE l.mulai <= ${kini} AND l.sampai > ${kini} AND l.kuota_balasan > 0 AND p.terpakai >= l.kuota_balasan * 0.8
       ORDER BY p.terpakai::float8 / l.kuota_balasan DESC LIMIT 6`,
    sql<{ total: number; tertaut: KpiAdmin["nomor"]["tertaut"] | null }[]>`
      SELECT COUNT(*)::int AS total,
             json_agg(json_build_object('sesi', n.sesi, 'label', n.label, 'userId', n.user_id, 'email', u.email) ORDER BY n.id)
               FILTER (WHERE n.wa_id IS NOT NULL AND u.status = 'aktif') AS tertaut
        FROM numbers n JOIN users u ON u.id = n.user_id`,
  ]);

  const statPer = new Map(statHarian.map((s) => [s.tanggal, s]));
  return {
    hari,
    pendapatan: { kini: Number(pend[0].kini), lalu: Number(pend[0].lalu), transaksi: pend[0].n, harian: isiDeret(hari, pendHarian) },
    berbayar: { kini: bayar[0].kini, lalu: bayar[0].lalu, harian: isiDeret(hari, bayarHarian), perPaket: [...perPaket] },
    balasan: {
      kini: stat[0].dibalas,
      lalu: stat[0].dibalas_lalu,
      masuk: stat[0].masuk,
      harian: hari.map((t) => ({ tanggal: t, masuk: statPer.get(t)?.masuk ?? 0, dibalas: statPer.get(t)?.dibalas ?? 0 })),
    },
    biayaAiUsd: { kini: biaya[0].kini, lalu: biaya[0].lalu },
    akun: akun[0],
    diteruskan: terus[0],
    menunggu: { jumlah: tunggu[0].jumlah, nilai: Number(tunggu[0].nilai) },
    berakhir: [...berakhir],
    kuotaMenipis: [...menipis],
    nomor: { total: nomor[0].total, tertaut: nomor[0].tertaut ?? [] },
  };
}
