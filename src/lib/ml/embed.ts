import "server-only";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Mesin embedding lokal untuk penyaring prospek (src/lib/prospek.ts): multilingual-e5-small terkuantisasi yang
 * kosakatanya dipangkas ke token Indonesia/Inggris/slang/emoji (lihat ml/README.md). Teks -> vektor 384 dimensi
 * ternormalisasi (cosine = hasil kali titik). Berjalan di proses ini lewat onnxruntime-node, 1 thread CPU:
 * terukur ±6 ms per pesan dan +85 MB RSS di laptop dev.
 *
 * Dimuat malas pada pemakaian pertama. Gagal dimuat (berkas model tidak ada, biner ORT tidak cocok) = mesin dianggap
 * tidak tersedia dan penyaring jalan tanpa ML (penilaian AI utama saja); tidak pernah menghentikan balasan.
 */

export const DIMENSI = 384;
const MAKS_TOKEN = 128;
const MAKS_CACHE = 1_000;

/** e5 memakai awalan berbeda untuk pesan (query) dan isi dokumen (passage) supaya keduanya bisa dicocokkan. */
export type JenisTeks = "query" | "passage";

interface Mesin {
  ubah(teks: string): Promise<Float32Array>;
}

interface Keadaan {
  janji: Promise<Mesin | null> | null;
  gagal: string | null;
  /** Teks -> vektor; pesan pendek yang sama ("p", "ok kak") sering berulang. Urutan Map = urutan pemakaian (LRU). */
  cache: Map<string, Float32Array>;
  /** Satu inferensi pada satu waktu supaya CPU untuk WhatsApp & web tetap lega. */
  antre: Promise<unknown>;
}

const g = globalThis as unknown as { __waMl?: Keadaan };
const st: Keadaan = (g.__waMl ??= { janji: null, gagal: null, cache: new Map(), antre: Promise.resolve() });

/** Jalur tetap (tanpa env) supaya pelacak berkas build hanya membawa folder model, bukan seluruh proyek. */
export const folderModel = (): string => path.join(process.cwd(), "ml", "model");

async function muat(): Promise<Mesin | null> {
  const dir = folderModel();
  const berkas = path.join(dir, "model.onnx");
  if (!existsSync(berkas)) {
    st.gagal = `model tidak ada di ${berkas}`;
    console.warn(`[ml] ${st.gagal}; penyaring prospek berjalan tanpa ML`);
    return null;
  }
  try {
    const t0 = Date.now();
    const [{ Tokenizer }, ortMod] = await Promise.all([import("@huggingface/tokenizers"), import("onnxruntime-node")]);
    const ort = ((ortMod as unknown as { default?: typeof ortMod }).default ?? ortMod) as typeof import("onnxruntime-node");
    const tok = new Tokenizer(JSON.parse(readFileSync(path.join(dir, "tokenizer.json"), "utf8")), JSON.parse(readFileSync(path.join(dir, "tokenizer_config.json"), "utf8")));
    const sesi = await ort.InferenceSession.create(berkas, { intraOpNumThreads: 1, interOpNumThreads: 1, executionMode: "sequential", enableCpuMemArena: false, graphOptimizationLevel: "all" });
    const keluaran = sesi.outputNames[0];
    const pakaiTipe = sesi.inputNames.includes("token_type_ids");
    console.info(`[ml] model embedding siap dalam ${Date.now() - t0} ms`);
    return {
      async ubah(teks) {
        const ids = tok.encode(teks).ids.slice(0, MAKS_TOKEN);
        const n = ids.length;
        const feeds: Record<string, InstanceType<typeof ort.Tensor>> = {
          input_ids: new ort.Tensor("int64", BigInt64Array.from(ids, (x) => BigInt(x)), [1, n]),
          attention_mask: new ort.Tensor("int64", new BigInt64Array(n).fill(BigInt(1)), [1, n]),
        };
        if (pakaiTipe) feeds.token_type_ids = new ort.Tensor("int64", new BigInt64Array(n), [1, n]);
        const hasil = await sesi.run(feeds);
        const h = hasil[keluaran].data as Float32Array;
        // Rata-rata seluruh token (mean pooling, cara pakai e5), lalu dinormalkan.
        const v = new Float32Array(DIMENSI);
        for (let i = 0; i < n; i++) for (let j = 0; j < DIMENSI; j++) v[j] += h[i * DIMENSI + j];
        let norma = 0;
        for (let j = 0; j < DIMENSI; j++) norma += v[j] * v[j];
        norma = Math.sqrt(norma) || 1;
        for (let j = 0; j < DIMENSI; j++) v[j] /= norma;
        return v;
      },
    };
  } catch (e) {
    st.gagal = e instanceof Error ? e.message : String(e);
    console.error(`[ml] model embedding gagal dimuat (${st.gagal}); penyaring prospek berjalan tanpa ML`);
    return null;
  }
}

const mesin = (): Promise<Mesin | null> => (st.janji ??= muat());

/** Muat model di latar (dipanggil saat server mulai) supaya pesan pertama tidak menunggu ±1 dtk pemuatan. */
export function panaskanMl(): void {
  void mesin();
}

/** Apakah mesin sudah siap dipakai (tanpa memicu pemuatan). */
export async function mlSiap(): Promise<boolean> {
  return !!(await mesin());
}

/** Teks dirapikan sebelum di-embed: spasi dilebur, dipotong. Huruf besar/kecil dibiarkan (model membedakannya). */
const rapikan = (t: string): string => t.replace(/\s+/g, " ").trim().slice(0, 600);

/** Vektor ternormalisasi untuk satu teks; null bila mesin tidak tersedia atau teks kosong. */
export async function embed(teks: string, jenis: JenisTeks = "query"): Promise<Float32Array | null> {
  const isi = rapikan(teks);
  if (!isi) return null;
  const t = `${jenis}: ${isi}`;
  const ada = st.cache.get(t);
  if (ada) {
    st.cache.delete(t);
    st.cache.set(t, ada);
    return ada;
  }
  const m = await mesin();
  if (!m) return null;
  const kerja = st.antre.then(() => m.ubah(t));
  st.antre = kerja.catch(() => {});
  try {
    const v = await kerja;
    st.cache.set(t, v);
    if (st.cache.size > MAKS_CACHE) st.cache.delete(st.cache.keys().next().value as string);
    return v;
  } catch (e) {
    console.warn(`[ml] embedding gagal: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}
