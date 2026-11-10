import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChevronRight, Code2, Server, ShieldCheck, Wallet } from "lucide-react";
import Link from "@/components/link";
import { labelFitur } from "@/lib/api-def";
import { teksHalaman } from "@/lib/bahasa-halaman";
import { aplikasiMilik, pengaturanApi } from "@/lib/developer-api";
import { tanggal } from "@/lib/format";
import { MEREK } from "@/lib/merek";
import { modeMesin } from "@/lib/mode";
import { requireAksesApi } from "@/lib/session";
import { FormAjukan } from "./form-developer";
import { PillStatus } from "./umum";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await teksHalaman();
  return { title: `${t("Developer API", "Developer API")} · ${MEREK}` };
}

/** Portal developer luar: ajukan aplikasi, lihat status, lalu kelola key & mesin di halaman detailnya. */
export default async function HalamanDeveloper() {
  if (modeMesin()) notFound();
  const { t } = await teksHalaman();
  const poin = [
    { ikon: Code2, judul: t("Satu API key", "One API key"), isi: t("Semua fitur yang dibuka untuk aplikasi Anda dipanggil dengan satu key.", "Every feature opened for your app is called with a single key.") },
    {
      ikon: Server,
      judul: t("Jalan di server Anda", "Runs on your server"),
      isi: t("Mesin ChatGerCep dipasang di server Anda (Docker). Server, nomor WA, database, dan kunci AI milik Anda.", "The ChatGerCep engine runs on your server (Docker). Server, WhatsApp numbers, database, and AI keys are yours."),
    },
    { ikon: ShieldCheck, judul: t("Data tetap di Anda", "Your data stays with you"), isi: t("Isi chat & Informasi Usaha tidak pernah dikirim ke server kami.", "Chats & Business Info are never sent to our servers.") },
    { ikon: Wallet, judul: t("Gratis secara bawaan", "Free by default"), isi: t("Biaya (bila ada) ditentukan saat pengajuan disetujui.", "Pricing (if any) is set when your application is approved.") },
  ];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">Developer API</h1>
        <p className="mt-1 max-w-2xl text-muted">
          {t(
            "Pakai fitur ChatGerCep (WhatsApp, bot AI, Informasi Usaha) di aplikasi Anda sendiri tanpa membangun dari nol.",
            "Use ChatGerCep features (WhatsApp, AI bot, Business Info) in your own app without building them from scratch.",
          )}{" "}
          <Link href="/docs/api" className="font-semibold text-accent hover:underline">
            {t("Baca dokumentasi", "Read the docs")}
          </Link>
        </p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {poin.map((p) => (
          <li key={p.judul} className="card flex gap-3 p-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
              <p.ikon className="size-4" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-[13.5px] font-bold">{p.judul}</span>
              <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{p.isi}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="card p-4 sm:p-6">
          <h2 className="text-[15px] font-bold">{t("Ajukan akses API", "Apply for API access")}</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            {t("Tim kami meninjau setiap pengajuan dan membuka fitur yang sesuai.", "Our team reviews every application and opens the matching features.")}
          </p>
          <div className="mt-5">
            <Suspense fallback={<div aria-hidden className="h-96 animate-denyut rounded-xl bg-subtle" />}>
              <Ajukan />
            </Suspense>
          </div>
        </section>
        <Suspense fallback={<div aria-hidden className="card h-64 animate-denyut" />}>
          <DaftarAplikasi />
        </Suspense>
      </div>
    </div>
  );
}

/** Formulir pengajuan dengan fitur yang sedang dibagikan developer internal (getSetting dimemo: tanpa query tambahan). */
async function Ajukan() {
  await requireAksesApi();
  return <FormAjukan fitur={(await pengaturanApi()).fitur} />;
}

async function DaftarAplikasi() {
  const user = await requireAksesApi();
  const { b, t } = await teksHalaman();
  const daftar = await aplikasiMilik(user.id);
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-line p-4 sm:p-5">
        <h2 className="text-[15px] font-bold">{t("Aplikasi saya", "My applications")}</h2>
        <p className="text-[13px] text-muted">{t(`${daftar.length} aplikasi`, `${daftar.length} ${daftar.length === 1 ? "application" : "applications"}`)}</p>
      </div>
      {daftar.length ? (
        <ul className="divide-y divide-line">
          {daftar.map((a) => (
            <li key={a.id}>
              <Link href={`/developer/${a.id}`} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-subtle/50 sm:px-5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ink text-[15px] font-bold text-ink-signal uppercase">{a.nama.charAt(0)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[14px] font-semibold">{a.nama}</span>
                    <PillStatus status={a.status} t={t} />
                  </span>
                  <span className="mt-0.5 block truncate text-[12.5px] text-muted">
                    {(a.status === "menunggu" ? a.fitur_diminta : a.fitur).map(labelFitur).join(" · ") || "-"}
                  </span>
                  <span className="block text-[12px] text-faint">{t(`Diajukan ${tanggal(a.created_at)}`, `Applied ${tanggal(a.created_at, b)}`)}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-10 text-center text-[13px] text-muted">{t("Belum ada pengajuan. Isi formulir di samping untuk mulai.", "No applications yet. Fill in the form to get started.")}</p>
      )}
    </section>
  );
}
