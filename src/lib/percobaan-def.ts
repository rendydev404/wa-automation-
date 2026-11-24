/**
 * Teks free trial yang sama di semua tempat (landing, LP industri, banner, kartu langganan, data GercepBot), dari aturan
 * admin (langganan.ts aturanPercobaan). Murni tanpa I/O: dipakai server maupun template LP.
 */
import type { Bahasa } from "./bahasa";

export interface RingkasPercobaan {
  balasan: number;
  ulang: "sekali" | "bulanan";
  hari: number;
  mulai: "tersambung" | "daftar";
}

/** Free trial sekali pakai sedang ditawarkan (bukan kuota gratis bulanan, bukan mati). */
export const trialAktif = (p: RingkasPercobaan | null | undefined): p is RingkasPercobaan => !!p && p.balasan > 0 && p.ulang === "sekali";

/**
 * "50 balasan AI gratis selama 3 hari, mulai saat WhatsApp tersambung" (en: "50 free AI replies for 3 days, starting
 * when WhatsApp connects"). Kuota bulanan: "... setiap bulan". Tanpa kuota: "".
 */
export function teksTrial(p: RingkasPercobaan, b: Bahasa = "id"): string {
  if (p.balasan <= 0) return "";
  const n = p.balasan.toLocaleString(b === "en" ? "en-US" : "id-ID");
  if (p.ulang === "bulanan") return b === "en" ? `${n} free AI replies every month` : `${n} balasan AI gratis setiap bulan`;
  const masa = p.hari > 0 ? (b === "en" ? ` for ${p.hari} day${p.hari === 1 ? "" : "s"}` : ` selama ${p.hari} hari`) : "";
  const mulai =
    p.hari > 0 ? (p.mulai === "daftar" ? (b === "en" ? ", starting at sign-up" : ", dihitung sejak daftar") : b === "en" ? ", starting when WhatsApp connects" : ", mulai saat WhatsApp tersambung") : "";
  return b === "en" ? `${n} free AI replies${masa}${mulai}` : `${n} balasan AI gratis${masa}${mulai}`;
}
