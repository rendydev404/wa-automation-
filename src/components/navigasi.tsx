"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard } from "lucide-react";
import { formatNomor } from "@/lib/format";
import type { StatusSesiWa } from "@/lib/types";
import { TombolTambahNomor } from "./tambah-nomor";
import { useSesiNomor, useWaStatus } from "./wa-status";

export interface ItemNomorNav {
  id: number;
  label: string;
  wa_id: string | null;
}

const JUDUL_KECIL = "px-3 text-[11px] font-semibold tracking-[0.08em] text-ink-muted/80 uppercase";

function teksStatus(s: StatusSesiWa | undefined): string {
  if (!s) return "Memeriksa…";
  if (s === "WORKING") return "Terhubung";
  if (s === "SCAN_QR_CODE") return "Menunggu scan QR";
  if (s === "STARTING") return "Menyiapkan";
  if (s === "FAILED") return "Perlu dimulai ulang";
  return "Belum terhubung";
}

function warnaStatus(s: StatusSesiWa | undefined): string {
  if (s === "WORKING") return "bg-ink-signal";
  if (s === "SCAN_QR_CODE" || s === "STARTING") return "animate-denyut bg-amber-400";
  if (s === "FAILED") return "bg-amber-400";
  return "bg-ink-muted/45";
}

function kelasTautan(aktif: boolean): string {
  return `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
    aktif ? "bg-ink-raised text-white" : "text-ink-fg/80 hover:bg-ink-raised/60 hover:text-white"
  }`;
}

/** Garis sinyal di tepi kiri item yang sedang dibuka. */
const Penanda = () => <span aria-hidden className="absolute inset-y-2.5 left-0 w-[3px] rounded-r-full bg-ink-signal" />;

function TautanNav({ href, aktif, ikon, children }: { href: string; aktif: boolean; ikon: ReactNode; children: ReactNode }) {
  return (
    <Link href={href} aria-current={aktif ? "page" : undefined} className={kelasTautan(aktif)}>
      {aktif && <Penanda />}
      <span className={`grid size-8 place-items-center rounded-lg ${aktif ? "bg-ink-signal/15 text-ink-signal" : "bg-white/[0.05] text-ink-muted group-hover:text-ink-fg"}`}>
        {ikon}
      </span>
      <span className="text-[13.5px] font-semibold">{children}</span>
    </Link>
  );
}

function ItemNomor({ n, aktif }: { n: ItemNomorNav; aktif: boolean }) {
  const sesi = useSesiNomor(n.id);
  const wa = sesi?.status === "WORKING" && sesi.waId ? sesi.waId : n.wa_id;
  const status = teksStatus(sesi?.status);
  return (
    <li>
      <Link href={`/nomor/${n.id}`} aria-current={aktif ? "page" : undefined} className={kelasTautan(aktif)}>
        {aktif && <Penanda />}
        <span className={`relative grid size-8 shrink-0 place-items-center rounded-lg text-[12px] font-bold uppercase ${aktif ? "bg-ink-signal/15 text-ink-signal" : "bg-white/[0.06] text-ink-fg/90"}`}>
          {n.label.trim().charAt(0) || "#"}
          <span title={status} className={`absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ${aktif ? "ring-ink-raised" : "ring-ink"} ${warnaStatus(sesi?.status)}`} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] leading-tight font-semibold">{n.label}</span>
          <span className="mt-0.5 block truncate text-[11.5px] leading-tight text-ink-muted tabular-nums">{wa ? formatNomor(wa) : status}</span>
        </span>
        <span className="sr-only">({status})</span>
      </Link>
    </li>
  );
}

export function NavUtama({ nomor }: { nomor: ItemNomorNav[] }) {
  const jalur = usePathname();
  return (
    <>
      <div className="px-3 pt-3">
        <p className={`${JUDUL_KECIL} pb-2`}>Menu</p>
        <TautanNav href="/" aktif={jalur === "/"} ikon={<LayoutDashboard className="size-4" aria-hidden />}>
          Ringkasan
        </TautanNav>
      </div>
      <div className="mt-6 flex items-center justify-between pr-6 pb-2 pl-3">
        <p className={JUDUL_KECIL}>Nomor WhatsApp</p>
        <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-semibold text-ink-muted tabular-nums">{nomor.length}</span>
      </div>
      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 pb-3 [scrollbar-color:var(--c-ink-raised)_transparent]">
        {nomor.map((n) => (
          <ItemNomor key={n.id} n={n} aktif={jalur === `/nomor/${n.id}`} />
        ))}
        {nomor.length === 0 && <li className="px-3 py-2 text-[12.5px] text-ink-muted">Belum ada nomor.</li>}
      </ul>
      <div className="px-3 pb-3">
        <TombolTambahNomor varian="nav" />
      </div>
    </>
  );
}

/** Kerangka daftar selagi data sidebar dimuat. */
export function NavKerangka() {
  return (
    <div aria-hidden className="space-y-2 px-6 pt-5">
      <div className="h-9 animate-denyut rounded-xl bg-ink-raised" />
      <div className="!mt-8 h-3 w-28 rounded bg-ink-raised" />
      <div className="h-11 animate-denyut rounded-xl bg-ink-raised" />
      <div className="h-11 animate-denyut rounded-xl bg-ink-raised" />
    </div>
  );
}

/** Kesehatan layanan di kaki sidebar: dari poller status bersama, tanpa permintaan tambahan. */
export function StatusLayanan() {
  const { data } = useWaStatus();
  const semua = data ? Object.values(data.nomor) : [];
  const terhubung = semua.filter((s) => s.status === "WORKING").length;
  const ok = !!data?.hermes;
  return (
    <div className="rounded-xl border border-ink-line bg-white/[0.03] p-3">
      <div className="flex items-center gap-2.5">
        <span className="relative flex size-2.5 shrink-0">
          {ok && <span className="absolute inset-0 animate-ping rounded-full bg-ink-signal opacity-60" />}
          <span className={`relative size-2.5 rounded-full ${!data ? "bg-ink-muted/50" : ok ? "bg-ink-signal" : "bg-amber-400"}`} />
        </span>
        <p className="text-[12.5px] font-semibold">{!data ? "Memeriksa layanan…" : ok ? "AI Hermes aktif" : "AI tidak terjangkau"}</p>
      </div>
      <p className="mt-1 pl-5 text-[11.5px] text-ink-muted">{data ? `${terhubung} dari ${semua.length} nomor terhubung` : " "}</p>
    </div>
  );
}
