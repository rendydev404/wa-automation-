import { alasanSpam, periksaSpam } from "@/lib/spam";
import { bacaJson, bukanKonteks, galat, ok, otorisasi } from "@/lib/mesin/api";

/**
 * POST /api/v1/alat/cek-spam {teks} -> {spam, skor, alasan}: penyaring promosi judi online yang sama dengan bot
 * (tanpa AI, tanpa I/O). Condong ke "bukan spam" bila ragu.
 */
export async function POST(req: Request) {
  const k = await otorisasi(req, "spam.cek");
  if (bukanKonteks(k)) return k;
  const b = await bacaJson(req, k);
  if (!("teks" in b)) return b;
  const teks = typeof b.data.teks === "string" ? b.data.teks : "";
  if (!teks.trim() || teks.length > 10_000) return galat("isian_tidak_sah", "`teks` wajib diisi (maks 10.000 karakter).", k.id, k.kepala);
  const h = periksaSpam(teks);
  return ok({ spam: h.spam, skor: h.skor, alasan: h.spam ? alasanSpam(h) : null }, k);
}
