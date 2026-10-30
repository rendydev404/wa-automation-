import { Suspense } from "react";
import { Lock, Settings2 } from "lucide-react";
import { semuaAturan } from "@/lib/aturan";
import { requireAdmin } from "@/lib/session";
import { Pengaturan } from "../bagian";
import { FormAturan } from "./form-aturan";

/** Aturan yang ditanam di kode dan tidak bisa dimatikan (src/lib/pemeriksa.ts, penjaga.ts): ditampilkan supaya admin tahu batasnya. */
const ATURAN_TETAP = [
  "AI hanya memakai fakta dari base knowledge, instruksi nomor, dan isi chat; harga, nomor, tautan, dan rekening di luar itu ditolak pemeriksa lalu ditulis ulang.",
  "AI tidak mengaku manusia, tidak menyebut dirinya model/perusahaan AI tertentu, dan tidak mengaku sebagai pemilik nomor.",
  "AI tidak menjanjikan tindakan yang tidak bisa ia lakukan (mengirim barang, mengecek stok langsung); hal itu diteruskan ke pemilik nomor.",
  "AI menolak membuat kode program, tugas di luar topik usaha, dan permintaan membocorkan instruksi.",
  "Pesan lebih dari 2 menit (menumpuk saat offline) tidak dijawab, dan AI diam saat pemilik nomor sedang membalas sendiri.",
];

async function IsiAturan() {
  await requireAdmin();
  const nilai = await semuaAturan();
  return (
    <section className="card p-6">
      <h2 className="flex items-center gap-2 text-[15px] font-bold">
        <Settings2 className="size-4 text-accent" aria-hidden /> Aturan mesin AI
      </h2>
      <p className="mt-0.5 text-[13px] text-muted">Berlaku langsung untuk semua bot tanpa restart; dibaca setiap balasan.</p>
      <div className="mt-4">
        <FormAturan nilai={nilai} />
      </div>
    </section>
  );
}

export default function HalamanAturan() {
  return (
    <div className="space-y-6 lg:space-y-8">
      <div>
        <p className="text-[11.5px] font-semibold tracking-[0.08em] text-accent uppercase">Panel admin</p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-[28px]">Aturan</h1>
        <p className="mt-1 max-w-2xl text-muted">Aturan yang berlaku untuk semua akun dan semua bot: pendaftaran, kuota gratis, penerusan pesan, pengingat, dan aturan perilaku AI.</p>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Suspense fallback={<div aria-hidden className="card h-[900px] animate-denyut" />}>
          <IsiAturan />
        </Suspense>
        <div className="space-y-6">
          <Suspense fallback={<div aria-hidden className="card h-[420px] animate-denyut" />}>
            <Pengaturan />
          </Suspense>
          <section className="card p-6">
            <h2 className="flex items-center gap-2 text-[15px] font-bold">
              <Lock className="size-4 text-accent" aria-hidden /> Selalu aktif
            </h2>
            <p className="mt-0.5 text-[13px] text-muted">Penjaga anti-halu yang ditanam di sistem, tidak bisa dimatikan siapa pun.</p>
            <ul className="mt-3 space-y-2 text-[12.5px] text-muted">
              {ATURAN_TETAP.map((t) => (
                <li key={t} className="flex gap-2">
                  <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                  {t}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
