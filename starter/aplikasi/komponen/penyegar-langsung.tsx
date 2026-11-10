"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useAliran } from "./aliran";

/**
 * Muat ulang data halaman (server component) saat ada event yang cocok. Event beruntun digabung: paling banyak satu
 * muat ulang per 400 ms. `query` mis. "nomor=12&jenis=pesan.masuk,pesan.dibalas_ai".
 */
export function PenyegarLangsung({ query }: { query: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tersambung = useAliran(query, () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => router.refresh(), 400);
  });
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <span className={`langsung ${tersambung ? "hidup" : ""}`} title="Pembaruan langsung lewat webhook + Server-Sent Events">
      {tersambung ? "Langsung" : "Menyambung…"}
    </span>
  );
}
