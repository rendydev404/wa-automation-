import { WaError, daftarGrup, infoSesi } from "@/lib/wa";
import { aman, bukanKonteks, galat, nomorAtau404, ok, otorisasi } from "@/lib/mesin/api";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/v1/nomor/{id}/grup -> {data: [{id, nama, jumlah_anggota, hanya_admin}]} untuk dipakai sebagai `ke` di POST /pesan. */
export async function GET(req: Request, ctx: Ctx) {
  const k = await otorisasi(req, "pesan.kirim");
  if (bukanKonteks(k)) return k;
  return aman(k, async () => {
    const n = await nomorAtau404((await ctx.params).id, k);
    if (n instanceof Response) return n;
    if (infoSesi(n.sesi).status !== "WORKING") return galat("nomor_belum_terhubung", "Nomor ini belum terhubung ke WhatsApp.", k.id, k.kepala);
    try {
      return ok({ data: await daftarGrup(n.sesi) }, k);
    } catch (e) {
      if (e instanceof WaError) return galat("nomor_belum_terhubung", e.message, k.id, k.kepala);
      throw e;
    }
  });
}
