import { Suspense } from "react";
import Link from "next/link";
import { Log, Ringkasan } from "./bagian";

export default function HalamanRingkasan() {
  return (
    <div className="space-y-6 lg:space-y-8">
      <div>
        <p className="text-[11.5px] font-semibold tracking-[0.08em] text-accent uppercase">Panel admin</p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-[28px]">Ringkasan</h1>
        <p className="mt-1 max-w-2xl text-muted">Kondisi sistem: akun, nomor WhatsApp, dan tindakan admin terakhir.</p>
      </div>
      <Suspense fallback={<div aria-hidden className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="card h-32 animate-denyut" />)}</div>}>
        <Ringkasan />
      </Suspense>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["/admin/pengguna", "Pengguna", "Kuota, blokir, reset password, paket per akun"],
          ["/admin/paket", "Paket & harga", "Margin keuntungan & simulasi pratinjau paket"],
          ["/admin/ai", "Mesin AI", "Hermes atau Claude API, model, biaya per balasan"],
          ["/admin/aturan", "Aturan", "Pendaftaran, kuota gratis, aturan AI untuk semua bot"],
        ].map(([href, judul, isi]) => (
          <Link key={href} href={href} className="card p-5 transition-colors hover:border-accent/40">
            <p className="text-[14px] font-bold">{judul}</p>
            <p className="mt-1 text-[12.5px] text-muted">{isi}</p>
          </Link>
        ))}
      </div>
      <Suspense fallback={<div aria-hidden className="card h-72 animate-denyut" />}>
        <Log />
      </Suspense>
    </div>
  );
}
