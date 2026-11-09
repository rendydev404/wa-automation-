import "server-only";
import { createHash, createHmac } from "node:crypto";
import { GatewayError, type StatusBayar } from "./gateway-def";
import { KANAL_BAYAR, type KanalBayar } from "./harga";
import type { InstruksiBayar } from "./midtrans";

/**
 * iPaymu API v2 Direct Payment (tanpa halaman iPaymu): tagihan dibuat dari server, pelanggan membayar di halaman kita.
 * Kunci dipasang developer di .env server: IPAYMU_VA (nomor VA merchant iPaymu), IPAYMU_API_KEY, IPAYMU_SANDBOX
 * ("1" = sandbox untuk mencoba; bawaan production), IPAYMU_KANAL (opsional, dipisah koma; kosong = semua KANAL_IPAYMU).
 * Kanal yang ditawarkan juga mengikuti status akun merchant (bacaKanalAkunIpaymu, disimpan 10 menit di
 * src/lib/gateway.ts): kanal yang belum diaktifkan iPaymu (mis. QRIS) tidak pernah tampil ke pembeli.
 * Alur:
 *   1. buatChargeIpaymu(): POST /api/v2/payment/direct -> nomor VA / isi QRIS + batas waktu. TransactionId iPaymu
 *      disimpan di transaksi.gateway_ref.
 *   2. iPaymu memanggil notifyUrl /api/ipaymu/notifikasi. Isi callback TIDAK dipercaya: reference_id + trx_id harus
 *      cocok dengan transaksi kita, lalu status DIAMBIL ULANG dari POST /api/v2/transaction (sumber kebenaran).
 * Tanda tangan permintaan: HMAC-SHA256(apiKey, "POST:" + va + ":" + sha256(body JSON, hex kecil) + ":" + apiKey).
 * Tanpa dependensi: fetch + node:crypto. Kunci tidak pernah keluar dari server.
 */

export interface KonfigIpaymu {
  va: string;
  apiKey: string;
  produksi: boolean;
}

export function konfigIpaymu(): KonfigIpaymu | null {
  const va = process.env.IPAYMU_VA?.trim();
  const apiKey = process.env.IPAYMU_API_KEY?.trim();
  if (!va || !apiKey) return null;
  const sandbox = process.env.IPAYMU_SANDBOX?.trim().toLowerCase();
  return { va, apiKey, produksi: !(sandbox === "1" || sandbox === "true" || sandbox === "ya") };
}

export const alamatIpaymu = (k: KonfigIpaymu) => (k.produksi ? "https://my.ipaymu.com" : "https://sandbox.ipaymu.com");

/** Kanal yang dilayani iPaymu Direct Payment, dengan paymentMethod/paymentChannel-nya. */
export const KANAL_IPAYMU: Partial<Record<KanalBayar, { metode: "qris" | "va" | "ewallet"; channel: string }>> = {
  qris: { metode: "qris", channel: "qris" },
  shopeepay: { metode: "ewallet", channel: "shopeepay" },
  dana: { metode: "ewallet", channel: "dana" },
  bca: { metode: "va", channel: "bca" },
  bni: { metode: "va", channel: "bni" },
  bri: { metode: "va", channel: "bri" },
  bsi: { metode: "va", channel: "bsi" },
  cimb: { metode: "va", channel: "cimb" },
  mandiri: { metode: "va", channel: "mandiri" },
  permata: { metode: "va", channel: "permata" },
};

/** Kanal iPaymu yang dipasang developer (KANAL_IPAYMU, dibatasi IPAYMU_KANAL bila diisi), urut seperti KANAL_BAYAR. */
export function kanalDilayaniIpaymu(): KanalBayar[] {
  const env = process.env.IPAYMU_KANAL?.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  return (Object.keys(KANAL_BAYAR) as KanalBayar[]).filter((x) => KANAL_IPAYMU[x] && (!env?.length || env.includes(x)));
}

interface GrupKanal {
  Code?: string;
  Channels?: { Code?: string; FeatureStatus?: string; HealthStatus?: string }[];
}

/**
 * Status kanal di akun merchant, persis seperti di dashboard iPaymu (GET /api/v2/payment-channels): `aktif` =
 * FeatureStatus "active", `sehat` = HealthStatus ("online", "maintenance", "offline"). Kanal yang tidak tercantum =
 * tidak ada di akun. Disimpan sementara oleh pemanggil (src/lib/gateway.ts).
 */
export async function bacaKanalAkunIpaymu(k: KonfigIpaymu): Promise<Map<KanalBayar, { aktif: boolean; sehat: string }>> {
  // Hasilnya dipakai bersama banyak permintaan, jadi tidak boleh terikat ke satu render: fetch asli (bukan fetch Next
  // yang dibatalkan saat prerender halaman selesai lebih dulu).
  const { http, d } = await panggil<GrupKanal[]>(k, "/api/v2/payment-channels", undefined, "GET", 8_000, true);
  if (!sukses(http, d) || !Array.isArray(d?.Data)) throw new IpaymuError(`kode ${d?.Status ?? http}${d?.Message ? `: ${d.Message}` : ""}`);
  const hasil = new Map<KanalBayar, { aktif: boolean; sehat: string }>();
  for (const g of d.Data)
    for (const c of g.Channels ?? []) {
      const kanal = (Object.keys(KANAL_IPAYMU) as KanalBayar[]).find((x) => {
        const m = KANAL_IPAYMU[x]!;
        return m.metode === "qris" ? g.Code === "qris" : g.Code === m.metode && c.Code === m.channel;
      });
      if (!kanal) continue;
      const aktif = c.FeatureStatus === "active";
      const lama = hasil.get(kanal);
      if (!lama || (aktif && !lama.aktif)) hasil.set(kanal, { aktif, sehat: String(c.HealthStatus ?? "online").toLowerCase() });
    }
  return hasil;
}

export class IpaymuError extends GatewayError {}

/** Tanda tangan header `signature` (lihat komentar berkas). */
export function tandaTanganIpaymu(k: Pick<KonfigIpaymu, "va" | "apiKey">, badan: string, metode = "POST"): string {
  const hash = createHash("sha256").update(badan).digest("hex").toLowerCase();
  return createHmac("sha256", k.apiKey).update(`${metode}:${k.va}:${hash}:${k.apiKey}`).digest("hex");
}

/** "YYYYMMDDhhmmss" WIB untuk header `timestamp`. */
const capWaktu = (ms = Date.now()) => new Date(ms + 7 * 3600_000).toISOString().slice(0, 19).replace(/[-T:]/g, "");

/** "2026-11-10 10:15:00" (WIB, format iPaymu) -> detik epoch. */
export function waktuIpaymu(s: unknown): number | null {
  const t = typeof s === "string" && s.trim() ? Date.parse(`${s.trim().replace(" ", "T")}+07:00`) : NaN;
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
}

interface Jawab<T> {
  Status?: number;
  Success?: boolean;
  Message?: string;
  Data?: T;
}

/** GET ditandatangani dengan badan "{}" (perilaku API iPaymu). VA sandbox bisa lambat: batas bawaan 30 dtk. */
async function panggil<T>(
  k: KonfigIpaymu,
  jalur: string,
  isi: Record<string, unknown> | undefined,
  metode: "POST" | "GET" = "POST",
  batasMs = 30_000,
  lepasRender = false,
): Promise<{ http: number; d: Jawab<T> | null }> {
  const badan = isi === undefined ? "{}" : JSON.stringify(isi);
  const f = (lepasRender && (globalThis.fetch as typeof fetch & { _nextOriginalFetch?: typeof fetch })._nextOriginalFetch) || fetch;
  const res = await f(`${alamatIpaymu(k)}${jalur}`, {
    method: metode,
    headers: { "Content-Type": "application/json", Accept: "application/json", va: k.va, signature: tandaTanganIpaymu(k, badan, metode), timestamp: capWaktu() },
    ...(metode === "POST" ? { body: badan } : {}),
    signal: AbortSignal.timeout(batasMs),
    cache: "no-store",
  });
  return { http: res.status, d: (await res.json().catch(() => null)) as Jawab<T> | null };
}

const sukses = (http: number, d: Jawab<unknown> | null) => http >= 200 && http < 300 && !!d && d.Status === 200 && d.Success !== false;

/** Pesan iPaymu yang berarti kanal ini belum aktif di akun merchant (bukan galat sementara). */
const POLA_KANAL_MATI = /(channel|method|metode|kanal)[^.]*(not|tidak|belum)[^.]*(activ|aktif|availab|tersedia|support)/i;

interface DataDirect {
  TransactionId?: number | string;
  PaymentNo?: string | number;
  QrString?: string;
  /** E-wallet: halaman checkout / pembuka aplikasi. */
  Url?: string;
  Expired?: string;
  Total?: number;
}

/**
 * Buat tagihan Direct Payment. feeDirection MERCHANT = pelanggan membayar tepat harga paket (biaya ditanggung kita).
 * phone wajib di iPaymu; akun kita tidak menyimpan nomor pelanggan, jadi dipakai IPAYMU_TELEPON (bawaan nomor netral).
 */
export async function buatChargeIpaymu(
  k: KonfigIpaymu,
  t: { orderId: string; jumlah: number; kanal: KanalBayar; item: { id: string; nama: string }; pelanggan: { nama: string; email: string }; notifyUrl: string; kembaliUrl: string }
): Promise<{ bayar: InstruksiBayar; kedaluwarsa: number; ref: string }> {
  const kanal = KANAL_IPAYMU[t.kanal];
  if (!kanal) throw new IpaymuError(`Kanal ${t.kanal} tidak dilayani iPaymu.`, "kanal", true);
  const menit = KANAL_BAYAR[t.kanal].menit;
  const { http, d } = await panggil<DataDirect>(k, "/api/v2/payment/direct", {
    name: t.pelanggan.nama.slice(0, 100),
    phone: process.env.IPAYMU_TELEPON?.trim() || "081000000000",
    email: t.pelanggan.email,
    amount: t.jumlah,
    notifyUrl: t.notifyUrl,
    returnUrl: t.kembaliUrl,
    referenceId: t.orderId,
    expired: menit,
    expiredType: "minutes",
    comments: t.item.nama.slice(0, 100),
    paymentMethod: kanal.metode,
    paymentChannel: kanal.channel,
    feeDirection: "MERCHANT",
    product: [t.item.nama.slice(0, 100)],
    qty: [1],
    price: [t.jumlah],
  });
  if (!sukses(http, d) || !d?.Data) {
    const kode = String(d?.Status ?? http);
    const pesan = d?.Message ?? "";
    throw new IpaymuError(`iPaymu menolak tagihan (kode ${kode})${pesan ? `: ${pesan}` : ""}`, kode, POLA_KANAL_MATI.test(pesan));
  }
  const x = d.Data;
  const bayar: InstruksiBayar =
    kanal.metode === "qris" ? { qr: x.QrString || (x.PaymentNo === undefined ? undefined : String(x.PaymentNo)) } : kanal.metode === "ewallet" ? { deeplink: x.Url } : { va: x.PaymentNo === undefined ? undefined : String(x.PaymentNo) };
  if (!bayar.qr && !bayar.va && !bayar.deeplink) throw new IpaymuError("iPaymu tidak mengirim data pembayaran.");
  if (x.TransactionId === undefined || x.TransactionId === null || x.TransactionId === "") throw new IpaymuError("iPaymu tidak mengirim TransactionId.");
  return { bayar, kedaluwarsa: waktuIpaymu(x.Expired) ?? Math.floor(Date.now() / 1000) + menit * 60, ref: String(x.TransactionId) };
}

export interface StatusIpaymu {
  TransactionId?: number | string;
  ReferenceId?: string;
  Amount?: number | string;
  Status?: number | string;
  StatusDesc?: string;
  PaymentChannel?: string;
  Via?: string;
  Channel?: string;
}

/** Status transaksi langsung dari API iPaymu (POST /api/v2/transaction), bukan dari isi callback. */
export async function statusIpaymu(k: KonfigIpaymu, trxId: string): Promise<StatusIpaymu> {
  const { http, d } = await panggil<StatusIpaymu>(k, "/api/v2/transaction", { transactionId: /^\d+$/.test(trxId) ? Number(trxId) : trxId }, "POST", 15_000);
  if (!sukses(http, d) || !d?.Data) throw new IpaymuError(`Status transaksi iPaymu tidak terbaca (kode ${d?.Status ?? http})${d?.Message ? `: ${d.Message}` : ""}`);
  return d.Data;
}

/**
 * Kode status iPaymu -> status kita: 1 berhasil, 6 berhasil (belum settle), 7 escrow = lunas; 0 pending; -2 expired;
 * 2 batal; 3 refund; 4 error / 5 gagal.
 */
export function petaStatusIpaymu(s: Pick<StatusIpaymu, "Status">): StatusBayar {
  switch (Number(s.Status)) {
    case 1:
    case 6:
    case 7:
      return "lunas";
    case 0:
      return "menunggu";
    case -2:
      return "kedaluwarsa";
    case 2:
      return "dibatalkan";
    case 3:
      return "dikembalikan";
    default:
      return "gagal";
  }
}
