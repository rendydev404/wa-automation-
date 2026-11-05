import { Suspense } from "react";
import { MetodeBayar } from "../bagian";
import { DaftarTransaksi, RingkasanTransaksi } from "./bagian-transaksi";

export default function HalamanTransaksi(props: PageProps<"/[lang]/admin/transaksi">) {
  return (
    <div className="space-y-6 lg:space-y-8">
      <div>
        <p className="text-[11.5px] font-semibold tracking-[0.08em] text-accent uppercase">Panel admin</p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-[28px]">Transaksi</h1>
        <p className="mt-1 max-w-2xl text-muted">
          Siapa membeli paket apa, berapa, lewat apa, dan kapan. Cari dengan ID pembelian (sama dengan yang dilihat pelanggan di halaman Langganan), email, nama, atau ID pengguna.
        </p>
      </div>
      <Suspense fallback={<div aria-hidden className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="card h-[118px] animate-denyut" />)}</div>}>
        <RingkasanTransaksi />
      </Suspense>
      <Suspense fallback={<div aria-hidden className="card h-[520px] animate-denyut" />}>
        <DaftarTransaksi searchParams={props.searchParams} />
      </Suspense>
      <Suspense fallback={<div aria-hidden className="card h-72 animate-denyut" />}>
        <MetodeBayar />
      </Suspense>
    </div>
  );
}
