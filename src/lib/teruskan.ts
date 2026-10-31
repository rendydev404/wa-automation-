/**
 * Sistem teruskan: AI tidak bisa menyiapkan pesanan, mengecek transfer, atau menelepon. Untuk hal seperti itu ia
 * menulis tag di baris akhir jawabannya; jembatan WhatsApp membuang tag itu dari pesan ke pelanggan dan mengirim
 * ringkasannya ke nomor WhatsApp pribadi pemilik usaha (numbers.teruskan_ke). Modul ini murni teks (tanpa I/O):
 * aturan untuk prompt, pengurai tag, dan format pesan ke pemilik. Pengirimannya ada di penerusan.ts.
 */

export const JENIS_TERUSKAN = {
  pesanan: { label: "Pesanan baru", ikon: "🛒" },
  pembayaran: { label: "Konfirmasi pembayaran", ikon: "💳" },
  keluhan: { label: "Keluhan pelanggan", ikon: "⚠️" },
  hubungi: { label: "Pelanggan minta dihubungi", ikon: "🙋" },
  pertanyaan: { label: "Pertanyaan perlu dijawab", ikon: "❓" },
  lainnya: { label: "Perlu tindakan", ikon: "📌" },
  uji: { label: "Pesan uji", ikon: "✅" },
} as const;
export type JenisTeruskan = keyof typeof JENIS_TERUSKAN;

export const MAKS_RINGKASAN = 1200;

/** Nomor penerus wajib: tanpa itu nomor tidak bisa dipakai (lihat siapDipakai di numbers.ts). */
export const PERLU_PENERUS = "Isi nomor WhatsApp penerus dulu (bagian \"Teruskan ke WhatsApp Anda\"). Tanpa nomor itu AI tidak membalas di nomor ini.";

/**
 * Aturan untuk AI di nomor yang penerusannya aktif. Isinya disusun dari kebiasaan CS manusia: kumpulkan data
 * dulu, konfirmasi, baru serahkan; pelanggan diberi tahu dengan jujur apa yang terjadi.
 */
export const ATURAN_TERUSKAN = `<aturan_teruskan>
Kamu BISA meneruskan pesan ke pemilik usaha (manusia) lewat WhatsApp pribadinya. Ini satu-satunya tindakan yang bisa kamu lakukan selain membalas chat. WAJIB dipakai setiap kali pelanggan butuh sesuatu yang hanya bisa dikerjakan manusia; jangan pernah membiarkan hal seperti ini hanya menggantung di chat:
- pesanan: pelanggan pasti memesan DAN datanya lengkap. Data yang wajib dikumpulkan ikuti daftar "data pesanan" di pengetahuan nomor; bila tidak ada daftarnya, minimal: nama pemesan, produk + varian + jumlah, diambil atau dikirim (alamat lengkap bila dikirim), waktu, dan cara bayar. Data belum lengkap: tanyakan SEMUA yang kurang dalam satu pesan, jangan diteruskan dulu. Data lengkap: ulangi ringkasan pesanan ke pelanggan untuk dicek; teruskan setelah pelanggan setuju (atau langsung bila ia sudah menegaskan pesanannya).
- pembayaran: pelanggan bilang sudah transfer atau mengirim bukti bayar. Kamu tidak bisa memastikan uangnya masuk: katakan akan dicek pemilik.
- keluhan: barang rusak/salah/kurang, layanan mengecewakan, minta refund atau garansi, juga permintaan servis/perbaikan. Minta maaf singkat, tanyakan detail yang kurang (apa masalahnya, alamat/lokasi bila perlu didatangi, foto bila ada) dalam satu pesan, lalu teruskan begitu detail utamanya ada.
- hubungi: pelanggan minta bicara dengan manusia/admin/pemilik, ingin menelepon, atau kamu sudah mencoba tapi tidak bisa membantu.
- pertanyaan: pertanyaan penting yang jawabannya tidak ada di pengetahuan (stok hari ini, ongkir ke daerah tertentu, harga grosir/khusus, jadwal kosong).
Cara meneruskan: tulis jawabanmu ke pelanggan seperti biasa, lalu di BARIS PALING AKHIR tambahkan tepat satu tag:
<teruskan jenis="pesanan">Nama: ...
Pesanan: ...
Diambil/dikirim: ...
Waktu: ...
Pembayaran: ...
Catatan: ...</teruskan>
Isi tag ditulis untuk pemilik, bukan pelanggan: baris "Label: isi" yang padat, hanya data yang benar-benar disebut di chat ini (jangan mengarang, jangan menghitung total sendiri; tulis harga satuan bila tertulis di pengetahuan). Nomor WhatsApp pelanggan ditambahkan sistem, tidak perlu kamu tulis. Jenis: pesanan, pembayaran, keluhan, hubungi, pertanyaan, atau lainnya. Tag tidak terlihat pelanggan.
Satu tag untuk satu kejadian: jangan meneruskan hal yang sama dua kali; pesanan berubah = teruskan lagi dengan data terbaru dan tulis "Perubahan:" di catatan. Jangan memakai tag untuk sapaan, info yang bisa kamu jawab sendiri, atau obrolan.
Ke pelanggan bilang dengan wajar seperti CS manusia, misalnya "Siap Kak, aku teruskan ke tim ya, nanti dikabari lagi di chat ini 🙏". Jangan menjelaskan cara kerja penerusan, dan jangan menjanjikan waktu, stok, atau hasil yang tidak tertulis di pengetahuan.
</aturan_teruskan>`;

/** Untuk nomor tanpa penerusan: AI tahu ia tidak bisa meneruskan, jadi tidak berpura-pura. */
export const ATURAN_TANPA_TERUSKAN = `<aturan_teruskan>
Penerusan ke pemilik TIDAK aktif saat ini. Untuk pesanan, bukti bayar, keluhan, atau permintaan bicara dengan orang: kumpulkan datanya dengan rapi di chat ini, lalu bilang dengan wajar bahwa tim kami akan membalas langsung di chat ini.
</aturan_teruskan>`;

export interface TagTeruskan {
  jenis: JenisTeruskan;
  ringkasan: string;
}

const POLA_TAG = /<teruskan(?:\s+jenis\s*=\s*["']?([a-z]+)["']?)?\s*>([\s\S]*?)(?:<\/teruskan>|$)/i;

/**
 * Pisahkan tag teruskan dari jawaban AI. Tag yang terpotong (tanpa penutup) tetap dibaca. Jenis tak dikenal =
 * "lainnya"; ringkasan kosong = tidak diteruskan. Sisa tag/penutup yang nyasar selalu dibuang dari teks pelanggan.
 */
export function ambilTeruskan(jawaban: string): { teks: string; tag: TagTeruskan | null } {
  const m = jawaban.match(POLA_TAG);
  const teks = jawaban
    .replace(POLA_TAG, "")
    .replace(/<\/?teruskan[^>]*>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!m) return { teks, tag: null };
  const ringkasan = m[2]
    .split("\n")
    .map((b) => b.trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, MAKS_RINGKASAN);
  if (!ringkasan) return { teks, tag: null };
  const j = (m[1] ?? "").toLowerCase();
  const jenis: JenisTeruskan = j in JENIS_TERUSKAN && j !== "uji" ? (j as JenisTeruskan) : "lainnya";
  return { teks, tag: { jenis, ringkasan } };
}

/** Nomor digit -> tampilan "+62 812-3456-7890". */
export function tampilNomor(digit: string): string {
  const d = digit.replace(/\D/g, "");
  if (!d.startsWith("62") || d.length < 10) return `+${d}`;
  const sisa = d.slice(2);
  return `+62 ${sisa.slice(0, 3)}-${sisa.slice(3, 7)}-${sisa.slice(7)}`;
}

/** Pesan yang sampai di WhatsApp pribadi pemilik. */
export function pesanUntukPemilik(p: { tag: TagTeruskan; namaPelanggan: string | null; teleponPelanggan: string | null; labelNomor: string; namaWa: string | null }): string {
  const j = JENIS_TERUSKAN[p.tag.jenis];
  const dari = [p.namaPelanggan?.trim(), p.teleponPelanggan ? tampilNomor(p.teleponPelanggan) : null].filter(Boolean).join(" · ") || "pelanggan (nomor tersembunyi)";
  const baris = [`${j.ikon} *${j.label}*`, `Dari: ${dari}`, `Masuk di: ${p.namaWa ? `${p.namaWa} (${p.labelNomor})` : p.labelNomor}`, "", p.tag.ringkasan];
  if (p.teleponPelanggan) baris.push("", `Chat pelanggan: https://wa.me/${p.teleponPelanggan}`);
  baris.push("", "_Diteruskan otomatis oleh asisten AI. Balas pelanggan dari WhatsApp nomor bisnis supaya riwayatnya tetap di satu chat._");
  return baris.join("\n");
}
