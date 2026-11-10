import { fiturBoleh } from "@/lib/mesin/lisensi";
import { NextResponse } from "next/server";
import { sesiDanNomor } from "@/lib/akses";
import type { QrWa } from "@/lib/types";
import { infoSesi, kodePairing, qr } from "@/lib/wa";
import { teksPermintaan } from "@/lib/bahasa-server";

/** QR untuk satu nomor. Matriksnya (±0,7 KB) hanya dikirim bila berubah, supaya polling tetap ringan. */
export async function GET(req: Request) {
  if (!fiturBoleh("nomor")) return Response.json({ error: "Fitur ini dinonaktifkan oleh ChatGerCep." }, { status: 403 });
  const url = new URL(req.url);
  const { user, nomor } = await sesiDanNomor(url.searchParams.get("id"));
  // Bahasa hanya dibaca di jalur galat: polling QR tetap ringan.
  if (!user) return NextResponse.json({ error: (await teksPermintaan()).t("Sesi berakhir.", "Your session has ended.") }, { status: 401 });
  if (!nomor) return NextResponse.json({ error: (await teksPermintaan()).t("Nomor tidak ditemukan.", "Number not found.") }, { status: 404 });

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
