import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

// /api/sinkron dipanggil database (bukan browser); keabsahannya dicek lewat tanda tangan HMAC di handler-nya.
// "/" = landing page publik; /api/auth/google* = masuk dengan Google (sebelum ada sesi).
const PUBLIK = new Set(["/", "/api/health", "/api/sinkron", "/api/auth/google", "/api/auth/google/callback"]);

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

/** Pemeriksaan optimistis (tanda tangan + masa berlaku). Otorisasi penuh ada di tiap aksi/handler. */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIK.has(pathname)) return NextResponse.next();

  const sesi = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  const isApi = pathname.startsWith("/api/");

  // /login & /daftar selalu diteruskan: cookie yang sah tanda tangannya belum tentu masih berlaku di database
  // (mis. password diganti, akun diblokir), dan mengalihkannya dari sini akan memutar tanpa henti.
  if (pathname === "/login" || pathname === "/daftar") return NextResponse.next();
  if (!sesi) {
    if (isApi) return NextResponse.json({ error: "Sesi berakhir. Silakan login kembali." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (isApi && request.method !== "GET" && request.method !== "HEAD" && !asalSama(request)) {
    return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
