"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, ClipboardPaste } from "lucide-react";
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

/** Ambil 6 digit dari teks apa pun yang ditempel ("3 0 7 5 5 0", "Kode: 307550", dsb.). */
const digitKode = (teks: string) => teks.replace(/\D/g, "").slice(0, 6);

/**
 * Tautan dari email kode (/lupa-password?email=...) langsung membuka tahap "Kode OTP" dengan email terisi,
 * jadi pengguna tinggal menempel kodenya; tombol "Salin kode" menambahkan #salin=<kode>. Bungkus dengan <Suspense>
 * (useSearchParams).
 */
export function LupaPasswordDariTautan() {
  const email = (useSearchParams().get("email") ?? "").trim().slice(0, 254);
  return <LupaPasswordForm emailAwal={/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ""} />;
}

/** Tiga tahap di satu halaman: email terdaftar -> kode OTP -> password baru. Berhasil = langsung masuk (redirect dari server). */
export function LupaPasswordForm({ emailAwal = "" }: { emailAwal?: string }) {
  const [langkah, setLangkah] = useState<Langkah>(emailAwal ? 1 : 0);
  const [email, setEmail] = useState(emailAwal);
  const [kode, setKode] = useState("");
  const [info, setInfo] = useState("");
  const formKode = useRef<HTMLFormElement>(null);
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

  // Tombol "Tempel kode": baca papan klip, ambil 6 digitnya, lalu langsung verifikasi.
  const tempel = async () => {
    try {
      const d = digitKode(await navigator.clipboard.readText());
      setKode(d);
      if (d.length === 6) requestAnimationFrame(() => formKode.current?.requestSubmit());
    } catch {
      document.getElementById("kode")?.focus(); // izin papan klip ditolak: tempel manual (Ctrl+V / tekan lama)
    }
  };

  // Tombol "Salin kode" di email: #salin=123456 dibaca sekali di browser (server tidak pernah melihat fragmen), lalu
  // kode disalin ke papan klip, diisi ke kolom, dan dihapus dari alamat supaya tidak tertinggal di layar/riwayat.
  useEffect(() => {
    const m = /^#salin=(\d{6})$/.exec(location.hash);
    if (!m || !emailAwal) return;
    const k = m[1];
    history.replaceState(null, "", location.pathname + location.search);
    (navigator.clipboard?.writeText(k) ?? Promise.reject(new Error("papan klip tidak tersedia")))
      .then(
        () => true,
        () => false,
      )
      .then((disalin) => {
        setKode(k);
        setInfo(`Kode ${k} sudah ${disalin ? "disalin dan " : ""}terisi otomatis. Tinggal klik Verifikasi kode.`);
      });
  }, [emailAwal]);

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
        <Pesan ok={minta ? minta.ok : true}>{minta?.pesan ?? (info || `Masukkan kode 6 digit yang kami kirim ke ${email}.`)}</Pesan>
        <form ref={formKode} action={aksiVerif} className="space-y-4">
          <input type="hidden" name="email" value={email} />
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label htmlFor="kode" className="label mb-0">
                Kode 6 digit
              </label>
              <button type="button" onClick={tempel} className="flex items-center gap-1 text-[13px] font-semibold text-accent hover:underline">
                <ClipboardPaste className="size-3.5" aria-hidden /> Tempel kode
              </button>
            </div>
            <input
              id="kode"
              name="kode"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              minLength={6}
              required
              autoFocus
              value={kode}
              onChange={(e) => setKode(digitKode(e.target.value))}
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
