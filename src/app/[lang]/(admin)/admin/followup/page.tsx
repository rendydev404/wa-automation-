import { Fragment, Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { CheckCheck, MessageCircleWarning, ShieldCheck } from "lucide-react";
import { formatNomor, waktuSingkatWib } from "@/lib/format";
import { daftarFollowup, statusMesinFollowup } from "@/lib/followup";
import { type BarisFollowup, LABEL_ACK, LABEL_STATUS, type StatusFollowup } from "@/lib/followup-def";
import { MEREK } from "@/lib/merek";
import { semuaNomor } from "@/lib/numbers";
import { requireAdmin } from "@/lib/session";
import { nomorSinkronCg } from "@/lib/sinkron-cg";
import { sekarang } from "@/lib/db";
import { FormFollowup, LepasRem } from "./form-followup";
import { PratinjauPesan } from "./pratinjau";

export const metadata: Metadata = { title: `Follow-up WA · Admin · ${MEREK}` };

const URUTAN: StatusFollowup[] = ["antre", "terkirim", "dibalas", "selesai", "stop", "batal", "gagal"];

const NADA: Record<StatusFollowup, string> = {
  antre: "bg-subtle text-muted",
  terkirim: "bg-accent-soft text-accent",
  dibalas: "bg-success-soft text-success",
  selesai: "bg-subtle text-muted",
  batal: "bg-subtle text-faint",
  stop: "bg-warning-soft text-warning",
  gagal: "bg-danger-soft text-danger",
};

const ATURAN = [
  "Hanya ke orang yang sudah pernah chat nomor CS (nomor scan, nomor \"teruskan ke\", isian admin, atau kode akun dari tombol Chat CS).",
  "Paling banyak 2 pesan per akun: sapaan, lalu satu pengingat bila tidak dibalas. Setelah itu berhenti selamanya.",
  "Jam kerja WIB, batas per hari, jeda acak 3–10 menit, teks ditulis AI per orang, tanpa tautan.",
  "Ritme manusia: online, mengetik sewajarnya, kirim, offline. Balasan dibaca (centang biru) lalu dijawab AI CS.",
  "Balasan \"stop / jangan hubungi\" dicatat permanen. Banyak centang satu = rem otomatis + notifikasi admin.",
];

async function Mesin() {
  await requireAdmin();
  const [m, semua, cg] = await Promise.all([statusMesinFollowup(), semuaNomor(), nomorSinkronCg()]);
  const cgSet = new Set(cg);
  const pilihan = semua.filter((n) => n.wa_id || cgSet.has(n.id)).map((n) => ({ id: n.id, label: n.label, wa_id: n.wa_id, cg: cgSet.has(n.id) }));
  const jalan = m.setelan.aktif && !m.rem && !!m.nomor?.terhubung;
  return (
    <div className="space-y-6">
      {m.rem && (
        <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-danger/40 bg-danger-soft px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <MessageCircleWarning className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
            <div className="text-[13px]">
              <p className="font-bold text-fg">Rem otomatis aktif sejak {waktuSingkatWib(m.rem.pada)}</p>
              <p className="text-muted">{m.rem.alasan} Periksa nomor CS (masih bisa mengirim? ada peringatan dari WhatsApp?) sebelum melanjutkan.</p>
            </div>
          </div>
          <LepasRem />
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kotak judul="Status" isi={jalan ? "Berjalan" : m.rem ? "Direm" : m.setelan.aktif ? "Tertahan" : "Mati"} catatan={m.nomor ? `${m.nomor.label} · ${m.nomor.terhubung ? "terhubung" : "TIDAK terhubung"}` : "Nomor CS belum diatur"} />
        <Kotak judul="Terkirim hari ini" isi={`${m.kirimHariIni} / ${m.setelan.batasHarian}`} catatan={`Jam kirim ${m.setelan.jamMulai}.00–${m.setelan.jamSelesai}.00 WIB`} />
        <Kotak judul="Dalam antrean" isi={String(m.hitung.antre ?? 0)} catatan={`${m.hitung.terkirim ?? 0} menunggu balasan`} />
        <Kotak judul="Dibalas" isi={String(m.hitung.dibalas ?? 0)} catatan={`${m.hitung.stop ?? 0} minta berhenti`} />
      </div>
      <section className="card p-5 sm:p-6">
        <h2 className="text-[15px] font-bold">Pengaturan</h2>
        <div className="mt-4">
          <FormFollowup awal={m.setelan} nomor={pilihan} otomatisId={m.setelan.nomorId ? null : (cg[0] ?? null)} />
        </div>
      </section>
    </div>
  );
}

function Kotak({ judul, isi, catatan }: { judul: string; isi: string; catatan: string }) {
  return (
    <div className="card p-4">
      <p className="text-[12px] font-semibold text-muted">{judul}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">{isi}</p>
      <p className="mt-0.5 truncate text-[12px] text-muted">{catatan}</p>
    </div>
  );
}

function Centang({ ack, pada }: { ack: number; pada: number | null }) {
  if (!pada) return <span className="text-faint">–</span>;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap" title={LABEL_ACK[Math.min(4, ack)]}>
      <CheckCheck className={`size-3.5 ${ack >= 4 ? "text-sky-500" : ack >= 3 ? "text-muted" : "text-faint"}`} aria-hidden />
      <span className="tabular-nums">{waktuSingkatWib(pada)}</span>
      <span className="sr-only">{LABEL_ACK[Math.min(4, ack)]}</span>
    </span>
  );
}

async function Riwayat({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const mentah = typeof sp.status === "string" ? sp.status : "";
  const status = (URUTAN as string[]).includes(mentah) ? (mentah as StatusFollowup) : null;
  const baris: BarisFollowup[] = await daftarFollowup({ status, batas: 100 });
  const kini = sekarang();
  const kosong = `Belum ada follow-up${status ? ` berstatus "${LABEL_STATUS[status]}"` : ""}.`;
  return (
    <section className="card overflow-hidden">
      <div className="space-y-3 border-b border-line p-4 sm:p-5">
        <div>
          <h2 className="text-[15px] font-bold">Riwayat follow-up</h2>
          <p className="text-[13px] text-muted">100 terbaru. Buka &ldquo;Pesan&rdquo; untuk melihat, mengedit, atau menulis ulang pesan sebelum terkirim. Centang abu = sampai HP, biru = dibaca.</p>
        </div>
        {/* HP: satu baris yang bisa digeser, tidak menumpuk jadi beberapa baris. */}
        <nav aria-label="Saring status" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-0">
          <Saring href="/admin/followup" aktif={!status} label="Semua" />
          {URUTAN.map((s) => (
            <Saring key={s} href={`/admin/followup?status=${s}`} aktif={status === s} label={LABEL_STATUS[s]} />
          ))}
        </nav>
      </div>

      {baris.length === 0 ? (
        <p className="px-5 py-10 text-center text-[13px] text-muted">{kosong}</p>
      ) : (
        <>
          {/* HP & tablet: kartu per akun. */}
          <ul data-analitik-privat className="divide-y divide-line lg:hidden">
            {baris.map((b) => (
              <li key={b.user_id} className="space-y-2.5 px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/admin/pengguna/${b.user_id}`} data-analitik="Buka pengguna" className="block truncate text-[13.5px] font-semibold hover:text-accent hover:underline">
                      {b.nama_akun || "(tanpa nama)"}
                    </Link>
                    <span className="block truncate text-[12.5px] text-muted">{b.email}</span>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap ${NADA[b.status]}`}>{LABEL_STATUS[b.status]}</span>
                </div>
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[12.5px]">
                  <dt className="text-muted">Chat CS</dt>
                  <dd className="min-w-0 truncate">{b.tujuan || b.nama ? `${b.nama || "-"} · ${b.tujuan ? formatNomor(b.tujuan) : "nomor tersembunyi"}` : <span className="text-faint">belum ada</span>}</dd>
                  {b.status === "antre" && (
                    <>
                      <dt className="text-muted">Jadwal</dt>
                      <dd>{b.jadwal > kini ? waktuSingkatWib(b.jadwal) : "jatuh tempo"}</dd>
                    </>
                  )}
                  {b.terkirim1 && (
                    <>
                      <dt className="text-muted">Sapaan</dt>
                      <dd><Centang ack={b.ack1} pada={b.terkirim1} /></dd>
                    </>
                  )}
                  {(b.terkirim2 || b.status === "terkirim") && (
                    <>
                      <dt className="text-muted">Pengingat</dt>
                      <dd>{b.terkirim2 ? <Centang ack={b.ack2} pada={b.terkirim2} /> : waktuSingkatWib(b.jadwal)}</dd>
                    </>
                  )}
                  {b.dibalas && (
                    <>
                      <dt className="text-muted">Dibalas</dt>
                      <dd className="text-success">{waktuSingkatWib(b.dibalas)}</dd>
                    </>
                  )}
                </dl>
                {b.alasan && <p className="text-[12px] text-muted">{b.alasan}</p>}
                <KotakPesan b={b} />
              </li>
            ))}
          </ul>

          {/* Layar lebar: tabel. */}
          <div className="hidden lg:block">
            <table className="w-full text-left text-[12.5px]">
              <thead className="bg-subtle/60 text-[11.5px] font-semibold tracking-[0.04em] text-muted uppercase">
                <tr>
                  <th className="px-5 py-2.5">Akun</th>
                  <th className="px-3 py-2.5">Chat CS</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Sapaan</th>
                  <th className="px-3 py-2.5">Pengingat</th>
                  <th className="px-5 py-2.5">Keterangan</th>
                </tr>
              </thead>
              <tbody data-analitik-privat className="divide-y divide-line">
                {baris.map((b) => (
                  <Fragment key={b.user_id}>
                    <tr className="align-top">
                      <td className="max-w-[240px] px-5 py-3">
                        <Link href={`/admin/pengguna/${b.user_id}`} data-analitik="Buka pengguna" className="block truncate font-semibold hover:text-accent hover:underline">
                          {b.nama_akun || "(tanpa nama)"}
                        </Link>
                        <span className="block truncate text-muted">{b.email}</span>
                      </td>
                      <td className="px-3 py-3">
                        {b.tujuan || b.nama ? (
                          <>
                            <span className="block font-medium">{b.nama || "-"}</span>
                            <span className="block text-muted tabular-nums">{b.tujuan ? formatNomor(b.tujuan) : "nomor tersembunyi"}</span>
                          </>
                        ) : (
                          <span className="text-faint">–</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap ${NADA[b.status]}`}>{LABEL_STATUS[b.status]}</span>
                        {b.status === "antre" && <span className="mt-1 block text-[11.5px] text-muted">{b.jadwal > kini ? `mulai ${waktuSingkatWib(b.jadwal)}` : "jatuh tempo"}</span>}
                        {b.dibalas && <span className="mt-1 block text-[11.5px] text-success">dibalas {waktuSingkatWib(b.dibalas)}</span>}
                      </td>
                      <td className="px-3 py-3">
                        <Centang ack={b.ack1} pada={b.terkirim1} />
                      </td>
                      <td className="px-3 py-3">
                        {b.terkirim2 ? <Centang ack={b.ack2} pada={b.terkirim2} /> : b.status === "terkirim" ? <span className="text-muted">{waktuSingkatWib(b.jadwal)}</span> : <span className="text-faint">–</span>}
                      </td>
                      <td className="max-w-[280px] px-5 py-3 text-muted">{b.alasan ?? "–"}</td>
                    </tr>
                    <tr className="!border-t-0">
                      <td colSpan={6} className="px-5 pb-3">
                        <KotakPesan b={b} />
                      </td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

/** Lipatan "Pesan": draf / teks terkirim + edit & tulis ulang. Terbuka sendiri bila ada draf yang akan dikirim. */
function KotakPesan({ b }: { b: BarisFollowup }) {
  const ubah = ubahPesan(b);
  const draf = ubah === 1 ? b.pesan1 : ubah === 2 ? b.pesan2 : null;
  return (
    <details className="rounded-xl border border-line bg-subtle/40 px-3.5 py-2" open={ubah !== null && !!draf}>
      <summary data-analitik="Lihat pesan follow-up" className="flex min-h-9 cursor-pointer items-center text-[12.5px] font-semibold text-accent select-none">
        Pesan {ubah === 1 ? "sapaan" : ubah === 2 ? "pengingat" : "terkirim"}
        {ubah && !draf && <span className="ml-1 font-normal text-muted">· draf belum disiapkan</span>}
      </summary>
      <div className="pt-2 pb-1">
        <PratinjauPesan userId={b.user_id} pesan1={b.pesan1} pesan2={b.pesan2} ubah={ubah} />
      </div>
    </details>
  );
}

/** Pesan yang masih bisa diubah admin: 1 = sapaan belum terkirim, 2 = pengingat menunggu, null = sudah final. */
const ubahPesan = (b: BarisFollowup): 1 | 2 | null => (b.status === "antre" && b.tahap === 0 ? 1 : b.status === "terkirim" && b.tahap === 1 ? 2 : null);

function Saring({ href, aktif, label }: { href: string; aktif: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={aktif ? "page" : undefined}
      className={`shrink-0 rounded-lg border px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap transition-colors ${aktif ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:bg-subtle hover:text-fg"}`}
    >
      {label}
    </Link>
  );
}

export default function HalamanFollowup(props: PageProps<"/[lang]/admin/followup">) {
  return (
    <div className="space-y-6 lg:space-y-8">
      <div>
        <p className="text-[11.5px] font-semibold tracking-[0.08em] text-accent uppercase">Panel admin</p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-[28px]">Follow-up WhatsApp</h1>
        <p className="mt-1 max-w-2xl text-muted">
          Nomor CS {MEREK} menyapa pemilik akun gratis yang kuota balasan AI-nya habis, dengan aturan ketat supaya nomor CS tidak diblokir WhatsApp.
        </p>
      </div>
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Suspense fallback={<div aria-hidden className="card h-[560px] animate-denyut" />}>
          <Mesin />
        </Suspense>
        <section className="card p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-[15px] font-bold">
            <ShieldCheck className="size-4 text-accent" aria-hidden /> Aturan anti-blokir
          </h2>
          <ul className="mt-3.5 space-y-2.5 text-[12.5px] text-muted">
            {ATURAN.map((a) => (
              <li key={a} className="flex gap-2">
                <CheckCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <Suspense fallback={<div aria-hidden className="card h-[420px] animate-denyut" />}>
        <Riwayat searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
