import type { NextRequest } from "next/server";
import { terimaKiriman } from "@/lib/analitik";
import { MAKS_BYTE_KIRIM } from "@/lib/analitik-def";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { ipKlien } from "@/lib/batas";

/**
 * Penerima event analitik dari browser (src/instrumentation-client.ts, lewat sendBeacon). Publik (PUBLIK di proxy.ts):
 * pengunjung yang belum login ikut tercatat untuk halaman publik. Identitas dari cookie sesi yang diverifikasi tanda
 * tangannya saja (tanpa query database); pengolahan & semua batas ada di terimaKiriman (src/lib/analitik.ts).
 * Balasan selalu tanpa badan dan tidak disimpan cache.
 */

const balas = (status: number): Response => new Response(null, { status, headers: { "Cache-Control": "no-store" } });

/** Asal sama dengan host aplikasi (proxy tidak memeriksanya untuk jalur PUBLIK). Tanpa Origin = klien non-browser. */
function asalSama(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0].trim().toLowerCase();
    return new URL(origin).host.toLowerCase() === host;
  } catch {
    return false;
  }
}

/** Badan sebagai teks, berhenti membaca begitu melewati `maks` byte (juga untuk kiriman tanpa Content-Length). */
async function bacaTerbatas(req: NextRequest, maks: number): Promise<string | null> {
  if (!req.body) return "";
  const pembaca = req.body.getReader();
  const potong: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await pembaca.read();
    if (done) break;
    n += value.byteLength;
    if (n > maks) {
      void pembaca.cancel().catch(() => {});
      return null;
    }
    potong.push(value);
  }
  return Buffer.concat(potong, n).toString("utf8");
}

export async function POST(req: NextRequest) {
  if (!asalSama(req)) return balas(403);
  if (Number(req.headers.get("content-length") ?? 0) > MAKS_BYTE_KIRIM) return balas(413);
  let teks: string | null;
  try {
    teks = await bacaTerbatas(req, MAKS_BYTE_KIRIM);
  } catch {
    return balas(400); // kiriman terputus di tengah jalan
  }
  if (teks === null) return balas(413);
  const [sesi, ip] = await Promise.all([verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value), ipKlien()]);
  return balas(terimaKiriman({ teks, userId: sesi?.uid ?? null, ip }).status);
}
