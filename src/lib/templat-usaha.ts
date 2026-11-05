/**
 * Bahan editor base knowledge per jenis usaha: kerangka isian singkat (kerangka), pembersih baris kerangka yang belum
 * diisi (bersihkanKerangka), dan cek kelengkapan. Hasil tulisan pengguna dirapikan AI di rapikan-knowledge.ts menjadi
 * dokumen terstruktur. Semua petunjuk bersifat umum (tanpa nama usaha, harga, atau tempat contoh) supaya tidak pernah
 * terbaca sebagai fakta. Murni (tanpa I/O): dipakai editor di browser, server, dan uji. Versi Inggris (editor di /eng)
 * memakai kerangka(jenis, "en"); pembersih & cek kelengkapan mengenali kerangka kedua bahasa.
 */

import type { Bahasa } from "./bahasa";

export interface JenisUsaha {
  label: string;
  ikon: string;
  /** Judul daftar produk (Menu, Produk, Layanan, Program). */
  istilah: string;
  /** Kata untuk transaksi (pesanan / booking / pendaftaran). */
  transaksi: string;
  /** Teks versi Inggris: label tombol, judul daftar, baris "How to ...", dan "When a customer ...". */
  en: { label: string; istilah: string; cara: string; saat: string };
}

export const JENIS_USAHA = {
  kuliner: {
    label: "Kuliner / makanan & minuman",
    ikon: "🍜",
    istilah: "MENU & HARGA",
    transaksi: "pesanan",
    en: { label: "Food & beverage", istilah: "MENU & PRICES", cara: "How to order", saat: "places an order" },
  },
  toko: {
    label: "Toko online / retail",
    ikon: "🛍️",
    istilah: "PRODUK & HARGA",
    transaksi: "pesanan",
    en: { label: "Online shop / retail", istilah: "PRODUCTS & PRICES", cara: "How to order", saat: "places an order" },
  },
  jasa: {
    label: "Jasa & servis",
    ikon: "🛠️",
    istilah: "LAYANAN & TARIF",
    transaksi: "pesanan jadwal",
    en: { label: "Services & repairs", istilah: "SERVICES & RATES", cara: "How to book a service", saat: "books a service" },
  },
  kecantikan: {
    label: "Salon, barbershop & kecantikan",
    ikon: "💇",
    istilah: "LAYANAN & HARGA",
    transaksi: "booking",
    en: { label: "Salon, barbershop & beauty", istilah: "SERVICES & PRICES", cara: "How to book", saat: "books" },
  },
  kursus: {
    label: "Kursus & pendidikan",
    ikon: "📚",
    istilah: "PROGRAM & BIAYA",
    transaksi: "pendaftaran",
    en: { label: "Courses & education", istilah: "PROGRAMS & FEES", cara: "How to register", saat: "registers" },
  },
  umum: {
    label: "Usaha lainnya",
    ikon: "🏪",
    istilah: "PRODUK / LAYANAN & HARGA",
    transaksi: "pesanan",
    en: { label: "Other business", istilah: "PRODUCTS / SERVICES & PRICES", cara: "How to order", saat: "places an order" },
  },
} as const satisfies Record<string, JenisUsaha>;

export type KunciUsaha = keyof typeof JENIS_USAHA;

/**
 * Kerangka isian sederhana untuk editor knowledge. Fakta usaha hanya diberi petunjuk umum "(contoh: ...)" yang dibuang
 * sebelum disimpan / dirapikan AI. Yang bukan fakta (gaya bahasa, data yang ditanyakan saat transaksi, kapan diserahkan
 * ke pemilik) sudah terisi saran yang boleh diubah.
 */
export function kerangka(jenis: KunciUsaha, b: Bahasa = "id"): string {
  if (b === "en") return kerangkaEn(jenis);
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

/** Kerangka versi Inggris: susunan sama, petunjuk "(example: ...)" dibuang seperti "(contoh: ...)". */
function kerangkaEn(jenis: KunciUsaha): string {
  const j = JENIS_USAHA[jenis].en;
  const istilah = j.istilah.charAt(0) + j.istilah.slice(1).toLowerCase();
  return [
    "Business name: ",
    "About the business: (example: what you sell or do, since when, what makes you stand out)",
    "Tone: casual and friendly, address customers politely (adapt to each customer)",
    "",
    `${istilah} (one per line, with price):`,
    "- (example: name, price, variant or notes)",
    "- ",
    "",
    "Opening hours: (example: days and service hours)",
    "Address: ",
    "Service / delivery area: ",
    `${j.cara}: `,
    "Payment methods: (example: bank transfer, card, cash)",
    "Delivery: ",
    "Policies (cancellation, exchange, warranty): ",
    "Current promotions: ",
    "",
    `When a customer ${j.saat}, ask for: name, their choice and quantity, address or location if needed, preferred time, payment method`,
    "",
    "Frequently asked questions:",
    "Q: ",
    "A: ",
    "",
    "Hand over to the owner when: a question isn't covered in these notes, the customer asks to talk to the owner, special requests or complaints",
  ].join("\n");
}

/**
 * Isi editor yang benar-benar berisi informasi: petunjuk "(contoh: ...)" dibuang, begitu juga baris kerangka yang
 * belum diisi ("Alamat:", "- ", "T:"). Dipakai sebelum disimpan, sebelum dirapikan AI, dan untuk cek kelengkapan.
 */
export function bersihkanKerangka(teks: string): string {
  // "Pertanyaan? → " = pertanyaan AI yang belum dijawab pengguna (lihat editor knowledge).
  const kosong = (b: string) => /^\s*[-•*]?\s*$/.test(b) || /^\s*[TJQA]:\s*$/i.test(b) || /→\s*$/.test(b);
  const b0 = teks
    .replace(/\s*\((?:contoh|example):.*$/gim, "")
    .split("\n")
    .map((b) => b.replace(/\s+$/, ""))
    .filter((b) => b === "" || !kosong(b));
  // "Label:" tanpa isi dibuang, kecuali judul daftar yang diikuti butir ("Menu & harga:" lalu "- Ayam 18rb").
  const hasil = b0.filter((b, i) => {
    if (!/^[^:\n]{1,80}:\s*$/.test(b)) return true;
    const lanjut = b0.slice(i + 1).find((x) => x.trim() !== "");
    return !!lanjut && /^\s*(?:[-•*]\s*\S|[TJQA]:\s*\S|\d+[.)]\s*\S)/i.test(lanjut);
  });
  return hasil.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Lima hal yang paling sering ditanyakan pelanggan: sudah tertulis atau belum (petunjuk untuk pengguna, bukan syarat).
 * Pola mengenali tulisan Indonesia maupun Inggris; `labelEn` = label di editor versi Inggris.
 */
export const KELENGKAPAN = [
  { kunci: "nama", label: "Nama usaha", labelEn: "Business name", pola: /(?:nama usaha|business name)\s*:\s*\S|^(?!.*:)\s*\S.{3,}/im },
  {
    kunci: "harga",
    label: "Produk & harga",
    labelEn: "Products & prices",
    pola: /(?:rp\.?\s*\d|\d+\s*(?:rb|ribu|k|jt|juta)\b|\d{1,3}(?:[.,]\d{3})+|\b\d{4,}\b|[$€£]\s*\d|\d\s*(?:usd|eur|gbp|dollars?)\b)/i,
  },
  {
    kunci: "jam",
    label: "Jam buka",
    labelEn: "Opening hours",
    pola: /\b(?:jam|buka|tutup|setiap hari|tiap hari|senin|selasa|rabu|kamis|jumat|sabtu|minggu|24 jam|open|closed|daily|every day|weekdays?|weekends?|monday|tuesday|wednesday|thursday|friday|saturday|sunday|24\/7)\b|\b\d{1,2}[.:]\d{2}\b|\b\d{1,2}\s*(?:am|pm)\b/i,
  },
  {
    kunci: "lokasi",
    label: "Alamat / area",
    labelEn: "Address / area",
    pola: /\b(?:jl\.?|jalan|alamat|kota|kab(?:upaten)?|kec(?:amatan)?|maps|area|lokasi|seluruh indonesia|online|street|avenue|road|address|city|town|nationwide|worldwide)\b/i,
  },
  {
    kunci: "bayar",
    label: "Cara pesan & bayar",
    labelEn: "How to order & pay",
    pola: /\b(?:bayar|transfer|qris|cod|rekening|tunai|cash|dana|ovo|gopay|shopeepay|e-?wallet|pay|payment|card|paypal|bank)\b/i,
  },
] as const;

/** Info usaha yang benar-benar ditulis pengguna: tanpa kerangka kosong dan tanpa baris saran bawaan (gaya bahasa,
 * data yang ditanyakan, kapan diserahkan ke pemilik). Kosong = belum ada yang bisa dirapikan. */
export function infoUsaha(teks: string): string {
  return bersihkanKerangka(teks)
    .split("\n")
    .filter((b) => !/^\s*(?:gaya bahasa|saat pelanggan|serahkan ke pemilik|tone|when a customer|hand over to the owner)\b/i.test(b))
    .join("\n")
    .trim();
}

export function cekKelengkapan(teks: string): Record<(typeof KELENGKAPAN)[number]["kunci"], boolean> {
  const t = infoUsaha(teks);
  return Object.fromEntries(KELENGKAPAN.map((k) => [k.kunci, k.pola.test(t)])) as Record<(typeof KELENGKAPAN)[number]["kunci"], boolean>;
}
