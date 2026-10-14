import { NextResponse } from "next/server";
import { nomorById } from "@/lib/numbers";
import { getUser } from "@/lib/session";
import type { QrWa } from "@/lib/types";
import { infoSesi, qr } from "@/lib/wa";

/** QR untuk satu nomor. Matriksnya (±0,7 KB) hanya dikirim bila berubah, supaya polling tetap ringan. */
export async function GET(req: Request) {
  if (!(await getUser())) return NextResponse.json({ error: "Sesi berakhir." }, { status: 401 });
  const url = new URL(req.url);
  const nomor = await nomorById(Number(url.searchParams.get("id")));
  if (!nomor) return NextResponse.json({ error: "Nomor tidak ditemukan." }, { status: 404 });

  const hasil: QrWa = { status: infoSesi(nomor.sesi).status };
  if (hasil.status === "SCAN_QR_CODE") {
    const kode = await qr(nomor.sesi);
    if (kode) {
      hasil.hash = kode.hash;
      if (url.searchParams.get("h") !== kode.hash) hasil.qr = kode.kode;
    }
  }
  return NextResponse.json(hasil, { headers: { "Cache-Control": "no-store" } });
}
