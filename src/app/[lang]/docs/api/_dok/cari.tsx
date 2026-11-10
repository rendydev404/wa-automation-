"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, FileText, Search, TriangleAlert, Webhook, Zap } from "lucide-react";
import { useBahasa, useRouterBahasa } from "@/components/bahasa";
import { ENDPOINT_DOK, EVENT_DOK } from "@/lib/api-dok";
import { DAFTAR_GALAT, HALAMAN_DOK, idEndpoint, jalurHalaman } from "./data";

type Hasil = { jenis: "halaman" | "endpoint" | "event" | "galat"; judul: string; sub: string; href: string; cari: string };

/** Pencarian cepat docs (Ctrl/⌘ + K): halaman, endpoint, event webhook, kode galat. Semua di peramban, tanpa server. */
export function CariDok() {
  const { b, t } = useBahasa();
  const router = useRouterBahasa();
  const [buka, setBuka] = useState(false);
  const [q, setQ] = useState("");
  const [pilih, setPilih] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const semua = useMemo<Hasil[]>(
    () => [
      ...HALAMAN_DOK.map((h) => ({ jenis: "halaman" as const, judul: h.judul[b], sub: h.ringkas[b], href: jalurHalaman(h.slug), cari: `${h.judul.id} ${h.judul.en} ${h.ringkas[b]}` })),
      ...ENDPOINT_DOK.map((e) => ({ jenis: "endpoint" as const, judul: `${e.metode} ${e.jalur}`, sub: e.ringkas[b], href: `/docs/api/referensi#${idEndpoint(e)}`, cari: `${e.metode} ${e.jalur} ${e.ringkas.id} ${e.ringkas.en} ${e.fitur ?? ""}` })),
      ...EVENT_DOK.map((e) => ({ jenis: "event" as const, judul: e.jenis, sub: e.ket[b], href: `/docs/api/webhook#event-${e.jenis.replace(/\./g, "-")}`, cari: `${e.jenis} ${e.ket.id} ${e.ket.en} webhook` })),
      ...DAFTAR_GALAT.map((g) => ({ jenis: "galat" as const, judul: `${g.status} ${g.kode}`, sub: g.arti[b], href: `/docs/api/galat#${g.kode}`, cari: `${g.kode} ${g.status} ${g.arti.id} ${g.arti.en}` })),
    ],
    [b],
  );
  const hasil = useMemo(() => {
    const kata = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!kata.length) return semua.filter((x) => x.jenis === "halaman");
    return semua.filter((x) => kata.every((k) => x.cari.toLowerCase().includes(k))).slice(0, 12);
  }, [q, semua]);

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setBuka((x) => !x);
      } else if (e.key === "/" && !buka && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setBuka(true);
      }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [buka]);
  useEffect(() => {
    if (buka) {
      setQ("");
      setPilih(0);
      setTimeout(() => input.current?.focus(), 10);
    }
  }, [buka]);

  const pergi = (h: Hasil) => {
    setBuka(false);
    router.push(h.href);
  };
  const IKON = { halaman: FileText, endpoint: Zap, event: Webhook, galat: TriangleAlert };

  return (
    <>
      <button
        type="button"
        onClick={() => setBuka(true)}
        className="flex h-9 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 text-[13px] text-ink-muted transition-colors hover:bg-white/10 hover:text-white sm:w-64"
        aria-label={t("Cari dokumentasi", "Search docs")}
      >
        <Search className="size-4" aria-hidden />
        <span className="hidden min-w-0 flex-1 truncate text-left whitespace-nowrap sm:block">{t("Cari endpoint, event, galat…", "Search endpoints, events, errors…")}</span>
        <kbd className="hidden shrink-0 rounded border border-white/20 px-1.5 text-[10.5px] font-semibold whitespace-nowrap sm:block">Ctrl K</kbd>
      </button>
      {buka && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center px-3 pt-[12vh]" role="dialog" aria-modal="true" aria-label={t("Cari dokumentasi", "Search docs")}>
          <button type="button" aria-label={t("Tutup", "Close")} className="absolute inset-0 bg-ink/60" onClick={() => setBuka(false)} />
          <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-canvas text-fg shadow-2xl">
            <div className="flex items-center gap-2 border-b border-line px-4">
              <Search className="size-4 text-muted" aria-hidden />
              <input
                ref={input}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPilih(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setBuka(false);
                  else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setPilih((p) => Math.min(p + 1, hasil.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setPilih((p) => Math.max(p - 1, 0));
                  } else if (e.key === "Enter" && hasil[pilih]) pergi(hasil[pilih]);
                }}
                placeholder={t("Ketik: kirim pesan, webhook, 403, qr…", "Type: send message, webhook, 403, qr…")}
                className="h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none"
              />
              <kbd className="rounded border border-line px-1.5 text-[10.5px] text-muted">Esc</kbd>
            </div>
            <ul className="max-h-[50vh] overflow-y-auto p-2">
              {hasil.length ? (
                hasil.map((h, i) => {
                  const Ikon = IKON[h.jenis];
                  return (
                    <li key={h.href + h.judul}>
                      <button
                        type="button"
                        onMouseEnter={() => setPilih(i)}
                        onClick={() => pergi(h)}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${i === pilih ? "bg-accent-soft" : ""}`}
                      >
                        <Ikon className={`size-4 shrink-0 ${i === pilih ? "text-accent" : "text-faint"}`} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-[13.5px] font-semibold ${h.jenis === "endpoint" || h.jenis === "event" || h.jenis === "galat" ? "font-mono text-[12.5px]" : ""}`}>{h.judul}</span>
                          <span className="block truncate text-[12px] text-muted">{h.sub}</span>
                        </span>
                        {i === pilih && <ArrowRight className="size-4 shrink-0 text-accent" aria-hidden />}
                      </button>
                    </li>
                  );
                })
              ) : (
                <li className="px-3 py-8 text-center text-[13px] text-muted">{t("Tidak ada hasil. Coba kata lain.", "No results. Try another word.")}</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
