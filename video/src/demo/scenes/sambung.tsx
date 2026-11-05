import { NOMOR_BISNIS } from "../data";
import { E, ketik, pegas, tw, useT } from "../kit/anim";
import type { Cap } from "../kit/caption";
import { Phone } from "../kit/phone";
import { type Script, Stage } from "../kit/stage";
import { Main, Sidebar } from "../kit/ui";
import { KoneksiKartu } from "../pages/a-koneksi";
import { LayarScan, PT } from "../pages/a-ponsel";
import { NomorFrame } from "../pages/nomor-frame";

/** Durasi scene (detik). */
export const DUR = 35.8;

const T = {
  scroll: 6.0,
  tabKode: 9.6,
  telp: 10.5,
  kodeBtn: 12.7,
  salin: 14.6,
  kembali: 16.4,
  phone: 17.4,
  phoneOut: 29.0,
  top: 30.4,
};
const T_TERHUBUNG = T.phone + PT.scan + 0.6;
const KODE = "K7M29QXP";
const TELP = "0857 1234 5678";

/** Titik di viewport (px logis) untuk elemen yang hilang setelah diklik (dibaca dari render nyata). */
const POS = { kode: [445, 415] as [number, number], kembali: [698, 389] as [number, number] };

export function Sambung() {
  const t = useT();
  const nol = [0, 0, 0, 0, 0, 0, 0];

  // ---- keadaan UI sebagai fungsi waktu
  const terhubung = t >= T_TERHUBUNG;
  const status = terhubung ? "WORKING" : "SCAN_QR_CODE";
  const metode = t >= T.tabKode + 0.12 && t < T.kembali + 0.12 ? "kode" : "qr";
  const kodeFase = t >= T.kodeBtn + 1.0 ? "kode" : t >= T.kodeBtn + 0.1 ? "loading" : "form";
  const telepon = ketik(TELP, t, T.telp + 0.4, 12);

  const tp = t - T.phone;
  const ponselMasuk = pegas(t, T.phone, 18, 90);
  const ponselKeluar = tw(t, T.phoneOut, T.phoneOut + 0.7, 0, 1, E.in);
  const ponselAda = t >= T.phone - 0.05 && t < T.phoneOut + 0.8;

  const script: Script = {
    cursor: [
      { at: 0, to: [900, 300] },
      { at: 5.95, to: [990, 470] },
      { at: 8.4, to: "qr-kartu" },
      { at: T.tabKode - 0.05, to: "tab-kode", click: true },
      { at: T.telp - 0.05, to: "f-telp", click: true, kind: "text" },
      { at: T.kodeBtn - 0.05, to: POS.kode, click: true },
      { at: T.salin - 0.05, to: "btn-salin", click: true },
      { at: T.kembali - 0.05, to: POS.kembali, click: true },
      { at: 17.9, to: [900, 520] },
      { at: 29.9, to: [1120, 300] },
    ],
    scroll: [
      { at: 0, to: 0 },
      { at: T.scroll, to: "sec-koneksi", align: 70, dur: 1.3 },
      { at: T.top + 1.3, to: 0, dur: 1.3 },
    ],
    camera: [
      { at: 0, zoom: 1 },
      { at: 8.0, zoom: 1.12, focus: [560, 300], dur: 1.0 },
      { at: 9.9, zoom: 1, dur: 0.9 },
      { at: 17.6, zoom: 1.12, focus: [520, 300], dur: 1.1 },
      { at: 29.6, zoom: 1, dur: 1.0 },
    ],
  };

  const caps: Cap[] = [
    { from: 5.7, to: 9.5, label: "4 · SAMBUNGKAN", title: "Scan QR dari HP: tersambung seperti WhatsApp Web", sub: "Kode QR diperbarui otomatis" },
    { from: 10.0, to: 13.0, label: "4 · SAMBUNGKAN", title: "Tidak bisa scan? Tautkan lewat nomor telepon", sub: "Cocok bila halaman dibuka dari HP yang sama" },
    { from: 13.9, to: 16.2, label: "4 · SAMBUNGKAN", title: "Masukkan kode 8 karakter di HP", sub: "Perangkat tertaut → Tautkan dengan nomor telepon saja" },
    { from: 18.0, to: 20.2, label: "4 · SAMBUNGKAN", title: "Di HP: WhatsApp → Perangkat tertaut", sub: "Android: menu titik tiga · iPhone: Pengaturan" },
    { from: 20.5, to: 23.0, label: "4 · SAMBUNGKAN", title: "Tautkan perangkat, arahkan kamera ke QR", sub: "Nomor tertaut sebagai perangkat, bukan pindah aplikasi" },
    { from: 24.0, to: 28.6, label: "4 · SAMBUNGKAN", title: "Tersambung! HP tetap bisa dipakai seperti biasa", sub: "Putuskan kapan saja dari dashboard atau dari menu Perangkat tertaut di HP" },
    { from: 31.3, to: 35.4, label: "4 · SAMBUNGKAN", title: "Status hijau: AI siap membalas chat masuk", sub: "Balasan otomatis langsung aktif · AI hanya membalas chat masuk" },
  ];

  return (
    <Stage
      url="/nomor/1"
      script={script}
      captions={caps}
      judulTab="CS Utama · ChatGerCep"
      fixed={
        <>
          <Sidebar aktif={1} nomor={[{ label: NOMOR_BISNIS.label, wa: terhubung ? NOMOR_BISNIS.wa : undefined, status }]} pengguna="Rini Handayani" />
        </>
      }
      canvas={
        ponselAda ? (
          <div style={{ position: "absolute", left: 1385, top: 150, opacity: ponselMasuk * (1 - ponselKeluar), transform: `translateX(${(1 - ponselMasuk) * 560 + ponselKeluar * 560}px)` }}>
            <Phone scale={0.86}>
              <LayarScan tp={tp} />
            </Phone>
          </div>
        ) : null
      }
    >
      <Main>
        <NomorFrame
          label={NOMOR_BISNIS.label}
          wa={terhubung ? NOMOR_BISNIS.wa : undefined}
          status={status}
          saklar={1}
          stat={{ masuk: 0, total7: 0, dibalas: 0, tren: nol, pelanggan: 0, masukTotal: 0, dok: 0, karakter: 0 }}
          navAktif="koneksi"
          slot={{
            koneksi: <KoneksiKartu status={terhubung ? "WORKING" : "SCAN_QR_CODE"} metode={metode} kodeFase={kodeFase} telepon={telepon} teleponFokus={t >= T.telp && t < T.kodeBtn} kode={KODE} disalin={t >= T.salin + 0.12 && t < T.kembali} t={t} />,
          }}
        />
      </Main>
    </Stage>
  );
}
