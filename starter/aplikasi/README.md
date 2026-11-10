# Starter ChatGerCep

Contoh aplikasi Next.js dengan tampilan buatan sendiri di atas mesin ChatGerCep (tanpa dashboard ChatGerCep). Salin folder ini, lalu ubah tampilannya sesuka Anda.

Semua panggilan ke mesin berjalan di server lewat SDK (`lib/chatgercep-sdk.ts`). API key tidak pernah dikirim ke browser.

## Menjalankan

Butuh Node.js 20 ke atas dan mesin ChatGerCep yang sudah menyala.

```bash
npm install
cp .env.contoh .env.local   # Windows: copy .env.contoh .env.local
npm run dev
```

Buka http://localhost:3000.

## Menghubungkan ke mesin sandbox

1. Jalankan mesin sandbox di komputer Anda (bawaan: `http://localhost:1975`) dengan key `cg_test_…` dari portal Developer.
2. Isi `.env.local`:
   - `CHATGERCEP_ALAMAT=http://localhost:1975`
   - `CHATGERCEP_KEY=cg_test_…`
   - `ALAMAT_APLIKASI`: alamat aplikasi ini seperti dilihat mesin. Mesin berjalan di Docker di komputer yang sama? Pakai `http://host.docker.internal:3000`, karena `localhost` di dalam container menunjuk ke container itu sendiri.
3. Jalankan ulang `npm run dev`, buka **Pengaturan**, tekan **Daftarkan webhook aplikasi ini**.
4. Salin baris `CHATGERCEP_RAHASIA_WEBHOOK=whsec_…` yang muncul ke `.env.local`. Rahasia hanya ditampilkan sekali. Sampai aplikasi dijalankan ulang, rahasia itu sudah dipakai dari memori, jadi Anda bisa langsung mencoba.
5. Tekan **Kirim event uji**. Event `webhook.uji` muncul di daftar "Event terakhir diterima".
6. Buka **Sambungkan**, tambah nomor, lalu pindai QR-nya.

Sandbox hanya boleh berkirim pesan dengan satu nomor penguji yang sudah diverifikasi di portal Developer. Mengirim ke nomor lain dijawab `bukan_nomor_penguji`.

## Halaman

| Alamat | Isi |
| --- | --- |
| `/` | Status mesin (mode, lisensi, fitur) dan daftar nomor |
| `/sambungkan` | Tambah nomor, QR dan status secara langsung, kode pairing |
| `/informasi-usaha` | Dokumen yang dipakai bot AI untuk menjawab: daftar, tambah teks, hapus |
| `/kirim` | Kirim pesan lewat antrean anti-blokir, dengan kunci idempotensi |
| `/inbox` | Daftar percakapan, isi pesan, balas manual, jeda atau lanjutkan bot |
| `/pengaturan` | Daftarkan dan uji webhook, lihat event yang baru diterima |
| `/api/webhook` | Penerima webhook dari mesin (tanda tangan diperiksa) |
| `/api/aliran` | Server-Sent Events: meneruskan event ke browser tanpa polling |

## Susunan kode

- `lib/chatgercep-sdk.ts`: SDK (satu berkas, tanpa dependensi). `lib/sdk.ts` mengekspor ulang isinya.
- `lib/klien.ts`: instance SDK dari `.env.local` dan percobaan ulang dengan kunci idempotensi yang sama.
- `lib/galat.ts`: pesan galat ramah per kode galat. Ubah teksnya di sini.
- `lib/peristiwa.ts`: penyimpan event webhook di memori (200 event terakhir).
- `app/aksi.ts`: semua server action (tambah nomor, kirim pesan, balas, webhook).
- `app/globals.css`: seluruh gaya tampilan. Warna dan ukuran ada di variabel paling atas.
- `komponen/`: potongan tampilan yang dipakai ulang.

## Yang perlu Anda tambahkan sebelum dipakai sungguhan

- **Login.** Contoh ini belum punya login: siapa pun yang bisa membuka aplikasi bisa mengirim pesan. Periksa sesi pengguna di setiap fungsi `app/aksi.ts`, di halaman, dan di `/api/aliran`.
- **Penyimpanan event.** `lib/peristiwa.ts` menyimpan event di memori satu proses. Untuk banyak instance atau riwayat yang awet, simpan ke database Anda dan siarkan lewat Redis atau sejenisnya.
- **HTTPS** untuk alamat webhook di production.

## Tampilan bebas diubah

Tidak ada pustaka UI. Ganti `app/globals.css`, susunan halaman, nama, dan logo sesuka Anda, atau pindahkan `lib/` dan `app/aksi.ts` ke proyek Anda sendiri. Yang perlu dijaga hanya dua hal: SDK tetap dipanggil dari server, dan tanda tangan webhook tetap diperiksa.

Lisensi: lihat `LICENSE`.
