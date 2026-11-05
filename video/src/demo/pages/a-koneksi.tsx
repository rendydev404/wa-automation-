import { Check, Copy, KeyRound, LogOut, QrCode, RefreshCw, Smartphone } from "lucide-react";
import { encode } from "uqr";
import { NOMOR_BISNIS, USAHA } from "../data";
import { Spin } from "../kit/phone";
import { Isi, PATH_TANDA } from "../kit/ui";
import { LencanaSesi } from "./dashboard";

/* Kartu "Koneksi WhatsApp" — markup disalin dari src/components/connection-card.tsx; QR bergaya piksel dari src/lib/qr.ts. */

const LANGKAH_QR = [
  "Buka WhatsApp di HP nomor ini",
  "Android: ketuk menu titik tiga di kanan atas. iPhone (iOS): buka Pengaturan di kanan bawah, lalu pilih Perangkat Tertaut",
  "Ketuk Tautkan Perangkat dan arahkan kamera HP ke kode QR ini",
];
const LANGKAH_KODE = [
  "Buka WhatsApp di HP, lalu masuk ke menu Perangkat Tertaut dan ketuk Tautkan Perangkat",
  "Ketuk Tautkan dengan nomor telepon saja di bagian bawah layar pemindai QR",
  "Masukkan kode 8 karakter di samping pada layar HP Anda",
];

interface QrPixel {
  n: number;
  pikselUtama: string;
  pikselAksen: string;
  mataLuar: string;
  mataDalam: string;
  mataPusat: string;
  logo: { x: number; y: number; ukuran: number };
}

/** Port jalurQrPixel (src/lib/qr.ts): jalur SVG QR bergaya piksel dengan ruang 9x9 modul untuk logo di tengah. */
function jalurQrPixel(data: boolean[][]): QrPixel {
  const n = data.length;
  const gelap = (x: number, y: number) => data[y][x];
  const tepi = 2;
  const pusat = Math.floor(n / 2);
  const radiusLogo = 4;
  const mata = [
    { x0: tepi, y0: tepi },
    { x0: n - tepi - 7, y0: tepi },
    { x0: tepi, y0: n - tepi - 7 },
  ];
  const kotak = (x: number, y: number, pad: number) => {
    const u = +(1 - pad * 2).toFixed(2);
    return `M${+(x + pad).toFixed(2)} ${+(y + pad).toFixed(2)}h${u}v${u}h-${u}z`;
  };
  let pikselUtama = "";
  let pikselAksen = "";
  let mataLuar = "";
  let mataDalam = "";
  let mataPusat = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!gelap(x, y)) continue;
      if (Math.abs(x - pusat) <= radiusLogo && Math.abs(y - pusat) <= radiusLogo) continue;
      const m = mata.find((k) => x >= k.x0 && x < k.x0 + 7 && y >= k.y0 && y < k.y0 + 7);
      if (m) {
        const dx = x - m.x0;
        const dy = y - m.y0;
        if (dx === 3 && dy === 3) mataPusat += kotak(x, y, 0.04);
        else if (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4) mataDalam += kotak(x, y, 0.05);
        else mataLuar += kotak(x, y, 0.04);
        continue;
      }
      if ((x + y * 3) % 7 === 0) pikselAksen += kotak(x, y, 0.08);
      else pikselUtama += kotak(x, y, 0.08);
    }
  }
  return { n, pikselUtama, pikselAksen, mataLuar, mataDalam, mataPusat, logo: { x: pusat - radiusLogo, y: pusat - radiusLogo, ukuran: radiusLogo * 2 + 1 } };
}

/** Muatan QR pairing WhatsApp (contoh, bukan sesi nyata). */
const MUATAN = "2@Xk9sLq3VbN7mTz4HcRw8YdPfJe6AuGoIiQ1nBxZ0KsDlCvM5tUhWyE2rFgSaOpL9jNbVcXzQwErTyUiOpAsDfGhJkLzXcVbNm1234567890,rT5yUiOpAsDfGhJkLzXcVbNmQwErTyUiOp12345678=";
export const QR: QrPixel = jalurQrPixel(encode(MUATAN, { ecc: "M", border: 2, minVersion: 11 }).data);

const poligonPiksel = (x: number, y: number, s: number, c: number) => `M${x + c} ${y}H${x + s - c}V${y + c}H${x + s}V${y + s - c}H${x + s - c}V${y + s}H${x + c}V${y + s - c}H${x}V${y + c}H${x + c}Z`;

/** QR piksel berlogo (SVG); dipakai di browser maupun di layar kamera ponsel. */
export function QrSvg({ ukuran = 216 }: { ukuran?: number }) {
  const qr = QR;
  return (
    <svg viewBox={`0 0 ${qr.n} ${qr.n}`} width={ukuran} height={ukuran} shapeRendering="crispEdges">
      <rect width={qr.n} height={qr.n} fill="#ffffff" />
      <path d={qr.pikselUtama} fill="#0b1813" />
      <path d={qr.pikselAksen} fill="#0b4f3b" />
      <path d={qr.mataLuar} fill="#0b1813" />
      <path d={qr.mataDalam} fill="#0b6249" />
      <path d={qr.mataPusat} fill="#0aa878" />
      <path d={poligonPiksel(qr.logo.x, qr.logo.y, qr.logo.ukuran, 1)} fill="#ffffff" />
      <path d={poligonPiksel(qr.logo.x + 0.5, qr.logo.y + 0.5, qr.logo.ukuran - 1, 1)} fill="#0aa878" />
      <path d={poligonPiksel(qr.logo.x + 1, qr.logo.y + 1, qr.logo.ukuran - 2, 1)} fill="#0b1813" />
      <svg x={qr.logo.x + 1.85} y={qr.logo.y + 1.85} width={qr.logo.ukuran - 3.7} height={qr.logo.ukuran - 3.7} viewBox="0 0 100 100" shapeRendering="geometricPrecision">
        <path d={PATH_TANDA} fill="#3ddc97" />
        <circle cx="94.76" cy="75.68" r="4.68" fill="#3ddc97" />
      </svg>
    </svg>
  );
}

export interface KoneksiP {
  status: "SCAN_QR_CODE" | "WORKING";
  metode: "qr" | "kode";
  /** Tahap tab "Pakai Nomor Telepon". */
  kodeFase: "form" | "loading" | "kode";
  telepon: string;
  teleponFokus: boolean;
  kode: string;
  disalin: boolean;
  t: number;
}

export function KoneksiKartu({ status, metode, kodeFase, telepon, teleponFokus, kode, disalin, t }: KoneksiP) {
  const tab = (aktif: boolean) => `inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold ${aktif ? "bg-surface text-fg shadow-card" : "text-muted"}`;
  const kotakKar = "grid h-12 w-10 place-items-center rounded-xl border border-line-strong bg-surface font-mono text-xl font-bold tracking-wider text-fg shadow-card";
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-4">
        <div>
          <h2 className="text-[15px] font-bold tracking-tight">Koneksi WhatsApp</h2>
          <p className="hint mt-0.5">Nomor ini bisa di-logout dan diganti nomor lain kapan saja; base knowledge-nya tetap.</p>
        </div>
        <LencanaSesi status={status} />
      </div>
      <div className="px-6 py-6">
        {status === "WORKING" ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
                <Smartphone className="size-6" />
              </span>
              <div>
                <p className="text-lg font-bold tracking-tight tabular-nums">{NOMOR_BISNIS.wa}</p>
                <p className="text-[13px] text-muted">{USAHA.nama}</p>
              </div>
            </div>
            <span className="btn btn-ghost">
              <LogOut className="size-4" /> Logout nomor
            </span>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
              <div className="inline-flex rounded-xl border border-line bg-subtle p-1">
                <span data-cur="tab-qr" className={tab(metode === "qr")}>
                  <QrCode className="size-4" />
                  Pindai Kode QR
                </span>
                <span data-cur="tab-kode" className={tab(metode === "kode")}>
                  <KeyRound className="size-4" />
                  Pakai Nomor Telepon
                </span>
              </div>
              {metode === "qr" && (
                <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent">
                  <KeyRound className="size-3.5" />
                  Tautkan dengan nomor telepon saja
                </span>
              )}
            </div>

            {metode === "qr" ? (
              <div className="flex items-start gap-7">
                <div data-cur="qr-kartu" className="relative grid size-[244px] shrink-0 place-items-center rounded-2xl border-2 border-line-strong bg-white p-3.5 shadow-card">
                  <span aria-hidden className="absolute top-2 left-2 size-3 border-t-2 border-l-2 border-accent" />
                  <span aria-hidden className="absolute top-2 right-2 size-3 border-t-2 border-r-2 border-accent" />
                  <span aria-hidden className="absolute bottom-2 left-2 size-3 border-b-2 border-l-2 border-accent" />
                  <span aria-hidden className="absolute right-2 bottom-2 size-3 border-r-2 border-b-2 border-accent" />
                  <QrSvg />
                </div>
                <div className="pt-1">
                  <h3 className="text-[15px] font-bold">Pindai kode QR dari aplikasi WhatsApp</h3>
                  <ol className="mt-3 space-y-2.5">
                    {LANGKAH_QR.map((l, i) => (
                      <li key={l} className="flex gap-3 text-[13.5px] text-muted">
                        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-subtle text-[11px] font-bold text-fg">{i + 1}</span>
                        <span>{l}</span>
                      </li>
                    ))}
                  </ol>
                  <p className="hint mt-4 flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-accent" style={{ opacity: 0.55 + 0.45 * Math.abs(Math.sin(t * 2)) }} /> Kode QR diperbarui otomatis. Halaman akan terhubung sendiri begitu selesai dipindai.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-7">
                <div className="w-full max-w-md shrink-0 rounded-2xl border border-line bg-subtle/60 p-5">
                  {kodeFase === "kode" ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold tracking-wide text-muted uppercase">Kode Tautan 8 Karakter</span>
                        <span data-cur="btn-salin" className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-2.5 py-1 text-xs font-semibold text-fg">
                          {disalin ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5 text-muted" />}
                          {disalin ? "Tersalin" : "Salin kode"}
                        </span>
                      </div>
                      <div className="flex items-center justify-center gap-2">
                        {kode.slice(0, 4).split("").map((k, i) => (
                          <span key={`a${i}`} className={kotakKar}>{k}</span>
                        ))}
                        <span className="px-0.5 font-mono text-lg font-bold text-muted">-</span>
                        {kode.slice(4, 8).split("").map((k, i) => (
                          <span key={`b${i}`} className={kotakKar}>{k}</span>
                        ))}
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted">
                          <RefreshCw className="size-3.5" />
                          Ganti nomor atau minta kode baru
                        </span>
                        <span data-cur="btn-kembali-qr" className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent">
                          <QrCode className="size-3.5" />
                          Kembali ke kode QR
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3.5">
                      <Isi
                        label="Nomor WhatsApp yang akan ditautkan"
                        nilai={telepon}
                        placeholder="Contoh: 0812-3456-7890 atau 62812..."
                        fokus={teleponFokus}
                        t={t}
                        cur="f-telp"
                        hint={<p className="hint mt-1.5">Gunakan nomor WhatsApp aktif yang terpasang di HP Anda (bisa diawali 08 atau kode negara seperti 628).</p>}
                      />
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span data-cur="btn-kode" className="btn btn-primary" style={{ opacity: kodeFase === "loading" || !telepon.trim() ? 0.55 : 1 }}>
                          {kodeFase === "loading" ? <Spin t={t} /> : <KeyRound className="size-4" />}
                          Dapatkan kode 8 digit
                        </span>
                        <span className="btn btn-ghost">
                          <QrCode className="size-4" />
                          Pakai QR saja
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="pt-1">
                  <h3 className="text-[15px] font-bold">Tautkan dengan nomor telepon</h3>
                  <ol className="mt-3 space-y-2.5">
                    {LANGKAH_KODE.map((l, i) => (
                      <li key={l} className="flex gap-3 text-[13.5px] text-muted">
                        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-subtle text-[11px] font-bold text-fg">{i + 1}</span>
                        <span>{l}</span>
                      </li>
                    ))}
                  </ol>
                  <p className="hint mt-4 flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-accent" /> Cocok bila Anda membuka halaman ini dari HP yang sama atau kamera HP tidak bisa memindai QR.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
