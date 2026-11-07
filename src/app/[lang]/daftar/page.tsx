import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "@/components/link";
import { KartuAuth } from "@/components/kartu-auth";
import { TombolGoogle } from "@/components/tombol-google";
import { bahasaSah, pembuatT } from "@/lib/bahasa";
import { alihkanHalaman, teksHalaman } from "@/lib/bahasa-halaman";
import { getUser, halamanAwal, pendaftaranDibuka } from "@/lib/session";
import { DaftarForm } from "./daftar-form";
import { MEREK } from "@/lib/merek";
import { MASA_ID, MASA_EN_ADJ } from "@/lib/jaminan-def";

export async function generateMetadata({ params }: PageProps<"/[lang]/daftar">): Promise<Metadata> {
  const { lang } = await params;
  const t = pembuatT(bahasaSah(lang) ? lang : "id");
  return { title: `${t("Daftar", "Sign up")} · ${MEREK}` };
}

/** Sudah login? ke dashboard. Pendaftaran ditutup admin? tampilkan pemberitahuan, bukan formulir. */
async function Isi() {
  const user = await getUser();
  if (user) await alihkanHalaman(halamanAwal(user.peran));
  const { t } = await teksHalaman();
  if (!(await pendaftaranDibuka()))
    return (
      <p className="text-[13.5px] text-muted">
        {t(
          "Pendaftaran akun baru sedang ditutup. Silakan hubungi admin untuk dibuatkan akun.",
          "New sign-ups are currently closed. Please contact the admin to have an account created for you.",
        )}
      </p>
    );
  return (
    <>
      <TombolGoogle label={t("Daftar dengan Google", "Sign up with Google")} />
      <DaftarForm />
    </>
  );
}

export default async function DaftarPage() {
  const { t } = await teksHalaman();
  return (
    <KartuAuth
      judul={t("Buat akun baru", "Create a new account")}
      sub={t(
        `Sambungkan WhatsApp Anda dalam dua menit. Uji bot dulu, bayar saat siap — ada jaminan uang kembali ${MASA_ID}.`,
        `Connect your WhatsApp in two minutes. Test the bot first, pay when you're ready — backed by a ${MASA_EN_ADJ} money-back guarantee.`,
      )}
      kaki={
        <>
          {t("Sudah punya akun?", "Already have an account?")}{" "}
          <Link href="/login" className="font-semibold text-accent hover:underline">
            {t("Masuk", "Sign in")}
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
