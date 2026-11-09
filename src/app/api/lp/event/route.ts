import { ipKlien, terlaluSering } from "@/lib/batas";
import { SLUG_LP } from "@/lib/lp/def";
import { kirimCapiEvent } from "@/lib/meta-pixel";
import type { KunciEventMeta } from "@/lib/meta-pixel-def";
import { konteksMetaPermintaan } from "@/lib/meta-pixel-konteks";

/**
 * Event landing page industri ke Meta Conversions API (server), dipanggil lp/aset/lp.js lewat sendBeacon dengan
 * event_id yang sama dengan Pixel browser supaya Meta menghitungnya sekali. Publik (pengunjung belum login), dibatasi
 * per IP; data pencocokan (IP, user agent, _fbp, _fbc) diambil dari permintaan ini. Selalu 204: pengunjung tidak
 * perlu tahu hasilnya, kegagalan Meta dicatat di log oleh kirimCapiEvent.
 */
const PETA: Record<string, KunciEventMeta> = { PageView: "page_view", ViewContent: "view_content", InitiateCheckout: "initiate_checkout", Lead: "lead_wa" };
const kosong = () => new Response(null, { status: 204 });

export async function POST(req: Request): Promise<Response> {
  if (terlaluSering(`lpev:${await ipKlien()}`, 60, 60_000)) return kosong();
  const teks = await req.text().catch(() => "");
  if (teks.length > 1000) return kosong();
  let b: Record<string, unknown>;
  try {
    b = JSON.parse(teks) as Record<string, unknown>;
  } catch {
    return kosong();
  }
  const kunci = typeof b.nama === "string" ? PETA[b.nama] : undefined;
  const id = typeof b.id === "string" && /^lp_[a-z0-9]{6,40}$/.test(b.id) ? b.id : null;
  if (!kunci || !id) return kosong();
  const industri = typeof b.industri === "string" && (SLUG_LP as readonly string[]).includes(b.industri) ? b.industri : undefined;
  const nilai = typeof b.nilai === "number" && Number.isFinite(b.nilai) && b.nilai > 0 && b.nilai < 1e9 ? Math.round(b.nilai) : 0;
  const paket = typeof b.paket === "string" && /^[a-z0-9_-]{1,32}$/i.test(b.paket) ? b.paket : undefined;
  const konten = typeof b.konten === "string" ? b.konten.slice(0, 80) : undefined;
  const customData: Record<string, unknown> = {
    ...(industri ? { content_category: industri } : {}),
    ...(konten ? { content_name: konten } : {}),
    ...(kunci === "view_content" ? { content_type: "landing_page" } : {}),
    ...(kunci === "initiate_checkout" ? { value: nilai, currency: "IDR", ...(paket ? { content_ids: [paket] } : {}) } : {}),
  };
  void kirimCapiEvent({ ...(await konteksMetaPermintaan()), kunci, eventId: id, ...(Object.keys(customData).length ? { customData } : {}) });
  return kosong();
}
