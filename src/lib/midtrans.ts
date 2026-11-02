import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Midtrans Snap. Kunci dipasang developer di .env server, tidak lewat dashboard: MIDTRANS_SERVER_KEY,
 * MIDTRANS_SIGNATURE_KEY (opsional, kunci tambahan untuk verifikasi notifikasi), MIDTRANS_MODE (bawaan production;
 * "sandbox" hanya untuk mencoba). Alur:
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
  const kunci = process.env.MIDTRANS_SERVER_KEY?.trim();
  if (!kunci) return null;
  const kunciTtd = process.env.MIDTRANS_SIGNATURE_KEY?.trim();
  return {
    serverKey: kunci,
    produksi: process.env.MIDTRANS_MODE?.trim().toLowerCase() !== "sandbox",
    kunciTandaTangan: kunciTtd && kunciTtd !== kunci ? [kunci, kunciTtd] : [kunci],
  };
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


// ---------- Midtrans Iris (Payouts / Disbursement Otomatis Afiliasi) ----------

export interface KonfigIris {
  irisKey: string;
  produksi: boolean;
}

export function konfigIris(): KonfigIris | null {
  const kunci = process.env.MIDTRANS_IRIS_KEY?.trim();
  if (!kunci) return null;
  return {
    irisKey: kunci,
    produksi: process.env.MIDTRANS_MODE?.trim().toLowerCase() !== "sandbox",
  };
}

const alamatIris = (k: KonfigIris) =>
  k.produksi ? "https://app.midtrans.com/iris/api/v1/payouts" : "https://app.sandbox.midtrans.com/iris/api/v1/payouts";

/**
 * Kirim pencairan dana otomatis lewat Midtrans Iris Payouts API.
 * Memakai X-Idempotency-Key dari id penarikan agar aman dari pengiriman ganda.
 */
export async function kirimPayoutIris(
  k: KonfigIris,
  p: {
    idempotencyKey: string;
    bankKode: string;
    nomorRekening: string;
    namaPemilik: string;
    emailPenerima: string;
    nominal: number;
    catatan: string;
  }
): Promise<{ referenceNo: string; status: string }> {
  const auth = `Basic ${Buffer.from(`${k.irisKey}:`).toString("base64")}`;
  const res = await fetch(alamatIris(k), {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Idempotency-Key": p.idempotencyKey,
    },
    body: JSON.stringify({
      payouts: [
        {
          beneficiary_name: p.namaPemilik.slice(0, 100),
          beneficiary_account: p.nomorRekening.replace(/[^0-9]/g, ""),
          beneficiary_bank: p.bankKode.toLowerCase(),
          beneficiary_email: p.emailPenerima,
          amount: String(Math.round(p.nominal)),
          notes: p.catatan.replace(/[^a-zA-Z0-9 ]/g, " ").trim().slice(0, 80) || "Komisi Afiliasi",
        },
      ],
    }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const d = (await res.json().catch(() => null)) as {
    payouts?: { status?: string; reference_no?: string }[];
    error_message?: string;
    errors?: string[];
  } | null;
  const item = d?.payouts?.[0];
  if (!res.ok || !item?.reference_no) {
    const pesan = d?.errors?.join("; ") || d?.error_message || `HTTP ${res.status}`;
    throw new MidtransError(`Midtrans Iris menolak pencairan: ${pesan}`);
  }
  return { referenceNo: item.reference_no, status: item.status ?? "queued" };
}
