"use client";

import { useActionState, useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, BookOpen, ChevronRight, MessagesSquare, Plus, QrCode, Sparkles, X } from "lucide-react";
import { setBotAktifAction, tambahNomorAction } from "@/app/actions";
import { angka, formatNomor } from "@/lib/format";
import { LencanaSesi } from "./connection-card";
import { Pesan, Saklar, SubmitButton } from "./ui";
import { useSesiNomor, useWaStatus } from "./wa-status";

export interface KartuNomor {
  id: number;
  wa_id: string | null;
  label: string;
  bot_aktif: boolean;
  jumlah_dokumen: number;
  jumlah_karakter: number;
  dibalas_hari_ini: number;
  masuk_hari_ini: number;
}

export function NumbersList({ nomor }: { nomor: KartuNomor[] }) {
  const { data } = useWaStatus();
  const [tambah, setTambah] = useState(false);

  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-bold tracking-tight">Nomor WhatsApp</h2>
          <p className="hint mt-0.5">Tiap nomor punya koneksi dan base knowledge sendiri. AI menjawab memakai knowledge nomor yang menerima chat.</p>
        </div>
        {!tambah && (
          <button type="button" className="btn btn-primary shrink-0" onClick={() => setTambah(true)}>
            <Plus className="size-4" aria-hidden /> Tambah nomor
          </button>
        )}
      </div>

      {data && (!data.hermes || data.galatAi) && (
        <div className="mb-3 flex gap-3 rounded-xl bg-warning-soft px-4 py-3 text-[13px] text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="space-y-0.5">
            {!data.hermes && <p>AI Hermes tidak terjangkau; pesan pelanggan tidak akan terbalas.</p>}
            {data.galatAi && <p>Galat terakhir saat membalas: {data.galatAi.pesan}</p>}
          </div>
        </div>
      )}

      {tambah && <FormTambah tutup={() => setTambah(false)} />}

      {nomor.length === 0 ? (
        !tambah && (
          <div className="card grid place-items-center px-6 py-14 text-center">
            <span className="mb-3 grid size-11 place-items-center rounded-2xl bg-subtle text-muted">
              <QrCode className="size-5" aria-hidden />
            </span>
            <p className="text-[14px] font-semibold">Belum ada nomor</p>
            <p className="hint mt-1 max-w-sm">Tambah nomor, pindai kode QR-nya dari HP, lalu isi base knowledge-nya.</p>
          </div>
        )
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {nomor.map((n) => (
            <Kartu key={n.id} n={n} />
          ))}
        </ul>
      )}

      {data && data.hermes && nomor.length > 0 && (
        <p className="hint mt-3 flex items-center gap-1.5">
          <Sparkles className="size-3.5" aria-hidden /> AI Hermes aktif
        </p>
      )}
    </section>
  );
}

function Kartu({ n }: { n: KartuNomor }) {
  const sesi = useSesiNomor(n.id);
  const [aktif, setAktif] = useOptimistic(n.bot_aktif);
  const [, mulai] = useTransition();
  const wa = sesi?.status === "WORKING" && sesi.waId ? sesi.waId : n.wa_id;
  const perluScan = sesi && sesi.status !== "WORKING";
  return (
    <li className="card flex flex-col">
      <Link href={`/nomor/${n.id}`} prefetch className="group flex items-start justify-between gap-3 px-5 pt-5 pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-[15px] font-bold tracking-tight">{n.label}</p>
            <LencanaSesi status={sesi?.status} />
          </div>
          <p className="mt-0.5 text-[13px] text-muted tabular-nums">{wa ? formatNomor(wa) : "Belum ada nomor tertaut"}</p>
        </div>
        <ChevronRight className="mt-1 size-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>
      <div className="flex flex-wrap gap-x-5 gap-y-1 px-5 pb-4 text-[13px] text-muted">
        <span className="flex items-center gap-1.5">
          <BookOpen className="size-3.5" aria-hidden />
          {n.jumlah_dokumen ? `${n.jumlah_dokumen} dokumen · ${angka(n.jumlah_karakter)} karakter` : "Knowledge kosong"}
        </span>
        <span className="flex items-center gap-1.5">
          <MessagesSquare className="size-3.5" aria-hidden />
          {n.dibalas_hari_ini}/{n.masuk_hari_ini} dibalas hari ini
        </span>
      </div>
      <div className="mt-auto flex items-center justify-between border-t border-line px-5 py-3">
        {perluScan ? (
          <Link href={`/nomor/${n.id}`} className="flex items-center gap-1.5 text-[13px] font-semibold text-accent hover:underline">
            <QrCode className="size-4" aria-hidden /> Scan QR untuk menautkan
          </Link>
        ) : (
          <span className="text-[13px] font-medium">{aktif ? "Balasan otomatis aktif" : "Balasan otomatis mati"}</span>
        )}
        <Saklar
          aktif={aktif}
          label={`Balasan otomatis ${n.label}`}
          onUbah={(v) =>
            mulai(async () => {
              setAktif(v);
              await setBotAktifAction(n.id, v);
            })
          }
        />
      </div>
    </li>
  );
}

function FormTambah({ tutup }: { tutup: () => void }) {
  const [hasil, aksi] = useActionState(tambahNomorAction, null);
  return (
    <form action={aksi} className="card mb-3 animate-masuk p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[14px] font-bold">Tambah nomor</p>
          <p className="hint">Beri nama, lalu kode QR langsung muncul untuk dipindai dari HP nomor tersebut.</p>
        </div>
        <button type="button" onClick={tutup} aria-label="Tutup" className="rounded-lg p-1 text-faint hover:bg-subtle hover:text-fg">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="label" className="label">
            Nama nomor
          </label>
          <input id="label" name="label" required maxLength={60} autoFocus placeholder="CS Outlet Depok" className="field" />
        </div>
        <SubmitButton>
          <QrCode className="size-4" aria-hidden /> Buat &amp; tampilkan QR
        </SubmitButton>
      </div>
      <div className="mt-2">
        <Pesan ok={false}>{hasil?.pesan}</Pesan>
      </div>
    </form>
  );
}
