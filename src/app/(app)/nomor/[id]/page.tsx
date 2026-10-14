import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ConnectionCard } from "@/components/connection-card";
import { HistoriPercakapan } from "@/components/conversation-history";
import { KnowledgePanel } from "@/components/knowledge-panel";
import { HapusNomor, LencanaTerhubung, NumberSettings, SaklarBot, SaklarSinkron } from "@/components/number-settings";
import { TestChat } from "@/components/test-chat";
import { sekarang } from "@/lib/db";
import { formatNomor, tanggal } from "@/lib/format";
import { BATAS_UTUH, daftarDokumen } from "@/lib/knowledge";
import { nomorById } from "@/lib/numbers";
import { ambilPesanPercakapan, daftarPercakapan, ringkasanPercakapan } from "@/lib/percakapan";
import { requireUser } from "@/lib/session";
import { konfigurasi as konfigurasiSinkron, nomorSinkron, statusSinkron, type Status } from "@/lib/sinkron";

function teksStatusSinkron(s: Status): string {
  if (s.galat) return `Tarikan terakhir gagal: ${s.galat}`;
  if (!s.waktu) return "Belum pernah menarik data.";
  return `Terakhir diperbarui ${tanggal(s.waktu)} (${s.karakter.toLocaleString("id-ID")} karakter).`;
}

export default function HalamanNomor(props: PageProps<"/nomor/[id]">) {
  return (
    <div>
      <Link href="/" className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden /> Semua nomor
      </Link>
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

  const [dokumen, sinkronIds, statusSs, ringkasanChat, daftarChat] = await Promise.all([
    daftarDokumen(id),
    nomorSinkron(),
    statusSinkron(),
    ringkasanPercakapan(id),
    daftarPercakapan(id),
  ]);
  const chatPertama = daftarChat.daftar[0] ? await ambilPesanPercakapan(id, daftarChat.daftar[0].id) : null;
  const total = dokumen.reduce((n, d) => n + d.jumlah_karakter, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight">{nomor.label}</h1>
            <LencanaTerhubung id={nomor.id} />
          </div>
          <p className="mt-0.5 text-muted tabular-nums">{nomor.wa_id ? formatNomor(nomor.wa_id) : "Belum ada nomor tertaut"}</p>
        </div>
        <SaklarBot id={nomor.id} aktif={!!nomor.bot_aktif} label={nomor.label} />
      </div>

      <ConnectionCard id={nomor.id} />

      <HistoriPercakapan
        numberId={nomor.id}
        ringkasanAwal={ringkasanChat}
        daftarAwal={daftarChat.daftar}
        adaLagiAwal={daftarChat.adaLagi}
        pesanAwal={chatPertama?.pesan ?? []}
        adaSebelumnyaAwal={chatPertama?.adaSebelumnya ?? false}
        kiniAwal={sekarang()}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
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
        <div className="space-y-6">
          <TestChat numberId={nomor.id} />
          <SaklarSinkron id={nomor.id} aktif={sinkronIds.includes(nomor.id)} siap={!!konfigurasiSinkron()} keterangan={teksStatusSinkron(statusSs)} />
          <NumberSettings id={nomor.id} label={nomor.label} instruksi={nomor.instruksi} tungguDetik={nomor.tunggu_detik} tungguBacaDetik={nomor.tunggu_baca_detik} jedaMenit={nomor.jeda_menit} />
        </div>
      </div>

      <HapusNomor id={nomor.id} />
    </div>
  );
}

function Kerangka() {
  return (
    <div className="space-y-6" aria-hidden>
      <div className="h-14 w-72 animate-denyut rounded-xl bg-subtle" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="card h-96 animate-denyut" />
        <div className="card h-96 animate-denyut" />
      </div>
    </div>
  );
}
