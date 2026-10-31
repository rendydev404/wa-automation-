"use client";

import { useActionState, useState } from "react";
import { ArrowRight, Lock, Sparkles } from "lucide-react";
import { adminHargaAction } from "@/app/actions";
import { KursInfo } from "@/components/kurs-info";
import { useKursLangsung } from "@/components/kurs-langsung";
import { Pesan, SubmitButton } from "@/components/ui";
import type { InfoKurs } from "@/lib/kurs-def";
import { type AcuanHarga, METODE_BAYAR, type MetodeBayar, TAMBAHAN_BIAYA_BALASAN, hitungHarga, kuotaDariHarga, nomorDariKuota } from "@/lib/harga";

/**
 * Simulasi paket: admin menggeser margin & asumsi, pratinjau kartu paket (harga, kuota balasan, jumlah nomor)
 * berubah langsung. Dua mode:
 * - kunci kuota: kuota balasan tetap, harga dihitung dari modal + margin;
 * - kunci harga: harga tetap, kuota balasan dihitung supaya margin tercapai.
 * Jumlah nomor = kuota balasan / rata-rata balasan per nomor (data nyata 30 hari). "Terapkan" menyimpan acuan lalu
 * server menghitung ulang dengan rumus yang sama (src/lib/harga.ts); angka dari browser tidak dipakai.
 */

export interface PaketSimulasi {
  id: number;
  nama: string;
  harga: number;
  durasi_hari: number;
  kuota_nomor: number;
  kuota_balasan: number;
  unggulan: boolean;
}

export interface DataNyata {
  balasanPerNomorBulan: number;
  nomor: number;
  hari: number;
  puncakHarian: number;
}

type Mode = "kunci-kuota" | "kunci-harga";

const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
const angka = (n: number) => Math.round(n).toLocaleString("id-ID");
const persen = (n: number | null) => (n === null ? "–" : `${(n * 100).toFixed(0)}%`);

/** Hasil simulasi satu paket; sama persis dengan terapkanSimulasi di server. */
function simulasikan(p: PaketSimulasi, a: AcuanHarga, mode: Mode, r: number) {
  let baru: PaketSimulasi;
  if (mode === "kunci-harga") {
    const k = kuotaDariHarga(p.harga, p.durasi_hari, a, r);
    baru = { ...p, kuota_balasan: k.kuotaBalasan, kuota_nomor: k.kuotaNomor };
  } else {
    const kuotaNomor = nomorDariKuota(p.kuota_balasan, p.durasi_hari, r);
    const saran = hitungHarga({ ...p, kuota_nomor: kuotaNomor }, a).hargaSaran;
    baru = { ...p, harga: saran ?? p.harga, kuota_nomor: kuotaNomor };
  }
  const mustahil = mode === "kunci-harga" ? baru.kuota_balasan <= 0 : hitungHarga(p, a).hargaSaran === null;
  // Tidak mungkin mencapai margin target: paket tetap seperti yang admin atur (server melewatinya, tidak menggagalkan).
  if (mustahil) baru = p;
  return { baru, h: hitungHarga(baru, a), sekarang: hitungHarga(p, a), mustahil };
}

function Berubah({ lama, baru, f }: { lama: number; baru: number; f: (n: number) => string }) {
  if (lama === baru) return <>{f(baru)}</>;
  return (
    <>
      <s className="mr-1 text-[0.8em] font-normal text-faint">{f(lama)}</s>
      {f(baru)}
    </>
  );
}

export function SimulasiHarga({
  paket,
  model,
  acuan,
  nyata,
  kursInfo,
}: {
  paket: PaketSimulasi[];
  /** Model yang bisa dipilih + biaya dasar per balasan (USD) dari tarif resmi & profil token nyata. */
  model: { id: string; nama: string; usd: number }[];
  acuan: { margin: number; pemakaian: number; metode: MetodeBayar; biayaServerNomor: number; kurs: number; model: string };
  nyata: DataNyata;
  /** Kurs pasar otomatis (kurs.ts): hanya dibaca, tidak bisa diisi manual; diperbarui terus selama halaman terbuka. */
  kursInfo: InfoKurs;
}) {
  const [hasil, aksi] = useActionState(adminHargaAction, null);
  const [mode, setMode] = useState<Mode>("kunci-kuota");
  const [margin, setMargin] = useState(acuan.margin);
  const [pemakaian, setPemakaian] = useState(acuan.pemakaian);
  const [metode, setMetode] = useState<MetodeBayar>(acuan.metode);
  const [biayaServer, setBiayaServer] = useState(acuan.biayaServerNomor);
  const k = useKursLangsung(kursInfo);
  const kurs = k.info.kurs;
  const [idModel, setIdModel] = useState(model.some((m) => m.id === acuan.model) ? acuan.model : (model[0]?.id ?? ""));
  // Paket yang ikut diterapkan; yang tidak dicentang tidak disentuh (harga & kuotanya tetap seperti yang admin atur).
  const [ikut, setIkut] = useState<Set<number>>(() => new Set(paket.filter((p) => p.harga > 0).map((p) => p.id)));
  const ubahIkut = (id: number, nyala: boolean) =>
    setIkut((s) => {
      const n = new Set(s);
      if (nyala) n.add(id);
      else n.delete(id);
      return n;
    });
  const usd = model.find((m) => m.id === idModel)?.usd ?? 0;
  const a: AcuanHarga = { biayaBalasanUsd: usd, kurs, margin: margin / 100, pemakaian: pemakaian / 100, metode, biayaServerNomor: biayaServer };
  const r = nyata.balasanPerNomorBulan;
  const baris = paket.filter((p) => p.harga > 0).map((p) => ({ p, ...simulasikan(p, a, mode, r) }));
  const biayaBalasan = usd * kurs * (1 + TAMBAHAN_BIAYA_BALASAN);

  return (
    <form action={aksi} className="space-y-5">
      <input type="hidden" name="mode" value={mode} />
      {[...ikut].map((id) => (
        <input key={id} type="hidden" name="ikut" value={id} />
      ))}

      <div className="rounded-xl border border-line bg-subtle/40 p-4 text-[12.5px] text-muted">
        <p className="font-semibold text-fg">Data nyata 30 hari terakhir</p>
        {nyata.nomor ? (
          <p className="mt-1">
            {angka(nyata.nomor)} nomor aktif dibalas AI selama {nyata.hari} hari: rata-rata <b className="text-fg">{angka(r / 30)} balasan/hari per nomor</b> (±{angka(r)}/bulan),
            terbanyak {angka(nyata.puncakHarian)} dalam sehari. Biaya satu balasan <b className="text-fg">{rp(biayaBalasan)}</b> (tarif resmi Anthropic × ±11.700 token nyata per balasan,
            plus {(TAMBAHAN_BIAYA_BALASAN * 100).toFixed(0)}% untuk foto & tulis-ulang penjaga).
          </p>
        ) : (
          <p className="mt-1">Belum ada balasan AI tercatat; dipakai asumsi {angka(r)} balasan per nomor per bulan (±30/hari).</p>
        )}
        <p className="mt-1">Jumlah nomor di setiap paket = kuota balasan ÷ pemakaian rata-rata satu nomor, jadi nomor tambahan tidak membuat paket rugi.</p>
      </div>

      <div className="inline-flex rounded-xl border border-line p-1 text-[12.5px] font-semibold" role="radiogroup" aria-label="Mode simulasi">
        {(
          [
            ["kunci-kuota", "Kuota tetap → hitung harga"],
            ["kunci-harga", "Harga tetap → hitung kuota"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={mode === k}
            onClick={() => setMode(k)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors ${mode === k ? "bg-accent text-white" : "text-muted hover:text-fg"}`}
          >
            <Lock className="size-3.5" aria-hidden /> {label}
          </button>
        ))}
      </div>

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
        <KursInfo info={k.info} segarkan={k.segarkan} sedang={k.sedang} galat={k.galat} />
      </div>

      <div>
        <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold tracking-wide text-muted uppercase">
          <Sparkles className="size-3.5 text-accent" aria-hidden /> Pratinjau paket (seperti dilihat pelanggan)
        </p>
        <p className="mb-3 text-[12px] text-muted">
          Simulasi hanya saran. Harga tiap paket bebas kamu atur sendiri di &quot;Rincian paket&quot; di bawah. Centang paket yang mau ikut dihitung ulang; yang tidak dicentang tidak disentuh.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {baris.map(({ p, baru, h, mustahil }) => (
            <div key={p.id} className={`rounded-2xl border p-4 ${p.unggulan ? "border-accent/50 bg-accent-soft/20" : "border-line bg-surface"}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[14px] font-bold">{p.nama}</p>
                <span className="flex items-center gap-2">
                  {p.unggulan && <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-accent">unggulan</span>}
                  <label className="flex cursor-pointer items-center gap-1 text-[11.5px] font-medium text-muted">
                    <input type="checkbox" checked={ikut.has(p.id)} onChange={(e) => ubahIkut(p.id, e.target.checked)} className="size-3.5 accent-[var(--c-accent)]" />
                    ikut
                  </label>
                </span>
              </div>
              {mustahil && (
                <p className="mt-2 text-[12px] font-medium text-warning">
                  {mode === "kunci-harga" ? `Harga ${rp(p.harga)} di bawah margin ${margin}%` : "Margin + biaya bayar mencapai 100%"}: paket ini tidak diubah, tetap dijual seperti yang kamu atur.
                </p>
              )}
                <>
                  <p className="mt-2 text-[22px] font-extrabold tracking-tight tabular-nums">
                    <Berubah lama={p.harga} baru={baru.harga} f={rp} />
                    <span className="text-[12px] font-medium text-muted"> / {p.durasi_hari} hari</span>
                  </p>
                  <ul className="mt-3 space-y-1.5 text-[12.5px] tabular-nums">
                    <li>
                      <b>
                        <Berubah lama={p.kuota_balasan} baru={baru.kuota_balasan} f={angka} />
                      </b>{" "}
                      balasan AI <span className="text-faint">(±{angka(baru.kuota_balasan / p.durasi_hari)}/hari)</span>
                    </li>
                    <li>
                      <b>
                        <Berubah lama={p.kuota_nomor} baru={baru.kuota_nomor} f={angka} />
                      </b>{" "}
                      nomor WhatsApp
                    </li>
                  </ul>
                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 text-[11.5px] text-muted tabular-nums">
                    <span>
                      Modal
                      <b className="block text-[12.5px] text-fg">{rp(h.modal)}</b>
                    </span>
                    <span>
                      Untung
                      <b className={`block text-[12.5px] ${h.untung < 0 ? "text-danger" : "text-success"}`}>{rp(h.untung)}</b>
                    </span>
                    <span>
                      Margin
                      <b className={`block text-[12.5px] ${h.margin !== null && h.margin < margin / 100 - 0.005 ? "text-danger" : "text-success"}`}>{persen(h.margin)}</b>
                    </span>
                  </div>
                </>
            </div>
          ))}
        </div>
      </div>

      <details className="rounded-xl border border-line">
        <summary className="cursor-pointer px-3 py-2.5 text-[12.5px] font-semibold text-muted">Rincian paket saat ini (tanpa perubahan)</summary>
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full min-w-[640px] text-left text-[12.5px]">
            <thead className="bg-subtle/60 text-[11px] font-semibold tracking-wide text-muted uppercase">
              <tr>
                <th className="px-3 py-2.5">Paket</th>
                <th className="px-3 py-2.5 text-right">Modal</th>
                <th className="px-3 py-2.5 text-right">Biaya bayar</th>
                <th className="px-3 py-2.5 text-right">Harga</th>
                <th className="px-3 py-2.5 text-right">Untung</th>
                <th className="px-3 py-2.5 text-right">Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line tabular-nums">
              {baris.map(({ p, sekarang: s }) => (
                <tr key={p.id}>
                  <td className="px-3 py-2.5 font-semibold">
                    {p.nama}
                    <span className="block text-[11px] font-normal text-faint">
                      {angka(p.kuota_balasan)} balasan · {p.kuota_nomor} nomor · {p.durasi_hari} hari
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">{rp(s.modal)}</td>
                  <td className="px-3 py-2.5 text-right">{rp(s.biayaBayar)}</td>
                  <td className="px-3 py-2.5 text-right">{rp(p.harga)}</td>
                  <td className={`px-3 py-2.5 text-right ${s.untung < 0 ? "font-bold text-danger" : ""}`}>{rp(s.untung)}</td>
                  <td className={`px-3 py-2.5 text-right font-semibold ${s.margin !== null && s.margin < margin / 100 ? "text-danger" : "text-success"}`}>{persen(s.margin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton className="btn btn-ghost border border-line">Simpan acuan</SubmitButton>
        <button
          type="submit"
          name="terapkan"
          value="1"
          className="btn btn-primary h-auto min-h-[2.375rem] max-w-full py-2 text-center whitespace-normal"
          onClick={(e) => {
            const teks = mode === "kunci-harga" ? `kuota balasan & nomor paket yang dicentang dihitung ulang (harga tetap)` : `harga & jumlah nomor paket yang dicentang dihitung ulang (kuota balasan tetap)`;
            if (!window.confirm(`Terapkan simulasi margin ${margin}%: ${teks}? Pelanggan yang sedang aktif tidak terpengaruh.`)) e.preventDefault();
          }}
        >
          Terapkan ke paket yang dicentang <ArrowRight className="size-4" aria-hidden />
        </button>
        <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
      </div>
    </form>
  );
}
