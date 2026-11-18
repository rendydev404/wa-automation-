import "server-only";
import { createHmac } from "node:crypto";
import { type Sql, db, getSetting, sekarang, setSetting } from "./db";
import { catatPakai, tanyaAi } from "./ai";
import { formatWa, kirimSapaan, pasangKaitCs } from "./bridge";
import { ATURAN_LEWATI, GAYA_PESAN, type HasilSusun, alasanTahan, ambilLewati } from "./followup-aman";
import { rapikanNomorWa } from "./format";
import {
  BATAS_PESAN,
  BATAS_SETELAN,
  type BarisFollowup,
  JEDA_ANTARPESAN_MENIT,
  POLA_STOP,
  POLA_STOP_PENDEK,
  SETELAN_FOLLOWUP_AWAL,
  type SetelanFollowup,
  type StatusFollowup,
  type StatusMesinFollowup,
} from "./followup-def";
import { type Paket, aiUntukAkun, aturanPercobaan, awalBulanWib, balasanTerpakai, daftarPaket, hakAkun, sisaKuotaAi } from "./langganan";
import { MEREK } from "./merek";
import { MASA_ID } from "./jaminan-def";
import { kirimNotifAdmin } from "./notifikasi";
import { type Nomor, nomorById, nomorBySesi, semuaNomor } from "./numbers";
import { PenggunaError } from "./pengguna";
import { periksaJawaban } from "./pemeriksa";
import { adaKode } from "./penjaga";
import { riwayatUntukAi } from "./percakapan";
import { nomorSinkronCg } from "./sinkron-cg";
import { WaError, infoSesi, padaAck, padaBahaya } from "./wa";
import {
  POLA_DESAK,
  kirimanProspekRentang,
  kirimanProspekSejak,
  muatPantauan as muatPantauanProspek,
  paketNyata,
  pengaturanProspek,
  pesanMasukProspek,
  putaranProspek,
  terimaAckProspek,
} from "./followup-prospek";
import { muatPantauan as muatPantauanUsaha, nomorFollowupUsaha, pesanMasukUsaha, putaranUsaha, remBahayaUsaha, terimaAckUsaha } from "./followup-usaha";

/**
 * Follow-up WhatsApp oleh nomor CS ChatGerCep ke pemilik akun gratis yang kuota balasan AI-nya habis.
 *
 * Aturan anti-blokir (pesan yang kita mulai sendiri adalah pemicu blokir utama WhatsApp, jadi dibuat sekecil mungkin):
 *   - Hanya ke chat yang SUDAH pernah ada di nomor CS: nomor yang di-scan / "teruskan ke" milik akun cocok dengan
 *     lawan bicara chat CS, atau chat yang ditautkan admin (users.cs_kunci), atau yang menghubungi lewat tombol
 *     "Chat CS" berkode akun. Tanpa chat yang cocok = tidak masuk antrean dan tidak pernah dikirimi apa pun; begitu
 *     ada chat yang cocok, pemindaian berikutnya mengantrekannya.
 *   - Paling banyak 2 pesan seumur akun (sapaan, lalu satu pengingat bila tidak dibalas), lalu berhenti selamanya.
 *   - Disapa baru setelah `tundaJam` (kesempatan pengguna chat duluan; bila ia chat duluan, follow-up batal).
 *   - Jam kerja WIB, batas per hari, satu pesan per putaran dengan jeda acak 3–10 menit, teks ditulis AI per orang
 *     (tidak pernah sama persis), tanpa tautan di pesan follow-up.
 *   - Nomor CS sehat (followup-aman.ts): tersambung stabil >= STABIL_MENIT dan tanpa tanda bahaya WhatsApp; tanda bahaya
 *     (401 dicabut / 403 / error 463) langsung menyalakan rem + notifikasi admin (padaBahaya di mulaiFollowup).
 *   - Isi = hard selling yang jujur: kerugian nyata dari database (chat pelanggan yang masuk tapi tidak dibalas AI sejak
 *     AI-nya berhenti), rekomendasi SATU paket yang dihitung dari pemakaiannya (rekomendasiPaket) dengan harga persis
 *     dari tabel paket, pertanyaan penutupan, dan jaminan uang kembali di pengingat. AI membaca chat CS-nya dulu dan
 *     melewati akun yang sudah jelas menolak / komplain (<lewati>).
 *   - Ritme manusia (kirimSapaan di bridge.ts): online, "mengetik" sewajarnya, kirim, offline. Balasan pengguna dijawab
 *     jalur biasa: dibaca (centang biru) dulu, mengetik, lalu dijawab AI CS dengan konteks akun ini.
 *   - "Stop / jangan hubungi" = followup_stop permanen. Rem otomatis: banyak pesan tidak sampai ke HP (centang satu)
 *     menghentikan semua kiriman sampai admin melepasnya, dan admin diberi notifikasi.
 *
 * Hemat resource: putaran tiap menit hanya membaca memori sampai benar-benar boleh mengirim, lalu satu query lewat
 * indeks parsial followup_jalan_idx (hanya baris yang masih berjalan). Pemindaian akun yang kuotanya habis tiap 30
 * menit dibatasi ke akun 120 hari terakhir dan menghitung pemakaian AI dengan LIMIT (berhenti di batas kuota).
 */

const KUNCI_SETELAN = "followup";
const KUNCI_REM = "followup_rem";
const KUNCI_LEPAS_REM = "followup_rem_lepas";
const PUTARAN_MS = 60_000;
const PINDAI_MS = 30 * 60_000;
const PINDAI_AWAL_MS = 90_000;
/** Chat yang masih ramai (pesan apa pun) dalam rentang ini: sapaan ditunda, jangan menyela percakapan. */
const SEPI_DTK = 12 * 3600;
/** Kiriman yang terus gagal (bukan karena nomor CS terputus) dicoba ulang paling lama sekian sejak diantrekan. */
const COBA_KIRIM_DTK = 7 * 86400;
/** Pengguna yang chat CS sendiri sejak sekian sebelum diantrekan dianggap sudah dilayani: follow-up tidak perlu. */
const CHAT_DULUAN_DTK = 6 * 3600;
/** Baris follow-up yang dipantau di memori (balasan, permintaan berhenti, status kiriman). */
const PANTAU_DTK = 14 * 86400;
const UMUR_AKUN_PINDAI_DTK = 120 * 86400;

interface InfoAktif {
  userId: number;
  status: StatusFollowup;
  /** Pesan follow-up terakhir yang kita kirim (konteks untuk AI saat dibalas). */
  teks: string | null;
  /** Konteks akun sudah diberikan ke AI di proses ini. */
  dicatat: boolean;
}

interface Keadaan {
  mulai: boolean;
  timer: ReturnType<typeof setInterval> | null;
  timerPindai: ReturnType<typeof setInterval> | null;
  /** Putaran follow-up nomor pengguna (followup-usaha.ts). */
  timerUsaha?: ReturnType<typeof setInterval> | null;
  jalan: boolean;
  pindaiJalan: boolean;
  cs: { ids: Set<number>; wa: Set<string> };
  aktif: Map<string, InfoAktif>;
  ack: Map<string, { userId: number; slot: 1 | 2; ack: number }>;
  bolehPada: number;
  hari: string;
  kirimHari: number;
  /** Akun yang drafnya belum bisa disiapkan (belum ada chat CS yang cocok): dilewati sampai waktu ini (ms). */
  lewatDraf: Map<number, number>;
}

const g = globalThis as unknown as { __waFollowup?: Keadaan };
const st: Keadaan = (g.__waFollowup ??= {
  mulai: false,
  timer: null,
  timerPindai: null,
  jalan: false,
  pindaiJalan: false,
  cs: { ids: new Set(), wa: new Set() },
  aktif: new Map(),
  ack: new Map(),
  bolehPada: 0,
  hari: "",
  kirimHari: 0,
  lewatDraf: new Map(),
});
st.lewatDraf ??= new Map(); // keadaan dari versi modul sebelumnya (muat ulang saat pengembangan)

const asal = (): string => (process.env.APP_URL || "https://chatgercep.com").replace(/\/+$/, "");

// ---------- Pengaturan ----------

const dalamRentang = (v: unknown, [min, maks]: readonly [number, number], bawaan: number): number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= maks ? v : bawaan;

function uraiSetelan(mentah: string | null): SetelanFollowup {
  let v: Partial<SetelanFollowup> = {};
  try {
    v = JSON.parse(mentah ?? "{}") ?? {};
  } catch {
    v = {};
  }
  const a = SETELAN_FOLLOWUP_AWAL;
  return {
    aktif: v.aktif === true,
    nomorId: typeof v.nomorId === "number" && Number.isInteger(v.nomorId) && v.nomorId > 0 ? v.nomorId : null,
    batasHarian: dalamRentang(v.batasHarian, BATAS_SETELAN.batasHarian, a.batasHarian),
    jamMulai: dalamRentang(v.jamMulai, BATAS_SETELAN.jamMulai, a.jamMulai),
    jamSelesai: dalamRentang(v.jamSelesai, BATAS_SETELAN.jamSelesai, a.jamSelesai),
    tundaJam: dalamRentang(v.tundaJam, BATAS_SETELAN.tundaJam, a.tundaJam),
    pengingatHari: dalamRentang(v.pengingatHari, BATAS_SETELAN.pengingatHari, a.pengingatHari),
  };
}

export async function pengaturanFollowup(): Promise<SetelanFollowup> {
  return uraiSetelan(await getSetting(KUNCI_SETELAN));
}

/** Nomor CS yang dipakai: pilihan admin, atau nomor pertama yang memakai data ChatGerCep otomatis. */
async function nomorCsDipakai(s?: SetelanFollowup): Promise<Nomor | undefined> {
  const setelan = s ?? (await pengaturanFollowup());
  const id = setelan.nomorId ?? (await nomorSinkronCg())[0];
  return id ? nomorById(id) : undefined;
}

export async function simpanPengaturanFollowup(s: SetelanFollowup): Promise<SetelanFollowup> {
  const bersih = uraiSetelan(JSON.stringify(s));
  if (bersih.jamSelesai <= bersih.jamMulai) throw new PenggunaError("Jam selesai harus setelah jam mulai.");
  if (bersih.nomorId !== null && !(await nomorById(bersih.nomorId))) throw new PenggunaError("Nomor CS tidak ditemukan.");
  await setSetting(KUNCI_SETELAN, JSON.stringify(bersih));
  await segarkanCs();
  // Baru dinyalakan: akun yang kuotanya sudah habis langsung diantrekan, tidak menunggu pemindaian berikutnya.
  if (bersih.aktif) void pindai().catch(() => {});
  return bersih;
}

async function remAktif(): Promise<{ pada: number; alasan: string } | null> {
  try {
    const v = JSON.parse((await getSetting(KUNCI_REM)) || "null");
    return v && typeof v.pada === "number" ? v : null;
  } catch {
    return null;
  }
}

export async function lepasRemFollowup(): Promise<void> {
  await setSetting(KUNCI_REM, "");
  // Kiriman sebelum rem dilepas tidak dihitung lagi, supaya rem tidak langsung menyala ulang.
  await setSetting(KUNCI_LEPAS_REM, String(sekarang()));
}

// ---------- Kode akun (tombol "Chat CS") ----------

const rahasia = (): string => process.env.AUTH_SECRET || MEREK;
export const kodeAkun = (userId: number): string => `${userId}-${createHmac("sha256", rahasia()).update(`cs:${userId}`).digest("hex").slice(0, 4)}`;
const POLA_KODE = /kode\s*akun\s*:?\s*(\d{1,9})-([0-9a-f]{4})/i;

/**
 * Tautan wa.me ke nomor CS dengan teks terisi berisi kode akun: pesan itu menautkan chat ke akun ini (dari HP mana
 * pun), dan karena pengguna yang chat duluan, ini jalur yang paling aman. null = belum ada nomor CS yang tertaut.
 */
export async function tautanChatCs(userId: number): Promise<string | null> {
  const n = await nomorCsDipakai();
  if (!n?.wa_id) return null;
  const teks = `Halo CS ${MEREK}, saya mau tanya soal paket supaya AI saya bisa membalas pelanggan. (Kode akun: ${kodeAkun(userId)})`;
  return `https://wa.me/${n.wa_id}?text=${encodeURIComponent(teks)}`;
}

// ---------- Nomor CS di memori (dibaca jembatan tiap pesan, tanpa I/O) ----------

async function segarkanCs(): Promise<void> {
  const [s, cg, semua] = await Promise.all([pengaturanFollowup(), nomorSinkronCg(), semuaNomor()]);
  const ids = new Set<number>(cg);
  if (s.nomorId) ids.add(s.nomorId);
  const wa = new Set<string>();
  for (const n of semua) if (ids.has(n.id) && n.wa_id) wa.add(n.wa_id);
  st.cs = { ids, wa };
}

// ---------- Data akun & chat ----------

interface Akun {
  id: number;
  email: string;
  nama: string;
  peran: string;
  status: string;
}

async function akun(userId: number): Promise<Akun | undefined> {
  const sql = await db();
  const [u] = await sql<Akun[]>`SELECT id, email, nama, peran, status FROM users WHERE id = ${userId}`;
  return u;
}

interface ChatCs {
  id: number;
  kunci: string;
  alamat: string | null;
  telepon: string | null;
  nama: string | null;
  prospek: number;
  spam: number;
  terakhir_pada: number;
  manual: boolean;
}

/**
 * Fragmen: satu chat di nomor CS milik akun `u` (alias users di query luar). Yang ditautkan (admin / kode akun)
 * didahulukan, lalu lawan bicara yang nomornya sama dengan nomor yang di-scan atau "teruskan ke" milik akun, terbaru
 * dulu. Dua cabang UNION ALL supaya masing-masing lewat indeks (kunci unik; percakapan_nomor_telepon_idx). Dipakai
 * chatAkun (satu akun) dan pindai (banyak akun) sebagai LATERAL, jadi "cocok" berarti hal yang sama di keduanya.
 */
const chatCsCocok = (sql: Sql, csId: number) => sql`
  SELECT p.id, p.kunci, p.alamat, p.telepon, p.nama, p.prospek, p.spam, p.terakhir_pada, true AS manual
    FROM percakapan p WHERE p.kunci = u.cs_kunci AND p.number_id = ${csId}
  UNION ALL
  SELECT p.id, p.kunci, p.alamat, p.telepon, p.nama, p.prospek, p.spam, p.terakhir_pada, false
    FROM percakapan p
   WHERE p.number_id = ${csId} AND p.telepon IN (
         SELECT n.wa_id FROM numbers n WHERE n.user_id = u.id AND n.wa_id IS NOT NULL
         UNION ALL
         SELECT n.teruskan_ke FROM numbers n WHERE n.user_id = u.id AND n.teruskan_ke IS NOT NULL)
  ORDER BY manual DESC, terakhir_pada DESC
  LIMIT 1`;

/** Chat di nomor CS milik akun ini (lihat chatCsCocok). */
async function chatAkun(userId: number, csId: number): Promise<ChatCs | undefined> {
  const sql = await db();
  const [c] = await sql<ChatCs[]>`SELECT c.* FROM users u CROSS JOIN LATERAL (${chatCsCocok(sql, csId)}) c WHERE u.id = ${userId}`;
  return c;
}

/** Ada pesan dari lawan bicara di chat ini sejak `sejak`? Lewat pesan_chat_percakapan_idx, berhenti di baris pertama. */
async function masukSejak(percakapanId: number, sejak: number): Promise<boolean> {
  const sql = await db();
  const [r] = await sql`SELECT 1 FROM pesan_chat WHERE percakapan_id = ${percakapanId} AND peran = 0 AND waktu >= ${sejak} LIMIT 1`;
  return !!r;
}

async function diStop(kunci: string): Promise<boolean> {
  const sql = await db();
  const [r] = await sql`SELECT 1 FROM followup_stop WHERE kunci = ${kunci}`;
  return !!r;
}

/** Fakta pemakaian akun untuk pesan yang personal dan hard selling yang jujur (semua angka dari database). */
interface PemakaianAkun {
  /** Balasan AI yang sudah dikirim bot-nya sejak akun dibuat. */
  balasan: number;
  /** Balasan AI 30 hari terakhir (dasar perkiraan kebutuhan per bulan). */
  balasan30: number;
  /** Pelanggan (chat) yang pernah menghubungi nomor-nomornya. */
  pelanggan: number;
  /** Nomor WhatsApp yang dimiliki akun. */
  nomor: number;
  /** Pesan pelanggan yang masuk SETELAH AI berhenti membalas (kuota habis / belum aktif), dan dari berapa chat. */
  tertahan: { pesan: number; chat: number };
}

/**
 * Pemakaian akun. "Tertahan" = pesan masuk sejak balasan AI terakhir (atau 30 hari terakhir bila belum pernah dibalas
 * AI) di chat yang tidak ditandai spam: lewat percakapan_nomor_waktu_idx (hanya chat yang aktif sejak itu) dan
 * pesan_chat_percakapan_idx, dihentikan di 5.000 baris.
 */
async function pemakaianAkun(userId: number): Promise<PemakaianAkun> {
  const sql = await db();
  const t = sekarang();
  const [[u], [p], [akhir]] = await Promise.all([
    sql<{ created_at: number }[]>`SELECT created_at FROM users WHERE id = ${userId}`,
    sql<{ n: number; nomor: number }[]>`
      SELECT (SELECT COUNT(*) FROM numbers n JOIN percakapan p ON p.number_id = n.id WHERE n.user_id = ${userId})::int AS n,
             (SELECT COUNT(*) FROM numbers WHERE user_id = ${userId})::int AS nomor`,
    sql<{ w: number | null }[]>`SELECT MAX(a.waktu)::bigint AS w FROM numbers n JOIN ai_pakai a ON a.number_id = n.id AND NOT a.abaikan WHERE n.user_id = ${userId}`,
  ]);
  const sejak = Math.max(Number(akhir?.w ?? 0), t - 30 * 86400);
  const [[tahan], balasan, balasan30] = await Promise.all([
    sql<{ pesan: number; chat: number }[]>`
      SELECT COUNT(*)::int AS pesan, COUNT(DISTINCT x.pid)::int AS chat FROM (
        SELECT m.percakapan_id AS pid FROM numbers n
          JOIN percakapan p ON p.number_id = n.id AND p.terakhir_pada > ${sejak} AND p.spam <> 1
          JOIN pesan_chat m ON m.percakapan_id = p.id AND m.peran = 0 AND m.waktu > ${sejak}
         WHERE n.user_id = ${userId} LIMIT 5000) x`,
    u ? balasanTerpakai(userId, u.created_at) : Promise.resolve(0),
    balasanTerpakai(userId, t - 30 * 86400),
  ]);
  return { balasan, balasan30, pelanggan: p?.n ?? 0, nomor: p?.nomor ?? 0, tertahan: { pesan: tahan?.pesan ?? 0, chat: tahan?.chat ?? 0 } };
}

/**
 * Paket yang paling pas untuk pemakaian ini (dihitung, bukan ditebak AI): kebutuhan sebulan = balasan AI 30 hari
 * terakhir + pesan yang tertahan, lalu paket termurah yang kuota balasannya (disetarakan 30 hari) dan jumlah nomornya
 * cukup. Tidak ada yang cukup = paket terbesar.
 */
export function rekomendasiPaket(daftar: Paket[], pakai: Pick<PemakaianAkun, "balasan30" | "tertahan" | "nomor">): { paket: Paket; alasan: string } | null {
  const jual = daftar.filter((p) => p.harga > 0 && p.durasi_hari > 0).sort((a, b) => a.harga - b.harga);
  if (!jual.length) return null;
  const butuh = pakai.balasan30 + pakai.tertahan.pesan;
  const nomor = Math.max(1, pakai.nomor);
  const perBulan = (p: Paket): number => (p.kuota_balasan * 30) / p.durasi_hari;
  const cocok = jual.find((p) => perBulan(p) >= butuh && p.kuota_nomor >= nomor);
  const paket = cocok ?? jual.reduce((a, b) => (perBulan(b) > perBulan(a) ? b : a));
  const alasan = butuh > 0
    ? `kebutuhan sekitar ${butuh.toLocaleString("id-ID")} balasan sebulan dan ${nomor} nomor${cocok ? `, cukup dengan kuota ${paket.kuota_balasan.toLocaleString("id-ID")} balasan` : ", paket terbesar yang ada"}`
    : `paket termurah untuk mulai, ${paket.kuota_balasan.toLocaleString("id-ID")} balasan & ${paket.kuota_nomor} nomor`;
  return { paket, alasan };
}

/** "Budi" dari nama profil WA lawan bicara (atau nama akun); hanya kata pertama yang wajar. "" = tanpa nama. */
function panggilan(...nama: (string | null | undefined)[]): string {
  for (const n of nama) {
    const kata = (n ?? "").normalize("NFKC").replace(/[^\p{L}\s'-]/gu, " ").trim().split(/\s+/)[0] ?? "";
    if (kata.length >= 2 && kata.length <= 20) return `${kata.charAt(0).toUpperCase()}${kata.slice(1).toLowerCase()}`;
  }
  return "";
}

// ---------- Penyusun pesan ----------

const POLA_TAUTAN = /(https?:\/\/|www\.|wa\.me|\.com\b|\.id\b)/i;
const rp = (n: number): string => `Rp${n.toLocaleString("id-ID")}`;

/**
 * Templat cadangan (AI gagal / tidak lolos pemeriksaan), dua variasi per jenis. Sapaan "kamu", bukan "Kak". Tetap
 * hard selling: kerugian nyata bila ada, paket rekomendasi dengan harga persis dari tabel paket, pertanyaan penutupan.
 */
function templat(jenis: "sapaan" | "pengingat", sapa: string, pakai: PemakaianAkun, rek: { paket: Paket } | null): string {
  const halo = sapa ? `Halo ${sapa}` : "Halo";
  const paket = rek ? `paket ${rek.paket.nama} (${rp(rek.paket.harga)}/${rek.paket.durasi_hari} hari)` : "paket yang pas";
  if (jenis === "pengingat")
    return [
      `${halo}, ini pesan terakhirku soal ini, janji nggak ganggu lagi 🙏

Biar AI-mu membalas pelanggan lagi, *${paket}* sudah cukup, dan pembayaran pertama dilindungi *jaminan uang kembali ${MASA_ID}*.

Balas *YA*, aku aktifkan sekarang.`,
      `${halo}, aku pamit setelah ini ya 🙏

Kapan pun siap, *${paket}* bisa langsung aktif, dan pembayaran pertama aman dengan *jaminan uang kembali ${MASA_ID}*.

Cukup balas *YA*.`,
    ][Math.floor(Math.random() * 2)];
  const rugi =
    pakai.tertahan.pesan > 0
      ? `sejak AI-nya berhenti, ada ${pakai.tertahan.pesan.toLocaleString("id-ID")} pesan dari ${pakai.tertahan.chat.toLocaleString("id-ID")} pelanggan yang masuk ke WhatsApp kamu tanpa dibalas AI`
      : pakai.balasan > 0
        ? `AI di WhatsApp kamu sudah membalas ${pakai.balasan.toLocaleString("id-ID")} chat pelanggan, tapi kuotanya habis jadi sekarang berhenti membalas`
        : `akun ${MEREK} kamu belum punya paket aktif, jadi AI-nya belum membalas pelanggan`;
  return [
    `${halo}, ini CS ${MEREK} 👋

${rugi[0].toUpperCase()}${rugi.slice(1)} 😟

Untuk pemakaianmu, *${paket}* sudah cukup supaya semua chat dibalas lagi. Balas *YA*, aku aktifkan sekarang.`,
    `${halo} 👋 Aku dari CS ${MEREK}.

${rugi[0].toUpperCase()}${rugi.slice(1)}, padahal tiap chat itu calon pembeli 😟

*${paket}* paling pas untukmu. Balas *YA*, aku bantu aktifkan sekarang.`,
  ][Math.floor(Math.random() * 2)];
}

/** Pelanggaran khusus follow-up akun (selain pemeriksa.ts): null = lolos. */
function periksaPesanAkun(teks: string, jenis: "sapaan" | "pengingat"): string | null {
  const maks = jenis === "sapaan" ? 600 : 480;
  if (teks.length < 25 || teks.length > maks) return `panjang ${teks.length} karakter`;
  if (POLA_TAUTAN.test(teks)) return "berisi tautan";
  if (adaKode(teks)) return "berisi kode";
  if (POLA_DESAK.test(teks)) return "kelangkaan / batas waktu buatan";
  if (/\b(follow[\s-]?up|pesan otomatis)\b/i.test(teks)) return "menyebut follow-up / pesan otomatis";
  return null;
}

/**
 * Satu pesan follow-up hard selling yang ditulis AI per orang (tidak pernah sama persis antar-penerima): kerugian nyata,
 * satu paket rekomendasi dengan harga persis, pertanyaan penutupan; di pengingat ditambah jaminan uang kembali. Diperiksa:
 * tanpa tautan, tanpa kelangkaan palsu, angka/harga harus ada di data (pemeriksa.ts). Gagal dua kali = templat. Biaya AI
 * dicatat di nomor CS tanpa memotong kuota balasannya (abaikan = true).
 */
async function susunPesan(
  jenis: "sapaan" | "pengingat",
  cs: Nomor,
  d: { userId: number; sapa: string; namaAkun: string; pakai: PemakaianAkun; sebelumnya: string | null; riwayat: string[]; bolehLewati: boolean },
): Promise<HasilSusun> {
  const [daftar, paket] = await Promise.all([daftarPaket().catch(() => [] as Paket[]), paketNyata().catch(() => "")]);
  const rek = rekomendasiPaket(daftar, d.pakai);
  const cadangan = { teks: templat(jenis, d.sapa, d.pakai, rek) };
  try {
    const ai = await aiUntukAkun(cs.user_id);
    const sistem = [
      `Kamu CS ${MEREK}, layanan asisten AI yang membalas chat WhatsApp pelanggan untuk pemilik usaha.`,
      `Tulis SATU pesan WhatsApp ${jenis === "sapaan" ? "follow-up pertama" : "pengingat terakhir"} untuk pemilik akun ${MEREK} yang belum punya paket aktif (belum berlangganan, atau kuota balasan AI-nya sudah habis), sehingga AI di WhatsApp-nya tidak membalas pelanggan.`,
      "Ini hard selling yang jujur: buat ia ingin berlangganan SEKARANG dengan fakta, bukan tekanan palsu.",
      ...(d.bolehLewati && d.riwayat.length ? [ATURAN_LEWATI] : []),
      "Teknik:",
      jenis === "sapaan"
        ? [
            "- Perkenalkan diri singkat sebagai CS, lalu hook: bila ada data pesan tertahan, sebut angkanya PERSIS sebagai kerugian nyata (pelanggan yang chat tapi tidak dibalas AI = calon pembeli yang terlewat). Bila balasan AI-nya 0, jangan bilang kuotanya habis: ia memang belum berlangganan; pakai hook manfaat (semua chat pelanggan dibalas 24 jam).",
            "- Rekomendasikan paket di <rekomendasi> (nama + harga PERSIS) dengan alasan singkat yang terkait pemakaiannya.",
            "- Tutup dengan SATU ajakan penutupan yang gampang dibalas (mis. balas YA, aku aktifkan paket itu sekarang).",
            "- Paling panjang 450 karakter.",
          ].join("\n")
        : [
            "- Bilang terus terang ini pesan terakhirmu soal ini. Jangan mengulang kalimat pesan sebelumnya.",
            `- Pembalik risiko: pembayaran pertama dilindungi jaminan uang kembali ${MASA_ID} (GoPay, ShopeePay, atau QRIS).`,
            "- Sebut paket rekomendasi singkat (nama + harga PERSIS) dan ajak cukup membalas YA.",
            "- Paling panjang 380 karakter.",
          ].join("\n"),
      GAYA_PESAN,
      "Aturan wajib:",
      `- Bahasa Indonesia santai tapi sopan, seperti CS manusia. Panggil lawan bicara "kamu" (JANGAN "Kak"/"Kakak"/"Anda")${d.sapa ? ` dan sapa dengan "Halo ${d.sapa}"` : ""}.`,
      "- JANGAN menulis tautan/URL. Harga hanya dari <rekomendasi> / <paket_nyata>, angka hanya dari data di pesan pengguna.",
      "- DILARANG: kelangkaan atau batas waktu yang dibuat-buat, diskon yang tidak ada, testimoni / angka pengguna karangan, janji hasil, menyebut follow-up atau pesan otomatis.",
      "- Tulis isi pesannya saja, tanpa tanda kutip, judul, atau penjelasan.",
      rek ? `<rekomendasi>\nPaket ${rek.paket.nama}: ${rp(rek.paket.harga)} / ${rek.paket.durasi_hari} hari, ${rek.paket.kuota_balasan.toLocaleString("id-ID")} balasan AI, ${rek.paket.kuota_nomor} nomor. Alasan: ${rek.alasan}.\n</rekomendasi>` : "",
      paket ? `<paket_nyata>\n${paket}\n</paket_nyata>` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const p = d.pakai;
    const pesan = [
      `Nama akun: ${d.namaAkun || "-"}`,
      `Balasan AI yang sudah dikirim bot-nya: ${p.balasan}`,
      `Balasan AI 30 hari terakhir: ${p.balasan30}`,
      `Jumlah pelanggan yang pernah chat: ${p.pelanggan}`,
      `Jumlah nomor WhatsApp-nya: ${p.nomor}`,
      `Pesan tertahan (masuk sejak AI berhenti, tidak dibalas AI): ${p.tertahan.pesan} pesan dari ${p.tertahan.chat} pelanggan`,
      d.sebelumnya ? `Pesan follow-up sebelumnya (tidak dibalas): ${d.sebelumnya}` : "",
      d.riwayat.length ? `Riwayat chat CS dengan orang ini (terbaru di bawah):\n${d.riwayat.join("\n")}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const sumber = `${sistem}\n${pesan}`;
    let umpan = "";
    for (let coba = 0; coba < 2; coba++) {
      const hasil = await tanyaAi({
        sessionId: `followup-${d.userId}-${jenis}-${Date.now()}-${coba}`,
        sistem: umpan ? `${sistem}\n\n${umpan}` : sistem,
        pesan,
        timeoutMs: 60_000,
        paksa: { penyedia: ai.penyedia },
        cadanganHermes: ai.cadanganHermes,
      });
      void catatPakai(cs.id, hasil, false, true).catch(() => {});
      const lewati = d.bolehLewati && d.riwayat.length ? ambilLewati(hasil.teks) : null;
      if (lewati) {
        console.info(`[followup] AI melewati akun ${d.userId}: ${lewati}`);
        return { lewati };
      }
      const teks = formatWa(hasil.teks.replace(/<\/?[a-z_]+[^>]*>/gi, "").replace(/^["'“”]+|["'“”]+$/g, "").trim());
      const salah = periksaPesanAkun(teks, jenis);
      const fakta = salah ? [] : periksaJawaban(teks, sumber).filter((x) => x.jenis !== "robotik" && x.jenis !== "janji");
      if (!salah && !fakta.length) return { teks };
      console.warn(`[followup] pesan AI ${jenis} ditolak (${salah ?? fakta.map((f) => f.jenis).join(",")})`);
      umpan = `Draf sebelumnya DITOLAK: ${salah ?? `ada angka/fakta yang tidak ada di data (${fakta.map((f) => `"${f.kutipan}"`).join(", ")})`}. Tulis ulang dan patuhi semua aturan.`;
    }
    return cadangan;
  } catch (e) {
    console.warn(`[followup] AI gagal menyusun pesan: ${e instanceof Error ? e.message : e}`);
    return cadangan;
  }
}

// ---------- Putaran pengiriman ----------

function awalHariWib(t = sekarang()): number {
  const w = new Date((t + 7 * 3600) * 1000);
  return Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate()) / 1000 - 7 * 3600;
}
const jamWibSekarang = (): number => new Date(Date.now() + 7 * 3600_000).getUTCHours();
const jedaAcakMs = (): number => {
  const [a, b] = JEDA_ANTARPESAN_MENIT;
  return Math.round((a + Math.random() * (b - a)) * 60_000);
};

async function kirimanHariIni(): Promise<number> {
  const awal = awalHariWib();
  const kunci = String(awal);
  if (st.hari !== kunci) {
    const sql = await db();
    const [r] = await sql<{ n: number }[]>`
      SELECT (COUNT(*) FILTER (WHERE terkirim1 >= ${awal}) + COUNT(*) FILTER (WHERE terkirim2 >= ${awal}))::int AS n
        FROM followup WHERE diperbarui >= ${awal}`;
    st.hari = kunci;
    st.kirimHari = (r?.n ?? 0) + (await kirimanProspekSejak(awal)); // batas harian bersama follow-up prospek
  }
  return st.kirimHari;
}

type BarisJalan = Pick<BarisFollowup, "user_id" | "status" | "tahap" | "dibuat" | "terkirim1" | "ack1" | "pesan1" | "pesan2"> & { kunci: string | null };

/** Tulis pesan follow-up untuk akun & chat ini (AI per orang, cadangan templat). `bolehLewati` = AI boleh menolak menulis. */
async function tulisPesan(u: Akun, chat: ChatCs, cs: Nomor, jenis: "sapaan" | "pengingat", sebelumnya: string | null, bolehLewati = true): Promise<HasilSusun> {
  const [pakai, riwayat] = await Promise.all([pemakaianAkun(u.id), riwayatUntukAi(chat.kunci, { sesiBaru: false, tertunda: 0, lengkap: true }).catch(() => [])]);
  return susunPesan(jenis, cs, { userId: u.id, sapa: panggilan(chat.nama, u.nama), namaAkun: u.nama, pakai, sebelumnya, riwayat: riwayat.slice(-12), bolehLewati });
}

async function ubah(userId: number, status: StatusFollowup, alasan: string | null, lain: { jadwal?: number; dibalas?: number } = {}): Promise<void> {
  const sql = await db();
  const t = sekarang();
  await sql`
    UPDATE followup SET status = ${status}, alasan = ${alasan}, diperbarui = ${t},
           jadwal = COALESCE(${lain.jadwal ?? null}::bigint, jadwal), dibalas = COALESCE(${lain.dibalas ?? null}::bigint, dibalas)
     WHERE user_id = ${userId}`;
  for (const [k, v] of st.aktif) if (v.userId === userId) st.aktif.set(k, { ...v, status });
}

/** Ubah status lalu berhenti tanpa mengirim (nilai kembali prosesSatu = false). */
async function henti(userId: number, status: StatusFollowup, alasan: string | null, lain: { dibalas?: number } = {}): Promise<false> {
  await ubah(userId, status, alasan, lain);
  return false;
}

/** Sapaan yang belum terkirim untuk akun tanpa chat CS yang cocok tidak disimpan di antrean (belum ada pesan apa pun). */
async function keluarkanTanpaChat(userId: number): Promise<void> {
  const sql = await db();
  await sql`DELETE FROM followup WHERE user_id = ${userId} AND status = 'antre' AND tahap = 0`;
  st.lewatDraf.delete(userId);
}

async function tunda(userId: number, detik: number, alasan: string): Promise<void> {
  const sql = await db();
  const t = sekarang();
  await sql`UPDATE followup SET jadwal = ${t + detik}, alasan = ${alasan}, diperbarui = ${t} WHERE user_id = ${userId}`;
}

/**
 * Satu baris yang jatuh tempo. true = satu pesan terkirim (putaran berhenti, jeda acak berlaku). Semua pemeriksaan
 * diulang tepat sebelum mengirim: akun bisa saja sudah berlangganan, chat duluan, atau meminta berhenti.
 */
async function prosesSatu(b: BarisJalan, s: SetelanFollowup, cs: Nomor): Promise<boolean> {
  const t = sekarang();
  const u = await akun(b.user_id);
  const akhir: StatusFollowup = b.status === "antre" ? "batal" : "selesai";
  if (!u || u.peran !== "user" || u.status !== "aktif") return henti(b.user_id, akhir, "Akun tidak aktif lagi");
  const [hak, sisa] = await Promise.all([hakAkun(u), sisaKuotaAi(u.id)]);
  if (hak.sampai !== null) return henti(b.user_id, akhir, "Sudah berlangganan");
  if (sisa !== 0) return henti(b.user_id, akhir, "Kuota AI tersedia lagi");

  const chat = b.status === "antre" ? await chatAkun(u.id, cs.id) : b.kunci ? await chatByKunci(b.kunci) : undefined;
  if (!chat) {
    if (b.status !== "antre") return henti(b.user_id, "selesai", "Chat CS sudah terhapus");
    // Chat yang cocok hilang (nomor diganti, tautan dilepas, chat terhapus): keluar dari antrean, masuk lagi lewat
    // pemindaian bila nanti cocok lagi.
    await keluarkanTanpaChat(b.user_id);
    return false;
  }
  if (await diStop(chat.kunci)) return henti(b.user_id, "stop", "Chat ini pernah meminta tidak dihubungi lagi");
  if (chat.prospek === 2 || chat.prospek === 3 || chat.spam === 1) return henti(b.user_id, akhir, "Chat CS ini dibisukan / ditandai spam");
  const alamat = chat.alamat ?? (chat.telepon ? `${chat.telepon}@s.whatsapp.net` : null);
  if (!alamat) return henti(b.user_id, akhir, "Alamat chat CS tidak diketahui");

  if (b.status === "antre") {
    // Pengguna chat CS duluan (sekitar kuota habis atau sesudahnya): sudah dilayani, follow-up tidak perlu.
    if (await masukSejak(chat.id, b.dibuat - CHAT_DULUAN_DTK)) return henti(b.user_id, "batal", "Pengguna sudah chat CS duluan");
    if (chat.terakhir_pada > t - SEPI_DTK) {
      await tunda(b.user_id, chat.terakhir_pada + SEPI_DTK - t + 600, "Chat CS ini baru saja aktif: sapaan ditunda");
      return false;
    }
  } else {
    if (b.terkirim1 && (await masukSejak(chat.id, b.terkirim1))) return henti(b.user_id, "dibalas", null, { dibalas: t });
    // Sapaan tidak pernah sampai ke HP (centang satu): pengingat tidak dikirim (pesan kedua ke nomor yang sama-sama tidak sampai).
    if (b.ack1 < 3) return henti(b.user_id, "selesai", "Sapaan tidak sampai ke HP penerima (centang satu): pengingat tidak dikirim");
  }

  const jenis = b.status === "antre" ? "sapaan" : "pengingat";
  // Draf yang sudah disiapkan (dan mungkin diedit admin) di halaman pratinjau: itulah yang dikirim, persis.
  const sebelumnya = b.pesan1 ?? st.aktif.get(chat.kunci)?.teks ?? null;
  const draf = jenis === "sapaan" ? b.pesan1 : b.pesan2;
  const susun = draf ? { teks: draf } : await tulisPesan(u, chat, cs, jenis, jenis === "pengingat" ? sebelumnya : null);
  if ("lewati" in susun) return henti(b.user_id, akhir, `Dilewati AI: ${susun.lewati}`);
  const teks = susun.teks;

  // Pemeriksaan terakhir: selagi AI menulis, pengguna bisa saja membalas / chat duluan.
  if (await masukSejak(chat.id, jenis === "sapaan" ? b.dibuat - CHAT_DULUAN_DTK : (b.terkirim1 ?? t))) {
    await ubah(b.user_id, jenis === "sapaan" ? "batal" : "dibalas", jenis === "sapaan" ? "Pengguna sudah chat CS duluan" : null, jenis === "pengingat" ? { dibalas: sekarang() } : {});
    return false;
  }
  if (infoSesi(cs.sesi).status !== "WORKING") return false;

  let id: string;
  try {
    id = await kirimSapaan({ numberId: cs.id, sesi: cs.sesi, alamat, kunci: chat.kunci, teks });
  } catch (e) {
    const pesan = e instanceof Error ? e.message : String(e);
    console.warn(`[followup] gagal mengirim ke akun ${u.id}: ${pesan}`);
    if (e instanceof WaError) await tunda(b.user_id, 1800, `Nomor CS tidak terhubung: ${pesan}`);
    else if (t - b.dibuat > COBA_KIRIM_DTK) await ubah(b.user_id, "gagal", pesan.slice(0, 200));
    else await tunda(b.user_id, 3600, `Gagal mengirim, dicoba lagi: ${pesan.slice(0, 160)}`);
    return false;
  }

  const sql = await db();
  const kini = sekarang();
  if (jenis === "sapaan") {
    const lanjut = s.pengingatHari > 0;
    await sql`
      UPDATE followup SET status = ${lanjut ? "terkirim" : "selesai"}, tahap = 1, kunci = ${chat.kunci}, tujuan = ${chat.telepon},
             nama = ${chat.nama}, pesan1_id = ${id}, pesan1 = ${teks}, terkirim1 = ${kini}, ack1 = 1, alasan = null, diperbarui = ${kini},
             jadwal = ${kini + s.pengingatHari * 86400}
       WHERE user_id = ${u.id}`;
    st.ack.set(id, { userId: u.id, slot: 1, ack: 1 });
    st.aktif.set(chat.kunci, { userId: u.id, status: lanjut ? "terkirim" : "selesai", teks, dicatat: false });
  } else {
    await sql`
      UPDATE followup SET status = 'selesai', tahap = 2, pesan2_id = ${id}, pesan2 = ${teks}, terkirim2 = ${kini}, ack2 = 1, alasan = null, diperbarui = ${kini}
       WHERE user_id = ${u.id}`;
    st.ack.set(id, { userId: u.id, slot: 2, ack: 1 });
    st.aktif.set(chat.kunci, { userId: u.id, status: "selesai", teks, dicatat: false });
  }
  console.info(`[followup] ${jenis} terkirim ke akun ${u.id} lewat nomor CS ${cs.id}`);
  return true;
}

async function chatByKunci(kunci: string): Promise<ChatCs | undefined> {
  const sql = await db();
  const [c] = await sql<ChatCs[]>`
    SELECT id, kunci, alamat, telepon, nama, prospek, spam, terakhir_pada, false AS manual FROM percakapan WHERE kunci = ${kunci}`;
  return c;
}

/**
 * Rem otomatis: dari 10 kiriman terakhir yang sudah berumur >= 6 jam (sejak rem terakhir dilepas), bila >= 3 dan >= 40%
 * tidak pernah sampai ke HP (centang satu), kemungkinan besar nomor CS mulai diblokir/dilaporkan: semua kiriman berhenti.
 */
async function periksaRem(): Promise<boolean> {
  const t = sekarang();
  const lepas = Number((await getSetting(KUNCI_LEPAS_REM)) || 0);
  const sejak = Math.max(t - 7 * 86400, lepas);
  const sql = await db();
  const akun = await sql<{ w: number; ack: number }[]>`
    SELECT w, ack FROM (
      SELECT ack1 AS ack, terkirim1 AS w FROM followup WHERE terkirim1 >= ${sejak}
      UNION ALL
      SELECT ack2, terkirim2 FROM followup WHERE terkirim2 >= ${sejak}
    ) x WHERE w <= ${t - 6 * 3600} ORDER BY w DESC LIMIT 10`;
  // Satu nomor CS = satu rem: kiriman follow-up prospek ikut dihitung (10 terbaru dari gabungan keduanya).
  const baris = [...akun, ...(await kirimanProspekRentang(sejak, t - 6 * 3600))].sort((x, y) => y.w - x.w).slice(0, 10);
  const tak = baris.filter((r) => r.ack < 3).length;
  if (baris.length < 5 || tak < 3 || tak / baris.length < 0.4) return false;
  const alasan = `${tak} dari ${baris.length} pesan follow-up terakhir tidak sampai ke HP penerima (centang satu).`;
  await setSetting(KUNCI_REM, JSON.stringify({ pada: t, alasan }));
  console.error(`[followup] REM OTOMATIS: ${alasan} Semua follow-up dihentikan sampai admin melepas rem.`);
  await kirimNotifAdmin({
    jenis: "admin_followup",
    judul: { id: "Follow-up WhatsApp dihentikan otomatis", en: "WhatsApp follow-up stopped automatically" },
    isi: { id: `${alasan} Periksa nomor CS sebelum melanjutkan.`, en: `${tak} of the last ${baris.length} follow-up messages were not delivered. Check the CS number before resuming.` },
    tautan: "/admin/followup",
    kunci: `followup-rem:${t}`,
  });
  return true;
}

/**
 * Pratinjau: draf pesan disiapkan menjelang jadwal (paling banyak DRAF_PER_PUTARAN per menit, jatuh tempo <= 24 jam),
 * supaya admin bisa membaca / mengedit sebelum terkirim. Draf yang sudah ada (termasuk suntingan admin) tidak ditimpa.
 * Akun tanpa chat CS yang cocok dilewati 6 jam (di memori) supaya tidak dicoba tiap menit.
 */
const DRAF_PER_PUTARAN = 3;
async function siapkanDraf(cs: Nomor): Promise<void> {
  const sql = await db();
  const t = sekarang();
  const baris = await sql<{ user_id: number; status: StatusFollowup; kunci: string | null; pesan1: string | null }[]>`
    SELECT user_id, status, kunci, pesan1 FROM followup
     WHERE status IN ('antre', 'terkirim') AND jadwal <= ${t + 86400}
       AND ((status = 'antre' AND pesan1 IS NULL) OR (status = 'terkirim' AND pesan2 IS NULL))
     ORDER BY jadwal, user_id LIMIT 20`;
  let dibuat = 0;
  for (const b of baris) {
    if (dibuat >= DRAF_PER_PUTARAN) break;
    if ((st.lewatDraf.get(b.user_id) ?? 0) > Date.now()) continue;
    const u = await akun(b.user_id);
    const chat = !u ? undefined : b.status === "antre" ? await chatAkun(u.id, cs.id) : b.kunci ? await chatByKunci(b.kunci) : undefined;
    if (!u || !chat) {
      st.lewatDraf.set(b.user_id, Date.now() + 6 * 3600_000);
      continue;
    }
    const jenis = b.status === "antre" ? "sapaan" : "pengingat";
    const h = await tulisPesan(u, chat, cs, jenis, jenis === "pengingat" ? b.pesan1 : null);
    dibuat += 1;
    if ("lewati" in h) {
      await ubah(u.id, jenis === "sapaan" ? "batal" : "selesai", `Dilewati AI: ${h.lewati}`);
      continue;
    }
    const teks = h.teks;
    if (jenis === "sapaan") await sql`UPDATE followup SET pesan1 = ${teks}, tujuan = ${chat.telepon}, nama = ${chat.nama} WHERE user_id = ${u.id} AND pesan1 IS NULL AND tahap = 0`;
    else await sql`UPDATE followup SET pesan2 = ${teks} WHERE user_id = ${u.id} AND pesan2 IS NULL AND tahap = 1`;
  }
  if (st.lewatDraf.size > 2000) st.lewatDraf.clear();
}

/**
 * Satu putaran: follow-up akun dulu (antrean lama), lalu follow-up prospek (followup-prospek.ts). Keduanya memakai
 * nomor CS, jam kirim, batas harian, jeda acak, dan rem yang SAMA; satu putaran paling banyak mengirim satu pesan.
 */
async function putaran(): Promise<void> {
  if (st.jalan) return;
  st.jalan = true;
  try {
    await segarkanCs();
    const [s, sp] = await Promise.all([pengaturanFollowup(), pengaturanProspek()]);
    if (!s.aktif && !sp.aktif) return;
    const cs = await nomorCsDipakai(s);
    if (!cs) return;
    if (s.aktif) await siapkanDraf(cs).catch((e) => console.warn("[followup] draf gagal disiapkan:", e instanceof Error ? e.message : e));
    const jam = jamWibSekarang();
    const boleh =
      Date.now() >= st.bolehPada &&
      jam >= s.jamMulai &&
      jam < s.jamSelesai &&
      !!cs.wa_id &&
      infoSesi(cs.sesi).status === "WORKING" &&
      !alasanTahan(cs.sesi) &&
      !(await remAktif()) &&
      (await kirimanHariIni()) < s.batasHarian;
    const terkirim = (): void => {
      st.kirimHari += 1;
      st.bolehPada = Date.now() + jedaAcakMs();
    };
    if (boleh && s.aktif) {
      const sql = await db();
      const baris = await sql<BarisJalan[]>`
        SELECT user_id, status, tahap, dibuat, terkirim1, ack1, kunci, pesan1, pesan2 FROM followup
         WHERE status IN ('antre', 'terkirim') AND jadwal <= ${sekarang()}
         ORDER BY jadwal, user_id LIMIT 10`;
      if (baris.length) {
        if (await periksaRem()) return;
        for (const b of baris) {
          if (await prosesSatu(b, s, cs)) return terkirim();
        }
      }
    }
    // Prospek: pemindaian & draf berjalan juga di luar jam kirim; pengiriman hanya bila `boleh` (dan rem tidak menyala).
    if (sp.aktif && (await putaranProspek(cs, boleh && !(await periksaRem())))) terkirim();
  } catch (e) {
    console.error("[followup] putaran gagal:", e instanceof Error ? e.message : e);
  } finally {
    st.jalan = false;
  }
}

// ---------- Pemindaian akun yang kuotanya habis ----------

/**
 * Akun gratis (tanpa langganan aktif) 120 hari terakhir yang belum pernah di-follow-up, kuota AI-nya sudah habis, dan
 * SUDAH pernah chat nomor CS (chat yang tidak dibisukan / spam / minta berhenti). Antrean hanya berisi akun yang siap
 * disapa: akun yang belum pernah chat CS tidak diantrekan (dipindai lagi tiap putaran pemindaian), dan baris antre
 * yang chat-nya tidak cocok lagi dikeluarkan. Pemakaian dihitung di database dengan LIMIT sebesar kuota (berhenti
 * begitu mencapai batas), lalu dipastikan lewat sisaKuotaAi (bonus admin ikut dihitung).
 */
export async function pindai(): Promise<number> {
  if (st.pindaiJalan) return 0;
  st.pindaiJalan = true;
  try {
    const s = await pengaturanFollowup();
    if (!s.aktif) return 0;
    const [p, sql, cs] = await Promise.all([aturanPercobaan(), db(), nomorCsDipakai(s)]);
    if (!cs) return 0;
    const t = sekarang();
    const sekali = p.ulang === "sekali";
    const batas = Math.max(1, p.balasan);
    // Sapaan yang belum terkirim untuk akun yang chat CS-nya tidak (lagi) cocok: nomor diganti, tautan dilepas, chat
    // terhapus, nomor CS diganti, atau baris dari versi lama yang mengantrekan semua akun.
    await sql`
      DELETE FROM followup f USING users u
       WHERE u.id = f.user_id AND f.status = 'antre' AND f.tahap = 0
         AND NOT EXISTS (${chatCsCocok(sql, cs.id)})`;
    const kandidat = await sql<{ id: number; chat_id: number; telepon: string | null; nama: string | null }[]>`
      SELECT u.id, c.id AS chat_id, c.telepon, c.nama FROM users u
       CROSS JOIN LATERAL (${chatCsCocok(sql, cs.id)}) c
       WHERE u.peran = 'user' AND u.status = 'aktif' AND u.created_at >= ${t - UMUR_AKUN_PINDAI_DTK}
         AND EXISTS (SELECT 1 FROM numbers n WHERE n.user_id = u.id)
         AND NOT EXISTS (SELECT 1 FROM followup f WHERE f.user_id = u.id)
         AND NOT EXISTS (SELECT 1 FROM langganan l WHERE l.user_id = u.id AND l.sampai > ${t})
         AND c.prospek NOT IN (2, 3) AND c.spam <> 1
         AND NOT EXISTS (SELECT 1 FROM followup_stop fs WHERE fs.kunci = c.kunci)
         AND (
           (${sekali && p.hari > 0} AND u.created_at + ${p.hari * 86400} <= ${t})
           OR (SELECT COUNT(*) FROM (
                 SELECT 1 FROM numbers n JOIN ai_pakai a ON a.number_id = n.id AND NOT a.abaikan
                   AND a.waktu >= (CASE WHEN ${sekali} THEN u.created_at ELSE ${awalBulanWib(t)} END)
                  WHERE n.user_id = u.id LIMIT ${batas}) x) >= ${batas}
         )
       ORDER BY u.id DESC LIMIT 100`;
    let masuk = 0;
    for (const k of kandidat) {
      const hak = await hakAkun({ id: k.id, peran: "user" });
      if (hak.sampai !== null || (await sisaKuotaAi(k.id)) !== 0) continue;
      // Sudah chat CS sendiri sekitar kuota habis = sudah dilayani: dicatat batal (tidak diantrekan lagi), sama seperti
      // pemeriksaan sebelum menyapa, hanya lebih awal supaya "Dalam antrean" berisi yang benar-benar akan disapa.
      const duluan = await masukSejak(k.chat_id, t - CHAT_DULUAN_DTK);
      const r = await sql`
        INSERT INTO followup (user_id, status, alasan, tujuan, nama, jadwal, dibuat, diperbarui)
        VALUES (${k.id}, ${duluan ? "batal" : "antre"}, ${duluan ? "Pengguna sudah chat CS duluan" : null}, ${k.telepon}, ${k.nama},
                ${t + s.tundaJam * 3600}, ${t}, ${t})
        ON CONFLICT (user_id) DO NOTHING`;
      if (!duluan) masuk += r.count;
    }
    if (masuk) console.info(`[followup] ${masuk} akun gratis yang kuotanya habis masuk antrean`);
    return masuk;
  } catch (e) {
    console.error("[followup] pemindaian gagal:", e instanceof Error ? e.message : e);
    return 0;
  } finally {
    st.pindaiJalan = false;
  }
}

// ---------- Pesan masuk di nomor CS (dipanggil jembatan) ----------

async function konteksAkun(userId: number): Promise<string | null> {
  const u = await akun(userId);
  if (!u) return null;
  const [hak, sisa, pakai] = await Promise.all([hakAkun(u), sisaKuotaAi(u.id), pemakaianAkun(u.id)]);
  const paket = hak.sampai === null ? `tanpa paket aktif${sisa === 0 ? " (kuota balasan AI HABIS atau belum berlangganan, jadi AI di WhatsApp-nya TIDAK membalas pelanggan)" : ` (sisa ${sisa ?? "∞"} balasan AI gratis)`}` : `paket ${hak.paket} yang masih aktif`;
  return `Lawan bicara ini pemilik akun ${MEREK} "${u.nama || "-"}" (email login ${u.email}), ${paket}. Bot-nya sudah mengirim ${pakai.balasan} balasan AI ke ${pakai.pelanggan} pelanggan. Tugasmu menutup penjualan dengan jujur: jawab keberatannya dengan fakta, rekomendasikan SATU paket yang pas untuk pemakaiannya, lalu arahkan ke ${asal()}/langganan (login dengan email tadi). Ada jaminan uang kembali ${MASA_ID} untuk pembayaran pertama lewat GoPay, ShopeePay, atau QRIS. Bila ia menolak dengan jelas, hormati dan jangan memaksa.`;
}

async function pesanMasuk(d: { numberId: number; kunci: string; teks: string; telepon: string | null }): Promise<string | null> {
  // Nomor pengguna dengan follow-up aktif (bukan nomor CS): hanya balasan atas follow-up-nya sendiri.
  if (!st.cs.ids.has(d.numberId)) {
    const c = await pesanMasukUsaha({ kunci: d.kunci, teks: d.teks });
    return c ? `[Konteks follow-up] ${c}` : null;
  }
  const catatan: string[] = [];
  const teks = d.teks.trim();

  // Kode akun dari tombol "Chat CS": chat ini milik akun itu (dari HP mana pun). Kode tanpa HMAC yang cocok diabaikan.
  const m = teks ? POLA_KODE.exec(teks) : null;
  if (m && kodeAkun(Number(m[1])) === `${m[1]}-${m[2].toLowerCase()}`) {
    const userId = Number(m[1]);
    const sql = await db();
    const t = sekarang();
    const alasan = "Pengguna chat CS duluan lewat tombol Chat CS";
    await sql`UPDATE users SET cs_kunci = ${d.kunci} WHERE id = ${userId}`;
    // Akun yang belum pernah chat CS belum punya baris antrean. Bila kuota gratisnya habis, pembatalan dicatat sekarang
    // supaya pemindaian tidak mengantrekannya lewat chat yang baru tertaut ini (ia sudah dilayani CS).
    const u = await akun(userId);
    const habis = u?.peran === "user" && (await hakAkun(u)).sampai === null && (await sisaKuotaAi(u.id)) === 0;
    if (habis)
      await sql`
        INSERT INTO followup (user_id, status, alasan, tujuan, jadwal, dibuat, diperbarui)
        VALUES (${userId}, 'batal', ${alasan}, ${d.telepon}, ${t}, ${t}, ${t})
        ON CONFLICT (user_id) DO UPDATE SET status = 'batal', alasan = EXCLUDED.alasan, diperbarui = EXCLUDED.diperbarui
         WHERE followup.status = 'antre'`;
    else await sql`UPDATE followup SET status = 'batal', alasan = ${alasan}, diperbarui = ${t} WHERE user_id = ${userId} AND status = 'antre'`;
    const k = await konteksAkun(userId);
    if (k) catatan.push(`${k} Ia menghubungi lewat tombol "Chat CS" di dashboard-nya.`);
  }

  // Hanya balasan PERTAMA setelah follow-up yang dinilai (permintaan berhenti / konteks akun). Sesudahnya percakapan
  // berjalan biasa: kata seperti "berhenti" di tengah obrolan soal paket tidak boleh dianggap menolak dihubungi.
  const f = st.aktif.get(d.kunci);
  if (f && !f.dicatat) {
    const t = sekarang();
    const stop = !!teks && (POLA_STOP.test(teks) || POLA_STOP_PENDEK.test(teks));
    const sql = await db();
    st.aktif.set(d.kunci, { ...f, status: stop ? "stop" : f.status === "terkirim" || f.status === "selesai" ? "dibalas" : f.status, dicatat: true });
    if (stop) {
      await sql`INSERT INTO followup_stop (kunci, dibuat) VALUES (${d.kunci}, ${t}) ON CONFLICT (kunci) DO NOTHING`;
      await sql`UPDATE followup SET status = 'stop', alasan = 'Pengguna meminta tidak dihubungi lagi', diperbarui = ${t}, dibalas = COALESCE(dibalas, ${t}) WHERE user_id = ${f.userId}`;
      console.info(`[followup] akun ${f.userId} meminta tidak dihubungi lagi`);
      catatan.push(
        `Lawan bicara ini menerima follow-up dari kita${f.teks ? ` ("${f.teks.slice(0, 300)}")` : ""} dan meminta tidak dihubungi lagi. Minta maaf singkat dalam satu kalimat, pastikan ia tidak akan dikirimi follow-up lagi, dan jangan menawarkan apa pun.`,
      );
    } else {
      await sql`
        UPDATE followup SET status = CASE WHEN status IN ('terkirim', 'selesai') THEN 'dibalas' ELSE status END,
               alasan = CASE WHEN status IN ('terkirim', 'selesai') THEN null ELSE alasan END,
               dibalas = COALESCE(dibalas, ${t}), diperbarui = ${t}
         WHERE user_id = ${f.userId}`;
      const k = await konteksAkun(f.userId);
      if (k) catatan.push(`${f.teks ? `Kamu (CS) tadi mengirim follow-up ini ke chat ini: "${f.teks.slice(0, 400)}". Pesan berikut adalah balasannya. ` : ""}${k}`);
    }
  }
  const prospek = await pesanMasukProspek({ kunci: d.kunci, teks });
  if (prospek) catatan.push(prospek);
  return catatan.length ? `[Konteks CS ${MEREK}] ${catatan.join(" ")}` : null;
}

// ---------- Status kiriman (centang) ----------

function terimaAck(_sesi: string, id: string, status: number): void {
  const x = st.ack.get(id);
  if (!x) {
    if (!terimaAckProspek(id, status)) terimaAckUsaha(id, status);
    return;
  }
  const nilai = Math.min(4, status);
  if (nilai <= x.ack) return;
  x.ack = nilai;
  if (nilai >= 4) st.ack.delete(id);
  void db()
    .then((sql) =>
      x.slot === 1
        ? sql`UPDATE followup SET ack1 = GREATEST(ack1, ${nilai}) WHERE user_id = ${x.userId}`
        : sql`UPDATE followup SET ack2 = GREATEST(ack2, ${nilai}) WHERE user_id = ${x.userId}`,
    )
    .catch((e) => console.warn("[followup] status kiriman gagal disimpan:", e instanceof Error ? e.message : e));
}

/** Baris yang masih dipantau (14 hari terakhir) dimuat ke memori saat server mulai. Tabelnya kecil (1 baris per akun). */
async function muatPantauan(): Promise<void> {
  const sql = await db();
  const sejak = sekarang() - PANTAU_DTK;
  const baris = await sql<{ user_id: number; status: StatusFollowup; kunci: string | null; pesan1_id: string | null; pesan2_id: string | null; ack1: number; ack2: number; dibalas: number | null }[]>`
    SELECT user_id, status, kunci, pesan1_id, pesan2_id, ack1, ack2, dibalas
      FROM followup WHERE terkirim1 >= ${sejak} OR terkirim2 >= ${sejak}`;
  for (const b of baris) {
    if (b.kunci) st.aktif.set(b.kunci, { userId: b.user_id, status: b.status, teks: null, dicatat: b.dibalas !== null || b.status === "stop" });
    if (b.pesan1_id && b.ack1 < 4) st.ack.set(b.pesan1_id, { userId: b.user_id, slot: 1, ack: b.ack1 });
    if (b.pesan2_id && b.ack2 < 4) st.ack.set(b.pesan2_id, { userId: b.user_id, slot: 2, ack: b.ack2 });
  }
  // Teks follow-up terakhir per chat (konteks AI saat dibalas setelah server dimulai ulang), satu query.
  const kunci = [...st.aktif.keys()];
  if (kunci.length) {
    const teks = await sql<{ kunci: string; teks: string }[]>`
      SELECT p.kunci, m.teks FROM percakapan p
      CROSS JOIN LATERAL (SELECT teks FROM pesan_chat WHERE percakapan_id = p.id AND peran = 1 ORDER BY id DESC LIMIT 1) m
       WHERE p.kunci = ANY(${sql.array(kunci)})`;
    for (const r of teks) {
      const v = st.aktif.get(r.kunci);
      if (v) v.teks = r.teks;
    }
  }
  // Jeda acak berlaku juga setelah dimulai ulang (deploy), dihitung dari kiriman terakhir.
  const [akhir] = await sql<{ w: number | null }[]>`SELECT MAX(GREATEST(terkirim1, COALESCE(terkirim2, 0)))::bigint AS w FROM followup WHERE terkirim1 >= ${sejak}`;
  if (akhir?.w) st.bolehPada = Math.max(st.bolehPada, akhir.w * 1000 + jedaAcakMs());
}

/** Satu putaran pengiriman sekarang (dipakai uji; di server dijalankan timer tiap menit). */
export const putaranFollowup = (): Promise<void> => putaran();

/** Satu putaran follow-up nomor pengguna (followup-usaha.ts); nomor CS ChatGerCep tidak ikut. */
export async function putaranFollowupUsaha(): Promise<void> {
  await segarkanCs().catch(() => {});
  await putaranUsaha(st.cs.ids);
}

/** Nomor CS ChatGerCep (dari memori): tab Follow-up nomor pengguna tidak berlaku untuk nomor ini. */
export async function nomorCsChatGercep(): Promise<ReadonlySet<number>> {
  if (!st.cs.ids.size) await segarkanCs().catch(() => {});
  return st.cs.ids;
}

/**
 * Tanda bahaya dari WhatsApp (wa.ts: perangkat dicabut, login ditolak 403, error 463) di sebuah nomor: follow-up nomor
 * itu langsung direm (tersimpan, bertahan setelah restart) dan pemiliknya / admin diberi tahu. Nomor CS memakai rem
 * follow-up CS; nomor pengguna memakai rem per nomor (followup-usaha.ts).
 */
async function remBahaya(sesi: string, alasan: string): Promise<void> {
  const n = await nomorBySesi(sesi);
  if (!n) return;
  if (!st.cs.ids.size) await segarkanCs().catch(() => {});
  if (!st.cs.ids.has(n.id)) return remBahayaUsaha(n, alasan);
  if (await remAktif()) return;
  const s = await pengaturanFollowup();
  if (!s.aktif && !(await pengaturanProspek()).aktif) return;
  const t = sekarang();
  const teks = `${alasan} di nomor CS ${n.label}. Follow-up dihentikan supaya nomor tidak makin dibatasi.`;
  await setSetting(KUNCI_REM, JSON.stringify({ pada: t, alasan: teks }));
  console.error(`[followup] REM BAHAYA: ${teks}`);
  await kirimNotifAdmin({
    jenis: "admin_followup",
    judul: { id: "Follow-up WhatsApp dihentikan otomatis", en: "WhatsApp follow-up stopped automatically" },
    isi: { id: `${teks} Pastikan nomornya normal dan tersambung stabil minimal sehari sebelum melepas rem.`, en: `WhatsApp signalled a restriction on CS number ${n.label} (${alasan}). Follow-up was paused; make sure the number is stable for a day before resuming.` },
    tautan: "/admin/followup",
    kunci: `followup-bahaya:${t}`,
  });
}

/** Dijalankan sekali saat server mulai (instrumentation.ts). */
export function mulaiFollowup(): void {
  if (st.mulai) return;
  st.mulai = true;
  pasangKaitCs({ nomorCs: () => st.cs, nomorFollowup: nomorFollowupUsaha, pesanMasuk });
  padaAck(terimaAck);
  padaBahaya((sesi, alasan) => void remBahaya(sesi, alasan).catch((e) => console.warn("[followup] rem bahaya gagal:", e instanceof Error ? e.message : e)));
  void segarkanCs().catch(() => {});
  void muatPantauan().catch((e) => console.warn("[followup] pantauan gagal dimuat:", e instanceof Error ? e.message : e));
  void muatPantauanProspek().catch((e) => console.warn("[followup-prospek] pantauan gagal dimuat:", e instanceof Error ? e.message : e));
  void muatPantauanUsaha().catch((e) => console.warn("[followup-usaha] pantauan gagal dimuat:", e instanceof Error ? e.message : e));
  st.timer = setInterval(() => void putaran(), PUTARAN_MS);
  st.timer.unref?.();
  // Follow-up nomor pengguna: timer sendiri (tidak bergantung pada saklar follow-up nomor CS), nomor CS dikecualikan.
  st.timerUsaha = setInterval(() => void putaranUsaha(st.cs.ids), PUTARAN_MS);
  st.timerUsaha.unref?.();
  setTimeout(() => void pindai(), PINDAI_AWAL_MS).unref?.();
  st.timerPindai = setInterval(() => void pindai(), PINDAI_MS);
  st.timerPindai.unref?.();
}

// ---------- Untuk halaman admin ----------

export async function statusMesinFollowup(): Promise<StatusMesinFollowup> {
  const [setelan, rem, sql] = await Promise.all([pengaturanFollowup(), remAktif(), db()]);
  const [n, hitung, hariIni] = await Promise.all([
    nomorCsDipakai(setelan),
    sql<{ status: StatusFollowup; n: number }[]>`SELECT status, COUNT(*)::int AS n FROM followup GROUP BY status`,
    kirimanHariIni(),
  ]);
  return {
    setelan,
    nomor: n ? { id: n.id, label: n.label, wa_id: n.wa_id, terhubung: infoSesi(n.sesi).status === "WORKING" } : null,
    rem,
    kirimHariIni: hariIni,
    hitung: Object.fromEntries(hitung.map((h) => [h.status, h.n])),
  };
}

/** Riwayat terbaru (kursor `sebelum` = diperbarui terakhir halaman sebelumnya), lewat followup_diperbarui_idx. */
export async function daftarFollowup(opsi: { status?: StatusFollowup | null; batas?: number } = {}): Promise<BarisFollowup[]> {
  const sql = await db();
  const batas = Math.min(100, Math.max(1, opsi.batas ?? 50));
  const status = opsi.status ?? null;
  return [
    ...(await sql<BarisFollowup[]>`
      SELECT f.user_id, u.email, u.nama AS nama_akun, f.status, f.tujuan, f.nama, f.tahap, f.jadwal, f.dibuat, f.diperbarui,
             f.terkirim1, f.terkirim2, f.ack1, f.ack2, f.dibalas, f.alasan, f.pesan1, f.pesan2
        FROM followup f JOIN users u ON u.id = f.user_id
       WHERE ${status}::text IS NULL OR f.status = ${status}
       ORDER BY f.diperbarui DESC, f.user_id DESC LIMIT ${batas}`),
  ];
}

export interface FollowupAkun {
  baris: BarisFollowup | null;
  /** Chat CS yang akan dipakai untuk akun ini sekarang (null = belum ada, follow-up tidak akan dikirim). */
  chat: { telepon: string | null; nama: string | null; manual: boolean } | null;
  /** Nomor CS belum diatur / belum tertaut. */
  tanpaNomorCs: boolean;
}

export async function followupAkun(userId: number): Promise<FollowupAkun> {
  const cs = await nomorCsDipakai();
  const sql = await db();
  const [[baris], chat] = await Promise.all([
    sql<BarisFollowup[]>`
      SELECT f.user_id, u.email, u.nama AS nama_akun, f.status, f.tujuan, f.nama, f.tahap, f.jadwal, f.dibuat, f.diperbarui,
             f.terkirim1, f.terkirim2, f.ack1, f.ack2, f.dibalas, f.alasan, f.pesan1, f.pesan2
        FROM followup f JOIN users u ON u.id = f.user_id WHERE f.user_id = ${userId}`,
    cs ? chatAkun(userId, cs.id) : Promise.resolve(undefined),
  ]);
  return { baris: baris ?? null, chat: chat ? { telepon: chat.telepon, nama: chat.nama, manual: chat.manual } : null, tanpaNomorCs: !cs };
}

/**
 * Admin menautkan akun ke chat CS lewat nomor WA yang dipakai pengguna saat chat CS (bila berbeda dari nomor yang
 * di-scan). Nomor itu WAJIB sudah pernah chat nomor CS: follow-up tidak pernah memulai chat baru. Kosong = lepas.
 */
export async function tautkanChatCs(userId: number, masukan: string): Promise<string> {
  const sql = await db();
  if (!masukan.trim()) {
    await sql`UPDATE users SET cs_kunci = NULL WHERE id = ${userId}`;
    await pindai(); // tanpa chat yang cocok lagi = keluar dari antrean
    return "Tautan manual dilepas. Follow-up memakai nomor yang cocok otomatis (bila ada).";
  }
  const digit = rapikanNomorWa(masukan);
  if (!digit) throw new PenggunaError("Format nomor WhatsApp tidak dikenali.");
  const cs = await nomorCsDipakai();
  if (!cs) throw new PenggunaError("Nomor CS follow-up belum diatur (Admin › Follow-up WA).");
  const [c] = await sql<{ kunci: string; nama: string | null }[]>`
    SELECT kunci, nama FROM percakapan WHERE number_id = ${cs.id} AND telepon = ${digit} ORDER BY terakhir_pada DESC LIMIT 1`;
  if (!c) throw new PenggunaError(`Nomor ini belum pernah chat nomor CS (${cs.label}). Follow-up hanya dikirim ke nomor yang sudah pernah chat.`);
  await sql`UPDATE users SET cs_kunci = ${c.kunci} WHERE id = ${userId}`;
  // Sudah di antrean: tujuan yang tampil ikut chat ini. Belum: pemindaian langsung mengantrekannya bila kuotanya habis.
  await sql`UPDATE followup SET tujuan = ${digit}, nama = ${c.nama}, diperbarui = ${sekarang()} WHERE user_id = ${userId} AND status = 'antre'`;
  await pindai();
  return `Tertaut ke chat CS${c.nama ? ` "${c.nama}"` : ""}.`;
}

/** Akun yang follow-up-nya batal/gagal TANPA pernah dikirimi pesan bisa diantrekan lagi oleh admin. */
export async function antrekanUlang(userId: number): Promise<void> {
  const sql = await db();
  const t = sekarang();
  const r = await sql`
    UPDATE followup SET status = 'antre', alasan = 'Diantrekan ulang oleh admin', jadwal = ${t}, dibuat = ${t}, diperbarui = ${t}
     WHERE user_id = ${userId} AND tahap = 0 AND status IN ('batal', 'gagal')`;
  if (!r.count) throw new PenggunaError("Hanya follow-up yang dibatalkan sebelum ada pesan terkirim yang bisa diantrekan ulang.");
}

/** Pesan mana yang masih bisa diubah: sapaan (belum terkirim) atau pengingat (sapaan sudah terkirim). null = sudah final. */
async function slotUbah(userId: number): Promise<{ slot: 1 | 2; kunci: string | null; pesan1: string | null } | null> {
  const sql = await db();
  const [b] = await sql<{ status: StatusFollowup; tahap: number; kunci: string | null; pesan1: string | null }[]>`
    SELECT status, tahap, kunci, pesan1 FROM followup WHERE user_id = ${userId}`;
  if (!b) return null;
  if (b.status === "antre" && b.tahap === 0) return { slot: 1, kunci: b.kunci, pesan1: b.pesan1 };
  if (b.status === "terkirim" && b.tahap === 1) return { slot: 2, kunci: b.kunci, pesan1: b.pesan1 };
  return null;
}

/** Admin: tulis ulang draf pesan berikutnya dengan AI (menimpa draf / suntingan sebelumnya). */
export async function tulisUlangPesan(userId: number): Promise<string> {
  const x = await slotUbah(userId);
  if (!x) throw new PenggunaError("Tidak ada pesan yang menunggu dikirim untuk akun ini.");
  const [cs, u] = await Promise.all([nomorCsDipakai(), akun(userId)]);
  if (!cs) throw new PenggunaError("Nomor CS follow-up belum diatur.");
  if (!u) throw new PenggunaError("Akun tidak ditemukan.");
  const chat = x.slot === 1 ? await chatAkun(u.id, cs.id) : x.kunci ? await chatByKunci(x.kunci) : undefined;
  if (!chat) throw new PenggunaError("Belum ada chat CS yang cocok untuk akun ini, jadi pesannya belum bisa disusun. Isi nomor follow-up di halaman pengguna.");
  const { teks } = (await tulisPesan(u, chat, cs, x.slot === 1 ? "sapaan" : "pengingat", x.slot === 2 ? x.pesan1 : null, false)) as { teks: string };
  const sql = await db();
  if (x.slot === 1) await sql`UPDATE followup SET pesan1 = ${teks}, tujuan = ${chat.telepon}, nama = ${chat.nama} WHERE user_id = ${userId} AND tahap = 0`;
  else await sql`UPDATE followup SET pesan2 = ${teks} WHERE user_id = ${userId} AND tahap = 1`;
  st.lewatDraf.delete(userId);
  return teks;
}

/** Admin: simpan suntingan draf pesan berikutnya. Teks inilah yang dikirim, persis. */
export async function simpanPesan(userId: number, teks: string): Promise<void> {
  const bersih = teks.replace(/\u0000/g, "").replace(/\r\n/g, "\n").trim();
  if (bersih.length < BATAS_PESAN[0] || bersih.length > BATAS_PESAN[1]) throw new PenggunaError(`Pesan harus ${BATAS_PESAN[0]}–${BATAS_PESAN[1]} karakter.`);
  const x = await slotUbah(userId);
  if (!x) throw new PenggunaError("Pesan ini sudah terkirim atau follow-up-nya sudah selesai, jadi tidak bisa diubah lagi.");
  const sql = await db();
  if (x.slot === 1) await sql`UPDATE followup SET pesan1 = ${bersih} WHERE user_id = ${userId} AND tahap = 0`;
  else await sql`UPDATE followup SET pesan2 = ${bersih} WHERE user_id = ${userId} AND tahap = 1`;
}
