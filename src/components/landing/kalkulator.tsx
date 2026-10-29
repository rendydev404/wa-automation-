"use client";

import { useState } from "react";

/** Perkiraan waktu yang dihemat: rata-rata 1,5 menit mengetik balasan per pesan, ±92% dijawab AI. */
export function Kalkulator() {
  const [pesan, setPesan] = useState(80);
  const jamBulan = Math.round((pesan * 30 * 1.5 * 0.92) / 60);
  return (
    <div className="rounded-3xl border border-line bg-surface p-6 shadow-card sm:p-8">
      <label htmlFor="pesan-hari" className="flex items-baseline justify-between gap-3">
        <span className="text-[14px] font-semibold">Pesan pelanggan per hari</span>
        <span className="text-2xl font-bold text-accent tabular-nums">{pesan}</span>
      </label>
      <input
        id="pesan-hari"
        type="range"
        min={10}
        max={500}
        step={10}
        value={pesan}
        onChange={(e) => setPesan(Number(e.target.value))}
        className="mt-4 w-full accent-[var(--c-accent)]"
      />
      <div className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-6">
        <div>
          <p className="text-[12.5px] font-semibold text-muted">Waktu dihemat / bulan</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">
            {jamBulan} <span className="text-base font-semibold text-muted">jam</span>
          </p>
        </div>
        <div>
          <p className="text-[12.5px] font-semibold text-muted">Pelanggan menunggu</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">
            &lt;10 <span className="text-base font-semibold text-muted">detik</span>
          </p>
        </div>
      </div>
      <p className="mt-4 text-[12px] text-faint">Perkiraan: 1,5 menit per balasan manual, ±92% pesan dijawab AI.</p>
    </div>
  );
}
