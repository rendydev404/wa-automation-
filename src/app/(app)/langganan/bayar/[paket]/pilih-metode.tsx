"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, Loader2, QrCode, ShieldCheck, Wallet } from "lucide-react";
import { bayarPaketAction } from "@/app/actions";
import { lacakMetaEvent } from "@/components/meta-pixel";
import { Pesan } from "@/components/ui";
import { KANAL_BAYAR, type KanalBayar } from "@/lib/harga";

const IKON_GRUP = { QRIS: QrCode, "E-wallet": Wallet, "Virtual account": Building2 } as const;

/** Pilih kanal pembayaran lalu buat tagihannya di server (Core API); browser dibawa ke halaman instruksi bayar. */
export function PilihMetode({ paketId, harga, kanal }: { paketId: number; harga: number; kanal: KanalBayar[] }) {
  const router = useRouter();
  const [pilih, setPilih] = useState<KanalBayar | null>(kanal[0] ?? null);
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
        lacakMetaEvent("initiate_checkout", { num_items: 1, currency: "IDR", value: harga });
        router.push(`/langganan/tagihan/${encodeURIComponent(h.orderId)}`);
      } else {
        setGalat(h.pesan ?? "Gagal membuat tagihan.");
      }
    });

  if (!kanal.length) return <p className="card p-5 text-[13.5px] text-warning">Belum ada metode pembayaran yang aktif. Silakan coba lagi nanti.</p>;

  return (
    <div className="space-y-5">
      <fieldset className="space-y-5" disabled={tunggu}>
        <legend className="sr-only">Metode pembayaran</legend>
        {[...grup].map(([nama, daftar]) => {
          const Ikon = IKON_GRUP[nama];
          return (
            <div key={nama}>
              <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-bold tracking-wide text-muted uppercase">
                <Ikon className="size-3.5" aria-hidden /> {nama}
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
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-semibold">{KANAL_BAYAR[x].label}</span>
                        <span className="block truncate text-[12px] text-muted">{KANAL_BAYAR[x].info}</span>
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
          {pilih ? `Bayar Rp${harga.toLocaleString("id-ID")} dengan ${KANAL_BAYAR[pilih].label}` : "Pilih metode pembayaran"}
        </button>
        <Pesan ok={false}>{galat}</Pesan>
        <p className="flex items-center justify-center gap-1.5 text-[12px] text-muted">
          <ShieldCheck className="size-3.5 text-success" aria-hidden /> Diproses aman oleh Midtrans. Tanpa biaya tambahan.
        </p>
      </div>
    </div>
  );
}
