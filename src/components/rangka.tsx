"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { Menu, MessageCircle, X } from "lucide-react";

function Merek() {
  return (
    <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5 rounded-lg">
      <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-ink-signal text-ink">
        <MessageCircle className="size-[18px]" strokeWidth={2.4} aria-hidden />
      </span>
      <span className="truncate text-[15px] font-bold tracking-tight">Asisten WhatsApp</span>
    </Link>
  );
}

/**
 * Rangka aplikasi. Desktop (lg+): sidebar gelap tetap di kiri. HP/tablet: bilah atas gelap dan
 * sidebar yang sama menjadi laci geser — satu elemen untuk keduanya, tanpa render ganda.
 */
export function Rangka({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  const [buka, setBuka] = useState(false);
  const tombolTutup = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!buka) return;
    tombolTutup.current?.focus();
    const tutup = () => setBuka(false);
    const saatTombol = (e: KeyboardEvent) => e.key === "Escape" && tutup();
    const lebar = window.matchMedia("(min-width: 1024px)");
    const gulirLama = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", saatTombol);
    lebar.addEventListener("change", tutup);
    return () => {
      document.body.style.overflow = gulirLama;
      document.removeEventListener("keydown", saatTombol);
      lebar.removeEventListener("change", tutup);
    };
  }, [buka]);

  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-ink-line bg-ink/95 px-4 text-ink-fg backdrop-blur sm:px-6 lg:hidden">
        <Merek />
        <button
          type="button"
          aria-label="Buka menu"
          aria-expanded={buka}
          aria-controls="navigasi"
          onClick={() => setBuka(true)}
          className="-mr-2 grid size-10 place-items-center rounded-xl text-ink-fg transition-colors hover:bg-ink-raised"
        >
          <Menu className="size-5" aria-hidden />
        </button>
      </header>

      <div
        aria-hidden
        onClick={() => setBuka(false)}
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] transition-opacity duration-200 lg:hidden ${buka ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />

      <aside
        id="navigasi"
        aria-label="Navigasi"
        // Pilih tautan di laci (HP) = langsung tutup lacinya.
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a, [data-tutup-laci]")) setBuka(false);
        }}
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(300px,86vw)] flex-col bg-ink text-ink-fg shadow-pop transition-[translate,visibility] duration-200 ease-out lg:visible lg:sticky lg:top-0 lg:z-auto lg:h-svh lg:w-auto lg:translate-x-0 lg:shadow-none ${
          buka ? "visible translate-x-0" : "invisible -translate-x-full"
        }`}
      >
        <div className="relative flex h-16 shrink-0 items-center justify-between gap-2 px-5">
          <div aria-hidden className="kisi-tinta pointer-events-none absolute inset-0 opacity-60" />
          <div className="relative min-w-0">
            <Merek />
          </div>
          <button
            ref={tombolTutup}
            type="button"
            aria-label="Tutup menu"
            onClick={() => setBuka(false)}
            className="relative -mr-2 grid size-10 place-items-center rounded-xl text-ink-muted transition-colors hover:bg-ink-raised hover:text-ink-fg lg:hidden"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        {sidebar}
      </aside>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
