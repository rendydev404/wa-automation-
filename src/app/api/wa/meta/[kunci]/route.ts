import { NextResponse } from "next/server";
import { terimaWebhook, verifikasiWebhook } from "@/lib/wa-resmi";

/**
 * Webhook WhatsApp Cloud API (Meta) untuk satu nomor resmi: /api/wa/meta/{kunci_webhook}.
 * Publik (tanpa cookie, lihat proxy.ts): keabsahan dari X-Hub-Signature-256 (HMAC app secret nomor itu).
 *   GET  = jabat tangan saat webhook dipasang di App Dashboard (hub.mode, hub.verify_token, hub.challenge).
 *   POST = pesan masuk, status kiriman, status template, kualitas nomor. Dijawab secepatnya; proses di latar.
 */
const MAKS_BODY = 1024 * 1024;
const tanpaCache = { "Cache-Control": "no-store" };

export async function GET(req: Request, ctx: { params: Promise<{ kunci: string }> }) {
  const { kunci } = await ctx.params;
  const q = new URL(req.url).searchParams;
  const tantangan = await verifikasiWebhook(kunci, q.get("hub.mode"), q.get("hub.verify_token"), q.get("hub.challenge")).catch(() => null);
  if (!tantangan) return new NextResponse("forbidden", { status: 403, headers: tanpaCache });
  return new NextResponse(tantangan, { status: 200, headers: { ...tanpaCache, "Content-Type": "text/plain" } });
}

export async function POST(req: Request, ctx: { params: Promise<{ kunci: string }> }) {
  const { kunci } = await ctx.params;
  const panjang = Number(req.headers.get("content-length") ?? 0);
  if (panjang > MAKS_BODY) return NextResponse.json({ error: "terlalu besar" }, { status: 413, headers: tanpaCache });
  const body = await req.text();
  if (body.length > MAKS_BODY) return NextResponse.json({ error: "terlalu besar" }, { status: 413, headers: tanpaCache });
  const kode = await terimaWebhook(kunci, body, req.headers.get("x-hub-signature-256")).catch((e) => {
    console.error("[wa-resmi] webhook gagal:", e instanceof Error ? e.message : e);
    return 500;
  });
  return NextResponse.json({ ok: kode === 200 }, { status: kode, headers: tanpaCache });
}
