/**
 * Token lisensi bertanda tangan Ed25519 (pusat menandatangani, mesin memverifikasi) + format API key.
 * Tanpa I/O dan tanpa "server-only": dipakai pusat, mesin, dan uji.
 *
 * Token = base64url(JSON isi) + "." + base64url(tanda tangan Ed25519 atas bagian pertama).
 */
import { createHash, createHmac, createPrivateKey, createPublicKey, randomBytes, sign, timingSafeEqual, verify } from "node:crypto";
import type { IsiLisensi, KunciLisensi, ModeApi } from "./api-def";

/**
 * Kunci publik pusat (Ed25519, SPKI DER base64). Tertanam di kode supaya pemilik mesin tidak bisa menggantinya
 * dengan kuncinya sendiri lewat .env. Pasangan kunci privatnya hanya ada di .env server pusat (LISENSI_KUNCI_PRIVAT).
 */
export const KUNCI_PUBLIK_PUSAT = "MCowBQYDK2VwAyEAn/xpBnoc16He0gimT1+P/t5OWCoJNyxcX6b2lURSQl0=";

/**
 * Kunci publik yang dipakai memverifikasi: bawaan di atas. Kunci uji (LISENSI_KUNCI_PUBLIK) hanya dipakai bila
 * LISENSI_MODE_UJI=1. Di build Next, `process.env.LISENSI_MODE_UJI` diganti nilai SAAT BUILD (next.config.ts `env`),
 * dan image mesin selalu dibangun dengan nilai kosong (deploy/mesin/Dockerfile). Jadi pemilik mesin tidak bisa
 * mengaktifkannya lewat .env untuk menerima lisensi buatannya sendiri. Di uji (node + loader, tanpa build) dibaca saat jalan.
 * Sengaja tidak memakai NODE_ENV: nilai itu bisa diatur pemilik mesin.
 */
export function kunciPublikAktif(): string {
  const uji = process.env.LISENSI_MODE_UJI === "1" ? process.env.LISENSI_KUNCI_PUBLIK : undefined;
  return uji?.trim() || KUNCI_PUBLIK_PUSAT;
}

const b64u = (b: Buffer | string): string => Buffer.from(b).toString("base64url");

export function tandatanganiLisensi(isi: IsiLisensi, kunciPrivatPkcs8B64: string): string {
  const kepala = b64u(JSON.stringify(isi));
  const kunci = createPrivateKey({ key: Buffer.from(kunciPrivatPkcs8B64, "base64"), format: "der", type: "pkcs8" });
  return `${kepala}.${b64u(sign(null, Buffer.from(kepala), kunci))}`;
}

/** Isi lisensi bila tanda tangannya sah (kedaluwarsa TIDAK diperiksa di sini); null bila rusak/palsu. */
export function verifikasiLisensi(token: string, kunciPublikSpkiB64 = kunciPublikAktif()): IsiLisensi | null {
  if (typeof token !== "string" || token.length > 20_000) return null;
  const [kepala, tanda, lebih] = token.split(".");
  if (!kepala || !tanda || lebih !== undefined) return null;
  try {
    const kunci = createPublicKey({ key: Buffer.from(kunciPublikSpkiB64, "base64"), format: "der", type: "spki" });
    if (!verify(null, Buffer.from(kepala), kunci, Buffer.from(tanda, "base64url"))) return null;
    const isi = JSON.parse(Buffer.from(kepala, "base64url").toString("utf8")) as IsiLisensi;
    return isi && (isi.v === 1 || (isi.v === 2 && isi.mode === "sandbox")) && typeof isi.versi_urut === "number" && Array.isArray(isi.kunci) ? isi : null;
  } catch {
    return null;
  }
}

/** Kunci publik (SPKI DER base64) dari kunci privat (PKCS8 DER base64). */
export function kunciPublikDari(kunciPrivatPkcs8B64: string): string {
  const priv = createPrivateKey({ key: Buffer.from(kunciPrivatPkcs8B64, "base64"), format: "der", type: "pkcs8" });
  return createPublicKey(priv).export({ format: "der", type: "spki" }).toString("base64");
}

// ---------- API key ----------

const ALFABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
function base62(n: number): string {
  const b = randomBytes(n * 2);
  let s = "";
  for (let i = 0; s.length < n && i < b.length; i++) if (b[i] < 248) s += ALFABET[b[i] % 62]; // 248 = 4*62: tanpa bias
  return s.length === n ? s : s + base62(n - s.length);
}

const POLA_KEY = /^cg_(live|test)_([0-9A-Za-z]{8})_([0-9A-Za-z]{32})$/;
const awalanMode = (m: ModeApi): string => (m === "sandbox" ? "cg_test" : "cg_live");

/** Key baru: `cg_live_<awalan 8>_<rahasia 32>` (production) / `cg_test_…` (sandbox); ±190 bit acak di bagian rahasia. */
export function buatKunciApi(mode: ModeApi = "produksi"): { key: string; awalan: string; hash: string } {
  const awalan = base62(8);
  const rahasia = base62(32);
  return { key: `${awalanMode(mode)}_${awalan}_${rahasia}`, awalan, hash: hashRahasia(rahasia) };
}

export function uraiKunciApi(teks: unknown): { awalan: string; rahasia: string; mode: ModeApi } | null {
  const m = typeof teks === "string" ? POLA_KEY.exec(teks.trim()) : null;
  return m ? { awalan: m[2], rahasia: m[3], mode: m[1] === "test" ? "sandbox" : "produksi" } : null;
}

export const hashRahasia = (rahasia: string): string => createHash("sha256").update(rahasia).digest("hex");

/** Tampilan aman key: awalan saja, mis. "cg_live_Ab12Cd34_••••". */
export const sembunyikanKunci = (awalan: string, mode: ModeApi = "produksi"): string => `${awalanMode(mode)}_${awalan}_••••••••`;

/** Cocokkan key dengan daftar kunci di lisensi (perbandingan waktu-tetap). `kini` dalam detik epoch. */
export function kunciCocok(key: unknown, daftar: KunciLisensi[], kini = Math.floor(Date.now() / 1000), mode?: ModeApi): boolean {
  const k = uraiKunciApi(key);
  if (!k || (mode && k.mode !== mode)) return false;
  const h = Buffer.from(hashRahasia(k.rahasia), "hex");
  for (const e of daftar) {
    if (e.awalan !== k.awalan || (e.sampai !== null && e.sampai <= kini)) continue;
    const x = Buffer.from(e.hash, "hex");
    if (x.length === h.length && timingSafeEqual(x, h)) return true;
  }
  return false;
}

/** Jawaban tantangan aktivasi: membuktikan server di alamat itu memegang key yang sama. */
export const jawabTantangan = (key: string, nonce: string): string => createHmac("sha256", key).update(`cg-tantangan:${nonce}`).digest("hex");
