# Evaluasi Kualitas Perangkat Lunak — ISO/IEC 25010

**Aplikasi:** Asisten WhatsApp (wa.sukapost.tech) · **Tanggal evaluasi:** 30 Oktober 2026
**Model acuan:** ISO/IEC 25010:2023 (9 karakteristik). Nama lama di versi 2011 dicantumkan dalam kurung.

> **Catatan penting.** ISO/IEC 25010 adalah *model kualitas*, bukan sertifikasi. Tidak ada lembaga yang
> menerbitkan "sertifikat lulus ISO 25010" untuk sebuah aplikasi. Yang bisa dilakukan, dan dilakukan di dokumen
> ini: mengukur aplikasi terhadap setiap karakteristik dengan bukti uji yang bisa diulang, memperbaiki temuan,
> lalu menyatakan karakteristik mana yang terpenuhi dan mana yang masih punya catatan.

## Ringkasan hasil

| No | Karakteristik | Bukti utama | Hasil |
|---|---|---|---|
| 1 | Kesesuaian fungsional | 163 pemeriksaan otomatis + 10 skenario E2E di browser | **Terpenuhi** (100% lulus) |
| 2 | Efisiensi kinerja | Uji beban, Lighthouse, ukuran memori | **Terpenuhi, 1 catatan** (skor kinerja Lighthouse landing page 79) |
| 3 | Kompatibilitas | 60 kombinasi halaman × lebar layar, integrasi 6 layanan luar | **Terpenuhi, 1 catatan** (baru diuji di Chromium) |
| 4 | Kemampuan interaksi (Usability) | Audit WCAG 2.1 AA (axe-core), Lighthouse Aksesibilitas | **Terpenuhi** untuk ukuran teknis; kuesioner SUS belum diisi responden |
| 5 | Keandalan (Reliability) | Database dimatikan saat berjalan, 20+ skenario putus/sambung | **Terpenuhi** |
| 6 | Keamanan (Security) | 11 skenario serangan E2E, `npm audit`, uji log | **Terpenuhi** (setelah 3 perbaikan) |
| 7 | Pemeliharaan (Maintainability) | TypeScript strict, lint, cakupan uji 91,6% baris | **Terpenuhi** |
| 8 | Fleksibilitas (Portability) | Instalasi bersih dari build produksi, migrasi otomatis | **Terpenuhi** |
| 9 | Keselamatan (Safety, baru di 2023) | Penjaga jawaban AI, mode gagal-aman | **Terpenuhi** |

Selama evaluasi ditemukan **10 masalah**. Semuanya sudah diperbaiki dan diuji ulang (lihat bagian *Temuan & perbaikan*).

## Lingkungan uji

- Server: hasil `npm run build` (output standalone, sama dengan yang dikirim ke VPS), `NODE_ENV=production`,
  heap 320 MB seperti di container produksi; PostgreSQL 15 sungguhan.
- Mesin: 4 vCPU Intel Xeon; browser Chromium (Playwright) desktop 1366×800 dan HP 375×740.
- Yang ditiru (tidak bisa dijangkau dari lingkungan uji): server WhatsApp, Hermes, API Anthropic, Midtrans,
  Google OAuth. Di CI (GitHub Actions) koneksi ke WhatsApp sungguhan ikut diuji (`uji/uji-next.mjs`).

## 1. Kesesuaian fungsional (Functional suitability)

Sub-karakteristik: kelengkapan, kebenaran, dan kelayakan fungsional.
Metrik: `X = 1 − A/B` (A = kasus gagal, B = kasus diuji). Target X = 1.

**Uji otomatis (`npm run uji`), PostgreSQL sungguhan:**

| Skrip | Isi | Lulus |
|---|---|---|
| `uji-auth` | Sesi login WhatsApp di database, skema, peran database | 13/13 |
| `uji-data` | Pindahan data lama, pencarian knowledge, histori & paginasi, hapus otomatis 30 hari | 21/21 |
| `uji-alur` | Koneksi & QR, serah-terima manusia↔AI, belajar dari balasan, foto, kuota, 12 nomor serentak | 64/64 |
| `uji-sinkron` | Sinkron data Suka Shawarma | 10/10 |
| `uji-log` | Kunci sesi tidak tercetak di log | 1/1 |
| `uji-pengguna` | Akun & administrasi pengguna | 15/15 |
| `uji-ai` | Mesin AI (Hermes / Claude API / per paket / per akun), biaya, penjaga jawaban | 22/22 |
| `uji-langganan` | Paket, kuota, pembayaran Midtrans | 17/17 |
| **Jumlah** | | **163/163** |

**Uji end-to-end di browser (`uji/iso25010/e2e.cjs`):**

| ID | Skenario | Hasil |
|---|---|---|
| F-01 | Pendaftaran akun baru | Lulus |
| F-02 | Validasi: ulangi password berbeda ditolak | Lulus |
| F-03 | Tambah nomor WhatsApp → halaman nomor + QR | Lulus |
| F-04 | Tambah base knowledge (teks) | Lulus |
| F-05 | Histori percakapan + info hapus otomatis 30 hari | Lulus |
| F-06 | Instruksi khusus nomor tersimpan | Lulus |
| F-07 | Admin melihat daftar pengguna | Lulus |
| F-08 | Admin memilih penyedia AI per akun | Lulus |
| F-09 | Admin mengatur kuota perangkat | Lulus |
| F-10 | Logout menghapus sesi | Lulus |

X = 1 − 0/173 = **1,00**.

## 2. Efisiensi kinerja (Performance efficiency)

**Perilaku waktu.** Uji beban 20 koneksi serentak × 10 detik per endpoint (`uji/iso25010/beban.cjs`):

| Endpoint | Req/detik | p50 | p99 | Galat |
|---|---|---|---|---|
| `GET /api/health` | 772 | 24 ms | 49 ms | 0 |
| `GET /api/wa/status` (login) | 579 | 32 ms | 59 ms | 0 |
| `GET /api/percakapan` (login) | 532 | 35 ms | 65 ms | 0 |
| `GET /login` | 105 | 22 ms | 451 ms | 0 |
| `GET /` (landing) | 79 | 40 ms | 723 ms | 0 |
| `GET /dashboard` (login) | 66 | 57 ms | 1.237 ms | 0 |

Tanpa beban (`uji-next`), halaman dashboard p95 33 ms dan landing p95 23 ms. Waktu muat penuh tiap halaman di
browser (sampai jaringan diam) 0,57–0,89 detik di 16 halaman.

**Pemanfaatan sumber daya.** Memori proses server 323 MB saat diam dan puncaknya 359 MB di bawah beban.
Batas container produksi 512 MB, jadi masih tersisa sekitar 30%.

**Kapasitas.** 12 nomor WhatsApp terhubung dan menjawab bersamaan (`uji-alur`). Query tetap memakai indeks pada
data seukuran maksimal: 30 nomor, 33 ribu potongan knowledge, dan 14 ribu pesan (`uji-data`, EXPLAIN ANALYZE).

**Lighthouse** (simulasi HP dengan CPU diperlambat 4×):

| Halaman | Kinerja | Aksesibilitas | Best practices | SEO | LCP | CLS |
|---|---|---|---|---|---|---|
| `/` | 79 | 100 | 100 | 100 | 2,5 s | 0 |
| `/login` | 100 | 100 | 100 | 60* | 1,8 s | 0,027 |

\* Halaman login memang sengaja diberi `noindex` supaya tidak muncul di mesin pencari.
**Catatan:** skor kinerja landing page 79 disebabkan animasi demo (Remotion): Total Blocking Time 750 ms pada CPU
yang diperlambat. Pemutar animasinya sudah dimuat terpisah dan hanya berputar saat terlihat. LCP 2,5 s masih
masuk batas "baik" Google (≤ 2,5 s).

## 3. Kompatibilitas (Compatibility)

- **Koeksistensi.** App berjalan berdampingan dengan app lain di VPS yang sama: port diatur lewat `APP_PORT`,
  memori dibatasi 512 MB, dan PostgreSQL ada di proyek compose terpisah.
- **Interoperabilitas.** Ada 6 layanan luar, semuanya punya uji dengan server tiruan: WhatsApp (Baileys,
  `uji-alur`), Hermes (`uji-alur`), Claude API (`uji-ai`), Midtrans (`uji-langganan`), Google OAuth, dan
  Supabase/Suka Shawarma (`uji-sinkron`).
- **Responsif.** Di 12 halaman × 5 lebar layar (320, 414, 768, 1024, 1920 px), tidak ada gulir horizontal
  di 60/60 kombinasi (`uji/iso25010/lebar.cjs`).
- **Catatan:** browser yang diuji otomatis baru Chromium. Firefox dan Safari (iPhone) disarankan dicek manual.

## 4. Kemampuan interaksi (Usability)

- **Aksesibilitas:** audit axe-core WCAG 2.1 level A & AA di 16 halaman × 2 ukuran layar menemukan
  **0 pelanggaran** di 32/32 tampilan (`uji/iso25010/jelajah.cjs`). Lighthouse Aksesibilitas 100.
- **Mudah dikenali & dipelajari:** antarmuka berbahasa Indonesia, ada tur panduan per halaman dan templat
  base knowledge per jenis usaha.
- **Perlindungan dari kesalahan pengguna:** setiap penghapusan meminta konfirmasi, kolom wajib divalidasi
  (pesannya dalam bahasa Indonesia), dan password harus diketik ulang.
- **Galat konsol:** 0 di semua halaman.
- **Belum dilakukan:** pengukuran kepuasan pengguna dengan responden nyata. Instrumen yang lazim adalah System
  Usability Scale (SUS), templatnya di Lampiran A. Skor ≥ 68 dianggap di atas rata-rata.

## 5. Keandalan (Reliability)

| Uji | Hasil |
|---|---|
| Database dimatikan saat app berjalan | `/api/health` langsung jujur melapor HTTP 500 (9 ms); landing tetap 200 |
| Database dinyalakan lagi | App pulih sendiri tanpa restart; health 200 di percobaan pertama |
| Koneksi WhatsApp putus (428), sesi bentrok (440), versi ditolak (405) | Sambung ulang dengan jeda bertambah (`uji-alur`) |
| AI gagal | Dicoba ulang 2×, lalu berhenti tanpa mengirim pesan rusak (`uji-alur`) |
| Database putus saat menulis kunci sesi | Tulisan dicoba ulang, tidak hilang (`uji-alur`) |
| SIGTERM saat deploy | Soket ditutup tanpa logout, antrean tulisan dituntaskan dulu (`uji-alur`) |
| Server dimulai ulang | Jeda AI & sesi dimuat lagi dari database (`uji-alur`) |
| Deploy gagal | Skrip penerima mengembalikan versi sebelumnya bila health check gagal |

## 6. Keamanan (Security)

| ID | Skenario | Hasil |
|---|---|---|
| S-01 | Pengguna lain membuka halaman nomor orang lain (IDOR) | Ditolak: "Nomor tidak ditemukan", data tidak terkirim |
| S-02 | API histori nomor orang lain | HTTP 404 |
| S-03 | Pengguna biasa membuka panel admin | Ditolak (halaman 404) |
| S-04 | CSRF: POST dari origin lain | HTTP 403 |
| S-05 | Cookie sesi | HttpOnly, SameSite=Lax, Secure di HTTPS |
| S-06 | Akun diblokir admin | Sesinya langsung dicabut |
| S-07 | Akun diblokir mencoba login | Ditolak dengan alasan blokir |
| S-08 | Password salah vs email tidak terdaftar | Pesannya sama, jadi keberadaan akun tidak bocor |
| S-09 | Brute force login | Dibatasi 10 percobaan / 5 menit per IP, 20 / 15 menit per email, dan akun dikunci sementara |
| S-10 | Header `CF-Connecting-IP` palsu untuk melewati batas | Tetap dibatasi (sebelumnya bisa dilewati, sudah diperbaiki) |
| S-11 | Header keamanan HTTP | CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy; X-Powered-By disembunyikan |

Bukti lain:
- `npm audit`: **0 kerentanan**.
- Password di-hash dengan scrypt, dan sesi ditandatangani HMAC-SHA256.
- API key (Anthropic, Midtrans) hanya ada di `.env` server, tidak pernah lewat browser.
- Kunci sesi WhatsApp tidak tercetak di log (`uji-log`).
- Notifikasi Midtrans diverifikasi dengan tanda tangan SHA-512 lalu dicek ulang ke API Midtrans.
- **Akuntabilitas:** setiap tindakan admin tercatat di log admin.

**Catatan:** ini pengujian keamanan fungsional, bukan pentest penuh oleh pihak ketiga.

## 7. Pemeliharaan (Maintainability)

- **Analisabilitas:** TypeScript `strict`, `tsc` dan ESLint tanpa error. 118 berkas, ±15.800 baris, dengan modul
  per tanggung jawab di `src/lib` (wa, bridge, ai, knowledge, langganan, …).
- **Testabilitas:** cakupan uji `src/lib` **91,6% baris, 83,3% cabang, 87,6% fungsi** (V8 coverage, semua berkas
  dihitung). Berkas yang tidak tersentuh uji unit (`session.ts`, `batas.ts`) diuji lewat skenario E2E S-01–S-11.
- **Modifikasi:** pipeline CI menjalankan lint → build → seluruh uji → uji server hasil build sebelum deploy.
  Deploy hanya terjadi bila semuanya lulus.

## 8. Fleksibilitas (Portability)

- **Instalasi:** dari database kosong, `uji-next` memasang build produksi. Migrasi skema (v1–v11) dan impor data
  lama dari SQLite berjalan otomatis; server siap dalam 513 ms.
- **Adaptabilitas:** semua konfigurasi lewat environment variable (`.env.example`), image Docker standalone, dan
  tampilan menyesuaikan lebar layar 320–1920 px.
- **Penggantian:** penyedia AI bisa diganti (Hermes ↔ Claude API) tanpa restart, untuk semua akun atau per akun.

## 9. Keselamatan (Safety)

- **Penjaga jawaban AI** (`pemeriksa.ts`) menulis ulang jawaban yang:
  - mengaku sebagai admin/pemilik,
  - menjanjikan tindakan,
  - memuat angka atau tautan tanpa sumber,
  - berisi kode program.

  Bila tetap gagal, yang dikirim adalah jawaban aman (`uji-ai`, `uji-alur`).
- **Gagal-aman:**
  - Kuota habis → AI diam, pesan tetap tercatat.
  - Manusia membalas dari HP → AI langsung mundur.
  - Hal yang butuh manusia (pesanan, keluhan, bukti bayar) diteruskan ke WhatsApp pemilik.
- **Data minimal:** histori chat dihapus otomatis setelah 30 hari dan pengguna diberi tahu di dashboard.

## Temuan & perbaikan selama evaluasi

| No | Karakteristik | Temuan | Perbaikan |
|---|---|---|---|
| 1 | Keamanan | Batas percobaan login/daftar per IP bisa dilewati dengan header `CF-Connecting-IP` palsu | Header itu hanya dipercaya bila `IP_DARI_CLOUDFLARE=1` (`src/lib/batas.ts`) |
| 2 | Keamanan | Belum ada Content-Security-Policy & HSTS | Ditambahkan di `next.config.ts` |
| 3 | Keandalan / Keamanan | Instalasi baru: bila ada yang mendaftar sebelum admin login pertama kali, akun admin tidak pernah dibuat | Admin pertama dibuat saat server mulai dan sebelum pendaftaran (`pastikanAdminAwal`) |
| 4 | Keandalan | Galat hidrasi React (#418) di dashboard bila status WhatsApp tiba sebelum bagian halaman selesai dimuat | `useWaStatus` memakai data server selama hidrasi (`wa-status.tsx`) |
| 5 | Usability | Kontras warna teks sekunder 2,6–2,9:1 di 7 halaman (WCAG minta ≥ 4,5:1) | Token `--c-faint` dan `--c-warning` digelapkan (≥ 4,5:1) |
| 6 | Usability | Dua input berkas tanpa label (pembaca layar) | Diberi `aria-label` |
| 7 | Usability | Area kode yang bisa digulir tidak bisa difokus keyboard | `tabIndex={0}` |
| 8 | Usability | Tombol di `/admin/paket` meluap di layar 320 px | Tombol boleh membungkus teks |
| 9 | Usability | Teks "Ketik pesan" di animasi demo landing kontrasnya 2,4:1 | Diperbaiki menjadi 4,7:1 |
| 10 | Fungsional | Pesan "tersimpan" pada pilihan AI per akun langsung hilang | Form tidak di-reset ulang setelah simpan |

## Keterbatasan evaluasi

1. WhatsApp, Hermes, Midtrans, dan Google memakai server tiruan. Di lingkungan evaluasi akses ke
   `web.whatsapp.com` diblokir jaringan, jadi bagian QR sungguhan di `uji-next` hanya lulus di CI.
2. Hanya Chromium yang diuji otomatis.
3. Usability dengan responden nyata (SUS) belum dilakukan.
4. Bukan pentest pihak ketiga.
5. Halaman yang ditolak (mis. nomor milik orang lain) menampilkan "tidak ditemukan" dengan status HTTP 200,
   karena halaman sudah mulai dikirim (streaming) sebelum pengecekan selesai. Datanya tidak ikut terkirim, jadi
   ini tidak berdampak ke keamanan.

## Cara mengulang evaluasi

```bash
npm run build
npm run uji
```

```bash
node --import ./uji/loader.mjs uji/iso25010/mulai.mjs   # terminal 1: server di 127.0.0.1:3999
```

```bash
npm i --no-save playwright axe-core autocannon           # terminal 2 (sekali saja)
```

```bash
node uji/iso25010/e2e.cjs && node uji/iso25010/jelajah.cjs /nomor/1,/admin/pengguna/2 && node uji/iso25010/lebar.cjs && node uji/iso25010/beban.cjs
```

Jalankan `e2e.cjs` pada server yang baru dinyalakan (database kosong). Ia membuat akun, nomor, dan knowledge yang
dipakai skrip lain, dan uji brute force (S-09) di akhirnya memakai jatah percobaan login dari IP lokal.

## Lampiran A — Kuesioner SUS (System Usability Scale)

Skala 1 (sangat tidak setuju) – 5 (sangat setuju). Disarankan minimal 5 responden (pemilik usaha / admin CS).

1. Saya rasa saya akan sering memakai aplikasi ini.
2. Aplikasi ini terlalu rumit.
3. Aplikasi ini mudah digunakan.
4. Saya butuh bantuan orang teknis untuk memakai aplikasi ini.
5. Fitur-fitur aplikasi ini terpadu dengan baik.
6. Ada terlalu banyak hal yang tidak konsisten di aplikasi ini.
7. Kebanyakan orang akan cepat belajar memakai aplikasi ini.
8. Aplikasi ini terasa merepotkan untuk dipakai.
9. Saya percaya diri saat memakai aplikasi ini.
10. Saya perlu belajar banyak hal sebelum bisa memakai aplikasi ini.

Skor per responden = (Σ(nilai soal ganjil − 1) + Σ(5 − nilai soal genap)) × 2,5. Rata-rata ≥ 68 = di atas
rata-rata; ≥ 80,3 = sangat baik (grade A).
