import { connection } from "next/server";
import { pembuatT } from "@/lib/bahasa";
import { faqLanding } from "@/lib/faq-landing";
import { MASA_ID } from "@/lib/jaminan-def";
import { daftarPaket } from "@/lib/langganan";
import { DAFTAR_INDUSTRI } from "@/lib/lp/industri";
import { MEREK, NOMOR_WA_TAMPIL, PERUSAHAAN } from "@/lib/merek";
import { ASAL_SITUS } from "@/lib/seo";

/**
 * /llms.txt (llmstxt.org): ringkasan Markdown untuk asisten AI (ChatGPT, Claude, Perplexity, Gemini) supaya bisa
 * menjelaskan dan mengutip ChatGerCep dengan benar tanpa harus mengurai HTML landing page. Harga dibaca dari paket
 * aktif (satu kueri kecil); database tak terjangkau = bagian harga merujuk ke landing page saja.
 */
const rp = (n: number) => `Rp${n.toLocaleString("id-ID")}`;

export async function GET(): Promise<Response> {
  await connection();
  const t = pembuatT("id");
  let harga = "";
  try {
    const paket = (await daftarPaket()).filter((p) => p.harga > 0);
    harga = paket.map((p) => `- **${p.nama}**: ${rp(p.harga)} per ${p.durasi_hari} hari, ${p.kuota_nomor} nomor WhatsApp, ${p.kuota_balasan.toLocaleString("id-ID")} balasan AI`).join("\n");
  } catch {
    harga = "";
  }

  const isi = `# ${MEREK}

> ${MEREK} adalah asisten AI untuk WhatsApp yang membalas chat pelanggan usaha secara otomatis 24 jam. Pemilik usaha menyambungkan nomor WhatsApp yang sudah ada (WhatsApp biasa atau WhatsApp Business) lewat scan QR, mengisi Informasi Usaha (produk, harga, jam buka, FAQ, PDF), lalu AI menjawab pelanggan dalam hitungan detik hanya berdasarkan informasi itu. Produk ${PERUSAHAAN}, Indonesia.

Situs berbahasa Indonesia di ${ASAL_SITUS}/ dan berbahasa Inggris di ${ASAL_SITUS}/eng.

## Cara kerja

1. Daftar akun di ${ASAL_SITUS}/daftar.
2. Sambungkan nomor WhatsApp lewat scan QR atau kode di HP (tersambung sebagai perangkat tertaut, seperti WhatsApp Web; HP tetap bisa dipakai).
3. Isi Informasi Usaha: unggah PDF, menu, daftar harga, atau FAQ.
4. Coba lewat fitur Uji bot, lalu aktifkan paket langganan.
5. AI membalas pelanggan 24 jam. Saat pemilik membalas sendiri dari HP, AI otomatis diam di chat itu.

## Fitur utama

- Jawaban hanya dari Informasi Usaha; AI dilarang menebak dan meneruskan ke pemilik bila tidak tahu.
- Belajar dari gaya balasan pemilik usaha.
- Mengerti foto dari pelanggan (foto produk, bukti transfer).
- Histori percakapan per akun, terhapus otomatis setelah 30 hari.
- Banyak nomor WhatsApp dalam satu akun (sesuai paket).
- Garansi uang kembali 100% dalam ${MASA_ID} bila layanan tidak sesuai janji: ${ASAL_SITUS}/garansi
- Bukan untuk broadcast/promo massal; akun yang dipakai spam diblokir.

## Harga

${harga ? `${harga}\n\nHarga dalam Rupiah, tanpa kontrak. Rincian terbaru: ${ASAL_SITUS}/#harga` : `Daftar paket dan harga terbaru: ${ASAL_SITUS}/#harga`}

## Pertanyaan umum

${faqLanding(t)
  .map((f) => `### ${f.t}\n\n${f.j}`)
  .join("\n\n")}

## Halaman penting

- [Beranda](${ASAL_SITUS}/): penjelasan produk, demo, harga, FAQ
- [Panduan cara pakai](${ASAL_SITUS}/panduan): langkah bergambar dari daftar sampai AI membalas pelanggan
- [Program afiliasi](${ASAL_SITUS}/program-afiliasi): komisi untuk yang mereferensikan ${MEREK}
- [Syarat garansi uang kembali](${ASAL_SITUS}/garansi)
- [English version](${ASAL_SITUS}/eng)

## ${MEREK} per jenis usaha

${DAFTAR_INDUSTRI.map((x) => `- [${MEREK} untuk ${x.industry_name}](${ASAL_SITUS}/${x.slug}): ${x.seo_metadata.description}`).join("\n")}

## Kontak

Customer service WhatsApp: ${NOMOR_WA_TAMPIL}
`;
  return new Response(isi, { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
