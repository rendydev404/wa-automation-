import { rapikanKredensial } from "@/lib/wa-resmi-def";
import { lepasResmi, pasangResmi, statusResmi } from "@/lib/wa-resmi";
import { aman, bacaJson, bukanKonteks, galat, nomorAtau404, ok, otorisasi } from "@/lib/mesin/api";
import { galatLayanan, jalurApi } from "@/lib/mesin/api-followup";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/v1/nomor/{id}/jalur: jalur WhatsApp nomor (baileys/resmi), status Meta (kualitas, tier, kuota), URL webhook. */
export async function GET(req: Request, ctx: Ctx) {
  const k = await otorisasi(req, "wa.resmi");
  if (bukanKonteks(k)) return k;
  return aman(k, async () => {
    const n = await nomorAtau404((await ctx.params).id, k);
    if (n instanceof Response) return n;
    return ok(jalurApi(n.id, await statusResmi(n.id)), k);
  });
}

/**
 * PUT /api/v1/nomor/{id}/jalur
 *  - {jalur:"resmi", phone_number_id, waba_id, token, app_secret, pin?}: kredensial dicek ke Meta, disimpan terenkripsi,
 *    sesi Baileys nomor dilepas. Jawaban {jalur, webhook_url, verify_token, nomor, nama, peringatan} (tanpa token).
 *  - {jalur:"baileys"}: kembali ke QR (kredensial dinonaktifkan, tidak dihapus). Jawaban = GET.
 */
export async function PUT(req: Request, ctx: Ctx) {
  const k = await otorisasi(req, "wa.resmi");
  if (bukanKonteks(k)) return k;
  const b = await bacaJson(req, k);
  if (!("teks" in b)) return b;
  return aman(k, async () => {
    const n = await nomorAtau404((await ctx.params).id, k);
    if (n instanceof Response) return n;
    const jalur = b.data.jalur;
    if (jalur === "baileys") {
      try {
        await lepasResmi(n.id);
      } catch (e) {
        return galatLayanan(e, k);
      }
      return ok(jalurApi(n.id, await statusResmi(n.id)), k);
    }
    if (jalur !== "resmi") return galat("isian_tidak_sah", "jalur harus 'resmi' atau 'baileys'.", k.id, k.kepala);
    const kred = rapikanKredensial(b.data);
    if ("galat" in kred) return galat("isian_tidak_sah", kred.galat, k.id, k.kepala);
    try {
      const h = await pasangResmi(n.id, kred.data);
      return ok({ jalur: "resmi", webhook_url: h.webhook_url, verify_token: h.verify_token, nomor: h.nomor, nama: h.nama, peringatan: h.peringatan }, k);
    } catch (e) {
      return galatLayanan(e, k);
    }
  });
}
