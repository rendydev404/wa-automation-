import type { ReactNode } from "react";
import { CircleHelp, CreditCard, LayoutDashboard, LogOut, Plus, Share2, UserRound } from "lucide-react";
import { kedip } from "./anim";

/* Atom UI produk — kelas Tailwind disalin apa adanya dari src/components/*.tsx di app. */

// ---------------------------------------------------------------- Logo
export const PATH_TANDA = "M23.74 76.26A50 40.5 0 1 1 85.06 70.68L50 98.6L50 79.8L36.9 79.8L64.45 52.25L72.3 60.1L79.12 29.22L48.25 36.05L56.1 43.9Z";

export function TandaMerek({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={`shrink-0 text-merek ${className}`}>
      <path d={PATH_TANDA} fill="currentColor" />
      <circle cx="94.76" cy="75.68" r="4.68" fill="currentColor" />
    </svg>
  );
}

const UKURAN = {
  sm: { tanda: "size-7", teks: "text-[17px]", jarak: "gap-2" },
  md: { tanda: "size-10", teks: "text-[22px]", jarak: "gap-2.5" },
  lg: { tanda: "size-12", teks: "text-[27px]", jarak: "gap-3" },
  xl: { tanda: "size-28", teks: "text-[96px]", jarak: "gap-6" },
} as const;

export function Logo({ ukuran = "sm", gelap = false, className = "" }: { ukuran?: keyof typeof UKURAN; gelap?: boolean; className?: string }) {
  const u = UKURAN[ukuran];
  return (
    <span className={`inline-flex min-w-0 items-center ${u.jarak} ${className}`}>
      <TandaMerek className={u.tanda} />
      <span className={`truncate font-merek leading-none font-bold tracking-[-0.01em] ${u.teks}`}>
        <span className={gelap ? "text-ink-fg" : "text-merek-tinta"}>Chat</span>
        <span className="text-merek">GerCep</span>
      </span>
    </span>
  );
}

// ---------------------------------------------------------------- Atom kecil
export function Pill({ nada, children }: { nada: "hijau" | "kuning" | "merah" | "abu"; children: ReactNode }) {
  const kelas = { hijau: "bg-success-soft text-success", kuning: "bg-warning-soft text-warning", merah: "bg-danger-soft text-danger", abu: "bg-subtle text-muted" }[nada];
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${kelas}`}>{children}</span>;
}

/** Saklar; `p` 0..1 = posisi geser (animasi digerakkan dari luar). */
export function Saklar({ p, cur }: { p: number; cur?: string }) {
  const hijau = p > 0.5;
  return (
    <span data-cur={cur} className="relative block h-6 w-11 shrink-0 rounded-full" style={{ background: hijau ? "var(--c-accent)" : "var(--c-line-strong)" }}>
      <span className="absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow" style={{ transform: `translateX(${p * 20}px)` }} />
    </span>
  );
}

export function Meter({ persen, nada = "normal" }: { persen: number; nada?: "normal" | "waspada" | "bahaya" }) {
  const [jalur, isi] = { normal: ["bg-accent-soft", "bg-accent"], waspada: ["bg-warning-soft", "bg-warning"], bahaya: ["bg-danger-soft", "bg-danger"] }[nada];
  return (
    <div className={`h-1.5 overflow-hidden rounded-full ${jalur}`}>
      <div className={`h-full rounded-full ${isi}`} style={{ width: `${Math.max(0, Math.min(100, persen))}%` }} />
    </div>
  );
}

export function Sparkline({ nilai, warna = "var(--c-accent)", cincin = "var(--c-surface)", className = "", sampai = 1 }: { nilai: number[]; warna?: string; cincin?: string; className?: string; sampai?: number }) {
  const n = nilai.length;
  const maks = Math.max(1, ...nilai);
  const y = (v: number) => 30 - (v / maks) * 27;
  const titik = nilai.map((v, i) => `${(i / (n - 1)) * 100},${y(v)}`).join(" ");
  return (
    <div aria-hidden className={`relative ${className}`} style={{ clipPath: `inset(-6px ${(1 - sampai) * 100}% -6px 0)` }}>
      <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
        <polygon points={`0,32 ${titik} 100,32`} fill={warna} opacity={0.12} />
        <polyline points={titik} fill="none" stroke={warna} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: "100%", top: `${(y(nilai[n - 1]) / 32) * 100}%`, background: warna, boxShadow: `0 0 0 2px ${cincin}` }} />
    </div>
  );
}

export function KartuStat({ label, nilai, ikon, keterangan, className = "", children, cur }: { label: string; nilai: ReactNode; ikon: ReactNode; keterangan?: ReactNode; className?: string; children?: ReactNode; cur?: string }) {
  return (
    <div data-cur={cur} className={`card flex min-w-0 flex-col p-4 sm:p-5 ${className}`}>
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

export function KartuUtama({ label, nilai, keterangan, tren, sampai = 1 }: { label: string; nilai: string; keterangan: ReactNode; tren: number[]; sampai?: number }) {
  return (
    <div className="relative col-span-2 flex flex-col overflow-hidden rounded-2xl bg-ink p-5 text-ink-fg shadow-pop xl:col-span-1">
      <div aria-hidden className="kisi-tinta pointer-events-none absolute inset-0" />
      <p className="relative text-[12.5px] font-medium text-ink-muted">{label}</p>
      <p className="relative mt-2 text-5xl leading-none font-bold tracking-tight">{nilai}</p>
      <p className="relative mt-2 text-xs text-ink-muted">{keterangan}</p>
      <div className="mt-auto pt-4">
        <Sparkline nilai={tren} warna="var(--c-ink-signal)" cincin="var(--c-ink)" className="h-10 w-[calc(100%-6px)]" sampai={sampai} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Kolom isian (diketik)
export function Isi({
  label,
  nilai,
  placeholder,
  fokus = false,
  t,
  password = false,
  cur,
  className = "",
  hint,
}: {
  label?: string;
  nilai: string;
  placeholder?: string;
  fokus?: boolean;
  t: number;
  password?: boolean;
  cur?: string;
  className?: string;
  hint?: ReactNode;
}) {
  const teks = password ? "•".repeat(nilai.length) : nilai;
  return (
    <div className={className}>
      {label && <span className="label">{label}</span>}
      <div data-cur={cur} className={`field flex items-center ${fokus ? "field-fokus" : ""}`} style={{ minHeight: 38 }}>
        {nilai ? <span className="whitespace-pre">{teks}</span> : <span className="text-faint">{placeholder}</span>}
        {fokus && <span className="ml-px inline-block h-[1.15em] w-px bg-fg" style={{ opacity: kedip(t) ? 1 : 0, marginLeft: nilai ? 1 : -1 }} />}
      </div>
      {hint}
    </div>
  );
}

// ---------------------------------------------------------------- Kerangka aplikasi
export interface ItemNomorNav {
  label: string;
  wa?: string;
  status: "WORKING" | "SCAN_QR_CODE" | "STARTING" | "NONE";
}

const JUDUL_KECIL = "px-3 text-[11px] font-semibold tracking-[0.08em] text-ink-muted/80 uppercase";
const kelasTautan = (aktif: boolean) => `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 ${aktif ? "bg-ink-raised text-white" : "text-ink-fg/80"}`;
const Penanda = () => <span aria-hidden className="absolute inset-y-2.5 left-0 w-[3px] rounded-r-full bg-ink-signal" />;

function TautanNav({ aktif, ikon, children, cur }: { aktif: boolean; ikon: ReactNode; children: ReactNode; cur: string }) {
  return (
    <div data-cur={cur} className={kelasTautan(aktif)}>
      {aktif && <Penanda />}
      <span className={`grid size-8 place-items-center rounded-lg ${aktif ? "bg-ink-signal/15 text-ink-signal" : "bg-white/[0.05] text-ink-muted"}`}>{ikon}</span>
      <span className="min-w-0 text-[13.5px] font-semibold">{children}</span>
    </div>
  );
}

export type HalamanAktif = "ringkasan" | "akun" | "langganan" | "afiliasi" | number;

/** Sidebar gelap aplikasi (NavUtama + StatusLayanan + Keluar). */
export function Sidebar({ aktif, nomor, pengguna, tambahHover = false }: { aktif: HalamanAktif; nomor: ItemNomorNav[]; pengguna: string; tambahHover?: boolean }) {
  const terhubung = nomor.filter((n) => n.status === "WORKING").length;
  return (
    <aside className="absolute inset-y-0 left-0 z-50 flex w-[264px] flex-col bg-ink text-ink-fg">
      <div className="relative flex h-16 shrink-0 items-center justify-between gap-2 px-5">
        <div aria-hidden className="kisi-tinta pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative min-w-0">
          <Logo gelap />
        </div>
      </div>
      <nav className="flex min-h-0 flex-1 flex-col">
        <div className="space-y-0.5 px-3 pt-3">
          <p className={`${JUDUL_KECIL} pb-2`}>Menu</p>
          <TautanNav cur="nav-ringkasan" aktif={aktif === "ringkasan"} ikon={<LayoutDashboard className="size-4" />}>Ringkasan</TautanNav>
          <TautanNav cur="nav-akun" aktif={aktif === "akun"} ikon={<UserRound className="size-4" />}>
            <span className="block leading-tight">Akun saya</span>
            <span className="block max-w-40 truncate text-[11.5px] leading-tight font-medium text-ink-muted">{pengguna}</span>
          </TautanNav>
          <TautanNav cur="nav-langganan" aktif={aktif === "langganan"} ikon={<CreditCard className="size-4" />}>Langganan</TautanNav>
          <TautanNav cur="nav-afiliasi" aktif={aktif === "afiliasi"} ikon={<Share2 className="size-4" />}>Afiliasi</TautanNav>
          <TautanNav cur="nav-panduan" aktif={false} ikon={<CircleHelp className="size-4" />}>Panduan</TautanNav>
        </div>
        <div data-cur="nav-nomor" className="mt-6 flex items-center justify-between pr-6 pb-2 pl-3">
          <p className={JUDUL_KECIL}>Nomor WhatsApp</p>
          <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-semibold text-ink-muted tabular-nums">{nomor.length}</span>
        </div>
        <ul className="min-h-0 flex-1 space-y-0.5 px-3 pb-3">
          {nomor.map((n, i) => {
            const a = aktif === i + 1;
            const dot = n.status === "WORKING" ? "bg-ink-signal" : n.status === "NONE" ? "bg-ink-muted/45" : "bg-amber-400";
            return (
              <li key={n.label}>
                <div data-cur={`nav-n-${i + 1}`} className={kelasTautan(a)}>
                  {a && <Penanda />}
                  <span className={`relative grid size-8 shrink-0 place-items-center rounded-lg text-[12px] font-bold uppercase ${a ? "bg-ink-signal/15 text-ink-signal" : "bg-white/[0.06] text-ink-fg/90"}`}>
                    {n.label.charAt(0)}
                    <span className={`absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ${a ? "ring-ink-raised" : "ring-ink"} ${dot}`} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] leading-tight font-semibold">{n.label}</span>
                    <span className="mt-0.5 block truncate text-[11.5px] leading-tight text-ink-muted tabular-nums">
                      {n.wa ?? (n.status === "SCAN_QR_CODE" ? "Menunggu scan QR" : "Belum terhubung")}
                    </span>
                  </span>
                </div>
              </li>
            );
          })}
          {nomor.length === 0 && <li className="px-3 py-2 text-[12.5px] text-ink-muted">Belum ada nomor.</li>}
        </ul>
        <div className="px-3 pb-3">
          <div
            data-cur="nav-tambah"
            className={`flex w-full items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-2.5 text-[13px] font-semibold ${tambahHover ? "border-ink-signal/60 bg-ink-raised/60 text-ink-fg" : "border-ink-line text-ink-muted"}`}
          >
            <Plus className="size-4" /> Tambah nomor
          </div>
        </div>
      </nav>
      <div className="space-y-2 border-t border-ink-line p-3">
        <div className="rounded-xl border border-ink-line bg-white/[0.03] p-3">
          <div className="flex items-center gap-2.5">
            <span className="relative flex size-2.5 shrink-0">
              <span className="relative size-2.5 rounded-full bg-ink-signal" />
            </span>
            <p className="text-[12.5px] font-semibold">AI aktif</p>
          </div>
          <p className="mt-1 pl-5 text-[11.5px] text-ink-muted">{terhubung} dari {nomor.length} nomor terhubung</p>
        </div>
        <div className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-ink-muted">
          <LogOut className="size-4" /> Keluar
        </div>
      </div>
    </aside>
  );
}

/** Area utama halaman aplikasi (di kanan sidebar 264 px). */
export function Main({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className="pl-[264px]">
      <main className={`mx-auto w-full max-w-[1320px] px-10 pt-10 pb-16 ${className}`}>{children}</main>
    </div>
  );
}

/** Lapisan gelap + kartu dialog bergaya <dialog> app (latar hitam 45% + blur). `p` 0..1 = kemunculan. */
export function LatarDialog({ p, children, kuat = false }: { p: number; children: ReactNode; kuat?: boolean }) {
  return (
    <div className="absolute inset-0 z-[90] grid place-items-center" style={{ opacity: p, background: kuat ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.45)", backdropFilter: "blur(3px)" }}>
      <div style={{ transform: `translateY(${(1 - p) * 14}px) scale(${0.985 + p * 0.015})` }}>{children}</div>
    </div>
  );
}
