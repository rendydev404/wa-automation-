import { ArrowUpRight, BookOpen, Bot, ChevronDown, Plus, QrCode, Smartphone, TriangleAlert, Users } from "lucide-react";
import { angka } from "../kit/anim";
import { KartuStat, KartuUtama, Meter, Pill, Saklar, Sparkline } from "../kit/ui";
import { HARI, TANGGAL } from "../data";

/* Halaman Ringkasan (/dashboard) — markup & kelas disalin dari src/app/(app)/dashboard/page.tsx dan komponennya. */

export interface KartuNomorP {
  label: string;
  wa?: string;
  status: "WORKING" | "SCAN_QR_CODE" | "NONE";
  botAktif: boolean;
  dok: number;
  karakter: number;
  masuk: number;
  dibalas: number;
  pelanggan: number;
  tren: number[];
  /** Posisi geser saklar 0..1 (diganti bila ingin menganimasikan). */
  saklar?: number;
}

export interface LanggananP {
  paket: string;
  info: string;
  balasanLabel: string;
  terpakai: number;
  kuota: number;
  nomor: number;
  nomorMaks: number;
  tombol?: string;
  tombolUtama?: boolean;
  catatan?: { teks: string; nada: "waspada" | "bahaya" };
}

export function LencanaSesi({ status }: { status: "WORKING" | "SCAN_QR_CODE" | "NONE" | "STARTING" }) {
  if (status === "WORKING")
    return (
      <Pill nada="hijau">
        <span className="size-1.5 rounded-full bg-success" /> Terhubung
      </Pill>
    );
  if (status === "SCAN_QR_CODE") return <Pill nada="kuning">Menunggu ditautkan</Pill>;
  if (status === "STARTING") return <Pill nada="kuning">Menyiapkan</Pill>;
  return <Pill nada="abu">Belum terhubung</Pill>;
}

export function KartuLanggananS({ p, tautan = true }: { p: LanggananP; tautan?: boolean }) {
  const persen = p.kuota ? Math.min(100, Math.round((p.terpakai / p.kuota) * 100)) : 0;
  const nada = p.catatan?.nada ?? "normal";
  return (
    <section data-cur="kartu-langganan" className="card grid grid-cols-3 gap-6 p-6">
      <div>
        <p className="text-[12.5px] font-semibold text-muted">Paket sekarang</p>
        <p className="mt-1 text-2xl font-bold">{p.paket}</p>
        <p className="mt-1 text-[13px] text-muted">{p.info}</p>
      </div>
      <div>
        <p className="text-[12.5px] font-semibold text-muted">{p.balasanLabel}</p>
        <p className="mt-1 text-2xl font-bold tabular-nums">
          {angka(p.terpakai)}
          <span className="text-base text-muted"> / {angka(p.kuota)}</span>
        </p>
        <div className="mt-2">
          <Meter persen={persen} nada={nada} />
        </div>
        {p.catatan && <p className={`mt-2 text-[12.5px] font-semibold ${p.catatan.nada === "bahaya" ? "text-danger" : "text-warning"}`}>{p.catatan.teks}</p>}
      </div>
      <div className="flex flex-col justify-between gap-4">
        <div>
          <p className="text-[12.5px] font-semibold text-muted">Nomor WhatsApp</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {p.nomor}
            <span className="text-base text-muted"> / {p.nomorMaks}</span>
          </p>
        </div>
        {tautan && p.tombol && (
          <span data-cur="btn-pilih-paket" className={`btn self-start ${p.tombolUtama ? "btn-primary" : "btn-ghost border border-line"}`}>
            {p.tombol}
          </span>
        )}
      </div>
    </section>
  );
}

const SERI = [
  { kunci: "masuk", label: "Pesan masuk", warna: "var(--c-seri-masuk)" },
  { kunci: "dibalas", label: "Dibalas AI", warna: "var(--c-seri-dibalas)" },
] as const;

const batasAtas = (n: number) => {
  if (n <= 2) return 2;
  const p = 10 ** Math.floor(Math.log10(n));
  return [1, 2, 4, 6, 8, 10].find((k) => k * p >= n)! * p;
};

/** Grafik kolom 7 hari. `anim` 0..1 menumbuhkan kolom; `sorot` = indeks kolom yang disorot (tooltip). */
export function GrafikAktivitasS({ masuk, dibalas, anim = 1, sorot = null }: { masuk: number[]; dibalas: number[]; anim?: number; sorot?: number | null }) {
  const n = masuk.length;
  const titik = masuk.map((m, i) => ({ masuk: m, dibalas: dibalas[i], label: HARI[i] ?? "", panjang: HARI[i] === "Hari ini" ? "Hari ini" : HARI[i] }));
  const atas = batasAtas(Math.max(0, ...masuk, ...dibalas));
  const totM = masuk.reduce((a, b) => a + b, 0);
  const totD = dibalas.reduce((a, b) => a + b, 0);
  const rasio = totM ? Math.round((totD / totM) * 100) : null;
  const kiri = sorot !== null && sorot < n / 2;
  return (
    <section data-cur="grafik" className="card flex min-w-0 flex-col p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <h2 className="text-[15px] font-bold tracking-tight">Aktivitas 7 hari terakhir</h2>
          <p className="hint mt-0.5">
            {angka(Math.round(totM * anim))} pesan masuk · {angka(Math.round(totD * anim))} dibalas AI{rasio !== null && totM > 0 && ` (${rasio}%)`}
          </p>
        </div>
        <ul className="flex items-center gap-4 text-xs font-medium text-muted">
          {SERI.map((s) => (
            <li key={s.kunci} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px]" style={{ background: s.warna }} />
              {s.label}
            </li>
          ))}
        </ul>
      </div>
      <div className="relative mt-6 h-60 select-none">
        <div aria-hidden className="absolute inset-x-0 top-0 bottom-6">
          {[atas, atas / 2, 0].map((v, i) => (
            <div key={i} className="absolute inset-x-0 flex -translate-y-1/2 items-center gap-2" style={{ top: `${i * 50}%` }}>
              <span className="w-7 text-right text-[11px] text-faint tabular-nums">{angka(v)}</span>
              <span className="h-px flex-1 bg-line" />
            </div>
          ))}
        </div>
        <div className="absolute top-0 right-0 bottom-6 left-9 flex">
          {titik.map((t, i) => (
            <div key={i} className={`flex h-full flex-1 items-end justify-center gap-0.5 rounded-t-lg px-1 ${sorot === i ? "bg-subtle" : ""}`}>
              {SERI.map((s) => (
                <span key={s.kunci} className="w-full max-w-3.5 rounded-t-[4px]" style={{ height: `${(t[s.kunci] / atas) * 100 * anim}%`, background: s.warna }} />
              ))}
            </div>
          ))}
          {sorot !== null && (
            <div className={`pointer-events-none absolute top-1 z-10 w-max min-w-36 rounded-xl border border-line bg-surface px-3 py-2.5 shadow-pop ${kiri ? "ml-1" : "-ml-1 -translate-x-full"}`} style={{ left: `${((sorot + (kiri ? 1 : 0)) / n) * 100}%` }}>
              <p className="text-[11.5px] font-semibold text-muted">{titik[sorot].panjang}</p>
              <ul className="mt-1.5 space-y-1">
                {SERI.map((s) => (
                  <li key={s.kunci} className="flex items-center gap-2 text-xs">
                    <span className="h-0.5 w-3 rounded-full" style={{ background: s.warna }} />
                    <span className="font-bold text-fg tabular-nums">{titik[sorot][s.kunci]}</span>
                    <span className="text-muted">{s.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div aria-hidden className="absolute right-0 bottom-0 left-9 flex">
          {titik.map((t, i) => (
            <span key={i} className="relative h-4 min-w-0 flex-1">
              <span className={`absolute top-0 left-1/2 -translate-x-1/2 text-[11px] whitespace-nowrap ${i === n - 1 ? "font-semibold text-fg" : "text-faint"}`}>{t.label}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function Angka({ label, nilai }: { label: string; nilai: number }) {
  return (
    <div className="min-w-0 px-3 py-2.5">
      <dt className="truncate text-[11px] font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 text-lg leading-tight font-bold tabular-nums">{angka(nilai)}</dd>
    </div>
  );
}

export function KartuNomorS({ n, i }: { n: KartuNomorP; i: number }) {
  const perluScan = n.status !== "WORKING";
  return (
    <li data-cur={`kartu-nomor-${i + 1}`} className="card flex min-w-0 flex-col overflow-hidden">
      <div className="flex items-start gap-3 p-5 pb-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-[15px] font-bold text-accent uppercase">{n.label.charAt(0)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold tracking-tight">{n.label}</p>
          <p className="mt-0.5 truncate text-[13px] text-muted tabular-nums">{n.wa ?? "Belum ada nomor tertaut"}</p>
          <div className="mt-2">
            <LencanaSesi status={n.status} />
          </div>
        </div>
        <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-faint" />
      </div>
      <dl className="mx-5 grid grid-cols-3 divide-x divide-line rounded-xl bg-subtle/70">
        <Angka label="Masuk hari ini" nilai={n.masuk} />
        <Angka label="Dibalas AI" nilai={n.dibalas} />
        <Angka label="Pelanggan" nilai={n.pelanggan} />
      </dl>
      <div className="flex items-center justify-between gap-4 px-5 py-4">
        <p className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted">
          <BookOpen className="size-3.5 shrink-0" />
          <span className="truncate">{n.dok ? `${n.dok} dokumen · ${angka(n.karakter)} karakter` : "Knowledge kosong"}</span>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[11px] text-faint">7 hari</span>
          <Sparkline nilai={n.tren} warna="var(--c-seri-masuk)" className="h-6 w-16" />
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line bg-subtle/40 px-5 py-3">
        {perluScan ? (
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-accent"><QrCode className="size-4" /> Scan QR untuk menautkan</span>
        ) : (
          <span className="text-[13px] font-medium">{n.botAktif ? "Balasan otomatis aktif" : "Balasan otomatis mati"}</span>
        )}
        <Saklar p={n.saklar ?? (n.botAktif ? 1 : 0)} cur={`saklar-kartu-${i + 1}`} />
      </div>
    </li>
  );
}

function PanelSyarat({ buka }: { buka: boolean }) {
  const S = [
    ["Matikan balasan otomatis WhatsApp Business", "Nonaktifkan Pesan salam dan Pesan tidak di tempat (menu Alat bisnis) di nomor yang akan disambungkan."],
    ["Lepas layanan balas otomatis lain", "Putuskan chatbot, aplikasi auto-reply, atau perangkat tertaut lain yang ikut membalas chat dari nomor ini."],
    ["Bukan nomor WhatsApp Business API", "Nomor yang terdaftar di WhatsApp Business API (Cloud API atau penyedia resminya) tidak bisa ditautkan lewat QR."],
  ];
  return (
    <div data-cur="panel-syarat" className="rounded-2xl border border-warning/30 bg-warning-soft/60">
      <div className="flex items-center gap-3 px-5 py-3.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-warning-soft text-warning">
          <TriangleAlert className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-bold text-fg">Nomor tidak boleh terhubung ke balasan otomatis lain</span>
          <span className="block text-[12.5px] text-muted">Matikan auto-reply WhatsApp Business & layanan bot lain sebelum menyambungkan nomor.</span>
        </span>
        {!buka && <span className="shrink-0 text-[12.5px] font-semibold text-warning">Lihat syarat</span>}
        <ChevronDown className="size-4 shrink-0 text-warning" style={{ transform: buka ? "rotate(180deg)" : undefined }} />
      </div>
      {buka && (
        <div className="border-t border-warning/20 px-5 pt-4 pb-4">
          <ul className="grid grid-cols-3 gap-3">
            {S.map(([j, x]) => (
              <li key={j} className="rounded-xl border border-line bg-surface p-4">
                <TriangleAlert className="size-[18px] text-warning" />
                <p className="mt-2.5 text-[13.5px] font-bold">{j}</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{x}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12.5px] text-muted">Bila dua sistem membalas bersamaan, pelanggan menerima balasan ganda yang saling bertabrakan dan nomor berisiko dibatasi WhatsApp.</p>
        </div>
      )}
    </div>
  );
}

export interface RingkasanP {
  nomor: KartuNomorP[];
  langganan: LanggananP;
  stat: { masuk: number; kemarin: number; total7: number; dibalas: number; tren: number[]; pelanggan: number };
  seri: { masuk: number[]; dibalas: number[] };
  /** Kemunculan data 0..1 (angka naik, kolom tumbuh). */
  anim?: number;
  syaratBuka?: boolean;
  sorotGrafik?: number | null;
  /** Tombol "Tambah nomor" ditekan (tampilan hover). */
  tambahHover?: boolean;
}

export function Ringkasan({ nomor, langganan, stat, seri, anim = 1, syaratBuka = false, sorotGrafik = null }: RingkasanP) {
  const terhubung = nomor.filter((n) => n.status === "WORKING").length;
  const rasio = stat.masuk ? Math.round((stat.dibalas / stat.masuk) * 100) : null;
  const k = (v: number) => Math.round(v * anim);
  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[11.5px] font-semibold tracking-[0.08em] text-accent uppercase">{TANGGAL}</p>
          <h1 className="mt-1.5 text-[28px] font-bold tracking-tight">Ringkasan</h1>
          <p className="mt-1 max-w-xl text-muted">Pantau nomor WhatsApp Anda, koneksinya, dan kinerja balasan AI dalam satu layar.</p>
        </div>
        <span data-cur="btn-tambah-nomor" className="btn btn-primary shrink-0">
          <Plus className="size-4" /> Tambah nomor
        </span>
      </div>
      <PanelSyarat buka={syaratBuka} />
      <KartuLanggananS p={langganan} />
      <div className="space-y-8">
        <section data-cur="ringkasan-stat" className="grid grid-cols-4 gap-4">
          <KartuUtama label="Pesan masuk hari ini" nilai={angka(k(stat.masuk))} keterangan={`Kemarin ${angka(stat.kemarin)} · 7 hari ${angka(k(stat.total7))}`} tren={stat.tren} sampai={Math.min(1, anim * 1.1)} />
          <KartuStat label="Dibalas AI hari ini" nilai={angka(k(stat.dibalas))} ikon={<Bot className="size-4" />} keterangan={rasio === null ? "Belum ada pesan masuk" : `${rasio}% dari pesan masuk`}>
            {rasio !== null && <Meter persen={rasio * anim} />}
          </KartuStat>
          <KartuStat
            label="Nomor terhubung"
            ikon={<Smartphone className="size-4" />}
            nilai={
              <>
                {terhubung}
                <span className="text-lg font-semibold text-faint">/{nomor.length}</span>
              </>
            }
            keterangan={nomor.length === 0 ? "Belum ada nomor" : terhubung === nomor.length ? "Semua nomor tersambung" : `${nomor.length - terhubung} nomor perlu perhatian`}
          >
            {nomor.length > 0 && (
              <div aria-hidden className="flex gap-0.5">
                {nomor.map((n, i) => (
                  <span key={i} className={`h-1.5 flex-1 rounded-full ${n.status === "WORKING" ? "bg-accent" : n.status === "SCAN_QR_CODE" ? "bg-warning/60" : "bg-line-strong"}`} />
                ))}
              </div>
            )}
          </KartuStat>
          <KartuStat label="Pelanggan tercatat" nilai={angka(k(stat.pelanggan))} ikon={<Users className="size-4" />} keterangan={`Di ${nomor.length} dari ${langganan.nomorMaks} nomor kuota akun`} />
        </section>
        <GrafikAktivitasS masuk={seri.masuk} dibalas={seri.dibalas} anim={anim} sorot={sorotGrafik} />
        <section>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-[17px] font-bold tracking-tight">
                Nomor WhatsApp
                <span className="rounded-md bg-subtle px-1.5 py-0.5 text-xs font-semibold text-muted tabular-nums">{nomor.length}</span>
              </h2>
              <p className="hint mt-0.5 max-w-2xl">Tiap nomor punya koneksi dan base knowledge sendiri. AI menjawab memakai knowledge nomor yang menerima chat.</p>
            </div>
          </div>
          {nomor.length === 0 ? (
            <div className="card grid place-items-center border-dashed px-6 py-14 text-center">
              <span className="mb-3 grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
                <QrCode className="size-5" />
              </span>
              <p className="text-[15px] font-bold">Belum ada nomor</p>
              <p className="hint mt-1 mb-5 max-w-sm">Tambah nomor, pindai kode QR-nya dari HP, lalu isi base knowledge-nya.</p>
              <span className="btn btn-primary">
                <Plus className="size-4" /> Tambah nomor
              </span>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-4">
              {nomor.map((n, i) => (
                <KartuNomorS key={n.label} n={n} i={i} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
