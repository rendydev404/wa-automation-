import { Suspense } from "react";
import type { Metadata } from "next";
import { MEREK } from "@/lib/merek";
import { IsiAnalitik, KerangkaAnalitik } from "./isi-analitik";

export const metadata: Metadata = { title: `Analitik · Admin · ${MEREK}` };

/**
 * Analitik perilaku pengguna. Judul statis masuk static shell; angka (bergantung searchParams & sesi admin) dialirkan di
 * dalam Suspense dengan kerangka berukuran sama (pola cacheComponents, lihat docs Next "Caching").
 */
export default function HalamanAnalitik(props: PageProps<"/[lang]/admin/analitik">) {
  return (
    <div className="space-y-6 lg:space-y-8">
      <div>
        <p className="text-[11.5px] font-semibold tracking-[0.08em] text-accent uppercase">Panel admin</p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-[28px]">Analitik pengguna</h1>
        <p className="mt-1 max-w-2xl text-muted">
          Halaman yang dibuka, tombol yang diklik, dan fitur yang dipakai pengguna, dicatat otomatis tanpa merekam isi data pelanggan.
        </p>
      </div>
      <Suspense fallback={<KerangkaAnalitik />}>
        <IsiAnalitik searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
