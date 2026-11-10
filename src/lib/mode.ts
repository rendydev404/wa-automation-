/**
 * Mode jalan aplikasi. Satu basis kode, dua mode:
 *   - pusat (bawaan): chatgercep.com (landing, langganan, afiliasi, portal & panel Developer API, penerbit lisensi).
 *   - mesin (MODE=mesin): ChatGerCep self-host di server developer luar, dikendalikan lisensi dari pusat.
 * Murni (hanya membaca env), aman dipakai di mana saja termasuk proxy.
 */
export const modeMesin = (): boolean => process.env.MODE === "mesin";

/** Versi aplikasi/mesin (diisi CI saat membangun image; lokal = "dev"). */
export const VERSI_APLIKASI = process.env.VERSI_APLIKASI || "dev";

/** Alamat server pusat yang dihubungi mesin (aktivasi & cek saat menyala). */
export const alamatPusat = (): string => (process.env.CHATGERCEP_PUSAT || "https://chatgercep.com").replace(/\/+$/, "");
