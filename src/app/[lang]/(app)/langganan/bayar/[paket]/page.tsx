import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "@/components/link";
import { ArrowRight, Check, ChevronRight, Clock } from "lucide-react";
import { angka, uang, UMUR_HISTORI_HARI } from "@/lib/format";
import { labelKanal } from "@/lib/harga";
import { teksHalaman } from "@/lib/bahasa-halaman";
import { kursUsd } from "@/lib/kurs";
import { hakAkun, paketById, tagihanMenunggu } from "@/lib/langganan";
import { kanalAktif, konfigMidtrans } from "@/lib/midtrans";
import { MEREK } from "@/lib/merek";
import { requireUser } from "@/lib/session";
import { PilihMetode } from "./pilih-metode";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await teksHalaman();
  return { title: `${t("Pembayaran", "Payment")} · ${MEREK}` };
}

/** Checkout paket: ringkasan + pilihan kanal pembayaran (Midtrans Core API, di halaman kita sendiri). */
export default async function HalamanBayar(props: PageProps<"/[lang]/langganan/bayar/[paket]">) {
  const { t } = await teksHalaman();
  return (
    <div>
      <nav aria-label={t("Jejak halaman", "Breadcrumb")} className="mb-5">
        <ol className="flex items-center gap-1.5 text-[13px]">
          <li>
            <Link href="/langganan" className="font-medium text-muted transition-colors hover:text-fg">
              {t("Langganan", "Subscription")}
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

async function Isi({ params }: { params: Promise<{ paket: string }> }) {
  const [user, { b, t }] = await Promise.all([requireUser(), teksHalaman()]);
  const id = Number((await params).paket);
  const [p, k, kurs] = await Promise.all([
    Number.isInteger(id) && id > 0 ? paketById(id) : undefined,
    konfigMidtrans(),
    b === "en" ? kursUsd() : Promise.resolve(undefined),
  ]);
  if (!p || !p.aktif || p.harga < 1) {
    return (
      <section className="card mx-auto max-w-xl p-6 text-center sm:p-8">
        <h1 className="text-xl font-bold">{t("Paket tidak tersedia", "Plan not available")}</h1>
        <p className="mt-1 text-[14px] text-muted">{t("Paket ini sudah tidak dijual. Silakan pilih paket lain.", "This plan is no longer offered. Please choose another plan.")}</p>
        <Link href="/langganan" className="btn btn-primary mt-5">
          {t("Pilih paket", "Choose a plan")} <ArrowRight className="size-4" aria-hidden />
        </Link>
      </section>
    );
  }
  const [hak, lama, kanal] = await Promise.all([hakAkun(user), tagihanMenunggu(user.id, p.id), k ? kanalAktif() : Promise.resolve([])]);
  const perpanjang = hak.paket === p.nama;
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_20rem]">
      <aside className="card p-5 sm:p-6 lg:sticky lg:top-6 lg:order-2" aria-labelledby="judul-ringkasan">
        <h2 id="judul-ringkasan" className="text-[13px] font-bold tracking-wide text-muted uppercase">
          {t("Ringkasan", "Summary")}
        </h2>
        <p className="mt-3 text-lg font-bold">
          {t(`Paket ${p.nama}`, `${p.nama} plan`)} {perpanjang && <span className="text-[12.5px] font-semibold text-accent">· {t("Perpanjang", "Renewal")}</span>}
        </p>
        <p className="text-[13px] text-muted">{t(`${p.durasi_hari} hari`, `${p.durasi_hari} ${p.durasi_hari === 1 ? "day" : "days"}`)}</p>
        <ul className="mt-4 space-y-2 text-[13px]">
          {[
            t(`${angka(p.kuota_nomor)} nomor WhatsApp`, `${angka(p.kuota_nomor, b)} WhatsApp ${p.kuota_nomor === 1 ? "number" : "numbers"}`),
            t(`${angka(p.kuota_balasan)} balasan AI`, `${angka(p.kuota_balasan, b)} AI ${p.kuota_balasan === 1 ? "reply" : "replies"}`),
            t(`Histori percakapan ${UMUR_HISTORI_HARI} hari`, `${UMUR_HISTORI_HARI}-day chat history`),
          ].map((x) => (
            <li key={x} className="flex gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden /> {x}
            </li>
          ))}
        </ul>
        <div className="mt-5 flex items-baseline justify-between border-t border-line pt-4">
          <span className="text-[13px] text-muted">Total</span>
          <span className="text-2xl font-extrabold tracking-tight tabular-nums">{uang(p.harga, b, kurs)}</span>
        </div>
        {b === "en" && <p className="mt-1 text-right text-[12px] text-muted tabular-nums">Billed as Rp{angka(p.harga, b)}</p>}
        <p className="mt-2 text-[12px] text-muted">
          {perpanjang
            ? t("Masa aktif & kuota balasan ditambahkan ke paket yang sedang berjalan.", "The active period & reply quota are added to your current plan.")
            : hak.sampai
              ? t("Paket baru mulai hari ini menggantikan paket yang sedang aktif.", "The new plan starts today and replaces your current plan.")
              : t("Paket mulai aktif begitu pembayaran diterima.", "Your plan becomes active as soon as payment is received.")}
        </p>
      </aside>

      <section className="card p-5 sm:p-6 lg:order-1" aria-labelledby="judul-metode">
        <h1 id="judul-metode" className="text-[17px] font-bold tracking-tight">
          {t("Pilih metode pembayaran", "Choose a payment method")}
        </h1>
        <p className="mt-0.5 mb-5 text-[13px] text-muted">
          {t("Tagihan dibuat setelah kamu memilih. Paket aktif otomatis begitu pembayaran diterima.", "The invoice is created once you choose. Your plan activates automatically as soon as payment is received.")}
        </p>
        {lama && (
          <Link
            href={`/langganan/tagihan/${encodeURIComponent(lama.order_id)}`}
            className="mb-5 flex items-center gap-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-[13px] text-warning transition-opacity hover:opacity-90"
          >
            <Clock className="size-4 shrink-0" aria-hidden />
            <span className="flex-1">
              {b === "en" ? (
                <>
                  You still have an unpaid <strong className="font-semibold">{labelKanal(lama.kanal, b)}</strong> invoice for this plan.
                </>
              ) : (
                <>
                  Kamu masih punya tagihan <strong className="font-semibold">{labelKanal(lama.kanal)}</strong> untuk paket ini yang belum dibayar.
                </>
              )}
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 font-semibold">
              {t("Lanjutkan", "Continue")} <ArrowRight className="size-3.5" aria-hidden />
            </span>
          </Link>
        )}
        {k ? (
          <PilihMetode paketId={p.id} harga={p.harga} kanal={kanal} kurs={kurs} />
        ) : (
          <p className="text-[13.5px] text-warning">{t("Pembayaran online belum diaktifkan admin.", "Online payment has not been enabled by the admin yet.")}</p>
        )}
      </section>
    </div>
  );
}
