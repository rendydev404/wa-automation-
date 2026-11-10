import { type ItemPelajaran, daftarPelajaran, hapusPelajaran, jumlahPelajaran } from "@/lib/pelajaran";
import { aman, bukanKonteks, nomorAtau404, ok, otorisasi } from "@/lib/mesin/api";

type Ctx = { params: Promise<{ id: string }> };

const bentukPelajaran = (p: ItemPelajaran) => ({ id: String(p.id), pertanyaan: p.pertanyaan, jawaban: p.jawaban, dipakai: p.kali, terakhir: p.terakhir_pada });

/**
 * GET /api/v1/nomor/{id}/pelajaran?setelah=<kursor>: jawaban admin yang dipelajari AI, terbaru dulu (20 per halaman).
 * `berikutnya` = kursor halaman selanjutnya (null = habis).
 */
export async function GET(req: Request, ctx: Ctx) {
  const k = await otorisasi(req, "pelajaran");
  if (bukanKonteks(k)) return k;
  return aman(k, async () => {
    const n = await nomorAtau404((await ctx.params).id, k);
    if (n instanceof Response) return n;
    const m = /^(\d{1,12})_(\d{1,12})$/.exec(new URL(req.url).searchParams.get("setelah") ?? "");
    const [{ daftar, adaLagi }, total] = await Promise.all([
      daftarPelajaran(n.id, m ? { waktu: Number(m[1]), id: Number(m[2]) } : undefined),
      jumlahPelajaran(n.id),
    ]);
    const akhir = daftar.at(-1);
    return ok({ data: daftar.map(bentukPelajaran), total, berikutnya: adaLagi && akhir ? `${akhir.terakhir_pada}_${akhir.id}` : null }, k);
  });
}

/** DELETE /api/v1/nomor/{id}/pelajaran: hapus SEMUA pelajaran nomor ini -> {dihapus}. */
export async function DELETE(req: Request, ctx: Ctx) {
  const k = await otorisasi(req, "pelajaran");
  if (bukanKonteks(k)) return k;
  return aman(k, async () => {
    const n = await nomorAtau404((await ctx.params).id, k);
    if (n instanceof Response) return n;
    return ok({ dihapus: await hapusPelajaran(n.id) }, k);
  });
}
