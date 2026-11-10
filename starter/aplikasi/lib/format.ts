const TANGGAL_JAM = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });
const JAM = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

/** Detik epoch -> "10 Nov 2026, 14.05" (WIB). */
export const tanggalJam = (detik: number | null | undefined): string => (detik ? TANGGAL_JAM.format(new Date(detik * 1000)) : "-");
/** Detik epoch -> "14.05" (WIB). */
export const jam = (detik: number): string => JAM.format(new Date(detik * 1000));

/** Nilai pertama dari parameter query (Next memberi string | string[] | undefined). */
export function satu(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s?.trim() || undefined;
}

/** Susun tautan dengan parameter query; nilai kosong dilewati. */
export function tautan(jalur: string, query: Record<string, string | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `${jalur}?${s}` : jalur;
}

export type ParamCari = Promise<Record<string, string | string[] | undefined>>;
