/**
 * Panduan bergambar cara memakai ChatGerCep: satu sumber untuk halaman publik /panduan dan untuk bot CS ChatGerCep
 * (katalog gambar per kategori + kartu knowledge di sinkron-cg.ts). Murni data, tanpa I/O.
 *
 * Gambar: public/panduan/<gambar>.webp (web; desktop juga punya <gambar>-900.webp untuk layar kecil) dan
 * public/panduan/wa/<gambar>.jpg (dikirim bot ke WhatsApp). Sumber PNG-nya ada di panduan-pengguna/gambar.
 */

import { AWALAN_PANDUAN } from "./katalog-def";

export interface Teks {
  id: string;
  en: string;
}

export interface LangkahPanduan {
  /** Nama berkas tanpa ekstensi. */
  gambar: string;
  /** Tangkapan layar HP (potret): ditampilkan berjajar dan tanpa varian -900. */
  hp?: boolean;
  /** Ukuran asli gambar web (untuk width/height, cegah layout bergeser). */
  w: number;
  h: number;
  judul: Teks;
  teks: Teks;
}

export interface KategoriPanduan {
  /** Jangkar di halaman (#id) dan kunci kategori. */
  id: string;
  judul: Teks;
  ringkas: Teks;
  /** Kata yang biasa dipakai pelanggan saat bertanya (untuk pencarian knowledge bot). */
  kataKunci: string;
  langkah: LangkahPanduan[];
}

const D = (gambar: string, h: number, judul: Teks, teks: Teks): LangkahPanduan => ({ gambar, w: 1600, h, judul, teks });
const H = (gambar: string, judul: Teks, teks: Teks): LangkahPanduan => ({ gambar, hp: true, w: 720, h: 1558, judul, teks });

export const PANDUAN: KategoriPanduan[] = [
  {
    id: "daftar",
    judul: { id: "Daftar akun", en: "Create an account" },
    ringkas: { id: "Buat akun gratis dalam satu menit.", en: "Create a free account in a minute." },
    kataKunci: "cara daftar, daftar akun, buat akun, registrasi, sign up, login, masuk, mulai dari mana, cara mulai, cara pakai",
    langkah: [
      D("01-daftar-akun", 937, { id: "Buat akun baru", en: "Create a new account" }, {
        id: "Buka chatgercep.com lalu klik Daftar. Isi nama, email, dan password (minimal 10 karakter, campur huruf dan angka). Centang persetujuan, lalu klik Buat akun.",
        en: "Open chatgercep.com and click Sign up. Fill in your name, email, and a password (at least 10 characters, mixing letters and numbers). Tick the agreement, then click Create account.",
      }),
      D("02-dashboard-tambah-nomor", 937, { id: "Masuk ke halaman Ringkasan", en: "You land on the Overview page" }, {
        id: "Setelah daftar, Anda langsung masuk ke halaman Ringkasan. Untuk mulai, klik tombol hijau Tambah nomor.",
        en: "Right after signing up you land on the Overview page. To start, click the green Add number button.",
      }),
    ],
  },
  {
    id: "sambung-qr",
    judul: { id: "Sambungkan WhatsApp (laptop + HP)", en: "Connect WhatsApp (computer + phone)" },
    ringkas: { id: "Scan kode QR dari HP, seperti membuka WhatsApp Web.", en: "Scan a QR code with your phone, just like WhatsApp Web." },
    kataKunci: "cara sambung whatsapp, sambungkan nomor, hubungkan wa, scan qr, kode qr, barcode, tautkan perangkat, perangkat tertaut, connect, tambah nomor",
    langkah: [
      D("03-dialog-tambah-nomor", 937, { id: "Beri nama nomor", en: "Name the number" }, {
        id: "Tulis nama bebas untuk nomor ini (misalnya CS Toko). Centang kotak persetujuan, lalu klik Buat & tampilkan QR.",
        en: "Give the number any name (e.g. Store CS). Tick the checkbox, then click Create & show QR.",
      }),
      D("04-scan-qr", 1581, { id: "Kode QR muncul", en: "The QR code appears" }, {
        id: "Biarkan halaman ini tetap terbuka di laptop. Kode QR berganti sendiri setiap beberapa detik, itu normal.",
        en: "Keep this page open on your computer. The QR code refreshes every few seconds; that's normal.",
      }),
      D("05-scan-dari-hp", 1003, { id: "Scan dari HP", en: "Scan with your phone" }, {
        id: "Di HP yang nomornya mau disambungkan: buka WhatsApp, ketuk titik tiga, pilih Perangkat tertaut, ketuk Tautkan perangkat, lalu arahkan kamera ke kode QR di laptop. iPhone: Pengaturan > Perangkat tertaut.",
        en: "On the phone with that number: open WhatsApp, tap the three dots, choose Linked devices, tap Link a device, then point the camera at the QR code. iPhone: Settings > Linked devices.",
      }),
      D("08-terhubung", 1171, { id: "Berhasil tersambung", en: "Connected" }, {
        id: "Dalam beberapa detik tulisan berubah menjadi hijau Terhubung dan nomor Anda tampil. HP tetap bisa dipakai seperti biasa.",
        en: "Within seconds the status turns green: Connected, and your number shows up. You can keep using your phone as usual.",
      }),
    ],
  },
  {
    id: "sambung-kode",
    judul: { id: "Sambungkan WhatsApp (hanya 1 HP)", en: "Connect WhatsApp (phone only)" },
    ringkas: { id: "Tidak punya laptop? Pakai kode 8 karakter, tanpa scan QR.", en: "No computer? Use an 8-character code instead of a QR scan." },
    kataKunci: "cuma punya 1 hp, satu hp, tanpa laptop, tidak bisa scan, gak bisa scan qr, kode 8 digit, kode tautan, pairing code, nomor telepon, dari hp",
    langkah: [
      H("hp-01-dashboard-tambah-nomor", { id: "Ketuk Tambah nomor", en: "Tap Add number" }, {
        id: "Buka dashboard ChatGerCep di browser HP (misalnya Chrome), lalu ketuk Tambah nomor dan beri nama nomornya.",
        en: "Open the ChatGerCep dashboard in your phone's browser (e.g. Chrome), tap Add number and give it a name.",
      }),
      H("hp-02-pilih-nomor-hp", { id: "Pilih Nomor HP", en: "Choose Phone number" }, {
        id: "Di bagian Koneksi, ketuk tab Nomor HP (bukan Kode QR).",
        en: "In the Connection section, tap the Phone number tab (not QR code).",
      }),
      H("hp-03-isi-nomor", { id: "Tulis nomor WhatsApp", en: "Enter your WhatsApp number" }, {
        id: "Tulis nomor WhatsApp yang mau disambungkan (boleh diawali 08), lalu ketuk Dapatkan kode 8 digit.",
        en: "Enter the WhatsApp number you want to connect, then tap Get 8-character code.",
      }),
      H("hp-04-kode", { id: "Salin kodenya", en: "Copy the code" }, {
        id: "Kode 8 karakter muncul. Ketuk Salin kode, lalu buka aplikasi WhatsApp.",
        en: "An 8-character code appears. Tap Copy code, then open the WhatsApp app.",
      }),
      D("07b-masukkan-kode-di-hp", 1003, { id: "Masukkan kode di WhatsApp", en: "Enter the code in WhatsApp" }, {
        id: "Di WhatsApp: titik tiga > Perangkat tertaut > Tautkan perangkat > ketuk Tautkan dengan nomor telepon saja, lalu masukkan kodenya. Kembali ke dashboard: statusnya berubah hijau Terhubung.",
        en: "In WhatsApp: three dots > Linked devices > Link a device > tap Link with phone number instead, then enter the code. Back in the dashboard the status turns green: Connected.",
      }),
    ],
  },
  {
    id: "knowledge",
    judul: { id: "Isi product knowledge", en: "Add your product knowledge" },
    ringkas: { id: "Ajari AI tentang usaha Anda: produk, harga, jam buka, cara pesan.", en: "Teach the AI about your business: products, prices, hours, how to order." },
    kataKunci: "cara isi knowledge, product knowledge, base knowledge, isi info usaha, ajari ai, harga produk, menu, upload pdf, unggah pdf, daftar harga, rapikan dengan ai",
    langkah: [
      D("09-buka-knowledge", 937, { id: "Buka tab Knowledge", en: "Open the Knowledge tab" }, {
        id: "Di halaman nomor Anda, klik tab Knowledge lalu pilih Tulis dengan bantuan AI.",
        en: "On your number's page, click the Knowledge tab and choose Write with AI.",
      }),
      D("10-tulis-info-usaha", 937, { id: "Tulis info usaha seperti chat biasa", en: "Write your business info like a normal chat" }, {
        id: "Tulis apa yang dijual, harga, jam buka, alamat, cara pesan, dan cara bayar. Tidak perlu rapi. Lalu klik Rapikan dengan AI.",
        en: "Write what you sell, prices, opening hours, address, how to order, and how to pay. It doesn't need to be neat. Then click Tidy up with AI.",
      }),
      D("11-periksa-lalu-simpan", 1288, { id: "Periksa, lalu simpan", en: "Check it, then save" }, {
        id: "AI merapikan tulisan Anda. Pastikan harga dan jam buka sudah benar (boleh diubah langsung), lalu klik Simpan ke base knowledge.",
        en: "The AI tidies up your text. Make sure prices and hours are right (you can edit directly), then click Save to product knowledge.",
      }),
      D("12-tersimpan", 937, { id: "Tersimpan", en: "Saved" }, {
        id: "Muncul tulisan hijau Tersimpan. AI hanya menjawab dari catatan ini dan tidak mengarang. Ada perubahan harga? Perbarui kapan saja.",
        en: "A green Saved message appears. The AI only answers from these notes and never makes things up. Prices changed? Update them anytime.",
      }),
      D("14-unggah-berkas", 937, { id: "Cara lain: unggah PDF", en: "Or upload a PDF" }, {
        id: "Sudah punya menu atau daftar harga dalam PDF? Klik Unggah berkas, lalu pilih file-nya (maksimal 10 MB).",
        en: "Already have a menu or price list as a PDF? Click Upload file and choose it (max 10 MB).",
      }),
    ],
  },
  {
    id: "uji-bot",
    judul: { id: "Coba dulu di Uji bot", en: "Try it in Test bot" },
    ringkas: { id: "Tanya seperti pelanggan sebelum AI membalas pelanggan sungguhan.", en: "Ask like a customer before the AI replies to real ones." },
    kataKunci: "uji bot, test bot, coba bot, coba ai, simulasi, tes jawaban, jawaban ai salah, cek jawaban",
    langkah: [
      D("15-uji-bot", 937, { id: "Tanya seperti pelanggan", en: "Ask like a customer" }, {
        id: "Klik tab Uji bot, ketik pertanyaan seperti pelanggan (misalnya harganya berapa?), lalu kirim. Uji bot tidak mengirim pesan ke WhatsApp siapa pun. Jawaban kurang pas? Perbaiki di tab Knowledge.",
        en: "Click the Test bot tab, type a question like a customer would (e.g. how much is it?) and send. Test bot never messages anyone on WhatsApp. Answer not quite right? Fix it in the Knowledge tab.",
      }),
    ],
  },
  {
    id: "bayar",
    judul: { id: "Bayar langganan", en: "Pay for a plan" },
    ringkas: { id: "Pilih paket, bayar lewat GoPay atau transfer bank, paket langsung aktif.", en: "Pick a plan, pay by GoPay or bank transfer, and it activates instantly." },
    kataKunci: "cara bayar, cara langganan, beli paket, pilih paket, pembayaran, transfer, virtual account, va, gopay, bayar pakai apa, aktifkan paket, perpanjang",
    langkah: [
      D("17-pilih-paket", 937, { id: "Pilih paket", en: "Pick a plan" }, {
        id: "Klik menu Langganan. Pilih paket yang sesuai, lalu klik Pilih paket.",
        en: "Click Subscription in the menu. Choose a plan, then click Choose plan.",
      }),
      D("18-pilih-metode-bayar", 937, { id: "Pilih cara bayar", en: "Choose how to pay" }, {
        id: "Pilih cara bayar yang Anda punya, lalu klik tombol hijau Bayar.",
        en: "Choose a payment method you have, then click the green Pay button.",
      }),
      D("19-tagihan-gopay", 937, { id: "Bayar dengan GoPay", en: "Pay with GoPay" }, {
        id: "Buka aplikasi Gojek/GoPay, ketuk Bayar (scan), arahkan ke kode QR, lalu masukkan PIN. Bayar sebelum waktunya habis.",
        en: "Open the Gojek/GoPay app, tap Pay (scan), point it at the QR code, then enter your PIN. Pay before the timer runs out.",
      }),
      D("20-tagihan-transfer-bank", 937, { id: "Atau transfer bank", en: "Or bank transfer" }, {
        id: "Salin nomor virtual account, lalu transfer dari m-banking atau ATM sesuai petunjuk di Cara bayar. Jumlahnya harus sama persis.",
        en: "Copy the virtual account number and transfer from mobile banking or an ATM following How to pay. The amount must match exactly.",
      }),
      H("hp-06-buka-gopay", { id: "Bayar dari HP", en: "Paying on your phone" }, {
        id: "Membuka dashboard dari HP? Cukup ketuk Buka GoPay, lalu masukkan PIN.",
        en: "Using the dashboard on your phone? Just tap Open GoPay, then enter your PIN.",
      }),
      D("21-pembayaran-berhasil", 937, { id: "Pembayaran berhasil", en: "Payment successful" }, {
        id: "Halaman berubah sendiri menjadi Pembayaran berhasil. Paket langsung aktif, tanpa konfirmasi manual.",
        en: "The page switches to Payment successful by itself. Your plan is active right away, no manual confirmation needed.",
      }),
    ],
  },
  {
    id: "nyalakan",
    judul: { id: "Nyalakan AI & pantau", en: "Turn the AI on & keep an eye on it" },
    ringkas: { id: "Pastikan saklar menyala, lalu AI membalas pelanggan 24 jam.", en: "Make sure the switch is on, and the AI replies to customers 24/7." },
    kataKunci: "nyalakan ai, aktifkan bot, saklar, balasan otomatis, ai tidak membalas, bot diam, matikan ai, pantau, statistik, ringkasan",
    langkah: [
      D("16-saklar-balasan-otomatis", 937, { id: "Saklar Balasan otomatis harus hijau", en: "The Auto-reply switch must be green" }, {
        id: "Buka nomor Anda. Di kanan atas ada saklar Balasan otomatis: hijau berarti AI membalas chat. Ingin AI berhenti sementara? Matikan saklarnya.",
        en: "Open your number. At the top right there's the Auto-reply switch: green means the AI replies. Want it to pause? Turn the switch off.",
      }),
      D("22-dashboard-siap", 937, { id: "Pantau dari Ringkasan", en: "Track it from the Overview" }, {
        id: "Di halaman Ringkasan terlihat paket aktif, sisa kuota balasan AI, dan jumlah pesan yang masuk serta dibalas AI setiap hari.",
        en: "The Overview page shows your active plan, remaining AI replies, and how many messages came in and got answered each day.",
      }),
    ],
  },
];

/** Awalan nama item katalog panduan di nomor CS ChatGerCep (lihat katalog-def.ts: bukan produk, tanpa harga). */
export { AWALAN_PANDUAN };

/** Nama item katalog satu langkah, mis. "📘 Panduan 2 · Sambungkan WhatsApp (laptop + HP) (1/4)". */
export const namaItemPanduan = (k: number, kat: KategoriPanduan, i: number): string =>
  `${AWALAN_PANDUAN}${k + 1} · ${kat.judul.id} (${i + 1}/${kat.langkah.length})`;
