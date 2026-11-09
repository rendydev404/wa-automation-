import type { KanalBayar } from "./harga";

/**
 * Definisi bersama payment gateway (aman diimpor dari komponen klien: tanpa server-only, tanpa jaringan).
 * Implementasinya di src/lib/gateway.ts (registri adapter), src/lib/midtrans.ts, dan src/lib/ipaymu.ts.
 */

export const GATEWAY = {
  midtrans: { label: "Midtrans", info: "QRIS, GoPay, ShopeePay, dan virtual account. Refund otomatis untuk GoPay/ShopeePay/QRIS." },
  ipaymu: { label: "iPaymu", info: "QRIS (semua e-wallet & m-banking) dan virtual account. Uang kembali ditransfer manual oleh admin." },
} as const;
export type Gateway = keyof typeof GATEWAY;
export const GATEWAY_BAWAAN: Gateway = "midtrans";
export const gatewaySah = (x: unknown): x is Gateway => typeof x === "string" && Object.hasOwn(GATEWAY, x);
export const labelGateway = (g: string | null | undefined): string => (gatewaySah(g) ? GATEWAY[g].label : "Midtrans");

/**
 * Cara memakai provider (settings `gateway_aktif`), dipilih admin:
 *   midtrans / ipaymu = semua metode lewat satu provider saja;
 *   hybrid = tiap metode lewat provider yang dipilih admin (PETA_HYBRID_BAWAAN bila belum diatur). Metode yang tidak
 *   dilayani provider pilihannya otomatis lewat provider lain yang melayaninya.
 */
export const MODE_GATEWAY = {
  midtrans: { judul: "Hanya Midtrans", isi: "Semua metode bayar lewat Midtrans." },
  ipaymu: { judul: "Hanya iPaymu", isi: "Semua metode bayar lewat iPaymu." },
  hybrid: { judul: "Hybrid (campuran)", isi: "Tiap metode bayar lewat provider yang kamu pilih. Metode yang tidak ada di Midtrans ditambal iPaymu." },
} as const;
export type ModeGateway = keyof typeof MODE_GATEWAY;
export const modeGatewaySah = (x: unknown): x is ModeGateway => typeof x === "string" && Object.hasOwn(MODE_GATEWAY, x);
/** Bawaan mode hybrid: BCA VA, ShopeePay, dan DANA lewat iPaymu; metode lain lewat Midtrans. */
export const PETA_HYBRID_BAWAAN: Partial<Record<KanalBayar, Gateway>> = { bca: "ipaymu", shopeepay: "ipaymu", dana: "ipaymu" };

/**
 * Kanal yang disembunyikan dari pembeli (settings `kanal_mati` untuk Midtrans, `kanal_mati_<provider>` lainnya): ditolak
 * provider karena belum aktif di akun (`otomatis`), atau disembunyikan admin di /admin/transaksi. Tetap tersembunyi
 * sampai admin menampilkannya lagi, jadi pembeli lain (juga setelah restart) tidak ikut memilih kanal yang pasti gagal.
 */
export interface KanalMati {
  oleh: "otomatis" | "admin";
  waktu: number;
  alasan?: string;
}

/** Status transaksi internal, sama untuk semua provider. */
export type StatusBayar = "menunggu" | "lunas" | "gagal" | "kedaluwarsa" | "dibatalkan" | "dikembalikan";

/**
 * Galat dari provider mana pun. `kode` = kode jawaban provider (mis. "402"), `kanalMati` = kanal ini pasti ditolak
 * provider (belum aktif di akun) sehingga disembunyikan dari pembeli lain.
 */
export class GatewayError extends Error {
  readonly kode?: string;
  readonly kanalMati: boolean;
  constructor(pesan: string, kode?: string, kanalMati = false) {
    super(pesan);
    this.kode = kode;
    this.kanalMati = kanalMati;
  }
}
