"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { ArrowRight, Check, Clock, Users, Wallet, X } from "lucide-react";
import Link from "@/components/link";
import { useBahasa } from "@/components/bahasa";
import { angka, uang } from "@/lib/format";
import { JAMINAN_HARI } from "@/lib/jaminan-def";

/**
 * Perbandingan biaya admin CS WhatsApp vs langganan ChatGerCep. Dipakai di landing (setelah Fitur) dan di /trial-habis,
 * jadi asumsi & rumusnya satu tempat. Semua hitungan di klien, tanpa permintaan jaringan.
 */

export interface PaketBanding {
  id: number;
  nama: string;
  harga: number;
  durasi_hari: number;
  kuota_balasan: number;
}

/** Asumsi (ditampilkan ke pengguna): 1,5 menit per balasan manual, ±92% chat dijawab AI, 200 chat per admin per shift. */
export const MENIT_PER_BALASAN = 1.5;
export const BAGIAN_AI = 0.92;
export const CHAT_PER_ADMIN_SHIFT = 200;
/** Biaya admin = gaji + ±25% (BPJS ±10%, THR dibagi 12 ±8%, kuota/HP/makan). */
export const TAMBAHAN_BIAYA = 0.25;
export const PILIHAN_GAJI = [3_000_000, 4_000_000, 5_000_000, 6_000_000] as const;

/** Paket terkecil yang kuotanya (per 30 hari) cukup untuk chat yang dijawab AI; tidak ada = paket terbesar. */
export function rekomendasi<P extends PaketBanding>(paket: P[], chatPerHari: number): P | undefined {
  const butuh = chatPerHari * 30 * BAGIAN_AI;
  return paket.find((p) => (p.kuota_balasan / p.durasi_hari) * 30 >= butuh) ?? paket.at(-1);
}

export interface NilaiKalkulator {
  chat: number;
  shift: 1 | 3;
  gaji: number;
}

/** Kalkulator: masukan (chat/hari, jam layanan, gaji) di kiri, hasil di panel gelap kanan. Nilainya dipegang pemanggil. */
export function KalkulatorAdmin({
  paket,
  nilai,
  ubah,
  kurs,
  anda = false,
  catatanChat,
  aksi,
}: {
  paket: PaketBanding[];
  nilai: NilaiKalkulator;
  ubah: (v: NilaiKalkulator) => void;
  kurs?: number;
  /** Sapaan "Anda" (landing) atau "kamu" (halaman akun). */
  anda?: boolean;
  catatanChat?: ReactNode;
  /** Tombol ajakan di bawah hasil (mis. "Daftar sekarang"). */
  aksi?: ReactNode;
}) {
  const { b, t } = useBahasa();
  const rp = (n: number) => uang(Math.round(n), b, kurs);
  const { chat, shift, gaji } = nilai;
  const jamManual = Math.round((chat * 30 * MENIT_PER_BALASAN) / 60);
  const admin = Math.max(1, Math.ceil(chat / CHAT_PER_ADMIN_SHIFT)) * shift;
  const biayaAdmin = admin * gaji * (1 + TAMBAHAN_BIAYA);
  const cocok = rekomendasi(paket, chat);
  const harga30 = cocok ? (cocok.harga / cocok.durasi_hari) * 30 : 0;
  const hemat = Math.max(0, biayaAdmin - harga30);
  const persen = biayaAdmin > 0 && cocok ? (harga30 / biayaAdmin) * 100 : 0;

  return (
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-3xl border border-line bg-line lg:grid-cols-2">
      <div className="space-y-5 bg-surface p-5 sm:p-7">
        <div>
          <label htmlFor="ba-chat" className="flex items-baseline justify-between gap-3">
            <span className="text-[13.5px] font-semibold">{t("Chat pelanggan per hari", "Customer chats per day")}</span>
            <span className="text-2xl font-bold text-accent tabular-nums">{chat}</span>
          </label>
          <input id="ba-chat" type="range" min={5} max={400} step={5} value={chat} onChange={(e) => ubah({ ...nilai, chat: Number(e.target.value) })} className="mt-3 w-full accent-[var(--c-accent)]" />
          {catatanChat && <p className="mt-1 text-[12px] text-muted">{catatanChat}</p>}
        </div>
        <div>
          <p className="text-[13.5px] font-semibold">{t("Mau dibalas kapan?", "When should chats be answered?")}</p>
          <div role="radiogroup" aria-label={t("Jam layanan", "Service hours")} className="mt-2 grid grid-cols-2 gap-2">
            {([1, 3] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={shift === s}
                onClick={() => ubah({ ...nilai, shift: s })}
                className={`min-h-11 rounded-xl border px-3 text-[13px] font-semibold transition-colors ${shift === s ? "border-accent bg-accent text-on-accent" : "border-line-strong text-muted hover:text-fg"}`}
              >
                {s === 1 ? t("Jam kerja (8 jam)", "Office hours (8 h)") : t("24 jam", "24 hours")}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[13.5px] font-semibold">{t("Gaji admin CS per bulan", "CS admin salary per month")}</p>
          <div role="radiogroup" aria-label={t("Gaji admin", "Admin salary")} className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PILIHAN_GAJI.map((g) => (
              <button
                key={g}
                type="button"
                role="radio"
                aria-checked={gaji === g}
                onClick={() => ubah({ ...nilai, gaji: g })}
                className={`min-h-11 rounded-xl border px-2 text-[12.5px] font-semibold tabular-nums transition-colors ${gaji === g ? "border-accent bg-accent-soft text-accent" : "border-line-strong text-muted hover:text-fg"}`}
              >
                {rp(g)}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[12px] text-muted">{t("Ditambah ±25% untuk BPJS, THR, dan kuota/HP.", "Plus ±25% for insurance, holiday bonus, and data/phone.")}</p>
        </div>
      </div>

      <div className="flex flex-col justify-between gap-5 bg-ink p-5 text-ink-fg sm:p-7">
        <dl className="space-y-3 text-[13.5px]">
          <div className="flex items-center justify-between gap-3 border-b border-ink-line pb-3">
            <dt className="flex items-center gap-2 text-ink-muted"><Clock className="size-4 shrink-0" aria-hidden />{t("Waktu membalas manual / bulan", "Manual reply time / month")}</dt>
            <dd className="font-bold tabular-nums">± {angka(jamManual, b)} {t("jam", "h")}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 border-b border-ink-line pb-3">
            <dt className="flex items-center gap-2 text-ink-muted"><Users className="size-4 shrink-0" aria-hidden />{t(`Biaya ${admin} admin / bulan`, `Cost of ${admin} admin${admin > 1 ? "s" : ""} / month`)}</dt>
            <dd className="font-bold text-danger tabular-nums line-through decoration-2">{rp(biayaAdmin)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-2 text-ink-muted"><Wallet className="size-4 shrink-0" aria-hidden />{t("ChatGerCep yang cocok", "Matching ChatGerCep plan")}</dt>
            <dd className="text-right font-bold tabular-nums">{cocok ? `${cocok.nama} · ${rp(cocok.harga)}` : "-"}</dd>
          </div>
        </dl>
        <div>
          <p className="text-[13px] text-ink-muted">{anda ? t("Anda hemat per bulan", "You save per month") : t("Kamu hemat per bulan", "You save per month")}</p>
          <p className="text-3xl font-extrabold text-ink-signal tabular-nums sm:text-4xl">{rp(hemat)}</p>
          {cocok && (
            <p className="mt-1 text-[12.5px] text-ink-muted">
              {t(
                `ChatGerCep cuma ${persen.toLocaleString("id-ID", { maximumFractionDigits: 1 })}% dari biaya admin, dan membalas 24 jam.`,
                `ChatGerCep is only ${persen.toLocaleString("en-US", { maximumFractionDigits: 1 })}% of the admin cost, and replies 24/7.`,
              )}
            </p>
          )}
          {aksi && <div className="mt-4">{aksi}</div>}
          <p className="mt-3 text-[11.5px] text-ink-muted/80">
            {t(
              `Perkiraan: ${MENIT_PER_BALASAN.toLocaleString("id-ID")} menit per balasan manual, ±${BAGIAN_AI * 100}% chat dijawab AI, satu admin ±${CHAT_PER_ADMIN_SHIFT} chat per shift.`,
              `Estimate: ${MENIT_PER_BALASAN} min per manual reply, ±${BAGIAN_AI * 100}% of chats answered by AI, one admin handles ±${CHAT_PER_ADMIN_SHIFT} chats per shift.`,
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Dua kartu "1 admin CS" vs "ChatGerCep": jangkar harga sebelum kalkulator (landing). */
export function KartuVs({ termurah, kurs }: { termurah: PaketBanding | undefined; kurs?: number }) {
  const { b, t } = useBahasa();
  const rp = (n: number) => uang(Math.round(n), b, kurs);
  const biaya1 = 4_000_000 * (1 + TAMBAHAN_BIAYA);
  const kurang = [
    t("Hanya 8 jam sehari, chat malam menunggu sampai pagi", "Only 8 hours a day, night chats wait until morning"),
    t("Libur, sakit, atau resign = chat tidak terbalas", "Days off, sick leave, or quitting = unanswered chats"),
    t("±1,5 menit per balasan, antre saat ramai", "±1.5 min per reply, queues when it's busy"),
    t("Perlu dilatih ulang tiap ganti orang", "Needs retraining with every new hire"),
  ];
  const lebih = [
    t("Membalas 24 jam, 7 hari, rata-rata < 10 detik", "Replies 24/7, in under 10 seconds on average"),
    t("Menjawab dari menu, harga & FAQ Anda, tidak mengarang", "Answers from your menu, prices & FAQ, never makes things up"),
    t("Melayani banyak chat sekaligus, tidak pernah antre", "Handles many chats at once, no queues"),
    t("Anda membalas dari HP? AI otomatis mundur", "Reply from your phone? The AI steps back automatically"),
  ];
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="rounded-3xl border border-danger/25 bg-danger-soft/60 p-6">
        <p className="text-[13px] font-bold tracking-wide text-danger uppercase">{t("1 admin CS WhatsApp", "1 WhatsApp CS admin")}</p>
        <p className="mt-2 text-3xl font-extrabold text-danger tabular-nums">± {rp(biaya1)}</p>
        <p className="text-[13px] text-muted">{t("per bulan (gaji Rp4 jt + BPJS, THR, kuota)", "per month (Rp4M salary + insurance, bonus, data)")}</p>
        <ul className="mt-4 space-y-2 text-[14px]">
          {kurang.map((x) => (
            <li key={x} className="flex gap-2">
              <X className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
              <span>{x}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-3xl border-2 border-accent bg-accent-soft/50 p-6">
        <p className="text-[13px] font-bold tracking-wide text-accent uppercase">ChatGerCep</p>
        <p className="mt-2 text-3xl font-extrabold text-accent tabular-nums">{termurah ? `${t("mulai", "from")} ${rp(termurah.harga)}` : t("Uji bot gratis", "Free bot test")}</p>
        <p className="text-[13px] text-muted">
          {termurah
            ? t(`per ${termurah.durasi_hari} hari, ± ${rp(termurah.harga / termurah.durasi_hari)} per hari`, `per ${termurah.durasi_hari} days, ± ${rp(termurah.harga / termurah.durasi_hari)} a day`)
            : t(`jaminan uang kembali ${JAMINAN_HARI} hari`, `${JAMINAN_HARI}-day money-back guarantee`)}
        </p>
        <ul className="mt-4 space-y-2 text-[14px]">
          {lebih.map((x) => (
            <li key={x} className="flex gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
              <span>{x}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Versi landing: kartu VS + kalkulator dengan tombol daftar. */
export function BandingAdminLanding({ paket, kurs }: { paket: PaketBanding[]; kurs?: number }) {
  const { t } = useBahasa();
  const [nilai, setNilai] = useState<NilaiKalkulator>({ chat: 30, shift: 1, gaji: 4_000_000 });
  return (
    <div className="mt-10 space-y-4">
      <KartuVs termurah={paket[0]} kurs={kurs} />
      <KalkulatorAdmin
        paket={paket}
        nilai={nilai}
        ubah={setNilai}
        kurs={kurs}
        anda
        aksi={
          <Link href="/daftar" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink-signal px-5 text-[14px] font-bold text-ink transition-transform hover:-translate-y-0.5">
            {t("Daftar sekarang", "Sign up now")} <ArrowRight className="size-4" aria-hidden />
          </Link>
        }
      />
    </div>
  );
}
