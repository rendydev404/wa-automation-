"use client";

import type { ReactNode } from "react";
import { AlertTriangle, BookOpen, Bot, Cpu, Smartphone, TriangleAlert } from "lucide-react";
import { angka, jamWib } from "@/lib/format";
import { KartuStat } from "./stat";
import { Pill } from "./ui";
import { useWaStatus } from "./wa-status";

/** Bagian Ringkasan yang hidup dari poller status bersama (tanpa permintaan tambahan). */

export function KartuTerhubung({ total }: { total: number }) {
  const { data } = useWaStatus();
  const semua = data ? Object.values(data.nomor) : [];
  const jumlah = data ? semua.length : total;
  const ok = semua.filter((s) => s.status === "WORKING").length;
  return (
    <KartuStat
      label="Nomor terhubung"
      ikon={<Smartphone className="size-4" aria-hidden />}
      nilai={
        data ? (
          <>
            {ok}
            <span className="text-lg font-semibold text-faint">/{jumlah}</span>
          </>
        ) : (
          "—"
        )
      }
      keterangan={!data ? "Memeriksa koneksi…" : jumlah === 0 ? "Belum ada nomor" : ok === jumlah ? "Semua nomor tersambung" : `${jumlah - ok} nomor perlu perhatian`}
    >
      {data && jumlah > 0 && (
        <div aria-hidden className="flex gap-0.5">
          {semua.map((s, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full ${
                s.status === "WORKING" ? "bg-accent" : s.status === "SCAN_QR_CODE" || s.status === "STARTING" ? "bg-warning/60" : "bg-line-strong"
              }`}
            />
          ))}
        </div>
      )}
    </KartuStat>
  );
}

function Baris({ ikon, judul, keterangan, kanan }: { ikon: ReactNode; judul: string; keterangan: ReactNode; kanan?: ReactNode }) {
  return (
    <li className="flex items-center gap-3 px-5 py-3.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-subtle text-muted">{ikon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold">{judul}</p>
        <p className="truncate text-xs text-muted">{keterangan}</p>
      </div>
      {kanan}
    </li>
  );
}

export function PanelSistem({ botAktif, total, dokumen, karakter }: { botAktif: number; total: number; dokumen: number; karakter: number }) {
  const { data } = useWaStatus();
  return (
    <section aria-labelledby="judul-sistem" className="card min-w-0 overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <h2 id="judul-sistem" className="text-[15px] font-bold tracking-tight">
          Kesehatan sistem
        </h2>
        <p className="hint mt-0.5">Diperbarui otomatis selagi halaman terbuka.</p>
      </div>
      <ul className="divide-y divide-line">
        <Baris
          ikon={<Cpu className="size-4" aria-hidden />}
          judul="AI Hermes"
          keterangan={!data ? "Memeriksa…" : data.hermes ? "Siap membalas pelanggan" : "Pesan pelanggan tidak akan terbalas"}
          kanan={!data ? <Pill nada="abu">Memeriksa</Pill> : data.hermes ? <Pill nada="hijau">Aktif</Pill> : <Pill nada="merah">Mati</Pill>}
        />
        <Baris
          ikon={<Bot className="size-4" aria-hidden />}
          judul="Balasan otomatis"
          keterangan={total === 0 ? "Belum ada nomor" : `Aktif di ${botAktif} dari ${total} nomor`}
          kanan={<span className="text-[13px] font-bold tabular-nums">{total === 0 ? "—" : `${botAktif}/${total}`}</span>}
        />
        <Baris
          ikon={<BookOpen className="size-4" aria-hidden />}
          judul="Base knowledge"
          keterangan={dokumen === 0 ? "Belum ada dokumen" : `${angka(dokumen)} dokumen · ${angka(karakter)} karakter`}
        />
        <Baris
          ikon={<TriangleAlert className="size-4" aria-hidden />}
          judul="Galat terakhir AI"
          keterangan={data?.galatAi ? `${jamWib(data.galatAi.at)} WIB · ${data.galatAi.pesan}` : "Tidak ada dalam 24 jam terakhir"}
          kanan={data?.galatAi ? <Pill nada="kuning">Ada</Pill> : null}
        />
      </ul>
    </section>
  );
}

/** Peringatan mencolok hanya saat AI benar-benar tidak terjangkau. */
export function PeringatanAi() {
  const { data } = useWaStatus();
  if (!data || data.hermes) return null;
  return (
    <div role="alert" className="flex animate-masuk gap-3 rounded-2xl border border-danger/20 bg-danger-soft px-4 py-3 text-[13px] text-danger">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>
        <b className="font-semibold">AI Hermes tidak terjangkau.</b> Pesan pelanggan tidak akan terbalas sampai layanannya kembali.
      </p>
    </div>
  );
}
