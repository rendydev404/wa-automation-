/**
 * libsignal (dipakai Baileys) mencetak objek sesi Signal utuh lewat console, mis.
 * `console.info("Closing session:", session)`, termasuk kunci privat ratchet dan root key. Log
 * container tersimpan di disk, jadi objek seperti itu diganti penanda sebelum dicetak; teks
 * pesannya tetap muncul. Dipasang sekali saat server mulai (instrumentation.ts).
 */

const PENANDA = "[sesi Signal disembunyikan]";
const METODE = ["log", "info", "warn", "error", "debug"] as const;

const g = globalThis as unknown as { __logAman?: boolean };

/** Objek sesi Signal (SessionEntry libsignal): punya rantai pesan atau ratchet. */
function sesiSignal(v: unknown): boolean {
  return typeof v === "object" && v !== null && ("_chains" in v || "currentRatchet" in v);
}

export function pasangLogAman(): void {
  if (g.__logAman) return;
  g.__logAman = true;
  for (const m of METODE) {
    const asli = console[m].bind(console);
    console[m] = (...args: unknown[]) => asli(...(args.some(sesiSignal) ? args.map((a) => (sesiSignal(a) ? PENANDA : a)) : args));
  }
}
