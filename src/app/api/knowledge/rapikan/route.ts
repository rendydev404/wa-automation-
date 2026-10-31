import { NextResponse } from "next/server";
import { nomorUntuk } from "@/lib/akses";
import { terlaluSering } from "@/lib/batas";
import { teksDokumen } from "@/lib/knowledge";
import { BATAS_RAPIKAN, GalatRapikan, rapikanKnowledge } from "@/lib/rapikan-knowledge";
import { getUser } from "@/lib/session";
import { JENIS_USAHA, type KunciUsaha } from "@/lib/templat-usaha";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

/**
 * Rapikan tulisan base knowledge dengan AI. Body: { numberId, teks?, dokumenId?, jenis? }: `dokumenId` = sempurnakan
 * dokumen yang sudah tersimpan (teksnya dibaca di server). Tidak menyimpan apa pun; hasilnya disimpan pengguna sendiri
 * setelah diperiksa. Galat mesin AI tidak diteruskan apa adanya (nama mesin tidak boleh terlihat pengguna).
 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return galat("Sesi berakhir. Silakan login kembali.", 401);
  const b = (await req.json().catch(() => null)) as { numberId?: number; teks?: string; dokumenId?: number; jenis?: string } | null;
  const nomor = await nomorUntuk(user, b?.numberId);
  if (!nomor) return galat("Nomor tidak ditemukan.", 404);
  if (terlaluSering(`rapikan:${user.id}`, 12, 10 * 60_000)) return galat("Terlalu sering merapikan. Tunggu beberapa menit.", 429);

  let teks = typeof b?.teks === "string" ? b.teks : "";
  if (b?.dokumenId) {
    const d = await teksDokumen(Number(b.dokumenId), nomor.id);
    if (!d) return galat("Dokumen tidak ditemukan.", 404);
    if (d.teks.length > BATAS_RAPIKAN.maks) return galat(`Dokumen ini terlalu panjang untuk dirapikan AI (maks ${BATAS_RAPIKAN.maks.toLocaleString("id-ID")} karakter).`);
    teks = d.teks;
  }
  const jenis = b?.jenis && b.jenis in JENIS_USAHA ? (b.jenis as KunciUsaha) : null;
  try {
    return NextResponse.json(await rapikanKnowledge({ teks, jenis, userId: user.id }));
  } catch (e) {
    if (e instanceof GalatRapikan) return galat(e.message);
    console.error(`[rapikan] gagal user=${user.id} nomor=${nomor.id}: ${e instanceof Error ? e.message : e}`);
    return galat("Bantuan AI sedang tidak tersedia. Coba lagi sebentar lagi, atau simpan tulisan Anda apa adanya.", 502);
  }
}
