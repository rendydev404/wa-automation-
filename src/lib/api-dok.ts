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

const JALUR = {
  nomor_id: "12",
  jalur: "resmi",
  kebijakan: "pilih",
  phone_number_id: "109876543210987",
  waba_id: "203040506070809",
  nomor: "6281234567890",
  nama: "Toko Maju",
  kualitas: "GREEN",
  tier: "TIER_1K",
  status: "CONNECTED",
  alasan: null,
  webhook_url: "https://mesin-anda.com/api/wa/meta/Xk3p...",
  verify_token: "vt_9QmZ...",
  kuota: { terpakai: 37, batas: 1000 },
};
const TEMPLAT_WA = { nama: "prospek_lanjutan_1", bahasa: "id", kategori: "MARKETING", kode_tahap: "prospek_1", isi: "Halo {{nama}}, kemarin sempat tanya soal pesanan di {{usaha}}. Ada yang bisa kami bantu lagi?", status: "APPROVED", alasan: null, diperbarui: 1794200000 };
const SETELAN_FU = { aktif: true, ulang_aktif: false, jam_mulai: 9, jam_selesai: 20, batas_harian: 10, jeda_panas_jam: 1, jeda_hangat_jam: 3, tahap2_jam: 24, tahap3_jam: 48, maks_tahap: 3, siklus_ulang_hari: 30 };
const FOLLOWUP = {
  nomor_id: "12",
  jalur: "baileys",
  setelan: SETELAN_FU,
  status: { boleh: true, terhubung: true, tahan: null, rem: null, kirim_hari_ini: 2, batas_hari_ini: 10, sebab_batas: "setelan", sisa_kuota_ai: null, jumlah: { terkirim: 41, dibalas: 12, stop: 1, berjalan: 6 } },
  rentang: { jam_mulai: { min: 0, maks: 23 }, jam_selesai: { min: 1, maks: 24 }, batas_harian: { min: 1, maks: 40 }, maks_tahap: { min: 1, maks: 3 } },
};
const ANTREAN_FU = {
  jenis: "prospek",
  kunci: "c_9f2a...",
  status: "jalan",
  tujuan: "6289876543210",
  nama: "Budi",
  minat: "hangat",
  tahap: 1,
  maks: 3,
  jadwal: 1794286500,
  diperbarui: 1794200100,
  draf: "Kak Budi, paket hemat yang kemarin ditanyakan masih bisa dipesan ya. Mau dibantu sekalian?",
  pesan: [{ teks: "Halo kak Budi, ada yang bisa kami bantu soal pesanannya?", pada: 1794200100, ack: 3 }],
  dibalas: null,
  alasan: null,
  percakapan_id: "88",
};

export const ENDPOINT_DOK: EndpointDok[] = [
  {
    metode: "GET",
    jalur: "/status",
    fitur: null,
    ringkas: { id: "Versi mesin, mode (sandbox/production), status lisensi, fitur aktif, jumlah nomor", en: "Engine version, mode (sandbox/production), license status, enabled features, number count" },
    jawab: { versi: "1.0.0", mode: "production", lisensi: { status: "aktif", aplikasi: "KasirKu", fitur: ["nomor", "pesan.kirim", "pesan.terima", "ai", "knowledge"], batas: { nomor: 50, pesan_menit: 20, kontak_baru_hari: 50, instalasi: 1 }, berlaku_sampai: 1794800000 }, nomor: { total: 3, terhubung: 2 } },
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
  { metode: "GET", jalur: "/nomor/{id}/percakapan", fitur: "percakapan", ringkas: { id: "Daftar chat (terbaru dulu, kursor ?setelah, ?cari, ?filter=semua|bot|manusia|lead)", en: "List chats (newest first, ?setelah cursor, ?cari, ?filter=semua|bot|manusia|lead)" }, jawab: { data: [{ id: "88", kunci: "c_9f2a...", telepon: "6289876543210", nama: "Budi", cuplikan: "Ada paket hemat?", pengirim_akhir: "pelanggan", jumlah: { masuk: 4, ai: 3, manusia: 0 }, terakhir_pada: 1794200100, bot: "aktif", jeda_sampai: 0, spam: false, minat: "hangat" }], berikutnya: "1794200100_88" } },
  { metode: "GET", jalur: "/nomor/{id}/percakapan/{pid}/pesan", fitur: "percakapan", ringkas: { id: "Isi pesan satu chat (lama -> baru, kursor ?sebelum)", en: "Messages of one chat (oldest -> newest, ?sebelum cursor)" }, jawab: { percakapan: { id: "88", kunci: "c_9f2a...", telepon: "6289876543210", nama: "Budi", cuplikan: "Ada paket hemat?", pengirim_akhir: "pelanggan", jumlah: { masuk: 4, ai: 3, manusia: 0 }, terakhir_pada: 1794200100, bot: "aktif", jeda_sampai: 0, spam: false, minat: "hangat" }, data: [{ id: "5012", peran: "pelanggan", teks: "Ada paket hemat?", waktu: 1794200100 }], ada_sebelumnya: false } },
  { metode: "POST", jalur: "/nomor/{id}/percakapan/{pid}/balas", fitur: "percakapan", ringkas: { id: "Balas manual sebagai manusia (bot dijeda untuk chat ini; butuh juga pesan.kirim)", en: "Reply manually as a human (bot paused for this chat; also needs pesan.kirim)" }, minta: { teks: "Siap kak, saya bantu cek ya." }, jawab: { id: "982", status: "antre" }, status: 202 },
  { metode: "PATCH", jalur: "/nomor/{id}/percakapan/{pid}", fitur: "percakapan", ringkas: { id: "Jeda/lanjutkan bot per chat, layani lagi chat dibisukan, tandai bukan spam", en: "Pause/resume the bot per chat, serve a muted chat again, mark not spam" }, minta: { bot: "jeda", menit: 60 }, jawab: { id: "88", kunci: "c_9f2a...", telepon: "6289876543210", nama: "Budi", cuplikan: "Ada paket hemat?", pengirim_akhir: "pelanggan", jumlah: { masuk: 4, ai: 3, manusia: 0 }, terakhir_pada: 1794200100, bot: "aktif", jeda_sampai: 0, spam: false, minat: "hangat" } },
  { metode: "DELETE", jalur: "/nomor/{id}/percakapan/{pid}", fitur: "percakapan", ringkas: { id: "Hapus riwayat satu chat", en: "Delete one chat's history" }, jawab: { dihapus: true } },
  {
    metode: "POST",
    jalur: "/pesan",
    fitur: "pesan.kirim",
    ringkas: { id: "Kirim teks, gambar (maks 5 MB), atau berkas/dokumen (PDF, CSV, Excel, dll. maks 100 MB, JSON/multipart) ke nomor atau grup WhatsApp", en: "Send text, image (max 5 MB), or file/document (PDF, CSV, Excel, etc. max 100 MB, JSON/multipart) to a number or WhatsApp group" },
    minta: { nomor_id: "12", ke: "6289876543210", teks: "Pesanan kakak siap diambil!" },
    jawab: { id: "981", status: "antre" },
    status: 202,
  },
  { metode: "GET", jalur: "/pesan/{id}", fitur: "pesan.kirim", ringkas: { id: "Status pesan", en: "Message status" }, jawab: { id: "981", nomor_id: "12", ke: "6289876543210", status: "terkirim", alasan: null, dibuat: 1794200100, berubah: 1794200103 } },
  {
    metode: "GET",
    jalur: "/nomor/{id}/grup",
    fitur: "pesan.kirim",
    ringkas: { id: "Daftar grup WhatsApp yang diikuti nomor (gunakan `id` sebagai `ke` di POST /pesan)", en: "List WhatsApp groups joined by the number (use `id` as `ke` in POST /pesan)" },
    jawab: { data: [{ id: "120363041234567890@g.us", nama: "Grup Kasir Cabang", jumlah_anggota: 18, hanya_admin: false }] },
  },
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
  { metode: "GET", jalur: "/nomor/{id}/jalur", fitur: "wa.resmi", ringkas: { id: "Jalur WhatsApp nomor (baileys/resmi), status Meta (kualitas, tier, kuota 24 jam), URL webhook", en: "A number's WhatsApp channel (baileys/resmi), Meta status (quality, tier, 24 h quota), webhook URL" }, jawab: JALUR },
  {
    metode: "PUT",
    jalur: "/nomor/{id}/jalur",
    fitur: "wa.resmi",
    ringkas: {
      id: "Pasang jalur resmi dengan aplikasi Meta & WABA Anda sendiri (lalu arahkan webhook Meta ke webhook_url), atau {jalur: \"baileys\"} untuk kembali ke QR. Token tidak pernah dikembalikan",
      en: "Switch to the official channel with your own Meta app & WABA (then point the Meta webhook at webhook_url), or {jalur: \"baileys\"} to go back to QR. The token is never returned",
    },
    minta: { jalur: "resmi", phone_number_id: "109876543210987", waba_id: "203040506070809", token: "EAAG...", app_secret: "0123456789abcdef0123456789abcdef", pin: "123456" },
    jawab: { jalur: "resmi", webhook_url: "https://mesin-anda.com/api/wa/meta/Xk3p...", verify_token: "vt_9QmZ...", nomor: "6281234567890", nama: "Toko Maju", peringatan: [] },
  },
  { metode: "GET", jalur: "/nomor/{id}/templat-wa", fitur: "wa.resmi", ringkas: { id: "Template pesan Meta milik WABA nomor (status APPROVED/PENDING/REJECTED)", en: "Meta message templates of the number's WABA (APPROVED/PENDING/REJECTED)" }, jawab: { data: [TEMPLAT_WA] } },
  {
    metode: "POST",
    jalur: "/nomor/{id}/templat-wa",
    fitur: "wa.resmi",
    ringkas: { id: "Ajukan template ke Meta ({nama, isi, kode_tahap?, bahasa?}), atau {bawaan: true} untuk semua template follow-up bawaan", en: "Submit a template to Meta ({nama, isi, kode_tahap?, bahasa?}), or {bawaan: true} for all built-in follow-up templates" },
    minta: { nama: "prospek_lanjutan_1", isi: "Halo {{nama}}, kemarin sempat tanya soal pesanan di {{usaha}}. Ada yang bisa kami bantu lagi?", kode_tahap: "prospek_1", bahasa: "id" },
    jawab: { ...TEMPLAT_WA, status: "PENDING" },
    status: 201,
  },
  { metode: "POST", jalur: "/nomor/{id}/templat-wa/sinkron", fitur: "wa.resmi", ringkas: { id: "Tarik ulang status semua template dari Meta", en: "Re-fetch every template's status from Meta" }, jawab: { data: [TEMPLAT_WA] } },
  { metode: "DELETE", jalur: "/nomor/{id}/templat-wa/{nama}", fitur: "wa.resmi", ringkas: { id: "Hapus template dari Meta & daftar nomor", en: "Delete a template from Meta & the number" }, jawab: { ok: true } },
  { metode: "GET", jalur: "/nomor/{id}/followup", fitur: "followup", ringkas: { id: "Setelan follow-up (prospek & order ulang), status hari ini (rem, kiriman, batas), jalur nomor", en: "Follow-up settings (leads & repeat orders), today's status (brake, sends, limit), the number's channel" }, jawab: FOLLOWUP },
  {
    metode: "PATCH",
    jalur: "/nomor/{id}/followup",
    fitur: "followup",
    ringkas: { id: "Ubah setelan follow-up (hanya kolom yang dikirim; saklar dimatikan = antrean jenis itu dibatalkan)", en: "Update follow-up settings (only the fields sent; turning a switch off cancels that queue)" },
    minta: { aktif: true, jam_mulai: 9, jam_selesai: 20, batas_harian: 10 },
    jawab: FOLLOWUP,
  },
  { metode: "GET", jalur: "/nomor/{id}/followup/antrean", fitur: "followup", ringkas: { id: "Antrean & riwayat follow-up, terbaru dulu (?jenis=prospek|ulang, ?batas=1–100)", en: "Follow-up queue & history, newest first (?jenis=prospek|ulang, ?batas=1–100)" }, jawab: { data: [ANTREAN_FU] } },
  {
    metode: "PUT",
    jalur: "/nomor/{id}/followup/antrean/{kunci}/draf",
    fitur: "followup",
    ringkas: { id: "Ganti draf pesan berikutnya (dikirim persis; tanpa tautan & kelangkaan palsu)", en: "Replace the next message draft (sent as is; no links or fake scarcity)" },
    minta: { jenis: "prospek", teks: "Kak Budi, paket hemat yang kemarin ditanyakan masih bisa dipesan ya." },
    jawab: { ok: true, jenis: "prospek", kunci: "c_9f2a..." },
  },
  { metode: "POST", jalur: "/nomor/{id}/followup/antrean/{kunci}/tulis-ulang", fitur: "followup", ringkas: { id: "AI menulis ulang draf pesan berikutnya (dihitung 1 balasan AI)", en: "AI rewrites the next message draft (counts as 1 AI reply)" }, minta: { jenis: "prospek" }, jawab: { jenis: "prospek", kunci: "c_9f2a...", draf: "Kak Budi, masih tertarik dengan paket hemat? Kami bantu siapkan ya." } },
  { metode: "POST", jalur: "/nomor/{id}/followup/antrean/{kunci}/hentikan", fitur: "followup", ringkas: { id: "Hentikan follow-up satu chat di siklus ini", en: "Stop follow-up for one chat in this cycle" }, minta: { jenis: "prospek" }, jawab: { ok: true, jenis: "prospek", kunci: "c_9f2a..." } },
  { metode: "POST", jalur: "/nomor/{id}/followup/lepas-rem", fitur: "followup", ringkas: { id: "Lepas rem follow-up nomor (dipasang otomatis saat ada tanda pembatasan WhatsApp)", en: "Release the number's follow-up brake (set automatically on WhatsApp restriction signals)" }, jawab: { ok: true, rem: null } },
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
  { jenis: "nomor.qr", ket: { id: "QR baru untuk dipindai (±20 dtk sekali selama menunggu scan)", en: "New QR to scan (every ~20 s while waiting)" }, data: { qr: "2@AbC...", png: "iVBORw0KGgo..." } },
  { jenis: "nomor.status", ket: { id: "Status koneksi nomor berubah", en: "Number connection status changed" }, data: { status: "menunggu_qr" } },
  { jenis: "nomor.pairing", ket: { id: "Kode pairing baru (tautkan tanpa QR)", en: "New pairing code (link without QR)" }, data: { kode: "ABCD1234" } },
  { jenis: "followup.terkirim", ket: { id: "Pesan follow-up terkirim (butuh fitur followup)", en: "A follow-up message was sent (needs the followup feature)" }, data: { nomor_id: "12", kunci: "c_9f2a...", jenis: "prospek", tahap: 1, bentuk: "teks", teks: "Halo kak Budi, ada yang bisa kami bantu soal pesanannya?" } },
  { jenis: "followup.dibalas", ket: { id: "Pelanggan membalas follow-up (siklus berhenti)", en: "The customer replied to a follow-up (the cycle stops)" }, data: { nomor_id: "12", kunci: "c_9f2a...", jenis: "prospek" } },
  { jenis: "followup.rem", ket: { id: "Follow-up nomor direm otomatis (tanda pembatasan WhatsApp); lepas lewat POST /nomor/{id}/followup/lepas-rem", en: "The number's follow-up was braked automatically (WhatsApp restriction signal); release via POST /nomor/{id}/followup/lepas-rem" }, data: { nomor_id: "12", alasan: "Perangkat dicabut dari HP" } },
  { jenis: "templat.status", ket: { id: "Status template Meta berubah (butuh fitur wa.resmi)", en: "A Meta template's status changed (needs the wa.resmi feature)" }, data: { nomor_id: "12", nama: "prospek_lanjutan_1", status: "APPROVED", alasan: null } },
  { jenis: "nomor.kualitas", ket: { id: "Kualitas / tier nomor resmi berubah di Meta (butuh fitur wa.resmi)", en: "An official number's quality / tier changed at Meta (needs the wa.resmi feature)" }, data: { nomor_id: "12", peristiwa: "DOWNGRADE", tier: "TIER_250", kualitas: "YELLOW" } },
];
