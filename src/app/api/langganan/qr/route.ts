import { NextResponse } from "next/server";
import { ORDER_SAH, transaksiMilik } from "@/lib/langganan";
import { gambarQrGopay, konfigMidtrans } from "@/lib/midtrans";
import { getUser } from "@/lib/session";

/**
 * Gambar QR GoPay untuk satu tagihan milik pengguna ini. Diambil server dari Midtrans (URL generate-qr-code yang
 * tersimpan di transaksi), jadi browser hanya bicara dengan server kita. 404 = QR tidak tersedia: halaman tagihan
 * lalu menampilkan cara bayar lain.
 */
export async function GET(req: Request) {
  const tidakAda = () => new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  const user = await getUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const order = new URL(req.url).searchParams.get("order") ?? "";
  if (!ORDER_SAH.test(order)) return tidakAda();
  const [t, k] = await Promise.all([transaksiMilik(user.id, order), konfigMidtrans()]);
  if (!t || !k || t.status !== "menunggu" || !t.bayar?.qrUrl) return tidakAda();
  try {
    const g = await gambarQrGopay(k, t.bayar.qrUrl);
    if (!g) return tidakAda();
    // QR satu tagihan tidak berubah: boleh disimpan browser pengguna ini selama tagihan berlaku.
    return new NextResponse(g.isi, { headers: { "Content-Type": g.jenis, "Cache-Control": "private, max-age=900", "X-Content-Type-Options": "nosniff" } });
  } catch (e) {
    console.error(`[midtrans] QR GoPay gagal diambil order=${order}: ${e instanceof Error ? e.message : e}`);
    return tidakAda();
  }
}
