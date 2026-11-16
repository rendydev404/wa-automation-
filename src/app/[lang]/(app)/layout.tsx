import { Suspense } from "react";
import type { Viewport } from "next";
import { LogOut } from "lucide-react";
import { logoutAction } from "@/app/actions";
import { BannerAkun } from "@/components/banner-akun";
import { BannerSandbox } from "@/components/banner-sandbox";
import { LoncengNotifikasi } from "@/components/notifikasi";
import { GantiBahasa } from "@/components/ganti-bahasa";
import { NavBawah, NavBawahKerangka, NavKerangka, NavUtama, StatusLayanan, TombolPanduanAtas } from "@/components/navigasi";
import { Rangka } from "@/components/rangka";
import { PenyediaTur } from "@/components/tur";
import { WaStatusProvider } from "@/components/wa-status";
import { teksHalaman } from "@/lib/bahasa-halaman";
import { nomorMilik } from "@/lib/numbers";
import { requireUser } from "@/lib/session";
import { staf } from "@/lib/peran";
import { modeMesin } from "@/lib/mode";
import { cookies } from "next/headers";
import { COOKIE_VOUCHER } from "@/lib/voucher-def";
import { ModalVoucher } from "@/components/modal-voucher";

export const viewport: Viewport = { themeColor: "#0b1813" };

/**
 * Daftar nomor milik pengguna untuk sidebar (desktop) atau bilah bawah (HP): dari cache memori (tanpa query);
 * pemeriksaan sesi dibagi dengan halaman, jadi dipanggil dua kali pun tidak menambah query.
 */
async function NavData({ bawah = false }: { bawah?: boolean }) {
  const user = await requireUser();
  const nomor = (await nomorMilik(user.id)).map((n) => ({ id: n.id, label: n.label, wa_id: n.wa_id }));
  const props = { nomor, admin: staf(user.peran), developer: !modeMesin() && !!user.aksesApi, pengguna: { nama: user.nama || user.email.split("@")[0], email: user.email } };
  return bawah ? <NavBawah {...props} /> : <NavUtama {...props} />;
}

/**
 * Modal klaim voucher: muncul otomatis bila pengguna datang dari tautan "Klaim voucher" di email pembelian
 * (kode disimpan di cookie oleh proxy.ts, jadi tetap terbawa melewati login / daftar / Google). Tanpa cookie = tanpa query.
 */
async function ModalVoucherOtomatis() {
  const kode = (await cookies()).get(COOKIE_VOUCHER)?.value;
  if (!kode || modeMesin()) return null;
  const user = await requireUser();
  if (staf(user.peran)) return null;
  const { infoVoucherModal } = await import("@/lib/voucher");
  const info = await infoVoucherModal(kode, user.id);
  return info ? <ModalVoucher info={info} /> : null;
}

export default async function AppLayout({ children }: LayoutProps<"/[lang]">) {
  const { t } = await teksHalaman();
  return (
    <WaStatusProvider>
      <PenyediaTur>
      <Rangka
        aksiSidebar={<LoncengNotifikasi gelap />}
        aksiAtas={
          <>
            <LoncengNotifikasi gelap />
            <Suspense fallback={<span aria-hidden className="block h-10 w-24" />}>
              <TombolPanduanAtas />
            </Suspense>
          </>
        }
        bawah={
          <Suspense fallback={<NavBawahKerangka />}>
            <NavData bawah />
          </Suspense>
        }
        sidebar={
          <>
            {/* Tanpa min-h-0: nav tidak boleh menyusut di bawah isinya; bila layar terlalu pendek, sidebar yang digulir. */}
            <nav aria-label={t("Navigasi utama", "Main navigation")} className="flex flex-1 flex-col">
              <Suspense fallback={<NavKerangka />}>
                <NavData />
              </Suspense>
            </nav>
            <div className="space-y-2 border-t border-ink-line p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pendek:space-y-1 pendek:py-2">
              <StatusLayanan />
              <div className="flex items-center gap-1">
                <form action={logoutAction} className="min-w-0 flex-1">
                  <button
                    type="submit"
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-ink-muted transition-colors hover:bg-ink-raised hover:text-ink-fg pendek:py-2"
                  >
                    <LogOut className="size-4" aria-hidden />
                    {t("Keluar", "Sign out")}
                  </button>
                </form>
                <GantiBahasa gelap className="shrink-0" />
              </div>
            </div>
          </>
        }
      >
        <main className="mx-auto w-full max-w-[1320px] px-4 pt-5 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-6 lg:px-10 lg:pt-10 lg:pb-16">
          <Suspense fallback={null}>
            <BannerSandbox />
          </Suspense>
          <Suspense fallback={null}>
            <BannerAkun />
          </Suspense>
          {children}
          <Suspense fallback={null}>
            <ModalVoucherOtomatis />
          </Suspense>
        </main>
      </Rangka>
      </PenyediaTur>
    </WaStatusProvider>
  );
}
