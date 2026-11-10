import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { type FiturApi, KODE_GALAT, type KodeGalat } from "../api-def";
import { db, sekarang } from "../db";
import { kunciCocok, uraiKunciApi } from "../lisensi-def";
import { modeMesin } from "../mode";
import { type Nomor, nomorById } from "../numbers";
import type { StatusSesiWa } from "../types";
import { alasanTerbatas, lisensiSekarang, muatLisensi } from "./lisensi";

/**
 * Pembantu route API v1 di mesin self-host (src/app/api/v1/**). Autentikasi dicocokkan dengan daftar key di lisensi
 * (hash SHA-256) TANPA bertanya ke pusat; galat seragam { galat: { kode, pesan, id_permintaan } }.
 */

export interface Konteks {
  id: string;
  awalan: string;
  /** Header batas laju untuk dipasang di setiap jawaban. */
  kepala: Record<string, string>;
}

const TANPA_CACHE = { "Cache-Control": "no-store" };

export const idPermintaan = (): string => `req_${randomBytes(9).toString("base64url")}`;

export function galat(kode: KodeGalat, pesan: string, id: string, kepala: Record<string, string> = {}): NextResponse {
  return NextResponse.json({ galat: { kode, pesan, id_permintaan: id } }, { status: KODE_GALAT[kode], headers: { ...TANPA_CACHE, ...kepala, "X-Request-Id": id } });
}

export function ok(data: unknown, k: Konteks, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: { ...TANPA_CACHE, ...k.kepala, "X-Request-Id": k.id } });
}

// ---------- Batas laju (jendela tetap 1 dtk per key, di memori: mesin = satu proses) ----------

export const BATAS_PER_DETIK = Math.max(1, Number(process.env.API_BATAS_PER_DETIK) || 60);
const gl = globalThis as unknown as { __waApiLaju?: Map<string, { n: number; mulai: number }> };
const laju = (gl.__waApiLaju ??= new Map());

/** Hitung `jumlah` (bawaan 1) permintaan; kembalikan sisa & waktu reset. `maks`/`jendelaMs` bisa diganti (mis. AI per menit). */
export function hitungLaju(kunci: string, maks = BATAS_PER_DETIK, jendelaMs = 1000, jumlah = 1): { boleh: boolean; kepala: Record<string, string> } {
  const kini = Date.now();
  let p = laju.get(kunci);
  if (!p || kini - p.mulai >= jendelaMs) {
    if (laju.size > 20_000) laju.clear();
    p = { n: 0, mulai: kini };
    laju.set(kunci, p);
  }
  p.n += jumlah;
  const reset = Math.ceil((p.mulai + jendelaMs) / 1000);
  const kepala: Record<string, string> = {
    "X-RateLimit-Limit": String(maks),
    "X-RateLimit-Remaining": String(Math.max(0, maks - p.n)),
    "X-RateLimit-Reset": String(reset),
  };
  if (p.n > maks) kepala["Retry-After"] = String(Math.max(1, Math.ceil((p.mulai + jendelaMs - kini) / 1000)));
  return { boleh: p.n <= maks, kepala };
}

// ---------- Autentikasi ----------

/**
 * Periksa permintaan: mode mesin, bukan dari browser (CORS tertutup), key cocok dengan lisensi, batas laju, status
 * lisensi (kecuali `izinkanTerbatas`, untuk GET /status), dan scope. Mengembalikan konteks atau jawaban galat.
 */
export async function otorisasi(req: Request, scope: FiturApi | null, opsi: { izinkanTerbatas?: boolean } = {}): Promise<Konteks | NextResponse> {
  const id = idPermintaan();
  if (!modeMesin()) return galat("tidak_ditemukan", "API v1 hanya tersedia di mesin ChatGerCep self-host.", id);
  // Permintaan lintas asal dari browser: API key tidak boleh dipakai di halaman web (akan bocor ke pengunjung).
  if (req.headers.has("origin")) // fetch dari server (Node, PHP, Python) tidak mengirim Origin; browser lintas asal selalu mengirimnya
    return galat("key_tidak_sah", "API key tidak boleh dipakai dari browser. Panggil API dari server aplikasi Anda.", id);
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
  const kunci = m?.[1] ?? "";
  const urai = uraiKunciApi(kunci);
  if (!urai) return galat("key_tidak_sah", "Sertakan header Authorization: Bearer cg_live_… yang sah.", id);
  await muatLisensi();
  const l = lisensiSekarang();
  if (!l) {
    const a = alasanTerbatas();
    return galat(a?.kode ?? "lisensi_kedaluwarsa", a?.pesan ?? "Mesin belum diaktifkan.", id);
  }
  if (!kunciCocok(kunci, l.kunci)) return galat("key_tidak_sah", "API key tidak sah, sudah dicabut, atau masa rotasinya habis.", id);
  const r = hitungLaju(`api:${urai.awalan}`);
  if (!r.boleh) return galat("terlalu_sering", `Terlalu banyak permintaan (maks ${BATAS_PER_DETIK}/detik per key).`, id, r.kepala);
  if (!opsi.izinkanTerbatas) {
    const a = alasanTerbatas();
    if (a) return galat(a.kode, a.pesan, id, r.kepala);
  }
  if (scope && !l.fitur.includes(scope)) return galat("fitur_tidak_dibuka", `Fitur '${scope}' belum dibuka untuk aplikasi ini.`, id, r.kepala);
  return { id, awalan: urai.awalan, kepala: r.kepala };
}

export const bukanKonteks = (x: Konteks | NextResponse): x is NextResponse => x instanceof NextResponse;

// ---------- Isi permintaan ----------

export const MAKS_JSON = 1024 * 1024;
export const MAKS_BERKAS = 10 * 1024 * 1024;

/** Baca body sebagai teks dengan batas ukuran. null = terlalu besar. */
export async function bacaTeks(req: Request, maks = MAKS_JSON): Promise<string | null> {
  if (Number(req.headers.get("content-length") ?? 0) > maks) return null;
  const buf = await req.arrayBuffer();
  if (buf.byteLength > maks) return null;
  return new TextDecoder("utf-8").decode(buf);
}

/** Body JSON objek, atau jawaban galat. */
export async function bacaJson(req: Request, k: Konteks, maks = MAKS_JSON): Promise<{ teks: string; data: Record<string, unknown> } | NextResponse> {
  const teks = await bacaTeks(req, maks);
  if (teks === null) return galat("isian_tidak_sah", `Body JSON maksimal ${Math.round(maks / 1024 / 1024)} MB.`, k.id, k.kepala);
  if (!teks.trim()) return { teks: "", data: {} };
  try {
    const data = JSON.parse(teks);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw 0;
    return { teks, data };
  } catch {
    return galat("isian_tidak_sah", "Body harus JSON objek yang sah.", k.id, k.kepala);
  }
}

// ---------- Idempotensi ----------

const gi = globalThis as unknown as { __waApiIdem?: Map<string, Promise<{ status: number; body: unknown }>> };
const sedang = (gi.__waApiIdem ??= new Map());
const UMUR_IDEM = 24 * 3600;

/**
 * Jalankan `fn` sekali per Idempotency-Key (24 jam). Permintaan ulang dengan key & isi yang sama mendapat jawaban
 * pertama; isi berbeda = 409 bentrok_idempotensi. Permintaan serentak dengan key sama menunggu janji yang sama.
 * Jawaban 5xx tidak disimpan (boleh dicoba lagi).
 */
export async function denganIdempotensi(
  req: Request,
  k: Konteks,
  isiTeks: string,
  fn: () => Promise<{ status: number; body: unknown }>,
): Promise<NextResponse> {
  const kunciMentah = req.headers.get("idempotency-key")?.trim();
  if (!kunciMentah) {
    const h = await fn();
    return ok(h.body, k, h.status);
  }
  if (kunciMentah.length > 200) return galat("isian_tidak_sah", "Idempotency-Key maksimal 200 karakter.", k.id, k.kepala);
  const kunci = `${k.awalan}:${kunciMentah}`;
  const hash = createHash("sha256").update(`${req.method} ${new URL(req.url).pathname}\n${isiTeks}`).digest("hex");
  const sql = await db();
  const [ada] = await sql<{ hash_permintaan: string; status: number; respons: unknown }[]>`
    SELECT hash_permintaan, status, respons FROM api_idempoten WHERE kunci = ${kunci} AND kedaluwarsa > ${sekarang()}`;
  if (ada) {
    if (ada.hash_permintaan !== hash) return galat("bentrok_idempotensi", "Idempotency-Key ini sudah dipakai untuk permintaan dengan isi berbeda.", k.id, k.kepala);
    const r = ok(ada.respons, k, ada.status);
    r.headers.set("Idempotent-Replayed", "true");
    return r;
  }
  let janji = sedang.get(kunci);
  const pemilik = !janji;
  if (!janji) {
    janji = fn();
    sedang.set(kunci, janji);
  }
  try {
    const h = await janji;
    if (pemilik && h.status < 500) {
      await sql`
        INSERT INTO api_idempoten (kunci, hash_permintaan, status, respons, kedaluwarsa)
        VALUES (${kunci}, ${hash}, ${h.status}, ${sql.json(h.body as never)}, ${sekarang() + UMUR_IDEM})
        ON CONFLICT (kunci) DO UPDATE SET hash_permintaan = EXCLUDED.hash_permintaan, status = EXCLUDED.status, respons = EXCLUDED.respons, kedaluwarsa = EXCLUDED.kedaluwarsa`;
    }
    return ok(h.body, k, h.status);
  } finally {
    if (pemilik) sedang.delete(kunci);
  }
}

export async function bersihkanIdempoten(kini = sekarang()): Promise<number> {
  const sql = await db();
  const r = await sql`DELETE FROM api_idempoten WHERE kedaluwarsa < ${kini} RETURNING kunci`;
  return r.length;
}

// ---------- Paginasi & data ----------

export function paginasi(url: URL): { batas: number; setelah: number | null } {
  const b = Number(url.searchParams.get("batas") ?? 50);
  const s = Number(url.searchParams.get("setelah"));
  return { batas: Number.isInteger(b) ? Math.min(Math.max(b, 1), 100) : 50, setelah: Number.isSafeInteger(s) && s > 0 ? s : null };
}

/** Id dari segmen jalur (angka positif) atau null. */
export const idJalur = (v: string | undefined): number | null => {
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

/** Pemilik mesin = akun admin pertama (dibuat dari ADMIN_EMAIL/ADMIN_PASSWORD); nomor lewat API dimilikinya. */
let pemilik: number | null = null;
export async function pemilikMesin(): Promise<number | null> {
  if (pemilik) return pemilik;
  try {
    await (await import("../session")).pastikanAdminAwal();
  } catch {}
  const sql = await db();
  const [u] = await sql<{ id: number }[]>`SELECT id FROM users WHERE peran = 'admin' AND status = 'aktif' ORDER BY id LIMIT 1`;
  pemilik = u?.id ?? null;
  return pemilik;
}

export type StatusNomorApi = "terhubung" | "menunggu_qr" | "menyambung" | "terputus";
export const statusNomorApi = (s: StatusSesiWa): StatusNomorApi =>
  s === "WORKING" ? "terhubung" : s === "SCAN_QR_CODE" ? "menunggu_qr" : s === "STARTING" ? "menyambung" : "terputus";

/** Bentuk Nomor di API v1. */
export function bentukNomor(n: Nomor, status: StatusSesiWa) {
  return {
    id: String(n.id),
    label: n.label,
    status: statusNomorApi(status),
    wa_id: n.wa_id,
    nama_wa: n.nama_wa,
    bot_aktif: n.bot_aktif,
    instruksi: n.instruksi,
    tunggu_detik: n.tunggu_detik,
    tunggu_baca_detik: n.tunggu_baca_detik,
    jeda_detik: n.jeda_detik,
    dibuat: n.created_at,
  };
}

/** Nomor di mesin ini (semua nomor milik mesin), atau jawaban 404. */
export async function nomorAtau404(idTeks: string | undefined, k: Konteks): Promise<Nomor | NextResponse> {
  const id = idJalur(idTeks);
  const n = id ? await nomorById(id) : undefined;
  return n ?? galat("tidak_ditemukan", "Nomor tidak ditemukan.", k.id, k.kepala);
}

/** Bungkus handler supaya galat tak terduga tetap berbentuk galat seragam (tanpa membocorkan detail). */
export async function aman(k: Konteks, fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (e) {
    console.error(`[api ${k.id}]`, e instanceof Error ? e.message : e);
    return galat("galat_server", "Terjadi galat di mesin. Coba lagi.", k.id, k.kepala);
  }
}
