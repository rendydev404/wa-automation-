import type { FiturApi } from "./api-def";

/**
 * Daftar endpoint API v1 mesin untuk dokumentasi publik (/docs/api) dan spesifikasi OpenAPI (/docs/api/openapi.json).
 * Satu sumber: halaman & OpenAPI dibangun dari sini. Murni (tanpa I/O).
 */
export interface EndpointDok {
  metode: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  jalur: string;
  fitur: FiturApi | null;
  ringkas: { id: string; en: string };
  /** Contoh badan permintaan (JSON). */
  minta?: unknown;
  /** Contoh jawaban sukses. */
  jawab: unknown;
  status?: number;
}

const BOT = { nomor_id: "12", bot_aktif: true, instruksi: "Jawab singkat dan ramah.", tunggu_detik: 5, tunggu_baca_detik: 45, jeda_detik: 1800, saring_spam: true, saring_prospek: false, belajar: true };
const PRODUK = { id: "44", nama: "Paket Hemat", harga: 25000, deskripsi: "Nasi + ayam + es teh", tersedia: true, ada_foto: true, urutan: 1, diubah: 1794200000 };

const NOMOR = { id: "12", label: "CS Toko", status: "terhubung", wa_id: "6281234567890", nama_wa: "Toko Maju", bot_aktif: true, dibuat: 1794200000 };

export const ENDPOINT_DOK: EndpointDok[] = [
  {
    metode: "GET",
    jalur: "/status",
    fitur: null,
    ringkas: { id: "Versi mesin, status lisensi, fitur aktif, jumlah nomor", en: "Engine version, license status, enabled features, number count" },
    jawab: { versi: "1.0.0", lisensi: { status: "aktif", aplikasi: "KasirKu", fitur: ["nomor", "pesan.kirim", "pesan.terima", "ai", "knowledge"], batas: { nomor: 50, pesan_menit: 20, kontak_baru_hari: 50, instalasi: 1 }, berlaku_sampai: 1794800000 }, nomor: { total: 3, terhubung: 2 } },
  },
  { metode: "GET", jalur: "/nomor", fitur: "nomor", ringkas: { id: "Daftar nomor (paginasi kursor ?batas&setelah)", en: "List numbers (cursor pagination ?batas&setelah)" }, jawab: { data: [NOMOR], berikutnya: null } },
  { metode: "POST", jalur: "/nomor", fitur: "nomor", ringkas: { id: "Tambah nomor baru (lalu ambil QR)", en: "Add a number (then fetch its QR)" }, minta: { label: "CS Toko" }, jawab: { ...NOMOR, status: "menunggu_qr", wa_id: null, nama_wa: null }, status: 201 },
  { metode: "GET", jalur: "/nomor/{id}", fitur: "nomor", ringkas: { id: "Detail satu nomor", en: "Get one number" }, jawab: NOMOR },
  {
    metode: "PATCH",
    jalur: "/nomor/{id}",
    fitur: "nomor",
    ringkas: { id: "Ubah label & pengaturan bot", en: "Update label & bot settings" },
    minta: { bot_aktif: true, instruksi: "Jawab singkat dan ramah.", tunggu_detik: 5, tunggu_baca_detik: 45, jeda_detik: 1800 },
    jawab: NOMOR,
  },
  { metode: "DELETE", jalur: "/nomor/{id}", fitur: "nomor", ringkas: { id: "Hapus nomor beserta Informasi Usaha-nya", en: "Delete a number and its Business Info" }, jawab: { ok: true } },
  { metode: "GET", jalur: "/nomor/{id}/qr", fitur: "nomor", ringkas: { id: "QR untuk dipindai (teks + PNG base64)", en: "QR to scan (text + PNG base64)" }, jawab: { qr: "2@AbC...", png_base64: "iVBORw0KGgo...", kedaluwarsa_dalam_detik: 55 } },
  { metode: "POST", jalur: "/nomor/{id}/pairing", fitur: "nomor", ringkas: { id: "Kode pairing lewat nomor HP (tanpa QR)", en: "Pairing code via phone number (no QR)" }, minta: { nomor_hp: "6281234567890" }, jawab: { kode: "ABCD-1234" } },
  { metode: "DELETE", jalur: "/nomor/{id}/sesi", fitur: "nomor", ringkas: { id: "Logout WhatsApp (satu-satunya cara memutus nomor)", en: "Log out WhatsApp (the only way to disconnect)" }, jawab: { ok: true } },
  {
    metode: "POST",
    jalur: "/pesan",
    fitur: "pesan.kirim",
    ringkas: { id: "Kirim pesan (masuk antrean anti-blokir)", en: "Send a message (anti-ban queue)" },
    minta: { nomor_id: "12", ke: "6289876543210", teks: "Pesanan kakak siap diambil!" },
    jawab: { id: "981", status: "antre" },
    status: 202,
  },
  { metode: "GET", jalur: "/pesan/{id}", fitur: "pesan.kirim", ringkas: { id: "Status pesan", en: "Message status" }, jawab: { id: "981", nomor_id: "12", ke: "6289876543210", status: "terkirim", alasan: null, dibuat: 1794200100, berubah: 1794200103 } },
  { metode: "GET", jalur: "/webhook", fitur: "pesan.terima", ringkas: { id: "Pengaturan webhook aplikasi Anda", en: "Your app's webhook settings" }, jawab: { url: "https://app-anda.com/webhook/chatgercep", event: ["pesan.masuk", "pesan.dibalas_ai"], aktif: true, gagal_sejak: null } },
  {
    metode: "PUT",
    jalur: "/webhook",
    fitur: "pesan.terima",
    ringkas: { id: "Atur URL & event (rahasia tampil sekali)", en: "Set URL & events (secret shown once)" },
    minta: { url: "https://app-anda.com/webhook/chatgercep", event: ["pesan.masuk", "pesan.dibalas_ai", "pesan.status"] },
    jawab: { url: "https://app-anda.com/webhook/chatgercep", event: ["pesan.masuk", "pesan.dibalas_ai", "pesan.status"], rahasia: "whsec_..." },
  },
  { metode: "POST", jalur: "/webhook/uji", fitur: "pesan.terima", ringkas: { id: "Kirim event uji ke webhook", en: "Send a test event" }, jawab: { terkirim: true, status: 200 } },
  {
    metode: "POST",
    jalur: "/ai/jawab",
    fitur: "ai",
    ringkas: { id: "Tanya bot (berdasarkan Informasi Usaha nomor)", en: "Ask the bot (uses the number's Business Info)" },
    minta: { nomor_id: "12", pertanyaan: "Ada paket hemat?", id_sesi: "pelanggan-77" },
    jawab: { jawaban: "Ada kak! Paket Hemat Rp25.000 isi nasi + ayam + es teh 😊", ms: 1840, token: { masuk: 2110, keluar: 64 } },
  },
  { metode: "GET", jalur: "/nomor/{id}/knowledge", fitur: "knowledge", ringkas: { id: "Daftar dokumen product knowledge", en: "List knowledge documents" }, jawab: { data: [{ id: "5", judul: "Menu & harga", sumber: "teks", karakter: 2400, dibuat: 1794200000 }] } },
  {
    metode: "POST",
    jalur: "/nomor/{id}/knowledge",
    fitur: "knowledge",
    ringkas: { id: "Tambah dokumen (JSON teks, atau multipart berkas PDF/teks)", en: "Add a document (JSON text, or multipart PDF/text file)" },
    minta: { judul: "Menu & harga", teks: "Paket Hemat Rp25.000: nasi, ayam, es teh..." },
    jawab: { id: "5", judul: "Menu & harga", sumber: "teks", karakter: 2400, dibuat: 1794200000 },
    status: 201,
  },
  { metode: "GET", jalur: "/nomor/{id}/knowledge/{dok}", fitur: "knowledge", ringkas: { id: "Isi satu dokumen", en: "Get one document" }, jawab: { id: "5", judul: "Menu & harga", teks: "Paket Hemat Rp25.000: ..." } },
  { metode: "DELETE", jalur: "/nomor/{id}/knowledge/{dok}", fitur: "knowledge", ringkas: { id: "Hapus dokumen", en: "Delete a document" }, jawab: { ok: true } },
  {
    metode: "POST",
    jalur: "/kontak/cek",
    fitur: "kontak.cek",
    ringkas: { id: "Cek nomor HP terdaftar di WhatsApp (maks 20 per panggilan)", en: "Check phone numbers are on WhatsApp (max 20 per call)" },
    minta: { nomor_id: "12", nomor: ["081234567890", "6289876543210"] },
    jawab: { data: [{ nomor: "6281234567890", sah: true, terdaftar: true }, { nomor: "6289876543210", sah: true, terdaftar: false }] },
  },
  { metode: "GET", jalur: "/nomor/{id}/profil", fitur: "profil", ringkas: { id: "Nama & foto profil nomor yang terhubung", en: "Name & profile photo of a connected number" }, jawab: { wa_id: "6281234567890", nama_wa: "Toko Maju", status: "terhubung", foto_url: "https://pps.whatsapp.net/..." } },
  { metode: "GET", jalur: "/nomor/{id}/bot", fitur: "bot", ringkas: { id: "Pengaturan bot AI nomor", en: "A number's AI bot settings" }, jawab: BOT },
  {
    metode: "PATCH",
    jalur: "/nomor/{id}/bot",
    fitur: "bot",
    ringkas: { id: "Ubah pengaturan bot (hanya kolom yang dikirim)", en: "Update bot settings (only the fields sent)" },
    minta: { bot_aktif: true, saring_spam: true, saring_prospek: false, belajar: true, tunggu_detik: 5 },
    jawab: BOT,
  },
  { metode: "GET", jalur: "/templat-ai", fitur: "templat", ringkas: { id: "Daftar template instruksi per jenis usaha", en: "List instruction templates per business type" }, jawab: { data: [{ slug: "laundry", nama: "Laundry", nama_en: "Laundry" }] } },
  { metode: "GET", jalur: "/templat-ai/{slug}", fitur: "templat", ringkas: { id: "Isi satu template (ganti penanda [ ... ] lalu pasang ke instruksi bot)", en: "One template's text (replace [ ... ] markers, then set as bot instructions)" }, jawab: { slug: "laundry", nama: "Laundry", teks: "Kamu adalah CS [Nama Laundry]..." } },
  {
    metode: "POST",
    jalur: "/ai/rapikan",
    fitur: "ai.rapikan",
    ringkas: { id: "Rapikan tulisan usaha jadi dokumen siap pakai (tidak menyimpan)", en: "Tidy business notes into a ready-to-use document (not saved)" },
    minta: { teks: "jual ayam geprek 15rb, buka 10-21, antar area kota" },
    jawab: { teks: "## Produk & harga\n- Ayam geprek: Rp15.000\n...", kurang: ["Cara bayar apa saja?"], peringatan: [] },
  },
  {
    metode: "POST",
    jalur: "/ai/transkripsi",
    fitur: "ai.transkripsi",
    ringkas: { id: "Suara jadi teks (JSON base64 atau multipart `berkas`, maks 10 MB)", en: "Speech to text (JSON base64 or multipart `berkas`, max 10 MB)" },
    minta: { audio_base64: "T2dnUwACAAAAAAAA...", mime: "audio/ogg" },
    jawab: { teks: "Kak, besok buka jam berapa ya?", ms: 820 },
  },
  { metode: "GET", jalur: "/nomor/{id}/pelajaran", fitur: "pelajaran", ringkas: { id: "Jawaban admin yang dipelajari AI (kursor ?setelah)", en: "Owner replies learned by the AI (cursor ?setelah)" }, jawab: { data: [{ id: "31", pertanyaan: "Bisa COD?", jawaban: "Bisa kak, area kota saja", dipakai: 4, terakhir: 1794200000 }], total: 1, berikutnya: null } },
  { metode: "DELETE", jalur: "/nomor/{id}/pelajaran/{pid}", fitur: "pelajaran", ringkas: { id: "Hapus satu pelajaran", en: "Delete one lesson" }, jawab: { ok: true } },
  { metode: "DELETE", jalur: "/nomor/{id}/pelajaran", fitur: "pelajaran", ringkas: { id: "Hapus semua pelajaran nomor", en: "Delete all of a number's lessons" }, jawab: { dihapus: 12 } },
  { metode: "GET", jalur: "/nomor/{id}/produk", fitur: "katalog", ringkas: { id: "Katalog produk nomor", en: "A number's product catalog" }, jawab: { data: [PRODUK] } },
  {
    metode: "POST",
    jalur: "/nomor/{id}/produk",
    fitur: "katalog",
    ringkas: { id: "Tambah produk (+ foto base64 JPG/PNG/WebP, maks 1,5 MB)", en: "Add a product (+ base64 JPG/PNG/WebP photo, max 1.5 MB)" },
    minta: { nama: "Paket Hemat", harga: 25000, deskripsi: "Nasi + ayam + es teh", tersedia: true, foto_base64: "/9j/4AAQ..." },
    jawab: PRODUK,
    status: 201,
  },
  { metode: "GET", jalur: "/nomor/{id}/produk/{pid}", fitur: "katalog", ringkas: { id: "Satu produk (?foto=1 menyertakan foto_base64)", en: "One product (?foto=1 includes foto_base64)" }, jawab: PRODUK },
  { metode: "PATCH", jalur: "/nomor/{id}/produk/{pid}", fitur: "katalog", ringkas: { id: "Ubah produk (foto_base64: null = hapus foto)", en: "Update a product (foto_base64: null removes the photo)" }, minta: { harga: 27000, tersedia: false }, jawab: { ...PRODUK, harga: 27000, tersedia: false } },
  { metode: "DELETE", jalur: "/nomor/{id}/produk/{pid}", fitur: "katalog", ringkas: { id: "Hapus produk", en: "Delete a product" }, jawab: { ok: true } },
  {
    metode: "GET",
    jalur: "/nomor/{id}/statistik",
    fitur: "statistik",
    ringkas: { id: "Pesan masuk & dibalas bot per hari (?hari=1–90)", en: "Incoming & bot-replied messages per day (?hari=1–90)" },
    jawab: { nomor_id: "12", dari: "2026-11-04", sampai: "2026-11-10", total: { masuk: 412, dibalas: 380 }, data: [{ tanggal: "2026-11-10", masuk: 61, dibalas: 57 }] },
  },
  { metode: "POST", jalur: "/alat/cek-spam", fitur: "spam.cek", ringkas: { id: "Cek teks promosi judi online (tanpa AI)", en: "Check text for online gambling promos (no AI)" }, minta: { teks: "Slot gacor maxwin, depo 10rb..." }, jawab: { spam: true, skor: 7, alasan: "Promosi judi online (slot, gacor, maxwin, depo)" } },
];

export const EVENT_DOK: { jenis: string; ket: { id: string; en: string }; data: unknown }[] = [
  { jenis: "pesan.masuk", ket: { id: "Pesan masuk dari pelanggan", en: "Incoming customer message" }, data: { kunci: "c_9f2a...", dari: "6289876543210", nama: "Budi", teks: "Ada paket hemat?" } },
  { jenis: "pesan.dibalas_ai", ket: { id: "Bot AI membalas", en: "The AI bot replied" }, data: { kunci: "c_9f2a...", teks: "Ada kak! Paket Hemat Rp25.000 ..." } },
  { jenis: "pesan.manusia", ket: { id: "Pemilik membalas dari HP", en: "The owner replied from the phone" }, data: { kunci: "c_9f2a...", teks: "Siap kak" } },
  { jenis: "pesan.status", ket: { id: "Status pesan kiriman API berubah", en: "Status of an API message changed" }, data: { id_pesan: "981", status: "dibaca" } },
  { jenis: "nomor.terhubung", ket: { id: "Nomor tersambung ke WhatsApp", en: "Number connected to WhatsApp" }, data: { wa_id: "6281234567890", nama: "Toko Maju" } },
  { jenis: "nomor.terputus", ket: { id: "Nomor terputus (keluar = perangkat dicabut)", en: "Number disconnected (keluar = device unlinked)" }, data: { kode: 401, keluar: true } },
  { jenis: "lisensi.peringatan", ket: { id: "Lisensi segera habis (24 jam & 6 jam)", en: "License expiring soon (24 h & 6 h)" }, data: { sisa_detik: 86000, berlaku_sampai: 1794800000, status: "aktif" } },
];
