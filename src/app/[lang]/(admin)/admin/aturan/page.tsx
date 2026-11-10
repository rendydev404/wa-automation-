import { Suspense } from "react";
import Link from "next/link";
import { Activity, ArrowRight, Lock, Settings2 } from "lucide-react";
import { semuaAturan } from "@/lib/aturan";
import { pengaturanMetaPixel } from "@/lib/meta-pixel";
import { requireStaf } from "@/lib/session";
import { Pengaturan } from "../bagian";
import { FormAturan } from "./form-aturan";

/** Aturan yang ditanam di kode dan tidak bisa dimatikan (src/lib/pemeriksa.ts, penjaga.ts): ditampilkan supaya admin tahu batasnya. */
const ATURAN_TETAP = [
  "AI hanya memakai fakta dari base knowledge, instruksi nomor, dan isi chat; harga, nomor, tautan, dan rekening di luar itu ditolak pemeriksa lalu ditulis ulang.",
  "AI tidak mengaku manusia, tidak menyebut dirinya model/perusahaan AI tertentu, dan tidak mengaku sebagai pemilik nomor.",
  "AI tidak menjanjikan tindakan yang tidak bisa ia lakukan (mengirim barang, mengecek stok langsung); untuk hal itu ia bilang tim akan membalas langsung di chat yang sama.",
  "Bot hanya membalas chat yang masuk: tidak pernah mengirim pesan duluan ke nomor mana pun, supaya nomor tidak diblokir WhatsApp.",
  "AI menolak membuat kode program, tugas di luar topik usaha, dan permintaan membocorkan instruksi.",
  "Pesan lebih dari 2 menit (menumpuk saat offline) tidak dijawab, dan AI diam saat pemilik nomor sedang membalas sendiri.",
];

async function IsiAturan() {
  await requireStaf();
  const nilai = await semuaAturan();
  return (
    <section className="card p-4 sm:p-6">
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

async function KartuRingkasPixel() {
  await requireStaf();
  const px = await pengaturanMetaPixel();
  const aktif = px.aktif && Boolean(px.pixelId);
  return (
    <section className="card p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-bold">
            <Activity className="size-4 text-accent" aria-hidden /> Meta Ads Pixel
          </h2>
          <p className="mt-0.5 text-[13px] text-muted">
            {aktif ? (
              <>
                Aktif dengan ID <code className="font-mono font-semibold text-fg">{px.pixelId}</code>
                {px.capiToken ? " + Conversions API" : ""}.
              </>
            ) : (
              "Belum diaktifkan. Pasang ID Pixel untuk melacak konversi iklan Meta Ads."
            )}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
            aktif ? "bg-success-soft text-success" : "bg-subtle text-muted"
          }`}
        >
          {aktif ? "Aktif" : "Nonaktif"}
        </span>
      </div>
      <div className="mt-4">
        <Link href="/admin/pixel" className="btn btn-ghost border border-line text-[12.5px]">
          Kelola Meta Pixel <ArrowRight className="size-3.5" aria-hidden />
        </Link>
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
        <p className="mt-1 max-w-2xl text-muted">Aturan yang berlaku untuk semua akun dan semua bot: pendaftaran, kuota gratis, pengingat, dan aturan perilaku AI.</p>
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Suspense fallback={<div aria-hidden className="card h-[900px] animate-denyut" />}>
          <IsiAturan />
        </Suspense>
        <div className="space-y-6">
          <Suspense fallback={<div aria-hidden className="card h-[420px] animate-denyut" />}>
            <Pengaturan />
          </Suspense>
          <Suspense fallback={<div aria-hidden className="card h-[140px] animate-denyut" />}>
            <KartuRingkasPixel />
          </Suspense>
          <section className="card p-4 sm:p-6">
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
