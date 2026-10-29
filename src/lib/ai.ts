import "server-only";
import { db, getSetting, sekarang } from "./db";
import { hermesSehat, hermesTerkonfigurasi, tanyaHermes } from "./hermes";
import { JAWABAN_AMAN, type Pelanggaran, pesanKoreksi, periksaJawaban } from "./pemeriksa";
import { teksSoul } from "./soul";
import type { Foto } from "./types";

/**
 * Satu pintu ke AI, apa pun penyedianya:
 * - "hermes": profil Hermes `cs` (menyimpan riwayat sesi sendiri; SOUL ada di profilnya).
 * - "openrouter": API OpenRouter (format OpenAI). Tanpa ingatan: SOUL dan riwayat chat dikirim tiap giliran.
 * Penyedia & model dipilih admin di panel (settings ai_penyedia / ai_model / ai_cadangan), berlaku langsung
 * tanpa restart. Env: OPENROUTER_API_KEY, OPENROUTER_MODEL, OPENROUTER_CADANGAN (bawaan bila setting kosong).
 */

export type Penyedia = "hermes" | "openrouter";

export const MODEL_BAWAAN = process.env.OPENROUTER_MODEL || "anthropic/claude-haiku-5.5";
export const CADANGAN_BAWAAN = process.env.OPENROUTER_CADANGAN || "google/gemini-2.5-flash-lite";
const ID_MODEL = /^[a-z0-9-]+\/[a-z0-9._:-]+$/i;

export interface PengaturanAi {
  penyedia: Penyedia;
  model: string;
  cadangan: string;
}

export const openrouterSiap = (): boolean => !!process.env.OPENROUTER_API_KEY;

export async function pengaturanAi(): Promise<PengaturanAi> {
  const [p, m, c] = await Promise.all([getSetting("ai_penyedia"), getSetting("ai_model"), getSetting("ai_cadangan")]);
  // Pilihan admin, lalu env AI_PENYEDIA; tanpa keduanya: Hermes bila terpasang (produksi lama), selain itu OpenRouter.
  const pilih = p ?? process.env.AI_PENYEDIA ?? null;
  const penyedia: Penyedia =
    pilih === "openrouter" ? (openrouterSiap() ? "openrouter" : "hermes") : pilih === "hermes" ? "hermes" : hermesTerkonfigurasi() || !openrouterSiap() ? "hermes" : "openrouter";
  return { penyedia, model: m && ID_MODEL.test(m) ? m : MODEL_BAWAAN, cadangan: c && ID_MODEL.test(c) ? c : CADANGAN_BAWAAN };
}

export interface JawabanAi {
  teks: string;
  ms: number;
  penyedia: Penyedia;
  model: string | null;
  tokenMasuk: number | null;
  tokenKeluar: number | null;
  biayaUsd: number | null;
}

export interface PermintaanAi {
  /** Kunci sesi Hermes (diabaikan OpenRouter). */
  sessionId: string;
  /** Konteks per giliran dari susunSistem (knowledge, instruksi nomor, riwayat, batas topik). */
  sistem: string;
  pesan: string;
  gambar?: Foto[];
  timeoutMs?: number;
  /** Paksa penyedia/model tertentu (uji perbandingan model); bawaan = pengaturan admin. */
  paksa?: Partial<PengaturanAi>;
}

/** Penyedia tanpa ingatan sesi: pemanggil wajib menyertakan riwayat chat lengkap di pesan sistem. */
export const tanpaIngatan = (p: Penyedia): boolean => p === "openrouter";

export async function tanyaAi(r: PermintaanAi): Promise<JawabanAi> {
  const atur = { ...(await pengaturanAi()), ...r.paksa };
  if (atur.penyedia === "hermes") {
    const j = await tanyaHermes(r);
    return { teks: j.teks, ms: j.ms, penyedia: "hermes", model: null, tokenMasuk: j.tokenMasuk, tokenKeluar: null, biayaUsd: null };
  }
  return tanyaOpenRouter(r, atur.model, atur.cadangan);
}

const MAKS_TOKEN_KELUAR = 700; // balasan WhatsApp pendek; pagar biaya bila model "kebablasan"

/**
 * Penalaran ("berpikir") dimatikan: diukur pada 8 pertanyaan asli dengan claude-haiku-5.5, waktu balas turun dari
 * rata-rata 3,1 dtk (penalaran rendah) ke 1,5 dtk (maks 1,8 dtk) dan token keluar 323 -> 108, mutu jawaban setara.
 * Model yang penalarannya tidak bisa dimatikan (GPT-5, Qwen) diberi tingkat rendah supaya max_tokens tidak habis
 * untuk berpikir lalu membalas kosong; teks penalarannya tidak dikirim balik.
 */
function penalaran(model: string) {
  return /^(openai\/gpt-5|openai\/o\d|qwen\/)/.test(model) ? { effort: "low", exclude: true } : { enabled: false };
}

async function tanyaOpenRouter(r: PermintaanAi, model: string, cadangan: string): Promise<JawabanAi> {
  const kunci = process.env.OPENROUTER_API_KEY;
  if (!kunci) throw new Error("OPENROUTER_API_KEY belum diisi.");
  const mulai = performance.now();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${kunci}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_URL || "https://wa.sukapost.tech",
      "X-Title": "Asisten WhatsApp",
    },
    body: JSON.stringify({
      // Model cadangan dipakai otomatis bila model utama gagal/kena batas.
      models: cadangan && cadangan !== model ? [model, cadangan] : [model],
      messages: [
        {
          role: "system",
          // SOUL selalu sama persis di setiap panggilan: ditandai supaya di-cache penyedia (input jauh lebih murah).
          content: [
            { type: "text", text: teksSoul(), cache_control: { type: "ephemeral" } },
            { type: "text", text: r.sistem },
          ],
        },
        {
          role: "user",
          content: r.gambar?.length
            ? [{ type: "text", text: r.pesan }, ...r.gambar.map((g) => ({ type: "image_url", image_url: { url: `data:${g.mime};base64,${g.data}` } }))]
            : r.pesan,
        },
      ],
      max_tokens: MAKS_TOKEN_KELUAR,
      reasoning: penalaran(model),
      temperature: 0.4,
      usage: { include: true },
      // Data chat pelanggan tidak boleh disimpan/dipakai melatih model oleh penyedia.
      provider: { data_collection: "deny" },
    }),
    signal: AbortSignal.timeout(r.timeoutMs ?? (r.gambar?.length ? 90_000 : 60_000)),
    cache: "no-store",
  });
  const d = (await res.json().catch(() => null)) as {
    model?: string;
    error?: { message?: string; code?: number };
    choices?: { message?: { content?: string }; finish_reason?: string }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  } | null;
  if (!res.ok || !d || d.error) throw new Error(`OpenRouter HTTP ${res.status}${d?.error?.message ? `: ${d.error.message.slice(0, 200)}` : ""}`);
  const teks = d.choices?.[0]?.message?.content?.trim() ?? "";
  if (!teks) throw new Error("OpenRouter membalas kosong");
  return {
    teks,
    ms: Math.round(performance.now() - mulai),
    penyedia: "openrouter",
    model: d.model ?? model,
    tokenMasuk: d.usage?.prompt_tokens ?? null,
    tokenKeluar: d.usage?.completion_tokens ?? null,
    biayaUsd: typeof d.usage?.cost === "number" ? d.usage.cost : null,
  };
}

// ---------- Kesehatan & saldo ----------

/** Penyedia aktif bisa dijangkau? (dipanggil berkala lewat cache di /api/wa/status) */
export async function aiSehat(): Promise<boolean> {
  const { penyedia } = await pengaturanAi();
  if (penyedia === "hermes") return hermesSehat();
  return (await saldoOpenRouter()) !== null;
}

export interface SaldoOpenRouter {
  /** Batas kredit key ini (USD), null = tanpa batas. */
  batas: number | null;
  sisa: number | null;
  terpakai: number;
}

export async function saldoOpenRouter(): Promise<SaldoOpenRouter | null> {
  const kunci = process.env.OPENROUTER_API_KEY;
  if (!kunci) return null;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${kunci}` }, signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!res.ok) return null;
    const { data } = (await res.json()) as { data: { limit: number | null; limit_remaining: number | null; usage: number } };
    return { batas: data.limit, sisa: data.limit_remaining, terpakai: data.usage };
  } catch {
    return null;
  }
}

// ---------- Pemakaian ----------

/** Catat satu balasan AI yang berhasil (token & biaya nyata dari penyedia) untuk kuota dan laporan biaya. */
export async function catatPakai(numberId: number, j: JawabanAi, foto: boolean): Promise<void> {
  const sql = await db();
  await sql`
    INSERT INTO ai_pakai(number_id, waktu, penyedia, model, token_masuk, token_keluar, biaya_usd, ms, foto)
    VALUES (${numberId}, ${sekarang()}, ${j.penyedia}, ${j.model}, ${j.tokenMasuk}, ${j.tokenKeluar}, ${j.biayaUsd}, ${j.ms}, ${foto})`;
}

export interface RingkasPakai {
  balasan: number;
  biaya_usd: number;
  token_masuk: number;
  token_keluar: number;
  ms_rata: number;
}

/** Ringkasan pemakaian semua nomor sejak `sejak` (detik epoch), dikelompokkan per penyedia+model. */
export async function ringkasPakai(sejak: number) {
  const sql = await db();
  return [
    ...(await sql<(RingkasPakai & { penyedia: string; model: string | null })[]>`
      SELECT penyedia, model, COUNT(*)::int AS balasan, COALESCE(SUM(biaya_usd), 0)::float8 AS biaya_usd,
             COALESCE(SUM(token_masuk), 0)::int AS token_masuk, COALESCE(SUM(token_keluar), 0)::int AS token_keluar,
             COALESCE(AVG(ms), 0)::int AS ms_rata
        FROM ai_pakai WHERE waktu >= ${sejak}
       GROUP BY penyedia, model ORDER BY balasan DESC`),
  ];
}

// ---------- Penjaga jawaban (harness) ----------

export interface JawabanTerjaga extends JawabanAi {
  /** Pelanggaran pada draf pertama (kosong = langsung lolos). */
  pelanggaran: Pelanggaran[];
  ditulisUlang: boolean;
  /** Tulisan ulang tetap melanggar: yang dikirim JAWABAN_AMAN. */
  aman: boolean;
}

/**
 * tanyaAi + pemeriksa (src/lib/pemeriksa.ts). `sumber` = semua teks yang boleh jadi sumber fakta (pesan sistem,
 * pesan lawan bicara, riwayat chat lengkap). Draf yang melanggar ditulis ulang sekali dengan umpan balik yang
 * spesifik; bila tetap melanggar, dikirim jawaban aman. Biaya, token, dan waktu kedua panggilan dijumlahkan.
 */
export async function tanyaAiTerjaga(r: PermintaanAi, sumber: string): Promise<JawabanTerjaga> {
  const j1 = await tanyaAi(r);
  const opsi = { adaFoto: !!r.gambar?.length };
  const p1 = periksaJawaban(j1.teks, sumber, opsi);
  if (!p1.length) return { ...j1, pelanggaran: [], ditulisUlang: false, aman: false };

  // Sesi Hermes terpisah supaya draf yang ditolak tidak masuk ingatan percakapan aslinya.
  const j2 = await tanyaAi({ ...r, sessionId: `${r.sessionId}-koreksi`, sistem: `${r.sistem}\n\n${pesanKoreksi(j1.teks, p1)}` });
  const tambah = (a: number | null, b: number | null) => (a === null && b === null ? null : (a ?? 0) + (b ?? 0));
  const gabung = {
    ...j2,
    ms: j1.ms + j2.ms,
    tokenMasuk: tambah(j1.tokenMasuk, j2.tokenMasuk),
    tokenKeluar: tambah(j1.tokenKeluar, j2.tokenKeluar),
    biayaUsd: tambah(j1.biayaUsd, j2.biayaUsd),
  };
  const p2 = periksaJawaban(j2.teks, sumber, opsi);
  if (!p2.length) return { ...gabung, pelanggaran: p1, ditulisUlang: true, aman: false };
  return { ...gabung, teks: JAWABAN_AMAN, pelanggaran: p1, ditulisUlang: true, aman: true };
}
