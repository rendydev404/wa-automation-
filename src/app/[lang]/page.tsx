import { Suspense } from "react";
import type { Metadata } from "next";
import { ArrowRight, BookOpenText, Camera, Check, GraduationCap, Hand, History, Lock, MessageSquareLock, ShieldCheck, Smartphone, TriangleAlert, Zap } from "lucide-react";
import { GantiBahasa } from "@/components/ganti-bahasa";
import { DemoAlur, DemoChat } from "@/components/landing/demo";
import { RobotLari } from "@/components/landing/robot-lari";
import { SKRIP_TEMA, TombolTema } from "@/components/landing/tombol-tema";
import { BandingLanding, HargaLanding, HargaMulai } from "@/components/landing/harga";
import Link from "@/components/link";
import { Logo } from "@/components/logo";
import { alasanSyarat, judulSyarat, syaratNomor } from "@/components/syarat-nomor";
import { Kalkulator } from "@/components/landing/kalkulator";
import { PendaftarLoop } from "@/components/landing/pendaftar-loop";
import { WidgetWaLanding } from "@/components/landing/widget-wa";
import { type T, bahasaSah, pembuatT } from "@/lib/bahasa";
import { teksHalaman } from "@/lib/bahasa-halaman";
import { UMUR_HISTORI_HARI } from "@/lib/format";
import { IkonWhatsApp } from "@/components/ikon-whatsapp";
import { KakiPerusahaan } from "@/components/kaki-perusahaan";
import { DataProdukLanding, DataSitusLanding } from "@/components/landing/data-terstruktur";
import { faqLanding } from "@/lib/faq-landing";
import { ASAL_SITUS } from "@/lib/seo";
import { MEREK, NOMOR_WA_DEMO, URL_WA_DEMO } from "@/lib/merek";
import { MASA_ID, MASA_EN, MASA_EN_ADJ } from "@/lib/jaminan-def";

/** Landing page publik: seluruhnya statis (prerender, kedua bahasa), animasi Remotion dimuat terpisah di sisi klien. */

export async function generateMetadata({ params }: PageProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  const b = bahasaSah(lang) ? lang : "id";
  const t = pembuatT(b);
  const judul = t(`${MEREK} · Chatbot AI WhatsApp yang Membalas Pelanggan 24/7`, `${MEREK} · AI WhatsApp Chatbot That Replies to Customers 24/7`);
  const deskripsi = t(
    "Chatbot AI WhatsApp untuk usaha: sambungkan nomor WA lewat scan QR, isi Informasi Usaha, dan AI membalas chat pelanggan otomatis 24 jam dalam hitungan detik. Garansi uang kembali.",
    "AI WhatsApp chatbot for businesses: connect your number with a QR scan, add your Business Info, and the AI replies to customer chats automatically 24/7 within seconds. Money-back guarantee.",
  );
  const url = b === "en" ? "/eng" : "/";
  const gambar = { url: "/og.jpg", width: 1200, height: 630, alt: judul };
  return {
    metadataBase: new URL(ASAL_SITUS),
    title: judul,
    description: deskripsi,
    keywords:
      b === "en"
        ? ["AI WhatsApp chatbot", "WhatsApp auto reply", "WhatsApp bot", "AI customer service WhatsApp", "WhatsApp Business AI"]
        : ["chatbot WhatsApp AI", "auto reply WhatsApp", "bot WA otomatis", "AI customer service WhatsApp", "balas chat otomatis", "WhatsApp Business AI"],
    applicationName: MEREK,
    robots: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
    alternates: { canonical: url, languages: { id: "/", en: "/eng", "x-default": "/" } },
    openGraph: {
      type: "website",
      url,
      siteName: MEREK,
      title: judul,
      description: deskripsi,
      locale: b === "en" ? "en_US" : "id_ID",
      alternateLocale: b === "en" ? "id_ID" : "en_US",
      images: [gambar],
    },
    twitter: { card: "summary_large_image", title: judul, description: deskripsi, images: [gambar.url] },
  };
}

const fitur = (t: T) => [
  {
    ikon: BookOpenText,
    judul: t("Jawab dari Informasi Usaha", "Answers from your Business Info"),
    teks: t(
      "Unggah PDF, menu, harga, atau FAQ. AI hanya menyampaikan fakta yang Anda berikan dan tidak mengarang.",
      "Upload PDFs, menus, price lists, or FAQs. The AI only shares the facts you give it and never makes things up.",
    ),
  },
  {
    ikon: Hand,
    judul: t("Anda tetap pegang kendali", "You stay in control"),
    teks: t(
      "Membalas sendiri dari HP? AI otomatis diam di chat itu, lalu melanjutkan setelah jeda yang Anda atur.",
      "Replying from your phone? The AI goes quiet in that chat, then picks up again after the pause you set.",
    ),
  },
  {
    ikon: GraduationCap,
    judul: t("Belajar dari balasan Anda", "Learns from your replies"),
    teks: t(
      "Cara Anda menjawab pelanggan dipelajari, jadi balasan AI makin mirip gaya usaha Anda.",
      "It learns from how you answer customers, so its replies sound more and more like your business.",
    ),
  },
  {
    ikon: Camera,
    judul: t("Mengerti foto pelanggan", "Understands customer photos"),
    teks: t(
      "Pelanggan kirim foto produk atau bukti transfer? AI bisa melihat dan menanggapinya.",
      "A customer sends a product photo or a payment receipt? The AI can see it and respond.",
    ),
  },
  {
    ikon: History,
    judul: t("Histori percakapan", "Chat history"),
    teks: t(
      `Chat ${UMUR_HISTORI_HARI} hari terakhir tercatat rapi: siapa yang membalas (AI atau Anda), dan bisa dicari kapan saja.`,
      `The last ${UMUR_HISTORI_HARI} days of chats, neatly logged: who replied (the AI or you), searchable anytime.`,
    ),
  },
  {
    ikon: Smartphone,
    judul: t("Tanpa ganti nomor", "Keep your number"),
    teks: t(
      "Pakai nomor WhatsApp yang sudah ada. Tersambung sebagai perangkat tertaut, HP tetap bisa dipakai.",
      "Use the WhatsApp number you already have. It connects as a linked device, so your phone keeps working as usual.",
    ),
  },
];

const keamanan = (t: T) => [
  { ikon: Lock, judul: t("Password di-hash scrypt", "Passwords hashed with scrypt"), teks: t("Password tidak pernah disimpan dalam bentuk asli.", "Passwords are never stored in plain text.") },
  {
    ikon: MessageSquareLock,
    judul: t("Histori chat hanya untuk Anda", "Chat history only for you"),
    teks: t(
      "Percakapan pelanggan hanya tampil di akun Anda, tidak bisa dilihat pengguna lain, dan terhapus otomatis setelah 30 hari.",
      "Customer conversations only show in your account, can't be seen by other users, and are deleted automatically after 30 days.",
    ),
  },
  {
    ikon: Zap,
    judul: t("Perlindungan tebak password", "Brute-force protection"),
    teks: t("Pembatasan percobaan per IP dan penguncian akun otomatis.", "Per-IP rate limiting and automatic account lockout."),
  },
  {
    ikon: Smartphone,
    judul: t("Kontrol penuh perangkat", "Full device control"),
    teks: t("Putuskan WhatsApp kapan saja dari dashboard atau dari HP.", "Disconnect WhatsApp anytime from the dashboard or your phone."),
  },
];

export default async function Landing() {
  const { b, t } = await teksHalaman();
  const urlWaDemo =
    b === "en" ? `https://wa.me/${NOMOR_WA_DEMO}?text=${encodeURIComponent(`Hi ${MEREK}, I'd like to see how fast the AI replies to this chat.`)}` : URL_WA_DEMO;
  return (
    // Tema gelap bawaan landing; SKRIP_TEMA melepasnya sebelum digambar bila pengunjung memilih terang.
    <div data-tema-landing className="tema-gelap bg-canvas text-fg" suppressHydrationWarning>
      <script dangerouslySetInnerHTML={{ __html: SKRIP_TEMA }} />
      {/* ---------- Hero (gelap) ---------- */}
      <div className="relative overflow-hidden bg-ink text-ink-fg">
        <div aria-hidden className="kisi-tinta absolute inset-0 opacity-60" />
        <div aria-hidden className="absolute -top-40 left-1/2 size-[720px] -translate-x-1/2 rounded-full bg-ink-signal/15 blur-3xl" />
        <header className="relative mx-auto flex max-w-[1200px] items-center justify-between gap-2 px-4 py-5 min-[420px]:gap-4 sm:px-6">
          <Link href="/" className="rounded-lg" aria-label={t(`${MEREK}, ke beranda`, `${MEREK}, home`)}>
            <Logo ukuran="md" gelap />
          </Link>
          <nav aria-label={t("Navigasi landing", "Main navigation")} className="hidden items-center gap-7 text-[13.5px] font-semibold text-ink-muted md:flex">
            <a href="#fitur" className="transition-colors hover:text-ink-fg">
              {t("Fitur", "Features")}
            </a>
            <a href="#cara-kerja" className="transition-colors hover:text-ink-fg">
              {t("Cara kerja", "How it works")}
            </a>
            <a href="#harga" className="transition-colors hover:text-ink-fg">
              {t("Harga", "Pricing")}
            </a>
            <a href="#keamanan" className="transition-colors hover:text-ink-fg">
              {t("Keamanan", "Security")}
            </a>
            <a href="#faq" className="transition-colors hover:text-ink-fg">
              FAQ
            </a>
            <Link href="/panduan" className="transition-colors hover:text-ink-fg">
              {t("Panduan", "Guide")}
            </Link>
          </nav>
          <div className="flex shrink-0 items-center gap-0.5 min-[420px]:gap-1 sm:gap-2">
            <TombolTema />
            {/* HP sempit: tanpa ikon bahasa & padding lebih rapat supaya Daftar tetap muat satu baris. */}
            <GantiBahasa gelap className="max-[419px]:px-1.5 max-[419px]:[&>svg]:hidden" />
            <Link href="/login" className="rounded-xl px-1.5 py-2 text-[13.5px] font-semibold whitespace-nowrap text-ink-fg transition-colors hover:bg-white/[0.06] min-[420px]:px-2.5 sm:px-3.5">
              {t("Masuk", "Sign in")}
            </Link>
            {/* HP sempit: "Daftar" saja supaya logo, Masuk, dan tombol tetap satu baris. */}
            <Link href="/daftar" className="rounded-xl bg-ink-signal px-2.5 py-2 text-[13.5px] font-bold whitespace-nowrap text-ink transition-transform hover:-translate-y-0.5 min-[420px]:px-3 sm:px-4">
              {t("Daftar", "Sign up")}
              <span className="max-[419px]:hidden">{t(" sekarang", " now")}</span>
            </Link>
          </div>
        </header>

        <section className="relative mx-auto grid max-w-[1200px] items-center gap-12 px-4 pt-10 pb-20 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:pt-16 lg:pb-28">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-ink-signal/30 bg-ink-signal/10 px-3 py-1.5 text-[12.5px] font-semibold text-ink-signal">
              <span className="relative flex size-2">
                <span className="absolute inset-0 animate-ping rounded-full bg-ink-signal opacity-70" />
                <span className="relative size-2 rounded-full bg-ink-signal" />
              </span>
              {t("AI membalas 24 jam, termasuk saat Anda tidur", "AI replies around the clock, even while you sleep")}
            </p>
            <h1 className="mt-6 text-[38px] leading-[1.06] font-extrabold tracking-tight text-white sm:text-[52px] lg:text-[56px]">
              {t("WhatsApp Dibales AI 24 Jam.", "WhatsApp Answered by AI 24/7.")}
              <br />
              <span className="bg-gradient-to-r from-ink-signal to-[#a3ff47] bg-clip-text text-transparent">{t("Nggak Gercep? Duit Balik 100%!", "Not Fast? 100% Money Back!")}</span>
            </h1>
            <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-ink-muted">
              {t(
                `Kenalin ${MEREK}, asisten WhatsApp AI yang bantu melayani pelanggan otomatis tanpa harus standby terus. Pakai nomor WhatsApp yang sudah ada, mulai `,
                `Meet ${MEREK}, an AI WhatsApp assistant that serves your customers automatically, so you don't have to stay on standby. Use the WhatsApp number you already have, from `,
              )}
              <b className="font-bold text-ink-fg">
                <Suspense fallback={t("Rp67 ribu/30 hari", "Rp67,000/30 days")}>
                  <HargaMulai cadangan={t("Rp67 ribu/30 hari", "Rp67,000/30 days")} />
                </Suspense>
              </b>
              {t(
                `. Langsung aktif, dengan garansi uang kembali ${MASA_ID} jika layanan tidak sesuai janji!`,
                `. Live right away, with a ${MASA_EN_ADJ} money-back guarantee if the service doesn't deliver as promised!`,
              )}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/daftar" className="group inline-flex items-center gap-2 rounded-2xl bg-ink-signal px-6 py-3.5 text-[15px] font-bold text-ink shadow-[0_12px_40px_-12px_rgba(61,220,151,0.7)] transition-transform hover:-translate-y-0.5">
                {t("Mulai sekarang", "Get started")} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
              <a
                href={urlWaDemo}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-2xl border border-ink-signal/40 bg-ink-signal/10 px-5 py-3.5 text-[15px] font-bold text-ink-signal transition-colors hover:bg-ink-signal/20"
              >
                <IkonWhatsApp className="size-4" /> {t("Coba Tes Bot WA", "Try the WA Bot")}
              </a>
              <a href="#cara-kerja" className="inline-flex items-center gap-2 rounded-2xl border border-ink-line px-5 py-3.5 text-[15px] font-semibold text-ink-fg transition-colors hover:bg-white/[0.05]">
                {t("Lihat cara kerja", "See how it works")}
              </a>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-ink-muted">
              {[t(`Jaminan uang kembali ${MASA_ID}`, `${MASA_EN_ADJ} money-back guarantee`), t("Setup & Uji bot gratis", "Free setup & bot test"), t("Putuskan kapan saja", "Disconnect anytime")].map((x) => (
                <li key={x} className="flex items-center gap-1.5">
                  <Check className="size-4 text-ink-signal" aria-hidden /> {x}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative">
            <DemoChat />
            <RobotLari className="absolute -bottom-[69px] -left-[63px] z-10 w-[317px] sm:-bottom-[65px] sm:-left-[81px] sm:w-[396px] lg:-bottom-[19px] lg:-left-[131px] lg:w-[443px] xl:-left-[144px] xl:w-[466px]" />
          </div>
          <PendaftarLoop />
        </section>
      </div>

      {/* ---------- Angka ---------- */}
      <section aria-label={t("Sekilas", "At a glance")} className="border-b border-line bg-surface">
        <dl className="mx-auto grid max-w-[1200px] grid-cols-2 gap-6 px-4 py-10 sm:px-6 md:grid-cols-4">
          {[
            [t("< 5 dtk", "< 5 sec"), t("rata-rata waktu balas", "average reply time")],
            ["24/7", t("tanpa jam kerja", "no business hours")],
            [t("2 menit", "2 min"), t("dari daftar sampai tersambung", "from sign-up to connected")],
            ["0", t("aplikasi tambahan di HP", "extra apps on your phone")],
          ].map(([a, k]) => (
            <div key={k}>
              <dt className="sr-only">{k}</dt>
              <dd className="text-3xl font-extrabold tracking-tight text-fg">{a}</dd>
              <dd className="mt-1 text-[13px] text-muted">{k}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ---------- Fitur ---------- */}
      <section id="fitur" className="mx-auto max-w-[1200px] scroll-mt-8 px-4 py-20 sm:px-6 lg:py-28">
        <div className="max-w-2xl">
          <p className="text-[12px] font-bold tracking-[0.1em] text-accent uppercase">{t("Fitur", "Features")}</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-[40px]">{t("Seperti punya CS yang tidak pernah lelah.", "Like a support agent who never gets tired.")}</h2>
          <p className="mt-3 text-[16px] text-muted">
            {t(
              "Semua yang dibutuhkan untuk membalas pelanggan dengan cepat, tanpa kehilangan sentuhan pribadi usaha Anda.",
              "Everything you need to answer customers fast, without losing your business's personal touch.",
            )}
          </p>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {fitur(t).map((f) => (
            <article key={f.judul} className="group rounded-3xl border border-line bg-surface p-6 shadow-card transition-all duration-200 hover:-translate-y-1 hover:border-accent/30 hover:shadow-pop">
              <span className="grid size-11 place-items-center rounded-2xl bg-accent-soft text-accent transition-colors group-hover:bg-accent group-hover:text-on-accent">
                <f.ikon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-5 text-[16px] font-bold">{f.judul}</h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{f.teks}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Contoh per jenis usaha disembunyikan dari landing utama (komponen ContohIndustri masih ada);
          landing page industri tetap hidup di /laundry, /bengkel, dst. lewat tautan langsung. */}

      {/* ---------- Gaji admin vs ChatGerCep (jangkar harga sebelum cara kerja & daftar harga) ---------- */}
      <section id="banding-biaya" aria-labelledby="judul-banding" className="mx-auto max-w-[1200px] scroll-mt-8 px-4 pb-20 sm:px-6 lg:pb-28">
        <div className="max-w-2xl">
          <p className="text-[12px] font-bold tracking-[0.1em] text-accent uppercase">{t("Bandingkan biayanya", "Compare the cost")}</p>
          <h2 id="judul-banding" className="mt-2 text-3xl font-extrabold tracking-tight sm:text-[40px]">
            {t("Gaji 1 admin CS sebulan bisa untuk ChatGerCep bertahun-tahun.", "One CS admin's monthly salary covers ChatGerCep for years.")}
          </h2>
          <p className="mt-3 text-[16px] text-muted">
            {t(
              "Admin CS hanya bekerja 8 jam, butuh gaji, BPJS, dan THR, dan tetap bisa telat membalas. Hitung sendiri berapa yang bisa Anda hemat.",
              "A CS admin works 8 hours, needs a salary, insurance, and a holiday bonus, and can still reply late. Work out how much you could save.",
            )}
          </p>
        </div>
        <Suspense fallback={<div aria-hidden className="mt-10 h-[34rem] animate-denyut rounded-3xl bg-subtle" />}>
          <BandingLanding />
        </Suspense>
      </section>

      {/* ---------- Cara kerja (gelap, Remotion interaktif) ---------- */}
      <section id="cara-kerja" className="scroll-mt-8 bg-ink py-20 text-ink-fg lg:py-28">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
          <div className="max-w-2xl">
            <p className="text-[12px] font-bold tracking-[0.1em] text-ink-signal uppercase">{t("Cara kerja", "How it works")}</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-[40px]">{t("Tiga langkah, langsung jalan.", "Three steps and you're live.")}</h2>
            <p className="mt-3 text-[16px] text-ink-muted">{t("Klik tiap langkah untuk melihat animasinya.", "Click each step to see it in action.")}</p>
          </div>
          <div className="mt-12">
            <DemoAlur />
          </div>
          <Link
            href="/panduan"
            className="group mt-10 flex flex-col gap-3 rounded-2xl border border-ink-line bg-ink-raised/60 px-5 py-4 transition-colors hover:border-ink-signal/40 sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="flex items-start gap-3">
              <BookOpenText className="mt-0.5 size-5 shrink-0 text-ink-signal" aria-hidden />
              <span>
                <span className="block text-[15px] font-bold text-white">{t("Butuh langkah lengkapnya?", "Want the full step-by-step?")}</span>
                <span className="mt-0.5 block text-[13.5px] text-ink-muted">
                  {t("Panduan bergambar dari daftar sampai AI membalas pelanggan, cocok untuk yang baru pertama kali.", "An illustrated guide from sign-up to AI replying to customers, perfect for first-timers.")}
                </span>
              </span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1.5 text-[14px] font-bold text-ink-signal">
              {t("Buka panduan", "Open the guide")} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </span>
          </Link>
        </div>
      </section>

      {/* ---------- Syarat nomor ---------- */}
      <section id="syarat-nomor" aria-labelledby="judul-syarat-nomor" className="mx-auto max-w-[1200px] scroll-mt-8 px-4 pt-20 sm:px-6 lg:pt-28">
        <div className="rounded-[28px] border border-warning/30 bg-warning-soft/50 p-6 sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-center">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-3 py-1 text-[12px] font-bold tracking-[0.06em] text-warning uppercase">
                <TriangleAlert className="size-3.5" aria-hidden /> {t("Syarat nomor", "Number requirements")}
              </span>
              <h2 id="judul-syarat-nomor" className="mt-4 text-2xl font-extrabold tracking-tight sm:text-3xl">
                {judulSyarat(t)}
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">{alasanSyarat(t)}</p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              {syaratNomor(t).map((x, i) => (
                <li key={x.judul} className="rounded-2xl border border-line bg-surface p-5 shadow-card">
                  <div className="flex items-center justify-between">
                    <x.ikon className="size-5 text-warning" aria-hidden />
                    <span className="text-[12px] font-bold text-faint tabular-nums">0{i + 1}</span>
                  </div>
                  <p className="mt-3 text-[14.5px] font-bold">{x.judul}</p>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{x.teks}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ---------- Kalkulator ---------- */}
      <section className="mx-auto grid max-w-[1200px] items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:py-28">
        <div>
          <p className="text-[12px] font-bold tracking-[0.1em] text-accent uppercase">{t("Hemat waktu", "Save time")}</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-[40px]">{t("Berapa jam yang bisa Anda ambil kembali?", "How many hours could you get back?")}</h2>
          <p className="mt-3 text-[16px] text-muted">
            {t(
              "Geser sesuai jumlah chat harian usaha Anda. Waktu yang biasanya habis untuk mengetik jawaban yang sama berulang-ulang bisa dipakai untuk mengembangkan usaha.",
              "Slide to match how many chats your business gets a day. The time you spend typing the same answers over and over can go into growing your business instead.",
            )}
          </p>
        </div>
        <Kalkulator />
      </section>

      {/* ---------- Harga (dari paket yang dikelola admin) ---------- */}
      <section id="harga" className="relative scroll-mt-8 overflow-hidden bg-ink text-ink-fg">
        {/* Latar gelap bercahaya hijau (tanpa gambar): dua gradasi radial di sudut. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_85%_0%,rgba(61,220,151,0.22),transparent_70%),radial-gradient(50%_45%_at_0%_100%,rgba(163,255,71,0.14),transparent_70%)]" />
        <div className="relative mx-auto max-w-[1200px] px-4 py-20 sm:px-6 lg:py-28">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-[12px] font-bold tracking-[0.1em] text-ink-signal uppercase">{t("Harga", "Pricing")}</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-[44px]">
              {t("Pilih paket, ", "Pick a plan, ")}
              <span className="text-[#a3ff47] italic">{t("langsung aktif.", "go live now.")}</span>
            </h2>
            <p className="mt-3 text-[16px] text-ink-muted">{t("Tanpa kontrak. Perpanjang kapan saja, kuota balasan AI langsung bertambah.", "No contracts. Renew anytime and your AI replies top up instantly.")}</p>
          </div>
          <Suspense fallback={<div aria-hidden className="mt-12 grid gap-5 md:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-96 animate-denyut rounded-3xl bg-ink-raised" />)}</div>}>
            <HargaLanding />
          </Suspense>
        </div>
      </section>

      {/* ---------- Keamanan ---------- */}
      <section id="keamanan" className="scroll-mt-8 border-y border-line bg-surface">
        <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:py-24">
          <div>
            <span className="grid size-12 place-items-center rounded-2xl bg-ink text-ink-signal">
              <ShieldCheck className="size-6" aria-hidden />
            </span>
            <h2 className="mt-5 text-3xl font-extrabold tracking-tight">{t("Data usaha Anda hanya milik Anda.", "Your business data belongs to you.")}</h2>
            <p className="mt-3 text-[16px] text-muted">
              {t(
                "Setiap akun terpisah sepenuhnya: nomor, Informasi Usaha, dan histori percakapan tidak bisa dilihat pengguna lain.",
                "Every account is fully isolated: your numbers, Business Info, and chat history are never visible to other users.",
              )}
            </p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {keamanan(t).map((k) => (
              <li key={k.judul} className="rounded-2xl border border-line p-5">
                <k.ikon className="size-5 text-accent" aria-hidden />
                <p className="mt-3 text-[14.5px] font-bold">{k.judul}</p>
                <p className="mt-1 text-[13.5px] text-muted">{k.teks}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-8 px-4 py-20 sm:px-6 lg:py-28">
        <h2 className="text-center text-3xl font-extrabold tracking-tight sm:text-[40px]">{t("Pertanyaan yang sering diajukan", "Frequently asked questions")}</h2>
        <div className="mt-10 space-y-3">
          {faqLanding(t).map((f) => (
            <details key={f.t} className="group rounded-2xl border border-line bg-surface p-5 shadow-card open:shadow-pop">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-bold [&::-webkit-details-marker]:hidden">
                {f.t}
                <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-subtle text-muted transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-[14px] leading-relaxed text-muted">{f.j}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ---------- Ajakan akhir ---------- */}
      <section className="px-4 pb-20 sm:px-6">
        <div className="relative mx-auto max-w-[1200px] overflow-hidden rounded-[32px] bg-ink px-6 py-14 text-center text-ink-fg sm:px-12 sm:py-20">
          <div aria-hidden className="kisi-tinta absolute inset-0 opacity-60" />
          <div aria-hidden className="absolute -bottom-40 left-1/2 size-[520px] -translate-x-1/2 rounded-full bg-ink-signal/20 blur-3xl" />
          <h2 className="relative text-3xl font-extrabold tracking-tight text-white sm:text-[44px]">{t("Biarkan AI menjawab. Anda fokus berjualan.", "Let the AI answer. You focus on selling.")}</h2>
          <p className="relative mx-auto mt-4 max-w-xl text-[16px] text-ink-muted">
            {t(`Daftar dalam satu menit, sambungkan nomor, aktifkan paket, dan AI langsung membalas pelanggan. Nggak gercep? Uang kembali 100% dalam ${MASA_ID}.`, `Sign up in a minute, connect your number, activate a plan, and the AI starts replying to customers right away. Not fast? 100% money back within ${MASA_EN}.`)}
          </p>
          <Link href="/daftar" className="group relative mt-8 inline-flex items-center gap-2 rounded-2xl bg-ink-signal px-7 py-4 text-[15px] font-bold text-ink transition-transform hover:-translate-y-0.5">
            {t("Buat akun", "Create an account")} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-between gap-3 px-4 py-8 text-[13px] text-muted sm:flex-row sm:px-6">
          <Logo />
          <div className="flex flex-wrap items-center justify-center gap-5">
            <a
              href={urlWaDemo}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-semibold text-fg hover:text-accent"
            >
              <IkonWhatsApp className="size-4 text-accent" /> Customer Service
            </a>
            <Link href="/panduan" className="hover:text-fg">
              {t("Panduan cara pakai", "How-to guide")}
            </Link>
            <Link href="/login" className="hover:text-fg">
              {t("Masuk", "Sign in")}
            </Link>
            <Link href="/daftar" className="hover:text-fg">
              {t("Daftar", "Sign up")}
            </Link>
          </div>
        </div>
        {/* pb besar di HP: tombol widget WhatsApp mengambang di pojok kanan bawah. */}
        <KakiPerusahaan className="pb-20 sm:pb-0" />
      </footer>

      <WidgetWaLanding />
      <DataSitusLanding />
      <Suspense fallback={null}>
        <DataProdukLanding />
      </Suspense>
    </div>
  );
}
