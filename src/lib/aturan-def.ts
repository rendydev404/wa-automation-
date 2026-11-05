/**
 * Definisi aturan sistem (label, batas, bawaan): murni tanpa I/O, jadi dipakai juga oleh formulir admin di browser.
 * Pembacaan nilai tersimpan ada di aturan.ts.
 */

export const ATURAN_ANGKA = {
  maks_token_balasan: {
    label: "Panjang maksimal satu balasan",
    satuan: "token",
    bawaan: 700,
    min: 150,
    max: 2000,
    bantu: "±0,75 kata per token. Pagar biaya bila model kebablasan; balasan WhatsApp normal ±110 token. Berlaku untuk Claude API.",
  },
  peringatan_kuota_persen: {
    label: "Peringatan kuota hampir habis",
    satuan: "% sisa",
    bawaan: 20,
    min: 0,
    max: 50,
    bantu: "Banner muncul di semua halaman workspace pengguna bila sisa kuota balasan ≤ angka ini. 0 = tanpa peringatan.",
  },
} as const satisfies Record<string, { label: string; satuan: string; bawaan: number; min: number; max: number; bantu: string }>;

export const MAKS_ATURAN_GLOBAL = 4000;

export type KunciAngka = keyof typeof ATURAN_ANGKA;
export type AturanSistem = Record<KunciAngka, number> & { aturan_global: string };
