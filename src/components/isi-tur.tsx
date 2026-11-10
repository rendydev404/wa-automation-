"use client";

import { UMUR_HISTORI_HARI } from "@/lib/format";
import type { IsiTur } from "./tur";

/** Isi tur panduan. Bahasa sehari-hari, tanpa istilah teknis: ditujukan untuk pemilik usaha yang baru pertama kali. */

export const TUR_DASHBOARD: IsiTur = (t) => [
  {
    judul: t("Selamat datang 👋", "Welcome 👋"),
    isi: (
      <>
        <p>
          {t(
            "Di sini kamu punya asisten AI yang membalas chat WhatsApp pelanggan secara otomatis, 24 jam.",
            "This is your AI assistant that replies to your customers' WhatsApp chats automatically, 24/7."
          )}
        </p>
        <p>
          {t(
            "Cukup 3 langkah: sambungkan nomor WhatsApp, isi Informasi Usaha, lalu biarkan AI bekerja.",
            "Just 3 steps: connect a WhatsApp number, fill in what the AI should know about your business, then let the AI do the work."
          )}
        </p>
      </>
    ),
  },
  {
    sasaran: "tambah-nomor",
    judul: t("1. Tambahkan nomor WhatsApp", "1. Add a WhatsApp number"),
    isi: (
      <p>
        {t(
          'Klik di sini, beri nama (mis. "CS Toko"), lalu scan kode QR yang muncul dari HP kamu, sama seperti membuka WhatsApp Web. Nomor tetap bisa kamu pakai seperti biasa di HP.',
          'Click here, give it a name (e.g. "Store CS"), then scan the QR code that appears with your phone, just like opening WhatsApp Web. You can keep using the number on your phone as usual.'
        )}
      </p>
    ),
  },
  {
    sasaran: "ringkasan",
    judul: t("Pantau dari sini", "Keep an eye on things here"),
    isi: (
      <p>
        {t(
          "Jumlah pesan masuk, berapa yang sudah dibalas AI, dan nomor yang tersambung terlihat di halaman ini setiap hari.",
          "Incoming messages, how many the AI has replied to, and which numbers are connected show up on this page every day."
        )}
      </p>
    ),
  },
  {
    sasaran: "nav-nomor",
    judul: t("2. Atur tiap nomor", "2. Set up each number"),
    isi: (
      <p>
        {t(
          "Klik nama nomor di daftar ini untuk mengisi Informasi Usaha, mencoba AI, dan mengatur kapan AI membalas.",
          "Click a number's name in this list to fill in the AI's Business Info, try the AI out, and choose when the AI replies."
        )}
      </p>
    ),
  },
  {
    sasaran: "nav-langganan",
    judul: t("Paket & kuota", "Plans & quota"),
    isi: (
      <p>
        {t(
          "Lihat sisa kuota balasan AI dan pilih paket bila butuh lebih banyak nomor atau balasan. Pembayaran lewat QRIS, transfer bank, atau e-wallet.",
          "See how many AI replies you have left and pick a plan if you need more numbers or replies. Pay by QRIS, bank transfer, or e-wallet."
        )}
      </p>
    ),
  },
  {
    sasaran: "nav-panduan",
    judul: t("Butuh penjelasan lagi?", "Need a refresher?"),
    isi: <p>{t('Klik "Panduan" kapan saja untuk melihat penjelasan ini lagi.', 'Click "Guide" any time to see this walkthrough again.')}</p>,
  },
];

export const TUR_NOMOR: IsiTur = (t) => [
  {
    sasaran: "koneksi",
    judul: t("1. Sambungkan WhatsApp", "1. Connect WhatsApp"),
    isi: (
      <>
        <p>
          {t(
            "Buka WhatsApp di HP → titik tiga (Android) atau Pengaturan (iPhone) → Perangkat tertaut → Tautkan perangkat, lalu arahkan kamera ke kode QR di sini.",
            "Open WhatsApp on your phone → three dots (Android) or Settings (iPhone) → Linked devices → Link a device, then point the camera at the QR code here."
          )}
        </p>
        <p>{t('Setelah tersambung, statusnya berubah hijau "Terhubung".', 'Once linked, the status turns green: "Connected".')}</p>
      </>
    ),
  },
  {
    sasaran: "knowledge",
    judul: t("2. Isi Informasi Usaha (paling penting)", "2. Fill in your Business Info (most important)"),
    isi: (
      <>
        <p>
          {t("Bayangkan AI ini ", "Think of this AI as a ")}
          <b className="text-fg">{t("karyawan baru", "new employee")}</b>
          {t(". Informasi Usaha adalah ", ". Business Info is the ")}
          <b className="text-fg">{t("buku catatan", "notebook")}</b>
          {t(
            " yang kamu berikan kepadanya: siapa usahamu, apa yang dijual, harganya, jam buka, alamat, dan cara pesan.",
            " you hand them: who your business is, what you sell, prices, opening hours, address, and how to order."
          )}
        </p>
        <p>
          {t(
            "AI hanya menjawab dari catatan ini dan tidak mengarang. Yang tidak tertulis, ia akan bilang belum tahu dan menyerahkannya ke kamu.",
            "The AI only answers from these notes and never makes things up. If something isn't written down, it says it doesn't know yet and hands the chat over to you."
          )}
        </p>
        <p>
          {t(
            'Tidak perlu rapi: pilih jenis usaha, tulis atau tempel info usahamu dengan bahasa sendiri, lalu klik "Rapikan dengan AI". Periksa hasilnya, lalu simpan.',
            'It doesn\'t need to be neat: pick your business type, write or paste your business info in your own words, then click "Tidy up with AI". Check the result, then save.'
          )}
        </p>
      </>
    ),
  },
  {
    sasaran: "uji",
    judul: t("3. Coba dulu di sini", "3. Try it out here first"),
    isi: (
      <p>
        {t(
          'Ketik pertanyaan seperti pelanggan, mis. "harga paket berapa?". Jawaban di sini sama persis dengan yang akan dikirim ke WhatsApp, tapi tidak dikirim ke siapa pun.',
          'Type a question like a customer would, e.g. "how much is the package?". The answer here is exactly what would be sent on WhatsApp, but it isn\'t sent to anyone.'
        )}
      </p>
    ),
  },
  {
    sasaran: "saklar-bot",
    judul: t("Nyalakan / matikan AI", "Turn the AI on / off"),
    isi: (
      <p>
        {t(
          "Saklar ini menghidupkan atau mematikan balasan AI di nomor ini. Kalau mati, semua chat kamu balas sendiri.",
          "This switch turns AI replies on or off for this number. When it's off, you reply to every chat yourself."
        )}
      </p>
    ),
  },
  {
    sasaran: "pengaturan",
    judul: t("Kamu tetap pegang kendali", "You stay in control"),
    isi: (
      <p>
        {t(
          "AI menunggu beberapa detik dulu sebelum membalas, memberi kamu kesempatan menjawab sendiri. Begitu kamu membalas dari HP, AI otomatis diam di chat itu. Lama waktunya bisa diatur di sini.",
          "The AI waits a few seconds before replying, giving you a chance to answer yourself. As soon as you reply from your phone, the AI goes quiet in that chat. You can set how long it waits here."
        )}
      </p>
    ),
  },
  {
    sasaran: "histori",
    judul: t("Riwayat percakapan", "Conversation history"),
    isi: (
      <p>
        {t(
          `Semua chat ${UMUR_HISTORI_HARI} hari terakhir tercatat di sini: mana yang dibalas AI dan mana yang kamu balas sendiri. Yang lebih lama terhapus otomatis.`,
          `Every chat from the last ${UMUR_HISTORI_HARI} days is recorded here: which ones the AI answered and which you answered yourself. Older chats are deleted automatically.`
        )}
      </p>
    ),
  },
];

/** Tur panel admin (bahasa Indonesia saja, seperti panel admin). */
export const TUR_ADMIN: IsiTur = () => [
  {
    judul: "Halo, saya GerCep 👋",
    isi: (
      <>
        <p>Saya akan menemani Anda keliling panel admin. Semua angka di sini dihitung langsung dari data 30 hari terakhir.</p>
        <p>Setelah tur, saya tetap berjaga di pojok kanan bawah: ketuk saya kapan saja untuk ringkasan, hal yang perlu ditindak, atau biaya AI.</p>
      </>
    ),
  },
  {
    sasaran: "admin-kpi",
    judul: "Angka kunci",
    isi: <p>Pendapatan, pelanggan berbayar, balasan AI, dan laba kotor, masing-masing dibanding 30 hari sebelumnya.</p>,
  },
  {
    sasaran: "admin-pendukung",
    judul: "Angka pendukung",
    isi: <p>Pendaftar baru, nomor yang tersambung, langganan yang akan berakhir, dan pembayaran yang masih menunggu. Klik kotaknya untuk membuka daftar lengkap.</p>,
  },
  {
    sasaran: "admin-perhatian",
    judul: "Perlu perhatian",
    isi: <p>Daftar yang sebaiknya ditindaklanjuti hari ini: nomor terputus, tagihan tertunda, langganan hampir habis, dan kuota yang menipis.</p>,
  },
  {
    sasaran: "admin-paket",
    judul: "Sebaran paket",
    isi: <p>Berapa pelanggan aktif di tiap paket dan berapa yang masih gratis: bahan untuk menentukan promo atau paket baru.</p>,
  },
];
