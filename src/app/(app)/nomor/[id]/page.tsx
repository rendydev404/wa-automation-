import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Bot, ChevronRight, FileText, MessageCircleMore, Users } from "lucide-react";
import { ConnectionCard } from "@/components/connection-card";
import { HistoriPercakapan } from "@/components/conversation-history";
import { KnowledgePanel } from "@/components/knowledge-panel";
import { NavBagian } from "@/components/nav-bagian";
import { PanelPelajaran } from "@/components/panel-pelajaran";
import { HapusNomor, LencanaTerhubung, NumberSettings, SaklarBot, SaklarSinkron } from "@/components/number-settings";
import { KartuStat, Meter, Sparkline } from "@/components/stat";
import { TestChat } from "@/components/test-chat";
import { sekarang } from "@/lib/db";
import { angka, formatNomor, tanggal } from "@/lib/format";
import { BATAS_UTUH, daftarDokumen } from "@/lib/knowledge";
import { nomorById, statHarian, tanggalWib } from "@/lib/numbers";
import { daftarPelajaran, jumlahPelajaran } from "@/lib/pelajaran";
import { ambilPesanPercakapan, daftarPercakapan, ringkasanPercakapan } from "@/lib/percakapan";
import { requireUser } from "@/lib/session";
import { konfigurasi as konfigurasiSinkron, nomorSinkron, statusSinkron, type Status } from "@/lib/sinkron";
import { deretHarian, hariTerakhir, persen } from "@/lib/tren";

function teksStatusSinkron(s: Status): string {
  if (s.galat) return `Tarikan terakhir gagal: ${s.galat}`;
  if (!s.waktu) return "Belum pernah menarik data.";
  return `Terakhir diperbarui ${tanggal(s.waktu)} (${s.karakter.toLocaleString("id-ID")} karakter).`;
}

export default function HalamanNomor(props: PageProps<"/nomor/[id]">) {
  return (
    <div>
      <nav aria-label="Jejak halaman" className="mb-5">
        <ol className="flex items-center gap-1.5 text-[13px]">
          <li>
            <Link href="/" className="font-medium text-muted transition-colors hover:text-fg">
              Ringkasan
            </Link>
          </li>
          <li aria-hidden>
            <ChevronRight className="size-3.5 text-faint" />
          </li>
          <li aria-current="page" className="font-medium text-fg">
            Detail nomor
          </li>
        </ol>
      </nav>
      <Suspense fallback={<Kerangka />}>
        <Isi params={props.params} />
      </Suspense>
    </div>
  );
}

async function Isi({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const id = Number((await params).id);
  const nomor = Number.isInteger(id) ? await nomorById(id) : undefined;
  if (!nomor) notFound();

  const hari = hariTerakhir(tanggalWib(), 7);
  const [dokumen, sinkronIds, statusSs, ringkasanChat, daftarChat, stat, totalPelajaran, pelajaran] = await Promise.all([
    daftarDokumen(id),
    nomorSinkron(),
    statusSinkron(),
    ringkasanPercakapan(id),
    daftarPercakapan(id),
    statHarian(hari[0], id),
    jumlahPelajaran(id),
    daftarPelajaran(id),
  ]);
  const chatPertama = daftarChat.daftar[0] ? await ambilPesanPercakapan(id, daftarChat.daftar[0].id) : null;
  const total = dokumen.reduce((n, d) => n + d.jumlah_karakter, 0);
  const tren = deretHarian(hari, stat);
  const kini = tren[tren.length - 1];
  const rasio = persen(kini.dibalas, kini.masuk);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <span className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-ink text-xl font-bold text-ink-signal uppercase">
            <span aria-hidden className="kisi-tinta absolute inset-0" />
            <span className="relative">{nomor.label.trim().charAt(0) || "#"}</span>
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <h1 className="truncate text-2xl font-bold tracking-tight sm:text-[28px]">{nomor.label}</h1>
              <LencanaTerhubung id={nomor.id} />
            </div>
            <p className="mt-0.5 text-muted tabular-nums">{nomor.wa_id ? formatNomor(nomor.wa_id) : "Belum ada nomor tertaut"}</p>
          </div>
        </div>
        <div className="card flex items-center px-4 py-3 sm:min-w-64">
          <SaklarBot id={nomor.id} aktif={!!nomor.bot_aktif} label={nomor.label} />
        </div>
      </header>

      <section aria-label="Statistik nomor ini" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KartuStat
          label="Pesan masuk hari ini"
          nilai={angka(kini.masuk)}
          ikon={<MessageCircleMore className="size-4" aria-hidden />}
          keterangan={`7 hari: ${angka(tren.reduce((a, t) => a + t.masuk, 0))}`}
        >
          <Sparkline nilai={tren.map((t) => t.masuk)} warna="var(--c-seri-masuk)" className="h-7 w-[calc(100%-6px)]" />
        </KartuStat>
        <KartuStat
          label="Dibalas AI hari ini"
          nilai={angka(kini.dibalas)}
          ikon={<Bot className="size-4" aria-hidden />}
          keterangan={rasio === null ? "Belum ada pesan masuk" : `${rasio}% dari pesan masuk`}
        >
          {rasio !== null && <Meter persen={rasio} label="Persentase pesan yang dibalas AI hari ini" />}
        </KartuStat>
        <KartuStat
          label="Pelanggan"
          nilai={angka(ringkasanChat.total_percakapan)}
          ikon={<Users className="size-4" aria-hidden />}
          keterangan={`${angka(ringkasanChat.total_masuk)} pesan masuk sepanjang waktu`}
        />
        <KartuStat
          label="Dokumen knowledge"
          nilai={angka(dokumen.length)}
          ikon={<FileText className="size-4" aria-hidden />}
          keterangan={total === 0 ? "Belum ada isi" : `${angka(total)} karakter`}
        />
      </section>

      <NavBagian />

      <div id="koneksi">
        <ConnectionCard id={nomor.id} />
      </div>

      <HistoriPercakapan
        numberId={nomor.id}
        ringkasanAwal={ringkasanChat}
        daftarAwal={daftarChat.daftar}
        adaLagiAwal={daftarChat.adaLagi}
        pesanAwal={chatPertama?.pesan ?? []}
        adaSebelumnyaAwal={chatPertama?.adaSebelumnya ?? false}
        kiniAwal={sekarang()}
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div id="knowledge" className="min-w-0 space-y-6">
          <KnowledgePanel
            numberId={nomor.id}
            total={total}
            batasUtuh={BATAS_UTUH}
            dokumen={dokumen.map((d) => ({
              id: d.id,
              judul: d.judul,
              sumber: d.sumber,
              ukuran_byte: d.ukuran_byte,
              jumlah_karakter: d.jumlah_karakter,
              tanggal: tanggal(d.created_at),
            }))}
          />
          <PanelPelajaran
            key={`${totalPelajaran}-${pelajaran.daftar[0]?.id ?? 0}-${nomor.belajar}`}
            numberId={nomor.id}
            aktif={nomor.belajar}
            total={totalPelajaran}
            daftarAwal={pelajaran.daftar}
            adaLagiAwal={pelajaran.adaLagi}
            kini={sekarang()}
          />
        </div>
        <div className="min-w-0 space-y-6">
          <div id="uji">
            <TestChat numberId={nomor.id} />
          </div>
          <SaklarSinkron id={nomor.id} aktif={sinkronIds.includes(nomor.id)} siap={!!konfigurasiSinkron()} keterangan={teksStatusSinkron(statusSs)} />
          <div id="pengaturan">
            <NumberSettings
              id={nomor.id}
              label={nomor.label}
              instruksi={nomor.instruksi}
              tungguDetik={nomor.tunggu_detik}
              tungguBacaDetik={nomor.tunggu_baca_detik}
              jedaDetik={nomor.jeda_detik}
            />
          </div>
        </div>
      </div>

      <HapusNomor id={nomor.id} />
    </div>
  );
}

function Kerangka() {
  return (
    <div className="space-y-6" aria-hidden>
      <div className="flex items-center gap-4">
        <div className="size-14 animate-denyut rounded-2xl bg-ink/90" />
        <div className="space-y-2">
          <div className="h-7 w-56 animate-denyut rounded-lg bg-subtle" />
          <div className="h-4 w-36 animate-denyut rounded bg-subtle" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card h-32 animate-denyut" />
        ))}
      </div>
      <div className="card h-48 animate-denyut" />
      <div className="card h-[520px] animate-denyut" />
    </div>
  );
}
