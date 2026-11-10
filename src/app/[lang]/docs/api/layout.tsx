import type { ReactNode } from "react";
import { BookOpen } from "lucide-react";
import { GantiBahasa } from "@/components/ganti-bahasa";
import Link from "@/components/link";
import { Logo } from "@/components/logo";
import { teksHalaman } from "@/lib/bahasa-halaman";
import { MEREK } from "@/lib/merek";
import { CariDok } from "./_dok/cari";
import { MenuDokHp, SebelumBerikut, SidebarDok } from "./_dok/navigasi";

/**
 * Situs dokumentasi Developer API (publik, statis): bilah atas + pencarian (Ctrl/⌘ K), sidebar per grup, isi halaman,
 * dan tombol sebelumnya/berikutnya. Semua isi dari src/lib/api-dok.ts & api-def.ts (sumber yang sama dengan OpenAPI).
 */
export default async function LayoutDokumentasi({ children }: { children: ReactNode }) {
  const { t } = await teksHalaman();
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-ink text-ink-fg">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center gap-3 px-4 sm:px-6">
          <Link href="/docs/api" className="flex min-w-0 items-center gap-2.5 rounded-lg" aria-label={t(`Dokumentasi ${MEREK}`, `${MEREK} docs`)}>
            <Logo ukuran="sm" gelap />
            <span className="hidden items-center gap-1 rounded-md border border-white/15 px-2 py-0.5 text-[11.5px] font-semibold text-ink-muted sm:inline-flex">
              <BookOpen className="size-3" aria-hidden /> Docs API v1
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <CariDok />
            <GantiBahasa gelap />
            <Link href="/developer" className="hidden rounded-xl bg-ink-signal px-3 py-2 text-[13px] font-bold whitespace-nowrap text-ink transition-transform hover:-translate-y-0.5 md:block">
              {t("Portal Developer", "Developer portal")}
            </Link>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-[1240px] gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12 lg:py-10">
        <aside>
          <SidebarDok />
          <MenuDokHp />
        </aside>
        <main className="min-w-0 max-w-[860px] text-[14.5px] leading-relaxed">
          {children}
          <SebelumBerikut />
          <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 text-[12.5px] text-faint">
            <span>© {MEREK} · Developer API v1</span>
            <a href="/docs/api/openapi.json" className="font-semibold text-muted hover:text-fg">
              OpenAPI 3.1 (JSON)
            </a>
          </footer>
        </main>
      </div>
    </div>
  );
}
