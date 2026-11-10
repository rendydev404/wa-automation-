import { KatalogError, daftarProduk, fotoProduk, hapusProduk } from "@/lib/katalog";
import { type Konteks, aman, bacaJson, bukanKonteks, galat, idJalur, nomorAtau404, ok, otorisasi } from "@/lib/mesin/api";
import { bentukProduk, simpanDariApi } from "../umum";

type Ctx = { params: Promise<{ id: string; pid: string }> };

async function cari(ctx: Ctx, k: Konteks) {
  const { id, pid } = await ctx.params;
  const n = await nomorAtau404(id, k);
  if (n instanceof Response) return n;
  const p = idJalur(pid);
  const produk = p ? (await daftarProduk(n.id)).find((x) => x.id === p) : undefined;
  return produk ? { n, produk } : galat("tidak_ditemukan", "Produk tidak ditemukan.", k.id, k.kepala);
}

/** GET /api/v1/nomor/{id}/produk/{pid}[?foto=1]: satu produk; `foto=1` menyertakan foto_base64 & foto_mime. */
export async function GET(req: Request, ctx: Ctx) {
  const k = await otorisasi(req, "katalog");
  if (bukanKonteks(k)) return k;
  return aman(k, async () => {
    const c = await cari(ctx, k);
    if (c instanceof Response) return c;
    const isi: Record<string, unknown> = bentukProduk(c.produk);
    if (new URL(req.url).searchParams.get("foto") === "1" && c.produk.adaFoto) {
      const f = await fotoProduk(c.produk.id);
      if (f) Object.assign(isi, { foto_base64: f.data.toString("base64"), foto_mime: f.mime });
    }
    return ok(isi, k);
  });
}

/** PATCH /api/v1/nomor/{id}/produk/{pid} {nama?, harga?, deskripsi?, tersedia?, foto_base64? (null = hapus foto)}. */
export async function PATCH(req: Request, ctx: Ctx) {
  const k = await otorisasi(req, "katalog");
  if (bukanKonteks(k)) return k;
  const b = await bacaJson(req, k, 3 * 1024 * 1024);
  if (!("teks" in b)) return b;
  return aman(k, async () => {
    const c = await cari(ctx, k);
    if (c instanceof Response) return c;
    try {
      await simpanDariApi(c.n.id, b.data, c.produk);
    } catch (e) {
      if (e instanceof KatalogError) return galat("isian_tidak_sah", e.message, k.id, k.kepala);
      throw e;
    }
    const p = (await daftarProduk(c.n.id)).find((x) => x.id === c.produk.id);
    return ok(bentukProduk(p ?? c.produk), k);
  });
}

/** DELETE /api/v1/nomor/{id}/produk/{pid}. */
export async function DELETE(req: Request, ctx: Ctx) {
  const k = await otorisasi(req, "katalog");
  if (bukanKonteks(k)) return k;
  return aman(k, async () => {
    const c = await cari(ctx, k);
    if (c instanceof Response) return c;
    await hapusProduk(c.n.id, c.produk.id);
    return ok({ ok: true }, k);
  });
}
