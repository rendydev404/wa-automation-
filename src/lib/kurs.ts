import "server-only";
import { getSetting, sekarang, setSetting } from "./db";
import { type InfoKurs, KURS_CADANGAN, KURS_MAKS, KURS_MIN, SELISIH_KURS_MAKS } from "./kurs-def";

export * from "./kurs-def";

/**
 * Kurs USD → Rp dari data pasar, bukan tebakan atau isian admin.
 *
 * Tiga sumber gratis tanpa kunci API, ditanya bersamaan lalu dicocokkan satu sama lain:
 *   - Coinbase: kurs pasar berjalan (diperbarui sepanjang hari), jadi sumber yang paling baru.
 *   - Frankfurter (kurs referensi Bank Sentral Eropa) dan ExchangeRate-API: harian. Ditanya paling sering tiap jam,
 *     karena lebih sering dari itu tidak memberi data baru.
 * Angka yang tidak sejalan dengan sumber lain mana pun (selisih >3%) dibuang sebagai data rusak; dari yang sejalan
 * dipakai yang datanya paling baru. Tidak ada yang sejalan (satu sumber saja, atau semua berselisih): dipakai sumber
 * yang paling tepercaya (`percaya`, kurs referensi bank sentral lebih dulu).
 *
 * Cara kerja (hemat jaringan dan tidak menahan halaman):
 *   - Dipegang di memori proses; dianggap segar 10 menit. Lewat dari itu, nilai lama langsung dipakai sementara
 *     pembaruan jalan di latar (stale-while-revalidate). Permintaan serentak digabung jadi satu putaran.
 *   - Tiap sumber dibatasi 3 dtk, hasilnya divalidasi (angka, masuk rentang wajar) sebelum dipakai.
 *   - Nilai sah terakhir disimpan di database: tahan restart server dan sumber yang mati. Semua sumber gagal = nilai
 *     itu tetap dipakai (ditandai `basi` bila sudah lewat 1 jam), dicoba lagi paling cepat 5 menit kemudian.
 *   - Admin bisa memaksa ambil ulang (perbaruiKurs), paling sering sekali per 30 dtk untuk seluruh server.
 *   - Hanya bila belum pernah berhasil sama sekali: KURS_CADANGAN, ditandai `cadangan` supaya tampil sebagai perkiraan.
 *   - KURS_USD_TETAP (env) memaksa angka tetap tanpa jaringan: untuk pengembangan offline dan pengujian, tidak di produksi.
 */

const TTL_DTK = 600;
const TTL_HARIAN_DTK = 3600;
const ULANG_SETELAH_GAGAL_DTK = 300;
const JEDA_PAKSA_DTK = 30;
/** Bacaan satu sumber masih ikut dicocokkan selama sekian lama (akhir pekan: kurs referensi tetap data Jumat). */
const BERLAKU_DTK = 2 * 86400;
const BATAS_WAKTU_MS = 3000;
const KUNCI_SIMPAN = "kurs_usd_pasar";

interface Sumber {
  id: string;
  nama: string;
  url: string;
  /** Kurs pasar berjalan; sisanya kurs referensi harian. */
  langsung: boolean;
  /** Urutan kepercayaan bila sumber-sumber tidak sejalan (0 = paling tepercaya). */
  percaya: number;
  baca: (d: unknown) => { kurs: unknown; waktu: number | null; tanggal: string } | null;
}

const tanggalIso = (detik: number) => new Date(detik * 1000).toISOString().slice(0, 10);

const SUMBER: Sumber[] = [
  {
    id: "coinbase",
    nama: "Coinbase (pasar real-time)",
    url: "https://api.coinbase.com/v2/exchange-rates?currency=USD",
    langsung: true,
    percaya: 2,
    baca: (d) => {
      const x = d as { data?: { currency?: unknown; rates?: { IDR?: unknown } } } | null;
      if (x?.data?.currency !== "USD" || !x.data.rates) return null;
      const v = x.data.rates.IDR;
      return { kurs: typeof v === "string" && v.trim() ? Number(v) : v, waktu: null, tanggal: "" };
    },
  },
  {
    id: "ecb",
    nama: "Frankfurter (kurs referensi ECB)",
    url: "https://api.frankfurter.dev/v1/latest?base=USD&symbols=IDR",
    langsung: false,
    percaya: 0,
    baca: (d) => {
      const x = d as { rates?: { IDR?: unknown }; date?: unknown } | null;
      return x?.rates ? { kurs: x.rates.IDR, waktu: null, tanggal: typeof x.date === "string" ? x.date : "" } : null;
    },
  },
  {
    id: "er-api",
    nama: "ExchangeRate-API",
    url: "https://open.er-api.com/v6/latest/USD",
    langsung: false,
    percaya: 1,
    baca: (d) => {
      const x = d as { result?: unknown; rates?: { IDR?: unknown }; time_last_update_unix?: unknown } | null;
      if (x?.result !== "success" || !x.rates) return null;
      const w = typeof x.time_last_update_unix === "number" ? x.time_last_update_unix : null;
      return { kurs: x.rates.IDR, waktu: w, tanggal: w ? tanggalIso(w) : "" };
    },
  },
];

interface Bacaan {
  kurs: number;
  /** Waktu data menurut sumber; untuk kurs pasar berjalan tanpa cap waktu = saat diambil. */
  waktu: number | null;
  tanggal: string;
  diambil: number;
}

interface Keadaan {
  info?: InfoKurs;
  /** Bacaan sah terakhir per sumber (kunci = Sumber.id). */
  per?: Record<string, Bacaan>;
  /** Putaran pengambilan terakhir dimulai. */
  ronde?: number;
  sedang?: Promise<void>;
  gagalPada?: number;
  paksaPada?: number;
  dimuat?: Promise<void>;
}
const g = globalThis as unknown as { __waKurs?: Keadaan };
const st: Keadaan = (g.__waKurs ??= {});

const sah = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= KURS_MIN && v <= KURS_MAKS;
const sejalan = (a: number, b: number) => Math.abs(a - b) / Math.min(a, b) <= SELISIH_KURS_MAKS;

async function ambil(s: Sumber): Promise<Bacaan | null> {
  try {
    const res = await fetch(s.url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(BATAS_WAKTU_MS), cache: "no-store" });
    if (!res.ok) return null;
    const h = s.baca(await res.json());
    if (!h || !sah(h.kurs)) return null;
    const t = sekarang();
    const waktu = h.waktu ?? (s.langsung ? t : null);
    return { kurs: Math.round(h.kurs), waktu, tanggal: h.tanggal || (waktu ? tanggalIso(waktu) : ""), diambil: t };
  } catch {
    return null;
  }
}

/** Seberapa baru data sebuah bacaan; kurs referensi tanpa jam dianggap terbit sore hari (±16.00 waktu Frankfurt). */
const kebaruan = (b: Bacaan) => b.waktu ?? (b.tanggal ? Date.parse(`${b.tanggal}T15:00:00Z`) / 1000 : b.diambil);

/** Bacaan per sumber → kurs yang dipakai (lihat aturan di atas), beserta pembandingnya. */
function pilih(calon: { s: Sumber; b: Bacaan }[]): Omit<InfoKurs, "basi" | "cadangan"> | null {
  if (!calon.length) return null;
  let cocok = calon.filter((c) => calon.some((d) => d !== c && sejalan(c.b.kurs, d.b.kurs)));
  if (!cocok.length) cocok = [calon.reduce((a, c) => (c.s.percaya < a.s.percaya ? c : a))];
  const d = cocok.reduce((a, c) => (kebaruan(c.b) > kebaruan(a.b) || (kebaruan(c.b) === kebaruan(a.b) && c.s.percaya < a.s.percaya) ? c : a));
  return {
    kurs: d.b.kurs,
    sumber: d.s.nama,
    tanggal: d.b.tanggal,
    waktuData: d.b.waktu,
    langsung: d.s.langsung,
    diambil: d.b.diambil,
    pembanding: calon.filter((c) => c !== d).map((c) => ({ sumber: c.s.nama, kurs: c.b.kurs, cocok: sejalan(c.b.kurs, d.b.kurs) })),
  };
}

/** Nilai pasar terakhir yang tersimpan di database (sekali per proses; pemanggil serentak menunggu pemuatan yang sama). */
function muatTersimpan(): Promise<void> {
  return (st.dimuat ??= muat());
}

async function muat(): Promise<void> {
  try {
    const mentah = await getSetting(KUNCI_SIMPAN);
    const d = mentah ? (JSON.parse(mentah) as { k?: unknown; s?: unknown; tgl?: unknown; at?: unknown; wd?: unknown; l?: unknown; p?: unknown }) : null;
    if (d && sah(d.k) && typeof d.s === "string" && typeof d.at === "number") {
      st.info ??= {
        kurs: d.k,
        sumber: d.s,
        tanggal: typeof d.tgl === "string" ? d.tgl : "",
        waktuData: typeof d.wd === "number" ? d.wd : null,
        langsung: d.l === true,
        diambil: d.at,
        basi: false,
        cadangan: false,
        pembanding: Array.isArray(d.p) ? (d.p as InfoKurs["pembanding"]).filter((x) => x && typeof x.sumber === "string" && sah(x.kurs)) : [],
      };
    }
  } catch {
    /* tersimpan rusak = dianggap belum ada */
  }
}

/**
 * Satu putaran: semua sumber ditanya bersamaan (kurs referensi harian dilewati bila diambil kurang dari 1 jam lalu,
 * kecuali `paksa`), lalu bacaan yang masih berlaku dicocokkan. Gagal = tidak satu pun bacaan berumur kurang dari 1 jam.
 */
async function perbarui(paksa: boolean): Promise<void> {
  const t = sekarang();
  st.ronde = t;
  const per = (st.per ??= {});
  const giliran = SUMBER.filter((s) => paksa || s.langsung || !per[s.id] || t - per[s.id].diambil >= TTL_HARIAN_DTK);
  const hasil = await Promise.all(giliran.map(ambil));
  giliran.forEach((s, i) => {
    const h = hasil[i];
    if (h) per[s.id] = h;
  });
  const calon = SUMBER.flatMap((s) => (per[s.id] && t - per[s.id].diambil <= BERLAKU_DTK ? [{ s, b: per[s.id] }] : []));
  const p = calon.some((c) => t - c.b.diambil < TTL_HARIAN_DTK) ? pilih(calon) : null;
  if (!p) {
    if (st.gagalPada === undefined) console.warn("[kurs] semua sumber kurs USD→IDR gagal, memakai nilai terakhir yang tersimpan");
    st.gagalPada = t;
    return;
  }
  st.info = { ...p, basi: false, cadangan: false };
  st.gagalPada = undefined;
  await setSetting(KUNCI_SIMPAN, JSON.stringify({ k: p.kurs, s: p.sumber, tgl: p.tanggal, at: p.diambil, wd: p.waktuData, l: p.langsung, p: p.pembanding })).catch(() => {});
}

/** Satu pembaruan pada satu waktu; yang menunggu mendapat hasil yang sama. */
function jalankanPembaruan(paksa: boolean): Promise<void> {
  st.sedang ??= perbarui(paksa).finally(() => {
    st.sedang = undefined;
  });
  return st.sedang;
}

function kursTetap(): InfoKurs | null {
  const tetap = Number(process.env.KURS_USD_TETAP);
  if (!process.env.KURS_USD_TETAP || !sah(tetap)) return null;
  return { kurs: tetap, sumber: "Tetap (KURS_USD_TETAP)", tanggal: "", waktuData: null, langsung: false, diambil: sekarang(), basi: false, cadangan: false, pembanding: [] };
}

/**
 * Kurs yang dipakai sekarang. Bawaan: tidak menunggu jaringan bila sudah ada nilai (pembaruan di latar).
 * `tunggu`: bila sudah waktunya diperbarui, tunggu putaran itu selesai (untuk kalkulator admin yang memantau kurs).
 */
export async function infoKurs(opsi: { tunggu?: boolean } = {}): Promise<InfoKurs> {
  const tetap = kursTetap();
  if (tetap) return tetap;

  await muatTersimpan();
  const t = sekarang();
  const waktunya = st.ronde === undefined || t - st.ronde >= (st.gagalPada !== undefined ? ULANG_SETELAH_GAGAL_DTK : TTL_DTK);
  if (waktunya && (!st.info || opsi.tunggu)) await jalankanPembaruan(false);
  else if (waktunya) void jalankanPembaruan(false); // nilai lama dipakai dulu, pembaruan jalan di latar
  else if ((!st.info || opsi.tunggu) && st.sedang) await st.sedang; // putaran yang sedang berjalan: tunggu hasilnya
  if (!st.info) return { kurs: KURS_CADANGAN, sumber: "Perkiraan cadangan", tanggal: "", waktuData: null, langsung: false, diambil: t, basi: false, cadangan: true, pembanding: [] };
  return { ...st.info, basi: st.gagalPada !== undefined && t - st.info.diambil >= TTL_HARIAN_DTK };
}

/** Ambil ulang dari semua sumber sekarang juga (tombol "Perbarui" admin); paling sering sekali per 30 dtk. */
export async function perbaruiKurs(): Promise<InfoKurs> {
  if (kursTetap()) return infoKurs();
  await muatTersimpan();
  const t = sekarang();
  if (st.paksaPada === undefined || t - st.paksaPada >= JEDA_PAKSA_DTK) {
    st.paksaPada = t;
    await jalankanPembaruan(true);
  }
  return infoKurs();
}

/** Rupiah per 1 USD. */
export const kursUsd = async (): Promise<number> => (await infoKurs()).kurs;
