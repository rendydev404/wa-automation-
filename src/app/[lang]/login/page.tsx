import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "@/components/link";
import { GalatGoogle } from "@/components/galat-google";
import { KartuAuth } from "@/components/kartu-auth";
import { TombolGoogle } from "@/components/tombol-google";
import { bahasaSah, pembuatT } from "@/lib/bahasa";
import { alihkanHalaman, teksHalaman } from "@/lib/bahasa-halaman";
import { getUser, halamanAwal } from "@/lib/session";
import { modeMesin } from "@/lib/mode";
import { dashboardMesinBoleh } from "@/lib/mesin/lisensi";
import { LoginForm } from "./login-form";
import { jalurLanjut } from "@/lib/lanjut";
import { MEREK } from "@/lib/merek";
import { staf } from "@/lib/peran";

export async function generateMetadata({ params }: PageProps<"/[lang]/login">): Promise<Metadata> {
  const { lang } = await params;
  const t = pembuatT(bahasaSah(lang) ? lang : "id");
  return { title: `${t("Masuk", "Sign in")} · ${MEREK}` };
}

/** Sudah login (sesi benar-benar sah di database)? Langsung ke tujuan ?lanjut= atau halaman awalnya (admin: panel admin). */
async function SudahMasuk({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getUser();
  // Mesin self-host dengan dashboard bawaan ditutup (lisensi / .env): login tidak berguna, tampilkan status mode API.
  if (!user && modeMesin() && !(await dashboardMesinBoleh())) await alihkanHalaman("/mode-api");
  if (!user) return null;
  const lanjut = staf(user.peran) ? null : jalurLanjut((await searchParams).lanjut);
  await alihkanHalaman(lanjut ?? halamanAwal(user.peran));
  return null;
}

export default async function LoginPage(props: PageProps<"/[lang]/login">) {
  const { t } = await teksHalaman();
  return (
    <KartuAuth
      judul={t("Masuk ke akun", "Sign in to your account")}
      sub={t("Kelola nomor WhatsApp dan Informasi Usaha AI Anda.", "Manage your WhatsApp numbers and your AI's Business Info.")}
      kaki={
        <>
          {t("Belum punya akun?", "Don't have an account?")}{" "}
          <Link href="/daftar" className="font-semibold text-accent hover:underline">
            {t("Daftar sekarang", "Sign up now")}
          </Link>
        </>
      }
    >
      <Suspense fallback={null}>
        <SudahMasuk searchParams={props.searchParams} />
        <GalatGoogle />
      </Suspense>
      <Suspense fallback={<div aria-hidden className="h-[74px]" />}>
        <TombolGoogle />
      </Suspense>
      <LoginForm />
    </KartuAuth>
  );
}
