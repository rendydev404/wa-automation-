"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CalendarClock, FlaskConical, KeyRound, Loader2, MessageSquareText, Smartphone } from "lucide-react";
import { buatSandboxAction, mulaiNomorUjiAction, perpanjangSandboxAction } from "@/app/actions-developer";
import { useBahasa, useRouterBahasa } from "@/components/bahasa";
import { TombolSalin } from "@/components/tombol-salin";
import { Pesan } from "@/components/ui";

/** Key sandbox baru (tampil sekali) / ganti key. Sandbox dibuat otomatis pada klik pertama. */
export function TombolKeySandbox({ ada }: { ada: boolean }) {
  const { t } = useBahasa();
  const router = useRouterBahasa();
  const [key, setKey] = useState("");
  const [galat, setGalat] = useState("");
  const [yakin, setYakin] = useState(false);
  const [tunggu, mulai] = useTransition();
  const jalankan = () =>
    mulai(async () => {
      setGalat("");
      setYakin(false);
      const h = await buatSandboxAction();
      if (h.ok && h.key) {
        setKey(h.key);
        router.refresh();
      } else setGalat(h.pesan ?? t("Gagal membuat key.", "Could not create the key."));
    });
  return (
    <div className="space-y-3">
      {key && (
        <div className="rounded-xl border border-warning/40 bg-warning-soft p-3.5 text-[13px]">
          <p className="flex items-center gap-1.5 font-semibold text-warning">
            <AlertTriangle className="size-4 shrink-0" aria-hidden /> {t("Salin sekarang: key ini hanya tampil sekali.", "Copy it now: this key is shown only once.")}
          </p>
          <div className="mt-2 flex items-center gap-1.5">
            <code className="min-w-0 flex-1 rounded-lg bg-surface px-2.5 py-2 font-mono text-[12.5px] break-all select-all">{key}</code>
            <TombolSalin teks={key} label={t("Salin key sandbox", "Copy sandbox key")} className="size-9" />
          </div>
          <p className="mt-2 text-muted">
            {t(
              "Isi sebagai CHATGERCEP_KEY di .env mesin, lalu nyalakan mesin. Key sandbox lama (bila ada) langsung tidak berlaku.",
              "Put it in CHATGERCEP_KEY in the engine's .env, then start the engine. Any previous sandbox key stops working right away.",
            )}
          </p>
        </div>
      )}
      {!ada ? (
        <button type="button" className="btn btn-primary" disabled={tunggu} onClick={jalankan}>
          {tunggu ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FlaskConical className="size-4" aria-hidden />}
          {t("Buat key sandbox", "Create sandbox key")}
        </button>
      ) : !yakin ? (
        <button type="button" className="btn btn-ghost border border-line" disabled={tunggu} onClick={() => setYakin(true)}>
          <KeyRound className="size-4" aria-hidden /> {t("Ganti key sandbox", "Replace sandbox key")}
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-muted">{t("Key lama langsung mati. Lanjut?", "The old key stops working immediately. Continue?")}</span>
          <button type="button" className="btn btn-primary" disabled={tunggu} onClick={jalankan}>
            {tunggu && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {t("Ya, ganti", "Yes, replace")}
          </button>
          <button type="button" className="btn btn-ghost" disabled={tunggu} onClick={() => setYakin(false)}>
            {t("Batal", "Cancel")}
          </button>
        </div>
      )}
      <Pesan ok={false}>{galat}</Pesan>
    </div>
  );
}

export function TombolPerpanjangSandbox() {
  const { t } = useBahasa();
  const router = useRouterBahasa();
  const [hasil, setHasil] = useState<{ ok: boolean; pesan?: string } | null>(null);
  const [tunggu, mulai] = useTransition();
  return (
    <div className="space-y-2">
      <button
        type="button"
        className="btn btn-ghost border border-line"
        disabled={tunggu}
        onClick={() =>
          mulai(async () => {
            const h = await perpanjangSandboxAction();
            setHasil(h);
            if (h.ok) router.refresh();
          })
        }
      >
        {tunggu ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CalendarClock className="size-4" aria-hidden />}
        {t("Perpanjang", "Extend")}
      </button>
      <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
    </div>
  );
}

/** Kode verifikasi nomor uji: "UJI 123456" dikirim lewat WA dari HP nomor uji ke nomor sandbox. */
export function TombolNomorUji({ ada, boleh }: { ada: boolean; boleh: boolean }) {
  const { t, b } = useBahasa();
  const [kode, setKode] = useState<{ kode: string; sampai: number } | null>(null);
  const [galat, setGalat] = useState("");
  const [tunggu, mulai] = useTransition();
  const jam = (d: number) => new Intl.DateTimeFormat(b === "en" ? "en-US" : "id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(d * 1000));
  const pesan = kode ? `UJI ${kode.kode}` : "";
  return (
    <div className="space-y-3">
      {kode && (
        <div className="rounded-xl border border-accent/30 bg-accent-soft p-3.5 text-[13px]">
          <p className="font-semibold text-fg">
            {t("Dari HP yang mau dijadikan nomor uji, kirim pesan WhatsApp ini ke nomor sandbox:", "From the phone you want as the test number, send this WhatsApp message to the sandbox number:")}
          </p>
          <div className="mt-2 flex items-center gap-1.5">
            <code className="min-w-0 flex-1 rounded-lg bg-surface px-3 py-2 font-mono text-[18px] font-bold tracking-wider select-all">{pesan}</code>
            <TombolSalin teks={pesan} label={t("Salin pesan", "Copy message")} className="size-10" />
          </div>
          <p className="mt-2 text-muted">
            {t(
              `Berlaku sampai ${jam(kode.sampai)} WIB. Nomor sandbox membalas ✅ begitu berhasil, lalu muat ulang halaman ini.`,
              `Valid until ${jam(kode.sampai)} WIB. The sandbox number replies ✅ when it works; then reload this page.`,
            )}
          </p>
        </div>
      )}
      <button
        type="button"
        className={ada ? "btn btn-ghost border border-line" : "btn btn-primary"}
        disabled={tunggu || !boleh}
        onClick={() =>
          mulai(async () => {
            setGalat("");
            const h = await mulaiNomorUjiAction();
            if (h.ok && h.kode && h.sampai) setKode({ kode: h.kode, sampai: h.sampai });
            else setGalat(h.pesan ?? t("Gagal membuat kode.", "Could not create a code."));
          })
        }
      >
        {tunggu ? <Loader2 className="size-4 animate-spin" aria-hidden /> : ada ? <Smartphone className="size-4" aria-hidden /> : <MessageSquareText className="size-4" aria-hidden />}
        {kode ? t("Buat kode baru", "New code") : ada ? t("Ganti nomor uji", "Change test number") : t("Daftarkan nomor uji", "Register test number")}
      </button>
      <Pesan ok={false}>{galat}</Pesan>
    </div>
  );
}
