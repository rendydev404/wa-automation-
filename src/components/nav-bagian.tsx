"use client";

import { useEffect, useRef, useState } from "react";
import { useBahasa } from "./bahasa";

const BAGIAN = [
  { id: "koneksi", label: { id: "Koneksi", en: "Connection" } },
  { id: "histori", label: { id: "Percakapan", en: "Conversations" } },
  { id: "knowledge", label: { id: "Knowledge", en: "Knowledge" } },
  { id: "katalog", label: { id: "Katalog", en: "Catalog" } },
  { id: "uji", label: { id: "Uji bot", en: "Test bot" } },
  { id: "pengaturan", label: { id: "Pengaturan", en: "Settings" } },
] as const;

/**
 * Pintasan antarbagian halaman nomor, lengket di bawah bilah atas. Bagian yang sedang terbaca
 * disorot lewat IntersectionObserver (tanpa listener scroll).
 */
export function NavBagian() {
  const { b, t } = useBahasa();
  const [aktif, setAktif] = useState<string>(BAGIAN[0].id);
  const wadah = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const terlihat = new Set<string>();
    const io = new IntersectionObserver(
      (entri) => {
        for (const e of entri) {
          if (e.isIntersecting) terlihat.add(e.target.id);
          else terlihat.delete(e.target.id);
        }
        const pertama = BAGIAN.find((b) => terlihat.has(b.id));
        if (pertama) setAktif(pertama.id);
      },
      { rootMargin: "-130px 0px -50% 0px" }
    );
    for (const b of BAGIAN) {
      const el = document.getElementById(b.id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, []);

  // Di HP daftar pintasan bisa digeser: jaga yang aktif tetap terlihat.
  useEffect(() => {
    const w = wadah.current;
    const el = w?.querySelector<HTMLElement>(`[data-id="${aktif}"]`);
    if (w && el && (el.offsetLeft < w.scrollLeft || el.offsetLeft + el.offsetWidth > w.scrollLeft + w.clientWidth)) {
      w.scrollTo({ left: el.offsetLeft - 16, behavior: "smooth" });
    }
  }, [aktif]);

  return (
    <nav
      aria-label={t("Bagian halaman", "Page sections")}
      className="sticky top-14 z-20 -mx-4 border-b border-line bg-canvas/90 px-4 backdrop-blur-md sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-10 lg:px-10"
    >
      <div ref={wadah} className="flex gap-1 overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {BAGIAN.map((g) => (
          <a
            key={g.id}
            href={`#${g.id}`}
            data-id={g.id}
            aria-current={aktif === g.id ? "location" : undefined}
            className={`shrink-0 rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors ${
              aktif === g.id ? "bg-ink text-ink-fg" : "text-muted hover:bg-subtle hover:text-fg"
            }`}
          >
            {g.label[b]}
          </a>
        ))}
      </div>
    </nav>
  );
}
