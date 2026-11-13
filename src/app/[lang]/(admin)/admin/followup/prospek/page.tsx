import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { CheckCheck, Flame, ShieldCheck, Sun } from "lucide-react";
import { sekarang } from "@/lib/db";
import { formatNomor, waktuSingkatWib } from "@/lib/format";
import { statusMesinFollowup } from "@/lib/followup";
import { LABEL_ACK, LABEL_STATUS_PROSPEK, type BarisProspek, type StatusProspek } from "@/lib/followup-def";
import { daftarProspek, statusMesinProspek } from "@/lib/followup-prospek";
import { MEREK } from "@/lib/merek";
import { semuaNomor } from "@/lib/numbers";
import { requireStaf } from "@/lib/session";
import { nomorSinkronCg } from "@/lib/sinkron-cg";
import { TabFollowup } from "../tab-followup";
import { FormProspek } from "./form-prospek";
import { PratinjauProspek } from "./pratinjau-prospek";

export const metadata: Metadata = { title: `Follow-up prospek · Admin · ${MEREK}` };

const URUTAN: StatusProspek[] = ["jalan", "dibalas", "selesai", "stop", "batal", "gagal"];

const NADA: Record<StatusProspek, string> = {
  jalan: "bg-accent-soft text-accent",
  dibalas: "bg-success-soft text-success",
  selesai: "bg-subtle text-muted",
  batal: "bg-subtle text-faint",
  stop: "bg-warning-soft text-warning",
  gagal: "bg-danger-soft text-danger",
};

const TEKNIK = [
  { judul: "Pesan 1 · Lanjutan", isi: "Melanjutkan pertanyaan terakhirnya, memberi satu hal berguna (balas budi), menjawab keberatan sebelum terucap, ditutup pertanyaan ya/tidak." },
  { judul: "Pesan 2 · Nilai & bukti", isi: "Kerugian kalau chat pelanggan telat dibalas, harga dipecah per hari, bukti sosial dari data nyata, ajakan tegas." },
  { judul: "Pesan 3 · Pamit", isi: "Pesan terakhir tanpa tekanan + jaminan uang kembali; pintu tetap terbuka." },
  { judul: "Lead panas", isi: "Langsung ke penutupan: paket yang cocok, cara bayar, satu tautan langganan." },
];

const ATURAN = [
  "Hanya orang yang chat duluan ke nomor CS, dinilai prospek Hangat/Panas, sudah dijawab, lalu diam.",
  "Paling banyak 3 pesan per siklus, berhenti begitu dibalas. Siklus baru hanya bila ia chat lagi.",
  "Fakta diperiksa otomatis: tanpa promo/batas waktu palsu, testimoni karangan, atau harga di luar data.",
  "Tidak menyentuh pelanggan berlangganan, chat spam/dibisukan, atau yang minta berhenti.",
  "Pesan berikutnya tidak dikirim bila pesan sebelumnya centang satu. Jam, batas harian, dan rem bersama.",
];

async function Mesin() {
  await requireStaf();
  const [m, akun, semua, cg] = await Promise.all([statusMesinProspek(), statusMesinFollowup(), semuaNomor(), nomorSinkronCg()]);
  const cgSet = new Set(cg);
  const pilihan = semua.filter((n) => n.wa_id || cgSet.has(n.id)).map((n) => ({ id: n.id, label: n.label, wa_id: n.wa_id, cg: cgSet.has(n.id) }));
  const persen = (a: number, b: number): string => (b ? `${Math.round((a / b) * 100)}%` : "–");
  const jalan = m.setelan.aktif && !akun.rem && !!akun.nomor?.terhubung;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kotak
          judul="Status"
          isi={jalan ? "Berjalan" : akun.rem ? "Direm" : m.setelan.aktif ? "Tertahan" : "Mati"}
          catatan={akun.nomor ? `Nomor CS: ${akun.nomor.label} · ${akun.nomor.terhubung ? "terhubung" : "TIDAK terhubung"}` : "Nomor CS belum diatur"}
        />
        <Kotak judul="Terkirim hari ini" isi={`${akun.kirimHariIni} / ${akun.setelan.batasHarian}`} catatan="Gabungan dengan follow-up akun" />
        <Kotak judul="Dibalas" isi={persen(m.dibalas, m.terkirim)} catatan={`${m.dibalas} dari ${m.terkirim} lead yang di-follow-up`} />
        <Kotak judul="Jadi berlangganan" isi={String(m.berlangganan)} catatan={`${m.hitung.jalan ?? 0} siklus berjalan · ${m.hitung.stop ?? 0} minta berhenti`} />
      </div>
      <section className="card p-5 sm:p-6">
        <h2 className="text-[15px] font-bold">Pengaturan</h2>
        <div className="mt-4">
          <FormProspek awal={m.setelan} nomor={pilihan} nomorId={akun.setelan.nomorId} otomatisId={akun.setelan.nomorId ? null : (cg[0] ?? null)} />
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

function Minat({ minat }: { minat: number }) {
  return minat >= 2 ? (
    <span className="inline-flex items-center gap-1 rounded-md bg-danger-soft px-1.5 py-0.5 text-[11px] font-semibold text-danger">
      <Flame className="size-3" aria-hidden /> Panas
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-md bg-warning-soft px-1.5 py-0.5 text-[11px] font-semibold text-warning">
      <Sun className="size-3" aria-hidden /> Hangat
    </span>
  );
}

async function Riwayat({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaf();
  const sp = await searchParams;
  const mentah = typeof sp.status === "string" ? sp.status : "";
  const status = (URUTAN as string[]).includes(mentah) ? (mentah as StatusProspek) : null;
  const baris: BarisProspek[] = await daftarProspek({ status, batas: 100 });
  const kini = sekarang();
  return (
    <section className="card overflow-hidden">
      <div className="space-y-3 border-b border-line p-4 sm:p-5">
        <div>
          <h2 className="text-[15px] font-bold">Riwayat follow-up prospek</h2>
          <p className="text-[13px] text-muted">100 terbaru. Buka &ldquo;Pesan&rdquo; untuk melihat, mengedit, atau menulis ulang pesan berikutnya sebelum terkirim.</p>
        </div>
        <nav aria-label="Saring status" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-0">
          <Saring href="/admin/followup/prospek" aktif={!status} label="Semua" />
          {URUTAN.map((s) => (
            <Saring key={s} href={`/admin/followup/prospek?status=${s}`} aktif={status === s} label={LABEL_STATUS_PROSPEK[s]} />
          ))}
        </nav>
      </div>
      {baris.length === 0 ? (
        <p className="px-5 py-10 text-center text-[13px] text-muted">
          Belum ada follow-up prospek{status ? ` berstatus "${LABEL_STATUS_PROSPEK[status]}"` : ""}. Lead yang chat duluan lalu diam akan muncul di sini.
        </p>
      ) : (
        <ul data-analitik-privat className="divide-y divide-line">
          {baris.map((b) => {
            const terkirim = [b.pesan1, b.pesan2, b.pesan3].filter((x): x is string => !!x);
            const berjalan = b.status === "jalan";
            const centang = [
              { ack: b.ack1, pada: b.terkirim1 },
              { ack: b.ack2, pada: b.terkirim2 },
              { ack: b.ack3, pada: b.terkirim3 },
            ].filter((c) => c.pada);
            return (
              <li key={b.kunci} className="space-y-2.5 px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold">
                      <span className="truncate">{b.nama || "(tanpa nama)"}</span>
                      <Minat minat={b.minat} />
                    </p>
                    <p className="text-[12.5px] text-muted tabular-nums">{b.tujuan ? formatNomor(b.tujuan) : "nomor tersembunyi"}</p>
                  </div>
                  <div className="text-right">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap ${NADA[b.status]}`}>{LABEL_STATUS_PROSPEK[b.status]}</span>
                    {berjalan && (
                      <span className="mt-1 block text-[11.5px] text-muted">
                        pesan {b.tahap + 1} {b.jadwal > kini ? waktuSingkatWib(b.jadwal) : "jatuh tempo"}
                      </span>
                    )}
                    {b.dibalas && <span className="mt-1 block text-[11.5px] text-success">dibalas {waktuSingkatWib(b.dibalas)}</span>}
                  </div>
                </div>
                {centang.length > 0 && (
                  <p className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
                    {centang.map((c, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5">
                        Pesan {i + 1} <Centang ack={c.ack} pada={c.pada} />
                      </span>
                    ))}
                  </p>
                )}
                {b.alasan && <p className="text-[12px] text-muted">{b.alasan}</p>}
                <details className="rounded-xl border border-line bg-subtle/40 px-3.5 py-2" open={berjalan && !!b.draf}>
                  <summary data-analitik="Lihat pesan follow-up prospek" className="flex min-h-9 cursor-pointer items-center text-[12.5px] font-semibold text-accent select-none">
                    Pesan{berjalan && !b.draf && <span className="ml-1 font-normal text-muted">· draf belum disiapkan</span>}
                  </summary>
                  <div className="pt-2 pb-1">
                    <PratinjauProspek kunci={b.kunci} terkirim={terkirim} berjalan={berjalan} tahapBerikut={b.tahap + 1} draf={b.draf} />
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Saring({ href, aktif, label }: { href: string; aktif: boolean; label: string }) {
  return (
    <Link
      prefetch={false}
      href={href}
      aria-current={aktif ? "page" : undefined}
      className={`shrink-0 rounded-lg border px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap transition-colors ${aktif ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:bg-subtle hover:text-fg"}`}
    >
      {label}
    </Link>
  );
}

export default function HalamanFollowupProspek(props: PageProps<"/[lang]/admin/followup/prospek">) {
  return (
    <div className="space-y-6 lg:space-y-8">
      <div>
        <p className="text-[11.5px] font-semibold tracking-[0.08em] text-accent uppercase">Panel admin</p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-[28px]">Follow-up WhatsApp</h1>
        <p className="mt-1 max-w-2xl text-muted">
          Nomor CS {MEREK} membujuk lagi calon pelanggan yang sudah tanya harga atau siap bayar tetapi berhenti membalas. Pesan ditulis AI per orang dari isi chat-nya.
        </p>
      </div>
      <TabFollowup aktif="prospek" />
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Suspense fallback={<div aria-hidden className="card h-[520px] animate-denyut" />}>
          <Mesin />
        </Suspense>
        <div className="space-y-6">
          <section className="card p-5 sm:p-6">
            <h2 className="text-[15px] font-bold">Teknik tiap pesan</h2>
            <ul className="mt-3.5 space-y-3 text-[12.5px]">
              {TEKNIK.map((x) => (
                <li key={x.judul}>
                  <p className="font-semibold text-fg">{x.judul}</p>
                  <p className="text-muted">{x.isi}</p>
                </li>
              ))}
            </ul>
          </section>
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
      </div>
      <Suspense fallback={<div aria-hidden className="card h-[420px] animate-denyut" />}>
        <Riwayat searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
