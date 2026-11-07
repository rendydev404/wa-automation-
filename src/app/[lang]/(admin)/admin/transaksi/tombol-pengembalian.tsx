"use client";

import { useActionState, useState } from "react";
import { adminModeRefundAction, adminSelesaikanPengembalianAction, adminTolakPengembalianAction, adminUlangiPengembalianAction } from "@/app/actions";
import { Pesan, SubmitButton, TombolKonfirmasi } from "@/components/ui";
import type { ModeRefund } from "@/lib/jaminan-def";

/**
 * Aksi admin untuk satu pengajuan uang kembali yang belum selesai:
 *   - "Sudah ditransfer": admin sudah mengirim dananya sendiri (referensi transfer opsional) -> selesai, paket dicabut;
 *   - "Tolak": wajib alasan, pemilik akun diberi tahu, paket tetap aktif;
 *   - "Coba lagi lewat Midtrans": hanya untuk refund otomatis yang gagal.
 */
export function AksiPengembalian({ id, bisaUlangi }: { id: number; bisaUlangi: boolean }) {
  const [buka, setBuka] = useState<"selesai" | "tolak" | null>(null);
  const [hasilSelesai, aksiSelesai] = useActionState(adminSelesaikanPengembalianAction, null);
  const [hasilTolak, aksiTolak] = useActionState(adminTolakPengembalianAction, null);

  return (
    <div className="w-full space-y-2 sm:w-auto">
      {buka === null && (
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <button type="button" className="btn btn-primary" onClick={() => setBuka("selesai")}>
            Sudah ditransfer
          </button>
          <button type="button" className="btn btn-ghost border border-line" onClick={() => setBuka("tolak")}>
            Tolak
          </button>
          {bisaUlangi && <TombolKonfirmasi label="Coba lagi lewat Midtrans" tanya="Kirim ulang refund ke Midtrans?" ya="Kirim" className="btn btn-ghost" aksi={() => adminUlangiPengembalianAction(id)} />}
        </div>
      )}
      {buka === "selesai" && (
        <form action={aksiSelesai} className="space-y-2 sm:w-80">
          <input type="hidden" name="id" value={id} />
          <label htmlFor={`ref-${id}`} className="label">
            Referensi transfer (opsional)
          </label>
          <input id={`ref-${id}`} name="referensi" maxLength={100} placeholder="mis. no. referensi m-banking" className="field" />
          <p className="text-[12px] text-muted">Pastikan dana sudah benar-benar terkirim. Paket pembeli langsung dicabut dan komisi afiliasinya batal.</p>
          <div className="flex flex-wrap gap-2">
            <SubmitButton>Ya, tandai selesai</SubmitButton>
            <button type="button" className="btn btn-ghost" onClick={() => setBuka(null)}>
              Batal
            </button>
          </div>
        </form>
      )}
      {buka === "tolak" && (
        <form action={aksiTolak} className="space-y-2 sm:w-80">
          <input type="hidden" name="id" value={id} />
          <label htmlFor={`tolak-${id}`} className="label">
            Alasan penolakan (dikirim ke pemilik akun)
          </label>
          <textarea id={`tolak-${id}`} name="catatan" rows={2} minLength={3} maxLength={300} required className="field" />
          <div className="flex flex-wrap gap-2">
            <SubmitButton className="btn bg-danger text-white hover:opacity-90">Tolak pengajuan</SubmitButton>
            <button type="button" className="btn btn-ghost" onClick={() => setBuka(null)}>
              Batal
            </button>
          </div>
        </form>
      )}
      <Pesan ok={!!hasilSelesai?.ok}>{hasilSelesai?.pesan}</Pesan>
      <Pesan ok={!!hasilTolak?.ok}>{hasilTolak?.pesan}</Pesan>
    </div>
  );
}

const OPSI_MODE: { nilai: ModeRefund; judul: string; isi: string }[] = [
  {
    nilai: "manual",
    judul: "Manual (transfer oleh admin)",
    isi: "Pemilik akun mengisi rekening / e-wallet tujuan. Admin mentransfer sendiri, lalu menekan Sudah ditransfer. Tidak perlu persetujuan Midtrans.",
  },
  {
    nilai: "otomatis",
    judul: "Otomatis (Refund API Midtrans)",
    isi: "Dana langsung dikembalikan ke GoPay / ShopeePay / QRIS asal tanpa admin. Fitur Refund harus sudah diaktifkan Midtrans untuk akun produksi; bila belum, pengajuan gagal dan menunggu admin.",
  },
];

/** Pilihan cara pengembalian dana (settings `refund_mode`). */
export function FormModeRefund({ mode }: { mode: ModeRefund }) {
  const [pilih, setPilih] = useState<ModeRefund>(mode);
  const [hasil, aksi] = useActionState(adminModeRefundAction, null);
  return (
    <form action={aksi} className="space-y-3">
      <div role="radiogroup" aria-label="Cara pengembalian dana" className="grid gap-2 sm:grid-cols-2">
        {OPSI_MODE.map((o) => (
          <label
            key={o.nilai}
            className={`flex cursor-pointer gap-2.5 rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${
              pilih === o.nilai ? "border-accent bg-accent-soft" : "border-line hover:border-line-strong"
            }`}
          >
            <input type="radio" name="mode" value={o.nilai} checked={pilih === o.nilai} onChange={() => setPilih(o.nilai)} className="bulat mt-0.5" />
            <span>
              <span className="block text-[13px] font-semibold">{o.judul}</span>
              <span className="mt-0.5 block text-[12px] leading-snug text-muted">{o.isi}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton disabled={pilih === mode}>Simpan cara pengembalian</SubmitButton>
        <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
      </div>
    </form>
  );
}
