import type { ReactNode } from "react";
import { Bot, ChevronRight, FileText, MessageCircleMore, Users } from "lucide-react";
import { angka } from "../kit/anim";
import { KartuStat, Meter, Saklar, Sparkline } from "../kit/ui";
import { LencanaSesi } from "./dashboard";

/**
 * Kerangka halaman /nomor/[id] (header, kartu statistik, pintasan bagian, dan tata letak 2 kolom) — markup disalin dari
 * src/app/(app)/nomor/[id]/page.tsx. Isi tiap bagian diberikan scene lewat `slot`; bagian yang tidak diisi memakai
 * kerangka polos supaya tata letak halaman tetap utuh saat digulir.
 */

export const BAGIAN = [
  ["koneksi", "Koneksi"],
  ["histori", "Percakapan"],
  ["knowledge", "Knowledge"],
  ["katalog", "Katalog"],
  ["uji", "Uji bot"],
  ["pengaturan", "Pengaturan"],
] as const;

export interface NomorFrameP {
  label: string;
  wa?: string;
  status: "WORKING" | "SCAN_QR_CODE" | "NONE" | "STARTING";
  /** Saklar "Balasan otomatis": posisi 0..1. */
  saklar: number;
  stat: { masuk: number; total7: number; dibalas: number; tren: number[]; pelanggan: number; masukTotal: number; dok: number; karakter: number };
  /** Bagian yang sedang dibaca (pintasan yang disorot). */
  navAktif?: (typeof BAGIAN)[number][0];
  slot: Partial<Record<"koneksi" | "histori" | "knowledge" | "katalog" | "pelajaran" | "uji" | "pengaturan", ReactNode>>;
}

export const Stub = ({ judul, tinggi = 120 }: { judul: string; tinggi?: number }) => (
  <section className="card p-5">
    <h2 className="text-[15px] font-bold tracking-tight">{judul}</h2>
    <div className="mt-3 rounded-xl bg-subtle/60" style={{ height: tinggi }} />
  </section>
);

export function NomorFrame({ label, wa, status, saklar, stat, navAktif = "koneksi", slot }: NomorFrameP) {
  const rasio = stat.masuk ? Math.round((stat.dibalas / stat.masuk) * 100) : null;
  return (
    <div>
      <nav aria-label="Jejak halaman" className="mb-5">
        <ol className="flex items-center gap-1.5 text-[13px]">
          <li className="font-medium text-muted">Ringkasan</li>
          <li aria-hidden>
            <ChevronRight className="size-3.5 text-faint" />
          </li>
          <li className="font-medium text-fg">Detail nomor</li>
        </ol>
      </nav>
      <div className="space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <span className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-ink text-xl font-bold text-ink-signal uppercase">
              <span aria-hidden className="kisi-tinta absolute inset-0" />
              <span className="relative">{label.charAt(0)}</span>
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <h1 className="truncate text-[28px] font-bold tracking-tight">{label}</h1>
                <LencanaSesi status={status} />
              </div>
              <p className="mt-0.5 text-muted tabular-nums">{wa ?? "Belum ada nomor tertaut"}</p>
            </div>
          </div>
          <div data-cur="saklar-bot" className="card flex min-w-64 items-center px-4 py-3">
            <label className="flex w-full items-center justify-between gap-4">
              <span className="text-[13px] leading-tight">
                <span className="block font-semibold text-fg">Balasan otomatis</span>
                <span className="block text-xs text-muted">{saklar > 0.5 ? "AI membalas chat masuk" : "AI tidak membalas"}</span>
              </span>
              <Saklar p={saklar} cur="saklar-bot-tombol" />
            </label>
          </div>
        </header>

        <section data-cur="stat-nomor" className="grid grid-cols-4 gap-4">
          <KartuStat label="Pesan masuk hari ini" nilai={angka(stat.masuk)} ikon={<MessageCircleMore className="size-4" />} keterangan={`7 hari: ${angka(stat.total7)}`}>
            <Sparkline nilai={stat.tren} warna="var(--c-seri-masuk)" className="h-7 w-[calc(100%-6px)]" />
          </KartuStat>
          <KartuStat label="Dibalas AI hari ini" nilai={angka(stat.dibalas)} ikon={<Bot className="size-4" />} keterangan={rasio === null ? "Belum ada pesan masuk" : `${rasio}% dari pesan masuk`}>
            {rasio !== null && <Meter persen={rasio} />}
          </KartuStat>
          <KartuStat label="Pelanggan" nilai={angka(stat.pelanggan)} ikon={<Users className="size-4" />} keterangan={`${angka(stat.masukTotal)} pesan masuk sepanjang waktu`} />
          <KartuStat label="Dokumen knowledge" nilai={angka(stat.dok)} ikon={<FileText className="size-4" />} keterangan={stat.karakter === 0 ? "Belum ada isi" : `${angka(stat.karakter)} karakter`} />
        </section>

        <nav className="sticky top-0 z-20 -mx-10 border-b border-line bg-canvas px-10">
          <div className="flex gap-1 py-2">
            {BAGIAN.map(([id, lb]) => (
              <span key={id} className={`shrink-0 rounded-full px-3.5 py-2 text-[13px] font-semibold ${navAktif === id ? "bg-ink text-ink-fg" : "text-muted"}`}>
                {lb}
              </span>
            ))}
          </div>
        </nav>

        <div data-cur="sec-koneksi">{slot.koneksi ?? <Stub judul="Koneksi WhatsApp" tinggi={90} />}</div>
        <div data-cur="sec-histori">{slot.histori ?? <Stub judul="Histori percakapan" tinggi={300} />}</div>
        <div className="grid grid-cols-[minmax(0,1fr)_400px] items-start gap-6">
          <div className="min-w-0 space-y-6">
            <div data-cur="sec-knowledge">{slot.knowledge ?? <Stub judul="Base knowledge" tinggi={320} />}</div>
            <div data-cur="sec-katalog">{slot.katalog ?? <Stub judul="Katalog produk" tinggi={120} />}</div>
            <div data-cur="sec-pelajaran">{slot.pelajaran ?? <Stub judul="Belajar dari balasan Anda" tinggi={100} />}</div>
          </div>
          <div className="min-w-0 space-y-6">
            <div data-cur="sec-uji">{slot.uji ?? <Stub judul="Uji bot" tinggi={380} />}</div>
            <div data-cur="sec-pengaturan">{slot.pengaturan ?? <Stub judul="Pengaturan nomor" tinggi={520} />}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
