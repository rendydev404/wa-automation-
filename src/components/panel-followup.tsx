"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { CheckCheck, Flame, Loader2, Lock, Pencil, RefreshCw, Repeat, ShieldCheck, Square, Sun } from "lucide-react";
import {
  hentikanFollowupNomorAction,
  lepasRemFollowupNomorAction,
  simpanFollowupNomorAction,
  simpanPesanFollowupNomorAction,
  tulisUlangFollowupNomorAction,
} from "@/app/actions";
import { angka, formatNomor, waktuSingkatWib } from "@/lib/format";
import {
  BATAS_PESAN,
  BATAS_SETELAN_USAHA,
  type BarisUsaha,
  NAMA_TAHAP_USAHA,
  RITME_USAHA,
  type SetelanUsaha,
  type StatusUsaha,
} from "@/lib/followup-def";
import { useBahasa } from "./bahasa";
import Link from "./link";
import { Pesan, Saklar, SubmitButton } from "./ui";

type T = ReturnType<typeof useBahasa>["t"];

/**
 * Tab Follow-up di halaman nomor: saklar follow-up prospek & pengingat order ulang, jam kirim, batas harian, ritme,
 * status (rem, batas otomatis, kuota), dan daftar chat yang sedang/pernah di-follow-up dengan draf yang bisa diedit.
 * Aturan anti-blokir ada di src/lib/followup-usaha.ts.
 */
export function PanelFollowup({ numberId, status, daftar, kini }: { numberId: number; status: StatusUsaha; daftar: BarisUsaha[]; kini: number }) {
  const { t, b } = useBahasa();
  const s = status.setelan;
  const nyala = s.aktif || s.ulangAktif;
  const kuotaHabis = status.sisaKuota !== null && status.sisaKuota <= 0;
  const keadaan = !status.boleh
    ? { label: t("Perlu langganan", "Needs a plan"), nada: "text-muted" }
    : !nyala
      ? { label: t("Mati", "Off"), nada: "text-muted" }
      : status.rem
        ? { label: t("Direm otomatis", "Auto-paused"), nada: "text-danger" }
        : kuotaHabis
          ? { label: t("Kuota AI habis", "AI quota used up"), nada: "text-warning" }
          : !status.terhubung || status.tahan || status.sebabBatas === "baru"
            ? { label: t("Tertahan", "On hold"), nada: "text-warning" }
            : { label: t("Berjalan", "Running"), nada: "text-success" };
  const sebab =
    status.tahan === "bahaya"
      ? t("Ditahan: WhatsApp memberi tanda pembatasan pada nomor ini", "Held: WhatsApp signalled a restriction on this number")
      : status.tahan === "stabil"
        ? t("Menunggu koneksi nomor stabil 1 jam sebelum mengirim", "Waiting for the connection to be stable for 1 hour")
        : status.sebabBatas === "baru"
          ? t("Nomor baru: follow-up mulai setelah 3 hari pertama", "New number: follow-up starts after the first 3 days")
          : status.sebabBatas === "pemanasan"
      ? t("Nomor baru: dibatasi selama 7 hari pertama", "New number: limited for the first 7 days")
      : status.sebabBatas === "rasio"
        ? t("Menyesuaikan jumlah balasan biasa nomor ini", "Matched to this number's normal reply volume")
        : t("Sesuai batas harian di pengaturan", "Your daily limit");
  const persen = status.terkirim ? `${Math.round((status.dibalas / status.terkirim) * 100)}%` : "–";

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-6">
        {!status.boleh && (
          <div className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Lock className="mt-0.5 size-5 shrink-0 text-faint" aria-hidden />
              <div>
                <p className="text-[14px] font-bold">{t("Follow-up otomatis untuk akun berlangganan", "Automatic follow-up is for paid plans")}</p>
                <p className="mt-0.5 text-[13px] text-muted">
                  {t(
                    "Aktifkan paket supaya pelanggan yang tanya lalu diam, dan pembeli lama, disapa lagi otomatis dengan aman.",
                    "Activate a plan so customers who asked then went quiet, and past buyers, are followed up automatically and safely.",
                  )}
                </p>
              </div>
            </div>
            <Link href="/langganan" className="btn btn-primary shrink-0">
              {t("Lihat paket", "See plans")}
            </Link>
          </div>
        )}
        {status.rem && <BannerRem numberId={numberId} alasan={status.rem.alasan} pada={status.rem.pada} kini={kini} />}

        <section aria-label={t("Status follow-up", "Follow-up status")} className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <Kotak judul={t("Status", "Status")} isi={keadaan.label} nada={keadaan.nada} catatan={status.terhubung ? t("WhatsApp terhubung", "WhatsApp connected") : t("WhatsApp belum terhubung", "WhatsApp not connected")} />
          <Kotak judul={t("Terkirim hari ini", "Sent today")} isi={`${angka(status.kirimHariIni, b)} / ${angka(status.batasHariIni, b)}`} catatan={sebab} />
          <Kotak judul={t("Dibalas", "Replied")} isi={persen} catatan={t(`${angka(status.dibalas)} dari ${angka(status.terkirim)} chat`, `${angka(status.dibalas, b)} of ${angka(status.terkirim, b)} chats`)} />
          <Kotak
            judul={t("Sisa kuota AI", "AI quota left")}
            isi={status.sisaKuota === null ? t("Tanpa batas", "Unlimited") : angka(status.sisaKuota, b)}
            nada={kuotaHabis ? "text-warning" : undefined}
            catatan={t("1 pesan follow-up AI = 1 balasan", "1 AI follow-up message = 1 reply")}
          />
        </section>

        <section className="card p-5 sm:p-6">
          <h2 className="text-[15px] font-bold">{t("Pengaturan", "Settings")}</h2>
          <div className="mt-4">
            <FormFollowup numberId={numberId} awal={s} boleh={status.boleh} />
          </div>
        </section>

        <Daftar numberId={numberId} daftar={daftar} kini={kini} />
      </div>

      <aside className="space-y-6">
        <section className="card p-5 sm:p-6">
          <h2 className="text-[15px] font-bold">{t("Cara kerjanya", "How it works")}</h2>
          <ul className="mt-3.5 space-y-3 text-[12.5px]">
            <li>
              <p className="font-semibold text-fg">{t("Pelanggan yang tanya lalu diam", "Customers who asked then went quiet")}</p>
              <p className="text-muted">
                {t(
                  "Pelanggan yang tadi tanya harga atau siap pesan tapi berhenti membalas dikirimi paling banyak 3 pesan: lanjutan, manfaat, lalu pamit. Berhenti begitu ia membalas.",
                  "Customers who asked about prices or were ready to order but stopped replying get at most 3 messages: a follow-up, the value, then a goodbye. It stops as soon as they reply.",
                )}
              </p>
            </li>
            <li>
              <p className="font-semibold text-fg">{t("Pengingat order ulang", "Reorder reminder")}</p>
              <p className="text-muted">
                {t(
                  "Pembeli yang sudah bayar atau menerima pesanan disapa sekali setelah siklus yang Anda pilih, misalnya laundry 7 hari. Satu pesan per pembelian.",
                  "Buyers who paid or received their order get one message after the cycle you choose, e.g. 7 days for a laundry. One message per purchase.",
                )}
              </p>
            </li>
            <li>
              <p className="font-semibold text-fg">{t("Ditulis dari chat-nya", "Written from their chat")}</p>
              <p className="text-muted">{t("Tiap pesan ditulis AI dari isi chat pelanggan itu dan Informasi Usaha Anda. Anda bisa membaca dan mengedit pesannya sebelum terkirim.", "Each message is written by AI from that customer's chat and your Business Info. You can read and edit it before it is sent.")}</p>
            </li>
          </ul>
        </section>
        <section className="card p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-[15px] font-bold">
            <ShieldCheck className="size-4 text-accent" aria-hidden /> {t("Aturan anti-blokir", "Anti-block rules")}
          </h2>
          <ul className="mt-3.5 space-y-2.5 text-[12.5px] text-muted">
            {[
              t("Hanya ke pelanggan yang chat duluan. Tidak pernah membuka chat baru atau broadcast.", "Only customers who messaged you first. Never starts new chats or broadcasts."),
              t("Ritme seperti manusia: mengetik dulu, jeda acak 3–10 menit antarpesan, hanya di jam kirim.", "Human-like pace: typing first, a random 3–10 minute gap between messages, only during sending hours."),
              t("Batas harian, dibatasi lagi untuk nomor baru dan nomor yang sepi.", "A daily limit, tightened further for new and quiet numbers."),
              t("Rem otomatis bila banyak pesan tidak sampai ke HP (centang satu).", "Auto-pause if many messages are not delivered (single tick)."),
              t("Pelanggan yang membalas \"stop\" tidak pernah dihubungi lagi.", "Customers who reply \"stop\" are never contacted again."),
              t("Chat yang sedang Anda balas sendiri dilewati.", "Chats you are replying to yourself are skipped."),
              t("Tanpa tautan, tanpa promo atau batas waktu palsu, harga hanya dari Informasi Usaha.", "No links, no fake promos or deadlines, prices only from your Business Info."),
            ].map((a) => (
              <li key={a} className="flex gap-2">
                <CheckCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}

function Kotak({ judul, isi, catatan, nada }: { judul: string; isi: string; catatan: string; nada?: string }) {
  return (
    <div className="card min-w-0 p-4">
      <p className="text-[12px] font-semibold text-muted">{judul}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums sm:text-xl ${nada ?? ""}`}>{isi}</p>
      <p className="mt-0.5 text-[12px] leading-snug text-muted">{catatan}</p>
    </div>
  );
}

function BannerRem({ numberId, alasan, pada, kini }: { numberId: number; alasan: string; pada: number; kini: number }) {
  const { t, b } = useBahasa();
  const [hasil, setHasil] = useState<{ ok: boolean; pesan?: string } | null>(null);
  const [tunggu, mulai] = useTransition();
  return (
    <div role="alert" className="rounded-2xl border border-danger/30 bg-danger-soft p-4 sm:p-5">
      <p className="text-[14px] font-bold text-danger">{t("Follow-up dihentikan otomatis", "Follow-up paused automatically")}</p>
      <p className="mt-1 text-[13px] text-fg">
        {alasan} <span className="text-muted">({waktuSingkatWib(pada, kini, b)})</span>
      </p>
      <p className="mt-1 text-[12.5px] text-muted">
        {t(
          "Ini tanda nomor mulai diblokir atau dilaporkan. Cek nomornya di HP (bisa kirim & terima pesan biasa?) sebelum melanjutkan.",
          "This can mean the number is being blocked or reported. Check the phone (can it send and receive normal messages?) before resuming.",
        )}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-analitik="Follow-up nomor: lanjutkan setelah rem"
          className="btn btn-ghost border border-line bg-surface"
          disabled={tunggu}
          onClick={() => mulai(async () => setHasil(await lepasRemFollowupNomorAction(numberId)))}
        >
          {tunggu && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {t("Nomor aman, lanjutkan", "Number is fine, resume")}
        </button>
        <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
      </div>
    </div>
  );
}

type Ritme = keyof typeof RITME_USAHA | "khusus";

function ritmeDari(s: Pick<SetelanUsaha, "jedaPanasJam" | "jedaHangatJam" | "tahap2Jam" | "tahap3Jam">): Ritme {
  for (const [k, v] of Object.entries(RITME_USAHA)) if (v.jedaPanasJam === s.jedaPanasJam && v.jedaHangatJam === s.jedaHangatJam && v.tahap2Jam === s.tahap2Jam && v.tahap3Jam === s.tahap3Jam) return k as Ritme;
  return "khusus";
}

function FormFollowup({ numberId, awal, boleh }: { numberId: number; awal: SetelanUsaha; boleh: boolean }) {
  const { t } = useBahasa();
  const [hasil, aksi] = useActionState(simpanFollowupNomorAction, null);
  const [aktif, setAktif] = useState(awal.aktif);
  const [ulang, setUlang] = useState(awal.ulangAktif);
  const [jeda, setJeda] = useState({ jedaPanasJam: awal.jedaPanasJam, jedaHangatJam: awal.jedaHangatJam, tahap2Jam: awal.tahap2Jam, tahap3Jam: awal.tahap3Jam });
  const [siklus, setSiklus] = useState(awal.siklusUlangHari);
  const [berubah, setBerubah] = useState(false);
  const ritme = ritmeDari(jeda);
  const ubah = () => setBerubah(true);
  const jam = (n: number) => `${String(n).padStart(2, "0")}.00`;
  return (
    <form action={aksi} onChange={ubah} onSubmit={() => setBerubah(false)} className="space-y-5">
      <input type="hidden" name="number_id" value={numberId} />
      {aktif && <input type="hidden" name="aktif" value="on" />}
      {ulang && <input type="hidden" name="ulang_aktif" value="on" />}
      <div className="grid gap-3 sm:grid-cols-2">
        <KartuSaklar
          judul={t("Pelanggan yang tanya lalu diam", "Customers who went quiet")}
          isi={aktif ? t("Menyala: maks 3 pesan per pelanggan, berhenti begitu dibalas.", "On: max 3 messages per customer, stops once they reply.") : t("Mati: tidak ada pesan yang dikirim.", "Off: no messages are sent.")}
          aktif={aktif}
          disabled={!boleh}
          onUbah={(v) => {
            setAktif(v);
            ubah();
          }}
        />
        <KartuSaklar
          judul={t("Pengingat order ulang", "Reorder reminder")}
          isi={ulang ? t(`Menyala: 1 pesan ke pembeli lama setelah ${siklus} hari.`, `On: 1 message to past buyers after ${siklus} days.`) : t("Mati: pembeli lama tidak disapa.", "Off: past buyers are not contacted.")}
          aktif={ulang}
          disabled={!boleh}
          onUbah={(v) => {
            setUlang(v);
            ubah();
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="fu-jam-mulai" className="label">
            {t("Jam kirim mulai", "Send from")}
          </label>
          <select id="fu-jam-mulai" name="jam_mulai" defaultValue={awal.jamMulai} className="field tabular-nums">
            {Array.from({ length: 24 }, (_, i) => (
              <option key={i} value={i}>
                {jam(i)} WIB
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="fu-jam-selesai" className="label">
            {t("Sampai", "Until")}
          </label>
          <select id="fu-jam-selesai" name="jam_selesai" defaultValue={awal.jamSelesai} className="field tabular-nums">
            {Array.from({ length: 24 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {jam(i + 1)} WIB
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="fu-batas" className="label">
            {t("Batas pesan per hari", "Messages per day")}
          </label>
          <input id="fu-batas" name="batas_harian" type="number" required min={BATAS_SETELAN_USAHA.batasHarian[0]} max={BATAS_SETELAN_USAHA.batasHarian[1]} defaultValue={awal.batasHarian} className="field tabular-nums" />
          <p className="mt-1 text-[12px] text-muted">{t("Bisa lebih kecil otomatis untuk nomor baru / sepi.", "May be lowered automatically for new / quiet numbers.")}</p>
        </div>
      </div>

      <fieldset>
        <legend className="label">{t("Ritme pesan", "Message pace")}</legend>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t("Ritme pesan", "Message pace")}>
          {(["cepat", "normal", "santai"] as const).map((k) => {
            const r = RITME_USAHA[k];
            const pilih = ritme === k;
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={pilih}
                data-analitik={`Follow-up nomor: ritme ${k}`}
                onClick={() => {
                  setJeda({ ...r });
                  ubah();
                }}
                className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${pilih ? "border-accent bg-accent-soft" : "border-line hover:bg-subtle"}`}
              >
                <span className={`block text-[13px] font-bold ${pilih ? "text-accent" : ""}`}>{k === "cepat" ? t("Cepat", "Fast") : k === "normal" ? t("Normal", "Normal") : t("Santai", "Relaxed")}</span>
                <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">
                  {t(`Pesan 1 setelah ${r.jedaHangatJam} jam`, `1st message after ${r.jedaHangatJam}h`)}
                </span>
              </button>
            );
          })}
        </div>
        {ritme === "khusus" && <p className="mt-1.5 text-[12px] text-muted">{t("Memakai angka khusus di Pengaturan lanjutan.", "Using custom numbers from Advanced settings.")}</p>}
      </fieldset>

      <div>
        <label htmlFor="fu-siklus" className="label">
          {t("Order ulang setelah (hari)", "Reorder after (days)")}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="fu-siklus"
            name="siklus_ulang_hari"
            type="number"
            required
            min={BATAS_SETELAN_USAHA.siklusUlangHari[0]}
            max={BATAS_SETELAN_USAHA.siklusUlangHari[1]}
            value={siklus}
            onChange={(e) => setSiklus(Number(e.target.value))}
            className="field w-28 tabular-nums"
          />
          {[7, 14, 30].map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => {
                setSiklus(h);
                ubah();
              }}
              className={`rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold ${siklus === h ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:bg-subtle"}`}
            >
              {h} {t("hari", "days")}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[12px] text-muted">{t("Contoh: laundry 7, kuliner 14, skincare 30. Pembeli yang diam lebih dari 90 hari tidak disapa.", "E.g. laundry 7, food 14, skincare 30. Buyers quiet for more than 90 days are not contacted.")}</p>
      </div>

      <details className="rounded-xl border border-line bg-subtle/40 px-3.5 py-2">
        <summary className="flex min-h-9 cursor-pointer items-center text-[12.5px] font-semibold text-accent select-none">{t("Pengaturan lanjutan", "Advanced settings")}</summary>
        <div className="grid grid-cols-1 gap-4 pt-2 pb-2 sm:grid-cols-2">
          <Isian id="fu-panas" nama="jeda_panas_jam" label={t("Pesan 1 untuk pelanggan siap pesan (jam diam)", "1st message, ready-to-buy (hours quiet)")} nilai={jeda.jedaPanasJam} batas={BATAS_SETELAN_USAHA.jedaPanasJam} onUbah={(v) => setJeda((j) => ({ ...j, jedaPanasJam: v }))} />
          <Isian id="fu-hangat" nama="jeda_hangat_jam" label={t("Pesan 1 untuk pelanggan yang menimbang (jam diam)", "1st message, considering (hours quiet)")} nilai={jeda.jedaHangatJam} batas={BATAS_SETELAN_USAHA.jedaHangatJam} onUbah={(v) => setJeda((j) => ({ ...j, jedaHangatJam: v }))} />
          <Isian id="fu-t2" nama="tahap2_jam" label={t("Pesan 2 setelah pesan 1 (jam)", "2nd message after the 1st (hours)")} nilai={jeda.tahap2Jam} batas={BATAS_SETELAN_USAHA.tahap2Jam} onUbah={(v) => setJeda((j) => ({ ...j, tahap2Jam: v }))} />
          <Isian id="fu-t3" nama="tahap3_jam" label={t("Pesan 3 setelah pesan 2 (jam)", "3rd message after the 2nd (hours)")} nilai={jeda.tahap3Jam} batas={BATAS_SETELAN_USAHA.tahap3Jam} onUbah={(v) => setJeda((j) => ({ ...j, tahap3Jam: v }))} />
          <div>
            <label htmlFor="fu-maks" className="label">
              {t("Jumlah pesan per pelanggan", "Messages per customer")}
            </label>
            <input id="fu-maks" name="maks_tahap" type="number" required min={1} max={3} defaultValue={awal.maksTahap} className="field tabular-nums" />
            <p className="mt-1 text-[12px] text-muted">{t("1–3. Berhenti begitu dibalas.", "1–3. Stops once they reply.")}</p>
          </div>
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <SubmitButton>{t("Simpan", "Save")}</SubmitButton>
        {berubah ? <span className="text-[12.5px] font-semibold text-warning">{t("Belum disimpan", "Not saved yet")}</span> : <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>}
      </div>
    </form>
  );
}

function KartuSaklar({ judul, isi, aktif, disabled, onUbah }: { judul: string; isi: string; aktif: boolean; disabled: boolean; onUbah: (v: boolean) => void }) {
  return (
    <div className={`flex items-start justify-between gap-4 rounded-2xl border p-4 ${aktif ? "border-accent/40 bg-accent-soft/40" : "border-line bg-subtle/50"}`}>
      <div className="min-w-0">
        <p className="text-[14px] font-bold">{judul}</p>
        <p className="mt-0.5 text-[12.5px] text-muted">{isi}</p>
      </div>
      <Saklar aktif={aktif} onUbah={onUbah} label={judul} disabled={disabled} />
    </div>
  );
}

function Isian({ id, nama, label, nilai, batas, onUbah }: { id: string; nama: string; label: string; nilai: number; batas: readonly [number, number]; onUbah: (v: number) => void }) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input id={id} name={nama} type="number" required min={batas[0]} max={batas[1]} value={nilai} onChange={(e) => onUbah(Number(e.target.value))} className="field tabular-nums" />
    </div>
  );
}

// ---------- Daftar chat ----------

const NADA: Record<string, string> = {
  jalan: "bg-accent-soft text-accent",
  terkirim: "bg-accent-soft text-accent",
  dibalas: "bg-success-soft text-success",
  selesai: "bg-subtle text-muted",
  batal: "bg-subtle text-faint",
  stop: "bg-warning-soft text-warning",
  gagal: "bg-danger-soft text-danger",
};

function labelStatus(s: string, jenis: BarisUsaha["jenis"], t: T): string {
  switch (s) {
    case "jalan":
      return jenis === "ulang" ? t("Menunggu dikirim", "Waiting to send") : t("Berjalan", "Running");
    case "terkirim":
      return t("Terkirim", "Sent");
    case "dibalas":
      return t("Dibalas", "Replied");
    case "selesai":
      return t("Selesai", "Finished");
    case "batal":
      return t("Dibatalkan", "Cancelled");
    case "stop":
      return t("Minta berhenti", "Asked to stop");
    default:
      return t("Gagal", "Failed");
  }
}

type Saring = "semua" | "jalan" | "dibalas" | "selesai";

function Daftar({ numberId, daftar, kini }: { numberId: number; daftar: BarisUsaha[]; kini: number }) {
  const { t } = useBahasa();
  const [saring, setSaring] = useState<Saring>("semua");
  const tampil = useMemo(
    () =>
      daftar.filter((x) =>
        saring === "semua" ? true : saring === "jalan" ? x.status === "jalan" : saring === "dibalas" ? x.status === "dibalas" : x.status !== "jalan" && x.status !== "dibalas",
      ),
    [daftar, saring],
  );
  const pilihan: { id: Saring; label: string }[] = [
    { id: "semua", label: t("Semua", "All") },
    { id: "jalan", label: t("Berjalan", "Running") },
    { id: "dibalas", label: t("Dibalas", "Replied") },
    { id: "selesai", label: t("Selesai & lainnya", "Finished & other") },
  ];
  return (
    <section className="card overflow-hidden">
      <div className="space-y-3 border-b border-line p-4 sm:p-5">
        <div>
          <h2 className="text-[15px] font-bold">{t("Pelanggan yang di-follow-up", "Followed-up customers")}</h2>
          <p className="text-[13px] text-muted">{t("50 terbaru. Buka \"Pesan\" untuk membaca, mengedit, atau menghentikan pesan berikutnya sebelum terkirim.", "Latest 50. Open \"Messages\" to read, edit, or stop the next message before it is sent.")}</p>
        </div>
        <nav aria-label={t("Saring status", "Filter by status")} className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-0">
          {pilihan.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={saring === p.id}
              onClick={() => setSaring(p.id)}
              className={`shrink-0 rounded-lg border px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap transition-colors ${saring === p.id ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:bg-subtle hover:text-fg"}`}
            >
              {p.label}
            </button>
          ))}
        </nav>
      </div>
      {tampil.length === 0 ? (
        <p className="px-5 py-10 text-center text-[13px] text-muted">
          {daftar.length
            ? t("Tidak ada yang cocok dengan saringan ini.", "Nothing matches this filter.")
            : t("Belum ada pelanggan yang di-follow-up. Pelanggan yang tanya lalu diam, dan pembeli lama, akan muncul di sini.", "No customers followed up yet. Customers who asked then went quiet, and past buyers, will show up here.")}
        </p>
      ) : (
        <ul data-analitik-privat className="divide-y divide-line">
          {tampil.map((x) => (
            <Baris key={`${x.jenis}-${x.kunci}`} numberId={numberId} x={x} kini={kini} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Baris({ numberId, x, kini }: { numberId: number; x: BarisUsaha; kini: number }) {
  const { t, b } = useBahasa();
  const berjalan = x.status === "jalan";
  return (
    <li className="space-y-2.5 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold">
            <span className="truncate">{x.nama || t("(tanpa nama)", "(no name)")}</span>
            {x.jenis === "ulang" ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-subtle px-1.5 py-0.5 text-[11px] font-semibold text-muted">
                <Repeat className="size-3" aria-hidden /> {t("Order ulang", "Reorder")}
              </span>
            ) : (x.minat ?? 0) >= 2 ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-danger-soft px-1.5 py-0.5 text-[11px] font-semibold text-danger">
                <Flame className="size-3" aria-hidden /> {t("Panas", "Hot")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md bg-warning-soft px-1.5 py-0.5 text-[11px] font-semibold text-warning">
                <Sun className="size-3" aria-hidden /> {t("Hangat", "Warm")}
              </span>
            )}
          </p>
          <p className="text-[12.5px] text-muted tabular-nums">{x.tujuan ? formatNomor(x.tujuan) : t("nomor tersembunyi", "hidden number")}</p>
        </div>
        <div className="text-right">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap ${NADA[x.status] ?? NADA.selesai}`}>{labelStatus(x.status, x.jenis, t)}</span>
          {berjalan && (
            <span className="mt-1 block text-[11.5px] text-muted">
              {x.jenis === "ulang" ? t("pesan", "message") : t(`pesan ${x.tahap + 1}`, `message ${x.tahap + 1}`)} {x.jadwal > kini ? waktuSingkatWib(x.jadwal, kini, b) : t("segera", "soon")}
            </span>
          )}
          {x.dibalas && <span className="mt-1 block text-[11.5px] text-success">{t("dibalas", "replied")} {waktuSingkatWib(x.dibalas, kini, b)}</span>}
        </div>
      </div>
      {x.pesan.length > 0 && (
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
          {x.pesan.map((p, i) => (
            <span key={i} className="inline-flex items-center gap-1.5" title={p.ack >= 4 ? t("Dibaca", "Read") : p.ack >= 3 ? t("Sampai di HP", "Delivered") : t("Belum sampai di HP", "Not delivered yet")}>
              {x.jenis === "ulang" ? t("Pesan", "Message") : t(`Pesan ${i + 1}`, `Message ${i + 1}`)}
              <CheckCheck className={`size-3.5 ${p.ack >= 4 ? "text-sky-500" : p.ack >= 3 ? "text-muted" : "text-faint"}`} aria-hidden />
              <span className="tabular-nums">{waktuSingkatWib(p.pada, kini, b)}</span>
            </span>
          ))}
        </p>
      )}
      {x.alasan && <p className="text-[12px] text-muted">{x.alasan}</p>}
      <details className="rounded-xl border border-line bg-subtle/40 px-3.5 py-2" open={berjalan && !!x.draf}>
        <summary data-analitik="Follow-up nomor: lihat pesan" className="flex min-h-9 cursor-pointer items-center text-[12.5px] font-semibold text-accent select-none">
          {t("Pesan", "Messages")}
          {berjalan && !x.draf && <span className="ml-1 font-normal text-muted">· {t("draf belum disiapkan", "draft not prepared yet")}</span>}
        </summary>
        <div className="pt-2 pb-1">
          <Pratinjau numberId={numberId} x={x} />
        </div>
      </details>
    </li>
  );
}

function Gelembung({ teks, label }: { teks: string; label: string }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold tracking-[0.06em] text-muted uppercase">{label}</p>
      <div className="max-w-xl rounded-2xl rounded-tl-sm border border-line bg-success-soft/40 px-3.5 py-2.5 text-[13px] leading-relaxed break-words whitespace-pre-wrap text-fg [overflow-wrap:anywhere]">{teks}</div>
    </div>
  );
}

function Pratinjau({ numberId, x }: { numberId: number; x: BarisUsaha }) {
  const { t, b } = useBahasa();
  const [teks, setTeks] = useState(x.draf ?? "");
  const [tersimpan, setTersimpan] = useState(x.draf);
  const [sunting, setSunting] = useState(false);
  const [hasil, setHasil] = useState<{ ok: boolean; pesan?: string } | null>(null);
  const [tunggu, mulai] = useTransition();
  const berjalan = x.status === "jalan";
  const nama = (i: number): string => (x.jenis === "ulang" ? t("Order ulang", "Reorder") : (NAMA_TAHAP_USAHA[b][i] ?? ""));
  const urutan = x.jenis === "ulang" ? "" : ` ${x.tahap + 1}`;

  const tulisUlang = () =>
    mulai(async () => {
      const h = await tulisUlangFollowupNomorAction(numberId, x.jenis, x.kunci);
      setHasil(h);
      if (h.ok && h.teks) {
        setTeks(h.teks);
        setTersimpan(h.teks);
        setSunting(false);
      }
    });
  const simpan = () =>
    mulai(async () => {
      const h = await simpanPesanFollowupNomorAction(numberId, x.jenis, x.kunci, teks);
      setHasil(h);
      if (h.ok) {
        setTersimpan(teks.trim());
        setSunting(false);
      }
    });
  const hentikan = () => mulai(async () => setHasil(await hentikanFollowupNomorAction(numberId, x.jenis, x.kunci)));

  return (
    <div className="space-y-3">
      {x.pesan.map((p, i) => (
        <Gelembung key={i} label={`${x.jenis === "ulang" ? t("Pesan", "Message") : t(`Pesan ${i + 1}`, `Message ${i + 1}`)} · ${nama(i)} · ${t("terkirim", "sent")}`} teks={p.teks} />
      ))}
      {berjalan && (
        <div className="space-y-2">
          {sunting ? (
            <div className="max-w-xl space-y-2">
              <label htmlFor={`fu-pesan-${x.kunci}`} className="text-[11px] font-semibold tracking-[0.06em] text-muted uppercase">
                {t("Edit pesan", "Edit message")}
                {urutan} · {nama(x.tahap)}
              </label>
              <textarea
                id={`fu-pesan-${x.kunci}`}
                value={teks}
                onChange={(e) => setTeks(e.target.value)}
                rows={Math.min(14, Math.max(4, teks.split("\n").length + 1))}
                maxLength={BATAS_PESAN[1]}
                className="field w-full font-[inherit] text-[13px] leading-relaxed"
              />
              <p className="text-[11.5px] text-muted">
                {teks.trim().length} / {BATAS_PESAN[1]} {t("karakter. Tanpa tautan, tanpa promo atau batas waktu yang tidak benar.", "characters. No links, no untrue promos or deadlines.")}
              </p>
            </div>
          ) : tersimpan ? (
            <Gelembung label={`${t("Pesan", "Message")}${urutan} · ${nama(x.tahap)} · ${t("akan dikirim", "to be sent")}`} teks={tersimpan} />
          ) : (
            <p className="text-[12.5px] text-muted">{t("Draf disiapkan otomatis paling lambat 3 jam sebelum jadwal. Bisa juga dibuat sekarang (dihitung 1 balasan AI).", "The draft is prepared automatically up to 3 hours before it is due. You can also create it now (counts as 1 AI reply).")}</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {sunting ? (
              <>
                <button type="button" data-analitik="Follow-up nomor: simpan pesan" className="btn btn-primary" disabled={tunggu} onClick={simpan}>
                  {tunggu && <Loader2 className="size-4 animate-spin" aria-hidden />}
                  {t("Simpan", "Save")}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={tunggu}
                  onClick={() => {
                    setTeks(tersimpan ?? "");
                    setSunting(false);
                  }}
                >
                  {t("Batal", "Cancel")}
                </button>
              </>
            ) : (
              <>
                <button type="button" data-analitik="Follow-up nomor: tulis ulang (AI)" className="btn btn-ghost border border-line" disabled={tunggu} onClick={tulisUlang}>
                  {tunggu ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
                  {tersimpan ? t("Tulis ulang (AI)", "Rewrite (AI)") : t("Buat pratinjau", "Create preview")}
                </button>
                {tersimpan && (
                  <button type="button" data-analitik="Follow-up nomor: edit pesan" className="btn btn-ghost border border-line" disabled={tunggu} onClick={() => setSunting(true)}>
                    <Pencil className="size-4" aria-hidden /> {t("Edit", "Edit")}
                  </button>
                )}
                <button type="button" data-analitik="Follow-up nomor: hentikan" className="btn btn-ghost border border-line text-danger" disabled={tunggu} onClick={hentikan}>
                  <Square className="size-3.5" aria-hidden /> {t("Hentikan", "Stop")}
                </button>
              </>
            )}
            <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
          </div>
        </div>
      )}
      {!berjalan && !x.pesan.length && <p className="text-[12.5px] text-muted">{t("Tidak ada pesan yang dikirim untuk chat ini.", "No message was sent for this chat.")}</p>}
    </div>
  );
}
