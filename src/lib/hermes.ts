import "server-only";
import type { Foto } from "./types";

/**
 * Klien Hermes (profil `cs`). Riwayat percakapan disimpan Hermes sendiri per `sessionId`
 * (header X-Hermes-Session-Id); app ini hanya mengirim pesan baru + konteks sistem.
 * Env: HERMES_API_URL, HERMES_API_KEY, HERMES_PROFILE (default "cs").
 */

export function hermesTerkonfigurasi(): boolean {
  return !!process.env.HERMES_API_URL && !!process.env.HERMES_API_KEY;
}

function basis(): string {
  return `${process.env.HERMES_API_URL!.replace(/\/+$/, "")}/p/${process.env.HERMES_PROFILE || "cs"}/v1`;
}

export interface JawabanHermes {
  teks: string;
  ms: number;
  tokenMasuk: number | null;
}

/**
 * `gambar`: foto pelanggan, dikirim sebagai bagian image_url (data URL) bersama teks pesan. Hermes
 * meneruskannya ke model yang bisa melihat; di riwayat sesi foto tidak dikirim ulang ke giliran berikutnya.
 */
export async function tanyaHermes(opsi: { sessionId: string; sistem: string; pesan: string; gambar?: Foto[]; timeoutMs?: number; sinyal?: AbortSignal }): Promise<JawabanHermes> {
  if (!hermesTerkonfigurasi()) throw new Error("Hermes belum dikonfigurasi (HERMES_API_URL / HERMES_API_KEY).");
  const mulai = performance.now();
  const res = await fetch(`${basis()}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.HERMES_API_KEY}`,
      "Content-Type": "application/json",
      "X-Hermes-Session-Id": opsi.sessionId,
    },
    body: JSON.stringify({
      model: "hermes",
      stream: false,
      messages: [
        { role: "system", content: opsi.sistem.toWellFormed() },
        {
          role: "user",
          content: opsi.gambar?.length
            ? [{ type: "text", text: opsi.pesan.toWellFormed() }, ...opsi.gambar.map((g) => ({ type: "image_url", image_url: { url: `data:${g.mime};base64,${g.data}` } }))]
            : opsi.pesan.toWellFormed(),
        },
      ],
    }),
    signal: ((t) => (opsi.sinyal ? AbortSignal.any([t, opsi.sinyal]) : t))(AbortSignal.timeout(opsi.timeoutMs ?? (opsi.gambar?.length ? 110_000 : 75_000))),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Hermes membalas HTTP ${res.status}`);
  const d = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number };
  };
  const teks = d.choices?.[0]?.message?.content?.trim() ?? "";
  if (!teks) throw new Error("Hermes membalas kosong");
  return { teks, ms: Math.round(performance.now() - mulai), tokenMasuk: d.usage?.prompt_tokens ?? null };
}

/** Cek ringan: API Hermes hidup & kunci benar. */
export async function hermesSehat(): Promise<boolean> {
  if (!hermesTerkonfigurasi()) return false;
  try {
    const res = await fetch(`${basis()}/models`, {
      headers: { Authorization: `Bearer ${process.env.HERMES_API_KEY}` },
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}
