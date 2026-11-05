"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "@/components/link";
import { X } from "lucide-react";
import { useBahasa } from "./bahasa";

/**
 * Bilah menu bawah ala aplikasi HP (di bawah lg). Menggantikan laci sidebar: menu utama selalu terjangkau jempol,
 * sisanya dibuka lewat lembar (bottom sheet) dari tab "Akun"/"Lainnya".
 */
export function BilahBawah({ label, children }: { label: string; children: ReactNode }) {
  return (
    <nav
      aria-label={label}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-line bg-ink/95 pb-[env(safe-area-inset-bottom)] text-ink-fg backdrop-blur lg:hidden"
    >
      <ul className="mx-auto flex h-16 max-w-xl items-stretch px-1">{children}</ul>
    </nav>
  );
}

function kelasTab(aktif: boolean): string {
  return `relative flex h-full w-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors ${
    aktif ? "text-ink-signal" : "text-ink-muted active:text-ink-fg"
  }`;
}

function IsiTab({ ikon, label, aktif, lencana }: { ikon: ReactNode; label: string; aktif: boolean; lencana?: ReactNode }) {
  return (
    <>
      {aktif && <span aria-hidden className="absolute top-0 h-[3px] w-8 rounded-b-full bg-ink-signal" />}
      <span className={`relative grid h-7 w-12 place-items-center rounded-full transition-colors ${aktif ? "bg-ink-signal/15" : ""}`}>
        {ikon}
        {lencana}
      </span>
      <span className="max-w-full truncate px-0.5">{label}</span>
    </>
  );
}

export function TabBawah({ href, label, ikon, aktif, tur }: { href: string; label: string; ikon: ReactNode; aktif: boolean; tur?: string }) {
  return (
    <li className="min-w-0 flex-1">
      <Link href={href} aria-current={aktif ? "page" : undefined} data-tur={tur} className={kelasTab(aktif)}>
        <IsiTab ikon={ikon} label={label} aktif={aktif} />
      </Link>
    </li>
  );
}

/** Tab yang membuka lembar dari bawah (mis. daftar nomor, menu akun). */
export function TabLembar({
  label,
  judul,
  ikon,
  aktif,
  tur,
  lencana,
  children,
}: {
  label: string;
  judul: string;
  ikon: ReactNode;
  aktif: boolean;
  tur?: string;
  lencana?: ReactNode;
  children: ReactNode;
}) {
  const [buka, setBuka] = useState(false);
  const tutup = useCallback(() => setBuka(false), []);
  return (
    <li className="min-w-0 flex-1">
      <button type="button" aria-haspopup="dialog" aria-expanded={buka} onClick={() => setBuka(true)} data-tur={tur} className={kelasTab(aktif || buka)}>
        <IsiTab ikon={ikon} label={label} aktif={aktif || buka} lencana={lencana} />
      </button>
      {buka && (
        <Lembar judul={judul} tutup={tutup}>
          {children}
        </Lembar>
      )}
    </li>
  );
}

function Lembar({ judul, tutup, children }: { judul: string; tutup: () => void; children: ReactNode }) {
  const { t } = useBahasa();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panel.current?.focus();
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
  }, [tutup]);

  // Portal ke body: `backdrop-blur` pada bilah membuat elemen fixed di dalamnya ikut terkurung di bilah.
  return createPortal(
    <div className="fixed inset-0 z-50 lg:hidden">
      <div aria-hidden onClick={tutup} className="absolute inset-0 animate-masuk bg-black/50 backdrop-blur-[2px]" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={judul}
        tabIndex={-1}
        // Pilih tautan / tombol bertanda di lembar = langsung tutup lembarnya.
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a, [data-tutup-laci]")) tutup();
        }}
        className="absolute inset-x-0 bottom-0 flex max-h-[85svh] animate-naik flex-col rounded-t-3xl border-t border-ink-line bg-ink text-ink-fg shadow-pop outline-none"
      >
        <div aria-hidden className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-white/15" />
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-2 pb-1">
          <p className="text-[15px] font-bold text-white">{judul}</p>
          <button
            type="button"
            aria-label={t("Tutup", "Close")}
            onClick={tutup}
            className="-mr-2 grid size-10 place-items-center rounded-xl text-ink-muted transition-colors hover:bg-ink-raised hover:text-ink-fg"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] [scrollbar-color:var(--c-ink-raised)_transparent]">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
