/**
 * Definisi bersama analitik perilaku pengguna (dipakai browser DAN server, jadi tanpa "server-only" dan tanpa impor
 * modul server). Dibundel ke src/instrumentation-client.ts: jaga tetap kecil (konstanta + fungsi murni).
 *
 * Model data (src/lib/analitik.ts, migrasi v29 di db.ts): satu baris per (tanggal WIB, jenis, kunci, label, pengguna)
 * dengan penghitung `n` dan waktu `terakhir`. Tidak ada baris per klik: event dijumlahkan di memori server lalu
 * di-upsert berkelompok, jadi tabelnya tumbuh mengikuti jumlah hal BERBEDA yang dipakai tiap pengguna per hari.
 */

/** 0 = kunjungan halaman, 1 = klik elemen, 2 = pemakaian fitur (dicatat server, mis. server action berhasil). */
export const JENIS = { halaman: 0, klik: 1, fitur: 2 } as const;
export type Jenis = (typeof JENIS)[keyof typeof JENIS];

/** Ujung penerima event dari browser (POST, badan teks JSON `PayloadKirim`). */
export const UJUNG_ANALITIK = "/api/analitik";

/** Satu event dari browser: [jenis, jalur URL apa adanya (tanpa query), label elemen (klik saja)]. */
export type EventKirim = [jenis: 0 | 1, jalur: string, label?: string];
export interface PayloadKirim {
  e: EventKirim[];
}

export const MAKS_EVENT_PER_KIRIM = 40;
/** Batas badan permintaan (byte). Kiriman yang lebih besar ditolak utuh. */
export const MAKS_BYTE_KIRIM = 8_192;
export const MAKS_PANJANG_JALUR = 200;
export const MAKS_PANJANG_LABEL = 60;
/** Pilihan periode di halaman admin (hari). */
export const PERIODE_ANALITIK = [7, 30, 90] as const;
/** Baris analitik yang lebih tua dari ini dihapus berkala. */
export const RETENSI_HARI = 180;
/** user_id untuk pengunjung yang belum login (landing page, login, daftar). */
export const ANONIM = 0;

/**
 * Semua pola halaman aplikasi (tanpa awalan bahasa /eng). Jalur yang tidak cocok dengan salah satu pola TIDAK
 * dicatat: ruang kunci tetap terbatas walau klien mengirim jalur sembarang. Halaman baru wajib ditambahkan di sini
 * (uji/uji-analitik.mjs mencocokkan daftar ini dengan berkas page.tsx di src/app/[lang]).
 * Segmen "[...]" cocok dengan satu segmen apa pun (id nomor, kode paket, id pesanan).
 */
export const POLA_HALAMAN = [
  "/",
  "/login",
  "/daftar",
  "/lupa-password",
  "/mode-api",
  "/program-afiliasi",
  "/panduan",
  "/docs/api",
  "/docs/api/mulai-cepat",
  "/docs/api/pasang-mesin",
  "/docs/api/autentikasi",
  "/docs/api/referensi",
  "/docs/api/webhook",
  "/docs/api/galat",
  "/docs/api/sandbox",
  "/docs/api/ui-sendiri",
  "/docs/api/lisensi",
  "/developer-api",
  "/dashboard",
  "/akun",
  "/afiliasi",
  "/notifikasi",
  "/trial-habis",
  "/langganan",
  "/langganan/bayar/[paket]",
  "/langganan/tagihan/[order]",
  "/nomor/[id]",
  "/developer",
  "/developer/[id]",
  "/developer/[id]/bayar",
  "/admin",
  "/admin/analitik",
  "/admin/developer-api",
  "/admin/developer-api/[id]",
  "/admin/afiliasi",
  "/admin/ai",
  "/admin/aturan",
  "/admin/followup",
  "/admin/followup/prospek",
  "/admin/log",
  "/admin/paket",
  "/admin/pengguna",
  "/admin/pengguna/[id]",
  "/admin/pixel",
  "/admin/transaksi",
  "/admin/transaksi/[order]",
] as const;
export type PolaHalaman = (typeof POLA_HALAMAN)[number];

/** Halaman yang boleh dicatat untuk pengunjung yang belum login (selain ini diabaikan untuk anonim). */
export const HALAMAN_PUBLIK: readonly PolaHalaman[] = ["/", "/login", "/daftar", "/lupa-password", "/program-afiliasi", "/panduan", "/docs/api", "/docs/api/mulai-cepat", "/docs/api/pasang-mesin", "/docs/api/autentikasi", "/docs/api/referensi", "/docs/api/webhook", "/docs/api/galat", "/docs/api/sandbox", "/docs/api/ui-sendiri", "/docs/api/lisensi"];

const SEGMEN_POLA = POLA_HALAMAN.map((p) => (p === "/" ? [] : p.slice(1).split("/")));

/**
 * Jalur URL (boleh berawalan /eng, boleh membawa ?query/#hash, boleh URL absolut) -> pola halaman, atau null bila
 * bukan halaman aplikasi. Contoh: "/eng/nomor/12?x=1" -> "/nomor/[id]".
 */
export function polaJalur(jalur: string | null | undefined): PolaHalaman | null {
  if (typeof jalur !== "string" || !jalur || jalur.length > MAKS_PANJANG_JALUR * 2) return null;
  let p = jalur;
  const skema = p.indexOf("://");
  if (skema > 0) {
    const garis = p.indexOf("/", skema + 3);
    p = garis < 0 ? "/" : p.slice(garis);
  }
  p = p.split(/[?#]/, 1)[0];
  if (!p.startsWith("/")) return null;
  if (p === "/eng" || p.startsWith("/eng/")) p = p.slice(4) || "/";
  const seg = p.split("/").filter(Boolean);
  if (seg.length > 4) return null;
  for (let i = 0; i < POLA_HALAMAN.length; i++) {
    const pola = SEGMEN_POLA[i];
    if (pola.length !== seg.length) continue;
    let cocok = true;
    for (let j = 0; j < pola.length && cocok; j++) cocok = pola[j].startsWith("[") ? seg[j].length <= 80 : pola[j] === seg[j];
    if (cocok) return POLA_HALAMAN[i];
  }
  return null;
}

/** Pola halaman bersegmen dinamis (tautan ke sana dilabeli dengan polanya, bukan teksnya: teksnya bisa data pribadi). */
export const polaDinamis = (pola: string): boolean => pola.includes("[");

/**
 * Teks elemen -> label aman untuk disimpan: spasi dirapikan, email -> [email], deret angka berisi >= 8 digit (nomor
 * telepon) -> [nomor], deret angka lain >= 5 digit (id, kode) -> #, karakter kendali dibuang, maksimal
 * MAKS_PANJANG_LABEL karakter. Angka pendek (harga "Rp249.000", "30 hari") dibiarkan.
 */
export function labelAman(teks: string | null | undefined): string {
  if (typeof teks !== "string") return "";
  let s = teks.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return "";
  s = s.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[email]");
  s = s.replace(/\+?\d[\d\s().-]*\d/g, (m) => (m.replace(/\D/g, "").length >= 8 ? "[nomor]" : m));
  s = s.replace(/\d{5,}/g, "#");
  const huruf = Array.from(s);
  return huruf.length > MAKS_PANJANG_LABEL ? `${huruf.slice(0, MAKS_PANJANG_LABEL - 1).join("").trimEnd()}…` : s;
}

/** Kode fitur server (jenis 2): huruf kecil, angka, titik, minus, garis bawah; mis. "nomor.tambah". */
export const KODE_FITUR = /^[a-z0-9][a-z0-9._-]{1,59}$/;
