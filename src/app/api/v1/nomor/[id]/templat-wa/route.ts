import { daftarTemplat, pasangTemplatBawaan, simpanTemplat } from "@/lib/wa-resmi";
import { aman, bacaJson, bukanKonteks, galat, nomorAtau404, ok, otorisasi } from "@/lib/mesin/api";
import { galatBukanResmi, galatLayanan, templatApi } from "@/lib/mesin/api-followup";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/v1/nomor/{id}/templat-wa: template pesan Meta milik WABA nomor ini (maks 200). */
export async function GET(req: Request, ctx: Ctx) {
  const k = await otorisasi(req, "wa.resmi");
  if (bukanKonteks(k)) return k;
  return aman(k, async () => {
    const n = await nomorAtau404((await ctx.params).id, k);
    if (n instanceof Response) return n;
    return ok({ data: (await daftarTemplat(n.id)).map(templatApi) }, k);
  });
}

/**
 * POST /api/v1/nomor/{id}/templat-wa
 *  - {nama, isi, kode_tahap?, bahasa?}: simpan & ajukan template ke Meta (201). Nama yang sudah ada diganti lalu diajukan ulang.
 *  - {bawaan: true}: ajukan semua template bawaan follow-up yang belum ada (201, daftar yang diajukan).
 */
export async function POST(req: Request, ctx: Ctx) {
  const k = await otorisasi(req, "wa.resmi");
  if (bukanKonteks(k)) return k;
  const b = await bacaJson(req, k);
  if (!("teks" in b)) return b;
  return aman(k, async () => {
    const n = await nomorAtau404((await ctx.params).id, k);
    if (n instanceof Response) return n;
    if (n.jalur !== "resmi") return galatBukanResmi(k);
    const d = b.data;
    try {
      if (d.bawaan === true) return ok({ data: (await pasangTemplatBawaan(n.id, "usaha")).map(templatApi) }, k, 201);
      if (typeof d.nama !== "string" || typeof d.isi !== "string") return galat("isian_tidak_sah", "nama dan isi wajib berupa teks (atau kirim {bawaan: true}).", k.id, k.kepala);
      if (d.kode_tahap !== undefined && d.kode_tahap !== null && typeof d.kode_tahap !== "string") return galat("isian_tidak_sah", "kode_tahap harus teks atau null.", k.id, k.kepala);
      if (d.bahasa !== undefined && typeof d.bahasa !== "string") return galat("isian_tidak_sah", "bahasa harus teks (mis. 'id', 'en_US').", k.id, k.kepala);
      const t = await simpanTemplat(n.id, { nama: d.nama, isi: d.isi, kode_tahap: (d.kode_tahap as string | null | undefined) ?? null, bahasa: d.bahasa as string | undefined });
      return ok(templatApi(t), k, 201);
    } catch (e) {
      return galatLayanan(e, k);
    }
  });
}
