import { aplikasiById, pengaturanSandbox } from "@/lib/developer-api";
import { modeMesin } from "@/lib/mode";
import { getUser } from "@/lib/session";
import { composeMesin, envMesin } from "@/lib/templat-mesin";

/**
 * Unduh berkas pemasangan mesin untuk aplikasi yang sudah disetujui: ?nama=docker-compose.yml | .env.contoh.
 * Hanya pemilik aplikasi yang masih punya akses portal (atau developer internal). Milik orang lain / belum disetujui = 404.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const tidakAda = () => new Response("Tidak ditemukan.", { status: 404, headers: { "cache-control": "no-store" } });
  if (modeMesin()) return tidakAda();
  const user = await getUser();
  if (!user) return tidakAda();
  const a = await aplikasiById(Number((await ctx.params).id));
  if (!a || (a.user_id === user.id ? !user.aksesApi : user.peran !== "developer") || (a.status !== "disetujui" && a.status !== "ditangguhkan")) return tidakAda();
  const nama = new URL(req.url).searchParams.get("nama");
  const isi = nama === "docker-compose.yml" ? composeMesin() : nama === ".env.contoh" ? envMesin({ namaAplikasi: a.nama, alamat: a.alamat_mesin, sandbox: a.mode === "sandbox", port: a.mode === "sandbox" ? (await pengaturanSandbox()).port : undefined }) : null;
  if (isi === null) return tidakAda();
  return new Response(isi, {
    headers: {
      "content-type": nama === "docker-compose.yml" ? "text/yaml; charset=utf-8" : "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="${nama}"`,
      "cache-control": "no-store",
    },
  });
}
