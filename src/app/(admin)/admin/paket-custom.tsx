"use client";

import { startTransition, useActionState, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Calculator, ChevronDown, Eye, Loader2, MessageCircle, Minus, Plus, RotateCcw, TriangleAlert } from "lucide-react";
import { adminPaketCustomAction } from "@/app/actions";
import { KartuCustom } from "@/components/kartu-custom";
import { KursInfo } from "@/components/kurs-info";
import { PilihModel } from "@/components/pilih-model";
import { useKursLangsung } from "@/components/kurs-langsung";
import { Pesan, Saklar } from "@/components/ui";
import { rapikanNomorWa } from "@/lib/format";
import { hitungKomisiPaket } from "@/lib/afiliasi-def";
import { METODE_BAYAR, type MetodeBayar, TAMBAHAN_BIAYA_BALASAN } from "@/lib/harga";
import type { InfoKurs } from "@/lib/kurs-def";
import {
  BATAS_CUSTOM,
  DURASI_CEPAT,
  type HasilCustom,
  type KonteksHarga,
  KUOTA_CEPAT,
  type PaketCustom,
  PEMBULATAN,
  type StatusHarga,
  bulatkanHarga,
  customTampil,
  hitungCustom,
  kuotaDariAnggaran,
} from "@/lib/paket-custom-def";
import type { DataNyata } from "./simulasi-harga";

/**
 * Pembangun paket Custom (Paket & harga). Semua angka di layar dihitung ulang tiap kali admin mengubah sesuatu, dengan
 * rumus yang sama dengan server (paket-custom-def.ts) dan kurs pasar yang terus diperbarui; saat disimpan server
 * menghitung ulang sendiri, jadi yang tersimpan = yang terlihat.
 */

export interface PaketPembanding {
  nama: string;
  harga: number;
  durasi_hari: number;
  kuota_balasan: number;
}

export interface AcuanUmum {
  margin: number;
  pemakaian: number;
  metode: MetodeBayar;
  biayaServerNomor: number;
  model: string;
}

const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
const rpHalus = (n: number) => `Rp${n.toLocaleString("id-ID", { maximumFractionDigits: n < 100 ? 2 : 0 })}`;
const angka = (n: number) => Math.round(n).toLocaleString("id-ID");
const persen = (n: number | null) => (n === null ? "–" : `${(n * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`);
const tarifBayar = (m: MetodeBayar) => {
  const t = METODE_BAYAR[m];
  return [t.persen ? `${(t.persen * 100).toLocaleString("id-ID")}%` : "", t.tetap ? rp(t.tetap) : ""].filter(Boolean).join(" + ");
};

// Penggeser kuota memakai skala logaritmik 1.000–250.000 supaya kuota kecil maupun besar sama mudah diatur.
const GESER_MIN = 1_000;
const GESER_MAKS = 250_000;
const keGeser = (q: number) => Math.round((1000 * Math.log(Math.min(GESER_MAKS, Math.max(GESER_MIN, q)) / GESER_MIN)) / Math.log(GESER_MAKS / GESER_MIN));
const dariGeser = (t: number) => {
  const q = GESER_MIN * Math.pow(GESER_MAKS / GESER_MIN, t / 1000);
  const l = q < 10_000 ? 250 : q < 50_000 ? 1_000 : q < 100_000 ? 2_500 : 5_000;
  return Math.max(GESER_MIN, Math.round(q / l) * l);
};

/** Isian yang ditentukan admin (tanpa hasil hitungan), untuk mendeteksi perubahan yang belum disimpan. */
const kunciIsian = (p: PaketCustom) =>
  JSON.stringify({ ...p, kurs: 0, dihitung: 0, harga: p.harga_manual ? p.harga : 0, kuota_nomor: p.nomor_otomatis ? 0 : p.kuota_nomor });

const fiturDariTeks = (t: string) =>
  t
    .split("\n")
    .map((x) => x.trim().slice(0, BATAS_CUSTOM.panjangFitur))
    .filter(Boolean)
    .slice(0, BATAS_CUSTOM.fitur);

const TOMBOL_BAWAAN: Record<PaketCustom["aksi"], string> = { wa: "Hubungi kami", bayar: "Pilih paket" };

export function PembangunCustom({
  awal,
  acuan,
  model,
  nyata,
  kursInfo,
  paketLain,
  midtrans,
}: {
  awal: PaketCustom;
  /** Acuan simulasi paket biasa: dipakai sebagai titik awal dan bisa disamakan kapan saja. */
  acuan: AcuanUmum;
  /** Model acuan + biaya dasar per balasan (USD) dari tarif resmi & profil token nyata, dan tarif per 1 juta token. */
  model: { id: string; nama: string; usd: number; masuk: number; keluar: number }[];
  nyata: DataNyata;
  kursInfo: InfoKurs;
  /** Paket biasa yang dijual, untuk membandingkan harga per balasan. */
  paketLain: PaketPembanding[];
  midtrans: boolean;
}) {
  const [hasil, aksi, menyimpan] = useActionState(adminPaketCustomAction, null);
  const k = useKursLangsung(kursInfo);
  const pertama = awal.kurs === 0; // belum pernah dihitung dengan rumus ini: mulai dari acuan simulasi
  const [c, setC] = useState<PaketCustom>(() =>
    pertama ? { ...awal, margin: acuan.margin, pemakaian: acuan.pemakaian, metode: acuan.metode, biaya_server: acuan.biayaServerNomor, model: acuan.model } : awal
  );
  const [waTeks, setWaTeks] = useState(awal.wa ? `+${awal.wa}` : "");
  const [fiturTeks, setFiturTeks] = useState(awal.fitur.join("\n"));
  const [anggaran, setAnggaran] = useState(0);
  const ubah = (patch: Partial<PaketCustom>) => setC((x) => ({ ...x, ...patch }));

  const usd = model.find((m) => m.id === c.model)?.usd ?? null;
  const kt: KonteksHarga = { usd, kurs: k.info.kurs, balasanPerNomorBulan: nyata.balasanPerNomorBulan };
  const h = hitungCustom(c, kt);
  const tampil: PaketCustom = { ...c, kuota_nomor: h.kuotaNomor, harga: h.harga };
  const bisaTampil = customTampil(tampil);
  const waSalah = waTeks.trim() !== "" && rapikanNomorWa(waTeks) === null;
  const berubah = pertama || kunciIsian(c) !== kunciIsian(awal);
  // Belum diubah, tapi kurs / pemakaian nyata sudah bergeser sejak disimpan: hasil hitungan sekarang berbeda.
  const bergeser = !berubah && (h.harga !== awal.harga || h.kuotaNomor !== awal.kuota_nomor);
  const kuotaAnggaran = anggaran > 0 ? kuotaDariAnggaran(anggaran, c, kt) : 0;

  useEffect(() => {
    if (!berubah) return;
    const tahan = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", tahan);
    return () => window.removeEventListener("beforeunload", tahan);
  }, [berubah]);

  const simpan = (e: FormEvent) => {
    e.preventDefault();
    const fd = new FormData();
    fd.set("data", JSON.stringify({ ...c, wa: waTeks }));
    startTransition(() => aksi(fd));
  };
  const samakanAcuan = () => ubah({ margin: acuan.margin, pemakaian: acuan.pemakaian, metode: acuan.metode, biaya_server: acuan.biayaServerNomor, model: acuan.model });
  const ubahAksi = (a: PaketCustom["aksi"]) => ubah({ aksi: a, tombol: c.tombol === TOMBOL_BAWAAN[c.aksi] ? TOMBOL_BAWAAN[a] : c.tombol });
  const hargaRelatif = (f: number) => (h.hargaOtomatis === null ? c.harga : bulatkanHarga(h.hargaOtomatis * f, c.pembulatan, c.cantik));
  const namaModel = (id: string) => model.find((m) => m.id === id)?.nama ?? id;
  const alasanTakTampil = !c.aktif
    ? null
    : c.aksi === "wa" && !tampil.wa
      ? "isi nomor WhatsApp admin untuk tombol chat."
      : c.tampil_harga === "teks" && !c.teks_harga
        ? "isi teks harga."
        : h.harga < 1
          ? "harga belum ada."
          : null;

  return (
    <form onSubmit={simpan} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] lg:gap-6">
      <div className="min-w-0 space-y-4">
        {pertama && (
          <p className="flex gap-2 rounded-xl border border-accent/30 bg-accent-soft/40 p-3 text-[12.5px] text-fg">
            <Calculator className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
            Paket Custom belum pernah dihitung. Margin & asumsi biaya diambil dari simulasi paket biasa; atur isinya lalu simpan.
          </p>
        )}
        {bergeser && (
          <p className="flex gap-2 rounded-xl border border-warning/40 bg-warning-soft p-3 text-[12.5px] text-warning">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Sejak disimpan, kurs atau pemakaian nyata bergeser: hitungan sekarang {rp(h.harga)} · {angka(h.kuotaNomor)} nomor (tersimpan {rp(awal.harga)} · {angka(awal.kuota_nomor)} nomor).
              Simpan untuk memperbaruinya.
            </span>
          </p>
        )}

        <Panel no={1} judul="Isi paket" ket="Kuota balasan AI menentukan modal; harga ikut menyesuaikan otomatis.">
          <div>
            <label htmlFor="c-kuota" className="label">
              Kuota balasan AI per masa paket
            </label>
            <div className="grid gap-3 sm:grid-cols-[210px_minmax(0,1fr)] sm:items-center">
              <InputAngka id="c-kuota" nilai={c.kuota_balasan} onUbah={(v) => ubah({ kuota_balasan: v })} min={1} maks={BATAS_CUSTOM.kuotaBalasan} akhiran="balasan" />
              <input
                type="range"
                aria-label="Geser kuota balasan AI"
                min={0}
                max={1000}
                value={keGeser(c.kuota_balasan)}
                onChange={(e) => ubah({ kuota_balasan: dariGeser(Number(e.target.value)) })}
                className="w-full accent-[var(--c-accent)]"
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {KUOTA_CEPAT.map((q) => (
                <Chip key={q} aktif={c.kuota_balasan === q} onClick={() => ubah({ kuota_balasan: q })}>
                  {angka(q)}
                </Chip>
              ))}
            </div>
            <p className="hint mt-1.5 tabular-nums">
              ±{angka(c.kuota_balasan / Math.max(1, c.durasi_hari))} balasan per hari selama {angka(c.durasi_hari)} hari.
            </p>
          </div>

          <div>
            <span className="label">Durasi</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {DURASI_CEPAT.map((d) => (
                <Chip key={d.hari} aktif={c.durasi_hari === d.hari} onClick={() => ubah({ durasi_hari: d.hari })}>
                  {d.label}
                </Chip>
              ))}
              <span className="ml-1 flex items-center gap-1.5 text-[12.5px] text-muted">
                <span className="w-28">
                  <InputAngka id="c-durasi" label="Durasi (hari)" nilai={c.durasi_hari} onUbah={(v) => ubah({ durasi_hari: v })} min={1} maks={BATAS_CUSTOM.durasi} akhiran="hari" kecil />
                </span>
              </span>
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="label mb-0">Jumlah nomor WhatsApp</span>
              <Segmen
                label="Cara menentukan jumlah nomor"
                nilai={c.nomor_otomatis ? "oto" : "atur"}
                pilihan={[
                  { id: "oto", label: "Otomatis" },
                  { id: "atur", label: "Atur sendiri" },
                ]}
                onUbah={(v) => ubah(v === "oto" ? { nomor_otomatis: true } : { nomor_otomatis: false, kuota_nomor: h.kuotaNomor })}
              />
            </div>
            {c.nomor_otomatis ? (
              <p className="mt-2 rounded-xl bg-subtle/60 px-3 py-2.5 text-[12.5px] text-muted">
                <b className="text-fg tabular-nums">{angka(h.kuotaNomor)} nomor</b> = kuota balasan ÷ ±{angka(nyata.balasanPerNomorBulan)} balasan per nomor per bulan (
                {nyata.nomor ? `rata-rata nyata ${angka(nyata.nomor)} nomor, 30 hari` : "asumsi, belum ada data nyata"}), jadi nomor tambahan tidak membuat paket rugi.
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <Stepper id="c-nomor" nilai={c.kuota_nomor} onUbah={(v) => ubah({ kuota_nomor: v })} min={1} maks={BATAS_CUSTOM.kuotaNomor} label="Jumlah nomor WhatsApp" />
                <span className="text-[12px] text-muted">
                  Saran dari pemakaian nyata: {angka(hitungCustom({ ...c, nomor_otomatis: true }, kt).kuotaNomor)} nomor.
                </span>
              </div>
            )}
          </div>
        </Panel>

        <Panel no={2} judul="Harga & margin" ket="Harga otomatis = modal ÷ (1 − margin − biaya pembayaran), dibulatkan ke atas.">
          <div>
            <label htmlFor="c-margin" className="label flex items-center justify-between">
              Margin keuntungan target
              <b className="text-[14px] text-accent tabular-nums">{c.margin}%</b>
            </label>
            <input id="c-margin" type="range" min={0} max={90} step={1} value={c.margin} onChange={(e) => ubah({ margin: Number(e.target.value) })} className="w-full accent-[var(--c-accent)]" />
            <div className="mt-1 flex flex-wrap gap-1.5">
              {[30, 40, 50, 60, 70].map((m) => (
                <Chip key={m} aktif={c.margin === m} onClick={() => ubah({ margin: m })}>
                  {m}%
                </Chip>
              ))}
              {acuan.margin !== c.margin && ![30, 40, 50, 60, 70].includes(acuan.margin) && (
                <Chip aktif={false} onClick={() => ubah({ margin: acuan.margin })}>
                  Acuan {acuan.margin}%
                </Chip>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="label">Pembulatan harga otomatis</span>
              <select value={c.pembulatan} onChange={(e) => ubah({ pembulatan: Number(e.target.value) })} className="field">
                {PEMBULATAN.map((l) => (
                  <option key={l} value={l}>
                    Ke atas, kelipatan {rp(l)}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2 sm:mt-[1.6rem]">
              <span>
                <span className="block text-[13px] font-semibold">Harga cantik</span>
                <span className="hint block tabular-nums">
                  {h.hargaPas === null || c.pembulatan <= 1_000
                    ? "Berakhiran …9.000, mis. Rp1.249.000"
                    : `${rp(bulatkanHarga(h.hargaPas, c.pembulatan, false))} → ${rp(bulatkanHarga(h.hargaPas, c.pembulatan, true))}`}
                </span>
              </span>
              <Saklar aktif={c.cantik} onUbah={(v) => ubah({ cantik: v })} label="Harga cantik" disabled={c.pembulatan <= 1_000} />
            </div>
          </div>

          <div className={`rounded-xl border p-3.5 transition-colors ${c.harga_manual ? "border-line" : "border-accent/40 bg-accent-soft/30"}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[12px] font-semibold text-muted">Harga otomatis (margin {c.margin}%)</p>
                <p className="text-[22px] font-extrabold tracking-tight tabular-nums">{h.hargaOtomatis === null ? "—" : rp(h.hargaOtomatis)}</p>
                {h.hargaPas !== null && (
                  <p className="text-[11.5px] text-faint tabular-nums">
                    Tepat di margin {c.margin}%: {rp(h.hargaPas)}, dibulatkan ke atas{c.cantik && c.pembulatan > 1_000 ? " & dibuat cantik" : ""}.
                  </p>
                )}
              </div>
              {c.harga_manual ? (
                <button type="button" onClick={() => ubah({ harga_manual: false })} disabled={h.hargaOtomatis === null} className="btn btn-ghost">
                  <RotateCcw className="size-4" aria-hidden /> Pakai harga otomatis
                </button>
              ) : (
                <span className="rounded-full bg-accent px-2.5 py-1 text-[11.5px] font-bold text-on-accent">Dipakai</span>
              )}
            </div>
            {h.hargaOtomatis === null && <p className="mt-1 text-[12px] font-medium text-warning">Margin + biaya pembayaran mencapai 100%: turunkan margin atau isi harga sendiri.</p>}
          </div>

          <div className="space-y-3 rounded-xl border border-line p-3.5">
            <div className="flex items-center justify-between gap-3">
              <span>
                <span className="block text-[13px] font-semibold">Atur harga sendiri</span>
                <span className="hint block">Timpa harga otomatis; untung & margin di ringkasan tetap dihitung dari harga ini.</span>
              </span>
              <Saklar
                aktif={c.harga_manual}
                onUbah={(v) => ubah(v ? { harga_manual: true, harga: c.harga_manual ? c.harga : (h.hargaOtomatis ?? c.harga) } : { harga_manual: false })}
                label="Atur harga sendiri"
              />
            </div>
            {c.harga_manual && (
              <div className="animate-masuk space-y-2">
                <InputAngka id="c-harga" label="Harga jual sendiri (Rp)" nilai={c.harga} onUbah={(v) => ubah({ harga: v })} min={1} maks={2_000_000_000} awalan="Rp" akhiran={`/ ${angka(c.durasi_hari)} hari`} />
                {h.hargaOtomatis !== null && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 text-[12px] text-muted">Dari harga otomatis:</span>
                    {[0.9, 0.95, 1, 1.05, 1.1].map((f) => (
                      <Chip key={f} aktif={c.harga === hargaRelatif(f)} onClick={() => ubah({ harga: hargaRelatif(f) })}>
                        {f === 1 ? "Sama" : `${f > 1 ? "+" : "−"}${Math.round(Math.abs(f - 1) * 100)}%`}
                      </Chip>
                    ))}
                  </div>
                )}
                {h.hargaOtomatis !== null && c.harga !== h.hargaOtomatis && (
                  <p className={`text-[12px] tabular-nums ${c.harga < h.hargaOtomatis ? "text-warning" : "text-muted"}`}>
                    {c.harga < h.hargaOtomatis ? "Lebih murah" : "Lebih mahal"} {rp(Math.abs(c.harga - h.hargaOtomatis))} ({persen(Math.abs(c.harga - h.hargaOtomatis) / h.hargaOtomatis)}) dari harga otomatis.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl bg-subtle/60 p-3.5">
            <span>
              <span className="block text-[13px] font-semibold">Harga mengikuti kurs USD</span>
              <span className="hint block">
                {c.harga_manual
                  ? "Tidak berlaku untuk harga sendiri."
                  : "Modal AI dibayar dalam USD: bila kurs bergeser ≥1% dari kurs saat disimpan, harga otomatis dihitung ulang sendiri."}
              </span>
            </span>
            <Saklar aktif={c.ikut_kurs && !c.harga_manual} onUbah={(v) => ubah({ ikut_kurs: v })} label="Harga mengikuti kurs USD" disabled={c.harga_manual} />
          </div>

          <div className="space-y-2.5 rounded-xl border border-line p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="block text-[13px] font-semibold">Komisi afiliasi paket Custom</span>
                <span className="hint block">Komisi yang diterima afiliator saat paket Custom dibeli.</span>
              </div>
              <Segmen
                label="Jenis komisi paket Custom"
                nilai={c.komisi_jenis}
                pilihan={[
                  { id: "persen", label: "Persentase (%)" },
                  { id: "rupiah", label: "Nominal (Rp)" },
                ]}
                onUbah={(v) => ubah({ komisi_jenis: v, komisi_nilai: v === "persen" ? Math.min(100, c.komisi_nilai) : c.komisi_nilai })}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-52">
                <InputAngka
                  id="c-komisi"
                  label="Nilai komisi afiliasi"
                  nilai={c.komisi_nilai}
                  onUbah={(v) => ubah({ komisi_nilai: v })}
                  min={0}
                  maks={c.komisi_jenis === "persen" ? 100 : 2_000_000_000}
                  awalan={c.komisi_jenis === "rupiah" ? "Rp" : undefined}
                  akhiran={c.komisi_jenis === "persen" ? "%" : undefined}
                  kecil
                />
              </div>
              <span className="text-[12px] text-muted tabular-nums">
                {c.komisi_nilai <= 0
                  ? "0 = tanpa komisi afiliasi."
                  : h.harga > 0
                    ? `Afiliator menerima ${rp(hitungKomisiPaket(h.harga, c.komisi_jenis, c.komisi_nilai))} per pembelian.`
                    : ""}
              </span>
            </div>
          </div>

          <details className="group rounded-xl border border-line">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-3 text-[12.5px] font-semibold text-accent [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2">
                <Calculator className="size-4" aria-hidden /> Punya anggaran pelanggan? Hitung kuotanya
              </span>
              <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="space-y-2.5 border-t border-line p-3.5">
              <InputAngka id="c-anggaran" label="Anggaran pelanggan (Rp)" nilai={anggaran} onUbah={setAnggaran} min={0} maks={2_000_000_000} awalan="Rp" akhiran={`/ ${angka(c.durasi_hari)} hari`} kosongBilaNol />
              {anggaran > 0 &&
                (kuotaAnggaran > 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-subtle/60 p-3 text-[12.5px]">
                    <span>
                      Dengan margin {c.margin}%, anggaran {rp(anggaran)} cukup untuk <b className="tabular-nums">{angka(kuotaAnggaran)} balasan AI</b>.
                    </span>
                    <button type="button" onClick={() => ubah({ kuota_balasan: kuotaAnggaran, harga_manual: true, harga: anggaran })} className="btn btn-ghost">
                      Pakai kuota & harga ini
                    </button>
                  </div>
                ) : (
                  <p className="text-[12.5px] text-warning">Anggaran terlalu kecil untuk margin {c.margin}% (setelah biaya pembayaran).</p>
                ))}
            </div>
          </details>
        </Panel>

        <Panel
          no={3}
          judul="Asumsi biaya"
          ket={`${namaModel(c.model)} · terpakai ${c.pemakaian}% · ${METODE_BAYAR[c.metode].label} · server ${rp(c.biaya_server)}/nomor · kurs ${rp(k.info.kurs)}`}
          lipat
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="c-model" className="label">
                Model AI acuan biaya
              </label>
              <PilihModel
                id="c-model"
                nilai={c.model}
                onUbah={(id) => ubah({ model: id })}
                label="Model AI acuan biaya"
                opsi={model.map((m) => ({ id: m.id, nama: m.nama, rpBalasan: m.usd * k.info.kurs * (1 + TAMBAHAN_BIAYA_BALASAN), masuk: m.masuk, keluar: m.keluar }))}
              />
              {!usd && <span className="mt-1 block text-[12px] text-warning">Tarif {c.model} tidak tercantum di halaman harga resmi; pilih model lain.</span>}
            </div>
            <label className="block">
              <span className="label">Metode bayar acuan (biaya Midtrans)</span>
              <select value={c.metode} onChange={(e) => ubah({ metode: e.target.value as MetodeBayar })} className="field">
                {(Object.keys(METODE_BAYAR) as MetodeBayar[]).map((m) => (
                  <option key={m} value={m}>
                    {METODE_BAYAR[m].label} · {tarifBayar(m)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label flex justify-between">
                Kuota yang dihitung terpakai <b className="tabular-nums">{c.pemakaian}%</b>
              </span>
              <input type="range" min={10} max={100} step={5} value={c.pemakaian} onChange={(e) => ubah({ pemakaian: Number(e.target.value) })} className="w-full accent-[var(--c-accent)]" />
              <span className="hint">100% = pelanggan menghabiskan seluruh kuota (paling aman).</span>
            </label>
            <div>
              <label htmlFor="c-server" className="label">
                Biaya server per nomor per bulan
              </label>
              <InputAngka id="c-server" nilai={c.biaya_server} onUbah={(v) => ubah({ biaya_server: v })} min={0} maks={BATAS_CUSTOM.biayaServer} awalan="Rp" />
            </div>
          </div>
          <div className="rounded-xl border border-line p-3.5">
            <KursInfo info={k.info} segarkan={k.segarkan} sedang={k.sedang} galat={k.galat} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-subtle/60 p-3 text-[12px] text-muted">
            <span>
              Acuan simulasi paket biasa: {namaModel(acuan.model)} · margin {acuan.margin}% · terpakai {acuan.pemakaian}% · {METODE_BAYAR[acuan.metode].label} · server {rp(acuan.biayaServerNomor)}
            </span>
            <button type="button" onClick={samakanAcuan} className="inline-flex items-center gap-1 font-semibold text-accent hover:underline">
              <RotateCcw className="size-3.5" aria-hidden /> Samakan
            </button>
          </div>
        </Panel>

        <Panel
          no={4}
          judul="Kartu di daftar harga"
          ket={c.aktif ? (bisaTampil ? "Tampil di landing page & halaman Langganan, setelah paket lain." : "Belum bisa tampil.") : "Tidak tampil di daftar harga."}
          kanan={<Saklar aktif={c.aktif} onUbah={(v) => ubah({ aktif: v })} label="Tampilkan paket Custom" />}
        >
          {alasanTakTampil && (
            <p className="flex gap-2 rounded-xl bg-warning-soft p-3 text-[12.5px] font-medium text-warning">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> Kartu belum bisa tampil: {alasanTakTampil}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="label">Nama paket</span>
              <input value={c.nama} onChange={(e) => ubah({ nama: e.target.value })} maxLength={BATAS_CUSTOM.nama} required minLength={2} className="field" />
            </label>
            <label className="block">
              <span className="label">Deskripsi singkat</span>
              <input value={c.deskripsi} onChange={(e) => ubah({ deskripsi: e.target.value })} maxLength={BATAS_CUSTOM.deskripsi} className="field" />
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="label mb-0">Harga di kartu</span>
              <Segmen
                label="Harga di kartu"
                nilai={c.tampil_harga}
                pilihan={[
                  { id: "angka", label: "Tampilkan harga" },
                  { id: "teks", label: "Teks bebas" },
                ]}
                onUbah={(v) => ubah({ tampil_harga: v })}
              />
            </div>
            {c.tampil_harga === "teks" ? (
              <input
                aria-label="Teks harga"
                value={c.teks_harga}
                onChange={(e) => ubah({ teks_harga: e.target.value })}
                maxLength={BATAS_CUSTOM.teksHarga}
                placeholder='mis. "Hubungi kami" atau "Mulai Rp1 juta"'
                className="field"
              />
            ) : (
              <p className="hint">Kartu menampilkan {rp(h.harga)} / {angka(c.durasi_hari)} hari (harga jual di ringkasan).</p>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <span>
              <span className="block text-[13px] font-semibold">Tampilkan jumlah nomor & balasan AI</span>
              <span className="hint block">Jadi dua poin pertama di kartu.</span>
            </span>
            <Saklar aktif={c.tampil_kuota} onUbah={(v) => ubah({ tampil_kuota: v })} label="Tampilkan jumlah nomor & balasan AI" />
          </div>

          <label className="block">
            <span className="label">Keunggulan (satu per baris, maks. {BATAS_CUSTOM.fitur})</span>
            <textarea
              rows={3}
              value={fiturTeks}
              onChange={(e) => {
                setFiturTeks(e.target.value);
                ubah({ fitur: fiturDariTeks(e.target.value) });
              }}
              className="field"
            />
          </label>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="label mb-0">Tombol kartu</span>
              <Segmen
                label="Tombol kartu"
                nilai={c.aksi}
                pilihan={[
                  { id: "wa", label: "Chat WhatsApp admin" },
                  { id: "bayar", label: "Bayar langsung" },
                ]}
                onUbah={ubahAksi}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {c.aksi === "wa" && (
                <label className="block">
                  <span className="label">Nomor WhatsApp admin</span>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={waTeks}
                    onChange={(e) => {
                      setWaTeks(e.target.value);
                      ubah({ wa: rapikanNomorWa(e.target.value) ?? "" });
                    }}
                    placeholder="0812 3456 7890"
                    aria-invalid={waSalah}
                    className={`field tabular-nums ${waSalah ? "border-danger" : ""}`}
                  />
                  {waSalah && <span className="mt-1 block text-[12px] text-danger">Nomor tidak valid. Contoh: 0812 3456 7890 atau +62 812 3456 7890.</span>}
                </label>
              )}
              <label className="block">
                <span className="label">Teks tombol</span>
                <input value={c.tombol} onChange={(e) => ubah({ tombol: e.target.value })} maxLength={BATAS_CUSTOM.tombol} className="field" />
              </label>
            </div>
            {c.aksi === "wa" ? (
              <label className="block">
                <span className="label">Pesan pembuka chat WhatsApp</span>
                <textarea rows={2} value={c.pesan} onChange={(e) => ubah({ pesan: e.target.value })} maxLength={BATAS_CUSTOM.pesan} className="field" />
                <span className="hint mt-1 block">Rincian paket di kartu (kuota & harga) ikut ditempel otomatis; dari halaman Langganan, email akun pelanggan juga.</span>
              </label>
            ) : (
              <p className={`rounded-xl p-3 text-[12.5px] ${midtrans ? "bg-subtle/60 text-muted" : "bg-warning-soft text-warning"}`}>
                {midtrans
                  ? `Di halaman Langganan tombol membuka pembayaran Midtrans sebesar ${rp(h.harga)}; paket aktif otomatis setelah lunas dan bisa diperpanjang. Di landing page tombol mengarah ke pendaftaran.`
                  : "Pembayaran Midtrans belum aktif di server: tombol bayar tetap tampil tapi nonaktif sampai developer memasang MIDTRANS_SERVER_KEY."}
              </p>
            )}
          </div>
        </Panel>
      </div>

      <aside className="min-w-0 space-y-4 lg:sticky lg:top-6 lg:max-h-[calc(100svh-3rem)] lg:self-start lg:overflow-y-auto">
        <Ringkasan c={c} h={h} paketLain={paketLain} kurs={k.info} />
        <section aria-label="Pratinjau kartu">
          <p className="mb-2 flex items-center gap-1.5 text-[11.5px] font-semibold tracking-[0.08em] text-muted uppercase">
            <Eye className="size-3.5" aria-hidden /> Pratinjau kartu {bisaTampil ? "" : "· tidak tampil"}
          </p>
          <div className={bisaTampil ? "" : "opacity-60"}>
            <KartuCustom
              p={tampil}
              varian="app"
              aksi={
                <span aria-hidden className={`btn pointer-events-none w-full ${c.aksi === "bayar" ? "btn-primary" : "btn-ghost justify-center border border-line"}`}>
                  {c.aksi === "wa" && <MessageCircle className="size-4" aria-hidden />} {c.tombol || TOMBOL_BAWAAN[c.aksi]}
                </span>
              }
            />
          </div>
        </section>
        {/* Selalu terlihat di desktop walau ringkasan + pratinjau lebih tinggi dari layar (kolom ini bisa digulir). */}
        <div className="hidden space-y-2 border-t border-line bg-surface pt-3 pb-1 lg:sticky lg:bottom-0 lg:block">
          <TombolSimpan menyimpan={menyimpan} nonaktif={waSalah} lebar />
          <StatusSimpan berubah={berubah} hasil={hasil} menyimpan={menyimpan} />
        </div>
      </aside>

      <div className="sticky bottom-3 z-20 rounded-2xl border border-line bg-surface/95 p-3 shadow-pop backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[16px] font-extrabold tabular-nums">
              {rp(h.harga)} <span className="text-[12px] font-semibold text-muted">/ {angka(c.durasi_hari)} hari</span>
            </p>
            <p className={`text-[11.5px] font-semibold ${WARNA_STATUS[h.status]}`}>
              Margin {persen(h.rincian.margin)} · {LABEL_STATUS[h.status]}
            </p>
          </div>
          <TombolSimpan menyimpan={menyimpan} nonaktif={waSalah} />
        </div>
        <div className="mt-1.5">
          <StatusSimpan berubah={berubah} hasil={hasil} menyimpan={menyimpan} />
        </div>
      </div>
    </form>
  );
}

const LABEL_STATUS: Record<StatusHarga, string> = { sehat: "Untung sesuai target", tipis: "Di bawah target margin", rugi: "Rugi", kosong: "Belum ada harga" };
const WARNA_STATUS: Record<StatusHarga, string> = { sehat: "text-success", tipis: "text-warning", rugi: "text-danger", kosong: "text-muted" };
const LATAR_STATUS: Record<StatusHarga, string> = { sehat: "bg-success", tipis: "bg-warning", rugi: "bg-danger", kosong: "bg-line-strong" };

function Ringkasan({ c, h, paketLain, kurs }: { c: PaketCustom; h: HasilCustom; paketLain: PaketPembanding[]; kurs: InfoKurs }) {
  const r = h.rincian;
  const target = c.margin / 100;
  const isi = Math.max(0, Math.min(1, r.margin ?? 0));
  const perBalasanLain = paketLain.filter((p) => p.harga > 0 && p.kuota_balasan > 0).map((p) => ({ nama: p.nama, nilai: p.harga / p.kuota_balasan }));
  const termurah = perBalasanLain.reduce<{ nama: string; nilai: number } | null>((a, p) => (!a || p.nilai < a.nilai ? p : a), null);
  return (
    <section aria-label="Ringkasan harga" className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11.5px] font-semibold tracking-[0.08em] text-muted uppercase">Harga jual</p>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${c.harga_manual ? "bg-subtle text-muted" : "bg-accent-soft text-accent"}`}>{c.harga_manual ? "Harga sendiri" : "Otomatis"}</span>
      </div>
      <p className="mt-1 text-[30px] leading-tight font-extrabold tracking-tight tabular-nums">
        {rp(h.harga)}
        <span className="text-[13px] font-semibold text-muted"> / {angka(c.durasi_hari)} hari</span>
      </p>
      <p className="text-[12.5px] text-muted tabular-nums">
        {h.perBalasan !== null && `${rpHalus(h.perBalasan)} per balasan`}
        {c.durasi_hari >= 60 && ` · setara ${rp(h.per30Hari)} per 30 hari`}
      </p>

      <dl className="mt-4 space-y-2 border-t border-line pt-3 text-[12.5px] tabular-nums">
        <Baris label="Modal AI" ket={`${angka(c.kuota_balasan)} × ${rpHalus(r.biayaPerBalasan)} × ${c.pemakaian}%`} nilai={rp(r.modalAi)} />
        <Baris label="Modal server" ket={`${angka(h.kuotaNomor)} nomor × ${rp(c.biaya_server)} × ${(c.durasi_hari / 30).toLocaleString("id-ID", { maximumFractionDigits: 1 })} bln`} nilai={rp(r.modalServer)} />
        <Baris label="Biaya pembayaran" ket={`${METODE_BAYAR[c.metode].label} · ${tarifBayar(c.metode)}`} nilai={rp(r.biayaBayar)} />
        <div className="flex items-baseline justify-between gap-3 border-t border-line pt-2 text-[13.5px] font-bold">
          <dt>Untung bersih</dt>
          <dd className={r.untung < 0 ? "text-danger" : "text-success"}>{rp(r.untung)}</dd>
        </div>
      </dl>

      <div className="mt-3">
        <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
          <span className="font-semibold">
            Margin <span className={`tabular-nums ${WARNA_STATUS[h.status]}`}>{persen(r.margin)}</span>
          </span>
          <span className="text-muted tabular-nums">target {c.margin}%</span>
        </div>
        <div className="relative mt-1.5 h-2 rounded-full bg-subtle" role="img" aria-label={`Margin ${persen(r.margin)} dari target ${c.margin}%`}>
          <div className={`h-2 rounded-full transition-[width] ${LATAR_STATUS[h.status]}`} style={{ width: `${isi * 100}%` }} />
          <span aria-hidden className="absolute -top-1 h-4 w-0.5 rounded-full bg-fg/70" style={{ left: `calc(${Math.min(1, target) * 100}% - 1px)` }} />
        </div>
        <p className={`mt-2 text-[12px] font-semibold ${WARNA_STATUS[h.status]}`}>
          {h.status === "rugi"
            ? `Rugi ${rp(-r.untung)} per paket: harga di bawah modal + biaya pembayaran.`
            : h.status === "tipis"
              ? `Untung, tapi ${persen(target - (r.margin ?? 0))} di bawah target margin.`
              : h.status === "sehat"
                ? "Untung sesuai target margin."
                : "Belum ada harga."}
        </p>
      </div>

      {perBalasanLain.length > 0 && h.perBalasan !== null && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-[11.5px] font-semibold tracking-[0.08em] text-muted uppercase">Harga per balasan</p>
          <ul className="mt-1.5 space-y-1 text-[12.5px] tabular-nums">
            <li className="flex justify-between gap-3 font-bold">
              <span className="truncate">{c.nama || "Custom"} (ini)</span>
              <span>{rpHalus(h.perBalasan)}</span>
            </li>
            {perBalasanLain.map((p) => (
              <li key={p.nama} className="flex justify-between gap-3 text-muted">
                <span className="truncate">{p.nama}</span>
                <span>{rpHalus(p.nilai)}</span>
              </li>
            ))}
          </ul>
          {termurah && h.perBalasan > termurah.nilai && (
            <p className="mt-1.5 text-[12px] text-warning">Per balasan lebih mahal dari paket {termurah.nama}; pelanggan besar bisa memilih paket itu saja.</p>
          )}
        </div>
      )}
      <p className="mt-3 text-[11px] text-faint tabular-nums">
        Kurs {rp(kurs.kurs)}/USD{kurs.langsung && !kurs.basi ? " (real-time)" : ""} · dihitung ulang tiap ada perubahan.
      </p>
    </section>
  );
}

function Baris({ label, ket, nilai }: { label: string; ket: string; nilai: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="min-w-0">
        <span className="font-medium">{label}</span>
        <span className="block truncate text-[11px] text-faint">{ket}</span>
      </dt>
      <dd className="shrink-0 font-semibold">{nilai}</dd>
    </div>
  );
}

function TombolSimpan({ menyimpan, nonaktif, lebar }: { menyimpan: boolean; nonaktif?: boolean; lebar?: boolean }) {
  return (
    <button type="submit" disabled={menyimpan || nonaktif} className={`btn btn-primary ${lebar ? "w-full" : ""}`}>
      {menyimpan && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {lebar ? "Simpan paket Custom" : "Simpan"}
    </button>
  );
}

function StatusSimpan({ berubah, hasil, menyimpan }: { berubah: boolean; hasil: { ok: boolean; pesan?: string } | null; menyimpan: boolean }) {
  if (menyimpan) return null;
  if (hasil && !hasil.ok) return <Pesan ok={false}>{hasil.pesan}</Pesan>;
  if (berubah) return <p className="text-[12px] font-medium text-warning">Ada perubahan yang belum disimpan.</p>;
  return hasil?.ok ? <Pesan ok>{hasil.pesan}</Pesan> : <p className="text-[12px] text-muted">Semua perubahan sudah tersimpan.</p>;
}

function Panel({ no, judul, ket, kanan, lipat, children }: { no: number; judul: string; ket?: string; kanan?: ReactNode; lipat?: boolean; children: ReactNode }) {
  const kepala = (
    <div className="flex min-w-0 gap-3">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-[12px] font-bold text-accent">{no}</span>
      <div className="min-w-0">
        <h3 className="text-[14px] font-bold">{judul}</h3>
        {ket && <p className="mt-0.5 text-[12.5px] text-muted">{ket}</p>}
      </div>
    </div>
  );
  if (lipat)
    return (
      <details className="group rounded-2xl border border-line bg-surface">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-4 sm:p-5 [&::-webkit-details-marker]:hidden">
          {kepala}
          <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="space-y-4 border-t border-line p-4 sm:p-5">{children}</div>
      </details>
    );
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        {kepala}
        {kanan}
      </div>
      <div className="mt-4 space-y-5">{children}</div>
    </section>
  );
}

function Segmen<T extends string>({ label, nilai, pilihan, onUbah }: { label: string; nilai: T; pilihan: { id: T; label: string }[]; onUbah: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl border border-line bg-subtle/60 p-1 text-[12.5px] font-semibold">
      {pilihan.map((p) => (
        <button
          key={p.id}
          type="button"
          role="radio"
          aria-checked={nilai === p.id}
          onClick={() => onUbah(p.id)}
          className={`rounded-lg px-3 py-1.5 transition-colors ${nilai === p.id ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg"}`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ aktif, onClick, children }: { aktif: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={aktif}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-[12.5px] font-semibold tabular-nums transition-colors ${aktif ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:border-line-strong hover:text-fg"}`}
    >
      {children}
    </button>
  );
}

/**
 * Kolom angka yang selalu tampil berformat (25.000) termasuk saat diketik; posisi kursor dijaga per digit, jadi
 * mengetik, menghapus, atau memilih semua lalu mengetik berperilaku biasa. Boleh kosong selama diketik; saat
 * ditinggalkan, nilai di bawah `min` dikembalikan ke `min`. Di atas `maks` dipotong.
 */
export function InputAngka({
  id,
  label,
  nilai,
  onUbah,
  min,
  maks,
  awalan,
  akhiran,
  kecil,
  kosongBilaNol,
}: {
  id: string;
  label?: string;
  nilai: number;
  onUbah: (v: number) => void;
  min: number;
  maks: number;
  awalan?: string;
  akhiran?: string;
  kecil?: boolean;
  kosongBilaNol?: boolean;
}) {
  const [kosong, setKosong] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const kursor = useRef<number | null>(null); // jumlah digit di kiri kursor, dipulihkan setelah format ulang
  const tampil = kosong || (kosongBilaNol && !nilai) ? "" : nilai.toLocaleString("id-ID");

  useLayoutEffect(() => {
    const el = ref.current;
    if (kursor.current === null || !el || document.activeElement !== el) return;
    let i = 0;
    for (let digit = 0; i < el.value.length && digit < kursor.current; i++) if (/\d/.test(el.value[i])) digit++;
    kursor.current = null;
    el.setSelectionRange(i, i);
  });

  return (
    <div className="relative">
      {awalan && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[13px] font-semibold text-muted">{awalan}</span>}
      <input
        ref={ref}
        id={id}
        aria-label={label}
        inputMode="numeric"
        autoComplete="off"
        value={tampil}
        onBlur={() => {
          setKosong(false);
          if (nilai < min) onUbah(min);
        }}
        onChange={(e) => {
          const t = e.target.value;
          kursor.current = t.slice(0, e.target.selectionStart ?? t.length).replace(/\D/g, "").length;
          const d = t.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 10);
          setKosong(d === "");
          onUbah(Math.min(maks, Number(d) || 0));
        }}
        className={`field font-semibold tabular-nums ${awalan ? "pl-10" : ""} ${akhiran ? (kecil ? "pr-11" : "pr-24") : ""} ${kecil ? "py-1.5" : ""}`}
      />
      {akhiran && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[12px] text-muted">{akhiran}</span>}
    </div>
  );
}

function Stepper({ id, nilai, onUbah, min, maks, label }: { id: string; nilai: number; onUbah: (v: number) => void; min: number; maks: number; label: string }) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <button type="button" aria-label={`Kurangi ${label.toLowerCase()}`} onClick={() => onUbah(Math.max(min, nilai - 1))} disabled={nilai <= min} className="btn btn-ghost size-9 px-0">
        <Minus className="size-4" aria-hidden />
      </button>
      <span className="w-20">
        <InputAngka id={id} label={label} nilai={nilai} onUbah={onUbah} min={min} maks={maks} kecil />
      </span>
      <button type="button" aria-label={`Tambah ${label.toLowerCase()}`} onClick={() => onUbah(Math.min(maks, nilai + 1))} disabled={nilai >= maks} className="btn btn-ghost size-9 px-0">
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}
