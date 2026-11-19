import { hentikanUsaha } from "@/lib/followup-usaha";
import { aman, bacaJson, bukanKonteks, galat, nomorAtau404, ok, otorisasi } from "@/lib/mesin/api";
import { galatLayanan, jenisSah, kunciSah, salahJenis } from "@/lib/mesin/api-followup";

type Ctx = { params: Promise<{ id: string; kunci: string }> };

/** POST /api/v1/nomor/{id}/followup/antrean/{kunci}/hentikan {jenis}: chat ini tidak dikirimi follow-up lagi di siklus ini. */
export async function POST(req: Request, ctx: Ctx) {
  const k = await otorisasi(req, "followup");
  if (bukanKonteks(k)) return k;
  const b = await bacaJson(req, k);
  if (!("teks" in b)) return b;
  return aman(k, async () => {
    const p = await ctx.params;
    const n = await nomorAtau404(p.id, k);
    if (n instanceof Response) return n;
    if (!kunciSah(p.kunci)) return galat("tidak_ditemukan", "Chat tidak ditemukan.", k.id, k.kepala);
    const { jenis } = b.data;
    if (!jenisSah(jenis)) return salahJenis(k);
    try {
      await hentikanUsaha(n.id, jenis, p.kunci);
    } catch (e) {
      return galatLayanan(e, k);
    }
    return ok({ ok: true, jenis, kunci: p.kunci }, k);
  });
}
