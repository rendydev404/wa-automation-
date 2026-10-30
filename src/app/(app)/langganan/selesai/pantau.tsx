"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

const MAKS_CEK = 36; // tiap 5 dtk, ±3 menit; setelah itu berhenti supaya tidak memanggil Midtrans tanpa akhir

/** Selama pembayaran belum diterima: muat ulang halaman tiap 5 dtk (server mengecek status langsung ke Midtrans). */
export function PantauBayar() {
  const router = useRouter();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (n >= MAKS_CEK) return;
    const t = setTimeout(() => {
      router.refresh();
      setN((x) => x + 1);
    }, 5000);
    return () => clearTimeout(t);
  }, [n, router]);
  return n < MAKS_CEK ? (
    <p role="status" className="flex items-center justify-center gap-2 text-[12.5px] text-muted">
      <Loader2 className="size-3.5 animate-spin" aria-hidden /> Memeriksa pembayaran otomatis…
    </p>
  ) : (
    <p className="text-center text-[12.5px] text-muted">Pemeriksaan otomatis berhenti. Muat ulang halaman ini untuk memeriksa lagi.</p>
  );
}
