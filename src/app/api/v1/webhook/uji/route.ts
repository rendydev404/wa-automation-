import { aman, bukanKonteks, galat, hitungLaju, ok, otorisasi } from "@/lib/mesin/api";
import { WebhookError, kirimUji } from "@/lib/mesin/webhook";

/** POST /api/v1/webhook/uji: kirim satu event "webhook.uji" langsung ke tujuan dan laporkan hasilnya. */
export async function POST(req: Request) {
  const k = await otorisasi(req, "pesan.terima");
  if (bukanKonteks(k)) return k;
  if (!hitungLaju(`uji-wh:${k.awalan}`, 10, 60_000).boleh) return galat("terlalu_sering", "Maks 10 uji webhook per menit.", k.id, k.kepala);
  return aman(k, async () => {
    try {
      const h = await kirimUji();
      return ok({ terkirim: h.ok, status: h.status || undefined, galat: h.galat, ms: h.ms, id_event: h.id_event }, k);
    } catch (e) {
      if (e instanceof WebhookError) return galat("isian_tidak_sah", e.message, k.id, k.kepala);
      throw e;
    }
  });
}
