import "server-only";
import { type InfoRilis, versiSah, versiTertinggi } from "./rilis-def";
import { IMAGE_MESIN } from "./templat-mesin";

/**
 * Pusat: info rilis mesin yang ditumpangkan ke setiap lisensi (sandbox & production).
 *   - terbaru: tag semver tertinggi image di GHCR (publik, tanpa login), di-cache 30 menit di memori. Rilis baru cukup
 *     push tag `mesin-vX.Y.Z`; begitu image terbit, pusat mengetahuinya sendiri.
 *   - minimal & tenggat: .env pusat MESIN_VERSI_MINIMAL=1.0.3 dan MESIN_WAJIB_SAMPAI=2026-11-20 (tanggal atau detik epoch).
 *   - catatan: .env MESIN_CATATAN_RILIS (opsional).
 * Uji (LISENSI_MODE_UJI=1) tidak pernah menghubungi GHCR: pakai MESIN_RILIS_TERBARU bila diisi.
 */

const CACHE_MS = 30 * 60_000;
const g = globalThis as unknown as { __waRilisMesin?: { nilai: string | null; sampai: number; janji: Promise<string | null> | null } };
const st = (g.__waRilisMesin ??= { nilai: null, sampai: 0, janji: null });

/** "ghcr.io/pemilik/nama" -> "pemilik/nama" (null bila bukan GHCR). */
function repoGhcr(): string | null {
  const m = /^ghcr\.io\/([a-z0-9._-]+\/[a-z0-9._/-]+)$/i.exec(IMAGE_MESIN.trim());
  return m ? m[1].toLowerCase() : null;
}

async function ambilDariGhcr(): Promise<string | null> {
  const repo = repoGhcr();
  if (!repo) return null;
  const sinyal = () => AbortSignal.timeout(4000);
  const tok = (await (await fetch(`https://ghcr.io/token?scope=repository:${repo}:pull`, { signal: sinyal() })).json()) as { token?: string };
  if (!tok.token) return null;
  const r = await fetch(`https://ghcr.io/v2/${repo}/tags/list?n=1000`, { headers: { Authorization: `Bearer ${tok.token}` }, signal: sinyal() });
  if (!r.ok) return null;
  const j = (await r.json()) as { tags?: unknown };
  return Array.isArray(j.tags) ? versiTertinggi(j.tags.filter((t): t is string => typeof t === "string")) : null;
}

/** Versi image terbaru (cache 30 mnt; gagal = nilai terakhir yang diketahui, tidak pernah melempar). */
export async function versiMesinTerbaru(): Promise<string | null> {
  const paksa = process.env.MESIN_RILIS_TERBARU?.trim();
  if (paksa !== undefined && paksa !== "") return versiSah(paksa) ? paksa.replace(/^v/, "") : null;
  if (process.env.LISENSI_MODE_UJI === "1") return null;
  if (Date.now() < st.sampai) return st.nilai;
  st.janji ??= ambilDariGhcr()
    .then((v) => {
      if (v) st.nilai = v;
      st.sampai = Date.now() + CACHE_MS;
      return st.nilai;
    })
    .catch((e) => {
      console.warn("[rilis] gagal membaca tag image mesin:", e instanceof Error ? e.message : e);
      st.sampai = Date.now() + 5 * 60_000; // coba lagi 5 menit lagi, pakai nilai terakhir dulu
      return st.nilai;
    })
    .finally(() => {
      st.janji = null;
    });
  return st.janji;
}

/** MESIN_WAJIB_SAMPAI: "2026-11-20" (akhir hari WIB) atau detik epoch. */
function tenggat(): number | null {
  const v = process.env.MESIN_WAJIB_SAMPAI?.trim();
  if (!v) return null;
  if (/^\d{9,11}$/.test(v)) return Number(v);
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T23:59:59+07:00` : v);
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
}

/** Info rilis untuk lisensi yang sedang diterbitkan. */
export async function infoRilis(): Promise<InfoRilis> {
  const minimal = process.env.MESIN_VERSI_MINIMAL?.trim() || null;
  return {
    terbaru: await versiMesinTerbaru(),
    minimal: versiSah(minimal) ? minimal!.replace(/^v/, "") : null,
    wajib_sampai: versiSah(minimal) ? tenggat() : null,
    catatan: process.env.MESIN_CATATAN_RILIS?.trim().slice(0, 300) || null,
  };
}
