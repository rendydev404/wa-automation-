import { dengar, sesudah } from "../../../lib/peristiwa";
import type { EventWebhook } from "../../../lib/sdk";

/**
 * GET /api/aliran?nomor=<id>&jenis=a,b: Server-Sent Events. Meneruskan event webhook ke browser saat itu juga, jadi
 * QR, status nomor, dan pesan baru tampil tanpa polling. Yang dikirim hanya isi event (tanpa API key atau rahasia).
 *  - `nomor`: hanya event nomor itu (event tanpa nomor, mis. webhook.uji, tetap lewat);
 *  - `jenis`: hanya jenis event ini (dipisah koma); kosong = semua.
 * Saat sambungan putus, browser menyambung ulang sendiri dan mengirim Last-Event-ID: event yang terlewat dikirim lagi.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const nomor = url.searchParams.get("nomor");
  const jenis = new Set((url.searchParams.get("jenis") ?? "").split(",").filter(Boolean));
  const cocok = (e: EventWebhook) => (!nomor || e.nomor_id === null || e.nomor_id === nomor) && (!jenis.size || jenis.has(e.jenis));

  const pengode = new TextEncoder();
  let tutup = () => {};

  const aliran = new ReadableStream<Uint8Array>({
    start(pengendali) {
      let selesai = false;
      const kirim = (teks: string) => {
        if (selesai) return;
        try {
          pengendali.enqueue(pengode.encode(teks));
        } catch {
          tutup();
        }
      };
      const tulis = (e: EventWebhook) => kirim(`id: ${e.id_event}\ndata: ${JSON.stringify(e)}\n\n`);

      kirim("retry: 3000\n\n");
      for (const e of sesudah(req.headers.get("last-event-id"))) if (cocok(e)) tulis(e);
      const lepas = dengar((e) => {
        if (cocok(e)) tulis(e);
      });
      // Detak tiap 25 detik supaya proxy tidak memutus sambungan yang sepi.
      const detak = setInterval(() => kirim(": detak\n\n"), 25_000);

      tutup = () => {
        if (selesai) return;
        selesai = true;
        clearInterval(detak);
        lepas();
        try {
          pengendali.close();
        } catch {}
      };
      req.signal.addEventListener("abort", tutup, { once: true });
    },
    cancel() {
      tutup();
    },
  });

  return new Response(aliran, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      // Nginx dan proxy sejenis menahan jawaban secara bawaan: matikan untuk aliran ini.
      "X-Accel-Buffering": "no",
    },
  });
}
