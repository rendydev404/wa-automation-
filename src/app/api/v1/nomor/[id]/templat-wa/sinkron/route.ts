import { sinkronTemplat } from "@/lib/wa-resmi";
import { aman, bukanKonteks, nomorAtau404, ok, otorisasi } from "@/lib/mesin/api";
import { galatBukanResmi, galatLayanan, templatApi } from "@/lib/mesin/api-followup";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/v1/nomor/{id}/templat-wa/sinkron: tarik status semua template dari Meta (webhook templat.status tetap jalur utama). */
export async function POST(req: Request, ctx: Ctx) {
  const k = await otorisasi(req, "wa.resmi");
  if (bukanKonteks(k)) return k;
  return aman(k, async () => {
    const n = await nomorAtau404((await ctx.params).id, k);
    if (n instanceof Response) return n;
    if (n.jalur !== "resmi") return galatBukanResmi(k);
    try {
      return ok({ data: (await sinkronTemplat(n.id)).map(templatApi) }, k);
    } catch (e) {
      return galatLayanan(e, k);
    }
  });
}
