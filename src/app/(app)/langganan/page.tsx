import { Suspense } from "react";
import type { Metadata } from "next";
import { Check, CreditCard, Sparkles } from "lucide-react";
import { Meter } from "@/components/stat";
import { angka, tanggal } from "@/lib/format";
import { balasanTerpakai, daftarPaket, hakAkun, riwayatTransaksi } from "@/lib/langganan";
import { konfigMidtrans } from "@/lib/midtrans";
import { nomorMilik } from "@/lib/numbers";
import { requireUser } from "@/lib/session";
import { HasilBayar, TombolBayar } from "./bayar";

export const metadata: Metadata = { title: "Langganan · Asisten WhatsApp" };

const STATUS: Record<string, { label: string; kelas: string }> = {
  menunggu: { label: "Menunggu pembayaran", kelas: "bg-warning-soft text-warning" },
  lunas: { label: "Lunas", kelas: "bg-success-soft text-success" },
  gagal: { label: "Gagal", kelas: "bg-danger-soft text-danger" },
  kedaluwarsa: { label: "Kedaluwarsa", kelas: "bg-subtle text-muted" },
  dikembalikan: { label: "Dikembalikan", kelas: "bg-subtle text-muted" },
};

export default function HalamanLangganan(props: PageProps<"/langganan">) {
  return (
    <div className="space-y-6 lg:space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">Langganan</h1>
        <p className="mt-1 text-muted">Paket aktif, sisa kuota balasan AI, dan pembayaran.</p>
      </div>
      <Suspense fallback={null}>
        <Kembali searchParams={props.searchParams} />
      </Suspense>
      <Suspense fallback={<div aria-hidden className="card h-40 animate-denyut" />}>
        <Status />
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

/** Kembali dari halaman pembayaran Midtrans (?order=...): status dicek langsung ke Midtrans. */
async function Kembali({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const order = (await searchParams).order;
  return typeof order === "string" && /^WA-\d+-\d+-[0-9a-f]+$/.test(order) ? <HasilBayar orderId={order} /> : null;
}

async function Status() {
  const user = await requireUser();
  const hak = await hakAkun(user);
  const [terpakai, nomor] = await Promise.all([hak.balasan === null ? Promise.resolve(0) : balasanTerpakai(user.id, hak.periodeMulai), nomorMilik(user.id)]);
  const persenBalasan = hak.balasan ? Math.min(100, Math.round((terpakai / hak.balasan) * 100)) : 0;
  const habis = hak.balasan !== null && terpakai >= hak.balasan;
  return (
    <section className="card grid gap-6 p-6 md:grid-cols-3">
      <div>
        <p className="text-[12.5px] font-semibold text-muted">Paket sekarang</p>
        <p className="mt-1 text-2xl font-bold">{hak.paket}</p>
        <p className="mt-1 text-[13px] text-muted">
          {hak.sampai ? `Aktif sampai ${tanggal(hak.sampai)}` : hak.paket === "Admin" ? "Tanpa batas" : "Kuota gratis, berulang tiap awal bulan"}
        </p>
      </div>
      <div>
        <p className="text-[12.5px] font-semibold text-muted">Balasan AI {hak.sampai ? "masa ini" : "bulan ini"}</p>
        <p className="mt-1 text-2xl font-bold tabular-nums">
          {angka(terpakai)}
          <span className="text-base text-muted"> / {hak.balasan === null ? "∞" : angka(hak.balasan)}</span>
        </p>
        {hak.balasan !== null && (
          <div className="mt-2">
            <Meter persen={persenBalasan} label="Pemakaian kuota balasan AI" />
          </div>
        )}
        {habis && <p className="mt-2 text-[12.5px] font-semibold text-danger">Kuota habis: AI berhenti membalas sampai paket diperpanjang.</p>}
      </div>
      <div>
        <p className="text-[12.5px] font-semibold text-muted">Nomor WhatsApp</p>
        <p className="mt-1 text-2xl font-bold tabular-nums">
          {nomor.length}
          <span className="text-base text-muted"> / {hak.nomor === null ? "∞" : hak.nomor}</span>
        </p>
      </div>
    </section>
  );
}

async function Paket() {
  const user = await requireUser();
  const [paket, k, hak] = await Promise.all([daftarPaket(), konfigMidtrans(), hakAkun(user)]);
  const dijual = paket.filter((p) => p.harga > 0);
  if (!dijual.length) return null;
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
              {[`${angka(p.kuota_nomor)} nomor WhatsApp`, `${angka(p.kuota_balasan)} balasan AI`, "Base knowledge & belajar dari balasanmu", "Histori percakapan"].map((x) => (
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
      </div>
      <p className="mt-3 text-[12.5px] text-muted">
        Bayar lewat QRIS, transfer bank (virtual account), e-wallet, atau kartu. Perpanjang paket yang sama = masa & kuota ditambahkan. Ganti paket = paket baru mulai hari itu.
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
                {t.metode ? ` · ${t.metode.replace(/_/g, " ")}` : ""}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${STATUS[t.status]?.kelas ?? ""}`}>{STATUS[t.status]?.label ?? t.status}</span>
              {t.status === "menunggu" && t.redirect_url && (
                <a href={t.redirect_url} className="btn btn-ghost border border-line">
                  Lanjutkan bayar
                </a>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
