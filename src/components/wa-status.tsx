"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { SesiNomor, StatusWa } from "@/lib/types";

interface Nilai {
  data: StatusWa | null;
  muatUlang: () => void;
}

const Ctx = createContext<Nilai>({ data: null, muatUlang: () => {} });

const tanpaLangganan = () => () => {};

/**
 * Bagian halaman yang di-stream belakangan (Suspense) bisa dihidrasi setelah status pertama tiba. Saat hidrasi
 * data dianggap belum ada, sama dengan HTML dari server, lalu dirender ulang dengan data: tanpa galat hidrasi.
 */
export function useWaStatus(): Nilai {
  const nilai = useContext(Ctx);
  const terhidrasi = useSyncExternalStore(tanpaLangganan, () => true, () => false);
  return terhidrasi || !nilai.data ? nilai : { ...nilai, data: null };
}

/** Status sesi WhatsApp satu nomor; `undefined` selama belum termuat. */
export function useSesiNomor(id: number): SesiNomor | undefined {
  const { data } = useWaStatus();
  if (!data) return undefined;
  return data.nomor[id] ?? { status: "BELUM_ADA", waId: null, nama: null, alasan: null };
}

/**
 * Satu poller status untuk semua nomor (satu permintaan berapa pun jumlah nomornya).
 * Cepat (3 dtk) hanya selagi ada nomor yang menunggu scan QR, selebihnya 20 dtk;
 * berhenti saat tab tidak terlihat.
 */
export function WaStatusProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [data, setData] = useState<StatusWa | null>(null);
  const picu = useRef<() => void>(() => {});

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let jalan = false;
    let hidup = true;

    async function ambil() {
      if (jalan || !hidup) return;
      jalan = true;
      clearTimeout(timer);
      let cepat = false;
      try {
        const res = await fetch("/api/wa/status", { cache: "no-store" });
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        if (res.ok && hidup) {
          const d = (await res.json()) as StatusWa;
          setData(d);
          cepat = Object.values(d.nomor).some((s) => s.status === "SCAN_QR_CODE" || s.status === "STARTING");
        }
      } catch {
        // jaringan putus sesaat: coba lagi di putaran berikutnya
      } finally {
        jalan = false;
        if (hidup && !document.hidden) timer = setTimeout(ambil, cepat ? 3000 : 20000);
      }
    }

    picu.current = () => void ambil();
    const saatTerlihat = () => {
      if (!document.hidden) void ambil();
    };
    void ambil();
    document.addEventListener("visibilitychange", saatTerlihat);
    return () => {
      hidup = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", saatTerlihat);
    };
  }, [router]);

  // Identitas stabil: komponen yang memakai `muatUlang` di efeknya tidak ikut ter-reset tiap polling.
  const muatUlang = useCallback(() => picu.current(), []);
  const nilai = useMemo(() => ({ data, muatUlang }), [data, muatUlang]);
  return <Ctx value={nilai}>{children}</Ctx>;
}
