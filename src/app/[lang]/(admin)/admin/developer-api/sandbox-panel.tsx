"use client";

import { useActionState, useState } from "react";
import { simpanPengaturanSandboxAction, ubahSandboxAction } from "@/app/actions-developer";
import { Pesan, Saklar, SubmitButton } from "@/components/ui";
import { RENTANG_SANDBOX } from "@/lib/api-def";

/** Pengaturan umum sandbox: sakelar, masa key, limit balasan AI bawaan. */
export function FormPengaturanSandbox({ aktif, hari, ai }: { aktif: boolean; hari: number; ai: number }) {
  const [hasil, aksi] = useActionState(simpanPengaturanSandboxAction, null);
  const [nyala, setNyala] = useState(aktif);
  return (
    <form action={aksi} className="space-y-4">
      <input type="hidden" name="aktif" value={nyala ? "on" : ""} />
      <div className="flex items-start justify-between gap-4 rounded-xl border border-line p-3.5">
        <div className="text-[13px]">
          <p className="font-semibold">Sandbox dinyalakan</p>
          <p className="mt-0.5 text-muted">Mati = akun tidak bisa membuat/memperpanjang sandbox, dan mesin sandbox berhenti melayani saat menyala berikutnya (WhatsApp tetap tersambung).</p>
        </div>
        <Saklar aktif={nyala} onUbah={setNyala} label="Sandbox dinyalakan" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="sandbox-hari" className="label">
            Masa key sandbox (hari)
          </label>
          <input id="sandbox-hari" name="hari" type="number" min={RENTANG_SANDBOX.hari.min} max={RENTANG_SANDBOX.hari.maks} defaultValue={hari} className="field" />
          <p className="mt-1 text-[12px] text-muted">Dipakai saat key dibuat dan setiap kali diperpanjang.</p>
        </div>
        <div>
          <label htmlFor="sandbox-ai" className="label">
            Limit balasan AI per hari (bawaan)
          </label>
          <input id="sandbox-ai" name="ai_hari" type="number" min={RENTANG_SANDBOX.ai_hari.min} max={RENTANG_SANDBOX.ai_hari.maks} defaultValue={ai} className="field" />
          <p className="mt-1 text-[12px] text-muted">
            Untuk sandbox tanpa limit khusus ({RENTANG_SANDBOX.ai_hari.min}–{RENTANG_SANDBOX.ai_hari.maks.toLocaleString("id-ID")}). Dihitung: balasan bot WA, /ai/jawab, /ai/rapikan.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 border-t border-line pt-4">
        <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
        <SubmitButton>Simpan pengaturan sandbox</SubmitButton>
      </div>
    </form>
  );
}

/** Limit AI khusus satu sandbox (0 = ikut bawaan) + perpanjang. */
export function FormUbahSandbox({ id, aiKhusus, aiBawaan, hari }: { id: number; aiKhusus: number; aiBawaan: number; hari: number }) {
  const [hasil, aksi] = useActionState(ubahSandboxAction, null);
  return (
    <div className="space-y-3">
      <form action={aksi} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="id" value={id} />
        <div className="w-full max-w-72">
          <label htmlFor={`ai-${id}`} className="text-[12.5px] font-semibold text-muted">
            Limit AI per hari <span className="font-normal">(0 = bawaan {aiBawaan.toLocaleString("id-ID")})</span>
          </label>
          <input id={`ai-${id}`} name="ai_hari" type="number" min={0} max={RENTANG_SANDBOX.ai_hari.maks} defaultValue={aiKhusus} className="field mt-1" />
        </div>
        <SubmitButton className="btn btn-primary">Simpan limit</SubmitButton>
      </form>
      <form action={aksi}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="perpanjang" value="1" />
        <SubmitButton className="btn btn-ghost border border-line">Perpanjang {hari} hari</SubmitButton>
      </form>
      <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
      <p className="text-[12px] text-muted">Sandbox tanpa webhook lisensi: perubahan berlaku saat mesin sandbox menyala lagi atau pemiliknya menekan Perbarui lisensi.</p>
    </div>
  );
}
