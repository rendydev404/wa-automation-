import { NextResponse } from "next/server";
import { pendaftarTerbaru } from "@/lib/pendaftar";

/** Nama pendaftar terbaru (sudah disamarkan) untuk kartu di hero landing. Publik, lihat PUBLIK di proxy.ts. */
export async function GET() {
  try {
    const daftar = await pendaftarTerbaru();
    return NextResponse.json({ daftar }, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch {
    return NextResponse.json({ daftar: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}
