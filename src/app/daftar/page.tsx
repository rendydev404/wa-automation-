import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { KartuAuth } from "@/components/kartu-auth";
import { TombolGoogle } from "@/components/tombol-google";
import { getUser, pendaftaranDibuka } from "@/lib/session";
import { DaftarForm } from "./daftar-form";

export const metadata: Metadata = { title: "Daftar · Asisten WhatsApp" };

/** Sudah login? ke dashboard. Pendaftaran ditutup admin? tampilkan pemberitahuan, bukan formulir. */
async function Isi() {
  if (await getUser()) redirect("/dashboard");
  if (!(await pendaftaranDibuka()))
    return <p className="text-[13.5px] text-muted">Pendaftaran akun baru sedang ditutup. Silakan hubungi admin untuk dibuatkan akun.</p>;
  return (
    <>
      <TombolGoogle label="Daftar dengan Google" />
      <DaftarForm />
    </>
  );
}

export default function DaftarPage() {
  return (
    <KartuAuth
      judul="Buat akun baru"
      sub="Gratis. Sambungkan WhatsApp Anda dalam dua menit."
      kaki={
        <>
          Sudah punya akun?{" "}
          <Link href="/login" className="font-semibold text-accent hover:underline">
            Masuk
          </Link>
        </>
      }
    >
      <Suspense fallback={<div aria-hidden className="h-[420px] animate-denyut rounded-xl bg-subtle" />}>
        <Isi />
      </Suspense>
    </KartuAuth>
  );
}
