/**
 * Bahan editor base knowledge per jenis usaha: kerangka isian singkat (kerangka), pembersih baris kerangka yang belum
 * diisi (bersihkanKerangka), dan cek kelengkapan. Hasil tulisan pengguna dirapikan AI di rapikan-knowledge.ts menjadi
 * dokumen terstruktur. Semua petunjuk bersifat umum (tanpa nama usaha, harga, atau tempat contoh) supaya tidak pernah
 * terbaca sebagai fakta. Murni (tanpa I/O): dipakai editor di browser, server, dan uji.
 */

export interface JenisUsaha {
  label: string;
  ikon: string;
  /** Judul daftar produk (Menu, Produk, Layanan, Program). */
  istilah: string;
  /** Kata untuk transaksi (pesanan / booking / pendaftaran). */
  transaksi: string;
}

export const JENIS_USAHA = {
  kuliner: { label: "Kuliner / makanan & minuman", ikon: "🍜", istilah: "MENU & HARGA", transaksi: "pesanan" },
  toko: { label: "Toko online / retail", ikon: "🛍️", istilah: "PRODUK & HARGA", transaksi: "pesanan" },
  jasa: { label: "Jasa & servis", ikon: "🛠️", istilah: "LAYANAN & TARIF", transaksi: "pesanan jadwal" },
  kecantikan: { label: "Salon, barbershop & kecantikan", ikon: "💇", istilah: "LAYANAN & HARGA", transaksi: "booking" },
  kursus: { label: "Kursus & pendidikan", ikon: "📚", istilah: "PROGRAM & BIAYA", transaksi: "pendaftaran" },
  umum: { label: "Usaha lainnya", ikon: "🏪", istilah: "PRODUK / LAYANAN & HARGA", transaksi: "pesanan" },
} as const satisfies Record<string, JenisUsaha>;

export type KunciUsaha = keyof typeof JENIS_USAHA;

/**
 * Kerangka isian sederhana untuk editor knowledge. Fakta usaha hanya diberi petunjuk umum "(contoh: ...)" yang dibuang
 * sebelum disimpan / dirapikan AI. Yang bukan fakta (gaya bahasa, data yang ditanyakan saat transaksi, kapan diserahkan
 * ke pemilik) sudah terisi saran yang boleh diubah.
 */
export function kerangka(jenis: KunciUsaha): string {
  const j = JENIS_USAHA[jenis];
  const istilah = j.istilah.charAt(0) + j.istilah.slice(1).toLowerCase();
  return [
    "Nama usaha: ",
    "Tentang usaha: (contoh: apa yang dijual atau dikerjakan, sejak kapan, keunggulan)",
    'Gaya bahasa: santai dan ramah, panggil pelanggan "Kak"/"Kakak" (menyesuaikan pelanggan)',
    "",
    `${istilah} (satu per baris, dengan harga):`,
    "- (contoh: nama, harga, varian atau keterangan)",
    "- ",
    "",
    "Jam buka: (contoh: hari dan jam layanan)",
    "Alamat: ",
    "Area layanan / pengiriman: ",
    `Cara ${j.transaksi}: `,
    "Cara bayar: (contoh: transfer bank, QRIS, tunai)",
    "Pengiriman: ",
    "Kebijakan (pembatalan, penukaran, garansi): ",
    "Promo yang sedang berlaku: ",
    "",
    `Saat pelanggan ${j.transaksi === "pendaftaran" ? "mendaftar" : j.transaksi === "booking" ? "booking" : "memesan"}, tanyakan: nama, pilihan beserta jumlahnya, alamat atau lokasi bila perlu, waktu yang diinginkan, cara bayar`,
    "",
    "Pertanyaan yang sering ditanya:",
    "T: ",
    "J: ",
    "",
    "Serahkan ke pemilik bila: pertanyaan yang tidak ada di catatan ini, pelanggan minta bicara dengan pemilik, permintaan khusus atau keluhan",
  ].join("\n");
}

/**
 * Isi editor yang benar-benar berisi informasi: petunjuk "(contoh: ...)" dibuang, begitu juga baris kerangka yang
 * belum diisi ("Alamat:", "- ", "T:"). Dipakai sebelum disimpan, sebelum dirapikan AI, dan untuk cek kelengkapan.
 */
export function bersihkanKerangka(teks: string): string {
  // "Pertanyaan? → " = pertanyaan AI yang belum dijawab pengguna (lihat editor knowledge).
  const kosong = (b: string) => /^\s*[-•*]?\s*$/.test(b) || /^\s*[TJ]:\s*$/i.test(b) || /→\s*$/.test(b);
  const b0 = teks
    .replace(/\s*\(contoh:.*$/gim, "")
    .split("\n")
    .map((b) => b.replace(/\s+$/, ""))
    .filter((b) => b === "" || !kosong(b));
  // "Label:" tanpa isi dibuang, kecuali judul daftar yang diikuti butir ("Menu & harga:" lalu "- Ayam 18rb").
  const hasil = b0.filter((b, i) => {
    if (!/^[^:\n]{1,80}:\s*$/.test(b)) return true;
    const lanjut = b0.slice(i + 1).find((x) => x.trim() !== "");
    return !!lanjut && /^\s*(?:[-•*]\s*\S|[TJ]:\s*\S|\d+[.)]\s*\S)/i.test(lanjut);
  });
  return hasil.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Lima hal yang paling sering ditanyakan pelanggan: sudah tertulis atau belum (petunjuk untuk pengguna, bukan syarat). */
export const KELENGKAPAN = [
  { kunci: "nama", label: "Nama usaha", pola: /nama usaha\s*:\s*\S|^(?!.*:)\s*\S.{3,}/im },
  { kunci: "harga", label: "Produk & harga", pola: /(?:rp\.?\s*\d|\d+\s*(?:rb|ribu|k|jt|juta)\b|\d{1,3}(?:[.,]\d{3})+|\b\d{4,}\b)/i },
  { kunci: "jam", label: "Jam buka", pola: /\b(?:jam|buka|tutup|setiap hari|tiap hari|senin|selasa|rabu|kamis|jumat|sabtu|minggu|24 jam)\b|\b\d{1,2}[.:]\d{2}\b/i },
  { kunci: "lokasi", label: "Alamat / area", pola: /\b(?:jl\.?|jalan|alamat|kota|kab(?:upaten)?|kec(?:amatan)?|maps|area|lokasi|seluruh indonesia|online)\b/i },
  { kunci: "bayar", label: "Cara pesan & bayar", pola: /\b(?:bayar|transfer|qris|cod|rekening|tunai|cash|dana|ovo|gopay|shopeepay|e-?wallet)\b/i },
] as const;

/** Info usaha yang benar-benar ditulis pengguna: tanpa kerangka kosong dan tanpa baris saran bawaan (gaya bahasa,
 * data yang ditanyakan, kapan diserahkan ke pemilik). Kosong = belum ada yang bisa dirapikan. */
export function infoUsaha(teks: string): string {
  return bersihkanKerangka(teks)
    .split("\n")
    .filter((b) => !/^\s*(?:gaya bahasa|saat pelanggan|serahkan ke pemilik)\b/i.test(b))
    .join("\n")
    .trim();
}

export function cekKelengkapan(teks: string): Record<(typeof KELENGKAPAN)[number]["kunci"], boolean> {
  const t = infoUsaha(teks);
  return Object.fromEntries(KELENGKAPAN.map((k) => [k.kunci, k.pola.test(t)])) as Record<(typeof KELENGKAPAN)[number]["kunci"], boolean>;
}
