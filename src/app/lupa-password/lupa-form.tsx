"use client";

import { useActionState, useEffect, useState } from "react";
import { Check } from "lucide-react";
import { mintaOtpAction, resetPasswordOtpAction, verifikasiOtpAction } from "@/app/actions";
import { Pesan, SubmitButton } from "@/components/ui";

const JEDA_KIRIM_MS = 60_000; // sama dengan OTP.jedaKirimDtk di server
const LANGKAH = ["Email", "Kode OTP", "Password baru"] as const;
type Langkah = 0 | 1 | 2;

/** Penanda tahap di atas formulir. */
function Tahap({ kini }: { kini: Langkah }) {
  return (
    <ol className="mb-5 flex items-center gap-2 text-[12px] font-semibold" aria-label="Tahap atur ulang password">
      {LANGKAH.map((l, i) => (
        <li key={l} className="flex min-w-0 flex-1 items-center gap-1.5" aria-current={i === kini ? "step" : undefined}>
          <span
            className={`grid size-5 shrink-0 place-items-center rounded-full text-[11px] ${
              i < kini ? "bg-accent text-on-accent" : i === kini ? "border-2 border-accent text-accent" : "border border-line-strong text-faint"
            }`}
          >
            {i < kini ? <Check className="size-3" aria-hidden /> : i + 1}
          </span>
          <span className={`truncate ${i === kini ? "text-fg" : "text-muted"}`}>{l}</span>
        </li>
      ))}
    </ol>
  );
}

/** Tiga tahap di satu halaman: email terdaftar -> kode OTP -> password baru. Berhasil = langsung masuk (redirect dari server). */
export function LupaPasswordForm() {
  const [langkah, setLangkah] = useState<Langkah>(0);
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [bolehUlangPada, setBolehUlangPada] = useState(0);
  const [kini, setKini] = useState(0); // diisi saat kode terkirim (Date.now() tidak boleh dipanggil saat prerender)

  const [minta, aksiMinta] = useActionState(async (lalu: Awaited<ReturnType<typeof mintaOtpAction>> | null, form: FormData) => {
    const h = await mintaOtpAction(lalu, form);
    if (h.ok) {
      setEmail(h.email ?? email);
      setLangkah(1);
      setBolehUlangPada(Date.now() + JEDA_KIRIM_MS);
      setKini(Date.now());
    }
    return h;
  }, null);
  const [verif, aksiVerif] = useActionState(async (lalu: Awaited<ReturnType<typeof verifikasiOtpAction>> | null, form: FormData) => {
    const h = await verifikasiOtpAction(lalu, form);
    if (h.ok && h.token) {
      setToken(h.token);
      setLangkah(2);
    }
    return h;
  }, null);
  const [reset, aksiReset] = useActionState(resetPasswordOtpAction, null);

  // Hitung mundur tombol "Kirim ulang"; berhenti sendiri begitu jedanya lewat.
  const sisaDtk = Math.max(0, Math.ceil((bolehUlangPada - kini) / 1000));
  useEffect(() => {
    if (langkah !== 1 || sisaDtk === 0) return;
    const t = setInterval(() => setKini(Date.now()), 1000);
    return () => clearInterval(t);
  }, [langkah, sisaDtk]);

  if (langkah === 0) {
    return (
      <div>
        <Tahap kini={0} />
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
      </div>
    );
  }

  if (langkah === 1) {
    return (
      <div className="space-y-4">
        <Tahap kini={1} />
        <Pesan ok={!!minta?.ok}>{minta?.pesan}</Pesan>
        <form action={aksiVerif} className="space-y-4">
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
          <Pesan ok={false}>{verif && !verif.ok ? verif.pesan : null}</Pesan>
          <SubmitButton className="btn btn-primary w-full">Verifikasi kode</SubmitButton>
        </form>
        <form action={aksiMinta} className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
          <input type="hidden" name="email" value={email} />
          <button type="button" onClick={() => setLangkah(0)} className="font-medium text-muted hover:text-fg hover:underline">
            Ganti email
          </button>
          <SubmitButton className="font-semibold text-accent hover:underline disabled:text-faint disabled:no-underline" disabled={sisaDtk > 0}>
            {sisaDtk > 0 ? `Kirim ulang kode (${sisaDtk} dtk)` : "Kirim ulang kode"}
          </SubmitButton>
        </form>
      </div>
    );
  }

  return (
    <div>
      <Tahap kini={2} />
      <p role="status" className="mb-4 text-[13px] text-success">
        Kode benar. Buat password baru untuk {email}.
      </p>
      <form action={aksiReset} className="space-y-4">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="token" value={token} />
        <div>
          <label htmlFor="baru" className="label">
            Password baru
          </label>
          <input id="baru" name="baru" type="password" autoComplete="new-password" required minLength={10} maxLength={200} autoFocus aria-describedby="aturan-pw" className="field" />
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
    </div>
  );
}
