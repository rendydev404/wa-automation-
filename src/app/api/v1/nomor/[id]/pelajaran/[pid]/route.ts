import { hapusPelajaran } from "@/lib/pelajaran";
import { aman, bukanKonteks, galat, idJalur, nomorAtau404, ok, otorisasi } from "@/lib/mesin/api";

type Ctx = { params: Promise<{ id: string; pid: string }> };

/** DELETE /api/v1/nomor/{id}/pelajaran/{pid}: hapus satu pelajaran. */
export async function DELETE(req: Request, ctx: Ctx) {
  const k = await otorisasi(req, "pelajaran");
  if (bukanKonteks(k)) return k;
  return aman(k, async () => {
    const { id, pid } = await ctx.params;
    const n = await nomorAtau404(id, k);
    if (n instanceof Response) return n;
    const p = idJalur(pid);
    if (!p || !(await hapusPelajaran(n.id, p))) return galat("tidak_ditemukan", "Pelajaran tidak ditemukan.", k.id, k.kepala);
    return ok({ ok: true }, k);
  });
}
