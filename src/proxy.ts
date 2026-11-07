import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { COOKIE_REF, UMUR_COOKIE_REF, normalkanKodeRef } from "@/lib/afiliasi-def";
import { type Bahasa, HEADER_BAHASA, bahasaSah, tautan, urai } from "@/lib/bahasa";
import { jalurLanjut } from "@/lib/lanjut";

// /api/sinkron dipanggil database (bukan browser); keabsahannya dicek lewat tanda tangan HMAC di handler-nya.
// "/" = landing page publik; /api/auth/google* = masuk dengan Google (sebelum ada sesi);
// /api/midtrans/notifikasi = webhook Midtrans (keabsahan dicek lewat tanda tangan SHA-512 + status ulang dari API).
// /api/analitik = event analitik dari browser, juga pengunjung yang belum login (handler-nya sendiri memeriksa Origin,
// tanda tangan cookie sesi, ukuran, dan batas laju).
const BERKAS_STATIS = /\.(?:png|jpe?g|webp|avif|gif|svg|ico|mp4|webm|woff2?)$/i;
const PUBLIK = new Set(["/", "/program-afiliasi", "/api/health", "/api/pendaftar", "/api/sinkron", "/api/auth/google", "/api/auth/google/callback", "/api/midtrans/notifikasi", "/api/analitik"]);

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

  if (PUBLIK.has(pathname)) return pasangRef(lanjut());
  // Berkas statis dari public/ (logo, logo bank, maskot, ikon) memang publik: tanpa ini pengunjung yang belum login
  // dialihkan ke /login dan gambarnya rusak di landing page. Hanya ekstensi media/font, dan bukan /api.
  if (!isApi && BERKAS_STATIS.test(pathname)) return lanjut();

  const sesi = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  // /login, /daftar & /lupa-password selalu diteruskan: cookie yang sah tanda tangannya belum tentu masih berlaku di database
  // (mis. password diganti, akun diblokir), dan mengalihkannya dari sini akan memutar tanpa henti.
  if (pathname === "/login" || pathname === "/daftar" || pathname === "/lupa-password") return pasangRef(lanjut());
  if (!sesi) {
    if (isApi) {
      const pesan = bahasa === "en" ? "Your session has ended. Please sign in again." : "Sesi berakhir. Silakan login kembali.";
      return NextResponse.json({ error: pesan }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    // Halaman yang dibuka (mis. /trial-habis dari tautan WhatsApp) dibawa ke /login supaya setelah masuk kembali ke sana.
    const tujuan = new URL(href("/login"), request.url);
    const asal = pathname + search;
    if (pathname !== "/" && request.method === "GET" && jalurLanjut(asal)) tujuan.searchParams.set("lanjut", asal);
    return pasangRef(NextResponse.redirect(tujuan));
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
