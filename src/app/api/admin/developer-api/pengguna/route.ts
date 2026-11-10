import { NextResponse } from "next/server";
import { cariAkunAkses } from "@/lib/developer-api";
import { modeMesin } from "@/lib/mode";
import { getUser } from "@/lib/session";

/**
 * Pencarian langsung pemilih akses portal Developer API (?q=kata&akses=1). Hanya peran developer; selain itu 404,
 * sama seperti halaman panelnya. Paling banyak 30 akun per permintaan; tidak di-cache (status akses bisa berubah).
 */
export async function GET(req: Request) {
  const tidakAda = () => NextResponse.json({ error: "Tidak ditemukan." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  if (modeMesin()) return tidakAda();
  const user = await getUser();
  if (!user || user.peran !== "developer") return tidakAda();
  const sp = new URL(req.url).searchParams;
  const hasil = await cariAkunAkses({ cari: sp.get("q") ?? "", hanyaAkses: sp.get("akses") === "1" });
  return NextResponse.json(hasil, { headers: { "Cache-Control": "no-store" } });
}
