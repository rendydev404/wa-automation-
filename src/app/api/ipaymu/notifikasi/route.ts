import { NextResponse } from "next/server";
import { ORDER_SAH, asalTransaksi, terapkanStatus } from "@/lib/langganan";
import { konfigIpaymu } from "@/lib/ipaymu";

/**
 * Callback pembayaran iPaymu (notifyUrl yang dikirim saat membuat tagihan: <APP_URL>/api/ipaymu/notifikasi). Isi
 * callback TIDAK dipercaya begitu saja:
 *   1. reference_id harus order kita yang dibuat lewat iPaymu, dan trx_id harus sama dengan TransactionId yang
 *      dicatat saat tagihan dibuat (transaksi.gateway_ref) -> callback palsu / milik merchant lain ditolak.
 *   2. status diambil ulang dari API iPaymu dan nominal dicocokkan dengan tagihan (terapkanStatus), jalur aktivasi
 *      yang sama dengan webhook Midtrans: paket aktif tepat sekali walau callback dikirim berkali-kali.
 * Galat sementara -> HTTP 500 supaya iPaymu mengirim ulang. Isi callback bisa form-urlencoded atau JSON.
 */
export async function POST(req: Request) {
  if (!konfigIpaymu()) return NextResponse.json({ ok: false }, { status: 503 });
  const n = await bacaIsi(req);
  const orderId = String(n.reference_id ?? n.referenceId ?? "");
  const trx = String(n.trx_id ?? n.trxId ?? n.transaction_id ?? "");
  if (!ORDER_SAH.test(orderId)) return NextResponse.json({ ok: true }); // bukan transaksi aplikasi ini
  try {
    const asal = await asalTransaksi(orderId);
    if (!asal) return NextResponse.json({ ok: true }); // order tidak dikenal
    if (asal.gateway !== "ipaymu" || !trx || asal.gateway_ref !== trx) {
      console.warn(`[bayar] callback iPaymu ditolak order=${orderId}: trx_id tidak cocok`);
      return NextResponse.json({ ok: false }, { status: 403 });
    }
    const h = await terapkanStatus(orderId, { asal });
    if (h?.baruAktif) console.log(`[bayar] lunas (iPaymu), paket aktif order=${orderId}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(`[bayar] callback iPaymu gagal diproses order=${orderId}: ${e instanceof Error ? e.message : e}`);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

async function bacaIsi(req: Request): Promise<Record<string, unknown>> {
  const teks = (await req.text().catch(() => "")).slice(0, 20_000);
  if (!teks) return {};
  if (teks.trimStart().startsWith("{")) {
    try {
      const v = JSON.parse(teks);
      return v && typeof v === "object" ? v : {};
    } catch {
      return {};
    }
  }
  return Object.fromEntries(new URLSearchParams(teks));
}
