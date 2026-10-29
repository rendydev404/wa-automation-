import "server-only";
import { db, getSetting, sekarang } from "./db";
import { hermesSehat, hermesTerkonfigurasi, tanyaHermes } from "./hermes";
import { JAWABAN_AMAN, type Pelanggaran, pesanKoreksi, periksaJawaban } from "./pemeriksa";
import { teksSoul } from "./soul";
import type { Foto } from "./types";

/**
 * Satu pintu ke AI, apa pun penyedianya:
 * - "hermes" (utama, bawaan): profil Hermes `cs`; menyimpan riwayat sesi sendiri, SOUL ada di profilnya.
 * - "anthropic": Claude API langsung (Messages API). Tanpa ingatan: SOUL dan riwayat chat dikirim tiap giliran.
 * Admin memilih penyedia, model utama & cadangan di /admin ("Mesin AI"; settings ai_penyedia / ai_model /
 * ai_cadangan), berlaku langsung tanpa restart. API key TIDAK lewat dashboard: dipasang developer di .env server
 * (ANTHROPIC_API_KEY), jadi rahasia tidak pernah tersimpan di database maupun lewat browser.
 */

export type Penyedia = "hermes" | "anthropic";

export const MODEL_BAWAAN = "claude-haiku-5-5";
export const CADANGAN_BAWAAN = "claude-sonnet-5-5";
const ID_MODEL = /^claude-[a-z0-9.-]+$/i;

export interface PengaturanAi {
  penyedia: Penyedia;
  model: string;
  cadangan: string;
}

/** API key Anthropic dari .env server (dipasang developer). */
export function kunciAnthropic(): string | null {
  return process.env.ANTHROPIC_API_KEY?.trim() || null;
}

export async function pengaturanAi(): Promise<PengaturanAi> {
  const [p, m, c] = await Promise.all([getSetting("ai_penyedia"), getSetting("ai_model"), getSetting("ai_cadangan")]);
  const k = kunciAnthropic();
  // Bawaan Hermes. Anthropic hanya bila admin memilihnya DAN kuncinya ada; tanpa Hermes terpasang (dev) dan ada kunci: Anthropic.
  const pilih = p || process.env.AI_PENYEDIA || "hermes";
  const penyedia: Penyedia = pilih === "anthropic" && k ? "anthropic" : !hermesTerkonfigurasi() && k ? "anthropic" : "hermes";
  return { penyedia, model: m && ID_MODEL.test(m) ? m : MODEL_BAWAAN, cadangan: c === "" ? "" : c && ID_MODEL.test(c) ? c : CADANGAN_BAWAAN };
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
  /** Kunci sesi Hermes (diabaikan Anthropic). */
  sessionId: string;
  /** Konteks per giliran dari susunSistem (knowledge, instruksi nomor, riwayat, batas topik, aturan inti). */
  sistem: string;
  pesan: string;
  gambar?: Foto[];
  timeoutMs?: number;
  /** Paksa penyedia/model tertentu (uji perbandingan model); bawaan = pengaturan admin. */
  paksa?: Partial<PengaturanAi>;
}

/** Penyedia tanpa ingatan sesi: pemanggil wajib menyertakan riwayat chat lengkap di pesan sistem. */
export const tanpaIngatan = (p: Penyedia): boolean => p === "anthropic";

export async function tanyaAi(r: PermintaanAi): Promise<JawabanAi> {
  const atur = { ...(await pengaturanAi()), ...r.paksa };
  if (atur.penyedia === "hermes") {
    const j = await tanyaHermes(r);
    return { teks: j.teks, ms: j.ms, penyedia: "hermes", model: null, tokenMasuk: j.tokenMasuk, tokenKeluar: null, biayaUsd: null };
  }
  return tanyaAnthropic(r, atur.model, atur.cadangan);
}

// ---------- Anthropic (Claude API) ----------

const API = "https://api.anthropic.com/v1";
const VERSI_API = "2023-06-01";
const MAKS_TOKEN_KELUAR = 700; // balasan WhatsApp pendek; pagar biaya bila model "kebablasan"

/**
 * Tarif resmi Anthropic per 1 juta token (USD), dicek di platform.claude.com/docs/en/about-claude/pricing
 * (29 Okt 2026), untuk prompt <= 100 ribu token (prompt balasan WhatsApp ±12 ribu token). Cache = TTL 5 menit.
 * Hanya model yang tarifnya sudah dicek; model lain: biaya tidak dihitung (null) daripada mengira-ngira.
 * Tagihan resmi tetap di Claude Console.
 */
const HARGA: Record<string, { masuk: number; keluar: number; tulisCache: number; bacaCache: number }> = {
  "claude-haiku-5-5": { masuk: 0.1, keluar: 0.5, tulisCache: 0.125, bacaCache: 0.01 },
  "claude-sonnet-5-5": { masuk: 2, keluar: 10, tulisCache: 2.5, bacaCache: 0.1 }, // baca cache turun ke $0,10 sejak 7 Okt 2026
  "claude-haiku-4-5": { masuk: 1, keluar: 5, tulisCache: 1.25, bacaCache: 0.1 },
};

interface PakaiAnthropic {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export function biayaAnthropic(model: string, u: PakaiAnthropic): number | null {
  const h = HARGA[model.replace(/-\d{8}$/, "")];
  if (!h) return null;
  return (
    ((u.input_tokens ?? 0) * h.masuk +
      (u.cache_creation_input_tokens ?? 0) * h.tulisCache +
      (u.cache_read_input_tokens ?? 0) * h.bacaCache +
      (u.output_tokens ?? 0) * h.keluar) /
    1e6
  );
}

/**
 * Profil token satu balasan WhatsApp, diukur dari 16 pertanyaan asli pelanggan di produksi (29 Okt 2026,
 * claude-haiku-5.5, penalaran mati): ±7.500 token input biasa + ±4.100 token SOUL dari cache + ±110 token keluar.
 * Hanya untuk perkiraan di dashboard sebelum ada pemakaian nyata; biaya sebenarnya dihitung dari usage tiap balasan.
 */
export const PROFIL_BALASAN = { input_tokens: 7_500, cache_read_input_tokens: 4_100, output_tokens: 110 } as const;

/** Perkiraan biaya satu balasan (USD) untuk sebuah model; null bila tarifnya belum dicek. */
export const perkiraanPerBalasan = (model: string): number | null => biayaAnthropic(model, PROFIL_BALASAN);

/** Kurs Rupiah per USD untuk tampilan biaya (pengaturan admin "kurs_usd"; bawaan 16.500). */
export async function kursUsd(): Promise<number> {
  const v = Number(await getSetting("kurs_usd"));
  return Number.isFinite(v) && v >= 1000 && v <= 100_000 ? v : 16_500;
}

class GalatAnthropic extends Error {
  status: number;
  constructor(pesan: string, status: number) {
    super(pesan);
    this.status = status;
  }
}

/** Sibuk / batas laju / galat server / jaringan: layak dicoba dengan model cadangan. */
const layakCadangan = (e: unknown) => !(e instanceof GalatAnthropic) || e.status === 429 || e.status === 529 || e.status >= 500;

async function panggilAnthropic(kunci: string, model: string, r: PermintaanAi) {
  const res = await fetch(`${API}/messages`, {
    method: "POST",
    headers: { "x-api-key": kunci, "anthropic-version": VERSI_API, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: MAKS_TOKEN_KELUAR,
      // Penalaran dimatikan: diukur pada pertanyaan asli (claude-haiku-5.5), waktu balas 3,1 -> 1,5 dtk, mutu setara.
      thinking: { type: "disabled" },
      temperature: 0.4,
      // SOUL selalu sama persis di setiap panggilan: di-cache Anthropic (input yang di-cache 10x lebih murah).
      system: [
        { type: "text", text: teksSoul(), cache_control: { type: "ephemeral" } },
        { type: "text", text: r.sistem },
      ],
      messages: [
        {
          role: "user",
          content: r.gambar?.length
            ? [...r.gambar.map((g) => ({ type: "image", source: { type: "base64", media_type: g.mime, data: g.data } })), { type: "text", text: r.pesan }]
            : r.pesan,
        },
      ],
    }),
    signal: AbortSignal.timeout(r.timeoutMs ?? (r.gambar?.length ? 90_000 : 60_000)),
    cache: "no-store",
  });
  const d = (await res.json().catch(() => null)) as {
    model?: string;
    error?: { type?: string; message?: string };
    content?: { type: string; text?: string }[];
    usage?: PakaiAnthropic;
  } | null;
  if (!res.ok || !d || d.error) throw new GalatAnthropic(`Anthropic HTTP ${res.status}${d?.error?.message ? `: ${d.error.message.slice(0, 200)}` : ""}`, res.status);
  const teks = (d.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("")
    .trim();
  if (!teks) throw new GalatAnthropic("Anthropic membalas kosong", 502);
  const usage = d.usage ?? {};
  return {
    teks,
    model: d.model ?? model,
    tokenMasuk: (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0),
    tokenKeluar: usage.output_tokens ?? null,
    biayaUsd: biayaAnthropic(model, usage),
  };
}

async function tanyaAnthropic(r: PermintaanAi, model: string, cadangan: string): Promise<JawabanAi> {
  const kunci = kunciAnthropic();
  if (!kunci) throw new Error("ANTHROPIC_API_KEY belum dipasang di server.");
  const mulai = performance.now();
  let j;
  try {
    j = await panggilAnthropic(kunci, model, r);
  } catch (e) {
    // Model utama sibuk/gagal: model cadangan dicoba sekali. Kunci salah (401) atau permintaan salah (400) tidak.
    if (!cadangan || cadangan === model || !layakCadangan(e)) throw e;
    console.warn(`[ai] ${model} gagal (${e instanceof Error ? e.message : e}), memakai cadangan ${cadangan}`);
    j = await panggilAnthropic(kunci, cadangan, r);
  }
  return { ...j, ms: Math.round(performance.now() - mulai), penyedia: "anthropic" };
}

/** Daftar model Claude yang bisa dipakai kunci ini (juga uji koneksi). null = kunci salah / tak terjangkau. */
export async function modelAnthropic(kunci?: string | null): Promise<{ id: string; nama: string }[] | null> {
  const k = kunci ?? kunciAnthropic();
  if (!k) return null;
  try {
    const res = await fetch(`${API}/models?limit=100`, {
      headers: { "x-api-key": k, "anthropic-version": VERSI_API },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const { data } = (await res.json()) as { data: { id: string; display_name?: string }[] };
    return data.map((m) => ({ id: m.id, nama: m.display_name || m.id }));
  } catch {
    return null;
  }
}

// ---------- Kesehatan ----------

const g = globalThis as unknown as { __waAiSehat?: { kunci: string; at: number; ok: boolean } };

/** Penyedia aktif bisa dijangkau? (dipanggil berkala lewat cache di /api/wa/status) */
export async function aiSehat(): Promise<boolean> {
  const { penyedia } = await pengaturanAi();
  if (penyedia === "hermes") return hermesSehat();
  const k = kunciAnthropic() ?? "";
  const c = g.__waAiSehat;
  if (c && c.kunci === k && Date.now() - c.at < 5 * 60_000) return c.ok; // daftar model cukup dicek tiap 5 menit
  const ok = (await modelAnthropic(k)) !== null;
  g.__waAiSehat = { kunci: k, at: Date.now(), ok };
  return ok;
}

// ---------- Pemakaian ----------

/** Catat satu balasan AI yang berhasil (token & biaya per balasan) untuk kuota dan laporan biaya. */
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
