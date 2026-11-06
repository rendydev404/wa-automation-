"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { type ItemOpsi, PilihOpsi } from "@/components/pilih-opsi";

/**
 * Saring daftar pengguna menurut paket (semua / gratis / berbayar / satu jenis paket). Berpindah halaman langsung saat
 * dipilih, mempertahankan pencarian & tab status; kursor halaman dibuang (hasil saringan baru mulai dari awal).
 */
export function SaringPaket({ nilai, opsi, param }: { nilai: string; opsi: ItemOpsi[]; param: Record<string, string> }) {
  const router = useRouter();
  const [tunggu, mulai] = useTransition();
  return (
    <div className="relative w-full sm:w-60">
      <PilihOpsi
        nilai={nilai}
        label="Saring paket"
        opsi={opsi}
        onUbah={(v) => {
          const q = new URLSearchParams(param);
          if (v) q.set("p", v);
          else q.delete("p");
          const s = q.toString();
          mulai(() => router.push(s ? `/admin/pengguna?${s}` : "/admin/pengguna"));
        }}
      />
      {tunggu && <Loader2 className="pointer-events-none absolute top-1/2 right-9 size-4 -translate-y-1/2 animate-spin text-muted" aria-hidden />}
    </div>
  );
}
