import type { ReactNode } from "react";
import { ArrowRight, Building2, Check, CheckCircle2, ChevronDown, ChevronRight, Clock, Copy, Download, Loader2, QrCode, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { Img, staticFile } from "remotion";
import { encode } from "uqr";
import { Spin } from "../kit/phone";
import { Pill } from "../kit/ui";
import { PAKET } from "../data";

/* Halaman Langganan → Bayar → Tagihan → Sukses (markup disalin dari src/app/(app)/langganan/**). */

const rp = (n: number) => `Rp${n.toLocaleString("id-ID")}`;

export const KANAL = {
  qris: { label: "QRIS", info: "Scan dari aplikasi e-wallet atau m-banking apa pun", grup: "QRIS" },
  gopay: { label: "GoPay", info: "Buka aplikasi Gojek / GoPay", grup: "E-wallet" },
  shopeepay: { label: "ShopeePay", info: "Buka aplikasi Shopee di HP ini", grup: "E-wallet" },
  bca: { label: "BCA Virtual Account", info: "BCA mobile, KlikBCA, atau ATM BCA", grup: "Virtual account" },
  bni: { label: "BNI Virtual Account", info: "BNI Mobile Banking atau ATM", grup: "Virtual account" },
  bri: { label: "BRI Virtual Account", info: "BRImo atau ATM BRI", grup: "Virtual account" },
  mandiri: { label: "Mandiri Bill Payment", info: "Livin' by Mandiri atau ATM Mandiri", grup: "Virtual account" },
  permata: { label: "Permata Virtual Account", info: "PermataMobile X atau ATM", grup: "Virtual account" },
} as const;
export type Kanal = keyof typeof KANAL;

export function LogoKanal({ kanal, ukuran = "md" }: { kanal: Kanal; ukuran?: "md" | "lg" }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-lg border border-line bg-white ${ukuran === "lg" ? "h-11 w-[4.5rem] p-2" : "h-9 w-14 p-1.5"}`}>
      <Img src={staticFile(`logo-bayar/${kanal}.svg`)} width={48} height={24} className="max-h-full max-w-full object-contain" />
    </span>
  );
}

// ---------------------------------------------------------------- /langganan
export function JudulHalaman({ judul, sub }: { judul: string; sub: string }) {
  return (
    <div>
      <h1 className="text-[28px] font-bold tracking-tight">{judul}</h1>
      <p className="mt-1 text-muted">{sub}</p>
    </div>
  );
}

export function PilihPaket({ dihover = -1 }: { dihover?: number }) {
  return (
    <section data-cur="sec-paket">
      <h2 className="text-[15px] font-bold">Pilih paket</h2>
      <div className="mt-4 grid grid-cols-3 gap-4">
        {PAKET.map((p, i) => {
          const unggul = "unggulan" in p && p.unggulan;
          return (
            <article key={p.nama} data-cur={`paket-${i + 1}`} className={`card relative flex flex-col p-6 ${unggul ? "ring-2 ring-accent" : ""}`} style={{ transform: dihover === i ? "translateY(-3px)" : undefined, boxShadow: dihover === i ? "var(--shadow-pop)" : undefined }}>
              {unggul && (
                <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold text-on-accent">
                  <Sparkles className="size-3" /> Paling banyak dipilih
                </span>
              )}
              <h3 className="text-lg font-bold">{p.nama}</h3>
              <p className="mt-1 text-[13px] text-muted">{p.desk}</p>
              <p className="mt-4 text-3xl font-extrabold tracking-tight tabular-nums">
                {rp(p.harga)}
                <span className="text-[13px] font-semibold text-muted"> / 30 hari</span>
              </p>
              <ul className="mt-4 flex-1 space-y-2 text-[13.5px]">
                {[`${p.nomor} nomor WhatsApp`, `${p.balasan.toLocaleString("id-ID")} balasan AI`, "Base knowledge & belajar dari balasanmu", "Histori percakapan 30 hari"].map((x) => (
                  <li key={x} className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-accent" /> {x}
                  </li>
                ))}
              </ul>
              <div className="mt-5">
                <span data-cur={`btn-paket-${i + 1}`} className="btn btn-primary w-full">
                  Pilih paket <ArrowRight className="size-4" />
                </span>
              </div>
            </article>
          );
        })}
      </div>
      <p className="mt-3 text-[12.5px] text-muted">
        Bayar lewat QRIS, virtual account (BCA, BNI, BRI, Mandiri, Permata), GoPay, atau ShopeePay. Perpanjang paket yang sama = masa & kuota ditambahkan. Ganti paket = paket baru mulai hari itu.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------- /langganan/bayar/2
function Remah({ ke, sekarang }: { ke: string; sekarang: string }) {
  return (
    <nav aria-label="Jejak halaman" className="mb-5">
      <ol className="flex items-center gap-1.5 text-[13px]">
        <li className="font-medium text-muted">{ke}</li>
        <li aria-hidden>
          <ChevronRight className="size-3.5 text-faint" />
        </li>
        <li className="font-medium text-fg">{sekarang}</li>
      </ol>
    </nav>
  );
}

const IKON_GRUP = { QRIS: QrCode, "E-wallet": Wallet, "Virtual account": Building2 } as const;
const GRUP: [keyof typeof IKON_GRUP, Kanal[]][] = [
  ["QRIS", ["qris"]],
  ["E-wallet", ["gopay", "shopeepay"]],
  ["Virtual account", ["bca", "bni", "bri", "mandiri", "permata"]],
];

export function HalamanBayar({ pilih, memuat, t, sorot }: { pilih: Kanal; memuat: boolean; t: number; sorot?: Kanal | null }) {
  const p = PAKET[1];
  return (
    <div>
      <Remah ke="Langganan" sekarang="Pembayaran" />
      <div className="grid grid-cols-[1fr_20rem] items-start gap-5">
        <aside data-cur="ringkasan" className="card order-2 p-6" style={{ position: "sticky", top: 24 }}>
          <h2 className="text-[13px] font-bold tracking-wide text-muted uppercase">Ringkasan</h2>
          <p className="mt-3 text-lg font-bold">Paket {p.nama}</p>
          <p className="text-[13px] text-muted">30 hari</p>
          <ul className="mt-4 space-y-2 text-[13px]">
            {[`${p.nomor} nomor WhatsApp`, `${p.balasan.toLocaleString("id-ID")} balasan AI`, "Histori percakapan 30 hari"].map((x) => (
              <li key={x} className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-accent" /> {x}
              </li>
            ))}
          </ul>
          <div className="mt-5 flex items-baseline justify-between border-t border-line pt-4">
            <span className="text-[13px] text-muted">Total</span>
            <span className="text-2xl font-extrabold tracking-tight tabular-nums">{rp(p.harga)}</span>
          </div>
          <p className="mt-2 text-[12px] text-muted">Paket mulai aktif begitu pembayaran diterima.</p>
        </aside>

        <section className="card order-1 p-6">
          <h1 className="text-[17px] font-bold tracking-tight">Pilih metode pembayaran</h1>
          <p className="mt-0.5 mb-5 text-[13px] text-muted">Tagihan dibuat setelah kamu memilih. Paket aktif otomatis begitu pembayaran diterima.</p>
          <div className="space-y-5">
            <div className="space-y-5" style={{ opacity: memuat ? 0.6 : 1 }}>
              {GRUP.map(([nama, daftar]) => {
                const Ikon = IKON_GRUP[nama];
                return (
                  <div key={nama}>
                    <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-bold tracking-wide text-muted uppercase">
                      <Ikon className="size-3.5" /> {nama}
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      {daftar.map((x) => {
                        const aktif = pilih === x;
                        return (
                          <div key={x} data-cur={`kanal-${x}`} className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 ${aktif ? "border-accent bg-accent-soft" : sorot === x ? "border-line bg-subtle" : "border-line bg-surface"}`}>
                            <LogoKanal kanal={x} />
                            <span className="min-w-0 flex-1">
                              <span className="block text-[13.5px] font-semibold">{KANAL[x].label}</span>
                              <span className="block truncate text-[12px] text-muted">{KANAL[x].info}</span>
                            </span>
                            <span aria-hidden className={`grid size-5 shrink-0 place-items-center rounded-full border ${aktif ? "border-accent bg-accent text-on-accent" : "border-line-strong"}`}>
                              {aktif && <Check className="size-3" />}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="space-y-2">
              <span data-cur="btn-bayar" className="btn btn-primary h-11 w-full text-[14px]" style={{ opacity: memuat ? 0.55 : 1 }}>
                {memuat && <Spin t={t} className="size-4" />}
                {`Bayar ${rp(p.harga)} dengan ${KANAL[pilih].label}`}
              </span>
              <p className="flex items-center justify-center gap-1.5 text-[12px] text-muted">
                <ShieldCheck className="size-3.5 text-success" /> Diproses aman oleh Midtrans. Tanpa biaya tambahan.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- /langganan/tagihan/<order>
const QR = encode("https://api.sandbox.midtrans.com/v2/qris/demo-ORD-20261103-0042/qr-code", { ecc: "M", border: 3 }).data;
const QR_D = QR.flatMap((baris, y) => baris.map((v, x) => (v ? `M${x} ${y}h1v1h-1z` : ""))).join("");

const dua = (n: number) => String(n).padStart(2, "0");
const formatSisa = (s: number) => `${dua(Math.floor(s / 60))}:${dua(s % 60)}`;

const B = ({ children }: { children: ReactNode }) => <strong className="font-semibold text-fg">{children}</strong>;
/** Fungsi (bukan konstanta modul): JSX tingkat modul dievaluasi sebelum `React` global tersedia di bundel Remotion. */
const langkahQris = (): ReactNode[] => [
  <>Buka aplikasi e-wallet atau m-banking yang mendukung QRIS (GoPay, OVO, DANA, ShopeePay, LinkAja, BCA mobile, Livin&apos;, BRImo, dan lainnya).</>,
  <>Pilih menu <B>Scan</B> / <B>Bayar</B>, lalu arahkan kamera ke kode QR di atas.</>,
  <>Membayar dari HP ini? Ketuk <B>Simpan QR</B>, lalu unggah gambarnya dari galeri di menu scan aplikasi kamu.</>,
  <>Periksa nama merchant dan nominal, lalu konfirmasi dengan PIN.</>,
];

export const ORDER = "ORD-20261103-0042";

export function HalamanTagihan({ sisa, t }: { sisa: number; t: number }) {
  return (
    <div className="mx-auto w-full max-w-xl py-6">
      <div className="space-y-4">
        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <LogoKanal kanal="qris" ukuran="lg" />
              <div className="min-w-0">
                <h1 className="text-[17px] font-bold tracking-tight">Selesaikan pembayaran</h1>
                <p className="text-[12.5px] text-muted">QRIS · Paket Bisnis</p>
              </div>
            </div>
            <Pill nada="kuning">Menunggu pembayaran</Pill>
          </div>
          <div className="space-y-5 px-6 py-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
                <div>
                  <p className="text-[12px] text-muted">Total bayar</p>
                  <p className="text-2xl font-extrabold tracking-tight tabular-nums">Rp249.000</p>
                </div>
                <span className="btn btn-ghost h-8 shrink-0 px-2.5 text-[12.5px]">
                  <Copy className="size-3.5" /> Salin
                </span>
              </div>
              <div className="rounded-xl border border-warning/30 bg-warning-soft px-4 py-3">
                <p className="flex items-center gap-1.5 text-[12px] text-warning">
                  <Clock className="size-3.5" /> Bayar dalam
                </p>
                <p className="text-2xl font-extrabold tracking-tight text-warning tabular-nums">{formatSisa(sisa)}</p>
                <p className="text-[11.5px] text-muted">Sebelum 3 Nov 2026, 11.57 WIB</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex flex-col items-center gap-3">
                <svg data-cur="qr-gambar" viewBox={`0 0 ${QR.length} ${QR.length}`} shapeRendering="crispEdges" className="size-64 rounded-xl border border-line bg-white">
                  <path d={QR_D} fill="#000" />
                </svg>
                <span data-cur="btn-simpan-qr" className="btn btn-ghost">
                  <Download className="size-4" /> Simpan QR
                </span>
              </div>
            </div>
            <div data-cur="cara-bayar">
              <h2 className="mb-2 text-[13.5px] font-bold">Cara bayar</h2>
              <div className="divide-y divide-line rounded-2xl border border-line">
                <div className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3 text-[13.5px] font-semibold">
                    Scan QRIS
                    <ChevronDown className="size-4 shrink-0 text-faint" style={{ transform: "rotate(180deg)" }} />
                  </div>
                  <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[13px] text-muted marker:text-faint">
                    {langkahQris().map((l, j) => (
                      <li key={j}>{l}</li>
                    ))}
                  </ol>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-line pt-4">
              <p data-cur="status-oto" className="flex items-center gap-2 text-[12.5px] text-muted">
                <Loader2 className="size-3.5" style={{ transform: `rotate(${(t * 400) % 360}deg)` }} /> Status diperbarui otomatis. Paket aktif begitu pembayaran diterima.
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <span className="btn btn-ghost">Ganti metode</span>
                <span className="btn btn-danger">Batalkan</span>
              </div>
            </div>
          </div>
        </section>
        <p className="text-center text-[12px] text-faint">
          No. pesanan <span className="font-mono">{ORDER}</span>
        </p>
      </div>
    </div>
  );
}

export function HalamanSukses({ pop }: { pop: number }) {
  const baris: [string, string][] = [
    ["Paket", "Bisnis"],
    ["Total", "Rp249.000"],
    ["Metode", "QRIS"],
    ["Dibayar", "3 Nov 2026, 11.46 WIB"],
    ["Aktif sampai", "3 Des 2026"],
    ["Kuota balasan AI", "3.500 balasan"],
    ["Nomor WhatsApp", "3 nomor"],
  ];
  return (
    <div className="mx-auto w-full max-w-xl py-6">
      <section className="card p-8 text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-success-soft text-success" style={{ transform: `scale(${0.4 + pop * 0.6})`, opacity: Math.min(1, pop * 1.6) }}>
          <CheckCircle2 className="size-9" />
        </span>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Pembayaran berhasil</h1>
        <p className="mt-1 text-[14px] text-muted">Terima kasih! Paket Bisnis sudah aktif dan bisa langsung dipakai.</p>
        <dl data-cur="rangkuman" className="mt-6 divide-y divide-line rounded-2xl border border-line text-left text-[13.5px]">
          {baris.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-4 px-4 py-3">
              <dt className="text-muted">{k}</dt>
              <dd className="text-right font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-4 px-4 py-3">
            <dt className="text-muted">No. pesanan</dt>
            <dd className="min-w-0 text-right font-mono text-[12px] break-all text-muted">{ORDER}</dd>
          </div>
        </dl>
        <div className="mt-6 flex justify-center gap-2">
          <span data-cur="btn-ke-dashboard" className="btn btn-primary">
            Ke dashboard <ArrowRight className="size-4" />
          </span>
          <span className="btn btn-ghost">Lihat langganan</span>
        </div>
      </section>
    </div>
  );
}

