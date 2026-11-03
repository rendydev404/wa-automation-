import { Ban, ChevronDown, MessageSquareOff, TriangleAlert, Unplug } from "lucide-react";

/**
 * Syarat nomor WhatsApp yang disambungkan: tidak boleh ada sistem balas otomatis lain di nomor itu. Satu sumber teks
 * untuk landing page, dashboard, dan dialog tambah nomor. Murni tampilan (tanpa state): dipakai komponen server
 * maupun klien.
 */
export const SYARAT_NOMOR = [
  {
    ikon: MessageSquareOff,
    judul: "Matikan balasan otomatis WhatsApp Business",
    teks: "Nonaktifkan Pesan salam dan Pesan tidak di tempat (menu Alat bisnis) di nomor yang akan disambungkan.",
  },
  {
    ikon: Unplug,
    judul: "Lepas layanan balas otomatis lain",
    teks: "Putuskan chatbot, aplikasi auto-reply, atau perangkat tertaut lain yang ikut membalas chat dari nomor ini.",
  },
  {
    ikon: Ban,
    judul: "Bukan nomor WhatsApp Business API",
    teks: "Nomor yang terdaftar di WhatsApp Business API (Cloud API atau penyedia resminya) tidak bisa ditautkan lewat QR.",
  },
] as const;

export const JUDUL_SYARAT = "Nomor tidak boleh terhubung ke balasan otomatis lain";
export const ALASAN_SYARAT = "Bila dua sistem membalas bersamaan, pelanggan menerima balasan ganda yang saling bertabrakan dan nomor berisiko dibatasi WhatsApp.";

/** Dashboard: satu baris peringatan yang rapi; rinciannya dibuka bila perlu supaya ringkasan tetap lega. */
export function PanelSyaratNomor() {
  return (
    <details className="group rounded-2xl border border-warning/30 bg-warning-soft/60">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-warning-soft text-warning">
          <TriangleAlert className="size-[18px]" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-bold text-fg">{JUDUL_SYARAT}</span>
          <span className="block text-[12.5px] text-muted">Matikan auto-reply WhatsApp Business & layanan bot lain sebelum menyambungkan nomor.</span>
        </span>
        <span className="hidden shrink-0 text-[12.5px] font-semibold text-warning sm:inline group-open:hidden">Lihat syarat</span>
        <ChevronDown className="size-4 shrink-0 text-warning transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t border-warning/20 px-4 pt-4 pb-4 sm:px-5">
        <ul className="grid gap-3 md:grid-cols-3">
          {SYARAT_NOMOR.map((s) => (
            <li key={s.judul} className="rounded-xl border border-line bg-surface p-4">
              <s.ikon className="size-[18px] text-warning" aria-hidden />
              <p className="mt-2.5 text-[13.5px] font-bold">{s.judul}</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{s.teks}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12.5px] text-muted">{ALASAN_SYARAT}</p>
      </div>
    </details>
  );
}

/** Dialog tambah nomor: daftar ringkas tepat sebelum nomor dibuat. */
export function SyaratNomorRingkas() {
  return (
    <div className="rounded-xl border border-warning/30 bg-warning-soft/60 p-3.5">
      <p className="flex items-center gap-2 text-[13px] font-bold text-fg">
        <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden /> {JUDUL_SYARAT}
      </p>
      <ul className="mt-2.5 space-y-2">
        {SYARAT_NOMOR.map((s) => (
          <li key={s.judul} className="flex gap-2.5 text-[12.5px] leading-snug text-muted">
            <s.ikon className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
            <span>
              <span className="font-semibold text-fg">{s.judul}.</span> {s.teks}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
