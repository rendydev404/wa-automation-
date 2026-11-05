import { Suspense } from "react";
import type { Metadata } from "next";
import { BannerKuota } from "@/components/banner-akun";
import { GantiBahasa } from "@/components/ganti-bahasa";
import { KartuLangganan } from "@/components/kartu-langganan";
import { bahasaSah, pembuatT } from "@/lib/bahasa";
import { teksHalaman } from "@/lib/bahasa-halaman";
import { tanggal } from "@/lib/format";
import { nomorMilik } from "@/lib/numbers";
import { penggunaById } from "@/lib/pengguna";
import { kuotaNomor, requireUser } from "@/lib/session";
import { LencanaPaket } from "@/components/lencana-paket";
import { tingkatPaket } from "@/lib/tingkat-paket";
import { FormKeluarSemua, FormPassword, FormProfil } from "./form-akun";
import { MEREK } from "@/lib/merek";

export async function generateMetadata({ params }: PageProps<"/[lang]/akun">): Promise<Metadata> {
  const { lang } = await params;
  const t = pembuatT(bahasaSah(lang) ? lang : "id");
  return { title: `${t("Akun saya", "My account")} · ${MEREK}` };
}

export default async function HalamanAkun() {
  const { t } = await teksHalaman();
  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <BannerKuota />
      </Suspense>
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">{t("Akun saya", "My account")}</h1>
        <p className="mt-1 text-muted">{t("Profil, keamanan login, dan kuota nomor WhatsApp Anda.", "Your profile, sign-in security, and WhatsApp number quota.")}</p>
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
  const { b, t } = await teksHalaman();
  const [data, kuota, nomor] = await Promise.all([penggunaById(user.id), kuotaNomor(user), nomorMilik(user.id)]);
  const tingkat = data?.paket_nama ? tingkatPaket(data.paket_kode, data.paket_nama) : null;
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        <section className="card p-6">
          {/* Kartu identitas: avatar, nama, dan lencana paket aktif (sama dengan yang dilihat admin). */}
          <div className="mb-5 flex flex-wrap items-center gap-4 border-b border-line pb-5">
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-ink text-xl font-bold text-ink-signal uppercase">{(user.nama || user.email).charAt(0)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-bold">{user.nama || user.email.split("@")[0]}</p>
              <p className="truncate text-[13px] text-muted">{user.email}</p>
            </div>
            {data?.paket_nama ? (
              <div className="text-right">
                <LencanaPaket tingkat={tingkat} nama={data.paket_nama} ukuran="lg" />
                {data.paket_sampai && <p className="mt-1.5 text-[12px] text-muted">{t(`Aktif sampai ${tanggal(data.paket_sampai)}`, `Active until ${tanggal(data.paket_sampai, b)}`)}</p>}
              </div>
            ) : (
              user.peran !== "admin" && <LencanaPaket tingkat={null} nama={t("Gratis", "Free")} ukuran="lg" />
            )}
          </div>
          <h2 className="text-[15px] font-bold">{t("Profil", "Profile")}</h2>
          <p className="mt-0.5 text-[13px] text-muted">{t("Email dipakai untuk masuk dan tidak bisa diubah sendiri.", "Your email is used to sign in and can't be changed by you.")}</p>
          <div className="mt-5">
            <FormProfil nama={user.nama} email={user.email} />
          </div>
        </section>
        <section className="card p-6">
          <h2 className="text-[15px] font-bold">{data?.punya_password === false ? t("Pasang password", "Set a password") : t("Ganti password", "Change password")}</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            {data?.punya_password === false
              ? t(
                  "Akun ini dibuat lewat Google. Pasang password bila ingin bisa masuk juga dengan email.",
                  "This account was created with Google. Set a password if you also want to sign in with your email.",
                )
              : t("Setelah diganti, semua perangkat lain otomatis keluar.", "After you change it, all other devices are signed out automatically.")}
          </p>
          <div className="mt-5">
            <FormPassword punyaPassword={data?.punya_password !== false} />
          </div>
        </section>
      </div>
      <div className="space-y-6">
        <section className="card p-6">
          <h2 className="text-[15px] font-bold">{t("Kuota nomor", "Number quota")}</h2>
          <p className="mt-3 text-3xl font-bold tabular-nums">
            {nomor.length}
            <span className="text-lg text-muted"> / {kuota === null ? "∞" : kuota}</span>
          </p>
          <p className="mt-1 text-[13px] text-muted">{kuota === null ? t("Admin: tanpa batas nomor.", "Admin: unlimited numbers.") : t("Butuh lebih banyak nomor? Hubungi admin.", "Need more numbers? Contact the admin.")}</p>
          <dl className="mt-5 space-y-2 border-t border-line pt-4 text-[13px]">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{t("Peran", "Role")}</dt>
              <dd className="font-semibold">{user.peran === "admin" ? "Admin" : t("Pengguna", "User")}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Google</dt>
              <dd className="font-semibold">{data?.google ? t("Tertaut", "Linked") : t("Belum tertaut", "Not linked")}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{t("Terdaftar", "Joined")}</dt>
              <dd className="font-semibold">{data ? tanggal(data.created_at, b) : "-"}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">{t("Bahasa", "Language")}</dt>
              <dd className="flex items-center gap-1 font-semibold">
                {b === "en" ? "English" : "Bahasa Indonesia"}
                <GantiBahasa className="-my-2 -mr-2.5" />
              </dd>
            </div>
          </dl>
        </section>
        <section className="card p-6">
          <h2 className="text-[15px] font-bold">{t("Sesi login", "Sign-in sessions")}</h2>
          <p className="mt-0.5 text-[13px] text-muted">{t("Lupa keluar di komputer lain? Keluarkan semua perangkat selain yang ini.", "Forgot to sign out on another computer? Sign out every device except this one.")}</p>
          <div className="mt-4">
            <FormKeluarSemua />
          </div>
        </section>
      </div>
    </div>
  );
}
