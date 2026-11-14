"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Calendar, Check, CircleAlert, MessageSquare, Smartphone, Sparkles, Ticket } from "lucide-react";
import Link from "@/components/link";
import { klaimVoucherAction } from "@/app/actions";
import { useBahasa } from "@/components/bahasa";
import { angka, tanggal } from "@/lib/format";
import { type VoucherTersedia, normalisasiKodeVoucher } from "@/lib/voucher-def";

interface Props {
  voucherEmail?: VoucherTersedia[];
  ringkas?: boolean;
}

export function KotakKlaimVoucher({ voucherEmail = [], ringkas = false }: Props) {
  const { b, t } = useBahasa();
  const router = useRouter();
  const searchParams = useSearchParams();
  const voucherDariUrl = normalisasiKodeVoucher(searchParams.get("voucher") ?? "");

  const [kode, setKode] = useState(voucherDariUrl);
  const [terbukaInput, setTerbukaInput] = useState(!ringkas || Boolean(voucherDariUrl));
  const [sedangKlaim, mulaiTransisi] = useTransition();
  const [kodeSedangDiklaim, setKodeSedangDiklaim] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [sukses, setSukses] = useState<{
    kode: string;
    nama_paket: string;
    sampai: number;
    kuota_nomor: number;
    kuota_balasan: number;
    tambahan_balasan: number;
    durasi_hari: number;
    diperpanjang: boolean;
  } | null>(null);

  useEffect(() => {
    try {
      sessionStorage.removeItem("cg_lanjut");
    } catch {}
  }, []);

  function jalankanKlaim(targetKode: string) {
    const bersih = normalisasiKodeVoucher(targetKode);
    if (!bersih) {
      setGalat(t("Masukkan kode voucher terlebih dahulu.", "Please enter a voucher code first."));
      return;
    }
    setGalat(null);
    setKodeSedangDiklaim(bersih);
    mulaiTransisi(async () => {
      const res = await klaimVoucherAction(bersih);
      setKodeSedangDiklaim(null);
      if (!res.ok || !res.hasil) {
        setGalat(res.pesan ?? t("Gagal mengklaim voucher.", "Failed to claim voucher."));
        return;
      }
      setSukses(res.hasil);
      setKode("");
      if (voucherDariUrl) {
        router.replace("/langganan", { scroll: false });
      } else {
        router.refresh();
      }
    });
  }

  const daftarBelumDiklaim = voucherEmail.filter((v) => v.kode !== sukses?.kode);

  if (ringkas && daftarBelumDiklaim.length === 0 && !voucherDariUrl && !sukses) {
    return null;
  }

  return (
    <div id="klaim-voucher" className="card border-accent/25 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Ticket className="size-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[16px] font-semibold tracking-tight text-fg">
                {t("Punya Voucher Panduan / Promo?", "Have a Guide / Promo Voucher?")}
              </h2>
              {(daftarBelumDiklaim.length > 0 || voucherDariUrl) && !sukses && (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 text-[11.5px] font-semibold text-accent">
                  <Sparkles className="size-3" />
                  {t("Siap Diaktifkan", "Ready to Activate")}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[13px] text-muted">
              {t(
                "Beli Panduan ChatGerCep di akbaralatas.com? Klaim kode voucher Anda di sini untuk langsung mengaktifkan paket dan kuota balasan AI.",
                "Bought the ChatGerCep Guide on akbaralatas.com? Claim your voucher code here to instantly activate your plan and AI reply quota.",
              )}
            </p>
          </div>
        </div>
        {ringkas && !terbukaInput && !sukses && (
          <button
            type="button"
            onClick={() => setTerbukaInput(true)}
            className="btn btn-secondary h-9 px-3.5 text-[12.5px]"
          >
            {t("Masukkan Kode Manual", "Enter Code Manually")}
          </button>
        )}
      </div>

      {sukses && (
        <div className="mt-4 rounded-xl border border-success/25 bg-success-soft p-4">
          <div className="flex items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-success text-white">
              <Check className="size-4 stroke-[2.5]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[14.5px] font-semibold text-fg">
                {t(
                  `Voucher ${sukses.kode} berhasil diaktifkan!`,
                  `Voucher ${sukses.kode} successfully activated!`,
                )}
              </div>
              <p className="mt-1 text-[13px] text-muted">
                {sukses.diperpanjang
                  ? t(
                      `Paket Anda diperpanjang +${sukses.durasi_hari} hari dan kuota balasan AI bertambah +${angka(sukses.tambahan_balasan, b)} balasan (aktif sampai ${tanggal(sukses.sampai, b)}).`,
                      `Your plan was extended by +${sukses.durasi_hari} days and AI reply quota increased by +${angka(sukses.tambahan_balasan, b)} replies (active until ${tanggal(sukses.sampai, b)}).`,
                    )
                  : t(
                      `${sukses.nama_paket} aktif dengan ${angka(sukses.kuota_balasan, b)} kuota balasan AI dan ${sukses.kuota_nomor} nomor WhatsApp (aktif sampai ${tanggal(sukses.sampai, b)}).`,
                      `${sukses.nama_paket} is now active with ${angka(sukses.kuota_balasan, b)} AI replies and ${sukses.kuota_nomor} WhatsApp number(s) (active until ${tanggal(sukses.sampai, b)}).`,
                    )}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2.5">
                <Link href="/dashboard" className="btn btn-primary h-9 px-4 text-[13px]">
                  {t("Hubungkan & Atur Nomor WhatsApp", "Connect & Set Up WhatsApp Number")}
                  <ArrowRight className="size-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {daftarBelumDiklaim.length > 0 && (
        <div className="mt-4 space-y-2.5">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-accent">
            {t("Voucher Terdeteksi Otomatis untuk Email Anda", "Voucher Automatically Detected for Your Email")}
          </div>
          {daftarBelumDiklaim.map((v) => {
            const sibuk = sedangKlaim && kodeSedangDiklaim === v.kode;
            return (
              <div
                key={v.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/25 bg-accent-soft/50 p-3.5 sm:px-4"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-lg border border-accent/30 bg-surface px-2.5 py-0.5 font-mono text-[13.5px] font-bold tracking-wider text-accent">
                      {v.kode}
                    </span>
                    <span className="text-[14px] font-semibold text-fg">{v.nama_paket}</span>
                    {v.order_id && (
                      <span className="text-[12px] text-muted">
                        · {t("Pesanan", "Order")} #{v.order_id}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted">
                    <span className="inline-flex items-center gap-1.5 font-medium text-fg">
                      <MessageSquare className="size-3.5 text-accent" />
                      +{angka(v.kuota_balasan, b)} {t("balasan AI", "AI replies")}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Smartphone className="size-3.5 text-muted" />
                      {v.kuota_nomor} {t("nomor WhatsApp", "WhatsApp number")}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="size-3.5 text-muted" />
                      {v.durasi_hari} {t("hari masa aktif", "days active")}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={sedangKlaim}
                  onClick={() => jalankanKlaim(v.kode)}
                  className="btn btn-primary h-10 shrink-0 px-4 text-[13.5px]"
                >
                  <Check className="size-4" />
                  {sibuk
                    ? t("Mengaktifkan…", "Activating…")
                    : t("Aktifkan Sekarang (1-Klik)", "Activate Now (1-Click)")}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {terbukaInput && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            jalankanKlaim(kode);
          }}
          className="mt-4"
        >
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <input
                type="text"
                value={kode}
                onChange={(e) => {
                  setKode(e.target.value.toUpperCase());
                  if (galat) setGalat(null);
                }}
                placeholder={t("Masukkan kode voucher, contoh: CG-8K2M-9P4Q", "Enter voucher code, e.g. CG-8K2M-9P4Q")}
                maxLength={32}
                aria-label={t("Kode Voucher", "Voucher Code")}
                className="field h-11 w-full font-mono text-[14px] font-semibold tracking-wider uppercase placeholder:font-sans placeholder:font-normal placeholder:tracking-normal placeholder:normal-case"
              />
            </div>
            <button
              type="submit"
              disabled={sedangKlaim || !kode.trim()}
              className="btn btn-primary h-11 shrink-0 px-5 text-[13.5px]"
            >
              <Ticket className="size-4" />
              {sedangKlaim && kodeSedangDiklaim === normalisasiKodeVoucher(kode)
                ? t("Mengaktifkan Voucher…", "Activating Voucher…")
                : t("Klaim & Aktifkan Voucher", "Claim & Activate Voucher")}
            </button>
          </div>
          {voucherDariUrl && !sukses && (
            <p className="mt-2 text-[12.5px] font-medium text-accent">
              {t(
                "Kode voucher dari tautan pembelian Anda sudah terisi otomatis. Klik tombol \"Klaim & Aktifkan Voucher\" untuk mengaktifkan paket.",
                "Your voucher code from the purchase link has been filled in automatically. Click \"Claim & Activate Voucher\" to activate your plan.",
              )}
            </p>
          )}
        </form>
      )}

      {galat && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-danger/25 bg-danger-soft px-3.5 py-2.5 text-[13px] font-medium text-danger">
          <CircleAlert className="size-4 shrink-0" />
          <span>{galat}</span>
        </div>
      )}
    </div>
  );
}
