import { Suspense } from "react";
import type { Viewport } from "next";
import { LogOut } from "lucide-react";
import { logoutAction } from "@/app/actions";
import { BannerAkun } from "@/components/banner-akun";
import { NavBawah, NavBawahKerangka, NavKerangka, NavUtama, StatusLayanan, TombolPanduanAtas } from "@/components/navigasi";
import { Rangka } from "@/components/rangka";
import { PenyediaTur } from "@/components/tur";
import { WaStatusProvider } from "@/components/wa-status";
import { nomorMilik } from "@/lib/numbers";
import { requireUser } from "@/lib/session";

export const viewport: Viewport = { themeColor: "#0b1813" };

/**
 * Daftar nomor milik pengguna untuk sidebar (desktop) atau bilah bawah (HP): dari cache memori (tanpa query);
 * pemeriksaan sesi dibagi dengan halaman, jadi dipanggil dua kali pun tidak menambah query.
 */
async function NavData({ bawah = false }: { bawah?: boolean }) {
  const user = await requireUser();
  const nomor = (await nomorMilik(user.id)).map((n) => ({ id: n.id, label: n.label, wa_id: n.wa_id }));
  const props = { nomor, admin: user.peran === "admin", pengguna: { nama: user.nama || user.email.split("@")[0], email: user.email } };
  return bawah ? <NavBawah {...props} /> : <NavUtama {...props} />;
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <WaStatusProvider>
      <PenyediaTur>
      <Rangka
        aksiAtas={
          <Suspense fallback={<span aria-hidden className="block h-10 w-24" />}>
            <TombolPanduanAtas />
          </Suspense>
        }
        bawah={
          <Suspense fallback={<NavBawahKerangka />}>
            <NavData bawah />
          </Suspense>
        }
        sidebar={
          <>
            {/* Tanpa min-h-0: nav tidak boleh menyusut di bawah isinya; bila layar terlalu pendek, sidebar yang digulir. */}
            <nav aria-label="Navigasi utama" className="flex flex-1 flex-col">
              <Suspense fallback={<NavKerangka />}>
                <NavData />
              </Suspense>
            </nav>
            <div className="space-y-2 border-t border-ink-line p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pendek:space-y-1 pendek:py-2">
              <StatusLayanan />
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-ink-muted transition-colors hover:bg-ink-raised hover:text-ink-fg pendek:py-2"
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
            <BannerAkun />
          </Suspense>
          {children}
        </main>
      </Rangka>
      </PenyediaTur>
    </WaStatusProvider>
  );
}
