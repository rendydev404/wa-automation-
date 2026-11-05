import { NOMOR_BISNIS, USAHA } from "../data";
import { E, pegas, tw, useT } from "../kit/anim";
import type { Cap } from "../kit/caption";
import { type Script, Stage } from "../kit/stage";
import { Main, Sidebar } from "../kit/ui";
import { KartuLanggananS } from "../pages/dashboard";
import { HalamanBayar, HalamanSukses, HalamanTagihan, JudulHalaman, type Kanal, PilihPaket } from "../pages/d-langganan";

/** Durasi scene (detik). */
export const DUR = 40;

/** Perpindahan halaman: /langganan → /bayar → /tagihan → hasil. */
const TB = 12.15;
const TC = 21.0;
const TD = 31.6;
const L = "10 · LANGGANAN";

export function Langganan() {
  const t = useT();
  const rute = t < TB ? "a" : t < TC ? "b" : t < TD ? "c" : "d";
  const fade = (a: number, b?: number) => Math.min(tw(t, a, a + 0.22, 0, 1), b === undefined ? 1 : tw(t, b - 0.12, b, 1, 0));
  const opasitas = rute === "a" ? tw(t, TB - 0.12, TB, 1, 0) * tw(t, 0, 0.1) : rute === "b" ? fade(TB, TC) : rute === "c" ? fade(TC, TD) : fade(TD);

  const pilih: Kanal = t >= 16.4 ? "qris" : t >= 14.4 ? "gopay" : "qris";
  const sorotKanal: Kanal | null = t >= 17.6 && t < 19.0 ? "bca" : null;
  const memuat = t >= 20.3 && t < TC;
  const hover = t >= 9.5 && t < 11.0 ? 2 : t >= 8.0 && t < 9.5 ? 1 : t >= 6.6 && t < 8.0 ? 0 : t >= 11.2 && t < TB ? 1 : -1;
  const sisa = Math.max(0, 892 - Math.floor((t - TC) * 1.0));

  const script: Script = {
    cursor: [
      { at: 0, to: [1000, 300] },
      { at: 1.6, to: "kartu-langganan" },
      { at: 3.5, to: [940, 330] },
      { at: 6.8, to: "paket-1" },
      { at: 8.2, to: "paket-2" },
      { at: 9.6, to: "paket-3" },
      { at: 11.75, to: "btn-paket-2", click: true },
      // Titik henti eksplisit: elemen ini hilang saat halaman berganti, dan Stage tidak boleh bergantung pada cache antar-frame.
      { at: 12.0, to: [852, 569], dur: 0.1 },
      { at: 14.3, to: "kanal-gopay", click: true },
      { at: 16.3, to: "kanal-qris", click: true },
      { at: 17.8, to: "kanal-bca" },
      { at: 20.2, to: "btn-bayar", click: true },
      { at: 20.45, to: [682, 679], dur: 0.1 },
      { at: 22.4, to: "qr-gambar" },
      { at: 24.2, to: "btn-simpan-qr" },
      { at: 25.3, to: [1000, 420] },
      { at: 28.4, to: "cara-bayar" },
      { at: 30.2, to: "status-oto" },
      { at: 30.5, to: [741, 568], dur: 0.1 },
      { at: 33.8, to: "rangkuman" },
      { at: 37.2, to: "btn-ke-dashboard", click: true },
    ],
    scroll: [
      { at: 0, to: 0 },
      { at: 5.2, to: "sec-paket", align: 56, dur: 1.5 },
      { at: TB + 0.1, to: 0, dur: 0.1 },
      { at: TC + 0.1, to: 0, dur: 0.1 },
      { at: 26.8, to: "cara-bayar", align: 40, dur: 1.4 },
      { at: TD + 0.1, to: 0, dur: 0.1 },
    ],
    camera: [
      { at: 0, zoom: 1 },
      { at: 1.2, zoom: 1.18, focus: "kartu-langganan", dur: 1.0 },
      { at: 3.4, zoom: 1, dur: 0.9 },
      { at: 14.0, zoom: 1.1, focus: "kanal-gopay", dur: 1.0 },
      { at: 19.6, zoom: 1, dur: 1.0 },
      { at: 22.2, zoom: 1.28, focus: "qr-gambar", dur: 1.2 },
      { at: 24.8, zoom: 1, dur: 0.8 },
      { at: 32.8, zoom: 1.15, focus: "rangkuman", dur: 1.0 },
      { at: 36.8, zoom: 1, dur: 1.0 },
    ],
  };

  const caps: Cap[] = [
    { from: 0.7, to: 4.6, label: L, title: "Kuota balasan AI selalu terlihat", sub: "Percobaan gratis: 5 balasan AI selama 7 hari. Kuota habis, AI berhenti membalas, chat tetap masuk ke HP Anda" },
    { from: 5.6, to: 8.6, label: L, title: "Tiga paket dengan kuota berbeda", sub: "Starter Rp99.000 · Bisnis Rp249.000 · Pro Rp599.000, masing-masing 30 hari" },
    { from: 8.8, to: 11.9, label: L, title: "Perpanjang paket yang sama = masa & kuota ditambah", sub: "Ganti paket = paket baru mulai hari itu" },
    { from: 12.7, to: 16.2, label: L, title: "Pilih metode: QRIS, e-wallet, atau virtual account", sub: "Tagihan dibuat setelah Anda memilih, diproses aman oleh Midtrans" },
    { from: 16.6, to: 20.1, label: L, title: "Batas bayar: QRIS & e-wallet 15 menit, virtual account 24 jam", sub: "VA tersedia untuk BCA, BNI, BRI, Mandiri, dan Permata" },
    { from: 21.6, to: 26.4, label: L, title: "Scan QRIS dari e-wallet atau m-banking apa pun", sub: "Halaman memeriksa pembayaran otomatis sambil menghitung mundur batas waktu" },
    { from: 26.9, to: 31.2, label: L, title: "Paket aktif otomatis begitu pembayaran diterima", sub: "Notifikasi Midtrans langsung mengaktifkan paket, tanpa konfirmasi manual" },
    { from: 32.3, to: 36.4, label: L, title: "Pembayaran berhasil, paket langsung aktif", sub: "3.500 balasan AI dan 3 nomor WhatsApp sudah bisa dipakai" },
  ];

  return (
    <Stage
      url={rute === "a" ? "/langganan" : rute === "b" ? "/langganan/bayar/2" : "/langganan/tagihan/ORD-20261103-0042"}
      script={script}
      captions={caps}
      judulTab={rute === "b" ? "Pembayaran" : rute === "a" ? "Langganan" : "Tagihan"}
      fixed={<Sidebar aktif="langganan" nomor={[{ label: NOMOR_BISNIS.label, wa: NOMOR_BISNIS.wa, status: "WORKING" }]} pengguna={USAHA.pemilik} />}
    >
      <Main>
        <div style={{ opacity: opasitas }}>
          {rute === "a" && (
            <div className="space-y-8">
              <JudulHalaman judul="Langganan" sub="Paket aktif, sisa kuota balasan AI, dan pembayaran." />
              <KartuLanggananS
                tautan={false}
                p={{ paket: "Gratis", info: "Masa percobaan sampai 7 Nov 2026", balasanLabel: "Balasan AI percobaan", terpakai: 4, kuota: 5, nomor: 1, nomorMaks: 1, catatan: { teks: "Sisa 1 balasan lagi.", nada: "waspada" } }}
              />
              <PilihPaket dihover={hover} />
            </div>
          )}
          {rute === "b" && <HalamanBayar pilih={pilih} memuat={memuat} t={t} sorot={sorotKanal} />}
          {rute === "c" && <HalamanTagihan sisa={sisa} t={t} />}
          {rute === "d" && <HalamanSukses pop={pegas(t, TD + 0.15, 12, 150)} />}
        </div>
      </Main>
    </Stage>
  );
}
