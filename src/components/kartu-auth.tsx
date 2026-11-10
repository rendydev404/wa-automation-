import type { ReactNode } from "react";
import Link from "@/components/link";
import { GantiBahasa } from "@/components/ganti-bahasa";
import { Logo } from "@/components/logo";
import { teksHalaman } from "@/lib/bahasa-halaman";
import { MEREK, PERUSAHAAN } from "@/lib/merek";

/** Rangka halaman masuk/daftar: panel merek gelap di kiri (desktop), kartu formulir di kanan. */
export async function KartuAuth({ judul, sub, children, kaki }: { judul: string; sub: string; children: ReactNode; kaki: ReactNode }) {
  const { t } = await teksHalaman();
  const keBeranda = t(`${MEREK}, ke beranda`, `${MEREK}, go to home page`);
  return (
    <main className="grid min-h-svh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <aside className="relative hidden overflow-hidden bg-ink p-10 text-ink-fg lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="kisi-tinta absolute inset-0 opacity-70" />
        <div aria-hidden className="absolute -top-32 -left-24 size-[420px] rounded-full bg-ink-signal/20 blur-3xl" />
        <Link href="/" className="relative self-start rounded-lg" aria-label={keBeranda}>
          <Logo ukuran="md" gelap />
        </Link>
        <div className="relative max-w-md">
          <p className="text-[28px] leading-tight font-bold tracking-tight">
            {t("Balas pelanggan dalam hitungan detik, bahkan saat Anda tidur.", "Reply to customers in seconds, even while you sleep.")}
          </p>
          <ul className="mt-6 space-y-3 text-[14px] text-ink-muted">
            <li>• {t("Sambungkan WhatsApp cukup dengan scan QR", "Connect WhatsApp by simply scanning a QR code")}</li>
            <li>• {t("AI menjawab dari Informasi Usaha Anda", "AI answers from your Business Info")}</li>
            <li>• {t("Anda tetap bisa membalas sendiri kapan saja", "You can still reply yourself at any time")}</li>
          </ul>
        </div>
        <p className="relative text-[12px] text-ink-muted">
          {t(
            "Sesi terenkripsi · Password di-hash scrypt · Data tiap akun terpisah",
            "Encrypted sessions · Passwords hashed with scrypt · Each account's data kept separate",
          )}
        </p>
      </aside>
      <div className="relative grid place-items-center px-4 py-10">
        <GantiBahasa className="absolute top-3 right-3" />
        <div className="w-full max-w-sm">
          <div className="mb-7 flex flex-col items-center text-center lg:items-start lg:text-left">
            <Link href="/" className="mb-6 rounded-lg lg:hidden" aria-label={keBeranda}>
              <Logo ukuran="lg" />
            </Link>
            <h1 className="text-2xl font-bold tracking-tight">{judul}</h1>
            <p className="mt-1 text-[13.5px] text-muted">{sub}</p>
          </div>
          <div className="card p-6">{children}</div>
          <p className="mt-5 text-center text-[13px] text-muted">{kaki}</p>
          <p className="mt-6 text-center text-[11.5px] text-faint">&copy; {PERUSAHAAN}</p>
        </div>
      </div>
    </main>
  );
}
