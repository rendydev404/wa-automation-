"use client";

import { useEffect, useRef, useState } from "react";
import type { EventWebhook } from "../lib/sdk";

/**
 * Dengarkan event webhook secara langsung lewat Server-Sent Events (/api/aliran). `query` mis. "nomor=12&jenis=nomor.qr".
 * Mengembalikan true selama sambungan terbuka. Browser menyambung ulang sendiri bila terputus.
 */
export function useAliran(query: string, saatEvent: (event: EventWebhook) => void): boolean {
  const [tersambung, setTersambung] = useState(false);
  const penangan = useRef(saatEvent);
  useEffect(() => {
    penangan.current = saatEvent;
  });

  useEffect(() => {
    const sumber = new EventSource(`/api/aliran?${query}`);
    sumber.onopen = () => setTersambung(true);
    sumber.onerror = () => setTersambung(false);
    sumber.onmessage = (m) => {
      try {
        penangan.current(JSON.parse(m.data) as EventWebhook);
      } catch {
        // baris yang bukan event diabaikan
      }
    };
    return () => sumber.close();
  }, [query]);

  return tersambung;
}
