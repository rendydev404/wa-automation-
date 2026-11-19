import { NAMA_TEMPLAT_POLA } from "@/lib/wa-resmi-def";
import { hapusTemplat } from "@/lib/wa-resmi";
import { aman, bukanKonteks, galat, nomorAtau404, ok, otorisasi } from "@/lib/mesin/api";
import { galatBukanResmi, galatLayanan } from "@/lib/mesin/api-followup";

type Ctx = { params: Promise<{ id: string; nama: string }> };

/** DELETE /api/v1/nomor/{id}/templat-wa/{nama}: hapus template (semua bahasa) dari Meta & daftar nomor. */
export async function DELETE(req: Request, ctx: Ctx) {
  const k = await otorisasi(req, "wa.resmi");
  if (bukanKonteks(k)) return k;
  return aman(k, async () => {
    const p = await ctx.params;
    const n = await nomorAtau404(p.id, k);
    if (n instanceof Response) return n;
    if (!NAMA_TEMPLAT_POLA.test(p.nama)) return galat("isian_tidak_sah", "Nama template hanya huruf kecil, angka, dan garis bawah (maks 100).", k.id, k.kepala);
    if (n.jalur !== "resmi") return galatBukanResmi(k);
    try {
      await hapusTemplat(n.id, p.nama);
    } catch (e) {
      return galatLayanan(e, k);
    }
    return ok({ ok: true }, k);
  });
}
