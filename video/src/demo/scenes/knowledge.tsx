import { HASIL_RAPI, NOMOR_BISNIS, TULISAN_USAHA, USAHA } from "../data";
import { E, ketik, tw, useT } from "../kit/anim";
import type { Cap } from "../kit/caption";
import { type Script, Stage } from "../kit/stage";
import { Main, Sidebar } from "../kit/ui";
import { type DokS, KnowledgePanelS } from "../pages/b-knowledge";
import { NomorFrame } from "../pages/nomor-frame";

/** Durasi scene (detik). */
export const DUR = 40;

const CPS = 70;
const T = {
  chip: 2.6,
  fokus: 4.6,
  pilih: 4.9,
  hapus: 5.3,
  ketik: 5.7,
  rapikan: 14.4,
  proses: 14.55,
  hasil: 20.75,
  simpan: 25.5,
  tab: 28.2,
  seret: 29.3,
  jatuh: 31.2,
  ok: 32.8,
  muncul: 33.1,
};
const PDF_KARAKTER = 2340;
/** Posisi awal berkas yang diseret relatif pusat area unggah (px logis), lalu mendekat ke kursor. */
const GHOST0 = { dx: 495, dy: 150 };

export function Knowledge() {
  const t = useT();
  const tahap = t < T.proses ? "tulis" : t < T.hasil ? "proses" : t < T.simpan + 0.15 ? "hasil" : "tersimpan";
  const kerangka = t >= T.chip + 0.15 && t < T.hapus;
  const tab = t >= T.tab + 0.15 ? "unggah" : "tulis";

  const sudahSimpan = t >= T.simpan + 0.15;
  const sudahPdf = t >= T.muncul;
  const docs: DokS[] = [];
  if (sudahPdf) docs.push({ judul: "Daftar-Harga-Catering.pdf", sumber: "pdf", ukuran: "184 KB", karakter: PDF_KARAKTER, tanggal: "3 Nov 2026" });
  if (sudahSimpan) docs.push({ judul: `Info ${USAHA.nama}`, sumber: "teks", karakter: HASIL_RAPI.length, tanggal: "3 Nov 2026", sorot: t > 35 && t < 37.2 });
  const total = docs.reduce((a, d) => a + d.karakter, 0);

  // Berkas yang diseret: muncul di kursor, ikut sampai area unggah.
  const gp = tw(t, T.jatuh - 1.5, T.jatuh, 0, 1, E.cursor);
  const ghost = t >= T.seret && t < T.jatuh + 0.1 ? { dx: GHOST0.dx + (10 - GHOST0.dx) * gp, dy: GHOST0.dy + (8 - GHOST0.dy) * gp, op: tw(t, T.seret, T.seret + 0.3) } : null;
  const unggah = t >= T.jatuh + 0.1 ? { nama: "Daftar-Harga-Catering.pdf", status: t >= T.ok ? ("ok" as const) : ("proses" as const), pesan: `${PDF_KARAKTER.toLocaleString("id-ID")} karakter terbaca` } : null;

  const script: Script = {
    cursor: [
      { at: 0, to: [1060, 330] },
      { at: 1.7, to: [780, 250] },
      { at: T.chip, to: "chip-kuliner", click: true },
      { at: 3.4, to: [800, 330] },
      { at: T.fokus, to: "area-info", click: true, kind: "text" },
      { at: T.rapikan, to: "btn-rapikan", click: true },
      { at: 15.3, to: [1020, 420] },
      { at: 22.9, to: "area-hasil", kind: "text" },
      { at: T.simpan, to: "btn-simpan", click: true },
      { at: 26.5, to: [1010, 330] },
      { at: T.tab, to: "tab-unggah", click: true },
      { at: T.seret, to: [1125, 470] },
      { at: T.jatuh, to: "dropzone", dur: 1.5, curve: 0 },
      { at: 34.2, to: [900, 320] },
      { at: 35.3, to: "btn-sempurnakan-2" },
      { at: 37.8, to: [900, 330] },
    ],
    scroll: [
      { at: 0, to: "sec-knowledge", align: 24 },
      { at: 4.2, to: "sec-knowledge", align: -44, dur: 0.8 },
      { at: 22.0, to: "editor", align: -30, dur: 1.0 },
      { at: 27.7, to: "tabs", align: 60, dur: 1.0 },
    ],
    camera: [
      { at: 0, zoom: 1 },
      { at: 5.4, zoom: 1.28, focus: "area-info", dur: 1.2 },
      { at: 14.1, zoom: 1, dur: 0.9 },
      { at: 16.0, zoom: 1.15, focus: "editor", dur: 1.2 },
      { at: 22.4, zoom: 1.2, focus: "area-hasil", dy: 90, dur: 1.2 },
      { at: 26.0, zoom: 1, dur: 1.0 },
      { at: 30.4, zoom: 1.3, focus: "dropzone", dy: 40, dur: 1.2 },
      { at: 34.4, zoom: 1.25, focus: "daftar-dok", dur: 1.2 },
      { at: 38.0, zoom: 1, dur: 1.2 },
    ],
  };

  const L = "5 · KNOWLEDGE";
  const caps: Cap[] = [
    { from: 0.6, to: 5.4, label: L, title: "Base knowledge = buku catatan untuk AI", sub: "AI hanya menjawab dari catatan ini. Yang tidak tertulis tidak dikarang: dijawab \"belum tahu\", lalu diserahkan ke pemilik" },
    { from: 5.9, to: 13.8, label: L, pos: "atas", title: "Tulis dengan bahasa sendiri, tidak perlu rapi", sub: "Lima hal yang paling sering ditanya pelanggan ditandai hijau otomatis" },
    { from: 15.0, to: 20.6, label: L, title: "AI merapikan jadi dokumen terstruktur", sub: "Dipercepat (aslinya 10–40 detik). Harga, jam, dan alamat tetap persis seperti tulisan Anda" },
    { from: 21.0, to: 25.4, label: L, pos: "atas", title: "Periksa dulu, boleh diedit langsung", sub: "Bila AI menuliskan angka yang tidak ada di tulisan Anda, muncul peringatan \"Periksa angka ini\"" },
    { from: 26.0, to: 28.0, label: L, title: "Tersimpan: langsung dipakai AI", sub: "Setiap pesan pelanggan dijawab dari dokumen ini" },
    { from: 28.8, to: 34.0, label: L, title: "Atau unggah berkas: PDF, .txt, .md, .csv (maks 10 MB)", sub: "Menu atau daftar harga yang sudah ada tinggal diseret. Yang disimpan hanya teksnya" },
    { from: 34.5, to: 39.6, label: L, title: "Sampai 14.000 karakter dibaca seluruhnya oleh AI", sub: "Di atas itu, AI membaca potongan yang paling relevan dengan pertanyaan pelanggan" },
  ];

  return (
    <Stage
      url="/nomor/1"
      script={script}
      captions={caps}
      judulTab="CS Utama"
      fixed={<Sidebar aktif={1} nomor={[{ label: NOMOR_BISNIS.label, wa: NOMOR_BISNIS.wa, status: "WORKING" }]} pengguna={USAHA.pemilik} />}
    >
      <Main>
        <NomorFrame
          label={NOMOR_BISNIS.label}
          wa={NOMOR_BISNIS.wa}
          status="WORKING"
          saklar={1}
          navAktif="knowledge"
          stat={{ masuk: 0, total7: 0, dibalas: 0, tren: [0, 0, 0, 0, 0, 0, 0], pelanggan: 0, masukTotal: 0, dok: docs.length, karakter: total }}
          slot={{
            knowledge: (
              <KnowledgePanelS
                s={{
                  t,
                  tab,
                  tahap,
                  jenisPilih: t >= T.chip + 0.15,
                  teks: t >= T.ketik ? ketik(TULISAN_USAHA, t, T.ketik, CPS) : "",
                  kerangka,
                  pilihSemua: t >= T.pilih && t < T.hapus,
                  fokus: t >= T.fokus + 0.1 && tahap === "tulis",
                  proses: Math.max(0, t - T.proses),
                  judul: `Info ${USAHA.nama}`,
                  hasil: HASIL_RAPI,
                  hasilGulir: tw(t, 23.4, 25.0, 0, 70),
                  docs,
                  total,
                  seret: t >= T.jatuh - 0.9 && t < T.jatuh + 0.1,
                  ghost,
                  unggah,
                }}
              />
            ),
          }}
        />
      </Main>
    </Stage>
  );
}

