"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";

/**
 * Kotak cari yang langsung menyaring saat mengetik (tanpa Enter): URL diganti (router.replace, tanpa menambah riwayat)
 * 250 ms setelah ketikan terakhir, jadi hasil tetap dirender server dan bisa dibagikan/di-refresh.
 * `dasar` = parameter lain yang dipertahankan (tab, saringan), sebagai query string.
 */
export function CariLangsung({ awal, dasar, placeholder, label }: { awal: string; dasar: string; placeholder: string; label: string }) {
  const router = useRouter();
  const [nilai, setNilai] = useState(awal);
  const [tunda, mulai] = useTransition();
  const terakhir = useRef(awal.trim());

  useEffect(() => {
    const kata = nilai.trim();
    if (kata === terakhir.current) return;
    const t = setTimeout(() => {
      terakhir.current = kata;
      const q = new URLSearchParams(dasar);
      if (kata) q.set("q", kata);
      const s = q.toString();
      mulai(() => router.replace(s ? `/admin/developer-api?${s}` : "/admin/developer-api", { scroll: false }));
    }, 250);
    return () => clearTimeout(t);
  }, [nilai, dasar, router]);

  return (
    <div className="relative w-full sm:w-72">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" aria-hidden />
      <input
        type="search"
        value={nilai}
        onChange={(e) => setNilai(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        autoComplete="off"
        className="field h-10 min-h-0 py-2 pr-9 pl-9 text-[13.5px]"
      />
      {tunda && <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-faint" aria-hidden />}
    </div>
  );
}
