import "server-only";
import { tulisTuntas } from "./bridge";
import { matikanGerbang } from "./wa";

/**
 * Mati dengan rapi saat SIGTERM (Docker, tiap deploy) / SIGINT. Next.js sendiri langsung
 * process.exit() kecuali NEXT_MANUAL_SIG_HANDLE diset (deploy/docker-compose.yml); tanpa ini kunci WhatsApp
 * yang masih antre hilang dan WhatsApp mencabut perangkat setelah tersambung lagi.
 * Buffer analitik (analitik.ts) ikut dituntaskan bersamaan dengan tulisan kunci, dalam batas 2 dtk yang sama.
 */
export function pasangPenanganMati(): void {
  if (!process.env.NEXT_MANUAL_SIG_HANDLE) return;
  // Dimuat di depan (bukan saat sinyal datang) dan terpisah: analitik yang gagal dimuat tidak menggagalkan modul ini.
  let tuntasAnalitik = (): Promise<void> => Promise.resolve();
  void import("./analitik")
    .then((m) => {
      tuntasAnalitik = m.tulisTuntasAnalitik;
    })
    .catch(() => {});
  let mati = false;
  const keluar = (sinyal: NodeJS.Signals, kode: number) => {
    if (mati) return;
    mati = true;
    const t0 = Date.now();
    console.info(`[wa] ${sinyal}: menutup koneksi & menuntaskan tulisan`);
    // Analitik tidak pernah menolak dan tidak bisa membuat Promise.all selesai lebih awal: tulisan kunci tetap ditunggu.
    const analitik = () => Promise.resolve().then(tuntasAnalitik).catch(() => {});
    void matikanGerbang()
      .then(() => Promise.race([Promise.all([tulisTuntas(), analitik()]), new Promise((r) => setTimeout(r, 2_000))]))
      .then(() => console.info(`[wa] selesai dalam ${Date.now() - t0} ms, keluar`))
      .catch((e) => console.error("[wa] gagal mematikan dengan rapi:", e))
      .finally(() => process.exit(kode));
  };
  process.on("SIGTERM", () => keluar("SIGTERM", 143));
  process.on("SIGINT", () => keluar("SIGINT", 130));
}
