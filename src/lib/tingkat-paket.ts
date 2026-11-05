/**
 * Tingkat paket berbayar untuk lencana (components/lencana-paket.tsx): Starter = perak, Bisnis = emas, Pro = merah
 * menyala, Custom = ungu menyala. Murni tanpa I/O — dipakai server maupun browser.
 *
 * Ditentukan dari kode paket (paket.kode) yang dibeli; paket hasil kesepakatan admin tanpa paket terdaftar (paket_id
 * kosong, lihat berikanPaketManual) dihitung Custom. Paket lain buatan admin dicocokkan dari namanya, sisanya null
 * (tanpa lencana khusus).
 */

import { KODE_CUSTOM } from "./paket-custom-def";

export type Tingkat = "starter" | "bisnis" | "pro" | "custom";

export const URUTAN_TINGKAT: readonly Tingkat[] = ["starter", "bisnis", "pro", "custom"];

export function tingkatPaket(kode: string | null | undefined, nama?: string | null): Tingkat | null {
  if (kode === KODE_CUSTOM) return "custom";
  if (kode === "starter" || kode === "bisnis" || kode === "pro") return kode;
  const n = (nama ?? "").toLowerCase();
  if (/\bcustom\b|\benterprise\b/.test(n)) return "custom";
  if (/\bpro\b/.test(n)) return "pro";
  if (/\bbisnis\b|\bbusiness\b/.test(n)) return "bisnis";
  if (/\bstarter\b/.test(n)) return "starter";
  return kode == null && nama ? "custom" : null;
}
