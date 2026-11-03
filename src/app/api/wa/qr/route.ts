import { NextResponse } from "next/server";
import { sesiDanNomor } from "@/lib/akses";
import type { QrWa } from "@/lib/types";
import { infoSesi, kodePairing, qr } from "@/lib/wa";

/** QR untuk satu nomor. Matriksnya (±0,7 KB) hanya dikirim bila berubah, supaya polling tetap ringan. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const { user, nomor } = await sesiDanNomor(url.searchParams.get("id"));
  if (!user) return NextResponse.json({ error: "Sesi berakhir." }, { status: 401 });
  if (!nomor) return NextResponse.json({ error: "Nomor tidak ditemukan." }, { status: 404 });

  const hasil: QrWa = { status: infoSesi(nomor.sesi).status };
  if (hasil.status === "SCAN_QR_CODE") {
    const kode = await qr(nomor.sesi);
    if (kode) {
      hasil.hash = kode.hash;
      if (url.searchParams.get("h") !== kode.hash) hasil.qr = kode.kode;
    }
    const kp = kodePairing(nomor.sesi);
    if (kp) hasil.kodePairing = kp;
  }
  return NextResponse.json(hasil, { headers: { "Cache-Control": "no-store" } });
}
