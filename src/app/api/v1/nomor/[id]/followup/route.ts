import { setelanNomor, simpanSetelanNomor, statusUsaha } from "@/lib/followup-usaha";
import { type Nomor, nomorById } from "@/lib/numbers";
import { aman, bacaJson, bukanKonteks, galat, nomorAtau404, ok, otorisasi } from "@/lib/mesin/api";
import { RENTANG_SETELAN_API, galatLayanan, setelanApi, statusFollowupApi, terapkanSetelan } from "@/lib/mesin/api-followup";

type Ctx = { params: Promise<{ id: string }> };

async function bentuk(n: Nomor) {
  const s = await statusUsaha(n);
  return { nomor_id: String(n.id), jalur: n.jalur, setelan: setelanApi(s.setelan), status: statusFollowupApi(s), rentang: RENTANG_SETELAN_API };
}

/** GET /api/v1/nomor/{id}/followup: setelan follow-up (prospek & order ulang), status hari ini (rem, kiriman, batas), jalur. */
export async function GET(req: Request, ctx: Ctx) {
  const k = await otorisasi(req, "followup");
  if (bukanKonteks(k)) return k;
  return aman(k, async () => {
    const n = await nomorAtau404((await ctx.params).id, k);
    if (n instanceof Response) return n;
    return ok(await bentuk(n), k);
  });
}

/**
 * PATCH /api/v1/nomor/{id}/followup {aktif?, ulang_aktif?, jam_mulai?, jam_selesai?, batas_harian?, jeda_panas_jam?,
 * jeda_hangat_jam?, tahap2_jam?, tahap3_jam?, maks_tahap?, siklus_ulang_hari?}: hanya kolom yang dikirim yang diubah.
 * Mematikan saklar membatalkan antrean jenis itu yang masih berjalan.
 */
export async function PATCH(req: Request, ctx: Ctx) {
  const k = await otorisasi(req, "followup");
  if (bukanKonteks(k)) return k;
  const b = await bacaJson(req, k);
  if (!("teks" in b)) return b;
  return aman(k, async () => {
    const n = await nomorAtau404((await ctx.params).id, k);
    if (n instanceof Response) return n;
    const h = terapkanSetelan((await setelanNomor(n.id)).setelan, b.data);
    if ("galat" in h) return galat("isian_tidak_sah", h.galat, k.id, k.kepala);
    if (h.berubah) {
      try {
        await simpanSetelanNomor(n.id, h.setelan);
      } catch (e) {
        return galatLayanan(e, k);
      }
    }
    return ok(await bentuk((await nomorById(n.id)) ?? n), k);
  });
}
