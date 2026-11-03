"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Clock, Copy, Download, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { batalBayarAction } from "@/app/actions";
import { Pill, TombolKonfirmasi } from "@/components/ui";
import { type BitQr, jalurQr } from "@/lib/qr";

/** Jeda polling status ke server kita: rapat di menit-menit awal (saat orang biasanya membayar), lalu makin jarang. */
const jedaPoll = (dtk: number) => (dtk < 60 ? 3_000 : dtk < 300 ? 5_000 : dtk < 1_800 ? 10_000 : 30_000);

/**
 * Pantau status tagihan lewat /api/langganan/tagihan (bukan ke Midtrans). Berhenti saat status berubah (halaman
 * dimuat ulang dari server), saat tab disembunyikan (lanjut begitu tab terlihat lagi), dan semenit setelah batas
 * waktu lewat. Satu permintaan ±20 bita.
 */
function usePantau(orderId: string, sisaAwal: number | null) {
  const router = useRouter();
  const [aktif, setAktif] = useState(true);
  useEffect(() => {
    const mulai = Date.now();
    let t: ReturnType<typeof setTimeout> | undefined;
    let jalan = false;
    let berhenti = false;
    const cek = async () => {
      if (berhenti || jalan || document.hidden) return;
      jalan = true;
      clearTimeout(t);
      try {
        const res = await fetch(`/api/langganan/tagihan?order=${encodeURIComponent(orderId)}`, { cache: "no-store" });
        const d = res.ok ? ((await res.json()) as { s?: string }) : null;
        if (d?.s && d.s !== "menunggu") {
          berhenti = true;
          router.refresh();
          return;
        }
      } catch {
        // jaringan putus sebentar: dicoba lagi di jadwal berikutnya
      } finally {
        jalan = false;
      }
      const lewat = (Date.now() - mulai) / 1000;
      if (sisaAwal !== null && lewat > sisaAwal + 60) {
        berhenti = true;
        setAktif(false);
        return;
      }
      if (!berhenti && !document.hidden) t = setTimeout(cek, jedaPoll(lewat));
    };
    const terlihat = () => {
      if (!document.hidden) void cek();
    };
    t = setTimeout(cek, jedaPoll(0));
    document.addEventListener("visibilitychange", terlihat);
    return () => {
      berhenti = true;
      clearTimeout(t);
      document.removeEventListener("visibilitychange", terlihat);
    };
  }, [orderId, sisaAwal, router]);
  return aktif;
}

/** Hitung mundur dari sisa detik yang dihitung server (tidak bergantung jam perangkat). */
function useSisa(sisaAwal: number | null): number | null {
  const [sisa, setSisa] = useState(sisaAwal);
  useEffect(() => {
    if (sisaAwal === null) return;
    const akhir = Date.now() + sisaAwal * 1000;
    const id = setInterval(() => {
      const s = Math.max(0, Math.round((akhir - Date.now()) / 1000));
      setSisa(s);
      if (s === 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [sisaAwal]);
  return sisa;
}

const dua = (n: number) => String(n).padStart(2, "0");
function formatSisa(s: number): string {
  const j = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return j > 0 ? `${j}:${dua(m)}:${dua(s % 60)}` : `${dua(m)}:${dua(s % 60)}`;
}

export function TombolSalin({ teks, label = "Salin" }: { teks: string; label?: string }) {
  const [ok, setOk] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(t.current), []);
  return (
    <button
      type="button"
      className="btn btn-ghost h-8 shrink-0 px-2.5 text-[12.5px]"
      onClick={() => {
        void navigator.clipboard?.writeText(teks).then(() => {
          setOk(true);
          clearTimeout(t.current);
          t.current = setTimeout(() => setOk(false), 1500);
        });
      }}
    >
      {ok ? <Check className="size-3.5 text-success" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      <span aria-live="polite">{ok ? "Tersalin" : label}</span>
    </button>
  );
}

/** Kode QR digambar dari matriks bitnya (±0,4 KB), bukan diunduh sebagai gambar. */
function GambarQr({ qr, nama }: { qr: BitQr; nama: string }) {
  const d = jalurQr(qr);
  const simpan = () => {
    // Untuk membayar dari HP yang sama: PNG disimpan lalu diunggah dari galeri di menu scan e-wallet.
    const skala = 12;
    const c = document.createElement("canvas");
    c.width = c.height = qr.n * skala;
    const g = c.getContext("2d");
    if (!g) return;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, c.width, c.height);
    g.scale(skala, skala);
    g.fillStyle = "#000";
    g.fill(new Path2D(d));
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = `${nama}.png`;
    a.click();
  };
  return (
    <div className="flex flex-col items-center gap-3">
      <svg viewBox={`0 0 ${qr.n} ${qr.n}`} role="img" aria-label="Kode QR pembayaran" shapeRendering="crispEdges" className="size-60 rounded-xl border border-line bg-white sm:size-64">
        <path d={d} fill="#000" />
      </svg>
      <button type="button" className="btn btn-ghost" onClick={simpan}>
        <Download className="size-4" aria-hidden /> Simpan QR
      </button>
    </div>
  );
}

export interface DataBayar {
  va?: string;
  biller?: string;
  qr?: BitQr;
  qrUrl?: string;
  deeplink?: string;
}

/** Nomor VA dikelompokkan per 4 digit supaya mudah dibaca & dicocokkan. */
const kelompok = (s: string) => s.replace(/(\d{4})(?=\d)/g, "$1 ");

function Baris({ label, nilai, salin }: { label: string; nilai: string; salin?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-subtle px-4 py-3">
      <div className="min-w-0">
        <p className="text-[12px] text-muted">{label}</p>
        <p className="mt-0.5 break-all font-mono text-[17px] font-bold tracking-wide tabular-nums sm:text-lg">{nilai}</p>
      </div>
      <TombolSalin teks={salin ?? nilai} />
    </div>
  );
}

export function InstruksiBayar({
  orderId,
  labelKanal,
  namaAplikasi,
  jumlah,
  sisaAwal,
  batas,
  bayar,
  gantiHref,
  langkah,
}: {
  orderId: string;
  labelKanal: string;
  /** Untuk tombol deeplink: "GoPay" / "ShopeePay". */
  namaAplikasi?: string;
  jumlah: number;
  sisaAwal: number | null;
  /** Batas bayar yang sudah diformat (WIB). */
  batas: string | null;
  bayar: DataBayar;
  gantiHref: string | null;
  langkah: ReactNode;
}) {
  const router = useRouter();
  const sisa = useSisa(sisaAwal);
  const pantau = usePantau(orderId, sisaAwal);
  const habis = sisa === 0;
  const rupiah = `Rp${jumlah.toLocaleString("id-ID")}`;

  return (
    <section className="card overflow-hidden" aria-labelledby="judul-tagihan">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
        <div>
          <h1 id="judul-tagihan" className="text-[17px] font-bold tracking-tight">
            Selesaikan pembayaran
          </h1>
          <p className="text-[12.5px] text-muted">{labelKanal}</p>
        </div>
        {habis ? <Pill nada="abu">Waktu habis</Pill> : <Pill nada="kuning">Menunggu pembayaran</Pill>}
      </div>

      <div className="space-y-5 px-5 py-5 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
            <div>
              <p className="text-[12px] text-muted">Total bayar</p>
              <p className="text-2xl font-extrabold tracking-tight tabular-nums">{rupiah}</p>
            </div>
            <TombolSalin teks={String(jumlah)} />
          </div>
          <div className={`rounded-xl border px-4 py-3 ${habis ? "border-line bg-subtle" : "border-warning/30 bg-warning-soft"}`}>
            <p className={`flex items-center gap-1.5 text-[12px] ${habis ? "text-muted" : "text-warning"}`}>
              <Clock className="size-3.5" aria-hidden /> {habis ? "Batas waktu lewat" : "Bayar dalam"}
            </p>
            <p className={`text-2xl font-extrabold tracking-tight tabular-nums ${habis ? "text-muted" : "text-warning"}`} role="timer" aria-live="off">
              {sisa === null ? "—" : formatSisa(sisa)}
            </p>
            {batas && <p className="text-[11.5px] text-muted">Sebelum {batas}</p>}
          </div>
        </div>

        {habis ? (
          <p role="status" className="flex items-center gap-2 rounded-xl bg-subtle px-4 py-3 text-[13px] text-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Memastikan status tagihan ke Midtrans…
          </p>
        ) : (
          <div className="space-y-3">
            {bayar.qr && <GambarQr qr={bayar.qr} nama={orderId} />}
            {!bayar.qr && bayar.qrUrl && (
              <div className="flex justify-center">
                {/* Gambar QR GoPay dari Midtrans (tidak mengirim kunci apa pun); dimuat hanya untuk kanal ini. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={bayar.qrUrl} alt="Kode QR GoPay" width={256} height={256} className="size-60 rounded-xl border border-line bg-white sm:size-64" />
              </div>
            )}
            {bayar.biller && <Baris label="Kode perusahaan" nilai={bayar.biller} />}
            {bayar.va && <Baris label={bayar.biller ? "Kode bayar" : "Nomor virtual account"} nilai={kelompok(bayar.va)} salin={bayar.va} />}
            {bayar.deeplink && (
              <a href={bayar.deeplink} className="btn btn-primary h-11 w-full text-[14px]" rel="noopener">
                <ExternalLink className="size-4" aria-hidden /> Buka {namaAplikasi ?? "aplikasi"}
              </a>
            )}
          </div>
        )}

        {!habis && (
          <div>
            <h2 className="mb-2 text-[13.5px] font-bold">Cara bayar</h2>
            {langkah}
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p role="status" className="flex items-center gap-2 text-[12.5px] text-muted">
            {pantau ? (
              <>
                <Loader2 className="size-3.5 animate-spin" aria-hidden /> Status diperbarui otomatis. Paket aktif begitu pembayaran diterima.
              </>
            ) : (
              <button type="button" className="inline-flex items-center gap-1.5 font-semibold text-accent" onClick={() => router.refresh()}>
                <RefreshCw className="size-3.5" aria-hidden /> Periksa status lagi
              </button>
            )}
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {gantiHref && (
              <Link href={gantiHref} className="btn btn-ghost">
                Ganti metode
              </Link>
            )}
            {!habis && (
              <TombolKonfirmasi
                label="Batalkan"
                tanya="Batalkan tagihan ini?"
                ya="Ya, batalkan"
                aksi={async () => {
                  const h = await batalBayarAction(orderId);
                  router.refresh();
                  return h.ok || h.status ? { ok: true } : h;
                }}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Untuk tagihan Snap lama (tanpa data instruksi): cukup pantau statusnya. */
export function PantauStatus({ orderId }: { orderId: string }) {
  const aktif = usePantau(orderId, null);
  return aktif ? (
    <p role="status" className="flex items-center justify-center gap-2 text-[12.5px] text-muted">
      <Loader2 className="size-3.5 animate-spin" aria-hidden /> Memeriksa pembayaran otomatis…
    </p>
  ) : null;
}
