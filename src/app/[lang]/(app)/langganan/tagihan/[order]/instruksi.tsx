"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import Link from "@/components/link";
import { useRouter } from "next/navigation";
import { Check, Clock, Copy, Download, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { batalBayarAction } from "@/app/actions";
import { LogoKanal } from "@/components/logo-kanal";
import { Pill, TombolKonfirmasi } from "@/components/ui";
import { useBahasa } from "@/components/bahasa";
import { angka, uang } from "@/lib/format";
import type { KanalBayar } from "@/lib/harga";
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

export function TombolSalin({ teks, label }: { teks: string; label?: string }) {
  const { t: tr } = useBahasa();
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
      <span aria-live="polite">{ok ? tr("Tersalin", "Copied") : (label ?? tr("Salin", "Copy"))}</span>
    </button>
  );
}

/** Kode QR digambar dari matriks bitnya (±0,4 KB), bukan diunduh sebagai gambar. */
function GambarQr({ qr, nama }: { qr: BitQr; nama: string }) {
  const { t } = useBahasa();
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
      <svg viewBox={`0 0 ${qr.n} ${qr.n}`} role="img" aria-label={t("Kode QR pembayaran", "Payment QR code")} shapeRendering="crispEdges" className="size-60 rounded-xl border border-line bg-white sm:size-64">
        <path d={d} fill="#000" />
      </svg>
      <button type="button" className="btn btn-ghost" onClick={simpan}>
        <Download className="size-4" aria-hidden /> {t("Simpan QR", "Save QR")}
      </button>
    </div>
  );
}

/**
 * QR GoPay berupa gambar dari Midtrans, lewat server kita (/api/langganan/qr). Bila Midtrans tidak memberi gambar
 * (mis. QRIS dinamis GoPay belum aktif di akun), tampilkan cara lain alih-alih gambar rusak.
 */
function QrGambar({ orderId, gantiHref }: { orderId: string; gantiHref: string | null }) {
  const { b, t } = useBahasa();
  const [status, setStatus] = useState<"muat" | "ok" | "gagal">("muat");
  const img = useRef<HTMLImageElement>(null);
  // Gambar bisa selesai (atau gagal) dimuat sebelum React terpasang, jadi onLoad/onError terlewat: cek sekali di sini.
  useEffect(() => {
    const i = img.current;
    if (i?.complete) setStatus(i.naturalWidth > 0 ? "ok" : "gagal");
  }, []);
  if (status === "gagal") {
    return (
      <div role="status" className="rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-[13px] text-warning">
        {b === "en" ? (
          <>
            The GoPay QR code is not available right now. Open this page on a phone with the Gojek / GoPay app installed and tap{" "}
            <strong className="font-semibold">Open GoPay</strong>
          </>
        ) : (
          <>
            Kode QR GoPay sedang tidak tersedia. Buka halaman ini dari HP yang terpasang aplikasi Gojek / GoPay lalu ketuk <strong className="font-semibold">Buka GoPay</strong>
          </>
        )}
        {gantiHref ? (
          <>
            {t(", atau", ", or")}{" "}
            <Link href={gantiHref} className="font-semibold underline">
              {t("ganti metode pembayaran", "choose another payment method")}
            </Link>
            .
          </>
        ) : (
          "."
        )}
      </div>
    );
  }
  return (
    <div className="flex justify-center">
      <div className="relative size-60 sm:size-64">
        {status === "muat" && <div aria-hidden className="absolute inset-0 animate-denyut rounded-xl border border-line bg-subtle" />}
        {/* eslint-disable-next-line @next/next/no-img-element -- gambar dinamis per tagihan dari route kita sendiri */}
        <img
          ref={img}
          src={`/api/langganan/qr?order=${encodeURIComponent(orderId)}`}
          alt={t("Kode QR GoPay", "GoPay QR code")}
          width={256}
          height={256}
          onLoad={() => setStatus("ok")}
          onError={() => setStatus("gagal")}
          className={`size-full rounded-xl border border-line bg-white object-contain ${status === "ok" ? "" : "opacity-0"}`}
        />
      </div>
    </div>
  );
}

export interface DataBayar {
  va?: string;
  biller?: string;
  qr?: BitQr;
  qrUrl?: string;
  deeplink?: string;
  /** QR berisi `deeplink` (e-wallet tanpa QR dari provider): hanya tampil di layar lebar, untuk dipindai kamera HP. */
  qrTautan?: BitQr;
}

/**
 * Membuka halaman bayar di komputer untuk e-wallet yang hanya memberi deeplink: QR tautan pembayaran untuk dipindai
 * kamera HP. Disembunyikan di HP (tombol "Buka ..." di bawahnya yang dipakai).
 */
function QrTautan({ qr, namaAplikasi }: { qr: BitQr; namaAplikasi: string }) {
  const { t } = useBahasa();
  return (
    <div className="hidden flex-col items-center gap-2 rounded-xl border border-line bg-subtle px-4 py-4 sm:flex">
      <svg viewBox={`0 0 ${qr.n} ${qr.n}`} role="img" aria-label={t(`Kode QR untuk membuka ${namaAplikasi} di HP`, `QR code to open ${namaAplikasi} on your phone`)} shapeRendering="crispEdges" className="size-52 rounded-xl border border-line bg-white">
        <path d={jalurQr(qr)} fill="#000" />
      </svg>
      <p className="max-w-sm text-center text-[13px] text-muted">
        {t(
          `Membuka dari komputer? Scan kode ini dengan kamera HP, lalu bayar di aplikasi ${namaAplikasi} yang terbuka.`,
          `On a computer? Scan this code with your phone camera, then pay in the ${namaAplikasi} app that opens.`,
        )}
      </p>
    </div>
  );
}

/** Nomor VA dikelompokkan per 4 digit supaya mudah dibaca & dicocokkan. */
const kelompok = (s: string) => s.replace(/(\d{4})(?=\d)/g, "$1 ");

function Baris({ label, nilai, salin }: { label: string; nilai: string; salin?: string }) {
  return (
    // HP sempit: tombol Salin turun ke bawah, nomor tetap satu baris (patah hanya di antara kelompok 4 digit).
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl bg-subtle px-4 py-3">
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-[12px] text-muted">{label}</p>
        <p className="mt-0.5 font-mono text-[17px] font-bold tracking-wide break-words tabular-nums sm:text-lg">{nilai}</p>
      </div>
      <TombolSalin teks={salin ?? nilai} />
    </div>
  );
}

export function InstruksiBayar({
  orderId,
  kanal,
  labelKanal,
  namaAplikasi,
  jumlah,
  kurs,
  sisaAwal,
  batas,
  bayar,
  gantiHref,
  langkah,
}: {
  orderId: string;
  kanal: KanalBayar;
  labelKanal: string;
  /** Untuk tombol deeplink: "GoPay" / "ShopeePay". */
  namaAplikasi?: string;
  jumlah: number;
  /** Rp per 1 USD (versi Inggris menampilkan USD; tagihan tetap dibayar persis dalam Rupiah). */
  kurs?: number;
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
  const { b, t } = useBahasa();
  const rupiah = b === "en" ? `Rp${angka(jumlah, b)}` : `Rp${jumlah.toLocaleString("id-ID")}`;

  return (
    <section className="card overflow-hidden" aria-labelledby="judul-tagihan">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <LogoKanal kanal={kanal} ukuran="lg" />
          <div className="min-w-0">
            <h1 id="judul-tagihan" className="text-[17px] font-bold tracking-tight">
              {t("Selesaikan pembayaran", "Complete your payment")}
            </h1>
            <p className="text-[12.5px] text-muted">{labelKanal}</p>
          </div>
        </div>
        {habis ? <Pill nada="abu">{t("Waktu habis", "Time's up")}</Pill> : <Pill nada="kuning">{t("Menunggu pembayaran", "Awaiting payment")}</Pill>}
      </div>

      <div className="space-y-5 px-5 py-5 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
            <div>
              <p className="text-[12px] text-muted">{t("Total bayar", "Total due")}</p>
              {b === "en" ? (
                <>
                  <p className="text-2xl font-extrabold tracking-tight tabular-nums">{uang(jumlah, b, kurs)}</p>
                  <p className="text-[12px] text-muted tabular-nums">
                    Billed as <span className="font-semibold text-fg">{rupiah}</span>
                  </p>
                </>
              ) : (
                <p className="text-2xl font-extrabold tracking-tight tabular-nums">{rupiah}</p>
              )}
            </div>
            <TombolSalin teks={String(jumlah)} label={b === "en" ? "Copy IDR" : undefined} />
          </div>
          <div className={`rounded-xl border px-4 py-3 ${habis ? "border-line bg-subtle" : "border-warning/30 bg-warning-soft"}`}>
            <p className={`flex items-center gap-1.5 text-[12px] ${habis ? "text-muted" : "text-warning"}`}>
              <Clock className="size-3.5" aria-hidden /> {habis ? t("Batas waktu lewat", "Deadline passed") : t("Bayar dalam", "Pay within")}
            </p>
            <p className={`text-2xl font-extrabold tracking-tight tabular-nums ${habis ? "text-muted" : "text-warning"}`} role="timer" aria-live="off">
              {sisa === null ? "—" : formatSisa(sisa)}
            </p>
            {batas && <p className="text-[11.5px] text-muted">{t(`Sebelum ${batas}`, `Before ${batas}`)}</p>}
          </div>
        </div>

        {habis ? (
          <p role="status" className="flex items-center gap-2 rounded-xl bg-subtle px-4 py-3 text-[13px] text-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden /> {t("Memastikan status tagihan ke Midtrans…", "Checking the invoice status with Midtrans…")}
          </p>
        ) : (
          <div className="space-y-3">
            {bayar.qr && <GambarQr qr={bayar.qr} nama={orderId} />}
            {!bayar.qr && bayar.qrUrl && <QrGambar orderId={orderId} gantiHref={gantiHref} />}
            {bayar.biller && <Baris label={t("Kode perusahaan", "Company code")} nilai={bayar.biller} />}
            {bayar.va && (
              <Baris label={bayar.biller ? t("Kode bayar", "Payment code") : t("Nomor virtual account", "Virtual account number")} nilai={kelompok(bayar.va)} salin={bayar.va} />
            )}
            {bayar.qrTautan && <QrTautan qr={bayar.qrTautan} namaAplikasi={namaAplikasi ?? labelKanal} />}
            {bayar.deeplink && (
              <a href={bayar.deeplink} className="btn btn-primary h-11 w-full text-[14px]" rel="noopener">
                <ExternalLink className="size-4" aria-hidden /> {t(`Buka ${namaAplikasi ?? "aplikasi"}`, `Open ${namaAplikasi ?? "the app"}`)}
              </a>
            )}
          </div>
        )}

        {!habis && (
          <div>
            <h2 className="mb-2 text-[13.5px] font-bold">{t("Cara bayar", "How to pay")}</h2>
            {langkah}
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p role="status" className="flex items-center gap-2 text-[12.5px] text-muted">
            {pantau ? (
              <>
                <Loader2 className="size-3.5 animate-spin" aria-hidden />{" "}
                {t("Status diperbarui otomatis. Paket aktif begitu pembayaran diterima.", "Status updates automatically. Your plan activates as soon as payment is received.")}
              </>
            ) : (
              <button type="button" className="inline-flex items-center gap-1.5 font-semibold text-accent" onClick={() => router.refresh()}>
                <RefreshCw className="size-3.5" aria-hidden /> {t("Periksa status lagi", "Check status again")}
              </button>
            )}
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {gantiHref && (
              <Link href={gantiHref} className="btn btn-ghost">
                {t("Ganti metode", "Change method")}
              </Link>
            )}
            {!habis && (
              <TombolKonfirmasi
                label={t("Batalkan", "Cancel")}
                tanya={t("Batalkan tagihan ini?", "Cancel this invoice?")}
                ya={t("Ya, batalkan", "Yes, cancel")}
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
  const { t } = useBahasa();
  return aktif ? (
    <p role="status" className="flex items-center justify-center gap-2 text-[12.5px] text-muted">
      <Loader2 className="size-3.5 animate-spin" aria-hidden /> {t("Memeriksa pembayaran otomatis…", "Checking for your payment automatically…")}
    </p>
  ) : null;
}
