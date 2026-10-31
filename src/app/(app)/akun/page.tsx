import { Suspense } from "react";
import type { Metadata } from "next";
import { BannerKuota } from "@/components/banner-akun";
import { KartuLangganan } from "@/components/kartu-langganan";
import { tanggal } from "@/lib/format";
import { nomorMilik } from "@/lib/numbers";
import { penggunaById } from "@/lib/pengguna";
import { kuotaNomor, requireUser } from "@/lib/session";
import { FormKeluarSemua, FormPassword, FormProfil } from "./form-akun";
import { MEREK } from "@/lib/merek";

export const metadata: Metadata = { title: `Akun saya · ${MEREK}` };

export default function HalamanAkun() {
  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <BannerKuota />
      </Suspense>
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">Akun saya</h1>
        <p className="mt-1 text-muted">Profil, keamanan login, dan kuota nomor WhatsApp Anda.</p>
      </div>
      <Suspense fallback={<div aria-hidden className="card h-36 animate-denyut" />}>
        <KartuLangganan tautan />
      </Suspense>
      <Suspense fallback={<div aria-hidden className="card h-96 animate-denyut" />}>
        <Isi />
      </Suspense>
    </div>
  );
}

async function Isi() {
  const user = await requireUser();
  const [data, kuota, nomor] = await Promise.all([penggunaById(user.id), kuotaNomor(user), nomorMilik(user.id)]);
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        <section className="card p-6">
          <h2 className="text-[15px] font-bold">Profil</h2>
          <p className="mt-0.5 text-[13px] text-muted">Email dipakai untuk masuk dan tidak bisa diubah sendiri.</p>
          <div className="mt-5">
            <FormProfil nama={user.nama} email={user.email} />
          </div>
        </section>
        <section className="card p-6">
          <h2 className="text-[15px] font-bold">{data?.punya_password === false ? "Pasang password" : "Ganti password"}</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            {data?.punya_password === false
              ? "Akun ini dibuat lewat Google. Pasang password bila ingin bisa masuk juga dengan email."
              : "Setelah diganti, semua perangkat lain otomatis keluar."}
          </p>
          <div className="mt-5">
            <FormPassword punyaPassword={data?.punya_password !== false} />
          </div>
        </section>
      </div>
      <div className="space-y-6">
        <section className="card p-6">
          <h2 className="text-[15px] font-bold">Kuota nomor</h2>
          <p className="mt-3 text-3xl font-bold tabular-nums">
            {nomor.length}
            <span className="text-lg text-muted"> / {kuota === null ? "∞" : kuota}</span>
          </p>
          <p className="mt-1 text-[13px] text-muted">{kuota === null ? "Admin: tanpa batas nomor." : "Butuh lebih banyak nomor? Hubungi admin."}</p>
          <dl className="mt-5 space-y-2 border-t border-line pt-4 text-[13px]">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Peran</dt>
              <dd className="font-semibold">{user.peran === "admin" ? "Admin" : "Pengguna"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Google</dt>
              <dd className="font-semibold">{data?.google ? "Tertaut" : "Belum tertaut"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Terdaftar</dt>
              <dd className="font-semibold">{data ? tanggal(data.created_at) : "-"}</dd>
            </div>
          </dl>
        </section>
        <section className="card p-6">
          <h2 className="text-[15px] font-bold">Sesi login</h2>
          <p className="mt-0.5 text-[13px] text-muted">Lupa keluar di komputer lain? Keluarkan semua perangkat selain yang ini.</p>
          <div className="mt-4">
            <FormKeluarSemua />
          </div>
        </section>
      </div>
    </div>
  );
}
