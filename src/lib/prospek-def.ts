/**
 * Penyaring prospek: bagian murni (tanpa I/O, tanpa model), dipakai jembatan WhatsApp, AI, dan uji.
 * Aturan prompt penilaian pesan untuk AI utama, pengurai tagnya, pengenal pesan penutup & kata minat, detektor pola
 * lawan bicara yang bukan manusia, dan pengklasifikasi tetangga terdekat (kNN) di atas vektor embedding.
 * Alurnya ada di src/lib/prospek.ts dan bridge.ts.
 */

export const LABEL = ["prospek", "netral", "selesai", "bukan"] as const;
export type Label = (typeof LABEL)[number];
export const idLabel = (l: Label): number => LABEL.indexOf(l);

/** Status chat untuk penyaring (chat_state.prospek & percakapan.prospek). */
export const STATUS = { baru: 0, prospek: 1, bisu: 2, bot: 3 } as const;
export type StatusChat = (typeof STATUS)[keyof typeof STATUS];

/** Pesan "bukan prospek" beruntun di chat yang belum terbukti prospek sebelum chat dibisukan. */
export const BATAS_STRIKE = 3;
/** Chat yang lawan bicaranya terdeteksi bot/auto-reply dibisukan selama ini, lalu dicoba lagi. */
export const BISU_BOT_DTK = 6 * 3600;

export const ATURAN_NILAI = `<penilaian_pesan>
Di BARIS PALING AKHIR setiap jawaban, tambahkan tepat satu tag penilaian untuk pesan terakhir lawan bicara, ditulis persis seperti contoh di bawah (kurung sudut biasa, tanpa tanda |). Tag tidak terlihat olehnya.
<nilai>prospek</nilai> = ia punya urusan dengan usaha/peran nomor ini: bertanya produk, layanan, harga, jadwal, lokasi, atau cara order; ingin memesan, membeli, booking, membayar; komplain atau minta bantuan soal pesanan/layanan; calon mitra atau pemasok yang serius; pelanggan lama yang melanjutkan urusan.
<nilai>netral</nilai> = sapaan, perkenalan, atau pesan pendek yang maksudnya belum jelas ("halo", "p", "mau tanya", "permisi").
<nilai>selesai</nilai> = HANYA ucapan penutup, terima kasih, atau konfirmasi singkat ("ok", "siap kak", "makasih 🙏") saat urusannya sudah tuntas dan kamu tidak sedang menunggu jawabannya. Untuk ini JANGAN menulis jawaban apa pun: balas HANYA dengan tag itu.
<nilai>bukan</nilai> = jelas tidak berhubungan dengan usaha/peran nomor ini dan tidak mengarah ke sana: iseng, ngobrol kosong, ledekan, menguji atau mengerjai bot, topik umum di luar usaha (PR sekolah, politik, gosip, minta dibuatkan sesuatu). Tetap balas singkat, satu kalimat sopan yang mengarahkan ke hal yang bisa kamu bantu.
Ragu antara prospek dan yang lain = prospek. Keluhan, pelanggan marah, atau berkata kasar soal layanan = prospek. Pertanyaan yang kamu jawab "belum ada infonya" tetap prospek bila menyangkut usaha ini.
Khusus bila nilainya prospek, tulis LANGSUNG sesudahnya satu tag minat beli yang menilai SELURUH percakapan sejauh ini (bukan hanya pesan terakhir), contoh: <nilai>prospek</nilai><minat>hangat</minat>
<minat>panas</minat> = siap membeli sekarang: menyebut jumlah, varian, ukuran, tanggal, atau alamat kirim; minta nomor rekening, QRIS, link bayar, atau total harga; bilang "jadi", "pesan", "ambil", "booking", "daftar", "mau bayar"; mengirim bukti bayar.
<minat>hangat</minat> = menimbang serius: menanyakan harga, stok, ongkir, lokasi, jadwal, cara order, perbandingan pilihan/paket, atau bertanya lanjutan setelah dijawab.
<minat>dingin</minat> = minatnya masih tipis: pertanyaan umum tanpa detail, sekadar lihat-lihat, bilang "nanti dulu"/"masih mikir", atau urusannya bukan membeli (keluhan atau bantuan pesanan yang sudah ada).
Ragu antara dua tingkat minat = pilih yang lebih rendah.
</penilaian_pesan>`;

export const MINAT = ["dingin", "hangat", "panas"] as const;
export type Minat = (typeof MINAT)[number];
/** Nilai simpan (percakapan.minat): 0 = dingin, 1 = hangat, 2 = panas. */
export const idMinat = (m: Minat): number => MINAT.indexOf(m);
/** Tingkat minat turun satu tiap sekian detik chat diam (dihitung saat dibaca, tanpa UPDATE berkala). */
export const LURUH_MINAT_DTK = 7 * 86400;
/** Tingkat minat saat ini: tingkat tersimpan dikurangi satu per LURUH_MINAT_DTK sejak terakhir dinilai. null = belum dinilai. */
export function minatEfektif(minat: number | null | undefined, pada: number | null | undefined, kini: number): number | null {
  if (minat === null || minat === undefined) return null;
  return Math.max(0, minat - Math.floor(Math.max(0, kini - (pada ?? kini)) / LURUH_MINAT_DTK));
}

const POLA_NILAI = /<nilai(?:\s+[a-z]+\s*=\s*["']?([a-z]+)["']?)?\s*\/?>\s*([a-z]*)\s*(?:<\/nilai>)?/gi;
/** Cadangan: tag penilaian berpembatas rusak di baris terakhir ("[nilai: prospek]", "nilai=bukan", "|nilai>netral"). */
const POLA_NILAI_LONGGAR = /(?:^|\n)[^\S\n]*[^\p{L}\p{N}\n]{0,3}nilai[^\p{L}\n]{0,4}(prospek|netral|selesai|bukan)[^\p{L}\n]*(?:nilai[^\p{L}\n]*)?$/iu;

const POLA_MINAT_TAG = /<minat(?:\s+[a-z]+\s*=\s*["']?([a-z]+)["']?)?\s*\/?>\s*([a-z]*)\s*(?:<\/minat>)?/gi;
/** Cadangan: tag minat berpembatas rusak di baris terakhir ("[minat: panas]", "minat=hangat"). */
const POLA_MINAT_LONGGAR = /[^\S\n]*[^\p{L}\p{N}\n]{0,3}minat[^\p{L}\n]{0,4}(dingin|hangat|panas)[^\p{L}\n]*(?:minat[^\p{L}\n]*)?$/iu;

/**
 * Pisahkan tag <nilai> & <minat> dari jawaban AI: teks bersih + label (tag terakhir yang dikenal; null bila tidak ada)
 * + tingkat minat (hanya bila labelnya prospek).
 */
export function ambilNilai(jawaban: string): { teks: string; nilai: Label | null; minat: Minat | null } {
  let nilai: Label | null = null;
  let minat: Minat | null = null;
  let teks = jawaban
    .replace(/<\/minat>(?=\s*(?:dingin|hangat|panas)\b)/gi, "<minat>")
    .replace(POLA_MINAT_TAG, (_, attr: string | undefined, isi: string) => {
      const m = (isi || attr || "").toLowerCase();
      if ((MINAT as readonly string[]).includes(m)) minat = m as Minat;
      return "";
    })
    .replace(/<\/?minat[^>]*>/gi, "")
    .replace(/<\/nilai>(?=\s*(?:prospek|netral|selesai|bukan)\b)/gi, "<nilai>") // tag penutup dipakai sebagai pembuka
    .replace(POLA_NILAI, (_, attr: string | undefined, isi: string) => {
      const l = (isi || attr || "").toLowerCase();
      if ((LABEL as readonly string[]).includes(l)) nilai = l as Label;
      return "";
    })
    .replace(/<\/?nilai[^>]*>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const mm = POLA_MINAT_LONGGAR.exec(teks);
  if (mm) {
    // Hanya di baris terakhir yang kosong selain tag itu, atau di belakang tag nilai longgar di baris yang sama.
    const sebelum = teks.slice(0, mm.index);
    const baris = sebelum.slice(sebelum.lastIndexOf("\n") + 1);
    if (!baris.trim() || /nilai/i.test(baris)) {
      minat = mm[1].toLowerCase() as Minat;
      teks = sebelum.trimEnd();
    }
  }
  const m = POLA_NILAI_LONGGAR.exec(teks);
  if (m) {
    nilai = m[1].toLowerCase() as Label;
    teks = teks.slice(0, m.index).trim();
  }
  return { teks, nilai, minat: nilai === "prospek" ? minat : null };
}

/** Bentuk baku untuk pembandingan pola: huruf kecil, tanpa aksen/emoji/tanda baca, huruf berulang dirapatkan. */
export const baku = (t: string): string =>
  t
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/(\p{L})\1{2,}/gu, "$1")
    .replace(/\s+/g, " ")
    .trim();

const KATA_PENUTUP = new Set(
  "ok oke okey okay oce okeh okk okkk sip siap siapp mantap mantab mantul makasih makasi mkasih mksh mksih makaseh trims trimakasih terimakasih terima kasih thanks thank thanx thx you tq ty tengkyu tenkyu nuhun matur suwun baik noted done beres kak ka kk kakak min mimin admin mas mba mbak pak bu bang gan sis ya yaa yah deh dong nggih iya iyaa iy y yup sama sama2 banyak semangat sukses selalu".split(" ")
);

/** Pesan hanya berisi ucapan penutup/terima kasih/konfirmasi pendek (tanpa permintaan apa pun). */
export function penutupSaja(teks: string): boolean {
  if (teks.length > 60 || /\?|\d/.test(teks)) return false;
  const kata = baku(teks).split(" ").filter(Boolean);
  if (!kata.length) return /^[\p{Extended_Pictographic}\s‍️]+$/u.test(teks.trim()) && !!teks.trim(); // emoji saja (👍, 🙏)
  return kata.length <= 6 && kata.every((k) => KATA_PENUTUP.has(k));
}

/**
 * Kata minat yang jelas: membangunkan chat yang dibisukan tanpa perlu ML maupun AI. Umum untuk berbagai usaha
 * (dagang, jasa, booking); arah salahnya aman (paling buruk AI menjawab satu pesan lagi).
 */
const POLA_MINAT =
  /\b(harga|hrg|harganya|berapa|brp|brapa|berapaan|pesan|pesen|psn|order|beli|booking|book|reservasi|alamat|lokasi|outlet|cabang|buka|promo|diskon|menu|katalog|pricelist|stok|stock|ready|ongkir|kirim|antar|delivery|cod|bayar|transfer|tf|rekening|rek|qris|invoice|komplain|keluhan|kecewa|rusak|refund|garansi|kemitraan|franchise|reseller|grosir|layanan|jasa|paket|tarif|biaya|jadwal|daftar)\b/i;

export const adaKataMinat = (teks: string): boolean => POLA_MINAT.test(baku(teks));

// ---------- Detektor pola lawan bicara yang bukan manusia (tanpa AI, tanpa I/O) ----------

/** Balasan lawan bicara yang tiba secepat ini setelah balasan kita, berturut-turut sebanyak BOT_BERUNTUN, = bot. */
export const BOT_CEPAT_MS = 2_000;
export const BOT_BERUNTUN = 5;
/** Pesan panjang yang sama persis sebanyak ini berturut-turut = auto-reply/broadcast. Pesan pendek ("p") tidak dihitung. */
export const ULANG_BERUNTUN = 3;
const MIN_PANJANG_POLA = 20;

/** Pesan masuk menggemakan balasan kita sendiri (bot lain yang meniru/memantulkan pesan)? */
export function gema(masuk: string, balasanKita: string | null): boolean {
  if (!balasanKita) return false;
  const a = baku(masuk);
  const b = baku(balasanKita);
  if (a.length < MIN_PANJANG_POLA || b.length < MIN_PANJANG_POLA) return false;
  return a === b || (b.includes(a) && a.length >= b.length * 0.8) || (a.includes(b) && b.length >= a.length * 0.8);
}

/** Pesan ini sama dengan ULANG_BERUNTUN-1 pesan masuk sebelumnya (semuanya cukup panjang)? */
export function berulang(masuk: string, sebelumnya: string[]): boolean {
  const a = baku(masuk);
  if (a.length < MIN_PANJANG_POLA || sebelumnya.length < ULANG_BERUNTUN - 1) return false;
  return sebelumnya.slice(-(ULANG_BERUNTUN - 1)).every((s) => baku(s) === a);
}

// ---------- Vektor & pengklasifikasi kNN ----------

export const DIM = 384;

/**
 * Sekumpulan contoh berlabel dalam bentuk padat: vektor int8 berskala (384 B + 4 B per contoh, 4x lebih hemat dari
 * float32). `bobot` = seberapa dipercaya contoh itu (koreksi dari hasil nyata > label AI > dataset awal).
 */
export interface Bank {
  n: number;
  vek: Int8Array;
  skala: Float32Array;
  label: Uint8Array;
  bobot: Float32Array;
}

export function bankKosong(kapasitas: number): Bank {
  return { n: 0, vek: new Int8Array(kapasitas * DIM), skala: new Float32Array(kapasitas), label: new Uint8Array(kapasitas), bobot: new Float32Array(kapasitas) };
}

/** Float32 ternormalisasi -> int8 + skala (galat kuantisasi terhadap cosine < 0,005). */
export function kuantisasi(v: Float32Array): { q: Int8Array; skala: number } {
  let maks = 0;
  for (let i = 0; i < DIM; i++) maks = Math.max(maks, Math.abs(v[i]));
  const skala = maks / 127 || 1;
  const q = new Int8Array(DIM);
  for (let i = 0; i < DIM; i++) q[i] = Math.round(v[i] / skala);
  return { q, skala };
}

/** Satu contoh -> 388 bita (skala float32 LE + 384 int8): format kolom ml_contoh.vektor dan berkas benih. */
export function kodeVektor(v: Float32Array): Buffer {
  const { q, skala } = kuantisasi(v);
  const b = Buffer.alloc(4 + DIM);
  b.writeFloatLE(skala, 0);
  Buffer.from(q.buffer).copy(b, 4);
  return b;
}

export function tambahKeBank(bank: Bank, kode: Uint8Array, label: number, bobot: number): boolean {
  if (bank.n >= bank.skala.length || kode.length !== 4 + DIM) return false;
  const i = bank.n++;
  bank.skala[i] = Buffer.from(kode.buffer, kode.byteOffset, 4).readFloatLE(0);
  bank.vek.set(new Int8Array(kode.buffer, kode.byteOffset + 4, DIM), i * DIM);
  bank.label[i] = label;
  bank.bobot[i] = bobot;
  return true;
}

export interface HasilKnn {
  /** Peluang per label (urutan LABEL). */
  p: number[];
  label: Label;
  /** Kemiripan tetangga terdekat (seberapa "dikenal" pesan ini). */
  simMaks: number;
}

/**
 * kNN berbobot: k tetangga paling mirip dari semua bank, tiap tetangga menyumbang bobot * exp((sim - simMaks) / tau)
 * ke labelnya. Tau kecil = tetangga yang paling mirip jauh lebih menentukan. `lewati(bank, i)` dipakai uji
 * leave-one-out (contoh itu sendiri tidak ikut menilai).
 */
export function nilaiKnn(v: Float32Array, bank: Bank[], o: { k?: number; tau?: number; lewati?: (b: number, i: number) => boolean } = {}): HasilKnn {
  const k = o.k ?? 12;
  const tau = o.tau ?? 0.03;
  const sims = new Float32Array(k).fill(-2);
  const lab = new Uint8Array(k);
  const bob = new Float32Array(k);
  for (let b = 0; b < bank.length; b++) {
    const { n, vek, skala, label, bobot } = bank[b];
    for (let i = 0; i < n; i++) {
      if (o.lewati?.(b, i)) continue;
      let s = 0;
      const off = i * DIM;
      for (let j = 0; j < DIM; j++) s += vek[off + j] * v[j];
      s *= skala[i];
      if (s <= sims[k - 1]) continue;
      let pos = k - 1;
      while (pos > 0 && sims[pos - 1] < s) {
        sims[pos] = sims[pos - 1];
        lab[pos] = lab[pos - 1];
        bob[pos] = bob[pos - 1];
        pos--;
      }
      sims[pos] = s;
      lab[pos] = label[i];
      bob[pos] = bobot[i];
    }
  }
  const p = [0, 0, 0, 0];
  const simMaks = sims[0];
  if (simMaks <= -2) return { p: [0, 1, 0, 0], label: "netral", simMaks: 0 };
  for (let i = 0; i < k && sims[i] > -2; i++) p[lab[i]] += bob[i] * Math.exp((sims[i] - simMaks) / tau);
  const total = p.reduce((a, b) => a + b, 0) || 1;
  for (let i = 0; i < 4; i++) p[i] /= total;
  let terbaik = 0;
  for (let i = 1; i < 4; i++) if (p[i] > p[terbaik]) terbaik = i;
  return { p, label: LABEL[terbaik], simMaks };
}

/** Kepala klasifikasi terlatih (ml/latih.mjs): regresi softmax 384 -> 4 label di atas vektor embedding. */
export interface Kepala {
  W: ArrayLike<number>;
  b: ArrayLike<number>;
}

/** Peluang per label (urutan LABEL) menurut kepala terlatih. */
export function nilaiKepala(v: Float32Array, kp: Kepala): number[] {
  const z = [0, 0, 0, 0];
  let maks = -Infinity;
  for (let k = 0; k < 4; k++) {
    let s = kp.b[k];
    const off = k * DIM;
    for (let j = 0; j < DIM; j++) s += kp.W[off + j] * v[j];
    z[k] = s;
    if (s > maks) maks = s;
  }
  let total = 0;
  for (let k = 0; k < 4; k++) total += (z[k] = Math.exp(z[k] - maks));
  return z.map((x) => x / total);
}

/** Campuran dua sebaran peluang: `w` bagian dari `a`, sisanya dari `b`. */
export const gabungPeluang = (a: number[], b: number[], w: number): number[] => a.map((x, i) => w * x + (1 - w) * b[i]);

/** Peluang pesan ini boleh dilewati tanpa jawaban (penutup atau bukan prospek). */
export const peluangLewati = (h: HasilKnn): number => h.p[2] + h.p[3];

/** Ambang awal: ML hanya boleh melewati pesan bila sangat yakin; disetel ulang tiap malam per nomor (prospek.ts). */
export const AMBANG_AWAL = 0.9;
/** ML membangunkan chat yang dibisukan bila peluang prospek setinggi ini (arah aman: hanya menambah jawaban). */
export const AMBANG_BANGUN = 0.5;
