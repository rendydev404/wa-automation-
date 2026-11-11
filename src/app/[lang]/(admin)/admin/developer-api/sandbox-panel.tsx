"use client";

import { useActionState, useState } from "react";
import { aturFiturSandboxAction, simpanPengaturanSandboxAction, ubahSandboxAction } from "@/app/actions-developer";
import { Pesan, Saklar, SubmitButton } from "@/components/ui";
import { type FiturApi, RENTANG_SANDBOX, fiturPerGrup } from "@/lib/api-def";

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

/**
 * Fitur per pengguna untuk satu sandbox. Bawaan = ikut daftar global (tab Fitur). "Atur khusus" = hanya fitur yang
 * dicentang di sini; fitur yang tidak dibagikan global tetap tertutup. Berlaku saat mesin sandbox menyala lagi atau
 * pemiliknya menekan Perbarui lisensi.
 */
export function FormFiturSandbox({ id, khusus, fitur, global }: { id: number; khusus: boolean; fitur: FiturApi[]; global: FiturApi[] }) {
  const [hasil, aksi] = useActionState(aturFiturSandboxAction, null);
  const [mode, setMode] = useState<"global" | "khusus">(khusus ? "khusus" : "global");
  const [pilih, setPilih] = useState<Set<FiturApi>>(() => new Set(khusus ? fitur.filter((f) => global.includes(f)) : global));
  const grup = fiturPerGrup(global);
  const ubah = (k: FiturApi, v: boolean) =>
    setPilih((s) => {
      const n = new Set(s);
      if (v) n.add(k);
      else n.delete(k);
      return n;
    });
  return (
    <form action={aksi} className="space-y-3 lg:col-span-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="mode" value={mode} />
      {mode === "khusus" && [...pilih].map((k) => <input key={k} type="hidden" name="fitur" value={k} />)}
      <div>
        <p className="text-[13px] font-semibold">Fitur untuk pengguna ini</p>
        <p className="mt-0.5 text-[12px] text-muted">Bawaan mengikuti tab Fitur. Atur khusus untuk membuka sebagian fitur saja bagi akun ini.</p>
      </div>
      <div role="radiogroup" aria-label="Sumber fitur" className="inline-flex rounded-xl border border-line bg-canvas p-0.5 text-[12.5px] font-semibold">
        {(["global", "khusus"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => setMode(m)}
            className={`rounded-lg px-3 py-1.5 transition-colors ${mode === m ? "bg-ink text-ink-fg" : "text-muted hover:text-fg"}`}
          >
            {m === "global" ? `Ikuti global (${global.length})` : `Atur khusus (${mode === "khusus" ? pilih.size : "…"})`}
          </button>
        ))}
      </div>
      {mode === "khusus" &&
        (global.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {grup.map((g) => (
              <fieldset key={g.kode} className="rounded-xl border border-line bg-canvas p-3">
                <legend className="px-1 text-[11.5px] font-semibold tracking-wide text-muted uppercase">{g.label}</legend>
                <div className="space-y-1.5">
                  {g.fitur.map((f) => (
                    <label key={f.kode} className="flex cursor-pointer items-start gap-2 text-[13px]">
                      <input type="checkbox" className="mt-0.5 accent-[var(--accent)]" checked={pilih.has(f.kode)} onChange={(e) => ubah(f.kode, e.target.checked)} />
                      <span>
                        {f.label} <code className="font-mono text-[11px] text-faint">{f.kode}</code>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        ) : (
          <p className="text-[12.5px] text-muted">Belum ada fitur yang dibagikan di tab Fitur.</p>
        ))}
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
        <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
        <SubmitButton className="btn btn-ghost border border-line">Simpan fitur pengguna</SubmitButton>
      </div>
    </form>
  );
}
