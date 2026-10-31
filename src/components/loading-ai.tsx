"use client";

import { useEffect, useState } from "react";
import { Check, Sparkles } from "lucide-react";

/**
 * Tampilan "AI sedang bekerja": orb bercahaya, dokumen yang seolah ditulis baris demi baris, dan daftar langkah yang
 * maju seiring waktu (hanya perkiraan; langkah terakhir menunggu sampai AI benar-benar selesai). Semua gerakan dihiasi
 * aria-hidden dan otomatis berhenti bagi pengguna yang meminta gerakan dikurangi (aturan global di globals.css).
 */

const LANGKAH = [
  { dari: 0, teks: "Membaca tulisan Anda" },
  { dari: 4, teks: "Menyusun menu, harga, dan jam buka" },
  { dari: 11, teks: "Memeriksa angka, alamat, dan nomor" },
  { dari: 19, teks: "Menyusun jadi dokumen yang rapi" },
] as const;

// Lebar baris dokumen (persen); beberapa pendek seperti ujung paragraf.
const BARIS = [92, 78, 100, 64, 86, 48, 95, 70];

export function LoadingAi({ judul, onBatal }: { judul: string; onBatal: () => void }) {
  const [detik, setDetik] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setDetik((d) => d + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const aktif = LANGKAH.reduce((n, l, i) => (detik >= l.dari ? i : n), 0);

  return (
    <div role="status" className="relative overflow-hidden rounded-2xl bg-ink p-5 text-ink-fg shadow-pop sm:p-7">
      <div aria-hidden className="kisi-tinta pointer-events-none absolute inset-0 opacity-80" />
      <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-ink-signal/20 blur-3xl" />

      <div className="relative grid items-center gap-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-8">
        {/* Orb */}
        <div aria-hidden className="relative mx-auto grid size-24 shrink-0 place-items-center">
          <span className="absolute inset-0 animate-cincin rounded-full border border-ink-signal/60" />
          <span className="absolute inset-0 animate-cincin rounded-full border border-ink-signal/40 [animation-delay:1.2s]" />
          <span
            className="absolute inset-2 animate-putar rounded-full"
            style={{ background: "conic-gradient(from 0deg, transparent 0 55%, var(--c-ink-signal) 100%)" }}
          />
          <span className="absolute inset-[11px] rounded-full bg-ink" />
          <span className="relative grid size-14 animate-melayang place-items-center rounded-full bg-ink-raised text-ink-signal shadow-[0_0_28px_-4px_var(--c-ink-signal)]">
            <Sparkles className="size-6" />
          </span>
        </div>

        <div className="min-w-0">
          <p className="text-center text-[16px] font-bold tracking-tight sm:text-left">{judul}</p>
          <p className="mt-1 text-center text-[12.5px] text-ink-muted sm:text-left">Harga, jam, dan alamat tetap persis seperti yang Anda tulis.</p>

          {/* Dokumen yang sedang "ditulis" */}
          <div aria-hidden className="relative mt-4 space-y-2 overflow-hidden rounded-xl border border-ink-line bg-white/[0.03] p-3.5">
            {BARIS.map((l, i) => (
              <span
                key={i}
                className="block h-2 origin-left animate-tulis rounded-full bg-ink-fg/15"
                style={{ width: `${l}%`, animationDelay: `${i * 0.35}s` }}
              />
            ))}
            <span className="absolute inset-y-0 left-0 w-1/3 animate-sapu bg-gradient-to-r from-transparent via-ink-signal/20 to-transparent" />
          </div>
        </div>
      </div>

      {/* Langkah */}
      <ol className="relative mt-5 grid gap-1.5 text-[13px] sm:grid-cols-2">
        {LANGKAH.map((l, i) => {
          const selesai = i < aktif;
          const sekarang = i === aktif;
          return (
            <li key={l.teks} className={`flex items-center gap-2.5 transition-colors duration-500 ${selesai ? "text-ink-fg/80" : sekarang ? "font-semibold text-ink-fg" : "text-ink-muted/70"}`}>
              <span
                aria-hidden
                className={`grid size-5 shrink-0 place-items-center rounded-full transition-all duration-500 ${
                  selesai ? "bg-ink-signal text-ink" : sekarang ? "border-2 border-ink-signal" : "border border-ink-line"
                }`}
              >
                {selesai ? <Check className="size-3" strokeWidth={3} /> : sekarang ? <span className="size-1.5 animate-denyut rounded-full bg-ink-signal" /> : null}
              </span>
              {l.teks}
              <span className="sr-only">{selesai ? "(selesai)" : sekarang ? "(sedang dikerjakan)" : "(menunggu)"}</span>
            </li>
          );
        })}
      </ol>

      <div className="relative mt-5 flex items-center justify-between gap-3 border-t border-ink-line pt-4">
        <span className="text-[12px] text-ink-muted tabular-nums">Biasanya 10–40 detik · {detik} dtk</span>
        <button type="button" onClick={onBatal} className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-ink-muted transition-colors hover:bg-ink-raised hover:text-ink-fg">
          Batal
        </button>
      </div>
    </div>
  );
}
