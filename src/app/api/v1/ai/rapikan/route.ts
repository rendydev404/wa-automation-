import { aiUntukAkun } from "@/lib/langganan";
import { BATAS_RAPIKAN, GalatRapikan, rapikanKnowledge } from "@/lib/rapikan-knowledge";
import { JENIS_USAHA, type KunciUsaha } from "@/lib/templat-usaha";
import { aman, bacaJson, bukanKonteks, galat, hitungLaju, jatahAi, ok, otorisasi, pemilikMesin } from "@/lib/mesin/api";
import { kembalikanJatahAi } from "@/lib/mesin/kuota-ai";

/** Merapikan = satu panggilan AI panjang (±10–60 dtk): dibatasi per key per menit. */
const PER_MENIT = Math.max(1, Number(process.env.API_RAPIKAN_PER_MENIT) || 6);

/**
 * POST /api/v1/ai/rapikan {teks, jenis?} -> {teks, kurang: [...], peringatan: [...]}
 * Tulisan bebas pemilik usaha disusun AI jadi dokumen Informasi Usaha terstruktur. Tidak menyimpan apa pun: simpan
 * hasilnya lewat POST /nomor/{id}/knowledge setelah diperiksa. `peringatan` = angka/tautan yang tidak ada di tulisan asli.
 */
export async function POST(req: Request) {
  const k = await otorisasi(req, "ai.rapikan");
  if (bukanKonteks(k)) return k;
  const laju = hitungLaju(`rapikan:${k.awalan}`, PER_MENIT, 60_000);
  if (!laju.boleh) return galat("terlalu_sering", `Maks ${PER_MENIT} permintaan rapikan per menit per key.`, k.id, laju.kepala);
  const b = await bacaJson(req, k);
  if (!("teks" in b)) return b;
  return aman(k, async () => {
    const teks = typeof b.data.teks === "string" ? b.data.teks : "";
    if (!teks.trim() || teks.length > BATAS_RAPIKAN.maks) return galat("isian_tidak_sah", `\`teks\` wajib diisi (maks ${BATAS_RAPIKAN.maks.toLocaleString("id-ID")} karakter).`, k.id, k.kepala);
    const jenis = typeof b.data.jenis === "string" && Object.hasOwn(JENIS_USAHA, b.data.jenis) ? (b.data.jenis as KunciUsaha) : null;
    const pemilik = await pemilikMesin();
    const { penyedia } = await aiUntukAkun(pemilik);
    const habis = await jatahAi(k);
    if (habis) return habis;
    try {
      const h = await rapikanKnowledge({ teks, jenis, userId: pemilik ?? 0, penyedia });
      return ok({ teks: h.teks, kurang: h.kurang, peringatan: h.peringatan }, k);
    } catch (e) {
      await kembalikanJatahAi();
      if (e instanceof GalatRapikan) return galat("isian_tidak_sah", e.message, k.id, k.kepala);
      console.error(`[api ${k.id}] rapikan gagal: ${e instanceof Error ? e.message : e}`);
      return galat("ai_tidak_tersedia", "AI sedang tidak bisa merapikan. Coba lagi sebentar lagi.", k.id, k.kepala);
    }
  });
}
