# Rencana: ChatGerCep Developer API (versi simpel)

Tanggal: 2026-11-09 · Status: **dibangun sekaligus (F0–F4) di lokal, menunggu persetujuan tampilan sebelum push**

> Peta kode: kontrak `src/lib/api-def.ts`, `src/lib/lisensi-def.ts`, `src/lib/mode.ts`, `src/lib/peristiwa.ts`;
> pusat `src/lib/developer-api.ts` (+ `src/app/api/lisensi/aktivasi|kondisi`, `src/app/actions-developer.ts`,
> `/developer`, `/admin/developer-api`, `/docs/api`, `/docs/api/openapi.json`); mesin `src/lib/mesin/*`,
> `src/app/api/v1/**`, `src/app/api/lisensi/webhook`; paket `deploy/mesin/Dockerfile`, `.github/workflows/mesin.yml`,
> `src/lib/templat-mesin.ts`. Kunci privat lisensi: `LISENSI_KUNCI_PRIVAT` di .env server pusat (kunci publiknya
> tertanam di `lisensi-def.ts`). Uji: `uji/uji-developer-api.mjs`, `uji/uji-mesin.mjs`, `uji/uji-pengguna.mjs`.

---

## 1. Ringkasan

Developer luar memakai fitur ChatGerCep di aplikasi mereka sendiri dengan **satu API key**, tanpa
membangun dari nol.

- **Mesin ChatGerCep berjalan di server mereka (self-host).** Server, nomor WA, database, dan kunci AI
  **seluruhnya tanggungan mereka**. Kita hanya menyediakan fiturnya.
- **API gratis secara bawaan.** Developer internal bisa menjadikannya **berbayar atau gratis**, baik untuk
  semua aplikasi sekaligus maupun per aplikasi.
- **Lisensi dikirim lewat webhook** dari server kita ke mesin mereka, hanya saat ada perubahan (tanpa
  polling). Beban di server kita hampir nol.
- **Peran baru `developer`** (internal): akses semua panel admin + menu **Developer API** untuk
  menerima/menolak pengajuan, mencentang fitur, mengatur gratis/berbayar, serta mencabut key.

```
┌────────────────── SERVER DEVELOPER (semua resource mereka) ──────────────────┐
│  Aplikasi mereka ──/api/v1 + API key──▶ Mesin ChatGerCep (Docker)            │
│                                          ├ koneksi WA   ├ AI (kunci mereka)   │
│  ◀── webhook: pesan masuk, status ───────┤ knowledge    └ PostgreSQL mereka   │
└──────────────────────────────▲──────────────────────────┬────────────────────┘
       webhook lisensi (hanya   │                          │ sekali saat menyala:
       saat berubah + perpanjang)│                          │ "kondisi saya apa?"
┌──────────────────────────────┴──────────────────────────▼────────────────────┐
│ SERVER KITA chatgercep.com: portal pengajuan, panel developer internal,      │
│ penerbit lisensi bertanda tangan                                              │
└───────────────────────────────────────────────────────────────────────────────┘
```

### Masuk versi ini
1. Peran `developer` internal.
2. Portal pengajuan + panel tinjau (terima/tolak, centang fitur, gratis/berbayar).
3. API key (satu key untuk semua fitur yang dibuka).
4. Lisensi lewat webhook.
5. Paket Docker mesin self-host.
6. API v1 dengan 5 fitur awal: **nomor & QR, kirim pesan, webhook pesan masuk, tanya AI, product knowledge**.
7. Penagihan untuk aplikasi yang dijadikan berbayar (memakai payment gateway yang ada).

### Ditunda (ditambah bila dibutuhkan)
Mode di server kita (hosted), sub-akun, widget embed, SDK React, white-label, fitur API lain (katalog,
percakapan, followup, prospek, analitik, suara), dan penagihan per pemakaian.

---

## 2. Istilah

| Istilah | Arti |
|---|---|
| **Developer internal** | Tim kita, akun berperan `developer` |
| **Developer luar** | Pemakai API. Akunnya tetap `user` biasa yang memiliki **aplikasi** |
| **Aplikasi** | Satu pengajuan yang disetujui = satu lisensi |
| **API key** | `cg_live_…`. Dipakai aplikasi mereka untuk memanggil mesin + untuk aktivasi mesin |
| **Mesin** | ChatGerCep yang berjalan dengan `MODE=mesin` di server developer |
| **Lisensi** | Data bertanda tangan (fitur, status, masa berlaku) yang diterbitkan server kita |

---

## 3. Requirement fungsional

### 3.1 Peran `developer`
- **R-PERAN-1** `Peran = "admin" | "developer" | "user"`. Kolom `users.peran` menerima `developer`.
- **R-PERAN-2** Developer bisa membuka **semua panel admin** + menu Developer API. Setelah login,
  diarahkan ke `/admin`.
- **R-PERAN-3** Hanya **admin** yang bisa memberi/mencabut peran `developer`. Developer tidak bisa
  mengangkat admin, dan aturan "minimal satu admin aktif" tetap khusus admin.
- **R-PERAN-4** Cek peran admin saat ini ada di ±146 titik di 37 berkas. Semuanya ditinjau satu per satu
  dan diganti helper `staf()` / `requireStaf()`. `requireAdmin()` tetap dipakai untuk tindakan khusus admin.
  Hitungan yang mengecualikan admin (mis. jumlah akun gratis) ikut mengecualikan `developer`.

### 3.2 Pengajuan (developer luar)
- **R-AJU-1** Akun `user` mana pun bisa mengajukan dari menu **Developer** di dashboard.
- **R-AJU-2** Isian: nama aplikasi, kegunaan, situs aplikasi, nama pemilik (perusahaan/perorangan),
  nomor WA kontak, perkiraan jumlah nomor, **alamat publik HTTPS mesin** (bisa diisi belakangan sebelum
  aktivasi), fitur yang diminta, dan persetujuan syarat pemakaian (larangan spam/blast, tanggung jawab
  atas nomor & data sendiri).
- **R-AJU-3** Status: `menunggu → disetujui | ditolak`, lalu `disetujui ↔ ditangguhkan`, lalu `dicabut`
  (final). Maksimal 3 pengajuan `menunggu` per akun.
- **R-AJU-4** Setiap perubahan status mengirim notifikasi in-app + email ke pengaju (modul yang sudah ada).

### 3.3 Peninjauan (developer internal)
- **R-TINJAU-1** Antrean pengajuan (urut terlama dulu) dengan jumlah `menunggu` tampil di menu.
- **R-TINJAU-2** **Setujui:** centang fitur yang dibuka (tidak boleh melebihi sakelar fitur global),
  pilih **gratis/berbayar**, dan isi batas (maks nomor per mesin, batas anti-blokir).
- **R-TINJAU-3** **Tolak:** alasan wajib diisi dan dikirim ke pengaju.
- **R-TINJAU-4** Aplikasi aktif bisa diubah kapan saja (fitur, gratis/berbayar, batas), ditangguhkan,
  diaktifkan lagi, dicabut, atau diganti key-nya. **Setiap perubahan langsung dikirim ke mesin lewat
  webhook lisensi (§3.6).**
- **R-TINJAU-5** Semua tindakan tercatat di `admin_log` (siapa, kapan, sebelum → sesudah).

### 3.4 Gratis / berbayar
- **R-BIAYA-1** **Sakelar umum** `api_biaya_bawaan` = `gratis` (bawaan) atau `berbayar`.
- **R-BIAYA-2** **Per aplikasi:** `ikut_umum` (bawaan) | `gratis` | `berbayar`. Pengaturan per aplikasi
  mengalahkan sakelar umum.
- **R-BIAYA-3** Berbayar: developer internal mengisi **harga per bulan** untuk aplikasi itu (atau memakai
  harga bawaan dari sakelar umum). Developer luar membayar lewat payment gateway yang ada
  (Midtrans/iPaymu, alur tagihan yang sama).
- **R-BIAYA-4** Aplikasi berbayar yang belum/telat bayar: lisensi tidak diperpanjang. Setelah masa
  berlakunya habis, mesin masuk mode terbatas (§3.6). Notifikasi dikirim H-3, H-1, dan saat habis.
- **R-BIAYA-5** Berbayar dijadikan gratis → tagihan berhenti dan lisensi langsung diperpanjang lewat webhook.
- **R-BIAYA-6** Karena semua resource milik mereka, status gratis **tidak menimbulkan biaya** server
  maupun AI di pihak kita.

### 3.5 API key
- **R-KEY-1** Dibuat otomatis saat disetujui. Format `cg_live_<awalan 8>_<rahasia 32>` (base62).
- **R-KEY-2** **Tampil sekali.** Database hanya menyimpan awalan + `SHA-256(rahasia)`, dan perbandingannya
  memakai `timingSafeEqual`.
- **R-KEY-3** Ganti key: key baru langsung aktif, key lama tetap berlaku 24 jam (tanpa waktu mati). Mesin
  menerima kabarnya lewat webhook lisensi.
- **R-KEY-4** Cabut: langsung dikirim lewat webhook lisensi. Mesin menolak key itu saat itu juga.

### 3.6 Lisensi lewat webhook
- **R-LIS-1 Alamat publik wajib.** Mesin harus bisa dijangkau di `https://<domain-mereka>/api/lisensi/webhook`.
  Hanya HTTPS dengan sertifikat sah.
- **R-LIS-2 Aktivasi + bukti kepemilikan alamat.** Saat pertama menyala, mesin memanggil
  `POST chatgercep.com/api/lisensi/aktivasi { key, id_instalasi, alamat_publik, versi }`. Server kita
  mengirim **tantangan** ke alamat itu, dan mesin harus menjawabnya dengan benar. Ini mencegah seseorang
  mendaftarkan alamat milik orang lain.
- **R-LIS-3 Satu cek saat menyala** (bukan polling). Setiap kali menyala, mesin memanggil
  `POST /api/lisensi/kondisi` sekali untuk mendapat lisensi terbaru. Bila server kita tidak terjangkau,
  mesin memakai lisensi tersimpan yang masih berlaku, lalu mencoba lagi dengan jeda bertambah
  (10 dtk → maks 15 menit) **hanya sampai berhasil sekali**.
- **R-LIS-4 Dikirim saat berubah.** Fitur diubah, gratis↔berbayar, ditangguhkan, dicabut, atau key
  diganti → server kita mengirim webhook berisi lisensi baru dalam hitungan detik.
- **R-LIS-5 Masa berlaku + perpanjangan.** Lisensi berlaku **7 hari**. Server kita mengirim perpanjangan
  lewat webhook **setiap 3 hari**. Bila webhook diblokir atau mesin tak terjangkau, lisensi habis sendiri,
  sehingga memblokir webhook kita di firewall tidak bisa dipakai untuk menghindari pencabutan.
- **R-LIS-6 Isi lisensi** (ditandatangani **Ed25519**, kunci publik tertanam di image mesin):
  `{ versi_urut, aplikasi_id, id_instalasi, status, fitur[], batas{}, biaya, berlaku_sampai, kunci_aktif[] (hash) }`.
  Mesin menolak tanda tangan palsu dan **mengabaikan lisensi dengan `versi_urut` lebih kecil** dari yang
  tersimpan (kiriman lama yang datang terlambat).
- **R-LIS-7 Pengiriman andal.** Antrean kirim di DB (bukan memori). Batas waktu 5 dtk. Coba ulang:
  10 dtk, 1 mnt, 5 mnt, 30 mnt, 2 jam, lalu tiap 6 jam sampai berhasil atau lisensi yang lama habis.
  Bila webhook gagal ≥ 24 jam, developer luar mendapat email peringatan.
- **R-LIS-8 Balasan mesin** atas webhook lisensi: `200 { versi_urut_diterima, versi_mesin, jumlah_nomor }`.
  Data ini menjadi info pemantauan di panel kita (tanpa permintaan tambahan).
- **R-LIS-9 Mode terbatas.** Lisensi habis / ditangguhkan / dicabut → API membalas `402`/`403`, bot
  berhenti menjawab, **koneksi WA tetap tersambung** (tidak perlu scan ulang saat aktif kembali).
- **R-LIS-10 Satu instalasi per key** (bawaan, bisa diubah developer internal). Instalasi lama bisa dilepas
  dari portal.

### 3.7 Mesin self-host
- **R-MESIN-1** Satu basis kode dengan app sekarang, dijalankan dengan `MODE=mesin`. Bagian khusus
  chatgercep.com dimatikan: landing, langganan & pembayaran, afiliasi, Meta Pixel, followup penjualan,
  sinkron Suka Shawarma, dan panel admin pusat.
- **R-MESIN-2** Paket: `docker-compose.yml` berisi **mesin + PostgreSQL 15** (image dikunci per digest).
  Image dibuat otomatis oleh CI setiap rilis (Linux x64 & arm64), dengan tag versi semver.
- **R-MESIN-3** Pemasangan cukup: isi `.env` → `docker compose up -d`. Isian `.env`:
  ```
  CHATGERCEP_KEY=cg_live_…        ALAMAT_PUBLIK=https://wa.domain-mereka.com
  AI_PENYEDIA=anthropic|openai    AI_API_KEY=…  AI_API_URL=…  AI_MODEL=…
  RAHASIA_MESIN=<acak 32 byte>    MAKS_NOMOR=50   STT_API_KEY=… (opsional)
  ```
- **R-MESIN-4** AI tanpa Hermes: Anthropic (sudah ada) + **penyedia kompatibel OpenAI** (baru), sehingga bisa
  memakai OpenAI, Gemini, Groq, OpenRouter, atau model lokal. Riwayat chat disisipkan dari `percakapan.ts`
  (jalur "tanpa ingatan" yang sudah ada).
- **R-MESIN-5** Mesin punya dashboard ChatGerCep sendiri untuk pemiliknya (kelola nomor, knowledge, dll.)
  selain API.
- **R-MESIN-6** **Satu mesin = satu proses.** Sesi WA hidup di memori satu proses. Mesin dikunci dengan
  advisory lock PostgreSQL. Proses kedua dengan DB yang sama menolak menyala dan menjelaskan alasannya
  (mencegah saling memutus, kode 440).
- **R-MESIN-7** Update: `docker compose pull && docker compose up -d`. Migrasi DB otomatis (mekanisme
  `MIGRASI` yang ada), dan **migrasi hanya menambah** supaya bisa kembali ke versi sebelumnya. Mati rapi
  (`stop_grace_period: 30s`, `mati.ts`) sehingga update tidak memutus nomor.
- **R-MESIN-8** Cadangan DB adalah tanggung jawab developer. Panduan `pg_dump` + jadwal ada di dokumentasi.

### 3.8 API v1 (di mesin)
- **R-API-1** Base `https://<alamat-mesin>/api/v1`, `Authorization: Bearer cg_live_…`. Key **tidak boleh**
  dipakai dari browser (CORS ditutup).
- **R-API-2** Setiap endpoint punya scope. Scope yang tidak ada di lisensi → `403 fitur_tidak_dibuka`.
- **R-API-3** Endpoint awal:

  | Metode & jalur | Scope | Keterangan |
  |---|---|---|
  | `GET /status` | – | Versi, status lisensi, fitur aktif, berlaku sampai |
  | `GET/POST /nomor`, `GET/PATCH/DELETE /nomor/{id}` | nomor | Daftar, tambah, atur bot, hapus |
  | `GET /nomor/{id}/qr`, `POST /nomor/{id}/pairing` | nomor | QR (teks + PNG) / kode pairing |
  | `DELETE /nomor/{id}/sesi` | nomor | Logout WA. **Satu-satunya** cara memutus nomor lewat API |
  | `POST /pesan`, `GET /pesan/{id}` | pesan.kirim | Kirim teks/gambar lewat antrean (`202`), cek status |
  | `GET/PUT /webhook`, `POST /webhook/uji` | pesan.terima | Atur URL webhook aplikasi + event uji |
  | `POST /ai/jawab` | ai | Jawaban bot berdasarkan knowledge nomor, tanpa lewat WA |
  | `GET/POST /nomor/{id}/knowledge`, `GET/DELETE …/{dok}` | knowledge | Teks, PDF, berkas |

- **R-API-4 Idempotensi:** `POST` menerima `Idempotency-Key` (disimpan 24 jam), sehingga pesan tidak
  terkirim dua kali saat permintaan diulang.
- **R-API-5 Paginasi kursor:** `?batas=50&setelah=<id>`, maks 100, urut `id`.
- **R-API-6 Format galat seragam:** `{ "galat": { "kode", "pesan", "id_permintaan" } }`. Kode:
  `isian_tidak_sah` 400, `key_tidak_sah` 401, `lisensi_kedaluwarsa` 402, `fitur_tidak_dibuka` /
  `aplikasi_ditangguhkan` / `batas_nomor` 403, `tidak_ditemukan` 404, `nomor_belum_terhubung` 409,
  `ditolak_anti_blokir` 422, `terlalu_sering` 429, `wa_sedang_menyambung` / `ai_tidak_tersedia` 503.
- **R-API-7 Batas ukuran:** JSON ≤ 1 MB, berkas ≤ 10 MB, teks pesan ≤ 4.096 karakter.
- **R-API-8 Versi:** `/v1` stabil. Perubahan yang merusak kompatibilitas → `/v2`, dengan header
  `Deprecation` ≥ 6 bulan.
- **R-API-9 Spesifikasi OpenAPI 3.1** menjadi sumber dokumentasi di `chatgercep.com/docs/api`
  (panduan pasang, contoh cURL/JS/PHP/Python, webhook, galat).

### 3.9 Webhook ke aplikasi developer (dari mesin mereka)
- **R-WH-1** Event: `pesan.masuk`, `pesan.status`, `pesan.dibalas_ai`, `nomor.terhubung`,
  `nomor.terputus`, `lisensi.peringatan`.
- **R-WH-2** Ditandatangani `X-CG-Tanda: t=<epoch>,v1=<HMAC-SHA256>`, toleransi 5 menit. Setiap event
  membawa `id_event` untuk membuang duplikat.
- **R-WH-3** Antrean di DB mesin, coba ulang 6 kali (10 dtk → 6 jam), lalu ditandai gagal dan bisa dikirim
  ulang manual.

### 3.10 Anti-blokir (di mesin, tidak bisa dimatikan lewat API)
- **R-AB-1** Aturan `bridge.ts` tetap berlaku: hanya membalas chat pribadi, ada "mengetik", maks 10
  balasan per 10 menit per chat.
- **R-AB-2** `POST /pesan`: antrean per nomor, bawaan **20 pesan/menit** dengan jeda acak 1–3 dtk, dan
  **50 kontak baru per hari per nomor**. Nilainya diatur developer internal lewat `batas` di lisensi.
  *Angka bawaan ini usulan dan perlu disepakati.*

---

## 4. Requirement non-fungsional

### 4.1 Beban di server kita (harus tetap ringan)
- Server kita hanya melayani: halaman portal/panel, **aktivasi & cek saat mesin menyala**, dan
  **mengirim webhook lisensi** (saat berubah + perpanjangan tiap 3 hari).
- Untuk 1.000 mesin: perpanjangan ≈ **333 kiriman/hari**, ditambah kiriman saat ada perubahan dan cek
  saat mesin restart. *Ini hitungan; dibuktikan lewat uji beban di F3.*
- **Panggilan API developer tidak pernah sampai ke server kita.** Lisensi diverifikasi di mesin.
- Pengirim webhook lisensi berjalan sebagai pekerja latar di proses app (pola yang sama dengan followup &
  pengingat), mengambil antrean berkelompok (`LIMIT 50`) lewat index parsial, dengan paralel ≤ 8.

### 4.2 Performa (target, diukur dengan `EXPLAIN (ANALYZE, BUFFERS)` + waktu nyata)
| Hal | Target |
|---|---|
| Cek key + scope per panggilan di mesin | ≤ 1 ms (lisensi & hash key di memori) |
| `GET /status`, `GET /nomor`, `GET /pesan/{id}` | p95 ≤ 30 ms |
| `POST /pesan` (masuk antrean) | p95 ≤ 50 ms |
| `POST /ai/jawab` | overhead kita ≤ 50 ms di luar waktu penyedia AI |
| `POST /api/lisensi/kondisi` di server kita | p95 ≤ 20 ms, ≤ 3 query |
| Ambil antrean webhook lisensi | index scan, ≤ 5 ms untuk 100 ribu baris riwayat |

Angka sebelum/sesudah dilaporkan di setiap fase.

### 4.3 Keandalan
- Koneksi WA **tidak pernah** diputus oleh lisensi, API, update, atau restart.
- Antrean webhook (lisensi & aplikasi) dan pesan keluar disimpan di DB, sehingga tidak hilang saat restart.
- Mesin tetap melayani selama lisensi tersimpan masih berlaku (maks 7 hari tanpa server kita).

### 4.4 Keamanan
- Key di-hash dan tampil sekali. Aktivasi dibatasi laju per IP & per key (`batas.ts`).
- Lisensi Ed25519. Kunci privat **hanya** di `.env` server kita, tidak pernah di repo atau di DB.
- Webhook keluar dari server kita: hanya HTTPS, IP privat/lokal diblokir (anti-SSRF), tidak mengikuti
  redirect, batas waktu 5 dtk, balasan maks 4 KB.
- Rahasia di DB mesin (kunci AI yang diatur lewat UI, rahasia webhook) dienkripsi AES-256-GCM dengan
  `RAHASIA_MESIN`.
- Log tidak memuat key, kunci AI, atau isi pesan (perluas `log-aman.ts`).
- Semua tindakan panel developer tercatat di `admin_log`.

### 4.5 Privasi
Isi chat, kontak, dan knowledge **tidak pernah** dikirim ke server kita. Server kita hanya tahu versi
mesin dan jumlah nomor (dari balasan webhook lisensi). Dicantumkan di syarat pemakaian.

### 4.6 Persyaratan server developer (perkiraan, **diukur ulang di F3**)
Dasar terukur di produksi: app ±72 MB + Baileys ±40 MB + **±2,5–3,5 MB per nomor**. Model ML dan
PostgreSQL di server kecil belum diukur.

| Skala | CPU | RAM | Disk |
|---|---|---|---|
| ≤ 20 nomor | 1 vCPU | 1 GB | 10 GB |
| ≤ 100 nomor | 2 vCPU | 2 GB | 20 GB |
| ≤ 250 nomor | 2–4 vCPU | 4 GB | 40 GB |

Ditambah: Linux x64/arm64, Docker 24+ dengan Compose v2, **domain + HTTPS** (reverse proxy seperti Caddy),
serta koneksi keluar ke WhatsApp, chatgercep.com, dan penyedia AI.

### 4.7 Perlindungan kode
Kode yang berjalan di server orang lain tidak bisa dilindungi 100%. Lapisan yang dipakai: lisensi bertanda
tangan + masa berlaku 7 hari, satu instalasi per key, kode diminify tanpa source map, dan perjanjian
pemakaian tertulis.

---

## 5. Skema database (migrasi v32+, hanya menambah)

### 5.1 Server kita
```sql
-- v32: peran developer (nama constraint dicek dulu di DB produksi)
ALTER TABLE users DROP CONSTRAINT users_peran_check;
ALTER TABLE users ADD CONSTRAINT users_peran_check CHECK (peran IN ('admin','developer','user'));

-- v33: developer API
CREATE TABLE api_aplikasi (
  id             integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  user_id        integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nama           text NOT NULL,
  kegunaan       text NOT NULL,
  situs          text,
  pemilik        text NOT NULL,
  kontak_wa      text NOT NULL,
  perkiraan_nomor integer,
  alamat_mesin   text,                    -- https://…, diverifikasi saat aktivasi
  fitur_diminta  text[] NOT NULL,
  fitur          text[] NOT NULL DEFAULT '{}',
  batas          jsonb  NOT NULL DEFAULT '{}',   -- nomor, pesan_menit, kontak_baru_hari, instalasi
  biaya          text   NOT NULL DEFAULT 'ikut_umum' CHECK (biaya IN ('ikut_umum','gratis','berbayar')),
  harga_bulan    integer,                 -- null = harga bawaan
  dibayar_sampai bigint,                  -- untuk aplikasi berbayar
  status         text NOT NULL DEFAULT 'menunggu'
                 CHECK (status IN ('menunggu','disetujui','ditolak','ditangguhkan','dicabut')),
  alasan         text,
  versi_lisensi  integer NOT NULL DEFAULT 0,   -- naik setiap ada perubahan
  ditinjau_oleh  integer REFERENCES users(id) ON DELETE SET NULL,
  ditinjau_pada  bigint,
  created_at     bigint NOT NULL
);
CREATE INDEX api_aplikasi_antrean_idx ON api_aplikasi (created_at) WHERE status = 'menunggu';
CREATE INDEX api_aplikasi_user_idx    ON api_aplikasi (user_id);

CREATE TABLE api_kunci (
  id             integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  aplikasi_id    integer NOT NULL REFERENCES api_aplikasi(id) ON DELETE CASCADE,
  awalan         text  NOT NULL UNIQUE,
  hash           bytea NOT NULL,
  dibuat         bigint NOT NULL,
  berlaku_sampai bigint,                   -- diisi saat dirotasi (lama + 24 jam)
  dicabut_pada   bigint
);
CREATE INDEX api_kunci_aplikasi_idx ON api_kunci (aplikasi_id);

CREATE TABLE api_instalasi (
  id              uuid PRIMARY KEY,
  aplikasi_id     integer NOT NULL REFERENCES api_aplikasi(id) ON DELETE CASCADE,
  alamat          text NOT NULL,
  versi_mesin     text,
  jumlah_nomor    integer NOT NULL DEFAULT 0,
  versi_diterima  integer NOT NULL DEFAULT 0,  -- versi_lisensi terakhir yang dikonfirmasi mesin
  terakhir_sukses bigint,
  gagal_sejak     bigint,
  dibuat          bigint NOT NULL,
  dilepas_pada    bigint
);
CREATE INDEX api_instalasi_aplikasi_idx ON api_instalasi (aplikasi_id) WHERE dilepas_pada IS NULL;

-- Antrean webhook lisensi. Satu baris aktif per instalasi: perubahan baru menimpa kiriman yang belum
-- terkirim (yang dikirim selalu lisensi terbaru), jadi antrean tidak menumpuk.
CREATE TABLE api_kirim_lisensi (
  instalasi_id  uuid PRIMARY KEY REFERENCES api_instalasi(id) ON DELETE CASCADE,
  versi_lisensi integer NOT NULL,
  coba          smallint NOT NULL DEFAULT 0,
  berikut_pada  bigint NOT NULL,
  galat         text
);
CREATE INDEX api_kirim_lisensi_ambil_idx ON api_kirim_lisensi (berikut_pada);
```
- Perpanjangan tiap 3 hari dijadwalkan dengan mengisi `api_kirim_lisensi` untuk instalasi yang
  `terakhir_sukses` > 3 hari lalu. Query memakai index, dan pengambilan dibatasi per putaran.
- Pengaturan umum memakai tabel `settings` yang ada: `api_biaya_bawaan`, `api_harga_bawaan`, `api_fitur_global`.
- Pembayaran aplikasi berbayar memakai tabel `transaksi` yang ada, dengan jenis/kolom tambahan
  `api_aplikasi_id` (detailnya ditentukan saat F4).

### 5.2 Mesin (hanya aktif saat `MODE=mesin`)
```sql
CREATE TABLE mesin_lisensi   (id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1), id_instalasi uuid NOT NULL,
                              lisensi text, versi_urut integer NOT NULL DEFAULT 0, berlaku_sampai bigint, diterima bigint);
CREATE TABLE webhook_tujuan  (id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, url text NOT NULL,
                              rahasia bytea NOT NULL, event text[] NOT NULL, aktif boolean NOT NULL DEFAULT true);
CREATE TABLE webhook_antrean (id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                              tujuan_id integer NOT NULL REFERENCES webhook_tujuan(id) ON DELETE CASCADE,
                              id_event text NOT NULL, jenis text NOT NULL, isi jsonb NOT NULL,
                              coba smallint NOT NULL DEFAULT 0, berikut_pada bigint NOT NULL,
                              status text NOT NULL DEFAULT 'antre', galat text);
CREATE INDEX webhook_antrean_ambil_idx ON webhook_antrean (berikut_pada) WHERE status = 'antre';
CREATE TABLE pesan_keluar    (id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                              number_id integer NOT NULL REFERENCES numbers(id) ON DELETE CASCADE,
                              ke text NOT NULL, isi jsonb NOT NULL, status text NOT NULL DEFAULT 'antre',
                              wa_id text, alasan text, dibuat bigint NOT NULL, berubah bigint NOT NULL);
CREATE INDEX pesan_keluar_antre_idx ON pesan_keluar (number_id, id) WHERE status = 'antre';
CREATE TABLE api_idempoten   (kunci text PRIMARY KEY, hash_permintaan bytea NOT NULL, status smallint NOT NULL,
                              respons jsonb NOT NULL, kedaluwarsa bigint NOT NULL);
```
Pembersihan berkala dilakukan berkelompok: antrean webhook selesai > 7 hari, idempotensi kedaluwarsa,
`pesan_keluar` > 30 hari.

---

## 6. Halaman (UI)

| Halaman | Isi |
|---|---|
| `/developer` (developer luar) | Formulir pengajuan, status, API key (tampil sekali, ganti key), status biaya + tombol bayar bila berbayar, instalasi (versi, jumlah nomor, status webhook lisensi, lepas instalasi), unduh `docker-compose.yml` + `.env.contoh` |
| `/admin/developer-api` (developer internal) | Antrean pengajuan, detail + setujui/tolak, aplikasi aktif (ubah fitur, gratis/berbayar, harga, batas, tangguhkan, cabut, ganti key), instalasi yang webhook-nya gagal, sakelar umum (biaya bawaan, harga bawaan, fitur global) |
| `/docs/api` (publik) | Dokumentasi dari OpenAPI: pasang mesin, autentikasi, endpoint, webhook, galat |
| Dashboard mesin | Dashboard ChatGerCep yang ada, tanpa menu khusus chatgercep.com |

Sesuai aturan, semua halaman di-screenshot (desktop ±1440 px & HP ±390 px, keadaan kosong/berisi) dari
build lokal dengan DB sementara, lalu **menunggu persetujuanmu sebelum push**.

---

## 7. Pengujian (infrastruktur `uji/` yang ada: PostgreSQL sungguhan, WA & AI ditiru)

| Uji | Isi |
|---|---|
| Peran | Developer membuka semua panel admin; tindakan khusus admin tertolak; seluruh uji lama tetap lolos |
| Pengajuan | Ajukan → tolak / setujui → key tampil sekali → ganti key (lama berlaku 24 jam) → cabut |
| Gratis/berbayar | Sakelar umum vs per aplikasi; berbayar belum bayar → lisensi tidak diperpanjang → mode terbatas; dijadikan gratis → langsung aktif |
| Lisensi webhook | Tantangan alamat (alamat orang lain ditolak); kiriman saat berubah sampai ≤ beberapa detik; tanda tangan palsu ditolak; `versi_urut` lama diabaikan; mesin mati lalu menyala → cek sekali mendapat lisensi terbaru; webhook diblokir 7 hari → mode terbatas **tanpa WA terputus** (jam dipercepat via `skala-waktu.ts`) |
| Antrean lisensi | Jeda coba ulang benar; satu baris per instalasi; perpanjangan 3 hari terjadwal |
| SSRF | Alamat `http://`, IP privat, dan redirect ditolak |
| API | Semua endpoint: sukses, validasi, scope belum dibuka, idempotensi, paginasi, 429, anti-blokir 422 |
| Webhook aplikasi | Penerima tiruan: sukses, lambat, gagal beruntun, kirim ulang |
| Proses ganda | Mesin kedua dengan DB yang sama menolak menyala |
| Docker | `docker compose up` di server bersih (x64 + arm64), update versi + migrasi, mati rapi saat update |
| Beban | 1.000 instalasi tiruan: kirim perpanjangan + cek saat menyala; 50 rps `POST /pesan` ke mesin; RAM per nomor di mesin |

---

## 8. Tahapan

| Fase | Isi | Selesai bila |
|---|---|---|
| **F0 Peran** | Peran `developer` + refactor `staf()` di 37 berkas | Uji peran & semua uji lama lolos |
| **F1 Portal & panel** | Tabel v32–v33, pengajuan, tinjau, API key, sakelar gratis/berbayar (tanpa penagihan dulu) | Alur ajukan → setujui → key jalan; screenshot disetujui |
| **F2 Mesin + lisensi webhook** | `MODE=mesin`, aktivasi + tantangan, cek saat menyala, pengirim webhook lisensi + perpanjangan, Ed25519, mode terbatas, Docker image di CI, panduan pasang | Mesin terpasang di **VPS uji bersih** (bukan produksi); uji lisensi lolos; persyaratan server (§4.6) diperbarui dengan angka terukur |
| **F3 API v1** | 5 fitur awal + webhook aplikasi + antrean pesan + anti-blokir + penyedia AI kompatibel OpenAI + dokumentasi `/docs/api` | Uji API, webhook, dan beban lolos; target §4.2 terukur |
| **F4 Penagihan** | Pembayaran aplikasi berbayar lewat gateway yang ada, pengingat H-3/H-1 | Bayar → diperpanjang; telat → mode terbatas |

Setiap fase menjadi commit terpisah. Perubahan tampilan tidak di-push sebelum kamu menyetujui screenshot-nya.

---

## 9. Keputusan yang masih perlu kamu jawab

1. **Developer internal & menu keuangan:** benar-benar semua (transaksi, refund, payment gateway), atau
   tanpa menu keuangan?
2. **Angka bawaan anti-blokir:** 20 pesan/menit per nomor dan 50 kontak baru/hari per nomor. Setuju?
3. **Masa berlaku lisensi 7 hari, diperpanjang tiap 3 hari.** Setuju?
4. **Harga berbayar:** cukup harga tetap per bulan per aplikasi, atau per jumlah nomor?
5. **Registry image Docker:** GitHub Container Registry (gratis, memakai repo yang ada)?
6. **Penyedia AI di mesin:** cukup Anthropic + kompatibel OpenAI?
7. **VPS uji untuk F2:** server bersih mana yang dipakai (terpisah dari produksi 31.97.67.66)?
