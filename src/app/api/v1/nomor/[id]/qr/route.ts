import { hubungkan, infoSesi, qr, qrMentah } from "@/lib/wa";
import { aman, bukanKonteks, nomorAtau404, ok, otorisasi, statusNomorApi } from "@/lib/mesin/api";
import { pngQr } from "@/lib/mesin/png";

type Ctx = { params: Promise<{ id: string }> };

/** Kode QR WhatsApp berganti kira-kira tiap 20 detik. */
const UMUR_QR_DETIK = 20;

/**
 * GET /api/v1/nomor/{id}/qr: QR untuk menautkan nomor (teks mentah + PNG base64). Nomor yang belum punya koneksi
 * dinyalakan dulu. Sudah terhubung = qr null. Panggil ulang tiap ±10 detik selama status "menunggu_qr".
 */
export async function GET(req: Request, ctx: Ctx) {
  const k = await otorisasi(req, "nomor");
  if (bukanKonteks(k)) return k;
  return aman(k, async () => {
    const n = await nomorAtau404((await ctx.params).id, k);
    if (n instanceof Response) return n;
    let status = infoSesi(n.sesi).status;
    if (status === "BELUM_ADA" || status === "STOPPED" || status === "FAILED") {
      await hubungkan(n.sesi).catch(() => {});
      status = infoSesi(n.sesi).status;
    }
    const mentah = status === "SCAN_QR_CODE" ? qrMentah(n.sesi) : null;
    const bit = mentah ? await qr(n.sesi) : null;
    const sisa = mentah ? Math.max(0, UMUR_QR_DETIK - Math.floor((Date.now() - mentah.sejakMs) / 1000)) : null;
    return ok(
      {
        status: statusNomorApi(status),
        qr: mentah?.teks ?? null,
        png_base64: bit ? pngQr(bit.kode).toString("base64") : null,
        kedaluwarsa_dalam_detik: sisa,
      },
      k,
    );
  });
}
