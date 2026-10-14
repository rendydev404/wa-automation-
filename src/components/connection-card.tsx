"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut, QrCode, Smartphone } from "lucide-react";
import { hubungkanWaAction, logoutWaAction } from "@/app/actions";
import { formatNomor } from "@/lib/format";
import { jalurQr } from "@/lib/qr";
import type { QrWa, StatusSesiWa } from "@/lib/types";
import { Pill, TombolKonfirmasi } from "./ui";
import { useSesiNomor, useWaStatus } from "./wa-status";

const LANGKAH = ["Buka WhatsApp di HP nomor ini", "Ketuk ⋮ atau Setelan, lalu Perangkat tertaut", "Ketuk Tautkan perangkat dan pindai kode ini"];

export function LencanaSesi({ status }: { status: StatusSesiWa | undefined }) {
  if (!status) return null;
  if (status === "WORKING")
    return (
      <Pill nada="hijau">
        <span className="size-1.5 rounded-full bg-success" /> Terhubung
      </Pill>
    );
  if (status === "SCAN_QR_CODE") return <Pill nada="kuning">Menunggu scan QR</Pill>;
  if (status === "STARTING") return <Pill nada="kuning">Menyiapkan</Pill>;
  if (status === "FAILED") return <Pill nada="kuning">Perlu dimulai ulang</Pill>;
  return <Pill nada="abu">Belum terhubung</Pill>;
}

interface GambarQr {
  n: number;
  d: string;
}

/** QR satu nomor: di-poll hanya selagi kartu ini menunggu scan dan tab-nya terlihat. */
function useQr(id: number, aktif: boolean): GambarQr | null {
  const [qr, setQr] = useState<GambarQr | null>(null);
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
            setQr({ n: d.qr.n, d: jalurQr(d.qr) });
          }
          // Sudah bukan menunggu scan (berhasil / kedaluwarsa): segarkan status bersama sekarang juga.
          if (d.status !== "SCAN_QR_CODE") muatUlang();
        }
      } catch {
        // coba lagi di putaran berikutnya
      }
      jalan = false;
      if (hidup && !document.hidden) timer = setTimeout(ambil, 2500);
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
    };
  }, [id, aktif, muatUlang]);
  return qr;
}

export function ConnectionCard({ id }: { id: number }) {
  const sesi = useSesiNomor(id);
  const { muatUlang } = useWaStatus();
  const router = useRouter();
  const [galat, setGalat] = useState("");
  const [tunggu, mulai] = useTransition();
  const qr = useQr(id, sesi?.status === "SCAN_QR_CODE");
  const waLalu = useRef<string | null | undefined>(undefined);

  // Nomor baru selesai dipasangkan: segarkan data halaman (nomor & nama tersimpan di server).
  useEffect(() => {
    if (!sesi) return;
    if (waLalu.current !== undefined && waLalu.current !== sesi.waId && sesi.status === "WORKING") router.refresh();
    waLalu.current = sesi.waId;
  }, [sesi, router]);

  const hubungkan = () =>
    mulai(async () => {
      setGalat("");
      const h = await hubungkanWaAction(id);
      if (!h.ok) setGalat(h.pesan ?? "Gagal menghubungkan.");
      muatUlang();
    });

  const logout = async () => {
    const h = await logoutWaAction(id);
    muatUlang();
    return h;
  };

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
        <div>
          <h2 className="text-[15px] font-bold tracking-tight">Koneksi WhatsApp</h2>
          <p className="hint mt-0.5">Nomor ini bisa di-logout dan diganti nomor lain kapan saja; base knowledge-nya tetap.</p>
        </div>
        <LencanaSesi status={sesi?.status} />
      </div>

      <div className="px-5 py-6 sm:px-6">
        {!sesi ? (
          <div className="flex items-center gap-3 text-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Memeriksa koneksi…
          </div>
        ) : sesi.status === "WORKING" && sesi.waId ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
                <Smartphone className="size-6" aria-hidden />
              </span>
              <div>
                <p className="text-lg font-bold tracking-tight tabular-nums">{formatNomor(sesi.waId)}</p>
                <p className="text-[13px] text-muted">{sesi.nama || "Nomor terhubung"}</p>
              </div>
            </div>
            <TombolKonfirmasi
              label="Logout nomor"
              tanya="Putuskan nomor ini dari bot?"
              ya="Ya, logout"
              aksi={logout}
              className="btn btn-ghost"
              ikon={<LogOut className="size-4" aria-hidden />}
            />
          </div>
        ) : sesi.status === "SCAN_QR_CODE" ? (
          <div className="flex flex-col items-center gap-7 sm:flex-row sm:items-start">
            <div className="grid size-[232px] shrink-0 place-items-center rounded-2xl border border-line bg-white p-3">
              {qr ? (
                <svg viewBox={`0 0 ${qr.n} ${qr.n}`} width={208} height={208} shapeRendering="crispEdges" role="img" aria-label="Kode QR untuk menautkan WhatsApp" className="animate-masuk">
                  <path d={qr.d} fill="#000" />
                </svg>
              ) : (
                <Loader2 className="size-6 animate-spin text-faint" aria-hidden />
              )}
            </div>
            <div className="pt-1">
              <h3 className="text-[15px] font-bold">Pindai untuk menautkan nomor</h3>
              <ol className="mt-3 space-y-2.5">
                {LANGKAH.map((l, i) => (
                  <li key={l} className="flex gap-3 text-[13.5px] text-muted">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-subtle text-[11px] font-bold text-fg">{i + 1}</span>
                    {l}
                  </li>
                ))}
              </ol>
              <p className="hint mt-4 flex items-center gap-1.5">
                <span className="size-1.5 animate-denyut rounded-full bg-accent" /> Kode diperbarui otomatis. Halaman ini berubah sendiri setelah berhasil.
              </p>
            </div>
          </div>
        ) : sesi.status === "STARTING" ? (
          <div className="flex items-center gap-3 text-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Menyambungkan ke WhatsApp…
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="grid size-12 place-items-center rounded-2xl bg-subtle text-muted">
                <QrCode className="size-6" aria-hidden />
              </span>
              <div>
                <p className="text-[15px] font-bold">{sesi.status === "FAILED" ? "Sesi berhenti" : "Belum terhubung"}</p>
                <p className="text-[13px] text-muted">
                  {sesi.alasan ??
                    (sesi.status === "FAILED"
                      ? "Koneksi ke WhatsApp terputus. Hubungkan ulang untuk melanjutkan."
                      : "Tautkan nomor WhatsApp dengan memindai kode QR dari HP.")}
                </p>
              </div>
            </div>
            <button type="button" className="btn btn-primary" disabled={tunggu} onClick={hubungkan}>
              {tunggu ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <QrCode className="size-4" aria-hidden />}
              {sesi.status === "FAILED" ? "Hubungkan ulang" : "Tampilkan QR"}
            </button>
          </div>
        )}
        {galat && <p className="mt-3 text-[13px] text-danger">{galat}</p>}
      </div>
    </section>
  );
}
