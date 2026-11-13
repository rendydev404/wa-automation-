"use client";

import { useState, useTransition } from "react";
import { Loader2, Pencil, RefreshCw } from "lucide-react";
import { adminSimpanPesanFollowupAction, adminTulisUlangPesanFollowupAction } from "@/app/actions";
import { Pesan } from "@/components/ui";
import { BATAS_PESAN } from "@/lib/followup-def";

/** Gelembung pesan bergaya WhatsApp (bintang = tebal, garis bawah = miring), teks apa adanya tanpa HTML. */
export function Gelembung({ teks, label }: { teks: string; label: string }) {
  const baris = teks.split(/(\*[^*\n]+\*|_[^_\n]+_)/g);
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold tracking-[0.06em] text-muted uppercase">{label}</p>
      <div className="max-w-xl rounded-2xl rounded-tl-sm border border-line bg-success-soft/40 px-3.5 py-2.5 text-[13px] leading-relaxed break-words whitespace-pre-wrap text-fg [overflow-wrap:anywhere]">
        {baris.map((b, i) =>
          /^\*[^*\n]+\*$/.test(b) ? <strong key={i}>{b.slice(1, -1)}</strong> : /^_[^_\n]+_$/.test(b) ? <em key={i}>{b.slice(1, -1)}</em> : <span key={i}>{b}</span>,
        )}
      </div>
    </div>
  );
}

/**
 * Pratinjau pesan follow-up satu akun. Pesan yang sudah terkirim tampil apa adanya; pesan berikutnya (sapaan yang belum
 * terkirim / pengingat yang menunggu) bisa diedit atau ditulis ulang AI, dan teks itulah yang dikirim.
 */
export function PratinjauPesan({
  userId,
  pesan1,
  pesan2,
  ubah,
}: {
  userId: number;
  pesan1: string | null;
  pesan2: string | null;
  /** Pesan yang masih bisa diubah: 1 = sapaan, 2 = pengingat, null = semua sudah final. */
  ubah: 1 | 2 | null;
}) {
  const awal = ubah === 1 ? pesan1 : ubah === 2 ? pesan2 : null;
  const [teks, setTeks] = useState(awal ?? "");
  const [tersimpan, setTersimpan] = useState(awal);
  const [sunting, setSunting] = useState(false);
  const [hasil, setHasil] = useState<{ ok: boolean; pesan?: string } | null>(null);
  const [tunggu, mulai] = useTransition();

  const tulisUlang = () =>
    mulai(async () => {
      const h = await adminTulisUlangPesanFollowupAction(userId);
      setHasil(h);
      if (h.ok && h.teks) {
        setTeks(h.teks);
        setTersimpan(h.teks);
        setSunting(false);
      }
    });
  const simpan = () =>
    mulai(async () => {
      const h = await adminSimpanPesanFollowupAction(userId, teks);
      setHasil(h);
      if (h.ok) {
        setTersimpan(teks.trim());
        setSunting(false);
      }
    });

  const terkirim1 = ubah !== 1 && pesan1;
  const terkirim2 = ubah === null && pesan2;
  return (
    <div className="space-y-3">
      {terkirim1 && <Gelembung label="Sapaan terkirim" teks={pesan1} />}
      {terkirim2 && <Gelembung label="Pengingat terkirim" teks={pesan2} />}
      {ubah && (
        <div className="space-y-2">
          {sunting ? (
            <div className="max-w-xl space-y-2">
              <label htmlFor={`fu-pesan-${userId}`} className="text-[11px] font-semibold tracking-[0.06em] text-muted uppercase">
                Edit {ubah === 1 ? "sapaan" : "pengingat"}
              </label>
              <textarea
                id={`fu-pesan-${userId}`}
                value={teks}
                onChange={(e) => setTeks(e.target.value)}
                rows={Math.min(14, Math.max(4, teks.split("\n").length + 1))}
                maxLength={BATAS_PESAN[1]}
                className="field w-full font-[inherit] text-[13px] leading-relaxed"
              />
              <p className="text-[11.5px] text-muted">
                {teks.trim().length} / {BATAS_PESAN[1]} karakter. Hindari tautan di sapaan pertama supaya nomor CS tetap aman.
              </p>
            </div>
          ) : tersimpan ? (
            <Gelembung label={`${ubah === 1 ? "Sapaan" : "Pengingat"} yang akan dikirim`} teks={tersimpan} />
          ) : (
            <p className="text-[12.5px] text-muted">Draf {ubah === 1 ? "sapaan" : "pengingat"} disiapkan otomatis paling lambat 24 jam sebelum jadwal. Bisa juga dibuat sekarang.</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {sunting ? (
              <>
                <button type="button" data-analitik="Follow-up: simpan pesan" className="btn btn-primary" disabled={tunggu} onClick={simpan}>
                  {tunggu && <Loader2 className="size-4 animate-spin" aria-hidden />}
                  Simpan
                </button>
                <button
                  type="button"
                  data-analitik="Follow-up: batal edit"
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
                <button type="button" data-analitik="Follow-up: tulis ulang (AI)" className="btn btn-ghost border border-line" disabled={tunggu} onClick={tulisUlang}>
                  {tunggu ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
                  {tersimpan ? "Tulis ulang (AI)" : "Buat pratinjau"}
                </button>
                {tersimpan && (
                  <button type="button" data-analitik="Follow-up: edit pesan" className="btn btn-ghost border border-line" disabled={tunggu} onClick={() => setSunting(true)}>
                    <Pencil className="size-4" aria-hidden /> Edit
                  </button>
                )}
              </>
            )}
            <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
          </div>
        </div>
      )}
      {!ubah && !pesan1 && <p className="text-[12.5px] text-muted">Tidak ada pesan yang dikirim untuk akun ini.</p>}
    </div>
  );
}
