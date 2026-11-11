/**
 * Rolling release mesin self-host (sandbox & production sama). Pusat menumpangkan info rilis di lisensi bertanda tangan
 * (tanpa polling: lisensi tiba saat mesin menyala, lewat webhook perpanjangan production, atau "Perbarui lisensi").
 * Mesin membandingkan dengan versinya sendiri lalu memberi tahu lewat API, header, dan log. Murni, tanpa I/O.
 */

/** Info rilis di lisensi. Tidak ada = pusat lama (tanpa info rilis). */
export interface InfoRilis {
  /** Versi image stabil terbaru, mis. "1.0.3"; null = belum diketahui. */
  terbaru: string | null;
  /** Versi minimal yang masih dilayani; null = tidak ada update wajib. */
  minimal: string | null;
  /** Detik epoch: lewat dari ini, mesin di bawah `minimal` menolak API (426). null = belum ada tenggat. */
  wajib_sampai: number | null;
  /** Catatan rilis singkat (opsional). */
  catatan: string | null;
}

/** Perintah update untuk pemilik mesin (data & nomor WhatsApp tetap, migrasi otomatis). */
export const PERINTAH_UPDATE = "docker compose pull && docker compose up -d";

const urai = (v: string | null | undefined): number[] | null => {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec((v ?? "").trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};

/** Versi semver sah (x.y.z)? */
export const versiSah = (v: string | null | undefined): boolean => urai(v) !== null;

/** -1 bila a < b, 0 sama, 1 bila a > b. Versi tak sah (mis. "dev") = null: tidak bisa dibandingkan. */
export function bandingVersi(a: string | null | undefined, b: string | null | undefined): -1 | 0 | 1 | null {
  const x = urai(a);
  const y = urai(b);
  if (!x || !y) return null;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

/** Versi tertinggi dari daftar tag (abaikan tag non-semver seperti "stable", "1.0", "uji-…"). */
export function versiTertinggi(tag: readonly string[]): string | null {
  let top: string | null = null;
  for (const t of tag) if (versiSah(t) && (top === null || bandingVersi(t, top) === 1)) top = t.replace(/^v/, "");
  return top;
}

export interface StatusUpdate {
  /** Ada versi lebih baru dari versi mesin ini. */
  tersedia: boolean;
  versi_kini: string;
  versi_terbaru: string | null;
  versi_minimal: string | null;
  /** Versi mesin di bawah versi minimal. */
  wajib: boolean;
  wajib_sampai: number | null;
  /** Wajib & tenggat lewat: API menolak dengan 426 update_wajib (WhatsApp tetap tersambung). */
  terblokir: boolean;
  catatan: string | null;
  perintah: string | null;
}

/** Status update mesin berversi `kini` terhadap info rilis di lisensi. Versi "dev"/tak sah tidak pernah diblokir. */
export function statusUpdate(kini: string, r: InfoRilis | null | undefined, sekarangDetik: number): StatusUpdate {
  const tersedia = !!r?.terbaru && bandingVersi(kini, r.terbaru) === -1;
  const wajib = !!r?.minimal && bandingVersi(kini, r.minimal) === -1;
  const wajibSampai = wajib ? (r?.wajib_sampai ?? null) : null;
  return {
    tersedia,
    versi_kini: kini,
    versi_terbaru: r?.terbaru ?? null,
    versi_minimal: r?.minimal ?? null,
    wajib,
    wajib_sampai: wajibSampai,
    terblokir: wajib && wajibSampai !== null && sekarangDetik >= wajibSampai,
    catatan: tersedia || wajib ? (r?.catatan ?? null) : null,
    perintah: tersedia || wajib ? PERINTAH_UPDATE : null,
  };
}
