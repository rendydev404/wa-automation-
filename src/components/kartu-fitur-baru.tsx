"use client";

import { useEffect, useState, useTransition } from "react";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { tandaiFiturBaruAction } from "@/app/actions";
import { useBahasa, useRouterBahasa } from "./bahasa";
import { GambarPose } from "./maskot/pose";
import { useTurOpsional } from "./tur";

/**
 * Kartu "Fitur baru" (lib/fitur-baru-def.ts): muncul sekali, sebentar setelah halaman tampil, tidak di atas tur atau
 * modal voucher yang sedang terbuka. "Lihat caranya" membuka halaman tujuan lalu tur sorotannya diputar di sana;
 * "Nanti saja" menutupnya sampai kunjungan berikutnya; ✕ = jangan tampilkan lagi (tetap ada di lonceng notifikasi).
 */
export function KartuFiturBaru({ kode, judul, isi, tujuan }: { kode: string; judul: string; isi: string; tujuan: string }) {
  const { t } = useBahasa();
  const router = useRouterBahasa();
  const tur = useTurOpsional();
  const [tampil, setTampil] = useState(false);
  const [selesai, setSelesai] = useState(false);
  const [menunggu, mulai] = useTransition();
  const kunciNanti = `fitur-baru-nanti:${kode}`;

  useEffect(() => {
    let nanti = false;
    try {
      nanti = sessionStorage.getItem(kunciNanti) === "1";
    } catch {}
    if (nanti) return;
    let jeda: ReturnType<typeof setTimeout>;
    const coba = () => {
      if (document.body.hasAttribute("data-modal-voucher")) jeda = setTimeout(coba, 1500);
      else setTampil(true);
    };
    jeda = setTimeout(coba, 1800);
    return () => clearTimeout(jeda);
  }, [kunciNanti]);

  if (!tampil || selesai || tur?.aktif) return null;

  const lihat = () =>
    mulai(async () => {
      await tandaiFiturBaruAction(kode);
      setSelesai(true);
      router.push(tujuan);
    });
  const nanti = () => {
    try {
      sessionStorage.setItem(kunciNanti, "1");
    } catch {}
    setSelesai(true);
  };
  const tutup = () => {
    setSelesai(true);
    void tandaiFiturBaruAction(kode);
  };

  return (
    <aside
      role="dialog"
      aria-labelledby="fitur-baru-judul"
      className="fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-4 z-[60] animate-masuk rounded-2xl border border-line bg-surface p-5 pt-6 shadow-pop sm:left-auto sm:w-[380px] lg:right-6 lg:bottom-6"
    >
      <div aria-hidden className="pointer-events-none absolute -top-[62px] right-14 h-[72px] w-[74px]" style={{ maskImage: "linear-gradient(#000 72%, transparent)", WebkitMaskImage: "linear-gradient(#000 72%, transparent)" }}>
        <GambarPose pose="sapa" className="size-full object-contain object-bottom" />
      </div>
      <button type="button" onClick={tutup} aria-label={t("Tutup, jangan tampilkan lagi", "Close, don't show again")} className="absolute top-2.5 right-2.5 grid size-8 place-items-center rounded-lg text-muted hover:bg-subtle hover:text-fg">
        <X className="size-4" aria-hidden />
      </button>
      <p className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-[11.5px] font-bold tracking-[0.06em] text-accent uppercase">
        <Sparkles className="size-3.5" aria-hidden />
        {t("Fitur baru", "New feature")}
      </p>
      <h2 id="fitur-baru-judul" className="mt-2.5 pr-6 text-[16px] leading-snug font-bold tracking-tight">
        {judul}
      </h2>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{isi}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={lihat} disabled={menunggu} className="btn btn-primary" data-analitik={`Fitur baru: lihat ${kode}`}>
          {t("Lihat caranya", "Show me how")}
          <ArrowRight className="size-4" aria-hidden />
        </button>
        <button type="button" onClick={nanti} className="btn btn-ghost" data-analitik={`Fitur baru: nanti ${kode}`}>
          {t("Nanti saja", "Later")}
        </button>
      </div>
    </aside>
  );
}
