"use client";

import { useActionState, useState } from "react";
import { adminHargaAction } from "@/app/actions";
import { Pesan, SubmitButton } from "@/components/ui";
import { METODE_BAYAR, type MetodeBayar, TAMBAHAN_BIAYA_BALASAN, hitungHarga } from "@/lib/harga";

/**
 * Simulasi harga paket: admin menggeser margin & asumsi, tabel modal / untung / harga saran berubah langsung.
 * "Simpan" menyimpan acuan; "Terapkan harga saran" menyimpan acuan lalu server menghitung ulang dan mengubah harga
 * semua paket berbayar (dengan rumus yang sama, src/lib/harga.ts; angka dari browser tidak dipakai).
 */

export interface PaketSimulasi {
  id: number;
  nama: string;
  harga: number;
  durasi_hari: number;
  kuota_nomor: number;
  kuota_balasan: number;
}

const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
const persen = (n: number | null) => (n === null ? "–" : `${(n * 100).toFixed(0)}%`);

export function SimulasiHarga({
  paket,
  model,
  acuan,
}: {
  paket: PaketSimulasi[];
  /** Model yang bisa dipilih + biaya dasar per balasan (USD) dari tarif resmi & profil token nyata. */
  model: { id: string; nama: string; usd: number }[];
  acuan: { margin: number; pemakaian: number; metode: MetodeBayar; biayaServerNomor: number; kurs: number; model: string };
}) {
  const [hasil, aksi] = useActionState(adminHargaAction, null);
  const [margin, setMargin] = useState(acuan.margin);
  const [pemakaian, setPemakaian] = useState(acuan.pemakaian);
  const [metode, setMetode] = useState<MetodeBayar>(acuan.metode);
  const [biayaServer, setBiayaServer] = useState(acuan.biayaServerNomor);
  const [kurs, setKurs] = useState(acuan.kurs);
  const [idModel, setIdModel] = useState(model.some((m) => m.id === acuan.model) ? acuan.model : (model[0]?.id ?? ""));
  const usd = model.find((m) => m.id === idModel)?.usd ?? 0;
  const a = { biayaBalasanUsd: usd, kurs, margin: margin / 100, pemakaian: pemakaian / 100, metode, biayaServerNomor: biayaServer };
  const baris = paket.filter((p) => p.harga > 0).map((p) => ({ p, h: hitungHarga(p, a) }));
  const biayaBalasan = baris[0]?.h.biayaPerBalasan ?? usd * kurs * (1 + TAMBAHAN_BIAYA_BALASAN);

  return (
    <form action={aksi} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label flex justify-between">
            Margin keuntungan target <b className="text-accent tabular-nums">{margin}%</b>
          </span>
          <input type="range" name="margin" min={0} max={90} step={5} value={margin} onChange={(e) => setMargin(Number(e.target.value))} className="w-full accent-[var(--c-accent)]" />
        </label>
        <label className="block">
          <span className="label flex justify-between">
            Kuota balasan yang terpakai <b className="tabular-nums">{pemakaian}%</b>
          </span>
          <input type="range" name="pemakaian" min={10} max={100} step={10} value={pemakaian} onChange={(e) => setPemakaian(Number(e.target.value))} className="w-full accent-[var(--c-accent)]" />
          <span className="text-[11.5px] text-faint">100% = pelanggan menghabiskan kuota (paling aman).</span>
        </label>
        <label className="block">
          <span className="label">Model AI acuan</span>
          <select name="model" value={idModel} onChange={(e) => setIdModel(e.target.value)} className="field">
            {model.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nama} · {rp(m.usd * kurs * (1 + TAMBAHAN_BIAYA_BALASAN))}/balasan
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Metode bayar acuan (biaya Midtrans)</span>
          <select name="metode" value={metode} onChange={(e) => setMetode(e.target.value as MetodeBayar)} className="field">
            {(Object.keys(METODE_BAYAR) as MetodeBayar[]).map((k) => (
              <option key={k} value={k}>
                {METODE_BAYAR[k].label} · {METODE_BAYAR[k].persen ? `${(METODE_BAYAR[k].persen * 100).toLocaleString("id-ID")}%` : ""}
                {METODE_BAYAR[k].persen && METODE_BAYAR[k].tetap ? " + " : ""}
                {METODE_BAYAR[k].tetap ? rp(METODE_BAYAR[k].tetap) : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Biaya server per nomor per bulan (Rp)</span>
          <input type="number" name="biaya_server" min={0} max={1_000_000} value={biayaServer} onChange={(e) => setBiayaServer(Math.max(0, Number(e.target.value) || 0))} className="field" />
        </label>
        <label className="block">
          <span className="label">Kurs USD → Rp</span>
          <input type="number" name="kurs" min={1000} max={100000} value={kurs} onChange={(e) => setKurs(Math.max(1000, Number(e.target.value) || 1000))} className="field" />
        </label>
      </div>

      <p className="text-[12.5px] text-muted">
        Biaya per balasan: <b className="text-fg">{rp(biayaBalasan)}</b> (tarif resmi Anthropic × ±11.700 token per balasan, termasuk tambahan{" "}
        {(TAMBAHAN_BIAYA_BALASAN * 100).toFixed(0)}% untuk foto & tulis-ulang penjaga).
      </p>

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[640px] text-left text-[12.5px]">
          <thead className="bg-subtle/60 text-[11px] font-semibold tracking-wide text-muted uppercase">
            <tr>
              <th className="px-3 py-2.5">Paket</th>
              <th className="px-3 py-2.5 text-right">Modal AI</th>
              <th className="px-3 py-2.5 text-right">Biaya bayar</th>
              <th className="px-3 py-2.5 text-right">Harga sekarang</th>
              <th className="px-3 py-2.5 text-right">Untung</th>
              <th className="px-3 py-2.5 text-right">Margin</th>
              <th className="px-3 py-2.5 text-right">Harga saran</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line tabular-nums">
            {baris.map(({ p, h }) => {
              const kurang = h.margin !== null && h.margin < margin / 100;
              return (
                <tr key={p.id}>
                  <td className="px-3 py-2.5 font-semibold">
                    {p.nama}
                    <span className="block text-[11px] font-normal text-faint">
                      {p.kuota_balasan.toLocaleString("id-ID")} balasan · {p.kuota_nomor} nomor · {p.durasi_hari} hari
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">{rp(h.modal)}</td>
                  <td className="px-3 py-2.5 text-right">{rp(h.biayaBayar)}</td>
                  <td className="px-3 py-2.5 text-right">{rp(p.harga)}</td>
                  <td className={`px-3 py-2.5 text-right ${h.untung < 0 ? "font-bold text-danger" : ""}`}>{rp(h.untung)}</td>
                  <td className={`px-3 py-2.5 text-right font-semibold ${kurang ? "text-danger" : "text-success"}`}>{persen(h.margin)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold">{h.hargaSaran === null ? "margin terlalu tinggi" : rp(h.hargaSaran)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[12px] text-muted">Merah = di bawah margin target. Harga saran dibulatkan ke atas ke Rp1.000.</p>

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton className="btn btn-ghost border border-line">Simpan acuan</SubmitButton>
        <button
          type="submit"
          name="terapkan"
          value="1"
          className="btn btn-primary"
          onClick={(e) => {
            if (!window.confirm(`Ubah harga semua paket berbayar ke harga saran (margin ${margin}%)? Pelanggan yang sedang aktif tidak terpengaruh.`)) e.preventDefault();
          }}
        >
          Terapkan harga saran ke semua paket
        </button>
        <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
      </div>
    </form>
  );
}
