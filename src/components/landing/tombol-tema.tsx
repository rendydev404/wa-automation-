"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { useBahasa } from "@/components/bahasa";

/**
 * Tema landing page: gelap (bawaan, kelas .tema-gelap di pembungkus dari server) atau terang (pilihan pengunjung,
 * localStorage "tema-landing"). SKRIP_TEMA disisipkan sebagai anak pertama pembungkus: berjalan sebelum isi halaman
 * digambar, jadi pengunjung yang memilih terang tidak melihat kedipan gelap. Hanya landing; halaman lain tetap terang.
 */
export const KUNCI_TEMA = "tema-landing";
export const SKRIP_TEMA = `try{if(localStorage.getItem("${KUNCI_TEMA}")==="terang")document.currentScript.parentElement.classList.remove("tema-gelap")}catch(e){}`;

export function TombolTema() {
  const { t } = useBahasa();
  // Sumber kebenaran = kelas di pembungkus (bisa sudah dilepas SKRIP_TEMA sebelum hidrasi); server: gelap.
  const gelap = useSyncExternalStore(
    (ubah) => {
      const el = document.querySelector("[data-tema-landing]");
      if (!el) return () => {};
      const mo = new MutationObserver(ubah);
      mo.observe(el, { attributes: true, attributeFilter: ["class"] });
      return () => mo.disconnect();
    },
    () => !!document.querySelector("[data-tema-landing].tema-gelap"),
    () => true,
  );

  const ganti = () => {
    const el = document.querySelector("[data-tema-landing]");
    if (!el) return;
    const jadiGelap = !el.classList.contains("tema-gelap");
    el.classList.toggle("tema-gelap", jadiGelap);
    try {
      localStorage.setItem(KUNCI_TEMA, jadiGelap ? "gelap" : "terang");
    } catch {
      /* penyimpanan diblokir: pilihan berlaku sampai halaman ditutup */
    }
  };

  return (
    <button
      type="button"
      onClick={ganti}
      aria-label={gelap ? t("Ganti ke tema terang", "Switch to light theme") : t("Ganti ke tema gelap", "Switch to dark theme")}
      title={gelap ? t("Tema terang", "Light theme") : t("Tema gelap", "Dark theme")}
      data-analitik="Landing: ganti tema"
      className="grid size-9 shrink-0 place-items-center rounded-xl text-ink-fg transition-colors hover:bg-white/[0.06]"
    >
      {gelap ? <Sun className="size-[18px]" aria-hidden /> : <Moon className="size-[18px]" aria-hidden />}
    </button>
  );
}
