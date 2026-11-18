import "server-only";
import { randomBytes } from "node:crypto";
import { type Penyedia, tanyaAi } from "./ai";
import { tanyaHermes } from "./hermes";
import { periksaJawaban } from "./pemeriksa";
import { JENIS_USAHA, type KunciUsaha, bersihkanKerangka, cekKelengkapan, infoUsaha } from "./templat-usaha";

/**
 * Asisten penulis base knowledge: tulisan bebas pemilik usaha (atau dokumen lama) disusun ulang oleh AI (Hermes)
 * menjadi dokumen terstruktur yang mudah dipakai AI CS, plus daftar info penting yang belum ada. AI hanya boleh
 * merapikan; angka/tautan yang tidak ada di tulisan asli ditandai untuk diperiksa pengguna sebelum disimpan.
 */

/**
 * `maks` = dashboard (dokumen panjang dipecah per bagian `perBagian`, dirapikan paralel, lalu digabung; progres
 * dikirim bertahap). `maksApi` = Developer API yang menjawab sekali di akhir, jadi tetap satu panggilan AI.
 */
export const BATAS_RAPIKAN = { min: 20, maks: 1_000_000, maksApi: 15_000, perBagian: 15_000 } as const;

/** Bagian yang dirapikan bersamaan (beban mesin AI). Env RAPIKAN_PARALEL menggantinya. */
const PARALEL = Math.min(16, Math.max(1, Number(process.env.RAPIKAN_PARALEL) || 4));

export interface HasilRapikan {
  /** Tulisan asli setelah dibersihkan dari kerangka kosong (untuk kembali mengedit). */
  asli: string;
  teks: string;
  /** Pertanyaan singkat untuk info penting yang belum ditulis pemilik. */
  kurang: string[];
  /** Angka/nomor/tautan di hasil yang tidak ada di tulisan asli (kemungkinan dikarang AI). */
  peringatan: string[];
}

export class GalatRapikan extends Error {
  /** Pesan versi Inggris (tampilan /eng, dipilih di actions/API); `message` tetap bahasa Indonesia (juga untuk log). */
  en?: string;
  constructor(message: string, en?: string) {
    super(message);
    this.en = en;
  }
}

export function sistemRapikan(jenis: KunciUsaha | null): string {
  const j = jenis ? JENIS_USAHA[jenis] : null;
  const istilah = j?.istilah ?? "PRODUK / LAYANAN & HARGA";
  const transaksi = (j?.transaksi ?? "pesanan").toUpperCase();
  return `Kamu editor "base knowledge": catatan resmi yang dibaca asisten AI saat membalas chat WhatsApp pelanggan sebuah usaha. Dalam tugas ini kamu TIDAK sedang membalas pelanggan.
Pemilik usaha menulis catatannya dengan bahasa bebas (bisa berantakan, singkatan, salah ketik). Susun ulang menjadi dokumen yang rapi, jelas, dan terstruktur.${j ? `\nJenis usaha: ${j.label}.` : ""}

ATURAN MUTLAK
1. Pakai HANYA fakta yang ditulis pemilik. Jangan menambah atau menebak produk, harga, jam, alamat, nomor rekening/telepon, tautan, promo, ongkir, stok, atau kebijakan.
2. Jangan mengubah angka. Tulis harga lengkap dengan format Rp dan titik ribuan ("18rb" -> "Rp18.000", "1,5jt" -> "Rp1.500.000"). Produk tanpa harga: tulis "harga ditanyakan ke pemilik".
3. Perbaiki ejaan dan susunan kalimat; satu info per baris; bahasa Indonesia yang jelas.
4. Bagian yang informasinya tidak ada: jangan ditulis (kecuali PERAN & GAYA BAHASA dan PROMO, lihat format).
5. Info penting yang belum ada (mis. jam buka, alamat/area, cara bayar, harga yang kosong): tulis sebagai pertanyaan singkat untuk pemilik di <kurang>, paling banyak 5. Tidak ada yang kurang: <kurang></kurang> kosong.
6. Jangan menulis apa pun di luar dua tag di bawah.

FORMAT JAWABAN
<knowledge>
# PERAN & GAYA BAHASA
Kamu membalas chat WhatsApp untuk (nama usaha) seperti CS yang ramah dari tim (nama usaha). (Gaya bahasa dari pemilik; bila tidak disebut: santai dan sopan, panggil pelanggan "Kak"/"Kakak" dan sesuaikan bila pelanggan memakai sapaan lain.) Jawaban singkat, 1-4 kalimat.
# TENTANG USAHA
# ${istilah}
- (nama): (harga) (keterangan bila ada)
Ini harga resmi: sebutkan persis seperti tertulis, jangan memberi diskon atau menghitung total sendiri.
# JAM BUKA
# LOKASI
# CARA ${transaksi}
# DATA ${transaksi} YANG WAJIB DITANYAKAN
- (satu data per baris)
# PEMBAYARAN
# PENGIRIMAN
# KEBIJAKAN
# PROMO
(promo dari pemilik; bila tidak ada: "Tidak ada promo saat ini. Jangan menawarkan diskon.")
# PERTANYAAN YANG SERING DITANYA
T: ...
J: ...
# SERAHKAN KE PEMILIK
- (satu hal per baris)
</knowledge>
<kurang>
- (pertanyaan singkat)
</kurang>`;
}

/** Pisahkan dokumen dan daftar kekurangan dari jawaban AI. null = jawaban tidak berbentuk dokumen. */
export function uraiRapikan(jawaban: string): { teks: string; kurang: string[] } | null {
  const k = jawaban.match(/<knowledge>([\s\S]*?)(?:<\/knowledge>|$)/i);
  const kr = jawaban.match(/<kurang>([\s\S]*?)(?:<\/kurang>|$)/i);
  const isi = (k ? k[1] : jawaban.replace(/<kurang>[\s\S]*$/i, ""))
    .replace(/<\/?(?:knowledge|kurang)>/gi, "")
    .replace(/^```\w*\s*|```\s*$/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  // Tanpa tag, jawaban baru dianggap dokumen bila tersusun per bagian ("# JUDUL").
  if (!isi || (!k && !/^#\s+\S/m.test(isi))) return null;
  const kurang = (kr?.[1] ?? "")
    .split("\n")
    .map((b) => b.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, "").trim())
    .filter((b) => b.length > 3)
    .slice(0, 5);
  return { teks: isi, kurang };
}

/** Angka/nomor/tautan di hasil yang tidak ada di tulisan asli: dipakai pemeriksa jawaban yang sama dengan balasan WA. */
export function angkaBaru(hasil: string, asli: string): string[] {
  const p = periksaJawaban(hasil, asli).find((x) => x.jenis === "angka");
  return p ? p.kutipan.split(", ").slice(0, 8).map((x) => x.replace(/^nominal /, "Rp").replace(/^(nomor|tautan|akun\/situs) /, "")) : [];
}

/**
 * Pecah tulisan panjang jadi bagian ≤ `maks` karakter, sebisa mungkin di batas judul/paragraf, lalu baris, lalu spasi.
 * Isi tidak berubah: gabungan semua bagian (dengan pemisah baris kosong) = tulisan asli.
 */
export function pecahBagian(teks: string, maks: number = BATAS_RAPIKAN.perBagian): string[] {
  if (teks.length <= maks) return [teks];
  // Blok = paragraf (dipisah baris kosong); blok kebesaran dipotong per baris, baris kebesaran dipotong per spasi.
  const blok: string[] = [];
  for (const p of teks.split(/\n{2,}/)) {
    if (p.length <= maks) {
      blok.push(p);
      continue;
    }
    let isi = "";
    for (const baris of p.split("\n")) {
      let b = baris;
      while (b.length > maks) {
        const sp = b.lastIndexOf(" ", maks);
        const potong = sp > maks / 2 ? sp : maks;
        if (isi) {
          blok.push(isi);
          isi = "";
        }
        blok.push(b.slice(0, potong));
        b = b.slice(potong).trimStart();
      }
      if (isi && isi.length + 1 + b.length > maks) {
        blok.push(isi);
        isi = "";
      }
      isi = isi ? `${isi}\n${b}` : b;
    }
    if (isi) blok.push(isi);
  }
  // Kemas blok berurutan sampai penuh.
  const bagian: string[] = [];
  let kini = "";
  for (const b of blok) {
    if (kini && kini.length + 2 + b.length > maks) {
      bagian.push(kini);
      kini = "";
    }
    kini = kini ? `${kini}\n\n${b}` : b;
  }
  if (kini) bagian.push(kini);
  return bagian.filter((b) => b.trim());
}

const normalJudul = (j: string) => j.replace(/[*_`]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
const PROMO_KOSONG = /^tidak ada promo saat ini/i;

/**
 * Gabungkan hasil rapikan per bagian jadi satu dokumen: bagian dengan judul sama ("# MENU & HARGA") disatukan sesuai
 * urutan kemunculan pertama, baris kembar dibuang. PERAN & GAYA BAHASA diambil dari bagian pertama yang menulisnya;
 * "Tidak ada promo" dibuang bila bagian lain menyebut promo; kalimat "Ini harga resmi…" dipindah ke akhir daftar.
 */
export function gabungBagian(hasil: string[]): string {
  const urut: string[] = [];
  const isi = new Map<string, { judul: string; baris: string[]; ada: Set<string>; dari: number }>();
  hasil.forEach((teks, ke) => {
    let kunci = "";
    for (const baris of teks.split("\n")) {
      const j = baris.match(/^#{1,3}\s+(.+?)\s*$/);
      if (j) {
        kunci = normalJudul(j[1]);
        if (!isi.has(kunci)) {
          isi.set(kunci, { judul: `# ${j[1].trim()}`, baris: [], ada: new Set(), dari: ke });
          urut.push(kunci);
        }
        continue;
      }
      if (!isi.has(kunci)) {
        isi.set(kunci, { judul: "", baris: [], ada: new Set(), dari: ke });
        urut.push(kunci);
      }
      const s = isi.get(kunci)!;
      // Peran & gaya bahasa cukup satu versi (bagian pertama yang menulisnya).
      if (kunci.startsWith("PERAN") && s.dari !== ke) continue;
      const k = baris.trim();
      if (!k) {
        if (s.baris.length && s.baris[s.baris.length - 1] !== "") s.baris.push("");
        continue;
      }
      if (s.ada.has(k)) continue;
      s.ada.add(k);
      s.baris.push(baris.trimEnd());
    }
  });
  const keluar: string[] = [];
  for (const kunci of urut) {
    const s = isi.get(kunci)!;
    let baris = s.baris;
    if (kunci === "PROMO" && baris.some((b) => b.trim() && !PROMO_KOSONG.test(b.trim()))) baris = baris.filter((b) => !PROMO_KOSONG.test(b.trim()));
    const resmi = baris.filter((b) => /^ini harga resmi/i.test(b.trim()));
    if (resmi.length) baris = [...baris.filter((b) => !/^ini harga resmi/i.test(b.trim())), ...resmi];
    // Rapikan baris kosong: tidak di awal/akhir bagian, tidak dobel, tidak tepat sebelum kalimat "Ini harga resmi".
    const bersih = baris.filter((b, i) => b !== "" || (i > 0 && i < baris.length - 1 && baris[i - 1] !== "" && !/^ini harga resmi/i.test(baris[i + 1].trim())));
    if (!s.judul && !bersih.length) continue;
    keluar.push([s.judul, ...bersih].filter((x, i) => i > 0 || x).join("\n"));
  }
  return keluar.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Info penting yang belum tertulis di dokumen gabungan (dokumen panjang: AI tiap bagian hanya melihat potongannya). */
function kurangDari(teks: string): string[] {
  const k = cekKelengkapan(teks);
  const tanya: Record<keyof typeof k, string> = {
    nama: "Apa nama usaha Anda?",
    harga: "Berapa harga tiap produk/layanan?",
    jam: "Jam berapa usaha Anda buka dan tutup?",
    lokasi: "Di mana alamat atau area layanan usaha Anda?",
    bayar: "Bagaimana cara pesan dan cara bayarnya?",
  };
  return (Object.keys(tanya) as (keyof typeof k)[]).filter((x) => !k[x]).map((x) => tanya[x]);
}

/** Jalankan `kerja` atas tiap butir dengan paling banyak `n` bersamaan; berhenti di galat pertama. */
async function paralel<T, H>(butir: T[], n: number, kerja: (x: T, i: number) => Promise<H>): Promise<H[]> {
  const hasil: H[] = new Array(butir.length);
  let berikut = 0;
  let gagal: unknown = null;
  const pekerja = async () => {
    while (gagal === null && berikut < butir.length) {
      const i = berikut++;
      try {
        hasil[i] = await kerja(butir[i], i);
      } catch (e) {
        gagal ??= e;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, butir.length) }, pekerja));
  if (gagal !== null) throw gagal;
  return hasil;
}

/** Cek tulisan sebelum dirapikan (dipanggil juga oleh route sebelum mulai mengalirkan progres). */
export function siapRapikan(teks: string, maks: number = BATAS_RAPIKAN.maks): string {
  const asli = bersihkanKerangka(teks);
  if (infoUsaha(asli).length < BATAS_RAPIKAN.min)
    throw new GalatRapikan(
      "Tulis dulu sedikit tentang usaha Anda (nama, produk & harga, jam buka) sebelum dirapikan.",
      "Write a little about your business first (name, products & prices, opening hours) before tidying it up."
    );
  if (asli.length > maks)
    throw new GalatRapikan(
      `Tulisan terlalu panjang untuk dirapikan sekaligus (maks ${maks.toLocaleString("id-ID")} karakter). Pecah jadi beberapa dokumen.`,
      `The text is too long to tidy up at once (max ${maks.toLocaleString("en-US")} characters). Split it into several documents.`
    );
  return asli;
}

/**
 * `penyedia` (mesin self-host, Developer API): pakai penyedia AI pemilik mesin (Claude API / kompatibel OpenAI / Hermes)
 * tanpa aturan bot CS. Tanpa `penyedia` = Hermes seperti di dashboard pusat.
 * Tulisan > `BATAS_RAPIKAN.perBagian` dipecah, tiap bagian dirapikan terpisah (paling banyak PARALEL bersamaan, satu
 * kali coba ulang), lalu digabung. `progres(selesai, total)` dipanggil tiap bagian selesai; `sinyal` membatalkan sisa.
 */
export async function rapikanKnowledge(o: {
  teks: string;
  jenis: KunciUsaha | null;
  userId: number;
  penyedia?: Penyedia;
  maks?: number;
  sinyal?: AbortSignal;
  progres?: (selesai: number, total: number) => void;
}): Promise<HasilRapikan> {
  const asli = siapRapikan(o.teks, o.maks);
  const bagian = pecahBagian(asli);
  const n = bagian.length;
  const sistem = sistemRapikan(o.jenis);
  let selesai = 0;
  o.progres?.(0, n);

  const satu = async (potong: string, i: number) => {
    const catatan =
      n === 1
        ? ""
        : `\nIni bagian ${i + 1} dari ${n} catatan yang panjang; bagian lain dirapikan terpisah lalu digabung. Tulis hanya bagian yang informasinya ada di potongan ini${
            i > 0 ? ", jangan tulis PERAN & GAYA BAHASA dan PROMO kecuali memang disebut di potongan ini" : ""
          }. Biarkan <kurang></kurang> kosong.`;
    for (let coba = 0; ; coba++) {
      if (o.sinyal?.aborted) throw new GalatRapikan("Dibatalkan.", "Cancelled.");
      // Sesi baru tiap permintaan: tulisan pengguna tidak tercampur dengan riwayat percakapan mana pun.
      const minta = {
        sessionId: `rapikan-${o.userId}-${randomBytes(6).toString("hex")}`,
        sistem,
        pesan: `Catatan pemilik usaha (rapikan sesuai aturan):${catatan}\n"""\n${potong}\n"""`,
        timeoutMs: 110_000,
      };
      try {
        const j = o.penyedia ? await tanyaAi({ ...minta, paksa: { penyedia: o.penyedia }, maksToken: 6000, tanpaSoul: true }) : await tanyaHermes({ ...minta, sinyal: o.sinyal });
        const u = uraiRapikan(j.teks);
        if (!u) throw new GalatRapikan("AI belum berhasil merapikan tulisan ini. Coba lagi.", "The AI couldn't tidy up this text yet. Please try again.");
        o.progres?.(++selesai, n);
        return { ...u, peringatan: angkaBaru(u.teks, potong) };
      } catch (e) {
        // Dokumen panjang: satu bagian yang gagal dicoba sekali lagi supaya pekerjaan lain tidak terbuang.
        if (coba >= (n > 1 ? 1 : 0) || o.sinyal?.aborted) throw e;
      }
    }
  };

  const hasil = await paralel(bagian, PARALEL, satu);
  if (n === 1) return { asli, ...hasil[0] };
  const teks = gabungBagian(hasil.map((h) => h.teks));
  return { asli, teks, kurang: kurangDari(teks), peringatan: [...new Set(hasil.flatMap((h) => h.peringatan))].slice(0, 8) };
}
