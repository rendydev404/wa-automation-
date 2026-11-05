import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Masuk dengan Google: OAuth 2.0 / OpenID Connect, alur authorization code + PKCE, tanpa dependensi.
 * Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, dan APP_URL (alamat publik, mis. https://wa.contoh.id) bila
 * aplikasi berada di balik proxy yang tidak meneruskan host aslinya.
 * Redirect URI yang didaftarkan di Google Cloud: <APP_URL>/api/auth/google/callback
 */

export const COOKIE_GOOGLE = "wa_google";
/** Bahasa halaman asal saat mulai masuk dengan Google ("id" | "en"). */
export const COOKIE_GOOGLE_BAHASA = "wa_google_bahasa";
export const JALUR_CALLBACK = "/api/auth/google/callback";

export function googleSiap(): boolean {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
}

/** Alamat publik aplikasi: APP_URL, atau host & protokol dari proxy depan. */
export function asal(req: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  const u = new URL(req.url);
  const host = req.headers.get("x-forwarded-host")?.split(",")[0].trim() || req.headers.get("host") || u.host;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() || u.protocol.replace(":", "");
  return `${proto}://${host}`;
}

const acak = (n = 32) => randomBytes(n).toString("base64url");

/** URL halaman persetujuan Google + nilai rahasia sekali pakai yang disimpan di cookie sampai callback. */
export function mulaiGoogle(asalApp: string) {
  const state = acak();
  const verifier = acak(48);
  const nonce = acak();
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: asalApp + JALUR_CALLBACK,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${q}`, cookie: `${state}.${verifier}.${nonce}` };
}

export class GoogleError extends Error {}

const sama = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Tukar `code` dengan token lalu ambil identitasnya. id_token diterima langsung dari endpoint token Google
 * lewat TLS dengan client secret, jadi klaimnya boleh dipercaya tanpa memeriksa tanda tangan (OIDC Core 3.1.3.7);
 * aud, iss, exp, nonce, dan email_verified tetap diperiksa.
 */
export async function selesaikanGoogle(asalApp: string, query: URLSearchParams, cookie: string | undefined) {
  const [state, verifier, nonce] = (cookie ?? "").split(".");
  const stateQ = query.get("state") ?? "";
  if (!state || !verifier || !nonce || !sama(state, stateQ)) throw new GoogleError("sesi");
  if (query.get("error")) throw new GoogleError(query.get("error") === "access_denied" ? "batal" : "google");
  const code = query.get("code");
  if (!code) throw new GoogleError("google");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: asalApp + JALUR_CALLBACK,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) throw new GoogleError("google");
  const { id_token } = (await res.json()) as { id_token?: string };
  const klaim = JSON.parse(Buffer.from(id_token?.split(".")[1] ?? "", "base64url").toString("utf8") || "{}") as {
    iss?: string;
    aud?: string;
    exp?: number;
    nonce?: string;
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
  };
  if (klaim.aud !== process.env.GOOGLE_CLIENT_ID) throw new GoogleError("google");
  if (klaim.iss !== "https://accounts.google.com" && klaim.iss !== "accounts.google.com") throw new GoogleError("google");
  if (!klaim.exp || klaim.exp * 1000 < Date.now()) throw new GoogleError("google");
  if (!klaim.nonce || !sama(klaim.nonce, nonce)) throw new GoogleError("sesi");
  if (!klaim.sub || !klaim.email || klaim.email_verified !== true) throw new GoogleError("email");
  return { sub: klaim.sub, email: klaim.email.toLowerCase(), nama: (klaim.name ?? "").trim() || klaim.email.split("@")[0] };
}
