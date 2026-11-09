import { Suspense } from "react";
import Link from "next/link";
import { sekarang } from "@/lib/db";
import { notFound } from "next/navigation";
import { ChevronRight, ExternalLink, Receipt, UserRound } from "lucide-react";
import { LencanaPaket } from "@/components/lencana-paket";
import { TombolSalin } from "@/components/tombol-salin";
import { angka, jamWib, tanggal, waktuSingkatWib } from "@/lib/format";
import { requireAdmin } from "@/lib/session";
import { tingkatPaket } from "@/lib/tingkat-paket";
import { detailTransaksi } from "@/lib/transaksi-admin";
import { STATUS_TRX, labelMetode, rp } from "../bagian-transaksi";
import { labelGateway } from "@/lib/gateway-def";
import { BarisRefund } from "../pengembalian";
import { pengembalianTransaksi } from "@/lib/jaminan";

export default function HalamanDetailTransaksi(props: PageProps<"/[lang]/admin/transaksi/[order]">) {
  return (
    <div>
      <nav aria-label="Jejak halaman" className="mb-5">
        <ol className="flex items-center gap-1.5 text-[13px]">
          <li>
            <Link href="/admin/transaksi" className="font-medium text-muted transition-colors hover:text-fg">
              Transaksi
            </Link>
          </li>
          <li aria-hidden>
            <ChevronRight className="size-3.5 text-faint" />
          </li>
          <li aria-current="page" className="font-medium text-fg">
            Detail pembelian
          </li>
        </ol>
      </nav>
      <Suspense fallback={<div aria-hidden className="card h-[520px] animate-denyut" />}>
        <Isi params={props.params} />
      </Suspense>
    </div>
  );
}

const waktuLengkap = (d: number) => `${tanggal(d)}, ${jamWib(d)} WIB`;

function Baris({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 py-2.5 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-[12.5px] text-muted">{label}</dt>
      <dd className="min-w-0 text-[13.5px] font-medium break-words">{children}</dd>
    </div>
  );
}

async function Isi({ params }: { params: Promise<{ order: string }> }) {
  await requireAdmin();
  const order = decodeURIComponent((await params).order).slice(0, 80);
  const t = await detailTransaksi(order);
  if (!t) notFound();
  const refund = await pengembalianTransaksi(t.id);
  const st = STATUS_TRX[t.status];
  const tingkat = tingkatPaket(t.kode_paket, t.nama_paket);
  const kini = sekarang();

  // Jejak waktu: dibuat -> dibayar / kedaluwarsa -> masa aktif paket.
  const jejak: { label: string; waktu: number; nada: "netral" | "baik" | "buruk" }[] = [{ label: "Tagihan dibuat", waktu: t.dibuat, nada: "netral" }];
  if (t.dibayar) jejak.push({ label: t.status === "dikembalikan" ? "Dibayar (kemudian dikembalikan)" : "Pembayaran diterima", waktu: t.dibayar, nada: "baik" });
  if (refund?.selesai) jejak.push({ label: "Dana dikembalikan", waktu: refund.selesai, nada: "buruk" });
  if (!t.dibayar && t.kedaluwarsa) jejak.push({ label: t.status === "menunggu" ? "Batas pembayaran" : "Kedaluwarsa", waktu: t.kedaluwarsa, nada: t.status === "menunggu" ? "netral" : "buruk" });
  if (t.langganan_mulai) jejak.push({ label: "Paket aktif mulai", waktu: t.langganan_mulai, nada: "baik" });
  if (t.langganan_sampai) jejak.push({ label: t.langganan_sampai > kini ? "Paket aktif sampai" : "Paket berakhir", waktu: t.langganan_sampai, nada: t.langganan_sampai > kini ? "baik" : "netral" });
  jejak.sort((a, b) => a.waktu - b.waktu);

  return (
    <div className="space-y-6">
      <header className="card overflow-hidden">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[12px] font-semibold tracking-[0.06em] text-muted uppercase">
              <Receipt className="size-4 text-accent" aria-hidden /> ID pembelian
            </p>
            <p className="mt-1 flex items-start gap-1.5">
              <span className="min-w-0 font-mono text-lg font-bold break-all sm:text-2xl">{t.order_id}</span>
              <TombolSalin teks={t.order_id} className="mt-0.5 max-sm:size-9!" />
            </p>
            <p className="mt-1 text-[12.5px] text-faint">Nomor internal #{t.id}</p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <span className={`rounded-full px-3 py-1.5 text-[12.5px] font-bold ${st?.kelas ?? ""}`}>{st?.label ?? t.status}</span>
            <p className="text-3xl font-extrabold tracking-tight tabular-nums">{rp(t.jumlah)}</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <section className="card p-5 sm:p-6">
            <h2 className="text-[15px] font-bold">Rincian pembelian</h2>
            <dl data-analitik-privat className="mt-2 divide-y divide-line">
              <Baris label="Paket">
                <span className="flex flex-wrap items-center gap-2">
                  <LencanaPaket tingkat={tingkat} nama={t.nama_paket} />
                  {!t.paket_id && <span className="text-[12px] text-faint">(isi khusus / paket sudah dihapus)</span>}
                </span>
              </Baris>
              <Baris label="Jumlah dibayar">{rp(t.jumlah)}</Baris>
              <Baris label="Metode pembayaran">{labelMetode(t)}</Baris>
              {t.kanal && <Baris label="Payment gateway">{labelGateway(t.gateway)}</Baris>}
              {t.metode && t.kanal && <Baris label={`Metode menurut ${labelGateway(t.gateway)}`}>{t.metode.replace(/_/g, " ")}</Baris>}
              {t.bayar?.va && <Baris label="Nomor virtual account">{t.bayar.va}</Baris>}
              <Baris label="Dibuat">{waktuLengkap(t.dibuat)}</Baris>
              <Baris label="Dibayar">{t.dibayar ? waktuLengkap(t.dibayar) : "—"}</Baris>
              {t.kedaluwarsa && !t.dibayar && <Baris label="Batas bayar">{waktuLengkap(t.kedaluwarsa)}</Baris>}
              <Baris label="Masa aktif paket">
                {t.langganan_mulai && t.langganan_sampai ? (
                  <>
                    {tanggal(t.langganan_mulai)} – {tanggal(t.langganan_sampai)}
                    {t.kuota_balasan !== null && (
                      <span className="block text-[12.5px] text-muted">
                        {angka(t.kuota_nomor ?? 0)} nomor · {angka(t.kuota_balasan)} balasan AI
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-muted">{t.status === "lunas" ? "—" : "Belum aktif (belum lunas)"}</span>
                )}
              </Baris>
              {t.catatan && <Baris label="Catatan admin">{t.catatan}</Baris>}
              <Baris label="Komisi afiliasi">
                {t.komisi ? (
                  <>
                    {rp(t.komisi.nominal)}{" "}
                    <span className="text-muted">
                      ({t.komisi.komisi_jenis === "persen" ? `${t.komisi.komisi_acuan}%` : rp(t.komisi.komisi_acuan)}) untuk{" "}
                      <Link href={`/admin/pengguna/${t.komisi.afiliator_id}`} data-analitik="Buka pengguna" className="font-semibold text-fg hover:underline">
                        {t.komisi.email}
                      </Link>
                    </span>
                  </>
                ) : (
                  <span className="text-muted">Tidak ada</span>
                )}
              </Baris>
            </dl>
          </section>

          {refund && (
            <section className="card p-5 sm:p-6" aria-labelledby="judul-refund">
              <h2 id="judul-refund" className="mb-3 text-[15px] font-bold">
                Pengembalian dana
              </h2>
              <BarisRefund r={refund} tautan={false} />
            </section>
          )}

          <section className="card p-5 sm:p-6">
            <h2 className="text-[15px] font-bold">Jejak waktu</h2>
            <ol className="mt-4 space-y-4 border-l border-line pl-5">
              {jejak.map((j) => (
                <li key={`${j.label}-${j.waktu}`} className="relative">
                  <span
                    aria-hidden
                    className={`absolute top-1 -left-[26px] size-2.5 rounded-full ring-4 ring-surface ${j.nada === "baik" ? "bg-success" : j.nada === "buruk" ? "bg-danger" : "bg-line-strong"}`}
                  />
                  <p className="text-[13.5px] font-semibold">{j.label}</p>
                  <p className="text-[12.5px] text-muted">{waktuLengkap(j.waktu)}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="space-y-6">
          <section data-analitik-privat className="card p-5">
            <h2 className="flex items-center gap-2 text-[15px] font-bold">
              <UserRound className="size-4 text-accent" aria-hidden /> Pembeli
            </h2>
            <p className="mt-3 truncate font-semibold">{t.nama_user || "(tanpa nama)"}</p>
            <p className="truncate text-[13px] text-muted">{t.email}</p>
            <p className="mt-0.5 text-[12px] text-faint">ID pengguna {t.user_id}</p>
            <Link href={`/admin/pengguna/${t.user_id}`} data-analitik="Kelola pengguna" className="btn btn-ghost mt-4 w-full justify-center border border-line">
              Kelola pengguna <ExternalLink className="size-3.5" aria-hidden />
            </Link>
          </section>
          {t.lain.length > 0 && (
            <section className="card overflow-hidden">
              <h2 className="border-b border-line px-5 py-3.5 text-[13px] font-bold">Transaksi lain pengguna ini</h2>
              <ul data-analitik-privat className="divide-y divide-line">
                {t.lain.map((x) => (
                  <li key={x.order_id}>
                    <Link href={`/admin/transaksi/${encodeURIComponent(x.order_id)}`} data-analitik="Buka transaksi" className="flex items-center justify-between gap-3 px-5 py-3 text-[12.5px] transition-colors hover:bg-subtle/60">
                      <span className="min-w-0">
                        <span className="block truncate font-mono font-semibold">{x.order_id}</span>
                        <span className="text-muted">
                          {x.nama_paket} · {rp(x.jumlah)} · {waktuSingkatWib(x.dibuat, kini)}
                        </span>
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TRX[x.status]?.kelas ?? ""}`}>{STATUS_TRX[x.status]?.label ?? x.status}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href={`/admin/transaksi?q=${t.user_id}`} className="block border-t border-line px-5 py-3 text-center text-[12.5px] font-semibold text-accent hover:underline">
                Lihat semua transaksi pengguna ini
              </Link>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
