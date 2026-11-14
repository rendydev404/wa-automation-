"use client";

import { useActionState, useState, useTransition } from "react";
import {
  Ban,
  Calendar,
  Check,
  Copy,
  Link2,
  MessageSquare,
  Plus,
  Search,
  Smartphone,
  Sparkles,
  Ticket,
  X,
} from "lucide-react";
import {
  adminBatalVoucherAction,
  adminBuatVoucherAction,
  adminCariVoucherAction,
  adminPengaturanVoucherAction,
} from "@/app/actions";
import { TombolSalin } from "@/components/tombol-salin";
import { Pesan, Saklar, SubmitButton } from "@/components/ui";
import { angka, waktuSingkatWib } from "@/lib/format";
import type {
  BarisVoucher,
  ModeKlaimVoucher,
  PengaturanVoucher,
  RingkasanVoucher,
  StatusVoucher,
} from "@/lib/voucher-def";

const CHIP_BALASAN = [500, 1500, 3000, 5000, 10000] as const;
const CHIP_NOMOR = [1, 2, 3, 5] as const;
const CHIP_HARI = [14, 30, 60, 90, 365] as const;

interface Props {
  pengaturanAwal: PengaturanVoucher;
  ringkasanAwal: RingkasanVoucher;
  daftarAwal: BarisVoucher[];
}

export function PanelVoucherAdmin({ pengaturanAwal, ringkasanAwal, daftarAwal }: Props) {
  const [hasilSetelan, aksiSetelan] = useActionState(adminPengaturanVoucherAction, null);

  const [aktif, setAktif] = useState(pengaturanAwal.aktif);
  const [namaPaket, setNamaPaket] = useState(pengaturanAwal.nama_paket);
  const [kuotaBalasan, setKuotaBalasan] = useState(pengaturanAwal.kuota_balasan);
  const [kuotaNomor, setKuotaNomor] = useState(pengaturanAwal.kuota_nomor);
  const [durasiHari, setDurasiHari] = useState(pengaturanAwal.durasi_hari);
  const [modeKlaim, setModeKlaim] = useState<ModeKlaimVoucher>(pengaturanAwal.mode_klaim);

  // State buat voucher manual
  const [bukaBuat, setBukaBuat] = useState(false);
  const [jmlBuat, setJmlBuat] = useState(1);
  const [namaBuat, setNamaBuat] = useState(pengaturanAwal.nama_paket);
  const [balasanBuat, setBalasanBuat] = useState(pengaturanAwal.kuota_balasan);
  const [nomorBuat, setNomorBuat] = useState(pengaturanAwal.kuota_nomor);
  const [hariBuat, setHariBuat] = useState(pengaturanAwal.durasi_hari);
  const [emailBuat, setEmailBuat] = useState("");
  const [pembeliNamaBuat, setPembeliNamaBuat] = useState("");
  const [catatanBuat, setCatatanBuat] = useState("");
  const [sedangBuat, mulaiBuat] = useTransition();
  const [pesanBuat, setPesanBuat] = useState<{ ok: boolean; teks: string } | null>(null);
  const [voucherBaru, setVoucherBaru] = useState<BarisVoucher[]>([]);

  // State daftar & filter
  const [daftar, setDaftar] = useState<BarisVoucher[]>(daftarAwal);
  const [ringkasan, setRingkasan] = useState<RingkasanVoucher>(ringkasanAwal);
  const [statusFilter, setStatusFilter] = useState<StatusVoucher | "semua">("semua");
  const [kataKunci, setKataKunci] = useState("");
  const [sedangCari, mulaiCari] = useTransition();
  const [konfirmasiBatalId, setKonfirmasiBatalId] = useState<number | null>(null);
  const [sedangBatalId, setSedangBatalId] = useState<number | null>(null);
  const [tautanDisalinId, setTautanDisalinId] = useState<number | null>(null);

  function muatUlangDaftar(st: StatusVoucher | "semua", q: string) {
    mulaiCari(async () => {
      const res = await adminCariVoucherAction({ status: st, q });
      if (res.ok) setDaftar(res.daftar);
    });
  }

  function tanganiBuatManual(e: React.FormEvent) {
    e.preventDefault();
    setPesanBuat(null);
    mulaiBuat(async () => {
      const res = await adminBuatVoucherAction({
        jumlah: jmlBuat,
        nama_paket: namaBuat,
        kuota_balasan: balasanBuat,
        kuota_nomor: nomorBuat,
        durasi_hari: hariBuat,
        pembeli_email: emailBuat.trim() || undefined,
        pembeli_nama: pembeliNamaBuat.trim() || undefined,
        catatan: catatanBuat.trim() || undefined,
      });
      setPesanBuat({ ok: res.ok, teks: res.pesan ?? "" });
      if (res.ok && res.daftar) {
        setVoucherBaru(res.daftar);
        setDaftar((lama) => [...res.daftar!, ...lama].slice(0, 80));
        setRingkasan((r) => ({
          ...r,
          total: r.total + res.daftar!.length,
          belum_diklaim: r.belum_diklaim + res.daftar!.length,
          dari_admin: r.dari_admin + res.daftar!.length,
        }));
        setEmailBuat("");
        setPembeliNamaBuat("");
        setCatatanBuat("");
      }
    });
  }

  async function tanganiBatalVoucher(id: number) {
    setSedangBatalId(id);
    const res = await adminBatalVoucherAction(id);
    setSedangBatalId(null);
    setKonfirmasiBatalId(null);
    if (res.ok) {
      setDaftar((lama) => lama.map((v) => (v.id === id ? { ...v, status: "dibatalkan" } : v)));
      setRingkasan((r) => ({
        ...r,
        belum_diklaim: Math.max(0, r.belum_diklaim - 1),
        dibatalkan: r.dibatalkan + 1,
      }));
    }
  }

  function salinTautanKlaim(v: BarisVoucher) {
    const asal = typeof window !== "undefined" ? window.location.origin : "https://chatgercep.com";
    const url = `${asal}/langganan?voucher=${encodeURIComponent(v.kode)}`;
    void navigator.clipboard?.writeText(url);
    setTautanDisalinId(v.id);
    setTimeout(() => setTautanDisalinId((kini) => (kini === v.id ? null : kini)), 1800);
  }

  return (
    <div className="space-y-6">
      {/* Metrik Ringkasan Voucher */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-line bg-subtle/40 p-3.5">
          <div className="text-[11.5px] font-medium text-muted">Total Voucher Terbit</div>
          <div className="mt-1 text-xl font-bold tabular-nums text-fg">{angka(ringkasan.total)}</div>
          <div className="mt-0.5 text-[11.5px] text-muted">
            {angka(ringkasan.dari_panduan)} panduan · {angka(ringkasan.dari_admin)} manual
          </div>
        </div>
        <div className="rounded-xl border border-line bg-subtle/40 p-3.5">
          <div className="text-[11.5px] font-medium text-muted">Belum Diklaim</div>
          <div className="mt-1 text-xl font-bold tabular-nums text-warning">{angka(ringkasan.belum_diklaim)}</div>
          <div className="mt-0.5 text-[11.5px] text-muted">Siap diaktifkan pembeli</div>
        </div>
        <div className="rounded-xl border border-line bg-subtle/40 p-3.5">
          <div className="text-[11.5px] font-medium text-muted">Sudah Diklaim</div>
          <div className="mt-1 text-xl font-bold tabular-nums text-success">{angka(ringkasan.diklaim)}</div>
          <div className="mt-0.5 text-[11.5px] text-muted">Paket & kuota aktif</div>
        </div>
        <div className="rounded-xl border border-line bg-subtle/40 p-3.5">
          <div className="text-[11.5px] font-medium text-muted">Dibatalkan</div>
          <div className="mt-1 text-xl font-bold tabular-nums text-muted">{angka(ringkasan.dibatalkan)}</div>
          <div className="mt-0.5 text-[11.5px] text-muted">Tidak berlaku lagi</div>
        </div>
      </div>

      {/* Form Pengaturan Paket Voucher Panduan */}
      <form action={aksiSetelan} className="rounded-xl border border-line bg-subtle/25 p-4 sm:p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
          <div>
            <h3 className="text-[14.5px] font-bold text-fg">Spesifikasi Paket Voucher Panduan (Default)</h3>
            <p className="mt-0.5 text-[12.5px] text-muted">
              Setiap kali ada pembelian Panduan ChatGerCep di akbaralatas.com, voucher yang terbit otomatis membawa kuota & durasi di bawah ini.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            {aktif && <input type="hidden" name="aktif" value="on" />}
            <span className="text-[12.5px] font-semibold text-fg">
              {aktif ? "Klaim Voucher Aktif" : "Klaim Voucher Nonaktif"}
            </span>
            <Saklar
              aktif={aktif}
              onUbah={setAktif}
              label="Aktifkan klaim voucher"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="vcr-nama-paket" className="label">
              Nama Paket Saat Diklaim
            </label>
            <input
              id="vcr-nama-paket"
              name="nama_paket"
              type="text"
              required
              maxLength={60}
              value={namaPaket}
              onChange={(e) => setNamaPaket(e.target.value)}
              className="field"
              placeholder="Paket Panduan"
            />
          </div>

          <div>
            <label htmlFor="vcr-kuota-balasan" className="label">
              Kuota Balasan AI
            </label>
            <input
              id="vcr-kuota-balasan"
              name="kuota_balasan"
              type="number"
              min={1}
              max={10000000}
              required
              value={kuotaBalasan}
              onChange={(e) => setKuotaBalasan(Math.max(1, Number(e.target.value) || 0))}
              className="field tabular-nums"
            />
            <div className="mt-1.5 flex flex-wrap gap-1">
              {CHIP_BALASAN.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setKuotaBalasan(n)}
                  className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                    kuotaBalasan === n
                      ? "bg-accent text-on-accent"
                      : "border border-line bg-surface text-muted hover:text-fg"
                  }`}
                >
                  {angka(n)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="vcr-kuota-nomor" className="label">
              Kuota Nomor WhatsApp
            </label>
            <input
              id="vcr-kuota-nomor"
              name="kuota_nomor"
              type="number"
              min={1}
              max={100}
              required
              value={kuotaNomor}
              onChange={(e) => setKuotaNomor(Math.max(1, Number(e.target.value) || 0))}
              className="field tabular-nums"
            />
            <div className="mt-1.5 flex flex-wrap gap-1">
              {CHIP_NOMOR.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setKuotaNomor(n)}
                  className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                    kuotaNomor === n
                      ? "bg-accent text-on-accent"
                      : "border border-line bg-surface text-muted hover:text-fg"
                  }`}
                >
                  {n} nomor
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="vcr-durasi-hari" className="label">
              Masa Aktif (Hari)
            </label>
            <input
              id="vcr-durasi-hari"
              name="durasi_hari"
              type="number"
              min={1}
              max={3650}
              required
              value={durasiHari}
              onChange={(e) => setDurasiHari(Math.max(1, Number(e.target.value) || 0))}
              className="field tabular-nums"
            />
            <div className="mt-1.5 flex flex-wrap gap-1">
              {CHIP_HARI.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setDurasiHari(n)}
                  className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                    durasiHari === n
                      ? "bg-accent text-on-accent"
                      : "border border-line bg-surface text-muted hover:text-fg"
                  }`}
                >
                  {n} hari
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Pilihan Mode Klaim */}
        <div>
          <input type="hidden" name="mode_klaim" value={modeKlaim} />
          <div className="label mb-1.5">Aturan Bila Pengguna Sudah Punya Paket Aktif</div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setModeKlaim("tambah")}
              className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition-colors ${
                modeKlaim === "tambah"
                  ? "border-accent bg-accent-soft/40 text-fg"
                  : "border-line bg-surface text-muted hover:border-line-strong"
              }`}
            >
              <span
                className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border ${
                  modeKlaim === "tambah" ? "border-accent bg-accent text-on-accent" : "border-line-strong"
                }`}
              >
                {modeKlaim === "tambah" && <Check className="size-2.5 stroke-[3]" />}
              </span>
              <div>
                <div className="text-[13px] font-semibold text-fg">
                  Akumulasi Kuota & Perpanjang Masa Aktif (Disarankan)
                </div>
                <div className="mt-0.5 text-[12px] text-muted">
                  Sisa kuota balasan AI pengguna saat ini tidak hangus; kuota dan durasi hari dari voucher ditambahkan ke paket aktifnya.
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setModeKlaim("ganti")}
              className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition-colors ${
                modeKlaim === "ganti"
                  ? "border-accent bg-accent-soft/40 text-fg"
                  : "border-line bg-surface text-muted hover:border-line-strong"
              }`}
            >
              <span
                className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border ${
                  modeKlaim === "ganti" ? "border-accent bg-accent text-on-accent" : "border-line-strong"
                }`}
              >
                {modeKlaim === "ganti" && <Check className="size-2.5 stroke-[3]" />}
              </span>
              <div>
                <div className="text-[13px] font-semibold text-fg">Mulai Paket Baru</div>
                <div className="mt-0.5 text-[12px] text-muted">
                  Mengganti paket aktif yang sedang berjalan dan memulai periode baru sesuai kuota & durasi voucher.
                </div>
              </div>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="text-[12.5px] text-muted">
            Ringkasan hadiah voucher saat ini:{" "}
            <b className="font-semibold text-fg">{namaPaket || "Paket Panduan"}</b> ·{" "}
            <b className="font-semibold text-accent">+{angka(kuotaBalasan)} balasan AI</b> ·{" "}
            <b className="font-semibold text-fg">{kuotaNomor} nomor WA</b> ·{" "}
            <b className="font-semibold text-fg">{durasiHari} hari</b>
          </div>
          <SubmitButton className="btn btn-primary">Simpan Pengaturan Voucher</SubmitButton>
        </div>
        <Pesan ok={hasilSetelan?.ok ?? false}>{hasilSetelan?.pesan}</Pesan>
      </form>

      {/* Buat Voucher Manual */}
      <div className="rounded-xl border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[14.5px] font-bold text-fg">Buat Kode Voucher Manual (Giveaway / Promo / Pembeli Langsung)</h3>
            <p className="mt-0.5 text-[12.5px] text-muted">
              Buat kode voucher <code className="font-mono font-semibold text-fg">CG-XXXX-XXXX</code> kapan saja dengan kuota khusus. Jika email pembeli diisi, voucher otomatis terdeteksi saat mereka login.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setBukaBuat((b) => !b);
              if (!bukaBuat) {
                setNamaBuat(namaPaket);
                setBalasanBuat(kuotaBalasan);
                setNomorBuat(kuotaNomor);
                setHariBuat(durasiHari);
              }
            }}
            className="btn btn-secondary h-9 px-3.5 text-[13px]"
          >
            <Plus className="size-4" />
            {bukaBuat ? "Tutup Form" : "Buat Voucher Baru"}
          </button>
        </div>

        {bukaBuat && (
          <form onSubmit={tanganiBuatManual} className="mt-4 space-y-4 border-t border-line pt-4">
            <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <label htmlFor="buat-jml" className="label">
                  Jumlah Kode (1–50)
                </label>
                <input
                  id="buat-jml"
                  type="number"
                  min={1}
                  max={50}
                  required
                  value={jmlBuat}
                  onChange={(e) => setJmlBuat(Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
                  className="field tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="buat-nama" className="label">
                  Nama Paket
                </label>
                <input
                  id="buat-nama"
                  type="text"
                  required
                  maxLength={60}
                  value={namaBuat}
                  onChange={(e) => setNamaBuat(e.target.value)}
                  className="field"
                />
              </div>
              <div>
                <label htmlFor="buat-balasan" className="label">
                  Kuota Balasan AI
                </label>
                <input
                  id="buat-balasan"
                  type="number"
                  min={1}
                  max={10000000}
                  required
                  value={balasanBuat}
                  onChange={(e) => setBalasanBuat(Math.max(1, Number(e.target.value) || 1))}
                  className="field tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="buat-nomor" className="label">
                  Kuota Nomor WA
                </label>
                <input
                  id="buat-nomor"
                  type="number"
                  min={1}
                  max={100}
                  required
                  value={nomorBuat}
                  onChange={(e) => setNomorBuat(Math.max(1, Number(e.target.value) || 1))}
                  className="field tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="buat-hari" className="label">
                  Durasi (Hari)
                </label>
                <input
                  id="buat-hari"
                  type="number"
                  min={1}
                  max={3650}
                  required
                  value={hariBuat}
                  onChange={(e) => setHariBuat(Math.max(1, Number(e.target.value) || 1))}
                  className="field tabular-nums"
                />
              </div>
            </div>

            <div className="grid gap-3.5 sm:grid-cols-3">
              <div>
                <label htmlFor="buat-email" className="label">
                  Email Pembeli (Opsional — untuk deteksi 1-klik)
                </label>
                <input
                  id="buat-email"
                  type="email"
                  value={emailBuat}
                  onChange={(e) => setEmailBuat(e.target.value)}
                  placeholder="pembeli@email.com"
                  className="field"
                />
              </div>
              <div>
                <label htmlFor="buat-pembeli-nama" className="label">
                  Nama Pembeli / Penerima (Opsional)
                </label>
                <input
                  id="buat-pembeli-nama"
                  type="text"
                  maxLength={120}
                  value={pembeliNamaBuat}
                  onChange={(e) => setPembeliNamaBuat(e.target.value)}
                  placeholder="Nama penerima"
                  className="field"
                />
              </div>
              <div>
                <label htmlFor="buat-catatan" className="label">
                  Catatan Admin (Opsional)
                </label>
                <input
                  id="buat-catatan"
                  type="text"
                  maxLength={250}
                  value={catatanBuat}
                  onChange={(e) => setCatatanBuat(e.target.value)}
                  placeholder="Misal: Bonus kelas batch 3"
                  className="field"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button type="submit" disabled={sedangBuat} className="btn btn-primary">
                <Sparkles className="size-4" />
                {sedangBuat ? "Membuat Kode Voucher…" : `Generate ${jmlBuat} Voucher Sekarang`}
              </button>
            </div>
            {pesanBuat && <Pesan ok={pesanBuat.ok}>{pesanBuat.teks}</Pesan>}

            {voucherBaru.length > 0 && (
              <div className="rounded-xl border border-success/30 bg-success-soft p-3.5">
                <div className="text-[12.5px] font-semibold text-fg">
                  Kode Voucher Baru Siap Dibagikan ({voucherBaru.length}):
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {voucherBaru.map((v) => (
                    <div
                      key={v.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 text-[13px]"
                    >
                      <span className="font-mono font-bold text-accent">{v.kode}</span>
                      <TombolSalin teks={v.kode} label={`Salin kode ${v.kode}`} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </form>
        )}
      </div>

      {/* Daftar & Filter Voucher */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { nilai: "semua", label: "Semua" },
                { nilai: "belum_diklaim", label: "Belum Diklaim" },
                { nilai: "diklaim", label: "Sudah Diklaim" },
                { nilai: "dibatalkan", label: "Dibatalkan" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.nilai}
                type="button"
                onClick={() => {
                  setStatusFilter(tab.nilai);
                  muatUlangDaftar(tab.nilai, kataKunci);
                }}
                className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                  statusFilter === tab.nilai
                    ? "bg-accent text-on-accent"
                    : "bg-subtle text-muted hover:text-fg"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              muatUlangDaftar(statusFilter, kataKunci);
            }}
            className="flex items-center gap-2"
          >
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
              <input
                type="text"
                value={kataKunci}
                onChange={(e) => setKataKunci(e.target.value)}
                placeholder="Cari kode, email, order ID…"
                className="field h-9 w-56 pl-8 pr-8 text-[12.5px] sm:w-64"
              />
              {kataKunci && (
                <button
                  type="button"
                  onClick={() => {
                    setKataKunci("");
                    muatUlangDaftar(statusFilter, "");
                  }}
                  aria-label="Bersihkan pencarian"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-fg"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <button type="submit" disabled={sedangCari} className="btn btn-secondary h-9 px-3 text-[12.5px]">
              {sedangCari ? "Mencari…" : "Cari"}
            </button>
          </form>
        </div>

        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-line bg-subtle/60 text-[11.5px] font-semibold uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-3">Kode Voucher</th>
                <th className="px-4 py-3">Sumber & Pembeli</th>
                <th className="px-4 py-3">Paket & Kuota</th>
                <th className="px-4 py-3">Status Klaim</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {daftar.map((v) => (
                <tr key={v.id} className="hover:bg-subtle/30">
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-[13.5px] font-bold tracking-wider text-accent">
                        {v.kode}
                      </span>
                      <TombolSalin teks={v.kode} label={`Salin voucher ${v.kode}`} />
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-muted">
                      {waktuSingkatWib(v.dibuat)}
                    </div>
                  </td>

                  <td className="px-4 py-3 align-top">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
                          v.sumber === "panduan"
                            ? "bg-accent-soft text-accent"
                            : "bg-subtle text-muted"
                        }`}
                      >
                        {v.sumber === "panduan" ? "Web Panduan" : "Manual Admin"}
                      </span>
                      {v.order_id && (
                        <span className="font-mono text-[11.5px] font-semibold text-fg">
                          #{v.order_id}
                        </span>
                      )}
                    </div>
                    {(v.pembeli_nama || v.pembeli_email) && (
                      <div className="mt-1 text-[12px] text-fg">
                        {v.pembeli_nama && <span className="font-medium">{v.pembeli_nama}</span>}
                        {v.pembeli_nama && v.pembeli_email && " · "}
                        {v.pembeli_email && <span className="text-muted">{v.pembeli_email}</span>}
                      </div>
                    )}
                    {v.catatan && (
                      <div className="mt-0.5 text-[11.5px] text-muted">{v.catatan}</div>
                    )}
                  </td>

                  <td className="px-4 py-3 align-top">
                    <div className="font-semibold text-fg">{v.nama_paket}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
                      <span className="inline-flex items-center gap-1 font-medium text-fg">
                        <MessageSquare className="size-3 text-accent" />
                        +{angka(v.kuota_balasan)} AI
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Smartphone className="size-3" />
                        {v.kuota_nomor} WA
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="size-3" />
                        {v.durasi_hari} hari
                      </span>
                    </div>
                  </td>

                  <td className="px-4 py-3 align-top">
                    {v.status === "diklaim" ? (
                      <div>
                        <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-0.5 text-[11.5px] font-semibold text-success">
                          <Check className="size-3" /> Sudah Diklaim
                        </span>
                        <div className="mt-1 text-[12px] font-medium text-fg">
                          {v.diklaim_email ?? `User #${v.diklaim_oleh}`}
                        </div>
                        {v.diklaim_pada && (
                          <div className="text-[11.5px] text-muted">
                            {waktuSingkatWib(v.diklaim_pada)}
                          </div>
                        )}
                      </div>
                    ) : v.status === "dibatalkan" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-subtle px-2.5 py-0.5 text-[11.5px] font-semibold text-muted">
                        Dibatalkan
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2.5 py-0.5 text-[11.5px] font-semibold text-warning">
                        Belum Diklaim
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3 text-right align-top">
                    {v.status === "belum_diklaim" && (
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => salinTautanKlaim(v)}
                          className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1 text-[12px] font-medium text-fg hover:bg-subtle"
                          title="Salin link klaim langsung"
                        >
                          {tautanDisalinId === v.id ? (
                            <>
                              <Check className="size-3.5 text-success" /> Tersalin
                            </>
                          ) : (
                            <>
                              <Link2 className="size-3.5 text-muted" /> Link Klaim
                            </>
                          )}
                        </button>

                        {konfirmasiBatalId === v.id ? (
                          <div className="inline-flex items-center gap-1 rounded-lg border border-danger/30 bg-danger-soft px-2 py-1 text-[11.5px]">
                            <span className="font-semibold text-danger">Batalkan?</span>
                            <button
                              type="button"
                              disabled={sedangBatalId === v.id}
                              onClick={() => tanganiBatalVoucher(v.id)}
                              className="rounded bg-danger px-2 py-0.5 font-semibold text-white"
                            >
                              {sedangBatalId === v.id ? "…" : "Ya"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setKonfirmasiBatalId(null)}
                              className="px-1.5 font-medium text-muted hover:text-fg"
                            >
                              Tidak
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setKonfirmasiBatalId(v.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[12px] text-muted hover:border-danger/40 hover:text-danger"
                            title="Batalkan voucher ini"
                          >
                            <Ban className="size-3.5" /> Batalkan
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {daftar.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-[13px] text-muted">
                    Belum ada data voucher yang sesuai filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
