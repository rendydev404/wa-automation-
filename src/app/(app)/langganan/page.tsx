import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, CreditCard, Sparkles } from "lucide-react";
import { KartuLangganan } from "@/components/kartu-langganan";
import { angka, tanggal, UMUR_HISTORI_HARI } from "@/lib/format";
import { KANAL_BAYAR } from "@/lib/harga";
import { METODE_MANUAL, daftarPaket, hakAkun, riwayatTransaksi } from "@/lib/langganan";
import { konfigMidtrans } from "@/lib/midtrans";
import { customTampil, idPaketCustom, paketCustom, tautanCustom } from "@/lib/paket-custom";
import { KartuCustom, TombolWaCustom } from "@/components/kartu-custom";
import { requireUser } from "@/lib/session";
import { MEREK } from "@/lib/merek";

export const metadata: Metadata = { title: `Langganan · ${MEREK}` };

const STATUS: Record<string, { label: string; kelas: string }> = {
  menunggu: { label: "Menunggu pembayaran", kelas: "bg-warning-soft text-warning" },
  lunas: { label: "Lunas", kelas: "bg-success-soft text-success" },
  gagal: { label: "Gagal", kelas: "bg-danger-soft text-danger" },
  kedaluwarsa: { label: "Kedaluwarsa", kelas: "bg-subtle text-muted" },
  dibatalkan: { label: "Dibatalkan", kelas: "bg-subtle text-muted" },
  dikembalikan: { label: "Dikembalikan", kelas: "bg-subtle text-muted" },
};

export default function HalamanLangganan() {
  return (
    <div className="space-y-6 lg:space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">Langganan</h1>
        <p className="mt-1 text-muted">Paket aktif, sisa kuota balasan AI, dan pembayaran.</p>
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
  const user = await requireUser();
  const [paket, k, hak, custom, idCustom] = await Promise.all([daftarPaket(), konfigMidtrans(), hakAkun(user), paketCustom(), idPaketCustom()]);
  const dijual = paket.filter((p) => p.harga > 0);
  const adaCustom = customTampil(custom) && (custom.aksi === "wa" || idCustom !== null);
  if (!dijual.length && !adaCustom) return null;
  return (
    <section aria-labelledby="judul-paket">
      <h2 id="judul-paket" className="text-[15px] font-bold">
        Pilih paket
      </h2>
      {!k && <p className="mt-1 text-[13px] text-warning">Pembayaran online belum diaktifkan admin.</p>}
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {dijual.map((p) => (
          <article key={p.id} className={`card relative flex flex-col p-6 ${p.unggulan ? "ring-2 ring-accent" : ""}`}>
            {p.unggulan && (
              <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold text-on-accent">
                <Sparkles className="size-3" aria-hidden /> Paling banyak dipilih
              </span>
            )}
            <h3 className="text-lg font-bold">{p.nama}</h3>
            {p.deskripsi && <p className="mt-1 text-[13px] text-muted">{p.deskripsi}</p>}
            <p className="mt-4 text-3xl font-extrabold tracking-tight tabular-nums">
              Rp{angka(p.harga)}
              <span className="text-[13px] font-semibold text-muted"> / {p.durasi_hari} hari</span>
            </p>
            <ul className="mt-4 flex-1 space-y-2 text-[13.5px]">
              {[`${angka(p.kuota_nomor)} nomor WhatsApp`, `${angka(p.kuota_balasan)} balasan AI`, "Base knowledge & belajar dari balasanmu", `Histori percakapan ${UMUR_HISTORI_HARI} hari`].map((x) => (
                <li key={x} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden /> {x}
                </li>
              ))}
            </ul>
            <div className="mt-5">
              <TombolBayar paketId={p.id} label={hak.paket === p.nama ? "Perpanjang" : "Pilih paket"} nonaktif={!k} />
            </div>
          </article>
        ))}
        {adaCustom && (
          <KartuCustom
            p={custom}
            varian="app"
            aksi={
              custom.aksi === "bayar" && idCustom !== null ? (
                <TombolBayar paketId={idCustom} label={hak.paket === custom.nama ? "Perpanjang" : custom.tombol} nonaktif={!k} />
              ) : (
                <TombolWaCustom href={tautanCustom(custom, `Email akun: ${user.email}`)} label={custom.tombol} />
              )
            }
          />
        )}
      </div>
      <p className="mt-3 text-[12.5px] text-muted">
        Bayar lewat QRIS, virtual account (BCA, BNI, BRI, Mandiri, Permata), GoPay, atau ShopeePay. Perpanjang paket yang sama = masa & kuota ditambahkan. Ganti paket = paket baru mulai hari itu.
      </p>
    </section>
  );
}

async function Riwayat() {
  const user = await requireUser();
  const daftar = await riwayatTransaksi({ userId: user.id, batas: 20 });
  if (!daftar.length) return null;
  return (
    <section className="card overflow-hidden">
      <h2 className="flex items-center gap-2 border-b border-line px-5 py-4 text-[15px] font-bold">
        <CreditCard className="size-4 text-accent" aria-hidden /> Riwayat pembayaran
      </h2>
      <ul className="divide-y divide-line">
        {daftar.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-[13px]">
            <span>
              <span className="font-semibold">Paket {t.nama_paket}</span> · Rp{angka(t.jumlah)}
              <span className="block text-[12px] text-faint">
                {tanggal(t.dibuat)} · {t.order_id}
                {t.kanal ? ` · ${KANAL_BAYAR[t.kanal].label}` : t.metode ? ` · ${t.metode in METODE_MANUAL ? METODE_MANUAL[t.metode as keyof typeof METODE_MANUAL] : t.metode.replace(/_/g, " ")}` : ""}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${STATUS[t.status]?.kelas ?? ""}`}>{STATUS[t.status]?.label ?? t.status}</span>
              {t.status === "menunggu" && (t.kanal || t.redirect_url) && (
                <Link href={`/langganan/tagihan/${encodeURIComponent(t.order_id)}`} className="btn btn-ghost">
                  Lanjutkan bayar
                </Link>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
