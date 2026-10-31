# Asisten WhatsApp

Dashboard untuk mengelola banyak nomor WhatsApp dan base knowledge-nya, plus jembatan yang
meneruskan chat masuk ke AI (Hermes, profil `cs`) dan mengirim balasannya saat pemilik nomor tidak
sempat membalas.

**Identitas bot ditentukan knowledge tiap nomor, bukan ditanam di kode.** SOUL (`hermes/SOUL-cs.md`)
hanya berisi aturan umum; siapa bot itu, mewakili siapa, dan fakta apa yang ia tahu datang dari
base knowledge + instruksi khusus nomor tersebut. Satu nomor bisa jadi CS sebuah usaha, nomor lain
asisten pribadi seseorang.

```
Pelanggan ─► WhatsApp ◄──WebSocket──► app ini (Baileys) ──► Hermes (profil cs) ──► 9Router
                                         │  knowledge nomor itu disisipkan di tiap permintaan
```

WhatsApp dijalankan dengan [Baileys](https://github.com/WhiskeySockets/Baileys) **di dalam proses
app ini**: tidak ada container WhatsApp terpisah, tidak ada webhook, tidak ada port tambahan.

- **Banyak nomor sekaligus** (batas `MAKS_NOMOR`, default 30). Tiap nomor = satu koneksi WebSocket
  dengan QR sendiri, dan bisa di-logout/diganti tanpa mengganggu nomor lain. "Tambah nomor" langsung
  memunculkan QR.
- **Hemat sumber daya** (`src/lib/wa.ts`): riwayat chat tidak disinkronkan dan pesan tidak disimpan;
  grup, status, dan saluran dibuang sebelum didekripsi; nomor yang belum dipasangkan tidak punya
  koneksi sampai QR-nya diminta dan koneksinya ditutup lagi bila QR tidak dipindai (±160 detik);
  saat server mulai, nomor disambungkan bergiliran (0,7 detik per nomor).
- **Semua data di PostgreSQL**, termasuk sesi login WhatsApp tiap nomor (tabel `wa_auth`), bukan
  di ribuan berkas. Restart atau deploy ulang tidak membuat nomor perlu scan lagi.
- **Knowledge per nomor**: PDF, berkas teks (.txt/.md/.csv), atau teks yang ditulis langsung. Yang
  disimpan hanya teksnya. Sampai 14.000 karakter seluruh isi dikirim ke AI; di atas itu hanya
  potongan paling relevan (pencarian teks penuh PostgreSQL).
- **Isi chat tidak disimpan.** Riwayat percakapan dipegang Hermes per pelanggan; app hanya menyimpan
  keadaan kecil per chat (kunci ter-hash) untuk batas laju dan jeda ambil-alih. Keadaan itu dipegang
  di memori selama chat aktif dan ditulis ke database di latar, jadi keputusan serah-terima tidak
  menunggu database.
- **Serah-terima manusia ↔ AI** (per nomor, diatur di "Pengaturan nomor"):
  - AI baru menjawab bila pesan pelanggan tidak dibalas manusia dalam `tunggu_detik` (default 5),
    dihitung dari pesan terakhir pelanggan. Selama menunggu AI tidak menandai dibaca/mengetik.
  - Chat dibuka di HP (pesan terbaca) sebelum jawaban AI terkirim → AI menahan diri selama
    `tunggu_baca_detik` (default 45); jawaban yang sudah disusun disimpan, bukan dibuang.
  - Manusia membalas dari HP → jawaban AI dibatalkan (termasuk bila AI sedang menyusun jawaban),
    dan AI diam di chat itu selama `jeda_detik` (default 1.800 = 30 menit; diisi dalam detik atau menit;
    0 = hanya untuk pesan itu).
  - Nomor tetap berstatus offline supaya HP pemilik terus menerima notifikasi; nomor hanya dibuat
    "online" selama AI mengetik balasan, lalu dikembalikan.
- **Aturan anti-blokir** (`src/lib/bridge.ts`): hanya membalas chat pribadi yang masuk, ada
  "mengetik" sebelum membalas, maks 10 balasan per 10 menit per chat. Baileys, seperti WAHA, adalah
  klien tidak resmi: risiko pembatasan dari WhatsApp tetap ada, terutama untuk nomor baru yang
  langsung ramai.

## Struktur

| Lokasi | Isi |
|---|---|
| `src/lib/wa.ts` | Gerbang WhatsApp (Baileys): koneksi per nomor, QR, sambung ulang, kirim/baca/mengetik |
| `src/lib/wa-auth.ts` | Sesi login Baileys di PostgreSQL + cache kunci |
| `src/lib/bridge.ts` | Event WhatsApp → Hermes → balasan; serah-terima manusia ↔ AI |
| `src/lib/knowledge.ts` | Potong teks, indeks, pilih konteks, susun pesan sistem |
| `src/lib/hermes.ts` | Klien Hermes |
| `src/lib/db.ts` | Koneksi PostgreSQL (postgres.js, pool 4) + skema/migrasi |
| `src/lib/impor-sqlite.ts` | Pindahan sekali jalan dari `wa.db` lama (SQLite) |
| `src/instrumentation.ts` | Menyalakan gerbang WhatsApp saat server mulai |
| `src/app/(app)` | Halaman dashboard |
| `hermes/SOUL-cs.md` | Aturan umum bot, tanpa identitas (dipasang ke profil Hermes `cs`) |
| `deploy/` | Dockerfile runtime, compose app, skrip deploy; `deploy/postgres/` untuk databasenya |
| `uji/` | Skrip uji (lihat "Uji") |

## Dev lokal

Butuh Node 24. Salin `.env.example` ke `.env.local` dan isi, lalu di dua terminal:

```bash
npm run db    # PostgreSQL 15 lokal (biner dari paket dev embedded-postgres), data di ./data/pg, port 5434
npm run dev
```

WhatsApp langsung bisa dipakai (koneksi keluar ke server WhatsApp); hanya Hermes yang ada di VPS:
buka tunnel SSH ke port-nya dan arahkan `HERMES_API_URL` ke `127.0.0.1`.

Jangan mengarahkan dev ke database produksi: dua proses yang memakai kredensial WhatsApp yang sama
akan saling memutus (kode 440).

### Uji

Semua uji memakai PostgreSQL 15 sungguhan yang dijalankan sementara di mesin ini dan kode
`src/lib` yang asli; yang ditiru hanya server WhatsApp dan Hermes.

| Perintah | Isi |
|---|---|
| `npm run uji` (±3 menit) | `uji-auth`: penyimpanan sesi login (13 pemeriksaan + rencana query + kecepatan). `uji-data`: pindahan dari SQLite, pencarian knowledge, rencana query pada 33 ribu potongan (17). `uji-alur`: koneksi, QR, serah-terima manusia ↔ AI, sambung ulang, logout, 12 nomor serentak, database putus (40). |
| `node --import ./uji/loader.mjs uji/uji-next.mjs` | Server hasil `npm run build` lewat HTTP: impor otomatis dari SQLite, kecepatan endpoint, QR sungguhan untuk 12 nomor. |
| `node --expose-gc --import ./uji/loader.mjs uji/uji-bocor.mjs` | 60 siklus sambung/putus sungguhan ke WhatsApp: heap dan timer harus kembali ke awal. |
| `uji/iso25010/` | Evaluasi kualitas ISO/IEC 25010 lewat browser sungguhan (fungsional & keamanan E2E, aksesibilitas WCAG, responsif, beban). Hasil & cara pakai: `docs/evaluasi-iso-25010.md`. |

## Produksi (VPS 31.97.67.66)

Dipindah dari VPS 187.52.115.253 pada 2026-10-29 (database, sesi WhatsApp, dan profil Hermes `cs`
ikut pindah; app & Hermes di server lama dihentikan dan tidak menyala lagi saat reboot).


- `/opt/wa-automation` — `docker compose` berisi satu service `app` (127.0.0.1:3230 lewat
  `APP_PORT` di `.env`, karena 3200 dipakai app lain di VPS ini; batas memori 512 MB). Rahasia di `/opt/wa-automation/.env` (izin 600).
- Semua data ada di PostgreSQL (`/opt/wa-postgres`, lihat di bawah). Cadangkan database itu; bila
  hilang, semua nomor harus scan QR ulang. Volume `wa_data` hanya menyimpan `wa.db` lama.
- Caddy (`/etc/caddy/Caddyfile`) meneruskan `wa.sukapost.tech` ke app.
- Hermes: user Linux `suka-automation`, profil `cs`, API di `127.0.0.1:8644`.

### Deploy otomatis (CI/CD)

Setiap push ke `main` menjalankan `.github/workflows/deploy.yml` di GitHub Actions: lint → build →
seluruh uji (`npm run uji` + uji server hasil build) → deploy ke VPS. Deploy **hanya** terjadi bila
semuanya lolos. Perubahan yang hanya menyentuh `*.md`, `knowledge-cs/`, atau `hermes/` tidak
memicu deploy. Bisa juga dijalankan manual dari tab Actions ("Run workflow").

- Di VPS paketnya diterima `/opt/wa-automation/bin/terima-deploy.sh` (sumber: `deploy/terima-deploy.sh`):
  memasang build baru, membuat ulang container, menunggu `/api/health`, dan mencocokkan penanda versi
  (commit) di dalam container. Bila versi baru tidak sehat, versi sebelumnya dikembalikan dan
  workflow gagal.
- GitHub masuk ke VPS dengan kunci SSH khusus deploy (secrets `VPS_SSH_KEY`, `VPS_HOST`,
  `VPS_KNOWN_HOSTS`). Di `/root/.ssh/authorized_keys` kunci itu dikunci ke skrip penerima
  (`restrict,command=...`): tidak bisa membuka shell, menjalankan perintah lain, atau meneruskan port.
  Mencabut akses CI = hapus baris berkomentar `github-actions-deploy-wa-automation` dari berkas itu.
- Skema database dimigrasikan app sendiri saat mulai; `.env` dan PostgreSQL di VPS tidak disentuh deploy.
- Mengubah skrip penerima: sunting `deploy/terima-deploy.sh`, lalu salin sendiri ke VPS (sengaja
  tidak ikut ter-deploy otomatis, supaya paket dari CI tidak bisa mengganti skrip yang membatasinya).

Deploy manual dari mesin ini (tanpa lewat GitHub) tetap bisa:

```bash
SSH_KEY=~/.ssh/id_ed25519_vps bash deploy/deploy.sh root@31.97.67.66
```

Memantau: `docker stats wa-automation-app-1` (memori) dan `docker compose logs -f app | grep "\[wa"`
(koneksi tiap nomor: terhubung, terputus + kode, sambung ulang).

Mesin AI (`src/lib/ai.ts`) dikelola admin di `/admin` → "Mesin AI", berlaku langsung tanpa restart:
**Hermes** (utama, bawaan) atau **Claude API** (Anthropic langsung; model utama + cadangan dipilih dari daftar
model akun Anthropic). API key TIDAK lewat dashboard: developer memasang `ANTHROPIC_API_KEY` di
`/opt/wa-automation/.env` (admin hanya melihat statusnya). Setiap jawaban,
apa pun penyedianya, melewati penjaga (`src/lib/pemeriksa.ts`): mengaku admin/pemilik, menjanjikan tindakan,
atau angka/tautan tak bersumber = ditulis ulang sekali, lalu jawaban aman. Biaya & token per balasan: tabel `ai_pakai`.
Membandingkan model dengan percakapan asli: `uji/banding-model.mjs` (cara pakai di awal berkas).

Paket & pembayaran (`src/lib/langganan.ts`, `src/lib/midtrans.ts`), semuanya dikelola admin di `/admin`:
- **Paket** (harga, durasi, kuota nomor, kuota balasan AI). Langganan menyimpan salinan kuota saat dibeli.
  Akun tanpa paket memakai kuota gratis bulanan (bulan kalender WIB). Admin tanpa batas.
- **Paket Custom** (`src/lib/paket-custom-def.ts` rumus, `src/lib/paket-custom.ts` simpan; admin: Paket & harga →
  Paket Custom): admin mengisi kuota balasan AI, durasi, dan nomor (otomatis dari pemakaian nyata atau manual);
  harga otomatis = (modal AI + server + biaya tetap bayar) ÷ (1 − margin − persen bayar), dibulatkan (kelipatan,
  opsi harga cantik …9.000) dan bisa ditimpa harga sendiri. Pratinjau di browser dan server memakai rumus yang
  sama; server menghitung ulang saat menyimpan. Opsi "mengikuti kurs": harga otomatis dihitung ulang sendiri bila
  kurs bergeser ≥1%. Kartunya membuka chat WhatsApp admin (pesan memuat rincian paket) atau dibayar langsung lewat
  Midtrans: isiannya dicerminkan ke baris tabel `paket` berkode `_custom` (tidak ikut daftar & simulasi paket
  biasa; bisa juga diberikan admin dari halaman pengguna).
- **Kurs USD → Rp** (`src/lib/kurs.ts`): Coinbase (kurs pasar real-time) dicek silang dengan kurs referensi ECB
  (Frankfurter) dan ExchangeRate-API; angka yang menyimpang >3% dibuang. Diperbarui tiap 10 menit (kurs referensi
  harian paling sering tiap jam), tombol "Perbarui" di panel admin; kalkulator harga memantaunya lewat `/api/kurs`.
- **Kuota balasan AI ditegakkan** di jembatan WhatsApp: habis = AI diam (pesan tetap tercatat), dicek dari
  memori dan disegarkan tiap 60 dtk, jadi tidak ada query tambahan per pesan.
- **Midtrans Snap** (bawaan production): developer memasang `MIDTRANS_SERVER_KEY` (dan opsional
  `MIDTRANS_SIGNATURE_KEY`, `MIDTRANS_MODE=sandbox`) di `/opt/wa-automation/.env`; admin hanya melihat status.
  Payment Notification URL di dashboard Midtrans: `https://wa.sukapost.tech/api/midtrans/notifikasi`.
  Webhook memeriksa tanda tangan SHA-512, lalu status diambil ulang dari API Midtrans dan nominal dicocokkan;
  paket aktif tepat sekali. Bayar paket yang sama = diperpanjang; paket lain = mulai baru.
- Tur panduan (`src/components/tur.tsx`, isi di `isi-tur.tsx`) tampil sekali per akun di dashboard dan halaman
  nomor; tombol "Panduan" di sidebar memutarnya ulang.

Mengubah aturan bot: sunting `hermes/SOUL-cs.md`, salin ke
`/home/suka-automation/.hermes/profiles/cs/SOUL.md` (tanpa baris komentar pertama), lalu
`systemctl --user restart hermes-gateway` sebagai `suka-automation`.

Admin pertama dibuat dari `ADMIN_EMAIL` / `ADMIN_PASSWORD` saat tabel pengguna masih kosong.
Belum ada halaman kelola pengguna: menambah pengguna atau mengganti password lewat
`deploy/pengguna.mjs` (cara pakainya ada di awal berkas itu). Semua pengguna setara admin.

### PostgreSQL (`/opt/wa-postgres`)

Database app ini: PostgreSQL 15 kecil, proyek compose terpisah dari app (`deploy/postgres/`).

- Alamat: `127.0.0.1:5433`, hanya dari dalam VPS (jaringan host, tidak ada port ke luar).
- Database `wa`, role aplikasi `wa` (bukan superuser, maks 15 koneksi, `statement_timeout` 30 dtk).
  Kata sandi dan `WA_DATABASE_URL` ada di `/opt/wa-postgres/.env` (izin 600); nilai itu yang diisikan
  sebagai `DATABASE_URL` di `/opt/wa-automation/.env`.
- Disetel untuk memori kecil (`postgresql.conf`): `shared_buffers` 32 MB, 20 koneksi, tanpa
  replikasi/paralel/JIT, batas container 256 MB tanpa swap. Terukur: 9 MiB saat diam, ±29 MiB
  setelah dipakai, 46 MB disk saat kosong. App memakai pool paling banyak 4 koneksi.
- Skema dibuat dan dimigrasikan otomatis oleh app saat mulai (`src/lib/db.ts`).
- Pasang/perbarui: `SSH_KEY=~/.ssh/id_ed25519_vps bash deploy/postgres/pasang.sh root@31.97.67.66`.
- Masuk sebagai admin: `docker exec -it wa-postgres-db-1 psql -U postgres -p 5433 wa`.
- Belum ada cadangan otomatis. Cadangan manual:
  `docker exec wa-postgres-db-1 pg_dump -U postgres -p 5433 -Fc wa > wa.dump`.

### Pindah dari SQLite (sekali saja)

Versi sebelumnya menyimpan data di `wa.db` (SQLite) dalam volume `wa_data`. Saat versi ini pertama
kali mulai dan PostgreSQL masih kosong, isi `wa.db` diimpor otomatis dalam satu transaksi (pengguna,
nomor, knowledge, statistik, keadaan chat, dan sesi WhatsApp bila ada). Berkas lama tidak diubah.
Hasilnya tercatat di log (`[db] data lama diimpor ...`) dan di tabel `settings` (kunci
`impor_sqlite`), sehingga tidak pernah terulang.

### Pindah dari WAHA (sekali saja)

Versi sebelumnya memakai container WAHA. Sesi WAHA tidak bisa dipindahkan ke Baileys, jadi setiap
nomor **harus scan QR ulang** dari dashboard setelah deploy versi ini. `deploy.sh` menghentikan
container `waha`; volume `wa-automation_waha_sessions` dibiarkan (untuk kembali ke versi lama) dan
bisa dihapus setelah semuanya stabil: `docker volume rm wa-automation_waha_sessions`. Variabel
`WAHA_*` di `.env` tidak dipakai lagi. Di HP, hapus perangkat tertaut lama (WAHA) dari
WhatsApp → Perangkat tertaut bila masih tercantum.
