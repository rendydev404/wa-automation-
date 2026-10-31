import { angka } from "./format";

/**
 * Katalog produk per nomor (fitur akun berbayar): bentuk data, blok pesan sistem untuk AI, pengurai tag kirim, dan
 * format daftar katalog. Murni tanpa I/O, jadi dipakai juga di browser dan uji. Penyimpanan ada di katalog.ts,
 * pengiriman foto ke WhatsApp di bridge.ts.
 *
 * Cara AI mengirim katalog: ia menulis jawabannya seperti biasa lalu menambahkan tag di baris paling akhir:
 *   <kirim_produk>P12,P15</kirim_produk>  -> foto + nama + harga produk itu dikirim setelah jawabannya
 *   <kirim_produk>semua</kirim_produk>    -> daftar katalog lengkap + foto produk yang tersedia
 * Tag dibuang dari teks ke pelanggan.
 */

export interface Produk {
  id: number;
  nama: string;
  /** Rupiah; null = harga tidak dicantumkan. */
  harga: number | null;
  deskripsi: string;
  tersedia: boolean;
  adaFoto: boolean;
  urutan: number;
  /** Detik epoch perubahan terakhir (penanda versi foto di dashboard). */
  diubah: number;
}

export const BATAS_KATALOG = {
  produk: 100,
  nama: 80,
  deskripsi: 400,
  /** Foto sudah diperkecil di browser (JPEG); batas ini pengaman di server. */
  fotoByte: 1_500_000,
  /** Foto yang dikirim sekaligus dalam satu balasan. */
  fotoPerBalasan: 10,
} as const;

export const MAKS_HARGA_PRODUK = 2_000_000_000;

const hargaTeks = (p: Pick<Produk, "harga">) => (p.harga === null ? "harga tanya admin" : `Rp${angka(p.harga)}`);

/**
 * Blok pesan sistem: katalog sebagai sumber fakta resmi (nama, harga, ketersediaan) plus cara mengirimnya.
 * Kosong bila katalog belum diisi.
 */
export function blokKatalog(daftar: Produk[]): string {
  if (!daftar.length) return "";
  const baris = daftar.map((p) => `[P${p.id}] ${p.nama} — ${hargaTeks(p)}${p.deskripsi ? ` — ${p.deskripsi.replace(/\s*\n\s*/g, " / ")}` : ""}${p.tersedia ? "" : " — HABIS"}${p.adaFoto ? " (ada foto)" : ""}`);
  return `<katalog_produk>
Katalog produk resmi nomor ini. Sumber fakta untuk nama produk, harga, dan ketersediaan (bila berbeda dengan bagian lain pengetahuan, ikuti katalog ini).
${baris.join("\n")}
Kamu BISA mengirim katalog ke pelanggan. Bila pelanggan minta (atau setuju dikirimi) katalog/menu/daftar produk/pricelist/foto produk, atau menanyakan produk tertentu yang ada fotonya, tulis jawabanmu seperti biasa (singkat, misalnya "Ini katalog kami ya Kak 👇") lalu di BARIS PALING AKHIR tambahkan tepat satu tag:
<kirim_produk>P12,P15</kirim_produk> untuk produk tertentu (maksimal ${BATAS_KATALOG.fotoPerBalasan}); foto, nama, dan harganya terkirim otomatis setelah jawabanmu.
<kirim_produk>semua</kirim_produk> untuk seluruh katalog; daftar lengkap + foto terkirim otomatis, jadi jangan menulis ulang seluruh daftar di jawabanmu.
Baru menawarkan ("mau aku kirimkan katalognya?") = tanpa tag; kirim setelah pelanggan mau. Hanya pakai kode P yang ada di daftar. Produk HABIS jangan ditawarkan; bila ditanya, bilang sedang habis. Tag tidak terlihat pelanggan. Dengan tag itu kamu boleh bilang "aku kirimkan fotonya ya"; tanpa tag jangan.
</katalog_produk>`;
}

export type KirimProduk = number[] | "semua";

const POLA_KIRIM = /<kirim_produk\s*>([\s\S]*?)(?:<\/kirim_produk>|$)/i;

/** Pisahkan tag kirim katalog dari jawaban AI. Kode tak dikenal diabaikan di pengirim (katalog.ts), bukan di sini. */
export function ambilKirimProduk(jawaban: string): { teks: string; produk: KirimProduk | null } {
  const m = jawaban.match(POLA_KIRIM);
  const teks = jawaban
    .replace(POLA_KIRIM, "")
    .replace(/<\/?kirim_produk[^>]*>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!m) return { teks, produk: null };
  const isi = m[1].trim().toLowerCase();
  if (/^(semua|all|katalog)$/.test(isi)) return { teks, produk: "semua" };
  const ids = [...new Set([...isi.matchAll(/p?\s*(\d{1,9})/g)].map((x) => Number(x[1])).filter((n) => n > 0))].slice(0, BATAS_KATALOG.fotoPerBalasan);
  return { teks, produk: ids.length ? ids : null };
}

/** Teks katalog lengkap yang dikirim ke pelanggan untuk tag "semua" (format WhatsApp). */
export function teksKatalog(daftar: Produk[]): string {
  const ada = daftar.filter((p) => p.tersedia);
  if (!ada.length) return "";
  return ["*Katalog produk*", ...ada.map((p, i) => `${i + 1}. *${p.nama}* — ${hargaTeks(p)}${p.deskripsi ? `\n   ${p.deskripsi.replace(/\s*\n\s*/g, " ")}` : ""}`)].join("\n");
}

/** Keterangan di bawah foto satu produk. */
export function captionProduk(p: Produk): string {
  return [`*${p.nama}*`, hargaTeks(p), p.deskripsi].filter(Boolean).join("\n");
}

/** Produk yang benar-benar dikirim untuk sebuah tag: hanya yang ada di katalog, tersedia, dan (untuk foto) ada fotonya. */
export function pilihUntukKirim(daftar: Produk[], tag: KirimProduk): { daftarTeks: boolean; foto: Produk[] } {
  if (tag === "semua") return { daftarTeks: true, foto: daftar.filter((p) => p.tersedia && p.adaFoto).slice(0, BATAS_KATALOG.fotoPerBalasan) };
  const per = new Map(daftar.map((p) => [p.id, p]));
  return { daftarTeks: false, foto: tag.map((id) => per.get(id)).filter((p): p is Produk => !!p && p.tersedia && p.adaFoto) };
}

/**
 * Untuk tag "semua": daftar katalog dikirim terpisah hanya bila jawaban AI belum menuliskannya sendiri (menyebut
 * minimal dua produk yang tersedia), supaya pelanggan tidak menerima daftar yang sama dua kali.
 */
export function perluDaftar(jawaban: string, daftar: Produk[]): boolean {
  const ada = daftar.filter((p) => p.tersedia);
  const t = jawaban.toLowerCase();
  return ada.filter((p) => t.includes(p.nama.toLowerCase())).length < Math.min(2, ada.length);
}
