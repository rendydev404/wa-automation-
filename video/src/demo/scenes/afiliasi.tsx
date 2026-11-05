import { NOMOR_BISNIS, USAHA } from "../data";
import { ketik, lamaKetik, tw, useT } from "../kit/anim";
import type { Cap } from "../kit/caption";
import { type Script, Stage } from "../kit/stage";
import { Main, Sidebar } from "../kit/ui";
import { Kepala, Onboarding, Terdaftar } from "../pages/d-afiliasi";

/** Durasi scene (detik). */
export const DUR = 29;

const TG = 14.5; // klik "Gabung" → halaman memuat ulang sebagai afiliator
const T_NOMOR = 9.8;
const T_NAMA = 11.6;
const NOMOR_REK = "1234567890";
const NAMA = "Rini Handayani";
const A = "11 · AFILIASI";

export function Afiliasi() {
  const t = useT();
  const rute = t < TG ? "a" : "b";
  const opasitas = rute === "a" ? tw(t, TG - 0.12, TG, 1, 0) * tw(t, 0, 0.1) : tw(t, TG, TG + 0.25, 0, 1);

  const bankBuka = t >= 6.4 && t < 8.58;
  const sorotBank = t >= 7.3 && t < 8.0 ? "mandiri" : t >= 8.0 && t < 8.58 ? "bca" : null;
  const nomor = ketik(NOMOR_REK, t, T_NOMOR, 9);
  const pemilik = ketik(NAMA, t, T_NAMA, 10);
  const fokus = t >= 9.6 && t < 11.4 ? "nomor" : t >= 11.4 && t < 14.0 ? "pemilik" : null;

  const disalin = t >= 15.95 && t < 18.2;
  const nominal = t >= 23.1 ? "149.400" : "";
  const diajukan = t >= 24.8;
  const tarikHover = t >= 22.9 && t < 23.6;

  const script: Script = {
    cursor: [
      { at: 0, to: [1000, 260] },
      { at: 1.8, to: "langkah-1" },
      { at: 3.0, to: "langkah-3" },
      { at: 4.0, to: [900, 400] },
      { at: 6.3, to: "bank-pilih", click: true },
      { at: 7.4, to: "opsi-mandiri" },
      { at: 8.4, to: "opsi-bca", click: true },
      // Titik henti eksplisit (elemen hilang saat daftar menutup / halaman berganti; Stage tidak boleh bergantung pada cache antar-frame).
      { at: 8.5, to: [467, 371], dur: 0.1 },
      { at: 9.6, to: "nomor-rek", click: true, kind: "text" },
      { at: 11.4, to: "nama-pemilik", click: true, kind: "text" },
      { at: 14.0, to: "btn-gabung", click: true },
      { at: 14.3, to: [462, 411], dur: 0.1 },
      { at: 15.8, to: "btn-salin-1", click: true },
      { at: 17.4, to: [1000, 420] },
      { at: 19.9, to: "metrik-saldo" },
      { at: 20.7, to: [900, 420] },
      { at: 23.0, to: "btn-tarik-semua", click: true },
      { at: 24.6, to: "btn-ajukan", click: true },
      { at: 24.72, to: [827, 156], dur: 0.1 },
      { at: 25.6, to: [900, 420] },
    ],
    scroll: [
      { at: 0, to: 0 },
      { at: 5.4, to: "form-gabung", align: -116, dur: 1.2 },
      { at: TG + 0.1, to: 0, dur: 0.1 },
      { at: 19.0, to: "metrik", align: 30, dur: 1.3 },
      { at: 22.0, to: "form-tarik", align: 30, dur: 1.2 },
      { at: 27.4, to: "riwayat-penarikan", align: 60, dur: 1.2 },
    ],
    camera: [
      { at: 0, zoom: 1 },
      { at: 1.4, zoom: 1.14, focus: "langkah-2", dur: 0.9 },
      { at: 4.2, zoom: 1, dur: 0.9 },
      { at: 6.2, zoom: 1.14, focus: "bank-pilih", dur: 0.8 },
      { at: 8.9, zoom: 1, dur: 0.8 },
      { at: 9.5, zoom: 1.16, focus: "nomor-rek", dur: 0.8 },
      { at: 13.4, zoom: 1, dur: 0.9 },
      { at: 15.5, zoom: 1.14, focus: "btn-salin-1", dur: 0.9 },
      { at: 17.3, zoom: 1, dur: 0.8 },
      { at: 19.8, zoom: 1.12, focus: "metrik-saldo", dur: 0.9 },
      { at: 21.2, zoom: 1, dur: 0.8 },
      { at: 22.8, zoom: 1.14, focus: "btn-tarik-semua", dur: 0.9 },
      { at: 25.6, zoom: 1, dur: 0.9 },
    ],
  };

  const caps: Cap[] = [
    { from: 0.7, to: 4.2, label: A, title: "Rekomendasikan ChatGerCep, dapatkan komisi dari setiap paket", sub: "Daftar jadi afiliator dalam 1 langkah, langsung aktif tanpa verifikasi" },
    { from: 8.8, to: 11.2, label: A, title: "Komisi dicairkan ke bank atau e-wallet pilihan Anda", sub: "BCA, Mandiri, BNI, BRI, GoPay, OVO, DANA, ShopeePay, dan lainnya" },
    { from: 11.3, to: 14.0, label: A, title: "Komisi 20% per paket, 1x per pelanggan referral", sub: "Starter +Rp19.800 · Bisnis +Rp49.800 · Pro +Rp119.800. Kode referral dibuat acak otomatis" },
    { from: 15.0, to: 18.9, label: A, title: "Bagikan tautan unik Anda", sub: "Cookie pelacakan 30 hari: pendaftar dari tautan Anda tetap tercatat untuk Anda" },
    { from: 19.3, to: 22.0, label: A, title: "Komisi masuk otomatis saat transaksi referral lunas", sub: "Klik, pendaftar, pembeli, dan saldo terpantau dalam satu layar" },
    { from: 22.4, to: 26.0, label: A, title: "Tarik saldo kapan saja, minimal Rp50.000", sub: "Status pencairan: Menunggu diproses → Sudah ditransfer" },
    { from: 26.3, to: 28.9, label: A, title: "Riwayat komisi & penarikan tercatat rapi" },
  ];

  void lamaKetik;
  return (
    <Stage
      url="/afiliasi"
      script={script}
      captions={caps}
      judulTab="Program Afiliasi"
      fixed={<Sidebar aktif="afiliasi" nomor={[{ label: NOMOR_BISNIS.label, wa: NOMOR_BISNIS.wa, status: "WORKING" }]} pengguna={USAHA.pemilik} />}
    >
      <Main>
        <div className="space-y-8" style={{ opacity: opasitas }}>
          <Kepala />
          {rute === "a" ? (
            <>
              <Onboarding bank="bca" bankBuka={bankBuka} sorotBank={sorotBank} nomor={nomor} pemilik={pemilik} fokus={fokus} t={t} />
              {/* Ruang gulir tambahan: daftar bank yang terbuka tidak boleh terpotong tepi bawah layar. */}
              <div style={{ height: 180 }} />
            </>
          ) : (
            <Terdaftar disalin={disalin} nominal={nominal} tarikHover={tarikHover} diajukan={diajukan} t={t} />
          )}
        </div>
      </Main>
    </Stage>
  );
}
