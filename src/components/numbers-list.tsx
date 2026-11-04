"use client";

import { useOptimistic, useTransition } from "react";
import Link from "next/link";
import { ArrowUpRight, BookOpen, QrCode } from "lucide-react";
import { setBotAktifAction } from "@/app/actions";
import { angka, formatNomor } from "@/lib/format";
import { LencanaSesi } from "./connection-card";
import { Sparkline } from "./stat";
import { TombolTambahNomor } from "./tambah-nomor";
import { Saklar } from "./ui";
import { useSesiNomor } from "./wa-status";

export interface KartuNomor {
  id: number;
  wa_id: string | null;
  label: string;
  bot_aktif: boolean;
  jumlah_dokumen: number;
  jumlah_karakter: number;
  dibalas_hari_ini: number;
  masuk_hari_ini: number;
  jumlah_percakapan: number;
  /** Pesan masuk 7 hari terakhir, terlama dulu. */
  tren: number[];
}

export function NumbersList({ nomor }: { nomor: KartuNomor[] }) {
  return (
    <section aria-labelledby="judul-nomor">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 id="judul-nomor" className="flex items-center gap-2 text-[17px] font-bold tracking-tight">
            Nomor WhatsApp
            <span className="rounded-md bg-subtle px-1.5 py-0.5 text-xs font-semibold text-muted tabular-nums">{nomor.length}</span>
          </h2>
          <p className="hint mt-0.5 max-w-2xl">Tiap nomor punya koneksi dan base knowledge sendiri. AI menjawab memakai knowledge nomor yang menerima chat.</p>
        </div>
      </div>

      {nomor.length === 0 ? (
        <div className="card grid place-items-center border-dashed px-6 py-14 text-center">
          <span className="mb-3 grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
            <QrCode className="size-5" aria-hidden />
          </span>
          <p className="text-[15px] font-bold">Belum ada nomor</p>
          <p className="hint mt-1 mb-5 max-w-sm">Tambah nomor, pindai kode QR-nya dari HP, lalu isi base knowledge-nya.</p>
          <TombolTambahNomor />
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {nomor.map((n) => (
            <Kartu key={n.id} n={n} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Angka({ label, nilai }: { label: string; nilai: number }) {
  return (
    <div className="min-w-0 px-2 py-2.5 sm:px-3">
      <dt className="text-[11px] leading-tight font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 text-lg leading-tight font-bold tabular-nums">{angka(nilai)}</dd>
    </div>
  );
}

function Kartu({ n }: { n: KartuNomor }) {
  const sesi = useSesiNomor(n.id);
  const [aktif, setAktif] = useOptimistic(n.bot_aktif);
  const [, mulai] = useTransition();
  const wa = sesi?.status === "WORKING" && sesi.waId ? sesi.waId : n.wa_id;
  const perluScan = sesi && sesi.status !== "WORKING";
  return (
    <li className="card group flex min-w-0 flex-col overflow-hidden transition-[border-color,box-shadow] duration-200 hover:border-line-strong hover:shadow-[0_14px_34px_-20px_rgba(21,32,27,0.4)]">
      <Link href={`/nomor/${n.id}`} prefetch className="flex items-start gap-3 p-5 pb-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-[15px] font-bold text-accent uppercase">
          {n.label.trim().charAt(0) || "#"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold tracking-tight">{n.label}</p>
          <p className="mt-0.5 truncate text-[13px] text-muted tabular-nums">{wa ? formatNomor(wa) : "Belum ada nomor tertaut"}</p>
          {sesi && (
            <div className="mt-2">
              <LencanaSesi status={sesi.status} />
            </div>
          )}
        </div>
        <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-faint transition-colors group-hover:text-accent" aria-hidden />
      </Link>

      <dl className="mx-5 grid grid-cols-3 divide-x divide-line rounded-xl bg-subtle/70">
        <Angka label="Masuk hari ini" nilai={n.masuk_hari_ini} />
        <Angka label="Dibalas AI" nilai={n.dibalas_hari_ini} />
        <Angka label="Pelanggan" nilai={n.jumlah_percakapan} />
      </dl>

      <div className="flex items-center justify-between gap-4 px-5 py-4">
        <p className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted">
          <BookOpen className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{n.jumlah_dokumen ? `${n.jumlah_dokumen} dokumen · ${angka(n.jumlah_karakter)} karakter` : "Knowledge kosong"}</span>
        </p>
        <div className="flex shrink-0 items-center gap-2" title="Pesan masuk 7 hari terakhir">
          <span className="text-[11px] text-faint">7 hari</span>
          <Sparkline nilai={n.tren} warna="var(--c-seri-masuk)" className="h-6 w-16" />
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line bg-subtle/40 px-5 py-3">
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
