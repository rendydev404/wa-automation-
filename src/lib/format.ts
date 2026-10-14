/** Pembantu tampilan murni — aman dipakai di server maupun klien. */

export function formatNomor(waId: string): string {
  if (!waId.startsWith("62")) return "+" + waId;
  const s = waId.slice(2);
  return `+62 ${s.slice(0, 3)}-${s.slice(3, 7)}-${s.slice(7)}`.replace(/-$/, "");
}

export const angka = (n: number): string => n.toLocaleString("id-ID");

const fmtTanggal = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric" });

/** Detik epoch -> "13 Okt 2026" (WIB). */
export const tanggal = (detik: number): string => fmtTanggal.format(new Date(detik * 1000));

export function ukuran(byte: number): string {
  if (byte < 1024) return `${byte} B`;
  if (byte < 1024 * 1024) return `${(byte / 1024).toFixed(0)} KB`;
  return `${(byte / 1024 / 1024).toFixed(1)} MB`;
}
