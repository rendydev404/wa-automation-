"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { type Bahasa, LOKAL } from "@/lib/bahasa";
import { useBahasa } from "./bahasa";

/** Satu pilihan model beserta harganya (dari tarif resmi Anthropic × kurs pasar; null = tidak tercantum di halaman harga). */
export interface OpsiModel {
  id: string;
  nama: string;
  /** Perkiraan biaya satu balasan WhatsApp (Rp). */
  rpBalasan: number | null;
  /** USD per 1 juta token input / output. */
  masuk: number | null;
  keluar: number | null;
}

const BATAS_TANPA_CARI = 5;

const rpBalasan = (n: number, b: Bahasa) => `±Rp${n.toLocaleString(LOKAL[b], { maximumFractionDigits: n < 10 ? 1 : 0 })}`;
const usd = (n: number, b: Bahasa) => `$${n.toLocaleString(LOKAL[b], { minimumFractionDigits: n < 1 ? 2 : 0, maximumFractionDigits: 3 })}`;

/**
 * Pemilih model Claude buatan sendiri (bukan <select> bawaan browser): tiap model tampil dengan biaya per balasan dan
 * tarif resmi per 1 juta token, ada kolom cari bila pilihan lebih dari 5, bisa dipakai penuh dengan keyboard.
 * `name` = ikut terkirim di <form> lewat input tersembunyi. `kosong` = label pilihan tanpa model (nilai "").
 */
export function PilihModel({
  id,
  name,
  nilai,
  onUbah,
  opsi,
  kosong,
  label,
  satuan: satuanProp,
}: {
  id?: string;
  name?: string;
  nilai: string;
  onUbah?: (id: string) => void;
  opsi: OpsiModel[];
  kosong?: string;
  label: string;
  satuan?: string;
}) {
  const { b, t } = useBahasa();
  const satuan = satuanProp ?? t("balasan", "reply");
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

  const semua: OpsiModel[] = [...(kosong !== undefined ? [{ id: "", nama: kosong, rpBalasan: null, masuk: null, keluar: null }] : []), ...opsi];
  const pakaiCari = opsi.length > BATAS_TANPA_CARI;
  const q = cari.trim().toLowerCase();
  const tampil = q ? semua.filter((o) => o.id && `${o.nama} ${o.id}`.toLowerCase().includes(q)) : semua;
  const terpilih = semua.find((o) => o.id === aktif) ?? (aktif ? { id: aktif, nama: aktif, rpBalasan: null, masuk: null, keluar: null } : semua[0]);

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
    setSorot(Math.max(0, semua.findIndex((o) => o.id === aktif)));
    setBuka(true);
  };
  const tutup = () => {
    setBuka(false);
    tombol.current?.focus();
  };
  const pilih = (o: OpsiModel) => {
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
          <span className="block truncate font-semibold">{terpilih?.nama}</span>
          {terpilih?.id && terpilih.id !== terpilih.nama && <span className="block truncate font-mono text-[11px] text-faint">{terpilih.id}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {terpilih?.rpBalasan != null && (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11.5px] font-bold text-accent tabular-nums">
              {rpBalasan(terpilih.rpBalasan, b)}/{satuan}
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
                value={cari}
                onChange={(e) => {
                  setCari(e.target.value);
                  setSorot(0);
                }}
                onKeyDown={tombolDaftar}
                placeholder={t("Cari model…", "Search models…")}
                aria-label={t("Cari model", "Search models")}
                aria-controls={idDaftar}
                autoComplete="off"
                className="field py-1.5 pl-9"
              />
            </div>
          )}
          <ul ref={daftar} id={idDaftar} role="listbox" aria-label={label} tabIndex={-1} onKeyDown={tombolDaftar} className="max-h-[min(20rem,50svh)] overflow-y-auto p-1 outline-none">
            {tampil.map((o, i) => {
              const dipilih = o.id === aktif;
              return (
                <li
                  key={o.id || "kosong"}
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
                      <span className={`block truncate text-[13.5px] ${dipilih ? "font-bold" : "font-semibold"}`}>{o.nama}</span>
                      {o.id && <span className="block truncate font-mono text-[11px] text-faint">{o.id}</span>}
                    </span>
                  </span>
                  {o.id && (
                    <span className="shrink-0 text-right tabular-nums">
                      {o.rpBalasan != null ? (
                        <>
                          <span className="block text-[12.5px] font-bold">
                            {rpBalasan(o.rpBalasan, b)}/{satuan}
                          </span>
                          {o.masuk != null && o.keluar != null && (
                            <span className="block text-[11px] text-faint">
                              {usd(o.masuk, b)} / {usd(o.keluar, b)} {t("per 1 jt token", "per 1M tokens")}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="block text-[11.5px] text-faint">{t("harga belum tercantum", "price not listed yet")}</span>
                      )}
                    </span>
                  )}
                </li>
              );
            })}
            {!tampil.length && <li className="px-3 py-6 text-center text-[13px] text-muted">{t(`Tidak ada model yang cocok dengan “${cari}”.`, `No models match “${cari}”.`)}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
