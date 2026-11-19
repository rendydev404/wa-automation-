"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { BadgeCheck, Check, Copy, ExternalLink, FileText, Loader2, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import {
  type HasilJalur,
  hapusTemplatAction,
  lepasJalurResmiAction,
  pasangJalurResmiAction,
  pasangTemplatBawaanAction,
  segarkanJalurResmiAction,
  simpanTemplatAction,
  sinkronTemplatAction,
} from "@/app/actions-jalur";
import { angka, formatNomor, waktuSingkatWib } from "@/lib/format";
import type { BarisTemplat, StatusResmi } from "@/lib/wa-resmi";
import { TEMPLAT_BAWAAN, isiVariabel, periksaIsiTemplat, renderTemplat } from "@/lib/wa-resmi-def";
import { useBahasa } from "./bahasa";
import { PilihOpsi } from "./pilih-opsi";
import { Pesan, Pill, SubmitButton, TombolKonfirmasi } from "./ui";

type T = ReturnType<typeof useBahasa>["t"];

function TombolSalin({ teks, label }: { teks: string; label: string }) {
  const { t } = useBahasa();
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost h-9 shrink-0 px-2.5 text-[12.5px]"
      aria-label={`${t("Salin", "Copy")} ${label}`}
      onClick={() => {
        void navigator.clipboard?.writeText(teks).then(() => {
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        });
      }}
    >
      {ok ? <Check className="size-4 text-success" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      {ok ? t("Tersalin", "Copied") : t("Salin", "Copy")}
    </button>
  );
}

function BarisSalin({ label, nilai }: { label: string; nilai: string }) {
  return (
    <div>
      <p className="text-[12px] font-semibold text-muted">{label}</p>
      <div className="mt-1 flex items-center gap-2 rounded-xl border border-line bg-subtle/60 py-1 pr-1 pl-3">
        <code className="min-w-0 flex-1 truncate text-[12.5px]" title={nilai}>
          {nilai}
        </code>
        <TombolSalin teks={nilai} label={label} />
      </div>
    </div>
  );
}

const nadaKualitas = (q: string | null): "hijau" | "kuning" | "merah" | "abu" => {
  const v = (q ?? "").toUpperCase();
  return v === "GREEN" || v === "HIGH" ? "hijau" : v === "YELLOW" || v === "MEDIUM" ? "kuning" : v === "RED" || v === "LOW" ? "merah" : "abu";
};
const labelKualitas = (q: string | null, t: T): string => {
  const n = nadaKualitas(q);
  return n === "hijau" ? t("Kualitas tinggi", "High quality") : n === "kuning" ? t("Kualitas sedang", "Medium quality") : n === "merah" ? t("Kualitas rendah", "Low quality") : t("Kualitas belum dinilai", "Quality not rated yet");
};

/** Langkah di Meta (ringkas, bahasa awam). */
function Langkah({ t }: { t: T }) {
  const langkah = [
    t("Buka developers.facebook.com → My Apps → buat aplikasi tipe Business, tambahkan produk WhatsApp.", "Open developers.facebook.com → My Apps → create a Business app and add the WhatsApp product."),
    t("Di WhatsApp → API Setup: tambahkan nomor Anda (nomor ini harus dihapus dulu dari aplikasi WhatsApp di HP). Salin Phone number ID dan WhatsApp Business Account ID.", "In WhatsApp → API Setup: add your number (it must be removed from the WhatsApp app first). Copy the Phone number ID and WhatsApp Business Account ID."),
    t("Meta Business Suite → Settings → System users: buat token permanen dengan izin whatsapp_business_messaging & whatsapp_business_management.", "Meta Business Suite → Settings → System users: create a permanent token with whatsapp_business_messaging & whatsapp_business_management."),
    t("App Dashboard → Settings → Basic: salin App secret.", "App Dashboard → Settings → Basic: copy the App secret."),
    t("Isi form di bawah. Setelah tersimpan, tempel URL webhook & verify token di WhatsApp → Configuration, lalu centang field messages, message_template_status_update, dan phone_number_quality_update.", "Fill in the form below. Once saved, paste the webhook URL & verify token in WhatsApp → Configuration and subscribe to messages, message_template_status_update and phone_number_quality_update."),
  ];
  return (
    <ol className="space-y-2 text-[12.5px] text-muted">
      {langkah.map((l, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-bold text-accent tabular-nums">{i + 1}</span>
          <span>{l}</span>
        </li>
      ))}
    </ol>
  );
}

function FormKredensial({ numberId, onHasil }: { numberId: number; onHasil: (h: HasilJalur) => void }) {
  const { t } = useBahasa();
  const [hasil, aksi] = useActionState(async (lalu: HasilJalur | null, form: FormData) => {
    const h = await pasangJalurResmiAction(lalu, form);
    if (h.ok) onHasil(h);
    return h;
  }, null);
  const kolom = [
    { name: "phone_number_id", label: "Phone number ID", contoh: "109876543210987", mode: "numeric" as const },
    { name: "waba_id", label: "WhatsApp Business Account ID", contoh: "102345678901234", mode: "numeric" as const },
    { name: "token", label: t("Token akses (System User, permanen)", "Access token (System User, permanent)"), contoh: "EAAG…", mode: "text" as const, rahasia: true },
    { name: "app_secret", label: "App secret", contoh: "32 karakter", mode: "text" as const, rahasia: true },
    { name: "pin", label: t("PIN verifikasi dua langkah (opsional, 6 angka)", "Two-step verification PIN (optional, 6 digits)"), contoh: "123456", mode: "numeric" as const },
  ];
  return (
    <form action={aksi} className="space-y-3.5">
      <input type="hidden" name="number_id" value={numberId} />
      {kolom.map((k) => (
        <div key={k.name}>
          <label htmlFor={`jr-${k.name}`} className="label">
            {k.label}
          </label>
          <input
            id={`jr-${k.name}`}
            name={k.name}
            type={k.rahasia ? "password" : "text"}
            inputMode={k.mode}
            autoComplete="off"
            spellCheck={false}
            placeholder={k.contoh}
            required={k.name !== "pin"}
            className="field w-full"
          />
        </div>
      ))}
      <p className="text-[12px] text-faint">
        {t("Token & app secret disimpan terenkripsi dan tidak pernah ditampilkan lagi. Biaya pesan template ditagih Meta ke akun Meta Anda.", "The token & app secret are stored encrypted and never shown again. Template message fees are billed by Meta to your Meta account.")}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>
          <ShieldCheck className="size-4" aria-hidden />
          {t("Periksa & pasang", "Verify & connect")}
        </SubmitButton>
        <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
      </div>
    </form>
  );
}

/**
 * Tab Koneksi: jalur WhatsApp resmi (Cloud API Meta). Nomor resmi = status Meta (kualitas, batas harian, kuota),
 * URL webhook & verify token, segarkan, kembali ke scan QR. Nomor Baileys = kartu ajakan + langkah + form kredensial
 * (hanya bila `boleh`: kebijakan admin & paket berbayar, dicek ulang di server).
 */
export function PanelJalurResmi({ numberId, awal, boleh }: { numberId: number; awal: StatusResmi; boleh: boolean }) {
  const { t } = useBahasa();
  const [s, setS] = useState(awal);
  const [buka, setBuka] = useState(false);
  const [pasang, setPasang] = useState<HasilJalur["pasang"] | null>(null);
  const [pesan, setPesan] = useState<{ ok: boolean; teks: string } | null>(null);
  const [tunggu, mulai] = useTransition();

  if (s.jalur !== "resmi") {
    if (!boleh) return null;
    return (
      <section className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-xl">
            <h2 className="flex items-center gap-2 text-[15px] font-bold">
              <BadgeCheck className="size-4 text-accent" aria-hidden /> {t("Pakai WhatsApp resmi (Cloud API Meta)", "Use official WhatsApp (Meta Cloud API)")}
            </h2>
            <p className="mt-1 text-[13px] text-muted">
              {t(
                "Lebih aman dari blokir, tanpa scan QR. Balasan dalam 24 jam setelah pelanggan chat tetap ditulis AI; follow-up di luar 24 jam memakai template yang disetujui Meta (berbayar per pesan).",
                "Safer from bans, no QR scan. Replies within 24 hours of the customer's message are still written by AI; follow-ups outside 24 hours use Meta-approved templates (paid per message).",
              )}
            </p>
          </div>
          {!buka && (
            <button type="button" className="btn btn-ghost" onClick={() => setBuka(true)}>
              {t("Pasang", "Set up")}
            </button>
          )}
        </div>
        {buka && (
          <div className="mt-5 grid gap-6 lg:grid-cols-2">
            <Langkah t={t} />
            <FormKredensial
              numberId={numberId}
              onHasil={(h) => {
                if (h.status) setS(h.status);
                setPasang(h.pasang ?? null);
              }}
            />
          </div>
        )}
      </section>
    );
  }

  const batas = s.kuota?.batas ?? null;
  const pakai = s.kuota?.terpakai ?? 0;
  return (
    <section className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11.5px] font-semibold tracking-[0.08em] text-accent uppercase">{t("WhatsApp resmi · Cloud API", "Official WhatsApp · Cloud API")}</p>
          <h2 className="mt-1 text-lg font-bold tabular-nums">{s.nomor ? formatNomor(s.nomor) : "-"}</h2>
          <p className="text-[13px] text-muted">{s.nama ?? t("Nama tampilan belum disetujui Meta", "Display name not yet approved by Meta")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Pill nada={nadaKualitas(s.kualitas)}>{labelKualitas(s.kualitas, t)}</Pill>
          <Pill nada={(s.status ?? "").toUpperCase() === "CONNECTED" ? "hijau" : "kuning"}>{s.status ?? t("Status belum ada", "No status yet")}</Pill>
        </div>
      </div>

      {pasang?.peringatan?.length ? (
        <ul className="mt-4 space-y-1 rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-[12.5px] text-fg">
          {pasang.peringatan.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}
      {s.alasan && <p className="mt-4 rounded-xl border border-danger/40 bg-danger-soft px-4 py-3 text-[12.5px] text-fg">{s.alasan}</p>}

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-line p-3.5">
          <p className="text-[12px] font-semibold text-muted">{t("Penerima template 24 jam", "Template recipients (24h)")}</p>
          <p className="mt-1 text-lg font-bold tabular-nums">
            {angka(pakai)} <span className="text-[13px] font-semibold text-muted">/ {batas === null ? "∞" : angka(batas)}</span>
          </p>
          {batas !== null && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-subtle">
              <div className={`h-full rounded-full ${pakai / batas > 0.8 ? "bg-warning" : "bg-accent"}`} style={{ width: `${Math.min(100, (pakai / Math.max(1, batas)) * 100)}%` }} />
            </div>
          )}
        </div>
        <div className="rounded-xl border border-line p-3.5">
          <p className="text-[12px] font-semibold text-muted">{t("Batas harian Meta", "Meta daily limit")}</p>
          <p className="mt-1 text-lg font-bold">{s.tier ?? "-"}</p>
          <p className="text-[11.5px] text-faint">{t("Naik otomatis bila kualitas bagus", "Rises automatically with good quality")}</p>
        </div>
        <div className="rounded-xl border border-line p-3.5">
          <p className="text-[12px] font-semibold text-muted">Phone number ID</p>
          <p className="mt-1 truncate text-[13.5px] font-semibold tabular-nums">{s.phone_number_id}</p>
          <p className="text-[11.5px] text-faint">Token {s.token}</p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {s.webhook_url && <BarisSalin label={t("URL webhook (Callback URL)", "Webhook URL (Callback URL)")} nilai={s.webhook_url} />}
        {s.verify_token && <BarisSalin label="Verify token" nilai={s.verify_token} />}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={tunggu}
            onClick={() =>
              mulai(async () => {
                const h = await segarkanJalurResmiAction(numberId);
                if (h.status) setS(h.status);
                setPesan(h.ok ? { ok: true, teks: t("Status diperbarui.", "Status refreshed.") } : { ok: false, teks: h.pesan ?? "" });
              })
            }
          >
            {tunggu ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
            {t("Segarkan status", "Refresh status")}
          </button>
          <a href="https://business.facebook.com/wa/manage/" target="_blank" rel="noreferrer" className="btn btn-ghost">
            <ExternalLink className="size-4" aria-hidden /> WhatsApp Manager
          </a>
          {pesan && <Pesan ok={pesan.ok}>{pesan.teks}</Pesan>}
        </div>
        <TombolKonfirmasi
          label={t("Kembali ke scan QR", "Back to QR scan")}
          tanya={t("Lepas WhatsApp resmi dari nomor ini?", "Disconnect official WhatsApp from this number?")}
          className="btn btn-ghost text-danger"
          aksi={async () => {
            const h = await lepasJalurResmiAction(numberId);
            if (h.ok && h.status) setS(h.status);
            return h;
          }}
        />
      </div>
    </section>
  );
}

const NADA_STATUS: Record<string, "hijau" | "kuning" | "merah" | "abu"> = {
  APPROVED: "hijau",
  PENDING: "kuning",
  IN_APPEAL: "kuning",
  REJECTED: "merah",
  PAUSED: "merah",
  DISABLED: "merah",
  GAGAL_AJU: "merah",
};
const labelStatus = (s: string, t: T): string =>
  ({
    APPROVED: t("Disetujui", "Approved"),
    PENDING: t("Ditinjau Meta", "In review"),
    REJECTED: t("Ditolak", "Rejected"),
    PAUSED: t("Dijeda", "Paused"),
    DISABLED: t("Dimatikan", "Disabled"),
    GAGAL_AJU: t("Gagal diajukan", "Submit failed"),
  })[s] ?? s;

/**
 * Tab Follow-up (nomor resmi): template Meta untuk follow-up di luar jendela 24 jam. Satu template per tahap; tanpa
 * template yang disetujui, tahap itu tidak mengirim apa pun di luar jendela (dicatat alasannya di antrean).
 */
export function PanelTemplatWa({ numberId, awal, contohUsaha }: { numberId: number; awal: BarisTemplat[]; contohUsaha: string }) {
  const { t } = useBahasa();
  const [daftar, setDaftar] = useState(awal);
  const [pesan, setPesan] = useState<{ ok: boolean; teks: string } | null>(null);
  const [tunggu, mulai] = useTransition();
  const [kode, setKode] = useState<string>(TEMPLAT_BAWAAN[0].kode);
  const bawaan = TEMPLAT_BAWAAN.find((x) => x.kode === kode) ?? TEMPLAT_BAWAAN[0];
  const ada = daftar.find((x) => x.kode_tahap === kode);
  const [nama, setNama] = useState(ada?.nama ?? bawaan.nama);
  const [isi, setIsi] = useState(ada?.isi ?? bawaan.isi);
  const salah = periksaIsiTemplat(isi);
  const pratinjau = useMemo(() => renderTemplat(isi, isiVariabel(isi, { nama: "Rina", usaha: contohUsaha })), [isi, contohUsaha]);

  const jalankan = (fn: () => Promise<HasilJalur>) =>
    mulai(async () => {
      const h = await fn();
      if (h.templat) setDaftar(h.templat);
      setPesan({ ok: h.ok, teks: h.pesan ?? "" });
    });

  const pilih = (k: string) => {
    setKode(k);
    const b = TEMPLAT_BAWAAN.find((x) => x.kode === k) ?? TEMPLAT_BAWAAN[0];
    const a = daftar.find((x) => x.kode_tahap === k);
    setNama(a?.nama ?? b.nama);
    setIsi(a?.isi ?? b.isi);
  };

  return (
    <section className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="flex items-center gap-2 text-[15px] font-bold">
            <FileText className="size-4 text-accent" aria-hidden /> {t("Template WhatsApp resmi", "Official WhatsApp templates")}
          </h2>
          <p className="mt-1 text-[13px] text-muted">
            {t(
              "Dipakai follow-up bila pelanggan terakhir chat lebih dari 24 jam lalu (aturan Meta). Di dalam 24 jam, pesan tetap ditulis AI per orang. Tahap tanpa template yang disetujui tidak mengirim apa pun di luar 24 jam.",
              "Used by follow-up when the customer last messaged more than 24 hours ago (Meta's rule). Within 24 hours, messages are still written by AI per person. Stages without an approved template send nothing outside 24 hours.",
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-ghost" disabled={tunggu} onClick={() => jalankan(() => sinkronTemplatAction(numberId))}>
            <RefreshCw className="size-4" aria-hidden /> {t("Segarkan dari Meta", "Refresh from Meta")}
          </button>
          <button type="button" className="btn btn-primary" disabled={tunggu} onClick={() => jalankan(() => pasangTemplatBawaanAction(numberId))}>
            {tunggu && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {t("Ajukan template bawaan", "Submit default templates")}
          </button>
        </div>
      </div>
      {pesan?.teks && (
        <div className="mt-3">
          <Pesan ok={pesan.ok}>{pesan.teks}</Pesan>
        </div>
      )}

      {daftar.length ? (
        <ul className="mt-5 divide-y divide-line rounded-xl border border-line">
          {daftar.map((x) => (
            <li key={`${x.nama}-${x.bahasa}`} className="flex flex-wrap items-start justify-between gap-3 p-3.5">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold">
                  <code>{x.nama}</code>
                  {x.kode_tahap && <span className="rounded-md bg-subtle px-1.5 py-0.5 text-[11px] font-semibold text-muted">{TEMPLAT_BAWAAN.find((b) => b.kode === x.kode_tahap)?.label ?? x.kode_tahap}</span>}
                </p>
                <p className="mt-1 line-clamp-2 text-[12.5px] text-muted">{x.isi}</p>
                {x.alasan && <p className="mt-1 text-[12px] text-danger">{x.alasan}</p>}
                <p className="mt-1 text-[11px] text-faint">{waktuSingkatWib(x.diperbarui)}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <Pill nada={NADA_STATUS[x.status] ?? "abu"}>{labelStatus(x.status, t)}</Pill>
                <button type="button" className="btn btn-ghost h-9 px-2" aria-label={t(`Hapus template ${x.nama}`, `Delete template ${x.nama}`)} disabled={tunggu} onClick={() => jalankan(() => hapusTemplatAction(numberId, x.nama))}>
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-muted">
          {t("Belum ada template. Ajukan template bawaan atau tulis sendiri di bawah.", "No templates yet. Submit the defaults or write your own below.")}
        </p>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <div className="space-y-3.5">
          <div>
            <p className="label">{t("Tahap follow-up", "Follow-up stage")}</p>
            <PilihOpsi nilai={kode} onUbah={pilih} label={t("Tahap follow-up", "Follow-up stage")} opsi={TEMPLAT_BAWAAN.map((x) => ({ id: x.kode, label: x.label }))} />
          </div>
          <div>
            <label htmlFor="tw-nama" className="label">
              {t("Nama template", "Template name")}
            </label>
            <input id="tw-nama" className="field w-full" value={nama} onChange={(e) => setNama(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))} maxLength={100} />
          </div>
          <div>
            <label htmlFor="tw-isi" className="label">
              {t("Isi (variabel: {{nama}} dan {{usaha}})", "Body (variables: {{nama}} and {{usaha}})")}
            </label>
            <textarea id="tw-isi" className="field min-h-32 w-full font-[inherit] leading-relaxed" value={isi} onChange={(e) => setIsi(e.target.value)} maxLength={1024} />
            <p className={`mt-1 text-[12px] ${salah ? "text-danger" : "text-faint"}`}>{salah ?? `${isi.length} / 1024`}</p>
          </div>
          <button type="button" className="btn btn-primary" disabled={tunggu || !!salah} onClick={() => jalankan(() => simpanTemplatAction(numberId, { nama, isi, kode_tahap: kode }))}>
            {tunggu && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {ada ? t("Ajukan ulang ke Meta", "Resubmit to Meta") : t("Ajukan ke Meta", "Submit to Meta")}
          </button>
        </div>
        <div>
          <p className="label">{t("Pratinjau di WhatsApp", "WhatsApp preview")}</p>
          <div className="rounded-2xl bg-[#e7ddd3] p-4 dark:bg-[#0b141a]">
            <div className="ml-auto max-w-[90%] rounded-xl rounded-tr-sm bg-[#d9fdd3] px-3 py-2 text-[13px] whitespace-pre-wrap text-[#111b21] shadow-sm dark:bg-[#005c4b] dark:text-[#e9edef]">{pratinjau}</div>
          </div>
          <p className="mt-2 text-[12px] text-faint">{t("Contoh: nama pelanggan Rina. Kategori MARKETING, bahasa Indonesia.", "Example: customer named Rina. Category MARKETING, Indonesian.")}</p>
        </div>
      </div>
    </section>
  );
}
