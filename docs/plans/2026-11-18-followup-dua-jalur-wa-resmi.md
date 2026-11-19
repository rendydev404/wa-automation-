# Rencana: follow-up dua jalur (WhatsApp resmi + Baileys), diatur admin, terbuka di Developer API

Tanggal: 2026-11-18. Status: **Fase 1–3 dikerjakan**, belum di-push (menunggu persetujuan screenshot). Fase 4 menunggu
ChatGerCep menjadi Tech Provider Meta.

Kode: `src/lib/wa-resmi-def.ts` (murni), `src/lib/wa-resmi.ts` (Graph API, webhook, kredensial, template, kuota),
`src/lib/rahasia.ts` (enkripsi kredensial), `src/lib/followup-jalur.ts` (teks vs template), sambungan di `wa.ts`
(`pasangJalurLuar`), `bridge.ts` (`kirimSapaan` + template), `followup*.ts`, route `/api/wa/meta/[kunci]`, migrasi v39,
UI `src/components/panel-jalur.tsx` + `/admin/followup/jalur`, aksi `src/app/actions-jalur.ts`, Developer API
`/api/v1/nomor/{id}/jalur|templat-wa|followup/*`. Uji: `uji/uji-wa-resmi.mjs` (Graph tiruan), `uji/uji-mesin.mjs`.
Screenshot: `docs/serah-terima-skrip/screenshot-wa-resmi.mjs`.

Penyederhanaan dibanding rencana: galat 131049 diperlakukan seperti "tidak sampai" (tahap berikutnya tidak dikirim),
belum ditunda-lalu-dicoba-ulang 24 jam; override kebijakan per akun belum dibuat (kebijakan global saja); variabel
template bawaan hanya {{nama}} dan {{usaha}} (harga/produk tetap dijawab AI setelah pelanggan membalas, di dalam jendela).

Permintaan: follow-up punya dua pilihan jalur kirim, yaitu **API WhatsApp resmi (Cloud API Meta)** dan **jalur tidak
resmi yang sekarang (Baileys)**. Pilihannya diatur admin di UI. Follow-up juga dibuka sebagai fitur Developer API,
supaya developer luar bisa memakainya dengan API WhatsApp miliknya sendiri.

Dasar kode:
- `src/lib/followup.ts`: follow-up akun dan putaran bersama.
- `src/lib/followup-prospek.ts`: follow-up prospek di nomor CS.
- `src/lib/followup-usaha.ts`: prospek dan order ulang di nomor pengguna.
- `src/lib/followup-aman.ts`: aturan aman bersama.
- `src/lib/bridge.ts`: `kirimSapaan`, antrean balasan AI.
- `src/lib/wa.ts`: gerbang Baileys, `EventWa`, `padaAck`, `padaBahaya`, `kirimTeks`/`kirimGambar`/`kirimDokumen`.
- `src/lib/api-def.ts`: katalog `FITUR_API`.
- `src/lib/mesin/*`: mesin self-host.

Rencana asal yang dilanjutkan:
- `2026-11-13-minat-lead-dan-followup-prospek.md`
- `2026-11-14-followup-nomor-pengguna.md`
- `2026-11-09-developer-api.md`
- `2026-11-10-core-api-headless.md`

---

## 0. Ringkasan keputusan

1. **Satu nomor, satu jalur.** Setiap nomor punya `jalur = 'baileys' | 'resmi'`. Jalur itu berlaku untuk seluruh
   nomor: pesan masuk, balasan AI, kiriman API, dan follow-up. Alasannya ada di §1.6: nomor yang terdaftar di Cloud
   API tidak bisa dipakai di WhatsApp biasa. Coexistence memutus semua perangkat tertaut, termasuk Baileys.
2. **Logika follow-up tidak diduplikasi.** Bagian berikut tetap dipakai apa adanya:
   - pemilihan lead (hangat/panas, chat duluan, diam);
   - penulisan AI dan `<lewati>`;
   - `pemeriksa.ts`;
   - stop permanen;
   - jam kirim dan batas harian.

   Yang berbeda hanya **lapisan kirim** dan **sumber rem**.
3. **Jalur resmi mengikuti aturan 24 jam Meta.**
   - Di dalam jendela 24 jam: teks AI bebas, seperti sekarang.
   - Di luar jendela: **template marketing yang disetujui Meta**. AI hanya mengisi variabelnya.
4. **Kredensial milik sendiri.** Pengguna, developer, dan admin (untuk nomor CS) memasukkan kredensial Meta miliknya
   sendiri. Biaya template ditagih Meta ke pemilik WABA, bukan ke ChatGerCep.
   - Embedded Signup (daftar sekali klik) dan Coexistence **menunggu ChatGerCep menjadi Tech Provider** (Fase 4).
5. **Developer API mendapat dua fitur katalog baru:**
   - `wa.resmi`: pasang jalur resmi di mesin developer;
   - `followup`: setelan, antrean, dan draf follow-up.

   Semuanya berjalan di mesin developer. Webhook Meta langsung ke mesin itu, tanpa lewat server pusat.

---

## 1. Fakta Meta yang dipakai rancangan ini

Dicek di dokumentasi resmi pada 2026-11-18.

| # | Fakta | Sumber |
|---|---|---|
| 1.1 | Jendela layanan 24 jam dibuka (dan dihitung ulang) setiap kali pelanggan chat atau menelepon. Di dalam jendela boleh kirim teks, media, dan interaktif secara bebas. *"When the window closes, you can only send pre-approved template messages."* Penerima harus sudah opt-in. | [Send messages](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages) |
| 1.2 | Harga dihitung per pesan **yang sampai** (sejak 1 Juli 2025). Yang ditagih: template marketing, utility, dan authentication. Ada jatah gratis 1.000 pesan layanan per nomor per bulan. Pelanggan dari iklan Click-to-WhatsApp membuka jendela gratis (FEP). Sejak 1 Oktober 2026 halaman developer menyebut utility di dalam jendela dan pesan layanan di atas jatah gratis **ditagih lagi**, sedangkan halaman bisnis masih menulis gratis (perlu dicek di dashboard Meta). | [Pricing](https://developers.facebook.com/docs/whatsapp/pricing) |
| 1.3 | Template punya tiga kategori (marketing, utility, authentication) dan ditinjau otomatis maksimal 24 jam. Isi yang hanya `{{1}}` atau sapaan umum dianggap marketing. Utility berisi promosi otomatis dijadikan MARKETING. Template bisa *Paused/Disabled* karena keluhan atau jarang dibaca. Body maksimal 1.024 karakter. Variabel bernama (`{{nama_produk}}`) atau berurutan (`{{1}}`), wajib diberi contoh. Maksimal 250 template per akun (6.000 bila terverifikasi) dan 100 template baru per jam. | [Template fundamentals](https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates), [Categorization](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization) |
| 1.4 | Batas pengiriman: penerima unik **di luar jendela** per 24 jam bergulir. Akun baru 250, lalu 2.000, 10.000, 100.000, dan tanpa batas. **Dihitung per business portfolio**: semua nomor dalam portfolio itu berbagi kuota. Verifikasi bisnis menaikkan batas ke 2.000. | [Messaging limits](https://developers.facebook.com/docs/whatsapp/messaging-limits) |
| 1.5 | Meta bisa menahan template marketing ke pelanggan yang jarang membaca. Status `failed` dengan error **131049**, dan Meta meminta tunggu minimal 24 jam. Pesan marketing di dalam jendela tidak dihitung. | [Per-user limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/per-user-limits) |
| 1.6 | *"Numbers already in use with WhatsApp cannot be registered unless they are deleted first."* **Coexistence** (app WA Business dan API di nomor yang sama): wajib Tech Provider atau Solution Partner. Semua perangkat tertaut diputus saat pendaftaran. Grup tidak disinkronkan. Daftar siaran dimatikan. Kecepatan dipatok 20 mps. Peringatan bila HP utama tidak aktif sekitar 14 hari. **Dukungan untuk Indonesia tidak tertulis.** | [Phone numbers](https://developers.facebook.com/docs/whatsapp/cloud-api/phone-numbers), [Coexistence](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users) |
| 1.7 | Syarat Tech Provider: verifikasi bisnis, app review (video kirim pesan dan buat template), Advanced Access `whatsapp_business_messaging` dan `whatsapp_business_management`. Klien harus memasang kartu kredit di akun Meta-nya. | [Tech Provider](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers) |
| 1.8 | Webhook ditandatangani `X-Hub-Signature-256: sha256=<HMAC-SHA256(body, app secret)>`. Jabat tangan GET memakai `hub.mode`, `hub.verify_token`, dan `hub.challenge`. Field yang dipakai: `messages` (pesan masuk dan status sent/delivered/read/failed), `message_template_status_update`, `phone_number_quality_update`. Meta mengirim ulang sampai 7 hari, jadi kiriman bisa dobel. | [Webhooks](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint) |
| 1.9 | Kecepatan bawaan 80 mps (error `130429` bila lewat). Nomor harus berstatus `connected` dan didaftarkan lewat endpoint `register`. Akun bisnis baru maksimal 2 nomor (20 setelah verifikasi). | [Throughput](https://developers.facebook.com/docs/whatsapp/throughput), [Phone numbers](https://developers.facebook.com/docs/whatsapp/cloud-api/phone-numbers) |

**Belum terjawab** (dicek ulang saat implementasi, tidak ditebak):
- tarif per pesan Indonesia (tabel di whatsappbusiness.com interaktif);
- dukungan Coexistence di Indonesia;
- aturan penempatan variabel template (variabel di awal/akhir, variabel berdampingan, template yang isinya
  kebanyakan variabel);
- indikator mengetik di Cloud API;
- nomor uji gratis di App Dashboard Meta.

---

## 2. Lapisan jalur (`src/lib/wa-resmi.ts` + `src/lib/jalur.ts`)

Targetnya: `bridge.ts`, follow-up, dan route API **tidak perlu tahu** jalur yang dipakai.

- `jalur.ts` adalah satu pintu untuk `kirimTeks`, `kirimGambar`, `kirimDokumen`, `tandaiDibaca`, `mengetik`, dan
  `infoSesi`. Fungsi ini memilih `wa.ts` (Baileys) atau `wa-resmi.ts` berdasarkan `numbers.jalur`. Pemanggil yang
  sekarang mengimpor dari `wa.ts` dipindah ke `jalur.ts` (perubahan mekanis).
- **Pesan masuk dari webhook** diubah menjadi `EventWa` yang sama (`jenis: "pesan"`). `bridge.ts` tetap memakai
  `padaEvent` yang ada.
  - `chat` dan `alamat` = digit `wa_id` + `@s.whatsapp.net`.
  - `foto` dan `suara` = pengunduh media lewat `GET /{media-id}` (unduh malas, seperti sekarang).
  - `kutipan` dari `context.id`.
  - `namaPengirim` dari `contacts[].profile.name`.
- **Status pesan dipetakan ke ack Baileys** lalu diteruskan ke `padaAck`, supaya `terimaAckProspek`/`terimaAckUsaha`
  tetap jalan:

  | Status Meta | Ack Baileys |
  |---|---|
  | `sent` | 2 |
  | `delivered` | 3 |
  | `read` | 4 |
  | `failed` | 0 |

  Error `failed` juga diteruskan ke rem jalur resmi (§4.3).
- **Belum ada di jalur resmi** (tombol disembunyikan, API mengembalikan galat `TIDAK_DIDUKUNG_JALUR`):
  - QR dan pairing;
  - cek nomor terdaftar (`kontak.cek`);
  - daftar grup dan kirim ke grup;
  - foto profil sendiri (Fase 1).

  Simulasi mengetik dipakai hanya bila Cloud API memang menyediakannya (dicek dulu). Kalau tidak tersedia, langsung
  kirim.
- **Jendela 24 jam:**
  - kolom baru `chat_state.masuk_akhir` (detik epoch pesan masuk terakhir), diisi di jalur pesan masuk yang sudah
    menulis `chat_state`, tanpa query tambahan;
  - `dalamJendela(numberId, kunci)` = `masuk_akhir > now - 24 jam + 5 menit` (5 menit sebagai margin aman).
- **Webhook pusat:** `src/app/api/wa/meta/[kunci]/route.ts`.
  - `kunci` = token acak per nomor, dipakai untuk memilih app secret **sebelum** isi kiriman diurai.
  - GET: jabat tangan (`hub.verify_token` dibandingkan dengan `timingSafeEqual`).
  - POST: verifikasi HMAC dari body mentah, buang duplikat berdasarkan `wamid` (LRU memori 5.000 + `ON CONFLICT` di
    `pesan_chat`), masukkan ke antrean proses, lalu **langsung 200**. Target < 50 ms, karena Meta mengirim ulang
    bila lambat.
  - Di mesin route-nya sama, di domain mesin developer.
- **Kirim ke Graph API:**
  - `fetch` ke `https://graph.facebook.com/{versi}/{phone_number_id}/messages` dengan agen keep-alive. Versi Graph
    disimpan di satu konstanta.
  - Galat Meta diterjemahkan ke `WaError` dengan pesan bahasa Indonesia.
  - `130429` / `131057` dicoba ulang dengan jeda.
- **Kredensial:** tabel `nomor_resmi`.
  - Token akses dan app secret dienkripsi AES-256-GCM. `enkripsi`/`dekripsi` dari `mesin/webhook.ts` dipindah ke
    `src/lib/rahasia.ts`, kuncinya `RAHASIA_MESIN` di mesin dan `RAHASIA_KREDENSIAL` di pusat (env baru di VPS).
  - Token tidak pernah ditulis ke log atau dikirim balik ke UI (hanya 4 karakter terakhir).
  - Kredensial didekripsi sekali lalu disimpan di memori; dibuang saat diubah.
- **Pemasangan:** saat kredensial disimpan, sistem otomatis:
  1. `GET /{phone_number_id}` untuk memeriksa token dan mengambil `display_phone_number`, `quality_rating`, dan
     `messaging_limit_tier`;
  2. `POST /register` bila belum terdaftar (PIN 6 digit dari pengguna);
  3. `POST /{waba_id}/subscribed_apps`;
  4. menampilkan **URL webhook + verify token** yang ditempel pengguna di App Dashboard Meta, beserta panduan
     langkah demi langkah.

  Status nomor `connected` (dari Meta) ditampilkan sebagai "Terhubung (resmi)".
- **Pindah jalur:**
  - Baileys ke resmi: sesi Baileys di-logout rapi. Riwayat percakapan tetap ada.
    - Kunci chat Baileys bisa berupa LID. Chat lama dipetakan ke `wa_id` lewat kolom `telepon` yang sudah ada.
      Chat tanpa `telepon` dimulai sebagai chat baru (tercatat di log, tidak diam-diam).
    - UI memperingatkan bahwa nomor harus **dihapus dulu dari app WhatsApp** (§1.6).
  - Resmi ke Baileys: kredensial dinonaktifkan (tidak dihapus selama 30 hari), lalu scan QR seperti biasa.
  - Aturan "koneksi WA tidak boleh putus" tetap berlaku. Pindah jalur hanya terjadi atas tindakan pemilik, tidak
    pernah otomatis.

## 3. Pengaturan admin dan pengguna (UI)

**Admin → Follow-up**, tab baru **"Jalur WhatsApp"**:
- **Nomor CS ChatGerCep** (follow-up akun dan prospek): pilih jalur. Bila resmi, isi kredensial dan tampilkan
  status:
  - kualitas, batas harian (tier), dan pemakaian 24 jam;
  - template beserta status persetujuannya;
  - URL webhook.
- **Kebijakan nomor pengguna** (setelan global `jalur_wa`): *Baileys saja* / *Resmi saja* / *Pengguna memilih*
  (bawaan: *Baileys saja*, supaya perilaku sekarang tidak berubah).
  - Bisa ditimpa per akun di Admin → Pengguna → detail, mengikuti pola fitur per pengguna yang sudah ada.
- **Tarif template** (diisi admin, Rp per pesan marketing/utility) hanya untuk menampilkan perkiraan biaya ke
  pengguna. Bukan tagihan, karena Meta menagih langsung ke pemilik WABA.

**Pengguna → halaman nomor:**
- Tab Koneksi: pilihan jalur (bila diizinkan), form kredensial, panduan, dan status resmi.
- Tab Follow-up:
  - label jalur;
  - di jalur resmi, bagian **Template** (lihat/buat/ajukan, status Meta);
  - kuota penerima di luar jendela;
  - perkiraan biaya bulan ini (jumlah template terkirim × tarif admin);
  - alasan rem dari Meta.
- Teks pengingat di UI: template resmi ditagih Meta ke akun pengguna. Pengguna wajib menambahkan cara bayar di Meta.

Paket: jalur resmi hanya untuk akun berbayar (sama dengan follow-up usaha). Akun gratis tetap Baileys.

Semua perubahan tampilan mengikuti aturan screenshot sebelum push (desktop ±1440 px dan HP ±390 px, setiap keadaan).

## 4. Follow-up di jalur resmi

### 4.1 Memilih bentuk pesan per kiriman

```
dalamJendela(chat)  → teks AI bebas (alur sekarang: susun → pemeriksa → kirim). Tanpa jeda acak/mengetik.
di luar jendela     → template marketing yang APPROVED untuk tahap itu; AI hanya mengisi variabel.
                      Tidak ada template APPROVED untuk tahap itu → tahap dilewati dengan alasan tercatat
                      ("Template tahap 2 belum disetujui Meta"), tidak pernah mengirim teks bebas di luar jendela.
```

Catatan: follow-up prospek tahap 1 biasanya masih di dalam jendela, karena lead diam beberapa jam setelah chat
terakhirnya. Tahap 2 dan 3, order ulang, dan follow-up akun hampir selalu di luar jendela.

### 4.2 Template bawaan (bahasa Indonesia, kategori MARKETING)

| Kode | Untuk | Variabel |
|---|---|---|
| `cg_prospek_lanjutan` | Prospek tahap 1 (bila di luar jendela) | `{{nama}}`, `{{produk}}` |
| `cg_prospek_manfaat` | Prospek tahap 2 | `{{nama}}`, `{{produk}}`, `{{harga}}` |
| `cg_prospek_pamit` | Prospek tahap 3 | `{{nama}}` |
| `cg_order_ulang` | Order ulang | `{{nama}}`, `{{produk}}` |
| `cg_akun_kuota` | Follow-up akun (nomor CS) | `{{nama}}`, `{{paket}}`, `{{harga}}` |

- Teks tetapnya ditulis lengkap dan jujur, tanpa kelangkaan palsu (aturan memori "minat lead": jujur, tanpa batas
  waktu palsu). Variabel tidak diletakkan di awal/akhir kalimat sampai aturannya dipastikan (§1 belum terjawab).
- Diajukan dari UI lewat `POST /{waba_id}/message_templates`. Statusnya dipantau dari webhook
  `message_template_status_update`, tanpa polling.
- Pengguna boleh menyunting teks tetapnya. Hasil suntingan diajukan ulang ke Meta.
- Isi variabel diambil dari data:
  - `{{harga}}`: dari katalog atau tabel paket, persis (aturan commit 26e98ac: AI tidak menghitung angka);
  - `{{produk}}`: dari `<minat>`/riwayat;
  - `{{nama}}`: dari nama profil, atau "Kak" bila tidak ada.

  `pemeriksa.ts` memeriksa hasil gabungan template + variabel sebelum dikirim.
- Kuota AI: template yang variabelnya diisi tanpa AI **tidak** memakai kuota balasan AI. Teks AI bebas di dalam
  jendela tetap dihitung 1 balasan (aturan sekarang).

### 4.3 Rem jalur resmi (pengganti rem Baileys)

| Sinyal | Tindakan |
|---|---|
| `failed` 131049 (batas marketing per pelanggan) | Chat itu ditunda 24 jam, lalu dicoba sekali lagi. Gagal lagi = selesai. Tidak dihitung sebagai tanda bahaya nomor. |
| Kuota penerima di luar jendela (tier § 1.4) | Dihitung sendiri: penerima unik template 24 jam terakhir **per WABA** (bukan per nomor). Berhenti di 90% tier, supaya pesan layanan atau pesan lain pemilik tetap punya ruang. |
| `phone_number_quality_update` turun ke kualitas rendah, atau nomor bukan `connected` | Rem nomor menyala dan pemilik diberi notifikasi (sama dengan `remBahayaUsaha`). Dilepas manual. |
| Template `PAUSED` / `DISABLED` | Tahap yang memakai template itu berhenti dan pemilik diberi notifikasi. Tahap lain jalan terus. |
| `failed` lain beruntun (≥3 dan ≥40% dari 10 kiriman terakhir) | Rem nomor, memakai ambang yang sama dengan rem centang satu. |
| `130429` / `131057` | Coba ulang dengan jeda, bukan rem. |

**Tetap berlaku:** jam kirim, batas harian setelan pengguna, stop permanen, `<lewati>`, hormati pemilik (bot dijeda
atau dibalas manual dari dashboard dalam 24 jam), dan berhenti saat pelanggan membalas.

**Tidak dipakai di jalur resmi:** pemanasan nomor baru, rasio kiriman terhadap balasan biasa, jeda acak 3–10 menit,
dan simulasi mengetik. Fungsinya diganti tier dan kualitas dari Meta.

### 4.4 Yang berubah di kode follow-up

- `kirimSapaan` mendapat cabang jalur:

  ```
  resmi & di luar jendela → kirimTemplate(numberId, alamat, kodeTemplate, variabel)
  ```

- `susun*` mengembalikan `{ bentuk: "teks", teks }` atau `{ bentuk: "templat", kode, variabel, pratinjau }`.
  Pratinjau admin/pengguna menampilkan hasil akhirnya.
- `alasanTahan` (followup-aman.ts) mendapat sumber baru: `kesehatanResmi(numberId)`, berisi kualitas, tier, sisa
  kuota, dan template yang dijeda.

## 5. Developer API

### 5.1 Katalog (`api-def.ts`)

Kode yang sudah terbit tidak diubah, hanya ditambah.

| Kode | Grup | Label | Dampak bila dimatikan |
|---|---|---|---|
| `wa.resmi` | wa | WhatsApp resmi (Cloud API) | API pasang/lepas jalur resmi + pilihan jalur di dashboard mesin. Nomor yang sudah resmi tetap jalan. |
| `followup` | ai | Follow-up otomatis | API follow-up + tab Follow-up di dashboard mesin. Putaran follow-up berhenti (antrean tertahan, tidak dibuang). |

Keduanya dicentang developer internal seperti fitur lain (pengaturan umum, lalu per aplikasi). Lisensi mesin membawa
kode fitur yang sudah ada.

### 5.2 Endpoint v1 (semua di mesin, semua tercatat di `api-dok.ts`)

| Metode & jalur | Fitur | Isi |
|---|---|---|
| `GET /v1/nomor/{id}/jalur` | `wa.resmi` | Jalur, status Meta (kualitas, tier, kuota terpakai), URL webhook. |
| `PUT /v1/nomor/{id}/jalur` | `wa.resmi` | `{jalur:"resmi", phone_number_id, waba_id, token, app_secret, pin?}` → menjalankan pemasangan (§2) dan mengembalikan `{webhook_url, verify_token}`. `{jalur:"baileys"}` = kembali ke QR. |
| `GET /v1/nomor/{id}/templat-wa` · `POST` · `DELETE /{nama}` | `wa.resmi` | Template Meta milik WABA nomor itu (lihat, ajukan, hapus). |
| `GET /v1/nomor/{id}/followup` · `PATCH` | `followup` | Setelan prospek dan order ulang (saklar, jam kirim, batas harian, jeda tahap, template per tahap). |
| `GET /v1/nomor/{id}/followup/antrean?jenis=&status=&setelah=&batas=` | `followup` | Antrean dan riwayat. Paginasi kursor (`ORDER BY` unik), batas maks 100. |
| `PUT /v1/nomor/{id}/followup/antrean/{kunci}/draf` · `POST …/tulis-ulang` · `POST …/hentikan` | `followup` | Sama dengan tombol di tab Follow-up. |
| `POST /v1/nomor/{id}/followup/lepas-rem` | `followup` | Melepas rem nomor. |

Event webhook ke aplikasi developer (lewat `mesin/webhook.ts` yang sudah ada):
- `followup.terkirim`
- `followup.dibalas`
- `followup.berhenti` (beserta alasannya)
- `followup.rem`
- `nomor.kualitas`
- `templat.status`

### 5.3 "Pakai API miliknya sendiri"

- Developer membuat aplikasi Meta sendiri, memakai WABA dan nomornya sendiri, lalu mengarahkan webhook Meta ke
  `https://<mesin-dia>/api/wa/meta/{kunci}`. Developer tidak butuh status Tech Provider (§1.7), karena ini
  integrasi langsung untuk nomornya sendiri.
- Biaya Meta ditagih ke developer. Server pusat ChatGerCep tidak ikut menerima pesan.
- Developer yang tetap memakai Baileys juga mendapat fitur `followup`. Jalurnya mengikuti nomor.

## 6. Data (migrasi v39)

```sql
ALTER TABLE numbers ADD COLUMN jalur text NOT NULL DEFAULT 'baileys' CHECK (jalur IN ('baileys','resmi'));
CREATE TABLE nomor_resmi (
  number_id        integer PRIMARY KEY REFERENCES numbers(id) ON DELETE CASCADE,
  phone_number_id  text NOT NULL UNIQUE,
  waba_id          text NOT NULL,
  token_enkrip     text NOT NULL,
  rahasia_enkrip   text NOT NULL,          -- app secret
  kunci_webhook    text NOT NULL UNIQUE,   -- token acak di URL webhook
  verify_token     text NOT NULL,
  kualitas         text, tier text, status text,
  aktif            boolean NOT NULL DEFAULT true,
  diperbarui       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX nomor_resmi_waba_idx ON nomor_resmi (waba_id);
CREATE TABLE templat_wa (
  number_id integer NOT NULL REFERENCES numbers(id) ON DELETE CASCADE,
  nama text NOT NULL, bahasa text NOT NULL DEFAULT 'id', kategori text NOT NULL,
  kode_tahap text,                          -- cg_prospek_lanjutan, …; null = template bebas pengguna
  isi text NOT NULL, status text NOT NULL,  -- PENDING/APPROVED/REJECTED/PAUSED/DISABLED
  alasan text, meta_id text, diperbarui timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (number_id, nama, bahasa)
);
ALTER TABLE chat_state ADD COLUMN masuk_akhir bigint;     -- jendela 24 jam
-- Kuota tier: penerima template unik 24 jam per WABA.
CREATE TABLE kiriman_templat (
  waba_id text NOT NULL, penerima text NOT NULL, pada bigint NOT NULL,
  PRIMARY KEY (waba_id, penerima)            -- upsert pada = terbaru; hitung WHERE pada > now-86400
);
-- followup_prospek / followup_ulang / followup (akun): kolom `bentuk` ('teks'|'templat') + `templat` (nama) + `galat_meta` (kode).
```

Nomor versi dicek ulang sebelum mulai (pola `KOLOM_PASTI` bila ada sesi lain yang memakai v39).

## 7. Hemat resource

- Webhook: verifikasi HMAC dan buang duplikat di memori, lalu 200. Proses AI berjalan di antrean `bridge.ts` yang
  sudah ada. Tidak ada I/O tambahan sebelum menjawab Meta, selain kredensial dari memori.
- Tidak ada polling ke Meta. Status pesan, kualitas, dan template datang lewat webhook. Hanya ada cek cadangan
  `GET /{phone_number_id}` tiap 6 jam per nomor resmi (kualitas dan tier), sekali jalan untuk semua nomor.
- Kuota tier: satu `SELECT count(*)` dengan indeks `(waba_id, pada)` per putaran, hanya saat nomor itu memang akan
  mengirim template. Hasilnya disimpan di memori 60 detik.
- `fetch` ke Graph API memakai agen keep-alive (satu koneksi TLS dipakai ulang).
- Angka nyata diukur sebelum dan sesudah: lama webhook (ms), query per pesan masuk, dan `EXPLAIN (ANALYZE,
  BUFFERS)` untuk query kuota dan antrean.

## 8. Keamanan

- Token dan app secret dienkripsi saat disimpan, disamarkan di UI dan log. Kunci enkripsi diambil dari env dan tidak
  pernah disimpan di database.
- Webhook ditolak bila: `kunci` tidak dikenal (404), HMAC salah (401), atau body > 1 MB. Batas laju per IP memakai
  pola yang sudah ada.
- Tujuan `fetch` tetap `graph.facebook.com` (tidak bisa diisi pengguna, jadi tidak ada SSRF).
- Kredensial divalidasi ke Meta sebelum disimpan. Token yang dicabut menghasilkan status "Perlu token baru", rem
  nomor, dan notifikasi.

## 9. Uji

- **Unit (`uji/`):**
  - pemetaan status ke ack;
  - `dalamJendela` (tepi 24 jam);
  - pemilihan teks vs template;
  - isi variabel dari data;
  - rem 131049 / tier / template dijeda;
  - verifikasi HMAC dan jabat tangan;
  - buang duplikat `wamid`.
- **Integrasi:** server Graph tiruan lokal (kirim, register, template, webhook) dan database sementara (bukan
  produksi). Alur lengkap: pesan masuk webhook → balasan AI → lead diam → follow-up teks (dalam jendela) → template
  (lewat jendela) → pelanggan membalas → follow-up berhenti.
- **Developer API:** setiap endpoint baru diuji dengan kunci sandbox. `api-dok` dicek oleh uji "tiap fitur punya
  endpoint" yang sudah ada.
- **Nyata (terakhir):** nomor uji Meta (bila App Dashboard menyediakannya) atau nomor resmi milik pemilik produk.

## 10. Urutan kerja

| Fase | Isi | Bergantung pada |
|---|---|---|
| **1** | `rahasia.ts`, `jalur.ts`, `wa-resmi.ts` (kirim/terima/status/media/jendela), webhook route, migrasi v39, kredensial dan pemasangan, UI Koneksi pengguna, kebijakan jalur admin, uji unit dan integrasi. | – |
| **2** | Follow-up jalur resmi: bentuk pesan, template bawaan dan UI Template, rem resmi, pratinjau, perkiraan biaya, tab Jalur WhatsApp di admin (nomor CS). | Fase 1 |
| **3** | Developer API: fitur `wa.resmi` dan `followup`, endpoint v1, event webhook, `api-dok`, rilis mesin. | Fase 1–2 |
| **4** | Embedded Signup (daftar sekali klik) dan Coexistence untuk pengguna biasa. | ChatGerCep menjadi Tech Provider (§1.7) |

Setiap fase di-commit terpisah. Fase yang mengubah tampilan menunggu persetujuan screenshot sebelum push.

## 11. Yang dibutuhkan dari pemilik produk

1. **Nomor CS ChatGerCep di jalur resmi**: butuh business portfolio dan WABA milik ChatGerCep. Sebaiknya
   **terverifikasi**, karena tanpa verifikasi hanya 250 penerima per 24 jam (§1.4). Bila nomor CS tetap di Baileys,
   Fase 2 untuk nomor CS bisa ditunda tanpa mengganggu yang lain.
2. **Keputusan Tech Provider** (Fase 4): mendaftar atau tidak, karena prosesnya ada di Meta (verifikasi bisnis dan
   app review).
3. **Tarif Indonesia** dari tabel Meta, untuk diisi di pengaturan admin (perkiraan biaya saja).
4. **Nomor untuk uji nyata** di Cloud API (nomor yang tidak sedang dipakai di app WhatsApp).
