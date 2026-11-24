/**
 * Asal pendaftar (atribusi iklan): industri landing page, halaman LP, paket yang diklik, UTM, dan click id iklan.
 * Ditangkap proxy.ts dari URL /daftar atau /login (tautan dari LP industri membawanya, lihat lp/aset/lp.js) ke cookie
 * httpOnly `cg_asal`, lalu disimpan ke akun saat akun dibuat (email maupun Google). Murni tanpa I/O: dipakai proxy,
 * server, dan uji. Semua nilai disaring (whitelist/regex + batas panjang) karena datang dari URL bebas.
 */
import { SLUG_LP, type SlugLp } from "./lp/def";

export const COOKIE_ASAL = "cg_asal";
/** 30 hari: jarak wajar antara klik iklan dan mendaftar. */
export const UMUR_COOKIE_ASAL = 30 * 24 * 60 * 60;

const UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
const KLIK = ["fbclid", "ttclid", "gclid"] as const;

export interface AsalDaftar {
  industri: SlugLp | null;
  lp: string | null;
  /** UTM, click id iklan, dan kode paket yang diklik di LP. */
  utm: Partial<Record<(typeof UTM)[number] | (typeof KLIK)[number] | "paket", string>>;
}

const bersih = (v: unknown, maks: number): string | null => {
  if (typeof v !== "string") return null;
  // Tanpa karakter kontrol; spasi berlebih dirapikan.
  const s = v.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, maks);
  return s || null;
};

const industriSah = (v: unknown): SlugLp | null => (typeof v === "string" && (SLUG_LP as readonly string[]).includes(v) ? (v as SlugLp) : null);
const lpSah = (v: unknown): string | null => (typeof v === "string" && /^\/[a-z0-9/-]{0,63}$/.test(v) ? v : null);

function saring(sumber: (k: string) => unknown): AsalDaftar | null {
  const utm: AsalDaftar["utm"] = {};
  for (const k of UTM) {
    const v = bersih(sumber(k), 200);
    if (v) utm[k] = v;
  }
  for (const k of KLIK) {
    const v = bersih(sumber(k), 200);
    if (v && /^[\w.-]+$/.test(v)) utm[k] = v;
  }
  const paket = bersih(sumber("paket"), 32);
  if (paket && /^[a-z0-9_-]+$/i.test(paket)) utm.paket = paket.toLowerCase();
  const asal: AsalDaftar = { industri: industriSah(sumber("industry")), lp: lpSah(sumber("landing_page")), utm };
  return asal.industri || asal.lp || Object.keys(utm).length ? asal : null;
}

/** Dari query URL (/daftar?industry=laundry&landing_page=/laundry&utm_source=meta...); null bila tidak ada apa pun. */
export function asalDariUrl(q: URLSearchParams): AsalDaftar | null {
  return saring((k) => q.get(k));
}

/**
 * Asal dari halaman publik mana pun yang dibuka dengan parameter iklan (beranda "/", LP industri "/laundry", ...):
 * hanya bila URL membawa UTM / click id / industri, supaya kunjungan biasa tidak menimpa atribusi iklan sebelumnya.
 * Halaman itu sendiri menjadi `lp` bila tidak disebut, dan slug LP industri menjadi `industri`. Tanpa ini pendaftar dari
 * iklan yang mendarat di beranda kehilangan UTM-nya, karena tombol "Daftar" mengarah ke /daftar tanpa parameter.
 */
export function asalHalaman(pathname: string, q: URLSearchParams): AsalDaftar | null {
  const a = asalDariUrl(q);
  if (!a) return null;
  const slug = pathname.replace(/^\//, "");
  return { industri: a.industri ?? industriSah(slug), lp: a.lp ?? lpSah(pathname), utm: a.utm };
}

/** Nilai cookie (JSON pendek). Kunci sama dengan parameter URL supaya bisa disaring ulang saat dibaca. */
export function kodeAsal(a: AsalDaftar): string {
  return JSON.stringify({ industry: a.industri ?? undefined, landing_page: a.lp ?? undefined, ...a.utm });
}

/** Isi cookie -> asal tersaring; cookie rusak/diubah tangan = null (pendaftaran tetap jalan tanpa atribusi). */
export function bacaAsal(nilai: string | undefined | null): AsalDaftar | null {
  if (!nilai || nilai.length > 2000) return null;
  try {
    const o = JSON.parse(nilai) as unknown;
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    return saring((k) => (o as Record<string, unknown>)[k]);
  } catch {
    return null;
  }
}
