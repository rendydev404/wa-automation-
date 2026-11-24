/**
 * Bot instan di landing ("Buat bot Anda dalam 60 detik"): batas isian, contoh isian per jenis usaha, pertanyaan
 * pancingan, dan penyusun teks Informasi Usaha dari isian pengunjung. Murni tanpa I/O: dipakai komponen landing
 * (browser), route /api/demo-bot, dan uji. Contoh isian SENGAJA ditandai "(contoh)" supaya tidak terbaca sebagai usaha
 * sungguhan.
 */
import type { Bahasa } from "./bahasa";
import { JENIS_USAHA, type JenisUsaha, type KunciUsaha } from "./templat-usaha";

export const COOKIE_DRAF = "cg_draf";
export const UMUR_COOKIE_DRAF = 30 * 24 * 60 * 60;

export const BATAS_DEMO = {
  nama: 80,
  produk: 2500,
  info: 600,
  pesan: 300,
  /** Balasan demo per pengunjung (token cookie) per 24 jam. */
  perPengunjung: 8,
  /** Balasan demo per alamat IP per 24 jam (beberapa pengunjung di satu jaringan kantor). */
  perIp: 24,
  /** Balasan demo seluruh landing per 24 jam: pengaman biaya AI. */
  global: 3000,
} as const;

export interface IsianDemo {
  jenis: KunciUsaha;
  nama: string;
  produk: string;
  /** Jam buka, alamat, cara pesan, dsb. (opsional). */
  info: string;
}

/** Contoh singkat per jenis usaha (bahasa Indonesia; versi Inggris memakai CONTOH_EN). */
const CONTOH: Record<KunciUsaha, { nama: string; produk: string; info: string }> = {
  "toko-online": { nama: "Toko Baju Kirana (contoh)", produk: "Kaos polos katun Rp65.000 (S-XL, hitam/putih/navy)\nKemeja flanel Rp135.000 (M-XL)\nCelana chino Rp150.000", info: "Kirim dari Bandung via JNE/J&T, ongkir sesuai ekspedisi. Bayar transfer BCA atau QRIS. Tukar ukuran maksimal 3 hari." },
  laundry: { nama: "Laundry Melati (contoh)", produk: "Cuci kering setrika Rp8.000/kg (2 hari)\nExpress 1 hari Rp12.000/kg\nBedcover Rp35.000/pcs", info: "Buka 07.00-21.00 setiap hari. Antar-jemput gratis minimal 5 kg di area Kecamatan Cibeunying." },
  "klinik-kecantikan": { nama: "Klinik Ayu Glow (contoh)", produk: "Facial acne Rp150.000\nChemical peeling Rp250.000\nKonsultasi dokter gratis untuk pasien treatment", info: "Buka Senin-Sabtu 10.00-19.00. Booking minimal H-1 lewat chat. Konsultasi masalah kulit serius ditangani dokter." },
  "rental-mobil": { nama: "Rental Jaya (contoh)", produk: "Avanza lepas kunci Rp350.000/hari\nInnova Reborn + sopir Rp750.000/12 jam\nHiace + sopir Rp1.300.000/hari", info: "Area Jogja dan sekitarnya. Lepas kunci wajib KTP + SIM A + jaminan motor. DP 30% untuk booking." },
  "maklon-kosmetik": { nama: "Maklon Cantik Lab (contoh)", produk: "Serum wajah mulai Rp18.000/pcs (MOQ 500)\nSabun cair mulai Rp9.000/pcs (MOQ 1.000)\nPengurusan BPOM & halal dibantu", info: "Konsultasi formula gratis. Produksi 30-45 hari setelah sampel disetujui." },
  bengkel: { nama: "Bengkel Maju Motor (contoh)", produk: "Ganti oli + cek ringan Rp75.000\nServis besar mobil mulai Rp450.000\nSpooring balancing Rp150.000", info: "Buka Senin-Sabtu 08.00-17.00. Booking servis lewat chat supaya tidak antre." },
  distributor: { nama: "Grosir Sembako Berkah (contoh)", produk: "Beras premium 25 kg Rp340.000\nMinyak goreng 1 dus (12 L) Rp195.000\nGula pasir 50 kg Rp850.000", info: "Minimal order Rp1.000.000. Kirim gratis area kota untuk order di atas Rp3.000.000." },
  "travel-umrah": { nama: "Travel Amanah (contoh)", produk: "Umrah reguler 9 hari Rp29.900.000 (hotel bintang 4)\nUmrah plus Turki 12 hari Rp38.500.000", info: "Keberangkatan tiap bulan dari Jakarta. DP Rp5.000.000, pelunasan H-30. Paspor dan vaksin dibantu." },
  catering: { nama: "Catering Dapur Ibu (contoh)", produk: "Nasi kotak ayam bakar Rp28.000\nPrasmanan per orang mulai Rp45.000\nTumpeng mini Rp250.000", info: "Pesan minimal H-2, minimal 30 porsi. Gratis antar area kota." },
  "kursus-les": { nama: "Les Privat Cerdas (contoh)", produk: "Les SD (Matematika/IPA) Rp400.000/bulan (8x)\nLes SMP Rp500.000/bulan (8x)\nPersiapan UTBK Rp1.200.000/bulan", info: "Bisa datang ke rumah atau online. Kelas percobaan pertama gratis." },
  kuliner: { nama: "Warung Bu Rini (contoh)", produk: "Paket hemat nasi + ayam bakar + es teh Rp25.000\nAyam geprek Rp18.000\nEs jeruk Rp6.000", info: "Buka 10.00-22.00. Bisa diantar, ongkir Rp8.000 dalam 3 km. Bayar tunai atau QRIS." },
  umum: { nama: "Usaha Saya (contoh)", produk: "Layanan utama Rp100.000\nLayanan premium Rp250.000", info: "Buka Senin-Jumat 09.00-17.00. Pemesanan lewat chat ini." },
};

const CONTOH_EN: Record<KunciUsaha, { nama: string; produk: string; info: string }> = {
  "toko-online": { nama: "Kirana Apparel (sample)", produk: "Cotton tee $9 (S-XL, black/white/navy)\nFlannel shirt $18 (M-XL)\nChino pants $20", info: "Ships from Bandung via local couriers. Pay by bank transfer or QRIS. Size exchanges within 3 days." },
  laundry: { nama: "Melati Laundry (sample)", produk: "Wash, dry & iron $0.60/kg (2 days)\nExpress next day $0.90/kg\nBedcover $2.50 each", info: "Open 7 AM to 9 PM daily. Free pickup and delivery for 5 kg or more nearby." },
  "klinik-kecantikan": { nama: "Ayu Glow Clinic (sample)", produk: "Acne facial $10\nChemical peel $17\nFree doctor consultation with any treatment", info: "Open Mon-Sat 10 AM to 7 PM. Book at least one day ahead by chat." },
  "rental-mobil": { nama: "Jaya Car Rental (sample)", produk: "Self-drive Avanza $24/day\nInnova with driver $50/12 hours\nHiace with driver $87/day", info: "Yogyakarta area. Self-drive requires ID, driver's license and a deposit. 30% down payment to book." },
  "maklon-kosmetik": { nama: "Cantik Lab OEM (sample)", produk: "Face serum from $1.20/unit (MOQ 500)\nLiquid soap from $0.60/unit (MOQ 1,000)\nHelp with BPOM & halal certification", info: "Free formula consultation. Production takes 30-45 days after sample approval." },
  bengkel: { nama: "Maju Auto Service (sample)", produk: "Oil change + quick check $5\nMajor car service from $30\nWheel alignment & balancing $10", info: "Open Mon-Sat 8 AM to 5 PM. Book by chat to skip the queue." },
  distributor: { nama: "Berkah Wholesale (sample)", produk: "Premium rice 25 kg $23\nCooking oil 1 case (12 L) $13\nSugar 50 kg $57", info: "Minimum order $70. Free delivery in the city for orders over $200." },
  "travel-umrah": { nama: "Amanah Travel (sample)", produk: "Regular umrah 9 days $2,000 (4-star hotels)\nUmrah plus Turkey 12 days $2,600", info: "Monthly departures from Jakarta. $350 deposit, full payment 30 days before departure." },
  catering: { nama: "Dapur Ibu Catering (sample)", produk: "Grilled chicken rice box $1.90\nBuffet per person from $3\nMini tumpeng $17", info: "Order at least 2 days ahead, minimum 30 portions. Free delivery in the city." },
  "kursus-les": { nama: "Cerdas Tutoring (sample)", produk: "Elementary math/science $27/month (8 sessions)\nJunior high $34/month (8 sessions)\nUniversity entrance prep $80/month", info: "At your home or online. The first trial class is free." },
  kuliner: { nama: "Bu Rini's Kitchen (sample)", produk: "Value combo rice + grilled chicken + iced tea $1.70\nCrispy smashed chicken $1.20\nOrange juice $0.40", info: "Open 10 AM to 10 PM. Delivery $0.50 within 3 km. Cash or QRIS." },
  umum: { nama: "My Business (sample)", produk: "Main service $7\nPremium service $17", info: "Open Mon-Fri 9 AM to 5 PM. Order through this chat." },
};

export const contohIsian = (jenis: KunciUsaha, b: Bahasa = "id") => (b === "en" ? CONTOH_EN : CONTOH)[jenis];

/** Tiga pertanyaan pancingan yang wajar untuk jenis usaha ini (tombol di bawah chat demo). */
export function pertanyaanPancingan(jenis: KunciUsaha, b: Bahasa = "id"): string[] {
  const j = JENIS_USAHA[jenis];
  if (b === "en") return ["How much does it cost?", "What are your opening hours?", `How do I ${j.en.cara.replace(/^How to /i, "").toLowerCase()}?`];
  const kata = j.transaksi === "pendaftaran" ? "daftar" : j.transaksi.startsWith("booking") ? "booking" : j.transaksi === "konsultasi" ? "konsultasi" : "pesan";
  return ["Kak, harganya berapa aja?", "Buka jam berapa ya?", `Cara ${kata}nya gimana kak?`];
}

const potong = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/\r/g, "").trim().slice(0, n) : "");

/** Isian dari browser dirapikan & dibatasi; null = belum cukup untuk membuat bot (nama + produk wajib). */
export function rapikanIsian(x: { jenis?: unknown; nama?: unknown; produk?: unknown; info?: unknown }, jenisSah: (v: unknown) => v is KunciUsaha): IsianDemo | null {
  if (!jenisSah(x.jenis)) return null;
  const nama = potong(x.nama, BATAS_DEMO.nama);
  const produk = potong(x.produk, BATAS_DEMO.produk);
  if (nama.length < 2 || produk.length < 5) return null;
  return { jenis: x.jenis, nama, produk, info: potong(x.info, BATAS_DEMO.info) };
}

/** Teks Informasi Usaha dari isian (dipakai AI demo dan disimpan ke nomor saat pengunjung mendaftar). */
export function teksInformasi(i: IsianDemo): string {
  const j: JenisUsaha = JENIS_USAHA[i.jenis];
  const istilah = j.istilah.charAt(0) + j.istilah.slice(1).toLowerCase();
  return [
    `Nama usaha: ${i.nama}`,
    `Jenis usaha: ${j.label}`,
    'Gaya bahasa: santai dan ramah, panggil pelanggan "Kak"/"Kakak" (menyesuaikan pelanggan)',
    "",
    `${istilah}:`,
    ...i.produk.split("\n").map((b) => b.trim()).filter(Boolean).map((b) => (b.startsWith("-") ? b : `- ${b}`)),
    ...(i.info ? ["", `Info lain: ${i.info.replace(/\s*\n\s*/g, " ")}`] : []),
    "",
    `Saat pelanggan bertransaksi, tanyakan: ${j.tanya}`,
    "",
    `Serahkan ke pemilik bila: ${j.serahkan ? `${j.serahkan}, ` : ""}pertanyaan yang tidak ada di catatan ini, pelanggan minta bicara dengan pemilik, permintaan khusus atau keluhan`,
  ].join("\n");
}
