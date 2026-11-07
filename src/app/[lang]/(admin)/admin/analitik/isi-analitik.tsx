import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ChartNoAxesColumn, ChevronRight, Eye, FileText, Footprints, MousePointerClick, UserRound, Users, Zap } from "lucide-react";
import { Delta, KartuStat, KartuUtama, Sparkline } from "@/components/stat";
import { type BarisTop, type PenggunaAktif, type RingkasanAnalitik, ringkasanAnalitik } from "@/lib/analitik";
import { PERIODE_ANALITIK, RETENSI_HARI } from "@/lib/analitik-def";
import { namaFitur } from "@/lib/analitik-fitur";
import { namaHalaman } from "@/lib/analitik-nama";
import { angka, angkaRingkas, waktuSingkatWib } from "@/lib/format";
import { type BarisPengguna, penggunaById } from "@/lib/pengguna";
import { requireAdmin } from "@/lib/session";
import { GrafikHarian, type TitikGrafik } from "./grafik-harian";

/**
 * Isi halaman /admin/analitik. Semua angka dari ringkasanAnalitik() (agregasi di SQL); halaman ini hanya menata.
 * Parameter URL: hari (7|30|90, bawaan 30), pengguna (id akun: mode per pengguna), admin=1 (sertakan akun admin).
 */

type Periode = (typeof PERIODE_ANALITIK)[number];
const HARI_BAWAAN: Periode = 30;
/** Baris yang langsung terlihat per daftar teratas; sisanya (sampai 15) di balik "Tampilkan lainnya". */
const TAMPIL_AWAL = 8;

interface Param {
  hari: Periode;
  pengguna: number | null;
  admin: boolean;
}

const satu = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function bacaParam(sp: Record<string, string | string[] | undefined>): Param {
  const h = Number(satu(sp.hari));
  const id = Number(satu(sp.pengguna));
  return {
    hari: PERIODE_ANALITIK.find((p) => p === h) ?? HARI_BAWAAN,
    pengguna: Number.isSafeInteger(id) && id > 0 && id <= 2_147_483_647 ? id : null,
    admin: satu(sp.admin) === "1",
  };
}

/** Tautan ke halaman ini dengan parameter yang diubah; nilai bawaan tidak ditulis supaya URL tetap pendek. */
function tautan(p: Param, ubah: Partial<Param> = {}): string {
  const x = { ...p, ...ubah };
  const q = new URLSearchParams();
  if (x.hari !== HARI_BAWAAN) q.set("hari", String(x.hari));
  if (x.pengguna) q.set("pengguna", String(x.pengguna));
  if (x.admin) q.set("admin", "1");
  const s = q.toString();
  return s ? `/admin/analitik?${s}` : "/admin/analitik";
}

const fmtTgl = new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
const fmtTglPendek = new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", day: "numeric", month: "short" });
const HARI_MS = 86_400_000;

/** Rentang tanggal kunci 'YYYY-MM-DD' -> "9 Okt – 7 Nov 2026" (tahun awal ditulis bila berbeda). */
function rentang(awal: string, akhir: string): string {
  const a = new Date(`${awal}T00:00:00Z`);
  const b = new Date(`${akhir}T00:00:00Z`);
  return `${a.getUTCFullYear() === b.getUTCFullYear() ? fmtTglPendek.format(a) : fmtTgl.format(a)} – ${fmtTgl.format(b)}`;
}

/** Periode pembanding: jumlah hari yang sama tepat sebelum `awal`. */
function rentangLalu(awal: string, hari: number): string {
  const a = Date.parse(`${awal}T00:00:00Z`);
  const kunci = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return rentang(kunci(a - hari * HARI_MS), kunci(a - HARI_MS));
}

const desimal = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 1 });
const kapital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Label klik khusus dari pelacak (instrumentation-client.ts) -> teks ramah untuk admin. */
const LABEL_KHUSUS: Record<string, string> = {
  "(isi privat)": "Elemen berisi data pelanggan (label disamarkan)",
  "(tanpa label)": "Elemen tanpa teks/label",
};
const namaKlik = (label: string) => LABEL_KHUSUS[label] ?? (label || LABEL_KHUSUS["(tanpa label)"]);

const fmtHari = new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", weekday: "short" });
const fmtHariPanjang = new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", weekday: "long", day: "numeric", month: "short", year: "numeric" });

/** Label tanggal untuk grafik, dibuat di server supaya teks server & peramban identik saat hidrasi. */
const labelGrafik = (harian: RingkasanAnalitik["harian"]): TitikGrafik[] =>
  harian.map((t) => {
    const d = new Date(`${t.tanggal}T00:00:00Z`);
    return { ...t, pendek: fmtHari.format(d).replace(".", ""), panjang: fmtHariPanjang.format(d), tglBulan: fmtTglPendek.format(d) };
  });

export async function IsiAnalitik({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [, sp] = await Promise.all([requireAdmin(), searchParams]);
  const p = bacaParam(sp);
  // Mode per pengguna selalu menyertakan admin: akun yang dipilih sendiri bisa saja akun admin.
  const [r, akun] = await Promise.all([
    ringkasanAnalitik({ hari: p.hari, userId: p.pengguna, sertakanAdmin: p.pengguna ? true : p.admin }),
    p.pengguna ? penggunaById(p.pengguna) : undefined,
  ]);
  const perPengguna = p.pengguna !== null;
  // Kosong = tidak ada satu baris pun pada periode ini. Dicek dari daftar teratas (mencakup semua baris tiap jenis,
  // termasuk klik anonim), bukan dari total: total halaman/klik/fitur tidak menghitung anonim dan anonim hanya kunjungan.
  const kosong = r.halaman.length + r.klik.length + r.fitur.length === 0;
  const awal = r.hari[0];
  const akhir = r.hari.at(-1);

  return (
    <div className="space-y-4 lg:space-y-6">
      {perPengguna && <KepalaPengguna p={p} akun={akun} />}

      {/* Satu baris saringan di atas semua yang disaringnya. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <nav aria-label="Pilih periode" className="flex gap-1 rounded-xl bg-subtle p-1 sm:self-start">
            {PERIODE_ANALITIK.map((h) => (
              <Link
                key={h}
                href={tautan(p, { hari: h })}
                aria-current={p.hari === h ? "page" : undefined}
                className={`inline-flex min-h-9 flex-1 items-center justify-center rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold whitespace-nowrap transition-colors sm:flex-none ${p.hari === h ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg"}`}
              >
                {h} hari
              </Link>
            ))}
          </nav>
          {awal && akhir && (
            <p className="text-[12.5px] text-muted">
              <span className="font-semibold text-fg">{rentang(awal, akhir)}</span>
              <span className="text-faint"> · dibanding {rentangLalu(awal, p.hari)}</span>
            </p>
          )}
        </div>
        {!perPengguna && <SakelarAdmin p={p} />}
      </div>

      {kosong ? (
        <Kosong p={p} perPengguna={perPengguna} r={r} />
      ) : (
        <>
          <KartuAngka r={r} hari={p.hari} perPengguna={perPengguna} />
          <GrafikHarian titik={labelGrafik(r.harian)} judul={`Aktivitas harian · ${p.hari} hari`} perPengguna={perPengguna} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6 xl:grid-cols-3">
            <DaftarTop
              id="halaman"
              judul="Halaman terpopuler"
              ikon={<FileText className="size-4" aria-hidden />}
              satuan="kunjungan"
              baris={r.halaman}
              perPengguna={perPengguna}
              nama={(b) => namaHalaman(b.kunci)}
              sub={(b) => <code className="font-mono text-[11px]">{b.kunci}</code>}
              kosong="Belum ada kunjungan halaman tercatat."
            />
            <DaftarTop
              id="klik"
              judul="Klik terpopuler"
              ikon={<MousePointerClick className="size-4" aria-hidden />}
              satuan="klik"
              baris={r.klik}
              perPengguna={perPengguna}
              nama={(b) => namaKlik(b.label)}
              sub={(b) => <>di {namaHalaman(b.kunci)}</>}
              kosong="Belum ada klik tercatat."
            />
            <DaftarTop
              id="fitur"
              className="lg:col-span-2 xl:col-span-1"
              judul="Fitur terpopuler"
              ikon={<Zap className="size-4" aria-hidden />}
              satuan="kali"
              baris={r.fitur}
              perPengguna={perPengguna}
              nama={(b) => namaFitur(b.kunci)}
              sub={(b) => (namaFitur(b.kunci) === b.kunci ? "belum ada nama ramah" : <code className="font-mono text-[11px]">{b.kunci}</code>)}
              kosong="Belum ada pemakaian fitur tercatat (disimpan saat aksi di server berhasil)."
            />
          </div>
          {!perPengguna && <PenggunaTeraktif p={p} daftar={r.pengguna} />}
        </>
      )}

      <p className="text-[11.5px] text-faint">
        Tanggal menurut WIB; angka {p.hari} hari terakhir dibanding {p.hari} hari sebelumnya. Kunjungan & klik dikirim browser berkelompok, pemakaian fitur dicatat
        server saat aksi berhasil, jadi angka bisa tertinggal beberapa detik. Teks yang diketik dan isi data pelanggan tidak direkam; email & nomor di label
        disamarkan. Pengunjung anonim (belum login) hanya dicatat di halaman publik, dihitung terpisah, dan ikut di daftar halaman & klik.
        {!perPengguna && (p.admin ? " Akun admin disertakan." : " Akun admin tidak dihitung.")} Data disimpan {RETENSI_HARI} hari.
      </p>
    </div>
  );
}

/** Sakelar "sertakan akun admin" berupa tautan (tanpa JavaScript); keadaannya tertulis untuk pembaca layar. */
function SakelarAdmin({ p }: { p: Param }) {
  return (
    <Link
      href={tautan(p, { admin: !p.admin })}
      data-analitik="Sakelar sertakan akun admin"
      className="group inline-flex min-h-9 items-center gap-2.5 self-start rounded-xl px-1 py-1 text-[12.5px] font-semibold text-muted transition-colors hover:text-fg sm:self-auto"
    >
      <span aria-hidden className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${p.admin ? "bg-accent" : "bg-line-strong"}`}>
        <span className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-surface shadow-card transition-transform ${p.admin ? "translate-x-4" : ""}`} />
      </span>
      Sertakan akun admin
      <span className="sr-only">{p.admin ? "(sekarang disertakan; buka untuk mengecualikan)" : "(sekarang tidak disertakan; buka untuk menyertakan)"}</span>
    </Link>
  );
}

/** Kepala mode per pengguna: siapa yang sedang dilihat + jalan ke halaman kelola akun dan kembali ke semua. */
function KepalaPengguna({ p, akun }: { p: Param; akun: BarisPengguna | undefined }) {
  const id = p.pengguna!;
  return (
    <section aria-label="Akun yang dilihat" className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="flex min-w-0 items-center gap-3.5">
        <span className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-ink text-lg font-bold text-ink-signal uppercase">
          <span aria-hidden className="kisi-tinta absolute inset-0" />
          {akun ? <span className="relative">{(akun.nama || akun.email).charAt(0)}</span> : <UserRound className="relative size-5" aria-hidden />}
        </span>
        <div data-analitik-privat className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-accent uppercase">Analitik per pengguna</p>
          {akun ? (
            <>
              <p className="flex min-w-0 items-center gap-2">
                <span className="truncate text-[15px] font-bold">{akun.nama || "(tanpa nama)"}</span>
                {akun.peran === "admin" && <span className="shrink-0 rounded-md bg-accent-soft px-1.5 py-0.5 text-[10.5px] font-bold text-accent uppercase">Admin</span>}
              </p>
              <p className="truncate text-[13px] text-muted">{akun.email}</p>
            </>
          ) : (
            <>
              <p className="text-[15px] font-bold">Akun #{id}</p>
              <p className="text-[13px] text-muted">Akun tidak ditemukan (mungkin sudah dihapus); data analitiknya tetap ditampilkan.</p>
            </>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {akun && (
          <Link href={`/admin/pengguna/${id}`} className="btn btn-ghost flex-1 sm:flex-none">
            Kelola pengguna <ChevronRight className="size-4" aria-hidden />
          </Link>
        )}
        <Link href={tautan(p, { pengguna: null })} className="btn btn-ghost flex-1 sm:flex-none">
          <ArrowLeft className="size-4" aria-hidden /> Kembali ke semua
        </Link>
      </div>
    </section>
  );
}

function KartuAngka({ r, hari, perPengguna }: { r: RingkasanAnalitik; hari: number; perPengguna: boolean }) {
  const t = r.total;
  const pembanding = `${hari} hari sebelumnya`;
  const hariAktif = r.harian.filter((x) => x.aktif > 0 || x.halaman + x.klik + x.fitur > 0).length;
  const rataAktif = r.harian.length ? r.harian.reduce((a, x) => a + x.aktif, 0) / r.harian.length : 0;
  // Pembagi rata-rata: per pengguna aktif (semua akun) atau per hari aktif (mode per pengguna).
  const pembagi = perPengguna ? hariAktif : t.pengguna.kini;
  const per = perPengguna ? "per hari aktif" : "per pengguna aktif";
  const rataTeks = (n: number) => (pembagi > 0 ? `rata-rata ${desimal(n / pembagi)} ${per}` : "belum ada pengguna aktif");
  const rata = (n: number) => kapital(rataTeks(n));
  // Kunjungan & klik di kartu hanya dari akun yang login (ringkasanAnalitik); kunjungan anonim punya kartu sendiri.
  const rataLogin = (n: number) => (perPengguna ? rata(n) : `Akun ber-login · ${rataTeks(n)}`);
  const garis = (pilih: (x: RingkasanAnalitik["harian"][number]) => number) => <Sparkline nilai={r.harian.map(pilih)} className="h-9 w-[calc(100%-6px)]" />;
  const teratas = r.fitur[0];

  return (
    <section aria-label={`Angka kunci ${hari} hari terakhir`} className={`grid grid-cols-2 gap-3 sm:gap-4 ${perPengguna ? "xl:grid-cols-4" : "xl:grid-cols-5"}`}>
      {perPengguna ? (
        <KartuUtama
          label={`Hari aktif · ${hari} hari`}
          nilai={angka(hariAktif)}
          keterangan={`dari ${angka(r.harian.length)} hari pada periode ini`}
          tren={r.harian.map((x) => x.halaman + x.klik + x.fitur)}
        />
      ) : (
        <KartuUtama
          label={`Pengguna aktif · ${hari} hari`}
          nilai={angkaRingkas(t.pengguna.kini)}
          delta={<Delta kini={t.pengguna.kini} lalu={t.pengguna.lalu} pembanding={pembanding} gelap />}
          keterangan={`Akun unik yang login · rata-rata ${desimal(rataAktif)} per hari`}
          tren={r.harian.map((x) => x.aktif)}
        />
      )}
      <KartuStat
        label="Kunjungan halaman"
        nilai={angkaRingkas(t.halaman.kini)}
        ikon={<Eye className="size-4" aria-hidden />}
        delta={<Delta kini={t.halaman.kini} lalu={t.halaman.lalu} pembanding={pembanding} />}
        keterangan={rataLogin(t.halaman.kini)}
      >
        {garis((x) => x.halaman)}
      </KartuStat>
      <KartuStat
        label="Klik"
        nilai={angkaRingkas(t.klik.kini)}
        ikon={<MousePointerClick className="size-4" aria-hidden />}
        delta={<Delta kini={t.klik.kini} lalu={t.klik.lalu} pembanding={pembanding} />}
        keterangan={rataLogin(t.klik.kini)}
      >
        {garis((x) => x.klik)}
      </KartuStat>
      <KartuStat
        className={perPengguna ? "col-span-2 xl:col-span-1" : ""}
        label="Pemakaian fitur"
        nilai={angkaRingkas(t.fitur.kini)}
        ikon={<Zap className="size-4" aria-hidden />}
        delta={<Delta kini={t.fitur.kini} lalu={t.fitur.lalu} pembanding={pembanding} />}
        keterangan={teratas ? `Terbanyak: ${namaFitur(teratas.kunci)}` : "Belum ada fitur dipakai"}
      >
        {garis((x) => x.fitur)}
      </KartuStat>
      {!perPengguna && (
        <KartuStat
          label="Pengunjung anonim"
          nilai={angkaRingkas(t.anonim.kini)}
          ikon={<Footprints className="size-4" aria-hidden />}
          delta={<Delta kini={t.anonim.kini} lalu={t.anonim.lalu} pembanding={pembanding} />}
          keterangan="Kunjungan halaman publik (landing, masuk, daftar) sebelum login"
        />
      )}
    </section>
  );
}

/** Daftar teratas: batang horizontal satu rona (besaran, bukan identitas), angka tertulis jadi batang hanya penegas. */
function DaftarTop({
  id,
  judul,
  ikon,
  satuan,
  baris,
  perPengguna,
  nama,
  sub,
  kosong,
  className = "",
}: {
  id: string;
  judul: string;
  ikon: ReactNode;
  satuan: string;
  baris: BarisTop[];
  perPengguna: boolean;
  nama: (b: BarisTop) => string;
  sub: (b: BarisTop) => ReactNode;
  kosong: string;
  className?: string;
}) {
  const maks = Math.max(1, ...baris.map((b) => b.n));
  const total = baris.reduce((a, b) => a + b.n, 0);
  const idJudul = `judul-${id}`;
  const butir = (b: BarisTop, i: number) => {
    const teks = nama(b);
    return (
      <li key={`${b.kunci}|${b.label}`} className="flex gap-2.5 py-2.5">
        <span className="w-5 shrink-0 pt-px text-right text-[11.5px] font-semibold text-faint tabular-nums">{i + 1}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
            <span className="truncate font-semibold" title={teks}>
              {teks}
            </span>
            <span className="shrink-0 font-bold tabular-nums">
              {angka(b.n)}
              <span className="sr-only"> {satuan}</span>
            </span>
          </div>
          <div aria-hidden className="mt-1.5 h-1.5 rounded-full bg-subtle">
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, (b.n / maks) * 100)}%` }} />
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-3 text-[11.5px]">
            <span className="min-w-0 truncate text-faint">{sub(b)}</span>
            <span className="shrink-0 text-muted tabular-nums" title={`Terakhir ${waktuSingkatWib(b.terakhir)}`}>
              {/* pengguna 0 = hanya pengunjung anonim (kolom pengguna tidak menghitung user_id 0). */}
              {perPengguna ? `terakhir ${waktuSingkatWib(b.terakhir)}` : b.pengguna > 0 ? `${angka(b.pengguna)} pengguna` : "pengunjung anonim"}
            </span>
          </div>
        </div>
      </li>
    );
  };

  return (
    <section aria-labelledby={idJudul} className={`card flex min-w-0 flex-col p-5 sm:p-6 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <h2 id={idJudul} className="flex items-center gap-2 text-[15px] font-bold tracking-tight">
          <span className="text-accent">{ikon}</span>
          {judul}
        </h2>
        {baris.length > 0 && <span className="shrink-0 pt-0.5 text-[11.5px] text-faint">{baris.length} teratas</span>}
      </div>
      <p className="hint mt-0.5">
        {baris.length ? `${angka(total)} ${satuan} di daftar ini${perPengguna ? "" : " · angka kanan bawah = pengguna unik"}` : "Belum ada data pada periode ini"}
      </p>
      {baris.length === 0 ? (
        <p className="mt-5 text-[13px] text-muted">{kosong}</p>
      ) : (
        <>
          <ol className="mt-2 divide-y divide-line">{baris.slice(0, TAMPIL_AWAL).map(butir)}</ol>
          {baris.length > TAMPIL_AWAL && (
            <details className="group border-t border-line">
              <summary
                data-analitik={`Tampilkan lainnya: ${judul}`}
                className="flex min-h-10 cursor-pointer list-none items-center gap-1 pt-2 text-[12.5px] font-semibold text-accent select-none [&::-webkit-details-marker]:hidden"
              >
                <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden />
                <span className="group-open:hidden">Tampilkan {baris.length - TAMPIL_AWAL} lainnya</span>
                <span className="hidden group-open:inline">Sembunyikan</span>
              </summary>
              <ol start={TAMPIL_AWAL + 1} className="divide-y divide-line">
                {baris.slice(TAMPIL_AWAL).map((b, i) => butir(b, i + TAMPIL_AWAL))}
              </ol>
            </details>
          )}
        </>
      )}
    </section>
  );
}

const ANALITIK_LIHAT = "Pengguna paling aktif: lihat analitik";

/** 20 akun paling aktif: kartu di HP, tabel di layar lebar. Nama akun membuka mode per pengguna. */
function PenggunaTeraktif({ p, daftar }: { p: Param; daftar: PenggunaAktif[] }) {
  const label = (u: PenggunaAktif) => u.nama || u.email || `Akun #${u.userId}`;
  const keAnalitik = (u: PenggunaAktif) => tautan(p, { pengguna: u.userId });
  return (
    <section aria-labelledby="judul-teraktif" className="card min-w-0 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-5 sm:p-6">
        <div>
          <h2 id="judul-teraktif" className="flex items-center gap-2 text-[15px] font-bold tracking-tight">
            <Users className="size-4 text-accent" aria-hidden /> Pengguna paling aktif
          </h2>
          <p className="hint mt-0.5">Diurutkan dari jumlah aktivitas. Buka nama akun untuk melihat analitik akun itu saja.</p>
        </div>
        {daftar.length > 0 && <span className="pt-0.5 text-[11.5px] text-faint">{daftar.length} akun teratas</span>}
      </div>
      {daftar.length === 0 ? (
        <p className="px-5 py-10 text-center text-[13px] text-muted">Belum ada akun yang aktif pada periode ini.</p>
      ) : (
        <>
          {/* HP & tablet: kartu per akun (tabel lebar memaksa geser ke samping). */}
          {/* Email & nama akun = data pribadi: label klik analitik diambil dari data-analitik, bukan teks tautan. */}
          <ol data-analitik-privat className="divide-y divide-line lg:hidden">
            {daftar.map((u, i) => (
              <li key={u.userId} className="px-4 py-3.5 sm:px-5">
                <div className="flex items-start gap-2.5">
                  <span className="w-5 shrink-0 pt-0.5 text-right text-[11.5px] font-semibold text-faint tabular-nums">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <Link href={keAnalitik(u)} data-analitik={ANALITIK_LIHAT} className="min-w-0 rounded-md hover:text-accent">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[13.5px] font-semibold">{label(u)}</span>
                          {u.peran === "admin" && <LencanaAdmin />}
                        </span>
                        {u.nama && u.email && <span className="block truncate text-[12px] text-muted">{u.email}</span>}
                      </Link>
                      <span className="shrink-0 text-[11.5px] text-faint tabular-nums">{waktuSingkatWib(u.terakhir)}</span>
                    </div>
                    <dl className="mt-2 grid grid-cols-4 gap-2 text-center">
                      <Sel label="Halaman" nilai={u.halaman} />
                      <Sel label="Klik" nilai={u.klik} />
                      <Sel label="Fitur" nilai={u.fitur} />
                      <Sel label="Hari aktif" nilai={u.hariAktif} />
                    </dl>
                  </div>
                </div>
              </li>
            ))}
          </ol>

          <div data-analitik-privat className="hidden lg:block">
            <table className="w-full text-left text-[12.5px]">
              <caption className="sr-only">Pengguna paling aktif</caption>
              <thead className="bg-subtle/60 text-[11.5px] font-semibold tracking-[0.04em] text-muted uppercase">
                <tr>
                  <th scope="col" className="w-12 py-2.5 pl-6 text-right">
                    <span className="sr-only">Peringkat</span>#
                  </th>
                  <th scope="col" className="px-4 py-2.5">
                    Akun
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right">
                    Halaman
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right">
                    Klik
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right">
                    Fitur
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right">
                    Hari aktif
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Terakhir aktif
                  </th>
                  <th scope="col" className="py-2.5 pr-6 pl-3">
                    <span className="sr-only">Tindakan</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {daftar.map((u, i) => (
                  <tr key={u.userId} className="transition-colors hover:bg-subtle/40">
                    <td className="py-3 pl-6 text-right font-semibold text-faint tabular-nums">{i + 1}</td>
                    <td className="max-w-[320px] px-4 py-3">
                      <Link href={keAnalitik(u)} data-analitik={ANALITIK_LIHAT} className="group/akun block min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate font-semibold group-hover/akun:text-accent group-hover/akun:underline">{label(u)}</span>
                          {u.peran === "admin" && <LencanaAdmin />}
                        </span>
                        {u.nama && u.email && <span className="block truncate text-muted">{u.email}</span>}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{angka(u.halaman)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{angka(u.klik)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{angka(u.fitur)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{angka(u.hariAktif)}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-muted tabular-nums">{waktuSingkatWib(u.terakhir)}</td>
                    <td className="py-3 pr-6 pl-3 text-right whitespace-nowrap">
                      {u.email ? (
                        <Link href={`/admin/pengguna/${u.userId}`} data-analitik="Pengguna paling aktif: kelola" className="text-[12px] font-semibold text-accent hover:underline">
                          Kelola<span className="sr-only"> {label(u)}</span>
                        </Link>
                      ) : (
                        <span className="text-[12px] text-faint">terhapus</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function Sel({ label, nilai }: { label: string; nilai: number }) {
  return (
    <div className="min-w-0 rounded-lg bg-subtle px-1 py-1.5">
      <dt className="truncate text-[10.5px] text-muted">{label}</dt>
      <dd className="text-[13px] font-bold tabular-nums">{angkaRingkas(nilai)}</dd>
    </div>
  );
}

function LencanaAdmin() {
  return <span className="shrink-0 rounded bg-accent-soft px-1.5 py-px text-[10px] font-bold text-accent uppercase">Admin</span>;
}

/** Keadaan kosong: menjelaskan bahwa pencatatan berjalan otomatis + jalan pintas ke periode/saringan yang lebih luas. */
function Kosong({ p, perPengguna, r }: { p: Param; perPengguna: boolean; r: RingkasanAnalitik }) {
  const t = r.total;
  const lalu = t.halaman.lalu + t.klik.lalu + t.fitur.lalu + t.anonim.lalu;
  const lebihPanjang = PERIODE_ANALITIK.find((h) => h > p.hari);
  return (
    <section className="card flex flex-col items-center px-5 py-12 text-center sm:py-16">
      <span className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
        <ChartNoAxesColumn className="size-6" aria-hidden />
      </span>
      <h2 className="mt-4 text-[16px] font-bold tracking-tight">Belum ada data analitik pada periode ini</h2>
      <p className="mt-1.5 max-w-md text-[13px] text-muted">
        {perPengguna
          ? "Akun ini belum membuka halaman, mengeklik, atau memakai fitur dalam periode yang dipilih."
          : "Pencatatan berjalan otomatis: setiap halaman yang dibuka, tombol yang diklik, dan fitur yang dipakai pengguna akan muncul di sini dalam beberapa detik. Tidak ada yang perlu dinyalakan."}
        {lalu > 0 && ` Periode sebelumnya tercatat ${angka(lalu)} aktivitas.`}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {lebihPanjang && (
          <Link href={tautan(p, { hari: lebihPanjang })} className="btn btn-ghost">
            Lihat {lebihPanjang} hari
          </Link>
        )}
        {!perPengguna && !p.admin && (
          <Link href={tautan(p, { admin: true })} className="btn btn-ghost">
            Sertakan akun admin
          </Link>
        )}
      </div>
    </section>
  );
}

/** Kerangka saat data dimuat: bentuk & tinggi mengikuti isi supaya tidak ada lompatan tata letak. */
export function KerangkaAnalitik() {
  return (
    <div className="space-y-4 lg:space-y-6">
      <p role="status" className="sr-only">
        Memuat data analitik…
      </p>
      <div aria-hidden className="space-y-4 lg:space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="h-11 animate-denyut rounded-xl bg-subtle sm:w-64" />
          <div className="h-9 w-48 animate-denyut rounded-xl bg-subtle" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
          <div className="col-span-2 h-44 animate-denyut rounded-2xl bg-ink/90 xl:col-span-1" />
          <div className="card h-44 animate-denyut" />
          <div className="card h-44 animate-denyut" />
          <div className="card h-44 animate-denyut" />
          <div className="card col-span-2 h-44 animate-denyut xl:col-span-1" />
        </div>
        <div className="card h-[470px] animate-denyut" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6 xl:grid-cols-3">
          <div className="card h-[560px] animate-denyut" />
          <div className="card h-[560px] animate-denyut" />
          <div className="card h-[560px] animate-denyut lg:col-span-2 xl:col-span-1" />
        </div>
        <div className="card h-96 animate-denyut" />
      </div>
    </div>
  );
}
