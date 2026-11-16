# Serah-terima: panduan bergambar, tutorial GercepBot, dan pop-up keluar

> **STATUS 2026-11-09: SELESAI & di-push** (commit `7f77f20`): `/panduan`, katalog + kartu knowledge GercepBot
> (`src/lib/panduan-katalog.ts`), pop-up `tahan-keluar.tsx`, link di landing. `panduan-pengguna/` sengaja tidak
> di-commit. Masih terbuka: (1) cek read-only di VPS bahwa GercepBot ada di `sinkron_cg_nomor` dan punya 25 item
> "📘 Panduan" (konfirmasi IP dulu); (2) lanjutan pesan pengguna yang terpotong di "dan…"; (3) apakah link
> `chatgercep.com/panduan` sudah cukup "spesial". Skrip screenshot: `ss-panduan.mjs` di scratchpad sesi ini
> (catatan: di emulasi HP, `Input.dispatch*` + `setEmitTouchEventsForMouse` membuat CDP menggantung).

Dokumen ini supaya agen lain bisa melanjutkan tanpa kehilangan konteks. Ditulis 2026-11-09.
Semua komunikasi dengan pengguna **dalam bahasa Indonesia**.

---

## 1. Permintaan pengguna (kutipan asli, urut)

**Permintaan 1 (SUDAH SELESAI):**
> buat panduan paling simple dan lengkap untuk user awam banget tentang penggunaan sistem ini pake foto foto step by step … foto foto dashboard nya dan kasih garis dan anak panah merah … terutama dibagian menyambungkan akun whatsapp dan mengisi product knowledge nya dan pembayarannya … kirim ke saya yg udah di kasih coretan merah dan petunjuk arah

**Permintaan 2 (SEDANG DIKERJAKAN):**
> tambahkan foto foto itu ke halaman panduan di landing page aja (halaman terpisah agar nanti link nya bisa saya share link ini harus spesial) dan tambahkan juga ke katalog base knowledge chat gercep bot, kalo ada user yg tanya tentang gimna cara nya maka kasih tutorial ini step by step per kategori sesuai flow yg terstruktur (jangan kirim foto ini sekaligus ke wa) hanya per kategori aja lanjut jika user ingin tau lagi.
>
> dan tambahkan fitur ketika user mau close website ini dan close tab akan ada konfirmasi dulu, dengan text hard selling, contohnya: yakin gamau coba chatgercep mulai dari 67k bisa otomatiskan whatsapp mu loh dan jaminan uang kembali kalo ga sesuai. pokoknya kata kataanya ubah jadi lebih sikologis lagi agar orang mau beli dan

⚠️ Pesan pengguna **terpotong** di kata "dan". Tanyakan ke pengguna apa lanjutannya saat melapor.

**Permintaan 3:** buat dokumen .md ini.

---

## 2. Aturan wajib (dari CLAUDE.md global + memori proyek)

- **UI tidak boleh di-push ke `main` sebelum pengguna melihat screenshot & bilang setuju.** Push ke `main` = deploy otomatis ke produksi (VPS 31.97.67.66). Screenshot Chrome headless desktop (±1440) + HP (±390), semua keadaan penting, kirim lewat SendUserFile dengan keterangan per gambar.
- Screenshot dari **build lokal + PostgreSQL sementara** (`uji/pg-lokal.mjs`), **jangan** memakai DB/sesi/kredensial produksi, jangan buat cookie sesi asli.
- Koneksi WhatsApp produksi tidak boleh putus; jangan menjalankan server lokal dengan DB produksi.
- Sebelum pekerjaan server baru: tampilkan IP VPS & tunggu konfirmasi (memori `konfirmasi-ip-vps`).
- Istilah di konten = **"product knowledge"** (UI aplikasi tetap "Base knowledge"/"Knowledge").
- **Aturan tanpa free trial**: jangan menulis "gratis trial/kuota gratis". Yang benar: daftar gratis + Uji bot gratis, AI membalas pelanggan sungguhan hanya setelah berlangganan. Jaminan uang kembali = `MASA_ID` dari `src/lib/jaminan-def.ts` (saat ini "1×24 jam"), hanya pembayaran **pertama** lewat **GoPay/ShopeePay/QRIS**, pemakaian ≤ `JAMINAN_MAKS_PAKAI_PERSEN`.
- Performa: payload kecil, gambar lazy, query efisien; laporkan angka nyata (KB, ms).
- Proyek Next.js 16 (versi dengan perubahan besar): baca `node_modules/next/dist/docs/` sebelum menulis API Next yang belum pasti.
- **Ada sesi/agen lain yang sedang mengubah repo ini** (file termodifikasi milik orang lain saat ini: `src/app/[lang]/(app)/dashboard/page.tsx`, `src/app/actions.ts`, `src/lib/bridge.ts`, `src/lib/wa.ts`, `src/lib/langganan.ts`, `src/lib/numbers.ts`, `src/lib/types.ts`, `src/app/api/wa/status/route.ts`, `src/components/{banner-akun,isi-tur,kartu-langganan,tur}.tsx`, admin, `globals.css`, dll.). **Jangan sentuh/commit file-file itu.** Saat commit, `git add` hanya file milik pekerjaan ini.

---

## 3. Yang SUDAH selesai (permintaan 1)

Hasil di `panduan-pengguna/` (belum di-commit, sudah dikirim ke pengguna):
- `panduan-pengguna/gambar/*.png` — 29 screenshot beranotasi merah (desktop 2732 px lebar, HP 1170 px).
- `panduan-pengguna/panduan.html` → `Panduan-Mudah-ChatGerCep.pdf` (24 halaman A4, dicetak `chrome --headless --print-to-pdf`).
- Data contoh: akun "Ani Lestari", usaha "Toko Kue Bu Ani", nomor 6281234567890, kode tautan `R7KD-2MXA`. Semua fiktif.
- Gambar `05-scan-dari-hp` & `07b-masukkan-kode-di-hp` adalah **ilustrasi buatan** (bukan layar WhatsApp asli).

Skrip pembuat screenshot (di scratchpad sesi lama, bisa hilang — salin bila perlu):
`C:\Users\CREATO~1\AppData\Local\Temp\claude\2d291fffb537a7d6\dbfddbc1-ee8a-43d6-8d05-9346dd2b4981\scratchpad\`
- `panduan.mjs` — build standalone + PG sementara + Chrome CDP; status WA/QR/Uji bot/Rapikan AI/tagihan dipalsukan lewat CDP `Fetch`; server di-restart antar tahap supaya cache nomor/langganan segar. Jalankan dari akar repo: `node --import ./uji/loader.mjs <path>/panduan.mjs ["regex-nama-foto"]` (argumen = hanya ulang foto yang cocok). Butuh `npx next build` dulu.
- `coret.js` — overlay coretan (popover top layer, jadi tampil di atas `<dialog>`). Opsi item: `q, teks, no, sisi(kanan|kiri|atas|bawah), jarak, geserX/Y, lebar, pad, tanpaPanah, tanpaKotak, jangkar`. Opsi foto: `h` (tinggi viewport), `fokus` (+`geser`), `area`. Catatan: html memakai smooth scroll → gulir harus `behavior:"instant"`; tab bar sticky → fokus ke `#panel-<tab>`, bukan `#tab-<tab>`.
- `ilustrasi-hp.html` — sumber ilustrasi HP (#qr, #kode).
- `lembar.py` — bikin lembar kontak untuk mengecek banyak gambar sekaligus.

---

## 4. Permintaan 2 — status per bagian

### 4a. Halaman publik `/panduan` (shareable) — SEBAGIAN

Sudah dibuat:
- `public/panduan/<nama>.webp` (desktop 1600w, HP 720w, total ±1,85 MB), `public/panduan/<nama>-900.webp` (desktop 900w untuk HP, total ±643 KB), `public/panduan/wa/<nama>.jpg` (untuk dikirim bot, 1600w/900w, q82, ±80–200 KB/berkas). Dibuat dari PNG dengan PIL.
- `src/lib/panduan-def.ts` — **satu sumber data**: `PANDUAN` = 7 kategori berurutan (id, judul/ringkas/teks id+en, `kataKunci`, langkah{gambar, hp?, w, h}): `daftar`, `sambung-qr`, `sambung-kode`, `knowledge`, `uji-bot`, `bayar`, `nyalakan`. Juga `AWALAN_PANDUAN = "📘 Panduan "` dan `namaItemPanduan(k, kat, i)`.
- Sudah ditambahkan `/panduan` ke: `src/proxy.ts` (set `PUBLIK`), `src/lib/analitik-def.ts` (`POLA_HALAMAN` + `HALAMAN_PUBLIK`), `src/lib/analitik-nama.ts` (`NAMA_HALAMAN`), `next.config.ts` (header Cache-Control `public, max-age=86400` untuk `/panduan/:berkas`).

Belum:
- **`src/app/[lang]/panduan/page.tsx`** (wajib ada, karena `uji/uji-analitik.mjs` mencocokkan POLA_HALAMAN dengan page.tsx). Rencana desain:
  - Ikuti gaya `src/app/[lang]/program-afiliasi/page.tsx`: hero gelap `bg-ink` + `kisi-tinta`, header (Logo, link Beranda, GantiBahasa, Masuk, Daftar), `KakiPerusahaan`, `WidgetWaLanding`.
  - Hero: "Panduan Mudah ChatGerCep — dari daftar sampai AI membalas pelanggan", 7 langkah, harga mulai (pakai `HargaMulai` dari `components/landing/harga.tsx`), tombol **Bagikan panduan** (navigator.share → fallback salin link + tautan `wa.me/?text=`).
  - Navigasi kategori (chip lengket/sticky) ke `#daftar`, `#sambung-qr`, …
  - Tiap kategori: nomor besar, judul, ringkas; langkah desktop = teks lalu gambar besar (`<img loading="lazy" decoding="async" width height srcset="…-900.webp 900w, ….webp 1600w" sizes>` — jangan next/image, deploy membuang `@img`); langkah HP = bingkai HP berjajar 2–3 kolom. Gambar bisa diklik untuk dibuka penuh.
  - CTA akhir "Daftar sekarang" + jaminan `MASA_ID`.
  - Metadata: title, description, `alternates` (/panduan, /eng/panduan), `robots index`, **OG image** khusus supaya pratinjau di WA bagus — rencana: buat `public/panduan/og.jpg` 1200×630 dengan PIL (latar hijau gelap, judul, cuplikan screenshot).
  - Tambahkan link "Panduan" di nav & footer landing (`src/app/[lang]/page.tsx`; file ini bersih dari perubahan orang lain).
  - "Link harus spesial": tanyakan/konfirmasi ke pengguna apakah `chatgercep.com/panduan` cukup.

### 4b. Tutorial bergambar di GercepBot (per kategori) — BELUM (rencana sudah matang)

Fakta kode:
- GercepBot = nomor id 8 milik user 6 (peran user biasa) di produksi. Knowledge otomatis khusus admin = `src/lib/sinkron-cg.ts` (nomor yang ikut ada di setting `sinkron_cg_nomor`, dokumen `nama_berkas` = `DOKUMEN_CHATGERCEP`, disusun `susunTeksCg()` dalam kartu ≤1100 karakter via `kartu()`, ditulis bila hash berubah).
- Katalog: tabel `produk` (foto bytea ≤1,5 MB JPEG/PNG/WebP, nama ≤80, deskripsi ≤400, maks 100/nomor). AI mengirim lewat tag `<kirim_produk>P12,P15</kirim_produk>` (maks 10 foto/balasan). Lihat `src/lib/katalog-def.ts` (`blokKatalog`, `teksKatalog`, `captionProduk`, `pilihUntukKirim`) & `src/lib/katalog.ts` (`katalogBoleh` = admin atau akun berbayar, cache 60 dtk).

Rencana (tanpa menyentuh `bridge.ts` yang sedang diubah sesi lain):
1. **Modul baru `src/lib/panduan-katalog.ts`**: untuk setiap nomor di `sinkron_cg_nomor`, sinkronkan item katalog panduan (26 item: semua langkah `PANDUAN`) — nama `namaItemPanduan()`, deskripsi = `judul.id + ": " + teks.id`, `harga = null`, foto dari `public/panduan/wa/<gambar>.jpg` (baca via `fs` dari `process.cwd()/public`), `urutan = 1000 + n`. Simpan hash isi di setting `panduan_katalog_hash:<id>`; bila beda → hapus baris `nama LIKE '📘 Panduan %'` nomor itu lalu insert ulang (INSERT langsung, lewati batas 100 di `simpanProduk`). Dipanggil dari `susun()` dan `setNomorSinkronCg()` di sinkron-cg (saat dimatikan: hapus item panduan).
2. **`katalog-def.ts`**: item berawalan `AWALAN_PANDUAN` bukan produk → `captionProduk` tanpa harga (jangan tampil "harga tanya admin"), `teksKatalog`/`pilihUntukKirim("semua")` mengecualikannya, `blokKatalog` menuliskannya ringkas tanpa deskripsi dalam blok terpisah "Gambar panduan" (hemat token).
3. **`katalog.ts` `katalogBoleh`**: izinkan juga pemilik nomor yang ada di `sinkron_cg_nomor` (baca setting langsung, jangan impor sinkron-cg → hindari impor melingkar), supaya foto tetap terkirim walau akun GercepBot bukan admin/berbayar.
4. **Kartu knowledge baru di `susunTeksCg()`** (kartu per kategori + satu kartu aturan), misalnya:
   - Bila ditanya "gimana caranya / cara daftar / cara sambung WA / scan QR / isi knowledge / cara bayar…", jelaskan **hanya kategori yang relevan** dengan langkah bernomor singkat, lalu kirim gambarnya dengan `<kirim_produk>` berisi semua kode P yang namanya diawali "📘 Panduan N ·".
   - **Jangan kirim lebih dari satu kategori per balasan.** Setelah itu tawarkan kategori berikutnya ("Mau lanjut ke langkah berikutnya: …?") dan kirim hanya bila pelanggan mau.
   - Urutan flow: 1 Daftar akun → 2 Sambungkan WhatsApp (laptop+HP) atau 3 (hanya 1 HP) → 4 Isi product knowledge → 5 Uji bot → 6 Bayar langganan → 7 Nyalakan AI & pantau. Pertanyaan umum tanpa topik: mulai kategori 1 atau tanya sudah sampai mana.
   - Sertakan link lengkap `https://chatgercep.com/panduan` (knowledge memuat URL ini supaya lolos pemeriksa jawaban).
   - Gunakan `kat.kataKunci` sebagai "Kata kunci" kartu.
5. Tambah uji kecil (mis. di `uji/uji-sinkron.mjs` atau berkas baru, daftarkan di `uji/jalankan-semua.mjs`): caption panduan tanpa harga, "semua" tidak menyertakan panduan, sinkronisasi idempoten (hash).
6. Di produksi tidak perlu tulis DB manual: setelah deploy, sinkron-cg berjalan sendiri (jaga tiap jam / saat server mulai). Pastikan GercepBot memang ada di `sinkron_cg_nomor` (cek read-only, konfirmasi IP VPS dulu).

### 4c. Konfirmasi saat mau menutup tab (hard selling) — BELUM

Fakta teknis yang harus dijelaskan ke pengguna: **browser tidak mengizinkan teks kustom di dialog tutup tab** (`beforeunload` hanya menampilkan "Tinggalkan situs?" bawaan, dan hanya setelah pengunjung berinteraksi). Rencana:
- Komponen klien baru `src/components/landing/tahan-keluar.tsx`, dipasang di landing (`src/app/[lang]/page.tsx`) dan `/panduan` (bukan dashboard).
- **Modal exit-intent** dengan teks hard selling: desktop = kursor keluar lewat atas layar (setelah ±5 dtk di halaman); HP = tombol Back (setelah interaksi pertama, `history.pushState(history.state, "", location.href)` — salin state Next supaya router tidak reload; saat `popstate` tampilkan modal, sekali saja). Tampil sekali per sesi (`sessionStorage`, dibungkus try/catch).
- **`beforeunload` bawaan** sebagai pengaman Ctrl+W/tutup tab: aktif hanya sebelum modal pernah tampil, dan dinonaktifkan saat klik link/tombol internal atau submit form (navigasi klien Next tidak memicu unload, tapi tautan biasa/ganti bahasa mungkin).
- Harga "mulai Rp67rb" diambil dari DB (paket berbayar termurah, seperti `HargaMulai`), dikirim sebagai prop; jaminan pakai `MASA_ID`.
- Draf teks (psikologi: loss aversion, jangkar harga vs gaji admin, risk reversal, komitmen kecil):
  - Judul: "Tunggu dulu… malam ini berapa pembeli yang kabur karena chat-nya telat dibalas?"
  - Isi: "Pembeli yang tidak dibalas cepat langsung chat toko sebelah. ChatGerCep membalas WhatsApp Anda dalam hitungan detik, 24 jam, bahkan saat Anda tidur. Mulai Rp67rb/30 hari, jauh lebih hemat dari gaji admin."
  - Poin: ✓ Siap dalam hitungan menit: scan QR, isi info usaha, selesai · ✓ HP tetap dipakai seperti biasa · ✓ Tidak cocok? Uang kembali 100% dalam 1×24 jam* (*pembayaran pertama via GoPay, ShopeePay, atau QRIS)
  - Tombol utama: "Ya, saya mau pelanggan dibalas otomatis →" (/daftar); tombol kedua di landing: "Lihat panduannya dulu" (/panduan); tutup: "Nanti saja" (hindari confirmshaming).
  - Tambah `data-analitik` pada tombol untuk mengukur konversi.

### 4d. Setelah semua dibuat
1. `npx tsc --noEmit`, `npm run lint`, `npm run uji` (catat bila gagal karena perubahan sesi lain), `npx next build`.
2. Screenshot headless (pakai pola `panduan.mjs`): `/panduan` desktop & HP (atas, tengah tiap kategori, CTA, tombol bagikan), landing dengan link Panduan, modal tahan-keluar desktop & HP, dialog `beforeunload` tidak bisa difoto (sebutkan). Kirim ke pengguna dengan keterangan per gambar.
3. **Tunggu "setuju" dari pengguna sebelum commit & push ke `main`.** Commit hanya file pekerjaan ini (lihat daftar di bawah). `panduan-pengguna/` (PNG/PDF besar) — tanyakan apakah perlu ikut di-commit; `public/panduan/` wajib ikut.
4. Laporkan angka nyata (ukuran halaman/gambar KB, jumlah request).

---

## 5. Daftar file pekerjaan ini

Sudah dibuat/diubah:
- `panduan-pengguna/` (gambar PNG, `panduan.html`, `Panduan-Mudah-ChatGerCep.pdf`, dokumen ini)
- `public/panduan/*.webp`, `public/panduan/*-900.webp`, `public/panduan/wa/*.jpg`
- `src/lib/panduan-def.ts` (baru)
- `src/proxy.ts`, `src/lib/analitik-def.ts`, `src/lib/analitik-nama.ts`, `next.config.ts` (tambahan `/panduan`)

Akan dibuat/diubah:
- `src/app/[lang]/panduan/page.tsx` (+ komponen klien bagikan)
- `src/components/landing/tahan-keluar.tsx`
- `src/app/[lang]/page.tsx` (link Panduan + pasang TahanKeluar)
- `src/lib/panduan-katalog.ts` (baru), `src/lib/sinkron-cg.ts`, `src/lib/katalog-def.ts`, `src/lib/katalog.ts`
- `public/panduan/og.jpg`
- uji terkait di `uji/`

Catatan: `.next/` sudah di-build ulang pada 2026-11-09 pagi dari working tree (termasuk perubahan sesi lain yang belum di-commit) — build ulang sebelum screenshot berikutnya.
