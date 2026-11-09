import { NextResponse } from "next/server";
import { ORDER_SAH, statusTagihan } from "@/lib/langganan";
import { getUser } from "@/lib/session";
import { teksPermintaan } from "@/lib/bahasa-server";

/**
 * Status satu tagihan milik pengguna ini, dipanggil berkala oleh halaman instruksi bayar. Biasanya dua query berindeks
 * (sesi login + transaksi) dan jawaban ±20 bita; provider pembayaran hanya ditanya sebagai cadangan webhook (statusTagihan).
 * Browser tidak pernah memanggil provider langsung.
 */
export async function GET(req: Request) {
  const user = await getUser();
  // Bahasa hanya dibaca di jalur galat: polling yang berhasil tetap tanpa kerja tambahan.
  if (!user) return NextResponse.json({ error: (await teksPermintaan()).t("Sesi berakhir.", "Your session has ended.") }, { status: 401 });
  const tidakAda = async () => NextResponse.json({ error: (await teksPermintaan()).t("Tagihan tidak ditemukan.", "Invoice not found.") }, { status: 404 });
  const order = new URL(req.url).searchParams.get("order") ?? "";
  if (!ORDER_SAH.test(order)) return tidakAda();
  const s = await statusTagihan(user.id, order);
  if (!s) return tidakAda();
  return NextResponse.json({ s }, { headers: { "Cache-Control": "no-store" } });
}
