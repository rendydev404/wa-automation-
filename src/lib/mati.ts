import "server-only";
import { tulisTuntas } from "./bridge";
import { matikanGerbang } from "./wa";

/**
 * Mati dengan rapi saat SIGTERM (Docker, tiap deploy) / SIGINT. Next.js sendiri langsung
 * process.exit() kecuali NEXT_MANUAL_SIG_HANDLE diset (deploy/Dockerfile); tanpa ini kunci WhatsApp
 * yang masih antre hilang dan WhatsApp mencabut perangkat setelah tersambung lagi.
 */
export function pasangPenanganMati(): void {
  if (!process.env.NEXT_MANUAL_SIG_HANDLE) return;
  let mati = false;
  const keluar = (sinyal: NodeJS.Signals, kode: number) => {
    if (mati) return;
    mati = true;
    const t0 = Date.now();
    console.info(`[wa] ${sinyal}: menutup koneksi & menuntaskan tulisan`);
    void matikanGerbang()
      .then(() => Promise.race([tulisTuntas(), new Promise((r) => setTimeout(r, 2_000))]))
      .then(() => console.info(`[wa] selesai dalam ${Date.now() - t0} ms, keluar`))
      .catch((e) => console.error("[wa] gagal mematikan dengan rapi:", e))
      .finally(() => process.exit(kode));
  };
  process.on("SIGTERM", () => keluar("SIGTERM", 143));
  process.on("SIGINT", () => keluar("SIGINT", 130));
}
