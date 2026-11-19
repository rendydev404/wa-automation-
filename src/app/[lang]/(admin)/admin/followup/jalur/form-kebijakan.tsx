"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { simpanKebijakanJalurAction } from "@/app/actions-jalur";
import { Pesan } from "@/components/ui";
import { KEBIJAKAN_JALUR, type KebijakanJalur } from "@/lib/wa-resmi-def";

/** Kebijakan jalur WhatsApp untuk nomor pengguna (setelan global `jalur_wa`). */
export function FormKebijakan({ awal }: { awal: KebijakanJalur }) {
  const [nilai, setNilai] = useState<KebijakanJalur>(awal);
  const [hasil, setHasil] = useState<{ ok: boolean; pesan?: string } | null>(null);
  const [tunggu, mulai] = useTransition();
  return (
    <div className="space-y-4">
      <fieldset className="space-y-2.5">
        <legend className="sr-only">Kebijakan jalur WhatsApp</legend>
        {KEBIJAKAN_JALUR.map((k) => (
          <label
            key={k.kode}
            className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition-colors ${nilai === k.kode ? "border-accent bg-accent-soft/40" : "border-line hover:bg-subtle/60"}`}
          >
            <input type="radio" name="kebijakan" value={k.kode} checked={nilai === k.kode} onChange={() => setNilai(k.kode)} className="mt-1 accent-[var(--color-accent)]" />
            <span>
              <span className="block text-[14px] font-bold">{k.label}</span>
              <span className="mt-0.5 block text-[12.5px] text-muted">{k.keterangan}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn btn-primary"
          disabled={tunggu || nilai === awal}
          onClick={() => mulai(async () => setHasil(await simpanKebijakanJalurAction(nilai)))}
        >
          {tunggu && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Simpan kebijakan
        </button>
        <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
      </div>
    </div>
  );
}
