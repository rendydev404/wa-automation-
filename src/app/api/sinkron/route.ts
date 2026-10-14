import { konfigurasi, minta, tandaSah } from "@/lib/sinkron";

/**
 * Sinyal dari database kasir: "data menu/harga/promo/outlet berubah". Badan hanya berisi nomor versi,
 * tanpa data. Sah bila tanda tangan HMAC cocok dan waktunya <= 5 menit; sinyal palsu ditolak tanpa
 * menyentuh database. Tarikan sebenarnya ditunda beberapa detik supaya perubahan beruntun digabung.
 */
export async function POST(req: Request) {
  const k = konfigurasi();
  if (!k) return Response.json({ error: "Sinkron belum dikonfigurasi." }, { status: 503 });
  if (Number(req.headers.get("content-length") ?? 0) > 4096) return Response.json({ error: "Terlalu besar." }, { status: 413 });
  const badan = await req.text();
  if (badan.length > 4096 || !tandaSah(badan, req.headers.get("x-kb-waktu"), req.headers.get("x-kb-tanda"), k.rahasia)) {
    return Response.json({ error: "Tanda tangan tidak sah." }, { status: 401 });
  }
  minta();
  return Response.json({ ok: true }, { status: 202 });
}
