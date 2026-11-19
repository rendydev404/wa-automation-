import "server-only";
import type { NextResponse } from "next/server";
import { BATAS_SETELAN_USAHA, type BarisUsaha, type SetelanUsaha, type StatusUsaha } from "../followup-def";
import { PenggunaError } from "../pengguna";
import { WaError } from "../wa";
import type { BarisTemplat, StatusResmi } from "../wa-resmi";
import { type Konteks, galat } from "./api";

/**
 * Pembantu route API v1 follow-up & jalur WhatsApp resmi (src/app/api/v1/nomor/[id]/{followup,jalur,templat-wa}).
 * Bentuk jawaban snake_case seperti route v1 lain; kredensial Meta (token, app secret) tidak pernah dikembalikan.
 */

/** Galat layanan (pesan untuk pemilik nomor) -> galat seragam. Galat lain dilempar lagi supaya `aman` mencatatnya. */
export function galatLayanan(e: unknown, k: Konteks): NextResponse {
  if (e instanceof PenggunaError || e instanceof WaError) return galat("isian_tidak_sah", e.message, k.id, k.kepala);
  throw e;
}

/** Template Meta & status jalur hanya untuk nomor yang memakai jalur resmi. */
export const galatBukanResmi = (k: Konteks): NextResponse =>
  galat("nomor_belum_terhubung", "Nomor ini belum memakai jalur WhatsApp resmi. Pasang dulu lewat PUT /nomor/{id}/jalur.", k.id, k.kepala);

// ---------- Jalur ----------

/** Status jalur tanpa token (meski sudah disamarkan). */
export function jalurApi(numberId: number, s: StatusResmi) {
  return {
    nomor_id: String(numberId),
    jalur: s.jalur,
    kebijakan: s.kebijakan,
    phone_number_id: s.phone_number_id,
    waba_id: s.waba_id,
    nomor: s.nomor,
    nama: s.nama,
    kualitas: s.kualitas,
    tier: s.tier,
    status: s.status,
    alasan: s.alasan,
    webhook_url: s.webhook_url,
    verify_token: s.verify_token,
    kuota: s.kuota,
  };
}

export const templatApi = (t: BarisTemplat) => ({
  nama: t.nama,
  bahasa: t.bahasa,
  kategori: t.kategori,
  kode_tahap: t.kode_tahap,
  isi: t.isi,
  status: t.status,
  alasan: t.alasan,
  diperbarui: t.diperbarui,
});

// ---------- Follow-up ----------

/** Nama kolom API (snake_case) -> kunci SetelanUsaha. */
const ANGKA = {
  jam_mulai: "jamMulai",
  jam_selesai: "jamSelesai",
  batas_harian: "batasHarian",
  jeda_panas_jam: "jedaPanasJam",
  jeda_hangat_jam: "jedaHangatJam",
  tahap2_jam: "tahap2Jam",
  tahap3_jam: "tahap3Jam",
  maks_tahap: "maksTahap",
  siklus_ulang_hari: "siklusUlangHari",
} as const satisfies Record<string, keyof typeof BATAS_SETELAN_USAHA>;
const SAKELAR = { aktif: "aktif", ulang_aktif: "ulangAktif" } as const satisfies Record<string, keyof SetelanUsaha>;

export function setelanApi(s: SetelanUsaha) {
  const hasil: Record<string, number | boolean> = {};
  for (const [api, kunci] of Object.entries(SAKELAR)) hasil[api] = s[kunci];
  for (const [api, kunci] of Object.entries(ANGKA)) hasil[api] = s[kunci];
  return hasil;
}

/** Rentang sah tiap angka setelan (untuk form di aplikasi developer). */
export const RENTANG_SETELAN_API = Object.fromEntries(
  Object.entries(ANGKA).map(([api, kunci]) => [api, { min: BATAS_SETELAN_USAHA[kunci][0], maks: BATAS_SETELAN_USAHA[kunci][1] }]),
);

/**
 * Terapkan PATCH sebagian ke setelan lama. Hanya kolom yang dikirim yang diubah; nilai salah = pesan galat (tidak
 * dipotong diam-diam seperti uraiSetelanUsaha).
 */
export function terapkanSetelan(lama: SetelanUsaha, d: Record<string, unknown>): { galat: string } | { setelan: SetelanUsaha; berubah: boolean } {
  const baru: SetelanUsaha = { ...lama };
  let berubah = false;
  for (const [api, kunci] of Object.entries(SAKELAR)) {
    if (d[api] === undefined) continue;
    if (typeof d[api] !== "boolean") return { galat: `${api} harus true/false.` };
    berubah ||= baru[kunci] !== d[api];
    baru[kunci] = d[api];
  }
  for (const [api, kunci] of Object.entries(ANGKA)) {
    if (d[api] === undefined) continue;
    const [min, maks] = BATAS_SETELAN_USAHA[kunci];
    const v = d[api];
    if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > maks) return { galat: `${api} harus bilangan bulat ${min}–${maks}.` };
    berubah ||= baru[kunci] !== v;
    baru[kunci] = v;
  }
  if (baru.jamSelesai <= baru.jamMulai) return { galat: "jam_selesai harus lebih besar dari jam_mulai (jam WIB, 0–24)." };
  return { setelan: baru, berubah };
}

export function statusFollowupApi(s: StatusUsaha) {
  return {
    boleh: s.boleh,
    terhubung: s.terhubung,
    tahan: s.tahan,
    rem: s.rem,
    kirim_hari_ini: s.kirimHariIni,
    batas_hari_ini: s.batasHariIni,
    sebab_batas: s.sebabBatas,
    sisa_kuota_ai: s.sisaKuota,
    jumlah: { terkirim: s.terkirim, dibalas: s.dibalas, stop: s.stop, berjalan: s.berjalan },
  };
}

const MINAT = ["dingin", "hangat", "panas"] as const;

export const barisFollowupApi = (b: BarisUsaha) => ({
  jenis: b.jenis,
  kunci: b.kunci,
  status: b.status,
  tujuan: b.tujuan,
  nama: b.nama,
  minat: b.minat === null ? null : (MINAT[b.minat] ?? null),
  tahap: b.tahap,
  maks: b.maks,
  jadwal: b.jadwal,
  diperbarui: b.diperbarui,
  draf: b.draf,
  pesan: b.pesan.map((p) => ({ teks: p.teks, pada: p.pada, ack: p.ack })),
  dibalas: b.dibalas,
  alasan: b.alasan,
  percakapan_id: b.percakapan_id === null ? null : String(b.percakapan_id),
});

export type JenisFollowup = "prospek" | "ulang";
export const jenisSah = (v: unknown): v is JenisFollowup => v === "prospek" || v === "ulang";
export const salahJenis = (k: Konteks): NextResponse => galat("isian_tidak_sah", "jenis harus 'prospek' atau 'ulang'.", k.id, k.kepala);

/** Kunci chat dari segmen jalur (sudah di-decode Next.js). */
export const kunciSah = (v: string | undefined): v is string => typeof v === "string" && v.length > 0 && v.length <= 200 && !/[\s/]/.test(v);
