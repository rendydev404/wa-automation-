import { fiturBoleh } from "@/lib/mesin/lisensi";
import { nomorUntuk } from "@/lib/akses";
import { fotoProduk } from "@/lib/katalog";
import { getUser } from "@/lib/session";
import { teksPermintaan } from "@/lib/bahasa-server";

/** Foto satu produk katalog, untuk dashboard & Uji bot. Hanya pemilik nomor (atau admin). */
export async function GET(req: Request) {
  if (!fiturBoleh("katalog")) return Response.json({ error: "Fitur ini dinonaktifkan oleh ChatGerCep." }, { status: 403 });
  const user = await getUser();
  const id = Number(new URL(req.url).searchParams.get("id"));
  const f = user && Number.isInteger(id) && id > 0 ? await fotoProduk(id) : undefined;
  if (!user || !f || !(await nomorUntuk(user, f.numberId))) return new Response((await teksPermintaan()).t("Tidak ditemukan.", "Not found."), { status: 404 });
  return new Response(new Uint8Array(f.data), {
    headers: { "Content-Type": f.mime, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" },
  });
}
