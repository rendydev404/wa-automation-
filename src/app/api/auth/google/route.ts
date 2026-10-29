import { NextResponse } from "next/server";
import { terlaluSering } from "@/lib/batas";
import { COOKIE_GOOGLE, asal, googleSiap, mulaiGoogle } from "@/lib/google";

/** Mulai masuk dengan Google: simpan state/PKCE/nonce di cookie sementara, lalu alihkan ke Google. */
export async function GET(req: Request) {
  const app = asal(req);
  if (!googleSiap()) return NextResponse.redirect(`${app}/login?galat=belum`);
  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (terlaluSering(`google:${ip}`, 20, 5 * 60_000)) return NextResponse.redirect(`${app}/login?galat=sering`);

  const { url, cookie } = mulaiGoogle(app);
  const res = NextResponse.redirect(url);
  res.cookies.set(COOKIE_GOOGLE, cookie, {
    httpOnly: true,
    secure: app.startsWith("https://"),
    sameSite: "lax", // cookie harus ikut saat Google mengalihkan kembali (navigasi tingkat atas)
    path: "/api/auth/google",
    maxAge: 600,
  });
  return res;
}
