import { NextResponse } from "next/server";
import { ORDER_SAH, statusTagihan } from "@/lib/langganan";
import { konfigMidtrans } from "@/lib/midtrans";
import { getUser } from "@/lib/session";

/**
 * Status satu tagihan milik pengguna ini, dipanggil berkala oleh halaman instruksi bayar. Biasanya dua query berindeks
 * (sesi login + transaksi) dan jawaban ±20 bita; Midtrans hanya ditanya sebagai cadangan webhook (statusTagihan).
 * Browser tidak pernah memanggil Midtrans langsung.
 */
export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sesi berakhir." }, { status: 401 });
  const order = new URL(req.url).searchParams.get("order") ?? "";
  if (!ORDER_SAH.test(order)) return NextResponse.json({ error: "Tagihan tidak ditemukan." }, { status: 404 });
  const s = await statusTagihan(await konfigMidtrans(), user.id, order);
  if (!s) return NextResponse.json({ error: "Tagihan tidak ditemukan." }, { status: 404 });
  return NextResponse.json({ s }, { headers: { "Cache-Control": "no-store" } });
}
