"use client";

import { useState, useTransition } from "react";
import { Building2, Check, Loader2, QrCode, ShieldCheck, Wallet } from "lucide-react";
import { bayarPaketAction } from "@/app/actions";
import { LogoKanal } from "@/components/logo-kanal";
import { lacakMetaEvent } from "@/components/meta-pixel";
import { Pesan } from "@/components/ui";
import { useBahasa, useRouterBahasa } from "@/components/bahasa";
import { angka, uang } from "@/lib/format";
import { KANAL_BAYAR, type KanalBayar, grupKanal, infoKanal, labelKanal } from "@/lib/harga";
import { GATEWAY, type Gateway } from "@/lib/gateway-def";
import { kanalBisaRefund, MASA_ID, MASA_EN_ADJ } from "@/lib/jaminan-def";

const IKON_GRUP = { QRIS: QrCode, "E-wallet": Wallet, "Virtual account": Building2 } as const;

/**
 * Pilih kanal pembayaran lalu buat tagihannya di server (Core API); browser dibawa ke halaman instruksi bayar. Kanal yang
 * ternyata belum aktif di Midtrans langsung hilang dari pilihan (server juga menyembunyikannya untuk pembeli lain).
 */
export function PilihMetode({
  paketId,
  harga,
  kanal: awal,
  kurs,
  jaminan = false,
  penyedia = {},
}: {
  paketId: number;
  harga: number;
  kanal: KanalBayar[];
  kurs?: number;
  /** Pembayaran pertama akun ini: kanal yang bisa di-refund diberi tanda jaminan uang kembali. */
  jaminan?: boolean;
  /** Provider tiap metode (src/lib/gateway.ts penyediaKanal; mode hybrid bisa berbeda per metode). */
  penyedia?: Partial<Record<KanalBayar, Gateway>>;
}) {
  const router = useRouterBahasa();
  const { b, t } = useBahasa();
  const [kanal, setKanal] = useState(awal);
  const [pilih, setPilih] = useState<KanalBayar | null>(awal[0] ?? null);
  // Nama provider di catatan bawah: provider metode yang dipilih (mode hybrid bisa berbeda per metode).
  const namaPenyedia = GATEWAY[(pilih && penyedia[pilih]) || "midtrans"].label;
  const [galat, setGalat] = useState("");
  const [tunggu, mulai] = useTransition();
  const grup = new Map<keyof typeof IKON_GRUP, KanalBayar[]>();
  for (const x of kanal) grup.set(KANAL_BAYAR[x].grup, [...(grup.get(KANAL_BAYAR[x].grup) ?? []), x]);

  const bayar = () =>
    mulai(async () => {
      if (!pilih) return;
      setGalat("");
      const h = await bayarPaketAction(paketId, pilih);
      if (h.ok && h.orderId) {
        lacakMetaEvent("initiate_checkout", { num_items: 1, currency: "IDR", value: harga }, `ic_${h.orderId}`);
        router.push(`/langganan/tagihan/${encodeURIComponent(h.orderId)}`);
      } else {
        setGalat(h.pesan ?? t("Gagal membuat tagihan.", "Could not create the invoice."));
        if (h.kanalMati) {
          const sisa = kanal.filter((x) => x !== h.kanalMati);
          setKanal(sisa);
          setPilih(sisa[0] ?? null);
        }
      }
    });

  if (!kanal.length)
    return <p className="card p-5 text-[13.5px] text-warning">{t("Belum ada metode pembayaran yang aktif. Silakan coba lagi nanti.", "No payment method is available yet. Please try again later.")}</p>;

  return (
    <div className="space-y-5">
      <fieldset className="space-y-5" disabled={tunggu}>
        <legend className="sr-only">{t("Metode pembayaran", "Payment method")}</legend>
        {[...grup].map(([nama, daftar]) => {
          const Ikon = IKON_GRUP[nama];
          return (
            <div key={nama}>
              <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-bold tracking-wide text-muted uppercase">
                <Ikon className="size-3.5" aria-hidden /> {grupKanal(daftar[0], b)}
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {daftar.map((x) => {
                  const aktif = pilih === x;
                  return (
                    <label
                      key={x}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors has-focus-visible:ring-2 has-focus-visible:ring-accent ${
                        aktif ? "border-accent bg-accent-soft" : "border-line bg-surface hover:bg-subtle"
                      }`}
                    >
                      <input type="radio" name="kanal" value={x} checked={aktif} onChange={() => setPilih(x)} className="sr-only" />
                      <LogoKanal kanal={x} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-semibold">{labelKanal(x, b, penyedia[x])}</span>
                        <span className="block truncate text-[12px] text-muted">{infoKanal(x, b)}</span>
                        {jaminan && kanalBisaRefund(x) && (
                          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success">
                            <ShieldCheck className="size-3" aria-hidden /> {t(`Jaminan uang kembali ${MASA_ID}`, `${MASA_EN_ADJ} money-back guarantee`)}
                          </span>
                        )}
                      </span>
                      <span aria-hidden className={`grid size-5 shrink-0 place-items-center rounded-full border ${aktif ? "border-accent bg-accent text-on-accent" : "border-line-strong"}`}>
                        {aktif && <Check className="size-3" />}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </fieldset>
      <div className="space-y-2">
        <button type="button" className="btn btn-primary h-11 w-full text-[14px]" disabled={!pilih || tunggu} onClick={bayar}>
          {tunggu && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {pilih
            ? t(`Bayar Rp${harga.toLocaleString("id-ID")} dengan ${labelKanal(pilih, "id", penyedia[pilih])}`, `Pay ${uang(harga, b, kurs)} with ${labelKanal(pilih, b, penyedia[pilih])}`)
            : t("Pilih metode pembayaran", "Choose a payment method")}
        </button>
        {b === "en" && <p className="text-center text-[12px] text-muted tabular-nums">Billed in Indonesian rupiah: Rp{angka(harga, b)}</p>}
        <Pesan ok={false}>{galat}</Pesan>
        {jaminan && pilih && !kanalBisaRefund(pilih) && kanal.some(kanalBisaRefund) && (
          <p className="text-center text-[12px] text-warning">
            {t(
              `Pembayaran lewat ${labelKanal(pilih, "id", penyedia[pilih])} tidak termasuk jaminan uang kembali. Pilih GoPay, ShopeePay, atau QRIS bila ingin dijamin.`,
              `Paying with ${labelKanal(pilih, b, penyedia[pilih])} isn't covered by the money-back guarantee. Choose GoPay, ShopeePay, or QRIS to be covered.`,
            )}
          </p>
        )}
        <p className="flex items-center justify-center gap-1.5 text-[12px] text-muted">
          <ShieldCheck className="size-3.5 text-success" aria-hidden /> {t(`Diproses aman oleh ${namaPenyedia}. Tanpa biaya tambahan.`, `Securely processed by ${namaPenyedia}. No extra fees.`)}
        </p>
      </div>
    </div>
  );
}
