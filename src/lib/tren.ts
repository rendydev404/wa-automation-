/** Deret harian untuk grafik & sparkline — murni, aman dipakai di server maupun klien. */

export interface TitikHari {
  tanggal: string; // YYYY-MM-DD (WIB)
  label: string; // "Kam"
  labelPanjang: string; // "Kamis, 8 Okt"
  masuk: number;
  dibalas: number;
}

const HARI_MS = 86_400_000;
const fmtPendek = new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", weekday: "short" });
const fmtPanjang = new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", weekday: "long", day: "numeric", month: "short" });

/** Kunci tanggal `jumlah` hari terakhir yang berakhir di `hariIni` (YYYY-MM-DD), terlama dulu. */
export function hariTerakhir(hariIni: string, jumlah: number): string[] {
  const akhir = Date.parse(`${hariIni}T00:00:00Z`);
  return Array.from({ length: jumlah }, (_, i) => new Date(akhir - (jumlah - 1 - i) * HARI_MS).toISOString().slice(0, 10));
}

/** Jumlahkan baris statistik per tanggal; hari tanpa baris bernilai 0. */
export function deretHarian(hari: string[], baris: { tanggal: string; masuk: number; dibalas: number }[]): TitikHari[] {
  const per = new Map(hari.map((t) => [t, { masuk: 0, dibalas: 0 }]));
  for (const b of baris) {
    const t = per.get(b.tanggal);
    if (!t) continue;
    t.masuk += b.masuk;
    t.dibalas += b.dibalas;
  }
  return hari.map((t) => {
    const d = new Date(`${t}T00:00:00Z`);
    return { tanggal: t, label: fmtPendek.format(d).replace(".", ""), labelPanjang: fmtPanjang.format(d), ...per.get(t)! };
  });
}

/** Persentase bulat a dari b; null bila b nol. */
export const persen = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 100) : null);
