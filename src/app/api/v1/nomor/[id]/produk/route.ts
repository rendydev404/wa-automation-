import { KatalogError, daftarProduk } from "@/lib/katalog";
import { aman, bacaJson, bukanKonteks, galat, nomorAtau404, ok, otorisasi } from "@/lib/mesin/api";
import { bentukProduk, simpanDariApi } from "./umum";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/v1/nomor/{id}/produk: katalog produk nomor (maks 100, urut tampil). */
export async function GET(req: Request, ctx: Ctx) {
  const k = await otorisasi(req, "katalog");
  if (bukanKonteks(k)) return k;
  return aman(k, async () => {
    const n = await nomorAtau404((await ctx.params).id, k);
    if (n instanceof Response) return n;
    return ok({ data: (await daftarProduk(n.id)).map(bentukProduk) }, k);
  });
}

/** POST /api/v1/nomor/{id}/produk {nama, harga?, deskripsi?, tersedia?, foto_base64?} -> 201 produk. */
export async function POST(req: Request, ctx: Ctx) {
  const k = await otorisasi(req, "katalog");
  if (bukanKonteks(k)) return k;
  // Foto maks 1,5 MB (base64 ±2 MB).
  const b = await bacaJson(req, k, 3 * 1024 * 1024);
  if (!("teks" in b)) return b;
  return aman(k, async () => {
    const n = await nomorAtau404((await ctx.params).id, k);
    if (n instanceof Response) return n;
    try {
      const id = await simpanDariApi(n.id, b.data);
      const p = (await daftarProduk(n.id)).find((x) => x.id === id);
      return ok(p ? bentukProduk(p) : { id: String(id) }, k, 201);
    } catch (e) {
      if (e instanceof KatalogError) return galat("isian_tidak_sah", e.message, k.id, k.kepala);
      throw e;
    }
  });
}
