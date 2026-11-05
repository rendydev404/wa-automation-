"use client";

import { Suspense } from "react";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { Languages } from "lucide-react";
import { tautan, urai } from "@/lib/bahasa";

type Props = { gelap?: boolean; className?: string };

/**
 * Tombol pindah bahasa: membuka halaman yang sama di bahasa lain (/dashboard <-> /eng/dashboard).
 * usePathname() di rute berparameter (/nomor/[id]) adalah data permintaan: dibungkus Suspense supaya kerangka statis
 * halaman tetap bisa di-prerender; selama menunggu tampil tempat kosong seukuran tombol.
 */
export function GantiBahasa(props: Props) {
  return (
    <Suspense fallback={<span aria-hidden className={`inline-block h-[34px] w-[52px] ${props.className ?? ""}`} />}>
      <Tombol {...props} />
    </Suspense>
  );
}

function Tombol({ gelap = false, className = "" }: Props) {
  const { bahasa, jalur } = urai(usePathname() ?? "/");
  const lain = bahasa === "en" ? "id" : "en";
  // Panel admin hanya berbahasa Indonesia: tombol tidak ditampilkan di sana.
  if (jalur === "/admin" || jalur.startsWith("/admin/")) return null;
  return (
    <NextLink
      href={tautan(lain, jalur)}
      hrefLang={lain}
      lang={lain}
      prefetch={false}
      aria-label={lain === "en" ? "View in English" : "Lihat dalam Bahasa Indonesia"}
      className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[12.5px] font-bold whitespace-nowrap transition-colors ${
        gelap ? "text-ink-muted hover:bg-white/[0.06] hover:text-ink-fg" : "text-muted hover:bg-subtle hover:text-fg"
      } ${className}`}
    >
      <Languages className="size-3.5" aria-hidden />
      {lain === "en" ? "EN" : "ID"}
    </NextLink>
  );
}
