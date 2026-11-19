import { tulisUlangDrafUsaha } from "@/lib/followup-usaha";
import { PenggunaError } from "@/lib/pengguna";
import { aman, bacaJson, bukanKonteks, galat, hitungLaju, nomorAtau404, ok, otorisasi } from "@/lib/mesin/api";
import { jenisSah, kunciSah, salahJenis } from "@/lib/mesin/api-followup";

type Ctx = { params: Promise<{ id: string; kunci: string }> };

/** Tulis ulang = satu panggilan AI: dibatasi per key per menit. */
const PER_MENIT = Math.max(1, Number(process.env.API_TULIS_ULANG_PER_MENIT) || 10);

/** POST /api/v1/nomor/{id}/followup/antrean/{kunci}/tulis-ulang {jenis}: AI menulis ulang draf pesan berikutnya. */
export async function POST(req: Request, ctx: Ctx) {
  const k = await otorisasi(req, "followup");
  if (bukanKonteks(k)) return k;
  const laju = hitungLaju(`followup-tulis:${k.awalan}`, PER_MENIT, 60_000);
  if (!laju.boleh) return galat("terlalu_sering", `Maks ${PER_MENIT} tulis ulang per menit per key.`, k.id, laju.kepala);
  const b = await bacaJson(req, k);
  if (!("teks" in b)) return b;
  return aman(k, async () => {
    const p = await ctx.params;
    const n = await nomorAtau404(p.id, k);
    if (n instanceof Response) return n;
    if (!kunciSah(p.kunci)) return galat("tidak_ditemukan", "Chat tidak ditemukan.", k.id, k.kepala);
    const { jenis } = b.data;
    if (!jenisSah(jenis)) return salahJenis(k);
    try {
      const draf = await tulisUlangDrafUsaha(n.id, jenis, p.kunci);
      return ok({ jenis, kunci: p.kunci, draf }, k);
    } catch (e) {
      if (e instanceof PenggunaError) return galat("isian_tidak_sah", e.message, k.id, k.kepala);
      console.error(`[api ${k.id}] tulis ulang follow-up gagal: ${e instanceof Error ? e.message : e}`);
      return galat("ai_tidak_tersedia", "AI sedang tidak bisa menulis ulang pesan. Coba lagi sebentar lagi.", k.id, k.kepala);
    }
  });
}
