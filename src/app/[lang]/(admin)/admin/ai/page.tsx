import { Suspense } from "react";
import { MesinAi } from "../bagian";

export default function HalamanAi() {
  return (
    <div className="space-y-6 lg:space-y-8">
      <div>
        <p className="text-[11.5px] font-semibold tracking-[0.08em] text-accent uppercase">Panel admin</p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-[28px]">Mesin AI</h1>
        <p className="mt-1 max-w-2xl text-muted">Pilih penyedia AI untuk semua nomor, model utama & cadangan, dan pantau biaya per balasan.</p>
      </div>
      <div className="max-w-2xl">
        <Suspense fallback={<div aria-hidden className="card h-96 animate-denyut" />}>
          <MesinAi />
        </Suspense>
      </div>
    </div>
  );
}
