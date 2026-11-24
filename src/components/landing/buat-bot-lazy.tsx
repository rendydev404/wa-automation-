"use client";

import dynamic from "next/dynamic";

/**
 * Bot instan dimuat sebagai potongan JS terpisah setelah halaman tampil: templat usaha & contoh isiannya tidak ikut
 * membebani muatan awal landing. Kerangka setinggi aslinya mencegah lompatan tata letak.
 */
export const BuatBotLazy = dynamic(() => import("./buat-bot").then((m) => m.BuatBot), {
  ssr: false,
  loading: () => (
    <div aria-hidden className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:gap-10">
      <div className="h-[560px] animate-denyut rounded-3xl border border-line bg-surface" />
      <div className="h-[480px] animate-denyut rounded-3xl border border-line bg-surface" />
    </div>
  ),
});
