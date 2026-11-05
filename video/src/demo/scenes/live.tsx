import { Clock } from "lucide-react";
import { E, ketik, tw, useT } from "../kit/anim";
import type { Cap } from "../kit/caption";
import { type Gel, Phone, WaScreen } from "../kit/phone";
import { type Script, Stage } from "../kit/stage";
import { Main, Sidebar } from "../kit/ui";
import { HASIL_RAPI, NOMOR_BISNIS, USAHA } from "../data";
import { HistoriS, type PesanDash } from "../pages/c-histori";
import { NomorFrame } from "../pages/nomor-frame";

/** Durasi scene (detik). */
export const DUR = 42;

interface Ev {
  at: number;
  dari: "pelanggan" | "ai" | "manusia";
  teks: string;
  jam: string;
  foto?: boolean;
  /** Teks yang tercatat di histori dashboard (bila beda dengan teks chat). */
  dash?: string;
}

/** Satu sumber kebenaran percakapan: dipakai ponsel pelanggan dan histori di dashboard (sinkron). */
const EV: Ev[] = [
  { at: 1.5, dari: "pelanggan", teks: "Halo kak, ada paket hemat? Buka jam berapa?", jam: "14:02" },
  { at: 8.2, dari: "ai", teks: "Halo Kak! 👋 Ada Kak, Paket Hemat (nasi + ayam bakar + es teh) Rp25.000. Kami buka setiap hari jam 07.00 - 22.00 ✨ Mau pesan sekarang?", jam: "14:02" },
  { at: 11.0, dari: "pelanggan", teks: "Mau Paket Hemat 10 porsi ya kak, diantar ke Jl. Dahlia 12 besok jam 12 siang. Bayar transfer", jam: "14:03" },
  {
    at: 14.0,
    dari: "ai",
    teks: "Siap Kak Sari! Pesanannya:\n• Paket Hemat × 10 = Rp250.000\n• Diantar ke Jl. Dahlia 12, besok pukul 12.00\n• Ongkir Rp8.000, total Rp258.000\n• Bayar transfer BCA 1234567890 a.n. Rini Handayani\nTim kami akan membalas langsung di chat ini ya 🙏",
    jam: "14:03",
  },
  { at: 21.0, dari: "pelanggan", teks: "Sudah transfer ya kak", jam: "14:04", foto: true, dash: "[Foto bukti transfer] Sudah transfer ya kak" },
  { at: 24.0, dari: "ai", teks: "Terima kasih Kak Sari 🙏 Bukti transfer Rp258.000 sudah kami terima. Tim kami akan membalas langsung di chat ini ya.", jam: "14:04" },
  { at: 30.0, dari: "manusia", teks: "Halo Kak Sari, pesanan sudah kami proses ya 🙏 Estimasi tiba jam 11.45.", jam: "14:06" },
  { at: 32.4, dari: "pelanggan", teks: "Terima kasih kak 😊", jam: "14:07" },
];

/** Jendela AI "mengetik" di ponsel (detik). */
const MENGETIK: [number, number][] = [[6.4, 8.2], [12.2, 14.0], [22.2, 24.0]];

/** Foto "bukti transfer" bergaya tangkapan layar m-banking (nominal sesuai pesanan: Rp258.000). */
function FotoBuktiS() {
  return (
    <div className="mb-1 w-[230px] overflow-hidden rounded-lg" style={{ background: "linear-gradient(160deg,#e9f5ff,#fff)" }}>
      <div className="flex items-center gap-2 bg-[#0066ae] px-3 py-2 text-[12px] font-bold text-white">
        <span className="grid size-5 place-items-center rounded bg-white text-[10px] text-[#0066ae]">B</span> Transfer berhasil
      </div>
      <div className="space-y-1 px-3 py-2.5 text-[11.5px] text-[#35424a]">
        <div className="text-[18px] font-extrabold text-[#111b21]">Rp 258.000</div>
        <div>Ke: RINI HANDAYANI</div>
        <div>Ref: 20261103 1404 5521</div>
        <div className="font-semibold text-[#0f7a5c]">● Berhasil · 3 Nov 2026 14:04</div>
      </div>
    </div>
  );
}

/** Pil kecil di atas ponsel (penghitung mundur AI / jeda manusia). */
function Chip({ p, children, bar }: { p: number; children: React.ReactNode; bar?: number }) {
  if (p <= 0.001) return null;
  return (
    <div className="font-sans" style={{ position: "absolute", left: 1486, top: 82, width: 364, display: "flex", justifyContent: "center", opacity: p, transform: `translateY(${(1 - p) * 12}px)` }}>
      <div style={{ position: "relative", overflow: "hidden", display: "flex", alignItems: "center", gap: 12, padding: "11px 22px", borderRadius: 999, background: "rgba(8,20,15,0.92)", border: "1px solid rgba(232,240,236,0.16)", color: "#fff", fontSize: 18, fontWeight: 700 }}>
        {children}
        {bar !== undefined && <span style={{ position: "absolute", left: 0, bottom: 0, height: 3, width: `${bar * 100}%`, background: "#3ddc97" }} />}
      </div>
    </div>
  );
}

const pulsa = (t: number, a: number, b: number) => tw(t, a, a + 0.35, 0, 1, E.out) * (1 - tw(t, b - 0.3, b, 0, 1, E.io));

/** Scene 8: pelanggan chat ke nomor bisnis (ponsel kanan), AI membalas, histori di dashboard (kiri) terisi langsung. */
export function Live() {
  const t = useT();

  // ---- ponsel pelanggan
  const gel: Gel[] = EV.map((e) => ({
    dari: e.dari === "pelanggan" ? "kita" : "lawan",
    teks: e.teks,
    gambar: e.foto ? <FotoBuktiS /> : undefined,
    jam: e.jam,
    // Centang biru baru muncul saat AI mulai mengetik (dibaca → mengetik → kirim), bukan selama AI menunggu.
    baca: e.dari === "pelanggan" && MENGETIK.some(([s]) => s > e.at && t >= s),
    muncul: tw(t, e.at, e.at + 0.35, 0, 1, E.out),
  }));
  const mengetik = MENGETIK.reduce((a, [s, e]) => Math.max(a, tw(t, s, s + 0.25, 0, 1) * (1 - tw(t, e - 0.12, e, 0, 1))), 0);
  let input = "";
  for (const e of EV) {
    if (e.dari !== "pelanggan") continue;
    const mulai = e.at - e.teks.length / 28 - 0.15;
    if (t >= mulai && t < e.at) input = ketik(e.teks, t, mulai, 28).slice(-26);
  }
  const pIn = tw(t, 0.1, 1.0, 0, 1, E.out);

  // ---- histori di dashboard (muncul sedikit setelah ponsel: polling)
  const tunda = { pelanggan: 0.4, ai: 0.3, manusia: 0.2 } as const;
  const dash: PesanDash[] = EV.map((e) => ({ dari: e.dari, teks: e.dash ?? e.teks, jam: e.jam, muncul: tw(t, e.at + tunda[e.dari], e.at + tunda[e.dari] + 0.3, 0, 1, E.out) }));
  const ada = t >= EV[0].at + 0.4;
  const dipilih = t >= 4.15;
  const jeda = t >= 30.3 && t < 35.4;
  const masuk = dash.filter((m) => m.dari === "pelanggan" && m.muncul > 0.5).length;
  const dibalas = dash.filter((m) => m.dari === "ai" && m.muncul > 0.5).length;

  const script: Script = {
    cursor: [
      { at: 0, to: [880, 430] },
      { at: 4.0, to: "dash-item-1", click: true },
      { at: 5.6, to: [760, 560] },
      { at: 31.5, to: "dash-pill-jeda", dx: 50, dy: 14 },
      { at: 34.0, to: [760, 560] },
    ],
    scroll: [{ at: 0, to: "sec-histori", align: 10 }],
  };

  const c = (from: number, to: number, title: string, sub?: string): Cap => ({ from, to, label: "8 · LIVE", title, sub });
  const caps: Cap[] = [
    c(0.4, 6.4, "Pelanggan chat, AI menunggu 5 detik dulu supaya Anda sempat membalas", "Kanan: HP pelanggan · Kiri: dashboard Anda, tercatat langsung · selama menunggu AI tidak menandai dibaca atau mengetik"),
    c(6.6, 10.8, "AI menjawab dari base knowledge: Paket Hemat Rp25.000, buka 07.00 - 22.00", "Dibaca, mengetik, lalu dibalas seperti manusia · tidak mengarang"),
    c(11.4, 14.6, "Pesanan? AI mengulang pesanan untuk dicek pelanggan", "Nama, pesanan, alamat, waktu, dan cara bayar ditanyakan lebih dulu"),
    c(15.0, 19.0, "Pesanan lengkap: tim Anda melanjutkan di chat yang sama", "AI hanya membalas chat masuk, tidak pernah mengirim pesan duluan, supaya nomor aman dari blokir"),
    c(21.2, 25.6, "AI bisa melihat foto: bukti transfer langsung ditanggapi", "Pesanan & bukti bayar tercatat di histori ini, tinggal Anda cek"),
    c(29.0, 35.3, "Anda membalas dari HP? AI otomatis mundur 5 detik", "Balasan manusia tercatat kuning di histori · pesan pelanggan selama jeda dijawab AI setelah jeda habis"),
  ];

  const hitung = Math.max(1, Math.ceil(6.5 - t));

  return (
    <Stage
      url="/nomor/1#histori"
      script={script}
      captions={caps}
      judulTab={NOMOR_BISNIS.label}
      fixed={<Sidebar aktif={1} nomor={[{ label: NOMOR_BISNIS.label, wa: NOMOR_BISNIS.wa, status: "WORKING" }]} pengguna={USAHA.pemilik} />}
      canvas={
        <>
          <div style={{ position: "absolute", left: 1486, top: 130, opacity: pIn, transform: `translateX(${(1 - pIn) * 70}px)` }}>
            <Phone scale={0.88}>
              <WaScreen nama={USAHA.nama} inisial={USAHA.inisial} status={mengetik > 0.5 ? "sedang mengetik…" : "online"} pesan={gel} mengetik={mengetik} t={t} input={input} />
            </Phone>
          </div>
          <Chip p={pulsa(t, 1.7, 6.6)} bar={tw(t, 1.6, 6.5, 0, 1, E.lin)}>
            <span style={{ width: 10, height: 10, borderRadius: 99, background: "#3ddc97" }} />
            AI menunggu… <span style={{ color: "#3ddc97", fontSize: 24 }}>{hitung}</span>
          </Chip>
          <Chip p={pulsa(t, 30.6, 35.4)}>
            <Clock className="size-5 text-amber-400" /> AI diam · jeda 5 detik
          </Chip>
        </>
      }
    >
      <Main>
        <NomorFrame
          label={NOMOR_BISNIS.label}
          wa={NOMOR_BISNIS.wa}
          status="WORKING"
          saklar={1}
          navAktif="histori"
          stat={{ masuk, total7: masuk, dibalas, tren: [0, 0, 0, 0, 0, 0, masuk], pelanggan: ada ? 1 : 0, masukTotal: masuk, dok: 1, karakter: HASIL_RAPI.length }}
          slot={{ histori: <HistoriS pesan={dash} ada={ada} dipilih={dipilih} jeda={jeda} prospek={t >= 8.6} lebar={790} tinggi={500} munculItem={tw(t, 1.9, 2.2)} /> }}
        />
      </Main>
    </Stage>
  );
}
