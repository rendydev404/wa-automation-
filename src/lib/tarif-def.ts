/**
 * Tarif resmi model Claude: bentuk data dan pembaca tabelnya. Murni tanpa I/O, jadi dipakai juga di browser dan uji.
 * Pengambilannya (dari halaman harga resmi Anthropic) ada di tarif.ts.
 *
 * API model Anthropic (GET /v1/models) tidak memuat harga, jadi sumbernya halaman harga resmi versi markdown:
 * tabel "Model pricing" dengan kolom harga input, tulis cache 5 menit / 1 jam, baca cache, dan output per 1 juta token.
 */

/** USD per 1 juta token. */
export interface Tarif {
  masuk: number;
  keluar: number;
  /** Tulis cache 5 menit. */
  tulisCache: number;
  /** Tulis cache 1 jam. */
  tulisCache1j: number;
  bacaCache: number;
}

export type TabelTarif = Record<string, Tarif>;

export const URL_HARGA = "https://platform.claude.com/docs/en/about-claude/pricing.md";
export const HALAMAN_HARGA = "https://platform.claude.com/docs/en/about-claude/pricing";

/** Harga di luar rentang ini dianggap data rusak (USD per 1 juta token). */
const HARGA_MAKS = 1000;

/**
 * Kunci pencocok model, sama untuk id API dan nama di tabel harga: "claude-haiku-5-5", "claude-opus-4-5-20251101",
 * "claude-3-5-haiku-20241022", "Claude Haiku 5.5 (for prompts up to 100,000 tokens)" -> "haiku 5.5" / "opus 4.5" ...
 */
export function kunciModel(s: string): string | null {
  const t = s.trim().toLowerCase();
  let m = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/.exec(t);
  if (m) return `${m[1]} ${m[2]}${m[3] ? `.${m[3]}` : ""}`;
  m = /^claude-(\d+)(?:-(\d{1,2}))?-([a-z]+)(?:-\d{8})?$/.exec(t);
  if (m) return `${m[3]} ${m[1]}${m[2] ? `.${m[2]}` : ""}`;
  m = /^claude\s+([a-z]+)\s+(\d+(?:\.\d+)?)\b/.exec(t.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1"));
  return m ? `${m[1]} ${m[2]}` : null;
}

const angkaHarga = (sel: string): number | null => {
  const m = /\$\s*([\d,]+(?:\.\d+)?)\s*\/\s*MTok/i.exec(sel);
  if (!m) return null;
  const v = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(v) && v >= 0 && v <= HARGA_MAKS ? v : null;
};

const sel = (baris: string) =>
  baris
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((x) => x.trim());

/**
 * Tabel "Model pricing" dari halaman harga (markdown) -> tarif per model. Kolom dicari dari judulnya, bukan urutan,
 * supaya kolom baru tidak membuat angka tertukar. Model dengan dua baris (mis. Haiku 5.5: prompt <= 100 ribu dan
 * > 100 ribu token) memakai baris pertama, karena prompt balasan WhatsApp jauh di bawah itu. null = tabel tidak
 * ditemukan / bentuknya berubah (daripada memakai angka yang salah).
 */
export function bacaTabelTarif(md: string): TabelTarif | null {
  const baris = md.split("\n");
  const awal = baris.findIndex((b) => /^##\s+Model pricing\s*$/i.test(b.trim()));
  if (awal < 0) return null;
  const iJudul = baris.findIndex((b, i) => i > awal && /^\s*\|/.test(b));
  if (iJudul < 0) return null;
  const judul = sel(baris[iJudul]).map((x) => x.toLowerCase());
  const kolom = (uji: RegExp) => judul.findIndex((j) => uji.test(j));
  const k = { model: kolom(/^model/), masuk: kolom(/base input/), tulis5: kolom(/5m cache write/), tulis1j: kolom(/1h cache write/), baca: kolom(/cache hit/), keluar: kolom(/^output/) };
  if (Object.values(k).some((i) => i < 0)) return null;

  const hasil: TabelTarif = {};
  for (let i = iJudul + 1; i < baris.length && /^\s*\|/.test(baris[i]); i++) {
    const s = sel(baris[i]);
    if (s.every((x) => /^:?-{3,}:?$/.test(x))) continue; // garis pemisah judul
    const kunci = kunciModel(s[k.model] ?? "");
    if (!kunci || hasil[kunci]) continue;
    const t = { masuk: angkaHarga(s[k.masuk] ?? ""), keluar: angkaHarga(s[k.keluar] ?? ""), tulisCache: angkaHarga(s[k.tulis5] ?? ""), tulisCache1j: angkaHarga(s[k.tulis1j] ?? ""), bacaCache: angkaHarga(s[k.baca] ?? "") };
    if (Object.values(t).some((v) => v === null) || !t.masuk || !t.keluar) continue;
    hasil[kunci] = t as Tarif;
  }
  return Object.keys(hasil).length >= 3 ? hasil : null;
}

/** Bentuk data tarif yang dikirim ke panel admin. */
export interface InfoTarif {
  /** resmi = baru diambil dari halaman harga; tersimpan = nilai resmi terakhir (sumber sedang gagal); cadangan = belum pernah berhasil. */
  sumber: "resmi" | "tersimpan" | "cadangan";
  /** Kapan tabel terakhir berhasil diambil (detik epoch); 0 bila cadangan. */
  diambil: number;
  /** Kapan harga terakhir terlihat berubah dibanding pengambilan sebelumnya (detik epoch); 0 bila belum pernah. */
  berubah: number;
  jumlahModel: number;
}
