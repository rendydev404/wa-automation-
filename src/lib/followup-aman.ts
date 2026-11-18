import "server-only";
import { BAHAYA_JAM, STABIL_MENIT } from "./followup-def";
import { kesehatanSesi } from "./wa";

/**
 * Pengaman dan "penilai" bersama ketiga follow-up (akun & prospek nomor CS ChatGerCep, nomor pengguna berbayar).
 *
 * 1. Kapan BOLEH mengirim (alasanTahan): pesan yang kita mulai sendiri hanya dikirim dari nomor yang sehat, yaitu soketnya
 *    sudah tersambung tanpa putus STABIL_MENIT menit dan tidak ada tanda bahaya dari WhatsApp dalam BAHAYA_JAM jam
 *    (perangkat dicabut 401, login ditolak 403, error 463 akun dibatasi). Kasus nyata 2026-11-15: follow-up terkirim
 *    24 detik setelah nomor di-scan ulang (sudah 2x dicabut WhatsApp hari itu), 2 menit kemudian nomornya diblokir.
 * 2. Apakah PANTAS mengirim (ATURAN_LEWATI / ambilLewati): AI penulis pesan membaca riwayat chat dulu dan boleh menolak
 *    menulis (tag <lewati>) bila follow-up akan terasa mengganggu: orang yang sudah jelas menolak, sudah membeli, sedang
 *    komplain, atau chat-nya bukan soal membeli. Yang terganggu itulah yang menekan "Laporkan / Blokir".
 */

/** Menit koneksi stabil yang disyaratkan (pengujian bisa mengecilkannya lewat WA_FOLLOWUP_STABIL_MENIT). */
function stabilMinMs(): number {
  const v = Number(process.env.WA_FOLLOWUP_STABIL_MENIT);
  return (Number.isFinite(v) && v >= 0 ? v : STABIL_MENIT) * 60_000;
}

/** null = nomor ini sehat untuk mengirim follow-up sekarang; selain itu alasan menahan (dari memori, tanpa I/O). */
export function alasanTahan(sesi: string): string | null {
  const k = kesehatanSesi(sesi);
  if (k.bahaya && Date.now() - k.bahaya.pada < BAHAYA_JAM * 3600_000) return `Tanda bahaya dari WhatsApp: ${k.bahaya.alasan}`;
  if (k.stabilMs < stabilMinMs()) return "Menunggu koneksi nomor stabil";
  return null;
}

/** Instruksi penilaian sebelum menulis (disisipkan di prompt follow-up yang membaca riwayat chat). */
export const ATURAN_LEWATI = [
  "Sebelum menulis, baca riwayat chat dan nilai apakah follow-up ini PANTAS. Tulis HANYA <lewati>alasan singkat</lewati> (tanpa pesan) bila:",
  "- ia sudah jelas menolak / tidak jadi / bilang mahal lalu pamit, atau bilang akan menghubungi sendiri nanti;",
  "- ia sudah membeli atau sudah memakai layanan lain untuk kebutuhan yang sama;",
  "- ia sedang komplain, kecewa, atau marah;",
  "- chat-nya bukan soal membeli (salah sambung, lamaran kerja, urusan pribadi, penipuan/spam, hanya minta bantuan teknis);",
  "- isi riwayat terlalu sedikit untuk menulis pesan yang nyambung.",
  "Ragu = tetap tulis pesannya. Jangan menulis <lewati> hanya karena ia diam: diam memang alasan follow-up.",
].join("\n");

/**
 * Gaya copywriting bersama ketiga follow-up: hard selling yang menarik (hook, hasil, pembanding harga, ajakan tegas),
 * tetap di bawah aturan kejujuran masing-masing prompt (fakta hanya dari data, tanpa kelangkaan palsu).
 */
export const GAYA_PESAN = [
  "Gaya tulisan (copywriting hard selling yang bikin ingin beli):",
  "- Kalimat PERTAMA adalah hook: langsung sentuh masalah, keinginan, atau hasil yang ia cari (ambil dari chat-nya). JANGAN membuka dengan \"tadi kita sempat bahas\", \"sekadar mengingatkan\", \"mau follow-up\", atau basa-basi.",
  "- Jual hasil dan perasaan, bukan daftar fitur: apa yang berubah untuknya setelah membeli.",
  "- Kalimat pendek dan bertenaga. Susun jadi 2 sampai 3 paragraf pendek dipisah satu baris kosong.",
  "- Format WhatsApp: *tebal* (satu bintang) untuk nama produk/paket dan harga, paling banyak 3 bagian tebal. Harga normal yang dicoret boleh ditulis ~Rp99.000~ HANYA bila harga normal itu memang ada di data.",
  "- Harga selalu diberi pembanding nyata dari data: harga normal vs promo, dipecah per hari, atau dibanding kerugian / biaya lain yang wajar (tanpa angka karangan).",
  "- Penutup adalah ajakan tegas yang gampang dibalas: \"Balas *YA*, aku bantu sekarang\", pilih A atau B, atau satu langkah konkret. JANGAN menutup dengan \"ada yang bisa dibantu?\" atau \"kalau berminat kabari ya\".",
  "- 1 sampai 2 emoji yang pas, jangan di setiap kalimat.",
].join("\n");

const POLA_LEWATI =/<lewati\b[^>]*>([\s\S]*?)<\/lewati>|<lewati\b[^>]*\/>/i;

/** Alasan bila AI menolak menulis (tag <lewati>), dibersihkan & dipendekkan; null = AI menulis pesan. */
export function ambilLewati(teks: string): string | null {
  const m = POLA_LEWATI.exec(teks);
  if (!m) return null;
  const alasan = (m[1] ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 160);
  return alasan || "follow-up dinilai tidak pantas untuk chat ini";
}

/** Hasil penyusun pesan follow-up: teks yang dikirim, atau keputusan AI untuk tidak mengirim. */
export type HasilSusun = { teks: string } | { lewati: string };
