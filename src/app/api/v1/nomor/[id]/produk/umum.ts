import { type IsianProduk, KatalogError, type Produk, simpanProduk } from "@/lib/katalog";
import { MAKS_HARGA_PRODUK } from "@/lib/katalog-def";

/** Bentuk Produk di API v1 (tanpa data foto; ambil lewat GET /nomor/{id}/produk/{pid}?foto=1). */
export const bentukProduk = (p: Produk) => ({
  id: String(p.id),
  nama: p.nama,
  harga: p.harga,
  deskripsi: p.deskripsi,
  tersedia: p.tersedia,
  ada_foto: p.adaFoto,
  urutan: p.urutan,
  diubah: p.diubah,
});

/**
 * Gabungkan isian JSON API ke produk lama (PATCH) atau isian kosong (POST), lalu simpan. `foto_base64`: string = ganti,
 * null = hapus, tidak dikirim = tetap. Galat isian dilempar sebagai KatalogError (pesan siap tampil).
 */
export async function simpanDariApi(numberId: number, d: Record<string, unknown>, lama?: Produk): Promise<number> {
  const teks = (v: unknown, nama: string): string => {
    if (typeof v !== "string") throw new KatalogError(`\`${nama}\` harus teks.`);
    return v;
  };
  const p: IsianProduk = {
    id: lama?.id,
    nama: d.nama === undefined ? (lama?.nama ?? "") : teks(d.nama, "nama"),
    deskripsi: d.deskripsi === undefined ? (lama?.deskripsi ?? "") : teks(d.deskripsi, "deskripsi"),
    harga: lama?.harga ?? null,
    tersedia: lama?.tersedia ?? true,
  };
  if (d.harga !== undefined) {
    if (d.harga !== null && !(Number.isInteger(d.harga) && (d.harga as number) >= 0 && (d.harga as number) <= MAKS_HARGA_PRODUK))
      throw new KatalogError("`harga` harus bilangan bulat Rupiah ≥ 0, atau null.");
    p.harga = d.harga as number | null;
  }
  if (d.tersedia !== undefined) {
    if (typeof d.tersedia !== "boolean") throw new KatalogError("`tersedia` harus true/false.");
    p.tersedia = d.tersedia;
  }
  if (d.foto_base64 === null) p.foto = null;
  else if (d.foto_base64 !== undefined) {
    const b64 = teks(d.foto_base64, "foto_base64").replace(/^data:[^;]+;base64,/, "");
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) throw new KatalogError("`foto_base64` bukan base64 yang sah.");
    p.foto = new Uint8Array(Buffer.from(b64, "base64"));
  }
  return simpanProduk(numberId, p);
}
