import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "@/components/link";
import { GalatGoogle } from "@/components/galat-google";
import { KartuAuth } from "@/components/kartu-auth";
import { TombolGoogle } from "@/components/tombol-google";
import { bahasaSah, pembuatT } from "@/lib/bahasa";
import { alihkanHalaman, teksHalaman } from "@/lib/bahasa-halaman";
import { getUser, halamanAwal } from "@/lib/session";
import { LoginForm } from "./login-form";
import { jalurLanjut } from "@/lib/lanjut";
import { MEREK } from "@/lib/merek";

export async function generateMetadata({ params }: PageProps<"/[lang]/login">): Promise<Metadata> {
  const { lang } = await params;
  const t = pembuatT(bahasaSah(lang) ? lang : "id");
  return { title: `${t("Masuk", "Sign in")} · ${MEREK}` };
}

/** Sudah login (sesi benar-benar sah di database)? Langsung ke tujuan ?lanjut= atau halaman awalnya (admin: panel admin). */
async function SudahMasuk({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getUser();
  if (!user) return null;
  const lanjut = user.peran === "admin" ? null : jalurLanjut((await searchParams).lanjut);
  await alihkanHalaman(lanjut ?? halamanAwal(user.peran));
  return null;
}

export default async function LoginPage(props: PageProps<"/[lang]/login">) {
  const { t } = await teksHalaman();
  return (
    <KartuAuth
      judul={t("Masuk ke akun", "Sign in to your account")}
      sub={t("Kelola nomor WhatsApp dan base knowledge AI Anda.", "Manage your WhatsApp numbers and your AI's product knowledge.")}
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
