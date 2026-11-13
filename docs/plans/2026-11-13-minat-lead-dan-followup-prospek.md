# Rencana: tingkat minat lead + follow-up otomatis prospek GercepBot

Tanggal: 2026-11-13. Status: menunggu persetujuan, belum ada kode.

Dua bagian yang saling bergantung: bagian A (tingkat minat) menjadi bahan bagian B (siapa yang di-follow-up dan
dengan gaya apa). Dikerjakan berurutan A → B.

---

## A. Tingkat minat lead (semua nomor)

### Masalah
`percakapan.prospek = 1` hanya berarti "pernah satu kali dinilai prospek". Aturan "ragu = prospek" sengaja longgar
supaya pembeli tidak dicuekin, akibatnya daftar lead tercampur antara yang cuma nanya sekali dan yang siap bayar.

### Prinsip
- **Membalas tetap memakai aturan lama** (ragu = prospek, 3 strike, bisu/bot). Tingkat minat TIDAK memengaruhi siapa
  yang dibalas.
- Tingkat minat hanya menentukan: urutan & saring daftar lead, follow-up, ekspor, dan sinyal Meta CAPI.
- Semua otomatis, tanpa tandai manual (keputusan 2026-11-03).

### Tingkat
| Nilai | Nama | Sinyal |
|---|---|---|
| 0 | dingin | sapaan saja, satu pertanyaan umum lalu diam |
| 1 | hangat | tanya harga/stok/ongkir/lokasi/jadwal/cara order, bertanya lanjutan, membalas lagi setelah dijawab |
| 2 | panas | menyebut jumlah/varian/tanggal/alamat, minta rekening/QRIS/link bayar, "jadi"/"pesan"/"ambil", katalog dikirim & dipilih, pesanan tercatat |

### Cara menilai (tanpa panggilan AI tambahan)
1. **Tag dari AI utama** di jawaban yang sama: `ATURAN_NILAI` ditambah `<minat>dingin|hangat|panas</minat>`, hanya
   untuk pesan yang dinilai `prospek`. Diurai di `ambilNilai` (prospek-def.ts), dibuang dari teks pelanggan.
2. **Bukti nyata** (lebih dipercaya daripada tag): katalog terkirim/pesanan tercatat (pesanan-otomatis) = panas;
   pemilik membalas sendiri di chat itu = minimal hangat.
3. **Aturan naik/turun**: tingkat diambil maksimum selama chat aktif; turun satu tingkat bila diam 7 hari (dihitung
   saat dibaca, bukan job massal: `minat_efektif = f(minat, minat_pada, sekarang)`), jadi tanpa UPDATE berkala.

### Data (migrasi baru di db.ts)
```sql
ALTER TABLE percakapan ADD COLUMN minat smallint, ADD COLUMN minat_pada bigint, ADD COLUMN minat_alasan text;
CREATE INDEX percakapan_minat_idx ON percakapan (number_id, minat DESC, terakhir_pada DESC) WHERE prospek = 1;
```
Kolom tanpa default → hanya katalog, tanpa menulis ulang tabel. Ditulis lewat `tulisLatar` seperti `tandaiProspek`,
hanya saat nilainya naik (bukan tiap pesan).

### Tampilan
- Histori percakapan (`nomor/[id]`): lencana 🔥 Panas / 🌤 Hangat / ❄️ Dingin, filter "Lead serius" (hangat+panas),
  urutan panas dulu.
- API v1 percakapan: field `minat` (+ dokumen api-dok).
- Meta CAPI: event Lead hanya untuk panas (dicek dulu dengan aturan Pixel yang ada).

### Uji
- `uji/uji-ai.mjs`: kasus tag `<minat>` (format rusak, tanpa tag, tag di chat bukan prospek diabaikan).
- Set kecil percakapan berlabel (dingin/hangat/panas, ±60 kasus berbagai usaha) → ukur ketepatan tag AI utama.
  Target: panas ≥ 90% tepat, pembeli asli tidak pernah tercatat dingin bila sudah minta rekening.

---

## B. Follow-up otomatis prospek di nomor GercepBot (internal)

### Siapa yang di-follow-up (semua harus terpenuhi)
- Chat di nomor CS ChatGerCep (nomor yang sama dengan follow-up akun; `nomorCsDipakai`).
- **Dia yang chat duluan**: pesan pertama chat itu dari lawan bicara (`pesan_chat.peran = 0`). Kita tidak pernah
  membuka chat baru.
- `prospek = 1` dan minat ≥ hangat. Dingin tidak di-follow-up (cuma "p" lalu hilang = bukan lead).
- Pesan terakhir di chat dari kita (pertanyaannya sudah dijawab), lalu dia diam ≥ jeda tahap.
- Bukan spam/bisu/bot, tidak ada di `followup_stop`, tidak sedang ditangani follow-up akun (tabel `followup` dengan
  kunci sama), belum berlangganan (bila nomornya tertaut ke akun).

### Ritme (bawaan, bisa diubah admin)
| Tahap | Kapan sejak pesan terakhir kita | Isi |
|---|---|---|
| 1 | hangat: 3 jam · panas: 1 jam | lanjutkan percakapan, jawab keberatan yang belum terucap |
| 2 | +1 hari | bukti & kerugian kalau tidak dipakai |
| 3 | +3 hari | pesan penutup, tanpa tekanan |

Paling banyak 3 pesan per chat per siklus. Begitu dia membalas, follow-up berhenti dan percakapan dilayani AI
seperti biasa. Siklus baru hanya bila dia chat lagi duluan di kemudian hari. Kalau dia diam setelah tahap 3, selesai.

### Psikologi penjualan (hard selling, tetap jujur)
AI menulis tiap pesan per orang dari **riwayat chat orang itu** (apa yang ditanya, usahanya apa, keberatan yang
tersirat), memakai teknik yang cocok untuk tiap tahap:

- **Tahap 1, lingkaran terbuka + balas budi**: lanjutkan dari pertanyaan terakhirnya ("Tadi kamu tanya harga
  paket Bisnis untuk laundry-mu…"), beri satu hal berguna (contoh balasan AI untuk usahanya / tawaran coba Uji bot
  gratis), tutup dengan pertanyaan yang gampang dijawab (ya/tidak, pilihan A/B).
- **Tahap 2, takut rugi + bukti sosial + jangkar harga**: hitung kerugian dari usahanya ("chat yang masuk jam 10
  malam dan baru dibalas besok pagi sering pindah ke toko lain"), harga dipecah per hari dari data harga terbaru
  (Starter Rp67.000/bulan ≈ Rp2.200/hari), bukti sosial **hanya dari data nyata** (jumlah usaha/chat yang benar-benar
  dilayani, diambil dari DB, bukan karangan).
- **Tahap 3, takeaway / pesan pamit**: "ini pesan terakhir dari aku ya", pembalik risiko (jaminan uang kembali
  `MASA_ID` yang memang berlaku), pintu tetap terbuka. Pesan pamit biasanya yang paling banyak dibalas.
- **Lead panas**: langsung ke penutupan: ringkas pilihan paket yang cocok + link `/langganan` + cara bayar yang aktif
  (kanal_mati disaring).

**Larangan keras** (diperiksa `pemeriksa.ts` terhadap sumber fakta, jadi bukan cuma lewat prompt):
- Kelangkaan/batas waktu palsu ("promo habis malam ini") kecuali promo itu benar ada di data sinkron ChatGerCep.
- Testimoni, angka pelanggan, atau nama usaha karangan.
- Harga/paket yang tidak sama dengan data sinkron terbaru.
- Lebih dari 1 tautan, tautan di tahap 1–2 untuk lead hangat (risiko blokir).

Alasannya: kebohongan yang ketahuan membunuh kepercayaan dan memancing laporan spam, yang justru mengancam nomor CS.

### Anti-blokir (pakai ulang mesin follow-up akun)
- `kirimSapaan` (ritme manusia), jam kerja WIB, jeda acak 3–10 menit antarpesan.
- **Batas harian dan rem dipakai bersama** dengan follow-up akun (satu nomor = satu anggaran kiriman). Rem centang
  satu: tahap berikutnya tidak dikirim bila pesan sebelumnya tidak sampai ke HP.
- Kata "stop / jangan chat lagi" → `followup_stop` permanen (POLA_STOP yang sudah ada).
- Tidak pernah 2 pesan follow-up tanpa balasan dalam < 20 jam (kecuali tahap 1 lead panas).

### Data
```sql
CREATE TABLE followup_prospek (
  kunci      text PRIMARY KEY,           -- percakapan.kunci
  number_id  integer NOT NULL REFERENCES numbers(id) ON DELETE CASCADE,
  status     text NOT NULL CHECK (status IN ('jalan', 'dibalas', 'selesai', 'batal', 'stop', 'gagal')),
  tahap      smallint NOT NULL DEFAULT 0,
  jadwal     bigint NOT NULL,
  siklus     bigint NOT NULL,            -- waktu pesan masuk terakhir yang memulai siklus ini
  pesan      jsonb NOT NULL DEFAULT '[]',-- [{tahap, id, teks, pada, ack}]
  dibalas    bigint, alasan text, dibuat bigint NOT NULL, diperbarui bigint NOT NULL
);
CREATE INDEX followup_prospek_jalan_idx ON followup_prospek (jadwal) WHERE status = 'jalan';
```
Antrean diisi saat AI selesai menjawab chat prospek di nomor CS (sudah ada di jalur bridge, tanpa pemindaian tabel).
Putaran tiap menit hanya membaca baris jatuh tempo lewat indeks parsial, sama seperti follow-up akun.

### Admin
Halaman follow-up yang sudah ada (/admin) dapat tab kedua "Prospek": saklar aktif, ritme tiap tahap, daftar
antrean & pratinjau draf (bisa diedit sebelum terkirim, seperti follow-up akun), angka: terkirim, dibalas %, jadi
berlangganan (nomor lead = `wa_id` akun yang kemudian bayar).

### Berkas yang disentuh
- `src/lib/prospek-def.ts` (aturan & pengurai `<minat>`), `src/lib/ai.ts` (teruskan `minat`), `src/lib/bridge.ts`
  (simpan minat + antrekan follow-up), `src/lib/percakapan.ts`, `src/lib/db.ts` (migrasi)
- baru: `src/lib/followup-prospek.ts` (+ `-def.ts`), dengan bagian bersama dipindah dari `followup.ts`
  (jam kerja, jeda, rem, batas harian, POLA_STOP)
- UI: histori percakapan, halaman admin follow-up; API v1 percakapan + api-dok
- uji: `uji/uji-ai.mjs`, `uji/uji-alur.mjs`

### Urutan kerja
1. A: tag minat + kolom + uji → lencana & filter di histori → screenshot → setuju → push.
2. B: mesin follow-up prospek (mati bawaan) + uji alur → halaman admin → screenshot → setuju → push.
3. Nyalakan di produksi dengan batas harian kecil (mis. 15/hari) seminggu pertama, pantau rem & angka dibalas.
