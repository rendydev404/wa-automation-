import { simpanDrafUsaha } from "@/lib/followup-usaha";
import { aman, bacaJson, bukanKonteks, galat, nomorAtau404, ok, otorisasi } from "@/lib/mesin/api";
import { galatLayanan, jenisSah, kunciSah, salahJenis } from "@/lib/mesin/api-followup";

type Ctx = { params: Promise<{ id: string; kunci: string }> };

/** PUT /api/v1/nomor/{id}/followup/antrean/{kunci}/draf {jenis, teks}: ganti pesan berikutnya (dikirim persis, tanpa tautan). */
export async function PUT(req: Request, ctx: Ctx) {
  const k = await otorisasi(req, "followup");
  if (bukanKonteks(k)) return k;
  const b = await bacaJson(req, k);
  if (!("teks" in b)) return b;
  return aman(k, async () => {
    const p = await ctx.params;
    const n = await nomorAtau404(p.id, k);
    if (n instanceof Response) return n;
    if (!kunciSah(p.kunci)) return galat("tidak_ditemukan", "Chat tidak ditemukan.", k.id, k.kepala);
    const { jenis, teks } = b.data;
    if (!jenisSah(jenis)) return salahJenis(k);
    if (typeof teks !== "string") return galat("isian_tidak_sah", "teks wajib berupa teks.", k.id, k.kepala);
    try {
      await simpanDrafUsaha(n.id, jenis, p.kunci, teks);
    } catch (e) {
      return galatLayanan(e, k);
    }
    return ok({ ok: true, jenis, kunci: p.kunci }, k);
  });
}
