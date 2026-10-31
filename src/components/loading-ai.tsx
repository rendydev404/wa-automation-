"use client";

import { useEffect, useState } from "react";

/**
 * Tampilan "AI sedang merapikan": kertas dokumen yang terisi pelan-pelan, satu teks status yang berganti halus, bilah
 * progres tipis, dan penghitung detik. Langkahnya hanya perkiraan waktu; langkah terakhir menunggu sampai AI selesai.
 * Gerakan berhenti otomatis bagi pengguna yang meminta gerakan dikurangi (aturan global di globals.css).
 */

const LANGKAH = [
  { dari: 0, teks: "Membaca tulisan Anda" },
  { dari: 4, teks: "Menyusun menu, harga, dan jam buka" },
  { dari: 11, teks: "Memeriksa angka, alamat, dan nomor" },
  { dari: 19, teks: "Menyusun jadi dokumen yang rapi" },
] as const;

// Lebar baris pada kertas (persen).
const BARIS = [100, 88, 94, 62, 100, 80, 46];

export function LoadingAi({ judul, onBatal }: { judul: string; onBatal: () => void }) {
  const [detik, setDetik] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setDetik((d) => d + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const aktif = LANGKAH.reduce((n, l, i) => (detik >= l.dari ? i : n), 0);

  return (
    <div role="status" className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      {/* Bilah progres tak tentu */}
      <div aria-hidden className="relative h-0.5 overflow-hidden bg-accent-soft">
        <span className="absolute inset-y-0 left-0 w-1/3 animate-sapu rounded-full bg-accent" />
      </div>

      <div className="flex flex-col items-center px-6 pt-8 pb-6 text-center">
        {/* Kertas dokumen */}
        <div aria-hidden className="relative w-52 overflow-hidden rounded-xl border border-line bg-surface p-4 shadow-pop">
          <span className="block h-2.5 w-2/5 origin-left animate-tulis rounded-full bg-accent" />
          <div className="mt-4 space-y-2.5">
            {BARIS.map((l, i) => (
              <span key={i} className="block h-1.5 origin-left animate-tulis rounded-full bg-line-strong/60" style={{ width: `${l}%`, animationDelay: `${0.25 + i * 0.3}s` }} />
            ))}
          </div>
          <span className="absolute inset-y-0 left-0 w-1/2 animate-sapu bg-gradient-to-r from-transparent via-white/70 to-transparent" />
        </div>

        <p className="mt-6 text-[15px] font-bold tracking-tight">{judul}</p>
        {/* key = teks: tiap pergantian langkah memicu animasi masuk */}
        <p key={aktif} className="mt-1 animate-masuk text-[13.5px] text-muted">
          {LANGKAH[aktif].teks}…
        </p>

        {/* Penanda langkah */}
        <ol aria-label="Langkah" className="mt-5 flex w-52 gap-1.5">
          {LANGKAH.map((l, i) => (
            <li key={l.teks} className={`h-1 flex-1 rounded-full transition-colors duration-700 ${i <= aktif ? "bg-accent" : "bg-line"}`}>
              <span className="sr-only">
                {l.teks} {i < aktif ? "(selesai)" : i === aktif ? "(sedang dikerjakan)" : "(menunggu)"}
              </span>
            </li>
          ))}
        </ol>

        <p className="mt-4 max-w-xs text-[12px] text-faint">Harga, jam, dan alamat tetap persis seperti yang Anda tulis.</p>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
        <span className="text-[12px] text-faint tabular-nums">Biasanya 10–40 detik · {detik} dtk</span>
        <button type="button" onClick={onBatal} className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-muted transition-colors hover:bg-subtle hover:text-fg">
          Batal
        </button>
      </div>
    </div>
  );
}
