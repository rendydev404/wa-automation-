import { aman, bacaJson, bukanKonteks, galat, ok, otorisasi } from "@/lib/mesin/api";
import { EVENT_WEBHOOK, WebhookError, aturWebhook, tujuanWebhook } from "@/lib/mesin/webhook";

/** GET /api/v1/webhook: tujuan webhook saat ini (rahasia tidak pernah ditampilkan ulang). */
export async function GET(req: Request) {
  const k = await otorisasi(req, "pesan.terima");
  if (bukanKonteks(k)) return k;
  return aman(k, async () => {
    const t = await tujuanWebhook();
    return ok(t ? { url: t.url, event: t.event, aktif: t.aktif, gagal_sejak: t.gagal_sejak } : { url: null, event: [], aktif: false, gagal_sejak: null, pilihan_event: EVENT_WEBHOOK }, k);
  });
}

/** PUT /api/v1/webhook {url, event[]}: pasang/ganti tujuan. `rahasia` penanda tangan HANYA ditampilkan di jawaban ini. */
export async function PUT(req: Request) {
  const k = await otorisasi(req, "pesan.terima");
  if (bukanKonteks(k)) return k;
  const b = await bacaJson(req, k);
  if (!("teks" in b)) return b;
  return aman(k, async () => {
    try {
      const h = await aturWebhook({ url: b.data.url, event: b.data.event });
      return ok({ url: h.tujuan.url, event: h.tujuan.event, rahasia: h.rahasia }, k);
    } catch (e) {
      if (e instanceof WebhookError) return galat("isian_tidak_sah", e.message, k.id, k.kepala);
      throw e;
    }
  });
}
