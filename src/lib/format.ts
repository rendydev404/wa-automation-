/** Pembantu tampilan murni — aman dipakai di server maupun klien. */

export function formatNomor(waId: string): string {
  if (!waId.startsWith("62")) return "+" + waId;
  const s = waId.slice(2);
  return `+62 ${s.slice(0, 3)}-${s.slice(3, 7)}-${s.slice(7)}`.replace(/-$/, "");
}

export const angka = (n: number): string => n.toLocaleString("id-ID");

const fmtRingkas = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });

/** Angka ringkas untuk kartu KPI: 99.000 -> "99 rb", 12.480.000 -> "12,5 jt". Di bawah 10.000 tetap lengkap. */
export const angkaRingkas = (n: number): string => (Math.abs(n) < 10_000 ? angka(n) : fmtRingkas.format(n));

/** Rupiah ringkas: "Rp12,5 jt", "−Rp850 rb". */
export const rupiahRingkas = (n: number): string => `${n < 0 ? "−" : ""}Rp${angkaRingkas(Math.abs(n))}`;

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

/** Histori percakapan disimpan sekian hari; pesan yang lebih lama dihapus otomatis (lihat percakapan.ts). */
export const UMUR_HISTORI_HARI = 30;

const fmtTanggal = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric" });
const fmtJam = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false });
const fmtHari = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" });

/** Detik epoch -> "13 Okt 2026" (WIB). */
export const tanggal = (detik: number): string => fmtTanggal.format(new Date(detik * 1000));

/** Detik epoch -> "14.30" (WIB). */
export const jamWib = (detik: number): string => fmtJam.format(new Date(detik * 1000)).replace(":", ".");

/** Kunci tanggal WIB "YYYY-MM-DD" untuk mengelompokkan gelembung chat per hari. */
export const kunciHariWib = (detik: number): string => fmtHari.format(new Date(detik * 1000));

/** Detik epoch -> jam bila hari yang sama di WIB, atau tanggal singkat bila beda hari. */
export function waktuSingkatWib(detik: number, kiniDetik?: number): string {
  const acuan = kiniDetik ?? Math.floor(Date.now() / 1000);
  if (kunciHariWib(detik) === kunciHariWib(acuan)) return jamWib(detik);
  return tanggal(detik);
}

export function ukuran(byte: number): string {
  if (byte < 1024) return `${byte} B`;
  if (byte < 1024 * 1024) return `${(byte / 1024).toFixed(0)} KB`;
  return `${(byte / 1024 / 1024).toFixed(1)} MB`;
}
