import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { KartuAuth } from "@/components/kartu-auth";
import { MEREK } from "@/lib/merek";
import { LupaPasswordDariTautan, LupaPasswordForm } from "./lupa-form";

export const metadata: Metadata = { title: `Lupa password · ${MEREK}` };

export default function LupaPasswordPage() {
  return (
    <KartuAuth
      judul="Lupa password"
      sub="Kami kirim kode 6 digit ke email akun Anda untuk membuat password baru."
      kaki={
        <>
          Ingat password?{" "}
          <Link href="/login" className="font-semibold text-accent hover:underline">
            Masuk
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
