import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRight, Check, ChevronRight } from "lucide-react";
import Link from "@/components/link";
import { teksHalaman } from "@/lib/bahasa-halaman";
import { sekarang } from "@/lib/db";
import { HARI_PER_BAYAR, aplikasiMilikById, biayaEfektif, hargaEfektif, pengaturanApi } from "@/lib/developer-api";
import { angka, tanggal, uang } from "@/lib/format";
import { penyediaKanal } from "@/lib/gateway";
import type { KanalBayar } from "@/lib/harga";
import { kursUsd } from "@/lib/kurs";
import { MEREK } from "@/lib/merek";
import { modeMesin } from "@/lib/mode";
import { requireAksesApi } from "@/lib/session";
import { PilihMetode } from "../../../langganan/bayar/[paket]/pilih-metode";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await teksHalaman();
  return { title: `${t("Pembayaran", "Payment")} · Developer API · ${MEREK}` };
}

/** Checkout 30 hari aplikasi Developer API berbayar; memakai ulang pilihan kanal bayar halaman paket. */
export default async function HalamanBayarApi(props: { params: Promise<{ id: string }> }) {
  if (modeMesin()) notFound();
  const { t } = await teksHalaman();
  return (
    <div>
      <nav aria-label={t("Jejak halaman", "Breadcrumb")} className="mb-5">
        <ol className="flex items-center gap-1.5 text-[13px]">
          <li>
            <Link href="/developer" className="font-medium text-muted transition-colors hover:text-fg">
              Developer API
            </Link>
          </li>
          <li aria-hidden>
            <ChevronRight className="size-3.5 text-faint" />
          </li>
          <li aria-current="page" className="font-medium text-fg">
            {t("Pembayaran", "Payment")}
          </li>
        </ol>
      </nav>
      <Suspense fallback={<div aria-hidden className="grid gap-5 lg:grid-cols-[1fr_20rem]"><div className="card h-[30rem] animate-denyut" /><div className="card h-64 animate-denyut" /></div>}>
        <Isi params={props.params} />
      </Suspense>
    </div>
  );
}

async function Isi({ params }: { params: Promise<{ id: string }> }) {
  const [user, { b, t }] = await Promise.all([requireAksesApi(), teksHalaman()]);
  const id = Number((await params).id);
  const [a, umum, penyedia, kurs] = await Promise.all([aplikasiMilikById(user.id, id), pengaturanApi(), penyediaKanal(), b === "en" ? kursUsd() : Promise.resolve(undefined)]);
  if (!a) notFound();
  const harga = hargaEfektif(a, umum);
  if (a.status !== "disetujui" || biayaEfektif(a, umum) !== "berbayar" || harga < 1000) {
    return (
      <section className="card mx-auto max-w-xl p-6 text-center sm:p-8">
        <h1 className="text-xl font-bold">{t("Tidak perlu dibayar", "No payment needed")}</h1>
        <p className="mt-1 text-[14px] text-muted">{t("Aplikasi ini gratis atau belum disetujui.", "This application is free or not approved yet.")}</p>
        <Link href={`/developer/${a.id}`} className="btn btn-primary mt-5">
          {t("Kembali ke aplikasi", "Back to the application")} <ArrowRight className="size-4" aria-hidden />
        </Link>
      </section>
    );
  }
  const kini = sekarang();
  const mulai = Math.max(a.dibayar_sampai ?? 0, kini);
  const kanal = Object.keys(penyedia) as KanalBayar[];
  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <aside className="card p-4 sm:p-6 lg:sticky lg:top-6 lg:order-2" aria-labelledby="judul-ringkasan">
        <h2 id="judul-ringkasan" className="text-[13px] font-bold tracking-wide text-muted uppercase">
          {t("Ringkasan", "Summary")}
        </h2>
        <p className="mt-3 text-lg font-bold">Developer API · {a.nama}</p>
        <p className="text-[13px] text-muted">{t(`${HARI_PER_BAYAR} hari`, `${HARI_PER_BAYAR} days`)}</p>
        <ul className="mt-4 space-y-2 text-[13px]">
          {[
            t("Lisensi mesin self-host diperpanjang", "Self-host engine license renewed"),
            t(`Aktif sampai ${tanggal(mulai + HARI_PER_BAYAR * 86_400)}`, `Active until ${tanggal(mulai + HARI_PER_BAYAR * 86_400, b)}`),
            t("Dikirim otomatis ke mesin Anda", "Sent to your engine automatically"),
          ].map((x) => (
            <li key={x} className="flex gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden /> {x}
            </li>
          ))}
        </ul>
        <div className="mt-5 flex items-baseline justify-between border-t border-line pt-4">
          <span className="text-[13px] text-muted">Total</span>
          <span className="text-2xl font-extrabold tracking-tight tabular-nums">{uang(harga, b, kurs)}</span>
        </div>
        {b === "en" && <p className="mt-1 text-right text-[12px] text-muted tabular-nums">Billed as Rp{angka(harga, b)}</p>}
      </aside>
      <section className="card min-w-0 p-4 sm:p-6 lg:order-1" aria-labelledby="judul-metode">
        <h1 id="judul-metode" className="text-[17px] font-bold tracking-tight">
          {t("Pilih metode pembayaran", "Choose a payment method")}
        </h1>
        <p className="mt-0.5 mb-5 text-[13px] text-muted">
          {t("Tagihan dibuat setelah kamu memilih. Lisensi diperpanjang otomatis begitu pembayaran diterima.", "The invoice is created once you choose. Your license is renewed automatically as soon as payment is received.")}
        </p>
        {kanal.length ? (
          <PilihMetode paketId={0} aplikasiApi={a.id} harga={harga} kanal={kanal} kurs={kurs} penyedia={penyedia} />
        ) : (
          <p className="text-[13.5px] text-warning">{t("Pembayaran online belum diaktifkan admin.", "Online payment has not been enabled by the admin yet.")}</p>
        )}
      </section>
    </div>
  );
}
