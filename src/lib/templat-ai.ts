import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { SLUG_LP, type SlugLp } from "./lp/def";
import { siapkanTemplat, sisaPenanda } from "./templat-ai-def";

/**
 * Baca template AI per industri (lp/prompt/<slug>.md, ikut ke build lewat outputFileTracingIncludes). Isinya hanya
 * berubah saat deploy, jadi dibaca dari disk sekali per proses.
 */
const memo = new Map<SlugLp, Promise<string>>();

export function bacaTemplat(slug: SlugLp): Promise<string> {
  let p = memo.get(slug);
  if (!p) {
    p = readFile(path.join(process.cwd(), "lp", "prompt", `${slug}.md`), "utf8").then(siapkanTemplat);
    p.catch(() => memo.delete(slug)); // gagal baca = coba lagi lain kali, jangan disimpan
    memo.set(slug, p);
  }
  return p;
}

let semuaPenanda: Promise<Set<string>> | null = null;

/** Semua penanda [...] yang ada di 10 template (mis. "[Nama Laundry]", "[isi]"). */
function penandaTemplat(): Promise<Set<string>> {
  semuaPenanda ??= Promise.all(SLUG_LP.map(bacaTemplat)).then((xs) => new Set(xs.flatMap(sisaPenanda)));
  semuaPenanda.catch(() => (semuaPenanda = null));
  return semuaPenanda;
}

/**
 * Penanda template yang belum diganti di instruksi. Sengaja hanya penanda yang PERSIS berasal dari template (plus
 * baris contoh yang diubah siapkanTemplat), bukan semua teks berkurung siku: instruksi lama milik pengguna boleh saja
 * memakai [ ... ] untuk keperluan sendiri dan tidak boleh tiba-tiba gagal disimpan.
 */
export async function penandaTersisa(instruksi: string): Promise<string[]> {
  const ada = sisaPenanda(instruksi);
  if (!ada.length) return [];
  const dariTemplat = await penandaTemplat();
  return ada.filter((x) => dariTemplat.has(x) || x.startsWith("[Contoh, ganti dengan data Anda:"));
}
