"use client";

import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import Link from "@/components/link";
import { useBahasa } from "@/components/bahasa";
import { KalkulatorAdmin, type NilaiKalkulator, rekomendasi } from "@/components/banding-admin";
import { angka, uang } from "@/lib/format";

export interface PaketTawar {
  id: number;
  nama: string;
  harga: number;
  durasi_hari: number;
  kuota_balasan: number;
  kuota_nomor: number;
  deskripsi: string;
  unggulan: boolean;
}

/**
 * Kalkulator "kalau dibalas admin" (komponen bersama dengan landing) + pilihan paket. Paket yang cocok dengan jumlah chat
 * per hari disorot otomatis; tiap paket langsung ke halaman bayar (/langganan/bayar/[id]). Hitungan di klien.
 */
export function HitungPaket({ paket, chatAwal, kurs }: { paket: PaketTawar[]; chatAwal: number; kurs?: number }) {
  const { b, t } = useBahasa();
  const rp = (n: number) => uang(Math.round(n), b, kurs);
  // Bawaan sejujurnya: chat/hari dari data trial (dibulatkan ke 5) dan satu admin jam kerja; 24 jam bisa dipilih sendiri.
  const [nilai, setNilai] = useState<NilaiKalkulator>(() => ({ chat: Math.min(400, Math.max(5, Math.round((chatAwal || 30) / 5) * 5)), shift: 1, gaji: 4_000_000 }));
  const cocok = rekomendasi(paket, nilai.chat);

  return (
    <>
      <section className="card p-5 sm:p-7">
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{t("Kalau dibalas admin, biayanya segini", "If an admin replied, this is what it costs")}</h2>
        <p className="mt-1 mb-5 text-[14px] text-muted">
          {t("Kerjaan AI tadi sama dengan kerjaan admin CS WhatsApp. Bedanya, AI tidak pernah tidur, libur, atau resign.", "What the AI just did is a WhatsApp CS admin's job. The difference: AI never sleeps, takes leave, or quits.")}
        </p>
        <KalkulatorAdmin
          paket={paket}
          nilai={nilai}
          ubah={setNilai}
          kurs={kurs}
          catatanChat={
            chatAwal > 0
              ? t(`Selama free trial, rata-rata ${angka(chatAwal, b)} pesan masuk per hari ke WhatsApp-mu.`, `During your free trial, about ${angka(chatAwal, b)} messages a day came into your WhatsApp.`)
              : undefined
          }
        />
      </section>

      <section id="paket" className="card scroll-mt-24 p-5 sm:p-7">
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{t("Nyalakan AI lagi sekarang", "Turn the AI back on now")}</h2>
        <p className="mt-1 text-[14px] text-muted">
          {t("Pilih paket. Kuota balasan langsung bertambah setelah pembayaran lunas, nomor WhatsApp tetap tersambung.", "Pick a plan. Your reply quota is topped up as soon as payment clears, and your WhatsApp number stays connected.")}
        </p>
        <div className="mt-6 grid gap-5 md:grid-cols-3 md:gap-4">
          {paket.map((p) => {
            const pas = cocok?.id === p.id;
            const perHari = p.harga / p.durasi_hari;
            const chatHari = Math.round(p.kuota_balasan / p.durasi_hari);
            return (
              <div key={p.id} className={`relative flex flex-col rounded-2xl border-2 p-5 transition-shadow ${pas ? "border-accent shadow-[0_16px_40px_-16px_rgba(15,122,92,0.45)]" : "border-line"}`}>
                <div className="absolute -top-3 left-4 flex flex-wrap gap-1.5">
                  {pas && <span className="rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-bold text-on-accent">{t("Cocok untuk kamu", "Best fit for you")}</span>}
                  {p.unggulan && <span className="rounded-full bg-warning px-2.5 py-0.5 text-[11px] font-bold text-ink">{t("Paling banyak dipilih", "Most popular")}</span>}
                </div>
                <h3 className="mt-1 text-[17px] font-bold">{p.nama}</h3>
                {p.deskripsi && <p className="text-[12.5px] text-muted">{p.deskripsi}</p>}
                <p className="mt-3 text-[28px] leading-none font-extrabold tabular-nums">
                  {rp(p.harga)} <span className="text-[13px] font-semibold text-muted">/ {p.durasi_hari} {t("hari", "days")}</span>
                </p>
                <p className="mt-1 text-[13px] font-semibold text-accent tabular-nums">
                  ± {rp(perHari)} / {t("hari", "day")}
                </p>
                <ul className="mt-4 flex-1 space-y-2 text-[13.5px]">
                  {[
                    t(`${angka(p.kuota_nomor, b)} nomor WhatsApp`, `${angka(p.kuota_nomor, b)} WhatsApp number${p.kuota_nomor > 1 ? "s" : ""}`),
                    t(`${angka(p.kuota_balasan, b)} balasan AI (± ${angka(chatHari, b)} chat/hari)`, `${angka(p.kuota_balasan, b)} AI replies (± ${angka(chatHari, b)} chats/day)`),
                    t("Kirim katalog & foto produk otomatis", "Sends product catalog & photos automatically"),
                    t("Belajar dari cara kamu membalas", "Learns from how you reply"),
                  ].map((x) => (
                    <li key={x} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                      <span>{x}</span>
                    </li>
                  ))}
                </ul>
                <Link href={`/langganan/bayar/${p.id}`} className={`btn mt-5 min-h-11 w-full ${pas ? "btn-primary" : "btn-ghost border border-line"}`}>
                  {t(`Pilih ${p.nama}`, `Choose ${p.nama}`)} <ArrowRight className="size-4" aria-hidden />
                </Link>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
