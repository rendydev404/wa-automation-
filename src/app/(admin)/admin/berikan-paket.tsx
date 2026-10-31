"use client";

import { startTransition, useActionState, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { CalendarClock, Check, CircleAlert, Loader2, MessageCircle, Sparkles } from "lucide-react";
import { adminBerikanPaketAction } from "@/app/actions";
import { Pesan } from "@/components/ui";
import { angka, tanggal } from "@/lib/format";
import { DURASI_CEPAT, KODE_CUSTOM, type KonteksHarga, type SpekCustom, hitungCustom } from "@/lib/paket-custom-def";
import { Chip, InputAngka } from "./paket-custom";

export interface PaketPilihan {
  id: number;
  kode: string;
  nama: string;
  harga: number;
  durasi_hari: number;
  kuota_nomor: number;
  kuota_balasan: number;
  aktif: boolean;
}

export interface LanggananSekarang {
  paket_id: number | null;
  nama_paket: string;
  sampai: number;
  kuota_balasan: number;
}

const METODE = [
  { id: "manual_transfer", label: "Transfer bank" },
  { id: "manual_qris", label: "QRIS / e-wallet" },
  { id: "manual_tunai", label: "Tunai" },
  { id: "manual_lainnya", label: "Lainnya" },
  { id: "kompensasi", label: "Gratis / kompensasi" },
] as const;
type Metode = (typeof METODE)[number]["id"];

const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;

/**
 * Aktifkan paket untuk satu akun setelah pembayaran di luar Midtrans (transfer, tunai, dsb.) atau sebagai kompensasi:
 * pilih paket terdaftar (termasuk Custom) atau isi khusus hasil kesepakatan, catat pembayarannya, periksa ringkasan
 * (diperpanjang / mengganti / baru, tanggal berlaku, kuota), lalu konfirmasi. Pembayaran tercatat sebagai transaksi.
 */
export function BerikanPaket({
  userId,
  paket,
  sekarang: aktif,
  kini,
  saran,
  bisaKabari,
}: {
  userId: number;
  paket: PaketPilihan[];
  sekarang: LanggananSekarang | null;
  /** Detik epoch saat halaman dirender (untuk tanggal di ringkasan). */
  kini: number;
  /** Rumus & asumsi Paket Custom, untuk harga saran isi khusus; null bila tarif model acuan tidak diketahui. */
  saran: { spek: SpekCustom; konteks: KonteksHarga } | null;
  /** Akun punya nomor WhatsApp yang tersambung dan bernomor penerus (tujuan kabar). */
  bisaKabari: boolean;
}) {
  const [hasil, aksi, menyimpan] = useActionState(adminBerikanPaketAction, null);
  const [pilih, setPilih] = useState<number | "khusus" | null>(null);
  const [hari, setHari] = useState(30);
  const [nama, setNama] = useState("Custom");
  const [balasan, setBalasan] = useState(10_000);
  const [nomor, setNomor] = useState(5);
  const [metode, setMetode] = useState<Metode>("manual_transfer");
  const [jumlah, setJumlah] = useState(0);
  const [catatan, setCatatan] = useState("");
  const [kabari, setKabari] = useState(bisaKabari);
  const [tanya, setTanya] = useState(false);

  const p = typeof pilih === "number" ? paket.find((x) => x.id === pilih) : undefined;
  const khusus = pilih === "khusus";
  const isi = khusus ? { nama: nama.trim(), kuota_balasan: balasan, kuota_nomor: nomor } : p ? { nama: p.nama, kuota_balasan: p.kuota_balasan, kuota_nomor: p.kuota_nomor } : null;
  const hargaSaran = khusus && saran ? hitungCustom({ ...saran.spek, kuota_balasan: balasan, kuota_nomor: nomor, nomor_otomatis: false, durasi_hari: hari, harga_manual: false }, saran.konteks).hargaOtomatis : null;
  const diperpanjang = !!aktif && !!p && aktif.paket_id === p.id;
  const sampai = diperpanjang && aktif ? aktif.sampai + hari * 86400 : kini + hari * 86400;
  const kompensasi = metode === "kompensasi";
  const kurang = !isi ? "Pilih paket dulu." : khusus && isi.nama.length < 2 ? "Isi nama paket khusus." : !kompensasi && jumlah < 1 ? "Isi jumlah yang diterima." : null;

  // Hasil baru yang berhasil: formulir dikosongkan untuk pemberian berikutnya (disesuaikan saat render, bukan di effect).
  const [hasilLalu, setHasilLalu] = useState(hasil);
  if (hasil !== hasilLalu) {
    setHasilLalu(hasil);
    if (hasil?.ok) {
      setPilih(null);
      setJumlah(0);
      setCatatan("");
      setTanya(false);
    }
  }

  const pilihPaket = (x: PaketPilihan) => {
    setPilih(x.id);
    setHari(x.durasi_hari);
    setJumlah(x.harga);
    setTanya(false);
  };
  const pilihKhusus = () => {
    setPilih("khusus");
    setTanya(false);
    if (!jumlah) setJumlah(0);
  };

  const kirim = (e: FormEvent) => {
    e.preventDefault();
    if (kurang) return;
    if (!tanya) return setTanya(true);
    const fd = new FormData();
    fd.set("id", String(userId));
    fd.set("mode", khusus ? "khusus" : "paket");
    if (p) fd.set("paket", String(p.id));
    fd.set("hari", String(hari));
    if (khusus) {
      fd.set("nama", nama);
      fd.set("kuota_balasan", String(balasan));
      fd.set("kuota_nomor", String(nomor));
    }
    fd.set("metode", metode);
    fd.set("jumlah", String(kompensasi ? 0 : jumlah));
    fd.set("catatan", catatan);
    if (kabari && bisaKabari) fd.set("kabari", "on");
    startTransition(() => aksi(fd));
  };

  return (
    <form onSubmit={kirim} className="space-y-5">
      <fieldset>
        <legend className="label">1. Paket</legend>
        <div role="radiogroup" aria-label="Paket" className="space-y-1.5">
          {paket.map((x) => (
            <PilihanBaris key={x.id} aktif={pilih === x.id} onPilih={() => pilihPaket(x)}>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold">
                  {x.nama}
                  {x.kode === KODE_CUSTOM && <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[10.5px] font-bold text-accent">Custom</span>}
                  {!x.aktif && x.kode !== KODE_CUSTOM && <span className="rounded-md bg-subtle px-1.5 py-0.5 text-[10.5px] font-semibold text-muted">tidak dijual</span>}
                  {aktif?.paket_id === x.id && <span className="rounded-md bg-success-soft px-1.5 py-0.5 text-[10.5px] font-bold text-success">sedang aktif</span>}
                </span>
                <span className="block text-[12px] text-muted tabular-nums">
                  {angka(x.kuota_balasan)} balasan · {angka(x.kuota_nomor)} nomor · {x.durasi_hari} hari
                </span>
              </span>
              <span className="shrink-0 text-[13px] font-bold tabular-nums">{x.harga > 0 ? rp(x.harga) : "Rp0"}</span>
            </PilihanBaris>
          ))}
          <PilihanBaris aktif={khusus} onPilih={pilihKhusus}>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                <Sparkles className="size-3.5 text-accent" aria-hidden /> Isi khusus untuk akun ini
              </span>
              <span className="block text-[12px] text-muted">Kuota, nomor, dan durasi hasil kesepakatan. Tidak mengubah paket mana pun.</span>
            </span>
          </PilihanBaris>
        </div>
        {!paket.some((x) => x.kode === KODE_CUSTOM) && (
          <p className="mt-1.5 text-[11.5px] text-faint">Paket Custom muncul di sini setelah disimpan di Paket &amp; harga → Paket Custom.</p>
        )}
      </fieldset>

      {pilih !== null && (
        <div className="animate-masuk space-y-3 rounded-xl border border-line bg-subtle/40 p-3.5">
          {khusus && (
            <>
              <label className="block">
                <span className="label">Nama paket (tampil di akun pelanggan)</span>
                <input value={nama} onChange={(e) => setNama(e.target.value)} maxLength={60} className="field" />
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label htmlFor="bp-balasan" className="label">
                    Kuota balasan AI
                  </label>
                  <InputAngka id="bp-balasan" nilai={balasan} onUbah={setBalasan} min={1} maks={10_000_000} />
                </div>
                <div>
                  <label htmlFor="bp-nomor" className="label">
                    Nomor WhatsApp
                  </label>
                  <InputAngka id="bp-nomor" nilai={nomor} onUbah={setNomor} min={1} maks={1000} />
                </div>
              </div>
            </>
          )}
          <div>
            <span className="label">Durasi</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {DURASI_CEPAT.map((d) => (
                <Chip key={d.hari} aktif={hari === d.hari} onClick={() => setHari(d.hari)}>
                  {d.label}
                </Chip>
              ))}
              <span className="w-24">
                <InputAngka id="bp-hari" label="Durasi (hari)" nilai={hari} onUbah={setHari} min={1} maks={3660} akhiran="hari" kecil />
              </span>
            </div>
            {p && hari !== p.durasi_hari && <p className="mt-1 text-[11.5px] text-muted">Durasi diubah dari bawaan paket ({p.durasi_hari} hari); kuota tetap sesuai paket.</p>}
          </div>
        </div>
      )}

      <fieldset>
        <legend className="label">2. Pembayaran</legend>
        <div className="flex flex-wrap gap-1.5">
          {METODE.map((m) => (
            <Chip key={m.id} aktif={metode === m.id} onClick={() => (setMetode(m.id), setTanya(false))}>
              {m.label}
            </Chip>
          ))}
        </div>
        {!kompensasi && (
          <div className="mt-2.5 space-y-2.5">
            <div>
              <label htmlFor="bp-jumlah" className="label">
                Jumlah yang diterima
              </label>
              <InputAngka id="bp-jumlah" nilai={jumlah} onUbah={setJumlah} min={0} maks={2_000_000_000} awalan="Rp" kosongBilaNol />
              <div className="mt-1 flex flex-wrap gap-x-3 text-[11.5px]">
                {p && p.harga > 0 && jumlah !== p.harga && (
                  <button type="button" onClick={() => setJumlah(p.harga)} className="font-semibold text-accent hover:underline">
                    Pakai harga paket {rp(p.harga)}
                  </button>
                )}
                {hargaSaran !== null && (
                  <span className="text-muted">
                    Harga saran {rp(hargaSaran)} (rumus Paket Custom, margin {saran?.spek.margin}%){" "}
                    {jumlah !== hargaSaran && (
                      <button type="button" onClick={() => setJumlah(hargaSaran)} className="font-semibold text-accent hover:underline">
                        Pakai
                      </button>
                    )}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
        <label className="mt-2.5 block">
          <span className="label">Catatan / referensi (opsional)</span>
          <input value={catatan} onChange={(e) => setCatatan(e.target.value)} maxLength={300} placeholder={kompensasi ? "mis. kompensasi gangguan 30 Okt" : "mis. BCA a.n. Budi, 31 Okt 10.15"} className="field" />
        </label>
      </fieldset>

      {isi && (
        <div className="space-y-1.5 rounded-xl border border-accent/30 bg-accent-soft/30 p-3.5 text-[12.5px]">
          <p className="text-[11.5px] font-semibold tracking-[0.08em] text-muted uppercase">3. Ringkasan</p>
          <p className="font-semibold">
            {isi.nama || "(tanpa nama)"}
            {khusus && <span className="font-normal text-muted"> · isi khusus</span>}
          </p>
          <p className="flex gap-1.5 text-muted">
            <CalendarClock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              {diperpanjang && aktif
                ? `Diperpanjang: masa aktif sekarang sampai ${tanggal(aktif.sampai)} menjadi sampai ${tanggal(sampai)}; kuota balasan bertambah ${angka(isi.kuota_balasan)} (jadi ${angka(aktif.kuota_balasan + isi.kuota_balasan)}).`
                : aktif
                  ? `Menggantikan ${aktif.nama_paket} (seharusnya sampai ${tanggal(aktif.sampai)}) mulai hari ini; sisa kuota paket lama hangus. Berlaku ${tanggal(kini)} – ${tanggal(sampai)}.`
                  : `Mulai hari ini: ${tanggal(kini)} – ${tanggal(sampai)} (${hari} hari).`}
            </span>
          </p>
          {!diperpanjang && (
            <p className="text-muted tabular-nums">
              Kuota: {angka(isi.kuota_balasan)} balasan AI · {angka(isi.kuota_nomor)} nomor WhatsApp
            </p>
          )}
          <p className="text-muted">
            Pembayaran: {METODE.find((m) => m.id === metode)?.label}
            {!kompensasi && ` · ${rp(jumlah)}`} · tercatat di Transaksi
          </p>
          <label className={`flex items-center gap-2 pt-1 ${bisaKabari ? "" : "opacity-60"}`}>
            <input type="checkbox" checked={kabari && bisaKabari} onChange={(e) => setKabari(e.target.checked)} disabled={!bisaKabari} className="size-4 accent-[var(--c-accent)]" />
            <MessageCircle className="size-3.5 text-muted" aria-hidden />
            {bisaKabari ? "Kabari pelanggan lewat WhatsApp (ke nomor penerusnya)" : "Kabar WhatsApp tidak tersedia: akun belum punya nomor tersambung dengan nomor penerus"}
          </label>
        </div>
      )}

      {tanya && !kurang ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-warning/40 bg-warning-soft p-3 text-[12.5px] text-warning">
          <CircleAlert className="size-4 shrink-0" aria-hidden />
          <span className="flex-1">Langsung berlaku untuk akun ini. Lanjutkan?</span>
          <button type="submit" disabled={menyimpan} className="btn btn-primary">
            {menyimpan ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />} Ya, aktifkan
          </button>
          <button type="button" onClick={() => setTanya(false)} className="btn btn-ghost">
            Batal
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={!!kurang || menyimpan} className="btn btn-primary">
            {diperpanjang ? "Perpanjang paket" : "Aktifkan paket"}
          </button>
          {kurang && pilih !== null && <span className="text-[12px] text-muted">{kurang}</span>}
        </div>
      )}
      {!menyimpan && hasil && <Pesan ok={hasil.ok}>{hasil.pesan}</Pesan>}
    </form>
  );
}

function PilihanBaris({ aktif, onPilih, children }: { aktif: boolean; onPilih: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={aktif}
      onClick={onPilih}
      className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${aktif ? "border-accent bg-accent-soft/40 ring-1 ring-accent" : "border-line hover:bg-subtle"}`}
    >
      {children}
    </button>
  );
}
