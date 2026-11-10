/**
 * Peran akun. Murni (tanpa I/O): dipakai server, komponen klien, dan uji.
 *   admin     = pemilik sistem: semua panel + satu-satunya yang boleh mengatur peran & mengubah akun admin lain.
 *   developer = developer internal: semua panel admin + panel Developer API (yang tidak terlihat oleh admin), nomor
 *               tanpa batas, tetapi tidak bisa mengangkat/menurunkan peran dan tidak bisa mengubah akun admin.
 *               Portal Developer API (/developer) hanya untuk akun yang ia pilih (users.akses_api), bukan per peran.
 *   user      = pengguna biasa (termasuk developer luar pemakai API).
 */
export type Peran = "admin" | "developer" | "user";

export const SEMUA_PERAN: readonly Peran[] = ["user", "developer", "admin"];

export const peranSah = (v: unknown): v is Peran => v === "admin" || v === "developer" || v === "user";

/**
 * Staf = boleh membuka panel admin dan diperlakukan seperti admin (tanpa kuota/paket).
 * Padanannya di SQL: `peran <> 'user'` (staf) / `peran = 'user'` (bukan staf).
 */
export const staf = (peran: string | null | undefined): boolean => peran === "admin" || peran === "developer";

export const labelPeran = (peran: string | null | undefined): string => (peran === "admin" ? "Admin" : peran === "developer" ? "Developer" : "Pengguna");
