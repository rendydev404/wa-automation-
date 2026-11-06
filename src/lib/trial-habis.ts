import "server-only";
import { db, sekarang } from "./db";
import { type HakAkun, type Paket, aturanPercobaan, daftarPaket, hakAkun, sisaKuotaAi } from "./langganan";
import { nomorMilik } from "./numbers";

/**
 * Data halaman /trial-habis: hasil nyata akun gratis selama kuota/masa free trial-nya berjalan, untuk meyakinkan pemilik
 * akun berlangganan. Semua dihitung di database dan dibatasi:
 *   - balasan AI & kapan terakhir: ai_pakai lewat ai_pakai_nomor_waktu_idx (rentang periode, per nomor milik akun);
 *   - balasan bot (kecepatan & di luar jam kerja): paling banyak BATAS_BALASAN balasan terbaru periode ini, pesan
 *     pelanggan sebelumnya dicari per balasan lewat pesan_chat_percakapan_idx (LIMIT 1, tanpa memindai chat);
 *   - pesan masuk & chat yang menunggu sejak AI berhenti: percakapan_nomor_waktu_idx (hanya chat yang aktif sesudahnya).
 */

const BATAS_BALASAN = 1000;
/** Jam kerja WIB untuk "dibalas di luar jam kerja": 08.00–16.59. */
const JAM_KERJA = [8, 16] as const;

export interface ChatMenunggu {
  nama: string | null;
  cuplikan: string;
  waktu: number;
}

export interface DataTrialHabis {
  hak: HakAkun;
  /** "kuota" = balasan gratis habis; "waktu" = masa free trial lewat. */
  alasan: "kuota" | "waktu";
  /** Free trial sekali pakai (bukan kuota gratis bulanan). */
  percobaan: boolean;
  batasBalasan: number;
  hariPercobaan: number;
  namaUsaha: string;
  balasanAi: number;
  pelangganDilayani: number;
  /** Rata-rata detik dari pesan pelanggan sampai dibalas AI; null = belum ada pasangan yang bisa diukur. */
  rataDetik: number | null;
  luarJamKerja: number;
  /** Kapan AI berhenti membalas (detik epoch); null = tidak diketahui. */
  berhentiPada: number | null;
  pesanMasukSejakBerhenti: number;
  chatMenunggu: number;
  contohMenunggu: ChatMenunggu[];
  /** Perkiraan pesan pelanggan per hari selama periode (dasar kalkulator & rekomendasi paket). */
  pesanPerHari: number;
  paket: Pick<Paket, "id" | "kode" | "nama" | "harga" | "durasi_hari" | "kuota_balasan" | "kuota_nomor" | "deskripsi" | "unggulan">[];
}

/**
 * null = halaman ini tidak berlaku untuk akun ini (admin, sedang berlangganan, kuota masih ada, atau pernah berlangganan:
 * pelanggan lama diarahkan ke halaman Langganan biasa).
 */
export async function dataTrialHabis(user: { id: number; peran: string; nama: string }): Promise<DataTrialHabis | null> {
  if (user.peran === "admin") return null;
  const sql = await db();
  const [hak, sisa, aturan, nomor, [riwayat]] = await Promise.all([
    hakAkun(user),
    sisaKuotaAi(user.id),
    aturanPercobaan(),
    nomorMilik(user.id),
    sql<{ ada: boolean }[]>`SELECT EXISTS (SELECT 1 FROM langganan WHERE user_id = ${user.id}) AS ada`,
  ]);
  if (hak.sampai !== null || riwayat.ada) return null;
  if (!hak.percobaanBerakhir && sisa !== 0) return null;

  const mulai = hak.periodeMulai;
  const kini = sekarang();
  const [[pakai], paket] = await Promise.all([
    sql<{ n: number; akhir: number | null }[]>`
      SELECT COUNT(*)::int AS n, MAX(a.waktu)::bigint AS akhir
        FROM numbers n JOIN ai_pakai a ON a.number_id = n.id AND a.waktu >= ${mulai} AND NOT a.abaikan
       WHERE n.user_id = ${user.id}`,
    daftarPaket(),
  ]);
  const alasan: DataTrialHabis["alasan"] = hak.percobaanBerakhir && (hak.balasan === null || pakai.n < hak.balasan) ? "waktu" : "kuota";
  const berhentiPada = alasan === "waktu" ? hak.percobaanSampai : pakai.akhir;
  const sampai = berhentiPada ?? kini;
  const sejakBerhenti = berhentiPada ?? kini;

  const [[balas], [masuk], contoh] = await Promise.all([
    sql<{ n: number; chat: number; rata: number | null; luar: number }[]>`
      WITH b AS (
        SELECT m.percakapan_id, m.id, m.waktu
          FROM numbers n
          JOIN percakapan p ON p.number_id = n.id AND p.terakhir_pada >= ${mulai}
          JOIN pesan_chat m ON m.percakapan_id = p.id AND m.peran = 1 AND m.waktu >= ${mulai} AND m.waktu <= ${sampai}
         WHERE n.user_id = ${user.id}
         ORDER BY m.id DESC LIMIT ${BATAS_BALASAN}
      )
      SELECT COUNT(*)::int AS n, COUNT(DISTINCT b.percakapan_id)::int AS chat,
             AVG(b.waktu - q.waktu) FILTER (WHERE b.waktu - q.waktu BETWEEN 0 AND 600)::float AS rata,
             COUNT(*) FILTER (WHERE EXTRACT(HOUR FROM to_timestamp(b.waktu) AT TIME ZONE 'Asia/Jakarta') NOT BETWEEN ${JAM_KERJA[0]} AND ${JAM_KERJA[1]})::int AS luar
        FROM b
        LEFT JOIN LATERAL (
          SELECT q.waktu FROM pesan_chat q WHERE q.percakapan_id = b.percakapan_id AND q.id < b.id AND q.peran = 0 ORDER BY q.id DESC LIMIT 1
        ) q ON true`,
    sql<{ periode: number; sejak: number; menunggu: number }[]>`
      SELECT COUNT(*) FILTER (WHERE m.waktu >= ${mulai})::int AS periode,
             COUNT(*) FILTER (WHERE m.waktu >= ${sejakBerhenti})::int AS sejak,
             COUNT(DISTINCT p.id) FILTER (WHERE p.pengirim_akhir = 0 AND p.terakhir_pada >= ${sejakBerhenti})::int AS menunggu
        FROM numbers n
        JOIN percakapan p ON p.number_id = n.id AND p.terakhir_pada >= ${mulai} AND p.spam <> 1
        JOIN pesan_chat m ON m.percakapan_id = p.id AND m.peran = 0 AND m.waktu >= ${mulai}
       WHERE n.user_id = ${user.id}`,
    sql<ChatMenunggu[]>`
      SELECT p.nama, p.cuplikan, p.terakhir_pada AS waktu
        FROM numbers n
        JOIN percakapan p ON p.number_id = n.id AND p.terakhir_pada >= ${sejakBerhenti} AND p.pengirim_akhir = 0 AND p.spam <> 1
       WHERE n.user_id = ${user.id}
       ORDER BY p.terakhir_pada DESC, p.id DESC LIMIT 3`,
  ]);

  const hari = Math.max(1, (kini - mulai) / 86400);
  return {
    hak,
    alasan,
    percobaan: hak.percobaan,
    batasBalasan: hak.balasan ?? aturan.balasan,
    hariPercobaan: aturan.hari,
    namaUsaha: nomor.find((n) => n.nama_wa)?.nama_wa || nomor[0]?.label || user.nama || "",
    balasanAi: Math.max(pakai.n, balas.n),
    pelangganDilayani: balas.chat,
    rataDetik: balas.rata === null ? null : Math.max(1, Math.round(balas.rata)),
    luarJamKerja: balas.luar,
    berhentiPada,
    pesanMasukSejakBerhenti: berhentiPada === null ? 0 : masuk.sejak,
    chatMenunggu: berhentiPada === null ? 0 : masuk.menunggu,
    contohMenunggu: berhentiPada === null ? [] : contoh.map((c) => ({ ...c, cuplikan: c.cuplikan.slice(0, 140) })),
    pesanPerHari: Math.max(0, Math.round(masuk.periode / hari)),
    paket: paket
      .filter((p) => p.harga > 0)
      .sort((a, b) => a.harga - b.harga)
      .map(({ id, kode, nama, harga, durasi_hari, kuota_balasan, kuota_nomor, deskripsi, unggulan }) => ({ id, kode, nama, harga, durasi_hari, kuota_balasan, kuota_nomor, deskripsi, unggulan })),
  };
}
