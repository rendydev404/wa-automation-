"use client";

import { useState, useTransition } from "react";
import { Loader2, Pencil, RefreshCw, Square } from "lucide-react";
import { adminHentikanProspekAction, adminSimpanDrafProspekAction, adminTulisUlangDrafProspekAction } from "@/app/actions";
import { Pesan } from "@/components/ui";
import { BATAS_PESAN, NAMA_TAHAP_PROSPEK } from "@/lib/followup-def";
import { Gelembung } from "../pratinjau";

/**
 * Pesan follow-up prospek satu chat: yang sudah terkirim tampil apa adanya; draf pesan berikutnya (selama siklus masih
 * berjalan) bisa diedit atau ditulis ulang AI, dan teks itulah yang dikirim. Admin juga bisa menghentikan siklusnya.
 */
export function PratinjauProspek({
  kunci,
  terkirim,
  berjalan,
  tahapBerikut,
  draf,
}: {
  kunci: string;
  terkirim: string[];
  berjalan: boolean;
  /** 1–3: pesan yang akan dikirim berikutnya. */
  tahapBerikut: number;
  draf: string | null;
}) {
  const [teks, setTeks] = useState(draf ?? "");
  const [tersimpan, setTersimpan] = useState(draf);
  const [sunting, setSunting] = useState(false);
  const [hasil, setHasil] = useState<{ ok: boolean; pesan?: string } | null>(null);
  const [tunggu, mulai] = useTransition();
  const nama = NAMA_TAHAP_PROSPEK[tahapBerikut - 1] ?? "";

  const tulisUlang = () =>
    mulai(async () => {
      const h = await adminTulisUlangDrafProspekAction(kunci);
      setHasil(h);
      if (h.ok && h.teks) {
        setTeks(h.teks);
        setTersimpan(h.teks);
        setSunting(false);
      }
    });
  const simpan = () =>
    mulai(async () => {
      const h = await adminSimpanDrafProspekAction(kunci, teks);
      setHasil(h);
      if (h.ok) {
        setTersimpan(teks.trim());
        setSunting(false);
      }
    });
  const hentikan = () =>
    mulai(async () => {
      setHasil(await adminHentikanProspekAction(kunci));
    });

  return (
    <div className="space-y-3">
      {terkirim.map((p, i) => (
        <Gelembung key={i} label={`Pesan ${i + 1} · ${NAMA_TAHAP_PROSPEK[i]} · terkirim`} teks={p} />
      ))}
      {berjalan && (
        <div className="space-y-2">
          {sunting ? (
            <div className="max-w-xl space-y-2">
              <label htmlFor={`fp-pesan-${kunci}`} className="text-[11px] font-semibold tracking-[0.06em] text-muted uppercase">
                Edit pesan {tahapBerikut} · {nama}
              </label>
              <textarea
                id={`fp-pesan-${kunci}`}
                value={teks}
                onChange={(e) => setTeks(e.target.value)}
                rows={Math.min(14, Math.max(4, teks.split("\n").length + 1))}
                maxLength={BATAS_PESAN[1]}
                className="field w-full font-[inherit] text-[13px] leading-relaxed"
              />
              <p className="text-[11.5px] text-muted">
                {teks.trim().length} / {BATAS_PESAN[1]} karakter. Hindari janji, promo, atau batas waktu yang tidak benar.
              </p>
            </div>
          ) : tersimpan ? (
            <Gelembung label={`Pesan ${tahapBerikut} · ${nama} · akan dikirim`} teks={tersimpan} />
          ) : (
            <p className="text-[12.5px] text-muted">
              Draf pesan {tahapBerikut} ({nama}) disiapkan otomatis paling lambat 6 jam sebelum jadwal. Bisa juga dibuat sekarang.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {sunting ? (
              <>
                <button type="button" data-analitik="Follow-up prospek: simpan pesan" className="btn btn-primary" disabled={tunggu} onClick={simpan}>
                  {tunggu && <Loader2 className="size-4 animate-spin" aria-hidden />}
                  Simpan
                </button>
                <button
                  type="button"
                  data-analitik="Follow-up prospek: batal edit"
                  className="btn btn-ghost"
                  disabled={tunggu}
                  onClick={() => {
                    setTeks(tersimpan ?? "");
                    setSunting(false);
                  }}
                >
                  Batal
                </button>
              </>
            ) : (
              <>
                <button type="button" data-analitik="Follow-up prospek: tulis ulang (AI)" className="btn btn-ghost border border-line" disabled={tunggu} onClick={tulisUlang}>
                  {tunggu ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
                  {tersimpan ? "Tulis ulang (AI)" : "Buat pratinjau"}
                </button>
                {tersimpan && (
                  <button type="button" data-analitik="Follow-up prospek: edit pesan" className="btn btn-ghost border border-line" disabled={tunggu} onClick={() => setSunting(true)}>
                    <Pencil className="size-4" aria-hidden /> Edit
                  </button>
                )}
                <button type="button" data-analitik="Follow-up prospek: hentikan" className="btn btn-ghost border border-line text-danger" disabled={tunggu} onClick={hentikan}>
                  <Square className="size-3.5" aria-hidden /> Hentikan
                </button>
              </>
            )}
            <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
          </div>
        </div>
      )}
      {!berjalan && !terkirim.length && <p className="text-[12.5px] text-muted">Tidak ada pesan yang dikirim untuk chat ini.</p>}
    </div>
  );
}
