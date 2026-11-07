/**
 * Aturan jaminan uang kembali (lihat src/lib/jaminan.ts). Tanpa "server-only": dipakai juga oleh komponen klien,
 * landing, dan modul afiliasi (masa tahan komisi) tanpa menarik modul server.
 */

/** Batas pengajuan sejak dibayar (hari). Juga masa tahan komisi afiliasi sebelum bisa ditarik. */
export const JAMINAN_HARI = 3;
/** Pemakaian balasan AI paling banyak sekian persen dari kuota paket supaya masih bisa diajukan. */
export const JAMINAN_MAKS_PAKAI_PERSEN = 20;

/**
 * Kanal yang bisa dikembalikan lewat Refund API Midtrans. Dokumentasi Midtrans: refund hanya untuk kartu, GoPay,
 * ShopeePay, QRIS, DANA, OVO, Kredivo, Akulaku; VA bank (BCA, BNI, BRI, Mandiri, Permata) TIDAK bisa di-refund. Batas
 * waktu refund terpendek di antara kanal ini 7 hari (QRIS off-us), jadi jaminan JAMINAN_HARI hari selalu masih bisa diproses.
 */
export const KANAL_REFUND = ["gopay", "shopeepay", "qris"] as const;
export const kanalBisaRefund = (k: string | null | undefined): boolean => !!k && (KANAL_REFUND as readonly string[]).includes(k);

/**
 * Cara dana dikembalikan, dipilih admin (settings `refund_mode`):
 *   - "manual" (bawaan): pemilik akun mengisi rekening/e-wallet tujuan, admin mentransfer sendiri lalu menandai selesai;
 *   - "otomatis": Refund API Midtrans ke metode bayar asal, tanpa admin. Butuh fitur Refund diaktifkan Midtrans dulu.
 */
export type ModeRefund = "manual" | "otomatis";
export const MODE_REFUND_BAWAAN: ModeRefund = "manual";
