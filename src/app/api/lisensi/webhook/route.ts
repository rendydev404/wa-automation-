import { NextResponse } from "next/server";
import type { JawabanLisensiMesin } from "@/lib/api-def";
import { terlaluSering } from "@/lib/batas";
import { db } from "@/lib/db";
import { jawabTantangan } from "@/lib/lisensi-def";
import { VERSI_APLIKASI, modeMesin } from "@/lib/mode";
import { idInstalasi, terimaLisensi } from "@/lib/mesin/lisensi";

const tanpaCache = { "Cache-Control": "no-store" };
/** IP pengirim dari proxy depan (Caddy menulis ulang X-Forwarded-For), sama seperti batas.ts tetapi dari Request. */
const ipDari = (req: Request): string => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "lokal";
const galat = (kode: string, pesan: string, status: number) => NextResponse.json({ galat: { kode, pesan } }, { status, headers: tanpaCache });

/**
 * Webhook dari server pusat ke mesin self-host (hanya mode mesin; di pusat = 404):
 *   - { jenis: "tantangan", nonce, id_instalasi } saat aktivasi -> { jawaban: HMAC(CHATGERCEP_KEY, nonce) }, membuktikan
 *     mesin di alamat ini memegang key yang sama.
 *   - { jenis: "lisensi", lisensi } saat ada perubahan / perpanjangan -> diverifikasi (tanda tangan Ed25519, instalasi,
 *     versi_urut harus naik) lalu disimpan; dijawab JawabanLisensiMesin.
 * Keaslian kiriman lisensi dijamin tanda tangannya, bukan pengirimnya; batas laju per IP mencegah banjir.
 */
export async function POST(req: Request) {
  if (!modeMesin()) return galat("tidak_ditemukan", "Tidak ditemukan.", 404);
  if (terlaluSering(`lisensi-wh:${ipDari(req)}`, 30, 60_000)) return galat("terlalu_sering", "Terlalu banyak permintaan.", 429);
  if (Number(req.headers.get("content-length") ?? 0) > 64 * 1024) return galat("isian_tidak_sah", "Isi terlalu besar.", 413);
  const b = (await req.json().catch(() => null)) as { jenis?: unknown; nonce?: unknown; id_instalasi?: unknown; lisensi?: unknown } | null;
  if (!b || typeof b !== "object") return galat("isian_tidak_sah", "Body harus JSON.", 400);

  if (b.jenis === "tantangan") {
    const key = (process.env.CHATGERCEP_KEY ?? "").trim();
    if (!key) return galat("key_tidak_sah", "CHATGERCEP_KEY belum diisi di mesin.", 409);
    if (typeof b.nonce !== "string" || b.nonce.length < 16 || b.nonce.length > 200) return galat("isian_tidak_sah", "nonce tidak sah.", 400);
    if (b.id_instalasi !== (await idInstalasi())) return galat("tidak_ditemukan", "id_instalasi bukan milik mesin ini.", 404);
    return NextResponse.json({ jawaban: jawabTantangan(key, b.nonce) }, { headers: tanpaCache });
  }

  if (b.jenis === "lisensi") {
    if (typeof b.lisensi !== "string") return galat("isian_tidak_sah", "lisensi harus string.", 400);
    const t = await terimaLisensi(b.lisensi);
    // Versi yang lebih lama bukan galat: pusat cukup tahu versi yang sekarang dipegang mesin.
    if (!t.ok && t.alasan !== "versi lisensi lebih lama dari yang tersimpan") return galat("lisensi_ditolak", t.alasan, 422);
    const sql = await db();
    const [{ n }] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM numbers`;
    const jawab: JawabanLisensiMesin = { versi_urut_diterima: t.versi, versi_mesin: VERSI_APLIKASI, jumlah_nomor: n };
    return NextResponse.json(jawab, { headers: tanpaCache });
  }

  return galat("isian_tidak_sah", "jenis harus 'tantangan' atau 'lisensi'.", 400);
}
