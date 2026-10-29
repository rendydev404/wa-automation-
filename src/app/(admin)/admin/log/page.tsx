import { Suspense } from "react";
import { Log } from "../bagian";

export default function HalamanLog() {
  return (
    <div className="space-y-6 lg:space-y-8">
      <div>
        <p className="text-[11.5px] font-semibold tracking-[0.08em] text-accent uppercase">Panel admin</p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-[28px]">Log admin</h1>
        <p className="mt-1 max-w-2xl text-muted">Jejak semua tindakan admin.</p>
      </div>
      <div className="max-w-3xl">
        <Suspense fallback={<div aria-hidden className="card h-96 animate-denyut" />}>
          <Log batas={100} />
        </Suspense>
      </div>
    </div>
  );
}
