import { type ReactNode, Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Ban, CheckCircle2, Clock, XCircle } from "lucide-react";
import { LacakPurchaseMeta } from "@/components/meta-pixel";
import { sekarang } from "@/lib/db";
import { angka, jamWib, tanggal } from "@/lib/format";
import { KANAL_BAYAR } from "@/lib/harga";
import { ORDER_SAH, type Transaksi, langgananAktif, paketById, statusTagihan, transaksiMilik } from "@/lib/langganan";
import { type InstruksiBayar as DataMidtrans, konfigMidtrans } from "@/lib/midtrans";
import { MEREK } from "@/lib/merek";
import { type BitQr, kemasQr } from "@/lib/qr";
import { requireUser } from "@/lib/session";
import { type DataBayar, InstruksiBayar, PantauStatus } from "./instruksi";
import { LangkahBayar } from "./langkah";

export const metadata: Metadata = { title: `Tagihan · ${MEREK}` };

/** Nama payment_type Midtrans untuk transaksi lama (Snap) yang tidak menyimpan kanal. */
const METODE: Record<string, string> = {
  gopay: "GoPay",
  qris: "QRIS",
  shopeepay: "ShopeePay",
  dana: "DANA",
  bank_transfer: "Transfer bank (virtual account)",
  echannel: "Mandiri Bill Payment",
  credit_card: "Kartu kredit / debit",
  cstore: "Minimarket",
  akulaku: "Akulaku",
};

type T = Transaksi & { bayar: DataMidtrans | null };
const labelMetode = (t: Transaksi) => (t.kanal ? KANAL_BAYAR[t.kanal].label : t.metode ? (METODE[t.metode] ?? t.metode.replace(/_/g, " ")) : null);
const waktuWib = (d: number) => `${tanggal(d)}, ${jamWib(d)} WIB`;

/** Halaman tagihan: instruksi bayar selama menunggu, lalu hasilnya (lunas / kedaluwarsa / gagal / dibatalkan). */
export default function HalamanTagihan(props: PageProps<"/langganan/tagihan/[order]">) {
  return (
    <div className="mx-auto w-full max-w-xl py-2 sm:py-6">
      <Suspense fallback={<div aria-hidden className="card h-[34rem] animate-denyut" />}>
        <Isi params={props.params} />
      </Suspense>
    </div>
  );
}

async function Isi({ params }: { params: Promise<{ order: string }> }) {
  const user = await requireUser();
  const { order } = await params;
  let t: T | undefined = ORDER_SAH.test(order) ? await transaksiMilik(user.id, order) : undefined;
  if (!t) return <TidakAda />;
  // Batas bayar sudah lewat tetapi webhook "expire" belum datang: pastikan ke Midtrans sekarang (sekali, dijatah).
  if (t.status === "menunggu" && t.kedaluwarsa !== null && t.kedaluwarsa <= sekarang()) {
    const s = await statusTagihan(await konfigMidtrans(), user.id, t.order_id);
    if (s && s !== "menunggu") t = { ...t, status: s };
  }
  if (t.status === "lunas") return <Sukses t={t} userId={user.id} />;
  if (t.status === "menunggu") return t.kanal && t.bayar ? <Tagihan t={t} /> : <MenungguLama t={t} />;
  return <Gagal t={t} />;
}

async function dataBayar(b: DataMidtrans): Promise<DataBayar> {
  let qr: BitQr | undefined;
  if (b.qr) {
    const { encode } = await import("uqr");
    qr = kemasQr(encode(b.qr, { ecc: "M", border: 3 }).data);
  }
  return { va: b.va, biller: b.biller, qrUrl: b.qrUrl, deeplink: b.deeplink, qr };
}

async function hrefBaru(t: Transaksi): Promise<string | null> {
  if (!t.paket_id) return null;
  const p = await paketById(t.paket_id);
  return p?.aktif && p.harga > 0 ? `/langganan/bayar/${p.id}` : null;
}

async function Tagihan({ t }: { t: T }) {
  const kanal = t.kanal!;
  const [bayar, ganti] = await Promise.all([dataBayar(t.bayar!), hrefBaru(t)]);
  return (
    <div className="space-y-4">
      <InstruksiBayar
        orderId={t.order_id}
        kanal={kanal}
        labelKanal={`${KANAL_BAYAR[kanal].label} · Paket ${t.nama_paket}`}
        namaAplikasi={kanal === "gopay" ? "GoPay" : kanal === "shopeepay" ? "ShopeePay" : undefined}
        jumlah={t.jumlah}
        sisaAwal={t.kedaluwarsa === null ? null : Math.max(0, t.kedaluwarsa - sekarang())}
        batas={t.kedaluwarsa === null ? null : waktuWib(t.kedaluwarsa)}
        bayar={bayar}
        gantiHref={ganti}
        langkah={<LangkahBayar kanal={kanal} kode={t.bayar?.biller} />}
      />
      <p className="text-center text-[12px] text-faint">
        No. pesanan <span className="font-mono">{t.order_id}</span>
      </p>
    </div>
  );
}

function Rangkuman({ t, baris = [] }: { t: Transaksi; baris?: [string, string][] }) {
  const semua: [string, string][] = [["Paket", t.nama_paket], ["Total", `Rp${angka(t.jumlah)}`]];
  const m = labelMetode(t);
  if (m) semua.push(["Metode", m]);
  if (t.dibayar) semua.push(["Dibayar", waktuWib(t.dibayar)]);
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
        <dt className="text-muted">No. pesanan</dt>
        <dd className="min-w-0 break-all text-right font-mono text-[12px] text-muted">{t.order_id}</dd>
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

async function Sukses({ t, userId }: { t: Transaksi; userId: number }) {
  const l = await langgananAktif(userId);
  const baris: [string, string][] = l
    ? [
        ["Aktif sampai", tanggal(l.sampai)],
        ["Kuota balasan AI", `${angka(l.kuota_balasan)} balasan`],
        ["Nomor WhatsApp", `${angka(l.kuota_nomor)} nomor`],
      ]
    : [];
  return (
    <Kartu ikon={<CheckCircle2 className="size-9" aria-hidden />} nada="bg-success-soft text-success" judul="Pembayaran berhasil" isi={`Terima kasih! Paket ${t.nama_paket} sudah aktif dan bisa langsung dipakai.`}>
      <LacakPurchaseMeta orderId={t.order_id} jumlah={t.jumlah} namaPaket={t.nama_paket} />
      <Rangkuman t={t} baris={baris} />
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Link href="/dashboard" className="btn btn-primary">
          Ke dashboard <ArrowRight className="size-4" aria-hidden />
        </Link>
        <Link href="/langganan" className="btn btn-ghost">
          Lihat langganan
        </Link>
      </div>
    </Kartu>
  );
}

/** Tagihan Snap lama yang belum dibayar: lanjutkan di halaman Midtrans-nya, status tetap dipantau. */
function MenungguLama({ t }: { t: Transaksi }) {
  return (
    <Kartu ikon={<Clock className="size-9" aria-hidden />} nada="bg-warning-soft text-warning" judul="Menunggu pembayaran" isi="Paket aktif otomatis begitu pembayaran kami terima. Halaman ini memeriksanya sendiri.">
      <Rangkuman t={t} />
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        {t.redirect_url && (
          <a href={t.redirect_url} className="btn btn-primary">
            Lanjutkan pembayaran <ArrowRight className="size-4" aria-hidden />
          </a>
        )}
        <Link href="/langganan" className="btn btn-ghost">
          Kembali ke langganan
        </Link>
      </div>
      <div className="mt-5">
        <PantauStatus orderId={t.order_id} />
      </div>
    </Kartu>
  );
}

const HASIL: Record<string, { judul: string; isi: string; ikon: "x" | "ban" | "jam" }> = {
  gagal: { judul: "Pembayaran tidak berhasil", isi: "Pembayaran ditolak atau gagal diproses, jadi paket belum diaktifkan. Silakan buat tagihan baru atau pilih metode lain.", ikon: "x" },
  kedaluwarsa: { judul: "Waktu pembayaran habis", isi: "Tagihan ini sudah kedaluwarsa dan tidak bisa dibayar lagi. Jangan transfer ke nomor tagihan ini; buat tagihan baru untuk melanjutkan.", ikon: "jam" },
  dibatalkan: { judul: "Tagihan dibatalkan", isi: "Tagihan ini sudah dibatalkan dan tidak bisa dibayar lagi. Buat tagihan baru bila ingin melanjutkan.", ikon: "ban" },
  dikembalikan: { judul: "Pembayaran dikembalikan", isi: "Dana untuk transaksi ini sudah dikembalikan. Silakan hubungi kami bila ini tidak sesuai.", ikon: "x" },
};

async function Gagal({ t }: { t: Transaksi }) {
  const h = HASIL[t.status] ?? HASIL.gagal;
  const baru = t.status === "dikembalikan" ? null : await hrefBaru(t);
  const ikon = h.ikon === "jam" ? <Clock className="size-9" aria-hidden /> : h.ikon === "ban" ? <Ban className="size-9" aria-hidden /> : <XCircle className="size-9" aria-hidden />;
  return (
    <Kartu ikon={ikon} nada={t.status === "gagal" ? "bg-danger-soft text-danger" : "bg-subtle text-muted"} judul={h.judul} isi={h.isi}>
      <Rangkuman t={t} />
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        {baru && (
          <Link href={baru} className="btn btn-primary">
            Buat tagihan baru <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
        <Link href="/langganan" className={baru ? "btn btn-ghost" : "btn btn-primary"}>
          {baru ? "Pilih paket lain" : "Ke halaman langganan"}
        </Link>
      </div>
    </Kartu>
  );
}

function TidakAda() {
  return (
    <Kartu ikon={<XCircle className="size-9" aria-hidden />} nada="bg-subtle text-muted" judul="Tagihan tidak ditemukan" isi="Tautan ini tidak cocok dengan tagihan di akun kamu. Cek riwayat pembayaran di halaman langganan.">
      <div className="mt-6 flex justify-center">
        <Link href="/langganan" className="btn btn-primary">
          Ke halaman langganan <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </Kartu>
  );
}
