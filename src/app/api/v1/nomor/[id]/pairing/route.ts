import { WaError, mintaKodePairing } from "@/lib/wa";
import { aman, bacaJson, bukanKonteks, galat, nomorAtau404, ok, otorisasi } from "@/lib/mesin/api";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/v1/nomor/{id}/pairing {nomor_hp}: kode tautan 8 karakter (alternatif QR, "Tautkan dengan nomor telepon"). */
export async function POST(req: Request, ctx: Ctx) {
  const k = await otorisasi(req, "nomor");
  if (bukanKonteks(k)) return k;
  const b = await bacaJson(req, k);
  if (!("teks" in b)) return b;
  return aman(k, async () => {
    const n = await nomorAtau404((await ctx.params).id, k);
    if (n instanceof Response) return n;
    try {
      const kode = await mintaKodePairing(n.sesi, String(b.data.nomor_hp ?? ""));
      return ok({ kode }, k);
    } catch (e) {
      if (e instanceof WaError) {
        const sudah = /sudah terhubung/i.test(e.message);
        return galat(sudah ? "isian_tidak_sah" : /tidak valid/i.test(e.message) ? "isian_tidak_sah" : "wa_sedang_menyambung", e.message, k.id, k.kepala);
      }
      throw e;
    }
  });
}
