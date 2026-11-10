import { bacaTemplat } from "@/lib/templat-ai";
import { TEMPLAT_AI, slugTemplatSah } from "@/lib/templat-ai-def";
import { aman, bukanKonteks, galat, ok, otorisasi } from "@/lib/mesin/api";

type Ctx = { params: Promise<{ slug: string }> };

/**
 * GET /api/v1/templat-ai/{slug} -> {slug, nama, teks}: isi template siap dipasang ke PATCH /nomor/{id}/bot {instruksi}.
 * Teks berisi penanda [ ... ] yang wajib diganti data usaha sebelum dipakai.
 */
export async function GET(req: Request, ctx: Ctx) {
  const k = await otorisasi(req, "templat");
  if (bukanKonteks(k)) return k;
  return aman(k, async () => {
    const { slug } = await ctx.params;
    if (!slugTemplatSah(slug)) return galat("tidak_ditemukan", "Template tidak ditemukan. Lihat GET /templat-ai.", k.id, k.kepala);
    const t = TEMPLAT_AI.find((x) => x.slug === slug);
    return ok({ slug, nama: t?.label ?? slug, teks: await bacaTemplat(slug) }, k);
  });
}
