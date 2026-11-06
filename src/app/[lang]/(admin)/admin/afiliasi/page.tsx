import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, CheckCircle2, Clock, Package, Settings2, Share2, Users, Wallet, XCircle } from "lucide-react";
import { labelKomisiPaket, namaBankTampil, ringkasanAfiliasiAdmin } from "@/lib/afiliasi";
import { angka, waktuSingkatWib } from "@/lib/format";
import { MEREK } from "@/lib/merek";
import { requireAdmin } from "@/lib/session";
import { AksiStatusAfiliator, FormAturanAfiliasi, FormProsesPenarikan } from "./form-afiliasi-admin";

export const metadata: Metadata = { title: `Afiliasi · Admin · ${MEREK}` };

const BADGE_STATUS_AF: Record<string, { label: string; kelas: string }> = {
  aktif: { label: "Aktif", kelas: "bg-success-soft text-success" },
  menunggu: { label: "Menunggu ACC", kelas: "bg-warning-soft text-warning" },
  nonaktif: { label: "Nonaktif", kelas: "bg-danger-soft text-danger" },
};

const BADGE_PENARIKAN: Record<string, { label: string; kelas: string }> = {
  menunggu: { label: "Menunggu diproses", kelas: "bg-warning-soft text-warning" },
  selesai: { label: "Lunas / Selesai", kelas: "bg-success-soft text-success" },
  ditolak: { label: "Ditolak", kelas: "bg-danger-soft text-danger" },
};

async function IsiAdminAfiliasi() {
  await requireAdmin();
  const data = await ringkasanAfiliasiAdmin();
  const { statistik: s, pengaturan, irisSiap, penarikan, afiliator, komisiTerbaru } = data;
  const antreanMenunggu = penarikan.filter((p) => p.status === "menunggu");
  const riwayatSelesai = penarikan.filter((p) => p.status !== "menunggu");

  return (
    <div className="space-y-6">
      {/* Metrik Ringkasan */}
      <section aria-label="Ringkasan Afiliasi" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-5">
          <div className="flex items-center justify-between text-muted">
            <span className="text-[12px] font-semibold">Penarikan Menunggu</span>
            <Clock className="size-4 text-warning" aria-hidden />
          </div>
          <p className="mt-2 text-2xl font-extrabold tracking-tight tabular-nums">
            Rp{angka(s.penarikanMenungguNominal)}
          </p>
          <p className="mt-1 text-[12px] text-muted tabular-nums">
            {angka(s.penarikanMenungguJumlah)} pengajuan menunggu pencairan
          </p>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between text-muted">
            <span className="text-[12px] font-semibold">Total Komisi Dibagikan</span>
            <Banknote className="size-4 text-accent" aria-hidden />
          </div>
          <p className="mt-2 text-2xl font-extrabold tracking-tight tabular-nums">
            Rp{angka(s.totalKomisiDibagikan)}
          </p>
          <p className="mt-1 text-[12px] text-muted tabular-nums">
            Sudah dicairkan Rp{angka(s.totalSudahDitarik)}
          </p>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between text-muted">
            <span className="text-[12px] font-semibold">Saldo Mengendap di Mitra</span>
            <Wallet className="size-4 text-accent" aria-hidden />
          </div>
          <p className="mt-2 text-2xl font-extrabold tracking-tight tabular-nums">
            Rp{angka(s.saldoMengendap)}
          </p>
          <p className="mt-1 text-[12px] text-muted">Belum diajukan penarikan oleh afiliator</p>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between text-muted">
            <span className="text-[12px] font-semibold">Mitra Afiliator</span>
            <Users className="size-4 text-accent" aria-hidden />
          </div>
          <p className="mt-2 text-2xl font-extrabold tracking-tight tabular-nums">
            {angka(s.totalAfiliator)} <span className="text-[14px] font-semibold text-muted">mitra</span>
          </p>
          <p className="mt-1 text-[12px] text-muted tabular-nums">
            {s.menungguPersetujuan > 0
              ? `${angka(s.menungguPersetujuan)} pendaftar menunggu persetujuan`
              : "Semua pendaftar sudah aktif"}
          </p>
        </div>
      </section>

      {/* Antrean Pencairan Komisi (Withdraw) */}
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-[15px] font-bold">
              <Wallet className="size-4 text-accent" aria-hidden /> Antrean Pengajuan Penarikan (Withdraw)
            </h2>
            <p className="mt-0.5 text-[12.5px] text-muted">
              Transfer ke rekening mitra lalu klik Tandai Sudah Ditransfer{irisSiap ? ", atau cairkan otomatis 1-klik lewat Midtrans Iris." : "."}
            </p>
          </div>
          <span className="rounded-full bg-subtle px-3 py-1 text-[12px] font-semibold text-muted tabular-nums">
            {antreanMenunggu.length} menunggu
          </span>
        </div>

        {antreanMenunggu.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-muted">
            Tidak ada pengajuan penarikan yang menunggu diproses.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {antreanMenunggu.map((p) => (
              <li key={p.id} className="px-5 py-4 text-[13px]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 [overflow-wrap:anywhere]">
                    <p className="text-[15px] font-extrabold tabular-nums">
                      Rp{angka(p.nominal)}{" "}
                      <span className="text-[13px] font-semibold text-accent">
                        → {namaBankTampil(p.bank_nama)} · {p.bank_nomor} a.n. {p.bank_pemilik}
                      </span>
                    </p>
                    <p className="mt-0.5 text-[12.5px] text-muted">
                      Mitra:{" "}
                      <Link href={`/admin/pengguna/${p.afiliator_id}`} className="font-semibold text-fg hover:underline">
                        {p.afiliator_nama || p.afiliator_email}
                      </Link>{" "}
                      ({p.afiliator_email} · kode <code className="font-mono">{p.afiliator_kode}</code>) · Diajukan{" "}
                      {waktuSingkatWib(p.dibuat)}
                    </p>
                  </div>
                  <span className="rounded-full bg-warning-soft px-2.5 py-1 text-[11.5px] font-semibold text-warning">
                    Menunggu pencairan
                  </span>
                </div>
                <FormProsesPenarikan
                  id={p.id}
                  nominal={p.nominal}
                  bankNama={namaBankTampil(p.bank_nama)}
                  bankNomor={p.bank_nomor}
                  irisSiap={irisSiap}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Pengaturan Program Afiliasi */}
      <section className="card p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-[15px] font-bold">
              <Settings2 className="size-4 text-accent" aria-hidden /> Aturan Program Afiliasi
            </h2>
            <p className="mt-0.5 text-[13px] text-muted">
              Atur siklus komisi, persetujuan afiliator baru, dan batas minimal penarikan. Untuk mengatur besaran komisi masing-masing paket (% atau Rp), buka menu{" "}
              <Link href="/admin/paket" className="font-semibold text-accent hover:underline">
                Paket &amp; harga
              </Link>
              .
            </p>
          </div>
          <Link href="/admin/paket" className="btn btn-ghost border border-line text-[12.5px]">
            <Package className="size-4" aria-hidden /> Atur Komisi per Paket
          </Link>
        </div>
        <div className="mt-5">
          <FormAturanAfiliasi awal={pengaturan} />
        </div>
      </section>

      {/* Daftar Mitra Afiliator */}
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
          <h2 className="flex items-center gap-2 text-[15px] font-bold">
            <Share2 className="size-4 text-accent" aria-hidden /> Daftar Mitra Afiliator ({afiliator.length})
          </h2>
        </div>

        {afiliator.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-muted">Belum ada pengguna yang mendaftar program afiliasi.</p>
        ) : (
          <>
          {/* HP: kartu per mitra, tombol tindakan langsung terlihat tanpa geser tabel. */}
          <ul className="divide-y divide-line sm:hidden">
            {afiliator.map((a) => {
              const badge = BADGE_STATUS_AF[a.status] ?? BADGE_STATUS_AF.aktif;
              return (
                <li key={a.user_id} className="space-y-2 px-4 py-3.5 text-[13px]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/admin/pengguna/${a.user_id}`} className="block truncate font-semibold hover:underline">
                        {a.nama || a.email}
                      </Link>
                      <span className="block text-[12px] text-muted [overflow-wrap:anywhere]">
                        {a.email} · kode <code className="font-mono font-semibold text-fg">{a.kode}</code>
                      </span>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${badge.kelas}`}>{badge.label}</span>
                  </div>
                  <p className="text-[12px] text-muted [overflow-wrap:anywhere]">
                    {namaBankTampil(a.bank_nama)} · <span className="font-mono tabular-nums">{a.bank_nomor}</span> a.n. {a.bank_pemilik}
                  </p>
                  <div className="grid grid-cols-2 gap-2 rounded-xl bg-subtle/60 p-2.5 text-[12px] tabular-nums">
                    <span>
                      <span className="font-semibold">{angka(a.klik)}</span> klik · <span className="font-semibold">{angka(a.pendaftar)}</span> daftar ·{" "}
                      <span className="font-bold text-success">{angka(a.pembeli)}</span> beli
                    </span>
                    <span className="text-right">
                      <span className="font-bold">Rp{angka(a.saldo)}</span>
                      <span className="block text-muted">Total Rp{angka(a.total_komisi)}</span>
                    </span>
                  </div>
                  <div className="flex justify-end">
                    <AksiStatusAfiliator userId={a.user_id} status={a.status} />
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[760px] text-left text-[13px]">
              <thead className="bg-subtle/60 text-[11.5px] font-semibold tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-5 py-3">Mitra &amp; Kode</th>
                  <th className="px-3 py-3">Rekening Tujuan</th>
                  <th className="px-3 py-3 text-right">Klik / Daftar / Beli</th>
                  <th className="px-3 py-3 text-right">Saldo / Total Komisi</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Tindakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {afiliator.map((a) => {
                  const badge = BADGE_STATUS_AF[a.status] ?? BADGE_STATUS_AF.aktif;
                  return (
                    <tr key={a.user_id} className="transition-colors hover:bg-subtle/40">
                      <td className="px-5 py-3">
                        <Link href={`/admin/pengguna/${a.user_id}`} className="font-semibold hover:underline">
                          {a.nama || a.email}
                        </Link>
                        <span className="block text-[12px] text-muted">
                          {a.email} · kode <code className="font-mono font-semibold text-fg">{a.kode}</code>
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="font-semibold">{namaBankTampil(a.bank_nama)}</span> ·{" "}
                        <span className="font-mono tabular-nums">{a.bank_nomor}</span>
                        <span className="block text-[12px] text-muted">a.n. {a.bank_pemilik}</span>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        <span className="font-semibold">{angka(a.klik)}</span> klik ·{" "}
                        <span className="font-semibold">{angka(a.pendaftar)}</span> daftar ·{" "}
                        <span className="font-bold text-success">{angka(a.pembeli)}</span> beli
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        <span className="font-bold">Rp{angka(a.saldo)}</span>
                        <span className="block text-[12px] text-muted">Total: Rp{angka(a.total_komisi)}</span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${badge.kelas}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <AksiStatusAfiliator userId={a.user_id} status={a.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>

      {/* Riwayat Komisi & Riwayat Pencairan */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="card overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-[15px] font-bold">Komisi Afiliasi Terbaru</h2>
          </div>
          {komisiTerbaru.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-muted">Belum ada transaksi yang menghasilkan komisi afiliasi.</p>
          ) : (
            <ul className="divide-y divide-line">
              {komisiTerbaru.map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-3 px-5 py-3 text-[13px]">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      <Link href={`/admin/pengguna/${k.afiliator_id}`} className="hover:underline">
                        {k.afiliator_email}
                      </Link>{" "}
                      (<code className="font-mono text-[12px]">{k.afiliator_kode}</code>)
                    </p>
                    <p className="truncate text-[12px] text-muted">
                      Pembeli: {k.referred_email ?? "–"} · Paket {k.nama_paket} (Rp{angka(k.jumlah_bayar)} ·{" "}
                      {labelKomisiPaket(k.komisi_jenis, k.komisi_acuan)}) · {waktuSingkatWib(k.created_at)}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-success-soft px-2.5 py-1 text-[12px] font-bold text-success tabular-nums">
                    +Rp{angka(k.nominal)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-[15px] font-bold">Riwayat Penarikan Diproses</h2>
          </div>
          {riwayatSelesai.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-muted">Belum ada riwayat penarikan yang selesai diproses.</p>
          ) : (
            <ul className="divide-y divide-line">
              {riwayatSelesai.map((p) => {
                const badge = BADGE_PENARIKAN[p.status] ?? BADGE_PENARIKAN.selesai;
                return (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3 text-[13px]">
                    <div className="min-w-0 [overflow-wrap:anywhere]">
                      <p className="font-bold tabular-nums">
                        Rp{angka(p.nominal)} ·{" "}
                        <Link href={`/admin/pengguna/${p.afiliator_id}`} className="font-semibold hover:underline">
                          {p.afiliator_email}
                        </Link>
                      </p>
                      <p className="text-[12px] text-faint">
                        {namaBankTampil(p.bank_nama)} {p.bank_nomor} a.n. {p.bank_pemilik}
                        {p.diproses ? ` · ${waktuSingkatWib(p.diproses)}` : ""}
                        {p.metode ? ` · ${p.metode === "iris" ? "Midtrans Iris" : "Manual"}` : ""}
                        {p.referensi ? ` · Ref: ${p.referensi}` : ""}
                        {p.catatan ? ` · ${p.catatan}` : ""}
                      </p>
                    </div>
                    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${badge.kelas}`}>
                      {p.status === "selesai" ? (
                        <CheckCircle2 className="size-3.5" aria-hidden />
                      ) : (
                        <XCircle className="size-3.5" aria-hidden />
                      )}
                      {badge.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

export default function HalamanAdminAfiliasi() {
  return (
    <div className="space-y-6 lg:space-y-8">
      <div>
        <p className="text-[11.5px] font-semibold tracking-[0.08em] text-accent uppercase">Panel admin</p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-[28px]">Afiliasi & Pencairan Komisi</h1>
        <p className="mt-1 max-w-2xl text-muted">
          Kelola mitra afiliator, proses pengajuan pencairan komisi, dan atur mekanisme program afiliasi.
        </p>
      </div>
      <Suspense fallback={<div aria-hidden className="h-96 animate-denyut rounded-2xl bg-subtle" />}>
        <IsiAdminAfiliasi />
      </Suspense>
    </div>
  );
}
