import { NextResponse } from "next/server";
import { KAMPANYE, kirimUji, kunciPemicuSah, mulaiKampanye, statusKampanye } from "@/lib/email-promo";

/**
 * Pemicu kampanye email (lib/email-promo.ts), hanya dari dalam server: header `x-kunci` = HMAC dari AUTH_SECRET, jadi
 * rahasianya tidak pernah keluar dari server (dipanggil lewat curl ke 127.0.0.1 di VPS). Tanpa kunci = 404.
 *   GET  ?kode=...                          -> status (sisa penerima, terkirim, gagal)
 *   POST {kode, uji: "email@..."}           -> satu email uji
 *   POST {kode, kirim: true}                -> mulai/lanjutkan kirim ke semua penerima, dicicil di latar
 */

const tidakAda = () => NextResponse.json({ error: "Tidak ditemukan." }, { status: 404 });

export async function GET(req: Request) {
  if (!kunciPemicuSah(req.headers.get("x-kunci"))) return tidakAda();
  const kode = new URL(req.url).searchParams.get("kode") ?? "";
  if (!KAMPANYE[kode]) return NextResponse.json({ error: "Kampanye tidak dikenal.", ada: Object.keys(KAMPANYE) }, { status: 400 });
  return NextResponse.json(await statusKampanye(kode));
}

export async function POST(req: Request) {
  if (!kunciPemicuSah(req.headers.get("x-kunci"))) return tidakAda();
  const b = (await req.json().catch(() => null)) as { kode?: string; uji?: string; kirim?: boolean } | null;
  const kode = b?.kode ?? "";
  if (!KAMPANYE[kode]) return NextResponse.json({ error: "Kampanye tidak dikenal." }, { status: 400 });
  if (b?.uji) {
    try {
      await kirimUji(kode, b.uji);
      return NextResponse.json({ ok: true, uji: b.uji });
    } catch (e) {
      return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  }
  if (b?.kirim) return NextResponse.json({ ok: mulaiKampanye(kode), status: await statusKampanye(kode) });
  return NextResponse.json({ error: "Isi `uji` atau `kirim`." }, { status: 400 });
}
