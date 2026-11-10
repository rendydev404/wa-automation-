"use client";

import type { ReactNode } from "react";
import { AlertTriangle, BookOpen, Bot, Cpu, Smartphone, TriangleAlert } from "lucide-react";
import { angka, jamWib } from "@/lib/format";
import { useBahasa } from "./bahasa";
import { KartuStat } from "./stat";
import { Pill } from "./ui";
import { useWaStatus } from "./wa-status";

/** Bagian Ringkasan yang hidup dari poller status bersama (tanpa permintaan tambahan). */

export function KartuTerhubung({ total }: { total: number }) {
  const { t } = useBahasa();
  const { data } = useWaStatus();
  const semua = data ? Object.values(data.nomor) : [];
  const jumlah = data ? semua.length : total;
  const ok = semua.filter((s) => s.status === "WORKING").length;
  return (
    <KartuStat
      label={t("Nomor terhubung", "Connected numbers")}
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
      keterangan={
        !data
          ? t("Memeriksa koneksi…", "Checking connections…")
          : jumlah === 0
            ? t("Belum ada nomor", "No numbers yet")
            : ok === jumlah
              ? t("Semua nomor tersambung", "All numbers connected")
              : t(`${jumlah - ok} nomor perlu perhatian`, `${jumlah - ok} ${jumlah - ok === 1 ? "number needs" : "numbers need"} attention`)
      }
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
  const { b, t } = useBahasa();
  const { data } = useWaStatus();
  return (
    <section aria-labelledby="judul-sistem" className="card min-w-0 overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <h2 id="judul-sistem" className="text-[15px] font-bold tracking-tight">
          {t("Kesehatan sistem", "System health")}
        </h2>
        <p className="hint mt-0.5">{t("Diperbarui otomatis selagi halaman terbuka.", "Updates automatically while this page is open.")}</p>
      </div>
      <ul className="divide-y divide-line">
        <Baris
          ikon={<Cpu className="size-4" aria-hidden />}
          judul={t("Asisten AI", "AI assistant")}
          keterangan={
            !data ? t("Memeriksa…", "Checking…") : data.ai ? t("Siap membalas pelanggan", "Ready to reply to customers") : t("Pesan pelanggan tidak akan terbalas", "Customer messages won't get a reply")
          }
          kanan={
            !data ? (
              <Pill nada="abu">{t("Memeriksa", "Checking")}</Pill>
            ) : data.ai ? (
              <Pill nada="hijau">{t("Aktif", "Active")}</Pill>
            ) : (
              <Pill nada="merah">{t("Mati", "Down")}</Pill>
            )
          }
        />
        <Baris
          ikon={<Bot className="size-4" aria-hidden />}
          judul={t("Balasan otomatis", "Auto-reply")}
          keterangan={total === 0 ? t("Belum ada nomor", "No numbers yet") : t(`Aktif di ${botAktif} dari ${total} nomor`, `On for ${botAktif} of ${total} ${total === 1 ? "number" : "numbers"}`)}
          kanan={<span className="text-[13px] font-bold tabular-nums">{total === 0 ? "—" : `${botAktif}/${total}`}</span>}
        />
        <Baris
          ikon={<BookOpen className="size-4" aria-hidden />}
          judul={t("Informasi Usaha", "Business Info")}
          keterangan={
            dokumen === 0
              ? t("Belum ada dokumen", "No documents yet")
              : t(`${angka(dokumen)} dokumen · ${angka(karakter)} karakter`, `${angka(dokumen, b)} ${dokumen === 1 ? "document" : "documents"} · ${angka(karakter, b)} characters`)
          }
        />
        <Baris
          ikon={<TriangleAlert className="size-4" aria-hidden />}
          judul={t("Galat terakhir AI", "Latest AI error")}
          keterangan={data?.galatAi ? `${jamWib(data.galatAi.at, b)} WIB · ${data.galatAi.pesan}` : t("Tidak ada dalam 24 jam terakhir", "None in the last 24 hours")}
          kanan={data?.galatAi ? <Pill nada="kuning">{t("Ada", "Yes")}</Pill> : null}
        />
      </ul>
    </section>
  );
}

/** Peringatan mencolok hanya saat AI benar-benar tidak terjangkau. */
export function PeringatanAi() {
  const { t } = useBahasa();
  const { data } = useWaStatus();
  if (!data || data.ai) return null;
  return (
    <div role="alert" className="flex animate-masuk gap-3 rounded-2xl border border-danger/20 bg-danger-soft px-4 py-3 text-[13px] text-danger">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>
        <b className="font-semibold">{t("AI sedang tidak terjangkau.", "The AI is currently unreachable.")}</b>{" "}
        {t("Pesan pelanggan tidak akan terbalas sampai layanannya kembali.", "Customer messages won't get a reply until the service is back.")}
      </p>
    </div>
  );
}
