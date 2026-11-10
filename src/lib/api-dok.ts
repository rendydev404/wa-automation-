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
