import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GalatGoogle } from "@/components/galat-google";
import { KartuAuth } from "@/components/kartu-auth";
import { TombolGoogle } from "@/components/tombol-google";
import { getUser } from "@/lib/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Masuk · Asisten WhatsApp" };

/** Sudah login (sesi benar-benar sah di database)? Langsung ke dashboard. */
async function SudahMasuk() {
  if (await getUser()) redirect("/dashboard");
  return null;
}

export default function LoginPage() {
  return (
    <KartuAuth
      judul="Masuk ke akun"
      sub="Kelola nomor WhatsApp dan base knowledge AI Anda."
      kaki={
        <>
          Belum punya akun?{" "}
          <Link href="/daftar" className="font-semibold text-accent hover:underline">
            Daftar gratis
          </Link>
        </>
      }
    >
      <Suspense fallback={null}>
        <SudahMasuk />
        <GalatGoogle />
      </Suspense>
      <Suspense fallback={<div aria-hidden className="h-[74px]" />}>
        <TombolGoogle />
      </Suspense>
      <LoginForm />
    </KartuAuth>
  );
}
