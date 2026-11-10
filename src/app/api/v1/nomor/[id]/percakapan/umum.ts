import { NextResponse } from "next/server";
import type { ItemPercakapan, ItemPesan } from "@/lib/percakapan";

const PERAN = ["pelanggan", "ai", "manusia"] as const;

/** Bentuk percakapan di API v1 (id string, status bot ringkas). */
export function percakapanApi(p: ItemPercakapan, kini = Math.floor(Date.now() / 1000)) {
  return {
    id: String(p.id),
    kunci: p.kunci,
    telepon: p.telepon,
    nama: p.nama,
    cuplikan: p.cuplikan,
    pengirim_akhir: PERAN[p.pengirim_akhir] ?? "pelanggan",
    jumlah: { masuk: p.masuk_n, ai: p.bot_n, manusia: p.manusia_n },
    terakhir_pada: p.terakhir_pada,
    bot: p.prospek === 2 ? "dibisukan" : p.jeda_sampai > kini ? "dijeda" : "aktif",
    jeda_sampai: p.jeda_sampai,
    spam: p.spam === 1,
  };
}

export const pesanApi = (m: ItemPesan) => ({ id: String(m.id), peran: PERAN[m.peran] ?? "pelanggan", teks: m.teks, waktu: m.waktu });

export const idSah = (v: string | undefined): number | null => {
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

export type Jawab = NextResponse;
