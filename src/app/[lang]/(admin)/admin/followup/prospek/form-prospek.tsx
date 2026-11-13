"use client";

import { useActionState, useState } from "react";
import { adminFollowupProspekAction } from "@/app/actions";
import { PilihOpsi } from "@/components/pilih-opsi";
import { Pesan, Saklar, SubmitButton } from "@/components/ui";
import { BATAS_SETELAN_PROSPEK, type SetelanProspek } from "@/lib/followup-def";
import type { PilihanNomor } from "../form-followup";

/**
 * Pengaturan follow-up prospek: nomor CS pengirim (dipakai bersama follow-up akun), saklar, dan ritme tiap pesan.
 * Jam kirim & batas harian ikut tab Akun gratis.
 */
export function FormProspek({
  awal,
  nomor,
  nomorId,
  otomatisId,
}: {
  awal: SetelanProspek;
  nomor: PilihanNomor[];
  /** Nomor CS yang diatur (null = otomatis). */
  nomorId: number | null;
  /** Nomor yang terpilih bila "Otomatis". */
  otomatisId: number | null;
}) {
  const [hasil, aksi] = useActionState(adminFollowupProspekAction, null);
  const [aktif, setAktif] = useState(awal.aktif);
  const [berubah, setBerubah] = useState(false);
  const [pilihNomor, setPilihNomor] = useState(nomorId ? String(nomorId) : "");
  const otomatis = nomor.find((n) => n.id === otomatisId);
  return (
    <form action={aksi} onChange={() => setBerubah(true)} onSubmit={() => setBerubah(false)} className="space-y-5">
      <div>
        <label htmlFor="fp-nomor" className="label">
          Nomor CS pengirim
        </label>
        <PilihOpsi
          id="fp-nomor"
          name="nomor_id"
          nilai={pilihNomor}
          onUbah={(v) => {
            setPilihNomor(v);
            setBerubah(true);
          }}
          label="Nomor CS pengirim"
          opsi={[
            { id: "", label: "Otomatis", sub: otomatis ? `${otomatis.label}${otomatis.wa_id ? ` · +${otomatis.wa_id}` : ""}` : "Nomor dengan data ChatGerCep otomatis" },
            ...nomor.map((n) => ({ id: String(n.id), label: n.label, sub: n.wa_id ? `+${n.wa_id}` : "Belum tertaut", lencana: n.cg ? "ChatGerCep" : undefined })),
          ]}
        />
        <p className="mt-1 text-[12px] text-muted">Nomor WhatsApp yang mengirim follow-up. Sama dengan nomor di tab Akun gratis: mengubahnya di sini mengubah keduanya.</p>
      </div>
      {aktif && <input type="hidden" name="aktif" value="on" />}
      <div className="flex items-start justify-between gap-4 rounded-2xl border border-line bg-subtle/50 p-4">
        <div>
          <p className="text-[14px] font-bold">Follow-up prospek otomatis</p>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {aktif
              ? "Menyala: lead hangat/panas yang chat duluan lalu diam dibujuk lagi oleh nomor CS."
              : "Mati: tidak ada pesan follow-up prospek yang dikirim."}
          </p>
        </div>
        <Saklar
          aktif={aktif}
          onUbah={(v) => {
            setAktif(v);
            setBerubah(true);
          }}
          label="Follow-up prospek otomatis"
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Isian id="fp-panas" nama="jeda_panas_jam" label="Pesan 1 untuk lead panas (jam diam)" nilai={awal.jedaPanasJam} batas={BATAS_SETELAN_PROSPEK.jedaPanasJam} catatan="Siap bayar tapi berhenti membalas." />
        <Isian id="fp-hangat" nama="jeda_hangat_jam" label="Pesan 1 untuk lead hangat (jam diam)" nilai={awal.jedaHangatJam} batas={BATAS_SETELAN_PROSPEK.jedaHangatJam} catatan="Sudah tanya harga/paket lalu diam." />
        <Isian id="fp-t2" nama="tahap2_jam" label="Pesan 2 setelah pesan 1 (jam)" nilai={awal.tahap2Jam} batas={BATAS_SETELAN_PROSPEK.tahap2Jam} catatan="Nilai & bukti: kerugian, harga per hari." />
        <Isian id="fp-t3" nama="tahap3_jam" label="Pesan 3 setelah pesan 2 (jam)" nilai={awal.tahap3Jam} batas={BATAS_SETELAN_PROSPEK.tahap3Jam} catatan="Pesan pamit + jaminan uang kembali." />
        <Isian id="fp-maks" nama="maks_tahap" label="Jumlah pesan per siklus" nilai={awal.maksTahap} batas={BATAS_SETELAN_PROSPEK.maksTahap} catatan="1–3. Berhenti begitu dibalas." />
      </div>
      <p className="rounded-xl bg-subtle px-3.5 py-2.5 text-[12px] text-muted">
        Nomor CS, jam kirim, batas pesan per hari, jeda acak, dan rem otomatis dipakai bersama dengan follow-up akun gratis (atur di tab Akun gratis).
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <SubmitButton>Simpan</SubmitButton>
        {berubah ? <span className="text-[12.5px] font-semibold text-warning">Belum disimpan</span> : <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>}
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
