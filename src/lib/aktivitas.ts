/**
 * Detak aktivitas WhatsApp per nomor, di memori proses (tanpa query): kapan pesan terakhir masuk, kapan AI terakhir
 * membalas, hitungan sejak proses jalan, dan nomor mana yang SEDANG mengetik (status "composing" yang benar-benar
 * dikirim ke WhatsApp, lihat wa.ts mengetik). Diisi catatStat (numbers.ts) & wa.ts, dibaca poller status
 * (/api/wa/status) dan aliran langsung (/api/wa/detak, SSE) supaya maskot dashboard tahu AI sedang membalas chat
 * di nomor milik akun itu, saat itu juga. Hilang saat proses dimulai ulang, dan itu disengaja: angka resmi tetap di
 * tabel stats.
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
  /** Nomor yang saat ini sedang mengetik balasan di WhatsApp (null = tidak ada). */
  mengetik: number | null;
  /** Jam server (detik epoch): klien menghitung umur detak dari sini, bukan dari jamnya sendiri yang bisa meleset. */
  kini: number;
}

/** Status "mengetik" yang tidak pernah dimatikan (galat di tengah jalan) dianggap basi setelah ini. */
const KETIK_BASI_DTK = 180;

/** Perubahan detak: `sesi` (mengetik) atau `numberId` (masuk/dibalas). Pendengar = aliran SSE yang sedang terbuka. */
export type UbahDetak = { sesi: string } | { numberId: number };

const g = globalThis as unknown as { __waDetak?: Map<number, Detak>; __waKetik?: Map<string, number>; __waDetakDengar?: Set<(u: UbahDetak) => void> };
const detak = (g.__waDetak ??= new Map());
/** Sesi WhatsApp yang sedang mengetik -> sejak kapan (detik epoch). */
const ketik = (g.__waKetik ??= new Map());
const pendengar = (g.__waDetakDengar ??= new Set());

function kabari(u: UbahDetak): void {
  for (const fn of pendengar) {
    try {
      fn(u);
    } catch {
      // aliran yang rusak tidak boleh mengganggu alur WhatsApp
    }
  }
}

/** Dengarkan perubahan detak (tanpa pendengar biayanya nol). Kembalikan fungsi untuk berhenti. */
export function dengarDetak(fn: (u: UbahDetak) => void): () => void {
  pendengar.add(fn);
  return () => pendengar.delete(fn);
}

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
  if (pendengar.size) kabari({ numberId });
}

/** Sesi mulai / berhenti mengetik di WhatsApp (dipanggil wa.ts hanya saat penghitung mengetiknya berganti 0 <-> 1). */
export function catatMengetik(sesi: string, nyala: boolean): void {
  if (nyala === ketik.has(sesi)) return;
  if (nyala) ketik.set(sesi, Math.floor(Date.now() / 1000));
  else ketik.delete(sesi);
  if (pendengar.size) kabari({ sesi });
}

/** Gabungan detak nomor-nomor milik satu pengguna (atau semua untuk admin). */
export function ringkasAktivitas(nomor: Iterable<{ id: number; sesi: string }>): RingkasAktivitas {
  const kini = Math.floor(Date.now() / 1000);
  const r: RingkasAktivitas = { masuk: 0, dibalas: 0, tMasuk: 0, tDibalas: 0, nomor: null, mengetik: null, kini };
  let terakhir = 0;
  let ketikSejak = 0;
  for (const { id, sesi } of nomor) {
    const k = ketik.get(sesi);
    if (k !== undefined && kini - k < KETIK_BASI_DTK && k > ketikSejak) [ketikSejak, r.mengetik] = [k, id];
    const d = detak.get(id);
    if (!d) continue;
    r.masuk += d.masuk;
    r.dibalas += d.dibalas;
    r.tMasuk = Math.max(r.tMasuk, d.tMasuk);
    r.tDibalas = Math.max(r.tDibalas, d.tDibalas);
    const t = Math.max(d.tMasuk, d.tDibalas);
    if (t > terakhir) [terakhir, r.nomor] = [t, id];
  }
  if (r.mengetik !== null) r.nomor = r.mengetik;
  return r;
}
