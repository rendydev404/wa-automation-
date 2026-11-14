import { Suspense } from "react";
import { KelolaPaket, KelolaPaketCustom, KelolaVoucher } from "../bagian";

export default function HalamanPaket() {
  return (
    <div className="space-y-6 lg:space-y-8">
      <div>
        <p className="text-[11.5px] font-semibold tracking-[0.08em] text-accent uppercase">Panel admin</p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-[28px]">Paket & harga</h1>
        <p className="mt-1 max-w-2xl text-muted">Atur margin keuntungan, paket berlangganan, serta spesifikasi Voucher Panduan Produk Digital.</p>
      </div>
      <Suspense fallback={<div aria-hidden className="card h-[640px] animate-denyut" />}>
        <KelolaPaket />
      </Suspense>
      <Suspense fallback={<div aria-hidden className="card h-[520px] animate-denyut" />}>
        <KelolaVoucher />
      </Suspense>
      <Suspense fallback={<div aria-hidden className="card h-[900px] animate-denyut" />}>
        <KelolaPaketCustom />
      </Suspense>
    </div>
  );
}
