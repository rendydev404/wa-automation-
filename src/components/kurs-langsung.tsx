"use client";

import { useSyncExternalStore } from "react";
import type { InfoKurs } from "@/lib/kurs-def";

/**
 * Kurs USD → Rp yang terus diperbarui selama halaman terbuka: ditanyakan ke server (/api/kurs) tiap 5 menit, hanya
 * saat tab terlihat, dan langsung saat tab dibuka lagi setelah lama; `segarkan` memaksa server mengambil ulang dari
 * sumber. Satu simpanan untuk seluruh halaman, jadi semua kalkulator (simulasi paket, paket Custom) memakai angka yang
 * sama dan hanya ada satu pemantau walau dipakai beberapa komponen.
 */

interface Keadaan {
  info: InfoKurs | null;
  sedang: boolean;
  galat: boolean;
}

const SELANG_MS = 5 * 60_000;
const DI_SERVER: Keadaan = { info: null, sedang: false, galat: false };

let st: Keadaan = DI_SERVER;
let terakhir = 0;
let berhenti: (() => void) | null = null;
const pendengar = new Set<() => void>();

function ubah(baru: Partial<Keadaan>) {
  st = { ...st, ...baru };
  for (const f of pendengar) f();
}

async function ambil(paksa: boolean) {
  terakhir = Date.now();
  ubah({ sedang: true });
  try {
    const res = await fetch(paksa ? "/api/kurs?segarkan=1" : "/api/kurs", { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    ubah({ info: (await res.json()) as InfoKurs, galat: false, sedang: false });
  } catch {
    ubah({ galat: true, sedang: false });
  }
}

function pantau(): () => void {
  if (!terakhir) terakhir = Date.now(); // halaman baru dirender server dengan kurs terbaru
  const mungkinAmbil = () => {
    if (document.visibilityState === "visible" && Date.now() - terakhir >= SELANG_MS) void ambil(false);
  };
  const id = setInterval(mungkinAmbil, 30_000);
  document.addEventListener("visibilitychange", mungkinAmbil);
  return () => {
    clearInterval(id);
    document.removeEventListener("visibilitychange", mungkinAmbil);
  };
}

function langgan(f: () => void) {
  pendengar.add(f);
  berhenti ??= pantau();
  return () => {
    pendengar.delete(f);
    if (!pendengar.size && berhenti) {
      berhenti();
      berhenti = null;
    }
  };
}

/** `awal` = kurs saat halaman dirender server; dipakai selama yang dipegang browser tidak lebih baru. */
export function useKursLangsung(awal: InfoKurs) {
  const s = useSyncExternalStore(
    langgan,
    () => st,
    () => DI_SERVER
  );
  return {
    info: s.info && s.info.diambil >= awal.diambil ? s.info : awal,
    sedang: s.sedang,
    galat: s.galat,
    segarkan: () => void ambil(true),
  };
}
