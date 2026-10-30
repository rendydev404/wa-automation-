import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock, XCircle } from "lucide-react";
import { angka, jamWib, tanggal } from "@/lib/format";
import { type Transaksi, langgananAktif, terapkanStatus, transaksiMilik } from "@/lib/langganan";
import { konfigMidtrans } from "@/lib/midtrans";
import { requireUser } from "@/lib/session";
import { PantauBayar } from "./pantau";

export const metadata: Metadata = { title: "Status pembayaran · Asisten WhatsApp" };

const METODE: Record<string, string> = {
  gopay: "GoPay",
  qris: "QRIS",
  shopeepay: "ShopeePay",
  dana: "DANA",
  bank_transfer: "Transfer bank (virtual account)",
  echannel: "Mandiri (virtual account)",
  credit_card: "Kartu kredit / debit",
  cstore: "Minimarket",
  akulaku: "Akulaku",
};

type Param = Promise<Record<string, string | string[] | undefined>>;

/** Halaman tujuan setelah pembayaran Midtrans (callback finish): status dicek langsung ke Midtrans, bukan dari parameter URL. */
export default function HalamanSelesaiBayar(props: { searchParams: Param }) {
  return (
    <div className="mx-auto w-full max-w-xl py-2 sm:py-8">
      <Suspense fallback={<div aria-hidden className="card h-[28rem] animate-denyut" />}>
        <Hasil searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function Hasil({ searchParams }: { searchParams: Param }) {
  const user = await requireUser();
  const order = (await searchParams).order;
  const orderId = typeof order === "string" && /^WA-\d+-\d+-[0-9a-f]+$/.test(order) ? order : null;
  let t = orderId ? await transaksiMilik(user.id, orderId) : undefined;
  // Webhook Midtrans bisa terlambat: bila masih menunggu, tanyakan statusnya ke Midtrans sekarang (idempoten).
  if (t?.status === "menunggu") {
    const k = await konfigMidtrans();
    if (k) {
      await terapkanStatus(k, t.order_id).catch(() => null);
      t = await transaksiMilik(user.id, t.order_id);
    }
  }
  if (!t) return <TidakAda />;
  if (t.status === "lunas") return <Sukses t={t} userId={user.id} />;
  if (t.status === "menunggu") return <Menunggu t={t} />;
  return <Gagal t={t} />;
}

function Rangkuman({ t, baris = [] }: { t: Transaksi; baris?: [string, string][] }) {
  const semua: [string, string][] = [["Paket", t.nama_paket], ["Total", `Rp${angka(t.jumlah)}`]];
  if (t.metode) semua.push(["Metode", METODE[t.metode] ?? t.metode]);
  if (t.dibayar) semua.push(["Dibayar", `${tanggal(t.dibayar)}, ${jamWib(t.dibayar)} WIB`]);
  semua.push(...baris);
  return (
    <dl className="mt-6 divide-y divide-line rounded-2xl border border-line text-[13.5px]">
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
    <section className="card p-6 text-center sm:p-8" aria-labelledby="judul-hasil">
      <span className="mx-auto grid size-16 place-items-center rounded-full bg-success-soft text-success">
        <CheckCircle2 className="size-9" aria-hidden />
      </span>
      <h1 id="judul-hasil" className="mt-4 text-2xl font-bold tracking-tight">
        Pembayaran berhasil
      </h1>
      <p className="mt-1 text-[14px] text-muted">Terima kasih! Paket {t.nama_paket} sudah aktif dan bisa langsung dipakai.</p>
      <div className="text-left">
        <Rangkuman t={t} baris={baris} />
      </div>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Link href="/dashboard" className="btn btn-primary">
          Ke dashboard <ArrowRight className="size-4" aria-hidden />
        </Link>
        <Link href="/langganan" className="btn btn-ghost border border-line">
          Lihat langganan
        </Link>
      </div>
    </section>
  );
}

function Menunggu({ t }: { t: Transaksi }) {
  return (
    <section className="card p-6 text-center sm:p-8" aria-labelledby="judul-hasil">
      <span className="mx-auto grid size-16 place-items-center rounded-full bg-warning-soft text-warning">
        <Clock className="size-9" aria-hidden />
      </span>
      <h1 id="judul-hasil" className="mt-4 text-2xl font-bold tracking-tight">
        Menunggu pembayaran
      </h1>
      <p className="mt-1 text-[14px] text-muted">Paket aktif otomatis begitu pembayaran kami terima, biasanya beberapa detik sampai beberapa menit. Halaman ini memeriksanya sendiri.</p>
      <div className="text-left">
        <Rangkuman t={t} />
      </div>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        {t.redirect_url && (
          <a href={t.redirect_url} className="btn btn-primary">
            Lanjutkan pembayaran <ArrowRight className="size-4" aria-hidden />
          </a>
        )}
        <Link href="/langganan" className="btn btn-ghost border border-line">
          Kembali ke langganan
        </Link>
      </div>
      <div className="mt-5">
        <PantauBayar />
      </div>
    </section>
  );
}

const JUDUL_GAGAL: Record<string, { judul: string; isi: string }> = {
  gagal: { judul: "Pembayaran tidak berhasil", isi: "Pembayaran ditolak atau dibatalkan. Tidak ada paket yang diaktifkan untuk transaksi ini. Silakan coba lagi." },
  kedaluwarsa: { judul: "Waktu pembayaran habis", isi: "Tagihan ini sudah kedaluwarsa dan tidak bisa dibayar lagi. Silakan pilih paket untuk membuat tagihan baru." },
  dikembalikan: { judul: "Pembayaran dikembalikan", isi: "Dana untuk transaksi ini sudah dikembalikan. Silakan hubungi kami bila ini tidak sesuai." },
};

function Gagal({ t }: { t: Transaksi }) {
  const j = JUDUL_GAGAL[t.status] ?? JUDUL_GAGAL.gagal;
  return (
    <section className="card p-6 text-center sm:p-8" aria-labelledby="judul-hasil">
      <span className="mx-auto grid size-16 place-items-center rounded-full bg-danger-soft text-danger">
        <XCircle className="size-9" aria-hidden />
      </span>
      <h1 id="judul-hasil" className="mt-4 text-2xl font-bold tracking-tight">
        {j.judul}
      </h1>
      <p className="mt-1 text-[14px] text-muted">{j.isi}</p>
      <div className="text-left">
        <Rangkuman t={t} />
      </div>
      <div className="mt-6 flex justify-center">
        <Link href="/langganan" className="btn btn-primary">
          Pilih paket lagi <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}

function TidakAda() {
  return (
    <section className="card p-6 text-center sm:p-8" aria-labelledby="judul-hasil">
      <span className="mx-auto grid size-16 place-items-center rounded-full bg-subtle text-muted">
        <XCircle className="size-9" aria-hidden />
      </span>
      <h1 id="judul-hasil" className="mt-4 text-2xl font-bold tracking-tight">
        Transaksi tidak ditemukan
      </h1>
      <p className="mt-1 text-[14px] text-muted">Tautan ini tidak cocok dengan transaksi di akun kamu. Cek riwayat pembayaran di halaman langganan.</p>
      <div className="mt-6 flex justify-center">
        <Link href="/langganan" className="btn btn-primary">
          Ke halaman langganan <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
