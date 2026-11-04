import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, ChevronRight, Clock } from "lucide-react";
import { angka, UMUR_HISTORI_HARI } from "@/lib/format";
import { KANAL_BAYAR } from "@/lib/harga";
import { hakAkun, paketById, tagihanMenunggu } from "@/lib/langganan";
import { kanalAktif, konfigMidtrans } from "@/lib/midtrans";
import { MEREK } from "@/lib/merek";
import { requireUser } from "@/lib/session";
import { PilihMetode } from "./pilih-metode";

export const metadata: Metadata = { title: `Pembayaran · ${MEREK}` };

/** Checkout paket: ringkasan + pilihan kanal pembayaran (Midtrans Core API, di halaman kita sendiri). */
export default function HalamanBayar(props: PageProps<"/langganan/bayar/[paket]">) {
  return (
    <div>
      <nav aria-label="Jejak halaman" className="mb-5">
        <ol className="flex items-center gap-1.5 text-[13px]">
          <li>
            <Link href="/langganan" className="font-medium text-muted transition-colors hover:text-fg">
              Langganan
            </Link>
          </li>
          <li aria-hidden>
            <ChevronRight className="size-3.5 text-faint" />
          </li>
          <li aria-current="page" className="font-medium text-fg">
            Pembayaran
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
  const user = await requireUser();
  const id = Number((await params).paket);
  const [p, k] = await Promise.all([Number.isInteger(id) && id > 0 ? paketById(id) : undefined, konfigMidtrans()]);
  if (!p || !p.aktif || p.harga < 1) {
    return (
      <section className="card mx-auto max-w-xl p-6 text-center sm:p-8">
        <h1 className="text-xl font-bold">Paket tidak tersedia</h1>
        <p className="mt-1 text-[14px] text-muted">Paket ini sudah tidak dijual. Silakan pilih paket lain.</p>
        <Link href="/langganan" className="btn btn-primary mt-5">
          Pilih paket <ArrowRight className="size-4" aria-hidden />
        </Link>
      </section>
    );
  }
  const [hak, lama] = await Promise.all([hakAkun(user), tagihanMenunggu(user.id, p.id)]);
  const perpanjang = hak.paket === p.nama;
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_20rem]">
      <aside className="card p-5 sm:p-6 lg:sticky lg:top-6 lg:order-2" aria-labelledby="judul-ringkasan">
        <h2 id="judul-ringkasan" className="text-[13px] font-bold tracking-wide text-muted uppercase">
          Ringkasan
        </h2>
        <p className="mt-3 text-lg font-bold">
          Paket {p.nama} {perpanjang && <span className="text-[12.5px] font-semibold text-accent">· Perpanjang</span>}
        </p>
        <p className="text-[13px] text-muted">{p.durasi_hari} hari</p>
        <ul className="mt-4 space-y-2 text-[13px]">
          {[`${angka(p.kuota_nomor)} nomor WhatsApp`, `${angka(p.kuota_balasan)} balasan AI`, `Histori percakapan ${UMUR_HISTORI_HARI} hari`].map((x) => (
            <li key={x} className="flex gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden /> {x}
            </li>
          ))}
        </ul>
        <div className="mt-5 flex items-baseline justify-between border-t border-line pt-4">
          <span className="text-[13px] text-muted">Total</span>
          <span className="text-2xl font-extrabold tracking-tight tabular-nums">Rp{angka(p.harga)}</span>
        </div>
        <p className="mt-2 text-[12px] text-muted">
          {perpanjang ? "Masa aktif & kuota balasan ditambahkan ke paket yang sedang berjalan." : hak.sampai ? "Paket baru mulai hari ini menggantikan paket yang sedang aktif." : "Paket mulai aktif begitu pembayaran diterima."}
        </p>
      </aside>

      <section className="card p-5 sm:p-6 lg:order-1" aria-labelledby="judul-metode">
        <h1 id="judul-metode" className="text-[17px] font-bold tracking-tight">
          Pilih metode pembayaran
        </h1>
        <p className="mt-0.5 mb-5 text-[13px] text-muted">Tagihan dibuat setelah kamu memilih. Paket aktif otomatis begitu pembayaran diterima.</p>
        {lama && (
          <Link
            href={`/langganan/tagihan/${encodeURIComponent(lama.order_id)}`}
            className="mb-5 flex items-center gap-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-[13px] text-warning transition-opacity hover:opacity-90"
          >
            <Clock className="size-4 shrink-0" aria-hidden />
            <span className="flex-1">
              Kamu masih punya tagihan <strong className="font-semibold">{KANAL_BAYAR[lama.kanal].label}</strong> untuk paket ini yang belum dibayar.
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 font-semibold">
              Lanjutkan <ArrowRight className="size-3.5" aria-hidden />
            </span>
          </Link>
        )}
        {k ? <PilihMetode paketId={p.id} harga={p.harga} kanal={await kanalAktif()} /> : <p className="text-[13.5px] text-warning">Pembayaran online belum diaktifkan admin.</p>}
      </section>
    </div>
  );
}
