"use client";

import { type ReactNode, useEffect, useRef } from "react";

/** Kotak pesan yang selalu menggulir ke pesan terbaru saat `kunci` (id pesan terakhir) berubah. */
export function GulirBawah({ kunci, children, kelas }: { kunci: string; children: ReactNode; kelas?: string }) {
  const kotak = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = kotak.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [kunci]);
  return (
    <div ref={kotak} className={kelas}>
      {children}
    </div>
  );
}
