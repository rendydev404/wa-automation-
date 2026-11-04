"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

export interface ItemOpsi {
  id: string;
  label: string;
  sub?: string;
  lencana?: string;
}

const BATAS_TANPA_CARI = 6;

/**
 * Dropdown pemilih kustom (pengganti <select> bawaan browser):
 * mendukung pencarian otomatis bila pilihan > 6, navigasi penuh keyboard (Panah, Enter, Escape),
 * dan input tersembunyi bila `name` diberikan untuk <form>.
 */
export function PilihOpsi({
  id,
  name,
  nilai,
  onUbah,
  opsi,
  label,
  placeholder = "Pilih opsi…",
}: {
  id?: string;
  name?: string;
  nilai: string;
  onUbah?: (id: string) => void;
  opsi: readonly ItemOpsi[];
  label: string;
  placeholder?: string;
}) {
  const [lokal, setLokal] = useState(nilai);
  const aktif = onUbah ? nilai : lokal;
  const [buka, setBuka] = useState(false);
  const [cari, setCari] = useState("");
  const [sorot, setSorot] = useState(0);
  const akar = useRef<HTMLDivElement>(null);
  const tombol = useRef<HTMLButtonElement>(null);
  const daftar = useRef<HTMLUListElement>(null);
  const kolomCari = useRef<HTMLInputElement>(null);
  const idDaftar = useId();

  const pakaiCari = opsi.length > BATAS_TANPA_CARI;
  const q = cari.trim().toLowerCase();
  const tampil = q
    ? opsi.filter((o) => `${o.label} ${o.id} ${o.sub ?? ""} ${o.lencana ?? ""}`.toLowerCase().includes(q))
    : opsi;
  const terpilih = opsi.find((o) => o.id === aktif);

  useEffect(() => {
    if (!buka) return;
    const luar = (e: MouseEvent) => {
      if (!akar.current?.contains(e.target as Node)) setBuka(false);
    };
    document.addEventListener("mousedown", luar);
    (pakaiCari ? kolomCari.current : daftar.current)?.focus();
    return () => document.removeEventListener("mousedown", luar);
  }, [buka, pakaiCari]);

  useEffect(() => {
    if (buka) daftar.current?.querySelector<HTMLElement>(`[data-i="${sorot}"]`)?.scrollIntoView({ block: "nearest" });
  }, [buka, sorot]);

  const bukaDaftar = () => {
    setCari("");
    setSorot(Math.max(0, opsi.findIndex((o) => o.id === aktif)));
    setBuka(true);
  };
  const tutup = () => {
    setBuka(false);
    tombol.current?.focus();
  };
  const pilih = (o: ItemOpsi) => {
    if (onUbah) onUbah(o.id);
    else setLokal(o.id);
    tutup();
  };
  const tombolDaftar = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setSorot((i) => (tampil.length ? (i + (e.key === "ArrowDown" ? 1 : -1) + tampil.length) % tampil.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (tampil[sorot]) pilih(tampil[sorot]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      tutup();
    } else if (e.key === "Tab") {
      setBuka(false);
    }
  };

  return (
    <div ref={akar} className="relative">
      {name !== undefined && <input type="hidden" name={name} value={aktif} />}
      <button
        ref={tombol}
        id={id}
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={buka}
        aria-controls={idDaftar}
        onClick={() => (buka ? setBuka(false) : bukaDaftar())}
        onKeyDown={(e) => {
          if (!buka && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            bukaDaftar();
          }
        }}
        className={`field flex items-center justify-between gap-3 text-left ${buka ? "border-accent ring-[3px] ring-accent-soft" : ""}`}
      >
        <span className="min-w-0">
          {terpilih ? (
            <>
              <span className="block truncate font-semibold">{terpilih.label}</span>
              {terpilih.sub && <span className="block truncate text-[11.5px] text-faint">{terpilih.sub}</span>}
            </>
          ) : (
            <span className="block truncate text-muted">{placeholder}</span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {terpilih?.lencana && (
            <span className="rounded-md bg-subtle px-2 py-0.5 text-[11px] font-semibold text-muted">
              {terpilih.lencana}
            </span>
          )}
          <ChevronDown className={`size-4 text-muted transition-transform ${buka ? "rotate-180" : ""}`} aria-hidden />
        </span>
      </button>

      {buka && (
        <div className="absolute inset-x-0 top-[calc(100%+6px)] z-50 animate-masuk overflow-hidden rounded-xl border border-line bg-surface shadow-pop">
          {pakaiCari && (
            <div className="relative border-b border-line p-2">
              <Search className="pointer-events-none absolute top-1/2 left-4.5 size-4 -translate-y-1/2 text-faint" aria-hidden />
              <input
                ref={kolomCari}
                type="text"
                value={cari}
                onChange={(e) => {
                  setCari(e.target.value);
                  setSorot(0);
                }}
                onKeyDown={tombolDaftar}
                placeholder="Ketik untuk mencari…"
                aria-label={`Cari ${label}`}
                aria-controls={idDaftar}
                autoComplete="off"
                className="field py-1.5 pl-9"
              />
            </div>
          )}
          <ul
            ref={daftar}
            id={idDaftar}
            role="listbox"
            aria-label={label}
            tabIndex={-1}
            onKeyDown={tombolDaftar}
            className="max-h-[min(18rem,50svh)] overflow-y-auto p-1 outline-none"
          >
            {tampil.map((o, i) => {
              const dipilih = o.id === aktif;
              return (
                <li
                  key={o.id}
                  data-i={i}
                  role="option"
                  aria-selected={dipilih}
                  onMouseEnter={() => setSorot(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pilih(o)}
                  className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 ${i === sorot ? "bg-subtle" : ""}`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Check className={`size-4 shrink-0 text-accent ${dipilih ? "" : "invisible"}`} aria-hidden />
                    <span className="min-w-0">
                      <span className={`block truncate text-[13.5px] ${dipilih ? "font-bold" : "font-semibold"}`}>{o.label}</span>
                      {o.sub && <span className="block truncate text-[11.5px] text-faint">{o.sub}</span>}
                    </span>
                  </span>
                  {o.lencana && (
                    <span className="shrink-0 rounded-md bg-subtle px-2 py-0.5 text-[11px] font-semibold text-muted">
                      {o.lencana}
                    </span>
                  )}
                </li>
              );
            })}
            {!tampil.length && (
              <li className="px-3 py-5 text-center text-[13px] text-muted">Tidak ditemukan pilihan untuk &ldquo;{cari}&rdquo;.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
