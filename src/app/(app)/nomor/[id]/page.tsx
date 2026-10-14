import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ConnectionCard } from "@/components/connection-card";
import { KnowledgePanel } from "@/components/knowledge-panel";
import { HapusNomor, LencanaTerhubung, NumberSettings, SaklarBot } from "@/components/number-settings";
import { TestChat } from "@/components/test-chat";
import { formatNomor, tanggal } from "@/lib/format";
import { BATAS_UTUH, daftarDokumen } from "@/lib/knowledge";
import { nomorById } from "@/lib/numbers";
import { requireUser } from "@/lib/session";

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

  const dokumen = await daftarDokumen(id);
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
