"use client";

import { useActionState, useState } from "react";
import { daftarAction } from "@/app/actions";
import { useBahasa } from "@/components/bahasa";
import { Pesan, SubmitButton } from "@/components/ui";
import type { T } from "@/lib/bahasa";

/** Petunjuk kekuatan password di browser; aturan sebenarnya diperiksa ulang di server (cekPassword). */
function kekuatan(pw: string, t: T): { skor: number; teks: string } {
  if (!pw) return { skor: 0, teks: t("Minimal 10 karakter, ada huruf dan angka.", "At least 10 characters, with letters and numbers.") };
  let skor = 0;
  if (pw.length >= 10) skor++;
  if (/[a-zA-Z]/.test(pw) && /[0-9]/.test(pw)) skor++;
  if (pw.length >= 14) skor++;
  if (/[^a-zA-Z0-9]/.test(pw) || /[a-z]/.test(pw) && /[A-Z]/.test(pw)) skor++;
  return {
    skor,
    teks: [t("Terlalu pendek", "Too short"), t("Lemah", "Weak"), t("Cukup", "Fair"), t("Kuat", "Strong"), t("Sangat kuat", "Very strong")][skor],
  };
}

export function DaftarForm() {
  const { t } = useBahasa();
  const [hasil, aksi] = useActionState(daftarAction, null);
  const [pw, setPw] = useState("");
  const k = kekuatan(pw, t);
  return (
    <form action={aksi} className="space-y-4">
      <div>
        <label htmlFor="nama" className="label">
          {t("Nama", "Name")}
        </label>
        <input id="nama" name="nama" autoComplete="name" required minLength={2} maxLength={60} autoFocus className="field" />
      </div>
      <div>
        <label htmlFor="email" className="label">
          Email
        </label>
        <input id="email" name="email" type="email" autoComplete="email" required maxLength={254} className="field" />
      </div>
      <div>
        <label htmlFor="password" className="label">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          maxLength={200}
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          aria-describedby="kekuatan-pw"
          className="field"
        />
        <div className="mt-2 flex gap-1" aria-hidden>
          {[1, 2, 3, 4].map((i) => (
            <span key={i} className={`h-1 flex-1 rounded-full transition-colors ${k.skor >= i ? (k.skor >= 3 ? "bg-accent" : "bg-warning") : "bg-line"}`} />
          ))}
        </div>
        <p id="kekuatan-pw" className="mt-1 text-[12px] text-muted">
          {k.teks}
        </p>
      </div>
      <div>
        <label htmlFor="ulang" className="label">
          {t("Ulangi password", "Confirm password")}
        </label>
        <input id="ulang" name="ulang" type="password" autoComplete="new-password" required maxLength={200} className="field" />
      </div>
      {/* Kolom jebakan bot: disembunyikan dari manusia dan pembaca layar. */}
      <div aria-hidden className="absolute -left-[9999px] size-px overflow-hidden">
        <label htmlFor="situs">Situs</label>
        <input id="situs" name="situs" tabIndex={-1} autoComplete="off" />
      </div>
      <label className="flex items-start gap-2.5 text-[13px] text-muted">
        <input type="checkbox" name="setuju" required className="mt-0.5 size-4 accent-[var(--c-accent)]" />
        <span>
          {t(
            "Saya tidak akan memakai layanan ini untuk spam, penipuan, atau pesan massal yang melanggar aturan WhatsApp.",
            "I will not use this service for spam, fraud, or bulk messaging that breaks WhatsApp's rules.",
          )}
        </span>
      </label>
      <Pesan ok={false}>{hasil?.pesan}</Pesan>
      <SubmitButton className="btn btn-primary w-full">{t("Buat akun", "Create account")}</SubmitButton>
    </form>
  );
}
