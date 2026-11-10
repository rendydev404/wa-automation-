import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Server } from "lucide-react";
import { TombolPerbaruiLisensi } from "@/components/tombol-perbarui-lisensi";
import { teksHalaman } from "@/lib/bahasa-halaman";
import { tanggal } from "@/lib/format";
import { MEREK } from "@/lib/merek";
import { modeMesin } from "@/lib/mode";
import { alasanTerbatas, infoLisensi, muatLisensi } from "@/lib/mesin/lisensi";

export const metadata: Metadata = { title: `Mode API · ${MEREK}`, robots: { index: false } };

/**
 * Mesin self-host dengan dashboard bawaan ditutup (.env DASHBOARD_MESIN=mati atau fitur `dashboard` dimatikan dari
 * pusat): mesin berjalan murni sebagai API. Halaman ini hanya menampilkan status lisensi (tanpa data usaha).
 */
export default async function HalamanModeApi() {
  if (!modeMesin()) notFound();
  await connection();
  await muatLisensi().catch(() => {});
  const { b, t } = await teksHalaman();
  const l = infoLisensi();
  const terbatas = alasanTerbatas();
  const envMati = (process.env.DASHBOARD_MESIN ?? "").trim().toLowerCase() === "mati";
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4 py-10">
      <section className="card w-full max-w-lg p-6 sm:p-8">
        <span className="grid size-12 place-items-center rounded-2xl bg-ink text-ink-signal">
          <Server className="size-6" aria-hidden />
        </span>
        <h1 className="mt-4 text-xl font-bold">{t("Mesin ChatGerCep berjalan dalam mode API", "The ChatGerCep engine is running in API mode")}</h1>
        <p className="mt-1.5 text-[13.5px] text-muted">
          {envMati
            ? t("Dashboard bawaan dimatikan lewat DASHBOARD_MESIN=mati. Gunakan aplikasi Anda sendiri yang terhubung ke API mesin ini.", "The built-in dashboard is turned off via DASHBOARD_MESIN=mati. Use your own app connected to this engine's API.")
            : t("Dashboard bawaan tidak dibuka untuk lisensi mesin ini. Gunakan aplikasi Anda sendiri yang terhubung ke API mesin ini.", "The built-in dashboard isn't enabled for this engine's license. Use your own app connected to this engine's API.")}
        </p>
        <dl className="mt-5 space-y-2 rounded-xl bg-subtle/60 p-4 text-[13px]">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">{t("Mode", "Mode")}</dt>
            <dd className="font-semibold">{l.mode === "sandbox" ? "Sandbox" : "Production"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">{t("Lisensi", "License")}</dt>
            <dd className="font-semibold">{l.aktif ? t("Aktif", "Active") : t("Tidak aktif", "Inactive")}</dd>
          </div>
          {l.berlaku_sampai ? (
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{t("Berlaku sampai", "Valid until")}</dt>
              <dd className="font-semibold">{tanggal(l.berlaku_sampai, b)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-3">
            <dt className="text-muted">API</dt>
            <dd className="font-mono text-[12px]">/api/v1</dd>
          </div>
        </dl>
        {terbatas && <p className="mt-3 text-[13px] font-semibold text-danger">{terbatas.pesan}</p>}
        <div className="mt-5">
          <TombolPerbaruiLisensi />
        </div>
      </section>
    </main>
  );
}
