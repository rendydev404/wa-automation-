"use client";

import { useActionState, useState } from "react";
import { Check, Copy, Landmark, Pencil, Share2, Wallet } from "lucide-react";
import { daftarAfiliasiAction, tarikKomisiAction, ubahAfiliasiAction } from "@/app/actions";
import { PilihOpsi } from "@/components/pilih-opsi";
import { Pesan, SubmitButton } from "@/components/ui";
import { DAFTAR_BANK, namaBankTampil } from "@/lib/afiliasi-def";
import { angka } from "@/lib/format";

const OPSI_BANK = DAFTAR_BANK.map((b) => ({
  id: b.id,
  label: b.nama,
  lencana: b.kategori,
}));

export function FormGabungAfiliasi() {
  const [hasil, aksi] = useActionState(daftarAfiliasiAction, null);
  const [bank, setBank] = useState<string>(DAFTAR_BANK[0].id);

  return (
    <form action={aksi} className="space-y-4">
      <div className="rounded-xl border border-line bg-subtle/40 px-4 py-3 text-[12.5px] text-muted">
        Kode tautan referral unik akan dibuat secara <strong className="font-semibold text-fg">acak otomatis</strong> oleh sistem begitu Anda bergabung.
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="af-bank" className="label">
            Bank atau E-Wallet tujuan komisi
          </label>
          <PilihOpsi
            id="af-bank"
            name="bank_nama"
            nilai={bank}
            onUbah={setBank}
            opsi={OPSI_BANK}
            label="Bank atau E-Wallet"
          />
        </div>
        <div>
          <label htmlFor="af-nomor" className="label">
            Nomor rekening / nomor E-Wallet
          </label>
          <input
            id="af-nomor"
            name="bank_nomor"
            inputMode="numeric"
            placeholder="Contoh: 1234567890"
            required
            minLength={6}
            maxLength={30}
            className="field tabular-nums"
          />
        </div>
      </div>

      <div>
        <label htmlFor="af-pemilik" className="label">
          Nama pemilik rekening (sesuai buku tabungan / akun E-Wallet)
        </label>
        <input
          id="af-pemilik"
          name="bank_pemilik"
          placeholder="Nama lengkap pemilik rekening"
          required
          minLength={2}
          maxLength={80}
          className="field"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <SubmitButton className="btn btn-primary">
          <Share2 className="size-4" aria-hidden /> Gabung Program Afiliasi Sekarang
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
          <p className="text-[11.5px] font-semibold tracking-[0.08em] text-accent uppercase">Tautan Afiliasi Anda</p>
          <h2 className="mt-1 text-lg font-bold">Bagikan & dapatkan komisi otomatis</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            Setiap pengguna baru yang mendaftar melalui tautan Anda dan membeli paket, komisinya langsung masuk ke saldo Anda sesuai ketentuan pihak aplikasi.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setBukaEdit((v) => !v)}
          className="btn btn-ghost border border-line text-[12.5px]"
        >
          <Pencil className="size-3.5" aria-hidden /> {bukaEdit ? "Tutup pengaturan" : "Ubah rekening pencairan"}
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-line bg-subtle/50 p-3.5">
          <p className="text-[11.5px] font-semibold text-muted">Tautan ke Halaman Utama (Landing Page)</p>
          <div className="mt-1.5 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-surface px-3 py-2 font-mono text-[12.5px] select-all">
              {tautanUtama}
            </code>
            <button
              type="button"
              onClick={() => salin(tautanUtama, "utama")}
              className="btn btn-primary shrink-0 px-3 py-2 text-[12.5px]"
            >
              {disalin === "utama" ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              {disalin === "utama" ? "Disalin" : "Salin"}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-subtle/50 p-3.5">
          <p className="text-[11.5px] font-semibold text-muted">Tautan Langsung ke Pendaftaran</p>
          <div className="mt-1.5 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-surface px-3 py-2 font-mono text-[12.5px] select-all">
              {tautanDaftar}
            </code>
            <button
              type="button"
              onClick={() => salin(tautanDaftar, "daftar")}
              className="btn btn-ghost shrink-0 border border-line bg-surface px-3 py-2 text-[12.5px]"
            >
              {disalin === "daftar" ? <Check className="size-4 text-success" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              {disalin === "daftar" ? "Disalin" : "Salin"}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-3.5 py-2.5 text-[12.5px]">
        <span className="flex items-center gap-2 text-muted">
          <Landmark className="size-4 text-accent" aria-hidden />
          Rekening tujuan pencairan:{" "}
          <strong className="font-semibold text-fg">
            {namaBankTampil(bankNama)} · {bankNomor}
          </strong>{" "}
          a.n. <strong className="font-semibold text-fg">{bankPemilik}</strong>
        </span>
        <span className="font-mono text-[12px] text-muted">Kode: {kode}</span>
      </div>

      {bukaEdit && (
        <form action={aksi} className="mt-4 animate-masuk space-y-3 rounded-xl border border-line bg-subtle/40 p-4">
          <p className="text-[13px] font-bold">Ubah rekening tujuan pencairan komisi</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="edit-bank" className="label">
                Bank / E-Wallet
              </label>
              <PilihOpsi
                id="edit-bank"
                name="bank_nama"
                nilai={bankEdit}
                onUbah={setBankEdit}
                opsi={OPSI_BANK}
                label="Bank atau E-Wallet"
              />
            </div>
            <div>
              <label htmlFor="edit-nomor" className="label">
                Nomor rekening / E-Wallet
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
                Nama pemilik rekening
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
            <SubmitButton>Simpan perubahan</SubmitButton>
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
}: {
  saldo: number;
  minTarik: number;
  sedangMenunggu: number;
  bankNama: string;
  bankNomor: string;
  bankPemilik: string;
}) {
  const [hasil, aksi] = useActionState(tarikKomisiAction, null);
  const [nominal, setNominal] = useState<string>(saldo >= minTarik ? String(saldo) : "");
  const nilai = Number(nominal.replace(/[^\d]/g, "")) || 0;
  const bisaTarik = saldo >= minTarik && sedangMenunggu === 0 && nilai >= minTarik && nilai <= saldo;

  return (
    <section className="card p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <Wallet className="size-4 text-accent" aria-hidden />
        <h2 className="text-[15px] font-bold">Tarik saldo komisi (Withdraw)</h2>
      </div>
      <p className="mt-1 text-[12.5px] text-muted">
        Minimal penarikan <strong className="font-semibold text-fg">Rp{angka(minTarik)}</strong>. Dana akan dikirim ke{" "}
        <strong className="font-semibold text-fg">
          {namaBankTampil(bankNama)} ({bankNomor} a.n. {bankPemilik})
        </strong>
        .
      </p>

      {sedangMenunggu > 0 ? (
        <div className="mt-4 rounded-xl border border-warning/40 bg-warning-soft p-3.5 text-[13px] text-warning">
          Anda memiliki pengajuan penarikan sebesar <strong className="tabular-nums">Rp{angka(sedangMenunggu)}</strong> yang sedang diproses. Pengajuan baru dapat dilakukan setelah pengajuan saat ini selesai.
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
                aria-label="Nominal penarikan (Rp)"
                inputMode="numeric"
                value={nominal ? Number(nominal.replace(/[^\d]/g, "")).toLocaleString("id-ID") : ""}
                onChange={(e) => setNominal(e.target.value.replace(/[^\d]/g, ""))}
                placeholder={`Minimal ${angka(minTarik)}`}
                disabled={saldo < minTarik}
                className="field pl-9 tabular-nums"
              />
            </div>
            {saldo >= minTarik && (
              <button
                type="button"
                onClick={() => setNominal(String(saldo))}
                className="btn btn-ghost shrink-0 border border-line text-[12.5px]"
              >
                Tarik semua (Rp{angka(saldo)})
              </button>
            )}
            <SubmitButton disabled={!bisaTarik} className="btn btn-primary shrink-0">
              Ajukan penarikan
            </SubmitButton>
          </div>
          {saldo < minTarik && (
            <p className="text-[12px] text-muted">
              Saldo Anda saat ini Rp{angka(saldo)}. Kumpulkan minimal Rp{angka(minTarik)} untuk mencairkan komisi.
            </p>
          )}
          <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
        </form>
      )}
    </section>
  );
}
