import type { ReactNode } from "react";
import Link from "@/components/link";
import { Logo } from "@/components/logo";
import { teksHalaman } from "@/lib/bahasa-halaman";

function Merek({ beranda, lencana }: { beranda: string; lencana?: string }) {
  return (
    <Link href={beranda} className="flex min-w-0 items-center gap-2 rounded-lg">
      <Logo gelap />
      {lencana && (
        <span className="shrink-0 rounded-md bg-ink-raised px-1.5 py-0.5 text-[10.5px] font-semibold tracking-[0.06em] text-ink-muted uppercase ring-1 ring-ink-line">
          {lencana}
        </span>
      )}
    </Link>
  );
}

/**
 * Rangka aplikasi. Desktop (lg+): sidebar gelap tetap di kiri. HP/tablet: bilah atas tipis (logo + aksi) dan bilah
 * menu di bawah layar seperti aplikasi HP (`bawah`); sidebar tidak dirender sebagai laci.
 */
export async function Rangka({
  sidebar,
  bawah,
  aksiAtas,
  children,
  beranda = "/dashboard",
  lencana,
  aksiSidebar,
}: {
  sidebar: ReactNode;
  /** Bilah menu bawah untuk layar di bawah lg. */
  bawah: ReactNode;
  /** Aksi kecil di kanan bilah atas HP, mis. tombol Panduan. */
  aksiAtas?: ReactNode;
  children: ReactNode;
  beranda?: string;
  /** Penanda kecil di samping logo, mis. "Admin" di panel admin. */
  lencana?: string;
  /** Aksi kecil di kanan logo pada sidebar desktop, mis. lonceng notifikasi. */
  aksiSidebar?: ReactNode;
}) {
  const { t } = await teksHalaman();
  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-ink-line bg-ink/95 px-4 text-ink-fg backdrop-blur sm:px-6 lg:hidden">
        <Merek beranda={beranda} lencana={lencana} />
        {aksiAtas && <div className="-mr-2 flex shrink-0 items-center gap-1">{aksiAtas}</div>}
      </header>

      <aside aria-label={t("Navigasi", "Navigation")} className="hidden bg-ink text-ink-fg lg:sticky lg:top-0 lg:flex lg:h-svh lg:flex-col">
        <div className="relative flex h-16 shrink-0 items-center gap-2 px-5">
          <div aria-hidden className="kisi-tinta pointer-events-none absolute inset-0 opacity-60" />
          <div className="relative min-w-0 flex-1">
            <Merek beranda={beranda} lencana={lencana} />
          </div>
          {aksiSidebar && <div className="relative -mr-2 shrink-0">{aksiSidebar}</div>}
        </div>
        {/* Satu area gulir untuk seluruh isi sidebar: di layar pendek tidak ada bagian yang terjepit atau terpotong. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain [scrollbar-color:var(--c-ink-raised)_transparent]">{sidebar}</div>
      </aside>

      <div className="min-w-0">{children}</div>
      {bawah}
    </div>
  );
}
