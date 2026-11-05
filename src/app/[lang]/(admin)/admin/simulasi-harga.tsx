"use client";

import { useActionState, useState } from "react";
import { ArrowRight, Check, Lock, Share2, Sparkles } from "lucide-react";
import { adminHargaAction } from "@/app/actions";
import { KursInfo } from "@/components/kurs-info";
import { useKursLangsung } from "@/components/kurs-langsung";
import { PilihModel } from "@/components/pilih-model";
import { PilihOpsi } from "@/components/pilih-opsi";
import { Pesan, Saklar, SubmitButton } from "@/components/ui";
import { hitungKomisiPaket, type JenisKomisi, labelKomisiPaket } from "@/lib/afiliasi-def";
import type { InfoKurs } from "@/lib/kurs-def";
import { type AcuanHarga, METODE_BAYAR, type MetodeBayar, TAMBAHAN_BIAYA_BALASAN, hargaMinimal, hitungHarga, kuotaDariHarga, nomorDariKuota, sisaBersih, teksTarif } from "@/lib/harga";

/**
 * Simulasi paket: admin menggeser margin, asumsi biaya, dan komisi afiliasi (bisa Semua Paket sekaligus atau Per Paket).
 * Pratinjau kartu paket (harga, kuota balasan, jumlah nomor, modal, komisi afiliasi, untung normal, dan untung bersih setelah komisi)
 * berubah langsung secara real-time.
 */

export interface PaketSimulasi {
  id: number;
  nama: string;
  harga: number;
  durasi_hari: number;
  kuota_nomor: number;
  kuota_balasan: number;
  unggulan: boolean;
  komisi_jenis: JenisKomisi;
  komisi_nilai: number;
}

export interface DataNyata {
  balasanPerNomorBulan: number;
  nomor: number;
  hari: number;
  puncakHarian: number;
}

export interface SetelanKomisiPaket {
  jenis: JenisKomisi;
  nilai: number;
}

type Mode = "kunci-kuota" | "kunci-harga";
type ModeKomisi = "semua" | "per-paket";

const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
const angka = (n: number) => Math.round(n).toLocaleString("id-ID");
const persen = (n: number | null) => (n === null ? "–" : `${(n * 100).toFixed(0)}%`);

const OPSI_METODE = (Object.keys(METODE_BAYAR) as MetodeBayar[]).map((k) => ({ id: k, label: `${METODE_BAYAR[k].label} · ${teksTarif(k)}` }));

const CHIP_KOMISI_PERSEN = [0, 10, 15, 20, 25, 30];

/**
 * Hitung simulasi satu paket dengan memperhitungkan komisi afiliasi.
 * Jika `masukkanKomisiKeTarget` = true, maka harga saran / kuota saran dihitung sedemikian rupa sehingga
 * keuntungan bersih SETELAH dipotong komisi afiliasi tetap mencapai margin target.
 */
function simulasikan(
  p: PaketSimulasi,
  a: AcuanHarga,
  mode: Mode,
  r: number,
  komisi: SetelanKomisiPaket,
  masukkanKomisiKeTarget: boolean
) {
  const kPersen = masukkanKomisiKeTarget && komisi.jenis === "persen" ? komisi.nilai / 100 : 0;
  const kTetap = masukkanKomisiKeTarget && komisi.jenis === "rupiah" ? komisi.nilai : 0;

  let baru: PaketSimulasi;
  let mustahil = false;

  if (mode === "kunci-harga") {
    if (!masukkanKomisiKeTarget) {
      const k = kuotaDariHarga(p.harga, p.durasi_hari, a, r);
      baru = { ...p, kuota_balasan: k.kuotaBalasan, kuota_nomor: k.kuotaNomor };
    } else {
      const bersih = sisaBersih(p.harga, a.margin + kPersen, a.metode) - kTetap;
      const perBalasan =
        a.biayaBalasanUsd * a.kurs * (1 + TAMBAHAN_BIAYA_BALASAN) * a.pemakaian +
        (r > 0 ? a.biayaServerNomor / r : 0);
      const kuotaBalasan = bersih > 0 && perBalasan > 0 ? Math.floor(bersih / perBalasan / 50) * 50 : 0;
      const kuotaNomor = nomorDariKuota(kuotaBalasan, p.durasi_hari, r);
      baru = { ...p, kuota_balasan: kuotaBalasan, kuota_nomor: kuotaNomor };
    }
    mustahil = baru.kuota_balasan <= 0;
  } else {
    const kuotaNomor = nomorDariKuota(p.kuota_balasan, p.durasi_hari, r);
    const dasar = hitungHarga({ ...p, kuota_nomor: kuotaNomor }, a);
    if (!masukkanKomisiKeTarget) {
      baru = { ...p, harga: dasar.hargaSaran ?? p.harga, kuota_nomor: kuotaNomor };
      mustahil = dasar.hargaSaran === null;
    } else {
      const hargaPas = hargaMinimal(dasar.modal + kTetap, a.margin + kPersen, a.metode);
      const hargaSaran = hargaPas === null ? null : Math.max(1_000, Math.ceil(hargaPas / 1_000) * 1_000);
      baru = { ...p, harga: hargaSaran ?? p.harga, kuota_nomor: kuotaNomor };
      mustahil = hargaSaran === null;
    }
  }

  if (mustahil) baru = p;

  const h = hitungHarga(baru, a);
  const sekarang = hitungHarga(p, a);

  const komisiSimulasi = hitungKomisiPaket(baru.harga, komisi.jenis, komisi.nilai);
  const untungSetelahKomisi = h.untung - komisiSimulasi;
  const marginSetelahKomisi = baru.harga > 0 ? untungSetelahKomisi / baru.harga : null;

  const komisiSekarang = hitungKomisiPaket(p.harga, komisi.jenis, komisi.nilai);
  const untungSekarangSetelahKomisi = sekarang.untung - komisiSekarang;
  const marginSekarangSetelahKomisi = p.harga > 0 ? untungSekarangSetelahKomisi / p.harga : null;

  return {
    baru,
    h,
    sekarang,
    mustahil,
    komisiSimulasi,
    untungSetelahKomisi,
    marginSetelahKomisi,
    komisiSekarang,
    untungSekarangSetelahKomisi,
    marginSekarangSetelahKomisi,
  };
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
  model: { id: string; nama: string; usd: number; masuk: number; keluar: number }[];
  acuan: { margin: number; pemakaian: number; metode: MetodeBayar; biayaServerNomor: number; kurs: number; model: string };
  nyata: DataNyata;
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

  // --- State Komisi Afiliasi (Bisa Semua Paket atau Per Paket) ---
  const paketBerbayar = paket.filter((p) => p.harga > 0);
  const semuaSamaAwal =
    paketBerbayar.length > 0 &&
    paketBerbayar.every(
      (p) => p.komisi_jenis === paketBerbayar[0].komisi_jenis && p.komisi_nilai === paketBerbayar[0].komisi_nilai
    );

  const [modeKomisi, setModeKomisi] = useState<ModeKomisi>(semuaSamaAwal ? "semua" : "per-paket");
  const [komisiGlobalJenis, setKomisiGlobalJenis] = useState<JenisKomisi>(paketBerbayar[0]?.komisi_jenis ?? "persen");
  const [komisiGlobalNilai, setKomisiGlobalNilai] = useState<number>(paketBerbayar[0]?.komisi_nilai ?? 20);
  const [komisiPerPaket, setKomisiPerPaket] = useState<Record<number, SetelanKomisiPaket>>(() =>
    Object.fromEntries(paket.map((p) => [p.id, { jenis: p.komisi_jenis, nilai: p.komisi_nilai }]))
  );
  const [masukkanKomisiKeTarget, setMasukkanKomisiKeTarget] = useState(false);

  const ambilKomisiPaket = (id: number): SetelanKomisiPaket => {
    if (modeKomisi === "semua") {
      return { jenis: komisiGlobalJenis, nilai: komisiGlobalNilai };
    }
    return komisiPerPaket[id] ?? { jenis: "persen", nilai: 20 };
  };

  const ubahKomisiSatuPaket = (id: number, patch: Partial<SetelanKomisiPaket>) => {
    setKomisiPerPaket((lama) => {
      const skrg = lama[id] ?? { jenis: "persen", nilai: 20 };
      const jenisBaru = patch.jenis ?? skrg.jenis;
      let nilaiBaru = patch.nilai ?? skrg.nilai;
      if (patch.jenis && patch.jenis !== skrg.jenis) {
        nilaiBaru = patch.jenis === "persen" ? 20 : 25_000;
      }
      return { ...lama, [id]: { jenis: jenisBaru, nilai: Math.max(0, nilaiBaru) } };
    });
  };

  const gantiModeKomisi = (baru: ModeKomisi) => {
    if (baru === "per-paket" && modeKomisi === "semua") {
      // Salin nilai global saat ini ke semua paket sebagai titik awal per-paket
      setKomisiPerPaket(
        Object.fromEntries(paket.map((p) => [p.id, { jenis: komisiGlobalJenis, nilai: komisiGlobalNilai }]))
      );
    }
    setModeKomisi(baru);
  };

  // Paket yang ikut diterapkan
  const [ikut, setIkut] = useState<Set<number>>(() => new Set(paketBerbayar.map((p) => p.id)));
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

  const baris = paketBerbayar.map((p) => {
    const kom = ambilKomisiPaket(p.id);
    return {
      p,
      kom,
      ...simulasikan(p, a, mode, r, kom, masukkanKomisiKeTarget),
    };
  });

  const biayaBalasan = usd * kurs * (1 + TAMBAHAN_BIAYA_BALASAN);

  // Data komisi yang dikirim ke server saat disimpan/diterapkan
  const jsonKomisi = JSON.stringify(
    Object.fromEntries(paketBerbayar.map((p) => [p.id, ambilKomisiPaket(p.id)]))
  );

  return (
    <form action={aksi} className="space-y-5">
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="masukkan_komisi" value={masukkanKomisiKeTarget ? "1" : "0"} />
      <input type="hidden" name="komisi_paket_json" value={jsonKomisi} />
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

      <div className="grid w-full grid-cols-2 rounded-xl border border-line p-1 text-[12.5px] font-semibold sm:inline-flex sm:w-auto" role="radiogroup" aria-label="Mode simulasi">
        {(
          [
            ["kunci-kuota", "Kuota tetap → hitung harga"],
            ["kunci-harga", "Harga tetap → hitung kuota"],
          ] as const
        ).map(([kMode, label]) => (
          <button
            key={kMode}
            type="button"
            role="radio"
            aria-checked={mode === kMode}
            onClick={() => setMode(kMode)}
            className={`flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left leading-tight transition-colors sm:px-3 ${mode === kMode ? "bg-accent text-white" : "text-muted hover:text-fg"}`}
          >
            <Lock className="size-3.5 shrink-0" aria-hidden /> {label}
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
        <div>
          <label htmlFor="sim-model" className="label">
            Model AI acuan
          </label>
          <PilihModel
            id="sim-model"
            name="model"
            nilai={idModel}
            onUbah={setIdModel}
            label="Model AI acuan"
            opsi={model.map((m) => ({ id: m.id, nama: m.nama, rpBalasan: m.usd * kurs * (1 + TAMBAHAN_BIAYA_BALASAN), masuk: m.masuk, keluar: m.keluar }))}
          />
        </div>
        <div>
          <label htmlFor="sim-metode" className="label">
            Metode bayar acuan (biaya Midtrans)
          </label>
          <PilihOpsi
            id="sim-metode"
            name="metode"
            nilai={metode}
            onUbah={(v) => setMetode(v as MetodeBayar)}
            opsi={OPSI_METODE}
            label="Metode bayar acuan"
          />
        </div>
        <label className="block">
          <span className="label">Biaya server per nomor per bulan (Rp)</span>
          <input type="number" name="biaya_server" min={0} max={1_000_000} value={biayaServer} onChange={(e) => setBiayaServer(Math.max(0, Number(e.target.value) || 0))} className="field" />
        </label>
        <KursInfo info={k.info} segarkan={k.segarkan} sedang={k.sedang} galat={k.galat} />
      </div>

      {/* ---------- Panel Perhitungan & Pengaturan Komisi Afiliasi ---------- */}
      <div className="rounded-2xl border border-line bg-subtle/30 p-3 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-[13.5px] font-bold text-fg">
              <Share2 className="size-4 text-accent" aria-hidden /> Perhitungan & Pengaturan Komisi Afiliasi
            </p>
            <p className="mt-0.5 text-[12px] text-muted">
              Atur komisi untuk semua paket sekaligus atau berbeda-beda tiap paket, lalu lihat langsung dampaknya ke modal, komisi, dan untung bersih.
            </p>
          </div>

          <div className="inline-flex rounded-xl border border-line bg-surface p-1 text-[12px] font-semibold" role="radiogroup" aria-label="Mode pengaturan komisi">
            <button
              type="button"
              role="radio"
              aria-checked={modeKomisi === "semua"}
              onClick={() => gantiModeKomisi("semua")}
              className={`rounded-lg px-3 py-1.5 transition-colors ${modeKomisi === "semua" ? "bg-accent text-on-accent" : "text-muted hover:text-fg"}`}
            >
              Semua paket sama
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={modeKomisi === "per-paket"}
              onClick={() => gantiModeKomisi("per-paket")}
              className={`rounded-lg px-3 py-1.5 transition-colors ${modeKomisi === "per-paket" ? "bg-accent text-on-accent" : "text-muted hover:text-fg"}`}
            >
              Atur per paket
            </button>
          </div>
        </div>

        {modeKomisi === "semua" ? (
          <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-[220px_minmax(0,1fr)] sm:items-center">
            <div>
              <span className="label">Jenis komisi semua paket</span>
              <div className="inline-flex w-full rounded-xl border border-line bg-surface p-1 text-[12px] font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setKomisiGlobalJenis("persen");
                    if (komisiGlobalNilai > 100) setKomisiGlobalNilai(20);
                  }}
                  className={`flex-1 rounded-lg py-1.5 transition-colors ${komisiGlobalJenis === "persen" ? "bg-accent text-on-accent" : "text-muted hover:text-fg"}`}
                >
                  Persen (%)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setKomisiGlobalJenis("rupiah");
                    if (komisiGlobalNilai <= 100) setKomisiGlobalNilai(25_000);
                  }}
                  className={`flex-1 rounded-lg py-1.5 transition-colors ${komisiGlobalJenis === "rupiah" ? "bg-accent text-on-accent" : "text-muted hover:text-fg"}`}
                >
                  Nominal (Rp)
                </button>
              </div>
            </div>

            {komisiGlobalJenis === "persen" ? (
              <div>
                <div className="flex items-center justify-between text-[12.5px]">
                  <span className="font-semibold text-fg">Besaran komisi afiliasi (semua paket)</span>
                  <b className="text-[14px] text-accent tabular-nums">{komisiGlobalNilai}% dari harga paket</b>
                </div>
                <input
                  type="range"
                  min={0}
                  max={60}
                  step={1}
                  value={Math.min(60, komisiGlobalNilai)}
                  onChange={(e) => setKomisiGlobalNilai(Number(e.target.value))}
                  className="mt-2 w-full accent-[var(--c-accent)]"
                />
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {CHIP_KOMISI_PERSEN.map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setKomisiGlobalNilai(pct)}
                      className={`rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold tabular-nums transition-colors ${
                        komisiGlobalNilai === pct ? "border-accent bg-accent text-on-accent" : "border-line bg-surface text-muted hover:text-fg"
                      }`}
                    >
                      {pct === 0 ? "0% (Tanpa komisi)" : `${pct}%`}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <label htmlFor="sim-komisi-rp" className="label">
                  Nominal komisi tetap untuk semua paket (Rp)
                </label>
                <input
                  id="sim-komisi-rp"
                  type="number"
                  min={0}
                  max={100_000_000}
                  step={1000}
                  value={komisiGlobalNilai}
                  onChange={(e) => setKomisiGlobalNilai(Math.max(0, Number(e.target.value) || 0))}
                  className="field max-w-xs tabular-nums"
                />
              </div>
            )}
          </div>
        ) : (
          <p className="mt-3 border-t border-line pt-3 text-[12px] text-muted">
            Mode <b className="text-fg">Atur per paket</b> aktif: silakan ubah persentase (<b className="text-fg">%</b>) atau nominal (<b className="text-fg">Rp</b>) komisi langsung pada masing-masing kartu paket di bawah ini.
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5">
          <div>
            <p className="text-[12.5px] font-semibold text-fg">
              Masukkan komisi afiliasi ke dalam target margin harga/kuota
            </p>
            <p className="text-[11.5px] text-muted">
              {masukkanKomisiKeTarget
                ? "Aktif: Harga/kuota dihitung agar setelah dipotong Modal + Biaya Bayar + Komisi Afiliasi, untung bersih tetap mencapai target margin."
                : "Nonaktif: Harga/kuota dihitung dari modal dasar, lalu kartu menampilkan sisa untung bersih bila pembelian berasal dari link afiliasi."}
            </p>
          </div>
          <Saklar
            aktif={masukkanKomisiKeTarget}
            onUbah={setMasukkanKomisiKeTarget}
            label="Masukkan komisi afiliasi ke dalam target margin"
          />
        </div>
      </div>

      <div>
        <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold tracking-wide text-muted uppercase">
          <Sparkles className="size-3.5 text-accent" aria-hidden /> Pratinjau paket, modal, komisi afiliasi & untung bersih
        </p>
        <p className="mb-3 text-[12px] text-muted">
          Centang paket yang mau ikut diterapkan. Saat klik tombol terapkan di bawah, harga, kuota, sekaligus pengaturan komisi afiliasi pada paket yang dicentang akan disimpan.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {baris.map(({ p, baru, kom, h, mustahil, komisiSimulasi, untungSetelahKomisi, marginSetelahKomisi }) => {
            const persenKomisiEfektif = baru.harga > 0 ? Math.round((komisiSimulasi / baru.harga) * 100) : 0;
            return (
              <div key={p.id} className={`flex flex-col justify-between rounded-2xl border p-4 ${p.unggulan ? "border-accent/50 bg-accent-soft/20" : "border-line bg-surface"}`}>
                <div>
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
                      {mode === "kunci-harga" ? `Harga ${rp(p.harga)} di bawah margin ${margin}%` : "Margin + biaya bayar + komisi mencapai 100%"}: paket ini tidak diubah.
                    </p>
                  )}

                  <p className="mt-2 text-[22px] font-extrabold tracking-tight tabular-nums">
                    <Berubah lama={p.harga} baru={baru.harga} f={rp} />
                    <span className="text-[12px] font-medium text-muted"> / {p.durasi_hari} hari</span>
                  </p>

                  <ul className="mt-2.5 space-y-1 text-[12.5px] tabular-nums">
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

                  {/* Kontrol komisi per paket jika mode "per-paket" aktif */}
                  {modeKomisi === "per-paket" && (
                    <div className="mt-3 rounded-xl border border-line bg-subtle/50 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-muted uppercase">Komisi Paket {p.nama}</span>
                        <div className="inline-flex rounded-lg border border-line bg-surface p-0.5 text-[11px] font-semibold">
                          <button
                            type="button"
                            onClick={() => ubahKomisiSatuPaket(p.id, { jenis: "persen" })}
                            className={`rounded-md px-2 py-0.5 ${kom.jenis === "persen" ? "bg-accent text-on-accent" : "text-muted"}`}
                          >
                            %
                          </button>
                          <button
                            type="button"
                            onClick={() => ubahKomisiSatuPaket(p.id, { jenis: "rupiah" })}
                            className={`rounded-md px-2 py-0.5 ${kom.jenis === "rupiah" ? "bg-accent text-on-accent" : "text-muted"}`}
                          >
                            Rp
                          </button>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={kom.jenis === "persen" ? 100 : 100_000_000}
                          step={kom.jenis === "persen" ? 1 : 1000}
                          value={kom.nilai}
                          onChange={(e) => ubahKomisiSatuPaket(p.id, { nilai: Math.max(0, Number(e.target.value) || 0) })}
                          className="field py-1.5 text-[12.5px] font-bold tabular-nums"
                        />
                        <span className="shrink-0 text-[11.5px] font-semibold text-muted">
                          {kom.jenis === "persen" ? `% (${rp(komisiSimulasi)})` : "Rupiah"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Ringkasan Modal, Komisi, Untung Normal & Untung Bersih Afiliasi */}
                <div className="mt-3 space-y-2 border-t border-line pt-3 text-[11.5px] tabular-nums">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-subtle/40 px-2.5 py-1.5">
                      <span className="text-muted">Modal + Midtrans</span>
                      <b className="block text-[12.5px] text-fg">{rp(h.modal + h.biayaBayar)}</b>
                      <span className="text-[10.5px] text-faint">
                        AI/Srv {rp(h.modal)} + Bayar {rp(h.biayaBayar)}
                      </span>
                    </div>
                    <div className="rounded-lg bg-accent-soft/40 px-2.5 py-1.5">
                      <span className="text-muted">
                        Komisi ({kom.jenis === "persen" ? `${kom.nilai}%` : `${persenKomisiEfektif}%`})
                      </span>
                      <b className="block text-[12.5px] text-accent">{rp(komisiSimulasi)}</b>
                      <span className="text-[10.5px] text-faint">
                        {komisiSimulasi > 0 ? labelKomisiPaket(kom.jenis, kom.nilai, baru.harga) : "Tanpa komisi"}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 rounded-lg border border-line bg-surface px-2.5 py-2">
                    <div>
                      <span className="text-muted">Untung (Tanpa Afiliasi)</span>
                      <b className={`block text-[12.5px] ${h.untung < 0 ? "text-danger" : "text-success"}`}>
                        {rp(h.untung)} <span className="text-[11px] font-semibold">({persen(h.margin)})</span>
                      </b>
                    </div>
                    <div className="border-l border-line pl-2">
                      <span className="text-muted">Untung (Via Afiliasi)</span>
                      <b className={`block text-[12.5px] ${untungSetelahKomisi < 0 ? "text-danger" : "text-success"}`}>
                        {rp(untungSetelahKomisi)}{" "}
                        <span className="text-[11px] font-semibold">({persen(marginSetelahKomisi)})</span>
                      </b>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <details className="rounded-xl border border-line">
        <summary className="cursor-pointer px-3 py-2.5 text-[12.5px] font-semibold text-muted">
          Rincian paket saat ini (harga tersimpan vs modal, komisi afiliasi & untung)
        </summary>
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full min-w-[760px] text-left text-[12.5px]">
            <thead className="bg-subtle/60 text-[11px] font-semibold tracking-wide text-muted uppercase">
              <tr>
                <th className="px-3 py-2.5">Paket</th>
                <th className="px-3 py-2.5 text-right">Harga</th>
                <th className="px-3 py-2.5 text-right">Modal AI+Srv</th>
                <th className="px-3 py-2.5 text-right">Biaya Bayar</th>
                <th className="px-3 py-2.5 text-right">Komisi Afiliasi</th>
                <th className="px-3 py-2.5 text-right">Untung (Normal)</th>
                <th className="px-3 py-2.5 text-right">Untung (Via Afiliasi)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line tabular-nums">
              {baris.map(({ p, kom, sekarang: s, komisiSekarang, untungSekarangSetelahKomisi, marginSekarangSetelahKomisi }) => (
                <tr key={p.id}>
                  <td className="px-3 py-2.5 font-semibold">
                    {p.nama}
                    <span className="block text-[11px] font-normal text-faint">
                      {angka(p.kuota_balasan)} balasan · {p.kuota_nomor} nomor · {p.durasi_hari} hari
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold">{rp(p.harga)}</td>
                  <td className="px-3 py-2.5 text-right">{rp(s.modal)}</td>
                  <td className="px-3 py-2.5 text-right">{rp(s.biayaBayar)}</td>
                  <td className="px-3 py-2.5 text-right text-accent">
                    {rp(komisiSekarang)}{" "}
                    <span className="text-[11px] text-muted">
                      ({kom.jenis === "persen" ? `${kom.nilai}%` : "tetap"})
                    </span>
                  </td>
                  <td className={`px-3 py-2.5 text-right ${s.untung < 0 ? "font-bold text-danger" : "text-success"}`}>
                    {rp(s.untung)} <span className="text-[11px] text-muted">({persen(s.margin)})</span>
                  </td>
                  <td className={`px-3 py-2.5 text-right font-semibold ${untungSekarangSetelahKomisi < 0 ? "text-danger" : "text-success"}`}>
                    {rp(untungSekarangSetelahKomisi)}{" "}
                    <span className="text-[11px]">({persen(marginSekarangSetelahKomisi)})</span>
                  </td>
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
          name="terapkan_komisi"
          value="1"
          className="btn btn-ghost h-auto min-h-[2.375rem] max-w-full border border-accent/40 bg-accent-soft/30 py-2 text-left whitespace-normal text-accent hover:bg-accent-soft/60"
        >
          <Check className="size-4 shrink-0" aria-hidden /> Terapkan komisi saja ke paket dicentang
        </button>
        <button
          type="submit"
          name="terapkan"
          value="1"
          className="btn btn-primary h-auto min-h-[2.375rem] max-w-full py-2 text-center whitespace-normal"
        >
          Terapkan harga, kuota & komisi ke paket dicentang <ArrowRight className="size-4" aria-hidden />
        </button>
        <Pesan ok={!!hasil?.ok}>{hasil?.pesan}</Pesan>
      </div>
    </form>
  );
}
