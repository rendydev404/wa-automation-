import "server-only";
import { headers } from "next/headers";

/**
 * Pembatas percobaan di memori (satu proses: sesi WhatsApp juga hanya hidup di satu proses).
 * Jendela tetap per kunci; peta dikosongkan bila terlalu besar supaya memori tidak tumbuh tanpa batas.
 */
const g = globalThis as unknown as { __waBatas?: Map<string, { n: number; mulai: number }> };
const peta = (g.__waBatas ??= new Map());

/** true = sudah melewati batas `maks` dalam `jendelaMs` (percobaan ini ikut dihitung). */
export function terlaluSering(kunci: string, maks: number, jendelaMs: number): boolean {
  const kini = Date.now();
  const p = peta.get(kunci);
  if (!p || kini - p.mulai > jendelaMs) {
    if (peta.size > 20_000) peta.clear();
    peta.set(kunci, { n: 1, mulai: kini });
    return false;
  }
  p.n += 1;
  return p.n > maks;
}

/** IP klien dari proxy depan (Cloudflare / reverse proxy). */
export async function ipKlien(): Promise<string> {
  const h = await headers();
  return h.get("cf-connecting-ip") || h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export async function lewatHttps(): Promise<boolean> {
  return ((await headers()).get("x-forwarded-proto") ?? "http").startsWith("https");
}
