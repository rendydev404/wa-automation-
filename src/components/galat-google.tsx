"use client";

import { useSearchParams } from "next/navigation";
import { PESAN_GALAT_GOOGLE } from "@/lib/pesan-google";

/** Pesan dari callback Google (?galat=<kode>) di halaman masuk. */
export function GalatGoogle() {
  const kode = useSearchParams().get("galat");
  const pesan = kode ? PESAN_GALAT_GOOGLE[kode] : undefined;
  if (!pesan) return null;
  return (
    <p role="alert" className="mb-4 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">
      {pesan}
    </p>
  );
}
