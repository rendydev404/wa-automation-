"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useBahasa } from "./bahasa";

const BULAN = {
  id: ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};
const HARI = { id: ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"], en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] };

const dua = (n: number) => String(n).padStart(2, "0");
const keTeks = (y: number, m: number, d: number) => `${y}-${dua(m + 1)}-${dua(d)}`;
function urai(v: string): { y: number; m: number; d: number } | null {
  const x = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return x ? { y: +x[1], m: +x[2] - 1, d: +x[3] } : null;
}
/** Hari ini menurut WIB (tanggal di aplikasi ini selalu WIB). */
function hariIniWib(): string {
  const w = new Date(Date.now() + 7 * 3600_000);
  return keTeks(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate());
}

/**
 * Pemilih tanggal buatan sendiri (pengganti <input type="date"> bawaan browser): kalender sebulan, Senin di depan,
 * tombol Hari ini & Hapus, membuka ke atas bila ruang di bawah tidak cukup. Nilai YYYY-MM-DD lewat input tersembunyi
 * `name` (untuk <form>), sama dengan nilai input tanggal bawaan.
 */
export function PilihTanggal({
  id,
  name,
  nilai: nilaiAwal = "",
  onUbah,
  label,
  placeholder,
}: {
  id?: string;
  name?: string;
  nilai?: string;
  onUbah?: (v: string) => void;
  label: string;
  placeholder?: string;
}) {
  const { b, t } = useBahasa();
  const [nilai, setNilai] = useState(nilaiAwal);
  const [buka, setBuka] = useState(false);
  const [keAtas, setKeAtas] = useState(false);
  const hariIni = hariIniWib();
  const awal = urai(nilai) ?? urai(hariIni)!;
  const [lihat, setLihat] = useState({ y: awal.y, m: awal.m });
  const akar = useRef<HTMLDivElement>(null);
  const tombol = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const idPanel = useId();

  useEffect(() => {
    if (!buka) return;
    const luar = (e: PointerEvent) => {
      if (!akar.current?.contains(e.target as Node)) setBuka(false);
    };
    document.addEventListener("pointerdown", luar);
    panel.current?.querySelector<HTMLButtonElement>("[data-pilih='1'], [data-hari-ini='1']")?.focus({ preventScroll: true });
    return () => document.removeEventListener("pointerdown", luar);
  }, [buka]);

  const ubah = (v: string) => {
    setNilai(v);
    onUbah?.(v);
  };
  const bukaPanel = () => {
    const p = urai(nilai) ?? urai(hariIni)!;
    setLihat({ y: p.y, m: p.m });
    const r = tombol.current?.getBoundingClientRect();
    if (r) {
      const bawah = window.innerHeight - r.bottom - 80;
      setKeAtas(bawah < 360 && r.top > bawah);
    }
    setBuka(true);
  };
  const tutup = () => {
    setBuka(false);
    tombol.current?.focus();
  };
  const geser = (n: number) => setLihat(({ y, m }) => ({ y: m + n < 0 ? y - 1 : m + n > 11 ? y + 1 : y, m: (m + n + 12) % 12 }));

  const p = urai(nilai);
  const teksTombol = p ? `${p.d} ${BULAN[b][p.m]} ${p.y}` : (placeholder ?? t("Pilih tanggal", "Pick a date"));
  // Kisi 6 minggu, Senin di depan.
  const geserAwal = (new Date(Date.UTC(lihat.y, lihat.m, 1)).getUTCDay() + 6) % 7;
  const jumlahHari = new Date(Date.UTC(lihat.y, lihat.m + 1, 0)).getUTCDate();
  const sel = Array.from({ length: 42 }, (_, i) => i - geserAwal + 1);

  return (
    <div ref={akar} className="relative">
      {name !== undefined && <input type="hidden" name={name} value={nilai} />}
      <div className="relative">
        <button
          ref={tombol}
          id={id}
          type="button"
          aria-label={`${label}: ${p ? teksTombol : t("belum dipilih", "not set")}`}
          aria-haspopup="dialog"
          aria-expanded={buka}
          aria-controls={idPanel}
          onClick={() => (buka ? setBuka(false) : bukaPanel())}
          className={`field flex min-h-[2.75rem] items-center gap-2.5 text-left ${nilai ? "pr-10" : ""} ${buka ? "border-accent ring-[3px] ring-accent-soft" : ""}`}
        >
          <CalendarDays className="size-4 shrink-0 text-muted" aria-hidden />
          <span className={`truncate ${p ? "font-semibold" : "text-muted"}`}>{teksTombol}</span>
        </button>
        {nilai && (
          <button
            type="button"
            onClick={() => ubah("")}
            aria-label={t(`Hapus ${label}`, `Clear ${label}`)}
            className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted hover:bg-subtle hover:text-fg"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>

      {buka && (
        <div
          ref={panel}
          id={idPanel}
          role="dialog"
          aria-label={label}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              tutup();
            }
          }}
          className={`absolute left-0 z-50 w-[min(19rem,calc(100vw-2rem))] animate-masuk rounded-xl border border-line bg-surface p-3 shadow-pop ${keAtas ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]"}`}
        >
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => geser(-1)} aria-label={t("Bulan sebelumnya", "Previous month")} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-subtle hover:text-fg">
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <p className="text-[13.5px] font-bold" aria-live="polite">
              {BULAN[b][lihat.m]} {lihat.y}
            </p>
            <button type="button" onClick={() => geser(1)} aria-label={t("Bulan berikutnya", "Next month")} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-subtle hover:text-fg">
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center">
            {HARI[b].map((h) => (
              <span key={h} className="pb-1 text-[11px] font-semibold text-faint">
                {h}
              </span>
            ))}
            {sel.map((d, i) => {
              if (d < 1 || d > jumlahHari) return <span key={i} aria-hidden />;
              const v = keTeks(lihat.y, lihat.m, d);
              const dipilih = v === nilai;
              const kini = v === hariIni;
              return (
                <button
                  key={i}
                  type="button"
                  data-pilih={dipilih ? "1" : undefined}
                  data-hari-ini={kini ? "1" : undefined}
                  aria-pressed={dipilih}
                  aria-label={`${d} ${BULAN[b][lihat.m]} ${lihat.y}`}
                  onClick={() => {
                    ubah(v);
                    tutup();
                  }}
                  className={`grid h-9 place-items-center rounded-lg text-[13px] tabular-nums transition-colors ${
                    dipilih ? "bg-accent font-bold text-on-accent" : kini ? "font-bold text-accent ring-1 ring-accent/40 hover:bg-accent-soft" : "hover:bg-subtle"
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between border-t border-line pt-2">
            <button
              type="button"
              onClick={() => {
                ubah("");
                tutup();
              }}
              className="rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold text-muted hover:bg-subtle hover:text-fg"
            >
              {t("Hapus", "Clear")}
            </button>
            <button
              type="button"
              onClick={() => {
                ubah(hariIni);
                tutup();
              }}
              className="rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold text-accent hover:bg-accent-soft"
            >
              {t("Hari ini", "Today")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
