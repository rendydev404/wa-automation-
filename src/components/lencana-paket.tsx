import { Crown, Flame, Gem, Medal } from "lucide-react";
import type { Tingkat } from "@/lib/tingkat-paket";

/**
 * Lencana paket berbayar: Starter perak, Bisnis emas, Pro merah menyala (api), Custom ungu neon (bingkai berputar).
 * Tanpa hook, jadi bisa dirender di Server Component maupun Client Component; gayanya di globals.css (.lencana-*).
 * `tingkat` null = paket lain tanpa gaya khusus (tetap tampil netral bila ada `nama`).
 */

const IKON = { starter: Medal, bisnis: Crown, pro: Flame, custom: Gem } as const;
const KILAU: Record<Tingkat, boolean> = { starter: true, bisnis: true, pro: false, custom: false };
const UKURAN = { sm: "text-[10px]", md: "text-[11.5px]", lg: "text-[13.5px]" } as const;

export function LencanaPaket({
  tingkat,
  nama,
  ukuran = "md",
  className = "",
}: {
  tingkat: Tingkat | null;
  nama: string;
  ukuran?: keyof typeof UKURAN;
  className?: string;
}) {
  if (!tingkat) {
    return <span className={`lencana lencana-gratis ${UKURAN[ukuran]} ${className}`}>{nama}</span>;
  }
  const Ikon = IKON[tingkat];
  return (
    <span className={`lencana lencana-${tingkat} ${KILAU[tingkat] ? "lencana-kilau" : ""} ${UKURAN[ukuran]} ${className}`} title={nama}>
      <Ikon aria-hidden strokeWidth={2.4} />
      {nama}
    </span>
  );
}
