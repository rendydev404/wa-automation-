import { Suspense } from "react";
import type { Metadata } from "next";
import { DaftarNotifikasi } from "@/components/daftar-notifikasi";
import { bahasaSah, pembuatT } from "@/lib/bahasa";
import { teksHalaman } from "@/lib/bahasa-halaman";
import { sekarang } from "@/lib/db";
import { MEREK } from "@/lib/merek";
import { daftarNotif } from "@/lib/notifikasi";
import { requireUser } from "@/lib/session";

export async function generateMetadata({ params }: PageProps<"/[lang]/notifikasi">): Promise<Metadata> {
  const { lang } = await params;
  const t = pembuatT(bahasaSah(lang) ? lang : "id");
  return { title: `${t("Notifikasi", "Notifications")} · ${MEREK}` };
}

export default async function HalamanNotifikasi() {
  const { t } = await teksHalaman();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">{t("Notifikasi", "Notifications")}</h1>
        <p className="mt-1 text-muted">{t("Aktivitas penting akun Anda, terbaru di atas. Disimpan 90 hari.", "Important activity on your account, newest first. Kept for 90 days.")}</p>
      </div>
      <Suspense fallback={<div aria-hidden className="card h-96 animate-denyut" />}>
        <Isi />
      </Suspense>
    </div>
  );
}

async function Isi() {
  const user = await requireUser();
  const { daftar, adaLagi } = await daftarNotif(user.id, { batas: 30 });
  return <DaftarNotifikasi awal={daftar} adaLagiAwal={adaLagi} kini={sekarang()} />;
}
