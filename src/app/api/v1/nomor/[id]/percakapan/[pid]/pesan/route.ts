import { ambilPesanPercakapan } from "@/lib/percakapan";
import { aman, bukanKonteks, galat, nomorAtau404, ok, otorisasi } from "@/lib/mesin/api";
import { idSah, percakapanApi, pesanApi } from "../../umum";

type Ctx = { params: Promise<{ id: string; pid: string }> };

/**
 * GET /api/v1/nomor/{id}/percakapan/{pid}/pesan?batas=50&sebelum=<id pesan>
 *   -> { percakapan, data: Pesan[] (lama -> baru), ada_sebelumnya }. Indeks pesan_chat_percakapan_idx.
 */
export async function GET(req: Request, ctx: Ctx) {
  const k = await otorisasi(req, "percakapan");
  if (bukanKonteks(k)) return k;
  return aman(k, async () => {
    const p = await ctx.params;
    const n = await nomorAtau404(p.id, k);
    if (n instanceof Response) return n;
    const pid = idSah(p.pid);
    if (!pid) return galat("tidak_ditemukan", "Percakapan tidak ditemukan.", k.id, k.kepala);
    const url = new URL(req.url);
    const b = Number(url.searchParams.get("batas") ?? 50);
    const sebelum = idSah(url.searchParams.get("sebelum") ?? undefined) ?? undefined;
    const h = await ambilPesanPercakapan(n.id, pid, { sebelumId: sebelum, batas: Number.isInteger(b) ? Math.min(Math.max(b, 1), 100) : 50 });
    if (!h) return galat("tidak_ditemukan", "Percakapan tidak ditemukan.", k.id, k.kepala);
    return ok({ percakapan: percakapanApi(h.percakapan), data: h.pesan.map(pesanApi), ada_sebelumnya: h.adaSebelumnya }, k);
  });
}
