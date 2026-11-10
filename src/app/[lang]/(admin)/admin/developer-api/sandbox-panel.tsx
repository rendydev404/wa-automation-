"use client";

import { useActionState, useState } from "react";
import { simpanPengaturanSandboxAction, ubahSandboxAction } from "@/app/actions-developer";
import { Pesan, Saklar, SubmitButton } from "@/components/ui";
import { RENTANG_SANDBOX } from "@/lib/api-def";

/** Pengaturan umum sandbox: sakelar, masa key, port dashboard mesin. */
export function FormPengaturanSandbox({ aktif, hari, port }: { aktif: boolean; hari: number; port: number }) {
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
          <label htmlFor="sandbox-port" className="label">
            Port dashboard mesin sandbox
          </label>
          <input id="sandbox-port" name="port" type="number" min={RENTANG_SANDBOX.port.min} max={RENTANG_SANDBOX.port.maks} defaultValue={port} className="field" />
          <p className="mt-1 text-[12px] text-muted">Ditulis ke .env sandbox (PORT_MESIN). Developer membuka http://localhost:{port} untuk scan QR nomor bot.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 border-t border-line pt-4">
        <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
        <SubmitButton>Simpan pengaturan sandbox</SubmitButton>
      </div>
    </form>
  );
}

/** Perpanjang masa satu sandbox. */
export function FormUbahSandbox({ id, hari }: { id: number; hari: number }) {
  const [hasil, aksi] = useActionState(ubahSandboxAction, null);
  return (
    <div className="space-y-3">
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
