import { NextResponse } from "next/server";
import { getUser } from "@/lib/session";
import { infoTarif, perbaruiTarif } from "@/lib/tarif";

/**
 * Asal & umur tarif resmi model Claude untuk panel admin (ditanyakan berkala selama halaman terbuka).
 * ?segarkan=1 = tombol "Perbarui": server membaca ulang halaman harga Anthropic (dibatasi sekali per 30 dtk, lihat tarif.ts).
 * Bukan admin = 404, sama seperti halaman admin.
 */
export async function GET(req: Request) {
  const user = await getUser();
  if (user?.peran !== "admin") return NextResponse.json({ error: "Tidak ditemukan." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const info = new URL(req.url).searchParams.get("segarkan") === "1" ? await perbaruiTarif() : await infoTarif({ tunggu: true });
  return NextResponse.json(info, { headers: { "Cache-Control": "no-store" } });
}
