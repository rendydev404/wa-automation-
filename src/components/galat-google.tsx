"use client";

import { useSearchParams } from "next/navigation";
import { useBahasa } from "@/components/bahasa";
import { PESAN_GALAT_GOOGLE } from "@/lib/pesan-google";

/** Versi Inggris PESAN_GALAT_GOOGLE (kunci sama). */
const PESAN_GALAT_GOOGLE_EN: Record<string, string> = {
  belum: "Sign in with Google isn't enabled on the server yet.",
  sesi: "Your Google sign-in session expired. Please try again.",
  batal: "Sign in with Google was cancelled.",
  email: "This Google account's email isn't verified yet.",
  google: "Google couldn't verify your account. Please try again.",
  tutup: "New sign-ups are currently closed. Please contact the admin.",
  gagal: "An account can't be created for this email. Please contact the admin.",
  blokir: "Your account has been blocked by the admin.",
  sering: "Too many attempts. Please try again in a few minutes.",
};

/** Pesan dari callback Google (?galat=<kode>) di halaman masuk. */
export function GalatGoogle() {
  const { b } = useBahasa();
  const kode = useSearchParams().get("galat");
  const pesan = kode ? (b === "en" ? PESAN_GALAT_GOOGLE_EN[kode] : undefined) ?? PESAN_GALAT_GOOGLE[kode] : undefined;
  if (!pesan) return null;
  return (
    <p role="alert" className="mb-4 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">
      {pesan}
    </p>
  );
}
