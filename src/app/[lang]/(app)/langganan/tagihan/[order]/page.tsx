import { type ReactNode, Suspense } from "react";
import type { Metadata } from "next";
import Link from "@/components/link";
import { ArrowRight, Ban, CheckCircle2, Clock, XCircle } from "lucide-react";
import { LacakPurchaseMeta } from "@/components/meta-pixel";
import type { Bahasa, T as Terjemah } from "@/lib/bahasa";
import { teksHalaman } from "@/lib/bahasa-halaman";
import { sekarang } from "@/lib/db";
import { angka, jamWib, tanggal, uang } from "@/lib/format";
import { labelKanal } from "@/lib/harga";
import { kursUsd } from "@/lib/kurs";
import { TombolSalin } from "@/components/tombol-salin";
import { ORDER_TAMPIL, type Transaksi, langgananAktif, paketById, statusTagihan, transaksiMilik } from "@/lib/langganan";
import type { InstruksiBayar as DataMidtrans } from "@/lib/midtrans";
import { labelGateway } from "@/lib/gateway-def";
import { MEREK, PERUSAHAAN } from "@/lib/merek";
import { type BitQr, kemasQr } from "@/lib/qr";
import { requireUser } from "@/lib/session";
import { aplikasiTransaksi } from "@/lib/developer-api";
import { type DataBayar, InstruksiBayar, PantauStatus } from "./instruksi";
import { LangkahBayar } from "./langkah";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await teksHalaman();
  return { title: `${t("Tagihan", "Invoice")} · ${MEREK}` };
}

/** Nama payment_type Midtrans untuk transaksi lama (Snap) yang tidak menyimpan kanal. */
const METODE: Record<string, { id: string; en: string }> = {
  gopay: { id: "GoPay", en: "GoPay" },
  qris: { id: "QRIS", en: "QRIS" },
  shopeepay: { id: "ShopeePay", en: "ShopeePay" },
  dana: { id: "DANA", en: "DANA" },
  bank_transfer: { id: "Transfer bank (virtual account)", en: "Bank transfer (virtual account)" },
  echannel: { id: "Mandiri Bill Payment", en: "Mandiri Bill Payment" },
  credit_card: { id: "Kartu kredit / debit", en: "Credit / debit card" },
  cstore: { id: "Minimarket", en: "Convenience store" },
  akulaku: { id: "Akulaku", en: "Akulaku" },
};

/** Bahasa tampilan + kurs USD (versi Inggris) untuk komponen-komponen halaman ini. */
interface L {
  b: Bahasa;
  t: Terjemah;
  kurs?: number;
  /** Tagihan Developer API: id aplikasinya (bukan paket langganan). */
  api?: number | null;
}

type T = Transaksi & { bayar: DataMidtrans | null; gateway?: string };
const labelMetode = (t: Transaksi & { gateway?: string }, b: Bahasa) => (t.kanal ? labelKanal(t.kanal, b, t.gateway) : t.metode ? (METODE[t.metode]?.[b] ?? t.metode.replace(/_/g, " ")) : null);
const waktuWib = (d: number, b: Bahasa) => `${tanggal(d, b)}, ${jamWib(d, b)} ${b === "en" ? "WIB (UTC+7)" : "WIB"}`;
const namaPaket = (nama: string, t: Terjemah) => t(`Paket ${nama}`, `${nama} plan`);

/** Halaman tagihan: instruksi bayar selama menunggu, lalu hasilnya (lunas / kedaluwarsa / gagal / dibatalkan). */
export default async function HalamanTagihan(props: PageProps<"/[lang]/langganan/tagihan/[order]">) {
  const { b } = await teksHalaman();
  return (
    <div className="mx-auto w-full max-w-xl py-2 sm:py-6">
      <Suspense fallback={<div aria-hidden className="card h-[34rem] animate-denyut" />}>
        <Isi params={props.params} />
      </Suspense>
      <p className="mt-4 text-center text-[12px] leading-relaxed text-faint">
        {b === "en" ? (
          <>
            Invoice issued by <span className="font-semibold text-muted">{PERUSAHAAN}</span> for the {MEREK} service.
          </>
        ) : (
          <>
            Tagihan diterbitkan oleh <span className="font-semibold text-muted">{PERUSAHAAN}</span> untuk layanan {MEREK}.
          </>
        )}
      </p>
    </div>
  );
}

async function Isi({ params }: { params: Promise<{ order: string }> }) {
  const [user, { b, t: tr }] = await Promise.all([requireUser(), teksHalaman()]);
  const { order } = await params;
  const [awal, kurs] = await Promise.all([ORDER_TAMPIL.test(order) ? transaksiMilik(user.id, order) : undefined, b === "en" ? kursUsd() : Promise.resolve(undefined)]);
  let t: T | undefined = awal;
  const api = t && !t.paket_id ? await aplikasiTransaksi(user.id, t.order_id) : null;
  const l: L = { b, t: tr, kurs, api };
  if (!t) return <TidakAda l={l} />;
  // Batas bayar sudah lewat tetapi webhook "expire" belum datang: pastikan ke provider asalnya sekarang (sekali, dijatah).
  if (t.status === "menunggu" && t.kedaluwarsa !== null && t.kedaluwarsa <= sekarang()) {
    const s = await statusTagihan(user.id, t.order_id);
    if (s && s !== "menunggu") t = { ...t, status: s };
  }
  if (t.status === "lunas") return <Sukses t={t} userId={user.id} l={l} />;
  if (t.status === "menunggu") return t.kanal && t.bayar ? <Tagihan t={t} l={l} /> : <MenungguLama t={t} l={l} />;
  return <Gagal t={t} l={l} />;
}

async function dataBayar(b: DataMidtrans): Promise<DataBayar> {
  let qr: BitQr | undefined;
  if (b.qr) {
    const { encode } = await import("uqr");
    qr = kemasQr(encode(b.qr, { ecc: "M", border: 3 }).data);
  }
  return { va: b.va, biller: b.biller, qrUrl: b.qrUrl, deeplink: b.deeplink, qr };
}

async function hrefBaru(t: Transaksi, api?: number | null): Promise<string | null> {
  if (api) return `/developer/${api}/bayar`;
  if (!t.paket_id) return null;
  const p = await paketById(t.paket_id);
  return p?.aktif && p.harga > 0 ? `/langganan/bayar/${p.id}` : null;
}

async function Tagihan({ t, l }: { t: T; l: L }) {
  const kanal = t.kanal!;
  const [bayar, ganti] = await Promise.all([dataBayar(t.bayar!), hrefBaru(t, l.api)]);
  return (
    <div className="space-y-4">
      <InstruksiBayar
        orderId={t.order_id}
        kanal={kanal}
        labelKanal={`${labelKanal(kanal, l.b, t.gateway)} · ${l.api ? t.nama_paket : namaPaket(t.nama_paket, l.t)}`}
        namaAplikasi={kanal === "gopay" ? "GoPay" : kanal === "shopeepay" ? "ShopeePay" : kanal === "dana" ? "DANA" : undefined}
        jumlah={t.jumlah}
        kurs={l.kurs}
        sisaAwal={t.kedaluwarsa === null ? null : Math.max(0, t.kedaluwarsa - sekarang())}
        batas={t.kedaluwarsa === null ? null : waktuWib(t.kedaluwarsa, l.b)}
        bayar={bayar}
        gantiHref={ganti}
        langkah={<LangkahBayar kanal={kanal} kode={t.bayar?.biller} penyedia={labelGateway(t.gateway)} b={l.b} />}
      />
      <p className="flex items-center justify-center gap-1 text-[12px] text-faint">
        {l.t("ID pembelian", "Purchase ID")} <span className="font-mono font-semibold text-muted">{t.order_id}</span>
        <TombolSalin teks={t.order_id} label={l.t(`Salin ID pembelian ${t.order_id}`, `Copy purchase ID ${t.order_id}`)} />
      </p>
    </div>
  );
}

function Rangkuman({ t, l, baris = [] }: { t: Transaksi; l: L; baris?: [string, string][] }) {
  const { b, t: tr } = l;
  const semua: [string, string][] = [
    [l.api ? tr("Layanan", "Service") : tr("Paket", "Plan"), t.nama_paket],
    [tr("Total", "Total"), uang(t.jumlah, b, l.kurs)],
  ];
  if (b === "en") semua.push(["Billed as", `Rp${angka(t.jumlah, b)}`]);
  const m = labelMetode(t, b);
  if (m) semua.push([tr("Metode", "Method"), m]);
  if (t.dibayar) semua.push([tr("Dibayar", "Paid"), waktuWib(t.dibayar, b)]);
  semua.push(...baris);
  return (
    <dl className="mt-6 divide-y divide-line rounded-2xl border border-line text-left text-[13.5px]">
      {semua.map(([k, v]) => (
        <div key={k} className="flex items-baseline justify-between gap-4 px-4 py-3">
          <dt className="text-muted">{k}</dt>
          <dd className="text-right font-semibold tabular-nums">{v}</dd>
        </div>
      ))}
      <div className="flex items-baseline justify-between gap-4 px-4 py-3">
        <dt className="text-muted">{tr("Penerbit", "Issued by")}</dt>
        <dd className="text-right font-semibold">{PERUSAHAAN}</dd>
      </div>
      <div className="flex items-baseline justify-between gap-4 px-4 py-3">
        <dt className="text-muted">{tr("ID pembelian", "Purchase ID")}</dt>
        <dd className="flex min-w-0 items-center justify-end gap-0.5 text-right">
          <span className="break-all font-mono text-[12px] font-semibold text-fg">{t.order_id}</span>
          <TombolSalin teks={t.order_id} label={tr(`Salin ID pembelian ${t.order_id}`, `Copy purchase ID ${t.order_id}`)} />
        </dd>
      </div>
    </dl>
  );
}

function Kartu({ ikon, nada, judul, isi, children }: { ikon: ReactNode; nada: string; judul: string; isi: string; children: ReactNode }) {
  return (
    <section className="card p-6 text-center sm:p-8" aria-labelledby="judul-hasil">
      <span className={`mx-auto grid size-16 place-items-center rounded-full ${nada}`}>{ikon}</span>
      <h1 id="judul-hasil" className="mt-4 text-2xl font-bold tracking-tight">
        {judul}
      </h1>
      <p className="mt-1 text-[14px] text-muted">{isi}</p>
      {children}
    </section>
  );
}

async function Sukses({ t, userId, l }: { t: Transaksi; userId: number; l: L }) {
  const { b, t: tr } = l;
  if (l.api) {
    return (
      <Kartu
        ikon={<CheckCircle2 className="size-9" aria-hidden />}
        nada="bg-success-soft text-success"
        judul={tr("Pembayaran berhasil", "Payment successful")}
        isi={tr("Terima kasih! Lisensi mesin diperpanjang dan dikirim otomatis ke mesin Anda.", "Thank you! Your engine license has been renewed and sent to your engine automatically.")}
      >
        <Rangkuman t={t} l={l} />
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link href={`/developer/${l.api}`} className="btn btn-primary">
            {tr("Ke aplikasi", "Go to the application")} <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </Kartu>
    );
  }
  const a = await langgananAktif(userId);
  const baris: [string, string][] = a
    ? [
        [tr("Aktif sampai", "Active until"), tanggal(a.sampai, b)],
        [tr("Kuota balasan AI", "AI reply quota"), tr(`${angka(a.kuota_balasan)} balasan`, `${angka(a.kuota_balasan, b)} ${a.kuota_balasan === 1 ? "reply" : "replies"}`)],
        [tr("Nomor WhatsApp", "WhatsApp numbers"), tr(`${angka(a.kuota_nomor)} nomor`, `${angka(a.kuota_nomor, b)} ${a.kuota_nomor === 1 ? "number" : "numbers"}`)],
      ]
    : [];
  return (
    <Kartu
      ikon={<CheckCircle2 className="size-9" aria-hidden />}
      nada="bg-success-soft text-success"
      judul={tr("Pembayaran berhasil", "Payment successful")}
      isi={tr(`Terima kasih! Paket ${t.nama_paket} sudah aktif dan bisa langsung dipakai.`, `Thank you! Your ${t.nama_paket} plan is active and ready to use.`)}
    >
      {/* Meta hanya menyatukan event browser & server dalam 48 jam: tagihan lama yang dibuka lagi tidak dikirim ulang. */}
      {t.dibayar !== null && sekarang() - t.dibayar < 86400 && <LacakPurchaseMeta orderId={t.order_id} jumlah={t.jumlah} namaPaket={t.nama_paket} />}
      <Rangkuman t={t} l={l} baris={baris} />
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Link href="/dashboard" className="btn btn-primary">
          {tr("Ke dashboard", "Go to dashboard")} <ArrowRight className="size-4" aria-hidden />
        </Link>
        <Link href="/langganan" className="btn btn-ghost">
          {tr("Lihat langganan", "View subscription")}
        </Link>
      </div>
    </Kartu>
  );
}

/** Tagihan Snap lama yang belum dibayar: lanjutkan di halaman Midtrans-nya, status tetap dipantau. */
function MenungguLama({ t, l }: { t: Transaksi; l: L }) {
  const tr = l.t;
  return (
    <Kartu
      ikon={<Clock className="size-9" aria-hidden />}
      nada="bg-warning-soft text-warning"
      judul={tr("Menunggu pembayaran", "Awaiting payment")}
      isi={tr("Paket aktif otomatis begitu pembayaran kami terima. Halaman ini memeriksanya sendiri.", "Your plan activates automatically as soon as we receive your payment. This page checks for it on its own.")}
    >
      <Rangkuman t={t} l={l} />
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        {t.redirect_url && (
          <a href={t.redirect_url} className="btn btn-primary">
            {tr("Lanjutkan pembayaran", "Continue payment")} <ArrowRight className="size-4" aria-hidden />
          </a>
        )}
        <Link href="/langganan" className="btn btn-ghost">
          {tr("Kembali ke langganan", "Back to subscription")}
        </Link>
      </div>
      <div className="mt-5">
        <PantauStatus orderId={t.order_id} />
      </div>
    </Kartu>
  );
}

const HASIL = (t: Terjemah): Record<string, { judul: string; isi: string; ikon: "x" | "ban" | "jam" }> => ({
  gagal: {
    judul: t("Pembayaran tidak berhasil", "Payment unsuccessful"),
    isi: t(
      "Pembayaran ditolak atau gagal diproses, jadi paket belum diaktifkan. Silakan buat tagihan baru atau pilih metode lain.",
      "The payment was declined or could not be processed, so your plan has not been activated. Please create a new invoice or choose another method.",
    ),
    ikon: "x",
  },
  kedaluwarsa: {
    judul: t("Waktu pembayaran habis", "Payment time expired"),
    isi: t(
      "Tagihan ini sudah kedaluwarsa dan tidak bisa dibayar lagi. Jangan transfer ke nomor tagihan ini; buat tagihan baru untuk melanjutkan.",
      "This invoice has expired and can no longer be paid. Do not transfer to this invoice number; create a new invoice to continue.",
    ),
    ikon: "jam",
  },
  dibatalkan: {
    judul: t("Tagihan dibatalkan", "Invoice cancelled"),
    isi: t("Tagihan ini sudah dibatalkan dan tidak bisa dibayar lagi. Buat tagihan baru bila ingin melanjutkan.", "This invoice has been cancelled and can no longer be paid. Create a new invoice if you want to continue."),
    ikon: "ban",
  },
  dikembalikan: {
    judul: t("Pembayaran dikembalikan", "Payment refunded"),
    isi: t("Dana untuk transaksi ini sudah dikembalikan. Silakan hubungi kami bila ini tidak sesuai.", "The funds for this transaction have been refunded. Please contact us if this is not right."),
    ikon: "x",
  },
});

async function Gagal({ t, l }: { t: Transaksi; l: L }) {
  const tr = l.t;
  const hasil = HASIL(tr);
  const h = hasil[t.status] ?? hasil.gagal;
  const baru = t.status === "dikembalikan" ? null : await hrefBaru(t, l.api);
  const ikon = h.ikon === "jam" ? <Clock className="size-9" aria-hidden /> : h.ikon === "ban" ? <Ban className="size-9" aria-hidden /> : <XCircle className="size-9" aria-hidden />;
  return (
    <Kartu ikon={ikon} nada={t.status === "gagal" ? "bg-danger-soft text-danger" : "bg-subtle text-muted"} judul={h.judul} isi={h.isi}>
      <Rangkuman t={t} l={l} />
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        {baru && (
          <Link href={baru} className="btn btn-primary">
            {tr("Buat tagihan baru", "Create a new invoice")} <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
        {l.api ? (
          <Link href={`/developer/${l.api}`} className={baru ? "btn btn-ghost" : "btn btn-primary"}>
            {tr("Ke aplikasi", "Go to the application")}
          </Link>
        ) : (
          <Link href="/langganan" className={baru ? "btn btn-ghost" : "btn btn-primary"}>
            {baru ? tr("Pilih paket lain", "Choose another plan") : tr("Ke halaman langganan", "Go to subscription")}
          </Link>
        )}
      </div>
    </Kartu>
  );
}

function TidakAda({ l }: { l: L }) {
  const tr = l.t;
  return (
    <Kartu
      ikon={<XCircle className="size-9" aria-hidden />}
      nada="bg-subtle text-muted"
      judul={tr("Tagihan tidak ditemukan", "Invoice not found")}
      isi={tr(
        "Tautan ini tidak cocok dengan tagihan di akun kamu. Cek riwayat pembayaran di halaman langganan.",
        "This link does not match any invoice in your account. Check your payment history on the subscription page.",
      )}
    >
      <div className="mt-6 flex justify-center">
        <Link href="/langganan" className="btn btn-primary">
          {tr("Ke halaman langganan", "Go to subscription")} <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </Kartu>
  );
}
