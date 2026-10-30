/**
 * Penyaring spam untuk chat masuk. Dua lapis, keduanya condong ke "balas" bila ragu: mengabaikan pelanggan sungguhan
 * jauh lebih mahal daripada sesekali membalas spam.
 *   1. periksaSpam() (di sini, tanpa AI, tanpa I/O): HANYA promosi judi online. Pola ini ilegal, khas, dan tidak pernah
 *      dikirim pelanggan usaha mana pun, jadi bisa dikenali dari kata-katanya. Satu kata saja ("slot", "gacor", "depo",
 *      "bonus") tidak pernah cukup: wajib ada minimal satu sinyal KUAT ditambah sinyal pendukung. Ejaan samaran
 *      (s1ot g4c0r, s.l.o.t, huruf hias Unicode) dinormalkan dulu. Ambang diuji pada uji/data-spam.json: 0 salah tandai.
 *   2. ATURAN_SPAM (prompt): spam lain (promosi tak diminta, penipuan, ajakan asusila) butuh pemahaman konteks usaha,
 *      jadi dinilai model AI. Ia membalas hanya dengan tag <abaikan> bila JELAS bukan pelanggan; ragu = jawab biasa.
 * Chat yang pernah dibalas manusia sendiri, atau ditandai "bukan spam" oleh pemilik, tidak disaring sama sekali
 * (lihat bridge.ts), dan penyaring bisa dimatikan per nomor (numbers.saring_spam).
 */

export interface HasilSpam {
  spam: boolean;
  skor: number;
  /** Sinyal yang ditemukan, untuk alasan yang ditampilkan ke pemilik. */
  sinyal: string[];
}

/** Ambang: minimal satu sinyal kuat (3) DAN total skor ini. Satu sinyal kuat saja (mis. "judi") tidak cukup. */
const AMBANG = 5;

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s", "!": "i", "|": "l" };

/**
 * Bentuk baku untuk dicocokkan: huruf hias Unicode dilebur (NFKC), aksen & karakter tak terlihat dibuang, huruf kecil.
 * `polos`: apa adanya (angka tetap angka: 4d, 10rb, x500). `kata`: angka/simbol di dalam kata yang juga berhuruf dibaca
 * sebagai huruf bila kata itu diawali huruf (g4c0r -> gacor; 10rb, 4d tetap). `padat`: hanya huruf, tanpa pemisah (s.l.o.t g a c o r -> slotgacor), untuk ejaan yang dipecah-pecah.
 */
export function normalisasi(teks: string): { polos: string; kata: string; padat: string } {
  const polos = teks
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/[\u0300-\u036f\u200b-\u200d\u2060\ufeff\u00ad]/g, "")
    .toLowerCase();
  const kata = polos.replace(/[\p{L}\p{N}@$!|]+/gu, (k) => (/^[\p{L}@$!|]/u.test(k) && /[0-9@$!|]/.test(k) ? k.replace(/[013457@$!|]/g, (c) => LEET[c]) : k));
  return { polos, kata, padat: kata.replace(/[^a-z]/g, "") };
}

interface Sinyal {
  nama: string;
  bobot: number;
  /** Dicocokkan ke `polos` dan `kata` (dengan batas kata). */
  pola: RegExp;
  /** Bila ada: juga dicocokkan ke `padat` (ejaan dipecah). Hanya untuk istilah panjang yang tak mungkin kebetulan. */
  padat?: RegExp;
}

const KUAT = 3;
const PENDUKUNG = 1;

const SINYAL: Sinyal[] = [
  // --- Kuat: istilah yang praktis hanya muncul di promosi judi online ---
  { nama: "slot gacor", bobot: KUAT, pola: /\bslot\s*(gacor|online|88|777|resmi|terpercaya|deposit|depo)\b/, padat: /slot(gacor|online)/ },
  { nama: "maxwin", bobot: KUAT, pola: /\bmax\s*win\b|\bmaxwin\b/, padat: /maxwin/ },
  { nama: "togel", bobot: KUAT, pola: /\btogel\b|\btoto\s*(gelap|macau|hk|sgp|sdy|online)\b|\bcolok\s*(bebas|jitu|naga|macau)\b|\b(bayaran|diskon)\s*[234]d\b|\bpasaran\s*(hk|sgp|sdy|macau)\b/, padat: /togel/ },
  { nama: "judi online", bobot: KUAT, pola: /\bjudi\s*(online|bola|slot|kartu)\b|\bjudol\b/, padat: /judionline/ },
  { nama: "kasino", bobot: KUAT, pola: /\b(casino|kasino|live\s*casino)\b/ },
  { nama: "nama situs/permainan judi", bobot: KUAT, pola: /\b(sbobet|pragmatic\s*play|pg\s*soft|gates?\s*of\s*olympus|mahjong\s*ways?|sweet\s*bonanza|starlight\s*princess|aztec\s*gems|koi\s*gate|spaceman|wild\s*west\s*gold)\b/, padat: /(gatesofolympus|mahjongways|sweetbonanza|starlightprincess|pragmaticplay)/ },
  { nama: "scatter/rtp", bobot: KUAT, pola: /\bscatter\s*(hitam|merah|emas)\b|\brtp\s*(live|slot|tertinggi|hari\s*ini|gacor)\b|\bbocoran\s*(rtp|slot|pola|admin)\b|\bpola\s*(gacor|slot|maxwin)\b/ },
  { nama: "situs judi", bobot: KUAT, pola: /\b(situs|link|web|bandar|agen)\s*(gacor|slot|judi|togel|bola|toto|casino|terpercaya\s*(slot|judi))\b/ },
  { nama: "taruhan", bobot: KUAT, pola: /\b(mix\s*)?parlay\b|\bpoker\s*online\b|\bdomino\s*(qq|qiu\s*qiu)\b|\bsabung\s*ayam\s*online\b|\bbet\s*(bola|online)\b/ },
  { nama: "janji menang", bobot: KUAT, pola: /\b(anti\s*rungkad|garansi\s*kekalahan|dijamin\s*(menang|jp|wd|maxwin)|pasti\s*(jp|wd|maxwin))\b/ },
  { nama: "depo/wd", bobot: KUAT, pola: /\bmin(imal|\.)?\s*depo(sit)?\s*\d+|\bdepo(sit)?\s*\d+\s*(rb|ribu|k)\s*(bisa\s*|langsung\s*|dapat\s*)?(wd|maxwin|jp|main|spin)\b|\bwd\s*(berapa\s*pun|berapapun)\b|\bdepo(sit)?\s*(via\s*)?(pulsa|dana|ovo|qris)\s*tanpa\s*potongan\b/ },
  { nama: "bonus member baru", bobot: KUAT, pola: /\bbonus\s*(new\s*member|member\s*baru|deposit|harian|cashback|rollingan|to)\b|\b(freebet|free\s*(spin|chip|bet))\b/ },
  // --- Pendukung: lazim di promosi judi, tapi juga di chat biasa (jadwal slot, burung gacor, DP, bonus) ---
  { nama: "slot", bobot: PENDUKUNG, pola: /\bslot\b/ },
  { nama: "gacor", bobot: PENDUKUNG, pola: /\bgacor\b/ },
  { nama: "depo", bobot: PENDUKUNG, pola: /\bdepo(sit)?\b/ },
  { nama: "wd", bobot: PENDUKUNG, pola: /\b(wd|withdraw|tarik\s*dana)\b/ },
  { nama: "jackpot", bobot: PENDUKUNG, pola: /\b(jackpot|jp|x\s?(100|250|500|1000|5000))\b/ },
  { nama: "rtp/scatter", bobot: PENDUKUNG, pola: /\b(rtp|scatter|rungkad|zeus|olympus|mahjong)\b/ },
  { nama: "ajakan daftar", bobot: PENDUKUNG, pola: /\b(daftar|join|gabung)\s*(sekarang|skrg|disini|di\s*sini|langsung|yuk)\b|\blink\s*(alternatif|daftar|login)\b|\b(new\s*member|member\s*baru)\b/ },
  { nama: "cuan/menang", bobot: PENDUKUNG, pola: /\b(cuan|menang\s*(besar|banyak|terus)|hoki|modal\s*receh|modal\s*kecil)\b/ },
  { nama: "bonus", bobot: PENDUKUNG, pola: /\bbonus\s*\d+\s*%|\bcashback\s*\d+\s*%/ },
  { nama: "angka togel", bobot: PENDUKUNG, pola: /\b[234]d\b/ },
];

/** Tautan ke luar (situs, wa.me, t.me, pemendek): +1. Pelanggan biasa juga mengirim tautan, jadi hanya pendukung. */
const TAUTAN = /(https?:\/\/|www\.|\b(bit\.ly|s\.id|t\.me|wa\.me|linktr\.ee|cutt\.ly|tinyurl\.com)\b|\b[a-z0-9-]{3,}\.(com|net|org|xyz|top|site|online|vip|club|live|bet|win|pro|cc|asia|link|store|fun|icu|me)\b)/;
/** Emoji khas promosi judi (mesin slot, uang, api, dadu). */
const EMOJI_JUDI = /\u{1F3B0}|\u{1F4B0}|\u{1F4B8}|\u{1F525}|\u{1F3B2}|\u{1F911}|\u{1F48E}/gu;

/**
 * Orang yang MEMBICARAKAN judi (korban, keluarga yang minta konseling, laporan penipuan) memakai kata yang sama dengan
 * promosinya. Pesan seperti itu tidak pernah diputuskan di sini; penilaiannya diserahkan ke AI yang tahu konteks usaha.
 */
const KONTEKS_KORBAN = /\b(korban|kecanduan|ketagihan|candu|terjerat|tertipu|ditipu|penipuan|lapor(an|kan)?|melaporkan|berhenti|konsultasi|konseling|rehabilitasi|terapi|hutang|utang|suami|istri|anak\s*saya|bahaya|haram|blokir)\b/;

export function periksaSpam(teks: string): HasilSpam {
  if (!teks || teks.length < 8) return { spam: false, skor: 0, sinyal: [] };
  const { polos, kata, padat } = normalisasi(teks);
  const sinyal: string[] = [];
  let skor = 0;
  let kuat = 0;
  // Kata yang sudah dihitung dalam sinyal kuat ("slot" di "slot gacor") tidak dihitung lagi sebagai pendukung.
  let sisa = [polos, kata];
  for (const s of SINYAL) {
    const cek = s.bobot === KUAT ? [polos, kata] : sisa;
    if (cek.some((t) => s.pola.test(t)) || (s.bobot === KUAT && s.padat?.test(padat))) {
      sinyal.push(s.nama);
      skor += s.bobot;
      if (s.bobot === KUAT) {
        kuat += 1;
        const semua = new RegExp(s.pola.source, "g");
        sisa = sisa.map((t) => t.replace(semua, " "));
      }
    }
  }
  if (KONTEKS_KORBAN.test(kata)) return { spam: false, skor, sinyal: [...sinyal, "konteks korban/laporan (diserahkan ke AI)"] };
  if (TAUTAN.test(polos)) {
    sinyal.push("tautan");
    skor += PENDUKUNG;
  }
  const emoji = teks.match(EMOJI_JUDI)?.length ?? 0;
  if (emoji >= 2 || /\u{1F3B0}/u.test(teks)) {
    sinyal.push("emoji promosi");
    skor += PENDUKUNG;
  }
  return { spam: kuat >= 1 && skor >= AMBANG, skor, sinyal };
}

/** Kalimat pendek untuk pemilik nomor (histori percakapan). */
export function alasanSpam(h: HasilSpam): string {
  return `Promosi judi online (${h.sinyal.slice(0, 4).join(", ")})`;
}

/** Untuk model AI: kapan boleh tidak membalas. Dipasang hanya bila penyaring aktif dan chat belum dipercaya. */
export const ATURAN_SPAM = `<aturan_spam>
Sebagian kecil pesan masuk bukan dari pelanggan. HANYA bila pesan terakhir lawan bicara JELAS termasuk salah satu ini:
- promosi judi online / slot / togel / taruhan;
- promosi atau tawaran yang tidak diminta dan tidak ada hubungannya dengan usaha ini (broadcast jualan, jasa followers/SEO, pinjaman online, investasi, kerja online/tugas berbayar, kripto);
- penipuan: menang undian/hadiah, minta kode OTP/PIN/password, minta transfer atau klik tautan untuk verifikasi akun;
- konten porno atau ajakan asusila;
balas HANYA dengan satu tag ini, tanpa teks lain: <abaikan jenis="judi|promosi|penipuan|asusila">alasan singkat</abaikan>
JANGAN pernah memakai tag itu untuk: pertanyaan apa pun (termasuk soal produk pinjaman/investasi bila usaha ini memang menjualnya), keluhan, pelanggan yang marah atau berkata kasar, sapaan pendek ("p", "halo", "test"), salah kirim, bercanda, pesan yang tidak jelas maksudnya, atau calon mitra/pemasok yang menawarkan kerja sama secara sopan untuk usaha ini. Ragu sedikit pun = balas seperti biasa.
</aturan_spam>`;

export type JenisAbaikan = "judi" | "promosi" | "penipuan" | "asusila";

const POLA_ABAIKAN = /<abaikan(?:\s+jenis\s*=\s*["']?([a-z]+)["']?)?\s*>([\s\S]*?)(?:<\/abaikan>|$)/i;

/** Jawaban AI berupa tag abaikan? Teks lain di sekitarnya membatalkannya (model ragu: jawabannya yang dipakai). */
export function ambilAbaikan(jawaban: string): { jenis: JenisAbaikan; alasan: string } | null {
  const m = POLA_ABAIKAN.exec(jawaban);
  if (!m) return null;
  const sisa = jawaban.replace(m[0], "").trim();
  if (sisa.length > 0) return null;
  const jenis = (["judi", "promosi", "penipuan", "asusila"] as const).find((j) => j === m[1]?.toLowerCase()) ?? "promosi";
  return { jenis, alasan: m[2].replace(/\s+/g, " ").trim().slice(0, 200) };
}

/** Buang tag abaikan (beserta isinya, yang ditulis untuk sistem) dari jawaban biasa, termasuk sisa tag yang nyasar. */
export const buangTagAbaikan = (t: string): string =>
  t
    .replace(/<abaikan\b[^>]*>[\s\S]*?(<\/abaikan>|$)/gi, "")
    .replace(/<\/?abaikan[^>]*>/gi, "")
    .trim();
