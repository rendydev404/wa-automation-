import { Suspense } from "react";
import { BuatAkun, TabelPengguna } from "../bagian";

export default function HalamanPengguna(props: PageProps<"/[lang]/admin/pengguna">) {
  return (
    <div className="space-y-6 lg:space-y-8">
      <div>
        <p className="text-[11.5px] font-semibold tracking-[0.08em] text-accent uppercase">Panel admin</p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-[28px]">Pengguna</h1>
        <p className="mt-1 max-w-2xl text-muted">Cari akun, atur kuota perangkat, blokir penyalahgunaan, reset password, kelola paket, atau hapus pengguna.</p>
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Suspense fallback={<div aria-hidden className="card h-[480px] animate-denyut" />}>
          <TabelPengguna searchParams={props.searchParams} />
        </Suspense>
        <BuatAkun />
      </div>
    </div>
  );
}
