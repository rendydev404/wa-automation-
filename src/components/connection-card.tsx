"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound, Loader2, LogOut, QrCode, RefreshCw, Smartphone } from "lucide-react";
import { hubungkanWaAction, kodePairingWaAction, logoutWaAction } from "@/app/actions";
import type { T } from "@/lib/bahasa";
import { alasanWa } from "@/lib/alasan-wa";
import { formatNomor } from "@/lib/format";
import { type QrPixel, jalurQrPixel } from "@/lib/qr";
import type { QrWa, StatusSesiWa } from "@/lib/types";
import { useBahasa } from "./bahasa";
import { PATH_TANDA } from "./logo";
import { Pill, TombolKonfirmasi } from "./ui";
import { useSesiNomor, useWaStatus } from "./wa-status";

// Label versi Inggris mengikuti teks resmi WhatsApp: Linked devices, Link a device, Link with phone number instead.
const langkahQr = (t: T) => [
  t("Buka WhatsApp di HP nomor ini", "Open WhatsApp on the phone that uses this number"),
  t(
    "Android: ketuk menu titik tiga di kanan atas. iPhone (iOS): buka Pengaturan di kanan bawah, lalu pilih Perangkat Tertaut",
    "Android: tap the ⋮ menu (More options) at the top right, then Linked devices. iPhone (iOS): open Settings at the bottom right, then tap Linked Devices",
  ),
  t("Ketuk Tautkan Perangkat dan arahkan kamera HP ke kode QR ini", "Tap Link a device and point your phone's camera at this QR code"),
];

const langkahKode = (t: T) => [
  t(
    "Buka WhatsApp di HP, lalu masuk ke menu Perangkat Tertaut dan ketuk Tautkan Perangkat",
    "Open WhatsApp on your phone, go to Linked devices (Android: ⋮ menu; iPhone: Settings) and tap Link a device",
  ),
  t("Ketuk Tautkan dengan nomor telepon saja di bagian bawah layar pemindai QR", "Tap Link with phone number instead at the bottom of the QR scanner screen"),
  t("Masukkan kode 8 karakter di samping pada layar HP Anda", "Enter the 8-character code shown here on your phone"),
];

export function LencanaSesi({ status }: { status: StatusSesiWa | undefined }) {
  const { t } = useBahasa();
  if (!status) return null;
  if (status === "WORKING")
    return (
      <Pill nada="hijau">
        <span className="size-1.5 rounded-full bg-success" /> {t("Terhubung", "Connected")}
      </Pill>
    );
  if (status === "SCAN_QR_CODE") return <Pill nada="kuning">{t("Menunggu ditautkan", "Waiting to link")}</Pill>;
  if (status === "STARTING") return <Pill nada="kuning">{t("Menyiapkan", "Starting")}</Pill>;
  if (status === "FAILED") return <Pill nada="kuning">{t("Perlu dimulai ulang", "Needs restart")}</Pill>;
  return <Pill nada="abu">{t("Belum terhubung", "Not connected")}</Pill>;
}

/** Bingkai berundak ala piksel 8-bit pada kotak (x, y, s) dengan takik sudut `c`. */
function poligonPiksel(x: number, y: number, s: number, c: number): string {
  return `M${x + c} ${y}H${x + s - c}V${y + c}H${x + s}V${y + s - c}H${x + s - c}V${y + s}H${x + c}V${y + s - c}H${x}V${y + c}H${x + c}Z`;
}

/** QR & kode tautan satu nomor: di-poll hanya selagi kartu ini menunggu penautan dan tab-nya terlihat. */
function useQrDanKode(id: number, aktif: boolean): { qr: QrPixel | null; kodeServer: string | null } {
  const [qr, setQr] = useState<QrPixel | null>(null);
  const [kodeServer, setKodeServer] = useState<string | null>(null);
  const { muatUlang } = useWaStatus();
  useEffect(() => {
    if (!aktif) return;
    let hidup = true;
    let jalan = false;
    let hash = "";
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function ambil() {
      if (jalan || !hidup) return;
      jalan = true;
      clearTimeout(timer);
      try {
        const res = await fetch(`/api/wa/qr?id=${id}&h=${hash}`, { cache: "no-store" });
        if (res.ok && hidup) {
          const d = (await res.json()) as QrWa;
          if (d.qr) {
            hash = d.hash ?? "";
            setQr(jalurQrPixel(d.qr));
          }
          if (d.kodePairing) setKodeServer(d.kodePairing);
          // Sudah bukan menunggu scan (berhasil / kedaluwarsa): segarkan status bersama sekarang juga.
          if (d.status !== "SCAN_QR_CODE") muatUlang();
        }
      } catch {
        // coba lagi di putaran berikutnya
      }
      jalan = false;
      if (hidup && !document.hidden) timer = setTimeout(ambil, 1500);
    }
    // Kode berganti tiap ±20 detik: saat tab kembali terlihat, langsung ambil yang terbaru.
    const saatTerlihat = () => {
      if (!document.hidden) void ambil();
    };
    void ambil();
    document.addEventListener("visibilitychange", saatTerlihat);
    return () => {
      hidup = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", saatTerlihat);
      setQr(null);
      setKodeServer(null);
    };
  }, [id, aktif, muatUlang]);
  return { qr, kodeServer };
}

export function ConnectionCard({ id }: { id: number }) {
  const sesi = useSesiNomor(id);
  const { muatUlang } = useWaStatus();
  const router = useRouter();
  const { b, t } = useBahasa();
  const [galat, setGalat] = useState("");
  const [metode, setMetode] = useState<"qr" | "kode">("qr");
  const [bukaFormKode, setBukaFormKode] = useState(false);
  const [telepon, setTelepon] = useState("");
  const [kodeLokal, setKodeLokal] = useState<string | null>(null);
  const [disalin, setDisalin] = useState(false);
  const [tunggu, mulai] = useTransition();
  const [tungguKode, mulaiKode] = useTransition();
  const { qr, kodeServer } = useQrDanKode(id, sesi?.status === "SCAN_QR_CODE");
  const waLalu = useRef<string | null | undefined>(undefined);

  const kodeAktif = sesi?.status === "SCAN_QR_CODE" ? (kodeLokal ?? kodeServer) : null;

  // Nomor baru selesai dipasangkan: segarkan data halaman (nomor & nama tersimpan di server).
  useEffect(() => {
    if (!sesi) return;
    if (waLalu.current !== undefined && waLalu.current !== sesi.waId && sesi.status === "WORKING") router.refresh();
    waLalu.current = sesi.waId;
  }, [sesi, router]);

  const hubungkan = (modeTujuan: "qr" | "kode" = "qr") => {
    setMetode(modeTujuan);
    if (modeTujuan === "qr") setBukaFormKode(false);
    mulai(async () => {
      setGalat("");
      setKodeLokal(null);
      const h = await hubungkanWaAction(id);
      if (!h.ok) setGalat(h.pesan ?? t("Gagal menghubungkan.", "Couldn't connect."));
      muatUlang();
    });
  };

  const mintaKode = (e: React.FormEvent) => {
    e.preventDefault();
    const bersih = telepon.trim();
    if (!bersih) {
      setGalat(t("Masukkan nomor telepon WhatsApp terlebih dahulu.", "Enter your WhatsApp phone number first."));
      return;
    }
    mulaiKode(async () => {
      setGalat("");
      const h = await kodePairingWaAction(id, bersih);
      if (!h.ok || !h.kode) {
        setGalat(h.pesan ?? t("Gagal meminta kode tautan.", "Couldn't get a link code."));
      } else {
        setKodeLokal(h.kode);
        setMetode("kode");
        setBukaFormKode(false);
      }
      muatUlang();
    });
  };

  const salinKode = async () => {
    if (!kodeAktif) return;
    const teks = `${kodeAktif.slice(0, 4)}-${kodeAktif.slice(4, 8)}`;
    try {
      await navigator.clipboard.writeText(teks);
      setDisalin(true);
      setTimeout(() => setDisalin(false), 2000);
    } catch {
      // clipboard tidak diizinkan browser
    }
  };

  const logout = async () => {
    setKodeLokal(null);
    setBukaFormKode(false);
    setMetode("qr");
    const h = await logoutWaAction(id);
    muatUlang();
    return h;
  };

  const tampilPanelTaut = sesi?.status === "SCAN_QR_CODE" || bukaFormKode;

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
        <div>
          <h2 className="text-[15px] font-bold tracking-tight">{t("Koneksi WhatsApp", "WhatsApp connection")}</h2>
          <p className="hint mt-0.5">
            {t(
              "Nomor ini bisa di-logout dan diganti nomor lain kapan saja; base knowledge-nya tetap.",
              "You can log out this number and link a different one at any time; its product knowledge stays.",
            )}
          </p>
        </div>
        <LencanaSesi status={sesi?.status} />
      </div>

      <div className="px-5 py-6 sm:px-6">
        {!sesi ? (
          <div className="flex items-center gap-3 text-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden /> {t("Memeriksa koneksi…", "Checking connection…")}
          </div>
        ) : sesi.status === "WORKING" && sesi.waId ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
                <Smartphone className="size-6" aria-hidden />
              </span>
              <div>
                <p className="text-lg font-bold tracking-tight tabular-nums">{formatNomor(sesi.waId)}</p>
                <p className="text-[13px] text-muted">{sesi.nama || t("Nomor terhubung", "Number connected")}</p>
              </div>
            </div>
            <TombolKonfirmasi
              label={t("Logout nomor", "Log out number")}
              tanya={t("Putuskan nomor ini dari bot?", "Disconnect this number from the bot?")}
              ya={t("Ya, logout", "Yes, log out")}
              aksi={logout}
              className="btn btn-ghost"
              ikon={<LogOut className="size-4" aria-hidden />}
            />
          </div>
        ) : sesi.status === "STARTING" && !bukaFormKode ? (
          <div className="flex items-center gap-3 text-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden /> {t("Menyambungkan ke WhatsApp…", "Connecting to WhatsApp…")}
          </div>
        ) : tampilPanelTaut ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
              <div role="tablist" aria-label={t("Metode penautan WhatsApp", "WhatsApp linking method")} className="grid w-full grid-cols-2 rounded-xl border border-line bg-subtle p-1 sm:inline-flex sm:w-auto">
                <button
                  type="button"
                  role="tab"
                  aria-selected={metode === "qr"}
                  onClick={() => {
                    setGalat("");
                    setBukaFormKode(false);
                    setMetode("qr");
                    if (sesi.status !== "SCAN_QR_CODE" && sesi.status !== "STARTING") hubungkan("qr");
                  }}
                  className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap transition-colors sm:px-3.5 ${
                    metode === "qr" ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg"
                  }`}
                >
                  <QrCode className="size-4 shrink-0" aria-hidden />
                  <span className="sm:hidden">{t("Kode QR", "QR code")}</span>
                  <span className="max-sm:hidden">{t("Pindai Kode QR", "Scan QR code")}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={metode === "kode"}
                  onClick={() => {
                    setGalat("");
                    setMetode("kode");
                  }}
                  className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap transition-colors sm:px-3.5 ${
                    metode === "kode" ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg"
                  }`}
                >
                  <KeyRound className="size-4 shrink-0" aria-hidden />
                  <span className="sm:hidden">{t("Nomor HP", "Phone number")}</span>
                  <span className="max-sm:hidden">{t("Pakai Nomor Telepon", "Use phone number")}</span>
                </button>
              </div>

              {metode === "qr" && (
                <button
                  type="button"
                  onClick={() => setMetode("kode")}
                  className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent hover:underline max-sm:hidden"
                >
                  <KeyRound className="size-3.5" aria-hidden />
                  {t("Tautkan dengan nomor telepon saja", "Link with phone number instead")}
                </button>
              )}
            </div>

            {metode === "qr" ? (
              <div className="flex flex-col items-center gap-7 sm:flex-row sm:items-start">
                <div className="relative grid size-[244px] shrink-0 place-items-center rounded-2xl border-2 border-line-strong bg-white p-3.5 shadow-card">
                  {/* Siku bidik piksel di 4 sudut kartu QR */}
                  <span aria-hidden className="pointer-events-none absolute top-2 left-2 size-3 border-t-2 border-l-2 border-accent" />
                  <span aria-hidden className="pointer-events-none absolute top-2 right-2 size-3 border-t-2 border-r-2 border-accent" />
                  <span aria-hidden className="pointer-events-none absolute bottom-2 left-2 size-3 border-b-2 border-l-2 border-accent" />
                  <span aria-hidden className="pointer-events-none absolute right-2 bottom-2 size-3 border-r-2 border-b-2 border-accent" />

                  {qr ? (
                    <svg
                      viewBox={`0 0 ${qr.n} ${qr.n}`}
                      width={216}
                      height={216}
                      shapeRendering="crispEdges"
                      role="img"
                      aria-label={t(
                        "Kode QR bergaya piksel dengan logo aplikasi di tengah untuk menautkan WhatsApp",
                        "Pixel-style QR code with the app logo in the middle, for linking WhatsApp",
                      )}
                      className="animate-masuk"
                    >
                      <rect width={qr.n} height={qr.n} fill="#ffffff" />
                      {/* Matriks piksel data dua nada gelap (kontras tinggi untuk kamera iOS & Android) */}
                      <path d={qr.pikselUtama} fill="#0b1813" />
                      <path d={qr.pikselAksen} fill="#0b4f3b" />
                      {/* 3 mata sudut QR bergaya ubin piksel */}
                      <path d={qr.mataLuar} fill="#0b1813" />
                      <path d={qr.mataDalam} fill="#0b6249" />
                      <path d={qr.mataPusat} fill="#0aa878" />
                      {/* Lencana piksel berundak di pusat QR berisi logo resmi aplikasi */}
                      <path d={poligonPiksel(qr.logo.x, qr.logo.y, qr.logo.ukuran, 1)} fill="#ffffff" />
                      <path d={poligonPiksel(qr.logo.x + 0.5, qr.logo.y + 0.5, qr.logo.ukuran - 1, 1)} fill="#0aa878" />
                      <path d={poligonPiksel(qr.logo.x + 1, qr.logo.y + 1, qr.logo.ukuran - 2, 1)} fill="#0b1813" />
                      <svg
                        x={qr.logo.x + 1.85}
                        y={qr.logo.y + 1.85}
                        width={qr.logo.ukuran - 3.7}
                        height={qr.logo.ukuran - 3.7}
                        viewBox="0 0 100 100"
                        shapeRendering="geometricPrecision"
                      >
                        <path d={PATH_TANDA} fill="#3ddc97" />
                        <circle cx="94.76" cy="75.68" r="4.68" fill="#3ddc97" />
                      </svg>
                    </svg>
                  ) : (
                    <Loader2 className="size-6 animate-spin text-faint" aria-hidden />
                  )}
                </div>
                <div className="pt-1">
                  <h3 className="text-[15px] font-bold">{t("Pindai kode QR dari aplikasi WhatsApp", "Scan the QR code from the WhatsApp app")}</h3>
                  <ol className="mt-3 space-y-2.5">
                    {langkahQr(t).map((l, i) => (
                      <li key={l} className="flex gap-3 text-[13.5px] text-muted">
                        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-subtle text-[11px] font-bold text-fg">{i + 1}</span>
                        <span>{l}</span>
                      </li>
                    ))}
                  </ol>
                  <p className="hint mt-4 flex items-center gap-1.5">
                    <span className="size-1.5 animate-denyut rounded-full bg-accent" />{" "}
                    {t(
                      "Kode QR diperbarui otomatis. Halaman akan terhubung sendiri begitu selesai dipindai.",
                      "The QR code refreshes automatically. This page connects on its own once it's scanned.",
                    )}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-7 lg:flex-row lg:items-start">
                <div className="w-full max-w-md shrink-0 rounded-2xl border border-line bg-subtle/60 p-4 sm:p-5">
                  {kodeAktif ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold tracking-wide text-muted uppercase">{t("Kode Tautan 8 Karakter", "8-character link code")}</span>
                        <button
                          type="button"
                          onClick={salinKode}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-2.5 py-1 text-xs font-semibold text-fg transition-colors hover:bg-subtle"
                        >
                          {disalin ? <Check className="size-3.5 text-success" aria-hidden /> : <Copy className="size-3.5 text-muted" aria-hidden />}
                          {disalin ? t("Tersalin", "Copied") : t("Salin kode", "Copy code")}
                        </button>
                      </div>

                      <div className="flex items-center justify-center gap-1 sm:gap-2" aria-label={`${t("Kode tautan", "Link code")} ${kodeAktif.slice(0, 4)} ${kodeAktif.slice(4, 8)}`}>
                        {kodeAktif
                          .slice(0, 4)
                          .split("")
                          .map((kar, i) => (
                            <span
                              key={`a-${i}`}
                              className="grid h-11 max-w-10 min-w-0 flex-1 place-items-center rounded-xl border border-line-strong bg-surface font-mono text-lg font-bold text-fg shadow-card sm:h-12 sm:w-10 sm:flex-none sm:text-xl sm:tracking-wider"
                            >
                              {kar}
                            </span>
                          ))}
                        <span className="px-0.5 font-mono text-lg font-bold text-muted" aria-hidden>
                          -
                        </span>
                        {kodeAktif
                          .slice(4, 8)
                          .split("")
                          .map((kar, i) => (
                            <span
                              key={`b-${i}`}
                              className="grid h-11 max-w-10 min-w-0 flex-1 place-items-center rounded-xl border border-line-strong bg-surface font-mono text-lg font-bold text-fg shadow-card sm:h-12 sm:w-10 sm:flex-none sm:text-xl sm:tracking-wider"
                            >
                              {kar}
                            </span>
                          ))}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setKodeLokal(null);
                            setBukaFormKode(true);
                          }}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-fg"
                        >
                          <RefreshCw className="size-3.5" aria-hidden />
                          {t("Ganti nomor atau minta kode baru", "Change number or get a new code")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setBukaFormKode(false);
                            setMetode("qr");
                          }}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline"
                        >
                          <QrCode className="size-3.5" aria-hidden />
                          {t("Kembali ke kode QR", "Back to QR code")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={mintaKode} className="space-y-3.5">
                      <div>
                        <label htmlFor={`tel-pairing-${id}`} className="label">
                          {t("Nomor WhatsApp yang akan ditautkan", "WhatsApp number to link")}
                        </label>
                        <input
                          id={`tel-pairing-${id}`}
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          placeholder={t("Contoh: 0812-3456-7890 atau 62812...", "E.g. +1 415 555 0123 or +62812...")}
                          value={telepon}
                          onChange={(e) => setTelepon(e.target.value)}
                          disabled={tungguKode}
                          className="field tabular-nums"
                        />
                        <p className="hint mt-1.5">
                          {t(
                            "Gunakan nomor WhatsApp aktif yang terpasang di HP Anda (bisa diawali 08 atau kode negara seperti 628).",
                            "Use the active WhatsApp number on your phone, including the country code (e.g. +1 or +62).",
                          )}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <button type="submit" disabled={tungguKode || !telepon.trim()} className="btn btn-primary">
                          {tungguKode ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <KeyRound className="size-4" aria-hidden />}
                          {t("Dapatkan kode 8 digit", "Get 8-character code")}
                        </button>
                        <button
                          type="button"
                          disabled={tungguKode}
                          onClick={() => {
                            setBukaFormKode(false);
                            setMetode("qr");
                            if (sesi.status !== "SCAN_QR_CODE") hubungkan("qr");
                          }}
                          className="btn btn-ghost"
                        >
                          <QrCode className="size-4" aria-hidden />
                          {t("Pakai QR saja", "Use QR instead")}
                        </button>
                      </div>
                    </form>
                  )}
                </div>

                <div className="pt-1">
                  <h3 className="text-[15px] font-bold">{t("Tautkan dengan nomor telepon", "Link with phone number")}</h3>
                  <ol className="mt-3 space-y-2.5">
                    {langkahKode(t).map((l, i) => (
                      <li key={l} className="flex gap-3 text-[13.5px] text-muted">
                        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-subtle text-[11px] font-bold text-fg">{i + 1}</span>
                        <span>{l}</span>
                      </li>
                    ))}
                  </ol>
                  <p className="hint mt-4 flex items-center gap-1.5">
                    <span className="size-1.5 animate-denyut rounded-full bg-accent" />{" "}
                    {t(
                      "Cocok bila Anda membuka halaman ini dari HP yang sama atau kamera HP tidak bisa memindai QR.",
                      "Handy if you opened this page on the same phone or your camera can't scan the QR code.",
                    )}
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="grid size-12 place-items-center rounded-2xl bg-subtle text-muted">
                <QrCode className="size-6" aria-hidden />
              </span>
              <div>
                <p className="text-[15px] font-bold">{sesi.status === "FAILED" ? t("Sesi berhenti", "Session stopped") : t("Belum terhubung", "Not connected")}</p>
                <p className="text-[13px] text-muted">
                  {(sesi.alasan && alasanWa(sesi.alasan, b)) ??
                    (sesi.status === "FAILED"
                      ? t("Koneksi ke WhatsApp terputus. Hubungkan ulang untuk melanjutkan.", "The connection to WhatsApp dropped. Reconnect to continue.")
                      : t(
                          "Tautkan nomor WhatsApp dengan memindai kode QR atau memasukkan kode 8 digit di HP.",
                          "Link your WhatsApp number by scanning a QR code or entering an 8-character code on your phone.",
                        ))}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={tunggu}
                onClick={() => {
                  setGalat("");
                  setMetode("kode");
                  setBukaFormKode(true);
                  hubungkan("kode");
                }}
              >
                <KeyRound className="size-4" aria-hidden />
                {t("Pakai kode nomor", "Use phone number code")}
              </button>
              <button type="button" className="btn btn-primary" disabled={tunggu} onClick={() => hubungkan("qr")}>
                {tunggu ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <QrCode className="size-4" aria-hidden />}
                {sesi.status === "FAILED" ? t("Hubungkan ulang (QR)", "Reconnect (QR)") : t("Tampilkan QR", "Show QR code")}
              </button>
            </div>
          </div>
        )}
        {galat && <p className="mt-3 text-[13px] text-danger">{galat}</p>}
      </div>
    </section>
  );
}
