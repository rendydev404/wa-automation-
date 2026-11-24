import "server-only";
import { randomBytes } from "node:crypto";
import { catatAktivitas } from "./aktivitas";
import { type Tx, db, getSetting, sekarang, transaksi } from "./db";

export interface Nomor {
  id: number;
  user_id: number | null; // pemilik nomor (users.id)
  pemilik_aktif: boolean; // pemiliknya tidak diblokir (nomor tanpa pemilik = aktif): AI hanya membalas bila true
  sesi: string; // nama sesi WhatsApp milik nomor ini (kunci wa_auth)
  wa_id: string | null; // digit saja; kosong sebelum QR dipindai
  label: string;
  nama_wa: string | null;
  bot_aktif: boolean;
  instruksi: string;
  tunggu_detik: number; // AI menunggu balasan manusia selama ini sebelum menjawab
  tunggu_baca_detik: number; // chat sudah dibuka manusia di HP tapi tidak dibalas: AI mengambil alih setelah ini
  jeda_detik: number; // setelah manusia membalas, AI diam di chat itu selama ini (0 = hanya pesan itu)
  belajar: boolean; // AI belajar dari balasan manusia di nomor ini (lihat pelajaran.ts)
  saring_spam: boolean; // spam & promosi judi tidak dibalas AI (lihat spam.ts)
  saring_prospek: boolean; // chat yang bukan prospek dibisukan; dipelajari ML (lihat prospek.ts)
  jalur: "baileys" | "resmi"; // jalur WhatsApp: Baileys (QR) atau Cloud API resmi Meta (lihat wa-resmi.ts)
  created_at: number;
  last_connected_at: number | null;
}

export interface NomorRingkas extends Nomor {
  jumlah_dokumen: number;
  jumlah_karakter: number;
  dibalas_hari_ini: number;
  masuk_hari_ini: number;
  jumlah_percakapan: number;
}

export const tanggalWib = (): string => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

/**
 * Semua nomor dipegang di memori (paling banyak puluhan baris) dan dimuat ulang hanya setelah ada
 * yang berubah. Tiap pesan WhatsApp dan tiap polling status membaca tabel ini; tanpa cache itu
 * berarti satu query per pesan. Aman karena hanya proses ini yang menulis tabel numbers, dan semua
 * tulisnya lewat modul ini.
 */
interface Cache {
  semua: Nomor[];
  perId: Map<number, Nomor>;
  perSesi: Map<string, Nomor>;
}
const g = globalThis as unknown as { __waNomor?: { janji: Promise<Cache> | null } };
const st = (g.__waNomor ??= { janji: null });

async function muat(): Promise<Cache> {
  const sql = await db();
  const semua = await sql<Nomor[]>`
    SELECT n.id, n.user_id, COALESCE(u.status = 'aktif', true) AS pemilik_aktif, n.sesi, n.wa_id, n.label, n.nama_wa, n.bot_aktif, n.instruksi,
           n.tunggu_detik, n.tunggu_baca_detik, n.jeda_detik, n.belajar, n.saring_spam, n.saring_prospek, n.jalur, n.created_at, n.last_connected_at
      FROM numbers n LEFT JOIN users u ON u.id = n.user_id
     ORDER BY n.id`;
  return { semua: [...semua], perId: new Map(semua.map((n) => [n.id, n])), perSesi: new Map(semua.map((n) => [n.sesi, n])) };
}

function cache(): Promise<Cache> {
  return (st.janji ??= muat().catch((e) => {
    st.janji = null;
    throw e;
  }));
}

const basi = (): void => {
  st.janji = null;
};

/** Dipanggil setelah status/pemilik pengguna berubah (blokir, hapus): cache nomor dimuat ulang. */
export const segarkanNomor = basi;

export async function semuaNomor(): Promise<Nomor[]> {
  return (await cache()).semua;
}

export async function nomorById(id: number): Promise<Nomor | undefined> {
  return (await cache()).perId.get(id);
}

/** Nomor milik satu pengguna, dari cache (tanpa query). */
export async function nomorMilik(userId: number): Promise<Nomor[]> {
  return (await cache()).semua.filter((n) => n.user_id === userId);
}

export async function nomorBySesi(sesi: string): Promise<Nomor | undefined> {
  return (await cache()).perSesi.get(sesi);
}

/**
 * Nomor milik `userId` + ringkasan knowledge, percakapan & statistik hari ini, satu query (tanpa N+1). `otomatis` =
 * dokumen otomatis (khusus admin, lihat AWALAN_OTOMATIS di knowledge.ts) ikut dihitung.
 */
export async function daftarNomor(userId: number, otomatis: boolean): Promise<NomorRingkas[]> {
  const sql = await db();
  const baris = await sql<NomorRingkas[]>`
    SELECT n.id, n.user_id, true AS pemilik_aktif, n.sesi, n.wa_id, n.label, n.nama_wa, n.bot_aktif, n.instruksi, n.tunggu_detik, n.tunggu_baca_detik, n.jeda_detik, n.belajar, n.saring_spam, n.saring_prospek, n.jalur, n.created_at, n.last_connected_at,
           COALESCE(d.jumlah, 0)   AS jumlah_dokumen,
           COALESCE(d.karakter, 0) AS jumlah_karakter,
           COALESCE(s.dibalas, 0)  AS dibalas_hari_ini,
           COALESCE(s.masuk, 0)    AS masuk_hari_ini,
           COALESCE(p.jumlah, 0)   AS jumlah_percakapan
      FROM numbers n
      LEFT JOIN LATERAL (SELECT COUNT(*) AS jumlah, SUM(jumlah_karakter) AS karakter
                           FROM documents WHERE number_id = n.id AND (${otomatis} OR nama_berkas IS NULL OR nama_berkas NOT LIKE 'sinkron:%')) d ON true
      LEFT JOIN stats s ON s.number_id = n.id AND s.tanggal = ${tanggalWib()}
      LEFT JOIN LATERAL (SELECT COUNT(*) AS jumlah FROM percakapan WHERE number_id = n.id) p ON true
     WHERE n.user_id = ${userId}
     ORDER BY n.id`;
  return [...baris];
}

export interface StatHari {
  number_id: number;
  tanggal: string; // YYYY-MM-DD (WIB)
  masuk: number;
  dibalas: number;
}

/**
 * Statistik harian sejak tanggal WIB `awal` (inklusif); hari tanpa aktivitas tidak punya baris.
 * Semua nomor seorang pengguna (`{ userId }`): JOIN dari numbers (indeks user_id) supaya tiap nomor dibaca
 * lewat primary key stats (number_id, tanggal). Diukur pada 30 nomor × 2 tahun (21.900 baris): 0,21 ms,
 * sedangkan filter tanggal saja = seq scan 1,8 ms.
 */
export async function statHarian(awal: string, sasaran: { userId: number } | number): Promise<StatHari[]> {
  const sql = await db();
  const baris =
    typeof sasaran === "object"
      ? await sql<StatHari[]>`
          SELECT s.number_id, to_char(s.tanggal, 'YYYY-MM-DD') AS tanggal, s.masuk, s.dibalas
            FROM numbers n
            JOIN stats s ON s.number_id = n.id AND s.tanggal >= ${awal}::date
           WHERE n.user_id = ${sasaran.userId}`
      : await sql<StatHari[]>`
          SELECT number_id, to_char(tanggal, 'YYYY-MM-DD') AS tanggal, masuk, dibalas
            FROM stats
           WHERE number_id = ${sasaran} AND tanggal >= ${awal}::date`;
  return [...baris];
}

/**
 * Buat jalur baru. Nama sesinya = id + akhiran acak, supaya nama sesi tidak pernah terpakai ulang
 * dan mewarisi keadaan chat serta riwayat percakapan (di Hermes) milik nomor yang sudah dihapus.
 */
export async function tambahNomor(label: string, userId: number | null = null): Promise<Nomor> {
  const sql = await db();
  const [n] = await sql<Nomor[]>`
    WITH baru AS (SELECT nextval(pg_get_serial_sequence('numbers', 'id'))::integer AS id)
    INSERT INTO numbers(id, user_id, sesi, label, created_at)
    SELECT id, ${userId}, 'n' || id || 'x' || ${randomBytes(4).toString("hex")}, ${label}, ${sekarang()} FROM baru
    RETURNING id, user_id, true AS pemilik_aktif, sesi, wa_id, label, nama_wa, bot_aktif, instruksi, tunggu_detik, tunggu_baca_detik, jeda_detik, belajar, saring_spam, saring_prospek, jalur, created_at, last_connected_at`;
  basi();
  return n;
}

/** Dipanggil saat sesi WhatsApp sebuah jalur terhubung: catat nomor yang dipasangkan. */
export async function catatTerhubung(id: number, waId: string, namaWa: string | null): Promise<void> {
  await transaksi(async (tx) => {
    // Nomor yang sama pindah jalur: lepaskan dari jalur lama (wa_id unik).
    await tx`UPDATE numbers SET wa_id = NULL WHERE wa_id = ${waId} AND id <> ${id}`;
    await tx`UPDATE numbers SET wa_id = ${waId}, nama_wa = COALESCE(${namaWa}, nama_wa), last_connected_at = ${sekarang()} WHERE id = ${id}`;
    await catatPercobaan(tx, id, waId);
  });
  basi();
}

/** Free trial sekali pakai sedang nyala (pengaturan admin, dibaca dari cache setelan tanpa query). Lihat langganan.ts aturanPercobaan. */
async function trialNyala(): Promise<boolean> {
  const [n, ulang] = await Promise.all([getSetting("kuota_percobaan"), getSetting("kuota_percobaan_ulang")]);
  return Number(n) > 0 && ulang !== "bulanan";
}

/**
 * Free trial (langganan.ts aturanPercobaan): nomor yang tersambung pertama kali di akun peran user SELAMA trial nyala =
 * trial akun itu dimulai (users.percobaan_mulai, sekali seumur akun). Nomor yang sudah pernah tersambung ke akun lain
 * (percobaan_wa, dicatat juga saat trial mati) menandai akun ini percobaan_tolak, yang berlaku bila admin menyalakan
 * "satu trial per nomor". Dipanggil tiap kali tersambung (termasuk setelah restart): akun yang trialnya sudah dimulai
 * dan nomornya sudah tercatat = 2 query PK.
 */
export async function catatPercobaan(tx: Tx, numberId: number, waId: string): Promise<void> {
  const [n] = await tx<{ user_id: number; sudah: boolean }[]>`
    SELECT u.id AS user_id, u.percobaan_mulai IS NOT NULL AS sudah FROM numbers n JOIN users u ON u.id = n.user_id
     WHERE n.id = ${numberId} AND u.peran = 'user'`;
  if (!n) return;
  const kini = sekarang();
  const [lama] = await tx<{ user_id: number | null }[]>`SELECT user_id FROM percobaan_wa WHERE wa_id = ${waId}`;
  if (!lama) await tx`INSERT INTO percobaan_wa(wa_id, user_id, mulai) VALUES (${waId}, ${n.user_id}, ${kini}) ON CONFLICT DO NOTHING`;
  if (n.sudah || !(await trialNyala())) return;
  // Pernah tersambung ke akun lain (termasuk akun yang sudah dihapus: user_id NULL).
  const dipakaiLain = !!lama && lama.user_id !== n.user_id;
  await tx`UPDATE users SET percobaan_mulai = ${kini}, percobaan_tolak = ${dipakaiLain} WHERE id = ${n.user_id} AND percobaan_mulai IS NULL`;
}

/**
 * Admin baru menyalakan free trial: akun peran user yang SUDAH tersambung tapi trialnya belum dimulai langsung mulai
 * sekarang (tanpa menunggu tersambung ulang). Ditolak bila salah satu nomor tersambungnya tercatat milik akun lain.
 * Satu UPDATE (numbers_user_idx + PK percobaan_wa). Mengembalikan jumlah akun yang dimulai.
 */
export async function mulaiPercobaanTersambung(): Promise<number> {
  if (!(await trialNyala())) return 0;
  const sql = await db();
  const r = await sql`
    UPDATE users u SET percobaan_mulai = ${sekarang()},
           percobaan_tolak = EXISTS (
             SELECT 1 FROM numbers n JOIN percobaan_wa p ON p.wa_id = n.wa_id
              WHERE n.user_id = u.id AND p.user_id IS DISTINCT FROM u.id)
     WHERE u.peran = 'user' AND u.percobaan_mulai IS NULL
       AND EXISTS (SELECT 1 FROM numbers n WHERE n.user_id = u.id AND n.wa_id IS NOT NULL)`;
  return r.count;
}

export const BATAS_TUNGGU_DETIK = { min: 2, maks: 120 } as const;
export const BATAS_TUNGGU_BACA_DETIK = { min: 2, maks: 600 } as const;
export const BATAS_JEDA_DETIK = { min: 0, maks: 86_400 } as const; // maks 24 jam

export async function ubahNomor(id: number, data: { label: string; instruksi: string; tungguDetik: number; tungguBacaDetik: number; jedaDetik: number }): Promise<void> {
  const sql = await db();
  await sql`
    UPDATE numbers SET label = ${data.label}, instruksi = ${data.instruksi}, tunggu_detik = ${data.tungguDetik},
           tunggu_baca_detik = ${data.tungguBacaDetik}, jeda_detik = ${data.jedaDetik}
     WHERE id = ${id}`;
  basi();
}

export async function setBotAktif(id: number, aktif: boolean): Promise<void> {
  const sql = await db();
  await sql`UPDATE numbers SET bot_aktif = ${aktif} WHERE id = ${id}`;
  basi();
}

/**
 * Nyalakan otomatis `bot_aktif` pada nomor milik `userId` yang sudah punya Informasi Usaha berisi,
 * dipanggil saat akun beralih dari tanpa kuota/langganan ke berlangganan/punya kuota aktif.
 * Lewat numbers_user_idx + semi-join documents_number_idx; tanpa tulis bila sudah aktif.
 */
export async function aktifkanBotSiap(userId: number, tx?: Tx): Promise<boolean> {
  const q = tx ?? (await db());
  const diubah = await q<{ id: number }[]>`
    UPDATE numbers n SET bot_aktif = true
     WHERE n.user_id = ${userId} AND NOT n.bot_aktif
       AND EXISTS (SELECT 1 FROM documents d WHERE d.number_id = n.id AND d.jumlah_karakter > 0)
     RETURNING n.id`;
  if (diubah.length && !tx) basi();
  return diubah.length > 0;
}

/** Pindah jalur WhatsApp nomor ini ('baileys' = QR, 'resmi' = Cloud API Meta). Hanya lewat wa-resmi.ts. */
export async function setJalur(id: number, jalur: Nomor["jalur"]): Promise<void> {
  const sql = await db();
  await sql`UPDATE numbers SET jalur = ${jalur} WHERE id = ${id}`;
  basi();
}

export async function setSaringSpam(id: number, aktif: boolean): Promise<void> {
  const sql = await db();
  await sql`UPDATE numbers SET saring_spam = ${aktif} WHERE id = ${id}`;
  basi();
}

export async function setSaringProspek(id: number, aktif: boolean): Promise<void> {
  const sql = await db();
  await sql`UPDATE numbers SET saring_prospek = ${aktif} WHERE id = ${id}`;
  basi();
}

export async function setBelajar(id: number, aktif: boolean): Promise<void> {
  const sql = await db();
  await sql`UPDATE numbers SET belajar = ${aktif} WHERE id = ${id}`;
  basi();
}

/** Nomor WhatsApp dirapikan dengan aturan yang sama di server dan browser (format.ts). */
export { rapikanNomorWa } from "./format";

export async function hapusNomor(id: number): Promise<void> {
  // documents, chunks, dan stats ikut terhapus (ON DELETE CASCADE).
  const sql = await db();
  await sql`DELETE FROM numbers WHERE id = ${id}`;
  basi();
}

export async function catatStat(numberId: number, kolom: "masuk" | "dibalas" | "gagal", n = 1): Promise<void> {
  catatAktivitas(numberId, kolom, n); // detak di memori untuk maskot dashboard (lewat poller status), tanpa query
  const sql = await db();
  const k = sql(kolom);
  await sql`
    INSERT INTO stats(number_id, tanggal, ${k}) VALUES (${numberId}, ${tanggalWib()}, ${n})
    ON CONFLICT (number_id, tanggal) DO UPDATE SET ${k} = stats.${k} + EXCLUDED.${k}`;
}
