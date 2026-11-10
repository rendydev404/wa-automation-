"use client";

import { useState, useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { perbaruiLisensiAction } from "@/app/actions-mesin";
import { useBahasa, useRouterBahasa } from "@/components/bahasa";
import { Pesan } from "@/components/ui";

/** Sekali bertanya ke pusat (tindakan pemilik mesin, bukan polling). */
export function TombolPerbaruiLisensi() {
  const { t } = useBahasa();
  const router = useRouterBahasa();
  const [hasil, setHasil] = useState<{ ok: boolean; pesan: string } | null>(null);
  const [tunggu, mulai] = useTransition();
  return (
    <div className="flex shrink-0 flex-col items-stretch gap-1.5 sm:items-end">
      <button
        type="button"
        className="btn btn-ghost border border-line bg-surface"
        disabled={tunggu}
        onClick={() =>
          mulai(async () => {
            const h = await perbaruiLisensiAction();
            setHasil(h);
            router.refresh();
          })
        }
      >
        {tunggu ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
        {t("Perbarui lisensi", "Refresh license")}
      </button>
      <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
    </div>
  );
}
