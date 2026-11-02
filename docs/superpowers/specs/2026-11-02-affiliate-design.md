# Spesifikasi Desain Sistem Afiliasi (Affiliate Program)

**Tanggal:** 2026-11-02  
**Status:** Disetujui  
**Arsitektur:** Ledger-First + Cached Atomic Balance + Hybrid Payout (Manual & Midtrans Iris)

---

## 1. Tujuan & Ruang Lingkup

Membangun fitur program afiliasi (referral) terintegrasi di mana pengguna dapat mendaftar menjadi afiliator (seperti Shopee/TikTok Affiliate versi ringkas), membagikan tautan afiliasi unik (`?ref=kode`), dan memperoleh komisi otomatis setiap kali pengguna yang mendaftar lewat tautan tersebut membeli paket langganan (baik melalui Midtrans maupun pembayaran manual berbayar yang dicatat Admin). Besaran komisi berbeda-beda per paket (`persen` atau `rupiah`) dan dapat diatur sepenuhnya oleh Admin.

---

## 2. Aturan Bisnis Utama

1. **Pendaftaran Afiliator (Self-Onboarding):**
   - Pengguna membuka menu **Afiliasi** (`/afiliasi`) di dashboard.
   - Pengguna mengisi kode referral unik pilihan sendiri (`3–24` karakter huruf kecil/angka/strip, mis. `rendy99`) serta informasi rekening pencairan (Nama Bank/E-Wallet melalui komponen *Custom Dropdown*, Nomor Rekening/HP, dan Nama Pemilik).
   - Berdasarkan pengaturan Admin (`afiliasi_persetujuan` di tabel `settings`):
     - `otomatis` (bawaan): Akun afiliator langsung berstatus `aktif`.
     - `manual`: Akun afiliator berstatus `menunggu` hingga disetujui Admin di `/admin/afiliasi`.

2. **Pelacakan Tautan Referral (Cookie Attribution):**
   - Tautan afiliasi berbentuk `https://domain.com/?ref=<kode>` atau `https://domain.com/daftar?ref=<kode>`.
   - Ketika pengunjung membuka URL dengan parameter `?ref=<kode>`, endpoint/middleware menyimpan cookie `wa_ref=<kode>` (masa aktif 30 hari, `httpOnly`, `sameSite: lax`) dan menambah penghitung klik (`klik + 1`) pada afiliator terkait.
   - Saat pengunjung mendaftar akun baru (baik melalui formulir `/daftar` maupun `Daftar dengan Google` di `/api/auth/google/callback`), sistem membaca cookie `wa_ref`, mencari afiliator yang `aktif` (dan bukan dirinya sendiri), lalu menyimpan `users.referred_by = afiliator.user_id` secara permanen dan menghapus cookie `wa_ref`.

3. **Konfigurasi Komisi per Paket oleh Admin:**
   - Setiap baris di tabel `paket` memiliki:
     - `komisi_jenis`: `'persen'` (0–100%) atau `'rupiah'` (Rp0 – harga paket).
     - `komisi_nilai`: bilangan bulat `>= 0` (`0` = tidak ada komisi untuk paket tersebut).
   - Untuk **Paket Custom**, pengaturan JSON Paket Custom juga menyimpan `komisi_jenis` dan `komisi_nilai` yang otomatis disinkronkan ke baris cermin Paket Custom di tabel `paket`.

4. **Siklus & Pemicu Komisi Otomatis:**
   - Admin dapat mengatur siklus komisi (`afiliasi_siklus` di `settings`):
     - `'pertama'` (Pembelian Pertama Saja): Afiliator hanya mendapat komisi pada transaksi berbayar pertama yang lunas dari pengguna yang direferensikan.
     - `'berulang'` (Berulang / Recurring): Afiliator mendapat komisi setiap kali pengguna yang direferensikan membeli atau memperpanjang paket berbayar.
   - Komisi dihitung otomatis di dalam transaksi database yang sama (`tx`) ketika:
     - Pembayaran **Midtrans** berubah menjadi `lunas` di `terapkanStatus()`.
     - Pembayaran **Manual oleh Admin** dicatat melalui `berikanPaketManual()` selama metodenya **bukan** `'kompensasi'` dan `jumlah > 0`.
   - Rumus komisi:
     - Jika `komisi_jenis === 'persen'`: `Math.floor((jumlah_bayar * komisi_nilai) / 100)`.
     - Jika `komisi_jenis === 'rupiah'`: `Math.min(jumlah_bayar, komisi_nilai)`.
   - Keamanan Idempotensi: Tabel `komisi_afiliasi` memiliki constraint `UNIQUE (transaksi_id)` sehingga satu transaksi tidak mungkin menghasilkan komisi ganda.

5. **Pencairan Komisi (Hybrid Withdraw):**
   - Afiliator dapat mengajukan penarikan saldo (`penarikan_afiliasi`) apabila `saldo >= afiliasi_min_tarik` (bawaan `Rp50.000`, dapat diubah Admin).
   - Saat pengajuan dibuat, `saldo` afiliator langsung dikurangi secara atomik (`SELECT ... FOR UPDATE`) agar tidak terjadi *double withdrawal*.
   - Di halaman `/admin/afiliasi`, Admin dapat memproses pengajuan berstatus `menunggu`:
     - **Manual Transfer:** Admin mentransfer ke rekening/e-wallet afiliator lalu klik **Tandai Selesai** (opsional mengisi nomor referensi/catatan).
     - **Otomatis via Midtrans Iris (Payouts):** Jika variabel environment `MIDTRANS_IRIS_KEY` tersedia di server, Admin dapat menekan tombol **Cairkan via Midtrans Iris** yang langsung memanggil API Payouts Midtrans dan menyimpan nomor referensi Iris.
     - **Tolak Pengajuan:** Jika nomor rekening tidak valid atau ditolak, Admin menekan **Tolak** beserta alasan; sistem otomatis mengembalikan (`refund`) nominal tersebut ke `saldo` afiliator secara atomik.

---

## 3. Skema Database (Migrasi v15 di `src/lib/db.ts`)

```sql
ALTER TABLE paket
  ADD COLUMN komisi_jenis text NOT NULL DEFAULT 'persen' CHECK (komisi_jenis IN ('persen', 'rupiah')),
  ADD COLUMN komisi_nilai integer NOT NULL DEFAULT 20 CHECK (komisi_nilai >= 0);

ALTER TABLE users
  ADD COLUMN referred_by integer REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX users_referred_by_idx ON users (referred_by, id DESC) WHERE referred_by IS NOT NULL;

CREATE TABLE afiliator (
  user_id      integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  kode         text NOT NULL UNIQUE,
  status       text NOT NULL DEFAULT 'aktif' CHECK (status IN ('menunggu', 'aktif', 'nonaktif')),
  bank_nama    text NOT NULL,
  bank_nomor   text NOT NULL,
  bank_pemilik text NOT NULL,
  klik         integer NOT NULL DEFAULT 0,
  saldo        bigint NOT NULL DEFAULT 0 CHECK (saldo >= 0),
  total_komisi bigint NOT NULL DEFAULT 0,
  total_ditarik bigint NOT NULL DEFAULT 0,
  created_at   bigint NOT NULL
);

CREATE TABLE komisi_afiliasi (
  id               integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  afiliator_id     integer NOT NULL REFERENCES afiliator(user_id) ON DELETE CASCADE,
  referred_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  transaksi_id     integer NOT NULL UNIQUE REFERENCES transaksi(id) ON DELETE CASCADE,
  nama_paket       text NOT NULL,
  jumlah_bayar     integer NOT NULL,
  komisi_jenis     text NOT NULL CHECK (komisi_jenis IN ('persen', 'rupiah')),
  komisi_acuan     integer NOT NULL,
  nominal          integer NOT NULL CHECK (nominal > 0),
  created_at       bigint NOT NULL
);
CREATE INDEX komisi_afiliasi_afiliator_idx ON komisi_afiliasi (afiliator_id, id DESC);

CREATE TABLE penarikan_afiliasi (
  id           integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  afiliator_id integer NOT NULL REFERENCES afiliator(user_id) ON DELETE CASCADE,
  nominal      integer NOT NULL CHECK (nominal > 0),
  bank_nama    text NOT NULL,
  bank_nomor   text NOT NULL,
  bank_pemilik text NOT NULL,
  status       text NOT NULL CHECK (status IN ('menunggu', 'selesai', 'ditolak')),
  metode       text CHECK (metode IN ('manual', 'iris')),
  referensi    text,
  catatan      text,
  dibuat       bigint NOT NULL,
  diproses     bigint
);
CREATE INDEX penarikan_afiliasi_afiliator_idx ON penarikan_afiliasi (afiliator_id, id DESC);
CREATE INDEX penarikan_afiliasi_status_idx ON penarikan_afiliasi (status, dibuat DESC, id DESC);
```

---

## 4. Komponen & Modul Baru / Diperbarui

1. **`src/lib/afiliasi.ts`:**
   - Logika bisnis afiliasi, pengaturan program (`pengaturanAfiliasi`, `simpanPengaturanAfiliasi`), pendaftaran afiliator (`daftarAfiliator`, `ubahRekeningAfiliator`), pencatatan klik (`catatKlikReferral`), atribusi pendaftar baru (`terapkanReferral`), mesin pemberi komisi atomik (`prosesKomisiTransaksi`), pengajuan penarikan (`ajukanPenarikan`), dan pemrosesan penarikan oleh admin (`prosesPenarikan` manual/Midtrans Iris/tolak).
2. **`src/lib/midtrans.ts`:**
   - Penambahan helper `konfigIris()` dan `kirimPayoutIris()` untuk pencairan otomatis apabila `MIDTRANS_IRIS_KEY` dipasang di `.env`.
3. **`src/proxy.ts` & `src/lib/pengguna.ts` & `src/app/actions.ts` & `src/app/api/auth/google/callback/route.ts`:**
   - Menangkap query `?ref=kode` di halaman publik (`/` dan `/daftar`), menyimpan cookie `wa_ref` selama 30 hari, dan mencatat `referred_by` saat akun dibuat via form maupun Google OAuth.
4. **`src/lib/langganan.ts` & `src/lib/paket-custom-def.ts` & `src/lib/paket-custom.ts`:**
   - Menambahkan `komisi_jenis` dan `komisi_nilai` pada `Paket` dan `PaketCustom`, serta memanggil `prosesKomisiTransaksi(tx, ...)` saat `terapkanStatus` dan `berikanPaketManual` mengaktifkan paket berbayar.
5. **UI Workspace Pengguna (`src/app/(app)/afiliasi/page.tsx` & `form-afiliasi.tsx`):**
   - Halaman Afiliasi pengguna dengan *Custom Dropdown* pemilih Bank/E-Wallet (tanpa `<select>` native), tanpa emoji (menggunakan `lucide-react`), dan solid colors (tanpa gradient).
6. **UI Panel Admin (`src/app/(admin)/admin/afiliasi/page.tsx` & `form-afiliasi-admin.tsx` + `src/app/(admin)/admin/form-admin.tsx` & `paket-custom.tsx`):**
   - Pengaturan komisi per paket di `/admin/paket` (beserta Paket Custom).
   - Halaman penuh `/admin/afiliasi` untuk mengatur aturan afiliasi, memproses antrean withdraw, dan mengelola daftar afiliator.
