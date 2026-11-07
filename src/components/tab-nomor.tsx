"use client";

import { useEffect, useRef, useState } from "react";
import { useBahasa } from "./bahasa";

export interface TabNomorDef {
  id: string;
  label: { id: string; en: string };
  ikon: React.ReactNode;
  /** Angka kecil di samping label (mis. jumlah dokumen); null = tidak tampil. */
  hitung?: number | null;
  /** Nilai data-tur bagian di dalam tab ini: tur panduan membuka tab ini saat menyorotnya. */
  tur?: string[];
  isi: React.ReactNode;
}

/** Tautan lama ke bagian halaman (#histori, #uji) tetap mendarat di tab yang benar. */
const ALIAS: Record<string, string> = { histori: "percakapan", uji: "uji-bot" };

/** Buka tab dari komponen lain di halaman ini (mis. kartu "Langkah memulai"). */
export function bukaTabNomor(id: string) {
  window.dispatchEvent(new CustomEvent("nomor:tab", { detail: id }));
}

/**
 * Tab halaman nomor: satu bagian tampil per layar. Semua isi tab sudah dirender server dan tetap terpasang saat
 * berpindah (hanya disembunyikan), jadi pindah tab instan, tanpa permintaan baru, dan isian form tidak hilang.
 * Tab aktif disimpan di hash URL (#knowledge) supaya bisa dibagikan dan bertahan saat dimuat ulang.
 */
export function TabNomor({ tab }: { tab: TabNomorDef[] }) {
  const { b, t } = useBahasa();
  const [aktif, setAktif] = useState(tab[0].id);
  const nav = useRef<HTMLDivElement>(null);
  const daftar = useRef(tab.map((x) => ({ id: x.id, tur: x.tur ?? [] })));

  useEffect(() => {
    const sah = (id: string) => daftar.current.some((x) => x.id === id);
    const dariHash = () => {
      const h = decodeURIComponent(location.hash.slice(1));
      const id = ALIAS[h] ?? h;
      if (sah(id)) setAktif(id);
    };
    const buka = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (!sah(id)) return;
      setAktif(id);
      history.replaceState(null, "", `#${id}`);
      nav.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    };
    const tur = (e: Event) => {
      const s = (e as CustomEvent<string>).detail;
      const x = daftar.current.find((d) => d.tur.includes(s));
      if (x) setAktif(x.id);
    };
    dariHash();
    window.addEventListener("hashchange", dariHash);
    window.addEventListener("nomor:tab", buka);
    window.addEventListener("tur:sasaran", tur);
    return () => {
      window.removeEventListener("hashchange", dariHash);
      window.removeEventListener("nomor:tab", buka);
      window.removeEventListener("tur:sasaran", tur);
    };
  }, []);

  // Di HP daftar tab bisa digeser: jaga yang aktif tetap terlihat.
  useEffect(() => {
    const w = nav.current?.querySelector<HTMLElement>("[data-geser]");
    const el = w?.querySelector<HTMLElement>(`[data-id="${aktif}"]`);
    if (w && el && (el.offsetLeft < w.scrollLeft || el.offsetLeft + el.offsetWidth > w.scrollLeft + w.clientWidth)) {
      w.scrollTo({ left: el.offsetLeft - 16, behavior: "smooth" });
    }
  }, [aktif]);

  const pilih = (id: string) => {
    setAktif(id);
    history.replaceState(null, "", `#${id}`);
    const n = nav.current;
    // Tab bar menempel di atas; bila halaman sudah tergulir melewatinya, kembali ke awal isi tab.
    if (n && n.getBoundingClientRect().top < 0) n.scrollIntoView({ block: "start" });
  };

  return (
    <div>
      <div
        ref={nav}
        className="sticky top-14 z-20 -mx-4 scroll-mt-14 border-b border-line bg-canvas/90 px-4 backdrop-blur-md sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-10 lg:scroll-mt-0 lg:px-10"
      >
        <div role="tablist" aria-label={t("Bagian nomor", "Number sections")} data-geser className="flex gap-1 overflow-x-auto py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tab.map((x) => {
            const ya = aktif === x.id;
            return (
              <button
                key={x.id}
                type="button"
                role="tab"
                id={`tab-${x.id}`}
                data-id={x.id}
                data-tur-tab={x.tur?.join(" ") || undefined}
                data-analitik={`Tab ${x.label.id}`}
                aria-selected={ya}
                aria-controls={`panel-${x.id}`}
                tabIndex={ya ? 0 : -1}
                onClick={() => pilih(x.id)}
                onKeyDown={(e) => {
                  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                  e.preventDefault();
                  const i = tab.findIndex((y) => y.id === aktif);
                  const j = (i + (e.key === "ArrowRight" ? 1 : tab.length - 1)) % tab.length;
                  pilih(tab[j].id);
                  document.getElementById(`tab-${tab[j].id}`)?.focus();
                }}
                className={`relative inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                  ya ? "bg-ink text-ink-fg shadow-card" : "text-muted hover:bg-subtle hover:text-fg"
                }`}
              >
                <span className={`inline-flex [&_svg]:size-4 ${ya ? "text-ink-signal" : "text-faint"}`}>{x.ikon}</span>
                {x.label[b]}
                {x.hitung != null && x.hitung > 0 && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[10.5px] leading-none font-bold tabular-nums ${ya ? "bg-white/15 text-ink-fg" : "bg-subtle text-muted"}`}>{x.hitung}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      {tab.map((x) => (
        <div key={x.id} role="tabpanel" id={`panel-${x.id}`} aria-labelledby={`tab-${x.id}`} hidden={aktif !== x.id} className="pt-6">
          {x.isi}
        </div>
      ))}
    </div>
  );
}
