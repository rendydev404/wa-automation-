import { hapusDokumen, teksDokumen } from "@/lib/knowledge";
import { aman, bukanKonteks, galat, idJalur, nomorAtau404, ok, otorisasi } from "@/lib/mesin/api";

type Ctx = { params: Promise<{ id: string; dok: string }> };

/** GET /api/v1/nomor/{id}/knowledge/{dok}: isi teks satu dokumen. */
export async function GET(req: Request, ctx: Ctx) {
  const k = await otorisasi(req, "knowledge");
  if (bukanKonteks(k)) return k;
  return aman(k, async () => {
    const p = await ctx.params;
    const n = await nomorAtau404(p.id, k);
    if (n instanceof Response) return n;
    const id = idJalur(p.dok);
    const d = id ? await teksDokumen(id, n.id, false) : null;
    if (!d || !id) return galat("tidak_ditemukan", "Dokumen tidak ditemukan.", k.id, k.kepala);
    return ok({ id: String(id), judul: d.judul, teks: d.teks }, k);
  });
}

/** DELETE /api/v1/nomor/{id}/knowledge/{dok} */
export async function DELETE(req: Request, ctx: Ctx) {
  const k = await otorisasi(req, "knowledge");
  if (bukanKonteks(k)) return k;
  return aman(k, async () => {
    const p = await ctx.params;
    const n = await nomorAtau404(p.id, k);
    if (n instanceof Response) return n;
    const id = idJalur(p.dok);
    if (!id || !(await teksDokumen(id, n.id, false))) return galat("tidak_ditemukan", "Dokumen tidak ditemukan.", k.id, k.kepala);
    await hapusDokumen(id, n.id, false);
    return ok({ ok: true }, k);
  });
}
