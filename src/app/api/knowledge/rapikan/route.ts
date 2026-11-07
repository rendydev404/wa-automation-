import { NextResponse } from "next/server";
import { nomorUntuk } from "@/lib/akses";
import { catatFitur } from "@/lib/analitik";
import { terlaluSering } from "@/lib/batas";
import { teksDokumen } from "@/lib/knowledge";
import { BATAS_RAPIKAN, GalatRapikan, rapikanKnowledge } from "@/lib/rapikan-knowledge";
import { getUser } from "@/lib/session";
import { teksPermintaan } from "@/lib/bahasa-server";
import { JENIS_USAHA, type KunciUsaha } from "@/lib/templat-usaha";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

/**
 * Rapikan tulisan base knowledge dengan AI. Body: { numberId, teks?, dokumenId?, jenis? }: `dokumenId` = sempurnakan
 * dokumen yang sudah tersimpan (teksnya dibaca di server). Tidak menyimpan apa pun; hasilnya disimpan pengguna sendiri
 * setelah diperiksa. Galat mesin AI tidak diteruskan apa adanya (nama mesin tidak boleh terlihat pengguna).
 */
export async function POST(req: Request) {
  const [user, { b: bahasa, t }] = await Promise.all([getUser(), teksPermintaan()]);
  if (!user) return galat(t("Sesi berakhir. Silakan login kembali.", "Your session has ended. Please sign in again."), 401);
  const b = (await req.json().catch(() => null)) as { numberId?: number; teks?: string; dokumenId?: number; jenis?: string } | null;
  const nomor = await nomorUntuk(user, b?.numberId);
  if (!nomor) return galat(t("Nomor tidak ditemukan.", "Number not found."), 404);
  if (terlaluSering(`rapikan:${user.id}`, 12, 10 * 60_000)) return galat(t("Terlalu sering merapikan. Tunggu beberapa menit.", "Too many tidy-up requests. Please wait a few minutes."), 429);

  let teks = typeof b?.teks === "string" ? b.teks : "";
  if (b?.dokumenId) {
    const d = await teksDokumen(Number(b.dokumenId), nomor.id, user.peran === "admin");
    if (!d) return galat(t("Dokumen tidak ditemukan.", "Document not found."), 404);
    if (d.teks.length > BATAS_RAPIKAN.maks)
      return galat(
        t(
          `Dokumen ini terlalu panjang untuk dirapikan AI (maks ${BATAS_RAPIKAN.maks.toLocaleString("id-ID")} karakter).`,
          `This document is too long for the AI to tidy up (max ${BATAS_RAPIKAN.maks.toLocaleString("en-US")} characters).`
        )
      );
    teks = d.teks;
  }
  const jenis = b?.jenis && b.jenis in JENIS_USAHA ? (b.jenis as KunciUsaha) : null;
  try {
    const hasil = await rapikanKnowledge({ teks, jenis, userId: user.id });
    catatFitur(user.id, b?.dokumenId ? "knowledge.sempurnakan_ai" : "knowledge.rapikan_ai");
    return NextResponse.json(hasil);
  } catch (e) {
    if (e instanceof GalatRapikan) return galat((bahasa === "en" && e.en) || e.message);
    console.error(`[rapikan] gagal user=${user.id} nomor=${nomor.id}: ${e instanceof Error ? e.message : e}`);
    return galat(t("Bantuan AI sedang tidak tersedia. Coba lagi sebentar lagi, atau simpan tulisan Anda apa adanya.", "AI help isn't available right now. Try again shortly, or save your text as is."), 502);
  }
}
