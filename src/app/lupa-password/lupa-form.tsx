"use client";

import { useActionState, useEffect, useState } from "react";
import { mintaOtpAction, resetPasswordOtpAction } from "@/app/actions";
import { Pesan, SubmitButton } from "@/components/ui";

const JEDA_KIRIM_MS = 60_000; // sama dengan OTP.jedaKirimDtk di server

/** Dua langkah di satu halaman: email -> kode OTP + password baru. Berhasil = langsung masuk (redirect dari server). */
export function LupaPasswordForm() {
  const [langkah, setLangkah] = useState<"email" | "kode">("email");
  const [email, setEmail] = useState("");
  const [bolehUlangPada, setBolehUlangPada] = useState(0);
  const [kini, setKini] = useState(0); // diisi saat kode terkirim (Date.now() tidak boleh dipanggil saat prerender)
  const [minta, aksiMinta] = useActionState(async (lalu: Awaited<ReturnType<typeof mintaOtpAction>> | null, form: FormData) => {
    const h = await mintaOtpAction(lalu, form);
    if (h.ok) {
      setEmail(h.email ?? email);
      setLangkah("kode");
      setBolehUlangPada(Date.now() + JEDA_KIRIM_MS);
      setKini(Date.now());
    }
    return h;
  }, null);
  const [reset, aksiReset] = useActionState(resetPasswordOtpAction, null);

  // Hitung mundur tombol "Kirim ulang"; berhenti sendiri begitu jedanya lewat.
  const sisaDtk = Math.max(0, Math.ceil((bolehUlangPada - kini) / 1000));
  useEffect(() => {
    if (langkah !== "kode" || sisaDtk === 0) return;
    const t = setInterval(() => setKini(Date.now()), 1000);
    return () => clearInterval(t);
  }, [langkah, sisaDtk]);

  if (langkah === "email") {
    return (
      <form action={aksiMinta} className="space-y-4">
        <div>
          <label htmlFor="email" className="label">
            Email akun
          </label>
          <input id="email" name="email" type="email" autoComplete="email" required maxLength={254} autoFocus defaultValue={email} className="field" />
        </div>
        <Pesan ok={false}>{minta && !minta.ok ? minta.pesan : null}</Pesan>
        <SubmitButton className="btn btn-primary w-full">Kirim kode</SubmitButton>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <Pesan ok={!!minta?.ok}>{minta?.pesan}</Pesan>
      <form action={aksiReset} className="space-y-4">
        <input type="hidden" name="email" value={email} />
        <div>
          <label htmlFor="kode" className="label">
            Kode 6 digit
          </label>
          <input
            id="kode"
            name="kode"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            minLength={6}
            maxLength={6}
            required
            autoFocus
            className="field text-center text-lg tracking-[0.4em] tabular-nums"
          />
        </div>
        <div>
          <label htmlFor="baru" className="label">
            Password baru
          </label>
          <input id="baru" name="baru" type="password" autoComplete="new-password" required minLength={10} maxLength={200} aria-describedby="aturan-pw" className="field" />
          <p id="aturan-pw" className="mt-1 text-[12px] text-muted">
            Minimal 10 karakter, ada huruf dan angka.
          </p>
        </div>
        <div>
          <label htmlFor="ulang" className="label">
            Ulangi password baru
          </label>
          <input id="ulang" name="ulang" type="password" autoComplete="new-password" required maxLength={200} className="field" />
        </div>
        <Pesan ok={!!reset?.ok}>{reset?.pesan}</Pesan>
        <SubmitButton className="btn btn-primary w-full">Simpan password & masuk</SubmitButton>
      </form>
      <form action={aksiMinta} className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
        <input type="hidden" name="email" value={email} />
        <button type="button" onClick={() => setLangkah("email")} className="font-medium text-muted hover:text-fg hover:underline">
          Ganti email
        </button>
        <SubmitButton className="font-semibold text-accent hover:underline disabled:text-faint disabled:no-underline" disabled={sisaDtk > 0}>
          {sisaDtk > 0 ? `Kirim ulang kode (${sisaDtk} dtk)` : "Kirim ulang kode"}
        </SubmitButton>
      </form>
    </div>
  );
}
