import { sttTerkonfigurasi, transkripsi } from "@/lib/stt";
import { MAKS_SUARA } from "@/lib/wa";
import { aman, bacaJson, bukanKonteks, galat, hitungLaju, ok, otorisasi } from "@/lib/mesin/api";

const PER_MENIT = Math.max(1, Number(process.env.API_TRANSKRIPSI_PER_MENIT) || 30);
const MIME = new Set(["audio/ogg", "audio/mpeg", "audio/mp4", "audio/aac", "audio/wav", "audio/webm"]);
const rapikanMime = (m: string) => m.split(";")[0].trim().toLowerCase();

/**
 * POST /api/v1/ai/transkripsi -> {teks, ms}
 *   - JSON {audio_base64, mime}; atau
 *   - multipart/form-data: field "berkas" (ogg/mp3/m4a/wav/webm, maks 10 MB).
 * Audio dikirim ke penyedia STT mesin (STT_API_KEY) lalu dibuang, tidak disimpan.
 */
export async function POST(req: Request) {
  const k = await otorisasi(req, "ai.transkripsi");
  if (bukanKonteks(k)) return k;
  if (!sttTerkonfigurasi()) return galat("ai_tidak_tersedia", "Transkripsi belum aktif di mesin ini: isi STT_API_KEY di .env mesin.", k.id, k.kepala);
  const laju = hitungLaju(`stt:${k.awalan}`, PER_MENIT, 60_000);
  if (!laju.boleh) return galat("terlalu_sering", `Maks ${PER_MENIT} transkripsi per menit per key.`, k.id, laju.kepala);
  const salah = (pesan: string) => galat("isian_tidak_sah", pesan, k.id, k.kepala);
  let audio: Buffer;
  let mime: string;
  if ((req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    if (Number(req.headers.get("content-length") ?? 0) > MAKS_SUARA.byte + 64 * 1024) return salah("Berkas suara maksimal 10 MB.");
    const f = (await req.formData().catch(() => null))?.get("berkas");
    if (!(f instanceof File)) return salah("Kirim berkas suara di field `berkas`.");
    if (f.size > MAKS_SUARA.byte) return salah("Berkas suara maksimal 10 MB.");
    audio = Buffer.from(await f.arrayBuffer());
    mime = rapikanMime(f.type);
  } else {
    const b = await bacaJson(req, k, Math.ceil((MAKS_SUARA.byte * 4) / 3) + 64 * 1024);
    if (!("teks" in b)) return b;
    const data = String(b.data.audio_base64 ?? "").replace(/^data:[^;]+;base64,/, "");
    if (!data || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return salah("`audio_base64` wajib berisi base64 yang sah.");
    audio = Buffer.from(data, "base64");
    mime = rapikanMime(String(b.data.mime ?? ""));
  }
  if (!MIME.has(mime)) return salah(`mime harus salah satu: ${[...MIME].join(", ")}.`);
  if (!audio.length || audio.length > MAKS_SUARA.byte) return salah("Audio kosong atau lebih dari 10 MB.");
  return aman(k, async () => {
    const mulai = performance.now();
    try {
      const teks = await transkripsi(audio, mime);
      return ok({ teks, ms: Math.round(performance.now() - mulai) }, k);
    } catch (e) {
      console.error(`[api ${k.id}] transkripsi gagal: ${e instanceof Error ? e.message : e}`);
      return galat("ai_tidak_tersedia", "Penyedia transkripsi tidak menjawab. Coba lagi sebentar lagi.", k.id, k.kepala);
    }
  });
}
