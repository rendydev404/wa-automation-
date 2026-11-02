"use client";

import { useState } from "react";
import { ArrowRight, Banknote, Check, Copy, Link2, MousePointerClick, ShieldCheck, Sparkles, TrendingUp, Users, Wallet } from "lucide-react";
import { angka } from "@/lib/format";
import { hitungKomisiPaket, labelKomisiPaket, type JenisKomisi, type SiklusKomisi } from "@/lib/afiliasi-def";

export type PaketSimulasiAfiliasi = {
  id: string;
  nama: string;
  harga: number;
  durasiHari: number;
  komisiJenis: JenisKomisi;
  komisiNilai: number;
  unggulan?: boolean;
};

const JUMLAH_CEPAT = [5, 10, 25, 50, 100];

export function KalkulatorAfiliasi({
  paketList,
  siklus,
  minTarik,
}: {
  paketList: PaketSimulasiAfiliasi[];
  siklus: SiklusKomisi;
  minTarik: number;
}) {
  const daftar = paketList.length > 0
    ? paketList
    : [
        { id: "starter", nama: "Starter", harga: 99_000, durasiHari: 30, komisiJenis: "persen" as const, komisiNilai: 15 },
        { id: "bisnis", nama: "Bisnis", harga: 144_000, durasiHari: 30, komisiJenis: "persen" as const, komisiNilai: 20, unggulan: true },
        { id: "pro", nama: "Pro", harga: 401_000, durasiHari: 30, komisiJenis: "persen" as const, komisiNilai: 20 },
      ];

  const defaultIdx = Math.max(0, daftar.findIndex((p) => p.unggulan));
  const [idxPaket, setIdxPaket] = useState(defaultIdx);
  const [jumlahUser, setJumlahUser] = useState(15);
  const [bulanSimulasi, setBulanSimulasi] = useState<1 | 6 | 12>(6);

  const paketAktif = daftar[idxPaket] ?? daftar[0];
  const komisiPerTransaksi = hitungKomisiPaket(paketAktif.harga, paketAktif.komisiJenis, paketAktif.komisiNilai);
  const labelKomisi = labelKomisiPaket(paketAktif.komisiJenis, paketAktif.komisiNilai);

  // Jika siklus "berulang", pelanggan yang bertahan setiap bulan menghasilkan komisi lagi;
  // jika "pertama", komisi dihitung dari jumlah user baru per bulan * jumlah bulan.
  const komisiBulanan = komisiPerTransaksi * jumlahUser;
  const totalPeriode =
    siklus === "berulang"
      ? komisiBulanan * bulanSimulasi
      : komisiBulanan * bulanSimulasi;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
      {/* Panel Kontrol Kiri */}
      <div className="rounded-3xl border border-line bg-surface p-6 shadow-card sm:p-8">
        <div>
          <span className="text-[12.5px] font-bold tracking-[0.08em] text-muted uppercase">1. Pilih Paket yang Direkomendasikan</span>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
            {daftar.map((p, idx) => {
              const aktif = idx === idxPaket;
              const komisiRp = hitungKomisiPaket(p.harga, p.komisiJenis, p.komisiNilai);
              const badge = labelKomisiPaket(p.komisiJenis, p.komisiNilai);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setIdxPaket(idx)}
                  className={`flex flex-col items-start rounded-2xl border p-4 text-left transition-all ${
                    aktif
                      ? "border-accent bg-accent-soft/60 ring-2 ring-accent/20"
                      : "border-line bg-canvas hover:border-accent/40 hover:bg-subtle/60"
                  }`}
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="text-[14.5px] font-bold text-fg">{p.nama}</span>
                    {badge && (
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${aktif ? "bg-accent text-on-accent" : "bg-subtle text-muted"}`}>
                        {badge}
                      </span>
                    )}
                  </div>
                  <span className="mt-1 text-[12.5px] text-muted tabular-nums">Harga Rp{angka(p.harga)}</span>
                  <span className="mt-2.5 text-[13px] font-extrabold text-accent tabular-nums">
                    +Rp{angka(komisiRp)} <span className="font-normal text-muted">/ beli</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-7 border-t border-line pt-6">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="slider-referral" className="text-[12.5px] font-bold tracking-[0.08em] text-muted uppercase">
              2. Jumlah Pembeli Paket per Bulan
            </label>
            <span className="text-2xl font-extrabold text-accent tabular-nums">
              {jumlahUser} <span className="text-[13.5px] font-semibold text-muted">pembeli</span>
            </span>
          </div>

          <input
            id="slider-referral"
            type="range"
            min={1}
            max={100}
            step={1}
            value={jumlahUser}
            onChange={(e) => setJumlahUser(Number(e.target.value))}
            className="mt-4 w-full cursor-pointer accent-[var(--c-accent)]"
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-semibold text-muted">Pilih cepat:</span>
            {JUMLAH_CEPAT.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setJumlahUser(n)}
                className={`rounded-xl border px-3 py-1 text-[12.5px] font-bold tabular-nums transition-colors ${
                  jumlahUser === n
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line bg-canvas text-muted hover:border-accent/40 hover:text-fg"
                }`}
              >
                {n} user
              </button>
            ))}
          </div>
        </div>

        <div className="mt-7 border-t border-line pt-6">
          <span className="text-[12.5px] font-bold tracking-[0.08em] text-muted uppercase">3. Rentang Proyeksi Komisi</span>
          <div className="mt-3 grid grid-cols-3 gap-2.5">
            {([1, 6, 12] as const).map((bln) => (
              <button
                key={bln}
                type="button"
                onClick={() => setBulanSimulasi(bln)}
                className={`rounded-xl border py-2.5 text-[13.5px] font-bold transition-colors ${
                  bulanSimulasi === bln
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line bg-canvas text-fg hover:border-accent/40"
                }`}
              >
                {bln === 1 ? "1 Bulan" : bln === 6 ? "6 Bulan" : "1 Tahun"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Panel Hasil Kanan */}
      <div className="flex flex-col justify-between rounded-3xl border border-ink-line bg-ink p-6 text-ink-fg shadow-card sm:p-8">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-ink-signal/30 bg-ink-signal/10 px-3 py-1 text-[12px] font-bold text-ink-signal">
            <TrendingUp className="size-3.5" aria-hidden /> Estimasi Penghasilan Afiliasi
          </div>

          <div className="mt-6">
            <p className="text-[13px] font-semibold text-ink-muted">Potensi Komisi per Bulan ({jumlahUser} pembeli {paketAktif.nama})</p>
            <p className="mt-1.5 text-4xl font-extrabold tracking-tight text-white tabular-nums sm:text-[44px]">
              Rp{angka(komisiBulanan)}
            </p>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 rounded-2xl border border-ink-line bg-white/[0.03] p-4">
            <div>
              <p className="text-[12px] font-semibold text-ink-muted">Komisi / 1 Pembelian</p>
              <p className="mt-1 text-lg font-extrabold text-ink-signal tabular-nums">
                Rp{angka(komisiPerTransaksi)}
              </p>
              <p className="mt-0.5 text-[11.5px] text-ink-muted">
                {labelKomisi ? `Tarif ${labelKomisi} dari Rp${angka(paketAktif.harga)}` : "Sesuai pengaturan paket"}
              </p>
            </div>
            <div>
              <p className="text-[12px] font-semibold text-ink-muted">
                Akumulasi {bulanSimulasi === 12 ? "1 Tahun" : `${bulanSimulasi} Bulan`}
              </p>
              <p className="mt-1 text-lg font-extrabold text-white tabular-nums">
                Rp{angka(totalPeriode)}
              </p>
              <p className="mt-0.5 text-[11.5px] text-ink-muted">
                {siklus === "berulang" ? "Komisi berulang tiap perpanjangan" : "Komisi pembelian perdana"}
              </p>
            </div>
          </div>

          <ul className="mt-6 space-y-2.5 text-[13px] text-ink-muted">
            <li className="flex items-center gap-2">
              <Check className="size-4 shrink-0 text-ink-signal" aria-hidden />
              <span>
                Siklus komisi aktif:{" "}
                <strong className="text-white">
                  {siklus === "berulang" ? "Berulang (setiap user beli / perpanjang paket)" : "Pembelian paket pertama user"}
                </strong>
              </span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="size-4 shrink-0 text-ink-signal" aria-hidden />
              <span>
                Minimum penarikan saldo ringan mulai <strong className="text-white">Rp{angka(minTarik)}</strong>
              </span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="size-4 shrink-0 text-ink-signal" aria-hidden />
              <span>Atribusi cookie otomatis tersimpan selama 30 hari penuh</span>
            </li>
          </ul>
        </div>

        <div className="mt-8 border-t border-ink-line pt-5">
          <a
            href="/daftar"
            className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-ink-signal px-5 py-3.5 text-[14.5px] font-bold text-ink transition-transform hover:-translate-y-0.5"
          >
            Mulai Jadi Afiliator Gratis
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </a>
        </div>
      </div>
    </div>
  );
}

const LANGKAH_INTERAKTIF = [
  {
    nomor: "01",
    judul: "Aktifkan Kode Referral Unik",
    ringkas: "Daftar akun gratis, buka menu Afiliasi, lalu tentukan sendiri kode link referral dan rekening pencairan Anda.",
    ikon: Link2,
    sorotan: "Bebas pilih kode unik (contoh: tokomaju, digitalpro, csbantu)",
  },
  {
    nomor: "02",
    judul: "Bagikan Link ke Komunitas & Relasi",
    ringkas: "Sebarkan link afiliasi ke grup bisnis, media sosial, atau klien UMKM yang membutuhkan admin WhatsApp AI 24/7.",
    ikon: MousePointerClick,
    sorotan: "Cookie atribusi 30 hari: daftar hari ini, beli minggu depan tetap terhitung",
  },
  {
    nomor: "03",
    judul: "Komisi Masuk Saat Paket Lunas",
    ringkas: "Begitu pengguna yang mendaftar lewat link Anda membeli paket langganan, komisi langsung masuk ke saldo afiliasi.",
    ikon: Sparkles,
    sorotan: "Transparan: lihat rincian transaksi, nama paket, dan nominal komisi real-time",
  },
  {
    nomor: "04",
    judul: "Tarik Saldo ke Bank atau E-Wallet",
    ringkas: "Ajukan pencairan kapan saja saat saldo mencapai batas minimum. Didukung transfer bank utama dan e-wallet populer.",
    ikon: Wallet,
    sorotan: "Mendukung BCA, Mandiri, BRI, BNI, BSI, Jago, SeaBank, GoPay, OVO, DANA, ShopeePay",
  },
];

export function AlurAfiliasiInteraktif({ domainContoh }: { domainContoh: string }) {
  const [langkahAktif, setLangkahAktif] = useState(0);
  const [kodeDemo, setKodeDemo] = useState("mitausaha");
  const [tersalin, setTersalin] = useState(false);

  const linkDemo = `${domainContoh}/?ref=${kodeDemo || "mitausaha"}`;

  function salinDemo() {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(linkDemo).catch(() => {});
    }
    setTersalin(true);
    setTimeout(() => setTersalin(false), 1800);
  }

  return (
    <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* Daftar Langkah */}
      <div className="space-y-3">
        {LANGKAH_INTERAKTIF.map((l, idx) => {
          const aktif = idx === langkahAktif;
          const Ikon = l.ikon;
          return (
            <button
              key={l.nomor}
              type="button"
              onClick={() => setLangkahAktif(idx)}
              className={`w-full rounded-3xl border p-5 text-left transition-all ${
                aktif
                  ? "border-accent bg-surface shadow-pop"
                  : "border-line bg-surface/60 hover:border-accent/30 hover:bg-surface"
              }`}
            >
              <div className="flex items-start gap-4">
                <span
                  className={`grid size-11 shrink-0 place-items-center rounded-2xl text-[13.5px] font-extrabold transition-colors ${
                    aktif ? "bg-accent text-on-accent" : "bg-subtle text-muted"
                  }`}
                >
                  <Ikon className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11.5px] font-extrabold tracking-[0.08em] text-accent uppercase">
                      Langkah {l.nomor}
                    </span>
                    {aktif && (
                      <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-bold text-accent">
                        Sedang dilihat
                      </span>
                    )}
                  </div>
                  <h3 className="mt-1 text-[16.5px] font-bold text-fg">{l.judul}</h3>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{l.ringkas}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Pratinjau Interaktif Ringan */}
      <div className="rounded-3xl border border-ink-line bg-ink p-6 text-ink-fg shadow-card sm:p-8">
        <div className="flex items-center justify-between border-b border-ink-line pb-4">
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-ink-signal" />
            <span className="text-[12.5px] font-bold text-white">
              Simulasi Dashboard Afiliasi · Langkah 0{langkahAktif + 1}
            </span>
          </div>
          <span className="rounded-lg border border-ink-line bg-white/[0.04] px-2.5 py-1 text-[11.5px] font-semibold text-ink-muted">
            Interaktif
          </span>
        </div>

        {langkahAktif === 0 && (
          <div className="mt-6 space-y-4">
            <p className="text-[13px] text-ink-muted">
              Coba ketik kode referral yang Anda inginkan untuk melihat tampilan link afiliasi Anda:
            </p>
            <div>
              <label htmlFor="input-kode-demo" className="text-[12px] font-bold text-ink-muted uppercase">
                Kode Referral Anda
              </label>
              <input
                id="input-kode-demo"
                type="text"
                maxLength={24}
                value={kodeDemo}
                onChange={(e) => setKodeDemo(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                placeholder="ketik-kode-anda"
                className="mt-1.5 w-full rounded-xl border border-ink-line bg-white/[0.05] px-4 py-2.5 text-[14px] font-bold text-white outline-none focus:border-ink-signal"
              />
            </div>
            <div className="rounded-2xl border border-ink-line bg-white/[0.03] p-4">
              <span className="text-[11.5px] font-semibold text-ink-muted">Link Siap Bagikan</span>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <code className="truncate text-[13.5px] font-bold text-ink-signal">{linkDemo}</code>
                <button
                  type="button"
                  onClick={salinDemo}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-ink-signal px-3 py-1.5 text-[12px] font-bold text-ink"
                >
                  {tersalin ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                  {tersalin ? "Tersalin" : "Salin"}
                </button>
              </div>
            </div>
          </div>
        )}

        {langkahAktif === 1 && (
          <div className="mt-6 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-ink-line bg-white/[0.03] p-4">
                <MousePointerClick className="size-4 text-ink-signal" aria-hidden />
                <p className="mt-2 text-2xl font-extrabold text-white tabular-nums">428</p>
                <p className="text-[11.5px] text-ink-muted">Klik Link Referral</p>
              </div>
              <div className="rounded-2xl border border-ink-line bg-white/[0.03] p-4">
                <Users className="size-4 text-ink-signal" aria-hidden />
                <p className="mt-2 text-2xl font-extrabold text-white tabular-nums">64</p>
                <p className="text-[11.5px] text-ink-muted">User Mendaftar</p>
              </div>
              <div className="rounded-2xl border border-ink-line bg-white/[0.03] p-4">
                <ShieldCheck className="size-4 text-ink-signal" aria-hidden />
                <p className="mt-2 text-2xl font-extrabold text-ink-signal tabular-nums">30 Hari</p>
                <p className="text-[11.5px] text-ink-muted">Masa Aktif Cookie</p>
              </div>
            </div>
            <div className="rounded-2xl border border-ink-line bg-white/[0.03] p-4 text-[13px] text-ink-muted">
              Saat calon pengguna membuka <code className="font-bold text-white">{linkDemo}</code>, sistem menyimpan cookie atribusi. Baik daftar via Email maupun Google OAuth, akun mereka otomatis terhubung ke kode Anda.
            </div>
          </div>
        )}

        {langkahAktif === 2 && (
          <div className="mt-6 space-y-3">
            {[
              { email: "tok***@gmail.com", paket: "Paket Bisnis", harga: 144_000, komisi: 28_800, waktu: "Baru saja" },
              { email: "kli***@usaha.id", paket: "Paket Pro", harga: 401_000, komisi: 80_200, waktu: "2 jam lalu" },
              { email: "kop***@mail.com", paket: "Paket Starter", harga: 99_000, komisi: 14_850, waktu: "Kemarin" },
            ].map((item) => (
              <div
                key={item.email}
                className="flex items-center justify-between gap-3 rounded-2xl border border-ink-line bg-white/[0.03] px-4 py-3"
              >
                <div>
                  <p className="text-[13.5px] font-bold text-white">{item.paket}</p>
                  <p className="text-[12px] text-ink-muted">
                    Oleh {item.email} · Transaksi Rp{angka(item.harga)} · {item.waktu}
                  </p>
                </div>
                <span className="rounded-xl bg-ink-signal/15 px-3 py-1.5 text-[13px] font-extrabold text-ink-signal tabular-nums">
                  +Rp{angka(item.komisi)}
                </span>
              </div>
            ))}
          </div>
        )}

        {langkahAktif === 3 && (
          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between rounded-2xl border border-ink-line bg-white/[0.03] p-4">
              <div>
                <p className="text-[12px] font-semibold text-ink-muted">Saldo Siap Dicairkan</p>
                <p className="mt-1 text-2xl font-extrabold text-white tabular-nums">Rp1.450.000</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-ink-signal px-3.5 py-2 text-[12.5px] font-bold text-ink">
                <Banknote className="size-4" aria-hidden /> Siap Tarik
              </span>
            </div>
            <div className="rounded-2xl border border-ink-line bg-white/[0.03] p-4">
              <div className="flex items-center justify-between text-[12.5px]">
                <span className="font-semibold text-ink-muted">Metode Pencairan Terdaftar</span>
                <span className="font-bold text-ink-signal">Terverifikasi</span>
              </div>
              <p className="mt-1.5 text-[14px] font-bold text-white">BCA · 8720••••91 a.n. Mitra Usaha</p>
              <p className="mt-1 text-[12px] text-ink-muted">
                Pencairan diproses ke rekening Bank atau E-Wallet tanpa potongan tersembunyi.
              </p>
            </div>
          </div>
        )}

        <div className="mt-5 flex items-center justify-between border-t border-ink-line pt-4 text-[12px] text-ink-muted">
          <span>{LANGKAH_INTERAKTIF[langkahAktif].sorotan}</span>
          <div className="flex gap-1.5">
            {LANGKAH_INTERAKTIF.map((l, i) => (
              <button
                key={l.nomor}
                type="button"
                aria-label={`Pilih langkah ${l.nomor}`}
                onClick={() => setLangkahAktif(i)}
                className={`h-2 rounded-full transition-all ${
                  i === langkahAktif ? "w-6 bg-ink-signal" : "w-2 bg-white/20 hover:bg-white/40"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
