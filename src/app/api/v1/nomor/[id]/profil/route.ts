import { WaError, fotoProfilSendiri, infoSesi } from "@/lib/wa";
import { aman, bukanKonteks, galat, nomorAtau404, ok, otorisasi, statusNomorApi } from "@/lib/mesin/api";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/v1/nomor/{id}/profil -> {wa_id, nama_wa, status, foto_url} (foto_url = tautan sementara dari WhatsApp). */
export async function GET(req: Request, ctx: Ctx) {
  const k = await otorisasi(req, "profil");
  if (bukanKonteks(k)) return k;
  return aman(k, async () => {
    const n = await nomorAtau404((await ctx.params).id, k);
    if (n instanceof Response) return n;
    const sesi = infoSesi(n.sesi);
    if (sesi.status !== "WORKING") return galat("nomor_belum_terhubung", "Nomor ini belum terhubung ke WhatsApp.", k.id, k.kepala);
    let foto: string | null;
    try {
      foto = await fotoProfilSendiri(n.sesi);
    } catch (e) {
      if (e instanceof WaError) return galat("nomor_belum_terhubung", e.message, k.id, k.kepala);
      throw e;
    }
    return ok({ wa_id: sesi.waId ?? n.wa_id, nama_wa: sesi.nama ?? n.nama_wa, status: statusNomorApi(sesi.status), foto_url: foto }, k);
  });
}
