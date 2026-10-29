"use client";

import type { LangkahTur } from "./tur";

/** Isi tur panduan. Bahasa sehari-hari, tanpa istilah teknis: ditujukan untuk pemilik usaha yang baru pertama kali. */

export const TUR_DASHBOARD: LangkahTur[] = [
  {
    judul: "Selamat datang 👋",
    isi: (
      <>
        <p>Di sini kamu punya asisten AI yang membalas chat WhatsApp pelanggan secara otomatis, 24 jam.</p>
        <p>Cukup 3 langkah: sambungkan nomor WhatsApp, isi pengetahuan tentang usahamu, lalu biarkan AI bekerja.</p>
      </>
    ),
  },
  {
    sasaran: "tambah-nomor",
    judul: "1. Tambahkan nomor WhatsApp",
    isi: (
      <p>
        Klik di sini, beri nama (mis. &quot;CS Toko&quot;), lalu scan kode QR yang muncul dari HP kamu, sama seperti membuka WhatsApp Web. Nomor tetap bisa kamu
        pakai seperti biasa di HP.
      </p>
    ),
  },
  {
    sasaran: "ringkasan",
    judul: "Pantau dari sini",
    isi: <p>Jumlah pesan masuk, berapa yang sudah dibalas AI, dan nomor yang tersambung terlihat di halaman ini setiap hari.</p>,
  },
  {
    sasaran: "nav-nomor",
    judul: "2. Atur tiap nomor",
    isi: <p>Klik nama nomor di daftar ini untuk mengisi pengetahuan AI, mencoba AI, dan mengatur kapan AI membalas.</p>,
  },
  {
    sasaran: "nav-langganan",
    judul: "Paket & kuota",
    isi: <p>Lihat sisa balasan AI bulan ini dan pilih paket bila butuh lebih banyak nomor atau balasan. Pembayaran lewat QRIS, transfer bank, atau e-wallet.</p>,
  },
  {
    sasaran: "nav-panduan",
    judul: "Butuh penjelasan lagi?",
    isi: <p>Klik &quot;Panduan&quot; kapan saja untuk melihat penjelasan ini lagi.</p>,
  },
];

export const TUR_NOMOR: LangkahTur[] = [
  {
    sasaran: "koneksi",
    judul: "1. Sambungkan WhatsApp",
    isi: (
      <>
        <p>Buka WhatsApp di HP → titik tiga (Android) atau Pengaturan (iPhone) → Perangkat tertaut → Tautkan perangkat, lalu arahkan kamera ke kode QR di sini.</p>
        <p>Setelah tersambung, statusnya berubah hijau &quot;Terhubung&quot;.</p>
      </>
    ),
  },
  {
    sasaran: "knowledge",
    judul: "2. Isi base knowledge (paling penting)",
    isi: (
      <>
        <p>
          Bayangkan AI ini <b className="text-fg">karyawan baru</b>. Base knowledge adalah <b className="text-fg">buku catatan</b> yang kamu berikan kepadanya: siapa
          usahamu, apa yang dijual, harganya, jam buka, alamat, dan cara pesan.
        </p>
        <p>AI hanya menjawab dari catatan ini dan tidak mengarang. Yang tidak tertulis, ia akan bilang belum tahu dan menyerahkannya ke kamu.</p>
        <p>Paling mudah: klik &quot;Pakai contoh&quot;, lalu ganti tulisan di dalam [kurung siku] dengan data usahamu.</p>
      </>
    ),
  },
  {
    sasaran: "uji",
    judul: "3. Coba dulu di sini",
    isi: <p>Ketik pertanyaan seperti pelanggan, mis. &quot;harga paket berapa?&quot;. Jawaban di sini sama persis dengan yang akan dikirim ke WhatsApp, tapi tidak dikirim ke siapa pun.</p>,
  },
  {
    sasaran: "saklar-bot",
    judul: "Nyalakan / matikan AI",
    isi: <p>Saklar ini menghidupkan atau mematikan balasan AI di nomor ini. Kalau mati, semua chat kamu balas sendiri.</p>,
  },
  {
    sasaran: "pengaturan",
    judul: "Kamu tetap pegang kendali",
    isi: (
      <p>
        AI menunggu beberapa detik dulu sebelum membalas, memberi kamu kesempatan menjawab sendiri. Begitu kamu membalas dari HP, AI otomatis diam di chat itu. Lama
        waktunya bisa diatur di sini.
      </p>
    ),
  },
  {
    sasaran: "histori",
    judul: "Riwayat percakapan",
    isi: <p>Semua chat tercatat di sini: mana yang dibalas AI dan mana yang kamu balas sendiri.</p>,
  },
];

/** Contoh isi base knowledge: tinggal ganti bagian [dalam kurung siku]. */
export const CONTOH_KNOWLEDGE = `TENTANG USAHA
Nama usaha: [nama usaha kamu]
Kamu adalah asisten virtual (AI) dari [nama usaha]. Bantu pelanggan dengan ramah dan singkat.

PRODUK / LAYANAN DAN HARGA
- [nama produk 1]: Rp[harga]
- [nama produk 2]: Rp[harga]
- [nama produk 3]: Rp[harga]

JAM BUKA
Senin - Jumat: [jam buka] - [jam tutup]
Sabtu - Minggu: [jam buka] - [jam tutup]

ALAMAT
[alamat lengkap]
Google Maps: [tautan Google Maps]

CARA PESAN
1. [contoh: kirim nama, alamat, dan pesanan lewat chat ini]
2. [contoh: kami konfirmasi total harga dan ongkir]
3. [contoh: bayar lalu kirim bukti transfer]

PEMBAYARAN
[contoh: transfer BCA 1234567890 a.n. Nama Pemilik, atau QRIS]

PENGIRIMAN
[contoh: GoSend/GrabExpress, ongkir ditanggung pembeli]

PERTANYAAN YANG SERING DITANYA
T: [pertanyaan pelanggan]
J: [jawabanmu]

T: [pertanyaan pelanggan]
J: [jawabanmu]`;
