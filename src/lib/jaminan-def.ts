/**
 * Aturan jaminan uang kembali (lihat src/lib/jaminan.ts). Tanpa "server-only": dipakai juga oleh komponen klien,
 * landing, dan modul afiliasi (masa tahan komisi) tanpa menarik modul server.
 */

/** Batas pengajuan sejak dibayar (hari). Juga masa tahan komisi afiliasi sebelum bisa ditarik. */
export const JAMINAN_HARI: number = 1;
/** Masa jaminan dalam teks: "1×24 jam" (id), "24 hours" (en, kata benda), "24-hour" (en, sifat). */
export const MASA_ID = JAMINAN_HARI === 1 ? "1×24 jam" : `${JAMINAN_HARI} hari`;
export const MASA_EN = JAMINAN_HARI === 1 ? "24 hours" : `${JAMINAN_HARI} days`;
export const MASA_EN_ADJ = JAMINAN_HARI === 1 ? "24-hour" : `${JAMINAN_HARI}-day`;
/** Pemakaian balasan AI paling banyak sekian persen dari kuota paket supaya masih bisa diajukan. */
export const JAMINAN_MAKS_PAKAI_PERSEN = 20;
/** Lama proses pengembalian dana setelah pengajuan diterima (hari kerja), yang dijanjikan ke pelanggan. */
export const PROSES_REFUND_HARI_KERJA = [3, 7] as const;
const PROSES = `${PROSES_REFUND_HARI_KERJA[0]}–${PROSES_REFUND_HARI_KERJA[1]}`;
/** "3–7 hari kerja" / "3–7 business days". */
export const teksProsesRefund = (t: (id: string, en: string) => string): string => t(`${PROSES} hari kerja`, `${PROSES} business days`);

/**
 * Kanal yang bisa dikembalikan lewat Refund API Midtrans. Dokumentasi Midtrans: refund hanya untuk kartu, GoPay,
 * ShopeePay, QRIS, DANA, OVO, Kredivo, Akulaku; VA bank (BCA, BNI, BRI, Mandiri, Permata) TIDAK bisa di-refund. Batas
 * waktu refund terpendek di antara kanal ini 7 hari (QRIS off-us), jadi jaminan 1×24 jam selalu masih bisa diproses.
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

/**
 * Syarat & ketentuan jaminan uang kembali yang ditampilkan ke pelanggan (landing & halaman Langganan). Satu sumber
 * supaya teksnya selalu sama dengan aturan yang benar-benar diperiksa server (jaminan.ts).
 */
export function syaratJaminan(t: (id: string, en: string) => string): string[] {
  return [
    t("Hanya untuk pembayaran pertama akun (bukan perpanjangan atau pembelian berikutnya).", "Only for the account's first payment (not renewals or later purchases)."),
    t(`Diajukan paling lambat ${MASA_ID} sejak pembayaran; lewat dari itu tombolnya hilang.`, `Request it within ${MASA_EN} of paying; after that the button disappears.`),
    t("Dibayar lewat GoPay, ShopeePay, atau QRIS. Pembayaran lewat virtual account (VA) bank tidak termasuk.", "Paid with GoPay, ShopeePay, or QRIS. Bank virtual account (VA) payments aren't covered."),
    t(`Balasan AI yang terpakai paling banyak ${JAMINAN_MAKS_PAKAI_PERSEN}% dari kuota paket.`, `At most ${JAMINAN_MAKS_PAKAI_PERSEN}% of the plan's AI reply quota has been used.`),
    t("Satu kali per orang: nomor WhatsApp atau email yang sama tidak bisa memakainya lagi lewat akun baru.", "Once per person: the same WhatsApp number or email can't use it again through a new account."),
    t("Wajib menuliskan alasan saat mengajukan dari halaman Langganan.", "You must give a reason when requesting it from the Subscription page."),
    t(`Pengembalian dana diproses ${PROSES} hari kerja setelah pengajuan diterima.`, `Refunds are processed within ${PROSES} business days after the request is received.`),
    t("Dana dikembalikan 100% dan paket langsung dihentikan begitu dana dikembalikan.", "You get 100% back, and the plan stops as soon as the refund is made."),
  ];
}
