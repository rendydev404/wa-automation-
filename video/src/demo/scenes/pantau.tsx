import { E, tw, useT } from "../kit/anim";
import type { Cap } from "../kit/caption";
import { type Script, Stage } from "../kit/stage";
import { Main, Sidebar } from "../kit/ui";
import { HASIL_RAPI, NOMOR_BISNIS, SERI_DIBALAS, SERI_MASUK, USAHA } from "../data";
import { Ringkasan } from "../pages/dashboard";

/** Durasi scene (detik). */
export const DUR = 14;

/** Offset kolom grafik (px logis dari tengah kartu): 7 kolom sama lebar di area 1012 px, kartu 1096 px. */
const kolomX = (i: number) => 60 + (i + 0.5) * 144.6 - 548;

/** Ringkasan setelah beberapa hari berjalan: angka naik, kolom tumbuh, kursor menyorot kartu & grafik. */
export function Pantau() {
  const t = useT();
  const anim = tw(t, 0.7, 3.4, 0, 1, E.out);
  const sorot = t >= 8.7 && t < 10.7 ? 6 : t >= 10.9 && t < 13.4 ? 3 : null;

  const script: Script = {
    cursor: [
      { at: 0, to: [1120, 420] },
      { at: 2.4, to: "ringkasan-stat", dx: -417 },
      { at: 3.6, to: "ringkasan-stat", dx: -139 },
      { at: 4.8, to: "ringkasan-stat", dx: 139 },
      { at: 6.0, to: "ringkasan-stat", dx: 417 },
      { at: 7.0, to: [1020, 470] },
      { at: 8.7, to: "grafik", dx: kolomX(6), dy: 20 },
      { at: 10.9, to: "grafik", dx: kolomX(3), dy: 20 },
      { at: 13.0, to: "grafik", dx: kolomX(4), dy: 60 },
    ],
    scroll: [
      { at: 0, to: 0 },
      { at: 1.8, to: "kartu-langganan", align: 40, dur: 1.2 },
      { at: 7.8, to: "grafik", align: 50, dur: 1.3 },
    ],
    camera: [
      { at: 0, zoom: 1 },
      { at: 2.3, zoom: 1.28, focus: "cursor", dur: 1.1 },
      { at: 6.3, zoom: 1.28, focus: "cursor" },
      { at: 7.4, zoom: 1, dur: 0.9 },
      { at: 9.2, zoom: 1.3, focus: "cursor", dur: 1.1 },
      { at: 13.8, zoom: 1.3, focus: "cursor" },
    ],
  };

  const caps: Cap[] = [
    { from: 0.5, to: 2.3, label: "9 · PANTAU", title: "Contoh data setelah beberapa hari berjalan", sub: "Semua nomor dan kinerja AI Anda terpantau dalam satu layar" },
    { from: 2.4, to: 3.6, label: "9 · PANTAU", title: "Pesan masuk hari ini: 47", sub: "Dibanding kemarin (27) dan total 7 hari terakhir (229)" },
    { from: 3.7, to: 4.8, label: "9 · PANTAU", title: "Dibalas AI hari ini: 41 (87%)", sub: "Rasio pesan pelanggan yang dijawab AI tanpa Anda mengetik" },
    { from: 4.9, to: 6.0, label: "9 · PANTAU", title: "Nomor terhubung: 1/1", sub: "Bilah hijau = tersambung, kuning = perlu perhatian" },
    { from: 6.1, to: 7.4, label: "9 · PANTAU", title: "Pelanggan tercatat: 38", sub: "Jumlah chat unik di semua nomor Anda" },
    { from: 8.2, to: 10.8, label: "9 · PANTAU", title: "Aktivitas 7 hari terakhir", sub: "Sorot kolom untuk melihat pesan masuk vs dibalas AI per hari" },
    { from: 11.0, to: 13.8, label: "9 · PANTAU", title: "Sabtu paling ramai: 44 pesan masuk, 41 dibalas AI", sub: "Rasio dibalas AI stabil sekitar 90% sepanjang minggu" },
  ];

  return (
    <Stage
      url="/dashboard"
      script={script}
      captions={caps}
      judulTab="Ringkasan"
      fixed={<Sidebar aktif="ringkasan" nomor={[{ label: NOMOR_BISNIS.label, wa: NOMOR_BISNIS.wa, status: "WORKING" }]} pengguna={USAHA.pemilik} />}
    >
      <Main>
        <Ringkasan
          anim={anim}
          sorotGrafik={sorot}
          nomor={[{ label: NOMOR_BISNIS.label, wa: NOMOR_BISNIS.wa, status: "WORKING", botAktif: true, dok: 1, karakter: HASIL_RAPI.length, masuk: 47, dibalas: 41, pelanggan: 38, tren: SERI_MASUK }]}
          langganan={{ paket: "Bisnis", info: "Aktif sampai 3 Des 2026", balasanLabel: "Balasan AI masa ini", terpakai: 1204, kuota: 3500, nomor: 1, nomorMaks: 3, tombol: "Kelola paket" }}
          stat={{ masuk: 47, kemarin: 27, total7: 229, dibalas: 41, tren: SERI_MASUK, pelanggan: 38 }}
          seri={{ masuk: SERI_MASUK, dibalas: SERI_DIBALAS }}
        />
      </Main>
    </Stage>
  );
}
