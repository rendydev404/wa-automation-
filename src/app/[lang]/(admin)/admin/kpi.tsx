import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  CalendarClock,
  ChevronRight,
  CircleCheck,
  Clock,
  Gauge,
  Phone,
  TrendingUp,
  Users,
  WifiOff,
} from "lucide-react";
import { Delta, KartuStat, KartuUtama, Meter, Sparkline } from "@/components/stat";
import { GrafikAktivitas } from "@/components/grafik-aktivitas";
import { angka, angkaRingkas, rupiahRingkas, tanggal, waktuSingkatWib } from "@/lib/format";
import { PERIODE_HARI, kpiAdmin, type KpiAdmin } from "@/lib/kpi";
import { infoKurs } from "@/lib/kurs";
import { daftarLog } from "@/lib/pengguna";
import { requireStaf } from "@/lib/session";
import { deretHarian, persen } from "@/lib/tren";
import { infoSesi } from "@/lib/wa";
import { sekarang } from "@/lib/db";
import { Maskot } from "@/components/maskot/maskot";
import { TUR_ADMIN } from "@/components/isi-tur";
import { TurOtomatis } from "@/components/tur";
import { WaStatusProvider } from "@/components/wa-status";
import { turSelesai } from "@/lib/pengguna";

/**
 * Ringkasan panel admin sebagai dashboard KPI: empat angka kunci 30 hari (dibanding 30 hari sebelumnya), jalur
 * angka pendukung, grafik aktivitas, daftar yang perlu ditindaklanjuti, sebaran paket, dan tindakan admin terakhir.
 */

const PEMBANDING = `${PERIODE_HARI} hari sebelumnya`;
const HARI_GRAFIK = 14;

export async function KpiRingkasan() {
  const admin = await requireStaf();
  const [k, kursI, log, tur] = await Promise.all([kpiAdmin(), infoKurs(), daftarLog(6), turSelesai(admin.id)]);
  const kini = sekarang();
  const kurs = kursI.kurs;

  const biaya = Math.round(k.biayaAiUsd.kini * kurs);
  const biayaLalu = Math.round(k.biayaAiUsd.lalu * kurs);
  const laba = k.pendapatan.kini - biaya;
  const labaLalu = k.pendapatan.lalu - biayaLalu;
  const margin = persen(laba, k.pendapatan.kini);
  const rasioBalas = persen(k.balasan.kini, k.balasan.masuk);
  const konversi = persen(k.berbayar.kini, k.akun.pengguna);

  // Pendapatan kumulatif: deret harian transaksi biasanya jarang dan bergerigi; garis kumulatif memperlihatkan laju.
  const pendapatanKumulatif = k.pendapatan.harian.reduce<number[]>((a, d) => [...a, (a.at(-1) ?? 0) + d.nilai], []);

  // Nomor yang sudah tertaut tetapi tidak tersambung sekarang (STARTING = sedang menyambung, dianggap wajar).
  const terputus = k.nomor.tertaut.filter((n) => !["WORKING", "STARTING"].includes(infoSesi(n.sesi).status));
  const terhubung = k.nomor.tertaut.length - terputus.length;

  const grafik = deretHarian(k.hari.slice(-HARI_GRAFIK), k.balasan.harian);
  const hariIni = k.balasan.harian.at(-1) ?? { masuk: 0, dibalas: 0 };

  return (
    <div className="space-y-4 lg:space-y-6">
      <TurOtomatis nama="admin" langkah={TUR_ADMIN} sudah={tur.includes("admin")} />
      {/* Poller status hanya untuk maskot (koneksi, kesehatan AI, detak balasan semua nomor): satu permintaan ringan per 20 dtk. */}
      <WaStatusProvider>
        <Maskot
          tur={{ nama: "admin", langkah: TUR_ADMIN }}
          data={{
            jenis: "admin",
            nama: (admin.nama || "Admin").split(/\s+/)[0],
            pendapatan: k.pendapatan,
            berbayar: { kini: k.berbayar.kini, lalu: k.berbayar.lalu },
            balasan: { kini: k.balasan.kini, lalu: k.balasan.lalu, masuk: k.balasan.masuk },
            hariIni: { masuk: hariIni.masuk, dibalas: hariIni.dibalas },
            biaya,
            laba,
            margin,
            menunggu: k.menunggu,
            berakhir: k.berakhir.length,
            kuotaMenipis: k.kuotaMenipis.length,
            nomor: { total: k.nomor.total, tertaut: k.nomor.tertaut.length, terputus: terputus.length },
            akunBaru: { kini: k.akun.baruKini, lalu: k.akun.baruLalu },
            pengguna: k.akun.pengguna,
          }}
        />
      </WaStatusProvider>
      <section data-tur="admin-kpi" aria-label={`Angka kunci ${PERIODE_HARI} hari terakhir`} className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KartuUtama
          label={`Pendapatan · ${PERIODE_HARI} hari`}
          nilai={rupiahRingkas(k.pendapatan.kini)}
          delta={<Delta kini={k.pendapatan.kini} lalu={k.pendapatan.lalu} format={rupiahRingkas} pembanding={PEMBANDING} gelap />}
          keterangan={`Rp${angka(k.pendapatan.kini)} dari ${angka(k.pendapatan.transaksi)} transaksi lunas`}
          tren={pendapatanKumulatif}
        />
        <KartuStat
          label="Pelanggan berbayar"
          nilai={angka(k.berbayar.kini)}
          ikon={<BadgeCheck className="size-4" aria-hidden />}
          delta={<Delta kini={k.berbayar.kini} lalu={k.berbayar.lalu} mode="selisih" pembanding={`${PERIODE_HARI} hari lalu`} />}
          keterangan={konversi === null ? "Belum ada akun pengguna" : `${konversi}% dari ${angka(k.akun.pengguna)} akun pengguna`}
        >
          <Sparkline nilai={k.berbayar.harian.map((d) => d.nilai)} className="h-9 w-[calc(100%-6px)]" />
        </KartuStat>
        <KartuStat
          label={`Balasan AI · ${PERIODE_HARI} hari`}
          nilai={angkaRingkas(k.balasan.kini)}
          ikon={<Bot className="size-4" aria-hidden />}
          delta={<Delta kini={k.balasan.kini} lalu={k.balasan.lalu} pembanding={PEMBANDING} />}
          keterangan={rasioBalas === null ? "Belum ada pesan masuk" : `${rasioBalas}% dari ${angka(k.balasan.masuk)} pesan masuk`}
        >
          <Sparkline nilai={k.balasan.harian.map((d) => d.dibalas)} className="h-9 w-[calc(100%-6px)]" />
        </KartuStat>
        <KartuStat
          className="col-span-2 xl:col-span-1"
          label={`Laba kotor · ${PERIODE_HARI} hari`}
          nilai={<span className={laba < 0 ? "text-danger" : ""}>{rupiahRingkas(laba)}</span>}
          ikon={<TrendingUp className="size-4" aria-hidden />}
          delta={<Delta kini={laba} lalu={labaLalu} format={rupiahRingkas} pembanding={PEMBANDING} />}
          keterangan={
            margin === null
              ? `Biaya AI ${rupiahRingkas(biaya)} · belum ada pendapatan`
              : `Margin ${margin}% · pendapatan dikurangi biaya AI ${rupiahRingkas(biaya)}`
          }
        >
          {margin !== null && (
            <Meter persen={margin} label="Margin laba kotor 30 hari" nada={margin >= 50 ? "normal" : margin >= 20 ? "waspada" : "bahaya"} />
          )}
        </KartuStat>
      </section>

      {/* Garis pemisah 1px = celah grid di atas latar garis, rapi di 2 maupun 4 kolom. */}
      <section data-tur="admin-pendukung" aria-label="Angka pendukung" className="card grid grid-cols-2 gap-px overflow-hidden bg-line md:grid-cols-4">
        <Pendukung href="/admin/pengguna" ikon={<Users className="size-4" aria-hidden />} label={`Pendaftar baru · ${PERIODE_HARI} hari`} nilai={angka(k.akun.baruKini)}>
          <Delta kini={k.akun.baruKini} lalu={k.akun.baruLalu} pembanding={PEMBANDING} />
          <p className="mt-1">
            Total {angka(k.akun.total)} akun · {angka(k.akun.diblokir)} diblokir
          </p>
        </Pendukung>
        <Pendukung
          href="/admin/pengguna"
          ikon={<Phone className="size-4" aria-hidden />}
          label="Nomor terhubung"
          nilai={
            <>
              {angka(terhubung)}
              <span className="text-[15px] font-semibold text-muted"> / {angka(k.nomor.tertaut.length)} tertaut</span>
            </>
          }
        >
          {terputus.length > 0 ? (
            <p className="flex items-center gap-1 font-medium text-danger">
              <WifiOff className="size-3.5" aria-hidden /> {angka(terputus.length)} tertaut tapi terputus
            </p>
          ) : k.nomor.tertaut.length === 0 ? (
            <p>Belum ada nomor tertaut</p>
          ) : (
            <p className="flex items-center gap-1 font-medium text-success">
              <CircleCheck className="size-3.5" aria-hidden /> Semua tersambung
            </p>
          )}
          <p className="mt-1">Total {angka(k.nomor.total)} nomor dibuat pengguna</p>
        </Pendukung>
        <Pendukung href="/admin/pengguna" ikon={<CalendarClock className="size-4" aria-hidden />} label="Langganan berakhir" nilai={angka(k.berakhir.length)}>
          <p>{k.berakhir.length ? "Belum diperpanjang" : "Tidak ada yang berakhir"}</p>
          <p className="mt-1">Dalam 7 hari ke depan · {angka(k.kuotaMenipis.length)} kuota menipis</p>
        </Pendukung>
        <Pendukung href="/admin/transaksi" ikon={<Clock className="size-4" aria-hidden />} label="Pembayaran menunggu" nilai={angka(k.menunggu.jumlah)}>
          <p>{k.menunggu.jumlah ? `Rp${angka(k.menunggu.nilai)} belum dibayar` : "Tidak ada tagihan tertunda"}</p>
          <p className="mt-1">Dibuat 7 hari terakhir</p>
        </Pendukung>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <GrafikAktivitas titik={grafik} judul={`Aktivitas semua nomor · ${HARI_GRAFIK} hari`} penuh />
        <PerluPerhatian k={k} terputus={terputus} kini={kini} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:gap-6 xl:grid-cols-2">
        <PerPaket k={k} />
        <section className="card p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-bold tracking-tight">Tindakan admin terakhir</h2>
            <Link href="/admin/log" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-accent hover:underline">
              Lihat semua <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
          {log.length === 0 ? (
            <p className="mt-4 text-[13px] text-muted">Belum ada tindakan.</p>
          ) : (
            <ol data-analitik-privat className="mt-3 divide-y divide-line">
              {log.map((l) => (
                <li key={l.id} className="flex items-baseline justify-between gap-3 py-2.5 text-[12.5px]">
                  <p className="min-w-0">
                    <span className="font-semibold">{l.admin}</span> <span className="text-muted">{l.aksi}</span>
                    {l.sasaran && <span className="font-semibold"> {l.sasaran}</span>}
                    {l.detail && <span className="block truncate text-faint">{l.detail}</span>}
                  </p>
                  <time className="shrink-0 text-[11.5px] text-faint tabular-nums">{waktuSingkatWib(l.waktu, kini)}</time>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <p className="text-[11.5px] text-faint">
        Angka {PERIODE_HARI} hari terakhir dibanding {PERIODE_HARI} hari sebelumnya, tanggal menurut WIB. Pendapatan = transaksi lunas (Midtrans &
        dicatat admin). Biaya AI dalam Rp memakai kurs Rp{angka(kurs)}/USD, sumber: {kursI.cadangan ? "perkiraan cadangan" : kursI.sumber}.
      </p>
    </div>
  );
}

/** Satu sel di jalur angka pendukung; bisa berupa tautan ke halaman terkait. */
function Pendukung({ href, ikon, label, nilai, children }: { href?: string; ikon: ReactNode; label: string; nilai: ReactNode; children: ReactNode }) {
  const isi = (
    <>
      <p className="flex items-start gap-1.5 text-[12px] leading-snug font-medium text-muted">
        <span className="mt-px shrink-0 text-faint">{ikon}</span>
        <span className="min-w-0">{label}</span>
        {href && <ChevronRight className="ml-auto size-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5" aria-hidden />}
      </p>
      <p className="mt-1.5 text-[22px] leading-none font-bold tracking-tight">{nilai}</p>
      <div className="mt-2 text-[11.5px] leading-snug text-muted">{children}</div>
    </>
  );
  const kelas = "min-w-0 bg-surface p-4 sm:p-5";
  return href ? (
    <Link href={href} data-analitik={label} className={`group ${kelas} transition-colors hover:bg-subtle`}>
      {isi}
    </Link>
  ) : (
    <div className={kelas}>{isi}</div>
  );
}

type Nada = "bahaya" | "waspada";
const WARNA_NADA: Record<Nada, string> = { bahaya: "bg-danger-soft text-danger", waspada: "bg-warning-soft text-warning" };
const LABEL_NADA: Record<Nada, string> = { bahaya: "Penting", waspada: "Perhatian" };

function Butir({ nada, ikon, judul, isi, href, children }: { nada: Nada; ikon: ReactNode; judul: ReactNode; isi: ReactNode; href: string; children?: ReactNode }) {
  return (
    <li>
      <Link href={href} data-analitik="Buka butir perhatian" className="group -mx-2 flex items-start gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-subtle">
        <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${WARNA_NADA[nada]}`}>
          {ikon}
          <span className="sr-only">{LABEL_NADA[nada]}:</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold">{judul}</span>
          <span className="block text-[12px] leading-snug text-muted">{isi}</span>
          {children}
        </span>
        <ChevronRight className="mt-1.5 size-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </li>
  );
}

function sisaWaktu(sampai: number, kini: number): string {
  const jam = (sampai - kini) / 3600;
  if (jam < 24) return jam < 1 ? "kurang dari 1 jam lagi" : `${Math.floor(jam)} jam lagi`;
  return `${Math.floor(jam / 24)} hari lagi`;
}

function PerluPerhatian({ k, terputus, kini }: { k: KpiAdmin; terputus: KpiAdmin["nomor"]["tertaut"]; kini: number }) {
  const jumlah = (terputus.length ? 1 : 0) + (k.menunggu.jumlah ? 1 : 0) + k.berakhir.length + k.kuotaMenipis.length;
  return (
    <section data-tur="admin-perhatian" aria-labelledby="judul-perhatian" className="card flex min-w-0 flex-col p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id="judul-perhatian" className="text-[15px] font-bold tracking-tight">
          Perlu perhatian
        </h2>
        {jumlah > 0 && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11.5px] font-semibold text-warning tabular-nums">{angka(jumlah)}</span>}
      </div>
      {jumlah === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
          <span className="grid size-11 place-items-center rounded-full bg-success-soft text-success">
            <CircleCheck className="size-5" aria-hidden />
          </span>
          <p className="mt-3 text-[13.5px] font-semibold">Semua aman</p>
          <p className="mt-0.5 max-w-64 text-[12.5px] text-muted">Tidak ada nomor terputus, tagihan tertunda, langganan hampir habis, atau kuota menipis.</p>
        </div>
      ) : (
        <ul data-analitik-privat className="mt-2 space-y-0.5">
          {terputus.length > 0 && (
            <Butir
              nada="bahaya"
              ikon={<WifiOff className="size-4" aria-hidden />}
              judul={`${angka(terputus.length)} nomor WhatsApp terputus`}
              isi={`AI tidak membalas di sana: ${terputus
                .slice(0, 2)
                .map((n) => n.email)
                .join(", ")}${terputus.length > 2 ? `, +${terputus.length - 2} lainnya` : ""}`}
              href={terputus.length === 1 ? `/admin/pengguna/${terputus[0].userId}` : "/admin/pengguna"}
            />
          )}
          {k.menunggu.jumlah > 0 && (
            <Butir
              nada="waspada"
              ikon={<Clock className="size-4" aria-hidden />}
              judul={`${angka(k.menunggu.jumlah)} pembayaran menunggu`}
              isi={`Rp${angka(k.menunggu.nilai)} belum dibayar (7 hari terakhir)`}
              href="/admin/transaksi"
            />
          )}
          {k.kuotaMenipis.map((q) => {
            const p = Math.round((q.terpakai / q.kuota) * 100);
            const habis = q.terpakai >= q.kuota;
            return (
              <Butir
                key={`kuota-${q.userId}`}
                nada={habis ? "bahaya" : "waspada"}
                ikon={<Gauge className="size-4" aria-hidden />}
                judul={q.email}
                isi={`${habis ? "Kuota habis" : `Kuota ${p}% terpakai`} · ${angka(q.terpakai)}/${angka(q.kuota)} balasan ${q.paket}`}
                href={`/admin/pengguna/${q.userId}`}
              >
                <span className="mt-1.5 block">
                  <Meter persen={p} label={`Kuota balasan ${q.email} terpakai`} nada={habis ? "bahaya" : "waspada"} />
                </span>
              </Butir>
            );
          })}
          {k.berakhir.map((b) => (
            <Butir
              key={`akhir-${b.userId}`}
              nada="waspada"
              ikon={<CalendarClock className="size-4" aria-hidden />}
              judul={b.email}
              isi={`${b.paket} berakhir ${tanggal(b.sampai)} · ${sisaWaktu(b.sampai, kini)}`}
              href={`/admin/pengguna/${b.userId}`}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Batang horizontal satu rona (besaran, bukan identitas): panjang = jumlah pelanggan aktif per paket. */
function PerPaket({ k }: { k: KpiAdmin }) {
  const maks = Math.max(1, ...k.berbayar.perPaket.map((p) => p.jumlah));
  const gratis = Math.max(0, k.akun.pengguna - k.berbayar.kini);
  const konversi = persen(k.berbayar.kini, k.akun.pengguna);
  return (
    <section data-tur="admin-paket" aria-labelledby="judul-paket" className="card flex flex-col p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id="judul-paket" className="text-[15px] font-bold tracking-tight">
          Pelanggan aktif per paket
        </h2>
        <Link href="/admin/paket" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-accent hover:underline">
          Paket & harga <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
      <p className="hint mt-0.5">
        {angka(k.berbayar.kini)} berbayar · {angka(gratis)} masih Gratis
      </p>
      {k.berbayar.perPaket.length === 0 ? (
        <p className="mt-5 text-[13px] text-muted">Belum ada pelanggan berbayar. Paket bisa diberikan manual dari halaman Pengguna.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {k.berbayar.perPaket.map((p) => {
            const bagian = persen(p.jumlah, k.berbayar.kini) ?? 0;
            return (
              <li key={p.nama} title={`${p.nama}: ${angka(p.jumlah)} pelanggan (${bagian}% dari berbayar)`}>
                <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
                  <span className="truncate font-medium">{p.nama}</span>
                  <span className="shrink-0 tabular-nums">
                    <span className="font-bold">{angka(p.jumlah)}</span> <span className="text-muted">· {bagian}%</span>
                  </span>
                </div>
                <div className="mt-1.5 h-2 rounded-full bg-subtle">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, (p.jumlah / maks) * 100)}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <dl className="mt-auto grid grid-cols-2 gap-3 pt-5">
        <div className="rounded-xl bg-subtle px-3.5 py-3">
          <dt className="text-[11.5px] font-medium text-muted">Konversi ke berbayar</dt>
          <dd className="mt-1 text-[18px] leading-none font-bold">{konversi === null ? "–" : `${konversi}%`}</dd>
          <dd className="mt-1 text-[11.5px] text-muted">dari semua akun pengguna</dd>
        </div>
        <div className="rounded-xl bg-subtle px-3.5 py-3">
          <dt className="text-[11.5px] font-medium text-muted">Pendapatan per pelanggan</dt>
          <dd className="mt-1 text-[18px] leading-none font-bold">{k.berbayar.kini ? rupiahRingkas(Math.round(k.pendapatan.kini / k.berbayar.kini)) : "–"}</dd>
          <dd className="mt-1 text-[11.5px] text-muted">{PERIODE_HARI} hari terakhir</dd>
        </div>
      </dl>
    </section>
  );
}

export function KerangkaKpi() {
  return (
    <div aria-hidden className="space-y-4 lg:space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <div className="col-span-2 h-44 animate-denyut rounded-2xl bg-ink/90 xl:col-span-1" />
        <div className="card h-44 animate-denyut" />
        <div className="card h-44 animate-denyut" />
        <div className="card col-span-2 h-44 animate-denyut xl:col-span-1" />
      </div>
      <div className="card h-32 animate-denyut" />
      <div className="grid grid-cols-1 gap-4 lg:gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="card h-80 animate-denyut" />
        <div className="card h-80 animate-denyut" />
      </div>
    </div>
  );
}
