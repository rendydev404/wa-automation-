"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { Bot, Coffee, QrCode, ShoppingBag, Stethoscope, Upload } from "lucide-react";
import type { PropsChatDemo } from "@/remotion/chat-demo";

/** Selagi pemutar Remotion dimuat: bingkai ponsel diam dengan ukuran yang sama (tanpa lompatan tata letak). */
function BingkaiTunggu() {
  return (
    <div aria-hidden className="aspect-[720/1000] w-full px-[5.5%] py-[1.8%]">
      <div className="h-full rounded-[44px] bg-black p-2.5">
        <div className="h-full animate-denyut rounded-[36px] bg-[#efeae2]" />
      </div>
    </div>
  );
}

const PemutarChat = dynamic(() => import("./pemutar").then((m) => m.PemutarChat), { ssr: false, loading: BingkaiTunggu });
const PemutarAlur = dynamic(() => import("./pemutar").then((m) => m.PemutarAlur), {
  ssr: false,
  loading: () => <div aria-hidden className="aspect-[1200/700] w-full animate-denyut rounded-[28px] bg-ink-raised" />,
});

const SKENARIO: { kunci: string; label: string; ikon: typeof Coffee; data: PropsChatDemo }[] = [
  {
    kunci: "kuliner",
    label: "Kuliner",
    ikon: Coffee,
    data: {
      nama: "Dapur Bu Rini",
      inisial: "DR",
      pesan: [
        { dari: "pelanggan", teks: "Kak masih buka? Ada paket hemat?" },
        { dari: "ai", teks: "Halo Kak! Kami buka sampai 22.00 ✨ Paket Hemat (nasi + ayam bakar + es teh) Rp25.000. Mau diantar atau ambil sendiri?" },
        { dari: "pelanggan", teks: "Diantar ya ke Jl. Melati 5" },
        { dari: "ai", teks: "Siap! Ongkir ke Jl. Melati Rp8.000, estimasi 30 menit. Pesanan saya teruskan ke admin untuk konfirmasi 🙏" },
      ],
    },
  },
  {
    kunci: "toko",
    label: "Toko online",
    ikon: ShoppingBag,
    data: {
      nama: "Langkah Shoes",
      inisial: "LS",
      pesan: [
        { dari: "pelanggan", teks: "Sepatu Runner ukuran 42 ready?" },
        { dari: "ai", teks: "Ready Kak! Runner ukuran 42 tersedia warna hitam & abu, harga Rp389.000. Gratis ongkir se-Jawa minggu ini 🚚" },
        { dari: "pelanggan", teks: "Bisa COD?" },
        { dari: "ai", teks: "Bisa Kak, COD tersedia untuk wilayah Jabodetabek. Boleh kirim nama & alamat lengkapnya?" },
      ],
    },
  },
  {
    kunci: "jasa",
    label: "Klinik & jasa",
    ikon: Stethoscope,
    data: {
      nama: "Klinik Senyum",
      inisial: "KS",
      pesan: [
        { dari: "pelanggan", teks: "Mau scaling gigi, jadwal Sabtu ada?" },
        { dari: "ai", teks: "Ada Kak 😊 Sabtu tersedia jam 10.00 dan 13.00. Biaya scaling mulai Rp250.000. Mau saya catat di jam berapa?" },
        { dari: "pelanggan", teks: "Jam 10 ya, atas nama Dita" },
        { dari: "ai", teks: "Baik Kak Dita, permintaan jadwal Sabtu 10.00 sudah dicatat. Admin akan konfirmasi sebentar lagi ya!" },
      ],
    },
  },
];

export function DemoChat() {
  const [aktif, setAktif] = useState(0);
  const s = SKENARIO[aktif];
  return (
    <div className="relative mx-auto w-full max-w-[400px]">
      <div role="tablist" aria-label="Contoh jenis usaha" className="mb-5 flex justify-center gap-1.5 rounded-2xl border border-ink-line bg-white/[0.04] p-1.5 backdrop-blur">
        {SKENARIO.map((x, i) => (
          <button
            key={x.kunci}
            type="button"
            role="tab"
            aria-selected={aktif === i}
            onClick={() => setAktif(i)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-[12.5px] font-semibold transition-colors ${
              aktif === i ? "bg-ink-signal text-ink" : "text-ink-muted hover:bg-white/[0.06] hover:text-ink-fg"
            }`}
          >
            <x.ikon className="size-3.5" aria-hidden /> {x.label}
          </button>
        ))}
      </div>
      {/* key: ganti skenario = komposisi diputar dari awal. */}
      <div role="tabpanel" aria-label={`Contoh percakapan ${s.data.nama}`}>
        <PemutarChat key={s.kunci} skenario={s.data} />
        <p className="sr-only">
          {s.data.pesan.map((p) => `${p.dari === "ai" ? "AI" : "Pelanggan"}: ${p.teks}`).join(" ")}
        </p>
      </div>
    </div>
  );
}

const LANGKAH = [
  { ikon: QrCode, judul: "Scan QR", teks: "Buka WhatsApp di HP → Perangkat tertaut → scan. Nomor Anda tersambung dalam detik." },
  { ikon: Upload, judul: "Isi pengetahuan", teks: "Unggah menu, harga, FAQ, atau kebijakan. AI hanya menjawab dari yang Anda berikan." },
  { ikon: Bot, judul: "AI membalas", teks: "Pelanggan dijawab 24/7. Begitu Anda membalas sendiri, AI otomatis diam di chat itu." },
];

export function DemoAlur() {
  const [babak, setBabak] = useState(0);
  const [minta, setMinta] = useState({ babak: 0, n: 0 });
  const onBabak = useCallback((i: number) => setBabak(i), []);
  return (
    <div className="grid items-center gap-8 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-12">
      <ol className="space-y-3">
        {LANGKAH.map((l, i) => (
          <li key={l.judul}>
            <button
              type="button"
              aria-current={babak === i ? "step" : undefined}
              onClick={() => setMinta((m) => ({ babak: i, n: m.n + 1 }))}
              className={`group flex w-full gap-4 rounded-2xl border p-4 text-left transition-colors ${
                babak === i ? "border-ink-signal/50 bg-ink-signal/[0.08]" : "border-ink-line hover:border-ink-signal/30 hover:bg-white/[0.03]"
              }`}
            >
              <span className={`grid size-11 shrink-0 place-items-center rounded-xl transition-colors ${babak === i ? "bg-ink-signal text-ink" : "bg-white/[0.06] text-ink-muted"}`}>
                <l.ikon className="size-5" aria-hidden />
              </span>
              <span>
                <span className="block text-[15px] font-bold text-ink-fg">
                  {i + 1}. {l.judul}
                </span>
                <span className="mt-1 block text-[13.5px] leading-relaxed text-ink-muted">{l.teks}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
      <PemutarAlur minta={minta} onBabak={onBabak} />
    </div>
  );
}
