import { fiturBoleh } from "@/lib/mesin/lisensi";
import { NextResponse } from "next/server";
import { nomorUntuk } from "@/lib/akses";
import { catatFitur } from "@/lib/analitik";
import { terlaluSering } from "@/lib/batas";
import { teksDokumen } from "@/lib/knowledge";
import { BATAS_RAPIKAN, GalatRapikan, rapikanKnowledge, siapRapikan } from "@/lib/rapikan-knowledge";
import { getUser } from "@/lib/session";
import { teksPermintaan } from "@/lib/bahasa-server";
import { jenisUsahaSah } from "@/lib/templat-usaha";
import { staf } from "@/lib/peran";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

/**
 * Rapikan tulisan base knowledge dengan AI. Body: { numberId, teks?, dokumenId?, jenis? }: `dokumenId` = sempurnakan
 * dokumen yang sudah tersimpan (teksnya dibaca di server). Tidak menyimpan apa pun; hasilnya disimpan pengguna sendiri
 * setelah diperiksa. Galat mesin AI tidak diteruskan apa adanya (nama mesin tidak boleh terlihat pengguna).
 *
 * Jawaban berupa NDJSON yang dialirkan: `{"progres":{"selesai":n,"total":m}}` tiap bagian selesai (dokumen panjang
 * dipecah per bagian), lalu satu baris akhir `{"hasil":{...}}` atau `{"error":"..."}`. Baris kosong = penanda hidup
 * supaya proxy tidak memutus koneksi saat menunggu AI. Galat sebelum mulai (sesi, nomor, batas) tetap JSON biasa.
 */
export async function POST(req: Request) {
  if (!fiturBoleh("ai.rapikan")) return Response.json({ error: "Fitur ini dinonaktifkan oleh ChatGerCep." }, { status: 403 });
  const [user, { b: bahasa, t }] = await Promise.all([getUser(), teksPermintaan()]);
  if (!user) return galat(t("Sesi berakhir. Silakan login kembali.", "Your session has ended. Please sign in again."), 401);
  const b = (await req.json().catch(() => null)) as { numberId?: number; teks?: string; dokumenId?: number; jenis?: string } | null;
  const nomor = await nomorUntuk(user, b?.numberId);
  if (!nomor) return galat(t("Nomor tidak ditemukan.", "Number not found."), 404);
  if (terlaluSering(`rapikan:${user.id}`, 12, 10 * 60_000)) return galat(t("Terlalu sering merapikan. Tunggu beberapa menit.", "Too many tidy-up requests. Please wait a few minutes."), 429);

  let teks = typeof b?.teks === "string" ? b.teks : "";
  if (b?.dokumenId) {
    const d = await teksDokumen(Number(b.dokumenId), nomor.id, staf(user.peran));
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
  try {
    siapRapikan(teks);
  } catch (e) {
    if (e instanceof GalatRapikan) return galat((bahasa === "en" && e.en) || e.message);
    throw e;
  }
  const jenis = jenisUsahaSah(b?.jenis) ? b.jenis : null;

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      let tutup = false;
      const kirim = (o: object | null) => {
        if (tutup) return;
        try {
          ctrl.enqueue(enc.encode(o ? `${JSON.stringify(o)}\n` : "\n"));
        } catch {
          tutup = true;
        }
      };
      const hidup = setInterval(() => kirim(null), 15_000);
      try {
        const hasil = await rapikanKnowledge({ teks, jenis, userId: user.id, sinyal: req.signal, progres: (selesai, total) => kirim({ progres: { selesai, total } }) });
        catatFitur(user.id, b?.dokumenId ? "knowledge.sempurnakan_ai" : "knowledge.rapikan_ai");
        kirim({ hasil });
      } catch (e) {
        if (req.signal.aborted) {
          // Pengguna menutup/membatalkan: sisa bagian tidak dikerjakan, tidak perlu dicatat sebagai galat.
        } else if (e instanceof GalatRapikan) kirim({ error: (bahasa === "en" && e.en) || e.message });
        else {
          console.error(`[rapikan] gagal user=${user.id} nomor=${nomor.id}: ${e instanceof Error ? e.message : e}`);
          kirim({ error: t("Bantuan AI sedang tidak tersedia. Coba lagi sebentar lagi, atau simpan tulisan Anda apa adanya.", "AI help isn't available right now. Try again shortly, or save your text as is.") });
        }
      } finally {
        clearInterval(hidup);
        tutup = true;
        try {
          ctrl.close();
        } catch {
          /* sudah ditutup klien */
        }
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" },
  });
}
