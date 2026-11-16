"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CircleAlert, CircleCheck, Clock, RefreshCw, X } from "lucide-react";
import Link from "@/components/link";
import { klaimVoucherAction, tutupModalVoucherAction } from "@/app/actions";
import { useBahasa } from "@/components/bahasa";
import { angka, tanggal } from "@/lib/format";
import type { InfoModalVoucher } from "@/lib/voucher-def";

type Sukses = NonNullable<Awaited<ReturnType<typeof klaimVoucherAction>>["hasil"]>;
type T = (id: string, en: string) => string;

/** Penanda di <body> selama modal terbuka: tur otomatis (tur.tsx) menunggu sampai modal ini ditutup. */
export const PENANDA_MODAL_VOUCHER = "data-modal-voucher";

/**
 * Modal klaim voucher yang muncul otomatis begitu pengguna masuk dari tautan "Klaim voucher" di email pembelian.
 * Kodenya dibawa cookie (lihat proxy.ts), jadi tetap muncul setelah login, daftar akun baru, maupun masuk dengan Google.
 */
export function ModalVoucher({ info }: { info: InfoModalVoucher }) {
  const { b, t } = useBahasa();
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const router = useRouter();
  const [sibuk, mulai] = useTransition();
  const [galat, setGalat] = useState<string | null>(null);
  const [sukses, setSukses] = useState<Sukses | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    document.body.setAttribute(PENANDA_MODAL_VOUCHER, "");
    if (!d.open) d.showModal();
    return () => document.body.removeAttribute(PENANDA_MODAL_VOUCHER);
  }, []);

  function tutup() {
    document.body.removeAttribute(PENANDA_MODAL_VOUCHER);
    ref.current?.close();
    // Hapus cookie kode voucher (server action ini juga menyegarkan halaman: kartu paket & kuota ikut terbaru).
    void tutupModalVoucherAction().then(() => {
      if (sukses) router.refresh();
    });
  }

  function klaim() {
    setGalat(null);
    mulai(async () => {
      const res = await klaimVoucherAction(info.kode);
      if (!res.ok || !res.hasil) {
        setGalat(res.pesan ?? t("Gagal mengaktifkan voucher. Coba lagi.", "Failed to activate the voucher. Please try again."));
        return;
      }
      setSukses(res.hasil);
    });
  }

  const bisaKlaim = info.status === "siap" || info.status === "tidak_ada";
  const judul = sukses
    ? t("Paket berhasil diaktifkan", "Plan activated")
    : info.status === "milik_anda"
      ? t("Voucher sudah aktif di akun ini", "Voucher already active on this account")
      : t("Aktifkan paket dari pembelian Anda", "Activate the plan from your purchase");

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-judul`}
      // Esc / ketuk latar tidak menutup: pilihan menutup dibuat jelas lewat tombol (kode tidak hilang tanpa sengaja).
      onCancel={(e) => e.preventDefault()}
      className="m-auto w-[min(440px,calc(100vw-2rem))] max-w-none rounded-2xl bg-surface p-0 text-fg shadow-pop backdrop:bg-black/50 backdrop:backdrop-blur-[2px] max-sm:mb-0 max-sm:w-full max-sm:rounded-b-none"
    >
      <div className="animate-masuk p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12.5px] font-medium text-muted">{t("Voucher Panduan ChatGerCep", "ChatGerCep Guide Voucher")}</p>
            <h2 id={`${id}-judul`} className="mt-1 text-[18px] leading-snug font-semibold tracking-tight">
              {judul}
            </h2>
          </div>
          <button
            type="button"
            onClick={tutup}
            aria-label={t("Tutup", "Close")}
            className="-mt-1 -mr-1 grid size-9 shrink-0 place-items-center rounded-lg text-faint transition-colors hover:bg-subtle hover:text-fg"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-line bg-subtle/60 px-4 py-3">
          <span className="text-[12.5px] text-muted">{t("Kode voucher", "Voucher code")}</span>
          <span className="font-mono text-[15px] font-semibold tracking-[0.1em]">{info.kode}</span>
        </div>

        {sukses ? (
          <IsiSukses sukses={sukses} b={b} t={t} tutup={tutup} />
        ) : (
          <>
            {info.kuota_balasan != null && (
              <dl className="mt-4 divide-y divide-line rounded-xl border border-line text-[13.5px]">
                <Baris label={t("Paket", "Plan")} nilai={info.nama_paket ?? "-"} />
                <Baris label={t("Kuota balasan AI", "AI reply quota")} nilai={`+${angka(info.kuota_balasan, b)}`} />
                <Baris label={t("Nomor WhatsApp", "WhatsApp numbers")} nilai={String(info.kuota_nomor)} />
                <Baris label={t("Masa aktif", "Active period")} nilai={t(`${info.durasi_hari} hari`, `${info.durasi_hari} days`)} />
              </dl>
            )}

            <Keterangan info={info} t={t} />

            {galat && (
              <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-danger/25 bg-danger-soft px-3.5 py-2.5 text-[13px] font-medium text-danger">
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>{galat}</span>
              </div>
            )}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={tutup} disabled={sibuk} className="btn btn-ghost">
                {bisaKlaim ? t("Nanti saja", "Maybe later") : t("Tutup", "Close")}
              </button>
              {bisaKlaim && (
                <button type="button" onClick={klaim} disabled={sibuk} className="btn btn-primary">
                  {sibuk ? (
                    <>
                      <RefreshCw className="size-4 animate-spin" aria-hidden /> {t("Mengaktifkan…", "Activating…")}
                    </>
                  ) : galat ? (
                    t("Coba lagi", "Try again")
                  ) : (
                    t("Aktifkan Paket Sekarang", "Activate Plan Now")
                  )}
                </button>
              )}
              {info.status === "milik_anda" && (
                <Link href="/langganan" onClick={tutup} className="btn btn-primary">
                  {t("Lihat paket saya", "View my plan")} <ArrowRight className="size-4" aria-hidden />
                </Link>
              )}
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}

function Baris({ label, nilai }: { label: string; nilai: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium text-fg tabular-nums">{nilai}</dd>
    </div>
  );
}

function Keterangan({ info, t }: { info: InfoModalVoucher; t: T }) {
  const baris = (ikon: React.ReactNode, teks: string) => (
    <p className="mt-4 flex items-start gap-2 text-[13px] leading-relaxed text-muted">
      <span className="mt-0.5 shrink-0">{ikon}</span>
      <span>{teks}</span>
    </p>
  );
  switch (info.status) {
    case "siap":
      return baris(
        <CircleCheck className="size-4 text-success" aria-hidden />,
        t(
          "Paket dan kuota balasan AI langsung aktif di akun ini. Bila Anda sudah punya paket aktif, kuotanya ditambahkan dan masa aktifnya diperpanjang.",
          "The plan and AI reply quota activate on this account right away. If you already have an active plan, the quota is added and its period extended."
        )
      );
    case "tidak_ada":
      return baris(
        <Clock className="size-4 text-warning" aria-hidden />,
        t(
          "Kode ini sedang disiapkan sistem, biasanya hanya beberapa detik setelah pembayaran. Bila belum bisa diaktifkan, tunggu sebentar lalu coba lagi.",
          "This code is still being prepared, usually just a few seconds after payment. If it can't be activated yet, wait a moment and try again."
        )
      );
    case "milik_anda":
      return baris(
        <CircleCheck className="size-4 text-success" aria-hidden />,
        t("Tidak perlu klaim ulang. Paket dan kuotanya sudah tercatat di akun ini.", "No need to claim again. The plan and its quota are already on this account.")
      );
    case "dipakai_lain":
      return baris(
        <CircleAlert className="size-4 text-danger" aria-hidden />,
        t(
          "Voucher ini sudah dipakai di akun lain. Pastikan Anda masuk dengan akun yang benar, atau hubungi admin bila belum pernah memakainya.",
          "This voucher has been used on another account. Make sure you're signed in with the right account, or contact the admin if you never used it."
        )
      );
    case "dibatalkan":
      return baris(
        <CircleAlert className="size-4 text-danger" aria-hidden />,
        t("Voucher ini sudah tidak berlaku. Hubungi admin untuk bantuan.", "This voucher is no longer valid. Contact the admin for help.")
      );
    default:
      return baris(
        <Clock className="size-4 text-warning" aria-hidden />,
        t("Klaim voucher sedang dinonaktifkan sementara. Silakan coba lagi nanti.", "Voucher claims are temporarily disabled. Please try again later.")
      );
  }
}

function IsiSukses({ sukses, b, t, tutup }: { sukses: Sukses; b: "id" | "en"; t: T; tutup: () => void }) {
  return (
    <>
      <dl className="mt-4 divide-y divide-line rounded-xl border border-line text-[13.5px]">
        <Baris label={t("Paket", "Plan")} nilai={sukses.nama_paket} />
        <Baris label={t("Kuota balasan AI", "AI reply quota")} nilai={angka(sukses.kuota_balasan, b)} />
        <Baris label={t("Nomor WhatsApp", "WhatsApp numbers")} nilai={String(sukses.kuota_nomor)} />
        <Baris label={t("Aktif sampai", "Active until")} nilai={tanggal(sukses.sampai, b)} />
      </dl>
      <p className="mt-4 flex items-start gap-2 text-[13px] leading-relaxed text-muted">
        <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
        <span>
          {sukses.diperpanjang
            ? t(
                `+${angka(sukses.tambahan_balasan, b)} balasan AI ditambahkan ke paket Anda dan masa aktif diperpanjang ${sukses.durasi_hari} hari.`,
                `+${angka(sukses.tambahan_balasan, b)} AI replies were added and your plan was extended by ${sukses.durasi_hari} days.`
              )
            : t(
                "Langkah berikutnya: hubungkan nomor WhatsApp usaha Anda, isi Informasi Usaha, dan AI mulai membalas chat pelanggan.",
                "Next: connect your business WhatsApp number, fill in your Business Info, and the AI starts replying to customers."
              )}
        </span>
      </p>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={tutup} className="btn btn-ghost">
          {t("Tutup", "Close")}
        </button>
        <Link href="/dashboard" onClick={tutup} className="btn btn-primary">
          {t("Hubungkan Nomor WhatsApp", "Connect WhatsApp Number")} <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </>
  );
}
