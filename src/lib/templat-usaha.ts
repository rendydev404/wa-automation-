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
  /** Baris isian khusus jenis usaha ini (setelah alamat & area), mis. antar-jemput laundry atau syarat sewa mobil. */
  ekstra: readonly string[];
  /** Data yang ditanyakan AI saat pelanggan bertransaksi. */
  tanya: string;
  /** Tambahan alasan menyerahkan chat ke pemilik (mis. pertanyaan medis di klinik). */
  serahkan?: string;
  /** Teks versi Inggris: label tombol, judul daftar, baris "How to ...", "When a customer ...", isian & data yang ditanyakan. */
  en: { label: string; istilah: string; cara: string; saat: string; ekstra: readonly string[]; tanya: string; serahkan?: string };
}

/**
 * Jenis usaha = 10 industri landing page (/toko-online, /laundry, ...; kunci = slug LP, urutan sama) ditambah kuliner
 * (rumah makan, kafe) dan usaha lainnya. Kunci slug dipakai juga untuk memilih otomatis jenis usaha pengunjung yang
 * datang dari LP (localStorage cg_industry).
 */
export const JENIS_USAHA = {
  "toko-online": {
    label: "Toko online / olshop",
    ikon: "🛍️",
    istilah: "PRODUK & HARGA",
    transaksi: "pesanan",
    ekstra: ["Varian & stok: (contoh: ukuran, warna, cara cek stok)", "Ongkir & ekspedisi: ", "Penukaran / retur: "],
    tanya: "nama, produk beserta varian (ukuran/warna) dan jumlahnya, alamat lengkap untuk ongkir, ekspedisi pilihan, cara bayar",
    en: {
      label: "Online store",
      istilah: "PRODUCTS & PRICES",
      cara: "How to order",
      saat: "places an order",
      ekstra: ["Variants & stock: (example: sizes, colors, how to check stock)", "Shipping & couriers: ", "Exchanges / returns: "],
      tanya: "name, product with variant (size/color) and quantity, full address for shipping, preferred courier, payment method",
    },
  },
  laundry: {
    label: "Laundry",
    ikon: "🧺",
    istilah: "LAYANAN & HARGA",
    transaksi: "pesanan",
    ekstra: ["Antar-jemput: (contoh: area, biaya, jam kurir)", "Estimasi selesai: (contoh: reguler dan express)", "Jenis cucian yang tidak diterima: "],
    tanya: "nama, jenis layanan dan perkiraan berat atau jumlah cucian, alamat dan jam jemput bila antar-jemput, kapan perlu selesai, cara bayar",
    serahkan: "keluhan cucian rusak, luntur, atau hilang",
    en: {
      label: "Laundry",
      istilah: "SERVICES & PRICES",
      cara: "How to order",
      saat: "places an order",
      ekstra: ["Pickup & delivery: (example: area, fee, courier hours)", "Turnaround time: (example: regular and express)", "Items not accepted: "],
      tanya: "name, service and estimated weight or number of items, pickup address and time if needed, when they need it back, payment method",
      serahkan: "complaints about damaged, faded, or lost items",
    },
  },
  "klinik-kecantikan": {
    label: "Klinik kecantikan / salon",
    ikon: "💆",
    istilah: "TREATMENT & HARGA",
    transaksi: "booking",
    ekstra: ["Dokter / terapis & jadwal praktik: ", "Konsultasi: (contoh: gratis atau berbayar, online atau di klinik)", "Persiapan sebelum treatment: "],
    tanya: "nama, treatment yang diminati, keluhan atau kondisi kulit singkat, tanggal dan jam yang diinginkan, cabang bila ada beberapa",
    serahkan: "pertanyaan medis, efek samping, atau kondisi kulit khusus",
    en: {
      label: "Beauty clinic / salon",
      istilah: "TREATMENTS & PRICES",
      cara: "How to book",
      saat: "books",
      ekstra: ["Doctors / therapists & schedule: ", "Consultation: (example: free or paid, online or in clinic)", "Preparation before treatment: "],
      tanya: "name, treatment of interest, brief skin concern, preferred date and time, branch if there are several",
      serahkan: "medical questions, side effects, or special skin conditions",
    },
  },
  "rental-mobil": {
    label: "Rental mobil",
    ikon: "🚗",
    istilah: "UNIT & HARGA SEWA",
    transaksi: "booking",
    ekstra: ["Pilihan sewa: (contoh: lepas kunci atau dengan sopir, BBM, tol, parkir)", "Syarat sewa: (contoh: KTP, SIM, deposit)", "Antar-jemput unit & pemakaian luar kota: "],
    tanya: "nama, unit yang diinginkan, tanggal dan jam ambil serta kembali, lepas kunci atau dengan sopir, tujuan atau area pemakaian",
    en: {
      label: "Car rental",
      istilah: "CARS & RENTAL RATES",
      cara: "How to book",
      saat: "books",
      ekstra: ["Rental options: (example: self-drive or with driver, fuel, tolls, parking)", "Rental requirements: (example: ID, driving license, deposit)", "Car delivery & out-of-town use: "],
      tanya: "name, car wanted, pickup and return date and time, self-drive or with driver, destination or area of use",
    },
  },
  "maklon-kosmetik": {
    label: "Maklon kosmetik",
    ikon: "🧴",
    istilah: "LAYANAN & KISARAN BIAYA",
    transaksi: "konsultasi",
    ekstra: ["Minimal order (MOQ): ", "Alur & lama produksi: ", "Legalitas yang dibantu: (contoh: notifikasi BPOM, halal, merek)"],
    tanya: "nama dan nama brand, jenis produk, target jumlah produksi, perkiraan budget, sudah punya formula atau belum",
    serahkan: "permintaan penawaran harga final atau formula khusus",
    en: {
      label: "Cosmetics OEM",
      istilah: "SERVICES & COST RANGE",
      cara: "How to start a consultation",
      saat: "asks for a consultation",
      ekstra: ["Minimum order (MOQ): ", "Production flow & lead time: ", "Licensing support: (example: product registration, halal, trademark)"],
      tanya: "name and brand name, product type, target production quantity, estimated budget, whether they already have a formula",
      serahkan: "requests for a final quote or a custom formula",
    },
  },
  bengkel: {
    label: "Bengkel",
    ikon: "🔧",
    istilah: "LAYANAN SERVIS & HARGA",
    transaksi: "booking servis",
    ekstra: ["Kendaraan yang ditangani: (contoh: motor, mobil, merek tertentu)", "Garansi servis: ", "Servis panggilan / derek: "],
    tanya: "nama, jenis dan tahun kendaraan, keluhan atau servis yang diinginkan, tanggal dan jam datang",
    serahkan: "permintaan diagnosa kerusakan atau estimasi biaya perbaikan besar",
    en: {
      label: "Auto repair shop",
      istilah: "SERVICES & PRICES",
      cara: "How to book a service",
      saat: "books a service",
      ekstra: ["Vehicles handled: (example: motorbikes, cars, specific brands)", "Service warranty: ", "Mobile service / towing: "],
      tanya: "name, vehicle type and year, problem or service wanted, preferred date and time",
      serahkan: "requests to diagnose a fault or estimate a major repair",
    },
  },
  distributor: {
    label: "Distributor / grosir",
    ikon: "📦",
    istilah: "PRODUK & HARGA GROSIR",
    transaksi: "pesanan",
    ekstra: ["Minimal order & harga bertingkat: ", "Area kirim & ongkir: ", "Syarat reseller / agen: "],
    tanya: "nama dan nama toko, produk beserta jumlahnya, alamat kirim, jadwal kirim yang diinginkan, cara bayar (tunai atau tempo)",
    serahkan: "permintaan harga khusus, tempo pembayaran, atau kerja sama agen",
    en: {
      label: "Distributor / wholesale",
      istilah: "PRODUCTS & WHOLESALE PRICES",
      cara: "How to order",
      saat: "places an order",
      ekstra: ["Minimum order & tiered pricing: ", "Delivery area & fees: ", "Reseller / agent requirements: "],
      tanya: "name and store name, products and quantity, delivery address, preferred delivery date, payment method (cash or credit terms)",
      serahkan: "requests for special pricing, payment terms, or agent partnerships",
    },
  },
  "travel-umrah": {
    label: "Travel umrah",
    ikon: "🕋",
    istilah: "PAKET & HARGA",
    transaksi: "pendaftaran",
    ekstra: ["Jadwal keberangkatan & sisa kursi: ", "Fasilitas paket: (contoh: hotel, maskapai, durasi, muthawif)", "Izin travel (PPIU) & alamat kantor: ", "Syarat dokumen: (contoh: paspor, vaksin, foto)"],
    tanya: "nama, jumlah jamaah, paket dan bulan keberangkatan, kota keberangkatan, sudah punya paspor atau belum",
    en: {
      label: "Umrah travel",
      istilah: "PACKAGES & PRICES",
      cara: "How to register",
      saat: "registers",
      ekstra: ["Departure dates & seats left: ", "Package facilities: (example: hotel, airline, duration, guide)", "Travel license & office address: ", "Required documents: (example: passport, vaccine, photo)"],
      tanya: "name, number of pilgrims, package and departure month, departure city, whether they already have a passport",
    },
  },
  catering: {
    label: "Catering",
    ikon: "🍱",
    istilah: "MENU & HARGA",
    transaksi: "pesanan",
    ekstra: ["Minimal order & batas waktu pesan: (contoh: minimal porsi, pesan berapa hari sebelumnya)", "Area antar & ongkir: ", "DP & pelunasan: "],
    tanya: "nama, menu atau paket beserta jumlah porsi, tanggal dan jam acara, alamat antar, cara bayar dan DP",
    en: {
      label: "Catering",
      istilah: "MENU & PRICES",
      cara: "How to order",
      saat: "places an order",
      ekstra: ["Minimum order & lead time: (example: minimum portions, days in advance)", "Delivery area & fees: ", "Deposit & final payment: "],
      tanya: "name, menu or package and number of portions, event date and time, delivery address, payment method and deposit",
    },
  },
  "kursus-les": {
    label: "Kursus & les",
    ikon: "📚",
    istilah: "PROGRAM & BIAYA",
    transaksi: "pendaftaran",
    ekstra: ["Jadwal & durasi kelas: ", "Metode belajar: (contoh: offline, online, privat ke rumah)", "Kelas uji coba: "],
    tanya: "nama siswa, usia atau kelas, program yang diminati, jadwal yang cocok, offline atau online",
    en: {
      label: "Courses & tutoring",
      istilah: "PROGRAMS & FEES",
      cara: "How to register",
      saat: "registers",
      ekstra: ["Class schedule & duration: ", "Learning method: (example: in person, online, private at home)", "Trial class: "],
      tanya: "student's name, age or grade, program of interest, suitable schedule, in person or online",
    },
  },
  kuliner: {
    label: "Kuliner / rumah makan & kafe",
    ikon: "🍜",
    istilah: "MENU & HARGA",
    transaksi: "pesanan",
    ekstra: ["Pengiriman: (contoh: ojek online, kurir sendiri, ambil di tempat)"],
    tanya: "nama, menu beserta jumlahnya, diantar atau ambil sendiri, alamat bila diantar, waktu yang diinginkan, cara bayar",
    en: {
      label: "Food & beverage",
      istilah: "MENU & PRICES",
      cara: "How to order",
      saat: "places an order",
      ekstra: ["Delivery: (example: delivery apps, own courier, pickup)"],
      tanya: "name, menu items and quantity, delivery or pickup, address if delivered, preferred time, payment method",
    },
  },
  umum: {
    label: "Usaha lainnya",
    ikon: "🏪",
    istilah: "PRODUK / LAYANAN & HARGA",
    transaksi: "pesanan",
    ekstra: ["Pengiriman: "],
    tanya: "nama, pilihan beserta jumlahnya, alamat atau lokasi bila perlu, waktu yang diinginkan, cara bayar",
    en: {
      label: "Other business",
      istilah: "PRODUCTS / SERVICES & PRICES",
      cara: "How to order",
      saat: "places an order",
      ekstra: ["Delivery: "],
      tanya: "name, their choice and quantity, address or location if needed, preferred time, payment method",
    },
  },
} as const satisfies Record<string, JenisUsaha>;

export type KunciUsaha = keyof typeof JENIS_USAHA;

/** Kunci jenis usaha yang sah (bukan properti bawaan objek seperti "constructor"). */
export const jenisUsahaSah = (v: unknown): v is KunciUsaha => typeof v === "string" && Object.hasOwn(JENIS_USAHA, v);

const SERAHKAN = "pertanyaan yang tidak ada di catatan ini, pelanggan minta bicara dengan pemilik, permintaan khusus atau keluhan";
const SERAHKAN_EN = "a question isn't covered in these notes, the customer asks to talk to the owner, special requests or complaints";

/**
 * Kerangka isian sederhana untuk editor knowledge. Fakta usaha hanya diberi petunjuk umum "(contoh: ...)" yang dibuang
 * sebelum disimpan / dirapikan AI. Yang bukan fakta (gaya bahasa, data yang ditanyakan saat transaksi, kapan diserahkan
 * ke pemilik) sudah terisi saran yang boleh diubah dan berbeda per jenis usaha.
 */
export function kerangka(jenis: KunciUsaha, b: Bahasa = "id"): string {
  if (b === "en") return kerangkaEn(jenis);
  const j: JenisUsaha = JENIS_USAHA[jenis];
  const istilah = j.istilah.charAt(0) + j.istilah.slice(1).toLowerCase();
  const kata = j.transaksi === "pendaftaran" ? "mendaftar" : j.transaksi.startsWith("booking") ? "booking" : j.transaksi === "konsultasi" ? "minta konsultasi" : "memesan";
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
    ...j.ekstra,
    `Cara ${j.transaksi}: `,
    "Cara bayar: (contoh: transfer bank, QRIS, tunai)",
    "Kebijakan (pembatalan, penukaran, garansi): ",
    "Promo yang sedang berlaku: ",
    "",
    `Saat pelanggan ${kata}, tanyakan: ${j.tanya}`,
    "",
    "Pertanyaan yang sering ditanya:",
    "T: ",
    "J: ",
    "",
    `Serahkan ke pemilik bila: ${j.serahkan ? `${j.serahkan}, ` : ""}${SERAHKAN}`,
  ].join("\n");
}

/** Kerangka versi Inggris: susunan sama, petunjuk "(example: ...)" dibuang seperti "(contoh: ...)". */
function kerangkaEn(jenis: KunciUsaha): string {
  const j: JenisUsaha["en"] = JENIS_USAHA[jenis].en;
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
    ...j.ekstra,
    `${j.cara}: `,
    "Payment methods: (example: bank transfer, card, cash)",
    "Policies (cancellation, exchange, warranty): ",
    "Current promotions: ",
    "",
    `When a customer ${j.saat}, ask for: ${j.tanya}`,
    "",
    "Frequently asked questions:",
    "Q: ",
    "A: ",
    "",
    `Hand over to the owner when: ${j.serahkan ? `${j.serahkan}, ` : ""}${SERAHKAN_EN}`,
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
  // Baris berisi berikutnya dicari dari belakang sekali jalan (linear): teks bisa sampai 1 juta karakter.
  const lanjut: (string | undefined)[] = new Array(b0.length);
  for (let i = b0.length - 1, berikut: string | undefined; i >= 0; i--) {
    lanjut[i] = berikut;
    if (b0[i].trim() !== "") berikut = b0[i];
  }
  const hasil = b0.filter((b, i) => {
    if (!/^[^:\n]{1,80}:\s*$/.test(b)) return true;
    const l = lanjut[i];
    return !!l && /^\s*(?:[-•*]\s*\S|[TJQA]:\s*\S|\d+[.)]\s*\S)/i.test(l);
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
