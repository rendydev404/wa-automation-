import { Suspense } from "react";
import { KerangkaKpi, KpiRingkasan } from "./kpi";

export default function HalamanRingkasan() {
  return (
    <div className="space-y-6 lg:space-y-8">
      <div>
        <p className="text-[11.5px] font-semibold tracking-[0.08em] text-accent uppercase">Panel admin</p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-[28px]">Ringkasan</h1>
        <p className="mt-1 max-w-2xl text-muted">Kinerja layanan 30 hari terakhir: pendapatan, pelanggan, pemakaian AI, dan hal yang perlu ditindaklanjuti.</p>
      </div>
      <Suspense fallback={<KerangkaKpi />}>
        <KpiRingkasan />
      </Suspense>
    </div>
  );
}
