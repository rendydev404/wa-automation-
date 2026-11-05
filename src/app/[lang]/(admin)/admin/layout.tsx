import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { LogOut } from "lucide-react";
import { logoutAction } from "@/app/actions";
import { NavBawahKerangka } from "@/components/navigasi";
import { LoncengNotifikasi } from "@/components/notifikasi";
import { Rangka } from "@/components/rangka";
import { requireAdmin } from "@/lib/session";
import { NavAdmin, NavAdminBawah } from "./nav-admin";
import { MEREK } from "@/lib/merek";

export const metadata: Metadata = { title: `Panel admin · ${MEREK}` };
export const viewport: Viewport = { themeColor: "#0b1813" };

/** Pemeriksa akses: bukan admin = 404 (keberadaan panel tidak dibocorkan). Di dalam Suspense supaya rangka tetap statis. */
async function Penjaga() {
  await requireAdmin();
  return null;
}

/** Panel admin: rangka, menu, dan halaman terpisah dari workspace pengguna (/dashboard, /nomor/...). */
export default function LayoutAdmin({ children }: LayoutProps<"/[lang]/admin">) {
  return (
    <Rangka
      beranda="/admin"
      lencana="Admin"
      aksiSidebar={<LoncengNotifikasi gelap />}
      aksiAtas={<LoncengNotifikasi gelap />}
      bawah={
        <Suspense fallback={<NavBawahKerangka />}>
          <NavAdminBawah />
        </Suspense>
      }
      sidebar={
        <>
          <Suspense fallback={<div className="flex-1" />}>
            <NavAdmin />
          </Suspense>
          <div className="border-t border-ink-line p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <form action={logoutAction}>
              <button
                type="submit"
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-ink-muted transition-colors hover:bg-ink-raised hover:text-ink-fg"
              >
                <LogOut className="size-4" aria-hidden />
                Keluar
              </button>
            </form>
          </div>
        </>
      }
    >
      <main className="mx-auto w-full max-w-[1320px] px-4 pt-5 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-6 lg:px-10 lg:pt-10 lg:pb-16">
        <Suspense fallback={null}>
          <Penjaga />
        </Suspense>
        {children}
      </main>
    </Rangka>
  );
}
