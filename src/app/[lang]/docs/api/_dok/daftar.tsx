"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { useBahasa } from "@/components/bahasa";
import { EVENT_DOK } from "@/lib/api-dok";
import { DAFTAR_GALAT } from "./data";
import { Kode } from "./kode";

const NADA_STATUS = (s: number): string => (s >= 500 ? "bg-danger-soft text-danger" : s === 429 ? "bg-warning-soft text-warning" : s >= 400 ? "bg-subtle text-fg" : "bg-success-soft text-success");

/** Tabel kode galat yang bisa dicari (kode, status HTTP, arti, solusi). */
export function DaftarGalat() {
  const { b, t } = useBahasa();
  const [q, setQ] = useState("");
  const daftar = useMemo(() => {
    const k = q.trim().toLowerCase();
    return DAFTAR_GALAT.filter((g) => !k || `${g.kode} ${g.status} ${g.arti[b]} ${g.solusi[b]}`.toLowerCase().includes(k));
  }, [q, b]);
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Cari kode atau status, mis. 403, nomor, lisensi", "Search a code or status, e.g. 403, number, license")} aria-label={t("Cari kode galat", "Search error codes")} className="field pl-9" />
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {daftar.map((g) => (
          <li key={g.kode} id={g.kode} className="scroll-mt-20 px-4 py-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-md px-2 py-0.5 text-[11.5px] font-bold tabular-nums ${NADA_STATUS(g.status)}`}>{g.status}</span>
              <code className="text-[13px] font-semibold">{g.kode}</code>
            </div>
            <p className="mt-1.5 text-[13.5px]">{g.arti[b]}</p>
            <p className="mt-1 text-[13px] text-muted">
              <span className="font-semibold text-fg">{t("Yang dilakukan: ", "What to do: ")}</span>
              {g.solusi[b]}
            </p>
          </li>
        ))}
        {!daftar.length && <li className="px-4 py-8 text-center text-[13px] text-muted">{t("Tidak ada kode yang cocok.", "No matching codes.")}</li>}
      </ul>
    </div>
  );
}

/** Daftar event webhook yang bisa dibuka untuk melihat contoh amplop lengkap. */
export function DaftarEvent() {
  const { b, t } = useBahasa();
  const [buka, setBuka] = useState<string | null>(null);
  return (
    <ul className="space-y-2">
      {EVENT_DOK.map((e) => {
        const id = `event-${e.jenis.replace(/\./g, "-")}`;
        const terbuka = buka === e.jenis;
        return (
          <li key={e.jenis} id={id} className="card scroll-mt-20 overflow-hidden">
            <button type="button" onClick={() => setBuka(terbuka ? null : e.jenis)} aria-expanded={terbuka} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-subtle/50">
              <code className="shrink-0 rounded-md bg-accent-soft px-2 py-0.5 text-[12.5px] font-semibold text-accent">{e.jenis}</code>
              <span className="min-w-0 flex-1 text-[13px] text-muted">{e.ket[b]}</span>
              <ChevronDown className={`size-4 shrink-0 text-faint transition-transform ${terbuka ? "rotate-180" : ""}`} aria-hidden />
            </button>
            {terbuka && (
              <div className="border-t border-line bg-subtle/30 p-3">
                <Kode judul={t("Contoh body yang dikirim ke webhook Anda", "Example body sent to your webhook")} padat>
                  {JSON.stringify({ id_event: "evt_01J8Z...", jenis: e.jenis, waktu: 1794200100, nomor_id: e.jenis.startsWith("lisensi") || e.jenis === "webhook.uji" ? null : "12", data: e.data }, null, 2)}
                </Kode>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
