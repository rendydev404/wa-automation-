import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { type Bahasa, LOKAL, pembuatT } from "@/lib/bahasa";
import { angka } from "@/lib/format";

/**
 * Kepingan statistik murni (tanpa state): dipakai Server maupun Client Component.
 * Angka besar memakai angka proporsional; tabular-nums hanya untuk kolom yang harus rata.
 */

/** Garis tren kecil. Garis 2px tetap tajam walau SVG diregangkan; titik akhir = hari ini. */
export function Sparkline({
  nilai,
  warna = "var(--c-accent)",
  cincin = "var(--c-surface)",
  className = "",
}: {
  nilai: number[];
  warna?: string;
  cincin?: string;
  className?: string;
}) {
  const n = nilai.length;
  if (n < 2) return null;
  const maks = Math.max(1, ...nilai);
  const y = (v: number) => 30 - (v / maks) * 27;
  const titik = nilai.map((v, i) => `${(i / (n - 1)) * 100},${y(v)}`).join(" ");
  return (
    <div aria-hidden className={`relative ${className}`}>
      <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
        <polygon points={`0,32 ${titik} 100,32`} fill={warna} opacity={0.12} />
        <polyline points={titik} fill="none" stroke={warna} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span
        className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ left: "100%", top: `${(y(nilai[n - 1]) / 32) * 100}%`, background: warna, boxShadow: `0 0 0 2px ${cincin}` }}
      />
    </div>
  );
}

/** Bilah persentase: isi aksen, jalur = langkah lebih terang dari rona yang sama. */
const NADA_METER = {
  normal: ["bg-accent-soft", "bg-accent"],
  waspada: ["bg-warning-soft", "bg-warning"],
  bahaya: ["bg-danger-soft", "bg-danger"],
} as const;

export function Meter({ persen, label, nada = "normal" }: { persen: number; label: string; nada?: keyof typeof NADA_METER }) {
  const p = Math.max(0, Math.min(100, persen));
  const [jalur, isi] = NADA_METER[nada];
  return (
    <div role="meter" aria-label={label} aria-valuenow={p} aria-valuemin={0} aria-valuemax={100} className={`h-1.5 overflow-hidden rounded-full ${jalur}`}>
      <div className={`h-full rounded-full ${isi} transition-[width] duration-700`} style={{ width: `${p}%` }} />
    </div>
  );
}

/**
 * Perubahan terhadap periode pembanding. Warna = arah x baik/buruk (pendapatan naik hijau, biaya naik merah) dan
 * selalu disertai panah + kata untuk pembaca layar, jadi tidak bergantung warna saja. Mode "persen" beralih ke
 * selisih mutlak bila pembandingnya nol/negatif (persentase dari nol tidak bermakna).
 */
export function Delta({
  kini,
  lalu,
  mode = "persen",
  format,
  naikBaik = true,
  pembanding,
  gelap = false,
  b = "id",
}: {
  kini: number;
  lalu: number;
  mode?: "persen" | "selisih";
  format?: (n: number) => string;
  naikBaik?: boolean;
  /** Mis. "30 hari sebelumnya"; tampil di samping angka perubahan. */
  pembanding: string;
  gelap?: boolean;
  /** Bahasa tampilan (komponen ini murni, tanpa hook): bawaan "id". */
  b?: Bahasa;
}) {
  const t = pembuatT(b);
  const fmt = format ?? ((n: number) => angka(n, b));
  const beda = kini - lalu;
  const arah = beda > 0 ? 1 : beda < 0 ? -1 : 0;
  const persen = mode === "persen" && lalu > 0 ? (beda / lalu) * 100 : null;
  const teks =
    arah === 0
      ? t("Sama", "No change")
      : persen !== null
        ? `${Math.abs(persen) < 10 ? Math.abs(persen).toLocaleString(LOKAL[b], { maximumFractionDigits: 1 }) : angka(Math.round(Math.abs(persen)), b)}%`
        : fmt(Math.abs(beda));
  const baik = arah === 0 ? null : (arah > 0) === naikBaik;
  const nada = gelap
    ? baik === null
      ? "bg-ink-fg/10 text-ink-muted"
      : baik
        ? "bg-ink-signal/15 text-ink-signal"
        : "bg-ink-alarm/15 text-ink-alarm"
    : baik === null
      ? "bg-subtle text-muted"
      : baik
        ? "bg-success-soft text-success"
        : "bg-danger-soft text-danger";
  const Ikon = arah > 0 ? ArrowUpRight : arah < 0 ? ArrowDownRight : Minus;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
      <span className={`inline-flex items-center gap-0.5 rounded-full py-0.5 pr-1.5 pl-1 font-semibold tabular-nums ${nada}`}>
        <Ikon className="size-3.5" aria-hidden strokeWidth={2.5} />
        <span className="sr-only">{arah > 0 ? t("naik", "up") : arah < 0 ? t("turun", "down") : ""}</span>
        {arah !== 0 && persen === null && (arah > 0 ? "+" : "−")}
        {teks}
      </span>
      <span className={gelap ? "text-ink-muted" : "text-muted"}>vs {pembanding}</span>
    </span>
  );
}

export function KartuStat({
  label,
  nilai,
  ikon,
  keterangan,
  delta,
  className = "",
  children,
}: {
  label: string;
  nilai: ReactNode;
  ikon: ReactNode;
  keterangan?: ReactNode;
  delta?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`card flex min-w-0 flex-col p-4 sm:p-5 ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12.5px] leading-snug font-medium text-muted">{label}</p>
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-subtle text-muted sm:size-8">{ikon}</span>
      </div>
      <p className="mt-2 text-[26px] leading-none font-bold tracking-tight sm:text-[30px]">{nilai}</p>
      {delta && <div className="mt-2.5">{delta}</div>}
      {keterangan && <p className="mt-2 text-xs leading-snug text-muted">{keterangan}</p>}
      {children && <div className="mt-auto pt-3">{children}</div>}
    </div>
  );
}

/** Satu-satunya angka utama per tampilan: kartu gelap senada sidebar. */
export function KartuUtama({
  label,
  nilai,
  keterangan,
  tren,
  delta,
}: {
  label: string;
  nilai: string;
  keterangan: ReactNode;
  tren: number[];
  delta?: ReactNode;
}) {
  return (
    <div className="relative col-span-2 flex flex-col overflow-hidden rounded-2xl bg-ink p-5 text-ink-fg shadow-pop xl:col-span-1">
      <div aria-hidden className="kisi-tinta pointer-events-none absolute inset-0" />
      <p className="relative text-[12.5px] font-medium text-ink-muted">{label}</p>
      <p className="relative mt-2 text-5xl leading-none font-bold tracking-tight">{nilai}</p>
      {delta && <div className="relative mt-3">{delta}</div>}
      <p className="relative mt-2 text-xs text-ink-muted">{keterangan}</p>
      {/* Disisakan 6px di kanan untuk titik akhir (hari ini) beserta cincinnya. */}
      <div className="mt-auto pt-4">
        <Sparkline nilai={tren} warna="var(--c-ink-signal)" cincin="var(--c-ink)" className="h-10 w-[calc(100%-6px)]" />
      </div>
    </div>
  );
}
