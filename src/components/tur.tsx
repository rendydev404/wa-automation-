"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { selesaiTurAction } from "@/app/actions";
import type { T } from "@/lib/bahasa";
import { useBahasa } from "./bahasa";

/**
 * Tur panduan: menyorot satu bagian layar per langkah (elemen dengan atribut data-tur="..."), sisanya diredupkan.
 * Tanpa pustaka. Langkah yang elemennya tidak ada di halaman (mis. belum punya nomor) dilewati otomatis.
 * Selesai/dilewati dicatat per akun (users.tur_selesai), jadi tidak muncul lagi di perangkat mana pun;
 * tombol "Panduan" di sidebar memutarnya ulang kapan saja (tur halaman yang sedang dibuka).
 */

export interface LangkahTur {
  /** Nilai atribut data-tur elemen yang disorot; kosong = kartu di tengah layar. */
  sasaran?: string;
  judul: string;
  isi: ReactNode;
}

/**
 * Isi satu tur, dibuat sesuai bahasa halaman: `(t) => [...]`. Berupa fungsi dari modul klien (isi-tur.tsx), jadi
 * Server Component tetap bisa meneruskannya ke TurOtomatis sebagai referensi klien.
 */
export type IsiTur = (t: T) => LangkahTur[];

interface KonteksTur {
  mulai: (nama: string, langkah: LangkahTur[]) => void;
}
const Konteks = createContext<KonteksTur | null>(null);

export function useTur(): KonteksTur {
  const k = useContext(Konteks);
  if (!k) throw new Error("useTur di luar PenyediaTur");
  return k;
}

// Tur yang sudah dibuka di tab ini (supaya tidak dimulai dua kali sebelum halaman dimuat ulang).
const sudahDibuka = new Set<string>();

export function PenyediaTur({ children }: { children: ReactNode }) {
  const [aktif, setAktif] = useState<{ nama: string; langkah: LangkahTur[] } | null>(null);
  const mulai = useCallback((nama: string, langkah: LangkahTur[]) => {
    sudahDibuka.add(nama);
    setAktif({ nama, langkah });
  }, []);
  const tutup = useCallback((nama: string) => {
    setAktif(null);
    void selesaiTurAction(nama); // idempoten di database
  }, []);
  return (
    <Konteks value={{ mulai }}>
      {children}
      {aktif && <Sorot key={aktif.nama} langkah={aktif.langkah} tutup={() => tutup(aktif.nama)} />}
    </Konteks>
  );
}

/**
 * Pasang di bagian halaman yang sudah membaca sesi: tur `nama` otomatis mulai sekali untuk akun yang belum
 * pernah melihatnya (`sudah` dibaca server dari users.tur_selesai).
 */
export function TurOtomatis({ nama, langkah, sudah }: { nama: string; langkah: IsiTur; sudah: boolean }) {
  const { mulai } = useTur();
  const { t } = useBahasa();
  useEffect(() => {
    if (sudah || sudahDibuka.has(nama)) return;
    // Tunggu bagian halaman lain selesai tampil (di-stream) sebelum mengukur posisi elemen.
    const jeda = setTimeout(() => mulai(nama, langkah(t)), 900);
    return () => clearTimeout(jeda);
  }, [nama, langkah, mulai, sudah, t]);
  return null;
}

/** Tombol untuk memutar ulang tur `nama`. */
export function TombolTur({ nama, langkah, children, className }: { nama: string; langkah: IsiTur; children: ReactNode; className?: string }) {
  const { mulai } = useTur();
  const { t } = useBahasa();
  return (
    <button type="button" className={className} onClick={() => mulai(nama, langkah(t))}>
      {children}
    </button>
  );
}

const JARAK = 10;

/** Elemen benar-benar tampil (bukan di laci sidebar yang tertutup di HP, bukan disembunyikan). */
function terlihat(el: Element | null): boolean {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth && getComputedStyle(el).visibility !== "hidden";
}

/**
 * Sasaran yang sedang tampil: menu yang sama ada di sidebar (desktop) dan bilah bawah (HP), pilih yang terlihat.
 * Bagian yang ada di tab tersembunyi (halaman nomor, tab-nomor.tsx): tombol tab-nya (data-tur-tab) yang disorot.
 */
function sasaranTerlihat(nama: string): HTMLElement | null {
  const semua = Array.from(document.querySelectorAll<HTMLElement>(`[data-tur="${nama}"]`));
  return semua.find(terlihat) ?? Array.from(document.querySelectorAll<HTMLElement>(`[data-tur-tab~="${nama}"]`)).find(terlihat) ?? null;
}

function Sorot({ langkah: semua, tutup }: { langkah: LangkahTur[]; tutup: () => void }) {
  const { t } = useBahasa();
  // Hanya langkah yang elemennya ada di halaman ini.
  const [langkah] = useState(() => semua.filter((l) => !l.sasaran || sasaranTerlihat(l.sasaran)));
  const [i, setI] = useState(0);
  // Posisi elemen yang disorot, dicatat bersama nomor langkahnya (langkah tanpa sasaran = tanpa kotak).
  const [ukuran, setUkuran] = useState<{ i: number; r: DOMRect } | null>(null);
  const kartu = useRef<HTMLDivElement>(null);
  const l = langkah[i];

  useLayoutEffect(() => {
    if (!l) return;
    // Halaman bertab: buka tab yang memuat sasaran langkah ini (tab-nomor.tsx mendengarkan).
    if (l.sasaran) window.dispatchEvent(new CustomEvent("tur:sasaran", { detail: l.sasaran }));
    const el = l.sasaran ? sasaranTerlihat(l.sasaran) : null;
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    const ukur = () => setUkuran({ i, r: el.getBoundingClientRect() });
    ukur();
    const t = setTimeout(ukur, 400); // setelah gulir halus selesai
    window.addEventListener("resize", ukur);
    window.addEventListener("scroll", ukur, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", ukur);
      window.removeEventListener("scroll", ukur, true);
    };
  }, [l, i]);

  useEffect(() => {
    kartu.current?.focus();
    const tombol = (e: KeyboardEvent) => {
      if (e.key === "Escape") tutup();
      else if (e.key === "ArrowRight") setI((x) => Math.min(x + 1, langkah.length - 1));
      else if (e.key === "ArrowLeft") setI((x) => Math.max(x - 1, 0));
    };
    document.addEventListener("keydown", tombol);
    return () => document.removeEventListener("keydown", tombol);
  }, [i, langkah.length, tutup]);

  if (!l) return null;
  const kotak = l.sasaran && ukuran?.i === i ? ukuran.r : null;
  const terakhir = i === langkah.length - 1;
  // Kartu di bawah elemen bila muat, di atasnya bila tidak; di tengah bila tanpa sasaran. HP: selalu menempel di bawah.
  const tinggiLayar = typeof window !== "undefined" ? window.innerHeight : 800;
  const diBawah = kotak && kotak.bottom + 260 < tinggiLayar;
  const gayaKartu: React.CSSProperties = kotak
    ? {
        left: Math.max(16, Math.min(kotak.left, window.innerWidth - 376)),
        ...(diBawah ? { top: kotak.bottom + JARAK + 6 } : { bottom: tinggiLayar - kotak.top + JARAK + 6 }),
      }
    : { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };

  return createPortal(
    <div className="fixed inset-0 z-[100]" aria-live="polite">
      {kotak ? (
        <div
          aria-hidden
          className="pointer-events-none fixed rounded-2xl ring-2 ring-ink-signal transition-all duration-300"
          style={{
            left: kotak.left - JARAK / 2,
            top: kotak.top - JARAK / 2,
            width: kotak.width + JARAK,
            height: kotak.height + JARAK,
            boxShadow: "0 0 0 9999px rgba(11, 24, 19, 0.62)",
          }}
        />
      ) : (
        <div aria-hidden className="fixed inset-0 bg-ink/60 backdrop-blur-[1px]" />
      )}
      <div
        ref={kartu}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tur-judul"
        className="fixed w-[min(360px,calc(100vw-32px))] animate-masuk rounded-2xl bg-surface p-5 text-fg shadow-pop outline-none max-sm:!top-auto max-sm:!bottom-[calc(5rem+env(safe-area-inset-bottom))] max-sm:!left-4 max-sm:!transform-none"
        style={gayaKartu}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11.5px] font-semibold tracking-[0.08em] text-accent uppercase">
            {t("Panduan", "Guide")} {i + 1}/{langkah.length}
          </p>
          <button type="button" onClick={tutup} aria-label={t("Tutup panduan", "Close guide")} className="-mt-1 -mr-1 grid size-7 place-items-center rounded-lg text-muted hover:bg-subtle hover:text-fg">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <h2 id="tur-judul" className="mt-1.5 text-[16px] font-bold tracking-tight">
          {l.judul}
        </h2>
        <div className="mt-2 space-y-2 text-[13.5px] leading-relaxed text-muted">{l.isi}</div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex gap-1" aria-hidden>
            {langkah.map((_, k) => (
              <span key={k} className={`h-1.5 rounded-full transition-all ${k === i ? "w-5 bg-accent" : "w-1.5 bg-line-strong"}`} />
            ))}
          </div>
          <div className="flex gap-2">
            {i > 0 && (
              <button type="button" onClick={() => setI(i - 1)} className="btn btn-ghost border border-line">
                <ArrowLeft className="size-4" aria-hidden /> {t("Kembali", "Back")}
              </button>
            )}
            <button type="button" onClick={() => (terakhir ? tutup() : setI(i + 1))} className="btn btn-primary">
              {terakhir ? (
                <>
                  <Check className="size-4" aria-hidden /> {t("Mengerti", "Got it")}
                </>
              ) : (
                <>
                  {t("Lanjut", "Next")} <ArrowRight className="size-4" aria-hidden />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
