import { Suspense } from "react";
import { redirect } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { getUser } from "@/lib/session";
import { LoginForm } from "./login-form";

/** Sudah login (sesi benar-benar sah di database)? Langsung ke beranda. */
async function SudahMasuk() {
  if (await getUser()) redirect("/");
  return null;
}

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <Suspense fallback={null}>
        <SudahMasuk />
      </Suspense>
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center text-center">
          <span className="mb-4 grid size-12 place-items-center rounded-2xl bg-accent text-on-accent">
            <MessageCircle className="size-6" aria-hidden />
          </span>
          <h1 className="text-xl font-bold tracking-tight">Asisten WhatsApp</h1>
          <p className="mt-1 text-[13px] text-muted">Masuk untuk mengelola nomor dan base knowledge.</p>
        </div>
        <div className="card p-6">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
