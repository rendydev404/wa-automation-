"use client";

import { useActionState, useState } from "react";
import { adminFollowupAction, adminLepasRemFollowupAction } from "@/app/actions";
import { Pesan, Saklar, SubmitButton, TombolKonfirmasi } from "@/components/ui";
import { BATAS_SETELAN, type SetelanFollowup } from "@/lib/followup-def";

export interface PilihanNomor {
  id: number;
  label: string;
  wa_id: string | null;
  cg: boolean;
}

/** Pengaturan follow-up: saklar utama, nomor CS, batas & jam kirim. */
export function FormFollowup({ awal, nomor, otomatisId }: { awal: SetelanFollowup; nomor: PilihanNomor[]; otomatisId: number | null }) {
  const [hasil, aksi] = useActionState(adminFollowupAction, null);
  const [aktif, setAktif] = useState(awal.aktif);
  const otomatis = nomor.find((n) => n.id === otomatisId);
  return (
    <form action={aksi} className="space-y-5">
      {aktif && <input type="hidden" name="aktif" value="on" />}
      <div className="flex items-start justify-between gap-4 rounded-2xl border border-line bg-subtle/50 p-4">
        <div>
          <p className="text-[14px] font-bold">Follow-up otomatis</p>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {aktif
              ? "Menyala: akun gratis yang kuotanya habis disapa nomor CS sesuai aturan di bawah."
              : "Mati: tidak ada pesan follow-up yang dikirim. Antrean tetap tersimpan."}
          </p>
        </div>
        <Saklar aktif={aktif} onUbah={setAktif} label="Follow-up otomatis" />
      </div>

      <div>
        <label htmlFor="fu-nomor" className="label">
          Nomor CS pengirim
        </label>
        <select id="fu-nomor" name="nomor_id" defaultValue={awal.nomorId ?? ""} className="field">
          <option value="">Otomatis{otomatis ? ` (${otomatis.label})` : " (nomor dengan data ChatGerCep otomatis)"}</option>
          {nomor.map((n) => (
            <option key={n.id} value={n.id}>
              {n.label}
              {n.wa_id ? ` · +${n.wa_id}` : " · belum tertaut"}
              {n.cg ? " · data ChatGerCep" : ""}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[12px] text-muted">Follow-up hanya dikirim ke orang yang sudah pernah chat nomor ini.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Isian id="fu-batas" nama="batas_harian" label="Maksimal pesan per hari" nilai={awal.batasHarian} batas={BATAS_SETELAN.batasHarian} catatan="Sapaan + pengingat. Disarankan ≤ 30." />
        <Isian id="fu-tunda" nama="tunda_jam" label="Tunggu setelah kuota habis (jam)" nilai={awal.tundaJam} batas={BATAS_SETELAN.tundaJam} catatan="Kesempatan pengguna chat CS duluan." />
        <Isian id="fu-mulai" nama="jam_mulai" label="Jam kirim mulai (WIB)" nilai={awal.jamMulai} batas={BATAS_SETELAN.jamMulai} />
        <Isian id="fu-selesai" nama="jam_selesai" label="Jam kirim selesai (WIB)" nilai={awal.jamSelesai} batas={BATAS_SETELAN.jamSelesai} />
        <Isian id="fu-ingat" nama="pengingat_hari" label="Pengingat setelah (hari)" nilai={awal.pengingatHari} batas={BATAS_SETELAN.pengingatHari} catatan="Sekali saja bila sapaan tidak dibalas. 0 = tanpa pengingat." />
      </div>
      <p className="rounded-xl bg-subtle px-3.5 py-2.5 text-[12px] text-muted">
        Antarpesan selalu diberi jeda acak 3–10 menit, dan satu akun paling banyak menerima 2 pesan seumur akunnya.
      </p>
      <div className="flex items-center gap-3">
        <SubmitButton>Simpan</SubmitButton>
        <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
      </div>
    </form>
  );
}

function Isian({ id, nama, label, nilai, batas, catatan }: { id: string; nama: string; label: string; nilai: number; batas: readonly [number, number]; catatan?: string }) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input id={id} name={nama} type="number" required min={batas[0]} max={batas[1]} defaultValue={nilai} className="field tabular-nums" />
      {catatan && <p className="mt-1 text-[12px] text-muted">{catatan}</p>}
    </div>
  );
}

export function LepasRem() {
  return <TombolKonfirmasi label="Lepas rem & lanjutkan" tanya="Nomor CS sudah diperiksa?" ya="Ya, lanjutkan" className="btn btn-primary" aksi={adminLepasRemFollowupAction} />;
}
