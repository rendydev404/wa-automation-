import "server-only";
import { aturan } from "./aturan";
import { db, getSetting, sekarang } from "./db";
import { hermesSehat, hermesTerkonfigurasi, tanyaHermes } from "./hermes";
import { JAWABAN_AMAN, type Pelanggaran, pesanKoreksi, periksaJawaban } from "./pemeriksa";
import { teksSoul } from "./soul";
import { ATURAN_GAYA } from "./gaya";
import { tarifModel } from "./tarif";
import { type JenisAbaikan, ambilAbaikan, buangTagAbaikan } from "./spam";
import { buangTagTeruskan } from "./teruskan";
import { type KirimProduk, ambilKirimProduk } from "./katalog-def";
import { type Label, type Minat, ambilNilai } from "./prospek-def";
import type { Foto } from "./types";
import { modeMesin } from "./mode";

/**
 * Satu pintu ke AI, apa pun penyedianya:
 * - "hermes" (utama, bawaan): profil Hermes `cs`; menyimpan riwayat sesi sendiri, SOUL ada di profilnya.
 * - "anthropic": Claude API langsung (Messages API). Tanpa ingatan: SOUL dan riwayat chat dikirim tiap giliran.
 * Admin memilih mode, model utama & cadangan di /admin ("Mesin AI"; settings ai_penyedia / ai_model /
 * ai_cadangan), berlaku langsung tanpa restart. API key TIDAK lewat dashboard: dipasang developer di .env server
 * (ANTHROPIC_API_KEY), jadi rahasia tidak pernah tersimpan di database maupun lewat browser.
 * Mode "per_paket": akun tanpa paket aktif (trial/gratis) dijawab Hermes; akun berbayar dijawab Claude API
 * (model utama, lalu cadangan) dan bila Claude tetap gagal, Hermes. Penyedia per akun: aiUntukAkun (langganan.ts).
 */

export type Penyedia = "hermes" | "anthropic" | "openai";
/** Pilihan admin: satu penyedia untuk semua nomor, atau dibagi menurut status paket akun. */
/** Penyedia yang bisa dipilih admin di dashboard (umum & per akun). "openai" hanya lewat env, tidak lewat dashboard. */
export type PenyediaAkun = "hermes" | "anthropic";
export type ModeAi = PenyediaAkun | "per_paket";

export const MODEL_BAWAAN = "claude-haiku-5-5";
export const CADANGAN_BAWAAN = "claude-sonnet-5-5";
const ID_MODEL = /^claude-[a-z0-9.-]+$/i;

export interface PengaturanAi {
  /** Penyedia umum; pada mode per_paket = Hermes (penyedia tiap akun ditentukan aiUntukAkun). */
  penyedia: Penyedia;
  mode: ModeAi;
  model: string;
  cadangan: string;
}

/** API key Anthropic dari .env server (dipasang developer). Mesin self-host: AI_API_KEY bila AI_PENYEDIA=anthropic. */
export function kunciAnthropic(): string | null {
  const mesin = modeMesin() && process.env.AI_PENYEDIA === "anthropic" ? process.env.AI_API_KEY : undefined;
  return process.env.ANTHROPIC_API_KEY?.trim() || mesin?.trim() || null;
}

/**
 * Penyedia kompatibel OpenAI (Chat Completions): OpenAI, Gemini (endpoint kompatibel), Groq, OpenRouter, Ollama/vLLM.
 * Dipilih lewat env AI_PENYEDIA=openai + AI_API_KEY + AI_MODEL (+ AI_API_URL, bawaan api.openai.com). Dipakai terutama
 * di mesin self-host (kunci AI milik pemilik mesin). Model lokal tanpa kunci: AI_API_KEY boleh diisi apa saja.
 */
export function konfigOpenAi(): { url: string; kunci: string; model: string } | null {
  const kunci = process.env.AI_API_KEY?.trim();
  const model = process.env.AI_MODEL?.trim();
  if (process.env.AI_PENYEDIA !== "openai" || !kunci || !model) return null;
  return { url: (process.env.AI_API_URL?.trim() || "https://api.openai.com/v1").replace(/\/+$/, ""), kunci, model };
}

export async function pengaturanAi(): Promise<PengaturanAi> {
  const [p, m, c] = await Promise.all([getSetting("ai_penyedia"), getSetting("ai_model"), getSetting("ai_cadangan")]);
  const k = kunciAnthropic();
  // Kompatibel OpenAI hanya lewat env (AI_PENYEDIA=openai): kuncinya bukan milik pengaturan dashboard.
  const oa = konfigOpenAi();
  // Bawaan Hermes. Anthropic (juga per_paket) hanya bila admin memilihnya DAN kuncinya ada; tanpa Hermes terpasang (dev) dan ada kunci: Anthropic.
  // Mesin self-host: penyedia dari env AI_PENYEDIA lebih dulu (tanpa Hermes).
  const pilih = (modeMesin() ? process.env.AI_PENYEDIA || p : p || process.env.AI_PENYEDIA) || "hermes";
  const mode: ModeAi = !hermesTerkonfigurasi() && k ? "anthropic" : k && (pilih === "anthropic" || pilih === "per_paket") ? pilih : "hermes";
  // Kompatibel OpenAI dari env menggantikan penyedia (mode dashboard tetap seperti tersimpan).
  const penyedia: Penyedia = oa && (modeMesin() || !p) ? "openai" : mode === "anthropic" ? "anthropic" : "hermes";
  if (penyedia === "openai") return { penyedia, mode, model: oa!.model, cadangan: "" };
  return { penyedia, mode, model: m && ID_MODEL.test(m) ? m : MODEL_BAWAAN, cadangan: c === "" ? "" : c && ID_MODEL.test(c) ? c : CADANGAN_BAWAAN };
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
  /** Paksa penyedia/model tertentu (uji perbandingan model, atau penyedia akun dari aiUntukAkun); bawaan = pengaturan admin. */
  paksa?: Partial<PengaturanAi>;
  /** Claude API gagal (setelah model cadangan): jawab dengan Hermes alih-alih tidak membalas. Dipakai mode per_paket. */
  cadanganHermes?: boolean;
  /** Batas token keluaran untuk tugas panjang (mis. merapikan dokumen); bawaan = aturan maks_token_balasan. */
  maksToken?: number;
  /** Tugas di luar membalas pelanggan: aturan umum bot (SOUL) tidak disertakan. Anthropic & kompatibel OpenAI saja. */
  tanpaSoul?: boolean;
}

/** Penyedia tanpa ingatan sesi: pemanggil wajib menyertakan riwayat chat lengkap di pesan sistem. */
export const tanpaIngatan = (p: Penyedia): boolean => p !== "hermes";

export async function tanyaAi(r: PermintaanAi): Promise<JawabanAi> {
  const atur = { ...(await pengaturanAi()), ...r.paksa };
  if (atur.penyedia === "hermes") return jawabHermes(r);
  if (atur.penyedia === "openai") return tanyaOpenAi(r);
  try {
    return await tanyaAnthropic(r, atur.model, atur.cadangan);
  } catch (e) {
    if (!r.cadanganHermes || !hermesTerkonfigurasi()) throw e;
    console.warn(`[ai] Claude API gagal (${e instanceof Error ? e.message : e}), memakai Hermes sebagai cadangan`);
    return jawabHermes(r);
  }
}

async function jawabHermes(r: PermintaanAi): Promise<JawabanAi> {
  const j = await tanyaHermes(r);
  return { teks: j.teks, ms: j.ms, penyedia: "hermes", model: null, tokenMasuk: j.tokenMasuk, tokenKeluar: null, biayaUsd: null };
}

// ---------- Anthropic (Claude API) ----------

const API = "https://api.anthropic.com/v1";
const VERSI_API = "2023-06-01";

interface PakaiAnthropic {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

/**
 * Biaya satu panggilan (USD) dari tarif resmi Anthropic yang berlaku sekarang (tarif.ts: diambil dari halaman harga
 * resmi dan ikut berubah bila Anthropic mengubahnya). Cache = TTL 5 menit. Model yang tidak tercantum di halaman harga:
 * null (biaya tidak dihitung) daripada mengira-ngira. Tagihan resmi tetap di Claude Console.
 */
export function biayaAnthropic(model: string, u: PakaiAnthropic): number | null {
  const h = tarifModel(model);
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

/** Kurs Rupiah per USD dari data pasar (otomatis, lihat kurs.ts); dipakai untuk biaya AI dan harga paket. */
export { kursUsd } from "./kurs";

class GalatAnthropic extends Error {
  status: number;
  constructor(pesan: string, status: number) {
    super(pesan);
    this.status = status;
  }
}

/** Sibuk / batas laju / galat server / jaringan: layak dicoba dengan model cadangan. */
const layakCadangan = (e: unknown) => !(e instanceof GalatAnthropic) || e.status === 429 || e.status === 529 || e.status >= 500;

/**
 * Penalaran per model. Balasan WhatsApp tidak butuh penalaran: dimatikan (diukur pada pertanyaan asli,
 * claude-haiku-5.5: waktu balas 3,1 -> 1,5 dtk, mutu setara). Tetapi cara mematikannya berbeda per generasi, dan
 * mengirim cara yang salah = HTTP 400:
 *   - Opus 5.5, Fable, Mythos: penalaran tidak bisa dimatikan -> parameter dihilangkan, effort "low" (cepat & hemat);
 *     token penalaran ikut max_tokens, jadi batasnya ditambah.
 *   - Sonnet 5.5: { type: "disabled" } ditolak; padanannya { type: "between_tools" }.
 *   - Model lain (Haiku 5.5, Opus 5, Sonnet 5, 4.x): { type: "disabled" }.
 * Parameter sampling (temperature/top_p/top_k) TIDAK dikirim: model generasi baru menolaknya (HTTP 400).
 */
export function opsiPenalaran(model: string, maksToken: number): Record<string, unknown> {
  const m = model.replace(/-\d{8}$/, "");
  if (/^claude-(?:opus-5-5|fable-|mythos-)/.test(m)) return { max_tokens: maksToken + 3000, output_config: { effort: "low" } };
  if (m === "claude-sonnet-5-5") return { max_tokens: maksToken, thinking: { type: "between_tools" } };
  return { max_tokens: maksToken, thinking: { type: "disabled" } };
}

async function panggilAnthropic(kunci: string, model: string, r: PermintaanAi) {
  // Aturan gaya ngobrol (teks tetap, ±690 token) ikut blok SOUL yang di-cache, bukan bagian per giliran yang tidak di-cache.
  const gaya = !r.tanpaSoul && r.sistem.includes(ATURAN_GAYA);
  const res = await fetch(`${API}/messages`, {
    method: "POST",
    headers: { "x-api-key": kunci, "anthropic-version": VERSI_API, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      // Balasan WhatsApp pendek; max_tokens = pagar biaya bila model "kebablasan" (aturan admin, bawaan 700).
      ...opsiPenalaran(model, r.maksToken ?? (await aturan("maks_token_balasan"))),
      // SOUL selalu sama persis di setiap panggilan: di-cache Anthropic (input yang di-cache 10x lebih murah).
      system: [
        ...(r.tanpaSoul ? [] : [{ type: "text", text: gaya ? `${teksSoul()}\n\n${ATURAN_GAYA}` : teksSoul(), cache_control: { type: "ephemeral" } }]),
        { type: "text", text: (gaya ? r.sistem.replace(ATURAN_GAYA, "") : r.sistem).toWellFormed() },
      ],
      messages: [
        {
          role: "user",
          content: r.gambar?.length
            ? [...r.gambar.map((g) => ({ type: "image", source: { type: "base64", media_type: g.mime, data: g.data } })), { type: "text", text: r.pesan.toWellFormed() }]
            : r.pesan.toWellFormed(),
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

const gm = globalThis as unknown as { __waModel?: { kunci: string; at: number; daftar: { id: string; nama: string }[] } };

/**
 * Daftar model Claude yang bisa dipakai kunci ini (juga uji koneksi). null = kunci salah / tak terjangkau. Hasil sah
 * dipegang 10 menit, jadi beberapa bagian panel admin yang memintanya bersamaan tidak memanggil Anthropic berkali-kali.
 */
export async function modelAnthropic(kunci?: string | null, opsi: { segar?: boolean } = {}): Promise<{ id: string; nama: string }[] | null> {
  const k = kunci ?? kunciAnthropic();
  if (!k) return null;
  const c = gm.__waModel;
  if (!opsi.segar && c && c.kunci === k && Date.now() - c.at < 600_000) return c.daftar;
  try {
    const res = await fetch(`${API}/models?limit=100`, {
      headers: { "x-api-key": k, "anthropic-version": VERSI_API },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const { data } = (await res.json()) as { data: { id: string; display_name?: string }[] };
    const daftar = data.map((m) => ({ id: m.id, nama: m.display_name || m.id }));
    gm.__waModel = { kunci: k, at: Date.now(), daftar };
    return daftar;
  } catch {
    return null;
  }
}

// ---------- Kompatibel OpenAI (Chat Completions) ----------

async function tanyaOpenAi(r: PermintaanAi): Promise<JawabanAi> {
  const c = konfigOpenAi();
  if (!c) throw new Error("Penyedia kompatibel OpenAI belum dikonfigurasi (AI_PENYEDIA=openai, AI_API_KEY, AI_MODEL).");
  const mulai = performance.now();
  const isiUser = r.gambar?.length
    ? [...r.gambar.map((g) => ({ type: "image_url", image_url: { url: `data:${g.mime};base64,${g.data}` } })), { type: "text", text: r.pesan.toWellFormed() }]
    : r.pesan.toWellFormed();
  const res = await fetch(`${c.url}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${c.kunci}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: c.model,
      max_tokens: r.maksToken ?? (await aturan("maks_token_balasan")),
      messages: [
        { role: "system", content: r.tanpaSoul ? r.sistem.toWellFormed() : `${teksSoul()}\n\n${r.sistem.toWellFormed()}` },
        { role: "user", content: isiUser },
      ],
    }),
    signal: AbortSignal.timeout(r.timeoutMs ?? (r.gambar?.length ? 90_000 : 60_000)),
    cache: "no-store",
  });
  const d = (await res.json().catch(() => null)) as {
    model?: string;
    error?: { message?: string } | string;
    choices?: { message?: { content?: string | { type?: string; text?: string }[] | null } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  } | null;
  if (!res.ok || !d || d.error) {
    const pesan = typeof d?.error === "string" ? d.error : d?.error?.message;
    throw new Error(`AI (kompatibel OpenAI) HTTP ${res.status}${pesan ? `: ${pesan.slice(0, 200)}` : ""}`);
  }
  const isi = d.choices?.[0]?.message?.content;
  const teks = (Array.isArray(isi) ? isi.map((b) => b.text ?? "").join("") : (isi ?? "")).trim();
  if (!teks) throw new Error("AI (kompatibel OpenAI) membalas kosong");
  return {
    teks,
    ms: Math.round(performance.now() - mulai),
    penyedia: "openai",
    model: d.model ?? c.model,
    tokenMasuk: d.usage?.prompt_tokens ?? null,
    tokenKeluar: d.usage?.completion_tokens ?? null,
    biayaUsd: null,
  };
}

// ---------- Kesehatan ----------

const g = globalThis as unknown as { __waAiSehat?: { kunci: string; at: number; ok: boolean } };

/** Penyedia aktif bisa dijangkau? (dipanggil berkala lewat cache di /api/wa/status) */
export async function aiSehat(): Promise<boolean> {
  const { penyedia } = await pengaturanAi();
  if (penyedia === "hermes") return hermesSehat();
  if (penyedia === "openai") return sehatOpenAi();
  const k = kunciAnthropic() ?? "";
  const c = g.__waAiSehat;
  if (c && c.kunci === k && Date.now() - c.at < 5 * 60_000) return c.ok; // daftar model cukup dicek tiap 5 menit
  const ok = (await modelAnthropic(k, { segar: true })) !== null; // pemeriksaan kesehatan: selalu tanya ulang
  g.__waAiSehat = { kunci: k, at: Date.now(), ok };
  return ok;
}

async function sehatOpenAi(): Promise<boolean> {
  const c = konfigOpenAi();
  if (!c) return false;
  const kunci = `openai:${c.url}:${c.kunci.slice(-6)}`;
  const x = g.__waAiSehat;
  if (x && x.kunci === kunci && Date.now() - x.at < 5 * 60_000) return x.ok;
  let ok = false;
  try {
    const r = await fetch(`${c.url}/models`, { headers: { authorization: `Bearer ${c.kunci}` }, signal: AbortSignal.timeout(8000), cache: "no-store" });
    ok = r.ok;
  } catch {}
  g.__waAiSehat = { kunci, at: Date.now(), ok };
  return ok;
}

// ---------- Pemakaian ----------

/** Catat satu balasan AI yang berhasil (token & biaya per balasan) untuk kuota dan laporan biaya. */
/** `abaikan` = AI menilai pesan itu spam dan tidak membalas: biaya tetap tercatat, kuota balasan pelanggan tidak terpotong. */
export async function catatPakai(numberId: number, j: JawabanAi, foto: boolean, abaikan = false): Promise<void> {
  const sql = await db();
  await sql`
    INSERT INTO ai_pakai(number_id, waktu, penyedia, model, token_masuk, token_keluar, biaya_usd, ms, foto, abaikan)
    VALUES (${numberId}, ${sekarang()}, ${j.penyedia}, ${j.model}, ${j.tokenMasuk}, ${j.tokenKeluar}, ${j.biayaUsd}, ${j.ms}, ${foto}, ${abaikan})`;
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
  /** Produk katalog yang dikirim setelah jawaban (hanya bila opsi.katalog); teks sudah bersih dari tag. */
  kirimProduk: KirimProduk | null;
  /** AI menilai pesan ini spam (hanya bila opsi.saringSpam): tidak ada yang dikirim, `teks` kosong. */
  abaikan: { jenis: JenisAbaikan; alasan: string } | null;
  /** Penilaian AI atas pesan terakhir (hanya bila opsi.nilai, lihat prospek-def.ts). `teks` kosong = tidak perlu dibalas. */
  nilai: Label | null;
  /** Tingkat minat beli seluruh percakapan (hanya bila nilai = prospek, lihat prospek-def.ts MINAT). */
  minat: Minat | null;
  /** Pelanggan menyatakan transaksinya sudah terjadi (tag <minat>beli</minat>, hanya bila nilai = prospek). */
  beli: boolean;
}

const POLA_TAG_RUSAK = /<\s*\|?\s*(\/?)\s*\|?\s*(nilai|minat|abaikan|teruskan|kirim_produk)\b([^<>|]*?)\s*\|?\s*>/gi;

/**
 * Model kadang menulis tag sistem dengan pembatas token khusus (`<|nilai>`, `<nilai|>`, `<|/nilai|>`, `< nilai >`).
 * Pengurai tag tidak mengenalinya sehingga tag itu terkirim ke pelanggan; bakukan dulu ke bentuk `<nilai>`.
 */
export const bakukanTag = (t: string): string =>
  t.replace(POLA_TAG_RUSAK, (_, tutup: string, nama: string, attr: string) => `<${tutup}${nama.toLowerCase()}${attr}>`);

/**
 * tanyaAi + pemeriksa (src/lib/pemeriksa.ts). `sumber` = semua teks yang boleh jadi sumber fakta (pesan sistem,
 * pesan lawan bicara, riwayat chat lengkap). Draf yang melanggar ditulis ulang sekali dengan umpan balik yang
 * spesifik; bila tetap melanggar, dikirim jawaban aman. Biaya, token, dan waktu kedua panggilan dijumlahkan.
 */
export async function tanyaAiTerjaga(
  r: PermintaanAi,
  sumber: string,
  opsiJaga: { saringSpam?: boolean; katalog?: boolean; gaya?: boolean; nilai?: boolean } = {}
): Promise<JawabanTerjaga> {
  const j1 = await tanyaAi(r);
  // Tag penilaian pesan selalu dibuang dari teks pelanggan; labelnya dipakai hanya bila diminta.
  const n1 = ambilNilai(bakukanTag(j1.teks));
  j1.teks = n1.teks;
  const nilai = opsiJaga.nilai ? n1.nilai : null;
  const minat = opsiJaga.nilai ? n1.minat : null;
  const beli = !!opsiJaga.nilai && !!n1.beli;
  // Jawaban berupa tag <abaikan> saja: pesan dinilai spam. Tidak diperiksa/ditulis ulang karena tidak ada yang dikirim.
  const abaikan = opsiJaga.saringSpam ? ambilAbaikan(j1.teks) : null;
  if (abaikan) return { ...j1, teks: "", pelanggaran: [], ditulisUlang: false, aman: false, kirimProduk: null, abaikan, nilai, minat, beli };
  // Sisa tag <teruskan> (fitur lama yang sudah dicabut) dibuang sebelum diperiksa supaya isinya tidak dinilai.
  j1.teks = buangTagTeruskan(buangTagAbaikan(j1.teks));
  // Hanya tag penilaian tanpa jawaban (mis. "ok makasih" saat urusan sudah tuntas): tidak ada yang dikirim.
  if (nilai && !j1.teks) return { ...j1, teks: "", pelanggaran: [], ditulisUlang: false, aman: false, kirimProduk: null, abaikan: null, nilai, minat, beli };
  // `gaya`: pemeriksaan gaya robot memakai pesan pelanggan (ditanya "ini bot?" = boleh menjawab jujur).
  const opsi = { adaFoto: !!r.gambar?.length, katalog: !!opsiJaga.katalog, ...(opsiJaga.gaya ? { pesanPelanggan: r.pesan } : {}) };
  // Tag kirim katalog dibuang dari teks pelanggan.
  const pisah = (t: string) => {
    const k = ambilKirimProduk(t);
    return { teks: k.teks, produk: opsi.katalog ? k.produk : null };
  };
  const d1 = pisah(j1.teks);
  const p1 = periksaJawaban(j1.teks, sumber, opsi);
  if (!p1.length) return { ...j1, teks: d1.teks, pelanggaran: [], ditulisUlang: false, aman: false, kirimProduk: d1.produk, abaikan: null, nilai, minat, beli };

  // Sesi Hermes terpisah supaya draf yang ditolak tidak masuk ingatan percakapan aslinya.
  const j2 = await tanyaAi({ ...r, sessionId: `${r.sessionId}-koreksi`, sistem: `${r.sistem}\n\n${pesanKoreksi(j1.teks, p1, opsi.katalog)}` });
  const tambah = (a: number | null, b: number | null) => (a === null && b === null ? null : (a ?? 0) + (b ?? 0));
  const gabung = {
    ...j2,
    ms: j1.ms + j2.ms,
    tokenMasuk: tambah(j1.tokenMasuk, j2.tokenMasuk),
    tokenKeluar: tambah(j1.tokenKeluar, j2.tokenKeluar),
    biayaUsd: tambah(j1.biayaUsd, j2.biayaUsd),
  };
  j2.teks = buangTagTeruskan(buangTagAbaikan(ambilNilai(bakukanTag(j2.teks)).teks));
  const d2 = pisah(j2.teks);
  // Sisa pelanggaran hanya soal gaya (masih terdengar robot): tulisan ulang tetap lebih baik daripada jawaban aman.
  const p2 = periksaJawaban(j2.teks, sumber, opsi).filter((x) => x.jenis !== "robotik");
  if (!p2.length) return { ...gabung, teks: d2.teks, pelanggaran: p1, ditulisUlang: true, aman: false, kirimProduk: d2.produk, abaikan: null, nilai, minat, beli };
  return { ...gabung, teks: JAWABAN_AMAN, pelanggaran: p1, ditulisUlang: true, aman: true, kirimProduk: null, abaikan: null, nilai, minat, beli };
}
