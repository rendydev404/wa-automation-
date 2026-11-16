# Lanjutan: Landing Page Industri ChatGerCep

Dokumen serah-terima untuk agent berikutnya. Ditulis 9 Nov 2026 setelah landing page industri live di produksi.
Sumber asli: PDF "Brief Programmer: Landing Page Industri ChatGerCep" (@akbaralatas) + `chatgercep-lp-10-industri.zip`.
Ringkasan brief ada di bagian 1; detail teknis yang sudah jadi ada di `lp/README.md`.

Urutan kerja yang disarankan: **Tugas A** (template AI di dashboard, paling penting karena LP sudah menjanjikannya),
lalu **Tugas B** (atribusi industri & UTM), lalu **Tugas C** (pelengkap).

---

## 0. Aturan kerja (wajib dibaca)

- Jawab dan tulis recap/tombol dalam **bahasa Indonesia**.
- Proyek ini **Next.js 16.4 dengan breaking changes** (`cacheComponents: true`, `proxy.ts` bukan `middleware.ts`,
  route segment config seperti `dynamic`/`dynamicParams` dilarang). Baca `node_modules/next/dist/docs/` sebelum menulis
  kode Next. Route handler/halaman yang membaca database harus `await connection()` (lihat `src/lib/lp/halaman.ts`).
- **Push ke `main` = deploy otomatis ke VPS** (GitHub Actions `deploy.yml`: job `bangun`, `periksa` = tsc + eslint,
  `uji (alur|tolok|fitur)`, lalu `deploy`). Deploy hanya jalan kalau semua hijau.
- **Perubahan tampilan**: sebelum push, jalankan build lokal dengan database sementara (jangan pakai DB/sesi produksi),
  ambil screenshot Chrome headless desktop (±1440 px) dan HP (±390 px), kirim ke pengguna. Pengguna sudah mengizinkan
  "push ke main kalau sudah aman semua", tetapi screenshot tetap dikirim.
- **Ada sesi/agent lain yang bekerja di checkout yang sama** (fitur Developer API: `src/app/[lang]/docs/`,
  `src/app/api/developer/`, `uji/uji-mesin.mjs`, perubahan di `src/app/actions.ts`, `src/proxy.ts`, `src/lib/langganan.ts`,
  dll., belum di-commit). Abaikan pekerjaan itu, tetapi:
  - **Commit hanya hunk milik Anda.** Jangan `git add` file utuh yang juga diubah sesi lain. Caranya: buat versi
    "HEAD + perubahan saya" lalu `git hash-object -w --path=<file> <berkas>` + `git update-index --cacheinfo
    100644,<hash>,<file>`. Sebelum commit, periksa `git diff --cached` baris per baris.
  - Commit `42e89d1` sempat gagal CI karena `uji/jalankan-semua.mjs` ikut membawa `uji/uji-mesin.mjs` milik sesi lain
    (berkasnya belum ada di repo). Jangan ulangi.
  - Build di checkout ini bisa gagal karena berkas setengah jadi milik sesi lain. Untuk build/screenshot, pakai salinan
    bersih: `git archive HEAD | tar -x -C D:/PROJECT-WEB-SS/lp-bersih-tmp`, salin berkas Anda ke sana, buat junction
    `node_modules` -> `D:\PROJECT-WEB-SS\WA_AUTOMATION\node_modules` (PowerShell `New-Item -ItemType Junction`), dan di
    `next.config.ts` salinan itu ubah `turbopack.root` dan `outputFileTracingRoot` ke `path.resolve(process.cwd(), "..")`
    (Turbopack menolak `node_modules` di luar root). Output standalone ada di `.next/standalone/lp-bersih-tmp/server.js`.
    **Hapus junction dulu** (`(Get-Item ...\node_modules).Delete()`) sebelum menghapus folder, supaya `node_modules`
    asli tidak ikut terhapus.
- Lint CI mencakup `lp/aset/lp.js` (aturan `@typescript-eslint/no-this-alias` dll.). Jalankan
  `npx eslint lp src/lib/lp <berkas Anda>` sebelum push.
- Koneksi WhatsApp pengguna tidak boleh putus karena deploy (sudah ditangani deploy; jangan ubah alur restart).
- Performa: query pilih kolom eksplisit, cache wajar, data berat dimuat saat dibutuhkan. Laporkan angka nyata (ms, KB).

---

## 1. Status saat ini (sudah live)

Commit `42e89d1` + perbaikan CI `4087566` di `main`, deploy sukses, dicek di https://chatgercep.com.

| Yang jalan | Lokasi kode |
|---|---|
| 10 LP publik tanpa login: `/toko-online`, `/laundry`, `/klinik-kecantikan`, `/rental-mobil`, `/maklon-kosmetik`, `/bengkel`, `/distributor`, `/travel-umrah`, `/catering`, `/kursus-les` | `src/app/[lang]/(lp)/<slug>/route.ts` -> `src/lib/lp/halaman.ts` (`routeLp`) |
| Isi per industri | `lp/industri/<slug>.json` (diimpor statis di `src/lib/lp/industri.ts`) |
| Template HTML, CSS, JS runtime | `src/lib/lp/template.ts`, `lp/aset/lp.css`, `lp/aset/lp.js` |
| Daftar slug & jalur publik | `src/lib/lp/def.ts` (`SLUG_LP`, `JALUR_LP_PUBLIK`, `NAMA_LP_EN`); `src/proxy.ts` memakai `JALUR_LP_PUBLIK` |
| `/garansi` (syarat asli dari `src/lib/jaminan-def.ts`) | `src/app/[lang]/(lp)/garansi/route.ts` |
| `/sitemap-lp.xml`, `public/robots.txt` | `src/app/sitemap-lp.xml/route.ts` |
| Kartu "Contoh per jenis usaha" di homepage | `src/components/landing/contoh-industri.tsx`, dipasang di `src/app/[lang]/page.tsx` setelah bagian Fitur |
| Uji | `uji/uji-lp.mjs` (terdaftar di jalur `fitur` `uji/jalankan-semua.mjs`) |
| Template AI per industri (teks) | `lp/prompt/<slug>.md` (10 berkas) — **belum dipakai dashboard** |

Perilaku penting:
- Harga & kuota paket diambil dari `daftarPaket()`, paket Custom dari `paketCustom()`, Meta Pixel dari
  `konfigMetaPixelPublik()`. HTML disimpan di memori proses 60 detik. Saat ini produksi: Starter Rp67.000, Bisnis
  Rp246.000, Pro Rp602.000; Pixel `1123194350074636`.
- Pixel di LP baru dimuat setelah pengunjung klik Setuju di banner cookie (`require_consent: true` di `template.ts`).
- Semua tautan ke `/daftar` di LP otomatis ditambah `industry`, `landing_page`, `paket` (tombol paket), dan `utm_*`,
  `fbclid`, `ttclid`, `gclid` (lihat `lp/aset/lp.js`). LP juga menyimpan `cg_industry` dan `cg_landing_page` di
  **localStorage** (origin sama dengan dashboard) serta `cg_utm_*` di sessionStorage.
- Nomor CS di LP = `NOMOR_WA_DEMO` (`src/lib/merek.ts`), permintaan pengguna.
- Langkah 4 "Cara kerja" di LP sementara berbunyi **"Salin template AI dari tim kami"** (`src/lib/lp/template.ts`,
  array `steps`) karena fitur Tugas A belum ada.

---

## Tugas A — Template AI per industri di dashboard (PRIORITAS)

### Tujuan
Pemilik nomor bisa memilih jenis usaha dan langsung mendapat isi **Instruksi khusus** dari `lp/prompt/<slug>.md`,
lalu mengganti bagian `[...]` dengan data usahanya. Ini yang dijanjikan langkah 4 di LP.

Brief (versi paling sederhana):
1. Saat setup bot, tampilkan dropdown "Jenis usaha" berisi 10 industri dan "Lainnya".
2. Default dropdown dari industri asal pengguna (dari LP).
3. Kalau dipilih, isi kolom instruksi AI dengan teks template industri itu. Owner tinggal mengganti bagian `[...]`.
4. Owner tetap bisa mengedit bebas. Template hanya titik awal.

### Yang sudah ada di dashboard (jangan tertukar)
- `src/lib/templat-usaha.ts` + `src/components/editor-knowledge.tsx`: kerangka isian **base knowledge** untuk 6 kategori
  umum (kuliner, toko, jasa, salon, kursus, lainnya). Ini fakta usaha (produk, harga, jam buka), **bukan** template AI.
  Biarkan.
- Kolom **Instruksi khusus** per nomor: `src/components/number-settings.tsx` (komponen `NumberSettings`, sekitar baris
  320, `<textarea id="instruksi" maxLength={2000} defaultValue={instruksi}>`). Disimpan oleh `ubahNomorAction` di
  `src/app/actions.ts` (sekitar baris 424: `.trim().slice(0, 2000)`) -> `ubahNomor()` di `src/lib/numbers.ts` -> kolom
  `numbers.instruksi` (text, tanpa batas DB). Dipakai AI di `src/lib/knowledge.ts:366` sebagai
  `<instruksi_nomor>...</instruksi_nomor>` tanpa pemotongan.

### Draf yang sudah dibuat (belum di-commit, boleh dipakai atau dibuang)
Ada di working tree, **belum terpasang** ke UI (pemasangan dihentikan atas permintaan pengguna;
`number-settings.tsx` sudah dikembalikan ke HEAD):

1. `src/lib/templat-ai-def.ts` — tanpa I/O, aman untuk browser:
   - `MAKS_INSTRUKSI = 5000`
   - `TEMPLAT_AI` (10 entri: `slug`, `label`, `labelEn`)
   - `slugTemplatSah(s)`
   - `siapkanTemplat(md)`: membuang baris judul `# ...` dan catatan `> Salin ke dashboard...`, mengubah baris
     `Contoh baris: X` menjadi `[Contoh, ganti dengan data Anda: X]` (contoh harga fiktif seperti "Cuci Setrika Rp8.000"
     tidak boleh lolos sebagai fakta).
   - `sisaPenanda(teks)`: daftar unik penanda `[...]` yang belum diganti (regex `/\[[^\]\n]{2,}\]/g`).
2. `src/app/api/templat-ai/route.ts` — `GET /api/templat-ai?jenis=<slug>` -> `{ teks }`, baca `lp/prompt/<slug>.md`
   sekali per proses (memo), `Cache-Control: private, max-age=3600`. Butuh sesi (proxy menolak `/api` tanpa login).
3. `next.config.ts` — `outputFileTracingIncludes["/**"]` ditambah `"./lp/prompt/*"` (wajib, supaya berkas .md ikut ke
   build standalone). Baris `"./lp/aset/*"` di atasnya sudah ter-commit.
4. `src/components/instruksi-nomor.tsx` — komponen klien `InstruksiNomor({ awal })`: label + kotak pemilih template
   (select + tombol "Pakai template", konfirmasi "Ganti/Batal" bila kolom sudah berisi), textarea terkontrol
   `name="instruksi"` `maxLength={MAKS_INSTRUKSI}`, penghitung karakter, peringatan kuning jumlah penanda `[...]`,
   preselect dari `localStorage.cg_industry`, fokus + seleksi ke penanda pertama setelah template dimuat. Kelas tombol
   proyek: `btn btn-primary`, `btn btn-ghost` (bukan `btn-secondary`).

### Langkah yang tersisa
1. Pasang komponen: di `number-settings.tsx` ganti seluruh blok `<div>` label + textarea + hint "Instruksi khusus"
   dengan `<InstruksiNomor awal={instruksi} />` dan tambahkan `import { InstruksiNomor } from "./instruksi-nomor";`.
   (`number-settings.tsx` saat ini tidak diubah sesi lain; tetap cek `git diff` dulu.)
2. Server (`ubahNomorAction`, `src/app/actions.ts`): **file ini juga diubah sesi lain, commit hanya hunk Anda.**
   - Ganti `.slice(0, 2000)` dengan `.slice(0, MAKS_INSTRUKSI)` (impor dari `@/lib/templat-ai-def`).
   - Tolak simpan bila `sisaPenanda(instruksi).length > 0`, pesan Indonesia/Inggris lewat `t(...)`, contoh:
     `Masih ada ${n} bagian bertanda [ ... ] yang belum diganti, misalnya ${contoh}. Ganti dengan data usaha Anda atau hapus.`
   - Pertimbangkan: instruksi lama milik pengguna yang kebetulan berisi kurung siku akan ikut ditolak. Opsi aman:
     tolak hanya bila instruksi berisi penanda yang **persis** ada di salah satu template (kumpulkan semua penanda dari
     10 berkas saat build/uji), atau hanya bila teks berubah. Putuskan dan tulis alasannya di komentar.
3. Opsi "Lainnya": tidak memuat template (kolom tetap bebas). Bisa sebagai opsi select tanpa tombol, atau cukup teks
   bantuan. Brief meminta ada "Lainnya".
4. Default dari asal pengguna: sementara pakai `localStorage.cg_industry` (sudah di draf). Setelah Tugas B selesai,
   ganti/lengkapi dengan `users.industry` dari server (prop ke komponen), localStorage jadi cadangan.
5. Pertimbangkan juga memunculkan pemilih ini di alur setup awal (tur/onboarding `src/components/isi-tur.tsx`,
   `src/components/tur.tsx`) — opsional, cukup tautan "Pilih template AI" ke pengaturan nomor.
6. Kembalikan langkah 4 LP di `src/lib/lp/template.ts` (array `steps`) ke versi brief:
   - judul: `` `Pilih template AI ${ind.industry_name}` ``
   - isi: `"Gaya bicara, pertanyaan kualifikasi, dan batasan sudah disiapkan untuk industri Anda."`
   - Hapus komentar "Pemilih template AI per industri belum ada di dashboard".
   - Perbarui `lp/README.md` (bagian "Belum dikerjakan" dan catatan template).
7. Uji: tambahkan ke `uji/uji-lp.mjs` (atau berkas baru `uji/uji-templat-ai.mjs`, daftarkan di jalur `fitur`):
   - tiap `lp/prompt/<slug>.md` ada untuk tiap `SLUG_LP`, `siapkanTemplat()` tidak menyisakan baris `# ` / `> ` /
     `Contoh baris:`, panjang hasil < `MAKS_INSTRUKSI`, dan `sisaPenanda()` > 0 (template memang harus diisi).
   - `sisaPenanda("tanpa penanda") = []`.
   - Bila sempat: uji server action `ubahNomorAction` menolak teks berpenanda (lihat pola `uji/uji-pengguna.mjs`).

### Kriteria selesai
- Di halaman nomor (`/nomor/<id>`, tab pengaturan): pilih "Laundry" -> "Pakai template" -> kolom terisi template
  laundry tanpa judul/catatan, baris contoh jadi penanda, peringatan kuning menghitung penanda.
- Menyimpan dengan penanda tersisa ditolak dengan pesan jelas; setelah semua diganti, tersimpan dan dipakai AI
  (cek `<instruksi_nomor>` di prompt lewat Uji bot).
- Pengunjung yang datang dari `/laundry` lalu mendaftar melihat "Laundry" sudah terpilih.
- Versi `/eng` tetap berfungsi (label Inggris, isi template berbahasa Indonesia dengan catatan).
- LP langkah 4 berbunyi "Pilih template AI <industri>".
- Screenshot desktop + HP: kotak pemilih kosong, terpilih, konfirmasi ganti, kolom terisi + peringatan, pesan tolak
  simpan, sesudah tersimpan. Login di build lokal pakai akun uji di DB sementara (lihat pola `uji/uji-next.mjs`),
  jangan akun produksi.

---

## Tugas B — Atribusi industri & UTM (brief prioritas 2)

### Tujuan
Laporan iklan bisa menjawab industri mana yang paling banyak menghasilkan pelanggan berbayar dan berapa biayanya.

### Kondisi sekarang
- LP mengirim pengunjung ke `/daftar?industry=laundry&landing_page=/laundry&paket=bisnis&utm_source=...` tetapi
  **`/daftar` belum membaca parameter apa pun**. Form daftar (`src/app/[lang]/daftar/daftar-form.tsx`) hanya mengirim
  `nama`, `email`, `password`, `ulang`, `situs` (honeypot), `setuju`.
- Pendaftaran email: `daftarAction` (`src/app/actions.ts` sekitar baris 168–200) -> `buatAkun()` (`src/lib/pengguna.ts:59`)
  -> set cookie `COOKIE_PIXEL_REG`, kirim CAPI `complete_registration` (`eventId: reg_<id>`).
- Pendaftaran Google: `src/app/api/auth/google/callback/route.ts` (CAPI `complete_registration` di baris ~43). Parameter
  URL `/daftar` hilang saat pindah ke Google, jadi perlu disimpan di cookie sebelum redirect.
- Referral afiliasi sudah memakai pola cookie (`COOKIE_REF`, dipasang di `src/proxy.ts`, dibaca saat daftar) — tiru polanya.
- Purchase server-side: `src/lib/langganan.ts` sekitar baris 690–702 (`kirimCapiEvent({ kunci: "purchase", eventId:
  orderId, customData: { value, currency: "IDR", content_name, content_type } })`) dan `src/app/actions.ts` sekitar
  baris 970. Jenis data: `DataCapiEvent` di `src/lib/meta-pixel.ts:88` (`customData` bebas).
- Migrasi database: array `MIGRASI` di `src/lib/db.ts` (berakhir sekitar baris 812). Tambah elemen baru **di akhir**,
  jangan ubah elemen lama. Contoh pola: `ALTER TABLE users ADD COLUMN google_sub text UNIQUE;`.

### Langkah
1. Migrasi: `ALTER TABLE users ADD COLUMN asal_industri text, ADD COLUMN asal_lp text, ADD COLUMN asal_utm jsonb;`
   (nama kolom bebas, konsisten bahasa Indonesia). Batasi panjang di kode (mis. 64/200 karakter per nilai), whitelist
   `industri` dengan `SLUG_LP`.
2. Tangkap parameter: di `src/proxy.ts`, untuk permintaan GET ke `/daftar` (dan `/login`?) yang membawa `industry`/
   `utm_*`/`fbclid`/`ttclid`/`gclid`/`landing_page`, simpan cookie httpOnly `cg_asal` (JSON kecil, 30 hari, sameSite
   lax) seperti `pasangRef`. Cara ini otomatis mencakup alur Google. **proxy.ts juga diubah sesi lain** — commit hunk
   Anda saja.
3. Simpan saat akun dibuat: di `daftarAction` dan callback Google, baca `cg_asal`, tulis ke kolom baru (satu UPDATE
   setelah `buatAkun`, atau tambah parameter ke `buatAkun`), lalu hapus cookie.
4. `paket` dari LP: setelah daftar, arahkan ke `/langganan/bayar/<kode>` bila `paket` valid (cek `daftarPaket()`),
   atau tandai paket itu di halaman Langganan. Jangan memaksa bayar sebelum uji bot gratis bila alur sekarang tidak
   begitu; diskusikan dengan pengguna bila ragu.
5. Event:
   - CompleteRegistration (CAPI di `daftarAction` & callback Google, dan event browser di `src/components/meta-pixel.tsx`):
     tambahkan `content_category = asal_industri` bila ada.
   - Purchase (`langganan.ts` & `actions.ts:970`): tambahkan `content_category = users.asal_industri`. Ambil bersama
     data pembelian dalam query yang sudah ada (hindari query tambahan per event bila bisa).
   - Purchase **hanya** dari server setelah pembayaran sukses (sudah begitu). Jangan kirim Purchase dari klik.
   - Refund: brief meminta event refund ke GA4; GA4 belum terpasang. Cukup catat (sudah tercatat di DB). Lewati.
6. Admin (opsional tetapi berguna): tampilkan asal industri/UTM di detail pengguna (`src/app/[lang]/(admin)/admin/pengguna/[id]/page.tsx`)
   dan/atau ringkasan per industri di Analitik admin (agregasi di SQL, bukan di klien).
7. Uji: pola `uji/uji-auth.mjs` / `uji/uji-pendaftar.mjs` dengan PostgreSQL sementara: daftar dengan cookie `cg_asal`
   -> kolom terisi; slug tidak dikenal ditolak; nilai panjang dipotong; tanpa cookie tetap normal.

### Kriteria selesai
Daftar dari `https://chatgercep.com/laundry?utm_source=meta&utm_campaign=x` (email maupun Google) -> baris `users`
berisi `asal_industri = 'laundry'`, `asal_lp = '/laundry'`, `asal_utm` berisi `utm_source`/`utm_campaign`; event CAPI
CompleteRegistration dan Purchase membawa `content_category: "laundry"`.

---

## Tugas C — Pelengkap (brief prioritas 3)

1. **Gambar Open Graph** 1200×630 per industri di `public/lp-assets/og/<slug>.png`. Begitu berkas ada, `og:image`
   otomatis terpasang (`existsSync` di `halaman.ts`; cache HTML 60 detik). Bisa dibuat dengan `next/og` ImageResponse
   sekali lalu disimpan sebagai PNG, atau desain manual. Pakai warna `theme.accent` dan judul hero tiap JSON.
2. **Kartu harga homepage harus tampil tanpa JavaScript** (temuan audit #5). `HargaLanding` (`src/components/landing/harga.tsx`)
   dialirkan dalam `<Suspense>`; cek di HP murah/3G dan dengan JavaScript dimatikan bahwa harga muncul di HTML.
3. **FAQ menyebut kuota paket secara tertulis** di `lp/industri/*.json` (mis. "Paket Bisnis mendukung 3 nomor dan
   4.000 balasan AI"). Kalau admin mengubah kuota, FAQ jadi salah. Opsi: token seperti `{paket.bisnis.kuota_nomor}`
   yang diganti saat render di `template.ts` dari `DataLp.paket`.
4. **Industri baru: properti & pabrik** (disebut brief, belum ada JSON/prompt-nya; perlu isi dari tim). Langkah ada
   di `lp/README.md` bagian "Menambah industri".
5. TikTok Pixel & GA4: `lp.js` sudah mendukung, tetapi `template.ts` mengisi `tiktok_pixel_id: ""` dan `ga4_id: ""`.
   Kalau pengguna memberi ID, tambahkan pengaturan admin (pola menu Pixel) lalu teruskan ke `runtime.tracking`.

---

## Verifikasi & rilis (untuk tiap tugas)

1. `npx tsc --noEmit -p .` (abaikan error milik sesi lain; pastikan tidak ada error di berkas Anda) dan
   `npx eslint <berkas Anda> lp`.
2. `node --import ./uji/loader.mjs uji/uji-lp.mjs` + uji baru Anda.
3. Build salinan bersih (lihat bagian 0), jalankan standalone dengan PostgreSQL sementara (`uji/pg-lokal.mjs`,
   `mulaiPg({ dir, sementara: true })`), ukur waktu respons, ambil screenshot Chrome headless lewat CDP
   (`C:/Program Files/Google/Chrome/Application/chrome.exe --headless=new --remote-debugging-port=...`).
4. Kirim screenshot ke pengguna dengan keterangan per gambar.
5. Commit hanya berkas/hunk Anda (pesan commit bahasa Indonesia, akhiri dengan baris
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`), push ke `main`, tunggu `gh run list --branch main`
   sampai `completed success`, lalu cek produksi dengan `curl`.
