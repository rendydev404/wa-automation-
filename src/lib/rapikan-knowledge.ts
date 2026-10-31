import "server-only";
import { randomBytes } from "node:crypto";
import { tanyaHermes } from "./hermes";
import { periksaJawaban } from "./pemeriksa";
import { JENIS_USAHA, type KunciUsaha, bersihkanKerangka, infoUsaha } from "./templat-usaha";

/**
 * Asisten penulis base knowledge: tulisan bebas pemilik usaha (atau dokumen lama) disusun ulang oleh AI (Hermes)
 * menjadi dokumen terstruktur yang mudah dipakai AI CS, plus daftar info penting yang belum ada. AI hanya boleh
 * merapikan; angka/tautan yang tidak ada di tulisan asli ditandai untuk diperiksa pengguna sebelum disimpan.
 */

export const BATAS_RAPIKAN = { min: 20, maks: 15_000 } as const;

export interface HasilRapikan {
  /** Tulisan asli setelah dibersihkan dari kerangka kosong (untuk kembali mengedit). */
  asli: string;
  teks: string;
  /** Pertanyaan singkat untuk info penting yang belum ditulis pemilik. */
  kurang: string[];
  /** Angka/nomor/tautan di hasil yang tidak ada di tulisan asli (kemungkinan dikarang AI). */
  peringatan: string[];
}

export class GalatRapikan extends Error {}

export function sistemRapikan(jenis: KunciUsaha | null): string {
  const j = jenis ? JENIS_USAHA[jenis] : null;
  const istilah = j?.istilah ?? "PRODUK / LAYANAN & HARGA";
  const transaksi = (j?.transaksi ?? "pesanan").toUpperCase();
  return `Kamu editor "base knowledge": catatan resmi yang dibaca asisten AI saat membalas chat WhatsApp pelanggan sebuah usaha. Dalam tugas ini kamu TIDAK sedang membalas pelanggan.
Pemilik usaha menulis catatannya dengan bahasa bebas (bisa berantakan, singkatan, salah ketik). Susun ulang menjadi dokumen yang rapi, jelas, dan terstruktur.${j ? `\nJenis usaha: ${j.label}.` : ""}

ATURAN MUTLAK
1. Pakai HANYA fakta yang ditulis pemilik. Jangan menambah atau menebak produk, harga, jam, alamat, nomor rekening/telepon, tautan, promo, ongkir, stok, atau kebijakan.
2. Jangan mengubah angka. Tulis harga lengkap dengan format Rp dan titik ribuan ("18rb" -> "Rp18.000", "1,5jt" -> "Rp1.500.000"). Produk tanpa harga: tulis "harga ditanyakan ke pemilik".
3. Perbaiki ejaan dan susunan kalimat; satu info per baris; bahasa Indonesia yang jelas.
4. Bagian yang informasinya tidak ada: jangan ditulis (kecuali PERAN & GAYA BAHASA dan PROMO, lihat format).
5. Info penting yang belum ada (mis. jam buka, alamat/area, cara bayar, harga yang kosong): tulis sebagai pertanyaan singkat untuk pemilik di <kurang>, paling banyak 5. Tidak ada yang kurang: <kurang></kurang> kosong.
6. Jangan menulis apa pun di luar dua tag di bawah.

FORMAT JAWABAN
<knowledge>
# PERAN & GAYA BAHASA
Kamu membalas chat WhatsApp untuk (nama usaha) seperti CS yang ramah dari tim (nama usaha). (Gaya bahasa dari pemilik; bila tidak disebut: santai dan sopan, panggil pelanggan "Kak"/"Kakak" dan sesuaikan bila pelanggan memakai sapaan lain.) Jawaban singkat, 1-4 kalimat.
# TENTANG USAHA
# ${istilah}
- (nama): (harga) (keterangan bila ada)
Ini harga resmi: sebutkan persis seperti tertulis, jangan memberi diskon atau menghitung total sendiri.
# JAM BUKA
# LOKASI
# CARA ${transaksi}
# DATA ${transaksi} YANG WAJIB DITANYAKAN
- (satu data per baris)
# PEMBAYARAN
# PENGIRIMAN
# KEBIJAKAN
# PROMO
(promo dari pemilik; bila tidak ada: "Tidak ada promo saat ini. Jangan menawarkan diskon.")
# PERTANYAAN YANG SERING DITANYA
T: ...
J: ...
# SERAHKAN KE PEMILIK
- (satu hal per baris)
</knowledge>
<kurang>
- (pertanyaan singkat)
</kurang>`;
}

/** Pisahkan dokumen dan daftar kekurangan dari jawaban AI. null = jawaban tidak berbentuk dokumen. */
export function uraiRapikan(jawaban: string): { teks: string; kurang: string[] } | null {
  const k = jawaban.match(/<knowledge>([\s\S]*?)(?:<\/knowledge>|$)/i);
  const kr = jawaban.match(/<kurang>([\s\S]*?)(?:<\/kurang>|$)/i);
  const isi = (k ? k[1] : jawaban.replace(/<kurang>[\s\S]*$/i, ""))
    .replace(/<\/?(?:knowledge|kurang)>/gi, "")
    .replace(/^```\w*\s*|```\s*$/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  // Tanpa tag, jawaban baru dianggap dokumen bila tersusun per bagian ("# JUDUL").
  if (!isi || (!k && !/^#\s+\S/m.test(isi))) return null;
  const kurang = (kr?.[1] ?? "")
    .split("\n")
    .map((b) => b.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, "").trim())
    .filter((b) => b.length > 3)
    .slice(0, 5);
  return { teks: isi, kurang };
}

/** Angka/nomor/tautan di hasil yang tidak ada di tulisan asli: dipakai pemeriksa jawaban yang sama dengan balasan WA. */
export function angkaBaru(hasil: string, asli: string): string[] {
  const p = periksaJawaban(hasil, asli).find((x) => x.jenis === "angka");
  return p ? p.kutipan.split(", ").slice(0, 8).map((x) => x.replace(/^nominal /, "Rp").replace(/^(nomor|tautan|akun\/situs) /, "")) : [];
}

export async function rapikanKnowledge(o: { teks: string; jenis: KunciUsaha | null; userId: number }): Promise<HasilRapikan> {
  const asli = bersihkanKerangka(o.teks);
  if (infoUsaha(asli).length < BATAS_RAPIKAN.min) throw new GalatRapikan("Tulis dulu sedikit tentang usaha Anda (nama, produk & harga, jam buka) sebelum dirapikan.");
  if (asli.length > BATAS_RAPIKAN.maks) throw new GalatRapikan(`Tulisan terlalu panjang untuk dirapikan sekaligus (maks ${BATAS_RAPIKAN.maks.toLocaleString("id-ID")} karakter). Pecah jadi beberapa dokumen.`);
  // Sesi baru tiap permintaan: tulisan pengguna tidak tercampur dengan riwayat percakapan mana pun.
  const j = await tanyaHermes({
    sessionId: `rapikan-${o.userId}-${randomBytes(6).toString("hex")}`,
    sistem: sistemRapikan(o.jenis),
    pesan: `Catatan pemilik usaha (rapikan sesuai aturan):\n"""\n${asli}\n"""`,
    timeoutMs: 110_000,
  });
  const u = uraiRapikan(j.teks);
  if (!u) throw new GalatRapikan("AI belum berhasil merapikan tulisan ini. Coba lagi.");
  return { asli, ...u, peringatan: angkaBaru(u.teks, asli) };
}
