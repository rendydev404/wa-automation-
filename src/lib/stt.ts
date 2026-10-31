import "server-only";

/**
 * Transkripsi pesan suara pelanggan (speech-to-text) lewat API transkripsi yang kompatibel OpenAI
 * (POST {STT_API_URL}/audio/transcriptions). Bawaan: Groq Whisper (cepat & murah, bagus untuk bahasa Indonesia);
 * bisa diganti OpenAI dengan STT_API_URL=https://api.openai.com/v1 dan STT_MODEL=gpt-4o-mini-transcribe.
 * Env: STT_API_KEY (wajib; tanpa ini pesan suara tidak ditranskrip), STT_API_URL, STT_MODEL.
 * Audio hanya dikirim untuk ditranskrip lalu dibuang, tidak pernah disimpan.
 */

export function sttTerkonfigurasi(): boolean {
  return !!process.env.STT_API_KEY;
}

const EKSTENSI: Record<string, string> = { "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "m4a", "audio/wav": "wav", "audio/webm": "webm" };

export async function transkripsi(audio: Buffer, mime: string): Promise<string> {
  if (!sttTerkonfigurasi()) throw new Error("Transkripsi suara belum dikonfigurasi (STT_API_KEY).");
  const basis = (process.env.STT_API_URL || "https://api.groq.com/openai/v1").replace(/\/+$/, "");
  const form = new FormData();
  // Pesan suara WhatsApp = Ogg/Opus; diterima langsung tanpa konversi.
  form.set("file", new Blob([new Uint8Array(audio)], { type: mime }), `suara.${EKSTENSI[mime] ?? "ogg"}`);
  form.set("model", process.env.STT_MODEL || "whisper-large-v3-turbo");
  form.set("language", "id");
  form.set("response_format", "json");
  const res = await fetch(`${basis}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.STT_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`transkripsi HTTP ${res.status}`);
  const d = (await res.json()) as { text?: string };
  return (d.text ?? "").replace(/\s+/g, " ").trim();
}
