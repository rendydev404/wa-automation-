/**
 * Detak aktivitas WhatsApp per nomor, di memori proses (tanpa query): kapan pesan terakhir masuk dan kapan AI terakhir
 * membalas, plus hitungan sejak proses jalan. Diisi catatStat (numbers.ts) dan dibaca poller status (/api/wa/status)
 * supaya maskot dashboard tahu AI sedang/baru saja membalas chat. Hilang saat proses dimulai ulang, dan itu disengaja:
 * angka resmi tetap di tabel stats.
 */

interface Detak {
  masuk: number;
  dibalas: number;
  /** Detik epoch pesan terakhir masuk / dibalas AI; 0 = belum ada sejak proses jalan. */
  tMasuk: number;
  tDibalas: number;
}

export interface RingkasAktivitas extends Detak {
  /** Nomor yang paling akhir aktif (masuk atau dibalas), untuk menyebut namanya. */
  nomor: number | null;
  /** Jam server (detik epoch): klien menghitung umur detak dari sini, bukan dari jamnya sendiri yang bisa meleset. */
  kini: number;
}

const g = globalThis as unknown as { __waDetak?: Map<number, Detak> };
const detak = (g.__waDetak ??= new Map());

export function catatAktivitas(numberId: number, kolom: "masuk" | "dibalas" | "gagal", n = 1): void {
  if (kolom === "gagal") return;
  let d = detak.get(numberId);
  if (!d) detak.set(numberId, (d = { masuk: 0, dibalas: 0, tMasuk: 0, tDibalas: 0 }));
  const kini = Math.floor(Date.now() / 1000);
  if (kolom === "masuk") {
    d.masuk += n;
    d.tMasuk = kini;
  } else {
    d.dibalas += n;
    d.tDibalas = kini;
  }
}

/** Gabungan detak nomor-nomor `ids` (milik satu pengguna, atau semua untuk admin). */
export function ringkasAktivitas(ids: Iterable<number>): RingkasAktivitas {
  const r: RingkasAktivitas = { masuk: 0, dibalas: 0, tMasuk: 0, tDibalas: 0, nomor: null, kini: Math.floor(Date.now() / 1000) };
  let terakhir = 0;
  for (const id of ids) {
    const d = detak.get(id);
    if (!d) continue;
    r.masuk += d.masuk;
    r.dibalas += d.dibalas;
    r.tMasuk = Math.max(r.tMasuk, d.tMasuk);
    r.tDibalas = Math.max(r.tDibalas, d.tDibalas);
    const t = Math.max(d.tMasuk, d.tDibalas);
    if (t > terakhir) [terakhir, r.nomor] = [t, id];
  }
  return r;
}
