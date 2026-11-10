# Rencana: Core API headless (UI bisa diganti developer, kendali tetap di kita)

Tanggal: 2026-11-10 · Status: **H1–H4 di-push 2026-11-10 (commit 2205fbf)**; sisa di §8 · Lanjutan dari
[2026-11-09-developer-api.md](2026-11-09-developer-api.md) dan [2026-11-10-sandbox-developer-api.md](2026-11-10-sandbox-developer-api.md)

---

## 1. Tujuan

Seperti **Core API Midtrans**, tetapi mesinnya jalan di server developer (self-host):

- **Docker image = mesinnya** (koneksi WA, bot AI, Informasi Usaha, antrean anti-blokir, database).
  **API = cara aplikasi developer menyuruh mesin itu bekerja** (kirim struk otomatis, pesan masuk ke sistem mereka,
  QR tampil di halaman mereka, dst.). Tanpa API, mesin hanya bisa dipakai manual lewat dashboard.
- **Bawaan tetap ada dashboard kita** (seperti sekarang).
- **Developer boleh mematikan dashboard** dan memakai UI aplikasi mereka sendiri. Semua yang bisa dilakukan di
  dashboard juga bisa lewat API, jadi UI mereka tidak kehilangan apa pun.
- **Mesin & logika tetap berlisensi milik kita.** Kode mesin tertutup (image Docker, di-minify). Yang dibagikan hanya
  SDK & contoh UI, dan itu pun **hanya lewat portal Developer**.
- **Kuasa penuh di kita:** satu fitur, beberapa fitur, atau semuanya bisa diblokir/dinyalakan dari panel developer
  internal, dan berlaku **di semua jalur**: API, dashboard mesin, dan bot WhatsApp.

```
┌────────────── SERVER DEVELOPER ─────────────────────────────────────────────┐
│  UI aplikasi mereka (bebas) ──API + key──▶ ┐                                 │
│  atau dashboard bawaan kita (bisa dimatikan) ┤ MESIN CHATGERCEP (berlisensi) │
│  ◀── webhook realtime (pesan, QR, status) ──┘  fitur inti + logika + bot WA  │
└───────────────────────────────▲──────────────────────────────────────────────┘
                                │ lisensi bertanda tangan: fitur yang boleh,
                                │ status (aktif/ditangguhkan/dicabut), masa berlaku
                     chatgercep.com (panel developer internal + portal Developer)
```

## 2. Keputusan pemilik (2026-11-10)

| # | Pertanyaan | Keputusan |
|---|---|---|
| 1 | Endpoint riwayat percakapan | **Boleh sekarang**, sebagai fitur di katalog yang bisa dimatikan & dinyalakan developer internal |
| 2 | Fitur `dashboard` bisa diblokir dari kita | **Ya** |
| 3 | Distribusi contoh aplikasi starter & SDK | **Hanya lewat portal Developer** (tidak dipublikasikan di GitHub/npm publik) |

## 3. Yang sudah ada (tidak dibangun ulang)

- Lisensi bertanda tangan Ed25519, dikirim lewat webhook, masa 7 hari, tanpa polling.
- Katalog 15 fitur yang bisa dicentang (umum & per aplikasi); tangguhkan / cabut / cabut key.
- API v1 untuk 15 fitur; webhook `pesan.masuk`, `pesan.dibalas_ai`, `pesan.manusia`, `pesan.status`,
  `nomor.terhubung`, `nomor.terputus`, `lisensi.peringatan`.
- Sandbox (`cg_test_`) dengan nomor bot & nomor penguji, port dashboard mesin bawaan 1975.

## 4. Celah yang ditemukan (ditutup lebih dulu di H1)

**Blokir fitur saat ini hanya berlaku di API.** Dashboard mesin dan bot WhatsApp belum membaca daftar fitur di lisensi.
Contoh: fitur `knowledge` diblokir → `POST /nomor/{id}/knowledge` ditolak, tetapi developer masih bisa mengisi Informasi
Usaha lewat dashboard mesin, dan bot tetap menjawab. Jadi kuasa kita belum penuh.

## 5. Requirement

### 5.1 H1: Penegakan fitur di semua jalur
- **R-F-1** Satu fungsi di mesin `fiturBoleh(kode)` (membaca lisensi di memori, tanpa query) dipakai oleh API (sudah),
  server action dashboard mesin, halaman dashboard mesin, dan bot.
- **R-F-2** Peta fitur → perilaku yang ikut diblokir:

  | Fitur | Yang ikut diblokir |
  |---|---|
  | `nomor` | Tambah/hapus nomor, QR, pairing, logout (API & dashboard) |
  | `pesan.kirim` | Kirim pesan lewat API; antrean berhenti mengirim (pesan tertahan, tidak dibuang) |
  | `pesan.terima` | Semua webhook ke aplikasi |
  | `bot` | **Bot WhatsApp berhenti membalas otomatis**; pengaturan bot (API & dashboard) |
  | `ai`, `ai.rapikan`, `ai.transkripsi` | Endpoint AI; "Uji bot" & "Rapikan" di dashboard; transkripsi pesan suara oleh bot |
  | `knowledge`, `katalog`, `pelajaran`, `templat` | Endpoint & halaman dashboard terkait (bot tetap memakai data yang sudah ada, hanya tidak bisa diubah) |
  | `percakapan` (baru, §5.3) | Endpoint riwayat & halaman Percakapan di dashboard mesin |
  | `dashboard` (baru, §5.2) | Seluruh dashboard bawaan |
  | `statistik`, `profil`, `kontak.cek`, `spam.cek` | Endpoint & tampilan terkait |
- **R-F-3** Di dashboard mesin, fitur yang diblokir tampil terkunci: "Fitur ini dinonaktifkan oleh ChatGerCep", bukan galat.
- **R-F-4** Koneksi WhatsApp **tidak pernah** diputus oleh blokir fitur (aturan yang sama dengan mode terbatas).
- **R-F-5** Perubahan centang fitur di panel langsung dikirim ke mesin production lewat webhook lisensi (sudah ada);
  untuk sandbox berlaku saat mesin menyala / Perbarui lisensi.

### 5.2 H2: Dashboard opsional
- **R-D-1** `.env`: `DASHBOARD_MESIN=aktif` (bawaan) atau `mati`. Bila `mati`: semua halaman dashboard mengembalikan 404,
  kecuali halaman ringkas `/` berisi "Mesin ChatGerCep berjalan dalam mode API" + status lisensi. API & webhook tetap jalan.
- **R-D-2** Fitur baru di katalog: **`dashboard`** ("Dashboard bawaan", grup baru "Mesin"). Developer internal bisa
  mematikan/menyalakan per aplikasi (mis. paket "API saja"). **Blokir dari kita mengalahkan `.env`**: walau `.env` aktif,
  dashboard tertutup bila fitur `dashboard` tidak dibuka.
- **R-D-3** Akun admin mesin (`ADMIN_EMAIL`) tetap bisa login ke halaman ringkas untuk melihat status lisensi saat
  dashboard dimatikan.
- **R-D-4** Dashboard bawaan tetap bermerek ChatGerCep (tanpa white-label di tahap ini).

### 5.3 H3: API setara dashboard + riwayat percakapan + event realtime
- **R-A-1 Fitur baru `percakapan`** ("Riwayat percakapan", grup WhatsApp), bisa dimatikan/dinyalakan developer internal:

  | Metode & jalur | Keterangan |
  |---|---|
  | `GET /nomor/{id}/percakapan?batas=50&setelah=<kursor>&cari=` | Daftar chat terbaru dulu: `kunci`, telepon, nama, cuplikan, pengirim terakhir, jumlah belum dibaca, status bot (aktif/dijeda/dibisukan), waktu terakhir |
  | `GET /nomor/{id}/percakapan/{kunci}/pesan?batas=50&sebelum=<id>` | Pesan satu chat, terbaru dulu, paginasi kursor: `id`, peran (`pelanggan`/`ai`/`manusia`), teks, waktu |
  | `POST /nomor/{id}/percakapan/{kunci}/balas` | Balas manual sebagai manusia (bot mundur seperti saat pemilik membalas dari HP); lewat antrean anti-blokir; butuh juga `pesan.kirim` |
  | `PATCH /nomor/{id}/percakapan/{kunci}` | Jeda/lanjutkan bot untuk chat ini (ambil alih manual) |

  Query memakai indeks yang sudah ada (`percakapan`, `pesan_chat`), paginasi kursor dengan `ORDER BY` unik, maks 100 per
  halaman, tanpa `OFFSET`. Diukur dengan `EXPLAIN (ANALYZE, BUFFERS)` pada data berukuran produksi (target p95 ≤ 30 ms).
- **R-A-2 Audit kesetaraan:** setiap tindakan di dashboard mesin harus punya endpoint. Celah yang sudah terlihat:
  pengaturan AI mesin (penyedia/model, tanpa membocorkan kunci), daftar & status semua nomor dengan detail koneksi,
  balas/jeda per chat (di atas). Audit lengkap dilakukan di awal H3 dan hasilnya dicatat di sini.
- **R-A-3 Event webhook baru** (supaya UI developer tidak perlu polling), masuk fitur `nomor`:
  `nomor.qr` (QR teks + PNG base64, setiap QR baru ±20 dtk, hanya selama menunggu scan), `nomor.status`
  (`menunggu_qr` / `menyambung` / `terhubung` / `terputus`), `nomor.pairing` (kode pairing baru).
- **R-A-4** Semua endpoint & event baru masuk katalog fitur (punya scope) dan `api-dok.ts`, dan uji katalog memastikan tiap
  fitur punya endpoint terdokumentasi (aturan yang sudah ada).

### 5.4 H4: SDK, contoh aplikasi starter, dokumentasi (hanya lewat portal Developer)
- **R-S-1 SDK TypeScript**: klien API bertipe (semua endpoint v1) + verifikasi tanda tangan webhook + tipe event.
  Hanya untuk server (key tidak boleh di browser, sama dengan aturan CORS sekarang).
- **R-S-2 Contoh aplikasi starter** (Next.js): halaman sambungkan WA (QR realtime dari webhook `nomor.qr`), Informasi
  Usaha, kirim pesan, inbox (riwayat percakapan + balas manual + jeda bot). Developer menyalin lalu mengubah tampilannya
  sesuka hati. Yang dibagikan hanya kode UI contoh; mesin tetap tertutup.
- **R-S-3 Distribusi hanya lewat portal Developer**: tombol unduh `.zip` (SDK + starter) di kartu Sandbox dan di halaman
  aplikasi yang disetujui. Rute unduh dijaga seperti unduhan `.env` sekarang: hanya pemilik sandbox/aplikasi yang masih
  punya akses portal (atau developer internal). Tidak dipublikasikan di GitHub/npm publik. Setiap unduhan tercatat
  (analitik `developer.unduh_starter`).
- **R-S-4** Lisensi berkas contoh: boleh diubah & dipakai di aplikasi mereka sendiri, tidak boleh dijual ulang terpisah;
  ditulis di `LICENSE` dalam zip.
- **R-S-5** `/docs/api` bagian baru **"Bangun UI sendiri"**: alur headless, event realtime, `DASHBOARD_MESIN=mati`,
  daftar fitur & dampak blokirnya, cara memakai SDK & starter.

### 5.5 Panel developer internal
- **R-P-1** Tab **Fitur**: dua fitur baru (`percakapan`, `dashboard`) muncul di katalog, bisa dicentang umum & per aplikasi
  seperti fitur lain. Fitur baru **tidak otomatis menyala** untuk aplikasi yang sudah ada (perlu dicentang).
- **R-P-2** Detail aplikasi: ringkasan "Jalur yang terdampak" per fitur yang dimatikan (API / dashboard / bot), supaya
  jelas akibat setiap centang.
- **R-P-3** Sandbox tetap mendapat semua fitur yang dibagikan (termasuk dua fitur baru bila dibagikan).

### 5.6 Ditunda
Komponen tempel ala Snap (token sekali pakai + widget yang bisa diatur warnanya), white-label dashboard, SDK PHP/Python.

## 6. Non-fungsional
- `fiturBoleh` membaca memori: **0 query, < 1 µs** per cek (diukur di uji). Bot & dashboard tidak bertambah lambat.
- Event `nomor.qr` dibatasi: hanya saat ada tujuan webhook yang berlangganan event itu, maks 1 per QR baru, berhenti
  saat terhubung (tidak membanjiri antrean webhook).
- Riwayat percakapan: paginasi kursor, indeks yang ada, tanpa `SELECT *`, tanpa N+1 (jumlah belum dibaca dihitung di
  SQL satu query per halaman).
- Tanpa beban baru di server pusat: semua penegakan di mesin; pusat hanya menambah dua kode fitur + rute unduh zip.
- Tanpa migrasi bernomor (perubahan skema, bila ada, lewat `KOLOM_PASTI`).
- Kode fitur yang sudah terbit tidak diganti (aturan katalog).

## 7. Pengujian
| Uji | Isi |
|---|---|
| Penegakan fitur | Untuk setiap fitur: diblokir → API 403, server action dashboard ditolak, halaman terkunci, bot berhenti (untuk `bot`/`ai`); dinyalakan lagi → pulih tanpa restart; WA tidak pernah putus |
| Dashboard opsional | `DASHBOARD_MESIN=mati` → halaman 404 kecuali ringkas, API jalan; fitur `dashboard` diblokir dari pusat mengalahkan `.env aktif` |
| Riwayat percakapan | Daftar & pesan berkursor benar, cari, balas manual memundurkan bot, jeda/lanjut bot, scope `percakapan` & `pesan.kirim`; rencana query pakai indeks pada 100 rb pesan |
| Event realtime | `nomor.qr` terkirim per QR baru & berhenti saat terhubung; `nomor.status` urut benar; tidak ada event bila tidak berlangganan |
| Unduh starter | Hanya pemilik berakses portal / developer internal; akun lain 404; tercatat di analitik |
| Starter end-to-end | Contoh aplikasi tersambung ke mesin sandbox: QR muncul via webhook, kirim & terima pesan, inbox tampil |
| Regresi | Seluruh suite uji lama lolos |

## 8. Catatan eksekusi (2026-11-10)

- **H1:** `fiturBoleh` (memori, ±0,5 µs) dipakai API, 21 server action dashboard, 10 route dashboard, tab halaman nomor
  (tampil terkunci), bot WA (`botBoleh` = layanan aktif + fitur `bot`), dan antrean kirim (`pesan.kirim`).
  Akibat penting: **bot WA sekarang hanya membalas bila fitur `bot` dibuka** di lisensi.
- **H2:** `DASHBOARD_MESIN=mati` atau fitur `dashboard` tidak dibuka → `getUser()` mengembalikan null dan `requireUser()`
  mengalihkan ke `/mode-api` (halaman status, tombol Perbarui lisensi tanpa login). Proxy Next.js tidak dipakai karena bisa
  berjalan di luar proses utama (tidak bisa membaca lisensi di memori). Aplikasi lama mendapat fitur `dashboard` sekali
  (penanda `KOLOM_PASTI`); daftar fitur umum yang disimpan sebelum fitur ini ada tetap menyalakan dashboard.
- **H3:** 5 endpoint percakapan (`GET` daftar, `GET` pesan, `POST` balas, `PATCH` jeda/lanjut/layani lagi/bukan spam,
  `DELETE`) + event `nomor.qr`, `nomor.status`, `nomor.pairing`.
- **H4:** SDK TS + contoh aplikasi Next.js di `starter/` (dikeluarkan dari tsconfig utama), unduhan zip
  `/api/developer/starter` (hanya pemilik portal dengan sandbox/aplikasi disetujui atau developer internal), tombol di
  kartu Sandbox & halaman aplikasi, docs "Bangun UI sendiri", opsi `DASHBOARD_MESIN` di `.env` unduhan.
- **Belum dikerjakan (sisa audit R-A-2 & R-P-2):** endpoint pengaturan AI mesin (penyedia/model), penegakan
  `ai.transkripsi` untuk pesan suara di bot, tampilan "jalur terdampak" (`DAMPAK_FITUR` sudah ada di kontrak, belum
  ditampilkan di panel), statistik di dashboard mesin belum ikut terkunci.

## 9. Tahapan

| Fase | Isi | Selesai bila | Perkiraan |
|---|---|---|---|
| **H1 Kuasa penuh** | `fiturBoleh` di API + dashboard mesin + bot; tampilan "fitur dinonaktifkan" | Uji penegakan fitur lolos | ±1–2 jam |
| **H2 Dashboard opsional** | `DASHBOARD_MESIN`, fitur `dashboard` di katalog & panel | Uji dashboard opsional lolos; screenshot disetujui | ±1 jam |
| **H3 API setara + percakapan + realtime** | Audit, fitur `percakapan` (4 endpoint), event `nomor.qr`/`nomor.status`/`nomor.pairing`, endpoint yang kurang | Uji riwayat & event lolos; alur sambungkan WA lengkap tanpa dashboard | ±2–3 jam |
| **H4 SDK & starter** | SDK TS, contoh aplikasi starter, unduhan zip di portal, docs "Bangun UI sendiri" | Starter end-to-end ke mesin sandbox; screenshot disetujui | ±3–4 jam |

Setiap fase satu commit. Perubahan tampilan di-screenshot (desktop & HP) dan menunggu persetujuan sebelum push.
