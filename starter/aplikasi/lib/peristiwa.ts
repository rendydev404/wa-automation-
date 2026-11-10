import "server-only";
import { EventEmitter } from "node:events";
import type { EventWebhook } from "./sdk";

/**
 * Penyimpan event webhook di memori: 200 event terakhir + pemancar untuk Server-Sent Events (app/api/aliran).
 * Cukup untuk satu proses. Aplikasi dengan banyak instance perlu menggantinya dengan Redis pub/sub atau sejenisnya.
 */
const MAKS = 200;

interface Gudang {
  pemancar: EventEmitter;
  buffer: EventWebhook[];
  id: Set<string>;
}
// Disimpan di globalThis supaya route webhook, route aliran, dan halaman memakai gudang yang sama (juga saat hot reload).
const g = globalThis as unknown as { __cgPeristiwa?: Gudang };
function gudang(): Gudang {
  if (!g.__cgPeristiwa) {
    const pemancar = new EventEmitter();
    pemancar.setMaxListeners(0);
    g.__cgPeristiwa = { pemancar, buffer: [], id: new Set() };
  }
  return g.__cgPeristiwa;
}

/** Simpan & siarkan satu event. false = duplikat (mesin mengirim minimal sekali, jadi `id_event` bisa berulang). */
export function catat(event: EventWebhook): boolean {
  const s = gudang();
  if (s.id.has(event.id_event)) return false;
  s.id.add(event.id_event);
  s.buffer.push(event);
  if (s.buffer.length > MAKS) {
    const buang = s.buffer.shift();
    if (buang) s.id.delete(buang.id_event);
  }
  s.pemancar.emit("event", event);
  return true;
}

/** Dengarkan event baru; kembalikan fungsi untuk berhenti. */
export function dengar(fn: (event: EventWebhook) => void): () => void {
  const s = gudang();
  s.pemancar.on("event", fn);
  return () => {
    s.pemancar.off("event", fn);
  };
}

/** Event di buffer yang tiba setelah `idEvent` (untuk menyambung ulang SSE). Id tidak dikenal = kosong. */
export function sesudah(idEvent: string | null): EventWebhook[] {
  if (!idEvent) return [];
  const { buffer } = gudang();
  const i = buffer.findIndex((e) => e.id_event === idEvent);
  return i < 0 ? [] : buffer.slice(i + 1);
}

/** Event terbaru dulu (untuk ditampilkan). */
export function terbaru(batas = 20): EventWebhook[] {
  return gudang().buffer.slice(-batas).reverse();
}
