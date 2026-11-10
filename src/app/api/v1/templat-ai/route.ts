import { TEMPLAT_AI } from "@/lib/templat-ai-def";
import { bukanKonteks, ok, otorisasi } from "@/lib/mesin/api";

/** GET /api/v1/templat-ai: daftar template instruksi bot per jenis usaha (isi lewat GET /templat-ai/{slug}). */
export async function GET(req: Request) {
  const k = await otorisasi(req, "templat");
  if (bukanKonteks(k)) return k;
  return ok({ data: TEMPLAT_AI.map((t) => ({ slug: t.slug, nama: t.label, nama_en: t.labelEn })) }, k);
}
