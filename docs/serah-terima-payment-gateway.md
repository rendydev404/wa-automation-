# Serah-terima: Payment gateway Midtrans / iPaymu / Hybrid + perbaikan tampilan HP

Dokumen ini untuk melanjutkan pekerjaan di agen/sesi lain tanpa kehilangan konteks. Tanggal: 2026-11-09.
Bahasa kerja: **Indonesia** (semua jawaban, recap, tombol). Baca juga `AGENTS.md` (Next.js 16, berbeda dari biasanya).

## 1. Aturan proyek yang wajib diikuti

- **Push ke `main` = deploy otomatis** ke VPS produksi lewat `.github/workflows/deploy.yml`. Deploy hanya jalan bila
  `bangun` (build + `uji/uji-next.mjs`), `periksa` (eslint seluruh repo + `next typegen && tsc`), dan `uji` (3 jalur) lulus.
- **Perubahan tampilan**: build lokal dengan database sementara (`uji/pg-lokal.mjs`), screenshot Chrome headless
  desktop ±1440 px & HP (±320–412 px), kirim ke pengguna, **tunggu setuju sebelum push** (kecuali pengguna bilang "push aja").
  Jangan login dengan kredensial/sesi produksi.
- **Checkout dipakai bersama sesi lain** yang punya perubahan belum di-commit (maskot dashboard, tur, `src/lib/aktivitas.ts`,
  video, dll.). **Commit hanya berkas sendiri.** Jangan stash/reset/switch branch. Berkas yang bercampur dengan sesi lain:
  `src/app/actions.ts` (hunk `TUR_SAH`/`selesaiTurAction` milik sesi lain) dan `src/lib/langganan.ts`
  (`import { cache }` + `hakAkunSekali` milik sesi lain). Untuk berkas campuran: buat versi "tanpa hunk asing" lalu
  `git hash-object -w --path=<berkas> <salinan>` + `git update-index --cacheinfo 100644,<hash>,<berkas>`.
- **Koneksi WhatsApp tidak boleh putus** saat deploy (mati rapi sudah ada; cukup pastikan nomor tersambung lagi di log).
- Server: **VPS 31.97.67.66** (`ssh vps3`, host `srv2075208`) — sudah dikonfirmasi pengguna. App `/opt/wa-automation`
  (docker compose, `env_file: .env`, port 3230), versi aktif = symlink `aktif -> rilis/<sha>`.
- Performa: query hemat, tanpa N+1, laporkan angka nyata.
- Shell Bash di Windows: heredoc `<<'EOF'` berisi Python kadang gagal ("unexpected EOF") — tulis skrip ke berkas dulu
  (Write) lalu jalankan.

## 2. Yang SUDAH selesai dan live di produksi

Commit di `main` (semua sudah ter-deploy, CI hijau, 12 nomor WA tersambung lagi setiap deploy):

| Commit | Isi |
|---|---|
| `48ad12f` | Lapisan gateway: Midtrans + iPaymu (API v2 Direct Payment, HMAC-SHA256), mode Hanya Midtrans / Hanya iPaymu / Hybrid per metode, kolom `transaksi.gateway` + `gateway_ref` (migrasi v31), webhook `/api/ipaymu/notifikasi`, kanal baru DANA, panel admin |
| `32592d4` | Status kanal gagal dibaca tampil jelas beserta alasannya (HTTP 401, tidak terjangkau, dll.) + baris sumber status per provider |
| `2f7cef5` | Metode yang tidak ada di daftar akun Midtrans = nonaktif |
| `7f1b13e` | Halaman pilih metode bayar tidak melebar di HP (grid `minmax(0,1fr)`, keterangan 2 baris, lencana jaminan 1 baris) |

Berkas utama:
- `src/lib/gateway.ts` — registri adapter, mode (`settings.gateway_aktif` = midtrans|ipaymu|hybrid), peta hybrid
  (`settings.gateway_hybrid`, bawaan BCA VA/ShopeePay/DANA → iPaymu), `statusProvider()` (status nyata, disimpan 10 menit),
  `rencanaKanal()`, `penyediaKanal()`, `kanalAktif()`, `sumberStatus()`, `lupakanStatusKanal()`.
- `src/lib/gateway-def.ts` — tipe & label (aman untuk klien), `MODE_GATEWAY`, `PETA_HYBRID_BAWAAN`, `GatewayError`.
- `src/lib/ipaymu.ts` — klien iPaymu (`buatChargeIpaymu`, `statusIpaymu`, `bacaKanalAkunIpaymu`, `KANAL_IPAYMU`).
- `src/lib/midtrans.ts` — + `bacaPreferensiMidtrans` (Preference API `app.midtrans.com/snap/v3/merchant-preferences`),
  `NAMA_PREFERENSI`, `KANAL_BUKAN_MIDTRANS` (DANA).
- `src/lib/langganan.ts` — `mulaiBayar(g, …)`, `terapkanStatus(orderId)`, `statusTagihan(userId, orderId)`,
  `batalkanBayar(userId, orderId)` memakai provider asal transaksi.
- `src/lib/jaminan.ts` — `modeRefundAkun()`: pembayaran lewat iPaymu = uang kembali manual.
- Admin UI: `src/app/[lang]/(admin)/admin/bagian.tsx` (`MetodeBayar`) + `admin/transaksi/form-gateway.tsx`.
- Halaman bayar: `src/app/[lang]/(app)/langganan/bayar/[paket]/{page,pilih-metode}.tsx`; tagihan:
  `langganan/tagihan/[order]/{page,langkah,instruksi}.tsx` (langkah DANA, VA Mandiri iPaymu).
- Aksi server baru di `src/app/actions.ts`: `adminGatewayAction`, `adminPenyediaKanalAction`,
  `adminSegarkanStatusKanalAction`, `adminCobaLagiKanalAction`.
- Uji: `uji/uji-gateway.mjs` (15 uji), `uji/loader.mjs` (+ alias `@/` & `next/server`), penyesuaian
  `uji-langganan`, `uji-jaminan`, `uji-auth` (versi skema 31). Jalankan: `node --no-warnings uji/jalankan-semua.mjs --jalur=fitur`.

Produksi (dicek langsung 2026-11-09):
- `.env` VPS sudah berisi `IPAYMU_VA` & `IPAYMU_API_KEY` (kutip tunggal; cadangan `.env.bak-sebelum-ipaymu`).
  `docker compose config` menampilkan `$` sebagai `$$` — itu escape, nilai benar (hash cocok).
- Mode produksi = **hybrid**. `kanal_mati` Midtrans: qris/shopeepay/bca disembunyikan admin.
- Status nyata: **Midtrans** aktif GoPay, BNI, BRI, BSI, CIMB, Mandiri (echannel), Permata; QRIS/ShopeePay/BCA tidak ada di
  akun. **iPaymu** aktif ShopeePay, DANA, VA BCA/BNI/BRI/BSI/CIMB/Mandiri/Permata (+Muamalat/Danamon/BAG, belum dipakai);
  QRIS belum aktif. Jadi QRIS tidak ditawarkan sama sekali sampai diaktifkan di salah satu provider.
- Callback iPaymu otomatis per tagihan: `https://chatgercep.com/api/ipaymu/notifikasi` (tidak perlu ditempel di dashboard).
- iPaymu tidak punya VA SeaBank.
- Cek status nyata tanpa login: `ssh vps3 'docker exec wa-automation-app-1 node -e "…fetch ke API provider pakai process.env…"'`
  (jangan pernah mencetak kunci).

## 3. Tampilan HP halaman bayar — SELESAI (commit `7f77f20`, 2026-11-09)

Ditambah: lencana jaminan boleh 2 baris di <380 px, nomor VA tidak patah (Salin turun ke bawah), logo bilah atas
utuh (Panduan = ikon saja <400 px, EN tanpa ikon <360 px), label menu bawah 10 px di <360 px. Laporan otomatis
320/360/390/412 px: OK. Catatan di bawah ini riwayat.

### (riwayat) Yang sempat dikerjakan

Keluhan pengguna (screenshot HP kecil ±360 px): halaman **pilih metode bayar** masih kurang responsif —
teks tombol "Bayar Rp246.000 dengan Permata Virtual Account" terpotong kiri-kanan (kelas `.btn` di `globals.css` memakai
`white-space: nowrap`, teks meluber & membuat halaman bisa digeser), kartu mepet tepi kanan. Pengguna minta
**detail kecil juga diperhatikan, jangan sampai UX buruk**.

Perubahan yang sudah ditulis di berkas kerja (tsc & eslint bersih, BELUM di-build/screenshot/commit):
- `pilih-metode.tsx`: tombol bayar `h-auto min-h-11 py-2.5 text-center leading-snug whitespace-normal text-balance`;
  kartu metode `gap-2.5 px-3 sm:gap-3 sm:px-3.5`; baris "Diproses aman oleh …" `items-start text-center` + ikon `shrink-0`.
- `page.tsx` (bayar): kartu `p-4 sm:p-6`, section `min-w-0`; banner "Kamu masih punya tagihan … Lanjutkan" jadi
  `flex-wrap` (teks `min-w-0 flex-1 basis-48`, "Lanjutkan" `ml-auto`).

Langkah berikutnya:
1. `npx next build` (jangan bersamaan dengan uji; pernah bikin uji gagal karena CPU).
2. Jalankan skrip ukur HP (lihat §4) di 320/360/390/412 px: tangkapan **per layar** (bukan satu halaman penuh — itu
   menyembunyikan menu bawah & masalah HP kecil) + laporan otomatis elemen keluar layar / teks terpotong.
3. Perbaiki semua temuan (halaman bayar **dan** tagihan: DANA & VA Mandiri), ulangi sampai laporan "OK" di semua lebar.
4. Kirim screenshot ke pengguna (SendUserFile) dengan keterangan; tunggu setuju (atau "push aja") → commit hanya dua berkas
   itu → push → pantau deploy (`readlink /opt/wa-automation/aktif` = sha baru & container `healthy`, log `terhubung`).

## 4. Skrip lokal (di scratchpad sesi lama — salin bila perlu)

Lokasi: `docs/serah-terima-skrip/` (salinan; scratchpad sesi lama bisa hilang). Tidak berisi kunci apa pun.
- `screenshot-gateway.mjs` — salin `.next/standalone` ke temp, PostgreSQL sementara, akun uji `admin@contoh.test` /
  `budi@contoh.test` (sandi `Rahasia-uji-2026`), transaksi contoh iPaymu (DANA & Mandiri VA), Chrome headless lewat CDP
  (tanpa pustaka), login lewat form. Jalankan dari akar repo:
  `node --no-warnings --import ./uji/loader.mjs <skrip> screenshot-gateway`
  (opsional env `SS_IPAYMU_VA`/`SS_IPAYMU_KEY` untuk membaca daftar kanal iPaymu asli, read-only).
- `alur-hp.mjs.txt` — alur ukur HP (320/360/390/412, pilih Permata, foto atas/daftar VA/bawah, tagihan) + fungsi `CEK`
  pendeteksi elemen keluar layar & teks terpotong. Gabungkan: ambil `screenshot-gateway.mjs` sampai sebelum
  `const simpanMode`, ganti `await sql.end(...)` menjadi set `gateway_aktif = 'hybrid'` lalu end, tambahkan isi
  `alur-hp.mjs.txt` → `layar-hp.mjs`.
- Server lokal memakai kunci Midtrans palsu, jadi status Midtrans di screenshot = "GAGAL dibaca (HTTP 401)" — itu wajar.

## 5. Catatan lain / tindak lanjut terbuka

- Belum ada pembayaran sungguhan lewat iPaymu di produksi; jalur charge+status hanya terbukti di sandbox iPaymu
  (QRIS & VA Mandiri berhasil, DANA berhasil, ShopeePay ditolak partner sandbox).
- DANA tidak termasuk jaminan uang kembali (aturan lama: GoPay/ShopeePay/QRIS).
- `screenshot-*` di akar repo dan `docs/serah-terima-payment-gateway.md` ini tidak di-commit.
- Memori proyek: `payment-gateway-hybrid.md` di folder memori Claude.
