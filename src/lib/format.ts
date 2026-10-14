/** Pembantu tampilan murni — aman dipakai di server maupun klien. */

export function formatNomor(waId: string): string {
  if (!waId.startsWith("62")) return "+" + waId;
  const s = waId.slice(2);
  return `+62 ${s.slice(0, 3)}-${s.slice(3, 7)}-${s.slice(7)}`.replace(/-$/, "");
}

export const angka = (n: number): string => n.toLocaleString("id-ID");

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
