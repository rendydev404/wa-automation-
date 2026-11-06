"use client";

import { useActionState } from "react";
import { adminAntrekanFollowupAction, adminTautChatCsAction } from "@/app/actions";
import { Pesan, SubmitButton, TombolKonfirmasi } from "@/components/ui";

/** Isian nomor WA follow-up (fallback bila nomor yang chat CS berbeda dari nomor yang di-scan). */
export function FormTautChatCs({ id, manual }: { id: number; manual: string | null }) {
  const [hasil, aksi] = useActionState(adminTautChatCsAction, null);
  return (
    <form action={aksi} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <label htmlFor="fu-nomor-akun" className="label">
        Nomor WA follow-up (manual)
      </label>
      <div className="flex gap-2">
        <input id="fu-nomor-akun" name="nomor" inputMode="tel" defaultValue={manual ?? ""} placeholder="0812xxxx yang pernah chat CS" className="field tabular-nums" />
        <SubmitButton>Simpan</SubmitButton>
      </div>
      <p className="text-[12px] text-muted">Wajib nomor yang sudah pernah chat nomor CS. Kosongkan lalu Simpan = pakai pencocokan otomatis.</p>
      <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
    </form>
  );
}

export function AntrekanUlang({ id }: { id: number }) {
  return <TombolKonfirmasi label="Antrekan ulang" tanya="Antrekan follow-up lagi?" ya="Ya" className="btn btn-ghost" aksi={() => adminAntrekanFollowupAction(id)} />;
}
