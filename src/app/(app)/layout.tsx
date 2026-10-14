import Link from "next/link";
import { LogOut, MessageCircle } from "lucide-react";
import { logoutAction } from "@/app/actions";
import { WaStatusProvider } from "@/components/wa-status";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <WaStatusProvider>
      <header className="sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-xl bg-accent text-on-accent">
              <MessageCircle className="size-[18px]" aria-hidden />
            </span>
            <span className="text-[15px] font-bold tracking-tight">Asisten WhatsApp</span>
          </Link>
          <form action={logoutAction}>
            <button type="submit" className="btn btn-ghost h-9 border-transparent px-3 text-muted">
              <LogOut className="size-4" aria-hidden />
              Keluar
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pt-8 pb-20 sm:px-6">{children}</main>
    </WaStatusProvider>
  );
}
