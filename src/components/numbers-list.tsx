"use client";

import { useOptimistic, useTransition } from "react";
import Link from "@/components/link";
import { ArrowUpRight, BookOpen, CreditCard, QrCode } from "lucide-react";
import { setBotAktifAction } from "@/app/actions";
import { angka, formatNomor } from "@/lib/format";
import { useBahasa } from "./bahasa";
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

export function NumbersList({ nomor, adaKuota = true }: { nomor: KartuNomor[]; adaKuota?: boolean }) {
  const { t } = useBahasa();
  return (
    <section aria-labelledby="judul-nomor">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 id="judul-nomor" className="flex items-center gap-2 text-[17px] font-bold tracking-tight">
            {t("Nomor WhatsApp", "WhatsApp numbers")}
            <span className="rounded-md bg-subtle px-1.5 py-0.5 text-xs font-semibold text-muted tabular-nums">{nomor.length}</span>
          </h2>
          <p className="hint mt-0.5 max-w-2xl">
            {t(
              "Tiap nomor punya koneksi dan Informasi Usaha sendiri. AI menjawab memakai Informasi Usaha nomor yang menerima chat.",
              "Each number has its own connection and Business Info. The AI answers using the Business Info of the number that receives the chat."
            )}
          </p>
        </div>
      </div>

      {nomor.length === 0 ? (
        <div className="card grid place-items-center border-dashed px-6 py-14 text-center">
          <span className="mb-3 grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
            <QrCode className="size-5" aria-hidden />
          </span>
          <p className="text-[15px] font-bold">{t("Belum ada nomor", "No numbers yet")}</p>
          <p className="hint mt-1 mb-5 max-w-sm">
            {t("Tambah nomor, pindai kode QR-nya dari HP, lalu isi Informasi Usaha-nya.", "Add a number, scan its QR code with your phone, then fill in its Business Info.")}
          </p>
          <TombolTambahNomor />
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {nomor.map((n) => (
            <Kartu key={n.id} n={n} adaKuota={adaKuota} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Angka({ label, nilai }: { label: string; nilai: number }) {
  const { b } = useBahasa();
  return (
    <div className="min-w-0 px-2 py-2.5 sm:px-3">
      <dt className="text-[11px] leading-tight font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 text-lg leading-tight font-bold tabular-nums">{angka(nilai, b)}</dd>
    </div>
  );
}

function Kartu({ n, adaKuota }: { n: KartuNomor; adaKuota: boolean }) {
  const { b, t } = useBahasa();
  const sesi = useSesiNomor(n.id);
  const [aktif, setAktif] = useOptimistic(n.bot_aktif);
  const [, mulai] = useTransition();
  const wa = sesi?.status === "WORKING" && sesi.waId ? sesi.waId : n.wa_id;
  const perluScan = sesi && sesi.status !== "WORKING";
  const siap = n.jumlah_karakter > 0 && adaKuota;
  return (
    <li className="card group flex min-w-0 flex-col overflow-hidden transition-[border-color,box-shadow] duration-200 hover:border-line-strong hover:shadow-[0_14px_34px_-20px_rgba(21,32,27,0.4)]">
      <Link href={`/nomor/${n.id}`} prefetch data-analitik="Kartu nomor: buka" className="flex items-start gap-3 p-5 pb-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-[15px] font-bold text-accent uppercase">
          {n.label.trim().charAt(0) || "#"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold tracking-tight">{n.label}</p>
          <p className="mt-0.5 truncate text-[13px] text-muted tabular-nums">{wa ? formatNomor(wa) : t("Belum ada nomor tertaut", "No number linked yet")}</p>
          {sesi && (
            <div className="mt-2">
              <LencanaSesi status={sesi.status} />
            </div>
          )}
        </div>
        <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-faint transition-colors group-hover:text-accent" aria-hidden />
      </Link>

      <dl className="mx-5 grid grid-cols-3 divide-x divide-line rounded-xl bg-subtle/70">
        <Angka label={t("Masuk hari ini", "Incoming today")} nilai={n.masuk_hari_ini} />
        <Angka label={t("Dibalas AI", "AI replies")} nilai={n.dibalas_hari_ini} />
        <Angka label={t("Pelanggan", "Customers")} nilai={n.jumlah_percakapan} />
      </dl>

      <div className="flex items-center justify-between gap-4 px-5 py-4">
        <p className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted">
          <BookOpen className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{n.jumlah_dokumen
              ? t(
                  `${n.jumlah_dokumen} dokumen · ${angka(n.jumlah_karakter)} karakter`,
                  `${n.jumlah_dokumen} ${n.jumlah_dokumen === 1 ? "document" : "documents"} · ${angka(n.jumlah_karakter, b)} characters`
                )
              : t("Informasi Usaha kosong", "No Business Info yet")}</span>
        </p>
        <div className="flex shrink-0 items-center gap-2" title={t("Pesan masuk 7 hari terakhir", "Incoming messages, last 7 days")}>
          <span className="text-[11px] text-faint">{t("7 hari", "7 days")}</span>
          <Sparkline nilai={n.tren} warna="var(--c-seri-masuk)" className="h-6 w-16" />
        </div>
      </div>

      <div data-analitik-privat className="mt-auto flex items-center justify-between gap-3 border-t border-line bg-subtle/40 px-5 py-3">
        {n.jumlah_karakter === 0 ? (
          <Link href={`/nomor/${n.id}#knowledge`} data-analitik="Kartu nomor: isi knowledge" className="flex items-center gap-1.5 text-[13px] font-semibold text-warning hover:underline">
            {t("Isi Informasi Usaha dulu", "Add Business Info first")}
          </Link>
        ) : !adaKuota ? (
          <Link href="/langganan" data-analitik="Kartu nomor: pilih paket" className="flex items-center gap-1.5 text-[13px] font-semibold text-warning hover:underline">
            <CreditCard className="size-4 shrink-0" aria-hidden /> {t("Pilih paket agar AI aktif", "Choose a plan to activate AI")}
          </Link>
        ) : perluScan ? (
          <Link href={`/nomor/${n.id}`} data-analitik="Kartu nomor: scan QR" className="flex items-center gap-1.5 text-[13px] font-semibold text-accent hover:underline">
            <QrCode className="size-4" aria-hidden /> {t("Scan QR untuk menautkan", "Scan QR to link")}
          </Link>
        ) : (
          <span className="text-[13px] font-medium">{aktif ? t("Balasan otomatis aktif", "Auto-reply on") : t("Balasan otomatis mati", "Auto-reply off")}</span>
        )}
        <Saklar
          aktif={aktif && siap}
          disabled={!siap}
          label={t(`Balasan otomatis ${n.label}`, `Auto-reply for ${n.label}`)}
          analitik="Kartu nomor: saklar balasan otomatis"
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
