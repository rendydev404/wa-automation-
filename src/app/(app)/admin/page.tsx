import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Bot, ChevronRight, Phone, ShieldCheck, UserCheck, UserPlus, UserX, Users } from "lucide-react";
import { KartuStat } from "@/components/stat";
import { angka, tanggal, waktuSingkatWib } from "@/lib/format";
import { type FilterPengguna, daftarLog, daftarPengguna, ringkasanAdmin } from "@/lib/pengguna";
import { kuotaBawaan, pendaftaranDibuka, requireAdmin } from "@/lib/session";
import { FormAi, FormBuatAkun, FormKunciAi, FormPengaturan } from "./form-admin";
import { kunciAnthropic, modelAnthropic, pengaturanAi, ringkasPakai } from "@/lib/ai";
import { samarkan } from "@/lib/rahasia";
import { sekarang } from "@/lib/db";

export const metadata: Metadata = { title: "Admin · Asisten WhatsApp" };

const FILTER: { nilai: FilterPengguna; label: string }[] = [
  { nilai: "semua", label: "Semua" },
  { nilai: "aktif", label: "Aktif" },
  { nilai: "diblokir", label: "Diblokir" },
  { nilai: "admin", label: "Admin" },
];

export default function HalamanAdmin(props: PageProps<"/admin">) {
  return (
    <div className="space-y-6 lg:space-y-8">
      <div>
        <p className="text-[11.5px] font-semibold tracking-[0.08em] text-accent uppercase">Panel admin</p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-[28px]">Kelola pengguna</h1>
        <p className="mt-1 max-w-2xl text-muted">Atur kuota perangkat WhatsApp tiap akun, blokir penyalahgunaan, reset password, dan aturan pendaftaran.</p>
      </div>
      <Suspense fallback={<div aria-hidden className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="card h-32 animate-denyut" />)}</div>}>
        <Ringkasan />
      </Suspense>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Suspense fallback={<div aria-hidden className="card h-[480px] animate-denyut" />}>
          <TabelPengguna searchParams={props.searchParams} />
        </Suspense>
        <div className="space-y-6">
          <Suspense fallback={<div aria-hidden className="card h-72 animate-denyut" />}>
            <MesinAi />
          </Suspense>
          <Suspense fallback={<div aria-hidden className="card h-56 animate-denyut" />}>
            <Pengaturan />
          </Suspense>
          <section className="card p-6">
            <h2 className="flex items-center gap-2 text-[15px] font-bold">
              <UserPlus className="size-4 text-accent" aria-hidden /> Buat akun
            </h2>
            <p className="mt-0.5 text-[13px] text-muted">Untuk klien yang tidak mendaftar sendiri.</p>
            <div className="mt-4">
              <FormBuatAkun />
            </div>
          </section>
          <Suspense fallback={<div aria-hidden className="card h-72 animate-denyut" />}>
            <Log />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

async function Ringkasan() {
  await requireAdmin();
  const r = await ringkasanAdmin();
  return (
    <section aria-label="Ringkasan pengguna" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      <KartuStat label="Total akun" nilai={angka(r.total)} ikon={<Users className="size-4" aria-hidden />} keterangan={`${angka(r.baru7)} mendaftar 7 hari terakhir`} />
      <KartuStat label="Akun aktif" nilai={angka(r.aktif)} ikon={<UserCheck className="size-4" aria-hidden />} keterangan={`${angka(r.admin)} admin`} />
      <KartuStat label="Diblokir" nilai={angka(r.diblokir)} ikon={<UserX className="size-4" aria-hidden />} keterangan="AI berhenti membalas di nomornya" />
      <KartuStat label="Nomor WhatsApp" nilai={angka(r.nomor)} ikon={<Phone className="size-4" aria-hidden />} keterangan={`${angka(r.tertaut)} sudah tertaut`} />
    </section>
  );
}

const KURS = 16_500; // perkiraan Rp per USD untuk tampilan biaya

async function MesinAi() {
  await requireAdmin();
  const [atur, kunci, pakai] = await Promise.all([pengaturanAi(), kunciAnthropic(), ringkasPakai(sekarang() - 7 * 86400)]);
  // Daftar model resmi dari akun Anthropic (sekaligus bukti kuncinya masih berlaku).
  const daftarModel = kunci ? await modelAnthropic(kunci) : null;
  const total = pakai.reduce((a, p) => ({ n: a.n + p.balasan, usd: a.usd + p.biaya_usd }), { n: 0, usd: 0 });
  return (
    <section className="card p-6">
      <h2 className="flex items-center gap-2 text-[15px] font-bold">
        <Bot className="size-4 text-accent" aria-hidden /> Mesin AI
      </h2>
      <p className="mt-0.5 text-[13px] text-muted">
        Sekarang: <span className="font-semibold text-fg">{atur.penyedia === "anthropic" ? `Claude API · ${atur.model}` : "Hermes"}</span>
      </p>
      {kunci && daftarModel === null && (
        <p className="mt-1 text-[12.5px] text-danger">API key Anthropic tersimpan tapi ditolak/tak terjangkau. Periksa kuncinya.</p>
      )}
      <div className="mt-4">
        <FormAi penyedia={atur.penyedia} model={atur.model} cadangan={atur.cadangan} adaKunci={!!kunci} daftarModel={daftarModel} />
      </div>
      <div className="mt-5 border-t border-line pt-4">
        <FormKunciAi samaran={kunci ? samarkan(kunci) : null} />
      </div>
      <div className="mt-5 border-t border-line pt-4">
        <p className="text-[12.5px] font-semibold">7 hari terakhir</p>
        {pakai.length === 0 ? (
          <p className="mt-1 text-[12.5px] text-muted">Belum ada balasan AI tercatat.</p>
        ) : (
          <ul className="mt-2 space-y-1.5 text-[12.5px]">
            {pakai.map((p) => (
              <li key={`${p.penyedia}-${p.model}`} className="flex justify-between gap-3">
                <span className="truncate text-muted">{p.model ?? p.penyedia}</span>
                <span className="shrink-0 tabular-nums">
                  {angka(p.balasan)} balasan{p.biaya_usd > 0 && ` · Rp${angka(Math.round(p.biaya_usd * KURS))}`}
                </span>
              </li>
            ))}
            {total.usd > 0 && (
              <li className="flex justify-between gap-3 border-t border-line pt-1.5 font-semibold">
                <span>Rata-rata per balasan</span>
                <span className="tabular-nums">Rp{angka(Math.round((total.usd * KURS) / Math.max(1, pakai.filter((p) => p.biaya_usd > 0).reduce((a, p) => a + p.balasan, 0))))}</span>
              </li>
            )}
          </ul>
        )}
      </div>
    </section>
  );
}

async function Pengaturan() {
  await requireAdmin();
  const [buka, kuota] = await Promise.all([pendaftaranDibuka(), kuotaBawaan()]);
  return (
    <section className="card p-6">
      <h2 className="flex items-center gap-2 text-[15px] font-bold">
        <ShieldCheck className="size-4 text-accent" aria-hidden /> Aturan pendaftaran
      </h2>
      <p className="mt-0.5 text-[13px] text-muted">Berlaku untuk akun yang dibuat setelah disimpan.</p>
      <div className="mt-4">
        <FormPengaturan buka={buka} kuota={kuota} />
      </div>
    </section>
  );
}

async function TabelPengguna({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const cari = typeof sp.q === "string" ? sp.q : "";
  const filter = (FILTER.find((f) => f.nilai === sp.f)?.nilai ?? "semua") as FilterPengguna;
  const sebelum = Number(sp.sebelum);
  const { daftar, adaLagi } = await daftarPengguna({ cari, filter, sebelumId: Number.isInteger(sebelum) && sebelum > 0 ? sebelum : undefined });
  const tautan = (ubah: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const semua = { q: cari || undefined, f: filter === "semua" ? undefined : filter, ...ubah };
    for (const [k, v] of Object.entries(semua)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/admin?${s}` : "/admin";
  };

  return (
    <section className="card min-w-0 overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <form action="/admin" className="flex w-full max-w-sm gap-2">
          {filter !== "semua" && <input type="hidden" name="f" value={filter} />}
          <label htmlFor="cari-pengguna" className="sr-only">
            Cari pengguna
          </label>
          <input id="cari-pengguna" name="q" defaultValue={cari} placeholder="Cari nama atau email…" className="field" />
          <button type="submit" className="btn btn-ghost border border-line">
            Cari
          </button>
        </form>
        <nav aria-label="Saring pengguna" className="flex gap-1 rounded-xl bg-subtle p-1">
          {FILTER.map((f) => (
            <Link
              key={f.nilai}
              href={tautan({ f: f.nilai === "semua" ? undefined : f.nilai })}
              aria-current={filter === f.nilai ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${filter === f.nilai ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg"}`}
            >
              {f.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead className="bg-subtle/60 text-[11.5px] font-semibold tracking-wide text-muted uppercase">
            <tr>
              <th className="px-5 py-3">Pengguna</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3 text-right">Nomor</th>
              <th className="px-3 py-3">Login terakhir</th>
              <th className="px-5 py-3 text-right" aria-label="Buka" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {daftar.map((u) => (
              <tr key={u.id} className="group transition-colors hover:bg-subtle/50">
                <td className="px-5 py-3">
                  <Link href={`/admin/pengguna/${u.id}`} className="flex items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-ink text-[12px] font-bold text-ink-signal uppercase">{(u.nama || u.email).charAt(0)}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">
                        {u.nama || "(tanpa nama)"}
                        {u.peran === "admin" && <span className="ml-2 rounded-md bg-accent-soft px-1.5 py-0.5 text-[10.5px] font-bold text-accent uppercase">Admin</span>}
                      </span>
                      <span className="block truncate text-muted">{u.email}</span>
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-3">
                  {u.status === "aktif" ? (
                    <span className="rounded-full bg-success-soft px-2.5 py-1 text-[11.5px] font-semibold text-success">Aktif</span>
                  ) : (
                    <span className="rounded-full bg-danger-soft px-2.5 py-1 text-[11.5px] font-semibold text-danger">Diblokir</span>
                  )}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {u.jumlah_nomor}
                  <span className="text-muted"> / {u.peran === "admin" ? "∞" : (u.kuota_nomor ?? "bawaan")}</span>
                </td>
                <td className="px-3 py-3 text-muted">{u.login_terakhir ? waktuSingkatWib(u.login_terakhir) : `Daftar ${tanggal(u.created_at)}`}</td>
                <td className="px-5 py-3 text-right">
                  <Link href={`/admin/pengguna/${u.id}`} aria-label={`Kelola ${u.email}`} className="inline-grid size-8 place-items-center rounded-lg text-faint transition-colors group-hover:bg-surface group-hover:text-fg">
                    <ChevronRight className="size-4" aria-hidden />
                  </Link>
                </td>
              </tr>
            ))}
            {daftar.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-muted">
                  Tidak ada pengguna yang cocok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {(adaLagi || sp.sebelum) && (
        <div className="flex justify-between gap-3 border-t border-line p-4">
          <Link href={tautan({})} className="btn btn-ghost border border-line">
            Ke awal
          </Link>
          {adaLagi && (
            <Link href={tautan({ sebelum: String(daftar[daftar.length - 1].id) })} className="btn btn-ghost border border-line">
              Berikutnya
            </Link>
          )}
        </div>
      )}
    </section>
  );
}

async function Log() {
  await requireAdmin();
  const log = await daftarLog(25);
  return (
    <section className="card p-6">
      <h2 className="text-[15px] font-bold">Jejak tindakan admin</h2>
      <ol className="mt-4 space-y-3">
        {log.map((l) => (
          <li key={l.id} className="text-[12.5px]">
            <p>
              <span className="font-semibold">{l.admin}</span> <span className="text-muted">{l.aksi}</span>
              {l.sasaran && <span className="font-semibold"> {l.sasaran}</span>}
            </p>
            <p className="text-faint">
              {waktuSingkatWib(l.waktu)}
              {l.detail && ` · ${l.detail}`}
            </p>
          </li>
        ))}
        {log.length === 0 && <li className="text-[13px] text-muted">Belum ada tindakan.</li>}
      </ol>
    </section>
  );
}
