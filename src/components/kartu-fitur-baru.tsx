"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { tandaiFiturBaruAction } from "@/app/actions";
import { useBahasa, useRouterBahasa } from "./bahasa";
import { GambarPose } from "./maskot/pose";
import { useTurOpsional } from "./tur";

// Kartu sedang tampil: maskot dasbor (maskot/maskot.tsx) menyingkir supaya tidak bertumpuk di pojok kanan bawah.
let terbuka = false;
const pendengar = new Set<() => void>();
const setTerbuka = (v: boolean) => {
  if (terbuka === v) return;
  terbuka = v;
  for (const f of pendengar) f();
};
export function useFiturBaruTampil(): boolean {
  return useSyncExternalStore(
    (f) => (pendengar.add(f), () => void pendengar.delete(f)),
    () => terbuka,
    () => false,
  );
}

/**
 * Pop-up "Fitur baru" (lib/fitur-baru-def.ts): muncul begitu pengguna masuk dasbor, tidak di atas tur atau modal
 * voucher yang sedang terbuka. "Mulai tur panduan" membuka halaman tujuan lalu tur sorotannya langsung diputar di sana;
 * "Nanti saja"/Esc menutupnya sampai kunjungan berikutnya; ✕ = jangan tampilkan lagi (tetap ada di lonceng notifikasi).
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
    jeda = setTimeout(coba, 900);
    return () => clearTimeout(jeda);
  }, [kunciNanti]);

  const terlihat = tampil && !selesai && !tur?.aktif;
  const nanti = () => {
    try {
      sessionStorage.setItem(kunciNanti, "1");
    } catch {}
    setSelesai(true);
  };
  useEffect(() => {
    setTerbuka(terlihat);
    if (!terlihat) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      try {
        sessionStorage.setItem(kunciNanti, "1");
      } catch {}
      setSelesai(true);
    };
    document.addEventListener("keydown", esc);
    return () => {
      setTerbuka(false);
      document.removeEventListener("keydown", esc);
    };
  }, [terlihat, kunciNanti]);
  if (!terlihat) return null;

  const lihat = () =>
    mulai(async () => {
      await tandaiFiturBaruAction(kode);
      setSelesai(true);
      router.push(tujuan);
    });
  const tutup = () => {
    setSelesai(true);
    void tandaiFiturBaruAction(kode);
  };

  return (
    <div className="fixed inset-0 z-[90] grid animate-masuk place-items-center overflow-y-auto bg-ink/60 p-4 backdrop-blur-[2px]">
      <div role="dialog" aria-modal="true" aria-labelledby="fitur-baru-judul" className="relative mt-16 w-full max-w-[440px] rounded-3xl bg-surface px-6 pt-20 pb-6 text-center shadow-pop sm:px-8">
        <div aria-hidden className="pointer-events-none absolute -top-16 left-1/2 h-36 w-36 -translate-x-1/2">
          <GambarPose pose="sapa" className="size-full object-contain object-bottom" />
        </div>
        <button type="button" onClick={tutup} aria-label={t("Tutup, jangan tampilkan lagi", "Close, don't show again")} className="absolute top-3 right-3 grid size-9 place-items-center rounded-lg text-muted hover:bg-subtle hover:text-fg">
          <X className="size-4" aria-hidden />
        </button>
        <p className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-[12px] font-bold tracking-[0.06em] text-accent uppercase">
          <Sparkles className="size-3.5" aria-hidden />
          {t("Fitur baru", "New feature")}
        </p>
        <h2 id="fitur-baru-judul" className="mt-3 text-[20px] leading-snug font-bold tracking-tight text-balance">
          {judul}
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">{isi}</p>
        <div className="mt-6 flex flex-col gap-2">
          <button type="button" onClick={lihat} disabled={menunggu} className="btn btn-primary h-11 w-full text-[14.5px]" data-analitik={`Fitur baru: tur ${kode}`}>
            {t("Mulai tur panduan", "Start the guided tour")}
            <ArrowRight className="size-4" aria-hidden />
          </button>
          <button type="button" onClick={nanti} className="btn btn-ghost h-10 w-full" data-analitik={`Fitur baru: nanti ${kode}`}>
            {t("Nanti saja", "Later")}
          </button>
        </div>
        <p className="hint mt-3">{t("Butuh kurang dari 1 menit.", "Takes less than a minute.")}</p>
      </div>
    </div>
  );
}
