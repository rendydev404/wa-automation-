"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { bayarPaketAction, cekBayarAction } from "@/app/actions";
import { Pesan } from "@/components/ui";

/** Buat tagihan Midtrans Snap lalu pindah ke halaman pembayarannya. */
export function TombolBayar({ paketId, label, nonaktif }: { paketId: number; label: string; nonaktif: boolean }) {
  const [tunggu, mulai] = useTransition();
  const [galat, setGalat] = useState("");
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={nonaktif || tunggu}
        className="btn btn-primary w-full"
        onClick={() =>
          mulai(async () => {
            setGalat("");
            const h = await bayarPaketAction(paketId);
            if (h.ok && h.url) window.location.assign(h.url);
            else setGalat(h.pesan ?? "Gagal membuat pembayaran.");
          })
        }
      >
        {tunggu && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {label}
      </button>
      {galat && <Pesan ok={false}>{galat}</Pesan>}
    </div>
  );
}

/** Setelah kembali dari Midtrans: tanyakan status terbaru (webhook bisa sedikit terlambat). */
export function HasilBayar({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [hasil, setHasil] = useState<{ status?: string; pesan?: string } | null>(null);
  useEffect(() => {
    let batal = false;
    void cekBayarAction(orderId).then((h) => {
      if (batal) return;
      setHasil(h.ok ? { status: h.status } : { pesan: h.pesan });
      if (h.status === "lunas") router.refresh();
    });
    return () => {
      batal = true;
    };
  }, [orderId, router]);

  if (!hasil)
    return (
      <p className="card flex items-center gap-2 p-4 text-[13.5px] text-muted">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Memeriksa pembayaran…
      </p>
    );
  if (hasil.status === "lunas")
    return (
      <p role="status" className="flex items-center gap-2 rounded-2xl bg-success-soft p-4 text-[13.5px] font-semibold text-success">
        <CheckCircle2 className="size-5" aria-hidden /> Pembayaran berhasil. Paket kamu sudah aktif.
      </p>
    );
  if (hasil.status === "menunggu")
    return (
      <p role="status" className="flex items-center gap-2 rounded-2xl bg-warning-soft p-4 text-[13.5px] font-semibold text-warning">
        <Clock className="size-5" aria-hidden /> Menunggu pembayaran. Paket aktif otomatis begitu pembayaran diterima.
      </p>
    );
  return (
    <p role="alert" className="flex items-center gap-2 rounded-2xl bg-danger-soft p-4 text-[13.5px] font-semibold text-danger">
      <XCircle className="size-5" aria-hidden /> {hasil.pesan ?? "Pembayaran tidak berhasil atau kedaluwarsa. Silakan coba lagi."}
    </p>
  );
}
