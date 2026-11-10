"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { ambilQr } from "../app/aksi";
import type { StatusNomor } from "../lib/sdk";
import { useAliran } from "./aliran";
import { LencanaStatus } from "./umum";

/**
 * QR & status satu nomor secara langsung. Sumber utama: event webhook `nomor.qr` / `nomor.status` yang diteruskan
 * lewat SSE (tanpa polling). Cadangan: QR diambil sekali saat panel dibuka, dan lewat tombol "Ambil QR".
 */
export function PanelSambung({ nomorId, statusAwal }: { nomorId: string; statusAwal: StatusNomor }) {
  const router = useRouter();
  const [status, setStatus] = useState<StatusNomor>(statusAwal);
  const [png, setPng] = useState<string | null>(null);
  const [kodePairing, setKodePairing] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);
  const [sibuk, mulai] = useTransition();

  const muatQr = useCallback(() => {
    mulai(async () => {
      const hasil = await ambilQr(nomorId);
      if (!hasil.ok) {
        setPesan(hasil.pesan);
        return;
      }
      setPesan(null);
      if (hasil.qr.status) setStatus(hasil.qr.status);
      setPng(hasil.qr.png_base64);
    });
  }, [nomorId]);

  // Sekali saat panel dibuka; setelah itu QR baru datang sendiri lewat event `nomor.qr`.
  useEffect(() => {
    if (statusAwal !== "terhubung") muatQr();
  }, [muatQr, statusAwal]);

  const tersambung = useAliran(`nomor=${encodeURIComponent(nomorId)}&jenis=nomor.qr,nomor.status,nomor.pairing,nomor.terhubung,nomor.terputus`, (event) => {
    switch (event.jenis) {
      case "nomor.qr":
        setPng(event.data.png);
        setStatus("menunggu_qr");
        setPesan(null);
        break;
      case "nomor.status":
        setStatus(event.data.status);
        if (event.data.status !== "menunggu_qr") setPng(null);
        if (event.data.status === "terhubung") router.refresh();
        break;
      case "nomor.pairing":
        setKodePairing(event.data.kode);
        break;
      case "nomor.terhubung":
        setStatus("terhubung");
        setPng(null);
        router.refresh();
        break;
      case "nomor.terputus":
        setStatus("terputus");
        setPng(null);
        break;
    }
  });

  return (
    <div className="panel-qr">
      <div className="baris">
        <LencanaStatus status={status} />
        <span className={`langsung ${tersambung ? "hidup" : ""}`}>{tersambung ? "Langsung" : "Menyambung…"}</span>
      </div>

      {status === "terhubung" ? (
        <p className="catatan ok">Nomor sudah terhubung ke WhatsApp. Bot siap menjawab.</p>
      ) : png ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="qr" src={`data:image/png;base64,${png}`} alt="Kode QR WhatsApp" width={264} height={264} />
          <p className="kecil">Di HP: WhatsApp, Perangkat tertaut, Tautkan perangkat, lalu pindai kode ini. Kode berganti kira-kira tiap 20 detik.</p>
        </>
      ) : (
        <div className="qr kosong">{sibuk ? "Mengambil QR…" : "QR belum tersedia"}</div>
      )}

      {kodePairing && (
        <p className="salin">
          <span className="kecil">Kode pairing</span>
          <code>{kodePairing}</code>
        </p>
      )}
      {pesan && (
        <p role="alert" className="catatan galat">
          {pesan}
        </p>
      )}

      {status !== "terhubung" && (
        <button type="button" className="tombol biasa" onClick={muatQr} disabled={sibuk}>
          {sibuk ? "Mengambil…" : "Ambil QR"}
        </button>
      )}
      <p className="kecil">QR diperbarui otomatis bila webhook sudah didaftarkan di halaman Pengaturan. Belum? Tekan Ambil QR untuk memuat kode terbaru.</p>
    </div>
  );
}
