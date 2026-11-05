import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "@/components/link";
import { KartuAuth } from "@/components/kartu-auth";
import { bahasaSah, pembuatT } from "@/lib/bahasa";
import { teksHalaman } from "@/lib/bahasa-halaman";
import { MEREK } from "@/lib/merek";
import { LupaPasswordDariTautan, LupaPasswordForm } from "./lupa-form";

export async function generateMetadata({ params }: PageProps<"/[lang]/lupa-password">): Promise<Metadata> {
  const { lang } = await params;
  const t = pembuatT(bahasaSah(lang) ? lang : "id");
  return { title: `${t("Lupa password", "Forgot password")} · ${MEREK}` };
}

export default async function LupaPasswordPage() {
  const { t } = await teksHalaman();
  return (
    <KartuAuth
      judul={t("Lupa password", "Forgot password")}
      sub={t(
        "Kami kirim kode 6 digit ke email akun Anda untuk membuat password baru.",
        "We'll send a 6-digit code to your account email so you can set a new password.",
      )}
      kaki={
        <>
          {t("Ingat password?", "Remember your password?")}{" "}
          <Link href="/login" className="font-semibold text-accent hover:underline">
            {t("Masuk", "Sign in")}
          </Link>
        </>
      }
    >
      <Suspense fallback={<LupaPasswordForm />}>
        <LupaPasswordDariTautan />
      </Suspense>
    </KartuAuth>
  );
}
