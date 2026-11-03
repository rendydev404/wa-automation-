import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { KANAL_BAYAR, type KanalBayar } from "./harga";

/**
 * Midtrans Core API (tanpa halaman Snap): tagihan dibuat dari server dan pelanggan membayar di halaman kita sendiri.
 * Kunci dipasang developer di .env server, tidak lewat dashboard: MIDTRANS_SERVER_KEY, MIDTRANS_SIGNATURE_KEY
 * (opsional, kunci tambahan untuk verifikasi notifikasi), MIDTRANS_MODE (bawaan production; "sandbox" hanya untuk
 * mencoba), MIDTRANS_KANAL (opsional: kanal yang aktif di akun Midtrans, dipisah koma; kosong = semua KANAL_BAYAR).
 * Alur:
 *   1. buatCharge(): POST /v2/charge -> nomor VA / isi QRIS / deeplink e-wallet + batas waktu, disimpan di transaksi.
 *   2. Midtrans memanggil webhook /api/midtrans/notifikasi. Tanda tangan diperiksa (SHA-512), lalu status
 *      DIAMBIL ULANG dari API Midtrans (sumber kebenaran) sebelum paket diaktifkan.
 * Server key tidak pernah keluar dari server. Tanpa dependensi: fetch + Basic auth (server key sebagai username).
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

const alamatApi = (k: KonfigMidtrans) => (k.produksi ? "https://api.midtrans.com/v2" : "https://api.sandbox.midtrans.com/v2");
const otorisasi = (k: KonfigMidtrans) => `Basic ${Buffer.from(`${k.serverKey}:`).toString("base64")}`;

/** `kode` = status_code dari Midtrans (mis. "402" kanal belum aktif), bila ada. */
export class MidtransError extends Error {
  readonly kode?: string;
  constructor(pesan: string, kode?: string) {
    super(pesan);
    this.kode = kode;
  }
}

/** Kanal yang ditolak Midtrans karena belum diaktifkan di akun: disembunyikan sejam supaya pembeli lain tidak ikut gagal. */
const gm = globalThis as unknown as { __waKanalMati?: Map<KanalBayar, number> };
const kanalMati = (gm.__waKanalMati ??= new Map());

/** Kanal yang ditawarkan ke pelanggan, urut seperti KANAL_BAYAR. */
export function kanalAktif(): KanalBayar[] {
  const env = process.env.MIDTRANS_KANAL?.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  const kini = Date.now();
  return (Object.keys(KANAL_BAYAR) as KanalBayar[]).filter((x) => (!env?.length || env.includes(x)) && !((kanalMati.get(x) ?? 0) > kini));
}

/** Data yang ditampilkan di halaman instruksi bayar (disimpan di transaksi.bayar). */
export interface InstruksiBayar {
  /** Nomor virtual account, atau kode bayar (bill key) Mandiri. */
  va?: string;
  /** Mandiri Bill Payment: kode perusahaan (biller code). */
  biller?: string;
  /** Isi QRIS mentah: digambar sendiri jadi kode QR, tanpa mengunduh gambar dari Midtrans. */
  qr?: string;
  /** Gambar QR dari Midtrans (GoPay mengirim gambar, bukan isi QR). */
  qrUrl?: string;
  /** Tautan pembuka aplikasi e-wallet. */
  deeplink?: string;
}

interface JawabCharge {
  status_code?: string;
  status_message?: string;
  validation_messages?: string[];
  va_numbers?: { bank: string; va_number: string }[];
  permata_va_number?: string;
  bill_key?: string;
  biller_code?: string;
  qr_string?: string;
  actions?: { name: string; url: string }[];
  expiry_time?: string;
}

/** Bagian permintaan yang khusus per kanal (sisanya sama untuk semua kanal). */
function badanKanal(kanal: KanalBayar, kembaliUrl: string): Record<string, unknown> {
  switch (kanal) {
    case "qris":
      return { payment_type: "qris" };
    case "gopay":
      return { payment_type: "gopay", gopay: { enable_callback: true, callback_url: kembaliUrl } };
    case "shopeepay":
      return { payment_type: "shopeepay", shopeepay: { callback_url: kembaliUrl } };
    case "mandiri":
      return { payment_type: "echannel", echannel: { bill_info1: "Pembayaran:", bill_info2: "Langganan" } };
    default:
      return { payment_type: "bank_transfer", bank_transfer: { bank: kanal } };
  }
}

/** Ambil data bayar yang relevan dari jawaban charge. */
function instruksiDari(kanal: KanalBayar, d: JawabCharge): InstruksiBayar {
  const aksi = (nama: string) => d.actions?.find((a) => a.name === nama)?.url;
  switch (kanal) {
    case "qris":
      return { qr: d.qr_string };
    case "gopay":
      return d.qr_string ? { qr: d.qr_string, deeplink: aksi("deeplink-redirect") } : { qrUrl: aksi("generate-qr-code"), deeplink: aksi("deeplink-redirect") };
    case "shopeepay":
      return { deeplink: aksi("deeplink-redirect") };
    case "mandiri":
      return { va: d.bill_key, biller: d.biller_code };
    case "permata":
      return { va: d.permata_va_number ?? d.va_numbers?.[0]?.va_number };
    default:
      return { va: (d.va_numbers?.find((v) => v.bank === kanal) ?? d.va_numbers?.[0])?.va_number };
  }
}

/** "2026-11-03 10:15:00" (WIB, format Midtrans) -> detik epoch. */
export function waktuMidtrans(s: string | undefined): number | null {
  const t = s ? Date.parse(`${s.trim().replace(" ", "T")}+07:00`) : NaN;
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
}

/**
 * Buat tagihan lewat Core API (POST /v2/charge). Midtrans menolak order_id yang sama dua kali, jadi satu order_id =
 * paling banyak satu tagihan. Galat Midtrans sering datang sebagai HTTP 200 dengan status_code 4xx di badannya.
 */
export async function buatCharge(
  k: KonfigMidtrans,
  t: { orderId: string; jumlah: number; kanal: KanalBayar; item: { id: string; nama: string }; pelanggan: { nama: string; email: string }; kembaliUrl: string }
): Promise<{ bayar: InstruksiBayar; kedaluwarsa: number }> {
  const menit = KANAL_BAYAR[t.kanal].menit;
  const res = await fetch(`${alamatApi(k)}/charge`, {
    method: "POST",
    headers: { Authorization: otorisasi(k), "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      ...badanKanal(t.kanal, t.kembaliUrl),
      transaction_details: { order_id: t.orderId, gross_amount: t.jumlah },
      item_details: [{ id: t.item.id, price: t.jumlah, quantity: 1, name: t.item.nama.slice(0, 50) }],
      customer_details: { first_name: t.pelanggan.nama.slice(0, 255), email: t.pelanggan.email },
      // Tagihan yang tidak dibayar kedaluwarsa sendiri (Midtrans mengirim notifikasi "expire").
      custom_expiry: { expiry_duration: menit, unit: "minute" },
    }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const d = (await res.json().catch(() => null)) as JawabCharge | null;
  const kode = d?.status_code ?? String(res.status);
  if (!res.ok || !d || (kode !== "201" && kode !== "200")) {
    if (kode === "402") kanalMati.set(t.kanal, Date.now() + 3600_000);
    const rinci = [d?.status_message, ...(d?.validation_messages ?? [])].filter(Boolean).join("; ");
    throw new MidtransError(`Midtrans menolak tagihan (kode ${kode})${rinci ? `: ${rinci}` : ""}`, kode);
  }
  const bayar = instruksiDari(t.kanal, d);
  if (!bayar.va && !bayar.qr && !bayar.qrUrl && !bayar.deeplink) throw new MidtransError("Midtrans tidak mengirim data pembayaran.");
  return { bayar, kedaluwarsa: waktuMidtrans(d.expiry_time) ?? Math.floor(Date.now() / 1000) + menit * 60 };
}

/**
 * Batalkan tagihan yang belum dibayar (POST /v2/{order}/cancel). false = Midtrans menolak membatalkan (mis. sudah
 * dibayar atau sudah kedaluwarsa): status sebenarnya lalu diambil ulang oleh pemanggil.
 */
export async function batalkanCharge(k: KonfigMidtrans, orderId: string): Promise<boolean> {
  const res = await fetch(`${alamatApi(k)}/${encodeURIComponent(orderId)}/cancel`, {
    method: "POST",
    headers: { Authorization: otorisasi(k), Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const d = (await res.json().catch(() => null)) as { status_code?: string; transaction_status?: string } | null;
  return res.ok && d?.status_code === "200" && d.transaction_status === "cancel";
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

export type StatusBayar = "menunggu" | "lunas" | "gagal" | "kedaluwarsa" | "dibatalkan" | "dikembalikan";

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
    case "cancel":
      return "dibatalkan";
    case "refund":
    case "partial_refund":
    case "chargeback":
    case "partial_chargeback":
      return "dikembalikan";
    default:
      return "gagal"; // deny, failure
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
