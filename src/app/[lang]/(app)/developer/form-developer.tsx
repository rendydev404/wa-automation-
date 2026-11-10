"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { AlertTriangle, KeyRound, Loader2, Unplug } from "lucide-react";
import { ajukanAction, buatKunciAction, lepasInstalasiAction } from "@/app/actions-developer";
import { useBahasa, useRouterBahasa } from "@/components/bahasa";
import { TombolSalin } from "@/components/tombol-salin";
import { Pesan, TombolKonfirmasi } from "@/components/ui";
import { type FiturApi, fiturPerGrup } from "@/lib/api-def";

/** Formulir pengajuan aplikasi Developer API (portal developer luar). `fitur` = fitur yang sedang dibagikan. */
export function FormAjukan({ fitur }: { fitur: FiturApi[] }) {
  const { t } = useBahasa();
  const grup = fiturPerGrup(fitur);
  const router = useRouterBahasa();
  const [hasil, aksi, mengirim] = useActionState(ajukanAction, null);
  const [, mulai] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (hasil?.ok && hasil.id) {
      ref.current?.reset();
      router.push(`/developer/${hasil.id}`);
    }
  }, [hasil, router]);
  return (
    // Dikirim manual (bukan `action={aksi}`): React me-reset form setelah setiap action, termasuk yang ditolak server,
    // sehingga semua isian hilang hanya karena satu kolom salah. Form dikosongkan hanya saat berhasil (di atas).
    <form
      ref={ref}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        mulai(() => aksi(fd));
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="dev-nama" className="label">
            {t("Nama aplikasi", "App name")}
          </label>
          <input id="dev-nama" name="nama" required minLength={3} maxLength={80} placeholder={t("mis. KasirKu", "e.g. KasirKu")} className="field" />
        </div>
        <div>
          <label htmlFor="dev-pemilik" className="label">
            {t("Pemilik (perusahaan / perorangan)", "Owner (company / individual)")}
          </label>
          <input id="dev-pemilik" name="pemilik" required minLength={2} maxLength={120} className="field" />
        </div>
      </div>
      <div>
        <label htmlFor="dev-kegunaan" className="label">
          {t("Kegunaan aplikasi", "What the app does")}
        </label>
        <textarea
          id="dev-kegunaan"
          name="kegunaan"
          required
          minLength={20}
          maxLength={1000}
          rows={4}
          placeholder={t("Ceritakan aplikasi Anda dan untuk apa fitur ChatGerCep dipakai.", "Describe your app and what you'll use ChatGerCep features for.")}
          className="field"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="dev-alamat" className="label">
            {t("Domain aplikasi Anda", "Your app domain")}
          </label>
          <input
            id="dev-alamat"
            name="alamat_mesin"
            required
            maxLength={300}
            inputMode="url"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={t("mis. kasirku.id", "e.g. kasirku.id")}
            aria-describedby="dev-alamat-bantu"
            className="field"
          />
          <p id="dev-alamat-bantu" className="mt-1 text-[12px] text-muted">
            {t("Cukup domainnya, tanpa https://. Wajib HTTPS.", "Just the domain, no https://. HTTPS required.")}
          </p>
        </div>
        <div>
          <label htmlFor="dev-kontak" className="label">
            {t("Nomor WhatsApp kontak", "Contact WhatsApp number")}
          </label>
          <input id="dev-kontak" name="kontak_wa" required inputMode="tel" maxLength={20} placeholder="08…" className="field" />
        </div>
        <div>
          <label htmlFor="dev-perkiraan" className="label">
            {t("Perkiraan jumlah nomor WA", "Estimated WhatsApp numbers")}
          </label>
          <input id="dev-perkiraan" name="perkiraan_nomor" type="number" min={1} max={100000} className="field" />
        </div>
      </div>
      <fieldset>
        <legend className="label">{t("Fitur yang dibutuhkan", "Features you need")}</legend>
        {grup.length ? (
          <div className="mt-1 space-y-3">
            {grup.map((g) => (
              <div key={g.kode}>
                <p className="mb-1.5 text-[11.5px] font-bold tracking-wide text-faint uppercase">{g.label}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {g.fitur.map((f) => (
                    <label key={f.kode} className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5 transition-colors hover:bg-subtle has-checked:border-accent has-checked:bg-accent-soft">
                      <input type="checkbox" name="fitur" value={f.kode} defaultChecked className="centang mt-0.5" />
                      <span className="min-w-0">
                        <span className="block text-[13.5px] font-semibold">{f.label}</span>
                        <span className="block text-[12px] leading-snug text-muted">{f.keterangan}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-1 rounded-xl border border-line bg-subtle/50 px-3 py-3 text-[13px] text-muted">
            {t("Belum ada fitur yang dibuka untuk pengajuan. Coba lagi nanti.", "No features are open for applications yet. Please check back later.")}
          </p>
        )}
      </fieldset>
      <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-subtle/50 px-3 py-3 text-[13px]">
        <input type="checkbox" name="setuju" required className="centang mt-0.5" />
        <span>
          {t(
            "Saya setuju: tidak memakai API untuk spam/blast, bertanggung jawab atas nomor WhatsApp dan data pelanggan saya sendiri, dan menanggung server serta kunci AI sendiri (mesin dipasang di server saya).",
            "I agree: no spam/blasting through the API, I'm responsible for my own WhatsApp numbers and customer data, and I cover my own server and AI keys (the engine runs on my server).",
          )}
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="submit" disabled={mengirim} className="btn btn-primary">
          {mengirim && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {t("Kirim pengajuan", "Submit application")}
        </button>
        <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
      </div>
    </form>
  );
}

/** Buat / ganti API key. Key baru tampil sekali (hanya hash yang disimpan server). */
export function KelolaKunci({ aplikasiId, adaKunci, boleh }: { aplikasiId: number; adaKunci: boolean; boleh: boolean }) {
  const { t } = useBahasa();
  const [key, setKey] = useState<{ key: string; rotasi: boolean } | null>(null);
  const [galat, setGalat] = useState("");
  const [tunggu, mulai] = useTransition();
  const [yakin, setYakin] = useState(false);
  const jalankan = () =>
    mulai(async () => {
      setGalat("");
      setYakin(false);
      const h = await buatKunciAction(aplikasiId);
      if (h.ok && h.key) setKey({ key: h.key, rotasi: !!h.rotasi });
      else setGalat(h.pesan ?? t("Gagal membuat key.", "Could not create the key."));
    });

  return (
    <div className="space-y-3">
      {key && (
        <div className="rounded-xl border border-warning/40 bg-warning-soft p-3.5 text-[13px]">
          <p className="flex items-center gap-1.5 font-semibold text-warning">
            <AlertTriangle className="size-4 shrink-0" aria-hidden /> {t("Salin sekarang: key ini hanya tampil sekali.", "Copy it now: this key is shown only once.")}
          </p>
          <div className="mt-2 flex items-center gap-1.5">
            <code className="min-w-0 flex-1 rounded-lg bg-surface px-2.5 py-2 font-mono text-[12.5px] break-all select-all">{key.key}</code>
            <TombolSalin teks={key.key} label={t("Salin API key", "Copy API key")} className="size-9" />
          </div>
          <p className="mt-2 text-muted">
            {key.rotasi
              ? t(
                  "Key lama tetap berlaku 24 jam supaya aplikasi Anda tidak terputus. Ganti CHATGERCEP_KEY di mesin & aplikasi Anda sebelum itu.",
                  "The old key keeps working for 24 hours so your app isn't interrupted. Replace CHATGERCEP_KEY in your engine & app before then.",
                )
              : t("Isi key ini sebagai CHATGERCEP_KEY di berkas .env mesin Anda.", "Put this key in CHATGERCEP_KEY in your engine's .env file.")}
          </p>
        </div>
      )}
      {boleh &&
        (adaKunci && !yakin ? (
          <button type="button" className="btn btn-ghost border border-line" disabled={tunggu} onClick={() => setYakin(true)}>
            <KeyRound className="size-4" aria-hidden /> {t("Ganti key", "Rotate key")}
          </button>
        ) : adaKunci ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] text-muted">{t("Buat key baru? Key lama berlaku 24 jam lagi.", "Create a new key? The old one works for 24 more hours.")}</span>
            <button type="button" className="btn btn-primary" disabled={tunggu} onClick={jalankan}>
              {tunggu && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {t("Ya, buat key baru", "Yes, create a new key")}
            </button>
            <button type="button" className="btn btn-ghost" disabled={tunggu} onClick={() => setYakin(false)}>
              {t("Batal", "Cancel")}
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-primary" disabled={tunggu} onClick={jalankan}>
            {tunggu ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <KeyRound className="size-4" aria-hidden />}
            {t("Buat API key", "Create API key")}
          </button>
        ))}
      <Pesan ok={false}>{galat}</Pesan>
    </div>
  );
}

export function TombolLepasInstalasi({ aplikasiId, instalasiId }: { aplikasiId: number; instalasiId: string }) {
  const { t } = useBahasa();
  return (
    <TombolKonfirmasi
      label={t("Lepas", "Release")}
      tanya={t("Lepas mesin ini?", "Release this engine?")}
      className="btn btn-ghost border border-line"
      ikon={<Unplug className="size-4" aria-hidden />}
      aksi={() => lepasInstalasiAction(aplikasiId, instalasiId)}
    />
  );
}
