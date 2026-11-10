import { logout } from "@/lib/wa";
import { aman, bukanKonteks, nomorAtau404, ok, otorisasi } from "@/lib/mesin/api";

type Ctx = { params: Promise<{ id: string }> };

/**
 * DELETE /api/v1/nomor/{id}/sesi: logout WhatsApp (perangkat tertaut dicabut). Ini SATU-SATUNYA cara API memutus
 * nomor; lisensi, update, dan restart tidak pernah memutus koneksi WhatsApp. Nomornya tetap ada (bisa ditautkan lagi).
 */
export async function DELETE(req: Request, ctx: Ctx) {
  const k = await otorisasi(req, "nomor");
  if (bukanKonteks(k)) return k;
  return aman(k, async () => {
    const n = await nomorAtau404((await ctx.params).id, k);
    if (n instanceof Response) return n;
    await logout(n.sesi);
    return ok({ ok: true }, k);
  });
}
