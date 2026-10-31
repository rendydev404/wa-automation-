"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { BellRing, Smartphone } from "lucide-react";
import { teruskanAction } from "@/app/actions";
import { Pesan, SubmitButton } from "./ui";

/**
 * Modal wajib: nomor WhatsApp penerus belum diisi, sehingga AI tidak membalas di nomor bisnis ini (lihat siapDipakai).
 * Tidak bisa ditutup: tanpa tombol tutup, Esc diblokir, klik di luar tidak berpengaruh. Hilang sendiri begitu nomornya
 * tersimpan (halaman dirender ulang oleh server action). Satu-satunya jalan lain adalah meninggalkan halaman ini.
 */
export function ModalPenerus({ numberId, label, waBisnis }: { numberId: number; label: string; waBisnis: string | null }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [hasil, aksi] = useActionState(teruskanAction, null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (!d.open) d.showModal();
    const gulirLama = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = gulirLama;
      d.close();
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="judul-modal-penerus"
      aria-describedby="isi-modal-penerus"
      // Esc = "cancel" pada dialog modal; dibatalkan supaya modal tetap tampil.
      onCancel={(e) => e.preventDefault()}
      className="m-auto w-[min(92vw,30rem)] rounded-2xl border border-line bg-surface p-0 text-fg shadow-pop backdrop:bg-black/60 backdrop:backdrop-blur-[2px]"
    >
      <form action={aksi} className="p-6">
        <input type="hidden" name="number_id" value={numberId} />
        <span className="grid size-11 place-items-center rounded-2xl bg-accent-soft text-accent">
          <BellRing className="size-5" aria-hidden />
        </span>
        <h2 id="judul-modal-penerus" className="mt-4 text-[18px] font-bold tracking-tight">
          Isi nomor WhatsApp Anda dulu
        </h2>
        <p id="isi-modal-penerus" className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
          AI hanya bisa membalas chat. Pesanan, keluhan, dan bukti bayar dari pelanggan akan diteruskan ke nomor ini supaya tidak ada yang terlewat. Tanpa nomor ini, AI belum
          bisa membalas di <b className="text-fg">{label}</b>.
        </p>

        <label className="mt-5 block">
          <span className="label flex items-center gap-1.5">
            <Smartphone className="size-3.5" aria-hidden /> Nomor WhatsApp penerima
          </span>
          <input name="teruskan_ke" required autoFocus type="tel" inputMode="tel" autoComplete="tel" placeholder="0812 3456 7890" className="field tabular-nums" />
          <span className="mt-1.5 block text-[12px] leading-snug text-faint">
            Pakai nomor pribadi atau nomor karyawan yang memproses pesanan, bukan nomor bisnis yang dibalas AI ini{waBisnis ? ` (+${waBisnis})` : ""}.
          </span>
        </label>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <SubmitButton className="btn btn-primary w-full justify-center sm:w-auto">Simpan & aktifkan AI</SubmitButton>
          <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
        </div>
        <p className="mt-4 border-t border-line pt-3 text-[12px] text-faint">
          Belum siap? <Link href="/dashboard" className="font-semibold text-accent hover:underline">Kembali ke Ringkasan</Link>
        </p>
      </form>
    </dialog>
  );
}
