import { NextResponse } from "next/server";
import { terlaluSering } from "@/lib/batas";
import { COOKIE_GOOGLE, COOKIE_GOOGLE_BAHASA, asal, googleSiap, mulaiGoogle } from "@/lib/google";
import { tautan } from "@/lib/bahasa";
import { bahasaPermintaan } from "@/lib/bahasa-server";

/** Mulai masuk dengan Google: simpan state/PKCE/nonce di cookie sementara, lalu alihkan ke Google. */
export async function GET(req: Request) {
  const app = asal(req);
  const b = await bahasaPermintaan();
  if (!googleSiap()) return NextResponse.redirect(`${app}${tautan(b, "/login?galat=belum")}`);
  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (terlaluSering(`google:${ip}`, 20, 5 * 60_000)) return NextResponse.redirect(`${app}${tautan(b, "/login?galat=sering")}`);

  const { url, cookie } = mulaiGoogle(app);
  const res = NextResponse.redirect(url);
  res.cookies.set(COOKIE_GOOGLE, cookie, {
    httpOnly: true,
    secure: app.startsWith("https://"),
    sameSite: "lax", // cookie harus ikut saat Google mengalihkan kembali (navigasi tingkat atas)
    path: "/api/auth/google",
    maxAge: 600,
  });
  // Bahasa halaman asal: setelah kembali dari Google, pengguna diarahkan ke versi bahasa yang sama.
  res.cookies.set(COOKIE_GOOGLE_BAHASA, b, { httpOnly: true, secure: app.startsWith("https://"), sameSite: "lax", path: "/api/auth/google", maxAge: 600 });
  return res;
}
