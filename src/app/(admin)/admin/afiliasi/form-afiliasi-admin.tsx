"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, CheckCircle2, Copy, Loader2, Send, ShieldBan, XCircle } from "lucide-react";
import { adminAturanAfiliasiAction, adminProsesPenarikanAction, adminStatusAfiliatorAction } from "@/app/actions";
import { Pesan, Saklar, SubmitButton } from "@/components/ui";
import type { ModePersetujuanAfiliasi, PengaturanAfiliasi, SiklusKomisi, StatusAfiliator } from "@/lib/afiliasi-def";
import { angka } from "@/lib/format";

const OPSI_SIKLUS: { nilai: SiklusKomisi; judul: string; isi: string }[] = [
  {
    nilai: "berulang",
    judul: "Berulang (Recurring setiap pembelian)",
    isi: "Afiliator selalu mendapat komisi setiap kali pengguna yang direferensikan membeli atau memperpanjang paket berbayar.",
  },
  {
    nilai: "pertama",
    judul: "Hanya pembelian pertama (First purchase)",
    isi: "Afiliator hanya mendapat komisi satu kali saat pengguna yang direferensikan melunasi paket berbayar pertamanya.",
  },
];

const OPSI_PERSETUJUAN: { nilai: ModePersetujuanAfiliasi; judul: string; isi: string }[] = [
  {
    nilai: "otomatis",
    judul: "Langsung aktif otomatis",
    isi: "Pengguna yang mendaftar di menu Afiliasi langsung mendapat tautan aktif tanpa perlu menunggu persetujuan admin.",
  },
  {
    nilai: "manual",
    judul: "Perlu persetujuan (ACC) Admin",
    isi: "Pendaftar baru berstatus Menunggu sampai disetujui oleh admin di halaman ini.",
  },
];

export function FormAturanAfiliasi({ awal }: { awal: PengaturanAfiliasi }) {
  const [hasil, aksi, menyimpan] = useActionState(adminAturanAfiliasiAction, null);
  const [, mulai] = useTransition();
  const [aktif, setAktif] = useState(awal.aktif);
  const [siklus, setSiklus] = useState<SiklusKomisi>(awal.siklus);
  const [persetujuan, setPersetujuan] = useState<ModePersetujuanAfiliasi>(awal.persetujuan);
  const [minTarik, setMinTarik] = useState(String(awal.minTarik));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        mulai(() => aksi(fd));
      }}
      className="space-y-4"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[13.5px] font-semibold">Program Afiliasi aktif</p>
          <p className="text-[12.5px] text-muted">
            {aktif
              ? "Tautan referral aktif mencatat pendaftar baru dan menghitung komisi otomatis."
              : "Program dijeda: pendaftaran afiliator baru dan penghitungan komisi baru dihentikan sementara."}
          </p>
        </div>
        <Saklar aktif={aktif} onUbah={setAktif} label="Program Afiliasi aktif" />
        {aktif && <input type="hidden" name="aktif" value="on" />}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <fieldset className="space-y-2 rounded-2xl border border-line p-4">
          <legend className="px-1 text-[13px] font-semibold">Siklus pemberian komisi</legend>
          {OPSI_SIKLUS.map((o) => (
            <label
              key={o.nilai}
              className={`flex cursor-pointer gap-2.5 rounded-xl border p-3 transition-colors ${
                siklus === o.nilai ? "border-accent bg-accent-soft" : "border-line hover:border-line-strong"
              }`}
            >
              <input
                type="radio"
                name="siklus"
                value={o.nilai}
                checked={siklus === o.nilai}
                onChange={() => setSiklus(o.nilai)}
                className="mt-0.5 accent-accent"
              />
              <span>
                <span className="block text-[13px] font-semibold">{o.judul}</span>
                <span className="mt-0.5 block text-[12px] leading-snug text-muted">{o.isi}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <fieldset className="space-y-2 rounded-2xl border border-line p-4">
          <legend className="px-1 text-[13px] font-semibold">Pendaftaran afiliator baru</legend>
          {OPSI_PERSETUJUAN.map((o) => (
            <label
              key={o.nilai}
              className={`flex cursor-pointer gap-2.5 rounded-xl border p-3 transition-colors ${
                persetujuan === o.nilai ? "border-accent bg-accent-soft" : "border-line hover:border-line-strong"
              }`}
            >
              <input
                type="radio"
                name="persetujuan"
                value={o.nilai}
                checked={persetujuan === o.nilai}
                onChange={() => setPersetujuan(o.nilai)}
                className="mt-0.5 accent-accent"
              />
              <span>
                <span className="block text-[13px] font-semibold">{o.judul}</span>
                <span className="mt-0.5 block text-[12px] leading-snug text-muted">{o.isi}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </div>

      <div className="max-w-xs">
        <label htmlFor="min_tarik" className="label">
          Minimal penarikan komisi (Withdraw)
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[13px] font-semibold text-muted">
            Rp
          </span>
          <input
            id="min_tarik"
            name="min_tarik"
            inputMode="numeric"
            value={minTarik ? Number(minTarik.replace(/[^\d]/g, "")).toLocaleString("id-ID") : ""}
            onChange={(e) => setMinTarik(e.target.value.replace(/[^\d]/g, ""))}
            required
            className="field pl-9 tabular-nums"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={menyimpan} className="btn btn-primary">
          {menyimpan && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Simpan aturan afiliasi
        </button>
        <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
      </div>
    </form>
  );
}

export function FormProsesPenarikan({
  id,
  nominal,
  bankNama,
  bankNomor,
  irisSiap,
}: {
  id: number;
  nominal: number;
  bankNama: string;
  bankNomor: string;
  irisSiap: boolean;
}) {
  const [hasil, aksi] = useActionState(adminProsesPenarikanAction, null);
  const [mode, setMode] = useState<"manual" | "iris" | "tolak" | null>(null);
  const [disalin, setDisalin] = useState(false);

  const salinNomor = () => {
    navigator.clipboard?.writeText(bankNomor);
    setDisalin(true);
    setTimeout(() => setDisalin(false), 1800);
  };

  return (
    <div className="mt-2.5 space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={salinNomor}
          className="btn btn-ghost border border-line px-2.5 py-1.5 text-[12px]"
        >
          {disalin ? <Check className="size-3.5 text-success" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          {disalin ? "No. rek disalin" : `Salin ${bankNomor}`}
        </button>

        <button
          type="button"
          onClick={() => setMode(mode === "manual" ? null : "manual")}
          className={`btn px-3 py-1.5 text-[12px] ${mode === "manual" ? "btn-primary" : "btn-ghost border border-line"}`}
        >
          <CheckCircle2 className="size-3.5" aria-hidden /> Tandai Sudah Ditransfer
        </button>

        {irisSiap && (
          <button
            type="button"
            onClick={() => setMode(mode === "iris" ? null : "iris")}
            className={`btn px-3 py-1.5 text-[12px] ${mode === "iris" ? "btn-primary" : "btn-ghost border border-line"}`}
          >
            <Send className="size-3.5" aria-hidden /> Cairkan Otomatis (Midtrans Iris)
          </button>
        )}

        <button
          type="button"
          onClick={() => setMode(mode === "tolak" ? null : "tolak")}
          className={`btn px-3 py-1.5 text-[12px] ${
            mode === "tolak" ? "bg-danger text-white" : "btn-ghost border border-line text-danger"
          }`}
        >
          <XCircle className="size-3.5" aria-hidden /> Tolak & Kembalikan Saldo
        </button>
      </div>

      {mode && (
        <form action={aksi} className="animate-masuk space-y-2.5 rounded-xl border border-line bg-subtle/50 p-3.5">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="aksi" value={mode} />
          {mode === "manual" && (
            <>
              <p className="text-[12.5px] font-semibold">
                Konfirmasi transfer manual Rp{angka(nominal)} ke {bankNama.toUpperCase()} {bankNomor}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  name="referensi"
                  placeholder="No. referensi / bukti transfer (opsional)"
                  maxLength={100}
                  className="field text-[12.5px]"
                />
                <input
                  name="catatan"
                  placeholder="Catatan untuk afiliator (opsional)"
                  maxLength={200}
                  className="field text-[12.5px]"
                />
              </div>
            </>
          )}
          {mode === "iris" && (
            <>
              <p className="text-[12.5px] font-semibold">
                Kirim Rp{angka(nominal)} otomatis lewat Midtrans Iris ke {bankNama.toUpperCase()} {bankNomor}
              </p>
              <input
                name="catatan"
                placeholder="Catatan transfer Iris (opsional)"
                maxLength={80}
                className="field text-[12.5px]"
              />
            </>
          )}
          {mode === "tolak" && (
            <>
              <p className="text-[12.5px] font-semibold text-danger">
                Tolak pengajuan dan kembalikan Rp{angka(nominal)} ke saldo afiliator
              </p>
              <input
                name="catatan"
                placeholder="Alasan penolakan (mis. Nomor rekening tidak ditemukan)"
                required
                maxLength={200}
                className="field text-[12.5px]"
              />
            </>
          )}
          <div className="flex items-center gap-2">
            <SubmitButton className={mode === "tolak" ? "btn bg-danger text-white hover:opacity-90" : "btn btn-primary"}>
              {mode === "manual"
                ? "Simpan & Tandai Lunas"
                : mode === "iris"
                  ? "Kirim Dana via Iris Sekarang"
                  : "Konfirmasi Tolak"}
            </SubmitButton>
            <button type="button" onClick={() => setMode(null)} className="btn btn-ghost text-[12.5px]">
              Batal
            </button>
          </div>
        </form>
      )}
      <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
    </div>
  );
}

export function AksiStatusAfiliator({ userId, status }: { userId: number; status: StatusAfiliator }) {
  const [tunggu, mulai] = useTransition();
  const [pesan, setPesan] = useState<{ ok: boolean; teks: string } | null>(null);

  const ubah = (baru: StatusAfiliator) => {
    mulai(async () => {
      const h = await adminStatusAfiliatorAction(userId, baru);
      setPesan({ ok: h.ok, teks: h.pesan ?? "" });
    });
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {status === "menunggu" && (
        <button
          type="button"
          disabled={tunggu}
          onClick={() => ubah("aktif")}
          className="btn btn-primary px-2.5 py-1 text-[12px]"
        >
          {tunggu ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <CheckCircle2 className="size-3.5" aria-hidden />}
          Setujui
        </button>
      )}
      {status === "aktif" ? (
        <button
          type="button"
          disabled={tunggu}
          onClick={() => ubah("nonaktif")}
          className="btn btn-ghost border border-line px-2.5 py-1 text-[12px] text-danger"
        >
          <ShieldBan className="size-3.5" aria-hidden /> Nonaktifkan
        </button>
      ) : (
        status === "nonaktif" && (
          <button
            type="button"
            disabled={tunggu}
            onClick={() => ubah("aktif")}
            className="btn btn-ghost border border-line px-2.5 py-1 text-[12px]"
          >
            <CheckCircle2 className="size-3.5" aria-hidden /> Aktifkan kembali
          </button>
        )
      )}
      {pesan && !pesan.ok && <span className="text-[11.5px] text-danger">{pesan.teks}</span>}
    </div>
  );
}
