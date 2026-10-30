import "server-only";
import { db, sekarang } from "./db";

/**
 * Histori percakapan per nomor WhatsApp.
 *
 * Arsitektur hemat resource PostgreSQL:
 *   1. Tabel `percakapan` memegang 1 baris per lawan bicara per nomor beserta cuplikan pesan
 *      terakhir dan penghitung (`masuk_n`, `bot_n`, `manusia_n`). Membuka daftar percakapan
 *      hanya melakukan Index Scan pada `percakapan_nomor_waktu_idx (number_id, terakhir_pada DESC, id DESC)`
 *      tanpa menyentuh tabel `pesan_chat` dan tanpa `GROUP BY`.
 *   2. Tabel `pesan_chat` hanya menyimpan 5 kolom sempit (`id`, `percakapan_id`, `peran`, `teks`, `waktu`)
 *      dengan satu indeks komposit `(percakapan_id, id DESC)` dan dibaca memakai kursor `id` (tanpa OFFSET).
 *   3. Setiap pesan dicatat lewat satu pernyataan CTE tunggal (`INSERT ... ON CONFLICT ... RETURNING id`
 *      diikuti `INSERT INTO pesan_chat`), dijalankan di latar belakang sehingga tidak menahan proses chat.
 */

/** 0 = pelanggan, 1 = bot AI, 2 = manusia (HP pemilik nomor). */
export type PeranPesan = 0 | 1 | 2;

export type FilterPercakapan = "semua" | "bot" | "manusia";

export interface ItemPercakapan {
  id: number;
  telepon: string | null;
  nama: string | null;
  cuplikan: string;
  pengirim_akhir: PeranPesan;
  masuk_n: number;
  bot_n: number;
  manusia_n: number;
  terakhir_pada: number;
  jeda_sampai: number;
}

export interface ItemPesan {
  id: number;
  peran: PeranPesan;
  teks: string;
  waktu: number;
}

export interface RingkasanPercakapan {
  total_percakapan: number;
  total_masuk: number;
  total_bot: number;
  total_manusia: number;
}

const MAKS_TEKS_SIMPAN = 2_000;
const MAKS_CUPLIKAN = 160;
const MAKS_NAMA = 80;
const BATAS_PERCAKAPAN_DEFAULT = 25;
const BATAS_PERCAKAPAN_MAKS = 50;
const BATAS_PESAN_DEFAULT = 50;
const BATAS_PESAN_MAKS = 100;

function bersihkanCuplikan(teks: string): string {
  return teks.replace(/\s+/g, " ").trim().slice(0, MAKS_CUPLIKAN);
}

/**
 * Catat satu pesan ke dalam histori percakapan dalam satu pernyataan SQL (CTE).
 * Satu perjalanan ke database memperbarui ringkasan `percakapan` sekaligus menyisipkan `pesan_chat`.
 */
export async function catatPesan(d: {
  numberId: number;
  kunci: string;
  peran: PeranPesan;
  teks: string;
  waktu?: number;
  telepon?: string | null;
  nama?: string | null;
}): Promise<void> {
  const teksBersih = d.teks.replace(/\u0000/g, "").trim().slice(0, MAKS_TEKS_SIMPAN);
  if (!teksBersih) return;
  const cuplikan = bersihkanCuplikan(teksBersih);
  const waktu = d.waktu && d.waktu > 0 ? Math.floor(d.waktu) : sekarang();
  const telepon = d.telepon ? d.telepon.replace(/\D/g, "").slice(0, 24) || null : null;
  const nama = d.nama ? d.nama.replace(/\u0000/g, "").trim().slice(0, MAKS_NAMA) || null : null;
  const masuk = d.peran === 0 ? 1 : 0;
  const bot = d.peran === 1 ? 1 : 0;
  const manusia = d.peran === 2 ? 1 : 0;

  const sql = await db();
  await sql`
    WITH p AS (
      INSERT INTO percakapan (number_id, kunci, telepon, nama, cuplikan, pengirim_akhir, masuk_n, bot_n, manusia_n, terakhir_pada)
      VALUES (${d.numberId}, ${d.kunci}, ${telepon}, ${nama}, ${cuplikan}, ${d.peran}, ${masuk}, ${bot}, ${manusia}, ${waktu})
      ON CONFLICT (kunci) DO UPDATE SET
        telepon        = COALESCE(EXCLUDED.telepon, percakapan.telepon),
        nama           = COALESCE(EXCLUDED.nama, percakapan.nama),
        cuplikan       = EXCLUDED.cuplikan,
        pengirim_akhir = EXCLUDED.pengirim_akhir,
        masuk_n        = percakapan.masuk_n   + EXCLUDED.masuk_n,
        bot_n          = percakapan.bot_n     + EXCLUDED.bot_n,
        manusia_n      = percakapan.manusia_n + EXCLUDED.manusia_n,
        terakhir_pada  = GREATEST(percakapan.terakhir_pada, EXCLUDED.terakhir_pada)
      RETURNING id
    )
    INSERT INTO pesan_chat (percakapan_id, peran, teks, waktu)
    SELECT id, ${d.peran}, ${teksBersih}, ${waktu} FROM p`;
}

/** Ringkasan total untuk satu nomor; hanya memindai baris `percakapan` milik nomor itu (tanpa menyentuh `pesan_chat`). */
export async function ringkasanPercakapan(numberId: number): Promise<RingkasanPercakapan> {
  const sql = await db();
  const [r] = await sql<RingkasanPercakapan[]>`
    SELECT COUNT(*)::int AS total_percakapan,
           COALESCE(SUM(masuk_n), 0)::int AS total_masuk,
           COALESCE(SUM(bot_n), 0)::int AS total_bot,
           COALESCE(SUM(manusia_n), 0)::int AS total_manusia
      FROM percakapan
     WHERE number_id = ${numberId}`;
  return r ?? { total_percakapan: 0, total_masuk: 0, total_bot: 0, total_manusia: 0 };
}

/**
 * Daftar percakapan satu nomor dengan paginasi berbasis kursor `(terakhir_pada, id)` (tanpa OFFSET).
 * Bila tidak ada filter/pencarian, query berjalan murni di atas indeks `percakapan_nomor_waktu_idx`.
 */
export async function daftarPercakapan(
  numberId: number,
  opsi?: {
    filter?: FilterPercakapan;
    cari?: string;
    sebelumWaktu?: number;
    sebelumId?: number;
    batas?: number;
  }
): Promise<{ daftar: ItemPercakapan[]; adaLagi: boolean }> {
  const sql = await db();
  const batas = Math.min(Math.max(1, opsi?.batas ?? BATAS_PERCAKAPAN_DEFAULT), BATAS_PERCAKAPAN_MAKS);
  const filter = opsi?.filter ?? "semua";
  const cari = (opsi?.cari ?? "").trim().slice(0, 80);
  const adaKursor = Number.isInteger(opsi?.sebelumWaktu) && Number.isInteger(opsi?.sebelumId);
  const sWaktu = opsi?.sebelumWaktu ?? 0;
  const sId = opsi?.sebelumId ?? 0;

  let baris: ItemPercakapan[];
  if (!cari && filter === "semua" && !adaKursor) {
    // Jalur paling sering (buka halaman pertama tanpa filter): murni Index Scan berurutan pada percakapan_nomor_waktu_idx.
    baris = await sql<ItemPercakapan[]>`
      SELECT p.id, p.telepon, p.nama, p.cuplikan, p.pengirim_akhir,
             p.masuk_n, p.bot_n, p.manusia_n, p.terakhir_pada,
             COALESCE(cs.jeda_sampai, 0) AS jeda_sampai
        FROM percakapan p
        LEFT JOIN chat_state cs ON cs.kunci = p.kunci
       WHERE p.number_id = ${numberId}
       ORDER BY p.terakhir_pada DESC, p.id DESC
       LIMIT ${batas + 1}`;
  } else {
    const pola = cari ? `%${cari.replace(/[\\%_]/g, "\\$&")}%` : null;
    const digit = cari.replace(/\D/g, "");
    const polaDigit = digit ? `%${digit}%` : pola;
    baris = await sql<ItemPercakapan[]>`
      SELECT p.id, p.telepon, p.nama, p.cuplikan, p.pengirim_akhir,
             p.masuk_n, p.bot_n, p.manusia_n, p.terakhir_pada,
             COALESCE(cs.jeda_sampai, 0) AS jeda_sampai
        FROM percakapan p
        LEFT JOIN chat_state cs ON cs.kunci = p.kunci
       WHERE p.number_id = ${numberId}
         AND (${filter === "semua"} OR (${filter === "bot"} AND p.bot_n > 0) OR (${filter === "manusia"} AND p.manusia_n > 0))
         AND (${pola === null} OR p.nama ILIKE ${pola ?? ""} OR p.telepon LIKE ${polaDigit ?? ""} OR p.cuplikan ILIKE ${pola ?? ""})
         AND (${!adaKursor} OR (p.terakhir_pada, p.id) < (${sWaktu}, ${sId}))
       ORDER BY p.terakhir_pada DESC, p.id DESC
       LIMIT ${batas + 1}`;
  }

  const adaLagi = baris.length > batas;
  return { daftar: adaLagi ? baris.slice(0, batas) : [...baris], adaLagi };
}

/**
 * Ambil isi pesan sebuah percakapan milik `numberId`.
 * - Tanpa `setelahId`: mengambil pesan terbaru (atau sebelum `sebelumId`) memakai Index Scan pada `pesan_chat_percakapan_idx`,
 *   lalu diurutkan kronologis (lama -> baru) untuk ditampilkan.
 * - Dengan `setelahId`: mengambil hanya pesan yang baru masuk setelah `setelahId` (hemat transfer data saat penyegaran).
 */
export async function ambilPesanPercakapan(
  numberId: number,
  percakapanId: number,
  opsi?: {
    sebelumId?: number;
    setelahId?: number;
    batas?: number;
  }
): Promise<{ percakapan: ItemPercakapan; pesan: ItemPesan[]; adaSebelumnya: boolean } | null> {
  const sql = await db();
  const [percakapan] = await sql<ItemPercakapan[]>`
    SELECT p.id, p.telepon, p.nama, p.cuplikan, p.pengirim_akhir,
           p.masuk_n, p.bot_n, p.manusia_n, p.terakhir_pada,
           COALESCE(cs.jeda_sampai, 0) AS jeda_sampai
      FROM percakapan p
      LEFT JOIN chat_state cs ON cs.kunci = p.kunci
     WHERE p.id = ${percakapanId} AND p.number_id = ${numberId}`;
  if (!percakapan) return null;

  const batas = Math.min(Math.max(1, opsi?.batas ?? BATAS_PESAN_DEFAULT), BATAS_PESAN_MAKS);

  if (opsi?.setelahId && opsi.setelahId > 0) {
    const baru = await sql<ItemPesan[]>`
      SELECT id, peran, teks, waktu
        FROM pesan_chat
       WHERE percakapan_id = ${percakapanId} AND id > ${opsi.setelahId}
       ORDER BY id ASC
       LIMIT ${batas}`;
    return { percakapan, pesan: [...baru], adaSebelumnya: false };
  }

  const sebelumId = opsi?.sebelumId && opsi.sebelumId > 0 ? opsi.sebelumId : null;
  const baris =
    sebelumId === null
      ? await sql<ItemPesan[]>`
          SELECT id, peran, teks, waktu
            FROM pesan_chat
           WHERE percakapan_id = ${percakapanId}
           ORDER BY id DESC
           LIMIT ${batas + 1}`
      : await sql<ItemPesan[]>`
          SELECT id, peran, teks, waktu
            FROM pesan_chat
           WHERE percakapan_id = ${percakapanId} AND id < ${sebelumId}
           ORDER BY id DESC
           LIMIT ${batas + 1}`;

  const adaSebelumnya = baris.length > batas;
  const potong = adaSebelumnya ? baris.slice(0, batas) : [...baris];
  potong.reverse();
  return { percakapan, pesan: potong, adaSebelumnya };
}

const RIWAYAT_BARIS = 20;
const RIWAYAT_SESI_BARU = 10;
const RIWAYAT_TEKS_MAKS = 500;
const RIWAYAT_TOTAL_MAKS = 4_000;
const LABEL_PERAN: Record<PeranPesan, string> = { 0: "Pelanggan", 1: "Kamu (AI)", 2: "Pemilik nomor" };
const jamWib = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Isi chat yang belum ada di ingatan AI (riwayat Hermes per sesi), untuk disertakan di giliran AI berikutnya:
 * balasan manusia dari HP dan pesan pelanggan yang masuk selagi AI diam. Dengan begitu AI melanjutkan dari
 * apa yang sebenarnya terjadi di chat, bukan hanya dari yang pernah ia jawab.
 *   - Sesi Hermes yang sama: pesan SETELAH balasan AI terakhir (sebelumnya sudah ada di riwayat Hermes).
 *   - Sesi Hermes baru (pertama kali, atau setelah lama diam): `RIWAYAT_SESI_BARU` pesan terakhir sebagai latar.
 *   - `tertunda` pesan pelanggan paling akhir sedang dijawab (dikirim sebagai pesan biasa): tidak diulang.
 * Satu Index Scan pada pesan_chat_percakapan_idx (paling banyak RIWAYAT_BARIS baris).
 */
/** Penyedia tanpa ingatan (Claude API): seluruh percakapan sesi ini, paling banyak 20 baris dan ±6.000 karakter. */
const RIWAYAT_LENGKAP_MAKS = 6_000;

export async function riwayatUntukAi(kunci: string, opsi: { sesiBaru: boolean; tertunda: number; lengkap?: boolean }): Promise<string[]> {
  const sql = await db();
  const baris = await sql<{ peran: PeranPesan; teks: string; waktu: number }[]>`
    SELECT peran, teks, waktu
      FROM pesan_chat
     WHERE percakapan_id = (SELECT id FROM percakapan WHERE kunci = ${kunci})
     ORDER BY id DESC
     LIMIT ${RIWAYAT_BARIS}`;
  const urut = [...baris].reverse(); // lama -> baru
  let akhir = urut.length;
  for (let n = opsi.tertunda; n > 0 && akhir > 0 && urut[akhir - 1].peran === 0; n--) akhir--;
  let awal = 0; // lengkap: seluruh percakapan (paling banyak RIWAYAT_BARIS), obrolan tidak pernah dipotong karena lama diam
  if (opsi.lengkap) awal = 0;
  else if (opsi.sesiBaru) awal = Math.max(0, akhir - RIWAYAT_SESI_BARU);
  else for (let i = akhir - 1; i >= 0; i--) if (urut[i].peran === 1) { awal = i + 1; break; }

  // Anggaran dihitung dari yang terbaru: bila terlalu panjang, yang paling lama dibuang.
  const keluar: string[] = [];
  let terpakai = 0;
  for (let i = akhir - 1; i >= awal; i--) {
    const m = urut[i];
    const isi = m.teks.replace(/\s*\n\s*/g, " / ").slice(0, RIWAYAT_TEKS_MAKS);
    const baris = `[${jamWib.format(m.waktu * 1000)}] ${LABEL_PERAN[m.peran]}: ${isi}`;
    if (terpakai + baris.length > (opsi.lengkap ? RIWAYAT_LENGKAP_MAKS : RIWAYAT_TOTAL_MAKS) && keluar.length) break;
    keluar.push(baris);
    terpakai += baris.length;
  }
  return keluar.reverse();
}

/**
 * Pesan pelanggan yang baru saja dijawab manusia di percakapan `kunci` (dipakai pelajaran.ts):
 * rangkaian pesan pelanggan terakhir sebelum balasan itu, paling banyak 3 dan tidak lebih lama dari 6 jam.
 * Balasan manusia/AI di antaranya dilewati, jadi admin yang membetulkan jawaban AI tetap terpasang ke pertanyaannya.
 */
export async function pertanyaanTerakhir(kunci: string, waktuBalasan: number): Promise<string> {
  const sql = await db();
  const baris = await sql<{ peran: PeranPesan; teks: string; waktu: number }[]>`
    SELECT peran, teks, waktu
      FROM pesan_chat
     WHERE percakapan_id = (SELECT id FROM percakapan WHERE kunci = ${kunci})
     ORDER BY id DESC
     LIMIT 12`;
  const ambil: string[] = [];
  for (const m of baris) {
    if (m.peran !== 0) {
      if (ambil.length) break;
      continue;
    }
    if (waktuBalasan - m.waktu > 6 * 3600) break;
    const t = m.teks.replace(/\[(Lampiran media|Foto)\]/g, "").trim();
    if (t) ambil.push(t);
    if (ambil.length === 3) break;
  }
  return ambil.reverse().join("\n");
}

/**
 * Hapus histori percakapan milik `numberId`: satu percakapan (`percakapanId`) atau semuanya.
 * Isi pesan ikut terhapus lewat ON DELETE CASCADE (memakai indeks pesan_chat_percakapan_idx).
 * Keadaan chat (jeda AI, nomor sesi Hermes) di chat_state sengaja tidak disentuh.
 * Mengembalikan jumlah percakapan yang terhapus.
 */
export async function hapusPercakapan(numberId: number, percakapanId?: number): Promise<number> {
  const sql = await db();
  const hasil =
    percakapanId === undefined
      ? await sql`DELETE FROM percakapan WHERE number_id = ${numberId}`
      : await sql`DELETE FROM percakapan WHERE id = ${percakapanId} AND number_id = ${numberId}`;
  return hasil.count;
}
