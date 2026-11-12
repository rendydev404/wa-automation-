"use client";

import { Check, ChevronRight, Smartphone } from "lucide-react";
import { useBahasa } from "./bahasa";
import Link from "./link";
import { bukaTabNomor } from "./tab-nomor";
import { useSesiNomor } from "./wa-status";

/**
 * Kartu "Langkah memulai" di tab Koneksi: urutan yang perlu dilakukan supaya AI mulai membalas, dengan tanda selesai.
 * Status WhatsApp diambil langsung dari pemantau status yang sudah berjalan (tanpa permintaan tambahan).
 */
export function LangkahMulai({
  id,
  adaKnowledge,
  adaKuota = true,
  botAktif,
}: {
  id: number;
  adaKnowledge: boolean;
  adaKuota?: boolean;
  botAktif: boolean;
}) {
  const { t } = useBahasa();
  const sesi = useSesiNomor(id);
  const tersambung = sesi?.status === "WORKING";
  const siap = adaKnowledge && adaKuota;
  const langkah = [
    {
      judul: t("Sambungkan WhatsApp", "Connect WhatsApp"),
      teks: t("Pindai QR atau pakai kode dari HP.", "Scan the QR code or use a code from your phone."),
      selesai: tersambung,
      tab: "koneksi" as const,
      href: null as string | null,
    },
    {
      judul: t("Isi Informasi Usaha", "Add your Business Info"),
      teks: t("Produk, harga, jam buka, cara pesan.", "Products, prices, opening hours, how to order."),
      selesai: adaKnowledge,
      tab: "knowledge" as const,
      href: null as string | null,
    },
    {
      judul: t("Aktifkan paket langganan", "Activate subscription plan"),
      teks: t("Pilih paket agar kuota balasan AI aktif.", "Choose a plan to activate your AI reply quota."),
      selesai: adaKuota,
      tab: null,
      href: "/langganan",
    },
    {
      judul: t("Coba tanya di Uji bot", "Try it in Test bot"),
      teks: t("Pastikan jawabannya sudah pas.", "Make sure the answers look right."),
      selesai: null,
      tab: "uji-bot" as const,
      href: null as string | null,
    },
    {
      judul: t("Balasan otomatis menyala", "Auto-reply active"),
      teks: siap
        ? t("Otomatis aktif. Bisa diatur lewat saklar di atas.", "Automatically on. Toggle anytime at the top.")
        : t("Otomatis menyala begitu Informasi Usaha & langganan aktif.", "Turns on automatically once Business Info & plan are active."),
      selesai: botAktif && siap,
      tab: null,
      href: null as string | null,
    },
  ];
  const beres = langkah.filter((l) => l.selesai).length;
  const wajib = langkah.filter((l) => l.selesai !== null).length;

  return (
    <section className="card overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-bold">{t("Langkah memulai", "Getting started")}</h2>
          <span className="text-[12px] font-semibold text-muted tabular-nums">
            {beres}/{wajib}
          </span>
        </div>
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-subtle">
          <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${(beres / wajib) * 100}%` }} />
        </div>
      </div>
      <ol className="divide-y divide-line">
        {langkah.map((l, i) => {
          const bisaKlik = (l.tab && l.tab !== "koneksi") || (l.href && !l.selesai);
          const isi = (
            <>
              <span
                className={`grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-bold ${
                  l.selesai ? "bg-success text-white" : "border border-line-strong text-muted"
                }`}
              >
                {l.selesai ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-[13.5px] font-semibold ${l.selesai ? "text-muted line-through decoration-line-strong" : ""}`}>{l.judul}</span>
                <span className="block text-[12.5px] text-muted">{l.teks}</span>
              </span>
              {bisaKlik && <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />}
              {l.tab === "koneksi" && !l.selesai && <Smartphone className="size-4 shrink-0 text-faint" aria-hidden />}
            </>
          );
          return (
            <li key={l.judul}>
              {l.tab && l.tab !== "koneksi" ? (
                <button type="button" onClick={() => bukaTabNomor(l.tab!)} className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-subtle/60">
                  {isi}
                </button>
              ) : l.href && !l.selesai ? (
                <Link href={l.href} className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-subtle/60">
                  {isi}
                </Link>
              ) : (
                <div className="flex items-center gap-3 px-5 py-3.5">{isi}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Ikon tab Koneksi dengan titik status: hijau = tersambung, kuning = belum. */
export function IkonKoneksi({ id, children }: { id: number; children: React.ReactNode }) {
  const sesi = useSesiNomor(id);
  return (
    <span className="relative inline-flex">
      {children}
      {sesi && (
        <span
          aria-hidden
          className={`absolute -top-0.5 -right-0.5 size-2 rounded-full ring-2 ring-canvas ${sesi.status === "WORKING" ? "bg-success" : sesi.status === "STARTING" ? "bg-line-strong" : "bg-warning"}`}
        />
      )}
    </span>
  );
}
