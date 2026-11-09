# Landing page per industri

Halaman iklan per jenis usaha di `chatgercep.com/<slug>` (publik, tanpa login). Produk, akun, harga, dan dashboard tetap
satu; yang beda hanya halaman depannya. Sumber awal: paket `chatgercep-lp-10-industri.zip` + brief programmer (9 Nov 2026).

| URL | Industri |
|---|---|
| /toko-online | Toko online / olshop |
| /laundry | Laundry |
| /klinik-kecantikan | Klinik kecantikan |
| /rental-mobil | Rental mobil |
| /maklon-kosmetik | Maklon kosmetik |
| /bengkel | Bengkel |
| /distributor | Distributor / grosir |
| /travel-umrah | Travel umrah |
| /catering | Catering |
| /kursus-les | Kursus & les |
| /garansi | Syarat garansi (isi dari `src/lib/jaminan-def.ts`, sama dengan yang diperiksa server) |

## Isi folder

```
lp/industri/<slug>.json   isi satu industri: hero, masalah, solusi, demo WA, manfaat, FAQ, SEO, warna aksen
lp/prompt/<slug>.md       template instruksi AI per industri (belum dipakai dashboard)
lp/aset/lp.css            desain (token warna = :root chatgercep.com)
lp/aset/lp.js             consent, Meta Pixel, simpan UTM, tracking klik CTA, demo WA interaktif, sticky CTA HP
```

Kode: `src/lib/lp/` (def = daftar slug, industri = impor JSON, template = HTML, halaman = penyaji + cache),
route `src/app/[lang]/(lp)/<slug>/route.ts`, sitemap `src/app/sitemap-lp.xml/route.ts`, kartu contoh di landing
utama `src/components/landing/contoh-industri.tsx`.

## Yang diambil dari sistem (bukan ditulis di JSON)

- **Harga & kuota paket**: dari Paket & harga di panel admin (`daftarPaket()`), paket Custom dari pengaturannya.
  Ubah harga di admin = LP ikut berubah paling lambat 1 menit (HTML disimpan di memori proses 60 detik).
- **Meta Pixel**: ID dari menu Pixel admin (hanya bila aktif). Pixel baru dimuat setelah pengunjung klik Setuju di
  banner cookie (`require_consent`). TikTok & GA4 belum dipasang.
- **Nomor CS**: nomor ChatGerCep yang sama dengan tombol "Coba Tes Bot WA" (`NOMOR_WA_DEMO` di `src/lib/merek.ts`).
- **Teks garansi**: dari `MASA_ID` & `syaratJaminan()`.

FAQ di JSON masih menyebut kuota paket secara tertulis (mis. "Paket Bisnis mendukung 3 nomor"). Kalau kuota paket di
admin diubah, sesuaikan juga FAQ terkait.

## Tracking

Semua tautan ke `/daftar` otomatis ditambah `industry`, `landing_page`, `paket` (tombol paket), dan `utm_*` / `fbclid` /
`ttclid` yang dibawa iklan. Event dari LP: PageView, ViewContent, ClickCTA, DemoScenario, InitiateCheckout. Purchase
TIDAK pernah dikirim dari LP (hanya server setelah pembayaran sukses).

Belum dikerjakan (brief prioritas 2–3): `/daftar` menyimpan `industry` + UTM ke tabel user, `content_category` di
CompleteRegistration/Purchase, dropdown template AI per industri di dashboard, gambar Open Graph.

## Menambah industri (mis. properti)

1. Salin `lp/industri/laundry.json` jadi `lp/industri/properti.json`, ganti slug, warna aksen, dan semua isinya.
2. Tambahkan `lp/prompt/properti.md`.
3. Tambahkan `"properti"` ke `SLUG_LP` (`src/lib/lp/def.ts`) dan nama Inggrisnya di `NAMA_LP_EN`.
4. Impor JSON-nya di `src/lib/lp/industri.ts`.
5. Buat `src/app/[lang]/(lp)/properti/route.ts` (salin dari laundry, ganti slug).
6. Jalankan `node --import ./uji/loader.mjs uji/uji-lp.mjs`: gagal kalau field wajib kosong, demo < 3 skenario, atau
   FAQ di luar 6–8.

Gambar Open Graph (1200×630) cukup ditaruh di `public/lp-assets/og/<slug>.png`; meta `og:image` otomatis terpasang.

## Aturan isi

- Jangan klaim fitur yang belum ada. FAQ sengaja menjawab "tidak" untuk stok real-time, booking otomatis, status
  pesanan, terima pembayaran, follow-up otomatis. Kalau fiturnya jadi, ubah jawaban di JSON.
- Jangan tambah testimoni, jumlah pelanggan, atau angka hasil sebelum datanya asli.
- Demo WA memakai nama usaha fiktif dan berlabel "Simulasi". Label itu jangan dihapus.
