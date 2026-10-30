import "server-only";
import { getSetting, sekarang, setSetting } from "./db";
import { type InfoKurs, KURS_CADANGAN, KURS_MAKS, KURS_MIN } from "./kurs-def";

export * from "./kurs-def";

/**
 * Kurs USD → Rp dari data pasar, bukan tebakan atau isian admin.
 *
 * Sumber (gratis, tanpa kunci API; diperiksa 30 Okt 2026, selisih keduanya <0,1%): Frankfurter (kurs referensi
 * Bank Sentral Eropa, harian), lalu ExchangeRate-API (open.er-api.com, harian) bila yang pertama gagal. Keduanya
 * memperbarui sekali sehari, jadi menarik lebih sering dari tiap jam tidak memberi data lebih baru.
 *
 * Cara kerja (hemat jaringan dan tidak menahan halaman):
 *   - Dipegang di memori proses; dianggap segar 1 jam. Lewat dari itu, nilai lama langsung dipakai sementara
 *     pembaruan jalan di latar (stale-while-revalidate). Permintaan serentak digabung jadi satu.
 *   - Tiap sumber dibatasi 3 dtk, hasilnya divalidasi (angka, masuk rentang wajar) sebelum dipakai.
 *   - Nilai sah terakhir disimpan di database: tahan restart server dan sumber yang mati. Pengambilan gagal =
 *     nilai itu tetap dipakai dan ditandai `basi`, dicoba lagi paling cepat 5 menit kemudian (tidak membanjiri).
 *   - Hanya bila belum pernah berhasil sama sekali: KURS_CADANGAN, ditandai `cadangan` supaya tampil sebagai perkiraan.
 *   - KURS_USD_TETAP (env) memaksa angka tetap tanpa jaringan: untuk pengembangan offline dan pengujian, tidak di produksi.
 */

const TTL_DTK = 3600;
const ULANG_SETELAH_GAGAL_DTK = 300;
const BATAS_WAKTU_MS = 3000;
const KUNCI_SIMPAN = "kurs_usd_pasar";

interface Sumber {
  nama: string;
  url: string;
  baca: (d: unknown) => { kurs: unknown; tanggal: string } | null;
}

const tanggalIso = (detik: number) => new Date(detik * 1000).toISOString().slice(0, 10);

const SUMBER: Sumber[] = [
  {
    nama: "Frankfurter (kurs referensi ECB)",
    url: "https://api.frankfurter.dev/v1/latest?base=USD&symbols=IDR",
    baca: (d) => {
      const x = d as { rates?: { IDR?: unknown }; date?: unknown } | null;
      return x?.rates ? { kurs: x.rates.IDR, tanggal: typeof x.date === "string" ? x.date : "" } : null;
    },
  },
  {
    nama: "ExchangeRate-API",
    url: "https://open.er-api.com/v6/latest/USD",
    baca: (d) => {
      const x = d as { result?: unknown; rates?: { IDR?: unknown }; time_last_update_unix?: unknown } | null;
      if (x?.result !== "success" || !x.rates) return null;
      return { kurs: x.rates.IDR, tanggal: typeof x.time_last_update_unix === "number" ? tanggalIso(x.time_last_update_unix) : "" };
    },
  },
];

interface Keadaan {
  info?: InfoKurs;
  sedang?: Promise<void>;
  gagalPada?: number;
  dimuat?: boolean;
}
const g = globalThis as unknown as { __waKurs?: Keadaan };
const st: Keadaan = (g.__waKurs ??= {});

const sah = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= KURS_MIN && v <= KURS_MAKS;

async function ambil(s: Sumber): Promise<{ kurs: number; tanggal: string } | null> {
  try {
    const res = await fetch(s.url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(BATAS_WAKTU_MS), cache: "no-store" });
    if (!res.ok) return null;
    const h = s.baca(await res.json());
    return h && sah(h.kurs) ? { kurs: Math.round(h.kurs), tanggal: h.tanggal } : null;
  } catch {
    return null;
  }
}

/** Nilai pasar terakhir yang tersimpan di database (sekali per proses). */
async function muatTersimpan(): Promise<void> {
  if (st.dimuat) return;
  st.dimuat = true;
  try {
    const mentah = await getSetting(KUNCI_SIMPAN);
    const d = mentah ? (JSON.parse(mentah) as { k?: unknown; s?: unknown; tgl?: unknown; at?: unknown }) : null;
    if (d && sah(d.k) && typeof d.s === "string" && typeof d.at === "number") {
      st.info = { kurs: d.k, sumber: d.s, tanggal: typeof d.tgl === "string" ? d.tgl : "", diambil: d.at, basi: false, cadangan: false };
    }
  } catch {
    /* tersimpan rusak = dianggap belum ada */
  }
}

async function perbarui(): Promise<void> {
  for (const s of SUMBER) {
    const h = await ambil(s);
    if (!h) continue;
    st.info = { kurs: h.kurs, sumber: s.nama, tanggal: h.tanggal, diambil: sekarang(), basi: false, cadangan: false };
    st.gagalPada = undefined;
    await setSetting(KUNCI_SIMPAN, JSON.stringify({ k: h.kurs, s: s.nama, tgl: h.tanggal, at: st.info.diambil })).catch(() => {});
    return;
  }
  if (st.gagalPada === undefined) console.warn("[kurs] semua sumber kurs USD→IDR gagal, memakai nilai terakhir yang tersimpan");
  st.gagalPada = sekarang();
}

/** Satu pembaruan pada satu waktu; yang menunggu mendapat hasil yang sama. */
function jalankanPembaruan(): Promise<void> {
  st.sedang ??= perbarui().finally(() => {
    st.sedang = undefined;
  });
  return st.sedang;
}

export async function infoKurs(): Promise<InfoKurs> {
  const tetap = Number(process.env.KURS_USD_TETAP);
  if (process.env.KURS_USD_TETAP && sah(tetap)) return { kurs: tetap, sumber: "Tetap (KURS_USD_TETAP)", tanggal: "", diambil: sekarang(), basi: false, cadangan: false };

  await muatTersimpan();
  const t = sekarang();
  if (!st.info) {
    await jalankanPembaruan(); // pertama kali sama sekali: perlu menunggu
  } else if (t - st.info.diambil >= TTL_DTK && (st.gagalPada === undefined || t - st.gagalPada >= ULANG_SETELAH_GAGAL_DTK)) {
    void jalankanPembaruan(); // nilai lama dipakai dulu, pembaruan jalan di latar
  }
  if (!st.info) return { kurs: KURS_CADANGAN, sumber: "Perkiraan cadangan", tanggal: "", diambil: t, basi: false, cadangan: true };
  return { ...st.info, basi: st.gagalPada !== undefined && t - st.info.diambil >= TTL_DTK };
}

/** Rupiah per 1 USD. */
export const kursUsd = async (): Promise<number> => (await infoKurs()).kurs;
