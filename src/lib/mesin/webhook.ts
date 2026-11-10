import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { db, sekarang } from "../db";
import { modeMesin } from "../mode";
import { nomorBySesi } from "../numbers";
import { type Peristiwa, dengar } from "../peristiwa";
import { lisensiSekarang } from "./lisensi";

/**
 * Webhook dari mesin ke aplikasi developer: satu tujuan per mesin, antrean keluar (outbox) di database supaya event
 * tidak hilang saat restart, ditandatangani HMAC-SHA256, dicoba ulang dengan jeda bertambah.
 *
 * Header: X-CG-Tanda: t=<epoch>,v1=<hex HMAC-SHA256(rahasia, t + "." + body)>; toleransi waktu penerima 5 menit.
 * Body:   { id_event, jenis, waktu, nomor_id, data }. Pengiriman minimal sekali: penerima membuang duplikat lewat id_event.
 */

export const EVENT_WEBHOOK = [
  "pesan.masuk",
  "pesan.dibalas_ai",
  "pesan.manusia",
  "pesan.status",
  "nomor.terhubung",
  "nomor.terputus",
  "lisensi.peringatan",
] as const;
export type EventWebhook = (typeof EVENT_WEBHOOK)[number];
export const eventSah = (v: unknown): v is EventWebhook => typeof v === "string" && (EVENT_WEBHOOK as readonly string[]).includes(v);

/** Jeda coba ulang (detik) setelah percobaan ke-1..6 gagal; setelah 6 kali gagal = status 'gagal' (bisa dikirim ulang). */
export const JEDA_COBA_WEBHOOK = [10, 60, 300, 1800, 7200, 21_600] as const;
const MAKS_COBA = JEDA_COBA_WEBHOOK.length;
const BATAS_WAKTU_MS = 5_000;
const PARALEL = 4;
const BATAS_AMBIL = 50;

// ---------- Rahasia (AES-256-GCM dengan RAHASIA_MESIN) ----------

function kunciEnkripsi(): Buffer {
  const r = (process.env.RAHASIA_MESIN ?? "").trim();
  if (r.length < 16) throw new Error("RAHASIA_MESIN belum diisi (minimal 16 karakter acak) di .env mesin.");
  return createHash("sha256").update(`cg-mesin:${r}`).digest();
}

export function enkripsi(teks: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", kunciEnkripsi(), iv);
  const isi = Buffer.concat([c.update(teks, "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${isi.toString("base64url")}`;
}

export function dekripsi(simpan: string): string {
  const [v, iv, tag, isi] = simpan.split(".");
  if (v !== "v1" || !iv || !tag || !isi) throw new Error("format rahasia tidak dikenal");
  const d = createDecipheriv("aes-256-gcm", kunciEnkripsi(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(isi, "base64url")), d.final()]).toString("utf8");
}

export const tandaWebhook = (rahasia: string, t: number, body: string): string => createHmac("sha256", rahasia).update(`${t}.${body}`).digest("hex");

// ---------- Tujuan ----------

export interface TujuanWebhook {
  id: number;
  url: string;
  event: EventWebhook[];
  aktif: boolean;
  gagal_sejak: number | null;
  dibuat: number;
}

interface Keadaan {
  tujuan: (TujuanWebhook & { rahasia: string }) | null | undefined;
  buffer: { jenis: EventWebhook; nomorId: number | null; data: Record<string, unknown> }[];
  timerTulis: ReturnType<typeof setTimeout> | null;
  timerKirim: ReturnType<typeof setInterval> | null;
  jalan: boolean;
  lagi: boolean;
  lepas: (() => void) | null;
}
const g = globalThis as unknown as { __waMesinWebhook?: Keadaan };
const st = (g.__waMesinWebhook ??= { tujuan: undefined, buffer: [], timerTulis: null, timerKirim: null, jalan: false, lagi: false, lepas: null });

async function muatTujuan(): Promise<(TujuanWebhook & { rahasia: string }) | null> {
  if (st.tujuan !== undefined) return st.tujuan;
  const sql = await db();
  const [r] = await sql<(TujuanWebhook & { rahasia: string })[]>`
    SELECT id, url, event, aktif, gagal_sejak, dibuat, rahasia FROM webhook_tujuan ORDER BY id DESC LIMIT 1`;
  st.tujuan = r ? { ...r, event: r.event.filter(eventSah) } : null;
  return st.tujuan;
}

export async function tujuanWebhook(): Promise<TujuanWebhook | null> {
  const t = await muatTujuan();
  if (!t) return null;
  const { rahasia: _r, ...umum } = t;
  void _r;
  return umum;
}

export class WebhookError extends Error {}

/** URL tujuan: http(s) tanpa kredensial. Self-host boleh http://localhost (jaringan milik pemilik mesin sendiri). */
export function rapikanUrlWebhook(v: unknown): string {
  let u: URL;
  try {
    u = new URL(String(v ?? "").trim());
  } catch {
    throw new WebhookError("url webhook tidak valid (contoh: https://aplikasi-anda.com/webhook/chatgercep)");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new WebhookError("url webhook harus http:// atau https://");
  if (u.username || u.password) throw new WebhookError("url webhook tidak boleh berisi kredensial");
  if (u.toString().length > 500) throw new WebhookError("url webhook terlalu panjang (maks 500 karakter)");
  return u.toString();
}

/**
 * Pasang/ganti tujuan webhook. Mengembalikan rahasia penanda tangan (hanya sekali; tersimpan terenkripsi).
 * Antrean ke tujuan lama ikut dibuang.
 */
export async function aturWebhook(i: { url: unknown; event?: unknown }): Promise<{ tujuan: TujuanWebhook; rahasia: string }> {
  const url = rapikanUrlWebhook(i.url);
  const event = Array.isArray(i.event) ? [...new Set(i.event.filter(eventSah))] : [...EVENT_WEBHOOK];
  if (Array.isArray(i.event) && event.length !== i.event.length) throw new WebhookError(`event tidak dikenal; pilihan: ${EVENT_WEBHOOK.join(", ")}`);
  if (!event.length) throw new WebhookError("pilih minimal satu event");
  const rahasia = `whsec_${randomBytes(24).toString("base64url")}`;
  const simpan = enkripsi(rahasia);
  const sql = await db();
  const [r] = await sql.begin(async (tx) => {
    await tx`DELETE FROM webhook_tujuan`;
    return tx<TujuanWebhook[]>`
      INSERT INTO webhook_tujuan (url, rahasia, event, dibuat) VALUES (${url}, ${simpan}, ${event}, ${sekarang()})
      RETURNING id, url, event, aktif, gagal_sejak, dibuat`;
  });
  st.tujuan = undefined;
  return { tujuan: r, rahasia };
}

/** Hapus tujuan (berhenti mengirim). */
export async function hapusWebhook(): Promise<void> {
  const sql = await db();
  await sql`DELETE FROM webhook_tujuan`;
  st.tujuan = undefined;
}

// ---------- Antrean ----------

const idEvent = (): string => `evt_${randomUUID().replace(/-/g, "")}`;

/** Fitur pesan.terima harus dibuka lisensi; event lisensi.peringatan selalu boleh (memberi tahu developer). */
function boleh(jenis: EventWebhook): boolean {
  if (jenis === "lisensi.peringatan") return true;
  return !!lisensiSekarang()?.fitur.includes("pesan.terima");
}

/**
 * Masukkan event ke antrean. Ditulis berkelompok (tiap ±1 dtk atau per 100 event) dengan satu INSERT, tidak satu
 * pernyataan per event. Tanpa tujuan / event tidak dilanggan = tidak ada apa-apa (tanpa query).
 */
export async function antrekanEvent(jenis: EventWebhook, nomorId: number | null, data: Record<string, unknown>): Promise<void> {
  if (!modeMesin() || !boleh(jenis)) return;
  const t = await muatTujuan();
  if (!t || !t.aktif || !t.event.includes(jenis)) return;
  st.buffer.push({ jenis, nomorId, data });
  if (st.buffer.length >= 100) await tulisBuffer();
  else if (!st.timerTulis) {
    st.timerTulis = setTimeout(() => void tulisBuffer().catch((e) => console.warn("[webhook] gagal menulis antrean:", e instanceof Error ? e.message : e)), 1_000);
    st.timerTulis.unref?.();
  }
}

/** Tulis buffer event ke webhook_antrean (satu INSERT), lalu picu pengiriman. */
export async function tulisBuffer(): Promise<number> {
  if (st.timerTulis) clearTimeout(st.timerTulis);
  st.timerTulis = null;
  const daftar = st.buffer.splice(0);
  if (!daftar.length) return 0;
  const t = await muatTujuan();
  if (!t) return 0;
  const kini = sekarang();
  const baris = daftar.map((e) => {
    const id_event = idEvent();
    return { tujuan_id: t.id, id_event, jenis: e.jenis, isi: { id_event, jenis: e.jenis, waktu: kini, nomor_id: e.nomorId === null ? null : String(e.nomorId), data: e.data }, berikut_pada: kini, dibuat: kini };
  });
  const sql = await db();
  await sql`INSERT INTO webhook_antrean ${sql(
    baris.map((b) => ({ ...b, isi: sql.json(b.isi as never) })),
    "tujuan_id",
    "id_event",
    "jenis",
    "isi",
    "berikut_pada",
    "dibuat",
  )}`;
  setImmediate(() => void putaranKirim().catch(() => {}));
  return baris.length;
}

/** Kirim satu body ke tujuan (dengan tanda tangan). Tidak mengikuti redirect, batas waktu 5 dtk. */
async function kirimKe(url: string, rahasia: string, body: string): Promise<{ ok: boolean; status: number; galat?: string; ms: number }> {
  const t = sekarang();
  const mulai = performance.now();
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "ChatGerCep-Webhook/1", "x-cg-tanda": `t=${t},v1=${tandaWebhook(rahasia, t, body)}` },
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(BATAS_WAKTU_MS),
    });
    await r.arrayBuffer().catch(() => {});
    return { ok: r.status >= 200 && r.status < 300, status: r.status, galat: r.ok ? undefined : `HTTP ${r.status}`, ms: Math.round(performance.now() - mulai) };
  } catch (e) {
    const galat = e instanceof Error ? (e.name === "TimeoutError" ? "batas waktu 5 dtk" : e.message) : String(e);
    return { ok: false, status: 0, galat, ms: Math.round(performance.now() - mulai) };
  }
}

/** Satu putaran pengiriman: ambil yang jatuh tempo lewat indeks parsial (status='antre'), paralel terbatas. */
export async function putaranKirim(): Promise<number> {
  if (st.jalan) {
    st.lagi = true;
    return 0;
  }
  st.jalan = true;
  let terkirim = 0;
  try {
    do {
      st.lagi = false;
      const t = await muatTujuan();
      if (!t || !t.aktif) break;
      const rahasia = dekripsi(t.rahasia);
      const sql = await db();
      const kini = sekarang();
      const antre = await sql<{ id: number; coba: number; isi: unknown }[]>`
        SELECT id, coba, isi FROM webhook_antrean
         WHERE status = 'antre' AND berikut_pada <= ${kini} AND tujuan_id = ${t.id}
         ORDER BY berikut_pada, id LIMIT ${BATAS_AMBIL}`;
      for (let i = 0; i < antre.length; i += PARALEL) {
        const hasil = await Promise.all(
          antre.slice(i, i + PARALEL).map(async (r) => {
            const h = await kirimKe(t.url, rahasia, JSON.stringify(r.isi));
            const k = sekarang();
            if (h.ok) {
              await sql`UPDATE webhook_antrean SET status = 'terkirim', coba = coba + 1, galat = NULL WHERE id = ${r.id}`;
              return true;
            }
            const coba = r.coba + 1;
            if (coba >= MAKS_COBA) await sql`UPDATE webhook_antrean SET status = 'gagal', coba = ${coba}, galat = ${h.galat ?? null} WHERE id = ${r.id}`;
            else await sql`UPDATE webhook_antrean SET coba = ${coba}, berikut_pada = ${k + JEDA_COBA_WEBHOOK[coba - 1]}, galat = ${h.galat ?? null} WHERE id = ${r.id}`;
            return false;
          }),
        );
        const ok = hasil.filter(Boolean).length;
        terkirim += ok;
        // Catat sejak kapan tujuan gagal beruntun (untuk /webhook & dashboard); pulih = dikosongkan.
        if (ok && t.gagal_sejak) {
          await sql`UPDATE webhook_tujuan SET gagal_sejak = NULL WHERE id = ${t.id}`;
          t.gagal_sejak = null;
        } else if (!ok && hasil.length && !t.gagal_sejak) {
          await sql`UPDATE webhook_tujuan SET gagal_sejak = ${kini} WHERE id = ${t.id}`;
          t.gagal_sejak = kini;
        }
      }
      if (antre.length === BATAS_AMBIL) st.lagi = true;
    } while (st.lagi);
  } finally {
    st.jalan = false;
  }
  return terkirim;
}

/** Kirim event uji langsung (tanpa antrean) dan kembalikan hasilnya, untuk POST /api/v1/webhook/uji. */
export async function kirimUji(): Promise<{ ok: boolean; status: number; galat?: string; ms: number; id_event: string }> {
  const t = await muatTujuan();
  if (!t) throw new WebhookError("webhook belum diatur (PUT /api/v1/webhook)");
  const id_event = idEvent();
  const body = JSON.stringify({ id_event, jenis: "webhook.uji", waktu: sekarang(), nomor_id: null, data: { pesan: "Event uji dari mesin ChatGerCep." } });
  return { ...(await kirimKe(t.url, dekripsi(t.rahasia), body)), id_event };
}

/** Kirim ulang event yang gagal (semua atau satu id_event). */
export async function kirimUlangGagal(idEventSatu?: string): Promise<number> {
  const sql = await db();
  const r = idEventSatu
    ? await sql`UPDATE webhook_antrean SET status = 'antre', coba = 0, berikut_pada = ${sekarang()} WHERE status = 'gagal' AND id_event = ${idEventSatu} RETURNING id`
    : await sql`UPDATE webhook_antrean SET status = 'antre', coba = 0, berikut_pada = ${sekarang()} WHERE status = 'gagal' RETURNING id`;
  setImmediate(() => void putaranKirim().catch(() => {}));
  return r.length;
}

// ---------- Peristiwa inti -> event webhook ----------

const STATUS_ACK: Record<number, string> = { 0: "gagal", 1: "antre", 2: "terkirim", 3: "diterima", 4: "dibaca", 5: "dibaca" };

async function nomorIdSesi(sesi: string): Promise<number | null> {
  return (await nomorBySesi(sesi))?.id ?? null;
}

async function petakan(p: Peristiwa): Promise<void> {
  switch (p.jenis) {
    case "pesan.masuk":
      return antrekanEvent("pesan.masuk", p.numberId, { kunci: p.kunci, dari: p.telepon, nama: p.nama, teks: p.teks });
    case "pesan.dibalas_ai":
      return antrekanEvent("pesan.dibalas_ai", p.numberId, { kunci: p.kunci, teks: p.teks });
    case "pesan.manusia":
      return antrekanEvent("pesan.manusia", p.numberId, { kunci: p.kunci, teks: p.teks });
    case "pesan.status":
      // Status pesan API (antrean.ts) dikirim dari sana beserta id_pesan; di sini hanya status mentah lain bila dilanggan.
      return;
    case "nomor.terhubung":
      return antrekanEvent("nomor.terhubung", await nomorIdSesi(p.sesi), { wa_id: p.waId, nama: p.nama });
    case "nomor.terputus":
      return antrekanEvent("nomor.terputus", await nomorIdSesi(p.sesi), { kode: p.kode, keluar: p.keluar });
    case "lisensi.peringatan":
      return antrekanEvent("lisensi.peringatan", null, { sisa_detik: p.sisaDetik, berlaku_sampai: p.berlakuSampai, status: p.status });
  }
}

export const labelAck = (status: number): string => STATUS_ACK[status] ?? "terkirim";

/** Pekerja webhook mesin: pendengar peristiwa + pengirim berkala (tiap 5 dtk; juga dipicu setiap ada event baru). */
export function mulaiWebhookMesin(): void {
  if (!modeMesin() || st.timerKirim) return;
  st.lepas = dengar((p) => petakan(p));
  st.timerKirim = setInterval(() => void putaranKirim().catch((e) => console.warn("[webhook] putaran gagal:", e instanceof Error ? e.message : e)), 5_000);
  st.timerKirim.unref?.();
}

/** Hapus riwayat antrean yang sudah selesai (> 7 hari), berkelompok supaya tidak mengunci tabel lama. */
export async function bersihkanWebhook(kini = sekarang()): Promise<number> {
  const sql = await db();
  let total = 0;
  for (;;) {
    const r = await sql`
      DELETE FROM webhook_antrean WHERE id IN (
        SELECT id FROM webhook_antrean WHERE dibuat < ${kini - 7 * 86_400} AND status <> 'antre' LIMIT 5000)
      RETURNING id`;
    total += r.length;
    if (r.length < 5000) return total;
  }
}

/** Untuk uji: lupakan tujuan di memori. */
export function aturUlangWebhookUji(): void {
  st.tujuan = undefined;
  st.buffer = [];
  if (st.timerTulis) clearTimeout(st.timerTulis);
  st.timerTulis = null;
}
