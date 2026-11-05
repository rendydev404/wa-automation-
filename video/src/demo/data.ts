/**
 * Data demo yang konsisten di semua scene: satu usaha fiktif ("Dapur Bu Rini", sama dengan contoh di landing page).
 * Nomor telepon sengaja berpola placeholder. Semua angka harus sama antar scene (knowledge → uji bot → chat live).
 */
export const USAHA = { nama: "Dapur Bu Rini", inisial: "DR", pemilik: "Rini Handayani", email: "rini@dapurburini.id" };

/** Nomor WhatsApp bisnis yang disambungkan (diformat seperti formatNomor() di app). */
export const NOMOR_BISNIS = { label: "CS Utama", wa: "+62 857-1234-5678", raw: "6285712345678" };
export const PELANGGAN = { nama: "Sari Dewi", telp: "+62 813-5521-0099", inisial: "SD" };

export const TANGGAL = "Selasa, 3 November 2026";

export const MENU = [
  ["Paket Hemat (nasi + ayam bakar + es teh)", "Rp25.000"],
  ["Nasi Box Ayam Bakar", "Rp28.000"],
  ["Snack Box (3 kue + air mineral)", "Rp18.000"],
  ["Tumpeng Mini (6-8 porsi)", "Rp185.000"],
  ["Es Teh Manis", "Rp5.000"],
] as const;

/** Teks mentah yang diketik pemilik di editor knowledge (bahasa bebas, tidak rapi). */
export const TULISAN_USAHA =
  "Dapur Bu Rini, masakan rumahan & catering di Bandung. Menu: paket hemat nasi + ayam bakar + es teh 25rb, nasi box ayam bakar 28rb, snack box 18rb isi 3 kue + air mineral, tumpeng mini 185rb buat 6-8 orang, es teh 5rb. Buka tiap hari jam 7 pagi sampai 10 malam. Alamat Jl. Melati No. 5 Bandung. Antar area Bandung ongkir 8rb. Catering min. 20 box pesan H-1. Bayar transfer BCA 1234567890 a.n. Rini Handayani atau QRIS atau tunai.";

/** Hasil rapikan AI (dokumen terstruktur yang dibaca AI). */
export const HASIL_RAPI = `Nama usaha: Dapur Bu Rini
Tentang usaha: Masakan rumahan dan catering di Bandung.
Gaya bahasa: santai dan ramah, panggil pelanggan "Kak"/"Kakak"

MENU & HARGA:
- Paket Hemat (nasi + ayam bakar + es teh): Rp25.000
- Nasi Box Ayam Bakar: Rp28.000
- Snack Box (3 kue + air mineral): Rp18.000
- Tumpeng Mini (untuk 6-8 orang): Rp185.000
- Es Teh Manis: Rp5.000

Jam buka: Setiap hari, 07.00 - 22.00
Alamat: Jl. Melati No. 5, Bandung
Area pengiriman: Bandung, ongkir Rp8.000
Cara pesanan: Catering minimal 20 box, pesan H-1
Cara bayar: Transfer BCA 1234567890 a.n. Rini Handayani, QRIS, atau tunai

Saat pelanggan memesan, tanyakan: nama, pesanan beserta jumlahnya, alamat, waktu, cara bayar`;

/** Statistik contoh "setelah beberapa hari berjalan" (7 hari: terlama → hari ini). */
export const HARI = ["Rab", "Kam", "Jum", "Sab", "Min", "Sen", "Hari ini"];
export const SERI_MASUK = [18, 24, 31, 44, 38, 27, 47];
export const SERI_DIBALAS = [16, 22, 29, 41, 35, 25, 41];

export const PAKET = [
  { nama: "Starter", desk: "Untuk usaha yang baru mulai.", harga: 99000, nomor: 1, balasan: 1000, komisi: 19800 },
  { nama: "Bisnis", desk: "Paling banyak dipilih untuk toko dan jasa.", harga: 249000, nomor: 3, balasan: 3500, komisi: 49800, unggulan: true },
  { nama: "Pro", desk: "Untuk tim, banyak nomor, dan volume chat tinggi.", harga: 599000, nomor: 10, balasan: 10000, komisi: 119800 },
] as const;
