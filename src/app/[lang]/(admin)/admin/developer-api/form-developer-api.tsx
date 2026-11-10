"use client";

import { useActionState, useState } from "react";
import { KeyRound, Unplug } from "lucide-react";
import { cabutKunciAction, lepasInstalasiStafAction, setujuiAction, simpanPengaturanApiAction, tolakAction, ubahAplikasiAction, ubahStatusAction } from "@/app/actions-developer";
import { PilihOpsi } from "@/components/pilih-opsi";
import { Pesan, SubmitButton, TombolKonfirmasi } from "@/components/ui";
import { BATAS_BAWAAN, type BatasApi, type BiayaAplikasi, type BiayaEfektif, type FiturApi, RENTANG_BATAS, fiturPerGrup } from "@/lib/api-def";

const PILIHAN_BIAYA = [
  { id: "ikut_umum", label: "Ikut pengaturan umum" },
  { id: "gratis", label: "Gratis" },
  { id: "berbayar", label: "Berbayar" },
] as const;

/** Centang fitur per aplikasi, per grup. Fitur yang tidak dibagikan (tab Fitur) tampil redup dan tidak bisa dicentang. */
function CentangFitur({ dipilih, diminta, global }: { dipilih: FiturApi[]; diminta?: FiturApi[]; global: FiturApi[] }) {
  return (
    <fieldset>
      <legend className="label">Fitur yang dibuka</legend>
      <div className="mt-1 space-y-3">
        {fiturPerGrup().map((g) => (
          <div key={g.kode}>
            <p className="mb-1.5 text-[11.5px] font-bold tracking-wide text-faint uppercase">{g.label}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {g.fitur.map((f) => {
                const boleh = global.includes(f.kode);
                return (
                  <label
                    key={f.kode}
                    className={`flex items-start gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5 has-checked:border-accent has-checked:bg-accent-soft ${boleh ? "cursor-pointer hover:bg-subtle" : "opacity-50"}`}
                  >
                    <input type="checkbox" name="fitur" value={f.kode} defaultChecked={boleh && dipilih.includes(f.kode)} disabled={!boleh} className="centang mt-0.5" />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-semibold">
                        {f.label}
                        {diminta?.includes(f.kode) && <span className="rounded bg-subtle px-1.5 py-px text-[10.5px] font-bold text-muted uppercase">diminta</span>}
                        {!boleh && <span className="rounded bg-subtle px-1.5 py-px text-[10.5px] font-bold text-muted uppercase">tidak dibagikan</span>}
                      </span>
                      <span className="block text-[12px] leading-snug text-muted">{f.keterangan}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Setujui pengajuan (mode "setujui") atau ubah aplikasi aktif (mode "ubah"): fitur, biaya, harga per bulan, batas.
 * `umum` = sakelar umum saat ini, untuk teks bantu biaya "ikut pengaturan umum".
 */
export function FormKeputusan({
  id,
  mode,
  fitur,
  diminta,
  global,
  biaya,
  harga,
  batas,
  umum,
}: {
  id: number;
  mode: "setujui" | "ubah";
  fitur: FiturApi[];
  diminta?: FiturApi[];
  global: FiturApi[];
  biaya: BiayaAplikasi;
  harga: number | null;
  batas: BatasApi;
  umum: { biaya: BiayaEfektif; harga: number };
}) {
  const [hasil, aksi] = useActionState(mode === "setujui" ? setujuiAction : ubahAplikasiAction, null);
  const [pilihBiaya, setPilihBiaya] = useState<string>(biaya);
  const efektif = pilihBiaya === "ikut_umum" ? umum.biaya : pilihBiaya;
  return (
    <form action={aksi} className="space-y-5">
      <input type="hidden" name="id" value={id} />
      <CentangFitur dipilih={mode === "setujui" && !fitur.includes("dashboard") ? [...fitur, "dashboard"] : fitur} diminta={diminta} global={global} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Biaya</label>
          <PilihOpsi name="biaya" nilai={pilihBiaya} onUbah={setPilihBiaya} opsi={PILIHAN_BIAYA} label="Biaya" />
          <p className="mt-1 text-[12px] text-muted">
            {pilihBiaya === "ikut_umum" ? `Sekarang: ${umum.biaya === "gratis" ? "gratis" : `berbayar Rp${umum.harga.toLocaleString("id-ID")}/bulan`}.` : efektif === "gratis" ? "Tanpa tagihan." : "Developer membayar per 30 hari lewat payment gateway."}
          </p>
        </div>
        <div>
          <label htmlFor={`harga-${id}`} className="label">
            Harga per 30 hari (Rp, opsional)
          </label>
          <input
            id={`harga-${id}`}
            name="harga_bulan"
            type="number"
            min={0}
            step={1000}
            defaultValue={harga ?? ""}
            placeholder={`Bawaan: ${umum.harga.toLocaleString("id-ID")}`}
            disabled={efektif === "gratis"}
            className="field"
          />
        </div>
      </div>
      <fieldset>
        <legend className="label">Batas</legend>
        <div className="mt-1 grid gap-3 sm:grid-cols-2">
          {(Object.keys(RENTANG_BATAS) as (keyof BatasApi)[]).map((k) => {
            const r = RENTANG_BATAS[k];
            return (
              <div key={k}>
                <label htmlFor={`batas-${k}-${id}`} className="text-[12.5px] font-semibold text-muted">
                  {r.label} <span className="font-normal">({r.min}–{r.maks.toLocaleString("id-ID")})</span>
                </label>
                <input id={`batas-${k}-${id}`} name={`batas_${k}`} type="number" min={r.min} max={r.maks} defaultValue={batas[k] ?? BATAS_BAWAAN[k]} className="field mt-1" />
              </div>
            );
          })}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <SubmitButton>{mode === "setujui" ? "Setujui pengajuan" : "Simpan & kirim ke mesin"}</SubmitButton>
        <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
      </div>
    </form>
  );
}

export function FormTolak({ id }: { id: number }) {
  const [hasil, aksi] = useActionState(tolakAction, null);
  return (
    <form action={aksi} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <label htmlFor={`alasan-tolak-${id}`} className="label">
        Alasan penolakan (dikirim ke pengaju)
      </label>
      <textarea id={`alasan-tolak-${id}`} name="alasan" required minLength={5} maxLength={500} rows={3} placeholder="mis. Kegunaan aplikasi belum jelas" className="field" />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <SubmitButton className="btn btn-danger">Tolak pengajuan</SubmitButton>
        <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
      </div>
    </form>
  );
}

/** Tangguhkan / aktifkan lagi / cabut permanen. Alasan wajib kecuali aktifkan. */
export function FormStatus({ id, status }: { id: number; status: "disetujui" | "ditangguhkan" }) {
  const [hasil, aksi] = useActionState(ubahStatusAction, null);
  const [pilih, setPilih] = useState<"tangguhkan" | "aktifkan" | "cabut">(status === "ditangguhkan" ? "aktifkan" : "tangguhkan");
  const opsi = status === "ditangguhkan" ? (["aktifkan", "cabut"] as const) : (["tangguhkan", "cabut"] as const);
  const label = { tangguhkan: "Tangguhkan", aktifkan: "Aktifkan kembali", cabut: "Cabut permanen" } as const;
  return (
    <form action={aksi} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="aksi" value={pilih} />
      <div role="radiogroup" aria-label="Tindakan" className="inline-flex rounded-xl border border-line p-0.5">
        {opsi.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={pilih === o}
            onClick={() => setPilih(o)}
            className={`rounded-[10px] px-3 py-1.5 text-[13px] font-semibold transition-colors ${pilih === o ? "bg-ink text-ink-signal" : "text-muted hover:bg-subtle"}`}
          >
            {label[o]}
          </button>
        ))}
      </div>
      {pilih !== "aktifkan" && (
        <textarea name="alasan" required minLength={3} maxLength={500} rows={2} aria-label="Alasan" placeholder="Alasan (dikirim ke developer)" className="field" />
      )}
      <p className="text-[12px] text-muted">
        {pilih === "cabut"
          ? "Permanen: semua key dicabut dan mesin berhenti melayani. Koneksi WhatsApp di mesin tidak diputus."
          : pilih === "tangguhkan"
            ? "Mesin berhenti melayani API & bot sampai diaktifkan lagi. Koneksi WhatsApp tetap tersambung."
            : "Mesin melayani lagi begitu lisensi baru diterima (dikirim otomatis lewat webhook)."}
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <SubmitButton className={pilih === "aktifkan" ? "btn btn-primary" : "btn btn-danger"}>{label[pilih]}</SubmitButton>
        <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
      </div>
    </form>
  );
}

export function TombolCabutKunci({ id }: { id: number }) {
  return (
    <TombolKonfirmasi
      label="Cabut semua key"
      tanya="Cabut semua key aplikasi ini?"
      className="btn btn-ghost border border-line"
      ikon={<KeyRound className="size-4" aria-hidden />}
      aksi={() => cabutKunciAction(id)}
    />
  );
}

export function TombolLepasStaf({ id, instalasiId }: { id: number; instalasiId: string }) {
  return (
    <TombolKonfirmasi
      label="Lepas"
      tanya="Lepas mesin ini?"
      className="btn btn-ghost border border-line"
      ikon={<Unplug className="size-4" aria-hidden />}
      aksi={() => lepasInstalasiStafAction(id, instalasiId)}
    />
  );
}

/** Sakelar umum: biaya & harga bawaan. Fitur yang dibagikan diatur di tab Fitur (fitur-global.tsx). */
export function FormPengaturanApi({ biaya, harga }: { biaya: BiayaEfektif; harga: number }) {
  const [hasil, aksi] = useActionState(simpanPengaturanApiAction, null);
  const [pilih, setPilih] = useState<string>(biaya);
  return (
    <form action={aksi} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Biaya bawaan</label>
          <PilihOpsi
            name="biaya"
            nilai={pilih}
            onUbah={setPilih}
            opsi={[
              { id: "gratis", label: "Gratis" },
              { id: "berbayar", label: "Berbayar" },
            ]}
            label="Biaya bawaan"
          />
          <p className="mt-1 text-[12px] text-muted">Untuk aplikasi yang biayanya &quot;ikut pengaturan umum&quot;.</p>
        </div>
        <div>
          <label htmlFor="harga-bawaan-api" className="label">
            Harga bawaan per 30 hari (Rp)
          </label>
          <input id="harga-bawaan-api" name="harga" type="number" min={0} step={1000} defaultValue={harga} className="field" />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 border-t border-line pt-4">
        <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
        <SubmitButton>Simpan pengaturan</SubmitButton>
      </div>
    </form>
  );
}
