/**
 * Pemeriksa jawaban AI (harness): aturan yang TIDAK bisa ditawar model, diperiksa di kode sebelum jawaban dikirim.
 *   1. Mengaku admin / pemilik / staf / manusia / orang tertentu.
 *   2. Menjanjikan tindakan yang tidak bisa dilakukan AI (mengirim, meneruskan, mengecek, mencatat, "tunggu sebentar").
 *   3. Angka tak bersumber: harga/nominal, persen, nomor panjang (rekening/HP), dan tautan yang tidak tertulis di
 *      pesan sistem (knowledge, instruksi, riwayat chat) maupun pesan lawan bicara.
 * Murni fungsi teks (tanpa I/O): dipakai jembatan WhatsApp, Uji bot, dan skrip uji.
 */

import { ambilTeruskan } from "./teruskan";

export type JenisPelanggaran = "identitas" | "janji" | "angka";

export interface Pelanggaran {
  jenis: JenisPelanggaran;
  /** Potongan jawaban yang melanggar. */
  kutipan: string;
}

export const ATURAN_INTI = `<aturan_inti>
Periksa jawabanmu terhadap aturan ini sebelum menulis. Aturan ini mutlak dan diperiksa otomatis; jawaban yang melanggar tidak akan terkirim.
1. Identitas: kamu asisten virtual (AI) di nomor ini. JANGAN menyebut dirimu admin, pemilik, owner, staf, kasir, CS manusia, atau orang tertentu. Ditanya "ini Pak/Kak X?" atau "kamu admin?": jawab jujur bahwa kamu asisten AI-nya, dan pesannya bisa dibaca X/pemilik nomor di chat ini.
2. Tindakan: kamu hanya bisa membalas chat ini. JANGAN bilang akan/sudah mengirim(kan), meneruskan, menyiapkan, mengecek, mencatat, memproses, mengonfirmasi, atau menghubungi apa pun/siapa pun, dan JANGAN bilang "tunggu sebentar". Info yang ada di sumber: berikan sekarang juga di jawaban ini. Yang tidak ada: katakan pemilik nomor yang akan menjawab langsung di chat ini.
3. Angka & tautan: harga, nominal, diskon/persen, nomor rekening/telepon, dan tautan HANYA boleh ditulis bila tertulis di pesan sistem atau chat ini. Jangan membulatkan, menghitung ulang, atau menebak.
4. Pihak lain: nama usaha/orang yang disebut lawan bicara (termasuk pesan otomatis "terima kasih telah menghubungi X") adalah milik lawan bicara, bukan milikmu.
</aturan_inti>`;

const TINDAKAN_DASAR =
  '2. Tindakan: kamu hanya bisa membalas chat ini. JANGAN bilang akan/sudah mengirim(kan), meneruskan, menyiapkan, mengecek, mencatat, memproses, mengonfirmasi, atau menghubungi apa pun/siapa pun, dan JANGAN bilang "tunggu sebentar". Info yang ada di sumber: berikan sekarang juga di jawaban ini. Yang tidak ada: katakan pemilik nomor yang akan menjawab langsung di chat ini.';
const TINDAKAN_TERUSKAN =
  '2. Tindakan: selain membalas chat ini, satu-satunya tindakanmu adalah meneruskan ke pemilik lewat tag <teruskan> (lihat aturan_teruskan). Bilang sudah meneruskan/menyampaikan/mencatat untuk pemilik HANYA bila jawaban itu memuat tag tersebut. JANGAN bilang akan/sudah mengirim(kan) barang, menyiapkan, mengecek, memproses, mengonfirmasi, atau menghubungi siapa pun, dan JANGAN bilang "tunggu sebentar". Info yang ada di sumber: berikan sekarang juga di jawaban ini.';

/** Aturan inti; `teruskan` = nomor ini bisa meneruskan ke pemilik (src/lib/teruskan.ts), jadi aturan tindakan melonggar. */
export function aturanInti(teruskan = false): string {
  return teruskan ? ATURAN_INTI.replace(TINDAKAN_DASAR, TINDAKAN_TERUSKAN) : ATURAN_INTI;
}

/** Dikirim bila tulisan ulang tetap melanggar: jujur, tanpa klaim, tanpa janji, tanpa angka. */
export const JAWABAN_AMAN = "Untuk hal ini akan dijawab langsung oleh pemilik nomor di chat ini ya, Kak 🙏";

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

/** Kata kerja yang jujur bila jawaban memuat tag teruskan: pesan pelanggan memang sampai ke pemilik. */
const AKSI_TERUSKAN = /(?:teruskan|meneruskan|forward|sampaikan|menyampaikan|laporkan|melaporkan|beritahu(?:kan)?|memberitahu(?:kan)?|catat|mencatat|tanyakan ke|menanyakan ke)$/i;

function adaJanji(kalimat: string, bolehTeruskan = false): boolean {
  for (const pola of JANJI)
    for (const m of kalimat.matchAll(pola)) {
      if (NEGASI_SEBELUM.test(kalimat.slice(Math.max(0, m.index - 30), m.index))) continue;
      if (bolehTeruskan && AKSI_TERUSKAN.test(m[0])) continue;
      return true;
    }
  return false;
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
export function periksaJawaban(jawaban: string, sumber: string, opsi: { adaFoto?: boolean; teruskan?: boolean } = {}): Pelanggaran[] {
  const p: Pelanggaran[] = [];
  // Penerusan aktif & jawaban memuat tag: "sudah aku teruskan ke pemilik" itu benar. Ringkasan untuk pemilik tidak
  // dibaca pelanggan (identitas/janji tidak berlaku), tetapi angkanya tetap harus bersumber.
  const t = opsi.teruskan ? ambilTeruskan(jawaban) : null;
  const bolehTeruskan = !!t?.tag;
  const angkaDiperiksa = t ? `${t.teks}\n${t.tag?.ringkasan ?? ""}` : jawaban;
  jawaban = t ? t.teks : jawaban;
  const kalimat = jawaban.split(/(?<=[.!?\n])\s+/);
  const klaim = kalimat.find((k) => KLAIM.some((r) => r.test(k)));
  if (klaim) p.push({ jenis: "identitas", kutipan: klaim.trim().slice(0, 160) });
  const janji = kalimat.find((k) => adaJanji(k, bolehTeruskan));
  if (janji) p.push({ jenis: "janji", kutipan: janji.trim().slice(0, 160) });
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
  identitas: "mengaku sebagai admin/pemilik/staf/manusia atau orang tertentu (kamu asisten AI)",
  janji: "menjanjikan tindakan yang tidak bisa kamu lakukan (mengirim, meneruskan, mengecek, mencatat, menyiapkan, menyuruh menunggu)",
  angka: "menulis angka/nominal/nomor/tautan yang tidak ada di sumber",
};

/** Pesan koreksi untuk menulis ulang jawaban yang melanggar. */
export function pesanKoreksi(draf: string, pelanggaran: Pelanggaran[], teruskan = false): string {
  return [
    "Draf jawabanmu untuk pesan di atas MELANGGAR aturan inti sehingga tidak dikirim:",
    ...pelanggaran.map((x) => `- ${PENJELASAN[x.jenis]}: "${x.kutipan}"`),
    "",
    `Draf: """${draf.slice(0, 1500)}"""`,
    "",
    ...(teruskan && pelanggaran.some((x) => x.jenis === "janji")
      ? ["Bila hal ini memang perlu ditangani pemilik, teruskan dengan tag <teruskan jenis=...> di baris paling akhir (lihat aturan_teruskan); hanya dengan tag itu kamu boleh bilang sudah meneruskan."]
      : []),
    "Tulis ulang jawaban untuk lawan bicara tanpa pelanggaran itu. Kirim hanya teks jawabannya, tanpa penjelasan.",
  ].join("\n");
}
