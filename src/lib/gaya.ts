/**
 * Gaya ngobrol AI di WhatsApp (harness): supaya balasan terdengar seperti CS manusia yang paham obrolan, bukan robot
 * yang tiap pesan mulai dari nol. Tiga bagian:
 *   1. ATURAN_GAYA: ikut di pesan sistem tiap balasan pelanggan (semua penyedia, termasuk Hermes yang SOUL-nya dipasang
 *      manual): bahasa sehari-hari, memahami pesan pendek dari konteks, dan menenangkan pelanggan yang mengeluh.
 *   2. blokPosisi: memberi tahu AI posisi percakapan (awal chat, sedang berjalan, atau kembali setelah lama), jadi AI
 *      tidak membuka dengan "Halo Kak" lagi di tengah obrolan.
 *   3. buangSalamUlang: pengaman di kode. Bila obrolan sedang berjalan dan AI tetap membuka dengan salam, salamnya
 *      dibuang sebelum dikirim.
 * Murni fungsi teks (tanpa I/O).
 */

export const ATURAN_GAYA = `<gaya_ngobrol>
Ngobrol seperti CS manusia yang asik: santai tapi tetap sopan, bahasa sehari-hari, tidak baku, tidak kaku.
- Pahami konteks dulu. Baca pesan terakhir bersama obrolan sebelumnya. Pesan pendek atau menggantung ("cuma itu doang?", "soalnya tutup mulu", "terus gimana?", "yang tadi", "kok gitu") merujuk ke topik yang sedang dibahas: tangkap maksud yang paling masuk akal lalu jawab itu. Jangan bilang "kurang paham" kalau maksudnya bisa ditebak dari obrolan. Kalau memang ragu, tanya balik sambil menyebut tebakanmu ("Maksudnya yang di outlet tadi ya Kak?").
- Nyambung dan konsisten. Jangan mengulang info yang sudah disampaikan kecuali diminta, dan jangan bertentangan dengan jawaban sebelumnya. Kalau jawaban sebelumnya ternyata kurang lengkap atau keliru, akui dengan santai ("Eh iya, tadi aku kurang lengkap nih") lalu betulkan.
- Bahasa: pakai kata sehari-hari (bisa, nggak, aja, kok, nih, ya, sih, dong) secukupnya, kalimat pendek seperti chat biasa. Hindari kata kaku/formal seperti "dapat", "tidak dapat", "silakan", "terkait", "apabila", "tersebut", "adapun", "mohon maaf atas ketidaknyamanannya", "dengan senang hati". Jangan memulai tiap balasan dengan pembuka yang sama ("Siap Kak", "Baik Kak", "Halo Kak"); variasikan dan seringnya langsung ke inti.
- Pelanggan mengeluh, kesal, kecewa, atau sedih: tenangkan dulu, baru solusi.
  1. Akui perasaannya dengan tulus dan spesifik pada masalahnya ("Yah, sayang banget ya Kak udah jauh-jauh ke sana tapi malah tutup"). Minta maaf cukup sekali, hangat, bukan kalimat template.
  2. Jangan membela diri, menyalahkan pelanggan, atau berdebat. Jangan membuat pelanggan merasa dicuekin atau dioper-oper.
  3. Kasih jalan keluar nyata yang ADA di sumber (pilihan lain, cara lain, langkah berikutnya), jangan cuma menyuruh menunggu.
  4. Kalau perlu tim, bilang tim kami bakal bantu langsung di chat ini, dan minta detail yang dibutuhkan (maksimal 2 hal).
  Tetap ikuti aturan sumber fakta: jangan menjanjikan refund, ganti rugi, diskon, atau waktu yang tidak ada di sumber.
</gaya_ngobrol>`;

export interface PosisiPercakapan {
  /** Banyaknya balasan (AI maupun manusia) yang sudah dikirim ke lawan bicara ini di percakapan yang tersimpan. */
  balasan: number;
  /** Detik sejak balasan terakhir; null = belum pernah dibalas atau waktunya tidak diketahui (Uji bot). */
  detikSejakBalasan: number | null;
}

/** Jeda yang masih dianggap satu obrolan yang sama: lewat dari ini, sapaan singkat lagi boleh. */
export const JEDA_OBROLAN_DTK = 6 * 3600;

/** Obrolan sedang berjalan: sudah ada balasan dan (bila waktunya diketahui) belum lewat JEDA_OBROLAN_DTK. */
export const obrolanBerjalan = (p: PosisiPercakapan | undefined): boolean =>
  !!p && p.balasan > 0 && (p.detikSejakBalasan === null || p.detikSejakBalasan < JEDA_OBROLAN_DTK);

function lamaJeda(dtk: number): string {
  if (dtk < 90) return "barusan";
  if (dtk < 3600) return `${Math.round(dtk / 60)} menit lalu`;
  if (dtk < 86400) return `${Math.round(dtk / 3600)} jam lalu`;
  return `${Math.round(dtk / 86400)} hari lalu`;
}

export function blokPosisi(p: PosisiPercakapan): string {
  let isi: string;
  if (p.balasan === 0)
    isi = "Ini awal percakapan dengan orang ini. Boleh menyapa singkat sekali (misalnya \"Halo Kak\"), lalu langsung jawab pertanyaannya.";
  else if (obrolanBerjalan(p))
    isi =
      `Obrolan ini sedang berjalan (sudah dibalas ${p.balasan} kali${p.detikSejakBalasan !== null ? `, terakhir ${lamaJeda(p.detikSejakBalasan)}` : ""}). ` +
      'JANGAN membuka dengan salam atau sapaan pembuka (Halo, Hai, Hi, Selamat pagi/siang/sore/malam, "terima kasih sudah menghubungi") dan jangan memperkenalkan diri lagi. ' +
      "Langsung nyambung ke pesan terakhir, seperti orang yang sedang chat bolak-balik.";
  else
    isi =
      `Orang ini kembali chat setelah jeda (balasan terakhir ${lamaJeda(p.detikSejakBalasan ?? 0)}). Boleh sapa singkat yang nyambung (misalnya "Halo lagi Kak"), tanpa memperkenalkan diri ulang; obrolan sebelumnya tetap jadi konteks.`;
  return `<posisi_percakapan>\n${isi}\n</posisi_percakapan>`;
}

/** Huruf kecil -> kelas dua huruf ("kak" -> "[kK][aA][kK]"), supaya regex tanpa flag i (nama tetap wajib kapital). */
const ci = (s: string) => s.replace(/[a-z]/g, (c) => `[${c}${c.toUpperCase()}]`);
const SAPAAN = ci("(?:kak(?:ak)?|ka|pak|bapak|bu|ibu|mas|mbak|mba|bang|abang|sis|gan|om|tante|dek|teh|kang|bro)");
const EMOJI = String.raw`\p{Extended_Pictographic}\u{FE0F}\u{200D}`;
/**
 * Salam pembuka di awal balasan: "Halo Kak,", "Hai Kak Rendy!", "Selamat malam Kak 🙏", "Halo lagi Kak,".
 * Wajib diakhiri tanda baca/emoji/baris baru supaya kata sesudahnya tidak ikut terpotong; nama (huruf besar) opsional.
 */
const SALAM = `(?:${ci("(?:halo+|hallo+|helo+|hai+|hay|hi|hei|hey)")}|${ci("selamat")}\\s+${ci("(?:pagi|siang|sore|malam)")})`;
const POLA_SALAM = new RegExp(
  String.raw`^\s*${SALAM}(?:\s+${ci("(?:lagi|juga)")})?` +
    String.raw`(?:\s+${SAPAAN})?(?:\s+\p{Lu}[\p{L}'-]*)?` +
    String.raw`\s*(?:[,!.~]+|[${EMOJI}]+|(?=\n))[\s${EMOJI}]*`,
  "u"
);

/**
 * Buang salam pembuka bila obrolan sedang berjalan. Balasan yang isinya hanya salam (tidak ada sisa) tidak diubah.
 * Huruf pertama sisa balasan dijadikan kapital.
 */
export function buangSalamUlang(teks: string, posisi: PosisiPercakapan | undefined): string {
  if (!obrolanBerjalan(posisi)) return teks;
  const m = POLA_SALAM.exec(teks);
  if (!m) return teks;
  const sisa = teks.slice(m[0].length).trimStart();
  if (sisa.length < 2) return teks;
  return sisa.charAt(0).toLocaleUpperCase("id-ID") + sisa.slice(1);
}
