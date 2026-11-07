"use client";

import { useActionState, useState } from "react";
import { Check, Copy, Landmark, Pencil, Share2, Wallet } from "lucide-react";
import { daftarAfiliasiAction, tarikKomisiAction, ubahAfiliasiAction } from "@/app/actions";
import { PilihOpsi } from "@/components/pilih-opsi";
import { Pesan, SubmitButton } from "@/components/ui";
import { useBahasa } from "@/components/bahasa";
import { DAFTAR_BANK, namaBankTampil } from "@/lib/afiliasi-def";
import { angka, uang } from "@/lib/format";
import { JAMINAN_HARI } from "@/lib/jaminan-def";

const OPSI_BANK = DAFTAR_BANK.map((b) => ({
  id: b.id,
  label: b.nama,
  lencana: b.kategori,
}));

export function FormGabungAfiliasi() {
  const { b, t } = useBahasa();
  const [hasil, aksi] = useActionState(daftarAfiliasiAction, null);
  const [bank, setBank] = useState<string>(DAFTAR_BANK[0].id);

  return (
    <form action={aksi} className="space-y-4">
      <div className="rounded-xl border border-line bg-subtle/40 px-4 py-3 text-[12.5px] text-muted">
        {b === "en" ? (
          <>
            Your unique referral link code is <strong className="font-semibold text-fg">generated automatically</strong> as soon as you join.
          </>
        ) : (
          <>
            Kode tautan referral unik akan dibuat secara <strong className="font-semibold text-fg">acak otomatis</strong> oleh sistem begitu Anda bergabung.
          </>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="af-bank" className="label">
            {t("Bank atau E-Wallet tujuan komisi", "Bank or e-wallet for commission payouts")}
          </label>
          <PilihOpsi
            id="af-bank"
            name="bank_nama"
            nilai={bank}
            onUbah={setBank}
            opsi={OPSI_BANK}
            label={t("Bank atau E-Wallet", "Bank or e-wallet")}
          />
        </div>
        <div>
          <label htmlFor="af-nomor" className="label">
            {t("Nomor rekening / nomor E-Wallet", "Account number / e-wallet number")}
          </label>
          <input
            id="af-nomor"
            name="bank_nomor"
            inputMode="numeric"
            placeholder={t("Contoh: 1234567890", "e.g. 1234567890")}
            required
            minLength={6}
            maxLength={30}
            className="field tabular-nums"
          />
        </div>
      </div>

      <div>
        <label htmlFor="af-pemilik" className="label">
          {t("Nama pemilik rekening (sesuai buku tabungan / akun E-Wallet)", "Account holder name (as shown on your bank / e-wallet account)")}
        </label>
        <input
          id="af-pemilik"
          name="bank_pemilik"
          placeholder={t("Nama lengkap pemilik rekening", "Account holder's full name")}
          required
          minLength={2}
          maxLength={80}
          className="field"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <SubmitButton className="btn btn-primary h-auto min-h-[2.375rem] w-full py-2 whitespace-normal sm:w-auto">
          <Share2 className="size-4 shrink-0" aria-hidden /> {t("Gabung Program Afiliasi Sekarang", "Join the Affiliate Program Now")}
        </SubmitButton>
        <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
      </div>
    </form>
  );
}

export function KartuTautanReferral({
  tautanUtama,
  tautanDaftar,
  kode,
  bankNama,
  bankNomor,
  bankPemilik,
}: {
  tautanUtama: string;
  tautanDaftar: string;
  kode: string;
  bankNama: string;
  bankNomor: string;
  bankPemilik: string;
}) {
  const { b, t } = useBahasa();
  const [disalin, setDisalin] = useState<"utama" | "daftar" | null>(null);
  const [bukaEdit, setBukaEdit] = useState(false);
  const [hasil, aksi] = useActionState(ubahAfiliasiAction, null);
  const [bankEdit, setBankEdit] = useState(bankNama);

  const salin = (teks: string, jenis: "utama" | "daftar") => {
    navigator.clipboard?.writeText(teks);
    setDisalin(jenis);
    setTimeout(() => setDisalin((s) => (s === jenis ? null : s)), 2000);
  };

  return (
    <section className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11.5px] font-semibold tracking-[0.08em] text-accent uppercase">{t("Tautan Afiliasi Anda", "Your Affiliate Links")}</p>
          <h2 className="mt-1 text-lg font-bold">{t("Bagikan & dapatkan komisi otomatis", "Share & earn commission automatically")}</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            {t(
              `Setiap pengguna baru yang mendaftar melalui tautan Anda dan membeli paket, komisinya langsung masuk ke saldo Anda dan bisa ditarik ${JAMINAN_HARI} hari setelah pembeli membayar (masa jaminan uang kembali).`,
              `Whenever a new user signs up through your link and buys a plan, the commission goes straight to your balance and can be withdrawn ${JAMINAN_HARI} days after the buyer pays (the money-back guarantee period).`,
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setBukaEdit((v) => !v)}
          className="btn btn-ghost border border-line text-[12.5px]"
        >
          <Pencil className="size-3.5" aria-hidden /> {bukaEdit ? t("Tutup pengaturan", "Close settings") : t("Ubah rekening pencairan", "Change payout account")}
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-line bg-subtle/50 p-3.5">
          <p className="text-[11.5px] font-semibold text-muted">{t("Tautan ke Halaman Utama (Landing Page)", "Link to the Home Page (Landing Page)")}</p>
          <div className="mt-1.5 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-surface px-3 py-2 font-mono text-[12.5px] select-all">
              {tautanUtama}
            </code>
            <button
              type="button"
              data-analitik="Salin tautan afiliasi (landing)"
              onClick={() => salin(tautanUtama, "utama")}
              className="btn btn-primary shrink-0 px-3 py-2 text-[12.5px]"
            >
              {disalin === "utama" ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              {disalin === "utama" ? t("Disalin", "Copied") : t("Salin", "Copy")}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-subtle/50 p-3.5">
          <p className="text-[11.5px] font-semibold text-muted">{t("Tautan Langsung ke Pendaftaran", "Direct Link to Sign-up")}</p>
          <div className="mt-1.5 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-surface px-3 py-2 font-mono text-[12.5px] select-all">
              {tautanDaftar}
            </code>
            <button
              type="button"
              data-analitik="Salin tautan afiliasi (daftar)"
              onClick={() => salin(tautanDaftar, "daftar")}
              className="btn btn-ghost shrink-0 border border-line bg-surface px-3 py-2 text-[12.5px]"
            >
              {disalin === "daftar" ? <Check className="size-4 text-success" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              {disalin === "daftar" ? t("Disalin", "Copied") : t("Salin", "Copy")}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-3.5 py-2.5 text-[12.5px]">
        <span data-analitik-privat className="flex min-w-0 items-start gap-2 text-muted">
          <Landmark className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
          <span className="min-w-0 [overflow-wrap:anywhere]">
            {t("Rekening tujuan pencairan:", "Payout account:")}{" "}
            <strong className="font-semibold text-fg">
              {namaBankTampil(bankNama)} · {bankNomor}
            </strong>{" "}
            {b === "en" ? "in the name of" : "a.n."} <strong className="font-semibold text-fg">{bankPemilik}</strong>
          </span>
        </span>
        <span className="font-mono text-[12px] text-muted">{t("Kode", "Code")}: {kode}</span>
      </div>

      {bukaEdit && (
        <form action={aksi} className="mt-4 animate-masuk space-y-3 rounded-xl border border-line bg-subtle/40 p-4">
          <p className="text-[13px] font-bold">{t("Ubah rekening tujuan pencairan komisi", "Change your commission payout account")}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="edit-bank" className="label">
                {t("Bank / E-Wallet", "Bank / e-wallet")}
              </label>
              <PilihOpsi
                id="edit-bank"
                name="bank_nama"
                nilai={bankEdit}
                onUbah={setBankEdit}
                opsi={OPSI_BANK}
                label={t("Bank atau E-Wallet", "Bank or e-wallet")}
              />
            </div>
            <div>
              <label htmlFor="edit-nomor" className="label">
                {t("Nomor rekening / E-Wallet", "Account / e-wallet number")}
              </label>
              <input
                id="edit-nomor"
                name="bank_nomor"
                defaultValue={bankNomor}
                inputMode="numeric"
                required
                minLength={6}
                maxLength={30}
                className="field tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="edit-pemilik" className="label">
                {t("Nama pemilik rekening", "Account holder name")}
              </label>
              <input
                id="edit-pemilik"
                name="bank_pemilik"
                defaultValue={bankPemilik}
                required
                minLength={2}
                maxLength={80}
                className="field"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <SubmitButton>{t("Simpan perubahan", "Save changes")}</SubmitButton>
            <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
          </div>
        </form>
      )}
    </section>
  );
}

export function FormTarikKomisi({
  saldo,
  minTarik,
  sedangMenunggu,
  bankNama,
  bankNomor,
  bankPemilik,
  kurs,
}: {
  saldo: number;
  minTarik: number;
  sedangMenunggu: number;
  bankNama: string;
  bankNomor: string;
  bankPemilik: string;
  /** Rp per 1 USD: versi Inggris menampilkan USD; penarikan tetap diajukan & ditransfer dalam Rupiah. */
  kurs?: number;
}) {
  const { b, t } = useBahasa();
  const u = (rp: number) => uang(rp, b, kurs);
  /** Nominal Rupiah persis (untuk isian penarikan yang tetap dalam Rupiah). */
  const rp = (n: number) => `Rp${angka(n, b)}`;
  const [hasil, aksi] = useActionState(tarikKomisiAction, null);
  const [nominal, setNominal] = useState<string>(saldo >= minTarik ? String(saldo) : "");
  const nilai = Number(nominal.replace(/[^\d]/g, "")) || 0;
  const bisaTarik = saldo >= minTarik && sedangMenunggu === 0 && nilai >= minTarik && nilai <= saldo;

  return (
    <section className="card p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <Wallet className="size-4 text-accent" aria-hidden />
        <h2 className="text-[15px] font-bold">{t("Tarik saldo komisi (Withdraw)", "Withdraw commission balance")}</h2>
      </div>
      <p className="mt-1 text-[12.5px] text-muted">
        {b === "en" ? (
          <>
            Minimum payout <strong className="font-semibold text-fg">{u(minTarik)}</strong> ({rp(minTarik)}). Funds will be sent to{" "}
            <strong className="font-semibold text-fg">
              {namaBankTampil(bankNama)} ({bankNomor}, {bankPemilik})
            </strong>{" "}
            in Indonesian rupiah.
          </>
        ) : (
          <>
            Minimal penarikan <strong className="font-semibold text-fg">Rp{angka(minTarik)}</strong>. Dana akan dikirim ke{" "}
            <strong className="font-semibold text-fg">
              {namaBankTampil(bankNama)} ({bankNomor} a.n. {bankPemilik})
            </strong>
            .
          </>
        )}
      </p>

      {sedangMenunggu > 0 ? (
        <div className="mt-4 rounded-xl border border-warning/40 bg-warning-soft p-3.5 text-[13px] text-warning">
          {b === "en" ? (
            <>
              You have a payout request of <strong className="tabular-nums">{u(sedangMenunggu)}</strong> being processed. You can submit a new request once this one is complete.
            </>
          ) : (
            <>
              Anda memiliki pengajuan penarikan sebesar <strong className="tabular-nums">Rp{angka(sedangMenunggu)}</strong> yang sedang diproses. Pengajuan baru dapat dilakukan setelah pengajuan saat ini selesai.
            </>
          )}
        </div>
      ) : (
        <form action={aksi} className="mt-4 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[13px] font-semibold text-muted">
                Rp
              </span>
              <input
                name="nominal"
                aria-label={t("Nominal penarikan (Rp)", "Payout amount (IDR)")}
                inputMode="numeric"
                value={nominal ? angka(Number(nominal.replace(/[^\d]/g, "")), b) : ""}
                onChange={(e) => setNominal(e.target.value.replace(/[^\d]/g, ""))}
                placeholder={t(`Minimal ${angka(minTarik)}`, `Minimum ${angka(minTarik, b)}`)}
                disabled={saldo < minTarik}
                className="field pl-9 tabular-nums"
              />
            </div>
            {saldo >= minTarik && (
              <button
                type="button"
                data-analitik="Tarik semua saldo"
                onClick={() => setNominal(String(saldo))}
                className="btn btn-ghost shrink-0 border border-line text-[12.5px]"
              >
                {t(`Tarik semua (Rp${angka(saldo)})`, `Withdraw all (${u(saldo)})`)}
              </button>
            )}
            <SubmitButton disabled={!bisaTarik} className="btn btn-primary shrink-0">
              {t("Ajukan penarikan", "Request payout")}
            </SubmitButton>
          </div>
          {b === "en" && nilai > 0 && <p className="text-[12px] text-muted tabular-nums">≈ {u(nilai)}</p>}
          {saldo < minTarik && (
            <p className="text-[12px] text-muted">
              {t(
                `Saldo Anda saat ini Rp${angka(saldo)}. Kumpulkan minimal Rp${angka(minTarik)} untuk mencairkan komisi.`,
                `Your current balance is ${u(saldo)}. Reach at least ${u(minTarik)} to withdraw your commission.`,
              )}
            </p>
          )}
          <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
        </form>
      )}
    </section>
  );
}
