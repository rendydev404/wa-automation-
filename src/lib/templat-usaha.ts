/**
 * Bahan editor base knowledge per jenis usaha: kerangka isian sederhana (kerangka), pembersih baris kerangka yang
 * belum diisi (bersihkanKerangka), dan cek kelengkapan. Hasil tulisan pengguna dirapikan AI di rapikan-knowledge.ts
 * menjadi dokumen terstruktur. Murni (tanpa I/O): dipakai editor di browser, server, dan uji.
 */

export interface ProdukTemplat {
  nama: string;
  /** Digit saja (Rupiah); kosong = harga ditanyakan ke pemilik. */
  harga: string;
  ket: string;
}

export interface FaqTemplat {
  t: string;
  j: string;
}

export interface IsiTemplat {
  namaUsaha: string;
  namaAsisten: string;
  tentang: string;
  gaya: "santai" | "sopan";
  produk: ProdukTemplat[];
  jam: string;
  alamat: string;
  maps: string;
  area: string;
  caraPesan: string;
  dataPesanan: string;
  bayar: string;
  kirim: string;
  kebijakan: string;
  promo: string;
  faq: FaqTemplat[];
  serahkan: string;
  larangan: string;
}

export interface JenisUsaha {
  label: string;
  ikon: string;
  contohUsaha: string;
  /** Judul daftar produk (Menu, Produk, Layanan, Program). */
  istilah: string;
  /** Kata untuk transaksi (pesanan / booking / pendaftaran). */
  transaksi: string;
  contoh: IsiTemplat;
}

const UMUM_SERAHKAN = "Pelanggan minta bicara dengan pemilik/manusia\nPertanyaan yang jawabannya tidak ada di catatan ini";
const UMUM_LARANGAN = "Jangan memberi diskon, harga, atau janji yang tidak tertulis di sini\nJangan meminta data pribadi selain yang perlu untuk pesanan";

export const JENIS_USAHA = {
  kuliner: {
    label: "Kuliner / makanan & minuman",
    ikon: "🍜",
    contohUsaha: "warung, kafe, katering, kue rumahan, frozen food",
    istilah: "MENU & HARGA",
    transaksi: "pesanan",
    contoh: {
      namaUsaha: "Dapur Bu Sari",
      namaAsisten: "Sari",
      tentang: "Warung ayam geprek rumahan. Sambal dibuat baru setiap hari, ayam ukuran besar.",
      gaya: "santai",
      produk: [
        { nama: "Ayam Geprek + Nasi", harga: "18000", ket: "level pedas 0–5" },
        { nama: "Paket Hemat (ayam geprek, nasi, es teh)", harga: "25000", ket: "" },
        { nama: "Es Teh Manis", harga: "5000", ket: "" },
      ],
      jam: "Setiap hari 10.00–21.00 WIB. Pesanan antar terakhir 20.30.",
      alamat: "Jl. Melati No. 5, Bekasi Timur (sebelah minimarket)",
      maps: "",
      area: "Antar sendiri radius 3 km dari warung",
      caraPesan: "Sebutkan menu, jumlah, dan pilihan level pedas\nPilih diambil sendiri atau diantar\nRingkasan pesanan diulang untuk dicek\nPesanan diteruskan ke dapur untuk disiapkan",
      dataPesanan: "Nama pemesan\nMenu + jumlah + pilihan (level pedas, tanpa sambal, dll.)\nDiambil sendiri atau diantar\nAlamat lengkap + patokan (bila diantar)\nJam ambil / antar\nCara bayar",
      bayar: "Transfer BCA 1234567890 a.n. Sari Wulandari, QRIS, atau tunai saat ambil/antar",
      kirim: "Ongkir antar dalam radius 3 km dikonfirmasi pemilik. Di luar itu pakai GoSend/GrabExpress (dipesan pelanggan, ongkir ditanggung pembeli).",
      kebijakan: "Pesanan yang sudah dimasak tidak bisa dibatalkan. Komplain (kurang item, salah menu) maksimal 1 jam setelah diterima, sertakan foto.",
      promo: "",
      faq: [
        { t: "Bisa pesan banyak untuk acara?", j: "Bisa, minimal H-1. Detail jumlah dan jamnya diteruskan ke pemilik untuk konfirmasi." },
        { t: "Ada yang tidak pedas?", j: "Ada, level 0 tanpa sambal." },
        { t: "Halal?", j: "Ya, semua bahan halal." },
      ],
      serahkan: `Pesanan porsi besar / katering / acara\nStok menu hari ini\n${UMUM_SERAHKAN}`,
      larangan: UMUM_LARANGAN,
    },
  },
  toko: {
    label: "Toko online / retail",
    ikon: "🛍️",
    contohUsaha: "fashion, kosmetik, elektronik, perlengkapan rumah, reseller",
    istilah: "PRODUK & HARGA",
    transaksi: "pesanan",
    contoh: {
      namaUsaha: "Kaosku.id",
      namaAsisten: "",
      tentang: "Toko kaos polos & hoodie bahan cotton combed, produksi sendiri di Bandung.",
      gaya: "santai",
      produk: [
        { nama: "Kaos Polos Cotton Combed 30s", harga: "75000", ket: "ukuran S–XXL, 8 warna" },
        { nama: "Hoodie Basic", harga: "165000", ket: "ukuran M–XL, hitam/abu/navy" },
        { nama: "Paket 3 Kaos Polos", harga: "199000", ket: "boleh campur warna" },
      ],
      jam: "Chat dilayani setiap hari 08.00–21.00 WIB. Pengiriman Senin–Sabtu.",
      alamat: "Jl. Cibaduyut Raya No. 12, Bandung (gudang, tidak melayani beli di tempat)",
      maps: "",
      area: "Kirim ke seluruh Indonesia",
      caraPesan: "Sebutkan produk, ukuran, warna, dan jumlah\nKirim nama, alamat lengkap, dan nomor HP penerima\nRingkasan pesanan diulang untuk dicek\nPemilik mengonfirmasi ongkir dan total, lalu pelanggan transfer",
      dataPesanan: "Nama penerima\nProduk + ukuran + warna + jumlah\nAlamat lengkap + kecamatan + kode pos\nNomor HP penerima\nKurir pilihan (bila ada)\nCara bayar",
      bayar: "Transfer BCA 1234567890 a.n. Kaosku Indonesia, atau checkout di Shopee: shopee.co.id/kaosku",
      kirim: "Dikirim dari Bandung via JNE, J&T, atau SiCepat. Ongkir sesuai tarif kurir dan dikonfirmasi pemilik. Paket dikirim H+1 setelah pembayaran diterima.",
      kebijakan: "Tukar ukuran maksimal 3 hari setelah barang diterima, barang belum dicuci dan label masih utuh. Ongkir tukar ditanggung pembeli. Barang cacat produksi diganti gratis.",
      promo: "",
      faq: [
        { t: "Ada size chart?", j: "Ada: S lebar 48 cm, M 50 cm, L 52 cm, XL 54 cm, XXL 56 cm." },
        { t: "Bisa COD?", j: "Bisa lewat checkout Shopee." },
        { t: "Stoknya ready?", j: "Stok dicek pemilik sebelum pesanan diproses." },
      ],
      serahkan: `Cek stok warna/ukuran tertentu\nPesanan grosir / reseller\nKonfirmasi ongkir & total\n${UMUM_SERAHKAN}`,
      larangan: UMUM_LARANGAN,
    },
  },
  jasa: {
    label: "Jasa & servis",
    ikon: "🛠️",
    contohUsaha: "servis AC/elektronik, laundry, bengkel, desain, fotografi, kebersihan",
    istilah: "LAYANAN & TARIF",
    transaksi: "pesanan jadwal",
    contoh: {
      namaUsaha: "Sejuk AC Service",
      namaAsisten: "",
      tentang: "Jasa servis AC rumah dan kantor, teknisi berpengalaman, datang ke lokasi.",
      gaya: "sopan",
      produk: [
        { nama: "Cuci AC", harga: "75000", ket: "per unit, 0,5–2 PK" },
        { nama: "Isi freon R32", harga: "250000", ket: "per unit" },
        { nama: "Bongkar pasang AC", harga: "350000", ket: "belum termasuk pipa tambahan" },
      ],
      jam: "Senin–Sabtu 08.00–17.00 WIB. Minggu & tanggal merah libur.",
      alamat: "Jl. Kenanga No. 8, Depok",
      maps: "",
      area: "Depok, Jakarta Selatan, dan Jakarta Timur",
      caraPesan: "Sebutkan layanan dan jumlah unit\nKirim alamat lokasi dan jadwal yang diinginkan\nRingkasan diulang untuk dicek\nPemilik mengonfirmasi jadwal teknisi",
      dataPesanan: "Nama\nLayanan + jumlah unit (dan merek/PK bila tahu)\nAlamat lokasi lengkap\nTanggal & jam yang diinginkan\nKeluhan / kondisi (foto bila ada)\nNomor yang bisa dihubungi teknisi",
      bayar: "Bayar setelah pekerjaan selesai: tunai, transfer BCA 1234567890 a.n. Sejuk AC, atau QRIS",
      kirim: "Teknisi datang ke lokasi. Tanpa biaya transport di area layanan.",
      kebijakan: "Garansi 30 hari untuk pekerjaan yang sama. Jadwal bisa diubah maksimal H-1.",
      promo: "",
      faq: [
        { t: "Berapa lama cuci AC?", j: "Sekitar 45–60 menit per unit." },
        { t: "Bisa hari ini?", j: "Tergantung jadwal teknisi; permintaan diteruskan ke pemilik untuk dicek." },
        { t: "Ada garansi?", j: "Ada, 30 hari untuk pekerjaan yang sama." },
      ],
      serahkan: `Jadwal & ketersediaan teknisi\nPerkiraan biaya kerusakan yang belum jelas\n${UMUM_SERAHKAN}`,
      larangan: `${UMUM_LARANGAN}\nJangan mendiagnosis kerusakan atau menjamin hasil perbaikan`,
    },
  },
  kecantikan: {
    label: "Salon, barbershop & kecantikan",
    ikon: "💇",
    contohUsaha: "salon, barbershop, klinik kecantikan, spa, nail art, MUA",
    istilah: "LAYANAN & HARGA",
    transaksi: "booking",
    contoh: {
      namaUsaha: "Salon Ayu",
      namaAsisten: "",
      tentang: "Salon wanita & keluarga, nyaman dan bersih, dengan stylist berpengalaman.",
      gaya: "santai",
      produk: [
        { nama: "Potong + cuci + blow", harga: "50000", ket: "±45 menit" },
        { nama: "Creambath", harga: "85000", ket: "±60 menit" },
        { nama: "Facial basic", harga: "150000", ket: "±60 menit" },
      ],
      jam: "Selasa–Minggu 09.00–20.00 WIB. Senin tutup.",
      alamat: "Ruko Griya Indah Blok B2, Tangerang",
      maps: "",
      area: "",
      caraPesan: "Pilih layanan\nPilih tanggal & jam\nRingkasan booking diulang untuk dicek\nPemilik mengonfirmasi slot yang tersedia",
      dataPesanan: "Nama\nLayanan yang dipilih\nTanggal & jam booking\nStylist/terapis pilihan (bila ada)\nCatatan khusus (alergi, panjang rambut, dll.)",
      bayar: "Bayar di tempat: tunai, QRIS, atau kartu debit",
      kirim: "",
      kebijakan: "Datang 10 menit sebelum jadwal. Terlambat lebih dari 15 menit, jadwal bisa diundur. Pembatalan maksimal H-1.",
      promo: "",
      faq: [
        { t: "Bisa datang tanpa booking?", j: "Bisa bila ada slot kosong; booking dulu lebih aman." },
        { t: "Ada stylist pria?", j: "Ada." },
        { t: "Parkir?", j: "Ada parkir motor dan mobil di depan ruko." },
      ],
      serahkan: `Ketersediaan slot / jadwal\nKeluhan kulit atau reaksi alergi\n${UMUM_SERAHKAN}`,
      larangan: `${UMUM_LARANGAN}\nJangan memberi saran medis; keluhan kulit diteruskan ke pemilik`,
    },
  },
  kursus: {
    label: "Kursus & pendidikan",
    ikon: "📚",
    contohUsaha: "les privat, bimbel, kursus bahasa/musik, pelatihan, kelas online",
    istilah: "PROGRAM & BIAYA",
    transaksi: "pendaftaran",
    contoh: {
      namaUsaha: "Bimbel Cerdas",
      namaAsisten: "",
      tentang: "Bimbingan belajar SD–SMA, kelas kecil maksimal 8 siswa, tersedia les privat ke rumah.",
      gaya: "sopan",
      produk: [
        { nama: "Kelas reguler SD (per bulan)", harga: "350000", ket: "2x seminggu, 90 menit" },
        { nama: "Kelas reguler SMP (per bulan)", harga: "450000", ket: "2x seminggu, 90 menit" },
        { nama: "Les privat ke rumah (8 pertemuan)", harga: "800000", ket: "semua mata pelajaran" },
      ],
      jam: "Kelas Senin–Sabtu 14.00–20.00 WIB. Admin membalas setiap hari 08.00–20.00.",
      alamat: "Jl. Pendidikan No. 21, Bogor",
      maps: "",
      area: "Les privat ke rumah untuk area Kota Bogor",
      caraPesan: "Pilih program\nKirim data siswa dan jadwal yang diinginkan\nRingkasan pendaftaran diulang untuk dicek\nPemilik mengonfirmasi kelas dan jadwal",
      dataPesanan: "Nama siswa\nKelas / usia\nProgram yang dipilih\nJadwal yang diinginkan\nNama & nomor orang tua/wali\nCara bayar",
      bayar: "Transfer BCA 1234567890 a.n. Bimbel Cerdas, dibayar di awal bulan",
      kirim: "",
      kebijakan: "Biaya pendaftaran Rp100.000 sekali, tidak dapat dikembalikan. Pertemuan yang dibatalkan maksimal H-1 bisa diganti.",
      promo: "",
      faq: [
        { t: "Bisa coba kelas dulu?", j: "Bisa, kelas percobaan gratis 1x." },
        { t: "Pengajarnya siapa?", j: "Lulusan S1 di bidangnya dan berpengalaman mengajar." },
        { t: "Ada kelas online?", j: "Ada untuk les privat." },
      ],
      serahkan: `Kuota kelas yang masih tersedia\nPermintaan pengajar tertentu\n${UMUM_SERAHKAN}`,
      larangan: `${UMUM_LARANGAN}\nJangan menjamin nilai atau kelulusan`,
    },
  },
  umum: {
    label: "Usaha lainnya",
    ikon: "🏪",
    contohUsaha: "freelancer, properti, rental, travel, agen, komunitas",
    istilah: "PRODUK / LAYANAN & HARGA",
    transaksi: "pesanan",
    contoh: {
      namaUsaha: "Nama Usaha Anda",
      namaAsisten: "",
      tentang: "Jelaskan singkat apa usaha Anda dan apa kelebihannya.",
      gaya: "santai",
      produk: [
        { nama: "Produk / layanan 1", harga: "100000", ket: "keterangan singkat" },
        { nama: "Produk / layanan 2", harga: "250000", ket: "" },
      ],
      jam: "Senin–Sabtu 09.00–17.00 WIB",
      alamat: "Alamat usaha Anda",
      maps: "",
      area: "",
      caraPesan: "Sebutkan produk/layanan yang diinginkan\nKirim data yang diperlukan\nRingkasan diulang untuk dicek\nPemilik mengonfirmasi",
      dataPesanan: "Nama\nProduk/layanan + jumlah\nAlamat / lokasi (bila perlu)\nTanggal & jam (bila perlu)\nCara bayar",
      bayar: "Transfer BCA 1234567890 a.n. Nama Anda",
      kirim: "",
      kebijakan: "",
      promo: "",
      faq: [{ t: "Pertanyaan yang sering ditanya pelanggan?", j: "Jawaban Anda." }],
      serahkan: UMUM_SERAHKAN,
      larangan: UMUM_LARANGAN,
    },
  },
} as const satisfies Record<string, JenisUsaha>;

export type KunciUsaha = keyof typeof JENIS_USAHA;

const baris = (t: string) =>
  t
    .split("\n")
    .map((b) => b.trim().replace(/^(?:[-•*]|\d+[.)])\s*/, ""))
    .filter(Boolean);

const hargaRingkas = (digit: string) => {
  const n = Number(digit);
  return !n ? "" : n % 1000 === 0 ? ` ${n / 1000}rb` : ` Rp${n.toLocaleString("id-ID")}`;
};

/**
 * Kerangka isian sederhana per jenis usaha untuk editor knowledge. Fakta usaha (produk, harga, jam, alamat,
 * rekening) hanya diberi petunjuk "(contoh: ...)" yang dibuang sebelum disimpan / dirapikan AI, jadi data contoh
 * tidak pernah menjadi fakta. Yang bukan fakta (gaya bahasa, data yang ditanyakan saat pesan, kapan diserahkan ke
 * pemilik) sudah terisi saran yang boleh diubah.
 */
export function kerangka(jenis: KunciUsaha): string {
  const j = JENIS_USAHA[jenis];
  const c = j.contoh as IsiTemplat;
  const istilah = j.istilah.charAt(0) + j.istilah.slice(1).toLowerCase();
  // Petunjuk selalu di akhir baris dan tanpa kurung di dalamnya, supaya bersihkanKerangka bisa membuangnya utuh.
  const tanpaKurung = (t: string) => t.replace(/\s*\(([^)]*)\)/g, " – $1");
  const produk = c.produk.slice(0, 2).map((p) => `- (contoh: ${tanpaKurung(p.nama)}${hargaRingkas(p.harga)}${p.ket ? `, ${p.ket}` : ""})`);
  return [
    "Nama usaha: ",
    `Tentang usaha: (contoh: ${tanpaKurung(c.tentang)})`,
    `Gaya bahasa: ${c.gaya === "sopan" ? 'sopan, panggil pelanggan "Bapak/Ibu"' : 'santai dan ramah, panggil pelanggan "Kak"'}`,
    "",
    `${istilah} (satu per baris, dengan harga):`,
    ...produk,
    "- ",
    "",
    `Jam buka: (contoh: ${tanpaKurung(c.jam)})`,
    "Alamat: ",
    "Area layanan / pengiriman: ",
    `Cara ${j.transaksi}: `,
    `Cara bayar: (contoh: ${tanpaKurung(c.bayar)})`,
    "Pengiriman: ",
    "Kebijakan (pembatalan, penukaran, garansi): ",
    "Promo yang sedang berlaku: ",
    "",
    `Saat pelanggan ${j.transaksi === "pendaftaran" ? "mendaftar" : j.transaksi === "booking" ? "booking" : "memesan"}, tanyakan: ${baris(c.dataPesanan).join(", ")}`,
    "",
    "Pertanyaan yang sering ditanya:",
    "T: ",
    "J: ",
    "",
    `Serahkan ke pemilik bila: ${baris(c.serahkan).join(", ")}`,
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
