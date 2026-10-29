import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { getSetting, setSetting } from "./db";

/**
 * Rahasia yang dikelola admin dari dashboard (mis. API key Anthropic), disimpan di tabel settings dalam bentuk
 * terenkripsi AES-256-GCM. Kuncinya diturunkan (HKDF-SHA256) dari AUTH_SECRET, jadi isi database saja (mis. dari
 * cadangan yang bocor) tidak cukup untuk membacanya. AUTH_SECRET diganti = rahasia lama tidak terbaca lagi dan
 * admin cukup mengisinya ulang. Format: v1:<iv>:<tag>:<sandi> (base64url).
 */

function kunci(): Buffer {
  const s = process.env.AUTH_SECRET ?? "";
  if (s.length < 32) throw new Error("AUTH_SECRET belum dikonfigurasi.");
  return Buffer.from(hkdfSync("sha256", s, "wa-automation", "rahasia-settings-v1", 32));
}

export function sandikan(teks: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", kunci(), iv);
  const sandi = Buffer.concat([c.update(teks, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), sandi.toString("base64url")].join(":");
}

/** null bila kosong, rusak, atau dibuat dengan AUTH_SECRET lain. */
export function bukaSandi(nilai: string | null): string | null {
  const [v, iv, tag, sandi] = (nilai ?? "").split(":");
  if (v !== "v1" || !iv || !tag || !sandi) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", kunci(), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(sandi, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export async function bacaRahasia(nama: string): Promise<string | null> {
  return bukaSandi(await getSetting(`rahasia:${nama}`));
}

/** Kosong = hapus. */
export async function simpanRahasia(nama: string, nilai: string): Promise<void> {
  await setSetting(`rahasia:${nama}`, nilai ? sandikan(nilai) : "");
}

/** Tampilan aman untuk dashboard: awalan + 4 karakter terakhir saja. */
export function samarkan(nilai: string): string {
  return nilai.length <= 12 ? "••••" : `${nilai.slice(0, 7)}…${nilai.slice(-4)}`;
}
