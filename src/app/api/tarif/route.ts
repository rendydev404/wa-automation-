import { NextResponse } from "next/server";
import { catatFitur } from "@/lib/analitik";
import { getUser } from "@/lib/session";
import { infoTarif, perbaruiTarif } from "@/lib/tarif";
import { staf } from "@/lib/peran";

/**
 * Asal & umur tarif resmi model Claude untuk panel admin (ditanyakan berkala selama halaman terbuka).
 * ?segarkan=1 = tombol "Perbarui": server membaca ulang halaman harga Anthropic (dibatasi sekali per 30 dtk, lihat tarif.ts).
 * Bukan admin = 404, sama seperti halaman admin.
 */
export async function GET(req: Request) {
  const user = await getUser();
  if (!user || !staf(user.peran)) return NextResponse.json({ error: "Tidak ditemukan." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const segarkan = new URL(req.url).searchParams.get("segarkan") === "1";
  const info = segarkan ? await perbaruiTarif() : await infoTarif({ tunggu: true });
  if (segarkan) catatFitur(user.id, "admin.perbarui_tarif");
  return NextResponse.json(info, { headers: { "Cache-Control": "no-store" } });
}
