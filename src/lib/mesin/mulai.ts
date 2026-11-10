import "server-only";
import { bersihkanAntrean, mulaiAntreanMesin } from "./antrean";
import { bersihkanIdempoten } from "./api";
import { mulaiLisensiMesin } from "./lisensi";
import { cetakSpanduk } from "./spanduk";
import { bersihkanWebhook, mulaiWebhookMesin } from "./webhook";

const g = globalThis as unknown as { __waMesinMulai?: boolean };

/**
 * Pekerja mesin self-host, dinyalakan sekali dari instrumentation.ts (MODE=mesin):
 *   - lisensi: muat yang tersimpan, lalu SEKALI menghubungi pusat (aktivasi/kondisi) sampai berhasil;
 *   - webhook ke aplikasi developer (outbox) & antrean pesan keluar API (anti-blokir);
 *   - pembersihan berkala tiap 6 jam (antrean webhook selesai > 7 hari, pesan_keluar > 30 hari, idempotensi kedaluwarsa).
 */
export function mulaiMesin(): void {
  if (g.__waMesinMulai) return;
  g.__waMesinMulai = true;
  cetakSpanduk();
  mulaiLisensiMesin();
  mulaiWebhookMesin();
  mulaiAntreanMesin();
  const bersih = async () => {
    try {
      await Promise.all([bersihkanWebhook(), bersihkanAntrean(), bersihkanIdempoten()]);
    } catch (e) {
      console.warn("[mesin] pembersihan gagal:", e instanceof Error ? e.message : e);
    }
  };
  setTimeout(() => void bersih(), 60_000).unref?.();
  setInterval(() => void bersih(), 6 * 3600_000).unref?.();
}
