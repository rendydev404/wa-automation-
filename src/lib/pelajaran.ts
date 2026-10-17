import "server-only";
import { createHash } from "node:crypto";
import { db } from "./db";
import { pertanyaanTerakhir } from "./percakapan";

/**
 * AI belajar dari balasan manusia (pemilik nomor membalas sendiri dari HP).
 *
 * Tiap balasan manusia yang cukup berisi disimpan bersama pesan pelanggan yang dijawabnya. Saat AI
 * menjawab pelanggan mana pun di nomor yang sama, balasan admin yang paling cocok dengan pertanyaan
 * pelanggan ikut disertakan di <pengetahuan_nomor>: fakta umum di dalamnya (rekening, prosedur,
 * kebijakan) jadi sumber fakta, dan gayanya jadi contoh. Tanpa panggilan AI tambahan: murni
 * pencarian teks penuh di database, per nomor.
 *
 * Hemat: satu upsert per balasan manusia (balasan kembar = satu baris, `kali` bertambah); paling banyak
 * BATAS_PELAJARAN baris per nomor (yang paling lama tidak terpakai dibuang).
 */

export const BATAS_PELAJARAN = 500;
const MIN_KARAKTER = 20;
const MIN_KATA = 4;
const MAKS_JAWABAN = 1_200;
const MAKS_PERTANYAAN = 600;
const MAKS_DIPAKAI = 3;
const ANGGARAN_KONTEKS = 2_400;
const BATAS_DAFTAR = 20;

export interface ItemPelajaran {
  id: number;
  pertanyaan: string;
  jawaban: string;
  kali: number;
  terakhir_pada: number;
}

const g = globalThis as unknown as { __waPelajaran?: { tulis: number } };
const st = (g.__waPelajaran ??= { tulis: 0 });

const normal = (t: string): string => t.toLowerCase().replace(/\s+/g, " ").trim();

/** Balasan pendek ("ok kak", "siap", "sama-sama") tidak membawa pengetahuan apa pun. */
export function layakDipelajari(teks: string): boolean {
  const t = teks.replace(/\[Lampiran media\]/g, "").trim();
  return t.length >= MIN_KARAKTER && t.split(/\s+/).length >= MIN_KATA;
}

/** Catat satu balasan manusia. Dipanggil di latar sesudah pesannya tercatat di histori percakapan. */
export async function pelajariBalasan(d: { numberId: number; kunci: string; jawaban: string; waktu: number }): Promise<boolean> {
  const jawaban = d.jawaban.replace(/\u0000/g, "").trim().slice(0, MAKS_JAWABAN);
  if (!layakDipelajari(jawaban)) return false;
  const pertanyaan = (await pertanyaanTerakhir(d.kunci, d.waktu)).slice(0, MAKS_PERTANYAAN);
  const sidik = createHash("sha256").update(normal(jawaban)).digest("hex").slice(0, 32);
  const sql = await db();
  // Balasan yang sama ke pertanyaan lain: pertanyaan terbaru yang dipakai (lebih mungkin dicari lagi).
  await sql`
    INSERT INTO pelajaran (number_id, sidik, pertanyaan, jawaban, terakhir_pada)
    VALUES (${d.numberId}, ${sidik}, ${pertanyaan}, ${jawaban}, ${d.waktu})
    ON CONFLICT (number_id, sidik) DO UPDATE SET
      pertanyaan    = CASE WHEN EXCLUDED.pertanyaan = '' THEN pelajaran.pertanyaan ELSE EXCLUDED.pertanyaan END,
      jawaban       = EXCLUDED.jawaban,
      kali          = pelajaran.kali + 1,
      terakhir_pada = GREATEST(pelajaran.terakhir_pada, EXCLUDED.terakhir_pada)`;
  if (++st.tulis % 50 === 0) {
    await sql`
      DELETE FROM pelajaran WHERE id IN (
        SELECT id FROM pelajaran WHERE number_id = ${d.numberId}
         ORDER BY terakhir_pada DESC, id DESC OFFSET ${BATAS_PELAJARAN})`;
  }
  return true;
}

// Kata yang hampir selalu ada di chat CS dan tidak membedakan satu pertanyaan dari yang lain.
const UMUM = new Set("min admin oke okey okay baik terima kasih makasih halo hallo hai selamat pagi siang sore malam tolong mohon info".split(" "));

/** Buang kata sapaan/umum dari pesan pelanggan sebelum dijadikan kueri pencarian pelajaran. */
export function saringKueri(kueri: string): string {
  return kueri
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((k) => !UMUM.has(k))
    .join(" ");
}

/**
 * Balasan admin yang paling cocok dengan kueri (tsquery dari knowledge.kueriCari), siap disisipkan ke
 * <pengetahuan_nomor>. Kosong bila tidak ada yang cocok. Satu query: indeks unik (number_id, sidik) lalu
 * tsvector tersimpan dicocokkan langsung.
 */
export async function konteksPelajaran(numberId: number, cari: string | null): Promise<{ teks: string; n: number }> {
  if (!cari) return { teks: "", n: 0 };
  const sql = await db();
  const baris = await sql<{ pertanyaan: string; jawaban: string }[]>`
    SELECT p.pertanyaan, p.jawaban
      FROM to_tsquery('simple', ${cari}) q, pelajaran p
     WHERE p.number_id = ${numberId} AND p.cari @@ q
     ORDER BY ts_rank(p.cari, q, 1) DESC, p.kali DESC, p.terakhir_pada DESC
     LIMIT ${MAKS_DIPAKAI}`;
  const keluar: string[] = [];
  let terpakai = 0;
  for (const b of baris) {
    const isi = `${b.pertanyaan ? `Pelanggan: ${b.pertanyaan}\n` : ""}Admin: ${b.jawaban}`;
    if (terpakai + isi.length > ANGGARAN_KONTEKS && keluar.length) break;
    keluar.push(isi);
    terpakai += isi.length;
  }
  return { teks: keluar.join("\n\n"), n: keluar.length };
}

export async function jumlahPelajaran(numberId: number): Promise<number> {
  const sql = await db();
  const [r] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM pelajaran WHERE number_id = ${numberId}`;
  return r.n;
}

/** Daftar untuk dashboard, terbaru dulu, kursor (terakhir_pada, id) tanpa OFFSET. */
export async function daftarPelajaran(numberId: number, kursor?: { waktu: number; id: number }): Promise<{ daftar: ItemPelajaran[]; adaLagi: boolean }> {
  const sql = await db();
  const baris = kursor
    ? await sql<ItemPelajaran[]>`
        SELECT id, pertanyaan, jawaban, kali, terakhir_pada FROM pelajaran
         WHERE number_id = ${numberId} AND (terakhir_pada, id) < (${kursor.waktu}, ${kursor.id})
         ORDER BY terakhir_pada DESC, id DESC LIMIT ${BATAS_DAFTAR + 1}`
    : await sql<ItemPelajaran[]>`
        SELECT id, pertanyaan, jawaban, kali, terakhir_pada FROM pelajaran
         WHERE number_id = ${numberId}
         ORDER BY terakhir_pada DESC, id DESC LIMIT ${BATAS_DAFTAR + 1}`;
  const adaLagi = baris.length > BATAS_DAFTAR;
  return { daftar: adaLagi ? baris.slice(0, BATAS_DAFTAR) : [...baris], adaLagi };
}

/** Hapus satu pelajaran atau semuanya; mengembalikan jumlah yang terhapus. */
export async function hapusPelajaran(numberId: number, id?: number): Promise<number> {
  const sql = await db();
  const r =
    id === undefined
      ? await sql`DELETE FROM pelajaran WHERE number_id = ${numberId}`
      : await sql`DELETE FROM pelajaran WHERE id = ${id} AND number_id = ${numberId}`;
  return r.count;
}
