"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Bot, Coffee, QrCode, ShoppingBag, Stethoscope, Upload } from "lucide-react";
import { useBahasa } from "@/components/bahasa";
import type { T } from "@/lib/bahasa";
import type { PropsChatDemo } from "@/remotion/chat-demo";

/** Selagi pemutar Remotion dimuat: siluet iPhone 12 dengan ukuran yang sama (tanpa lompatan tata letak). */
function BingkaiTunggu() {
  return (
    <div aria-hidden className="aspect-[820/1640] w-full px-[3.2%] py-[2%]">
      <div className="h-full rounded-[14.7%/7.2%] bg-[#2a2e33] p-[0.9%]">
        <div className="h-full rounded-[14%/6.9%] bg-black p-[2.9%]">
          <div className="h-full animate-denyut rounded-[11.8%/5.5%] bg-[#efeae2]" />
        </div>
      </div>
    </div>
  );
}

const PemutarChat = dynamic(() => import("./pemutar").then((m) => m.PemutarChat), { ssr: false, loading: BingkaiTunggu });
const PemutarAlur = dynamic(() => import("./pemutar").then((m) => m.PemutarAlur), {
  ssr: false,
  loading: () => <div aria-hidden className="aspect-[1200/700] w-full animate-denyut rounded-[28px] bg-ink-raised" />,
});

/** Skenario contoh per jenis usaha; versi Inggris memakai nama, harga, dan percakapan yang wajar untuk pembaca Inggris. */
const skenarioDemo = (t: T): { kunci: string; label: string; ikon: typeof Coffee; data: PropsChatDemo }[] => [
  {
    kunci: "kuliner",
    label: t("Kuliner", "Food & drink"),
    ikon: Coffee,
    data: {
      nama: t("Dapur Bu Rini", "Rini's Kitchen"),
      inisial: t("DR", "RK"),
      pesan: [
        { dari: "pelanggan", teks: t("Kak masih buka? Ada paket hemat?", "Hi, are you still open? Any combo deals?") },
        {
          dari: "ai",
          teks: t(
            "Halo Kak! Kami buka sampai 22.00 ✨ Paket Hemat (nasi + ayam bakar + es teh) Rp25.000. Mau diantar atau ambil sendiri?",
            "Hi there! We're open until 10 PM ✨ The Value Combo (rice + grilled chicken + iced tea) is $4.50. Delivery or pickup?",
          ),
        },
        { dari: "pelanggan", teks: t("Diantar ya ke Jl. Melati 5", "Delivery please, to 5 Melati Street") },
        {
          dari: "ai",
          teks: t(
            "Siap! Ongkir ke Jl. Melati Rp8.000, estimasi 30 menit. Admin kami konfirmasi pesanannya di chat ini ya 🙏",
            "You got it! Delivery to Melati Street is $1.50, about 30 minutes. Our team will confirm your order right here in this chat 🙏",
          ),
        },
      ],
    },
  },
  {
    kunci: "toko",
    label: t("Toko online", "Online store"),
    ikon: ShoppingBag,
    data: {
      nama: "Langkah Shoes",
      inisial: "LS",
      pesan: [
        { dari: "pelanggan", teks: t("Sepatu Runner ukuran 42 ready?", "Do you have the Runner in size 42?") },
        {
          dari: "ai",
          teks: t(
            "Ready Kak! Runner ukuran 42 tersedia warna hitam & abu, harga Rp389.000. Gratis ongkir se-Jawa minggu ini 🚚",
            "Yes, it's in stock! The Runner in size 42 comes in black & grey for $25. Free shipping nationwide this week 🚚",
          ),
        },
        { dari: "pelanggan", teks: t("Bisa COD?", "Can I pay on delivery?") },
        {
          dari: "ai",
          teks: t(
            "Bisa Kak, COD tersedia untuk wilayah Jabodetabek. Boleh kirim nama & alamat lengkapnya?",
            "Sure, cash on delivery is available in the metro area. Could you send your full name and address?",
          ),
        },
      ],
    },
  },
  {
    kunci: "jasa",
    label: t("Klinik & jasa", "Clinics & services"),
    ikon: Stethoscope,
    data: {
      nama: t("Klinik Senyum", "Smile Dental Clinic"),
      inisial: t("KS", "SD"),
      pesan: [
        { dari: "pelanggan", teks: t("Mau scaling gigi, jadwal Sabtu ada?", "I'd like a teeth cleaning. Any openings on Saturday?") },
        {
          dari: "ai",
          teks: t(
            "Ada Kak 😊 Sabtu tersedia jam 10.00 dan 13.00. Biaya scaling mulai Rp250.000. Mau saya catat di jam berapa?",
            "Yes 😊 Saturday has openings at 10:00 AM and 1:00 PM. Cleanings start at $16. Which time works for you?",
          ),
        },
        { dari: "pelanggan", teks: t("Jam 10 ya, atas nama Dita", "10 AM please, under the name Dita") },
        {
          dari: "ai",
          teks: t(
            "Baik Kak Dita, permintaan jadwal Sabtu 10.00 sudah dicatat. Admin akan konfirmasi sebentar lagi ya!",
            "Thanks, Dita! Your request for Saturday at 10:00 AM is noted. Our team will confirm it shortly!",
          ),
        },
      ],
    },
  },
];

export function DemoChat() {
  const { t } = useBahasa();
  const SKENARIO = useMemo(() => skenarioDemo(t), [t]);
  const [aktif, setAktif] = useState(0);
  const s = SKENARIO[aktif];
  return (
    <div className="relative mx-auto w-full max-w-[400px]">
      <div role="tablist" aria-label={t("Contoh jenis usaha", "Example business types")} className="mb-5 flex justify-center gap-1.5 rounded-2xl border border-ink-line bg-white/[0.04] p-1.5 backdrop-blur">
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
      <div role="tabpanel" aria-label={t(`Contoh percakapan ${s.data.nama}`, `Sample conversation: ${s.data.nama}`)}>
        <div className="mx-auto w-full max-w-[330px]">
          <PemutarChat key={s.kunci} skenario={s.data} />
        </div>
        <p className="sr-only">
          {s.data.pesan.map((p) => `${p.dari === "ai" ? "AI" : t("Pelanggan", "Customer")}: ${p.teks}`).join(" ")}
        </p>
      </div>
    </div>
  );
}

const langkah = (t: T) => [
  {
    ikon: QrCode,
    judul: t("Scan QR", "Scan the QR code"),
    teks: t("Buka WhatsApp di HP → Perangkat tertaut → scan. Nomor Anda tersambung dalam detik.", "Open WhatsApp on your phone → Linked devices → scan. Your number connects in seconds."),
  },
  {
    ikon: Upload,
    judul: t("Isi Informasi Usaha", "Add your Business Info"),
    teks: t("Unggah menu, harga, FAQ, atau kebijakan. AI hanya menjawab dari yang Anda berikan.", "Upload your menu, prices, FAQs, or policies. The AI answers only from what you give it."),
  },
  {
    ikon: Bot,
    judul: t("AI membalas", "AI replies"),
    teks: t("Pelanggan dijawab 24/7. Begitu Anda membalas sendiri, AI otomatis diam di chat itu.", "Customers get answers 24/7. The moment you reply yourself, the AI steps back in that chat."),
  },
];

export function DemoAlur() {
  const { t } = useBahasa();
  const LANGKAH = langkah(t);
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
