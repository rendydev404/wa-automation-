"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ArrowLeft, Bot, ChartColumnIncreasing, Code2, Ellipsis, LayoutDashboard, LogOut, MessageCircleReply, Package, ScrollText, Settings2, Share2, Users, Wallet } from "lucide-react";
import { logoutAction } from "@/app/actions";
import { BilahBawah, TabBawah, TabLembar } from "@/components/bilah-bawah";

/**
 * `pusat`: hanya di server pusat chatgercep.com (disembunyikan di mesin self-host).
 * `developer`: hanya untuk peran developer (admin pun tidak melihatnya; fitur belum dibuka umum).
 */
type ItemMenu = { href: string; label: string; ikon: typeof Users; tepat?: boolean; pendek?: string; pusat?: boolean; developer?: boolean };

const MENU: ItemMenu[] = [
  { href: "/admin", label: "Ringkasan", ikon: LayoutDashboard, tepat: true },
  { href: "/admin/pengguna", label: "Pengguna", ikon: Users },
  { href: "/admin/paket", label: "Paket & harga", pendek: "Paket", ikon: Package, pusat: true },
  { href: "/admin/transaksi", label: "Transaksi", ikon: Wallet, pusat: true },
  // Setelah Transaksi (indeks 4): empat tab bilah bawah HP tetap sama, Analitik masuk lembar "Lainnya".
  { href: "/admin/analitik", label: "Analitik", ikon: ChartColumnIncreasing },
  { href: "/admin/afiliasi", label: "Afiliasi", ikon: Share2, pusat: true },
  { href: "/admin/developer-api", label: "Developer API", ikon: Code2, pusat: true, developer: true },
  { href: "/admin/followup", label: "Follow-up WA", ikon: MessageCircleReply, pusat: true },
  { href: "/admin/pixel", label: "Meta Pixel", ikon: Activity, pusat: true },
  { href: "/admin/ai", label: "Mesin AI", ikon: Bot },
  { href: "/admin/aturan", label: "Aturan", ikon: Settings2 },
  { href: "/admin/log", label: "Log admin", ikon: ScrollText },
];

const menuUntuk = (mesin: boolean, developer: boolean) => MENU.filter((m) => !(mesin && m.pusat) && (developer || !m.developer));

/** Menu panel admin (terpisah dari menu workspace pengguna). */
export function NavAdmin({ mesin = false, developer = false }: { mesin?: boolean; developer?: boolean }) {
  const jalur = useJalurAdmin();
  const menu = menuUntuk(mesin, developer);
  return (
    <nav aria-label="Menu admin" className="flex flex-1 flex-col px-3 pt-3">
      <p className="px-3 pb-2 text-[11px] font-semibold tracking-[0.08em] text-ink-muted/80 uppercase">Panel admin</p>
      <ul className="space-y-0.5">
        {menu.map((m) => {
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

/**
 * usePathname() tanpa segmen bahasa internal. Saat static shell diprerender, jalurnya berupa jalur hasil rewrite
 * ("/id/admin/log"), sedangkan di peramban jalur URL-nya ("/admin/log"). Tanpa dinormalkan, menu aktif di HTML server
 * berbeda dari klien (penanda aktif hanya ada di klien) -> galat hidrasi React #418 di setiap halaman admin statis.
 */
function useJalurAdmin(): string {
  return (usePathname() ?? "/").replace(/^\/(?:id|en)(?=\/|$)/, "") || "/";
}

const aktifDi = (m: ItemMenu, jalur: string) => (m.tepat ? jalur === m.href : jalur === m.href || jalur.startsWith(`${m.href}/`));

/** Empat menu utama di bilah; sisanya (dan keluar) di lembar "Lainnya". */
const MENU_BILAH = 4;

/** Menu bawah HP untuk panel admin. */
export function NavAdminBawah({ mesin = false, developer = false }: { mesin?: boolean; developer?: boolean }) {
  const jalur = useJalurAdmin();
  const menu = menuUntuk(mesin, developer);
  const lain = menu.slice(MENU_BILAH);
  return (
    <BilahBawah label="Menu admin">
      {menu.slice(0, MENU_BILAH).map((m) => (
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
