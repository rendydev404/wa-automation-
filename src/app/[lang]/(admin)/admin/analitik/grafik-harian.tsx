"use client";

import { useId, useState } from "react";
import type { TitikAnalitik } from "@/lib/analitik";
import { angka } from "@/lib/format";

/**
 * Grafik harian analitik: dua panel bersumbu-x sama (small multiples), BUKAN dua sumbu-y dalam satu plot. Atas = pengguna
 * aktif (puluhan), bawah = event bertumpuk (bisa ribuan); skalanya berbeda jadi tiap panel punya sumbunya sendiri.
 * HTML/CSS tanpa pustaka grafik. Satu kolom sorot per hari menjangkau kedua panel; tooltip saat disorot/disentuh/fokus,
 * tabel tersembunyi untuk pembaca layar.
 */

// Warna event divalidasi (skill dataviz, validate_palette.js --pairs all, permukaan #ffffff): lolos semua cek,
// CVD terburuk ΔE 8,0, penglihatan normal terburuk ΔE 21,1, semua >= 3:1 terhadap kartu. Biru & hijau = token aplikasi.
const SERI = [
  { kunci: "halaman", label: "Kunjungan halaman", warna: "var(--c-seri-masuk)" },
  { kunci: "klik", label: "Klik", warna: "#eb6834" },
  { kunci: "fitur", label: "Pemakaian fitur", warna: "var(--c-accent)" },
] as const;
const WARNA_AKTIF = "var(--c-ink)";

// Tata letak vertikal (px), dipakai bersama oleh garis bantu, kolom, dan label supaya selalu sejajar.
const Y_A = 22; // atas panel pengguna aktif (di atasnya judul panel)
const T_A = 84;
const Y_B = Y_A + T_A + 34; // atas panel event (celah berisi judul panel)
const T_B = 168;
const T_PLOT = Y_B + T_B;
const T_SUMBU = 20;

/**
 * Satu titik grafik + label tanggalnya. Label dibuat di server (isi-analitik.tsx) dan dikirim apa adanya: data ICU
 * Intl di Node dan di peramban bisa berbeda tipis, dan teks yang berbeda saat hidrasi = galat React #418.
 */
export type TitikGrafik = TitikAnalitik & { pendek: string; panjang: string; tglBulan: string };

/** Batas atas sumbu yang bulat dan genap, supaya garis tengahnya juga bilangan bulat. */
function batasAtas(n: number): number {
  if (n <= 2) return 2;
  const p = 10 ** Math.floor(Math.log10(n));
  return [1, 2, 4, 6, 8, 10].find((k) => k * p >= n)! * p;
}

/** Label sumbu ringkas: 1.500 -> "1,5 rb" supaya muat di talang kiri 28 px. */
const angkaSumbu = (n: number) => (n >= 10_000 ? `${angka(Math.round(n / 1000))} rb` : n >= 1000 ? `${(n / 1000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} rb` : angka(n));

/**
 * Jarak antarlabel sumbu-x (dalam hari, dihitung mundur dari hari ini) untuk HP dan layar lebar, supaya label tidak
 * bertabrakan: 7 hari = semua, 30 hari = tiap 5 / 2, 90 hari = tiap 30 / 10.
 */
const langkahLabel = (n: number): [hp: number, lebar: number] => (n <= 7 ? [1, 1] : n <= 31 ? [5, 2] : [30, 10]);

export function GrafikHarian({ titik, judul, perPengguna }: { titik: TitikGrafik[]; judul: string; perPengguna: boolean }) {
  const [aktif, setAktif] = useState<number | null>(null);
  const idJudul = useId();
  const n = titik.length;
  const rapat = n > 31;
  const data = titik.map((t) => ({ ...t, event: t.halaman + t.klik + t.fitur }));
  // Mode per pengguna: nilai aktif hanya 0/1, jadi kolomnya penuh (tanpa angka sumbu yang tidak bermakna).
  const atasA = perPengguna ? 1 : batasAtas(Math.max(0, ...data.map((t) => t.aktif)));
  const atasB = batasAtas(Math.max(0, ...data.map((t) => t.event)));
  const totalEvent = data.reduce((a, t) => a + t.event, 0);
  const hariAktif = data.filter((t) => t.aktif > 0).length;
  const rataAktif = n ? data.reduce((a, t) => a + t.aktif, 0) / n : 0;
  const [langkahHp, langkahLebar] = langkahLabel(n);
  const sorot = aktif === null ? null : data[aktif];
  const kiri = aktif !== null && aktif < n / 2;
  const yA = (v: number) => Y_A + T_A - (v / atasA) * T_A;
  const yB = (v: number) => Y_B + T_B - (v / atasB) * T_B;

  return (
    <section aria-labelledby={idJudul} className="card flex min-w-0 flex-col p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <h2 id={idJudul} className="text-[15px] font-bold tracking-tight">
            {judul}
          </h2>
          <p className="hint mt-0.5">
            {perPengguna
              ? `Aktif ${angka(hariAktif)} dari ${angka(n)} hari · ${angka(totalEvent)} aktivitas`
              : `Batang atas = berapa akun yang memakai aplikasi tiap hari (rata-rata ${rataAktif.toLocaleString("id-ID", { maximumFractionDigits: 1 })}/hari) · bawah = ${angka(totalEvent)} aktivitas`}
            <span className="hidden sm:inline"> · arahkan kursor ke batang untuk detail</span>
          </p>
        </div>
        <ul aria-label="Keterangan warna" className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-medium text-muted">
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: WARNA_AKTIF }} />
            {perPengguna ? "Hari aktif" : "Akun aktif per hari"}
          </li>
          {SERI.map((s) => (
            <li key={s.kunci} className="flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: s.warna }} />
              {s.label}
            </li>
          ))}
        </ul>
      </div>

      <div className="relative mt-5 select-none" style={{ height: T_PLOT + T_SUMBU }} onPointerLeave={() => setAktif(null)}>
        {/* Garis bantu + angka sumbu tiap panel (garis tipis, satu langkah dari permukaan). */}
        <div aria-hidden className="absolute inset-0">
          {[atasA, 0].map((v) => (
            <Garis key={`a${v}`} y={yA(v)} label={perPengguna ? "" : angkaSumbu(v)} />
          ))}
          {[atasB, atasB / 2, 0].map((v) => (
            <Garis key={`b${v}`} y={yB(v)} label={angkaSumbu(v)} />
          ))}
        </div>

        <div className="absolute top-0 right-0 left-9 flex" style={{ height: T_PLOT }}>
          {data.map((h, i) => {
            const isi = SERI.filter((s) => h[s.kunci] > 0);
            return (
              <button
                key={h.tanggal}
                type="button"
                // Satu label analitik untuk semua kolom (aria-label berisi tanggal & angka = ratusan label berbeda).
                data-analitik="Grafik harian: sorot hari"
                aria-label={`${h.panjang}: ${perPengguna ? (h.aktif > 0 ? "aktif" : "tidak aktif") : `${angka(h.aktif)} pengguna aktif`}, ${angka(h.halaman)} kunjungan halaman, ${angka(h.klik)} klik, ${angka(h.fitur)} pemakaian fitur`}
                onPointerEnter={() => setAktif(i)}
                onClick={() => setAktif(i)}
                onFocus={() => setAktif(i)}
                onBlur={() => setAktif(null)}
                className={`relative h-full min-w-0 flex-1 rounded-lg transition-colors focus-visible:outline-offset-0 ${aktif === i ? "bg-subtle" : ""}`}
              >
                {h.aktif > 0 && (
                  <span
                    className={`absolute inset-x-0 mx-auto w-[calc(100%-2px)] max-w-6 transition-[top,height] duration-500 ease-out ${rapat ? "rounded-t-[2px]" : "rounded-t-[4px]"}`}
                    style={{ top: yA(h.aktif), height: Y_A + T_A - yA(h.aktif), background: WARNA_AKTIF }}
                  />
                )}
                {h.event > 0 && (
                  // Tumpukan dari dasar: halaman, klik, fitur; dipisah celah 2 px warna permukaan (tanpa garis tepi).
                  <span
                    className={`absolute inset-x-0 mx-auto flex w-[calc(100%-2px)] max-w-6 flex-col-reverse gap-[2px] overflow-hidden transition-[top,height] duration-500 ease-out ${rapat ? "rounded-t-[2px]" : "rounded-t-[4px]"}`}
                    style={{ top: yB(h.event), height: Y_B + T_B - yB(h.event) }}
                  >
                    {isi.map((s) => (
                      <span key={s.kunci} className="min-h-px w-full" style={{ flex: `${h[s.kunci]} 1 0px`, background: s.warna }} />
                    ))}
                  </span>
                )}
              </button>
            );
          })}

          {sorot && aktif !== null && (
            <div
              aria-hidden
              className={`pointer-events-none absolute z-20 w-max min-w-44 rounded-xl border border-line bg-surface px-3 py-2.5 shadow-pop ${kiri ? "ml-1" : "-ml-1 -translate-x-full"}`}
              style={{ left: `${((aktif + (kiri ? 1 : 0)) / n) * 100}%`, top: Y_A }}
            >
              <p className="text-[11.5px] font-semibold text-muted">{sorot.panjang}</p>
              <ul className="mt-1.5 space-y-1">
                <li className="flex items-center gap-2 text-xs">
                  <span className="h-0.5 w-3 rounded-full" style={{ background: WARNA_AKTIF }} />
                  {perPengguna ? (
                    <span className="font-bold text-fg">{sorot.aktif > 0 ? "Aktif" : "Tidak aktif"}</span>
                  ) : (
                    <>
                      <span className="font-bold text-fg tabular-nums">{angka(sorot.aktif)}</span>
                      <span className="text-muted">pengguna aktif</span>
                    </>
                  )}
                </li>
                {SERI.map((s) => (
                  <li key={s.kunci} className="flex items-center gap-2 text-xs">
                    <span className="h-0.5 w-3 rounded-full" style={{ background: s.warna }} />
                    <span className="font-bold text-fg tabular-nums">{angka(sorot[s.kunci])}</span>
                    <span className="text-muted">{s.label.toLowerCase()}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Judul panel di atas lapisan kolom (sorotan kolom tidak menutupinya), tidak menangkap pointer. */}
        <p aria-hidden className="pointer-events-none absolute left-9 z-10 text-[11.5px] font-semibold text-muted" style={{ top: 0 }}>
          {perPengguna ? "Hari aktif" : "Akun aktif per hari"}
        </p>
        <p aria-hidden className="pointer-events-none absolute left-9 z-10 text-[11.5px] font-semibold text-muted" style={{ top: Y_B - 22 }}>
          Aktivitas per hari <span className="font-normal text-faint">· halaman dibuka + klik + fitur dipakai</span>
        </p>

        <div aria-hidden className="absolute right-0 bottom-0 left-9 flex" style={{ height: T_SUMBU }}>
          {data.map((h, i) => {
            const mundur = n - 1 - i;
            const hp = mundur % langkahHp === 0;
            const lebar = mundur % langkahLebar === 0;
            if (!hp && !lebar) return <span key={h.tanggal} className="min-w-0 flex-1" />;
            const tampil = hp && lebar ? "" : hp ? "sm:hidden" : "hidden sm:block";
            return (
              // Label dipusatkan di atas kolomnya tanpa ikut melebarkan kolom; "Hari ini" rata kanan supaya tidak menjorok keluar kartu.
              <span key={h.tanggal} className="relative min-w-0 flex-1">
                <span
                  className={`absolute top-1 text-[11px] whitespace-nowrap ${tampil} ${i === n - 1 ? "right-0 font-semibold text-fg" : "left-1/2 -translate-x-1/2 text-faint"}`}
                >
                  {i === n - 1 ? "Hari ini" : n <= 7 ? h.pendek : rapat ? h.tglBulan : Number(h.tanggal.slice(8))}
                </span>
              </span>
            );
          })}
        </div>
      </div>

      {/* Tabel di dalam pembungkus sr-only: tabel mengabaikan width 1px (melebar sesuai isinya) dan, tanpa pembungkus,
          melebarkan halaman HP (tata letak 390 px jadi ~544 px). */}
      <div className="sr-only">
        <table>
          <caption>{judul}</caption>
          <thead>
            <tr>
              <th scope="col">Tanggal</th>
              <th scope="col">{perPengguna ? "Aktif" : "Pengguna aktif"}</th>
              {SERI.map((s) => (
                <th key={s.kunci} scope="col">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((h) => (
              <tr key={h.tanggal}>
                <th scope="row">{h.panjang}</th>
                <td>{perPengguna ? (h.aktif > 0 ? "ya" : "tidak") : h.aktif}</td>
                <td>{h.halaman}</td>
                <td>{h.klik}</td>
                <td>{h.fitur}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Garis({ y, label }: { y: number; label: string }) {
  return (
    <div className="absolute inset-x-0 flex -translate-y-1/2 items-center gap-2" style={{ top: y }}>
      <span className="w-7 text-right text-[11px] text-faint tabular-nums">{label}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
