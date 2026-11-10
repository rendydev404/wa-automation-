"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useBahasa } from "@/components/bahasa";

/** Tombol salin untuk blok kode gelap. */
export function SalinKode({ teks }: { teks: string }) {
  const { t } = useBahasa();
  const [sudah, setSudah] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(teks);
          setSudah(true);
          setTimeout(() => setSudah(false), 1600);
        } catch {}
      }}
      aria-label={t("Salin kode", "Copy code")}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] font-semibold text-ink-muted transition-colors hover:bg-white/10 hover:text-white"
    >
      {sudah ? <Check className="size-3.5 text-ink-signal" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      <span className="hidden sm:inline">{sudah ? t("Tersalin", "Copied") : t("Salin", "Copy")}</span>
    </button>
  );
}

/** Blok kode gelap dengan judul & tombol salin. */
export function Kode({ children, judul, padat = false }: { children: string; judul?: string; padat?: boolean }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-ink">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 py-1 pr-1.5 pl-3.5">
        <span className="text-[11.5px] font-semibold tracking-wide text-ink-muted uppercase">{judul ?? ""}</span>
        <SalinKode teks={children} />
      </div>
      <pre className={`overflow-x-auto p-3.5 text-[12.5px] leading-relaxed text-ink-fg ${padat ? "max-h-72" : "max-h-[32rem]"}`}>
        <code>{children}</code>
      </pre>
    </div>
  );
}

/** Blok kode bertab (mis. cURL / SDK / PHP / Python). Bisa dikendalikan dari luar (`pilih` + `saatPilih`). */
export function KodeTab({ tab, awal, pilih: dikendali, saatPilih }: { tab: { kode: string; label: string; isi: string }[]; awal?: string; pilih?: string; saatPilih?: (kode: string) => void }) {
  const [sendiri, setSendiri] = useState(awal ?? tab[0]?.kode);
  const pilih = dikendali ?? sendiri;
  const setPilih = (k: string) => (saatPilih ? saatPilih(k) : setSendiri(k));
  const aktif = tab.find((x) => x.kode === pilih) ?? tab[0];
  if (!aktif) return null;
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-ink">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 pr-1.5">
        <div role="tablist" className="flex min-w-0 overflow-x-auto">
          {tab.map((x) => (
            <button
              key={x.kode}
              type="button"
              role="tab"
              aria-selected={x.kode === aktif.kode}
              onClick={() => setPilih(x.kode)}
              className={`shrink-0 border-b-2 px-2.5 py-2 text-[12px] sm:px-3.5 font-semibold transition-colors ${x.kode === aktif.kode ? "border-ink-signal text-white" : "border-transparent text-ink-muted hover:text-white"}`}
            >
              {x.label}
            </button>
          ))}
        </div>
        <SalinKode teks={aktif.isi} />
      </div>
      <pre className="max-h-[32rem] overflow-x-auto p-3.5 text-[12.5px] leading-relaxed text-ink-fg">
        <code>{aktif.isi}</code>
      </pre>
    </div>
  );
}
