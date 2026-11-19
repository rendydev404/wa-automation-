import { daftarUsaha } from "@/lib/followup-usaha";
import { aman, bukanKonteks, nomorAtau404, ok, otorisasi } from "@/lib/mesin/api";
import { barisFollowupApi, jenisSah, salahJenis } from "@/lib/mesin/api-followup";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/nomor/{id}/followup/antrean?jenis=prospek|ulang&batas=1–100 (bawaan 50): antrean & riwayat follow-up,
 * terbaru dulu (diperbarui DESC, kunci DESC). Tanpa `jenis` = prospek + order ulang digabung.
 */
export async function GET(req: Request, ctx: Ctx) {
  const k = await otorisasi(req, "followup");
  if (bukanKonteks(k)) return k;
  return aman(k, async () => {
    const n = await nomorAtau404((await ctx.params).id, k);
    if (n instanceof Response) return n;
    const url = new URL(req.url);
    const jenis = url.searchParams.get("jenis");
    if (jenis !== null && !jenisSah(jenis)) return salahJenis(k);
    const b = Number(url.searchParams.get("batas") ?? 50);
    const batas = Number.isInteger(b) ? Math.min(Math.max(b, 1), 100) : 50;
    // Disaring per jenis: ambil jatah penuh supaya baris jenis lain yang lebih baru tidak memotong hasil.
    const baris = jenis ? await daftarUsaha(n.id, batas, jenis) : await daftarUsaha(n.id, batas);
    return ok({ data: baris.map(barisFollowupApi) }, k);
  });
}
