"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { useBahasa } from "@/components/bahasa";
import { IkonWhatsApp } from "@/components/ikon-whatsapp";

/**
 * Bagian interaktif halaman /panduan: tombol bagikan (share sheet HP, cadangan salin link + WhatsApp) dan bilah
 * kategori lengket yang menandai kategori yang sedang dibaca.
 */

export function TombolBagikan({ url, judul, teks, gelap = false }: { url: string; judul: string; teks: string; gelap?: boolean }) {
  const { t } = useBahasa();
  const [tersalin, setTersalin] = useState(false);
  const waktu = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(waktu.current), []);

  async function salin() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard API ditolak (mis. bukan HTTPS): pakai cara lama.
      const el = document.createElement("textarea");
      el.value = url;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      el.remove();
    }
    setTersalin(true);
    clearTimeout(waktu.current);
    waktu.current = setTimeout(() => setTersalin(false), 2200);
  }

  async function bagikan() {
    if (typeof navigator.share === "function" && matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ title: judul, text: teks, url });
        return;
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
      }
    }
    await salin();
  }

  const urlWa = `https://wa.me/?text=${encodeURIComponent(`${teks}\n${url}`)}`;
  const kelasUtama = gelap
    ? "border-ink-line text-ink-fg hover:bg-white/[0.06]"
    : "border-line bg-surface text-fg hover:bg-subtle";
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={bagikan}
        data-analitik="Bagikan panduan"
        className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-[14px] font-semibold transition-colors ${kelasUtama}`}
      >
        {tersalin ? <Check className="size-4 text-ink-signal" aria-hidden /> : <Share2 className="size-4" aria-hidden />}
        {tersalin ? t("Link tersalin", "Link copied") : t("Bagikan panduan", "Share this guide")}
      </button>
      <a
        href={urlWa}
        target="_blank"
        rel="noopener noreferrer"
        data-analitik="Kirim panduan lewat WhatsApp"
        className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-[14px] font-semibold transition-colors ${kelasUtama}`}
      >
        <IkonWhatsApp className="size-4" /> {t("Kirim ke WhatsApp", "Send via WhatsApp")}
      </a>
      <button
        type="button"
        onClick={salin}
        aria-label={t("Salin link panduan", "Copy guide link")}
        title={t("Salin link", "Copy link")}
        className={`grid size-[50px] place-items-center rounded-2xl border transition-colors ${kelasUtama}`}
      >
        <Copy className="size-4" aria-hidden />
      </button>
      <span role="status" className="sr-only">
        {tersalin ? t("Link panduan tersalin", "Guide link copied") : ""}
      </span>
    </div>
  );
}

export function BilahKategori({ kategori }: { kategori: { id: string; label: string }[] }) {
  const { t } = useBahasa();
  const [aktif, setAktif] = useState(kategori[0]?.id ?? "");
  const daftar = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const bagian = kategori.map((k) => document.getElementById(k.id)).filter((x): x is HTMLElement => !!x);
    // Kategori aktif = bagian terakhir yang kepalanya sudah melewati 40% tinggi layar (dihitung sekali per frame).
    let bingkai = 0;
    const hitung = () => {
      bingkai = 0;
      const batas = innerHeight * 0.4;
      let id = bagian[0]?.id ?? "";
      for (const el of bagian) if (el.getBoundingClientRect().top <= batas) id = el.id;
      setAktif(id);
    };
    const gulir = () => {
      if (!bingkai) bingkai = requestAnimationFrame(hitung);
    };
    hitung();
    addEventListener("scroll", gulir, { passive: true });
    addEventListener("resize", gulir, { passive: true });
    return () => {
      cancelAnimationFrame(bingkai);
      removeEventListener("scroll", gulir);
      removeEventListener("resize", gulir);
    };
  }, [kategori]);

  // Chip aktif selalu terlihat di bilah yang bisa digeser (HP).
  useEffect(() => {
    const ul = daftar.current;
    const el = ul?.querySelector<HTMLElement>(`[data-id="${aktif}"]`);
    if (ul && el) ul.scrollTo({ left: el.offsetLeft - ul.clientWidth / 2 + el.clientWidth / 2, behavior: "smooth" });
  }, [aktif]);

  return (
    <nav aria-label={t("Kategori panduan", "Guide sections")} className="sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur">
      <ul ref={daftar} className="mx-auto flex max-w-[1100px] gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none] sm:px-6 [&::-webkit-scrollbar]:hidden">
        {kategori.map((k, i) => {
          const ya = k.id === aktif;
          return (
            <li key={k.id} className="shrink-0">
              <a
                href={`#${k.id}`}
                data-id={k.id}
                aria-current={ya ? "true" : undefined}
                className={`inline-flex items-center gap-2 rounded-full border py-1.5 pr-3.5 pl-1.5 text-[13px] font-semibold whitespace-nowrap transition-colors ${
                  ya ? "border-accent bg-accent text-on-accent" : "border-line bg-surface text-muted hover:text-fg"
                }`}
              >
                <span className={`grid size-6 place-items-center rounded-full text-[12px] font-bold tabular-nums ${ya ? "bg-white/20" : "bg-subtle text-fg"}`}>{i + 1}</span>
                {k.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
