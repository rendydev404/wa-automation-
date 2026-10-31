"use client";

import { useId, useState } from "react";
import { angka } from "@/lib/format";
import { persen, type TitikHari } from "@/lib/tren";

const SERI = [
  { kunci: "masuk", label: "Pesan masuk", warna: "var(--c-seri-masuk)" },
  { kunci: "dibalas", label: "Dibalas AI", warna: "var(--c-seri-dibalas)" },
] as const;

/** Batas atas sumbu yang bulat dan genap, supaya garis tengahnya juga bilangan bulat. */
function batasAtas(n: number): number {
  if (n <= 2) return 2;
  const p = 10 ** Math.floor(Math.log10(n));
  return [1, 2, 4, 6, 8, 10].find((k) => k * p >= n)! * p;
}

/**
 * Kolom berkelompok per hari (HTML/CSS, tanpa pustaka grafik): lebar mengikuti wadah tanpa diukur,
 * teks tetap tajam. Tooltip saat disorot/disentuh/fokus; tabel tersembunyi untuk pembaca layar.
 * Lebih dari 7 hari: label sumbu berupa tanggal dan hanya selang-seling (tanggal lengkap ada di tooltip).
 */
export function GrafikAktivitas({
  titik,
  judul = "Aktivitas 7 hari terakhir",
  penuh = false,
}: {
  titik: TitikHari[];
  judul?: string;
  /** Tinggi grafik ikut mengisi kartu (bila kartu diregangkan baris grid). */
  penuh?: boolean;
}) {
  const [aktif, setAktif] = useState<number | null>(null);
  const idJudul = useId();
  const n = titik.length;
  const rapat = n > 7;
  const atas = batasAtas(Math.max(0, ...titik.flatMap((t) => [t.masuk, t.dibalas])));
  const totalMasuk = titik.reduce((a, t) => a + t.masuk, 0);
  const totalDibalas = titik.reduce((a, t) => a + t.dibalas, 0);
  const rasio = persen(totalDibalas, totalMasuk);
  const sorot = aktif === null ? null : titik[aktif];
  const kiri = aktif !== null && aktif < n / 2;

  return (
    <section aria-labelledby={idJudul} className="card flex min-w-0 flex-col p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <h2 id={idJudul} className="text-[15px] font-bold tracking-tight">
            {judul}
          </h2>
          <p className="hint mt-0.5">
            {angka(totalMasuk)} pesan masuk · {angka(totalDibalas)} dibalas AI{rasio !== null && ` (${rasio}%)`}
          </p>
        </div>
        <ul className="flex items-center gap-4 text-xs font-medium text-muted">
          {SERI.map((s) => (
            <li key={s.kunci} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px]" style={{ background: s.warna }} />
              {s.label}
            </li>
          ))}
        </ul>
      </div>

      <div className={`relative mt-6 select-none ${penuh ? "min-h-52 flex-1 sm:min-h-60" : "h-52 sm:h-60"}`} onPointerLeave={() => setAktif(null)}>
        <div aria-hidden className="absolute inset-x-0 top-0 bottom-6">
          {[atas, atas / 2, 0].map((v, i) => (
            <div key={i} className="absolute inset-x-0 flex -translate-y-1/2 items-center gap-2" style={{ top: `${i * 50}%` }}>
              <span className="w-7 text-right text-[11px] text-faint tabular-nums">{angka(v)}</span>
              <span className="h-px flex-1 bg-line" />
            </div>
          ))}
        </div>

        <div className="absolute top-0 right-0 bottom-6 left-9 flex">
          {titik.map((t, i) => (
            <button
              key={t.tanggal}
              type="button"
              aria-label={`${t.labelPanjang}: ${angka(t.masuk)} pesan masuk, ${angka(t.dibalas)} dibalas AI`}
              onPointerEnter={() => setAktif(i)}
              onClick={() => setAktif(i)}
              onFocus={() => setAktif(i)}
              onBlur={() => setAktif(null)}
              className={`flex h-full flex-1 items-end justify-center gap-0.5 rounded-t-lg transition-colors focus-visible:outline-offset-0 ${rapat ? "px-0.5" : "px-1"} ${aktif === i ? "bg-subtle" : ""}`}
            >
              {SERI.map((s) => (
                <span
                  key={s.kunci}
                  className="w-full max-w-3.5 rounded-t-[4px] transition-[height] duration-500 ease-out"
                  style={{ height: `${(t[s.kunci] / atas) * 100}%`, background: s.warna }}
                />
              ))}
            </button>
          ))}

          {sorot && aktif !== null && (
            <div
              aria-hidden
              className={`pointer-events-none absolute top-1 z-10 w-max min-w-36 rounded-xl border border-line bg-surface px-3 py-2.5 shadow-pop ${kiri ? "ml-1" : "-ml-1 -translate-x-full"}`}
              style={{ left: `${((aktif + (kiri ? 1 : 0)) / n) * 100}%` }}
            >
              <p className="text-[11.5px] font-semibold text-muted">{sorot.labelPanjang}</p>
              <ul className="mt-1.5 space-y-1">
                {SERI.map((s) => (
                  <li key={s.kunci} className="flex items-center gap-2 text-xs">
                    <span className="h-0.5 w-3 rounded-full" style={{ background: s.warna }} />
                    <span className="font-bold text-fg tabular-nums">{angka(sorot[s.kunci])}</span>
                    <span className="text-muted">{s.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div aria-hidden className="absolute right-0 bottom-0 left-9 flex">
          {titik.map((t, i) => (
            // Label dipusatkan di atas kolomnya tanpa ikut melebarkan kolom ("Hari ini" lebih lebar dari kolom rapat).
            <span key={t.tanggal} className="relative h-4 min-w-0 flex-1">
              <span className={`absolute top-0 left-1/2 -translate-x-1/2 text-[11px] whitespace-nowrap ${i === n - 1 ? "font-semibold text-fg" : "text-faint"}`}>
                {i === n - 1 ? "Hari ini" : !rapat ? t.label : (n - 1 - i) % 2 === 0 ? Number(t.tanggal.slice(8)) : ""}
              </span>
            </span>
          ))}
        </div>
      </div>

      <table className="sr-only">
        <caption>{judul}</caption>
        <thead>
          <tr>
            <th scope="col">Tanggal</th>
            <th scope="col">Pesan masuk</th>
            <th scope="col">Dibalas AI</th>
          </tr>
        </thead>
        <tbody>
          {titik.map((t) => (
            <tr key={t.tanggal}>
              <th scope="row">{t.labelPanjang}</th>
              <td>{t.masuk}</td>
              <td>{t.dibalas}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
