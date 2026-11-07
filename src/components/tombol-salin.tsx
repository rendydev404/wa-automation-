"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useBahasa } from "./bahasa";

/** Tombol kecil penyalin teks (mis. ID pembelian). Tanda centang tampil 1,6 detik setelah berhasil. */
export function TombolSalin({ teks, label, className = "" }: { teks: string; label?: string; className?: string }) {
  const { t } = useBahasa();
  const [sudah, setSudah] = useState(false);
  return (
    <button
      type="button"
      data-analitik="Salin"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(teks);
          setSudah(true);
          setTimeout(() => setSudah(false), 1600);
        } catch {
          // Clipboard ditolak peramban: teksnya tetap terlihat dan bisa dipilih manual.
        }
      }}
      aria-label={label ?? t(`Salin ${teks}`, `Copy ${teks}`)}
      title={sudah ? t("Tersalin", "Copied") : t("Salin", "Copy")}
      className={`inline-grid size-7 shrink-0 place-items-center rounded-lg text-faint transition-colors hover:bg-subtle hover:text-fg ${className}`}
    >
      {sudah ? <Check className="size-3.5 text-success" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
    </button>
  );
}
