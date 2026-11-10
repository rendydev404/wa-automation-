import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import Link from "@/components/link";
import { Pill } from "@/components/ui";
import { LABEL_STATUS_APLIKASI, labelFitur } from "@/lib/api-def";
import { type FilterAplikasi, biayaEfektif, daftarAksesApi, daftarAplikasi, hitungAplikasi, pengaturanApi } from "@/lib/developer-api";
import { tanggal } from "@/lib/format";
import { modeMesin } from "@/lib/mode";
import { requireDeveloper } from "@/lib/session";
import { FormBeriAkses, FormPengaturanApi, TombolCabutAkses } from "./form-developer-api";
import { NADA_STATUS } from "./umum";

const FILTER: { nilai: FilterAplikasi; label: string }[] = [
  { nilai: "menunggu", label: "Menunggu" },
  { nilai: "aktif", label: "Aktif" },
  { nilai: "ditolak", label: "Ditolak" },
  { nilai: "semua", label: "Semua" },
];

/** Panel developer internal: antrean pengajuan Developer API, aplikasi aktif, dan sakelar umum. */
export default function HalamanDeveloperApi(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (modeMesin()) notFound();
  return (
    <div className="space-y-6 lg:space-y-8">
      <div>
        <p className="text-[11.5px] font-semibold tracking-[0.08em] text-accent uppercase">Panel admin</p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-[28px]">Developer API</h1>
        <p className="mt-1 max-w-2xl text-muted">
          Tinjau pengajuan developer luar, buka fitur per aplikasi, atur gratis/berbayar, dan kelola key & mesin self-host. Setiap perubahan dikirim ke mesin lewat webhook lisensi.
        </p>
      </div>
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Suspense fallback={<div aria-hidden className="card h-[420px] animate-denyut" />}>
          <Daftar searchParams={props.searchParams} />
        </Suspense>
        <div className="space-y-6">
          <Suspense fallback={<div aria-hidden className="card h-64 animate-denyut" />}>
            <AksesPortal />
          </Suspense>
          <Suspense fallback={<div aria-hidden className="card h-[420px] animate-denyut" />}>
            <Pengaturan />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

async function Daftar({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireDeveloper();
  const sp = await searchParams;
  const cari = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const filter = FILTER.find((f) => f.nilai === sp.f)?.nilai ?? "menunggu";
  const setelah = Number(sp.setelah);
  const [{ daftar, adaLagi }, jumlah, umum] = await Promise.all([
    daftarAplikasi({ filter, cari, setelah: Number.isInteger(setelah) && setelah > 0 ? setelah : undefined }),
    hitungAplikasi(),
    pengaturanApi(),
  ]);
  const tautan = (ubah: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: cari || undefined, f: filter === "menunggu" ? undefined : filter, ...ubah })) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/admin/developer-api?${s}` : "/admin/developer-api";
  };
  const terakhir = daftar.at(-1);
  return (
    <section className="card min-w-0 overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line p-4 sm:p-5">
        <form action="/admin/developer-api" className="flex w-full gap-2 sm:max-w-md">
          {filter !== "menunggu" && <input type="hidden" name="f" value={filter} />}
          <label htmlFor="cari-aplikasi" className="sr-only">
            Cari aplikasi
          </label>
          <input id="cari-aplikasi" name="q" defaultValue={cari} placeholder="Cari nama aplikasi, pemilik, atau email…" className="field" />
          <button type="submit" className="btn btn-ghost min-h-[2.75rem] border border-line">
            Cari
          </button>
        </form>
        <nav aria-label="Saring aplikasi" className="flex max-w-full gap-1 self-start overflow-x-auto rounded-xl bg-subtle p-1">
          {FILTER.map((f) => (
            <Link
              key={f.nilai}
              href={tautan({ f: f.nilai === "menunggu" ? undefined : f.nilai })}
              aria-current={filter === f.nilai ? "page" : undefined}
              className={`inline-flex min-h-9 shrink-0 items-center rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${filter === f.nilai ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg"}`}
            >
              {f.label}
              <span className={`ml-1.5 tabular-nums ${filter === f.nilai ? "text-accent" : "text-faint"}`}>{jumlah[f.nilai].toLocaleString("id-ID")}</span>
            </Link>
          ))}
        </nav>
      </div>
      {daftar.length ? (
        <ul data-analitik-privat className="divide-y divide-line">
          {daftar.map((a) => (
            <li key={a.id}>
              <Link href={`/admin/developer-api/${a.id}`} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-subtle/50 sm:px-5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ink text-[15px] font-bold text-ink-signal uppercase">{a.nama.charAt(0)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[14px] font-semibold">{a.nama}</span>
                    <Pill nada={NADA_STATUS[a.status]}>{LABEL_STATUS_APLIKASI[a.status]}</Pill>
                    {(a.status === "disetujui" || a.status === "ditangguhkan") && (
                      <span className="rounded-md bg-subtle px-1.5 py-0.5 text-[10.5px] font-bold text-muted uppercase">{biayaEfektif(a, umum)}</span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-[12.5px] text-muted">
                    {a.pemilik} · {a.email}
                  </span>
                  <span className="block truncate text-[12px] text-faint">
                    {tanggal(a.created_at)} · {(a.status === "menunggu" || a.status === "ditolak" ? a.fitur_diminta : a.fitur).map(labelFitur).join(", ")}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-12 text-center text-[13px] text-muted">{filter === "menunggu" ? "Tidak ada pengajuan yang menunggu." : "Belum ada aplikasi di saringan ini."}</p>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-[12.5px] text-muted sm:px-5">
        <span>
          Menampilkan <strong className="text-fg">{daftar.length}</strong> dari <strong className="text-fg">{jumlah[filter].toLocaleString("id-ID")}</strong>
        </span>
        <span className="flex gap-2">
          {sp.setelah && (
            <Link href={tautan({})} className="btn btn-ghost border border-line">
              Ke awal
            </Link>
          )}
          {adaLagi && terakhir && (
            <Link href={tautan({ setelah: String(terakhir.id) })} className="btn btn-ghost border border-line">
              Berikutnya
            </Link>
          )}
        </span>
      </div>
    </section>
  );
}

async function Pengaturan() {
  await requireDeveloper();
  const umum = await pengaturanApi();
  return (
    <section className="card p-4 sm:p-6">
      <h2 className="text-[15px] font-bold">Pengaturan umum</h2>
      <p className="mt-0.5 text-[13px] text-muted">Bawaan untuk semua aplikasi; pengaturan per aplikasi mengalahkannya.</p>
      <div className="mt-4">
        <FormPengaturanApi biaya={umum.biaya} harga={umum.harga} fitur={umum.fitur} />
      </div>
    </section>
  );
}

/** Akun yang melihat menu Developer API di workspace-nya. Bawaan kosong: tidak ada yang otomatis, admin pun tidak. */
async function AksesPortal() {
  await requireDeveloper();
  const akun = await daftarAksesApi();
  return (
    <section className="card p-4 sm:p-6">
      <h2 className="text-[15px] font-bold">Akses portal</h2>
      <p className="mt-0.5 text-[13px] text-muted">
        Fitur ini belum dibuka umum. Hanya akun di daftar ini yang melihat menu Developer API di workspace-nya.
      </p>
      <div className="mt-4">
        <FormBeriAkses />
      </div>
      {akun.length ? (
        <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
          {akun.map((u) => (
            <li key={u.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold">{u.nama || u.email.split("@")[0]}</span>
                <span className="block truncate text-[12px] text-muted">{u.email}</span>
              </span>
              <TombolCabutAkses userId={u.id} email={u.email} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-line px-3 py-5 text-center text-[13px] text-muted">Belum ada akun yang diberi akses.</p>
      )}
    </section>
  );
}
