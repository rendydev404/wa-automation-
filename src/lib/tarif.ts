import "server-only";
import { getSetting, sekarang, setSetting } from "./db";
import { type InfoTarif, type TabelTarif, type Tarif, URL_HARGA, bacaTabelTarif, kunciModel } from "./tarif-def";

export * from "./tarif-def";

/**
 * Tarif resmi model Claude, diambil dari halaman harga resmi Anthropic (API model tidak memuat harga), jadi biaya
 * per balasan dan harga paket ikut berubah bila Anthropic mengubah harganya. Cara kerja sama dengan kurs.ts:
 *   - Dipegang di memori; dicek ulang paling cepat tiap jam di latar (nilai lama tetap dipakai sementara itu).
 *     Admin bisa memaksa cek ulang (perbaruiTarif), paling sering sekali per 30 dtk.
 *   - Tabel yang sah terakhir disimpan di database (tahan restart & halaman harga yang sedang gagal); gagal = dicoba
 *     lagi paling cepat 10 menit kemudian. Tabel yang bentuknya berubah (kolom/judul tidak dikenali) ditolak utuh.
 *   - Hanya bila belum pernah berhasil sama sekali: TARIF_CADANGAN (dicek manual 29 Okt 2026), ditandai `cadangan`.
 *   - tarifModel() sinkron (dipakai menghitung biaya tiap balasan AI), jadi tidak pernah menunggu jaringan.
 *   - TARIF_TETAP (env) = selalu TARIF_CADANGAN tanpa jaringan: untuk pengujian, tidak di produksi.
 */

const TTL_DTK = 3600;
const ULANG_SETELAH_GAGAL_DTK = 600;
const JEDA_PAKSA_DTK = 30;
const BATAS_WAKTU_MS = 6000;
const KUNCI_SIMPAN = "tarif_anthropic";

/** Tarif resmi yang dicek manual di halaman harga (29 Okt 2026); dipakai hanya sebelum pengambilan pertama berhasil. */
export const TARIF_CADANGAN: TabelTarif = {
  "haiku 5.5": { masuk: 0.1, keluar: 0.5, tulisCache: 0.125, tulisCache1j: 0.2, bacaCache: 0.01 },
  "sonnet 5.5": { masuk: 2, keluar: 10, tulisCache: 2.5, tulisCache1j: 4, bacaCache: 0.1 },
  "haiku 4.5": { masuk: 1, keluar: 5, tulisCache: 1.25, tulisCache1j: 2, bacaCache: 0.1 },
};

interface Keadaan {
  tabel?: TabelTarif;
  diambil?: number;
  berubah?: number;
  ronde?: number;
  gagalPada?: number;
  paksaPada?: number;
  sedang?: Promise<void>;
  dimuat?: Promise<void>;
}
const g = globalThis as unknown as { __waTarif?: Keadaan };
const st: Keadaan = (g.__waTarif ??= {});

const tetap = () => !!process.env.TARIF_TETAP;

function muatTersimpan(): Promise<void> {
  return (st.dimuat ??= (async () => {
    try {
      const mentah = await getSetting(KUNCI_SIMPAN);
      const d = mentah ? (JSON.parse(mentah) as { t?: unknown; at?: unknown; ub?: unknown }) : null;
      if (d && d.t && typeof d.t === "object" && typeof d.at === "number" && Object.keys(d.t).length >= 3) {
        st.tabel ??= d.t as TabelTarif;
        st.diambil ??= d.at;
        st.berubah ??= typeof d.ub === "number" ? d.ub : 0;
      }
    } catch {
      /* rusak = dianggap belum ada */
    }
  })());
}

const sama = (a: TabelTarif, b: TabelTarif) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

async function perbarui(): Promise<void> {
  const t = sekarang();
  st.ronde = t;
  let baru: TabelTarif | null = null;
  try {
    const res = await fetch(URL_HARGA, { headers: { Accept: "text/markdown, text/plain" }, signal: AbortSignal.timeout(BATAS_WAKTU_MS), cache: "no-store" });
    if (res.ok) baru = bacaTabelTarif(await res.text());
  } catch {
    /* gagal = di bawah */
  }
  if (!baru) {
    if (st.gagalPada === undefined) console.warn("[tarif] halaman harga Anthropic tidak bisa dibaca, memakai tarif terakhir yang tersimpan");
    st.gagalPada = t;
    return;
  }
  if (st.tabel && !sama(st.tabel, baru)) {
    st.berubah = t;
    const beda = Object.keys(baru).filter((k) => JSON.stringify(baru[k]) !== JSON.stringify(st.tabel?.[k]));
    console.log(`[tarif] harga resmi Anthropic berubah: ${beda.join(", ")}`);
  }
  st.tabel = baru;
  st.diambil = t;
  st.gagalPada = undefined;
  await setSetting(KUNCI_SIMPAN, JSON.stringify({ t: baru, at: t, ub: st.berubah ?? 0 })).catch(() => {});
}

function jalankan(): Promise<void> {
  st.sedang ??= perbarui().finally(() => {
    st.sedang = undefined;
  });
  return st.sedang;
}

const waktunya = (t: number) => st.ronde === undefined || t - st.ronde >= (st.gagalPada !== undefined ? ULANG_SETELAH_GAGAL_DTK : TTL_DTK);

/** Pastikan tabel termuat (dari database) dan, bila sudah waktunya, cek ulang halaman harga. `tunggu`: tunggu hasilnya. */
export async function siapkanTarif(opsi: { tunggu?: boolean } = {}): Promise<void> {
  if (tetap()) return;
  await muatTersimpan();
  if (!waktunya(sekarang())) return;
  if (opsi.tunggu || !st.tabel) await jalankan();
  else void jalankan();
}

/** Tarif satu model (id API atau nama); null bila model itu tidak tercantum di halaman harga. Tidak menunggu jaringan. */
export function tarifModel(model: string): Tarif | null {
  const kunci = kunciModel(model);
  if (!kunci) return null;
  if (!tetap()) {
    void muatTersimpan();
    if (waktunya(sekarang()) && st.dimuat) void st.dimuat.then(() => (waktunya(sekarang()) ? jalankan() : undefined));
  }
  const tabel = !tetap() && st.tabel ? st.tabel : TARIF_CADANGAN;
  return tabel[kunci] ?? null;
}

export async function infoTarif(opsi: { tunggu?: boolean } = {}): Promise<InfoTarif> {
  await siapkanTarif(opsi);
  if (tetap() || !st.tabel) return { sumber: "cadangan", diambil: 0, berubah: 0, jumlahModel: Object.keys(TARIF_CADANGAN).length };
  return { sumber: st.gagalPada !== undefined ? "tersimpan" : "resmi", diambil: st.diambil ?? 0, berubah: st.berubah ?? 0, jumlahModel: Object.keys(st.tabel).length };
}

/** Cek ulang halaman harga sekarang juga (tombol "Perbarui" admin); paling sering sekali per 30 dtk. */
export async function perbaruiTarif(): Promise<InfoTarif> {
  if (!tetap()) {
    await muatTersimpan();
    const t = sekarang();
    if (st.paksaPada === undefined || t - st.paksaPada >= JEDA_PAKSA_DTK) {
      st.paksaPada = t;
      await jalankan();
    }
  }
  return infoTarif();
}
