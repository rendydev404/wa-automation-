/**
 * Serah ke tim: AI hanya bisa membalas chat yang sedang berlangsung. Untuk hal yang butuh manusia (pesanan,
 * bukti bayar, keluhan), ia merapikan datanya di chat itu dan pemilik membalas langsung dari HP/WhatsApp Web.
 *
 * Dulu ringkasannya diteruskan otomatis ke WhatsApp pribadi pemilik, tetapi pesan tanpa diminta dari nomor bisnis ke
 * nomor yang tidak sedang chat dengannya adalah pola yang memicu blokir WhatsApp, jadi fitur itu dicabut: bot tidak
 * pernah mengirim pesan selain balasan di chat yang memulainya. Modul ini murni teks (tanpa I/O).
 */

export const ATURAN_SERAH_TIM = `<aturan_serah_tim>
Kamu hanya bisa membalas chat ini. Untuk pesanan, bukti bayar, keluhan, atau permintaan bicara dengan orang: kumpulkan datanya dengan rapi di chat ini, lalu bilang dengan wajar bahwa tim kami akan membalas langsung di chat ini.
</aturan_serah_tim>`;

/** Sisa tag <teruskan> dari kebiasaan lama model tidak boleh sampai ke pelanggan. */
export const buangTagTeruskan = (jawaban: string): string =>
  jawaban
    .replace(/<teruskan\b[^>]*>[\s\S]*?(?:<\/teruskan>|$)/gi, "")
    .replace(/<\/?teruskan[^>]*>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
