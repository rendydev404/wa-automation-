import { NextResponse } from "next/server";
import { catatFitur } from "@/lib/analitik";
import { infoKurs, perbaruiKurs } from "@/lib/kurs";
import { getUser } from "@/lib/session";

/**
 * Kurs USD → Rp terbaru untuk kalkulator harga di panel admin (ditanyakan berkala selama halaman terbuka).
 * ?segarkan=1 = tombol "Perbarui": server mengambil ulang dari semua sumber (dibatasi sekali per 30 dtk, lihat kurs.ts).
 * Bukan admin = 404, sama seperti halaman admin.
 */
export async function GET(req: Request) {
  const user = await getUser();
  if (user?.peran !== "admin") return NextResponse.json({ error: "Tidak ditemukan." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const segarkan = new URL(req.url).searchParams.get("segarkan") === "1";
  const info = segarkan ? await perbaruiKurs() : await infoKurs({ tunggu: true });
  if (segarkan) catatFitur(user.id, "admin.perbarui_kurs");
  return NextResponse.json(info, { headers: { "Cache-Control": "no-store" } });
}
