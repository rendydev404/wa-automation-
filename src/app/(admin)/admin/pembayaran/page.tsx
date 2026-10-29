import { Suspense } from "react";
import { Pembayaran } from "../bagian";

export default function HalamanPembayaran() {
  return (
    <div className="space-y-6 lg:space-y-8">
      <div>
        <p className="text-[11.5px] font-semibold tracking-[0.08em] text-accent uppercase">Panel admin</p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-[28px]">Pembayaran</h1>
        <p className="mt-1 max-w-2xl text-muted">Status Midtrans Snap. Kunci dipasang developer di server.</p>
      </div>
      <div className="max-w-2xl">
        <Suspense fallback={<div aria-hidden className="card h-64 animate-denyut" />}>
          <Pembayaran />
        </Suspense>
      </div>
    </div>
  );
}
