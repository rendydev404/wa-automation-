import { aman, bukanKonteks, galat, idJalur, ok, otorisasi } from "@/lib/mesin/api";
import { pesanById } from "@/lib/mesin/antrean";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/v1/pesan/{id}: status pesan API (antre / terkirim / dibaca / gagal + alasan). */
export async function GET(req: Request, ctx: Ctx) {
  const k = await otorisasi(req, "pesan.kirim");
  if (bukanKonteks(k)) return k;
  return aman(k, async () => {
    const id = idJalur((await ctx.params).id);
    const p = id ? await pesanById(id) : undefined;
    if (!p) return galat("tidak_ditemukan", "Pesan tidak ditemukan.", k.id, k.kepala);
    return ok({ id: String(p.id), nomor_id: String(p.number_id), ke: p.ke, status: p.status, alasan: p.alasan, dibuat: p.dibuat, berubah: p.berubah }, k);
  });
}
