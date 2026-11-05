"use client";

import { createContext, useContext, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { type Bahasa, pembuatT, tautan, urai } from "@/lib/bahasa";

/** Bahasa halaman untuk komponen klien; dipasang sekali di root layout (src/app/[lang]/layout.tsx). */
const KonteksBahasa = createContext<Bahasa>("id");

export function PenyediaBahasa({ bahasa, children }: { bahasa: Bahasa; children: React.ReactNode }) {
  return <KonteksBahasa.Provider value={bahasa}>{children}</KonteksBahasa.Provider>;
}

/** `const { b, t, href } = useBahasa();` — t("Simpan", "Save"), href("/dashboard") -> "/eng/dashboard". */
export function useBahasa() {
  const b = useContext(KonteksBahasa);
  return useMemo(() => ({ b, t: pembuatT(b), href: (jalur: string) => tautan(b, jalur) }), [b]);
}

/** usePathname() tanpa awalan bahasa: "/eng/nomor/3" -> "/nomor/3" (untuk menandai menu aktif). */
export function useJalur(): string {
  return urai(usePathname() ?? "/").jalur;
}

/** useRouter() yang push/replace/prefetch-nya mempertahankan bahasa halaman. */
export function useRouterBahasa() {
  const router = useRouter();
  const b = useContext(KonteksBahasa);
  return useMemo(
    () => ({
      ...router,
      push: (jalur: string, opsi?: Parameters<typeof router.push>[1]) => router.push(tautan(b, jalur), opsi),
      replace: (jalur: string, opsi?: Parameters<typeof router.replace>[1]) => router.replace(tautan(b, jalur), opsi),
      prefetch: (jalur: string, opsi?: Parameters<typeof router.prefetch>[1]) => router.prefetch(tautan(b, jalur), opsi),
    }),
    [router, b],
  );
}
