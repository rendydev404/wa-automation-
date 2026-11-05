"use client";

import { useActionState, useState } from "react";
import { adminAturanAction } from "@/app/actions";
import { Pesan, SubmitButton } from "@/components/ui";
import { ATURAN_ANGKA, type AturanSistem, type KunciAngka, MAKS_ATURAN_GLOBAL } from "@/lib/aturan-def";

const CONTOH_GLOBAL = [
  "Jangan pernah menjanjikan diskon atau gratis ongkir kecuali tertulis di base knowledge.",
  "Jangan membahas politik, agama, atau SARA; arahkan kembali ke produk dengan sopan.",
  "Bila pelanggan marah atau mengancam, minta maaf singkat dan bilang tim kami akan membalas langsung di chat ini.",
  "Selalu tutup jawaban yang berisi harga dengan ajakan memesan.",
];

/** Kelompok tampilan; urutan sama dengan formulir. */
const KELOMPOK: { judul: string; ket: string; angka: KunciAngka[] }[] = [
  { judul: "Biaya & panjang balasan", ket: "Pagar biaya per balasan di Claude API.", angka: ["maks_token_balasan"] },
  { judul: "Peringatan di workspace pengguna", ket: "Peringatan base knowledge selalu tampil selama ada nomor yang belum diisi; ambang peringatan kuota tetap bisa diatur.", angka: ["peringatan_kuota_persen"] },
];

export function FormAturan({ nilai }: { nilai: AturanSistem }) {
  const [hasil, aksi] = useActionState(adminAturanAction, null);
  const [global, setGlobal] = useState(nilai.aturan_global);

  return (
    <form action={aksi} className="space-y-6">
      {KELOMPOK.map((k) => (
        <fieldset key={k.judul} className="rounded-xl border border-line p-4">
          <legend className="px-1.5 text-[13.5px] font-bold">{k.judul}</legend>
          <p className="text-[12.5px] text-muted">{k.ket}</p>
          <div className="mt-3 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {k.angka.map((a) => {
                const d = ATURAN_ANGKA[a];
                return (
                  <label key={a} className="block">
                    <span className="label">{d.label}</span>
                    <span className="flex items-center gap-2">
                      <input name={a} type="number" min={d.min} max={d.max} defaultValue={nilai[a]} required className="field" />
                      <span className="shrink-0 text-[12px] text-muted">{d.satuan}</span>
                    </span>
                    <span className="mt-1 block text-[11.5px] text-faint">
                      {d.bantu} Bawaan {d.bawaan.toLocaleString("id-ID")}, batas {d.min.toLocaleString("id-ID")}–{d.max.toLocaleString("id-ID")}.
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </fieldset>
      ))}

      <fieldset className="rounded-xl border border-line p-4">
        <legend className="px-1.5 text-[13.5px] font-bold">Aturan untuk semua bot</legend>
        <p className="text-[12.5px] text-muted">
          Ditambahkan ke setiap balasan AI di semua nomor dan semua akun, di atas instruksi masing-masing nomor. Tulis satu aturan per baris, kalimat perintah yang jelas. Aturan anti-halu
          (tidak mengarang harga, tidak mengaku manusia, tidak menjanjikan hal di luar data) sudah selalu aktif dan tidak bisa dimatikan dari sini.
        </p>
        <textarea
          name="aturan_global"
          value={global}
          onChange={(e) => setGlobal(e.target.value)}
          maxLength={MAKS_ATURAN_GLOBAL}
          rows={7}
          placeholder={CONTOH_GLOBAL.join("\n")}
          className="field mt-3 font-mono text-[12.5px]"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-faint">
          <span>
            {global.length.toLocaleString("id-ID")} / {MAKS_ATURAN_GLOBAL.toLocaleString("id-ID")} karakter
          </span>
          <span className="flex flex-wrap gap-1.5">
            {CONTOH_GLOBAL.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setGlobal((g) => (g.includes(c) ? g : `${g.trim()}${g.trim() ? "\n" : ""}${c}`))}
                className="rounded-md border border-line px-2 py-1 text-muted hover:border-accent/50 hover:text-fg"
                title={c}
              >
                + {c.split(" ").slice(0, 4).join(" ")}…
              </button>
            ))}
          </span>
        </div>
      </fieldset>

      <div className="flex items-center gap-3">
        <SubmitButton>Simpan aturan sistem</SubmitButton>
        <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
      </div>
    </form>
  );
}
