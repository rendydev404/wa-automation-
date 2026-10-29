import { Suspense } from "react";
import type { Viewport } from "next";
import { LogOut } from "lucide-react";
import { logoutAction } from "@/app/actions";
import { NavKerangka, NavUtama, StatusLayanan } from "@/components/navigasi";
import { Rangka } from "@/components/rangka";
import { WaStatusProvider } from "@/components/wa-status";
import { nomorMilik } from "@/lib/numbers";
import { requireUser } from "@/lib/session";

export const viewport: Viewport = { themeColor: "#0b1813" };

/** Daftar nomor milik pengguna di sidebar: dari cache memori (tanpa query); pemeriksaan sesi dibagi dengan halaman. */
async function NavData() {
  const user = await requireUser();
  const nomor = (await nomorMilik(user.id)).map((n) => ({ id: n.id, label: n.label, wa_id: n.wa_id }));
  return <NavUtama nomor={nomor} admin={user.peran === "admin"} pengguna={{ nama: user.nama || user.email.split("@")[0], email: user.email }} />;
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <WaStatusProvider>
      <Rangka
        sidebar={
          <>
            <nav aria-label="Navigasi utama" className="flex min-h-0 flex-1 flex-col">
              <Suspense fallback={<NavKerangka />}>
                <NavData />
              </Suspense>
            </nav>
            <div className="space-y-2 border-t border-ink-line p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              <StatusLayanan />
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
        <main className="mx-auto w-full max-w-[1320px] px-4 pt-6 pb-[calc(4rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-10 lg:pt-10">{children}</main>
      </Rangka>
    </WaStatusProvider>
  );
}
