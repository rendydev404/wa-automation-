/**
 * Pemeriksa jawaban AI (harness): aturan yang TIDAK bisa ditawar model, diperiksa di kode sebelum jawaban dikirim.
 *   1. Mengaku admin / pemilik / staf / manusia / orang tertentu.
 *   2. Menjanjikan tindakan yang tidak bisa dilakukan AI (mengirim, meneruskan, mengecek, mencatat, "tunggu sebentar").
 *   3. Angka tak bersumber: harga/nominal, persen, nomor panjang (rekening/HP), dan tautan yang tidak tertulis di
 *      pesan sistem (knowledge, instruksi, riwayat chat) maupun pesan lawan bicara.
 *   4. Gaya robot (hanya bila pesan pelanggan diberikan): menyebut diri AI/bot/asisten virtual padahal tidak ditanya,
 *      atau menjelaskan cara kerja chat ("pemilik nomor", "pesan ini bisa dibaca", "berdasarkan informasi").
 *      Ditanya sungguh-sungguh "ini bot?" = boleh dijawab jujur; yang tetap dilarang adalah mengaku manusia (no. 1).
 *   5. Mesin: menyebut mesin/model/perusahaan AI di balik jawaban (Claude, Anthropic, Hermes, GPT, OpenAI, "model
 *      bahasa"). Pemilik akun maupun pelanggannya tidak boleh tahu mesin yang dipakai layanan ini. Nama yang memang
 *      ada di pengetahuan/instruksi nomor (mis. toko yang menjual akun ChatGPT) tidak dianggap pelanggaran.
 * Murni fungsi teks (tanpa I/O): dipakai jembatan WhatsApp, Uji bot, dan skrip uji.
 */

import { ambilKirimProduk } from "./katalog-def";

export type JenisPelanggaran = "identitas" | "janji" | "angka" | "robotik" | "mesin";

export interface Pelanggaran {
  jenis: JenisPelanggaran;
  /** Potongan jawaban yang melanggar. */
  kutipan: string;
}

export const ATURAN_INTI = `<aturan_inti>
Periksa jawabanmu terhadap aturan ini sebelum menulis. Aturan ini mutlak dan diperiksa otomatis; jawaban yang melanggar tidak akan terkirim.
1. Identitas: balas seperti CS manusia yang ramah dari tim usaha ini: pakai "aku" untuk dirimu, "kami"/"tim kami"/"admin kami" untuk usahanya, nama persona bila ada di instruksi. Jangan memperkenalkan diri sebagai AI/bot/asisten virtual (juga bila pengetahuan menyebutmu begitu) dan jangan menjelaskan cara kerja chat ini (pemilik nomor, sistem, otomatis, "berdasarkan informasi"). Tetapi JANGAN mengaku manusia, admin, pemilik, owner, staf, kasir, atau orang tertentu. Bila lawan bicara sungguh-sungguh bertanya apakah ia chat dengan bot/AI atau manusia, jangan berbohong: jawab singkat bahwa kamu asisten otomatis dari tim ini, lalu langsung lanjut membantu. Ditanya "ini Pak/Kak X?": jawab bahwa kamu dari tim X, bukan X sendiri. Jangan pernah menyebut nama mesin, model, atau perusahaan AI yang kamu pakai (misalnya Claude, Anthropic, Hermes, GPT, OpenAI, model bahasa); bila ditanya kamu pakai AI apa atau buatan siapa, jawab singkat bahwa kamu asisten dari tim ini dan detail teknisnya tidak bisa dibagikan, lalu lanjut membantu.
2. Tindakan: kamu hanya bisa membalas chat ini. JANGAN bilang kamu sendiri ("aku"/"kami") akan/sudah mengirim(kan), meneruskan, menyiapkan, mengecek, mencatat, memproses, mengonfirmasi, atau menghubungi apa pun/siapa pun, dan JANGAN bilang "tunggu sebentar". Info yang ada di sumber: berikan sekarang juga di jawaban ini. Yang tidak ada, atau butuh tindakan (keluhan, pesanan, pembayaran): boleh bilang dengan wajar bahwa tim kami bakal bantu/cek langsung di chat ini (tanpa menjanjikan waktu, dan jangan bilang tim sudah melakukannya).
3. Angka & tautan: harga, nominal, diskon/persen, nomor rekening/telepon, dan tautan HANYA boleh ditulis bila tertulis di pesan sistem atau chat ini. Jangan membulatkan, menghitung ulang, atau menebak.
4. Pihak lain: nama usaha/orang yang disebut lawan bicara (termasuk pesan otomatis "terima kasih telah menghubungi X") adalah milik lawan bicara, bukan milikmu.
</aturan_inti>`;

/** Dikirim bila tulisan ulang tetap melanggar: jujur, tanpa klaim, tanpa janji, tanpa angka. */
export const JAWABAN_AMAN = "Untuk yang ini nanti dijawab langsung sama tim kami di chat ini ya, Kak 🙏";

// ---------- 1. Identitas ----------

const PERAN = "admin|admin(?:nya)?|owner|pemilik(?:nya| nomor| usaha| toko)?|staf|staff|karyawan|kasir|pegawai|manusia|orang asli|cs manusia|customer service manusia";
const KLAIM: RegExp[] = [
  // "aku admin", "saya adalah pemilik", "aku ini owner" (bukan "aku bukan admin")
  new RegExp(`\\b(aku|saya|gue|gw)\\s+(?:adalah\\s+|ini\\s+|sebagai\\s+|selaku\\s+)?(?:${PERAN})\\b`, "i"),
  // "iya, ini Pak Akbar" / "betul, saya Bu Rini" / "ya, ini aku sendiri"
  // (sapaan & kata pembuka tanpa flag i, karena nama orangnya harus berhuruf besar)
  /\b(?:[Ii]ya|[Yy]a|[Bb]etul|[Bb]enar|[Bb]ener)\b[\s,!.]*(?:[Ii]ni|[Aa]ku|[Ss]aya|[Dd]engan)\s+(?:[Pp]ak|[Bb]u|[Bb]apak|[Ii]bu|[Mm]as|[Mm]bak|[Kk]ak)\s+[A-Z][a-z]+/,
  /\b(iya|ya|betul|benar)\b[\s,!.]*(ini\s+)?(aku|saya)\s+sendiri\b/i,
];

// ---------- 2. Janji tindakan ----------

const AKSI =
  "kirim(?:kan|in)?|mengirim(?:kan)?|teruskan|meneruskan|forward|siapkan|menyiapkan|cek(?:kan|in)?|mengecek|periksa|memeriksa|proses|memproses|catat|mencatat|hubungi|menghubungi|konfirmasi(?:kan)?|mengonfirmasi|carikan|mencarikan|buatkan|membuatkan|jadwalkan|menjadwalkan|pesankan|memesankan|infokan nanti|kabari|mengabari|update(?:kan)?|sampaikan|menyampaikan|tandai|menandai|laporkan|melaporkan|beritahu(?:kan)?|memberitahu(?:kan)?|ingatkan|mengingatkan|simpan|menyimpan|tanyakan ke|menanyakan ke";
const JANJI: RegExp[] = [
  // "aku kirim", "kami akan segera mengirimkan", "saya sudah teruskan", "aku bisa kirimkan", "saya bantu sampaikan"
  new RegExp(
    `\\b(aku|saya|kami|kita)\\s+(?:akan\\s+|sudah\\s+|segera\\s+|langsung\\s+|bakal\\s+|coba\\s+|mau\\s+|bantu\\s+|bisa\\s+|dapat\\s+|boleh\\s+|ingin\\s+|nanti\\s+)*(?:${AKSI})\\b`,
    "gi"
  ),
  // "sudah aku teruskan", "akan kami cek", "nanti aku kabari"
  new RegExp(`\\b(sudah|akan|segera|nanti)\\s+(aku|saya|kami|kita)\\s+(?:${AKSI})\\b`, "gi"),
  /\b(mohon\s+)?(tunggu|ditunggu)\s+(sebentar|sebentar ya|bentar)\b/gi,
  /\b(sedang|lagi)\s+(aku|saya|kami)\s+(cek|proses|siapkan|carikan)\b/gi,
];

/** "belum bisa aku cek", "tidak bisa saya kirimkan": penolakan jujur, bukan janji. */
const NEGASI_SEBELUM = /\b(belum|tidak|tak|nggak|ngga|gak|enggak|ga)\b(?:\s+\w+){0,2}\s*$/i;

/** Kata kerja yang jujur bila jawaban memuat tag kirim katalog: foto produk memang dikirim setelahnya. */
const AKSI_KIRIM = /(?:kirim(?:kan|in)?|mengirim(?:kan)?)$/i;

function adaJanji(kalimat: string, bolehKirim = false, katalogAktif = false): boolean {
  for (const pola of JANJI)
    for (const m of kalimat.matchAll(pola)) {
      // "Mau aku kirimkan katalognya?": tawaran, bukan janji; dikirim lewat tag setelah pelanggan mau.
      if (katalogAktif && AKSI_KIRIM.test(m[0]) && /\?\s*$/.test(kalimat.trim())) continue;
      if (NEGASI_SEBELUM.test(kalimat.slice(Math.max(0, m.index - 30), m.index))) continue;
      if (bolehKirim && AKSI_KIRIM.test(m[0])) continue;
      return true;
    }
  return false;
}

// ---------- 4. Gaya robot ----------

/** Menyebut diri AI/bot/asisten virtual. */
const DIRI_AI: RegExp[] = [
  /\b(?:aku|saya|gue|gw)\s+(?:adalah\s+|ini\s+|cuma\s+|hanya\s+|hanyalah\s+|sebuah\s+)*(?:asisten\s+(?:virtual|ai|digital|otomatis)|a\.?i\.?|bot|robot|chat\s?bot|program|mesin)\b/i,
  /\bsebagai\s+(?:asisten\s+(?:virtual|ai|digital)|a\.?i\.?|bot|chat\s?bot|robot)\b/i,
  /\basisten\s+(?:virtual|ai|digital)\b/i,
];
/** Menjelaskan cara kerja chat / sumber jawaban, khas jawaban robot. */
const META: RegExp[] = [
  /\bpemilik\s+nomor\b/i,
  /\b(?:pesan|chat)\s+(?:ini|kakak|kamu|anda)\s+(?:bisa|dapat|akan)\s+(?:langsung\s+)?dibaca\b/i,
  /\bbisa\s+membaca\s+(?:pesan|chat)\s+ini\b/i,
  /\bberdasarkan\s+(?:informasi|data|pengetahuan)\s+yang\s+(?:ada|tersedia|aku|saya)\b/i,
  /\b(?:aku|saya)\s+(?:tidak|belum)\s+(?:memiliki|punya)\s+(?:akses|informasi|data)\b/i,
  /\b(?:base\s+knowledge|basis\s+pengetahuan)\b/i,
];
/** Pelanggan bertanya apakah ia chat dengan bot/manusia: menjawab jujur "asisten otomatis" itu sah. */
const TANYA_BOT = /\b(?:bot|robot|a\.?i|chat\s?bot|manusia|orang\s+(?:asli|beneran|betulan)|mesin|otomatis|auto\s?reply|balasan\s+otomatis|asisten|admin(?:nya)?\s+(?:asli|beneran))\b/i;

// ---------- 5. Mesin AI ----------

/** Nama mesin/model/perusahaan AI yang tidak bermakna lain dalam percakapan jual-beli. */
const NAMA_JELAS = String.raw`claude|anthropic|open\s?ai|chat\s?gpt|gpt[-\s]?\d[\w.]*|nous\s+research|deepseek|qwen`;
/** Bermakna ganda (Hermes merek tas, Gemini zodiak/fitur HP): hanya dihitung dalam konteks AI yang tegas. */
const NAMA_GANDA = "hermes|gemini|llama|mistral";
const NAMA_SEMUA = `${NAMA_JELAS}|${NAMA_GANDA}`;
const MESIN: RegExp[] = [
  // "aku Claude", "saya menggunakan model GPT-4", "aku dibuat oleh Anthropic"
  new RegExp(`\\b(?:aku|saya|gue|gw)\\b[^.!?\\n]{0,40}?\\b(${NAMA_JELAS})\\b`, "i"),
  // "aku Hermes", "saya adalah Gemini"
  new RegExp(`\\b(?:aku|saya|gue|gw)\\s+(?:adalah\\s+|ini\\s+)?(${NAMA_GANDA})\\b`, "i"),
  // "asisten ini ditenagai Claude", "berbasis Hermes", "dikembangkan oleh Anthropic"
  new RegExp(`\\b(?:ditenagai|didukung|berbasis|dikembangkan|dilatih)\\b[^.!?\\n]{0,30}?\\b(${NAMA_SEMUA})\\b`, "i"),
  // "dibuat oleh OpenAI", "pakai ChatGPT" (kata kerja umum: hanya nama yang tidak bermakna ganda)
  new RegExp(`\\b(?:dibuat|buatan|menggunakan|memakai|pakai)\\b[^.!?\\n]{0,30}?\\b(${NAMA_JELAS})\\b`, "i"),
  // "model AI Claude", "mesin Hermes", "AI dari Anthropic", "Claude AI", "model Hermes"
  new RegExp(`\\b(?:model|mesin|a\\.?i\\.?|teknologi|llm)\\s+(?:a\\.?i\\.?\\s+)?(?:dari\\s+|buatan\\s+)?(${NAMA_SEMUA})\\b`, "i"),
  new RegExp(`\\b(${NAMA_SEMUA})\\s+(?:a\\.?i\\.?|llm)\\b`, "i"),
  // Istilah teknis yang hanya muncul bila AI menjelaskan dirinya.
  /\b(model\s+bahasa(?:\s+besar)?|large\s+language\s+model|llm)\b/i,
];

/**
 * Kalimat yang menyebut mesin AI di balik jawaban, kecuali namanya memang ada di sumber: pengetahuan/instruksi nomor
 * (toko yang menjual akun ChatGPT boleh menyebutnya). Pesan lawan bicara saat ini dan aturan inti (yang memuat
 * contoh nama-nama itu) tidak dihitung, jadi "kamu Claude ya?" dari pelanggan tidak membuat jawaban "iya" lolos.
 */
function sebutMesin(kalimat: string[], sumber: string, pesanPelanggan?: string): string | undefined {
  let lain = sumber.replace(/<aturan_inti>[\s\S]*?<\/aturan_inti>/g, " ");
  if (pesanPelanggan) lain = lain.split(pesanPelanggan).join(" ");
  lain = lain.toLowerCase().replace(/\s+/g, " ");
  return kalimat.find((k) =>
    MESIN.some((r) => {
      const m = k.match(r);
      return !!m && !lain.includes(m[1].toLowerCase().replace(/\s+/g, " "));
    })
  );
}

// ---------- 3. Angka & tautan ----------

const PENGALI: Record<string, number> = { rb: 1e3, ribu: 1e3, k: 1e3, jt: 1e6, juta: 1e6, m: 1e6 };

/** Angka uang/jumlah dalam teks -> nilai (Rp350.000, 350rb, 3,5 juta, 1.250.000, Rp 25k). */
function nilaiUang(teks: string): number[] {
  const hasil: number[] = [];
  const pola = /(rp\.?\s*)?(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d{1,2})?)\s*(rb|ribu|k|jt|juta)?\b/gi;
  for (const m of teks.matchAll(pola)) {
    const [, rp, angka, satuan] = m;
    if (!rp && !satuan) continue; // angka biasa (jam, jumlah porsi) diurus terpisah
    let n: number;
    if (/^\d{1,3}([.,]\d{3})+$/.test(angka)) n = Number(angka.replace(/[.,]/g, ""));
    else n = Number(angka.replace(",", "."));
    if (satuan) n *= PENGALI[satuan.toLowerCase()];
    if (Number.isFinite(n) && n > 0) hasil.push(Math.round(n));
  }
  return hasil;
}

const persen = (t: string) => [...t.matchAll(/(\d+(?:[.,]\d+)?)\s*(%|persen)/gi)].map((m) => Number(m[1].replace(",", ".")));
const nomorPanjang = (t: string) => [...t.matchAll(/(?:\+?\d[\d\s.-]{7,}\d)/g)].map((m) => m[0].replace(/\D/g, "")).filter((d) => d.length >= 8);
const tautan = (t: string) => [...t.matchAll(/https?:\/\/[^\s)>\]]+/gi)].map((m) => m[0].replace(/[.,!?]+$/, ""));
/** Akun media sosial (@nama) dan nama domain tanpa http (toko.com, contoh.co.id). */
const akunDanDomain = (t: string) => [
  ...[...t.matchAll(/(?<![\w.])@[A-Za-z0-9_.]{3,30}/g)].map((m) => m[0].replace(/\.+$/, "")),
  ...[...t.replace(/https?:\/\/\S+/gi, "").matchAll(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|id|net|org|io|app|me|tech|store|shop|site|online|biz|info|co)\b/gi)].map((m) => m[0]),
];

/** Semua bilangan di sumber, dalam berbagai bentuk penulisan, untuk dicocokkan. */
function bilanganSumber(sumber: string): Set<number> {
  const s = new Set<number>(nilaiUang(sumber));
  for (const m of sumber.matchAll(/\d{1,3}(?:[.,]\d{3})+|\d+/g)) {
    s.add(Number(m[0].replace(/[.,]/g, "")));
  }
  return s;
}

/**
 * `opsi.adaFoto`: pelanggan melampirkan foto pada giliran ini. Angka di jawaban bisa berasal dari foto (bukti
 * transfer, nomor order di tangkapan layar) yang tidak ada di sumber teks, jadi pemeriksaan angka dilewati;
 * identitas dan janji tetap diperiksa. (Diukur pada 796 jawaban lama: semua "nomor tak bersumber" berasal dari foto.)
 */
export function periksaJawaban(
  jawaban: string,
  sumber: string,
  opsi: { adaFoto?: boolean; katalog?: boolean; pesanPelanggan?: string } = {}
): Pelanggaran[] {
  const p: Pelanggaran[] = [];
  // Tag kirim katalog: "aku kirimkan fotonya ya" jadi benar (foto memang dikirim setelah jawaban ini).
  const kp = ambilKirimProduk(jawaban);
  const bolehKirim = !!opsi.katalog && !!kp.produk;
  jawaban = kp.teks;
  const angkaDiperiksa = jawaban;
  const kalimat = jawaban.split(/(?<=[.!?\n])\s+/);
  const klaim = kalimat.find((k) => KLAIM.some((r) => r.test(k)));
  if (klaim) p.push({ jenis: "identitas", kutipan: klaim.trim().slice(0, 160) });
  const janji = kalimat.find((k) => adaJanji(k, bolehKirim, !!opsi.katalog));
  if (janji) p.push({ jenis: "janji", kutipan: janji.trim().slice(0, 160) });
  if (opsi.pesanPelanggan !== undefined) {
    const ditanya = TANYA_BOT.test(opsi.pesanPelanggan);
    const robot = kalimat.find((k) => (!ditanya && DIRI_AI.some((r) => r.test(k))) || META.some((r) => r.test(k)));
    if (robot) p.push({ jenis: "robotik", kutipan: robot.trim().slice(0, 160) });
  }
  const mesin = sebutMesin(kalimat, sumber, opsi.pesanPelanggan);
  if (mesin) p.push({ jenis: "mesin", kutipan: mesin.trim().slice(0, 160) });
  if (opsi.adaFoto) return p;

  const angkaSumber = bilanganSumber(sumber);
  const digitSumber = sumber.replace(/\D/g, "");
  const tak = [
    ...nilaiUang(angkaDiperiksa).filter((n) => !angkaSumber.has(n)).map((n) => `nominal ${n.toLocaleString("id-ID")}`),
    ...persen(angkaDiperiksa).filter((n) => !angkaSumber.has(n)).map((n) => `${n}%`),
    ...nomorPanjang(angkaDiperiksa).filter((d) => !digitSumber.includes(d)).map((d) => `nomor ${d}`),
    ...tautan(angkaDiperiksa).filter((u) => !sumber.includes(u)).map((u) => `tautan ${u}`),
    ...akunDanDomain(angkaDiperiksa).filter((a) => !sumber.toLowerCase().includes(a.toLowerCase())).map((a) => `akun/situs ${a}`),
  ];
  if (tak.length) p.push({ jenis: "angka", kutipan: tak.join(", ") });
  return p;
}

const PENJELASAN: Record<JenisPelanggaran, string> = {
  identitas: "mengaku sebagai admin/pemilik/staf/manusia atau orang tertentu (kamu boleh bicara sebagai bagian dari tim, tapi jangan mengaku manusia atau orang tertentu)",
  janji: "menjanjikan tindakan yang tidak bisa kamu lakukan (mengirim, meneruskan, mengecek, mencatat, menyiapkan, menyuruh menunggu)",
  angka: "menulis angka/nominal/nomor/tautan yang tidak ada di sumber",
  mesin:
    "menyebut nama mesin, model, atau perusahaan AI di balik jawabanmu. Jangan sebut sama sekali; bila ditanya kamu pakai AI apa, jawab bahwa kamu asisten dari tim ini dan detail teknisnya tidak bisa dibagikan",
  robotik:
    'terdengar seperti robot: menyebut dirimu AI/bot/asisten virtual padahal tidak ditanya, atau menjelaskan cara kerja chat ("pemilik nomor", "pesan ini bisa dibaca", "berdasarkan informasi"). Tulis seperti CS manusia yang ramah; sebut "tim kami"/"admin kami" untuk pemiliknya',
};

/** Pesan koreksi untuk menulis ulang jawaban yang melanggar. */
export function pesanKoreksi(draf: string, pelanggaran: Pelanggaran[], katalog = false): string {
  return [
    "Draf jawabanmu untuk pesan di atas MELANGGAR aturan inti sehingga tidak dikirim:",
    ...pelanggaran.map((x) => `- ${PENJELASAN[x.jenis]}: "${x.kutipan}"`),
    "",
    `Draf: """${draf.slice(0, 1500)}"""`,
    "",
    ...(katalog ? ["Bila draf memuat tag <kirim_produk>, pertahankan tag itu di baris paling akhir (fotonya tetap dikirim)."] : []),
    "Tulis ulang jawaban untuk lawan bicara tanpa pelanggaran itu. Kirim hanya teks jawabannya, tanpa penjelasan.",
  ].join("\n");
}
