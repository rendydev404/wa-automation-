# Rencana: Mode Sandbox Developer API

Tanggal: 2026-11-10 · Status: **S1–S3 selesai & di-push (screenshot disetujui); S4 (uji WA asli) menunggu 2 nomor dari pemilik** · Lanjutan dari
[2026-11-09-developer-api.md](2026-11-09-developer-api.md)

> Peta kode yang disentuh: kontrak `src/lib/api-def.ts`, `src/lib/lisensi-def.ts`; pusat `src/lib/developer-api.ts`,
> `src/app/api/lisensi/*`, `src/app/actions-developer.ts`, `/developer`, `/admin/developer-api`, `/docs/api`;
> mesin `src/lib/mesin/{lisensi,api,antrean,webhook}.ts`, `src/lib/bridge.ts`, `src/app/api/v1/**`;
> skema di `src/lib/db.ts` lewat `KOLOM_PASTI` (idempoten, tanpa nomor versi: sesi lain menambah migrasi bernomor bersamaan). Penghitung AI: `src/lib/mesin/kuota-ai.ts`.
> Banner mesin: `src/components/banner-sandbox.tsx`. Uji: `uji/uji-sandbox-pusat.mjs`, `uji/uji-sandbox-mesin.mjs`.
> Screenshot: `docs/serah-terima-skrip/screenshot-sandbox.mjs`.

---

## 1. Ringkasan

Developer luar bisa **mencoba API dengan WhatsApp asli sebelum masuk production**, tanpa menunggu pengajuan
disetujui dan tanpa domain/HTTPS.

- **Key sandbox `cg_test_…`** keluar langsung dari portal (hanya akun yang punya akses portal, `users.akses_api`).
- **Mesin yang sama** (`MODE=mesin`). Mesin membaca jenis key-nya lalu otomatis masuk mode sandbox.
- **WhatsApp asli:** scan QR beneran, pesan beneran masuk ke HP, bot AI beneran menjawab.
- **Pembatas utama: hanya 1 nomor uji.** Mesin sandbox hanya boleh mengirim ke, dan menanggapi chat dari,
  satu nomor uji yang sudah diverifikasi. Chat dari nomor lain diabaikan.
- **Limit balasan AI per hari** diatur developer internal (bawaan umum + per akun).
- **Bisa jalan di laptop.** Gak perlu `ALAMAT_PUBLIK`, karena sandbox tidak memakai webhook lisensi.
- **Naik ke production:** ajukan → disetujui → ganti `CHATGERCEP_KEY` ke `cg_live_…`. Kode aplikasi tidak berubah,
  data mesin (nomor, Informasi Usaha, katalog, webhook) ikut terbawa.

```
LAPTOP / SERVER DEVELOPER                                   SERVER KITA (chatgercep.com)
┌───────────────────────────────────────────────┐          ┌──────────────────────────────┐
│ Aplikasi mereka ──/api/v1 + cg_test_──▶ Mesin │──sekali──▶ /api/lisensi/aktivasi|kondisi │
│                                         │     │ menyala  │  (sandbox: TANPA tantangan)   │
│ ◀── webhook pesan masuk/status ─────────┤     │          │                              │
│                                         │     │──saat────▶ /api/lisensi/nomor-uji        │
│        WA asli (1 nomor sandbox) ◀──────┘     │ verifikasi│  (kode UJI dari portal)      │
│              ▲ ▼ hanya dengan                 │          └──────────────────────────────┘
│        1 NOMOR UJI (HP developer)             │
└───────────────────────────────────────────────┘
```

### Masuk versi ini
1. Key sandbox per akun (maks 1 sandbox per akun), masa berlaku, perpanjang, cabut.
2. Aktivasi sandbox tanpa alamat publik & tanpa tantangan.
3. Nomor uji tunggal + verifikasi lewat pesan WA berkode.
4. Gerbang sandbox di mesin: kirim pesan, pesan masuk, bot, webhook, cek kontak.
5. Limit balasan AI per hari (sandbox wajib; production opsional, bawaan tanpa batas).
6. Panel developer internal (tab **Sandbox**), kartu sandbox di portal, banner sandbox di dashboard mesin.
7. Dokumentasi `/docs/api` bagian Sandbox.

### Tidak masuk (sengaja, supaya tetap simpel)
Sandbox yang kita hosting, WA tiruan / nomor ajaib, lebih dari 1 nomor uji, webhook lisensi untuk sandbox.

---

## 2. Istilah

| Istilah | Arti |
|---|---|
| **Sandbox** | Satu baris `api_aplikasi` dengan `mode = 'sandbox'`, otomatis aktif, milik satu akun |
| **Key sandbox** | `cg_test_<awalan 8>_<rahasia 32>`, tampil sekali |
| **Nomor sandbox** | Nomor WA yang di-scan ke mesin sandbox (maks 1) |
| **Nomor uji** | Satu-satunya nomor yang boleh berkomunikasi dengan nomor sandbox (biasanya HP developer) |
| **Balasan AI** | Satu panggilan model AI: balasan bot di WA, `POST /ai/jawab`, `POST /ai/rapikan` |

---

## 3. Requirement fungsional

### 3.1 Key sandbox (pusat)
- **R-SB-1** Tombol **Buat key sandbox** di portal `/developer`, hanya untuk akun `akses_api`. Maks **1 sandbox per
  akun** (unique index). Langsung aktif, tanpa peninjauan.
- **R-SB-2** Format `cg_test_<awalan 8>_<rahasia 32>`. Disimpan seperti key live (awalan + SHA-256, tampil sekali).
  `uraiKunciApi` mengenali kedua awalan dan mengembalikan `mode`.
- **R-SB-3** Isi sandbox otomatis: fitur = **semua fitur yang dibagikan** (`api_fitur_global`), `batas.nomor = 1`
  (tetap), `batas.instalasi = 1`, `batas.ai_hari` = bawaan sandbox, batas anti-blokir = bawaan. Biaya selalu gratis.
- **R-SB-4** Masa berlaku **30 hari** (`sandbox_sampai`, angka diatur developer internal). Tombol **Perpanjang**
  di portal mengatur ulang ke `kini + 30 hari`.
- **R-SB-5** **Ganti key**: key lama langsung tidak berlaku di pusat (tanpa rotasi 24 jam; ini sandbox).
- **R-SB-6** Developer internal bisa: ubah limit AI per sandbox, perpanjang, tangguhkan/aktifkan, cabut, dan
  mematikan seluruh sandbox lewat sakelar umum (`api_sandbox_aktif`). Semua tercatat di `admin_log`.
- **R-SB-7** Sandbox **tidak pernah** masuk antrean pengajuan, hitungan "menunggu", penagihan, atau daftar
  aplikasi production (semua query yang ada ditambah `mode = 'produksi'`).

### 3.2 Lisensi sandbox
- **R-SBL-1** Aktivasi dengan key `cg_test_`: **tanpa** `ALAMAT_PUBLIK` dan **tanpa** tantangan. Instalasi dicatat
  dengan `alamat = NULL`.
- **R-SBL-2** Token lisensi sandbox memakai **`v: 2`** dengan isian tambahan:
  `mode: "sandbox"`, `uji: { telepon, alamat } | null`, `batas.ai_hari`. Mesin lama hanya menerima `v: 1`, jadi
  **mesin lama menolak lisensi sandbox** dan tetap di mode terbatas (bot tidak jalan tanpa gerbang). Pusat juga
  menolak aktivasi sandbox dari `versi` mesin di bawah versi minimum (`versi_mesin_lama`, 426).
- **R-SBL-3** `berlaku_sampai` = `sandbox_sampai`. **Tanpa webhook dan tanpa perpanjangan otomatis** (tidak ada
  alamat publik, dan aturan tanpa polling tetap berlaku). Mesin mendapat lisensi baru hanya saat:
  menyala, verifikasi nomor uji, atau pemilik menekan **Perbarui lisensi** di dashboard mesin.
- **R-SBL-4** Akibat R-SBL-3: pencabutan/penangguhan sandbox berlaku saat mesin menyala ulang atau saat masa
  berlakunya habis (maks 30 hari). Dampaknya kecil karena sandbox hanya bisa bicara dengan 1 nomor uji.
- **R-SBL-5** Lisensi production tetap `v: 1` dan alurnya tidak berubah.
- **R-SBL-6** Ganti key di `.env` (test → live atau sebaliknya): mesin melihat awalan key tidak ada di
  `lisensi.kunci`, lalu membuat `id_instalasi` baru, mengosongkan lisensi lama, dan aktivasi ulang. **Data mesin
  dan koneksi WA tidak disentuh.** Pindah ke sandbox dengan lebih dari 1 nomor tersimpan → mode terbatas dengan
  pesan "Sandbox hanya boleh 1 nomor; hapus nomor lain dulu".

### 3.3 Nomor uji (tepat satu)
- **R-UJI-1** Portal: **Daftarkan nomor uji** → pusat membuat kode 6 angka (berlaku 10 menit, disimpan sebagai
  hash). Portal menampilkan: "Dari HP yang mau dijadikan nomor uji, kirim WA `UJI 482913` ke nomor sandbox".
- **R-UJI-2** Mesin sandbox mengenali pesan pribadi `^UJI\s+\d{6}$` dari nomor **mana pun** (satu-satunya
  pengecualian gerbang), lalu memanggil `POST /api/lisensi/nomor-uji { key, id_instalasi, kode, telepon, alamat, versi }`.
- **R-UJI-3** Pusat memeriksa: key sandbox sah, instalasi milik sandbox itu, kode cocok & belum habis. Bila
  benar: simpan `uji_telepon` + `uji_alamat`, hapus kode, naikkan `versi_lisensi`, lalu **kembalikan lisensi
  baru** di jawaban (bukan webhook). Dibatasi 5 percobaan per 10 menit per key (`batas.ts`).
- **R-UJI-4** Mesin membalas ke nomor itu: "Nomor ini sekarang jadi nomor uji sandbox ✅". Kode salah/habis →
  balasan "Kode salah atau sudah habis, buat kode baru di portal" (maks 1 balasan per 10 menit per nomor).
- **R-UJI-5** **Ganti nomor uji** = buat kode baru dan verifikasi dari HP lain. Begitu terverifikasi, nomor lama
  langsung digantikan. Tidak pernah ada dua nomor uji.
- **R-UJI-6** Identitas nomor uji: telepon (`628…`) bila diketahui, plus alamat WA (JID/LID) dari event. Gerbang
  mencocokkan salah satunya, karena WhatsApp kadang hanya memberi LID tanpa nomor telepon.

### 3.4 Gerbang sandbox di mesin
Semua cek membaca lisensi di memori (tanpa query tambahan).

| Hal | Perilaku di sandbox |
|---|---|
| `POST /nomor` | Maks 1 nomor (`batas_nomor` 403 seperti sekarang) |
| `POST /pesan` | `ke` harus nomor uji. Selain itu → `403 bukan_nomor_uji`. Belum ada nomor uji → `409 nomor_uji_belum_ada` |
| Pesan masuk dari nomor uji | Normal: tercatat, webhook `pesan.masuk`, bot AI menjawab |
| Pesan masuk dari nomor lain | **Diabaikan seluruhnya**: tidak dicatat, tidak ke webhook, bot diam (kecuali pesan `UJI ######`) |
| Pesan yang diketik manual dari HP sandbox ke nomor lain | Tidak dicatat, tidak ke webhook |
| `POST /kontak/cek` | Hanya boleh nomor uji (mencegah sandbox dipakai menyaring daftar nomor) |
| `POST /ai/jawab`, `/ai/rapikan` | Jalan, dihitung ke limit AI |
| Fitur lain (knowledge, katalog, bot, statistik, profil, dll.) | Sama dengan production |
| Anti-blokir & batas laju | Sama dengan production |
| Jawaban API | Header `X-ChatGerCep-Mode: sandbox`; `GET /status` berisi `mode`, `nomor_uji` (tersamar), `ai_hari` (terpakai/batas) |
| Webhook ke aplikasi | Amplop event ditambah `"mode": "sandbox"` |

### 3.5 Limit balasan AI
- **R-AI-1** `batas.ai_hari` = maks balasan AI per hari (WIB, reset 00.00). `0` = tanpa batas.
- **R-AI-2** **Sandbox:** bawaan dari pengaturan umum `api_sandbox_ai_hari` (usulan **100**), bisa diubah per
  sandbox oleh developer internal (rentang 1–10.000).
- **R-AI-3** **Production:** isian baru "Balasan AI per hari" di form setujui/ubah aplikasi. Bawaan **0 (tanpa batas)**.
- **R-AI-4** Yang dihitung: balasan bot di WA, `POST /ai/jawab`, `POST /ai/rapikan`. Transkripsi suara tidak
  dihitung (bukan model AI teks).
- **R-AI-5** Jatah diambil **sebelum** memanggil AI (atomik, tidak bisa dilewati permintaan serentak) dan
  dikembalikan bila AI gagal.
- **R-AI-6** Limit tercapai: bot diam (pesan tetap tercatat), API membalas `429 batas_ai_harian` + jam reset.
  Di sandbox, mesin mengirim **sekali per hari** pesan WA ke nomor uji: "Batas 100 balasan AI sandbox hari ini
  sudah habis, reset jam 00.00 WIB".
- **R-AI-7** Penghitung di DB mesin. Karena kunci AI milik developer sendiri, limit ini menjaga sandbox tetap
  untuk testing dan mencegah biaya AI bocor saat ada loop (mis. bot saling membalas).

### 3.6 Naik ke production
- **R-NAIK-1** Kartu sandbox punya tombol **Ajukan production**. Formulir pengajuan yang ada terisi otomatis
  (nama, kegunaan, kontak) dan masuk alur peninjauan biasa.
- **R-NAIK-2** Disetujui → key `cg_live_`. Developer mengganti `CHATGERCEP_KEY` dan mengisi `ALAMAT_PUBLIK`.
  Mesin aktivasi ulang (R-SBL-6), gerbang nomor uji hilang, data dan koneksi WA tetap.
- **R-NAIK-3** Sandbox tetap ada setelah production aktif (untuk mencoba fitur baru).

---

## 4. Requirement non-fungsional

### 4.1 Performa (diukur sebelum & sesudah, angka nyata dilaporkan)
| Hal | Target |
|---|---|
| Cek mode + gerbang nomor uji per panggilan/pesan | 0 query tambahan, ≤ 0,1 ms (memori) |
| Ambil jatah AI | 1 query `UPDATE … WHERE jumlah < batas RETURNING`, p95 ≤ 2 ms |
| Production tanpa limit AI (`ai_hari = 0`) | 0 query tambahan |
| Buat key sandbox (pusat) | ≤ 3 query, p95 ≤ 30 ms |
| `POST /api/lisensi/nomor-uji` (pusat) | ≤ 4 query, p95 ≤ 30 ms (di luar tanda tangan Ed25519 ±0,1 ms) |
| Tab Sandbox di panel | index scan, `LIMIT 50` + kursor, ≤ 5 ms untuk 10 ribu sandbox |

### 4.2 Beban server kita
Tidak ada pekerja latar baru. Sandbox **dikecualikan** dari antrean webhook lisensi dan perpanjangan 3 harian
(`putaranJam`, `jadwalkanAplikasi`). Panggilan ke pusat hanya: aktivasi/kondisi saat mesin menyala, verifikasi
nomor uji, dan tombol Perbarui lisensi.

### 4.3 Keamanan & anti-penyalahgunaan
- Sandbox hanya untuk akun `akses_api` (sudah dipilih developer internal), 1 per akun, 1 instalasi, 1 nomor WA,
  1 nomor uji. Gak bisa dipakai blast atau bot pelanggan.
- Nomor uji ada di **lisensi bertanda tangan**, jadi tidak bisa ditambah lewat database mesin.
- Lisensi sandbox `v: 2` mencegah mesin versi lama berjalan tanpa gerbang.
- Kode verifikasi disimpan sebagai hash, 10 menit, dibatasi percobaannya.
- Nomor uji tampil tersamar di panel & portal (`62812****890`). Log tidak memuat isi pesan atau key.

### 4.4 Keandalan
Koneksi WA tidak pernah diputus oleh sandbox: lisensi habis, ganti key, atau sandbox dicabut = mode terbatas
(API & bot berhenti), WA tetap tersambung.

---

## 5. Skema database (`KOLOM_PASTI` di db.ts, idempoten, hanya menambah)

```sql
-- Pusat
ALTER TABLE api_aplikasi ADD COLUMN mode text NOT NULL DEFAULT 'produksi'
  CHECK (mode IN ('produksi', 'sandbox'));
ALTER TABLE api_aplikasi ADD COLUMN sandbox_sampai   bigint;
ALTER TABLE api_aplikasi ADD COLUMN uji_telepon      text;
ALTER TABLE api_aplikasi ADD COLUMN uji_alamat       text;
ALTER TABLE api_aplikasi ADD COLUMN uji_diverifikasi bigint;
ALTER TABLE api_aplikasi ADD COLUMN uji_kode_hash    text;
ALTER TABLE api_aplikasi ADD COLUMN uji_kode_sampai  bigint;
CREATE UNIQUE INDEX api_aplikasi_sandbox_user_uniq ON api_aplikasi (user_id) WHERE mode = 'sandbox';
CREATE INDEX        api_aplikasi_sandbox_idx       ON api_aplikasi (id DESC)  WHERE mode = 'sandbox';
ALTER TABLE api_instalasi ALTER COLUMN alamat DROP NOT NULL;   -- sandbox tanpa alamat publik

-- Mesin
CREATE TABLE mesin_pemakaian_ai (
  hari   bigint PRIMARY KEY,          -- awal hari WIB (detik epoch)
  jumlah integer NOT NULL DEFAULT 0
);
```
- Default konstan → `ADD COLUMN` tanpa menulis ulang tabel.
- Pengaturan umum di tabel `settings`: `api_sandbox_aktif` (bawaan `true`), `api_sandbox_hari` (30),
  `api_sandbox_ai_hari` (100).
- Query lama di `developer-api.ts` (`daftarAplikasi`, `hitungAplikasi`, `jumlahMenunggu`, `putaranJam`, dll.)
  ditambah `mode = 'produksi'`. Dicek dengan `EXPLAIN (ANALYZE, BUFFERS)` bahwa index lama tetap terpakai.
- Pembersihan: baris `mesin_pemakaian_ai` > 90 hari dihapus bersama pembersihan berkala yang ada.

Kontrak (`api-def.ts`): `BatasApi.ai_hari`, `IsiLisensi.v: 1 | 2`, `mode?`, `uji?`, kode galat baru
`bukan_nomor_uji` 403, `nomor_uji_belum_ada` 409, `batas_ai_harian` 429, `sandbox_kedaluwarsa` 402,
`versi_mesin_lama` 426, jalur `JALUR_NOMOR_UJI = "/api/lisensi/nomor-uji"`.

---

## 6. Halaman (UI)

| Halaman | Perubahan |
|---|---|
| `/developer` (portal) | **Kartu Sandbox** di atas daftar aplikasi: buat/ganti key (tampil sekali), berlaku sampai + Perpanjang, nomor uji (belum ada / menunggu kode `UJI ######` + hitung mundur / terverifikasi + Ganti), unduh `.env` sandbox, langkah singkat 1-2-3, tombol **Ajukan production** |
| `/admin/developer-api` | Tab baru **Sandbox**: pengaturan umum (sakelar sandbox, masa key, limit AI bawaan) + daftar sandbox (akun, nomor uji tersamar, berlaku sampai, terakhir menyala, limit AI) dengan aksi ubah limit, perpanjang, tangguhkan, cabut |
| `/admin/developer-api/[id]` | Isian baru **Balasan AI per hari** (0 = tanpa batas) di form batas aplikasi production |
| Dashboard mesin | Banner "Mode sandbox: hanya dengan nomor uji 62812****890" + sisa balasan AI hari ini + tombol **Perbarui lisensi** |
| `/docs/api` | Bagian **Sandbox**: cara mulai, aturan nomor uji, galat khusus, limit AI, cara naik ke production. `openapi.json` menyebut kedua jenis key |

Sesuai aturan: screenshot Chrome headless (desktop ±1440 px & HP ±390 px; kosong/berisi; kode menunggu;
terverifikasi; limit habis) dari build lokal dengan DB sementara, lalu **menunggu persetujuan sebelum push**.

---

## 7. Pengujian

### 7.1 Otomatis (infrastruktur `uji/`, PostgreSQL sungguhan, WA & AI ditiru)
| Uji | Isi |
|---|---|
| Key sandbox | Akun tanpa `akses_api` ditolak; maks 1 per akun; key tampil sekali; ganti key = lama mati; sakelar umum mati = tidak bisa buat |
| Aktivasi | `cg_test_` tanpa alamat berhasil; mesin versi lama ditolak (`versi_mesin_lama`); token `v: 2` ditolak verifikasi `v: 1` lama |
| Nomor uji | Kode benar → lisensi baru berisi `uji`; kode salah/habis/dipakai ulang ditolak; percobaan ke-6 dalam 10 menit → 429; ganti nomor uji menggantikan yang lama |
| Gerbang | `POST /pesan` ke nomor lain 403; pesan masuk dari nomor lain tidak dicatat & tanpa webhook; pesan dari nomor uji (telepon maupun LID) lolos; `kontak/cek` dibatasi |
| Limit AI | Jatah ke-101 → bot diam + `429`; 50 permintaan serentak tidak melewati batas; AI gagal → jatah kembali; reset 00.00 WIB (jam dipercepat `skala-waktu.ts`); production `ai_hari = 0` tanpa query tambahan |
| Ganti key | test → live dan live → test: instalasi baru, data & sesi WA utuh; >1 nomor di sandbox → mode terbatas |
| Regresi | Seluruh uji Developer API & mesin lama tetap lolos; sandbox tidak muncul di antrean/penagihan |

### 7.2 Manual dengan WA asli (di laptop / VPS uji, bukan produksi)
Butuh **2 nomor WA asli**: satu di-scan jadi nomor sandbox, satu jadi nomor uji.
1. Buat key sandbox → `docker compose up` tanpa `ALAMAT_PUBLIK` → scan QR.
2. Kirim `UJI ######` dari HP uji → muncul balasan ✅ dan portal menampilkan nomor terverifikasi.
3. `POST /pesan` ke HP uji → pesan masuk; status terkirim/dibaca muncul di webhook.
4. Chat dari HP uji → webhook `pesan.masuk` + bot menjawab.
5. Chat dari nomor ketiga → tidak ada webhook, bot diam.
6. Turunkan limit AI ke 2 → balasan ke-3 tidak keluar, pesan pemberitahuan limit masuk sekali.
7. Ganti ke key live di VPS uji → aktivasi production, WA tidak terputus.

---

## 8. Tahapan

| Fase | Isi | Selesai bila |
|---|---|---|
| **S1 Kontrak & pusat** | v35, key `cg_test_`, buat/perpanjang/ganti/cabut sandbox, aktivasi tanpa tantangan, lisensi `v: 2`, endpoint nomor-uji, pengecualian dari antrean & query production | Uji key, aktivasi, nomor uji lolos |
| **S2 Mesin** | Mode sandbox, gerbang (§3.4), verifikasi `UJI`, limit AI (sandbox + production), ganti key aman, header & amplop webhook | Uji gerbang, limit AI, ganti key lolos; target §4.1 terukur |
| **S3 UI & dokumentasi** | Kartu portal, tab Sandbox, isian limit AI production, banner mesin, `/docs/api` + `api-dok.ts` | Screenshot dikirim dan **disetujui** |
| **S4 Uji WA asli** | Skenario §7.2 di laptop/VPS uji | Semua langkah lolos, hasil dilaporkan |

Tiap fase satu commit. Tidak di-push sebelum screenshot disetujui.

---

## 9. Keputusan

Pemilik menjawab "gas eksekusi semuanya" (2026-11-10), jadi usulan 1–4 di bawah dipakai apa adanya. Nomor 5 masih menunggu.
Catatan implementasi:
- Belum ada image mesin yang dirilis (tag `mesin-v*` belum ada), jadi tidak ada mesin lama di lapangan. Perlindungan
  mesin lama cukup lewat format lisensi `v: 2`; cek versi mesin di pusat (`versi_mesin_lama`) tidak dipasang.
- Sandbox yang diaktivasi dari mesin lain melepas instalasi sandbox sebelumnya secara otomatis (bukan `instalasi_penuh`),
  supaya pindah laptop → server uji tidak perlu klik apa pun.
- Nomor uji yang hanya punya LID (tanpa nomor telepon) bisa chat dengan bot, tetapi `POST /pesan` ke nomor itu ditolak
  (`ke` berupa nomor telepon). Perlu dicek di uji WA asli (S4).

### Usulan yang dipakai

1. **Limit AI** gw artikan **jumlah balasan AI per hari**. Bawaan sandbox **100/hari**: setuju? (Kalau maksudmu
   panjang maksimal per balasan, bilang, nanti ditambahkan.)
2. **Limit AI di production** juga bisa diatur per aplikasi, bawaan **tanpa batas**: setuju?
3. **Masa key sandbox 30 hari**, bisa diperpanjang berkali-kali dari portal: setuju?
4. **Pencabutan sandbox** baru berlaku saat mesin menyala ulang atau masa berlakunya habis (karena sandbox tanpa
   webhook & tanpa polling): oke?
5. **2 nomor WA asli** untuk uji manual S4: pakai nomor siapa?
