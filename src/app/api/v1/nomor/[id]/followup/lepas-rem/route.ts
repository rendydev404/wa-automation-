import { lepasRemNomor } from "@/lib/followup-usaha";
import { aman, bukanKonteks, nomorAtau404, ok, otorisasi } from "@/lib/mesin/api";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/nomor/{id}/followup/lepas-rem: lepas rem follow-up nomor (dipasang otomatis saat ada tanda pembatasan
 * WhatsApp). Kiriman sebelum rem dilepas tidak dihitung lagi.
 */
export async function POST(req: Request, ctx: Ctx) {
  const k = await otorisasi(req, "followup");
  if (bukanKonteks(k)) return k;
  return aman(k, async () => {
    const n = await nomorAtau404((await ctx.params).id, k);
    if (n instanceof Response) return n;
    await lepasRemNomor(n.id);
    return ok({ ok: true, rem: null }, k);
  });
}
