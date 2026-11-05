import { HASIL_RAPI, NOMOR_BISNIS, USAHA } from "../data";
import { ketik, tw, useT } from "../kit/anim";
import type { Cap } from "../kit/caption";
import { type Script, Stage } from "../kit/stage";
import { Main, Sidebar } from "../kit/ui";
import { type DokS, KnowledgePanelS } from "../pages/b-knowledge";
import { type GelS, TestChatS } from "../pages/b-uji";
import { NomorFrame } from "../pages/nomor-frame";

/** Durasi scene (detik). */
export const DUR = 24;

const PDF_KARAKTER = 2340;
const DOKS: DokS[] = [
  { judul: "Daftar-Harga-Catering.pdf", sumber: "pdf", ukuran: "184 KB", karakter: PDF_KARAKTER, tanggal: "3 Nov 2026" },
  { judul: `Info ${USAHA.nama}`, sumber: "teks", karakter: HASIL_RAPI.length, tanggal: "3 Nov 2026" },
];
const TOTAL_KARAKTER = HASIL_RAPI.length + PDF_KARAKTER;

/** Percakapan uji: pesan pelanggan (m) lalu jawaban AI (a), dengan waktu kemunculan (detik). */
const PERCAKAPAN = [
  {
    ketik: { dari: 1.7, cps: 32 },
    m: { at: 3.95, teks: "Halo kak, snack box isinya apa aja? harga berapa?" },
    a: { at: 6.1, teks: "Halo Kak! 😊 Snack Box kami isinya 3 kue + air mineral, harganya Rp18.000 per box. Untuk catering minimal 20 box dan dipesan H-1. Mau pesan berapa box, Kak?", meta: "2,4 dtk · knowledge utuh" },
  },
  {
    ketik: { dari: 7.2, cps: 34 },
    m: { at: 9.5, teks: "Mau pesan 25 snack box buat besok jam 10, antar ke Jl. Dahlia 12" },
    a: { at: 11.4, teks: "Siap Kak! 25 Snack Box × Rp18.000 = Rp450.000, plus ongkir Bandung Rp8.000. Boleh saya minta nama pemesan dan cara bayarnya (transfer BCA, QRIS, atau tunai)?", meta: "2,1 dtk · knowledge utuh" },
  },
  {
    ketik: { dari: 12.0, cps: 32 },
    m: { at: 13.6, teks: "Atas nama Sari Dewi, bayar transfer ya" },
    a: { at: 15.5, teks: "Baik Kak Sari. Saya ulang pesanannya ya:\n\n*Pesanan*\n• 25 Snack Box = Rp450.000\n• Diantar ke Jl. Dahlia 12, besok jam 10.00\n• Ongkir Rp8.000, total Rp458.000\n• Bayar: transfer BCA\n\nSudah benar, Kak?", meta: "2,8 dtk · knowledge utuh" },
  },
  {
    ketik: { dari: 16.2, cps: 28 },
    m: { at: 17.0, teks: "Sudah benar" },
    a: {
      at: 19.0,
      teks: "Terima kasih Kak Sari! 🙏 Data pesanannya sudah lengkap. Untuk pembayaran dan jadwal antarnya, nanti dibalas langsung oleh tim kami di chat ini ya.",
      meta: "3,1 dtk · knowledge utuh",
    },
  },
] as const;

export function Uji() {
  const t = useT();

  const pesan: GelS[] = [];
  let mengetik = 0;
  let input = "";
  for (const p of PERCAKAPAN) {
    if (t >= p.ketik.dari && t < p.m.at) input = ketik(p.m.teks, t, p.ketik.dari, p.ketik.cps);
    pesan.push({ dari: "saya", teks: p.m.teks, muncul: tw(t, p.m.at, p.m.at + 0.3) });
    const a = p.a;
    pesan.push({ dari: "bot", teks: a.teks, meta: a.meta, muncul: tw(t, a.at, a.at + 0.35) });
    if (t >= p.m.at + 0.1 && t < a.at) mengetik = tw(t, p.m.at + 0.1, p.m.at + 0.3);
  }
  const fokus = t >= 1.5 && t < 20.4;
  const bawah = t >= PERCAKAPAN[1].a.at;

  const script: Script = {
    cursor: [
      { at: 0, to: [1190, 250] },
      { at: 1.4, to: "input-uji", click: true, kind: "text" },
      { at: 3.8, to: "btn-kirim-uji", click: true },
      { at: 5.1, to: [1180, 430] },
      { at: 7.0, to: "input-uji", click: true, kind: "text" },
      { at: 20.6, to: [1210, 300] },
    ],
    scroll: [{ at: 0, to: "sec-uji", align: 24 }],
    camera: [
      { at: 0, zoom: 1 },
      { at: 1.0, zoom: 1.2, focus: "sec-uji", dur: 1.2 },
      { at: 22.6, zoom: 1, dur: 1.0 },
    ],
  };

  const L = "6 · UJI";
  const caps: Cap[] = [
    { from: 0.6, to: 3.7, label: L, title: "Uji bot gratis: tidak memakai kuota balasan AI", sub: "Mesin AI bawaan (Hermes), jawabannya sama persis dengan di WhatsApp dan tidak mengirim pesan ke siapa pun" },
    { from: 6.4, to: 11.1, label: L, title: "AI menjawab dari base knowledge Anda", sub: "Harga, isi paket, dan syarat catering diambil dari dokumen, bukan karangan" },
    { from: 11.8, to: 16.7, label: L, title: "Data yang kurang ditanyakan, pesanan diulang untuk dicek", sub: "AI meminta nama & cara bayar, menghitung total, lalu mengonfirmasi ke pelanggan" },
    { from: 19.3, to: 22.8, label: L, title: "Pesanan lengkap? Tim Anda melanjutkan di chat yang sama", sub: "AI hanya bisa membalas chat: tidak berjanji sudah mengirim, mengecek, atau mencatat apa pun" },
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
          navAktif="uji"
          stat={{ masuk: 0, total7: 0, dibalas: 0, tren: [0, 0, 0, 0, 0, 0, 0], pelanggan: 0, masukTotal: 0, dok: 2, karakter: TOTAL_KARAKTER }}
          slot={{
            knowledge: (
              <KnowledgePanelS
                s={{
                  t,
                  tab: "tulis",
                  tahap: "tersimpan",
                  jenisPilih: true,
                  teks: "",
                  kerangka: false,
                  pilihSemua: false,
                  fokus: false,
                  proses: 0,
                  judul: "",
                  hasil: "",
                  hasilGulir: 0,
                  docs: DOKS,
                  total: TOTAL_KARAKTER,
                  seret: false,
                  ghost: null,
                  unggah: null,
                }}
              />
            ),
            uji: <TestChatS t={t} pesan={pesan} mengetik={mengetik} input={input} fokus={fokus} bawah={bawah} kirimAktif={input.length > 0} />,
          }}
        />
      </Main>
    </Stage>
  );
}
