import { daftarPercakapan } from "@/lib/percakapan";
import { aman, bukanKonteks, galat, nomorAtau404, ok, otorisasi } from "@/lib/mesin/api";
import { percakapanApi } from "./umum";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/nomor/{id}/percakapan?batas=25&setelah=<kursor>&cari=&filter=semua|bot|manusia
 *   -> { data: Percakapan[], berikutnya: string | null }. Terbaru dulu; kursor `<terakhir_pada>_<id>` (tanpa OFFSET,
 *   memakai indeks percakapan_nomor_waktu_idx).
 */
export async function GET(req: Request, ctx: Ctx) {
  const k = await otorisasi(req, "percakapan");
  if (bukanKonteks(k)) return k;
  return aman(k, async () => {
    const n = await nomorAtau404((await ctx.params).id, k);
    if (n instanceof Response) return n;
    const url = new URL(req.url);
    const b = Number(url.searchParams.get("batas") ?? 25);
    const filter = url.searchParams.get("filter") ?? "semua";
    if (filter !== "semua" && filter !== "bot" && filter !== "manusia") return galat("isian_tidak_sah", "`filter` harus semua, bot, atau manusia.", k.id, k.kepala);
    const kursor = url.searchParams.get("setelah");
    let sebelumWaktu: number | undefined;
    let sebelumId: number | undefined;
    if (kursor) {
      const m = /^(\d{1,12})_(\d{1,12})$/.exec(kursor);
      if (!m) return galat("isian_tidak_sah", "`setelah` harus kursor dari jawaban sebelumnya.", k.id, k.kepala);
      sebelumWaktu = Number(m[1]);
      sebelumId = Number(m[2]);
    }
    const { daftar, adaLagi } = await daftarPercakapan(n.id, {
      filter,
      cari: url.searchParams.get("cari") ?? "",
      sebelumWaktu,
      sebelumId,
      batas: Number.isInteger(b) ? Math.min(Math.max(b, 1), 50) : 25,
    });
    const akhir = daftar.at(-1);
    return ok({ data: daftar.map((p) => percakapanApi(p)), berikutnya: adaLagi && akhir ? `${akhir.terakhir_pada}_${akhir.id}` : null }, k);
  });
}
