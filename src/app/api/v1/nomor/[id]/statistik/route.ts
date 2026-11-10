import { statHarian, tanggalWib } from "@/lib/numbers";
import { hariTerakhir } from "@/lib/tren";
import { aman, bukanKonteks, nomorAtau404, ok, otorisasi } from "@/lib/mesin/api";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/nomor/{id}/statistik?hari=30 (1–90): pesan masuk & dibalas bot per hari (WIB), hari tanpa pesan = 0.
 * Satu query ke tabel stats (index number_id, tanggal), tanpa isi pesan.
 */
export async function GET(req: Request, ctx: Ctx) {
  const k = await otorisasi(req, "statistik");
  if (bukanKonteks(k)) return k;
  return aman(k, async () => {
    const n = await nomorAtau404((await ctx.params).id, k);
    if (n instanceof Response) return n;
    const h = Number(new URL(req.url).searchParams.get("hari") ?? 30);
    const hari = hariTerakhir(tanggalWib(), Number.isInteger(h) ? Math.min(Math.max(h, 1), 90) : 30);
    const baris = await statHarian(hari[0], n.id);
    const per = new Map(baris.map((b) => [b.tanggal, b]));
    const data = hari.map((t) => ({ tanggal: t, masuk: per.get(t)?.masuk ?? 0, dibalas: per.get(t)?.dibalas ?? 0 }));
    const total = data.reduce((a, d) => ({ masuk: a.masuk + d.masuk, dibalas: a.dibalas + d.dibalas }), { masuk: 0, dibalas: 0 });
    return ok({ nomor_id: String(n.id), dari: hari[0], sampai: hari.at(-1), total, data }, k);
  });
}
