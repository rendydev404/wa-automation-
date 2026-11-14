# Rencana: follow-up otomatis di nomor pengguna yang berlangganan

Tanggal: 2026-11-14. Status: **dikerjakan** (src/lib/followup-usaha.ts, tab Follow-up di halaman nomor, migrasi v38,
uji/uji-followup-usaha.mjs). Belum di-push: menunggu persetujuan screenshot.

Permintaan: follow-up yang sekarang hanya jalan di nomor CS ChatGerCep (GercepBot) harus bisa dipakai juga oleh
pengguna yang berlangganan untuk pelanggan mereka sendiri, **dengan logika anti-blokir yang sama** dengan GercepBot.

Dasar: `src/lib/followup-prospek.ts` (follow-up prospek) dan `src/lib/followup.ts` (putaran, jam kirim, batas harian,
jeda acak, rem centang satu). Rencana asal: `docs/plans/2026-11-13-minat-lead-dan-followup-prospek.md`.

---

## 1. Yang dipindahkan apa adanya (logika anti-blokir GercepBot)

Semua aturan ini sudah teruji di GercepBot dan dipakai ulang tanpa dilonggarkan:

| Aturan | Isi |
|---|---|
| Hanya chat lama | Hanya orang yang **chat duluan** (pesan pertama chat dari pelanggan). Tidak pernah membuka chat baru, tidak pernah broadcast. |
| Hanya lead serius | Minat hangat/panas (tag `<minat>` AI utama), sudah dijawab (pesan terakhir dari kita), lalu diam. Dingin tidak disentuh. |
| Jendela dekat | Hanya chat yang aktif dalam 3 hari terakhir. Chat lama tidak dibangunkan. |
| Paling banyak 3 pesan | Lanjutan → nilai → pamit. Berhenti begitu pelanggan membalas. Siklus baru hanya bila ia chat lagi duluan. |
| Ritme manusia | `kirimSapaan`: online, "mengetik" sewajarnya, kirim. Jeda acak 3–10 menit antarpesan, satu pesan per putaran. |
| Jam kirim & batas harian | Jam kirim WIB dan batas pesan follow-up per hari. |
| Rem centang satu | 10 kiriman terakhir: ≥3 dan ≥40% tidak sampai ke HP → semua follow-up nomor itu berhenti sampai dilepas. Tahap berikut tidak dikirim bila pesan sebelumnya centang satu. |
| Stop permanen | "stop / jangan chat lagi / gak tertarik" → `followup_stop`, tidak pernah dihubungi lagi. |
| Jujur | Kelangkaan/batas waktu palsu, testimoni & angka karangan, harga yang tidak ada di sumber ditolak `pemeriksa.ts` + `periksaFollowup` (2 kali gagal = templat). |

## 2. Yang berbeda untuk nomor pengguna (lebih ketat, karena nomor pengguna belum tentu "matang")

1. **Anggaran & rem per nomor.** Tiap nomor punya batas harian, jeda, dan rem sendiri. Rem satu nomor tidak
   menghentikan nomor lain. Rem menyala → notifikasi ke pemilik nomor (bukan admin) + tombol "Lanjutkan" di tab
   Follow-up.
2. **Bawaan lebih kecil + pemanasan.** Bawaan 10 pesan/hari (maks 40). Nomor yang baru tersambung < 7 hari dibatasi
   3 pesan/hari, naik otomatis setelah 7 hari tanpa rem.
3. **Rasio kiriman.** Pesan follow-up per hari tidak boleh melebihi 20% balasan biasa nomor itu hari itu
   (minimal 3). Nomor yang sepi tidak tiba-tiba mengirim banyak pesan yang dimulai sendiri.
4. **Hormati pemilik.** Chat dilewati bila bot sedang dijeda untuk chat itu (`chat_state.jeda_sampai`), atau pemilik
   membalas sendiri dari HP (`pesan_chat.peran = 2`) dalam 24 jam terakhir, atau nomor sedang dimatikan botnya.
5. **Isi dari Informasi Usaha, bukan ChatGerCep.** Prompt ditulis ulang untuk usaha pengguna: lanjutkan dari yang
   ditanyakan pelanggan (produk, harga, ongkir, jadwal), fakta HANYA dari Informasi Usaha & katalog nomor itu.
   Tidak ada bukti sosial (kita tidak punya data nyata usaha pengguna), tidak ada tautan sama sekali di tahap 1–2,
   jaminan/promo hanya bila tertulis di Informasi Usaha. Templat cadangan netral ("Kak, soal yang tadi ditanyakan…").
6. **Tidak menyentuh pelanggan yang sudah beli.** Masalah nyata: pelanggan bilang "sudah transfer ya", bot menjawab
   "terima kasih", lalu chat diam. Chat itu tampak seperti lead panas yang diam dan bisa ikut di-follow-up. Solusi:
   tag `<minat>` dapat nilai baru `beli` (pelanggan menyatakan sudah bayar/pesan/terima), dari jawaban AI yang sama
   tanpa panggilan tambahan. Chat `beli` tidak di-follow-up sampai ia bertanya produk lagi. Berlaku juga untuk
   GercepBot (perbaikan kecil yang sama).
7. **Minat dinilai bila follow-up aktif.** Sekarang tag `<minat>` hanya diminta bila penyaring prospek aktif atau di
   nomor CS (`bridge.ts` baris ±572). Ditambah: nomor dengan follow-up aktif. Tanpa panggilan AI tambahan (tag ada di
   jawaban yang sama).

## 2b. Pengingat order ulang (padanan "follow-up akun" untuk usaha pengguna)

Pesan ke **pembeli lama** jauh lebih berisiko daripada follow-up prospek, karena chat-nya sudah lama sepi. Jadi
aturannya lebih ketat:

| Aturan | Isi |
|---|---|
| Siapa | Hanya chat yang tercatat **sudah beli** (tag `<minat>beli</minat>`, bagian 2 no. 6) dan pelanggannya yang chat duluan. Chat lama sebelum fitur ini ada tidak ikut (tidak ada bukti pembelian), jadi antrean terisi bertahap. |
| Kapan | Setelah pelanggan diam ≥ **siklus order ulang** yang diisi pengguna (bawaan 30 hari, pilihan 7–90; contoh laundry 7, kuliner 14, skincare 30). |
| Batas umur chat | Chat yang terakhir aktif > 90 hari tidak disentuh (orang sudah lupa, mudah dilaporkan spam). |
| Jumlah | **1 pesan per pembelian**, tanpa pengingat kedua. Paling sering 1× per 30 hari per chat. Pengingat berikutnya hanya setelah ia beli lagi. |
| Prioritas | Berbagi batas harian & rem dengan follow-up prospek nomor itu. Order ulang paling banyak 50% batas harian, lead baru didahulukan. |
| Syarat kirim | Tidak ada pesan masuk sejak diantrekan, pemilik tidak sedang menangani chat itu. (Status centang balasan biasa tidak disimpan, jadi pengaman "tidak sampai ke HP" dipegang rem per nomor.) |
| Isi | Sebut produk/layanan yang dulu dibeli (dari riwayat chat), satu pertanyaan ringan ("mau dijadwalkan lagi minggu ini?"). Tanpa tautan. Promo hanya bila tertulis di Informasi Usaha. Kelangkaan palsu ditolak. |
| Stop | Sama: "stop / jangan chat lagi" = tidak pernah dihubungi lagi (prospek maupun order ulang). |

Contoh (laundry, siklus 7 hari):
> Kak Rina, minggu lalu cuci bedcover king + kiloan 5 kg di kami. Mau dijemput lagi minggu ini? Jadwal jemput
> pagi atau sore bisa kak 😊

Saklar terpisah dari follow-up prospek (bawaan **mati**), di tab Follow-up yang sama.

## 3. Tampilan untuk pengguna

Tab baru **Follow-up** di halaman nomor (`nomor/[id]`), sejajar Informasi Usaha / Katalog / Pengaturan:

- Saklar aktif (bawaan **mati**), jam kirim, batas harian, jeda tiap tahap (pilihan sederhana: "Cepat / Normal /
  Santai", angka detail di "Lanjutan").
- Kotak status: terhubung/tidak, terkirim hari ini x/y, rem (dengan alasan + tombol Lanjutkan), masa pemanasan.
- Daftar antrean & riwayat: nama/nomor pelanggan, minat, tahap, jadwal, draf pesan berikutnya (bisa diedit, tulis
  ulang AI, hentikan untuk chat ini), status centang, dibalas atau tidak.
- Angka: terkirim, dibalas %, minta berhenti.
- Penjelasan singkat aturan anti-blokir di tab itu (kenapa tidak bisa broadcast / tidak bisa lebih dari 3 pesan).

Admin: kolom "Follow-up aktif" di daftar pengguna + bisa mematikan per nomor bila ada laporan spam.

## 4. Data (migrasi v38)

```sql
-- Setelan per nomor (kolom tanpa default berat: hanya katalog)
CREATE TABLE followup_nomor (
  number_id     integer PRIMARY KEY REFERENCES numbers(id) ON DELETE CASCADE,
  aktif         boolean NOT NULL DEFAULT false,
  setelan       jsonb NOT NULL DEFAULT '{}',      -- jam, batas harian, jeda tahap (diurai + dibatasi seperti uraiSetelan)
  rem_pada      bigint, rem_alasan text, rem_lepas bigint,
  diperbarui    bigint NOT NULL
);
CREATE INDEX followup_nomor_aktif_idx ON followup_nomor (number_id) WHERE aktif;

-- followup_prospek sudah punya number_id. Indeks jalan dipecah per nomor supaya putaran per nomor tidak memindai
-- antrean nomor lain:
CREATE INDEX followup_prospek_nomor_jalan_idx ON followup_prospek (number_id, jadwal) WHERE status = 'jalan';
DROP INDEX followup_prospek_jalan_idx;  -- setelah semua query memakai number_id
CREATE INDEX followup_prospek_nomor_terkirim_idx ON followup_prospek (number_id, diperbarui DESC);

-- Pembelian terakhir (tag <minat>beli</minat>) + antrean pengingat order ulang
ALTER TABLE percakapan ADD COLUMN beli_pada bigint;
CREATE INDEX percakapan_beli_idx ON percakapan (number_id, beli_pada) WHERE beli_pada IS NOT NULL;
CREATE TABLE followup_ulang (
  kunci      text PRIMARY KEY,               -- percakapan.kunci
  number_id  integer NOT NULL REFERENCES numbers(id) ON DELETE CASCADE,
  status     text NOT NULL CHECK (status IN ('jalan', 'terkirim', 'dibalas', 'selesai', 'batal', 'stop', 'gagal')),
  beli_pada  bigint NOT NULL,                -- pembelian yang diingatkan (1 pesan per pembelian)
  jadwal     bigint NOT NULL, draf text, pesan text, pesan_id text, terkirim bigint, ack smallint NOT NULL DEFAULT 0,
  dibalas    bigint, alasan text, dibuat bigint NOT NULL, diperbarui bigint NOT NULL
);
CREATE INDEX followup_ulang_jalan_idx ON followup_ulang (number_id, jadwal) WHERE status = 'jalan';
CREATE INDEX followup_ulang_nomor_idx ON followup_ulang (number_id, diperbarui DESC);
```

GercepBot tetap memakai setelan admin yang sekarang (`settings.followup*`), tidak dipindah ke tabel baru.

## 5. Mesin (hemat resource)

- `followup-prospek.ts` dipecah: inti per nomor (`pindai`, `prosesSatu`, `periksaBaris`, rem, anggaran) menerima
  `{ nomor, setelan, profil }`, dengan dua profil: **cs** (perilaku GercepBot sekarang, tidak berubah) dan **usaha**
  (prompt & aturan bagian 2).
- Putaran tetap satu timer per proses (tiap menit). Daftar nomor aktif dipegang di memori (dimuat dari
  `followup_nomor_aktif_idx`, disegarkan saat setelan disimpan). Per nomor: `bolehPada`, `kirimHari`, rem di memori,
  jadi putaran tanpa I/O sampai benar-benar boleh mengirim.
- Pemindaian lead tiap 5 menit per nomor lewat `percakapan_lead_idx (number_id, terakhir_pada)` yang sudah ada,
  LIMIT 50. Nomor dipindai bergiliran (paling banyak 20 nomor per putaran) supaya beban rata.
- Draf disiapkan menjelang jadwal (paling banyak 2 per nomor per putaran).
- `EXPLAIN (ANALYZE, BUFFERS)` untuk pemindaian & ambil antrean di data uji ±200 nomor × 5.000 chat, angka dilaporkan.

## 6. Paket & kuota

- Fitur untuk **akun berbayar** (langganan aktif) dan staf, sama seperti katalog (`akunBerbayar`). Mesin self-host:
  ikut fitur `bot` lisensi.
- **Tiap pesan follow-up yang ditulis AI = 1 balasan AI** (dipotong dari kuota paket). Templat cadangan tidak
  dihitung. Kuota habis = follow-up berhenti (tidak pakai templat terus-menerus).

## 7. Uji

- `uji/uji-followup-prospek.mjs` diperluas: profil usaha, rem per nomor (rem nomor A tidak menghentikan nomor B),
  pemanasan, rasio 20%, jeda pemilik (`peran = 2`, `jeda_sampai`), kuota habis, stop permanen, tautan ditolak,
  promo karangan ditolak, GercepBot tidak berubah (uji lama tetap lolos).
- `uji/uji-ai.mjs`: prompt profil usaha untuk 5 jenis usaha (laundry, kuliner, toko baju, klinik, jasa) → tidak ada
  fakta di luar Informasi Usaha.
- Screenshot tab Follow-up (desktop 1440 & HP 390; kosong, berisi antrean, rem menyala, pemanasan) sebelum push.

## 8. Urutan kerja

1. Migrasi v38 + pecah mesin jadi inti per nomor (GercepBot lewat profil `cs`, uji lama harus tetap lolos).
2. Profil `usaha`: prompt, templat, aturan bagian 2, kuota.
3. Putaran multi-nomor + rem/anggaran per nomor + notifikasi pemilik.
4. Tag `beli` + pengingat order ulang (bagian 2b).
5. Tab Follow-up di halaman nomor (prospek + order ulang) + kontrol admin.
6. Uji (termasuk order ulang: siklus, batas 90 hari, 1 pesan per pembelian, kuota 50%), EXPLAIN, screenshot →
   persetujuan → push.

## 9. Keputusan pemilik produk (2026-11-14)

1. Cakupan: **follow-up prospek + pengingat order ulang** (bagian 2b).
2. Kuota: tiap pesan follow-up yang ditulis AI = **1 balasan AI**.
3. Paket: **semua paket berbayar**.
