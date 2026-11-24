import { Suspense } from "react";
import { BannerGagalBayar } from "@/components/banner-akun";
import type { Metadata } from "next";
import Link from "@/components/link";
import { ArrowRight, Check, CreditCard, ShieldCheck, Sparkles } from "lucide-react";
import { KartuLangganan } from "@/components/kartu-langganan";
import { angka, tanggal, uang, UMUR_HISTORI_HARI } from "@/lib/format";
import { labelKanal, ringkasKanal } from "@/lib/harga";
import type { T } from "@/lib/bahasa";
import { teksHalaman } from "@/lib/bahasa-halaman";
import { kursUsd } from "@/lib/kurs";
import { METODE_MANUAL, ORDER_TAMPIL, daftarPaket, hakAkun, riwayatTransaksi } from "@/lib/langganan";
import { tingkatPaket } from "@/lib/tingkat-paket";
import { LencanaPaket } from "@/components/lencana-paket";
import { TombolSalin } from "@/components/tombol-salin";
import { kanalAktif, pembayaranAktif } from "@/lib/gateway";
import { customTampil, idPaketCustom, paketCustom, tautanCustom } from "@/lib/paket-custom";
import { KartuCustom, TombolWaCustom } from "@/components/kartu-custom";
import { requireUser } from "@/lib/session";
import { cekJaminan, modeRefundAkun } from "@/lib/jaminan";
import { namaBankTampil } from "@/lib/afiliasi-def";
import { JAMINAN_MAKS_PAKAI_PERSEN, syaratJaminan, teksProsesRefund, MASA_ID, MASA_EN_ADJ } from "@/lib/jaminan-def";
import { sekarang } from "@/lib/db";
import { FormJaminan } from "./jaminan";
import { MEREK } from "@/lib/merek";
import { staf } from "@/lib/peran";
import { pengaturanVoucher, voucherBelumDiklaimEmail } from "@/lib/voucher";
import { KotakKlaimVoucher } from "@/components/klaim-voucher";

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
      <Suspense fallback={null}>
        <BannerGagalBayar />
      </Suspense>
      <Suspense fallback={<div aria-hidden className="card h-40 animate-denyut" />}>
        <KartuLangganan />
      </Suspense>
      <Suspense fallback={null}>
        <BagianVoucher />
      </Suspense>
      <Suspense fallback={null}>
        <Jaminan />
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

/**
 * Kotak klaim voucher Panduan Produk Digital / Promo, termasuk deteksi 1-klik otomatis berdasarkan email akun.
 */
async function BagianVoucher() {
  const user = await requireUser();
  if (staf(user.peran)) return null;
  const [cfg, voucherEmail] = await Promise.all([pengaturanVoucher(), voucherBelumDiklaimEmail(user.email)]);
  if (!cfg.aktif) return null;
  return <KotakKlaimVoucher voucherEmail={voucherEmail} />;
}

/**
 * Kartu jaminan uang kembali untuk pembayaran pertama: tampil selama masa jaminan (atau bila sudah pernah diajukan).
 * Syarat dihitung di server (jaminan.ts); di luar masa jaminan dan tanpa pengajuan, kartu tidak tampil sama sekali.
 */
async function Jaminan() {
  const [user, { b, t }] = await Promise.all([requireUser(), teksHalaman()]);
  if (staf(user.peran)) return null;
  const [j, mode] = await Promise.all([cekJaminan(user.id), modeRefundAkun(user.id)]);
  if (!j || (!j.pengajuan && sekarang() > j.sampai)) return null;
  const rp = uang(j.jumlah, b);
  const p = j.pengajuan;
  const selesai = p?.status === "selesai";
  const tujuan = p?.tujuan ? `${namaBankTampil(p.tujuan.bank)} ${p.tujuan.nomor} a.n. ${p.tujuan.nama}` : null;
  return (
    <section aria-labelledby="judul-jaminan" className={`card p-5 sm:p-6 ${j.boleh ? "ring-1 ring-accent/40" : ""}`}>
      <h2 id="judul-jaminan" className="flex items-center gap-2 text-[15px] font-bold">
        <ShieldCheck className={`size-4 ${selesai ? "text-success" : "text-accent"}`} aria-hidden />
        {selesai ? t("Dana sudah dikembalikan", "Money refunded") : t(`Jaminan uang kembali ${MASA_ID}`, `${MASA_EN_ADJ} money-back guarantee`)}
      </h2>
      {selesai ? (
        <p className="mt-1.5 text-[13px] text-muted">
          {p.cara === "manual"
            ? t(
                `${rp} dari pembelian ${j.orderId} sudah ditransfer kembali${tujuan ? ` ke ${tujuan}` : ""} pada ${tanggal(p.selesai ?? p.dibuat, b)}.`,
                `${rp} from purchase ${j.orderId} was transferred back${tujuan ? ` to ${tujuan}` : ""} on ${tanggal(p.selesai ?? p.dibuat, b)}.`,
              )
            : t(
                `${rp} dari pembelian ${j.orderId} dikembalikan ke metode bayar asal pada ${tanggal(p.selesai ?? p.dibuat, b)}. GoPay biasanya masuk dalam 1×24 jam; QRIS dari aplikasi lain bisa sampai 15–20 hari kerja.`,
                `${rp} from purchase ${j.orderId} was refunded to the original payment method on ${tanggal(p.selesai ?? p.dibuat, b)}. GoPay usually arrives within 24 hours; QRIS from other apps can take up to 15–20 business days.`,
              )}
        </p>
      ) : p?.status === "menunggu" || p?.status === "diproses" ? (
        <p className="mt-1.5 text-[13px] text-muted">
          {p.cara === "manual"
            ? t(
                `Pengajuan diterima pada ${tanggal(p.dibuat, b)}. Admin akan mentransfer ${rp}${tujuan ? ` ke ${tujuan}` : ""} dalam ${teksProsesRefund(t)}, lalu kamu dapat notifikasi. Paket tetap aktif sampai dana ditransfer.`,
                `Request received on ${tanggal(p.dibuat, b)}. The admin will transfer ${rp}${tujuan ? ` to ${tujuan}` : ""} within ${teksProsesRefund(t)} and you'll be notified. Your plan stays active until then.`,
              )
            : t("Pengembalian dana sedang diproses Midtrans. Halaman ini diperbarui begitu selesai.", "Midtrans is processing your refund. This page updates once it's done.")}
        </p>
      ) : p?.status === "ditolak" ? (
        <p className="mt-1.5 text-[13px] text-muted">
          {t(`Pengajuan uang kembali ditolak admin${p.catatan ? `: ${p.catatan}` : "."} Paket kamu tetap aktif.`, `The refund request was declined by the admin${p.catatan ? `: ${p.catatan}` : "."} Your plan stays active.`)}
        </p>
      ) : (
        <>
          <p className="mt-1.5 text-[13px] text-muted">
            {t(
              `Kurang cocok? Pembayaran pertama ${rp} bisa diminta kembali penuh sampai ${tanggal(j.sampai, b)}, selama balasan AI yang terpakai paling banyak ${angka(j.batasPakai)} (${JAMINAN_MAKS_PAKAI_PERSEN}% kuota). Terpakai sekarang: ${angka(j.terpakai)}.`,
              `Not a fit? Your first payment of ${rp} can be fully refunded until ${tanggal(j.sampai, b)}, as long as you've used at most ${angka(j.batasPakai, b)} AI replies (${JAMINAN_MAKS_PAKAI_PERSEN}% of the quota). Used so far: ${angka(j.terpakai, b)}.`,
            )}
          </p>
          {p?.status === "gagal" && (
            <p className="mt-2 text-[12.5px] text-warning">
              {t("Percobaan sebelumnya belum diproses Midtrans. Admin sudah diberi tahu; kamu juga bisa mencoba lagi.", "The previous attempt wasn't processed by Midtrans. The admin has been notified; you can also try again.")}
            </p>
          )}
          {j.boleh ? (
            <div className="mt-4">
              <FormJaminan jumlah={rp} mode={mode} kanal={j.kanal} />
            </div>
          ) : (
            j.alasan && <p className="mt-2 text-[12.5px] font-medium text-fg">{b === "en" ? j.alasan.en : j.alasan.id}</p>
          )}
          <details className="group mt-4 rounded-xl border border-line bg-subtle/40 px-4 py-3 text-[12.5px]">
            <summary className="cursor-pointer font-semibold text-fg marker:text-muted">{t("Syarat & ketentuan garansi", "Guarantee terms")}</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
              {syaratJaminan(t).map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ol>
          </details>
        </>
      )}
    </section>
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
    pembayaranAktif(),
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
                t("Informasi Usaha & belajar dari balasanmu", "Business Info & learns from your replies"),
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
  const metode = (x: (typeof daftar)[number]) =>
    x.kanal
      ? labelKanal(x.kanal, b)
      : x.metode === "voucher"
        ? t("Voucher Panduan", "Guide Voucher")
        : x.metode
          ? x.metode in METODE_MANUAL
            ? (b === "en" ? METODE_MANUAL_EN : METODE_MANUAL)[x.metode as keyof typeof METODE_MANUAL]
            : x.metode.replace(/_/g, " ")
          : "—";
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <h2 className="flex items-center gap-2 text-[15px] font-bold">
          <CreditCard className="size-4 text-accent" aria-hidden /> {t("Riwayat pembayaran", "Payment history")}
        </h2>
        <p className="mt-0.5 text-[12.5px] text-muted">
          {t(
            "Sebutkan ID pembelian saat menghubungi admin soal pembayaran, supaya transaksinya langsung ketemu.",
            "Mention the purchase ID when you contact the admin about a payment, so it can be found right away.",
          )}
        </p>
      </div>
      <ul data-analitik-privat className="divide-y divide-line">
        {daftar.map((x) => {
          const st = status[x.status];
          const bisaDibuka = ORDER_TAMPIL.test(x.order_id);
          return (
            <li key={x.id} className="px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-2">
                  <LencanaPaket tingkat={tingkatPaket(x.kode_paket, x.nama_paket)} nama={x.nama_paket} ukuran="sm" />
                  <b className="text-[14px] font-bold tabular-nums">{uang(x.jumlah, b, kurs)}</b>
                </span>
                <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${st?.kelas ?? ""}`}>{st?.label ?? x.status}</span>
              </div>
              <dl className="mt-3 grid gap-x-6 gap-y-2 text-[12.5px] sm:grid-cols-2 lg:grid-cols-4">
                <div className="min-w-0 sm:col-span-2 lg:col-span-1">
                  <dt className="text-muted">{t("ID pembelian", "Purchase ID")}</dt>
                  <dd className="flex items-center gap-0.5">
                    <span className="truncate font-mono font-semibold text-fg">{x.order_id}</span>
                    <TombolSalin teks={x.order_id} label={t(`Salin ID pembelian ${x.order_id}`, `Copy purchase ID ${x.order_id}`)} />
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">{t("Metode", "Method")}</dt>
                  <dd className="font-medium">{metode(x)}</dd>
                </div>
                <div>
                  <dt className="text-muted">{t("Dibuat", "Created")}</dt>
                  <dd className="font-medium">{tanggal(x.dibuat, b)}</dd>
                </div>
                <div>
                  <dt className="text-muted">{t("Dibayar", "Paid")}</dt>
                  <dd className="font-medium">{x.dibayar ? tanggal(x.dibayar, b) : "—"}</dd>
                </div>
              </dl>
              {bisaDibuka && (
                <div className="mt-3">
                  {x.status === "menunggu" && (x.kanal || x.redirect_url) ? (
                    <Link href={`/langganan/tagihan/${encodeURIComponent(x.order_id)}`} data-analitik="Riwayat: lanjutkan bayar" className="btn btn-primary">
                      {t("Lanjutkan bayar", "Continue payment")}
                    </Link>
                  ) : (
                    <Link href={`/langganan/tagihan/${encodeURIComponent(x.order_id)}`} data-analitik="Riwayat: lihat detail pembayaran" className="text-[12.5px] font-semibold text-accent hover:underline">
                      {t("Lihat detail pembayaran", "View payment details")} →
                    </Link>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
