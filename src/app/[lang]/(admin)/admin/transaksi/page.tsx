import { Suspense } from "react";
import { MetodeBayar, Transaksi } from "../bagian";

export default function HalamanTransaksi() {
  return (
    <div className="space-y-6 lg:space-y-8">
      <div>
        <p className="text-[11.5px] font-semibold tracking-[0.08em] text-accent uppercase">Panel admin</p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-[28px]">Transaksi</h1>
        <p className="mt-1 max-w-2xl text-muted">Pembayaran paket lewat Midtrans dan metode yang tampil di halaman bayar.</p>
      </div>
      <Suspense fallback={<div aria-hidden className="card h-72 animate-denyut" />}>
        <MetodeBayar />
      </Suspense>
      <Suspense fallback={<div aria-hidden className="card h-96 animate-denyut" />}>
        <Transaksi />
      </Suspense>
    </div>
  );
}
