import { NextResponse } from "next/server";
import { ORDER_SAH, terapkanStatus } from "@/lib/langganan";
import { type StatusMidtrans, konfigMidtrans, tandaTanganSah } from "@/lib/midtrans";

/**
 * Webhook notifikasi pembayaran Midtrans (Payment Notification URL di dashboard Midtrans:
 * <APP_URL>/api/midtrans/notifikasi). Isi notifikasi TIDAK dipercaya begitu saja:
 *   1. signature_key diperiksa (SHA-512 dengan server key kita) -> menolak notifikasi palsu.
 *   2. status diambil ulang dari API Midtrans dan nominal dicocokkan dengan tagihan (terapkanStatus).
 *   3. paket diaktifkan tepat sekali walau Midtrans mengirim notifikasi yang sama berkali-kali.
 * Galat sementara -> HTTP 500 supaya Midtrans mengirim ulang.
 */
export async function POST(req: Request) {
  const k = await konfigMidtrans();
  if (!k) return NextResponse.json({ ok: false }, { status: 503 });
  const n = (await req.json().catch(() => null)) as Partial<StatusMidtrans> | null;
  if (!n || !tandaTanganSah(n, k.kunciTandaTangan ?? [k.serverKey])) return NextResponse.json({ ok: false }, { status: 403 });
  if (!ORDER_SAH.test(n.order_id ?? "")) return NextResponse.json({ ok: true }); // bukan transaksi aplikasi ini
  try {
    const h = await terapkanStatus(k, n.order_id!);
    if (h?.baruAktif) console.log(`[bayar] lunas, paket aktif order=${n.order_id}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(`[bayar] notifikasi gagal diproses order=${n.order_id}: ${e instanceof Error ? e.message : e}`);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
