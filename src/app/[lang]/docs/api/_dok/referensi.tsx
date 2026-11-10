"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { useBahasa } from "@/components/bahasa";
import { ENDPOINT_DOK } from "@/lib/api-dok";
import { BASE, GRUP_ENDPOINT, LABEL_KODE, type BahasaKode, type Lingkungan, contohKode, grupEndpoint, idEndpoint } from "./data";
import { Kode, KodeTab } from "./kode";

export const WARNA_METODE: Record<string, string> = {
  GET: "bg-accent-soft text-accent",
  POST: "bg-success-soft text-success",
  PUT: "bg-warning-soft text-warning",
  PATCH: "bg-warning-soft text-warning",
  DELETE: "bg-danger-soft text-danger",
};

const json = (v: unknown): string => JSON.stringify(v, null, 2);

/** Referensi endpoint interaktif: pilih lingkungan, saring per grup, cari, buka-tutup kartu, contoh kode 4 bahasa. */
export function ReferensiEndpoint() {
  const { b, t } = useBahasa();
  const [env, setEnv] = useState<Lingkungan>("sandbox");
  const [grup, setGrup] = useState("semua");
  const [q, setQ] = useState("");
  const [buka, setBuka] = useState<Set<string>>(new Set());
  const [bahasaKode, setBahasaKode] = useState<BahasaKode>("curl");

  // Tautan langsung (#post-pesan): buka kartu itu dan gulir ke sana.
  useEffect(() => {
    const dariHash = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      if (!id || !ENDPOINT_DOK.some((e) => idEndpoint(e) === id)) return;
      setGrup("semua");
      setQ("");
      setBuka((s) => new Set(s).add(id));
      setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "start" }), 50);
    };
    dariHash();
    window.addEventListener("hashchange", dariHash);
    return () => window.removeEventListener("hashchange", dariHash);
  }, []);

  const daftar = useMemo(() => {
    const kata = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return ENDPOINT_DOK.filter((e) => (grup === "semua" || grupEndpoint(e) === grup) && kata.every((k) => `${e.metode} ${e.jalur} ${e.ringkas.id} ${e.ringkas.en} ${e.fitur ?? ""}`.toLowerCase().includes(k)));
  }, [grup, q]);
  const jumlah = (g: string) => ENDPOINT_DOK.filter((e) => grupEndpoint(e) === g).length;
  const balik = (id: string) =>
    setBuka((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div role="radiogroup" aria-label={t("Lingkungan", "Environment")} className="inline-flex rounded-xl border border-line p-0.5">
            {(["sandbox", "production"] as const).map((x) => (
              <button
                key={x}
                type="button"
                role="radio"
                aria-checked={env === x}
                onClick={() => setEnv(x)}
                className={`rounded-[10px] px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${env === x ? "bg-ink text-ink-signal" : "text-muted hover:bg-subtle"}`}
              >
                {x === "sandbox" ? "Sandbox" : "Production"}
              </button>
            ))}
          </div>
          <code className="min-w-0 truncate text-[12.5px] text-muted">Base URL: {BASE[env]}</code>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Cari: pesan, qr, knowledge, percakapan…", "Search: message, qr, knowledge, conversation…")} aria-label={t("Cari endpoint", "Search endpoints")} className="field pl-9" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[{ kode: "semua", label: { id: "Semua", en: "All" } }, ...GRUP_ENDPOINT].map((g) => (
            <button
              key={g.kode}
              type="button"
              onClick={() => setGrup(g.kode)}
              aria-pressed={grup === g.kode}
              className={`rounded-full border px-3 py-1 text-[12.5px] font-semibold transition-colors ${grup === g.kode ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:text-fg"}`}
            >
              {g.label[b]} <span className="font-normal opacity-70">{g.kode === "semua" ? ENDPOINT_DOK.length : jumlah(g.kode)}</span>
            </button>
          ))}
        </div>
      </div>

      <p className="text-[12.5px] text-muted">
        {t(`${daftar.length} endpoint`, `${daftar.length} endpoints`)} ·{" "}
        <button type="button" className="font-semibold text-accent hover:underline" onClick={() => setBuka(new Set(daftar.map(idEndpoint)))}>
          {t("Buka semua", "Expand all")}
        </button>{" "}
        ·{" "}
        <button type="button" className="font-semibold text-accent hover:underline" onClick={() => setBuka(new Set())}>
          {t("Tutup semua", "Collapse all")}
        </button>
      </p>

      <ul className="space-y-2.5">
        {daftar.map((e) => {
          const id = idEndpoint(e);
          const terbuka = buka.has(id);
          const kode = contohKode(e, env);
          return (
            <li key={id} id={id} className="card scroll-mt-20 overflow-hidden">
              <button type="button" onClick={() => balik(id)} aria-expanded={terbuka} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-subtle/50">
                <span className={`w-16 shrink-0 rounded-md px-2 py-0.5 text-center text-[11.5px] font-bold ${WARNA_METODE[e.metode]}`}>{e.metode}</span>
                <code className="min-w-0 text-[13.5px] font-semibold break-all">{e.jalur}</code>
                <span className="text-[13px] text-muted max-sm:w-full sm:ml-auto sm:max-w-[45%] sm:truncate sm:text-right">{e.ringkas[b]}</span>
                <ChevronDown className={`size-4 shrink-0 text-faint transition-transform max-sm:hidden ${terbuka ? "rotate-180" : ""}`} aria-hidden />
              </button>
              {terbuka && (
                <div className="space-y-3 border-t border-line bg-subtle/30 p-3 sm:p-4">
                  <div className="flex flex-wrap gap-2 text-[12px]">
                    {e.fitur ? (
                      <span className="rounded-md bg-surface px-2 py-0.5 font-semibold text-muted ring-1 ring-line">
                        {t("Fitur", "Feature")}: <code>{e.fitur}</code>
                      </span>
                    ) : (
                      <span className="rounded-md bg-surface px-2 py-0.5 font-semibold text-muted ring-1 ring-line">{t("Tanpa scope khusus", "No specific scope")}</span>
                    )}
                    <span className="rounded-md bg-surface px-2 py-0.5 font-semibold text-muted ring-1 ring-line">
                      {t("Sukses", "Success")}: <code>{e.status ?? 200}</code>
                    </span>
                  </div>
                  <KodeTab pilih={bahasaKode} saatPilih={(k) => setBahasaKode(k as BahasaKode)} tab={(Object.keys(LABEL_KODE) as BahasaKode[]).map((k) => ({ kode: k, label: LABEL_KODE[k], isi: kode[k] }))} />
                  <div className={`grid gap-3 ${e.minta !== undefined ? "lg:grid-cols-2" : ""}`}>
                    {e.minta !== undefined && (
                      <Kode judul={t("Contoh isi permintaan", "Example request body")} padat>
                        {json(e.minta)}
                      </Kode>
                    )}
                    <Kode judul={`${t("Contoh jawaban", "Example response")} · ${e.status ?? 200}`} padat>
                      {json(e.jawab)}
                    </Kode>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {!daftar.length && <p className="card px-4 py-10 text-center text-[13px] text-muted">{t("Tidak ada endpoint yang cocok.", "No matching endpoints.")}</p>}
    </div>
  );
}
