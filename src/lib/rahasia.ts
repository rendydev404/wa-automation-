import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Enkripsi kredensial pihak ketiga yang disimpan di database (token & app secret Meta, lihat wa-resmi.ts): AES-256-GCM.
 * Kunci dari env (tidak pernah di database): RAHASIA_KREDENSIAL, atau RAHASIA_MESIN di mesin self-host. Pengujian
 * memakai AUTH_SECRET bila keduanya kosong, supaya tidak perlu env tambahan.
 */
function kunci(): Buffer {
  const r = (process.env.RAHASIA_KREDENSIAL || process.env.RAHASIA_MESIN || process.env.AUTH_SECRET || "").trim();
  if (r.length < 16) throw new Error("RAHASIA_KREDENSIAL belum diisi (minimal 16 karakter acak) di .env.");
  return createHash("sha256").update(`cg-kredensial:${r}`).digest();
}

export function enkripsiKredensial(teks: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", kunci(), iv);
  const isi = Buffer.concat([c.update(teks, "utf8"), c.final()]);
  return `k1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${isi.toString("base64url")}`;
}

export function dekripsiKredensial(simpan: string): string {
  const [v, iv, tag, isi] = simpan.split(".");
  if (v !== "k1" || !iv || !tag || !isi) throw new Error("format kredensial tidak dikenal");
  const d = createDecipheriv("aes-256-gcm", kunci(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(isi, "base64url")), d.final()]).toString("utf8");
}

/** Tampilan aman: 4 karakter terakhir saja. */
export const samarkan = (s: string): string => (s.length <= 4 ? "••••" : `••••${s.slice(-4)}`);
