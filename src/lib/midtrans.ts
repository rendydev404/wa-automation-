import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { getSetting, setSetting } from "./db";
import { KANAL_BAYAR, type KanalBayar } from "./harga";

/**
 * Midtrans Core API (tanpa halaman Snap): tagihan dibuat dari server dan pelanggan membayar di halaman kita sendiri.
 * Kunci dipasang developer di .env server, tidak lewat dashboard: MIDTRANS_SERVER_KEY, MIDTRANS_SIGNATURE_KEY
 * (opsional, kunci tambahan untuk verifikasi notifikasi), MIDTRANS_MODE (bawaan production; "sandbox" hanya untuk
 * mencoba), MIDTRANS_KANAL (opsional: kanal yang aktif di akun Midtrans, dipisah koma; kosong = semua KANAL_BAYAR;
 * kanal yang ditolak Midtrans tersembunyi sendiri, lihat kanalMati).
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

/**
 * Kanal yang disembunyikan dari pembeli (settings `kanal_mati`): ditolak Midtrans karena belum aktif di akun (`otomatis`,
 * lihat kanalBelumAktif), atau disembunyikan admin di /admin/transaksi. Tetap tersembunyi sampai admin menampilkannya
 * lagi, jadi pembeli lain (juga setelah restart) tidak ikut memilih kanal yang pasti gagal.
 */
export interface KanalMati {
  oleh: "otomatis" | "admin";
  waktu: number;
  alasan?: string;
}
const KUNCI_KANAL_MATI = "kanal_mati";

export async function kanalMati(): Promise<Partial<Record<KanalBayar, KanalMati>>> {
  try {
    const v = JSON.parse((await getSetting(KUNCI_KANAL_MATI)) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** null = tampilkan lagi. */
export async function setKanalMati(kanal: KanalBayar, mati: KanalMati | null): Promise<void> {
  const m = await kanalMati();
  if (mati) m[kanal] = mati;
  else delete m[kanal];
  await setSetting(KUNCI_KANAL_MATI, JSON.stringify(m));
}

/** Kanal yang dipasang developer (MIDTRANS_KANAL; kosong = semua KANAL_BAYAR), urut seperti KANAL_BAYAR. */
export function kanalTerpasang(): KanalBayar[] {
  const env = process.env.MIDTRANS_KANAL?.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  return (Object.keys(KANAL_BAYAR) as KanalBayar[]).filter((x) => !env?.length || env.includes(x));
}

/** Kanal yang ditawarkan ke pelanggan, urut seperti KANAL_BAYAR. */
export async function kanalAktif(): Promise<KanalBayar[]> {
  const mati = await kanalMati();
  return kanalTerpasang().filter((x) => !mati[x]);
}

/**
 * Jawaban charge yang berarti kanal belum aktif di akun Midtrans: 402 "Payment channel is not activated", atau 404
 * saat MEMBUAT tagihan (mis. QRIS "Merchant pop id is not found": data merchant QRIS belum ada).
 */
export const kanalBelumAktif = (kode: string | undefined): boolean => kode === "402" || kode === "404";

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
      // Isi QR mentah bila dikirim; bila tidak, gambar QR (v2 = QRIS dinamis GoPay, dipakai bila ada). Gambarnya
      // diambil server kita lewat /api/langganan/qr, bukan langsung oleh browser (lihat gambarQrGopay).
      return d.qr_string
        ? { qr: d.qr_string, deeplink: aksi("deeplink-redirect") }
        : { qrUrl: aksi("generate-qr-code-v2") ?? aksi("generate-qr-code"), deeplink: aksi("deeplink-redirect") };
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

/**
 * Gambar QR GoPay dari URL `generate-qr-code` Midtrans, diambil dari server: browser tidak bergantung pada akses ke
 * api.midtrans.com, dan kegagalan (mis. QRIS dinamis GoPay belum aktif di akun) terlihat di log, bukan gambar rusak.
 * Hanya URL di host API Midtrans yang diambil. null = Midtrans tidak mengirim gambar.
 */
export async function gambarQrGopay(k: KonfigMidtrans, url: string): Promise<{ jenis: string; isi: ArrayBuffer } | null> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || !["api.midtrans.com", "api.sandbox.midtrans.com"].includes(u.hostname)) return null;
  const res = await fetch(u, { headers: { Authorization: otorisasi(k), Accept: "image/*" }, signal: AbortSignal.timeout(15_000), cache: "no-store" });
  const jenis = res.headers.get("content-type")?.split(";")[0].trim() ?? "";
  if (!res.ok || !jenis.startsWith("image/")) {
    const isi = (await res.text().catch(() => "")).slice(0, 200);
    console.error(`[midtrans] QR GoPay tidak tersedia (HTTP ${res.status}, ${jenis || "tanpa content-type"}): ${isi}`);
    return null;
  }
  return { jenis, isi: await res.arrayBuffer() };
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
    const rinci = [d?.status_message, ...(d?.validation_messages ?? [])].filter(Boolean).join("; ");
    if (kanalBelumAktif(kode))
      await setKanalMati(t.kanal, { oleh: "otomatis", waktu: Math.floor(Date.now() / 1000), alasan: `kode ${kode}${rinci ? `: ${rinci}` : ""}`.slice(0, 200) }).catch(() => {});
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
