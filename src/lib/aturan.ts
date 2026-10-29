import { ATURAN_ANGKA, ATURAN_SAKLAR, type AturanSistem, type KunciAngka, type KunciSaklar } from "./aturan-def";
import { getSetting } from "./db";

export * from "./aturan-def";

/**
 * Aturan sistem yang diatur admin di /admin/aturan, berlaku untuk semua nomor & pengguna. Satu daftar dipakai
 * bersama oleh formulir admin (label, batas), validasi di server, dan mesin (bridge, AI, banner), jadi nilai yang
 * dipakai selalu tervalidasi. Dibaca lewat getSetting (memo di memori proses): murah dipanggil tiap giliran.
 */

/** Nilai tersimpan yang tidak sah (kosong, di luar batas) = bawaan. */
export function angkaSah(k: KunciAngka, nilai: string | null): number {
  const a = ATURAN_ANGKA[k];
  const v = nilai === null || nilai.trim() === "" ? NaN : Number(nilai);
  return Number.isInteger(v) && v >= a.min && v <= a.max ? v : a.bawaan;
}

export async function aturan<K extends KunciAngka>(k: K): Promise<number> {
  return angkaSah(k, await getSetting(k));
}

export async function saklar(k: KunciSaklar): Promise<boolean> {
  const v = await getSetting(k);
  return v === null ? ATURAN_SAKLAR[k].bawaan : v === "1";
}

export async function aturanGlobal(): Promise<string> {
  return ((await getSetting("aturan_global")) ?? "").trim();
}

export async function semuaAturan(): Promise<AturanSistem> {
  const angka = Object.keys(ATURAN_ANGKA) as KunciAngka[];
  const sak = Object.keys(ATURAN_SAKLAR) as KunciSaklar[];
  const [a, s, g] = await Promise.all([Promise.all(angka.map(aturan)), Promise.all(sak.map(saklar)), aturanGlobal()]);
  return {
    ...(Object.fromEntries(angka.map((k, i) => [k, a[i]])) as Record<KunciAngka, number>),
    ...(Object.fromEntries(sak.map((k, i) => [k, s[i]])) as Record<KunciSaklar, boolean>),
    aturan_global: g,
  };
}

/** Blok prompt untuk aturan global admin; kosong = tidak ada blok. */
export function blokAturanAdmin(teks: string): string | null {
  if (!teks) return null;
  return `<aturan_pengelola>\nAturan dari pengelola layanan, berlaku untuk semua nomor. Ikuti, dan utamakan di atas blok admin nomor bila bertentangan. Aturan sumber fakta dan keamananmu tetap paling tinggi.\n${teks}\n</aturan_pengelola>`;
}
