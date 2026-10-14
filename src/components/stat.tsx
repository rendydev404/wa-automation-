import type { ReactNode } from "react";

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
export function Meter({ persen, label }: { persen: number; label: string }) {
  const p = Math.max(0, Math.min(100, persen));
  return (
    <div role="meter" aria-label={label} aria-valuenow={p} aria-valuemin={0} aria-valuemax={100} className="h-1.5 overflow-hidden rounded-full bg-accent-soft">
      <div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${p}%` }} />
    </div>
  );
}

export function KartuStat({
  label,
  nilai,
  ikon,
  keterangan,
  children,
}: {
  label: string;
  nilai: ReactNode;
  ikon: ReactNode;
  keterangan?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="card flex min-w-0 flex-col p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12.5px] leading-snug font-medium text-muted">{label}</p>
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-subtle text-muted sm:size-8">{ikon}</span>
      </div>
      <p className="mt-2 text-[26px] leading-none font-bold tracking-tight sm:text-[30px]">{nilai}</p>
      {keterangan && <p className="mt-2 text-xs leading-snug text-muted">{keterangan}</p>}
      {children && <div className="mt-auto pt-3">{children}</div>}
    </div>
  );
}

/** Satu-satunya angka utama per tampilan: kartu gelap senada sidebar. */
export function KartuUtama({ label, nilai, keterangan, tren }: { label: string; nilai: string; keterangan: ReactNode; tren: number[] }) {
  return (
    <div className="relative col-span-2 flex flex-col overflow-hidden rounded-2xl bg-ink p-5 text-ink-fg shadow-pop xl:col-span-1">
      <div aria-hidden className="kisi-tinta pointer-events-none absolute inset-0" />
      <p className="relative text-[12.5px] font-medium text-ink-muted">{label}</p>
      <p className="relative mt-2 text-5xl leading-none font-bold tracking-tight">{nilai}</p>
      <p className="relative mt-2 text-xs text-ink-muted">{keterangan}</p>
      {/* Disisakan 6px di kanan untuk titik akhir (hari ini) beserta cincinnya. */}
      <div className="mt-auto pt-4">
        <Sparkline nilai={tren} warna="var(--c-ink-signal)" cincin="var(--c-ink)" className="h-10 w-[calc(100%-6px)]" />
      </div>
    </div>
  );
}
