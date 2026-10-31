import { nomorUntuk } from "@/lib/akses";
import { fotoProduk } from "@/lib/katalog";
import { getUser } from "@/lib/session";

/** Foto satu produk katalog, untuk dashboard & Uji bot. Hanya pemilik nomor (atau admin). */
export async function GET(req: Request) {
  const user = await getUser();
  const id = Number(new URL(req.url).searchParams.get("id"));
  const f = user && Number.isInteger(id) && id > 0 ? await fotoProduk(id) : undefined;
  if (!user || !f || !(await nomorUntuk(user, f.numberId))) return new Response("Tidak ditemukan.", { status: 404 });
  return new Response(new Uint8Array(f.data), {
    headers: { "Content-Type": f.mime, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" },
  });
}
