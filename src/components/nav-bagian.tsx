"use client";

import { useEffect, useRef, useState } from "react";

const BAGIAN = [
  { id: "koneksi", label: "Koneksi" },
  { id: "histori", label: "Percakapan" },
  { id: "knowledge", label: "Knowledge" },
  { id: "katalog", label: "Katalog" },
  { id: "uji", label: "Uji bot" },
  { id: "pengaturan", label: "Pengaturan" },
] as const;

/**
 * Pintasan antarbagian halaman nomor, lengket di bawah bilah atas. Bagian yang sedang terbaca
 * disorot lewat IntersectionObserver (tanpa listener scroll).
 */
export function NavBagian() {
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
      aria-label="Bagian halaman"
      className="sticky top-14 z-20 -mx-4 border-b border-line bg-canvas/90 px-4 backdrop-blur-md sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-10 lg:px-10"
    >
      <div ref={wadah} className="flex gap-1 overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {BAGIAN.map((b) => (
          <a
            key={b.id}
            href={`#${b.id}`}
            data-id={b.id}
            aria-current={aktif === b.id ? "location" : undefined}
            className={`shrink-0 rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors ${
              aktif === b.id ? "bg-ink text-ink-fg" : "text-muted hover:bg-subtle hover:text-fg"
            }`}
          >
            {b.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
