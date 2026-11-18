import "server-only";
import { db, sekarang } from "./db";
import { bakukanTag, catatPakai, tanyaAi } from "./ai";
import { formatWa, kirimSapaan } from "./bridge";
import { ATURAN_LEWATI, GAYA_PESAN, type HasilSusun, alasanTahan, ambilLewati } from "./followup-aman";
import {
  BATAS_PEMANASAN,
  BATAS_PESAN,
  BATAS_SETELAN_USAHA,
  type BarisUsaha,
  JEDA_ANTARPESAN_MENIT,
  NOMOR_BARU_HARI,
  PEMANASAN_HARI,
  POLA_STOP,
  POLA_STOP_PENDEK,
  PORSI_ULANG,
  RASIO_KIRIMAN,
  RASIO_MIN,
  SETELAN_USAHA_AWAL,
  type SetelanUsaha,
  type StatusProspek,
  type StatusUlang,
  type StatusUsaha,
  UMUR_ULANG_HARI,
} from "./followup-def";
import { POLA_DESAK, POLA_TAUTAN } from "./followup-prospek";
import { daftarProduk, katalogBoleh } from "./katalog";
import { ambilKirimProduk } from "./katalog-def";
import { susunSistem } from "./knowledge";
import { aiUntukAkun, akunBerbayar, sisaKuotaAi } from "./langganan";
import { botBoleh } from "./mesin/lisensi";
import { modeMesin } from "./mode";
import { kirimNotif } from "./notifikasi";
import { type Nomor, nomorById } from "./numbers";
import { periksaJawaban } from "./pemeriksa";
import { adaKode } from "./penjaga";
import { PenggunaError } from "./pengguna";
import { staf } from "./peran";
import { riwayatUntukAi } from "./percakapan";
import { LURUH_MINAT_DTK, ambilNilai, minatEfektif } from "./prospek-def";
import { WaError, infoSesi } from "./wa";

/**
 * Follow-up di nomor pengguna berbayar (docs/plans/2026-11-14-followup-nomor-pengguna.md).
 *
 * Dua jenis, saklar masing-masing per nomor (bawaan mati):
 *   - Prospek: aturan follow-up prospek nomor CS ChatGerCep (followup-prospek.ts) apa adanya: hanya orang yang chat
 *     DULUAN, dinilai hangat/panas, sudah dijawab, lalu diam (aktif dalam 3 hari terakhir); paling banyak 3 pesan
 *     (lanjutan, manfaat, pamit), berhenti begitu ia membalas. Baris disimpan di followup_prospek dengan usaha = true.
 *   - Order ulang: pembeli lama (tag <minat>beli</minat>) yang diam sejak siklusUlangHari; 1 pesan per pembelian,
 *     paling sering sekali per 30 hari per chat, chat yang sepi > UMUR_ULANG_HARI tidak disentuh (followup_ulang).
 *
 * Anti-blokir, lebih ketat dari nomor CS karena nomor pengguna belum tentu "matang":
 *   - Batas harian, jeda acak, jam kirim, dan rem centang satu PER NOMOR. Rem satu nomor tidak menghentikan nomor lain;
 *     pemilik nomor diberi notifikasi dan melanjutkan sendiri dari tab Follow-up.
 *   - Nomor sehat (followup-aman.ts): soket tersambung stabil >= STABIL_MENIT dan tanpa tanda bahaya WhatsApp (401
 *     dicabut / 403 / error 463). Tanda bahaya = rem nomor itu langsung menyala (remBahayaUsaha) + pemilik diberi tahu.
 *   - Nomor baru: < NOMOR_BARU_HARI hari tanpa follow-up sama sekali, lalu sampai PEMANASAN_HARI hari dibatasi
 *     BATAS_PEMANASAN pesan/hari.
 *   - Rasio: pesan follow-up per hari paling banyak RASIO_KIRIMAN x balasan biasa (minimal RASIO_MIN).
 *   - Order ulang paling banyak PORSI_ULANG batas harian: lead baru didahulukan.
 *   - Menghormati pemilik: chat yang bot-nya sedang dijeda atau dibalas pemilik dari HP dalam 24 jam dilewati.
 *   - Isi: hard selling produk milik pemilik nomor, ditulis AI dari riwayat chat, Informasi Usaha, dan katalog nomor itu
 *     (rekomendasi satu produk yang paling cocok + harga persis, jawab keberatan, pertanyaan penutupan, pembalik risiko
 *     hanya bila tertulis). Tanpa tautan, tanpa kelangkaan/batas waktu palsu, fakta diperiksa pemeriksa.ts (gagal dua
 *     kali = templat netral). AI lebih dulu menilai riwayat: chat yang sudah menolak / sudah beli / komplain / bukan
 *     soal membeli dilewati (<lewati>), karena orang yang merasa terganggu itulah yang melaporkan nomor.
 *
 * Kuota: tiap pesan yang ditulis AI dan dipakai = 1 balasan AI akun itu (draf yang ditolak pemeriksa tidak dihitung).
 * Kuota habis = tidak ada follow-up yang dikirim.
 *
 * Hemat resource: setelan nomor yang aktif dipegang di memori (followup_nomor_aktif_idx), putaran tiap menit (dari
 * followup.ts) tanpa I/O sampai sebuah nomor boleh mengirim. Pemindaian lead tiap 5 menit per nomor lewat
 * percakapan_lead_idx, pembeli lama tiap 30 menit lewat percakapan_beli_idx, antrean lewat indeks parsial per nomor.
 */

const PINDAI_MS = 5 * 60_000;
const PINDAI_ULANG_MS = 30 * 60_000;
const SEGARKAN_MS = 5 * 60_000;
const CEK_REM_MS = 10 * 60_000;
const CEK_RASIO_MS = 10 * 60_000;
/** Lead yang diam lebih lama dari ini saat dipindai tidak diantrekan (follow-up selalu dekat dengan percakapannya). */
const JENDELA_DTK = 3 * 86400;
const PANTAU_DTK = 14 * 86400;
/** Draf disiapkan menjelang jadwal (pratinjau pemilik), paling banyak sekian per nomor per putaran. */
const DRAF_PER_PUTARAN = 2;
const DRAF_SEBELUM_DTK = 3 * 3600;
/** Pemilik membalas sendiri dari HP dalam rentang ini = chat dilewati (sedang ditangani manusia). */
const PEMILIK_DTK = 86400;
/** Jarak minimum dua pengingat order ulang di satu chat. */
const JARAK_ULANG_DTK = 30 * 86400;
/** Nomor yang dilayani per putaran (bergiliran) supaya beban tiap menit rata. */
const NOMOR_PER_PUTARAN = 20;

type Tahap = 1 | 2 | 3;

interface PerNomor {
  setelan: SetelanUsaha;
  rem: { pada: number; alasan: string } | null;
  remLepas: number;
  bolehPada: number;
  hari: string;
  kirimHari: number;
  kirimUlangHari: number;
  pindaiPada: number;
  pindaiUlangPada: number;
  cekRemPada: number;
  rasio: { pada: number; batas: number };
}

interface Keadaan {
  per: Map<number, PerNomor>;
  ids: Set<number>;
  /** Chat yang pernah menerima follow-up (14 hari): balasan pertamanya dinilai (stop / dibalas). */
  aktif: Map<string, { jenis: "prospek" | "ulang"; teks: string | null; dicatat: boolean }>;
  ack: Map<string, { kunci: string; jenis: "prospek" | "ulang"; slot: 1 | 2 | 3; ack: number }>;
  dimuatPada: number;
  pantauan: boolean;
  jalan: boolean;
  giliran: number;
}

const g = globalThis as unknown as { __waFollowupUsaha?: Keadaan };
const st: Keadaan = (g.__waFollowupUsaha ??= { per: new Map(), ids: new Set(), aktif: new Map(), ack: new Map(), dimuatPada: 0, pantauan: false, jalan: false, giliran: 0 });

/** Galat untuk pemilik nomor, dua bahasa (pesanGalat di actions.ts memakai `en`). */
const galat = (id: string, en: string): PenggunaError => Object.assign(new PenggunaError(id), { en });

// ---------- Setelan ----------

const dalamRentang = (v: unknown, [min, maks]: readonly [number, number], bawaan: number): number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= maks ? v : bawaan;

export function uraiSetelanUsaha(v: Partial<SetelanUsaha> | null | undefined, aktif?: boolean, ulangAktif?: boolean): SetelanUsaha {
  const x = v ?? {};
  const a = SETELAN_USAHA_AWAL;
  const b = BATAS_SETELAN_USAHA;
  const jamMulai = dalamRentang(x.jamMulai, b.jamMulai, a.jamMulai);
  let jamSelesai = dalamRentang(x.jamSelesai, b.jamSelesai, a.jamSelesai);
  if (jamSelesai <= jamMulai) jamSelesai = Math.min(24, jamMulai + 1);
  return {
    aktif: aktif ?? x.aktif === true,
    ulangAktif: ulangAktif ?? x.ulangAktif === true,
    jamMulai,
    jamSelesai,
    batasHarian: dalamRentang(x.batasHarian, b.batasHarian, a.batasHarian),
    jedaPanasJam: dalamRentang(x.jedaPanasJam, b.jedaPanasJam, a.jedaPanasJam),
    jedaHangatJam: dalamRentang(x.jedaHangatJam, b.jedaHangatJam, a.jedaHangatJam),
    tahap2Jam: dalamRentang(x.tahap2Jam, b.tahap2Jam, a.tahap2Jam),
    tahap3Jam: dalamRentang(x.tahap3Jam, b.tahap3Jam, a.tahap3Jam),
    maksTahap: dalamRentang(x.maksTahap, b.maksTahap, a.maksTahap),
    siklusUlangHari: dalamRentang(x.siklusUlangHari, b.siklusUlangHari, a.siklusUlangHari),
  };
}

interface BarisSetelan {
  number_id: number;
  aktif: boolean;
  ulang_aktif: boolean;
  setelan: Partial<SetelanUsaha>;
  rem_pada: number | null;
  rem_alasan: string | null;
  rem_lepas: number;
}

function perBaru(b: BarisSetelan, lama?: PerNomor): PerNomor {
  return {
    setelan: uraiSetelanUsaha(b.setelan, b.aktif, b.ulang_aktif),
    rem: b.rem_pada ? { pada: b.rem_pada, alasan: b.rem_alasan ?? "" } : null,
    remLepas: b.rem_lepas,
    bolehPada: lama?.bolehPada ?? 0,
    hari: lama?.hari ?? "",
    kirimHari: lama?.kirimHari ?? 0,
    kirimUlangHari: lama?.kirimUlangHari ?? 0,
    pindaiPada: lama?.pindaiPada ?? 0,
    pindaiUlangPada: lama?.pindaiUlangPada ?? 0,
    cekRemPada: lama?.cekRemPada ?? 0,
    rasio: lama?.rasio ?? { pada: 0, batas: 0 },
  };
}

/** Nomor dengan follow-up aktif (lewat followup_nomor_aktif_idx), disegarkan tiap SEGARKAN_MS dan saat setelan disimpan. */
async function segarkan(paksa = false): Promise<void> {
  if (!paksa && Date.now() - st.dimuatPada < SEGARKAN_MS) return;
  st.dimuatPada = Date.now();
  const sql = await db();
  const baris = await sql<BarisSetelan[]>`
    SELECT number_id, aktif, ulang_aktif, setelan, rem_pada, rem_alasan, rem_lepas FROM followup_nomor WHERE aktif OR ulang_aktif`;
  const baru = new Map<number, PerNomor>();
  for (const b of baris) baru.set(b.number_id, perBaru(b, st.per.get(b.number_id)));
  st.per = baru;
  st.ids = new Set(baru.keys());
}

/** Untuk jembatan (bridge.ts lewat followup.ts): nomor yang follow-up-nya aktif, dari memori. */
export const nomorFollowupUsaha = (): ReadonlySet<number> => st.ids;

export async function setelanNomor(numberId: number): Promise<{ setelan: SetelanUsaha; rem: { pada: number; alasan: string } | null }> {
  const sql = await db();
  const [b] = await sql<BarisSetelan[]>`
    SELECT number_id, aktif, ulang_aktif, setelan, rem_pada, rem_alasan, rem_lepas FROM followup_nomor WHERE number_id = ${numberId}`;
  if (!b) return { setelan: { ...SETELAN_USAHA_AWAL }, rem: null };
  return { setelan: uraiSetelanUsaha(b.setelan, b.aktif, b.ulang_aktif), rem: b.rem_pada ? { pada: b.rem_pada, alasan: b.rem_alasan ?? "" } : null };
}

export async function simpanSetelanNomor(numberId: number, s: SetelanUsaha): Promise<SetelanUsaha> {
  const bersih = uraiSetelanUsaha(s, s.aktif === true, s.ulangAktif === true);
  const { aktif, ulangAktif, ...sisa } = bersih;
  const sql = await db();
  await sql`
    INSERT INTO followup_nomor (number_id, aktif, ulang_aktif, setelan, diperbarui)
    VALUES (${numberId}, ${aktif}, ${ulangAktif}, ${sql.json(sisa)}, ${sekarang()})
    ON CONFLICT (number_id) DO UPDATE SET aktif = EXCLUDED.aktif, ulang_aktif = EXCLUDED.ulang_aktif, setelan = EXCLUDED.setelan, diperbarui = EXCLUDED.diperbarui`;
  // Saklar dimatikan: antrean yang masih berjalan dibatalkan (tidak ada pesan lagi setelah pemilik mematikan).
  if (!aktif)
    await sql`UPDATE followup_prospek SET status = 'batal', alasan = 'Follow-up prospek dimatikan pemilik', diperbarui = ${sekarang()}
               WHERE number_id = ${numberId} AND usaha AND status = 'jalan'`;
  if (!ulangAktif)
    await sql`UPDATE followup_ulang SET status = 'batal', alasan = 'Pengingat order ulang dimatikan pemilik', diperbarui = ${sekarang()}
               WHERE number_id = ${numberId} AND status = 'jalan'`;
  await segarkan(true);
  const p = st.per.get(numberId);
  if (p) {
    p.pindaiPada = 0;
    p.pindaiUlangPada = 0;
  }
  return bersih;
}

export async function lepasRemNomor(numberId: number): Promise<void> {
  const sql = await db();
  const t = sekarang();
  // Kiriman sebelum rem dilepas tidak dihitung lagi, supaya rem tidak langsung menyala ulang.
  await sql`UPDATE followup_nomor SET rem_pada = NULL, rem_alasan = NULL, rem_lepas = ${t}, diperbarui = ${t} WHERE number_id = ${numberId}`;
  const p = st.per.get(numberId);
  if (p) {
    p.rem = null;
    p.remLepas = t;
  }
}

/** Akun boleh memakai follow-up: langganan aktif, staf, atau mesin self-host (fitur `bot`). */
const cacheBoleh = new Map<number, { at: number; ok: boolean }>();
export async function followupBoleh(userId: number | null): Promise<boolean> {
  if (userId === null) return false;
  if (modeMesin()) return botBoleh();
  const c = cacheBoleh.get(userId);
  if (c && Date.now() - c.at < 60_000) return c.ok;
  const sql = await db();
  const [u] = await sql<{ peran: string }[]>`SELECT peran FROM users WHERE id = ${userId}`;
  const ok = staf(u?.peran) || (await akunBerbayar(userId));
  cacheBoleh.set(userId, { at: Date.now(), ok });
  if (cacheBoleh.size > 5000) cacheBoleh.clear();
  return ok;
}

// ---------- Anggaran per nomor ----------

function awalHariWib(t = sekarang()): number {
  const w = new Date((t + 7 * 3600) * 1000);
  return Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate()) / 1000 - 7 * 3600;
}
const jamWibSekarang = (): number => new Date(Date.now() + 7 * 3600_000).getUTCHours();
const jedaAcakMs = (): number => {
  const [a, b] = JEDA_ANTARPESAN_MENIT;
  return Math.round((a + Math.random() * (b - a)) * 60_000);
};

/** Kiriman follow-up hari ini (WIB) di satu nomor: dihitung sekali per hari lalu ditambah di memori. */
async function kirimanHariIni(numberId: number, p: PerNomor): Promise<{ total: number; ulang: number }> {
  const awal = awalHariWib();
  const kunci = String(awal);
  if (p.hari !== kunci) {
    const sql = await db();
    const [[a], [b]] = await Promise.all([
      sql<{ n: number }[]>`
        SELECT (COUNT(*) FILTER (WHERE terkirim1 >= ${awal}) + COUNT(*) FILTER (WHERE terkirim2 >= ${awal}) + COUNT(*) FILTER (WHERE terkirim3 >= ${awal}))::int AS n
          FROM followup_prospek WHERE number_id = ${numberId} AND usaha AND diperbarui >= ${awal}`,
      sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM followup_ulang WHERE number_id = ${numberId} AND diperbarui >= ${awal} AND terkirim >= ${awal}`,
    ]);
    p.hari = kunci;
    p.kirimUlangHari = b?.n ?? 0;
    p.kirimHari = (a?.n ?? 0) + p.kirimUlangHari;
  }
  return { total: p.kirimHari, ulang: p.kirimUlangHari };
}

/** Balasan biasa nomor ini (terbanyak dari hari ini dan kemarin, tabel stats), disimpan CEK_RASIO_MS. */
async function batasRasio(numberId: number, p: PerNomor): Promise<number> {
  if (Date.now() - p.rasio.pada < CEK_RASIO_MS) return p.rasio.batas;
  const sql = await db();
  const kemarin = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date(Date.now() - 86400_000));
  const [r] = await sql<{ n: number }[]>`SELECT COALESCE(MAX(dibalas), 0)::int AS n FROM stats WHERE number_id = ${numberId} AND tanggal >= ${kemarin}::date`;
  p.rasio = { pada: Date.now(), batas: Math.max(RASIO_MIN, Math.floor((r?.n ?? 0) * RASIO_KIRIMAN)) };
  return p.rasio.batas;
}

async function batasHariIni(nomor: Nomor, p: PerNomor): Promise<{ batas: number; sebab: StatusUsaha["sebabBatas"] }> {
  let batas = p.setelan.batasHarian;
  let sebab: StatusUsaha["sebabBatas"] = "setelan";
  if (sekarang() - nomor.created_at < NOMOR_BARU_HARI * 86400) return { batas: 0, sebab: "baru" };
  if (sekarang() - nomor.created_at < PEMANASAN_HARI * 86400 && BATAS_PEMANASAN < batas) {
    batas = BATAS_PEMANASAN;
    sebab = "pemanasan";
  }
  const rasio = await batasRasio(nomor.id, p);
  if (rasio < batas) {
    batas = rasio;
    sebab = "rasio";
  }
  return { batas, sebab };
}

/**
 * Rem otomatis per nomor: dari 10 kiriman follow-up terakhir nomor ini yang sudah berumur >= 6 jam (sejak rem terakhir
 * dilepas), bila >= 3 dan >= 40% tidak pernah sampai ke HP (centang satu), kemungkinan nomornya mulai diblokir /
 * dilaporkan: semua follow-up nomor ini berhenti dan pemiliknya diberi tahu.
 */
async function periksaRem(nomor: Nomor, p: PerNomor): Promise<boolean> {
  if (p.rem) return true;
  if (Date.now() - p.cekRemPada < CEK_REM_MS) return false;
  p.cekRemPada = Date.now();
  const t = sekarang();
  const sejak = Math.max(t - 7 * 86400, p.remLepas);
  const sampai = t - 6 * 3600;
  const sql = await db();
  const baris = await sql<{ w: number; ack: number }[]>`
    SELECT w, ack FROM (
      SELECT terkirim1 AS w, ack1 AS ack FROM followup_prospek WHERE number_id = ${nomor.id} AND usaha AND terkirim1 >= ${sejak}
      UNION ALL SELECT terkirim2, ack2 FROM followup_prospek WHERE number_id = ${nomor.id} AND usaha AND terkirim2 >= ${sejak}
      UNION ALL SELECT terkirim3, ack3 FROM followup_prospek WHERE number_id = ${nomor.id} AND usaha AND terkirim3 >= ${sejak}
      UNION ALL SELECT terkirim, ack FROM followup_ulang WHERE number_id = ${nomor.id} AND terkirim >= ${sejak}
    ) x WHERE w <= ${sampai} ORDER BY w DESC LIMIT 10`;
  const tak = baris.filter((r) => r.ack < 3).length;
  if (baris.length < 5 || tak < 3 || tak / baris.length < 0.4) return false;
  const alasan = `${tak} dari ${baris.length} pesan follow-up terakhir tidak sampai ke HP penerima (centang satu).`;
  await sql`UPDATE followup_nomor SET rem_pada = ${t}, rem_alasan = ${alasan}, diperbarui = ${t} WHERE number_id = ${nomor.id}`;
  p.rem = { pada: t, alasan };
  console.error(`[followup-usaha] REM OTOMATIS nomor ${nomor.id}: ${alasan}`);
  if (nomor.user_id)
    await kirimNotif(nomor.user_id, {
      jenis: "nomor",
      judul: { id: `Follow-up ${nomor.label} dihentikan otomatis`, en: `Follow-up on ${nomor.label} stopped automatically` },
      isi: {
        id: `${alasan} Ini tanda nomor mulai diblokir atau dilaporkan. Cek nomornya di HP, lalu lanjutkan dari tab Follow-up bila sudah aman.`,
        en: `${tak} of the last ${baris.length} follow-up messages were not delivered. This can mean the number is being blocked or reported. Check the phone, then resume from the Follow-up tab once it is safe.`,
      },
      tautan: `/nomor/${nomor.id}#followup`,
      kunci: `followup-rem:${nomor.id}:${t}`,
    });
  return true;
}

/**
 * Tanda bahaya dari WhatsApp untuk nomor ini (wa.ts lewat followup.ts): rem nomor langsung menyala, tersimpan di
 * database (bertahan setelah server dimulai ulang), dan pemilik diberi tahu. Nomor tanpa follow-up aktif tidak disentuh.
 */
export async function remBahayaUsaha(nomor: Nomor, alasan: string): Promise<void> {
  const sql = await db();
  const t = sekarang();
  const teks = `${alasan}. Follow-up dihentikan supaya nomor tidak makin dibatasi.`;
  const r = await sql`
    UPDATE followup_nomor SET rem_pada = ${t}, rem_alasan = ${teks}, diperbarui = ${t}
     WHERE number_id = ${nomor.id} AND (aktif OR ulang_aktif) AND rem_pada IS NULL`;
  const p = st.per.get(nomor.id);
  if (p && !p.rem) p.rem = { pada: t, alasan: teks };
  if (!r.count) return;
  console.error(`[followup-usaha] REM BAHAYA nomor ${nomor.id}: ${alasan}`);
  if (nomor.user_id)
    await kirimNotif(nomor.user_id, {
      jenis: "nomor",
      judul: { id: `Follow-up ${nomor.label} dihentikan otomatis`, en: `Follow-up on ${nomor.label} stopped automatically` },
      isi: {
        id: `${teks} Pastikan nomornya normal di HP dan tersambung stabil minimal sehari, lalu lanjutkan dari tab Follow-up.`,
        en: `WhatsApp signalled a restriction on this number (${alasan}), so follow-up was paused. Make sure the number works normally on the phone and stays connected for a day, then resume from the Follow-up tab.`,
      },
      tautan: `/nomor/${nomor.id}#followup`,
      kunci: `followup-bahaya:${nomor.id}:${t}`,
    });
}

// ---------- Pemindaian ----------

/** Jeda pesan 1 sesuai tingkat minat (2 = panas). */
const jedaAwalDtk = (s: SetelanUsaha, minat: number): number => (minat >= 2 ? s.jedaPanasJam : s.jedaHangatJam) * 3600;

/**
 * Lead yang diam di nomor ini (lewat percakapan_lead_idx): chat duluan, hangat/panas, sudah dijawab, belum beli
 * sesudah dinilai, tidak dibalas pemilik 24 jam terakhir. Siklus lama hanya diganti bila ia chat lagi sesudahnya.
 */
async function pindaiProspek(nomor: Nomor, s: SetelanUsaha): Promise<number> {
  const sql = await db();
  const t = sekarang();
  const jedaMin = Math.min(s.jedaPanasJam, s.jedaHangatJam) * 3600;
  const kandidat = await sql<{ kunci: string; telepon: string | null; nama: string | null; terakhir_pada: number; minat: number }[]>`
    SELECT p.kunci, p.telepon, p.nama, p.terakhir_pada,
           (p.minat - (${t} - p.minat_pada) / ${LURUH_MINAT_DTK})::int AS minat
      FROM percakapan p
     WHERE p.number_id = ${nomor.id} AND p.prospek = 1 AND p.minat >= 1
       AND p.terakhir_pada >= ${t - JENDELA_DTK} AND p.terakhir_pada <= ${t - jedaMin}
       AND p.minat - (${t} - p.minat_pada) / ${LURUH_MINAT_DTK} >= 1
       AND p.pengirim_akhir = 1 AND p.spam <> 1 AND p.masuk_n > 0
       AND (p.beli_pada IS NULL OR p.beli_pada < p.minat_pada)
       AND (SELECT m.peran FROM pesan_chat m WHERE m.percakapan_id = p.id ORDER BY m.id LIMIT 1) = 0
       AND NOT EXISTS (SELECT 1 FROM pesan_chat m WHERE m.percakapan_id = p.id AND m.peran = 2 AND m.waktu >= ${t - PEMILIK_DTK})
       AND NOT EXISTS (SELECT 1 FROM followup_stop fs WHERE fs.kunci = p.kunci)
       AND NOT EXISTS (SELECT 1 FROM followup_ulang u WHERE u.kunci = p.kunci AND u.status = 'jalan')
       AND NOT EXISTS (
             SELECT 1 FROM followup_prospek fp
              WHERE fp.kunci = p.kunci
                AND (fp.status IN ('jalan', 'stop')
                     OR NOT EXISTS (SELECT 1 FROM pesan_chat m WHERE m.percakapan_id = p.id AND m.peran = 0 AND m.waktu > fp.siklus)))
     ORDER BY p.terakhir_pada DESC, p.id DESC
     LIMIT 50`;
  let masuk = 0;
  for (const k of kandidat) {
    const jadwal = k.terakhir_pada + jedaAwalDtk(s, k.minat);
    const r = await sql`
      INSERT INTO followup_prospek (kunci, number_id, status, tujuan, nama, minat, tahap, jadwal, siklus, dibuat, diperbarui, usaha)
      VALUES (${k.kunci}, ${nomor.id}, 'jalan', ${k.telepon}, ${k.nama}, ${k.minat}, 0, ${jadwal}, ${k.terakhir_pada}, ${t}, ${t}, true)
      ON CONFLICT (kunci) DO UPDATE SET
        number_id = EXCLUDED.number_id, status = 'jalan', tujuan = EXCLUDED.tujuan, nama = EXCLUDED.nama, minat = EXCLUDED.minat,
        tahap = 0, jadwal = EXCLUDED.jadwal, siklus = EXCLUDED.siklus, dibuat = EXCLUDED.dibuat, diperbarui = EXCLUDED.diperbarui, usaha = true,
        draf = NULL, pesan1 = NULL, pesan2 = NULL, pesan3 = NULL, pesan1_id = NULL, pesan2_id = NULL, pesan3_id = NULL,
        terkirim1 = NULL, terkirim2 = NULL, terkirim3 = NULL, ack1 = 0, ack2 = 0, ack3 = 0, dibalas = NULL, alasan = NULL
       WHERE followup_prospek.status NOT IN ('jalan', 'stop')`;
    masuk += r.count;
  }
  if (masuk) console.info(`[followup-usaha] ${masuk} lead yang diam masuk antrean nomor ${nomor.id}`);
  return masuk;
}

/**
 * Pembeli lama di nomor ini (lewat percakapan_beli_idx): beli sebelum siklus, diam sejak siklus, chat aktif dalam
 * UMUR_ULANG_HARI, chat duluan. Satu pengingat per pembelian, paling sering sekali per 30 hari per chat.
 */
async function pindaiUlang(nomor: Nomor, s: SetelanUsaha): Promise<number> {
  const sql = await db();
  const t = sekarang();
  const siklus = s.siklusUlangHari * 86400;
  const kandidat = await sql<{ kunci: string; telepon: string | null; nama: string | null; beli_pada: number }[]>`
    SELECT p.kunci, p.telepon, p.nama, p.beli_pada
      FROM percakapan p
     WHERE p.number_id = ${nomor.id} AND p.beli_pada IS NOT NULL AND p.beli_pada <= ${t - siklus}
       AND p.terakhir_pada <= ${t - siklus} AND p.terakhir_pada >= ${t - UMUR_ULANG_HARI * 86400}
       AND p.spam <> 1 AND p.masuk_n > 0
       AND (SELECT m.peran FROM pesan_chat m WHERE m.percakapan_id = p.id ORDER BY m.id LIMIT 1) = 0
       AND NOT EXISTS (SELECT 1 FROM followup_stop fs WHERE fs.kunci = p.kunci)
       AND NOT EXISTS (SELECT 1 FROM followup_prospek fp WHERE fp.kunci = p.kunci AND fp.status = 'jalan')
       AND NOT EXISTS (
             SELECT 1 FROM followup_ulang u
              WHERE u.kunci = p.kunci AND (u.status IN ('jalan', 'stop') OR u.beli_pada >= p.beli_pada OR u.terkirim >= ${t - JARAK_ULANG_DTK}))
     ORDER BY p.beli_pada, p.id
     LIMIT 50`;
  let masuk = 0;
  for (const k of kandidat) {
    const r = await sql`
      INSERT INTO followup_ulang (kunci, number_id, status, tujuan, nama, beli_pada, jadwal, dibuat, diperbarui)
      VALUES (${k.kunci}, ${nomor.id}, 'jalan', ${k.telepon}, ${k.nama}, ${k.beli_pada}, ${t}, ${t}, ${t})
      ON CONFLICT (kunci) DO UPDATE SET
        number_id = EXCLUDED.number_id, status = 'jalan', tujuan = EXCLUDED.tujuan, nama = EXCLUDED.nama, beli_pada = EXCLUDED.beli_pada,
        jadwal = EXCLUDED.jadwal, dibuat = EXCLUDED.dibuat, diperbarui = EXCLUDED.diperbarui,
        draf = NULL, pesan = NULL, pesan_id = NULL, terkirim = NULL, ack = 0, dibalas = NULL, alasan = NULL
       WHERE followup_ulang.status NOT IN ('jalan', 'stop')`;
    masuk += r.count;
  }
  if (masuk) console.info(`[followup-usaha] ${masuk} pembeli lama masuk antrean order ulang nomor ${nomor.id}`);
  return masuk;
}

// ---------- Penyusun pesan ----------

interface Chat {
  id: number;
  kunci: string;
  alamat: string | null;
  telepon: string | null;
  nama: string | null;
  prospek: number;
  spam: number;
  minat: number | null;
  minat_pada: number | null;
  beli_pada: number | null;
}

async function chatDari(kunci: string): Promise<Chat | undefined> {
  const sql = await db();
  const [c] = await sql<Chat[]>`
    SELECT id, kunci, alamat, telepon, nama, prospek, spam, minat, minat_pada, beli_pada FROM percakapan WHERE kunci = ${kunci}`;
  return c;
}

const PANDUAN_TAHAP: Record<Tahap, string> = {
  1: [
    "Ini pesan follow-up PERTAMA (hook + rekomendasi + penutupan). Teknik:",
    "- Hook dari masalah / keinginan yang membuatnya bertanya soal produk itu (sebut nama produknya). Jangan menyapa seperti orang baru dan jangan sekadar mengingatkan obrolan.",
    "- Rekomendasikan SATU pilihan yang paling cocok dengan kebutuhannya (nama + harga PERSIS dari pengetahuan/katalog) dan hasil paling menarik yang ia dapat darinya.",
    "- Patahkan satu keberatan yang paling mungkin membuatnya ragu (harga, waktu, ongkir, ribet, ragu kualitas), singkat dan pakai fakta dari pengetahuan.",
    "- Tutup dengan ajakan penutupan yang mengarah ke pesanan (balas YA, pilih A/B, jumlah, atau waktu kirim).",
    "- Paling panjang 450 karakter.",
  ].join("\n"),
  2: [
    "Ini pesan follow-up KEDUA (nilai + dorongan), pesan pertamamu belum dibalas. Pakai sudut pandang BARU, bukan pengulangan pesan pertama. Teknik:",
    "- Hook baru: gambarkan hasil / momen yang ia inginkan setelah memakai produknya, atau apa yang ia lewatkan bila menunda (kebutuhannya tetap belum beres). Takut rugi yang wajar, jangan menakut-nakuti.",
    "- Jangkar nilai HANYA dari data yang ada: harga coret / harga normal, promo, bonus, gratis ongkir, paket hemat, atau harga per pemakaian (hitung dengan benar).",
    "- Bukti sosial (testimoni, jumlah pembeli, rating) HANYA bila tertulis di pengetahuan. Tidak ada = jangan disebut.",
    "- Ajakan tegas ke SATU langkah berikut yang jelas (balas YA, konfirmasi pesanan, kirim alamat, pilih varian, cara bayar yang ada di pengetahuan).",
    "- Jangan mengulang kalimat pesan follow-up sebelumnya. Paling panjang 560 karakter.",
  ].join("\n"),
  3: [
    "Ini pesan follow-up TERAKHIR (pamit + pembalik risiko), dua pesan sebelumnya belum dibalas. Teknik:",
    "- Bilang terus terang ini pesan terakhirmu soal ini, kamu tidak akan mengganggu lagi.",
    "- Pembalik risiko HANYA bila tertulis di pengetahuan: garansi, retur/tukar, COD/bayar di tempat, uang kembali, bisa coba dulu.",
    "- Pintu tetap terbuka dengan ajakan yang gampang: cukup balas satu kata (mis. nama produknya) kapan pun ia siap.",
    "- Jangan mengulang kalimat pesan sebelumnya. Paling panjang 400 karakter.",
  ].join("\n"),
};

const BATAS_KARAKTER: Record<Tahap | "ulang", number> = { 1: 600, 2: 760, 3: 560, ulang: 520 };

const pilih = <T,>(x: readonly T[]): T => x[Math.floor(Math.random() * x.length)];

function templat(jenis: Tahap | "ulang", panas: boolean): string {
  if (jenis === "ulang")
    return pilih([
      "Kak, sudah waktunya isi ulang? 😊\n\nAku bisa siapkan pesanan yang *sama persis seperti sebelumnya*, Kakak tinggal terima beres.\n\nBalas *SAMA* ya Kak, langsung aku proses.",
      "Kak, yang kemarin cocok kan? 😄\n\nKalau mau pesan lagi, aku siapkan *sama seperti terakhir* tanpa perlu ribet pilih ulang.\n\nBalas *YA* ya Kak, aku bantu sekarang.",
    ]);
  if (jenis === 1)
    return panas
      ? pilih([
          "Kak, tinggal selangkah lagi! 🙌\n\nDetail pesanannya tinggal dikonfirmasi, sisanya aku urus sampai beres.\n\nBalas *YA* ya Kak, aku proses sekarang.",
          "Kak, pesanannya sudah hampir jadi nih 😊\n\nKonfirmasi detailnya, langsung aku siapkan hari ini.\n\nBalas *YA* ya Kak, aku lanjutkan.",
        ])
      : pilih([
          "Kak, biar nggak salah pilih, aku bantu carikan yang *paling pas* buat kebutuhan Kakak 🎯\n\nCukup jawab satu-dua pertanyaan, aku kasih rekomendasi terbaiknya.\n\nBalas *YA* ya Kak, aku mulai sekarang.",
          "Kak, yang Kakak cari tadi masih bisa aku bantu sampai beres 🙌\n\nAku pilihkan yang paling cocok, Kakak tinggal setuju.\n\nBalas *YA* ya Kak, aku bantu sekarang.",
        ]);
  if (jenis === 2)
    return pilih([
      "Kak, kebutuhan yang ditunda biasanya malah makin repot belakangan 😅\n\nSelesaikan sekarang, aku pandu prosesnya dari awal sampai beres.\n\nBalas *YA* ya Kak, aku bantu lanjutkan.",
      "Kak, satu balasan aja dan semuanya aku urus 🙌\n\nPilihannya aku siapkan, Kakak tinggal konfirmasi.\n\nBalas *YA* ya Kak, aku proses sekarang.",
    ]);
  return pilih([
    "Kak, ini pesan terakhirku soal ini, janji nggak ganggu lagi 🙏\n\nKapan pun Kakak siap, cukup balas *YA* di chat ini dan aku bantu sampai beres.",
    "Kak, aku pamit dulu ya, ini pesan terakhirku soal ini 🙏\n\nPintu selalu terbuka: balas *YA* kapan saja, langsung aku bantu.",
  ]);
}

/** Pelanggaran khusus follow-up nomor pengguna (selain pemeriksa.ts): null = lolos. Tautan tidak pernah boleh. */
export function periksaPesanUsaha(teks: string, jenis: Tahap | "ulang"): string | null {
  if (teks.length < 30 || teks.length > BATAS_KARAKTER[jenis]) return `panjang ${teks.length} karakter`;
  if (adaKode(teks)) return "berisi kode";
  if (POLA_DESAK.test(teks)) return "kelangkaan / batas waktu buatan";
  if ((teks.match(POLA_TAUTAN) ?? []).length) return "berisi tautan";
  if (/\b(follow[\s-]?up|pesan otomatis|bot\b)/i.test(teks)) return "menyebut follow-up / pesan otomatis";
  return null;
}

/**
 * Satu pesan hard selling yang ditulis AI dari riwayat chat orang ini, Informasi Usaha, dan katalog nomor ini. Draf yang
 * ditolak tidak memotong kuota; draf yang dipakai = 1 balasan AI. Gagal / melanggar dua kali = templat (gratis).
 * `bolehLewati` (bawaan): AI boleh memutuskan chat ini tidak pantas di-follow-up ({ lewati }); tidak memotong kuota.
 */
async function susunPesan(nomor: Nomor, chat: Chat, jenis: Tahap | "ulang", minat: number, sebelumnya: string[], bolehLewati = true): Promise<HasilSusun> {
  const panas = minat >= 2;
  const cadangan = { teks: templat(jenis, panas) };
  try {
    const riwayat = await riwayatUntukAi(chat.kunci, { sesiBaru: false, tertunda: 0, lengkap: true });
    const kueri = riwayat.slice(-6).join("\n");
    const [katalog, ai] = await Promise.all([
      katalogBoleh(nomor.user_id).then((ok) => (ok ? daftarProduk(nomor.id) : []), () => []),
      aiUntukAkun(nomor.user_id),
    ]);
    const { sistem: dasar } = await susunSistem(nomor, kueri, { riwayat, riwayatLengkap: true, katalog });
    const tugas =
      jenis === "ulang"
        ? [
            "Lawan bicara di chat ini pernah membeli / memakai produk usaha ini (lihat riwayat chat), lalu sudah lama tidak chat.",
            "Tulis SATU pesan WhatsApp order ulang. Ini hard selling yang ramah: buat ia ingin pesan lagi sekarang.",
            "- Hook: ingatkan rasa / hasil enak dari produk/layanan yang dulu ia beli (sebut namanya bila terlihat di riwayat), lalu tawarkan cara paling gampang memesan lagi (mis. disiapkan sama persis seperti sebelumnya, cukup balas satu kata).",
            "- Boleh tawarkan SATU produk pelengkap atau produk baru yang relevan dengan pembeliannya (nama + harga PERSIS dari pengetahuan/katalog), atau promo yang memang tertulis.",
            "- Tutup dengan SATU pertanyaan ya/tidak atau pilih waktu.",
            "- Jangan menulis seolah ia baru saja chat, jangan menyebut sudah berapa lama ia tidak pesan, jangan menyindir.",
            "- Paling panjang 400 karakter.",
          ].join("\n")
        : [
            `Lawan bicara di chat ini tadi bertanya soal produk/layanan usaha ini (dinilai ${panas ? "SIAP MEMBELI (lead panas)" : "tertarik serius (lead hangat)"}), sudah kamu jawab, lalu tidak membalas lagi.`,
            "Tulis SATU pesan WhatsApp follow-up untuk membuatnya membeli. Ini hard selling: yakin, tegas, dan mengarah ke keputusan, tetapi jujur dan sopan seperti penjual terbaik di toko ini.",
            PANDUAN_TAHAP[jenis],
            ...(panas ? ["Karena ia sudah siap membeli: langsung ke penutupan. Ringkas pilihan yang ia sebut, tanyakan satu detail yang masih kurang (jumlah, varian, alamat), dan sebut cara pesan/bayar yang ada di pengetahuan."] : []),
          ].join("\n");
    const instruksi = [
      "<tugas_follow_up>",
      ...(bolehLewati ? [ATURAN_LEWATI] : []),
      tugas,
      GAYA_PESAN,
      "Aturan wajib:",
      "- Bahasa Indonesia santai seperti CS manusia, ikuti cara menyapa yang sudah dipakai di chat ini (mis. \"Kak\").",
      "- Semua harga, produk, promo, garansi, dan jadwal HANYA dari pengetahuan nomor ini atau chat ini. Tidak ada di sana = jangan disebut.",
      "- JANGAN menulis tautan apa pun, dan JANGAN memakai tag <kirim_produk> (foto dikirim bila ia membalas).",
      "- DILARANG: kelangkaan atau batas waktu yang dibuat-buat (\"hanya hari ini\", \"sisa 3\", \"promo berakhir malam ini\"), testimoni / nama pelanggan / angka penjualan karangan, janji hasil, menyebut dirimu bot, pesan otomatis, atau follow-up.",
      ...(sebelumnya.length ? ["Pesan yang sudah kamu kirim sebelumnya (jangan diulang):", ...sebelumnya.map((p, i) => `${i + 1}. ${p}`)] : []),
      "Tulis isi pesannya saja, tanpa tanda kutip, judul, tag, atau penjelasan.",
      "</tugas_follow_up>",
    ].join("\n");
    const sistem = `${dasar}\n\n${instruksi}`;
    const sumber = [sistem, ...riwayat].join("\n");
    let umpan = "";
    for (let coba = 0; coba < 2; coba++) {
      const hasil = await tanyaAi({
        sessionId: `followup-usaha-${chat.id}-${jenis}-${Date.now()}-${coba}`,
        sistem: umpan ? `${sistem}\n\n${umpan}` : sistem,
        pesan: jenis === "ulang" ? "Tulis pesan order ulang sekarang." : `Tulis pesan follow-up tahap ${jenis} sekarang.`,
        timeoutMs: 60_000,
        paksa: { penyedia: ai.penyedia },
        cadanganHermes: ai.cadanganHermes,
      });
      const lewati = bolehLewati ? ambilLewati(hasil.teks) : null;
      if (lewati) {
        void catatPakai(nomor.id, hasil, false, true).catch(() => {}); // penilaian saja: tidak memotong kuota
        console.info(`[followup-usaha] AI melewati chat ${chat.id}: ${lewati}`);
        return { lewati };
      }
      const teks = formatWa(ambilKirimProduk(ambilNilai(bakukanTag(hasil.teks)).teks).teks.replace(/<\/?[a-z_]+[^>]*>/gi, "").replace(/^["'“”]+|["'“”]+$/g, "").trim());
      const salah = periksaPesanUsaha(teks, jenis);
      // Tawaran membantu ("aku bantu siapkan") memang inti follow-up, jadi pemeriksaan "janji" & gaya tidak dipakai.
      const fakta = salah ? [] : periksaJawaban(teks, sumber).filter((p) => p.jenis !== "robotik" && p.jenis !== "janji");
      const lolos = !salah && !fakta.length;
      // Hanya draf yang dipakai memotong kuota (abaikan = false); yang ditolak tetap tercatat biayanya.
      void catatPakai(nomor.id, hasil, false, !lolos).catch(() => {});
      if (lolos) return { teks };
      console.warn(`[followup-usaha] pesan AI ${jenis} ditolak (${salah ?? fakta.map((f) => f.jenis).join(",")})`);
      umpan = `Draf sebelumnya DITOLAK: ${salah ?? `ada fakta yang tidak ada di sumber (${fakta.map((f) => `"${f.kutipan}"`).join(", ")})`}. Tulis ulang dan patuhi semua aturan.`;
    }
    return cadangan;
  } catch (e) {
    console.warn(`[followup-usaha] AI gagal menyusun pesan: ${e instanceof Error ? e.message : e}`);
    return cadangan;
  }
}

// ---------- Pemeriksaan & pengiriman ----------

interface BarisJalan {
  kunci: string;
  number_id: number;
  tahap: number;
  minat: number;
  jadwal: number;
  siklus: number;
  draf: string | null;
  pesan1: string | null;
  pesan2: string | null;
  pesan3: string | null;
  ack1: number;
  ack2: number;
  ack3: number;
}

interface BarisUlangJalan {
  kunci: string;
  number_id: number;
  beli_pada: number;
  jadwal: number;
  draf: string | null;
  dibuat: number;
}

async function ubahProspek(kunci: string, status: StatusProspek, alasan: string | null, dibalas?: number): Promise<false> {
  const sql = await db();
  await sql`
    UPDATE followup_prospek SET status = ${status}, alasan = ${alasan}, diperbarui = ${sekarang()}, dibalas = COALESCE(${dibalas ?? null}::bigint, dibalas)
     WHERE kunci = ${kunci} AND usaha`;
  if (status !== "jalan") {
    const v = st.aktif.get(kunci);
    if (v) v.dicatat = true;
  }
  return false;
}

async function ubahUlang(kunci: string, status: StatusUlang, alasan: string | null, dibalas?: number): Promise<false> {
  const sql = await db();
  await sql`
    UPDATE followup_ulang SET status = ${status}, alasan = ${alasan}, diperbarui = ${sekarang()}, dibalas = COALESCE(${dibalas ?? null}::bigint, dibalas)
     WHERE kunci = ${kunci}`;
  if (status !== "jalan" && status !== "terkirim") {
    const v = st.aktif.get(kunci);
    if (v) v.dicatat = true;
  }
  return false;
}

async function tunda(tabel: "prospek" | "ulang", kunci: string, detik: number, alasan: string): Promise<void> {
  const sql = await db();
  const t = sekarang();
  if (tabel === "prospek") await sql`UPDATE followup_prospek SET jadwal = ${t + detik}, alasan = ${alasan}, diperbarui = ${t} WHERE kunci = ${kunci} AND usaha`;
  else await sql`UPDATE followup_ulang SET jadwal = ${t + detik}, alasan = ${alasan}, diperbarui = ${t} WHERE kunci = ${kunci}`;
}

async function masukSejak(percakapanId: number, sejak: number): Promise<boolean> {
  const sql = await db();
  const [r] = await sql`SELECT 1 FROM pesan_chat WHERE percakapan_id = ${percakapanId} AND peran = 0 AND waktu > ${sejak} LIMIT 1`;
  return !!r;
}

/** Keadaan chat yang dipakai keduanya: minta berhenti, bot dijeda pemilik, pemilik membalas sendiri dari HP. */
async function keadaanChat(chat: Chat): Promise<{ stop: boolean; jeda: boolean; pemilik: boolean }> {
  const sql = await db();
  const t = sekarang();
  const [s] = await sql<{ stop: boolean; jeda: boolean; pemilik: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM followup_stop WHERE kunci = ${chat.kunci}) AS stop,
           EXISTS (SELECT 1 FROM chat_state WHERE kunci = ${chat.kunci} AND jeda_sampai > ${t}) AS jeda,
           EXISTS (SELECT 1 FROM pesan_chat WHERE percakapan_id = ${chat.id} AND peran = 2 AND waktu >= ${t - PEMILIK_DTK}) AS pemilik`;
  return s ?? { stop: false, jeda: false, pemilik: false };
}

/** Pemeriksaan sebelum menulis/mengirim pesan prospek. null = boleh lanjut; selain itu barisnya sudah diubah. */
async function periksaProspek(b: BarisJalan, chat: Chat | undefined): Promise<string | null> {
  const t = sekarang();
  if (!chat) return (await ubahProspek(b.kunci, "batal", "Chat sudah terhapus"), "hapus");
  const s = await keadaanChat(chat);
  if (s.stop) return (await ubahProspek(b.kunci, "stop", "Pelanggan ini pernah meminta tidak dihubungi lagi"), "stop");
  if (chat.prospek !== 1 || chat.spam === 1) return (await ubahProspek(b.kunci, "batal", "Chat tidak lagi berstatus prospek / ditandai spam"), "status");
  if (s.jeda || s.pemilik) return (await ubahProspek(b.kunci, "batal", "Pemilik sedang menangani chat ini sendiri"), "pemilik");
  if (chat.beli_pada && chat.beli_pada >= b.siklus) return (await ubahProspek(b.kunci, "batal", "Pelanggan sudah membeli"), "beli");
  if (await masukSejak(chat.id, b.siklus)) {
    if (b.tahap > 0) return (await ubahProspek(b.kunci, "dibalas", null, t), "dibalas");
    return (await ubahProspek(b.kunci, "batal", "Pelanggan chat lagi sebelum follow-up"), "chat");
  }
  const ackAkhir = [b.ack1, b.ack2, b.ack3][b.tahap - 1];
  if (b.tahap > 0 && ackAkhir < 3) return (await ubahProspek(b.kunci, "selesai", "Pesan sebelumnya tidak sampai ke HP (centang satu): pesan berikutnya tidak dikirim"), "ack");
  if ((minatEfektif(chat.minat, chat.minat_pada, t) ?? 0) < 1) return (await ubahProspek(b.kunci, "selesai", "Minat beli sudah dingin"), "dingin");
  return null;
}

/** Pemeriksaan sebelum menulis/mengirim pengingat order ulang. */
async function periksaUlang(b: BarisUlangJalan, chat: Chat | undefined): Promise<string | null> {
  if (!chat) return (await ubahUlang(b.kunci, "batal", "Chat sudah terhapus"), "hapus");
  const s = await keadaanChat(chat);
  if (s.stop) return (await ubahUlang(b.kunci, "stop", "Pelanggan ini pernah meminta tidak dihubungi lagi"), "stop");
  if (chat.spam === 1) return (await ubahUlang(b.kunci, "batal", "Chat ditandai spam"), "spam");
  if (s.jeda || s.pemilik) return (await ubahUlang(b.kunci, "batal", "Pemilik sedang menangani chat ini sendiri"), "pemilik");
  if (await masukSejak(chat.id, b.dibuat)) return (await ubahUlang(b.kunci, "batal", "Pelanggan chat lagi sebelum pengingat dikirim"), "chat");
  return null;
}

const sebelumnyaDari = (b: Pick<BarisJalan, "pesan1" | "pesan2" | "pesan3">): string[] => [b.pesan1, b.pesan2, b.pesan3].filter((x): x is string => !!x);
const alamatDari = (c: Chat): string | null => c.alamat ?? (c.telepon ? `${c.telepon}@s.whatsapp.net` : null);

async function kirim(nomor: Nomor, c: Chat, teks: string): Promise<{ id: string } | { gagal: string; wa: boolean }> {
  const alamat = alamatDari(c);
  if (!alamat) return { gagal: "Alamat chat tidak diketahui", wa: false };
  try {
    return { id: await kirimSapaan({ numberId: nomor.id, sesi: nomor.sesi, alamat, kunci: c.kunci, teks }) };
  } catch (e) {
    return { gagal: e instanceof Error ? e.message : String(e), wa: e instanceof WaError };
  }
}

async function prosesProspek(nomor: Nomor, p: PerNomor, b: BarisJalan): Promise<boolean> {
  const chat = await chatDari(b.kunci);
  if (await periksaProspek(b, chat)) return false;
  const c = chat as Chat;
  if (!alamatDari(c)) return ubahProspek(b.kunci, "batal", "Alamat chat tidak diketahui");
  const tahap = (b.tahap + 1) as Tahap;
  const susun = b.draf ? { teks: b.draf } : await susunPesan(nomor, c, tahap, b.minat, sebelumnyaDari(b));
  if ("lewati" in susun) return ubahProspek(b.kunci, b.tahap > 0 ? "selesai" : "batal", `Dilewati AI: ${susun.lewati}`);
  const teks = susun.teks;
  // Pemeriksaan terakhir: selagi AI menulis, ia bisa saja membalas.
  if (await masukSejak(c.id, b.siklus)) return ubahProspek(b.kunci, b.tahap > 0 ? "dibalas" : "batal", b.tahap > 0 ? null : "Pelanggan chat lagi sebelum follow-up", b.tahap > 0 ? sekarang() : undefined);
  if (infoSesi(nomor.sesi).status !== "WORKING") return false;
  const h = await kirim(nomor, c, teks);
  if ("gagal" in h) {
    console.warn(`[followup-usaha] gagal mengirim ke chat ${c.id}: ${h.gagal}`);
    if (h.wa) await tunda("prospek", b.kunci, 1800, `Nomor tidak terhubung: ${h.gagal}`);
    else if (sekarang() - b.jadwal > 2 * 86400) await ubahProspek(b.kunci, "gagal", h.gagal.slice(0, 200));
    else await tunda("prospek", b.kunci, 3600, `Gagal mengirim, dicoba lagi: ${h.gagal.slice(0, 160)}`);
    return false;
  }
  const sql = await db();
  const kini = sekarang();
  const lanjut = tahap < p.setelan.maksTahap;
  const jadwal = kini + (tahap === 1 ? p.setelan.tahap2Jam : p.setelan.tahap3Jam) * 3600;
  const status: StatusProspek = lanjut ? "jalan" : "selesai";
  const alasan = lanjut ? null : "Semua pesan follow-up terkirim";
  await sql`
    UPDATE followup_prospek SET
      status = ${status}, tahap = ${tahap}, jadwal = ${jadwal}, draf = NULL, alasan = ${alasan}, diperbarui = ${kini},
      tujuan = ${c.telepon}, nama = ${c.nama},
      pesan1 = CASE WHEN ${tahap} = 1 THEN ${teks} ELSE pesan1 END, pesan1_id = CASE WHEN ${tahap} = 1 THEN ${h.id} ELSE pesan1_id END,
      terkirim1 = CASE WHEN ${tahap} = 1 THEN ${kini}::bigint ELSE terkirim1 END, ack1 = CASE WHEN ${tahap} = 1 THEN 1 ELSE ack1 END,
      pesan2 = CASE WHEN ${tahap} = 2 THEN ${teks} ELSE pesan2 END, pesan2_id = CASE WHEN ${tahap} = 2 THEN ${h.id} ELSE pesan2_id END,
      terkirim2 = CASE WHEN ${tahap} = 2 THEN ${kini}::bigint ELSE terkirim2 END, ack2 = CASE WHEN ${tahap} = 2 THEN 1 ELSE ack2 END,
      pesan3 = CASE WHEN ${tahap} = 3 THEN ${teks} ELSE pesan3 END, pesan3_id = CASE WHEN ${tahap} = 3 THEN ${h.id} ELSE pesan3_id END,
      terkirim3 = CASE WHEN ${tahap} = 3 THEN ${kini}::bigint ELSE terkirim3 END, ack3 = CASE WHEN ${tahap} = 3 THEN 1 ELSE ack3 END
     WHERE kunci = ${b.kunci} AND usaha`;
  st.ack.set(h.id, { kunci: b.kunci, jenis: "prospek", slot: tahap, ack: 1 });
  st.aktif.set(b.kunci, { jenis: "prospek", teks, dicatat: false });
  console.info(`[followup-usaha] pesan prospek tahap ${tahap} terkirim ke chat ${c.id} lewat nomor ${nomor.id}`);
  return true;
}

async function prosesUlang(nomor: Nomor, b: BarisUlangJalan): Promise<boolean> {
  const chat = await chatDari(b.kunci);
  if (await periksaUlang(b, chat)) return false;
  const c = chat as Chat;
  if (!alamatDari(c)) return ubahUlang(b.kunci, "batal", "Alamat chat tidak diketahui");
  const susun = b.draf ? { teks: b.draf } : await susunPesan(nomor, c, "ulang", 0, []);
  if ("lewati" in susun) return ubahUlang(b.kunci, "batal", `Dilewati AI: ${susun.lewati}`);
  const teks = susun.teks;
  if (await masukSejak(c.id, b.dibuat)) return ubahUlang(b.kunci, "batal", "Pelanggan chat lagi sebelum pengingat dikirim");
  if (infoSesi(nomor.sesi).status !== "WORKING") return false;
  const h = await kirim(nomor, c, teks);
  if ("gagal" in h) {
    console.warn(`[followup-usaha] gagal mengirim order ulang ke chat ${c.id}: ${h.gagal}`);
    if (h.wa) await tunda("ulang", b.kunci, 1800, `Nomor tidak terhubung: ${h.gagal}`);
    else if (sekarang() - b.jadwal > 2 * 86400) await ubahUlang(b.kunci, "gagal", h.gagal.slice(0, 200));
    else await tunda("ulang", b.kunci, 3600, `Gagal mengirim, dicoba lagi: ${h.gagal.slice(0, 160)}`);
    return false;
  }
  const sql = await db();
  const kini = sekarang();
  await sql`
    UPDATE followup_ulang SET status = 'terkirim', draf = NULL, pesan = ${teks}, pesan_id = ${h.id}, terkirim = ${kini}, ack = 1,
           alasan = NULL, diperbarui = ${kini}, tujuan = ${c.telepon}, nama = ${c.nama}
     WHERE kunci = ${b.kunci}`;
  st.ack.set(h.id, { kunci: b.kunci, jenis: "ulang", slot: 1, ack: 1 });
  st.aktif.set(b.kunci, { jenis: "ulang", teks, dicatat: false });
  console.info(`[followup-usaha] pengingat order ulang terkirim ke chat ${c.id} lewat nomor ${nomor.id}`);
  return true;
}

/** Draf pesan berikutnya disiapkan menjelang jadwal (pratinjau di tab Follow-up). Draf yang ada tidak ditimpa. */
async function siapkanDraf(nomor: Nomor, p: PerNomor): Promise<void> {
  const sql = await db();
  const t = sekarang();
  let dibuat = 0;
  if (p.setelan.aktif) {
    const baris = await sql<BarisJalan[]>`
      SELECT kunci, number_id, tahap, minat, jadwal, siklus, draf, pesan1, pesan2, pesan3, ack1, ack2, ack3
        FROM followup_prospek WHERE number_id = ${nomor.id} AND usaha AND status = 'jalan' AND jadwal <= ${t + DRAF_SEBELUM_DTK} AND draf IS NULL
       ORDER BY jadwal, kunci LIMIT ${DRAF_PER_PUTARAN}`;
    for (const b of baris) {
      const chat = await chatDari(b.kunci);
      if (await periksaProspek(b, chat)) continue;
      const h = await susunPesan(nomor, chat as Chat, (b.tahap + 1) as Tahap, b.minat, sebelumnyaDari(b));
      if ("lewati" in h) await ubahProspek(b.kunci, b.tahap > 0 ? "selesai" : "batal", `Dilewati AI: ${h.lewati}`);
      else await sql`UPDATE followup_prospek SET draf = ${h.teks} WHERE kunci = ${b.kunci} AND usaha AND tahap = ${b.tahap} AND status = 'jalan' AND draf IS NULL`;
      dibuat += 1;
    }
  }
  if (p.setelan.ulangAktif && dibuat < DRAF_PER_PUTARAN) {
    const baris = await sql<BarisUlangJalan[]>`
      SELECT kunci, number_id, beli_pada, jadwal, draf, dibuat FROM followup_ulang
       WHERE number_id = ${nomor.id} AND status = 'jalan' AND jadwal <= ${t + DRAF_SEBELUM_DTK} AND draf IS NULL
       ORDER BY jadwal, kunci LIMIT ${DRAF_PER_PUTARAN - dibuat}`;
    for (const b of baris) {
      const chat = await chatDari(b.kunci);
      if (await periksaUlang(b, chat)) continue;
      const h = await susunPesan(nomor, chat as Chat, "ulang", 0, []);
      if ("lewati" in h) await ubahUlang(b.kunci, "batal", `Dilewati AI: ${h.lewati}`);
      else await sql`UPDATE followup_ulang SET draf = ${h.teks} WHERE kunci = ${b.kunci} AND status = 'jalan' AND draf IS NULL`;
    }
  }
}

/** Satu nomor dalam satu putaran: pindai, siapkan draf, lalu paling banyak satu pesan bila semua syarat terpenuhi. */
async function satuNomor(numberId: number, p: PerNomor): Promise<void> {
  const nomor = await nomorById(numberId);
  if (!nomor?.user_id || !nomor.bot_aktif || !nomor.pemilik_aktif || !botBoleh()) return;
  if (!(await followupBoleh(nomor.user_id))) return;
  const s = p.setelan;
  if (s.aktif && Date.now() >= p.pindaiPada) {
    p.pindaiPada = Date.now() + PINDAI_MS;
    await pindaiProspek(nomor, s).catch((e) => console.error("[followup-usaha] pemindaian lead gagal:", e instanceof Error ? e.message : e));
  }
  if (s.ulangAktif && Date.now() >= p.pindaiUlangPada) {
    p.pindaiUlangPada = Date.now() + PINDAI_ULANG_MS;
    await pindaiUlang(nomor, s).catch((e) => console.error("[followup-usaha] pemindaian order ulang gagal:", e instanceof Error ? e.message : e));
  }
  // Kuota habis = tidak ada draf AI maupun kiriman (templat pun tidak, supaya tidak terkirim pesan seadanya terus-menerus).
  const sisa = await sisaKuotaAi(nomor.user_id);
  if (sisa !== null && sisa <= 0) return;
  await siapkanDraf(nomor, p).catch((e) => console.warn("[followup-usaha] draf gagal disiapkan:", e instanceof Error ? e.message : e));

  const jam = jamWibSekarang();
  if (Date.now() < p.bolehPada || jam < s.jamMulai || jam >= s.jamSelesai || !nomor.wa_id || infoSesi(nomor.sesi).status !== "WORKING" || p.rem) return;
  if (alasanTahan(nomor.sesi)) return; // koneksi belum stabil / ada tanda bahaya dari WhatsApp
  const [{ batas }, kiriman] = await Promise.all([batasHariIni(nomor, p), kirimanHariIni(nomor.id, p)]);
  if (kiriman.total >= batas) return;
  const sql = await db();
  const t = sekarang();
  const [prospek, ulang] = await Promise.all([
    s.aktif
      ? sql<BarisJalan[]>`
          SELECT kunci, number_id, tahap, minat, jadwal, siklus, draf, pesan1, pesan2, pesan3, ack1, ack2, ack3
            FROM followup_prospek WHERE number_id = ${nomor.id} AND usaha AND status = 'jalan' AND jadwal <= ${t}
           ORDER BY jadwal, kunci LIMIT 10`
      : [],
    s.ulangAktif && kiriman.ulang < Math.max(1, Math.floor(batas * PORSI_ULANG))
      ? sql<BarisUlangJalan[]>`
          SELECT kunci, number_id, beli_pada, jadwal, draf, dibuat FROM followup_ulang
           WHERE number_id = ${nomor.id} AND status = 'jalan' AND jadwal <= ${t}
           ORDER BY jadwal, kunci LIMIT 5`
      : [],
  ]);
  if (!prospek.length && !ulang.length) return;
  if (await periksaRem(nomor, p)) return;
  const terkirim = (jenis: "prospek" | "ulang"): void => {
    p.kirimHari += 1;
    if (jenis === "ulang") p.kirimUlangHari += 1;
    p.bolehPada = Date.now() + jedaAcakMs();
  };
  // Lead panas dulu, lalu yang paling lama menunggu.
  for (const b of [...prospek].sort((x, y) => y.minat - x.minat || x.jadwal - y.jadwal)) if (await prosesProspek(nomor, p, b)) return terkirim("prospek");
  for (const b of ulang) if (await prosesUlang(nomor, b)) return terkirim("ulang");
}

/**
 * Putaran follow-up nomor pengguna (dipanggil tiap menit dari followup.ts). Nomor CS ChatGerCep tidak ikut (dilayani
 * followup-prospek.ts). Paling banyak NOMOR_PER_PUTARAN nomor per putaran, bergiliran.
 */
export async function putaranUsaha(nomorCs: ReadonlySet<number>): Promise<void> {
  if (st.jalan) return;
  st.jalan = true;
  try {
    await segarkan();
    if (!st.per.size) return;
    if (!st.pantauan) await muatPantauan().catch((e) => console.warn("[followup-usaha] pantauan gagal dimuat:", e instanceof Error ? e.message : e));
    const ids = [...st.per.keys()].filter((id) => !nomorCs.has(id));
    if (!ids.length) return;
    const n = Math.min(ids.length, NOMOR_PER_PUTARAN);
    for (let i = 0; i < n; i++) {
      const id = ids[(st.giliran + i) % ids.length];
      const p = st.per.get(id);
      if (p) await satuNomor(id, p).catch((e) => console.error(`[followup-usaha] nomor ${id} gagal:`, e instanceof Error ? e.message : e));
    }
    st.giliran = (st.giliran + n) % ids.length;
  } catch (e) {
    console.error("[followup-usaha] putaran gagal:", e instanceof Error ? e.message : e);
  } finally {
    st.jalan = false;
  }
}

// ---------- Pesan masuk & status kiriman (dipanggil followup.ts) ----------

/**
 * Pesan masuk di nomor pengguna yang follow-up-nya aktif. Hanya balasan PERTAMA setelah follow-up yang dinilai:
 * permintaan berhenti dicatat permanen; selain itu baris selesai sebagai "dibalas" dan AI diberi konteksnya. Chat
 * yang tidak sedang di-follow-up selesai tanpa I/O.
 */
export async function pesanMasukUsaha(d: { kunci: string; teks: string }): Promise<string | null> {
  const f = st.aktif.get(d.kunci);
  if (!f || f.dicatat) return null;
  f.dicatat = true;
  const teks = d.teks.trim();
  const t = sekarang();
  const sql = await db();
  if (teks && (POLA_STOP.test(teks) || POLA_STOP_PENDEK.test(teks))) {
    await sql`INSERT INTO followup_stop (kunci, dibuat) VALUES (${d.kunci}, ${t}) ON CONFLICT (kunci) DO NOTHING`;
    if (f.jenis === "prospek")
      await sql`UPDATE followup_prospek SET status = 'stop', alasan = 'Pelanggan meminta tidak dihubungi lagi', diperbarui = ${t}, dibalas = COALESCE(dibalas, ${t}) WHERE kunci = ${d.kunci} AND usaha`;
    else await sql`UPDATE followup_ulang SET status = 'stop', alasan = 'Pelanggan meminta tidak dihubungi lagi', diperbarui = ${t}, dibalas = COALESCE(dibalas, ${t}) WHERE kunci = ${d.kunci}`;
    console.info("[followup-usaha] pelanggan meminta tidak dihubungi lagi");
    return `Lawan bicara ini menerima pesan dari kita${f.teks ? ` ("${f.teks.slice(0, 300)}")` : ""} dan meminta tidak dihubungi lagi. Minta maaf singkat dalam satu kalimat, pastikan ia tidak akan dikirimi pesan seperti itu lagi, dan jangan menawarkan apa pun.`;
  }
  if (f.jenis === "prospek")
    await sql`
      UPDATE followup_prospek SET status = CASE WHEN status IN ('jalan', 'selesai') THEN 'dibalas' ELSE status END,
             alasan = CASE WHEN status IN ('jalan', 'selesai') THEN null ELSE alasan END,
             dibalas = COALESCE(dibalas, ${t}), diperbarui = ${t}
       WHERE kunci = ${d.kunci} AND usaha AND tahap > 0`;
  else
    await sql`
      UPDATE followup_ulang SET status = CASE WHEN status IN ('terkirim', 'selesai') THEN 'dibalas' ELSE status END,
             dibalas = COALESCE(dibalas, ${t}), diperbarui = ${t}
       WHERE kunci = ${d.kunci} AND terkirim IS NOT NULL`;
  return `${f.teks ? `Kamu tadi mengirim pesan ini ke chat ini: "${f.teks.slice(0, 400)}". Pesan berikut adalah balasannya. ` : ""}Layani seperti biasa dengan fakta dari pengetahuan; bila ia siap memesan, bantu sampai tuntas. Jangan memaksa bila ia menolak.`;
}

/** Status kiriman (centang). true = id ini milik follow-up nomor pengguna. */
export function terimaAckUsaha(id: string, status: number): boolean {
  const x = st.ack.get(id);
  if (!x) return false;
  const nilai = Math.min(4, status);
  if (nilai <= x.ack) return true;
  x.ack = nilai;
  if (nilai >= 4) st.ack.delete(id);
  void db()
    .then((sql) =>
      x.jenis === "ulang"
        ? sql`UPDATE followup_ulang SET ack = GREATEST(ack, ${nilai}) WHERE kunci = ${x.kunci}`
        : x.slot === 1
          ? sql`UPDATE followup_prospek SET ack1 = GREATEST(ack1, ${nilai}) WHERE kunci = ${x.kunci}`
          : x.slot === 2
            ? sql`UPDATE followup_prospek SET ack2 = GREATEST(ack2, ${nilai}) WHERE kunci = ${x.kunci}`
            : sql`UPDATE followup_prospek SET ack3 = GREATEST(ack3, ${nilai}) WHERE kunci = ${x.kunci}`,
    )
    .catch((e) => console.warn("[followup-usaha] status kiriman gagal disimpan:", e instanceof Error ? e.message : e));
  return true;
}

/** Baris yang masih dipantau (14 hari terakhir) dimuat ke memori sekali. */
export async function muatPantauan(): Promise<void> {
  if (st.pantauan) return;
  st.pantauan = true;
  const sql = await db();
  const sejak = sekarang() - PANTAU_DTK;
  const [prospek, ulang] = await Promise.all([
    sql<{ kunci: string; status: string; tahap: number; pesan1: string | null; pesan2: string | null; pesan3: string | null; pesan1_id: string | null; pesan2_id: string | null; pesan3_id: string | null; ack1: number; ack2: number; ack3: number; dibalas: number | null }[]>`
      SELECT kunci, status, tahap, pesan1, pesan2, pesan3, pesan1_id, pesan2_id, pesan3_id, ack1, ack2, ack3, dibalas
        FROM followup_prospek WHERE usaha AND tahap > 0 AND diperbarui >= ${sejak}`,
    sql<{ kunci: string; status: string; pesan: string | null; pesan_id: string | null; ack: number; dibalas: number | null }[]>`
      SELECT kunci, status, pesan, pesan_id, ack, dibalas FROM followup_ulang WHERE terkirim IS NOT NULL AND diperbarui >= ${sejak}`,
  ]);
  for (const b of prospek) {
    const teks = [b.pesan1, b.pesan2, b.pesan3][b.tahap - 1] ?? null;
    st.aktif.set(b.kunci, { jenis: "prospek", teks, dicatat: b.dibalas !== null || b.status === "stop" || b.status === "dibalas" });
    const id = [b.pesan1_id, b.pesan2_id, b.pesan3_id];
    const ack = [b.ack1, b.ack2, b.ack3];
    for (let i = 0; i < 3; i++) if (id[i] && ack[i] < 4) st.ack.set(id[i] as string, { kunci: b.kunci, jenis: "prospek", slot: (i + 1) as 1 | 2 | 3, ack: ack[i] });
  }
  for (const b of ulang) {
    st.aktif.set(b.kunci, { jenis: "ulang", teks: b.pesan, dicatat: b.dibalas !== null || b.status === "stop" || b.status === "dibalas" });
    if (b.pesan_id && b.ack < 4) st.ack.set(b.pesan_id, { kunci: b.kunci, jenis: "ulang", slot: 1, ack: b.ack });
  }
}

// ---------- Untuk tab Follow-up di halaman nomor ----------

export async function statusUsaha(nomor: Nomor): Promise<StatusUsaha> {
  const sql = await db();
  const [{ setelan, rem }, boleh, sisaKuota, [k]] = await Promise.all([
    setelanNomor(nomor.id),
    followupBoleh(nomor.user_id),
    nomor.user_id === null ? Promise.resolve(0) : sisaKuotaAi(nomor.user_id),
    sql<{ terkirim: number; dibalas: number; stop: number; berjalan: number }[]>`
      SELECT (SELECT COUNT(*) FROM followup_prospek WHERE number_id = ${nomor.id} AND usaha AND tahap > 0)::int
             + (SELECT COUNT(*) FROM followup_ulang WHERE number_id = ${nomor.id} AND terkirim IS NOT NULL)::int AS terkirim,
             (SELECT COUNT(*) FROM followup_prospek WHERE number_id = ${nomor.id} AND usaha AND tahap > 0 AND dibalas IS NOT NULL)::int
             + (SELECT COUNT(*) FROM followup_ulang WHERE number_id = ${nomor.id} AND terkirim IS NOT NULL AND dibalas IS NOT NULL)::int AS dibalas,
             (SELECT COUNT(*) FROM followup_prospek WHERE number_id = ${nomor.id} AND usaha AND status = 'stop')::int
             + (SELECT COUNT(*) FROM followup_ulang WHERE number_id = ${nomor.id} AND status = 'stop')::int AS stop,
             (SELECT COUNT(*) FROM followup_prospek WHERE number_id = ${nomor.id} AND usaha AND status = 'jalan')::int
             + (SELECT COUNT(*) FROM followup_ulang WHERE number_id = ${nomor.id} AND status = 'jalan')::int AS berjalan`,
  ]);
  const p = st.per.get(nomor.id) ?? perBaru({ number_id: nomor.id, aktif: setelan.aktif, ulang_aktif: setelan.ulangAktif, setelan, rem_pada: rem?.pada ?? null, rem_alasan: rem?.alasan ?? null, rem_lepas: 0 });
  p.setelan = setelan;
  const [b, kirim] = await Promise.all([batasHariIni(nomor, p), kirimanHariIni(nomor.id, p)]);
  const terhubung = !!nomor.wa_id && infoSesi(nomor.sesi).status === "WORKING";
  const tahan = terhubung ? alasanTahan(nomor.sesi) : null;
  return {
    setelan,
    boleh,
    terhubung,
    tahan: tahan ? (tahan.startsWith("Tanda bahaya") ? "bahaya" : "stabil") : null,
    rem,
    kirimHariIni: kirim.total,
    batasHariIni: b.batas,
    sebabBatas: b.sebab,
    sisaKuota,
    terkirim: k?.terkirim ?? 0,
    dibalas: k?.dibalas ?? 0,
    stop: k?.stop ?? 0,
    berjalan: k?.berjalan ?? 0,
  };
}

/** Riwayat terbaru (prospek + order ulang) satu nomor, lewat indeks per nomor. */
export async function daftarUsaha(numberId: number, batas = 50): Promise<BarisUsaha[]> {
  const sql = await db();
  const n = Math.min(100, Math.max(1, batas));
  const [prospek, ulang, setelan] = await Promise.all([
    sql<
      {
        kunci: string;
        status: StatusProspek;
        tujuan: string | null;
        nama: string | null;
        minat: number;
        tahap: number;
        jadwal: number;
        diperbarui: number;
        draf: string | null;
        pesan1: string | null;
        pesan2: string | null;
        pesan3: string | null;
        terkirim1: number | null;
        terkirim2: number | null;
        terkirim3: number | null;
        ack1: number;
        ack2: number;
        ack3: number;
        dibalas: number | null;
        alasan: string | null;
        percakapan_id: number | null;
      }[]
    >`
      SELECT fp.kunci, fp.status, fp.tujuan, fp.nama, fp.minat, fp.tahap, fp.jadwal, fp.diperbarui, fp.draf,
             fp.pesan1, fp.pesan2, fp.pesan3, fp.terkirim1, fp.terkirim2, fp.terkirim3, fp.ack1, fp.ack2, fp.ack3,
             fp.dibalas, fp.alasan, p.id AS percakapan_id
        FROM followup_prospek fp LEFT JOIN percakapan p ON p.kunci = fp.kunci
       WHERE fp.number_id = ${numberId} AND fp.usaha
       ORDER BY fp.diperbarui DESC, fp.kunci DESC LIMIT ${n}`,
    sql<
      {
        kunci: string;
        status: StatusUlang;
        tujuan: string | null;
        nama: string | null;
        jadwal: number;
        diperbarui: number;
        draf: string | null;
        pesan: string | null;
        terkirim: number | null;
        ack: number;
        dibalas: number | null;
        alasan: string | null;
        percakapan_id: number | null;
      }[]
    >`
      SELECT u.kunci, u.status, u.tujuan, u.nama, u.jadwal, u.diperbarui, u.draf, u.pesan, u.terkirim, u.ack, u.dibalas, u.alasan, p.id AS percakapan_id
        FROM followup_ulang u LEFT JOIN percakapan p ON p.kunci = u.kunci
       WHERE u.number_id = ${numberId}
       ORDER BY u.diperbarui DESC, u.kunci DESC LIMIT ${n}`,
    setelanNomor(numberId),
  ]);
  const semua: BarisUsaha[] = [
    ...prospek.map((b) => ({
      jenis: "prospek" as const,
      kunci: b.kunci,
      status: b.status,
      tujuan: b.tujuan,
      nama: b.nama,
      minat: b.minat,
      tahap: b.tahap,
      maks: setelan.setelan.maksTahap,
      jadwal: b.jadwal,
      diperbarui: b.diperbarui,
      draf: b.draf,
      pesan: [
        { teks: b.pesan1, pada: b.terkirim1, ack: b.ack1 },
        { teks: b.pesan2, pada: b.terkirim2, ack: b.ack2 },
        { teks: b.pesan3, pada: b.terkirim3, ack: b.ack3 },
      ].filter((x): x is { teks: string; pada: number; ack: number } => !!x.teks && !!x.pada),
      dibalas: b.dibalas,
      alasan: b.alasan,
      percakapan_id: b.percakapan_id,
    })),
    ...ulang.map((b) => ({
      jenis: "ulang" as const,
      kunci: b.kunci,
      status: b.status,
      tujuan: b.tujuan,
      nama: b.nama,
      minat: null,
      tahap: b.terkirim ? 1 : 0,
      maks: 1,
      jadwal: b.jadwal,
      diperbarui: b.diperbarui,
      draf: b.draf,
      pesan: b.pesan && b.terkirim ? [{ teks: b.pesan, pada: b.terkirim, ack: b.ack }] : [],
      dibalas: b.dibalas,
      alasan: b.alasan,
      percakapan_id: b.percakapan_id,
    })),
  ];
  return semua.sort((a, b) => b.diperbarui - a.diperbarui || (a.kunci < b.kunci ? 1 : -1)).slice(0, n);
}

/** Pemilik: tulis ulang draf pesan berikutnya dengan AI (dihitung 1 balasan AI bila dipakai). */
export async function tulisUlangDrafUsaha(numberId: number, jenis: "prospek" | "ulang", kunci: string): Promise<string> {
  const sql = await db();
  const nomor = await nomorById(numberId);
  if (!nomor) throw galat("Nomor tidak ditemukan.", "Number not found.");
  const sisa = nomor.user_id === null ? 0 : await sisaKuotaAi(nomor.user_id);
  if (sisa !== null && sisa <= 0) throw galat("Kuota balasan AI habis, jadi pesan tidak bisa ditulis ulang.", "Your AI reply quota is used up, so the message can't be rewritten.");
  const chat = await chatDari(kunci);
  if (!chat) throw galat("Chat sudah terhapus.", "This chat has been deleted.");
  if (jenis === "prospek") {
    const [b] = await sql<BarisJalan[]>`
      SELECT kunci, number_id, tahap, minat, jadwal, siklus, draf, pesan1, pesan2, pesan3, ack1, ack2, ack3
        FROM followup_prospek WHERE kunci = ${kunci} AND number_id = ${numberId} AND usaha AND status = 'jalan'`;
    if (!b) throw galat("Tidak ada pesan yang menunggu dikirim untuk chat ini.", "There is no message waiting to be sent for this chat.");
    const { teks } = (await susunPesan(nomor, chat, (b.tahap + 1) as Tahap, b.minat, sebelumnyaDari(b), false)) as { teks: string };
    await sql`UPDATE followup_prospek SET draf = ${teks} WHERE kunci = ${kunci} AND usaha AND tahap = ${b.tahap} AND status = 'jalan'`;
    return teks;
  }
  const [b] = await sql`SELECT 1 FROM followup_ulang WHERE kunci = ${kunci} AND number_id = ${numberId} AND status = 'jalan'`;
  if (!b) throw galat("Tidak ada pesan yang menunggu dikirim untuk chat ini.", "There is no message waiting to be sent for this chat.");
  const { teks } = (await susunPesan(nomor, chat, "ulang", 0, [], false)) as { teks: string };
  await sql`UPDATE followup_ulang SET draf = ${teks} WHERE kunci = ${kunci} AND status = 'jalan'`;
  return teks;
}

/** Pemilik: simpan suntingan draf. Teks inilah yang dikirim, persis (tetap tanpa tautan & kelangkaan palsu). */
export async function simpanDrafUsaha(numberId: number, jenis: "prospek" | "ulang", kunci: string, teks: string): Promise<void> {
  const bersih = teks.replace(/\u0000/g, "").replace(/\r\n/g, "\n").trim();
  if (bersih.length < BATAS_PESAN[0] || bersih.length > BATAS_PESAN[1]) throw galat(`Pesan harus ${BATAS_PESAN[0]}–${BATAS_PESAN[1]} karakter.`, `The message must be ${BATAS_PESAN[0]}–${BATAS_PESAN[1]} characters.`);
  if ((bersih.match(POLA_TAUTAN) ?? []).length) throw galat("Pesan follow-up tidak boleh berisi tautan (pemicu blokir WhatsApp).", "Follow-up messages can't contain links (a common WhatsApp block trigger).");
  if (POLA_DESAK.test(bersih)) throw galat("Hindari batas waktu atau kelangkaan seperti \"hanya hari ini\": pemicu laporan spam.", "Avoid deadlines or scarcity like \"today only\": they trigger spam reports.");
  const sql = await db();
  const r =
    jenis === "prospek"
      ? await sql`UPDATE followup_prospek SET draf = ${bersih} WHERE kunci = ${kunci} AND number_id = ${numberId} AND usaha AND status = 'jalan'`
      : await sql`UPDATE followup_ulang SET draf = ${bersih} WHERE kunci = ${kunci} AND number_id = ${numberId} AND status = 'jalan'`;
  if (!r.count) throw galat("Follow-up chat ini sudah selesai, jadi pesannya tidak bisa diubah lagi.", "Follow-up for this chat has finished, so its message can no longer be changed.");
}

/** Pemilik: hentikan follow-up satu chat (tidak dikirimi apa pun lagi di siklus ini). */
export async function hentikanUsaha(numberId: number, jenis: "prospek" | "ulang", kunci: string): Promise<void> {
  const sql = await db();
  const t = sekarang();
  const r =
    jenis === "prospek"
      ? await sql`UPDATE followup_prospek SET status = 'batal', alasan = 'Dihentikan pemilik', diperbarui = ${t} WHERE kunci = ${kunci} AND number_id = ${numberId} AND usaha AND status = 'jalan'`
      : await sql`UPDATE followup_ulang SET status = 'batal', alasan = 'Dihentikan pemilik', diperbarui = ${t} WHERE kunci = ${kunci} AND number_id = ${numberId} AND status = 'jalan'`;
  if (!r.count) throw galat("Follow-up chat ini sudah tidak berjalan.", "Follow-up for this chat is no longer running.");
}
