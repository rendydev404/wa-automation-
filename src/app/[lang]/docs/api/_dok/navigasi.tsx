"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Menu, X } from "lucide-react";
import Link from "@/components/link";
import { useBahasa, useJalur } from "@/components/bahasa";
import { GRUP_HALAMAN, HALAMAN_DOK, jalurHalaman } from "./data";

function DaftarHalaman({ saatPilih }: { saatPilih?: () => void }) {
  const { b } = useBahasa();
  const jalur = useJalur().replace(/\/+$/, "") || "/";
  return (
    <div className="space-y-6">
      {GRUP_HALAMAN.map((g) => (
        <div key={g.kode}>
          <p className="mb-1.5 px-3 text-[11px] font-bold tracking-[0.08em] text-faint uppercase">{g.judul[b]}</p>
          <ul className="space-y-0.5">
            {HALAMAN_DOK.filter((h) => h.grup === g.kode).map((h) => {
              const href = jalurHalaman(h.slug);
              const aktif = jalur === href;
              return (
                <li key={h.slug}>
                  <Link
                    href={href}
                    onClick={saatPilih}
                    aria-current={aktif ? "page" : undefined}
                    className={`block rounded-lg px-3 py-1.5 text-[13.5px] transition-colors ${aktif ? "bg-accent-soft font-semibold text-accent" : "text-muted hover:bg-subtle hover:text-fg"}`}
                  >
                    {h.judul[b]}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Sidebar docs (desktop). */
export function SidebarDok() {
  return (
    <nav aria-label="Dokumentasi" className="sticky top-[4.5rem] hidden max-h-[calc(100dvh-5.5rem)] overflow-y-auto pr-2 pb-8 lg:block">
      <DaftarHalaman />
    </nav>
  );
}

/** Tombol menu + laci navigasi (HP). */
export function MenuDokHp() {
  const { b, t } = useBahasa();
  const [buka, setBuka] = useState(false);
  const jalur = useJalur().replace(/\/+$/, "") || "/";
  const kini = HALAMAN_DOK.find((h) => jalurHalaman(h.slug) === jalur);
  useEffect(() => {
    document.body.style.overflow = buka ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [buka]);
  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setBuka(true)}
        className="flex w-full items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-left text-[13.5px] font-semibold"
        aria-expanded={buka}
      >
        <Menu className="size-4 text-muted" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{kini?.judul[b] ?? t("Dokumentasi", "Docs")}</span>
        <span className="text-[12px] font-normal text-muted">{t("Menu", "Menu")}</span>
      </button>
      {buka && (
        <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label={t("Navigasi dokumentasi", "Docs navigation")}>
          <button type="button" aria-label={t("Tutup", "Close")} className="absolute inset-0 bg-ink/50" onClick={() => setBuka(false)} />
          <div className="relative ml-auto h-full w-[min(20rem,85vw)] overflow-y-auto bg-canvas p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-[14px] font-bold">{t("Dokumentasi", "Docs")}</span>
              <button type="button" onClick={() => setBuka(false)} className="grid size-9 place-items-center rounded-lg hover:bg-subtle" aria-label={t("Tutup", "Close")}>
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <DaftarHalaman saatPilih={() => setBuka(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Tombol sebelumnya / berikutnya di kaki halaman. */
export function SebelumBerikut() {
  const { b, t } = useBahasa();
  const jalur = useJalur().replace(/\/+$/, "") || "/";
  const i = HALAMAN_DOK.findIndex((h) => jalurHalaman(h.slug) === jalur);
  if (i < 0) return null;
  const lalu = HALAMAN_DOK[i - 1];
  const lanjut = HALAMAN_DOK[i + 1];
  return (
    <div className="mt-14 grid gap-3 border-t border-line pt-6 sm:grid-cols-2">
      {lalu ? (
        <Link href={jalurHalaman(lalu.slug)} className="group card flex items-center gap-3 p-4 transition-colors hover:border-accent/40">
          <ArrowLeft className="size-4 text-muted transition-transform group-hover:-translate-x-0.5" aria-hidden />
          <span>
            <span className="block text-[12px] text-muted">{t("Sebelumnya", "Previous")}</span>
            <span className="block text-[14px] font-semibold">{lalu.judul[b]}</span>
          </span>
        </Link>
      ) : (
        <span />
      )}
      {lanjut && (
        <Link href={jalurHalaman(lanjut.slug)} className="group card flex items-center justify-end gap-3 p-4 text-right transition-colors hover:border-accent/40">
          <span>
            <span className="block text-[12px] text-muted">{t("Berikutnya", "Next")}</span>
            <span className="block text-[14px] font-semibold">{lanjut.judul[b]}</span>
          </span>
          <ArrowRight className="size-4 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      )}
    </div>
  );
}
