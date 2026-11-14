import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { terbitkanVoucherPanduan, verifikasiSignatureVoucher } from "@/lib/voucher";

/**
 * Webhook sinkronisasi voucher otomatis dari Panduan Produk Digital (akbaralatas.com).
 * Diautentikasi menggunakan tanda tangan HMAC-SHA256 (`X-Voucher-Timestamp` + `X-Voucher-Signature`).
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const timestamp = req.headers.get("x-voucher-timestamp") || "";
    const signature = req.headers.get("x-voucher-signature") || "";

    if (!verifikasiSignatureVoucher(rawBody, timestamp, signature)) {
      return NextResponse.json({ ok: false, error: "Tanda tangan sinkronisasi voucher tidak sah." }, { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ ok: false, error: "Payload JSON tidak sah." }, { status: 400 });
    }

    const kode = typeof body.kode === "string" ? body.kode : "";
    if (!kode.trim()) {
      return NextResponse.json({ ok: false, error: "Kode voucher wajib diisi." }, { status: 400 });
    }

    const voucher = await terbitkanVoucherPanduan({
      kode,
      order_id: typeof body.order_id === "string" ? body.order_id : null,
      pembeli_nama: typeof body.pembeli_nama === "string" ? body.pembeli_nama : null,
      pembeli_email: typeof body.pembeli_email === "string" ? body.pembeli_email : null,
      pembeli_wa: typeof body.pembeli_wa === "string" ? body.pembeli_wa : null,
      harga_beli: typeof body.harga_beli === "number" ? body.harga_beli : null,
      catatan: typeof body.catatan === "string" ? body.catatan : null,
    });

    return NextResponse.json({
      ok: true,
      voucher: {
        id: voucher.id,
        kode: voucher.kode,
        order_id: voucher.order_id,
        nama_paket: voucher.nama_paket,
        durasi_hari: voucher.durasi_hari,
        kuota_nomor: voucher.kuota_nomor,
        kuota_balasan: voucher.kuota_balasan,
        status: voucher.status,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Gagal mendaftarkan voucher." },
      { status: 400 },
    );
  }
}
