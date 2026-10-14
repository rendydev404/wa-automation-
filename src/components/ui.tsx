"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

export function Pill({ nada, children }: { nada: "hijau" | "kuning" | "merah" | "abu"; children: ReactNode }) {
  const kelas = {
    hijau: "bg-success-soft text-success",
    kuning: "bg-warning-soft text-warning",
    merah: "bg-danger-soft text-danger",
    abu: "bg-subtle text-muted",
  }[nada];
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${kelas}`}>{children}</span>;
}

export function SubmitButton({ children, className = "btn btn-primary" }: { children: ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Pesan({ ok, children }: { ok: boolean; children: ReactNode }) {
  if (!children) return null;
  return (
    <p role={ok ? "status" : "alert"} className={`text-[13px] ${ok ? "text-success" : "text-danger"}`}>
      {children}
    </p>
  );
}

/** Tombol dengan konfirmasi di tempat: klik pertama bertanya, klik kedua menjalankan. */
export function TombolKonfirmasi({
  label,
  tanya,
  ya = "Ya",
  aksi,
  className = "btn btn-danger",
  ikon,
}: {
  label: string;
  tanya: string;
  ya?: string;
  aksi: () => Promise<{ ok: boolean; pesan?: string } | void>;
  className?: string;
  ikon?: ReactNode;
}) {
  const [buka, setBuka] = useState(false);
  const [galat, setGalat] = useState("");
  const [tunggu, mulai] = useTransition();

  if (!buka) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button type="button" className={className} onClick={() => (setGalat(""), setBuka(true))}>
          {ikon}
          {label}
        </button>
        {galat && <p className="max-w-64 text-right text-xs text-danger">{galat}</p>}
      </div>
    );
  }
  return (
    <div className="flex animate-masuk flex-wrap items-center justify-end gap-2">
      <span className="text-[13px] text-muted">{tanya}</span>
      <button
        type="button"
        disabled={tunggu}
        className="btn bg-danger text-white hover:opacity-90"
        onClick={() =>
          mulai(async () => {
            const h = await aksi();
            if (h && !h.ok) setGalat(h.pesan ?? "Gagal.");
            setBuka(false);
          })
        }
      >
        {tunggu && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {ya}
      </button>
      <button type="button" disabled={tunggu} className="btn btn-ghost" onClick={() => setBuka(false)}>
        Batal
      </button>
    </div>
  );
}

export function Saklar({ aktif, onUbah, label, disabled }: { aktif: boolean; onUbah: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={aktif}
      aria-label={label}
      disabled={disabled}
      onClick={() => onUbah(!aktif)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${aktif ? "bg-accent" : "bg-line-strong"}`}
    >
      <span className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${aktif ? "translate-x-5" : ""}`} />
    </button>
  );
}
