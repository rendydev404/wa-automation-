import type { ReactNode } from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";

/** Rangka halaman masuk/daftar: panel merek gelap di kiri (desktop), kartu formulir di kanan. */
export function KartuAuth({ judul, sub, children, kaki }: { judul: string; sub: string; children: ReactNode; kaki: ReactNode }) {
  return (
    <main className="grid min-h-svh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <aside className="relative hidden overflow-hidden bg-ink p-10 text-ink-fg lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="kisi-tinta absolute inset-0 opacity-70" />
        <div aria-hidden className="absolute -top-32 -left-24 size-[420px] rounded-full bg-ink-signal/20 blur-3xl" />
        <Link href="/" className="relative flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-ink-signal text-ink">
            <MessageCircle className="size-5" strokeWidth={2.4} aria-hidden />
          </span>
          <span className="text-[16px] font-bold tracking-tight">Asisten WhatsApp</span>
        </Link>
        <div className="relative max-w-md">
          <p className="text-[28px] leading-tight font-bold tracking-tight">Balas pelanggan dalam hitungan detik, bahkan saat Anda tidur.</p>
          <ul className="mt-6 space-y-3 text-[14px] text-ink-muted">
            <li>• Sambungkan WhatsApp cukup dengan scan QR</li>
            <li>• AI menjawab dari base knowledge usaha Anda</li>
            <li>• Anda tetap bisa membalas sendiri kapan saja</li>
          </ul>
        </div>
        <p className="relative text-[12px] text-ink-muted">Sesi terenkripsi · Password di-hash scrypt · Data tiap akun terpisah</p>
      </aside>
      <div className="grid place-items-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-7 flex flex-col items-center text-center lg:items-start lg:text-left">
            <Link href="/" className="mb-4 grid size-12 place-items-center rounded-2xl bg-accent text-on-accent lg:hidden" aria-label="Beranda">
              <MessageCircle className="size-6" aria-hidden />
            </Link>
            <h1 className="text-2xl font-bold tracking-tight">{judul}</h1>
            <p className="mt-1 text-[13.5px] text-muted">{sub}</p>
          </div>
          <div className="card p-6">{children}</div>
          <p className="mt-5 text-center text-[13px] text-muted">{kaki}</p>
        </div>
      </div>
    </main>
  );
}
