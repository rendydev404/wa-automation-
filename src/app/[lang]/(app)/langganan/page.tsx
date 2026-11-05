import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "@/components/link";
import { ArrowRight, Check, CreditCard, Sparkles } from "lucide-react";
import { KartuLangganan } from "@/components/kartu-langganan";
import { angka, tanggal, uang, UMUR_HISTORI_HARI } from "@/lib/format";
import { labelKanal, ringkasKanal } from "@/lib/harga";
import type { T } from "@/lib/bahasa";
import { teksHalaman } from "@/lib/bahasa-halaman";
import { kursUsd } from "@/lib/kurs";
import { METODE_MANUAL, daftarPaket, hakAkun, riwayatTransaksi } from "@/lib/langganan";
import { kanalAktif, konfigMidtrans } from "@/lib/midtrans";
import { customTampil, idPaketCustom, paketCustom, tautanCustom } from "@/lib/paket-custom";
import { KartuCustom, TombolWaCustom } from "@/components/kartu-custom";
import { requireUser } from "@/lib/session";
import { MEREK } from "@/lib/merek";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await teksHalaman();
  return { title: `${t("Langganan", "Subscription")} · ${MEREK}` };
}

const STATUS = (t: T): Record<string, { label: string; kelas: string }> => ({
  menunggu: { label: t("Menunggu pembayaran", "Awaiting payment"), kelas: "bg-warning-soft text-warning" },
  lunas: { label: t("Lunas", "Paid"), kelas: "bg-success-soft text-success" },
  gagal: { label: t("Gagal", "Failed"), kelas: "bg-danger-soft text-danger" },
  kedaluwarsa: { label: t("Kedaluwarsa", "Expired"), kelas: "bg-subtle text-muted" },
  dibatalkan: { label: t("Dibatalkan", "Cancelled"), kelas: "bg-subtle text-muted" },
  dikembalikan: { label: t("Dikembalikan", "Refunded"), kelas: "bg-subtle text-muted" },
});

/** Nama metode pembayaran manual (dicatat admin) dalam bahasa Inggris; versi Indonesia memakai METODE_MANUAL. */
const METODE_MANUAL_EN: Record<keyof typeof METODE_MANUAL, string> = {
  manual_transfer: "Bank transfer",
  manual_qris: "QRIS / e-wallet",
  manual_tunai: "Cash",
  manual_lainnya: "Other",
  kompensasi: "Free / compensation",
};

export default async function HalamanLangganan() {
  const { t } = await teksHalaman();
  return (
    <div className="space-y-6 lg:space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">{t("Langganan", "Subscription")}</h1>
        <p className="mt-1 text-muted">{t("Paket aktif, sisa kuota balasan AI, dan pembayaran.", "Your active plan, remaining AI reply quota, and payments.")}</p>
      </div>
      <Suspense fallback={<div aria-hidden className="card h-40 animate-denyut" />}>
        <KartuLangganan />
      </Suspense>
      <Suspense fallback={<div aria-hidden className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="card h-80 animate-denyut" />)}</div>}>
        <Paket />
      </Suspense>
      <Suspense fallback={<div aria-hidden className="card h-48 animate-denyut" />}>
        <Riwayat />
      </Suspense>
    </div>
  );
}

/** Ke halaman checkout kita sendiri (pilih metode -> instruksi bayar). Tautan biasa: tanpa JavaScript tambahan. */
function TombolBayar({ paketId, label, nonaktif }: { paketId: number; label: string; nonaktif: boolean }) {
  return nonaktif ? (
    <button type="button" disabled className="btn btn-primary w-full">
      {label}
    </button>
  ) : (
    <Link href={`/langganan/bayar/${paketId}`} className="btn btn-primary w-full">
      {label} <ArrowRight className="size-4" aria-hidden />
    </Link>
  );
}

async function Paket() {
  const [user, { b, t }] = await Promise.all([requireUser(), teksHalaman()]);
  const [paket, k, hak, custom, idCustom, kanal, kurs] = await Promise.all([
    daftarPaket(),
    konfigMidtrans(),
    hakAkun(user),
    paketCustom(),
    idPaketCustom(),
    kanalAktif(),
    b === "en" ? kursUsd() : Promise.resolve(undefined),
  ]);
  const caraBayar = k ? ringkasKanal(kanal, b) : "";
  const dijual = paket.filter((p) => p.harga > 0);
  const adaCustom = customTampil(custom) && (custom.aksi === "wa" || idCustom !== null);
  if (!dijual.length && !adaCustom) return null;
  return (
    <section aria-labelledby="judul-paket">
      <h2 id="judul-paket" className="text-[15px] font-bold">
        {t("Pilih paket", "Choose a plan")}
      </h2>
      {!k && <p className="mt-1 text-[13px] text-warning">{t("Pembayaran online belum diaktifkan admin.", "Online payment has not been enabled by the admin yet.")}</p>}
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {dijual.map((p) => (
          <article key={p.id} className={`card relative flex flex-col p-6 ${p.unggulan ? "ring-2 ring-accent" : ""}`}>
            {p.unggulan && (
              <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold text-on-accent">
                <Sparkles className="size-3" aria-hidden /> {t("Paling banyak dipilih", "Most popular")}
              </span>
            )}
            <h3 className="text-lg font-bold">{p.nama}</h3>
            {p.deskripsi && <p className="mt-1 text-[13px] text-muted">{p.deskripsi}</p>}
            <p className="mt-4 text-3xl font-extrabold tracking-tight tabular-nums">
              {uang(p.harga, b, kurs)}
              <span className="text-[13px] font-semibold text-muted"> / {t(`${p.durasi_hari} hari`, `${p.durasi_hari} ${p.durasi_hari === 1 ? "day" : "days"}`)}</span>
            </p>
            <ul className="mt-4 flex-1 space-y-2 text-[13.5px]">
              {[
                t(`${angka(p.kuota_nomor)} nomor WhatsApp`, `${angka(p.kuota_nomor, b)} WhatsApp ${p.kuota_nomor === 1 ? "number" : "numbers"}`),
                t(`${angka(p.kuota_balasan)} balasan AI`, `${angka(p.kuota_balasan, b)} AI ${p.kuota_balasan === 1 ? "reply" : "replies"}`),
                t("Base knowledge & belajar dari balasanmu", "Product knowledge & learns from your replies"),
                t(`Histori percakapan ${UMUR_HISTORI_HARI} hari`, `${UMUR_HISTORI_HARI}-day chat history`),
              ].map((x) => (
                <li key={x} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden /> {x}
                </li>
              ))}
            </ul>
            <div className="mt-5">
              <TombolBayar paketId={p.id} label={hak.paket === p.nama ? t("Perpanjang", "Renew") : t("Pilih paket", "Choose plan")} nonaktif={!k} />
            </div>
          </article>
        ))}
        {adaCustom && (
          <KartuCustom
            p={custom}
            varian="app"
            b={b}
            kurs={kurs}
            aksi={
              custom.aksi === "bayar" && idCustom !== null ? (
                <TombolBayar paketId={idCustom} label={hak.paket === custom.nama ? t("Perpanjang", "Renew") : custom.tombol} nonaktif={!k} />
              ) : (
                <TombolWaCustom href={tautanCustom(custom, t(`Email akun: ${user.email}`, `Account email: ${user.email}`))} label={custom.tombol} />
              )
            }
          />
        )}
      </div>
      <p className="mt-3 text-[12.5px] text-muted">
        {caraBayar && t(`Bayar lewat ${caraBayar}. `, `Pay with ${caraBayar}. `)}
        {t(
          "Perpanjang paket yang sama = masa & kuota ditambahkan. Ganti paket = paket baru mulai hari itu.",
          "Renewing the same plan adds the time & quota to what you have. Switching plans starts the new plan that day.",
        )}
        {b === "en" && " Prices in USD are approximate; payment is charged in Indonesian rupiah (IDR)."}
      </p>
    </section>
  );
}

async function Riwayat() {
  const [user, { b, t }] = await Promise.all([requireUser(), teksHalaman()]);
  const [daftar, kurs] = await Promise.all([riwayatTransaksi({ userId: user.id, batas: 20 }), b === "en" ? kursUsd() : Promise.resolve(undefined)]);
  if (!daftar.length) return null;
  const status = STATUS(t);
  return (
    <section className="card overflow-hidden">
      <h2 className="flex items-center gap-2 border-b border-line px-5 py-4 text-[15px] font-bold">
        <CreditCard className="size-4 text-accent" aria-hidden /> {t("Riwayat pembayaran", "Payment history")}
      </h2>
      <ul className="divide-y divide-line">
        {daftar.map((x) => (
          <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-[13px]">
            <span>
              <span className="font-semibold">{t(`Paket ${x.nama_paket}`, `${x.nama_paket} plan`)}</span> · {uang(x.jumlah, b, kurs)}
              <span className="block text-[12px] text-faint">
                {tanggal(x.dibuat, b)} · {x.order_id}
                {x.kanal
                  ? ` · ${labelKanal(x.kanal, b)}`
                  : x.metode
                    ? ` · ${x.metode in METODE_MANUAL ? (b === "en" ? METODE_MANUAL_EN : METODE_MANUAL)[x.metode as keyof typeof METODE_MANUAL] : x.metode.replace(/_/g, " ")}`
                    : ""}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${status[x.status]?.kelas ?? ""}`}>{status[x.status]?.label ?? x.status}</span>
              {x.status === "menunggu" && (x.kanal || x.redirect_url) && (
                <Link href={`/langganan/tagihan/${encodeURIComponent(x.order_id)}`} className="btn btn-ghost">
                  {t("Lanjutkan bayar", "Continue payment")}
                </Link>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
