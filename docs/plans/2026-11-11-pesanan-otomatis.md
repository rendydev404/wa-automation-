# Pesanan otomatis dari chat (fitur pembeda Developer API)

> Status: **rencana, belum dikerjakan** (2026-11-11). Dipilih pengguna sebagai fitur pembeda pertama.
> Antre setelahnya: pengaturan fitur global + per pengguna, dan pemecahan `bot` menjadi `spam` / `belajar` / `ml`.

## 1. Tujuan

Obrolan WhatsApp pelanggan berubah menjadi **data pesanan terstruktur** yang langsung dikirim ke aplikasi developer
(kasir, toko online, ERP) lewat webhook `pesanan.dibuat`. Developer tidak perlu membaca chat atau membuat parser sendiri.

Kenapa ini membedakan kita: kebanyakan API WhatsApp hanya mengirim/menerima pesan. Kita mengirim **pesanan yang siap
diproses**: produk dan harga dicocokkan ke katalog, total dihitung mesin, pelanggan sudah mengonfirmasi.

## 2. Prinsip

1. **Tanpa panggilan AI tambahan.** AI utama yang sudah menjawab pelanggan menyisipkan tag tersembunyi
   `<pesanan>{json}</pesanan>` (pola sama dengan `<abaikan>` dan label prospek). Mesin membuang tag sebelum pesan
   terkirim. Biaya token naik sedikit (instruksi + tag), tanpa giliran AI kedua.
2. **Harga tidak pernah dari AI.** AI hanya menyebut produk & jumlah. Mesin mencocokkan ke tabel `produk` nomor itu,
   memakai harga katalog, dan menghitung subtotal/total sendiri. Produk yang tidak ada di katalog = baris "tidak
   dikenal" (harga null), pesanan tetap tercatat dengan tanda perlu dicek.
3. **Wajib konfirmasi pelanggan.** Status `draf` selama bot masih mengumpulkan isian. Bot mengirim ringkasan
   (item, total, alamat/ambil) dan meminta "ya". Baru setelah pelanggan mengonfirmasi, status menjadi `dikonfirmasi`
   dan event `pesanan.dibuat` dikirim. Tidak ada pesanan palsu dari obrolan iseng.
4. **Data tetap di mesin developer.** Tabel `pesanan` ada di database mesin; pusat tidak pernah melihatnya.
5. **Satu draf terbuka per chat.** Pesanan berikutnya di chat yang sama memperbarui draf itu sampai dikonfirmasi/batal.

## 3. Alur

```
Pelanggan: "kak mau shawarma jumbo 2, ayam 1, diantar ya"
  AI menjawab + <pesanan>{"item":[{"produk":"Shawarma Jumbo","jumlah":2},{"produk":"Shawarma Ayam","jumlah":1}],"metode":"antar"}</pesanan>
  Mesin: cocokkan katalog -> draf #41 (total dihitung), isian kurang: nama, alamat
  AI (giliran berikut, diberi tahu isian yang kurang): "Boleh nama & alamat lengkapnya kak?"
Pelanggan: "Budi, Jl. Melati 5"
  AI: ringkasan + "Sudah benar kak?" + <pesanan>{...,"nama":"Budi","alamat":"Jl. Melati 5"}</pesanan>
Pelanggan: "ya"
  AI + <pesanan>{"konfirmasi":true}</pesanan>
  Mesin: draf #41 -> dikonfirmasi, webhook pesanan.dibuat
Aplikasi developer: PATCH /pesanan/41 {status:"diproses"} -> (opsional) pesan WA ke pelanggan "Pesanan diproses"
```

Serah-terima manusia tetap berlaku: bila pemilik membalas dari HP, bot mundur dan draf tidak diubah AI.

## 4. Data (mesin, migrasi baru)

Tabel `pesanan`:
- `id`, `number_id` (FK numbers, CASCADE), `kunci_chat` (chat pelanggan), `telepon`, `nama`
- `item` jsonb: `[{produk_id|null, nama, jumlah, harga_satuan|null, catatan}]`
- `subtotal`, `ongkir` (null), `total` (null bila ada item tanpa harga), `mata_uang` = IDR
- `metode` (`ambil` | `antar` | null), `alamat`, `waktu` (teks bebas, mis. "jam 7 malam"), `catatan`
- `status`: `draf` → `dikonfirmasi` → `diproses` → `selesai`; atau `batal`
- `perlu_dicek` boolean (produk tak dikenal / harga kosong), `dibuat`, `diperbarui`, `dikonfirmasi_pada`

Indeks: `(number_id, id DESC)` untuk daftar; unik parsial `(number_id, kunci_chat) WHERE status = 'draf'`
(satu draf per chat); `(number_id, status, id DESC)` untuk saringan.

Pengaturan per nomor (`numbers`): `pesanan_aktif` (bawaan mati), `pesanan_isian` (isian wajib: nama, alamat bila
antar, waktu ambil; bisa dipilih pemilik), `pesanan_pesan_status` (kirim WA otomatis saat status berubah, opsional).

## 5. Fitur, API, event

- Kode fitur katalog baru: **`pesanan`** (grup Data usaha). Berlaku di semua jalur seperti fitur lain (API 403,
  dashboard mesin, bot tidak menyisipkan instruksi pesanan bila dimatikan).
- Endpoint (mesin, scope `pesanan`):
  - `GET /nomor/{id}/pesanan?status=&setelah=&batas=`: daftar berkursor
  - `GET /nomor/{id}/pesanan/{pid}`: detail
  - `PATCH /nomor/{id}/pesanan/{pid}`: `{status, ongkir?, catatan?}` (transisi divalidasi; total dihitung ulang)
  - `GET/PATCH /nomor/{id}/pesanan-setelan`: aktif/isian wajib/pesan status
- Event webhook: `pesanan.dibuat` (saat dikonfirmasi), `pesanan.diperbarui` (status/ongkir berubah),
  `pesanan.dibatalkan`. Draf tidak dikirim sebagai event (kecuali diminta kelak).
- Docs: entri `ENDPOINT_DOK` + `EVENT_DOK` (otomatis tampil di /docs/api dan OpenAPI), contoh SDK
  `cg.pesanan.daftar/ubah`, contoh starter: halaman "Pesanan".

## 6. Prompt AI

Blok instruksi baru (hanya bila fitur `pesanan` dibuka + `pesanan_aktif`):
- daftar produk katalog (nama saja, sudah ada di konteks katalog),
- isian wajib yang belum terisi untuk draf chat ini,
- aturan: sisipkan `<pesanan>` hanya bila pelanggan jelas memesan / melengkapi / mengonfirmasi / membatalkan;
  jangan pernah menyebut harga di tag; ringkasan ke pelanggan memakai total dari mesin (disisipkan di konteks giliran).

Filter keluaran: tag dibuang sebelum dikirim (seperti `<abaikan>`), JSON tidak sah = diabaikan + dicatat log, tidak
pernah sampai ke pelanggan.

## 7. Uji (otomatis, target < 20 dtk per berkas)

- tag diurai & dibuang; JSON rusak tidak bocor ke pelanggan
- harga & total dari katalog, bukan dari AI (AI menyebut harga palsu = diabaikan)
- produk tak dikenal = `perlu_dicek`, total null
- satu draf per chat; konfirmasi = event `pesanan.dibuat` sekali (idempoten saat tag terulang)
- serah-terima manusia: draf tidak diubah AI selama chat dijeda
- fitur `pesanan` dimatikan = API 403, instruksi tidak disisipkan, tag yang terlanjur muncul dibuang
- transisi status tidak sah ditolak (mis. `selesai` -> `draf`)
- query daftar memakai indeks (EXPLAIN) pada 20 rb pesanan

## 8. Tahapan & perkiraan

| Tahap | Isi | Perkiraan |
|---|---|---|
| P1 | Tabel + pengurai tag + pencocokan katalog + alur draf/konfirmasi di bot | ±25 mnt |
| P2 | Fitur `pesanan`, endpoint v1, event webhook, docs/OpenAPI, SDK | ±20 mnt |
| P3 | Uji otomatis | ±15 mnt |
| P4 | Halaman Pesanan di dashboard mesin + setelan per nomor (UI: screenshot & persetujuan dulu) | ±25 mnt |

Rilis: P1–P3 tanpa perubahan tampilan boleh langsung di-push + tag mesin baru; P4 menunggu persetujuan screenshot.

## 9. Keputusan yang perlu dikonfirmasi pengguna

1. Bawaan `pesanan_aktif` per nomor: **mati** (pemilik menyalakan) atau nyala bila katalog terisi?
2. Isian wajib bawaan: nama + (alamat bila antar) + waktu ambil? Atau hanya item + nama?
3. Ongkir: diisi aplikasi developer lewat PATCH (usul), atau tarif tetap per nomor?
4. Pesan WA otomatis ke pelanggan saat status berubah (diproses/selesai): bawaan mati?
5. Fitur ini juga untuk pengguna chatgercep.com (dashboard pusat), atau Developer API dulu?
