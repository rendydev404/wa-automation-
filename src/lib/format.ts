/** Pembantu tampilan murni — aman dipakai di server maupun klien. Parameter `b` (bahasa) bawaannya "id". */

import { type Bahasa, LOKAL } from "./bahasa";

export function formatNomor(waId: string): string {
  if (!waId.startsWith("62")) return "+" + waId;
  const s = waId.slice(2);
  return `+62 ${s.slice(0, 3)}-${s.slice(3, 7)}-${s.slice(7)}`.replace(/-$/, "");
}

export const angka = (n: number, b: Bahasa = "id"): string => n.toLocaleString(LOKAL[b]);

const fmtRingkas = {
  id: new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }),
  en: new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }),
};

/** Angka ringkas untuk kartu KPI: 99.000 -> "99 rb", 12.480.000 -> "12,5 jt" (en: "99K", "12.5M"). Di bawah 10.000 tetap lengkap. */
export const angkaRingkas = (n: number, b: Bahasa = "id"): string => (Math.abs(n) < 10_000 ? angka(n, b) : fmtRingkas[b].format(n));

/** Rupiah ringkas: "Rp12,5 jt", "−Rp850 rb". */
export const rupiahRingkas = (n: number): string => `${n < 0 ? "−" : ""}Rp${angkaRingkas(Math.abs(n))}`;

const fmtUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUsdRingkas = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });

/**
 * Nominal Rupiah untuk ditampilkan: "Rp99.000" (id) atau perkiraan USD "$6.00" (en, memakai `kurs` Rp per 1 USD).
 * Pembayaran tetap ditagih dalam Rupiah; USD hanya tampilan.
 */
export function uang(rp: number, b: Bahasa = "id", kurs?: number): string {
  if (b !== "en" || !kurs || kurs <= 0) return `${rp < 0 ? "−" : ""}Rp${angka(Math.abs(rp))}`;
  return fmtUsd.format(rp / kurs).replace("-", "−");
}

/** Versi ringkas uang(): "Rp12,5 jt" / "$760.4K". */
export function uangRingkas(rp: number, b: Bahasa = "id", kurs?: number): string {
  if (b !== "en" || !kurs || kurs <= 0) return rupiahRingkas(rp);
  const usd = rp / kurs;
  return Math.abs(usd) < 10_000 ? uang(rp, b, kurs) : fmtUsdRingkas.format(usd).replace("-", "−");
}

/**
 * Nomor WhatsApp format bebas (0812..., +62 812-..., 62812...) dirapikan jadi digit berawalan kode negara;
 * null = format tidak dikenali.
 */
export function rapikanNomorWa(masukan: string): string | null {
  let d = masukan.replace(/[^0-9+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("0")) d = `62${d.slice(1)}`;
  else if (d.startsWith("8")) d = `62${d}`;
  return /^[1-9][0-9]{7,14}$/.test(d) ? d : null;
}

/**
 * ID grup WhatsApp (`120363041234567890@g.us` atau format lama `6281234567890-1589123456@g.us`);
 * null = bukan JID grup yang sah.
 */
export function rapikanGrupWa(masukan: string): string | null {
  const s = masukan.trim().toLowerCase();
  return /^[1-9][0-9]{4,23}(-[0-9]{5,20})?@g\.us$/.test(s) ? s : null;
}

/**
 * Tujuan kirim pesan WhatsApp: nomor pribadi (`ke` = digit kode negara, `grup: false`) atau grup WhatsApp
 * (`ke` = `...@g.us`, `grup: true`); null = format tidak sah.
 */
export function rapikanTujuanWa(masukan: string): { ke: string; grup: boolean } | null {
  const s = masukan.trim();
  if (!s) return null;
  if (s.includes("@")) {
    if (/^.+@g\.us$/i.test(s)) {
      const g = rapikanGrupWa(s);
      return g ? { ke: g, grup: true } : null;
    }
    if (/^.+@s\.whatsapp\.net$/i.test(s)) {
      const n = rapikanNomorWa(s.split("@")[0]);
      return n ? { ke: n, grup: false } : null;
    }
    return null;
  }
  const n = rapikanNomorWa(s);
  return n ? { ke: n, grup: false } : null;
}

/** Histori percakapan disimpan sekian hari; pesan yang lebih lama dihapus otomatis (lihat percakapan.ts). */
export const UMUR_HISTORI_HARI = 30;

const fmtTanggal = {
  id: new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric" }),
  en: new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric" }),
};
const fmtJam = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false });
const fmtHari = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" });

/** Detik epoch -> "13 Okt 2026" / "Oct 13, 2026" (WIB). */
export const tanggal = (detik: number, b: Bahasa = "id"): string => fmtTanggal[b].format(new Date(detik * 1000));

/** Detik epoch -> "14.30" / "14:30" (WIB). */
export const jamWib = (detik: number, b: Bahasa = "id"): string => {
  const s = fmtJam.format(new Date(detik * 1000));
  return b === "en" ? s.replace(".", ":") : s.replace(":", ".");
};

/** Kunci tanggal WIB "YYYY-MM-DD" untuk mengelompokkan gelembung chat per hari. */
export const kunciHariWib = (detik: number): string => fmtHari.format(new Date(detik * 1000));

/** Detik epoch -> jam bila hari yang sama di WIB, atau tanggal singkat bila beda hari. */
export function waktuSingkatWib(detik: number, kiniDetik?: number, b: Bahasa = "id"): string {
  const acuan = kiniDetik ?? Math.floor(Date.now() / 1000);
  if (kunciHariWib(detik) === kunciHariWib(acuan)) return jamWib(detik, b);
  return tanggal(detik, b);
}

export function ukuran(byte: number): string {
  if (byte < 1024) return `${byte} B`;
  if (byte < 1024 * 1024) return `${(byte / 1024).toFixed(0)} KB`;
  return `${(byte / 1024 / 1024).toFixed(1)} MB`;
}
