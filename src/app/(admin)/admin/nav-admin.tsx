"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ArrowLeft, Bot, Ellipsis, LayoutDashboard, LogOut, Package, ScrollText, Settings2, Share2, Users, Wallet } from "lucide-react";
import { logoutAction } from "@/app/actions";
import { BilahBawah, TabBawah, TabLembar } from "@/components/bilah-bawah";

type ItemMenu = { href: string; label: string; ikon: typeof Users; tepat?: boolean; pendek?: string };

const MENU: ItemMenu[] = [
  { href: "/admin", label: "Ringkasan", ikon: LayoutDashboard, tepat: true },
  { href: "/admin/pengguna", label: "Pengguna", ikon: Users },
  { href: "/admin/paket", label: "Paket & harga", pendek: "Paket", ikon: Package },
  { href: "/admin/transaksi", label: "Transaksi", ikon: Wallet },
  { href: "/admin/afiliasi", label: "Afiliasi", ikon: Share2 },
  { href: "/admin/pixel", label: "Meta Pixel", ikon: Activity },
  { href: "/admin/ai", label: "Mesin AI", ikon: Bot },
  { href: "/admin/aturan", label: "Aturan", ikon: Settings2 },
  { href: "/admin/log", label: "Log admin", ikon: ScrollText },
];

/** Menu panel admin (terpisah dari menu workspace pengguna). */
export function NavAdmin() {
  const jalur = usePathname();
  return (
    <nav aria-label="Menu admin" className="flex flex-1 flex-col px-3 pt-3">
      <p className="px-3 pb-2 text-[11px] font-semibold tracking-[0.08em] text-ink-muted/80 uppercase">Panel admin</p>
      <ul className="space-y-0.5">
        {MENU.map((m) => {
          const aktif = aktifDi(m, jalur);
          return (
            <li key={m.href}>
              <Link
                href={m.href}
                aria-current={aktif ? "page" : undefined}
                className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${aktif ? "bg-ink-raised text-white" : "text-ink-fg/80 hover:bg-ink-raised/60 hover:text-white"}`}
              >
                {aktif && <span aria-hidden className="absolute inset-y-2.5 left-0 w-[3px] rounded-r-full bg-ink-signal" />}
                <span className={`grid size-8 place-items-center rounded-lg ${aktif ? "bg-ink-signal/15 text-ink-signal" : "bg-white/[0.05] text-ink-muted group-hover:text-ink-fg"}`}>
                  <m.ikon className="size-4" aria-hidden />
                </span>
                <span className="text-[13.5px] font-semibold">{m.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto pb-3">
        <Link href="/dashboard" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-ink-muted transition-colors hover:bg-ink-raised hover:text-ink-fg">
          <ArrowLeft className="size-4" aria-hidden /> Kembali ke workspace
        </Link>
      </div>
    </nav>
  );
}

const aktifDi = (m: ItemMenu, jalur: string) => (m.tepat ? jalur === m.href : jalur === m.href || jalur.startsWith(`${m.href}/`));

/** Empat menu utama di bilah; sisanya (dan keluar) di lembar "Lainnya". */
const MENU_BILAH = 4;

/** Menu bawah HP untuk panel admin. */
export function NavAdminBawah() {
  const jalur = usePathname();
  const lain = MENU.slice(MENU_BILAH);
  return (
    <BilahBawah label="Menu admin">
      {MENU.slice(0, MENU_BILAH).map((m) => (
        <TabBawah key={m.href} href={m.href} label={m.pendek ?? m.label} aktif={aktifDi(m, jalur)} ikon={<m.ikon className="size-5" aria-hidden />} />
      ))}
      <TabLembar label="Lainnya" judul="Menu admin lainnya" aktif={lain.some((m) => aktifDi(m, jalur))} ikon={<Ellipsis className="size-5" aria-hidden />}>
        <ul className="space-y-0.5">
          {lain.map((m) => {
            const aktif = aktifDi(m, jalur);
            return (
              <li key={m.href}>
                <Link
                  href={m.href}
                  aria-current={aktif ? "page" : undefined}
                  className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${aktif ? "bg-ink-raised text-white" : "text-ink-fg/80 hover:bg-ink-raised/60 hover:text-white"}`}
                >
                  <span className={`grid size-8 place-items-center rounded-lg ${aktif ? "bg-ink-signal/15 text-ink-signal" : "bg-white/[0.05] text-ink-muted group-hover:text-ink-fg"}`}>
                    <m.ikon className="size-4" aria-hidden />
                  </span>
                  <span className="text-[13.5px] font-semibold">{m.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 space-y-0.5 border-t border-ink-line pt-3">
          <Link href="/dashboard" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold text-ink-muted transition-colors hover:bg-ink-raised hover:text-ink-fg">
            <ArrowLeft className="size-4" aria-hidden /> Kembali ke workspace
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold text-ink-muted transition-colors hover:bg-ink-raised hover:text-ink-fg"
            >
              <LogOut className="size-4" aria-hidden /> Keluar
            </button>
          </form>
        </div>
      </TabLembar>
    </BilahBawah>
  );
}
