import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight, Inbox } from "lucide-react";
import Link from "@/components/link";
import LinkNiat from "@/components/link-niat";
import { Pill } from "@/components/ui";
import { FITUR_API, type FiturApi, LABEL_STATUS_APLIKASI, labelFitur, samarkanNomor } from "@/lib/api-def";
import { ENDPOINT_DOK } from "@/lib/api-dok";
import {
  type FilterAplikasi,
  akunFitur,
  biayaEfektif,
  cariAkunAkses,
  daftarAplikasi,
  daftarFiturKhusus,
  daftarSandbox,
  hitungAplikasi,
  pemakaianFitur,
  pengaturanApi,
  pengaturanSandbox,
} from "@/lib/developer-api";
import { sekarang } from "@/lib/db";
import { jamWib, tanggal } from "@/lib/format";
import { modeMesin } from "@/lib/mode";
import { requireDeveloper } from "@/lib/session";
import { AksesPengguna } from "./akses-pengguna";
import { CariLangsung } from "./cari-langsung";
import { type EndpointRingkas, FormFiturGlobal, LingkupFitur } from "./fitur-global";
import { type BarisPenggunaFitur, PilihPenggunaFitur } from "./pilih-pengguna-fitur";
import { FormPengaturanApi, FormStatus } from "./form-developer-api";
import { FormFiturSandbox, FormPengaturanSandbox, FormUbahSandbox } from "./sandbox-panel";
import { NADA_STATUS } from "./umum";

type SP = Record<string, string | string[] | undefined>;
type Tab = "aplikasi" | "sandbox" | "fitur" | "akses" | "pengaturan";

const FILTER: { nilai: FilterAplikasi; label: string }[] = [
  { nilai: "menunggu", label: "Menunggu" },
  { nilai: "aktif", label: "Aktif" },
  { nilai: "ditolak", label: "Ditolak" },
  { nilai: "semua", label: "Semua" },
];

const tabDari = (sp: SP): Tab => (sp.tab === "sandbox" || sp.tab === "fitur" || sp.tab === "akses" || sp.tab === "pengaturan" ? sp.tab : "aplikasi");

/** Panel developer internal (hanya peran developer): pengajuan & aplikasi, akses portal per akun, pengaturan umum. */
export default function HalamanDeveloperApi(props: { searchParams: Promise<SP> }) {
  if (modeMesin()) notFound();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Developer API</h1>
        <p className="mt-0.5 text-[13.5px] text-muted">Tinjau pengajuan, centang fitur yang dibagikan, pilih akun yang boleh memakai portal, dan atur lisensi mesin self-host.</p>
      </header>
      <Suspense fallback={<Kerangka />}>
        <Panel searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

function Kerangka() {
  return (
    <div aria-hidden className="space-y-4">
      <div className="h-10 w-80 max-w-full animate-denyut rounded-lg bg-subtle" />
      <div className="card h-80 animate-denyut" />
    </div>
  );
}

async function Panel({ searchParams }: { searchParams: Promise<SP> }) {
  await requireDeveloper();
  const sp = await searchParams;
  const tab = tabDari(sp);
  const [jumlah, akses, umum] = await Promise.all([hitungAplikasi(), cariAkunAkses(), pengaturanApi()]);
  const TAB: { nilai: Tab; label: string; hitung?: number | string; sorot?: boolean }[] = [
    { nilai: "aplikasi", label: "Aplikasi", hitung: jumlah.menunggu, sorot: jumlah.menunggu > 0 },
    { nilai: "sandbox", label: "Sandbox" },
    { nilai: "fitur", label: "Fitur", hitung: `${umum.fitur.length}/${FITUR_API.length}` },
    { nilai: "akses", label: "Akses pengguna", hitung: akses.jumlahAkses },
    { nilai: "pengaturan", label: "Pengaturan" },
  ];
  return (
    <>
      {/* Tautan yang hanya mengganti parameter URL di halaman yang sama (tab, saring, halaman) memakai prefetch={false}:
          dengan partialPrefetching, App Shell hasil prefetch dipakai tanpa meminta isi dinamis, jadi URL berganti tetapi
          isinya tidak pernah diperbarui (diukur lewat docs/serah-terima-skrip/ukur-navigasi.mjs, DIAG_TAB=1). */}
      <nav aria-label="Bagian Developer API" className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
        {TAB.map((t) => {
          const aktif = t.nilai === tab;
          return (
            <Link
              key={t.nilai}
              prefetch={false}
              href={t.nilai === "aplikasi" ? "/admin/developer-api" : `/admin/developer-api?tab=${t.nilai}`}
              aria-current={aktif ? "page" : undefined}
              className={`relative -mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-[13.5px] font-semibold transition-colors ${aktif ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"}`}
            >
              {t.label}
              {t.hitung !== undefined && (
                <span className={`rounded-full px-1.5 py-px text-[11px] font-bold tabular-nums ${t.sorot ? "bg-warning-soft text-warning" : "bg-subtle text-muted"}`}>
                  {typeof t.hitung === "number" ? t.hitung.toLocaleString("id-ID") : t.hitung}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      {tab === "fitur" ? (
        <Fitur sp={sp} global={umum.fitur} />
      ) : tab === "akses" ? (
        <AksesPengguna awal={akses.daftar} jumlahAwal={akses.jumlahAkses} />
      ) : tab === "pengaturan" ? (
        <Pengaturan />
      ) : tab === "sandbox" ? (
        <Sandbox sp={sp} />
      ) : (
        <Aplikasi sp={sp} jumlah={jumlah} />
      )}
    </>
  );
}

async function Aplikasi({ sp, jumlah }: { sp: SP; jumlah: Record<FilterAplikasi, number> }) {
  const cari = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const filter = FILTER.find((f) => f.nilai === sp.f)?.nilai ?? "menunggu";
  const setelah = Number(sp.setelah);
  const [{ daftar, adaLagi }, umum] = await Promise.all([
    daftarAplikasi({ filter, cari, setelah: Number.isInteger(setelah) && setelah > 0 ? setelah : undefined }),
    pengaturanApi(),
  ]);
  const query = (ubah: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: cari || undefined, f: filter === "menunggu" ? undefined : filter, ...ubah })) if (v) q.set(k, v);
    return q.toString();
  };
  const tautan = (ubah: Record<string, string | undefined>) => {
    const s = query(ubah);
    return s ? `/admin/developer-api?${s}` : "/admin/developer-api";
  };
  const terakhir = daftar.at(-1);
  return (
    <section className="card min-w-0 overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <nav aria-label="Saring aplikasi" className="flex max-w-full gap-1 self-start overflow-x-auto rounded-lg bg-subtle p-1">
          {FILTER.map((f) => (
            <Link
              key={f.nilai}
              prefetch={false}
              href={tautan({ f: f.nilai === "menunggu" ? undefined : f.nilai })}
              aria-current={filter === f.nilai ? "page" : undefined}
              className={`inline-flex shrink-0 items-center rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${filter === f.nilai ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg"}`}
            >
              {f.label}
              <span className={`ml-1.5 tabular-nums ${filter === f.nilai ? "text-accent" : "text-faint"}`}>{jumlah[f.nilai].toLocaleString("id-ID")}</span>
            </Link>
          ))}
        </nav>
        <CariLangsung awal={cari} dasar={query({ q: undefined })} placeholder="Cari aplikasi, pemilik, email…" label="Cari aplikasi" />
      </div>
      {daftar.length ? (
        <ul data-analitik-privat className="divide-y divide-line">
          {daftar.map((a) => {
            const aktif = a.status === "disetujui" || a.status === "ditangguhkan";
            const fitur = (aktif ? a.fitur : a.fitur_diminta).map(labelFitur).join(", ") || "-";
            return (
              <li key={a.id}>
                <LinkNiat href={`/admin/developer-api/${a.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-subtle/50 sm:px-5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-ink text-[14px] font-bold text-ink-signal uppercase">{a.nama.charAt(0)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[13.5px] font-semibold">{a.nama}</span>
                      <Pill nada={NADA_STATUS[a.status]}>{LABEL_STATUS_APLIKASI[a.status]}</Pill>
                    </span>
                    <span className="block truncate text-[12px] text-muted">
                      {a.pemilik} · {a.email}
                    </span>
                    <span className="block truncate text-[12px] text-faint md:hidden">{fitur}</span>
                  </span>
                  <span className="hidden w-56 truncate text-[12px] text-muted md:block">{fitur}</span>
                  <span className="hidden w-20 text-[11.5px] font-bold text-muted uppercase lg:block">{aktif ? biayaEfektif(a, umum) : ""}</span>
                  <span className="hidden w-24 text-right text-[12px] text-faint tabular-nums sm:block">{tanggal(a.created_at)}</span>
                  <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />
                </LinkNiat>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
          <Inbox className="size-6 text-faint" aria-hidden />
          <p className="text-[13px] text-muted">
            {cari ? `Tidak ada aplikasi yang cocok dengan "${cari}".` : filter === "menunggu" ? "Tidak ada pengajuan yang menunggu." : "Belum ada aplikasi di saringan ini."}
          </p>
        </div>
      )}
      {(adaLagi || sp.setelah) && (
        <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-2.5 sm:px-5">
          {sp.setelah && (
            <Link prefetch={false} href={tautan({})} className="btn btn-ghost border border-line">
              Ke awal
            </Link>
          )}
          {adaLagi && terakhir && (
            <Link prefetch={false} href={tautan({ setelah: String(terakhir.id) })} className="btn btn-ghost border border-line">
              Berikutnya
            </Link>
          )}
        </div>
      )}
    </section>
  );
}

/** Tab Sandbox: pengaturan umum + daftar sandbox (indeks parsial, kursor id, 50 per halaman). */
async function Sandbox({ sp }: { sp: SP }) {
  const cari = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const setelah = Number(sp.setelah);
  const [umum, { daftar, adaLagi, jumlah }, api] = await Promise.all([
    pengaturanSandbox(),
    daftarSandbox({ cari, setelah: Number.isInteger(setelah) && setelah > 0 ? setelah : undefined }),
    pengaturanApi(),
  ]);
  const kini = sekarang();
  const terakhir = daftar.at(-1);
  const tautan = (ubah: Record<string, string | undefined>) => {
    const q = new URLSearchParams({ tab: "sandbox" });
    for (const [k, v] of Object.entries({ q: cari || undefined, ...ubah })) if (v) q.set(k, v);
    return `/admin/developer-api?${q}`;
  };
  return (
    <div className="space-y-5">
      <section className="card max-w-3xl p-4 sm:p-5">
        <h2 className="text-[15px] font-bold">Pengaturan sandbox</h2>
        <p className="text-[12.5px] text-muted">
          Sandbox = key <code className="font-mono">cg_test_</code> untuk mencoba API dengan WhatsApp asli: langsung aktif tanpa peninjauan, 1 nomor WA, hanya dengan 1 nomor penguji
          terverifikasi. Resource &amp; kunci AI milik developer, jadi tanpa limit AI. Hanya akun yang punya akses portal.
        </p>
        <div className="mt-4">
          <FormPengaturanSandbox aktif={umum.aktif} hari={umum.hari} port={umum.port} />
        </div>
      </section>
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4 sm:p-5">
          <div>
            <h2 className="text-[15px] font-bold">Daftar sandbox</h2>
            <p className="text-[12.5px] text-muted">{jumlah.toLocaleString("id-ID")} akun memakai sandbox</p>
          </div>
          <form action="/admin/developer-api" className="w-full sm:w-72">
            <input type="hidden" name="tab" value="sandbox" />
            <input name="q" defaultValue={cari} placeholder="Cari email / nama akun" aria-label="Cari sandbox" className="field" />
          </form>
        </div>
        {daftar.length ? (
          <ul className="divide-y divide-line">
            {daftar.map((s) => {
              const habis = (s.sandbox_sampai ?? 0) <= kini;
              return (
                <li key={s.id}>
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 transition-colors hover:bg-subtle/50 sm:px-5">
                      <span className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-4">
                      <span className="block min-w-0 sm:flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-[14px] font-semibold">{s.email}</span>
                          {s.status !== "disetujui" ? (
                            <Pill nada={NADA_STATUS[s.status]}>{LABEL_STATUS_APLIKASI[s.status]}</Pill>
                          ) : habis ? (
                            <Pill nada="merah">Kedaluwarsa</Pill>
                          ) : (
                            <Pill nada="hijau">Aktif</Pill>
                          )}
                        </span>
                        <span className="mt-0.5 block text-[12.5px] text-muted">
                          Nomor penguji {s.uji_diverifikasi ? (s.uji_telepon ? samarkanNomor(s.uji_telepon) : "terverifikasi (LID)") : "belum ada"}
                        </span>
                      </span>
                      {/* HP: di bawah email (email tidak terpotong); layar lebar: kolom kanan. */}
                      <span className="mt-1 block text-[12px] text-muted tabular-nums sm:mt-0 sm:text-right">
                        <span className="block">Berlaku s.d. {s.sandbox_sampai ? tanggal(s.sandbox_sampai) : "-"}</span>
                        <span className="block text-faint">{s.terakhir_menyala ? `Mesin menyala ${tanggal(s.terakhir_menyala)} ${jamWib(s.terakhir_menyala)}` : "Mesin belum pernah menyala"}</span>
                      </span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-faint transition-transform group-open:rotate-90" aria-hidden />
                    </summary>
                    <div className="grid gap-5 border-t border-line bg-subtle/30 px-4 py-4 sm:px-5 lg:grid-cols-2">
                      {s.status === "dicabut" ? (
                        <p className="text-[13px] text-muted">Sandbox ini sudah dicabut permanen.</p>
                      ) : (
                        <>
                          <FormUbahSandbox id={s.id} hari={umum.hari} />
                          <FormStatus id={s.id} status={s.status === "ditangguhkan" ? "ditangguhkan" : "disetujui"} />
                          <FormFiturSandbox id={s.id} khusus={s.fitur_khusus} fitur={s.fitur} global={s.api_fitur ?? api.fitur} />
                        </>
                      )}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="flex flex-col items-center gap-2 px-5 py-12 text-center text-[13px] text-muted">
            <Inbox className="size-6 text-faint" aria-hidden />
            {cari ? "Tidak ada sandbox yang cocok." : "Belum ada akun yang membuat sandbox."}
          </p>
        )}
        {(sp.setelah || adaLagi) && (
          <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-2.5 sm:px-5">
            {sp.setelah && (
              <Link prefetch={false} href={tautan({})} className="btn btn-ghost border border-line">
                Ke awal
              </Link>
            )}
            {adaLagi && terakhir && (
              <Link prefetch={false} href={tautan({ setelah: String(terakhir.id) })} className="btn btn-ghost border border-line">
                Berikutnya
              </Link>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

/** Endpoint per fitur dari sumber dokumentasi yang sama dengan /docs/api (murni, dihitung sekali per proses). */
const ENDPOINT_PER_FITUR: Record<string, EndpointRingkas[]> = {};
for (const e of ENDPOINT_DOK) if (e.fitur) (ENDPOINT_PER_FITUR[e.fitur] ??= []).push({ metode: e.metode, jalur: e.jalur });

/**
 * Tab Fitur: lingkup Global (daftar untuk semua akun) atau Per pengguna (daftar khusus satu akun yang menggantikan
 * global). Per pengguna tanpa `u` = pemilih akun; dengan `u` = form centang akun itu.
 */
async function Fitur({ sp, global }: { sp: SP; global: FiturApi[] }) {
  const lingkup = sp.lingkup === "pengguna" ? "pengguna" : "global";
  const uid = Number(sp.u);
  const [khusus, pemakaian, akun, akses] = await Promise.all([
    daftarFiturKhusus(),
    lingkup === "global" ? pemakaianFitur() : Promise.resolve({}),
    lingkup === "pengguna" && Number.isInteger(uid) && uid > 0 ? akunFitur(uid) : Promise.resolve(undefined),
    lingkup === "pengguna" && !sp.u ? cariAkunAkses({ hanyaAkses: true }) : Promise.resolve(null),
  ]);
  let isi: React.ReactNode;
  if (lingkup === "global") {
    isi = <FormFiturGlobal dibagikan={global} pemakaian={pemakaian} endpoint={ENDPOINT_PER_FITUR} />;
  } else if (sp.u) {
    isi = (
      <div className="space-y-3">
        <Link prefetch={false} href="/admin/developer-api?tab=fitur&lingkup=pengguna" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-fg">
          <ArrowLeft className="size-4" aria-hidden />
          Semua pengguna
        </Link>
        {akun ? (
          <FormFiturGlobal
            key={akun.id}
            dibagikan={akun.fitur ?? global}
            pemakaian={{}}
            endpoint={ENDPOINT_PER_FITUR}
            pengguna={{ id: akun.id, email: akun.email, nama: akun.nama, akses_api: akun.akses_api, khusus: akun.fitur !== null, global }}
          />
        ) : (
          <p className="card px-5 py-10 text-center text-[13px] text-muted">Akun tidak ditemukan.</p>
        )}
      </div>
    );
  } else {
    // Akun yang diatur khusus dulu, lalu akun dengan akses portal yang belum ada di daftar itu.
    const awal: BarisPenggunaFitur[] = khusus.daftar.map((k) => ({ id: k.id, email: k.email, nama: k.nama, akses_api: true, fitur_khusus: k.fitur.length }));
    const ada = new Set(awal.map((a) => a.id));
    for (const a of akses?.daftar ?? []) {
      if (ada.has(a.id)) {
        const x = awal.find((b) => b.id === a.id)!;
        x.akses_api = a.akses_api;
      } else awal.push({ id: a.id, email: a.email, nama: a.nama, akses_api: a.akses_api, fitur_khusus: a.fitur_khusus });
    }
    isi = <PilihPenggunaFitur awal={awal} total={FITUR_API.length} global={global.length} />;
  }
  return (
    <div className="space-y-4">
      <LingkupFitur lingkup={lingkup} jumlahKhusus={khusus.jumlah} />
      {isi}
    </div>
  );
}

async function Pengaturan() {
  const umum = await pengaturanApi();
  return (
    <section className="card max-w-3xl p-4 sm:p-5">
      <h2 className="text-[15px] font-bold">Pengaturan umum</h2>
      <p className="text-[12.5px] text-muted">
        Biaya bawaan untuk semua aplikasi; pengaturan per aplikasi mengalahkannya. Fitur yang dibagikan diatur di tab{" "}
        <Link prefetch={false} href="/admin/developer-api?tab=fitur" className="font-semibold text-accent hover:underline">
          Fitur
        </Link>
        .
      </p>
      <div className="mt-4">
        <FormPengaturanApi biaya={umum.biaya} harga={umum.harga} />
      </div>
    </section>
  );
}
