import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { COOKIE_REF, UMUR_COOKIE_REF, normalkanKodeRef } from "@/lib/afiliasi-def";
import { COOKIE_ASAL, UMUR_COOKIE_ASAL, asalDariUrl, asalHalaman, kodeAsal } from "@/lib/asal-def";
import { type Bahasa, HEADER_BAHASA, bahasaSah, tautan, urai } from "@/lib/bahasa";
import { jalurLanjut } from "@/lib/lanjut";
import { modeMesin } from "@/lib/mode";
import { JALUR_LP_PUBLIK } from "@/lib/lp/def";
import { COOKIE_VOUCHER, UMUR_COOKIE_VOUCHER, kodeVoucherSah, normalisasiKodeVoucher } from "@/lib/voucher-def";

// /api/sinkron dipanggil database (bukan browser); keabsahannya dicek lewat tanda tangan HMAC di handler-nya.
// "/" = landing page publik; /api/auth/google* = masuk dengan Google (sebelum ada sesi);
// /api/midtrans/notifikasi = webhook Midtrans (keabsahan dicek lewat tanda tangan SHA-512 + status ulang dari API).
// /api/ipaymu/notifikasi = callback iPaymu (trx_id harus cocok dengan transaksi kita + status ulang dari API iPaymu).
// /api/analitik = event analitik dari browser, juga pengunjung yang belum login (handler-nya sendiri memeriksa Origin,
// tanda tangan cookie sesi, ukuran, dan batas laju).
const BERKAS_STATIS = /\.(?:png|jpe?g|webp|avif|gif|svg|ico|mp4|webm|woff2?)$/i;
// Landing page per industri (/laundry, /bengkel, ...), /garansi, /sitemap(-lp).xml, dan /llms.txt: publik, tanpa login.
const PUBLIK = new Set([...JALUR_LP_PUBLIK, "/", "/sitemap.xml", "/llms.txt", "/program-afiliasi", "/panduan", "/api/health", "/api/pendaftar", "/api/sinkron", "/api/auth/google", "/api/auth/google/callback", "/api/midtrans/notifikasi", "/api/ipaymu/notifikasi", "/api/voucher/terbit", "/api/sapa-bayar/berhenti", "/api/demo-bot", "/api/analitik", "/api/lp/event", "/mode-api"]);

/**
 * Developer API: diautentikasi di handler masing-masing, bukan cookie. /api/v1/* = API mesin self-host (Bearer key);
 * /api/lisensi/* = aktivasi & cek dari mesin (di pusat) dan webhook dari pusat (di mesin; tanda tangan Ed25519);
 * /docs/api = dokumentasi publik (+ openapi.json). /developer-api = landing page Developer API (tidak dipublikasikan:
 * noindex, tidak ditautkan; hanya lewat tautan yang dibagikan).
 */
const publikDeveloperApi = (p: string): boolean =>
  p === "/api/v1" || p.startsWith("/api/v1/") || p.startsWith("/api/lisensi/") || p === "/docs/api" || p.startsWith("/docs/api/") || p === "/developer-api";

/** Mode mesin self-host: halaman khusus chatgercep.com (landing, langganan, afiliasi, portal developer) tidak ada. */
const HALAMAN_PUSAT = ["/llms.txt", "/sitemap.xml", "/program-afiliasi", "/panduan", "/langganan", "/afiliasi", "/developer", "/developer-api", "/trial-habis"];
const halamanPusat = (p: string): boolean => p === "/" || HALAMAN_PUSAT.some((h) => p === h || p.startsWith(`${h}/`));
/** Menu panel khusus pusat (paket berbayar, transaksi, afiliasi, follow-up penjualan, pixel, Developer API) di mesin = ke Ringkasan. */
const PANEL_PUSAT = ["/admin/paket", "/admin/transaksi", "/admin/afiliasi", "/admin/followup", "/admin/pixel", "/admin/developer-api"];
const panelPusat = (p: string): boolean => PANEL_PUSAT.some((h) => p === h || p.startsWith(`${h}/`));

function asalSama(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // klien non-browser tidak membawa cookie sesi secara otomatis
  try {
    const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0].trim().toLowerCase();
    return new URL(origin).host.toLowerCase() === host;
  } catch {
    return false;
  }
}

/** Bahasa asal permintaan API: dari halaman yang memanggilnya (Referer sama-asal membawa path lengkap). */
function bahasaReferer(req: NextRequest): Bahasa {
  const ref = req.headers.get("referer");
  if (!ref) return "id";
  try {
    return urai(new URL(ref).pathname).bahasa;
  } catch {
    return "id";
  }
}

/**
 * Pemeriksaan optimistis (tanda tangan + masa berlaku). Otorisasi penuh ada di tiap aksi/handler.
 * Bahasa: /eng/... = Inggris, jalur lain = Indonesia (penulisan ulang ke src/app/[lang] ada di next.config.ts).
 */
export async function proxy(request: NextRequest) {
  const { pathname: asli, searchParams, search } = request.nextUrl;
  const { bahasa: bahasaUrl, jalur: pathname } = urai(asli);
  const isApi = pathname === "/api" || pathname.startsWith("/api/");
  const bahasa: Bahasa = isApi && bahasaUrl === "id" ? bahasaReferer(request) : bahasaUrl;
  const href = (jalur: string) => tautan(bahasa, jalur);

  // Panel admin hanya berbahasa Indonesia.
  if (bahasaUrl === "en" && (pathname === "/admin" || pathname.startsWith("/admin/"))) {
    return NextResponse.redirect(new URL(pathname + search, request.url));
  }

  const kepala = new Headers(request.headers);
  // Server action yang diteruskan Next antar-halaman (ke /[lang]/...) membawa header bahasa permintaan aslinya.
  if (!(request.headers.has("x-action-forwarded") && bahasaSah(request.headers.get(HEADER_BAHASA)))) kepala.set(HEADER_BAHASA, bahasa);
  // Penulisan ulang /eng/... -> /en/... dan /x -> /id/x ada di next.config.ts (rewrites beforeFiles, dijalankan setelah
  // proxy ini). Di sini cukup meneruskan bahasa lewat header untuk server action & route handler.
  const lanjut = (): NextResponse => NextResponse.next({ request: { headers: kepala } });
  const refParam = searchParams.get("ref");
  const kodeRef = refParam ? normalkanKodeRef(refParam) : null;
  const pasangRef = (res: NextResponse): NextResponse => {
    if (kodeRef) {
      const sebelumnnya = request.cookies.get(COOKIE_REF)?.value;
      res.cookies.set(COOKIE_REF, kodeRef, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: UMUR_COOKIE_REF,
      });
      if (sebelumnnya !== kodeRef) {
        import("@/lib/afiliasi")
          .then((m) => m.catatKlikReferral(kodeRef))
          .catch(() => {});
      }
    }
    return res;
  };

  // Tautan klaim dari email pembelian Panduan (?voucher=CG-XXXX-XXXX): kodenya disimpan di cookie supaya tetap terbawa
  // melewati login / daftar / masuk dengan Google; modal klaim di layout aplikasi membacanya begitu pengguna masuk.
  const voucherParam = !isApi && request.method === "GET" ? searchParams.get("voucher") : null;
  const kodeVoucher = voucherParam ? normalisasiKodeVoucher(voucherParam) : "";
  const pasangVoucher = (res: NextResponse): NextResponse => {
    if (kodeVoucher && kodeVoucherSah(kodeVoucher)) {
      res.cookies.set(COOKIE_VOUCHER, kodeVoucher, { httpOnly: true, sameSite: "lax", path: "/", maxAge: UMUR_COOKIE_VOUCHER });
    }
    return res;
  };
  const tanpaVoucher = (): string => {
    const q = new URLSearchParams(search);
    q.delete("voucher");
    const s = q.toString();
    return s ? `?${s}` : "";
  };

  if (publikDeveloperApi(pathname)) return lanjut();
  // Webhook WhatsApp Cloud API (Meta) per nomor resmi: publik, keabsahan dari tanda tangan HMAC app secret (wa-resmi.ts).
  if (pathname.startsWith("/api/wa/meta/")) return lanjut();
  // Mesin self-host dengan DASHBOARD_MESIN=mati: murni API. Semua halaman ke /mode-api (status lisensi); route dashboard
  // (sesi cookie) ditolak. Blokir dari lisensi pusat ditangani di getUser/requireUser (proxy tidak membaca lisensi).
  if (modeMesin() && (process.env.DASHBOARD_MESIN ?? "").trim().toLowerCase() === "mati" && pathname !== "/mode-api" && pathname !== "/api/health" && !BERKAS_STATIS.test(pathname) && !pathname.startsWith("/_next")) {
    if (isApi) return NextResponse.json({ error: "Dashboard mesin dimatikan (DASHBOARD_MESIN=mati). Gunakan /api/v1." }, { status: 404 });
    return NextResponse.redirect(new URL(href("/mode-api"), request.url));
  }
  if (modeMesin() && !isApi && halamanPusat(pathname)) return NextResponse.redirect(new URL(href("/dashboard"), request.url));
  if (modeMesin() && !isApi && panelPusat(pathname)) return NextResponse.redirect(new URL(href("/admin"), request.url));
  if (PUBLIK.has(pathname)) {
    const res = pasangVoucher(pasangRef(lanjut()));
    // Iklan yang mendarat di beranda / LP industri: UTM & click id disimpan sekarang (cookie 30 hari), karena tombol
    // "Daftar" di halaman itu tidak membawa parameternya. Kunjungan tanpa parameter tidak menimpa cookie yang ada.
    const asalIklan = !isApi && request.method === "GET" ? asalHalaman(pathname, searchParams) : null;
    if (asalIklan) res.cookies.set(COOKIE_ASAL, kodeAsal(asalIklan), { httpOnly: true, sameSite: "lax", path: "/", maxAge: UMUR_COOKIE_ASAL });
    return res;
  }
  // Berkas statis dari public/ (logo, logo bank, maskot, ikon) memang publik: tanpa ini pengunjung yang belum login
  // dialihkan ke /login dan gambarnya rusak di landing page. Hanya ekstensi media/font, dan bukan /api.
  if (!isApi && BERKAS_STATIS.test(pathname)) return lanjut();

  const sesi = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  // /login, /daftar & /lupa-password selalu diteruskan: cookie yang sah tanda tangannya belum tentu masih berlaku di database
  // (mis. password diganti, akun diblokir), dan mengalihkannya dari sini akan memutar tanpa henti.
  if (pathname === "/login" || pathname === "/daftar" || pathname === "/lupa-password") {
    const res = pasangRef(lanjut());
    // Asal pendaftar dari LP industri / iklan (industry, landing_page, paket, utm_*, click id): disimpan ke akun saat
    // akun dibuat. Lewat cookie supaya ikut juga di alur Google yang meninggalkan halaman ini.
    const asalBaru = request.method === "GET" && pathname !== "/lupa-password" ? asalDariUrl(searchParams) : null;
    if (asalBaru) res.cookies.set(COOKIE_ASAL, kodeAsal(asalBaru), { httpOnly: true, sameSite: "lax", path: "/", maxAge: UMUR_COOKIE_ASAL });
    return pasangVoucher(res);
  }
  if (!sesi) {
    if (isApi) {
      const pesan = bahasa === "en" ? "Your session has ended. Please sign in again." : "Sesi berakhir. Silakan login kembali.";
      return NextResponse.json({ error: pesan }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    // Halaman yang dibuka (mis. /trial-habis dari tautan WhatsApp) dibawa ke /login supaya setelah masuk kembali ke sana.
    const tujuan = new URL(href("/login"), request.url);
    const asal = pathname + (voucherParam !== null ? tanpaVoucher() : search);
    if (pathname !== "/" && request.method === "GET" && jalurLanjut(asal)) tujuan.searchParams.set("lanjut", asal);
    return pasangVoucher(pasangRef(NextResponse.redirect(tujuan)));
  }
  // Sudah login: kode dipindah ke cookie lalu alamatnya dibersihkan (modal klaim muncul di halaman tujuan).
  if (voucherParam !== null) {
    const bersih = request.nextUrl.clone();
    bersih.searchParams.delete("voucher");
    return pasangVoucher(pasangRef(NextResponse.redirect(bersih)));
  }
  if (isApi && request.method !== "GET" && request.method !== "HEAD" && !asalSama(request)) {
    return NextResponse.json({ error: bahasa === "en" ? "Invalid request." : "Permintaan tidak valid." }, { status: 403 });
  }
  return pasangRef(lanjut());
}

// Ikon aplikasi (src/app/icon.svg, apple-icon.png) harus terbuka tanpa login: dipakai tab peramban & layar utama HP.
// public/email/ juga: ikon di email (dimuat aplikasi email tanpa sesi).
// sw.js (service worker push admin), admin.webmanifest, dan ikonnya diambil browser di luar halaman: tanpa pemeriksaan sesi.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|robots.txt|email/|sw.js|admin.webmanifest|icon-192.png|icon-512.png|badge-96.png).*)"],
};
