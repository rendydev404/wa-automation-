/**
 * Sesi login berbasis cookie bertanda tangan (HMAC-SHA256, Web Crypto) — aman dipakai di proxy
 * maupun route handler, tanpa dependensi. Env: AUTH_SECRET (acak, >= 32 karakter).
 */

export const SESSION_COOKIE = "wa_sesi";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 hari

export interface SessionPayload {
  uid: number;
  exp: number; // detik epoch
  pv: string; // sidik jari hash password: ganti password = sesi lama batal
}

const enc = new TextEncoder();

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function authConfigured(): boolean {
  return (process.env.AUTH_SECRET?.length ?? 0) >= 32;
}

function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(process.env.AUTH_SECRET ?? ""), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function passwordFingerprint(passwordHash: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(passwordHash));
  return b64urlEncode(new Uint8Array(digest)).slice(0, 16);
}

export async function createSessionToken(userId: number, passwordHash: string): Promise<string> {
  const payload: SessionPayload = {
    uid: userId,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
    pv: await passwordFingerprint(passwordHash),
  };
  const body = b64urlEncode(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(body));
  return `${body}.${b64urlEncode(new Uint8Array(sig))}`;
}

/** Periksa tanda tangan & masa berlaku. Tidak menyentuh database (dipakai proxy). */
export async function verifySessionToken(token: string | undefined): Promise<SessionPayload | null> {
  if (!token || !authConfigured()) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(), b64urlDecode(sig), enc.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as SessionPayload;
    if (typeof payload.uid !== "number" || typeof payload.exp !== "number") return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
