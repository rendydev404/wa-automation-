"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, QrCode, X } from "lucide-react";
import { tambahNomorAction } from "@/app/actions";
import { useBahasa, useJalur } from "./bahasa";
import { SyaratNomorRingkas } from "./syarat-nomor";
import { Pesan, SubmitButton } from "./ui";

/**
 * Tombol + dialog tambah nomor, bisa dibuka dari mana saja (sidebar, kepala halaman, keadaan kosong).
 * Dialog hanya ada di DOM selagi terbuka, dan tertutup sendiri begitu halaman berpindah
 * (aksi berhasil = dialihkan ke halaman nomor baru).
 */
export function TombolTambahNomor({ varian = "utama" }: { varian?: "utama" | "nav" }) {
  const jalur = useJalur();
  const { t } = useBahasa();
  const [bukaDi, setBukaDi] = useState<string | null>(null);
  const buka = bukaDi === jalur;

  return (
    <>
      {varian === "nav" ? (
        <button
          type="button"
          data-tutup-laci
          onClick={() => setBukaDi(jalur)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-ink-line px-3 py-2.5 pendek:py-2 text-[13px] font-semibold text-ink-muted transition-colors hover:border-ink-signal/60 hover:bg-ink-raised/60 hover:text-ink-fg"
        >
          <Plus className="size-4" aria-hidden /> {t("Tambah nomor", "Add number")}
        </button>
      ) : (
        <button type="button" onClick={() => setBukaDi(jalur)} className="btn btn-primary shrink-0" data-tur="tambah-nomor">
          <Plus className="size-4" aria-hidden /> {t("Tambah nomor", "Add number")}
        </button>
      )}
      {buka && createPortal(<DialogTambah tutup={() => setBukaDi(null)} />, document.body)}
    </>
  );
}

function DialogTambah({ tutup }: { tutup: () => void }) {
  const { b, t } = useBahasa();
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [hasil, aksi] = useActionState(tambahNomorAction, null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      onClose={tutup}
      aria-labelledby={`${id}-judul`}
      // Ketuk latar di luar kartu = tutup.
      onClick={(e) => e.target === e.currentTarget && ref.current?.close()}
      className="m-auto w-[min(440px,calc(100vw-2rem))] max-w-none rounded-2xl bg-surface p-0 text-fg shadow-pop backdrop:bg-black/45 backdrop:backdrop-blur-sm max-sm:mb-0 max-sm:w-full max-sm:rounded-b-none"
    >
      <form action={aksi} className="animate-masuk p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
              <QrCode className="size-5" aria-hidden />
            </span>
            <div>
              <h2 id={`${id}-judul`} className="text-[15px] font-bold tracking-tight">
                {t("Tambah nomor WhatsApp", "Add a WhatsApp number")}
              </h2>
              <p className="hint mt-0.5">
                {t(
                  "Beri nama, lalu kode QR langsung muncul untuk dipindai dari HP nomor tersebut.",
                  "Give it a name, and a QR code appears right away for you to scan with that number's phone."
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label={t("Tutup", "Close")}
            className="-mt-1 -mr-1 grid size-9 shrink-0 place-items-center rounded-lg text-faint transition-colors hover:bg-subtle hover:text-fg"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <label htmlFor={`${id}-label`} className="label">
          {t("Nama nomor", "Number name")}
        </label>
        <input id={`${id}-label`} name="label" required maxLength={60} autoFocus placeholder={t("mis. CS Utama", "e.g. Main CS")} className="field" />
        <div className="mt-4">
          <SyaratNomorRingkas b={b} />
        </div>
        {/* Persetujuan cukup di browser: syarat ini soal cara pemilik memakai nomornya, bukan hal yang bisa diperiksa server. */}
        <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-[13px]">
          <input type="checkbox" required className="mt-0.5 size-4 shrink-0 accent-accent" />
          <span>{t("Saya sudah memastikan nomor ini tidak memakai balasan otomatis lain.", "I've made sure this number isn't using any other auto-reply.")}</span>
        </label>
        <div className="mt-2 min-h-5">
          <Pesan ok={false}>{hasil?.pesan}</Pesan>
        </div>
        <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn btn-ghost" onClick={() => ref.current?.close()}>
            {t("Batal", "Cancel")}
          </button>
          <SubmitButton>
            <QrCode className="size-4" aria-hidden /> {t("Buat & tampilkan QR", "Create & show QR")}
          </SubmitButton>
        </div>
      </form>
    </dialog>
  );
}
