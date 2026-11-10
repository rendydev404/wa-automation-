import "server-only";
import { randomBytes } from "node:crypto";
import { KODE_GALAT, type KodeGalat } from "./api-def";
import { ipKlien, terlaluSering } from "./batas";
import { ApiError } from "./developer-api";
import { modeMesin } from "./mode";

/** Kerangka bersama endpoint lisensi di pusat (aktivasi & kondisi): mode, ukuran, batas laju, JSON, galat seragam. */
export async function tanganiLisensi<T>(req: Request, jenis: string, fn: (badan: Record<string, unknown>) => Promise<T>): Promise<Response> {
  const idPermintaan = `req_${randomBytes(8).toString("hex")}`;
  const galat = (kode: KodeGalat, pesan: string): Response =>
    Response.json({ galat: { kode, pesan, id_permintaan: idPermintaan } }, { status: KODE_GALAT[kode], headers: { "cache-control": "no-store" } });
  if (modeMesin()) return new Response("Not found", { status: 404 });
  const ip = await ipKlien();
  // Aktivasi memicu kiriman keluar (tantangan) ke alamat mesin: dibatasi ketat per IP supaya tidak bisa dipakai menembak server lain.
  if (terlaluSering(`lisensi:${jenis}:${ip}`, jenis === "aktivasi" ? 10 : 60, 10 * 60_000)) return galat("terlalu_sering", "Terlalu banyak permintaan. Coba lagi beberapa menit lagi.");
  if (Number(req.headers.get("content-length") ?? 0) > 8192) return galat("isian_tidak_sah", "Permintaan terlalu besar.");
  let badan: Record<string, unknown>;
  try {
    const teks = await req.text();
    if (teks.length > 8192) return galat("isian_tidak_sah", "Permintaan terlalu besar.");
    badan = JSON.parse(teks);
    if (!badan || typeof badan !== "object" || Array.isArray(badan)) throw 0;
  } catch {
    return galat("isian_tidak_sah", "Badan permintaan harus JSON.");
  }
  if (typeof badan.key === "string" && terlaluSering(`lisensi:key:${badan.key.slice(0, 17)}`, 30, 10 * 60_000)) return galat("terlalu_sering", "Terlalu banyak permintaan untuk key ini.");
  try {
    const hasil = await fn(badan);
    return Response.json(hasil, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof ApiError) return galat(e.kode, e.message);
    console.error(`[devapi] ${jenis} gagal:`, e instanceof Error ? e.message : e);
    return galat("galat_server", "Terjadi galat di server. Coba lagi.");
  }
}
