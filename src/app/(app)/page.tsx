import { Suspense } from "react";
import { NumbersList } from "@/components/numbers-list";
import { daftarNomor } from "@/lib/numbers";
import { requireUser } from "@/lib/session";

export default function Beranda() {
  return (
    <div className="space-y-9">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Asisten WhatsApp</h1>
        <p className="mt-1 text-muted">Tambah nomor, pindai QR-nya, isi base knowledge-nya, dan biarkan AI membalas saat Anda tidak sempat.</p>
      </div>
      <Suspense fallback={<KerangkaDaftar />}>
        <Daftar />
      </Suspense>
    </div>
  );
}

async function Daftar() {
  await requireUser();
  const nomor = (await daftarNomor()).map((n) => ({
    id: n.id,
    wa_id: n.wa_id,
    label: n.label,
    bot_aktif: !!n.bot_aktif,
    jumlah_dokumen: n.jumlah_dokumen,
    jumlah_karakter: n.jumlah_karakter,
    dibalas_hari_ini: n.dibalas_hari_ini,
    masuk_hari_ini: n.masuk_hari_ini,
  }));
  return <NumbersList nomor={nomor} />;
}

function KerangkaDaftar() {
  return (
    <div aria-hidden>
      <div className="mb-3 h-10 w-64 animate-denyut rounded-lg bg-subtle" />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card h-40 animate-denyut" />
        <div className="card h-40 animate-denyut" />
      </div>
    </div>
  );
}
