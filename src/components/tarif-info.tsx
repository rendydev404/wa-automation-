"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { jamWib, tanggal } from "@/lib/format";
import { HALAMAN_HARGA, type InfoTarif } from "@/lib/tarif-def";

const SELANG_MS = 10 * 60_000;

/**
 * Asal harga model Claude di panel admin: tarif resmi dari halaman harga Anthropic, kapan dicek, dan tombol "Perbarui".
 * Selama halaman terbuka, server ditanya tiap 10 menit (hanya saat tab terlihat); bila tabel harga yang dipegang server
 * lebih baru dari yang tampil, halaman dirender ulang sehingga semua harga model langsung ikut berubah.
 */
export function TarifInfo({ info }: { info: InfoTarif }) {
  const router = useRouter();
  const [sedang, mulai] = useTransition();
  const [galat, setGalat] = useState(false);
  const terakhir = useRef(0);

  useEffect(() => {
    terakhir.current = Date.now();
    const cek = async () => {
      if (document.visibilityState !== "visible" || Date.now() - terakhir.current < SELANG_MS) return;
      terakhir.current = Date.now();
      try {
        const res = await fetch("/api/tarif", { cache: "no-store" });
        const baru = (await res.json()) as InfoTarif;
        if (res.ok && baru.diambil > info.diambil) router.refresh();
      } catch {
        /* dicoba lagi di putaran berikutnya */
      }
    };
    const id = setInterval(cek, 60_000);
    document.addEventListener("visibilitychange", cek);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", cek);
    };
  }, [info.diambil, router]);

  const perbarui = () =>
    mulai(async () => {
      try {
        const res = await fetch("/api/tarif?segarkan=1", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        setGalat(false);
        router.refresh();
      } catch {
        setGalat(true);
      }
    });

  return (
    <div className="flex flex-wrap items-start justify-between gap-2 rounded-xl bg-subtle/60 px-3 py-2.5 text-[12px]">
      <p className={info.sumber === "resmi" ? "text-muted" : "text-warning"}>
        {info.sumber === "cadangan" ? (
          "Halaman harga Anthropic belum bisa dibaca; sementara memakai tarif resmi yang dicek manual 29 Okt 2026 (3 model). Dicoba lagi otomatis."
        ) : (
          <>
            Harga model = tarif resmi Anthropic ({info.jumlahModel} model) × kurs pasar. Dicek {tanggal(info.diambil)} {jamWib(info.diambil)} WIB, otomatis tiap jam
            {info.berubah > 0 && <> · terakhir berubah {tanggal(info.berubah)}</>}.
            {info.sumber === "tersimpan" && " Halaman harga sedang tidak terjangkau; memakai tarif terakhir yang berhasil diambil."}
          </>
        )}{" "}
        <a href={HALAMAN_HARGA} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-accent hover:underline">
          Halaman harga <ExternalLink className="size-3" aria-hidden />
        </a>
        {galat && <span className="block text-warning">Gagal memperbarui; coba lagi sebentar.</span>}
      </p>
      <button type="button" onClick={perbarui} disabled={sedang} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 font-semibold text-accent transition-colors hover:bg-accent-soft disabled:opacity-60">
        {sedang ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <RefreshCw className="size-3.5" aria-hidden />}
        Perbarui
      </button>
    </div>
  );
}
