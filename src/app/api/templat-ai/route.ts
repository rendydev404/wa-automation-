import { fiturBoleh } from "@/lib/mesin/lisensi";
import type { NextRequest } from "next/server";
import { bacaTemplat } from "@/lib/templat-ai";
import { slugTemplatSah } from "@/lib/templat-ai-def";

/**
 * Teks template AI satu industri (lp/prompt/<slug>.md) untuk kolom Instruksi khusus, dimuat saat pemilik memilihnya di
 * pengaturan nomor. Butuh sesi (proxy.ts menolak /api tanpa login). Isinya sama untuk semua orang dan hanya berubah
 * saat deploy: dibaca dari disk sekali per proses, browser boleh menyimpannya sejam.
 */
export async function GET(req: NextRequest): Promise<Response> {
  if (!fiturBoleh("templat")) return Response.json({ error: "Fitur ini dinonaktifkan oleh ChatGerCep." }, { status: 403 });
  const jenis = req.nextUrl.searchParams.get("jenis");
  if (!slugTemplatSah(jenis)) return Response.json({ error: "Jenis usaha tidak dikenal." }, { status: 404 });
  return Response.json({ teks: await bacaTemplat(jenis) }, { headers: { "Cache-Control": "private, max-age=3600" } });
}
