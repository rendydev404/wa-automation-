import type { Metadata } from "next";
import Link from "next/link";
import { KartuAuth } from "@/components/kartu-auth";
import { MEREK } from "@/lib/merek";
import { LupaPasswordForm } from "./lupa-form";

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
      <LupaPasswordForm />
    </KartuAuth>
  );
}
