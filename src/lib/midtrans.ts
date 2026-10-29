import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { getSetting } from "./db";
import { bacaRahasia } from "./rahasia";

/**
 * Midtrans Snap. Server key diisi admin di dashboard (terenkripsi, src/lib/rahasia.ts); mode bawaan PRODUKSI
 * (setting midtrans_mode = "sandbox" hanya untuk mencoba). Alur:
 *   1. buatSnap(): transaksi dibuat di Midtrans -> redirect_url halaman pembayaran Snap.
 *   2. Midtrans memanggil webhook /api/midtrans/notifikasi. Tanda tangan diperiksa (SHA-512), lalu status
 *      DIAMBIL ULANG dari API Midtrans (sumber kebenaran) sebelum paket diaktifkan.
 * Tanpa dependensi: fetch + Basic auth (server key sebagai username, password kosong).
 */

export interface KonfigMidtrans {
  serverKey: string;
  produksi: boolean;
  /** Kunci yang boleh dipakai Midtrans menandatangani notifikasi: server key, ditambah "signature secret key" bila diisi admin. */
  kunciTandaTangan?: string[];
}

export async function konfigMidtrans(): Promise<KonfigMidtrans | null> {
  const [serverKey, kunciTtd, mode] = await Promise.all([bacaRahasia("midtrans_server"), bacaRahasia("midtrans_signature"), getSetting("midtrans_mode")]);
  const kunci = serverKey || process.env.MIDTRANS_SERVER_KEY || null;
  if (!kunci) return null;
  return { serverKey: kunci, produksi: mode !== "sandbox", kunciTandaTangan: kunciTtd && kunciTtd !== kunci ? [kunci, kunciTtd] : [kunci] };
}

const alamatSnap = (k: KonfigMidtrans) => (k.produksi ? "https://app.midtrans.com/snap/v1/transactions" : "https://app.sandbox.midtrans.com/snap/v1/transactions");
const alamatApi = (k: KonfigMidtrans) => (k.produksi ? "https://api.midtrans.com/v2" : "https://api.sandbox.midtrans.com/v2");
const otorisasi = (k: KonfigMidtrans) => `Basic ${Buffer.from(`${k.serverKey}:`).toString("base64")}`;

export class MidtransError extends Error {}

export async function buatSnap(
  k: KonfigMidtrans,
  t: { orderId: string; jumlah: number; item: { id: string; nama: string }; pelanggan: { nama: string; email: string }; selesaiUrl: string }
): Promise<{ token: string; redirectUrl: string }> {
  const res = await fetch(alamatSnap(k), {
    method: "POST",
    headers: { Authorization: otorisasi(k), "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      transaction_details: { order_id: t.orderId, gross_amount: t.jumlah },
      item_details: [{ id: t.item.id, price: t.jumlah, quantity: 1, name: t.item.nama.slice(0, 50) }],
      customer_details: { first_name: t.pelanggan.nama.slice(0, 255), email: t.pelanggan.email },
      callbacks: { finish: t.selesaiUrl },
      // Tagihan yang tidak dibayar kedaluwarsa sendiri (Midtrans mengirim notifikasi "expire").
      expiry: { unit: "hours", duration: 24 },
    }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const d = (await res.json().catch(() => null)) as { token?: string; redirect_url?: string; error_messages?: string[] } | null;
  if (!res.ok || !d?.token || !d.redirect_url) throw new MidtransError(`Midtrans menolak transaksi (HTTP ${res.status})${d?.error_messages?.length ? `: ${d.error_messages.join("; ")}` : ""}`);
  return { token: d.token, redirectUrl: d.redirect_url };
}

export interface StatusMidtrans {
  order_id: string;
  status_code: string;
  gross_amount: string;
  transaction_status: string;
  fraud_status?: string;
  payment_type?: string;
  signature_key?: string;
}

/** Status transaksi langsung dari API Midtrans (bukan dari isi webhook yang bisa dipalsukan). */
export async function statusMidtrans(k: KonfigMidtrans, orderId: string): Promise<StatusMidtrans> {
  const res = await fetch(`${alamatApi(k)}/${encodeURIComponent(orderId)}/status`, {
    headers: { Authorization: otorisasi(k), Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const d = (await res.json().catch(() => null)) as StatusMidtrans | null;
  if (!res.ok || !d?.order_id) throw new MidtransError(`Status transaksi tidak terbaca (HTTP ${res.status})`);
  return d;
}

/**
 * signature_key = SHA-512(order_id + status_code + gross_amount + kunci), dibandingkan waktu-konstan. Sah bila cocok
 * dengan salah satu `kunci` (server key, atau signature secret key bila admin mengisinya).
 */
export function tandaTanganSah(n: Partial<StatusMidtrans>, kunci: string | string[]): boolean {
  if (!n.order_id || !n.status_code || !n.gross_amount || !n.signature_key) return false;
  const b = Buffer.from(String(n.signature_key).toLowerCase());
  return (Array.isArray(kunci) ? kunci : [kunci]).some((k) => {
    const a = Buffer.from(createHash("sha512").update(`${n.order_id}${n.status_code}${n.gross_amount}${k}`).digest("hex"));
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

export type StatusBayar = "menunggu" | "lunas" | "gagal" | "kedaluwarsa" | "dikembalikan";

/** Status Midtrans -> status transaksi kita. "capture" kartu hanya lunas bila fraud_status accept. */
export function petaStatus(s: Pick<StatusMidtrans, "transaction_status" | "fraud_status">): StatusBayar {
  switch (s.transaction_status) {
    case "settlement":
      return "lunas";
    case "capture":
      return s.fraud_status === "accept" || !s.fraud_status ? "lunas" : s.fraud_status === "challenge" ? "menunggu" : "gagal";
    case "pending":
      return "menunggu";
    case "expire":
      return "kedaluwarsa";
    case "refund":
    case "partial_refund":
    case "chargeback":
    case "partial_chargeback":
      return "dikembalikan";
    default:
      return "gagal"; // deny, cancel, failure
  }
}

/**
 * Server key diterima Midtrans? Ditanyakan status sebuah order yang pasti tidak ada: kunci sah -> 404
 * (transaksi tidak ditemukan), kunci salah -> 401.
 */
export async function kunciMidtransSah(k: KonfigMidtrans): Promise<boolean> {
  try {
    const res = await fetch(`${alamatApi(k)}/cek-kunci-${Date.now()}/status`, {
      headers: { Authorization: otorisasi(k), Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    const d = (await res.json().catch(() => null)) as { status_code?: string } | null;
    return res.status !== 401 && d?.status_code !== "401";
  } catch {
    return false;
  }
}
