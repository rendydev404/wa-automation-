import { Fragment, Suspense } from "react";
import type { Metadata } from "next";
import { ArrowRight, BookOpenCheck, Clock, Maximize2, ShieldCheck, Smartphone } from "lucide-react";
import { GantiBahasa } from "@/components/ganti-bahasa";
import { IkonWhatsApp } from "@/components/ikon-whatsapp";
import { KakiPerusahaan } from "@/components/kaki-perusahaan";
import { HargaMulai } from "@/components/landing/harga";
import { BilahKategori, TombolBagikan } from "@/components/landing/panduan-klien";
import { WidgetWaLanding } from "@/components/landing/widget-wa";
import Link from "@/components/link";
import { Logo } from "@/components/logo";
import { bahasaSah, pembuatT } from "@/lib/bahasa";
import { teksHalaman } from "@/lib/bahasa-halaman";
import { MASA_EN, MASA_ID } from "@/lib/jaminan-def";
import { MEREK, NOMOR_WA_DEMO, URL_WA_DEMO } from "@/lib/merek";
import { type LangkahPanduan, PANDUAN } from "@/lib/panduan-def";

/**
 * Panduan bergambar publik (link untuk dibagikan): dari daftar akun sampai AI membalas pelanggan. Seluruhnya statis;
 * hanya harga termurah yang dialirkan (Suspense). Data & gambar dari lib/panduan-def.ts dan public/panduan.
 */

const ASAL = process.env.APP_URL?.replace(/\/+$/, "") || "https://chatgercep.com";
const JUMLAH_LANGKAH = PANDUAN.reduce((n, k) => n + k.langkah.length, 0);

export async function generateMetadata({ params }: PageProps<"/[lang]/panduan">): Promise<Metadata> {
  const { lang } = await params;
  const b = bahasaSah(lang) ? lang : "id";
  const t = pembuatT(b);
  const judul = t(`Panduan Mudah ${MEREK}: dari daftar sampai AI membalas pelanggan`, `${MEREK} Easy Guide: from sign-up to AI replying to your customers`);
  const deskripsi = t(
    `${PANDUAN.length} langkah bergambar: daftar akun, sambungkan WhatsApp (scan QR atau kode dari HP), isi Informasi Usaha, uji bot, bayar langganan, lalu AI membalas pelanggan 24 jam.`,
    `${PANDUAN.length} illustrated steps: sign up, connect WhatsApp (QR scan or a code on your phone), add your Business Info, test the bot, pay for a plan, and let the AI reply 24/7.`,
  );
  const url = b === "en" ? "/eng/panduan" : "/panduan";
  return {
    metadataBase: new URL(ASAL),
    title: judul,
    description: deskripsi,
    robots: { index: true, follow: true },
    alternates: { canonical: url, languages: { id: "/panduan", en: "/eng/panduan", "x-default": "/panduan" } },
    openGraph: {
      type: "article",
      url,
      siteName: MEREK,
      title: judul,
      description: deskripsi,
      locale: b === "en" ? "en_US" : "id_ID",
      images: [{ url: "/panduan/og.jpg", width: 1200, height: 630, alt: judul }],
    },
    twitter: { card: "summary_large_image", title: judul, description: deskripsi, images: ["/panduan/og.jpg"] },
  };
}

/** Label chip bilah kategori: pendek supaya ketujuh chip muat satu baris di desktop. */
const LABEL_PENDEK: Record<string, { id: string; en: string }> = {
  daftar: { id: "Daftar", en: "Sign up" },
  "sambung-qr": { id: "Sambung WA (QR)", en: "Connect (QR)" },
  "sambung-kode": { id: "Sambung WA (1 HP)", en: "Connect (phone only)" },
  knowledge: { id: "Informasi Usaha", en: "Business Info" },
  "uji-bot": { id: "Uji bot", en: "Test bot" },
  bayar: { id: "Bayar", en: "Pay" },
  nyalakan: { id: "Nyalakan AI", en: "Turn on AI" },
};

const src = (g: string) => `/panduan/${g}.webp`;

/** Gambar layar laptop: lebar penuh kolom; HP kecil memakai varian 900w. Klik = buka ukuran penuh. */
function GambarLayar({ l, alt }: { l: LangkahPanduan; alt: string }) {
  return (
    <a href={src(l.gambar)} target="_blank" rel="noopener" className="group relative block overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      {/* eslint-disable-next-line @next/next/no-img-element -- berkas statis siap pakai; optimasi gambar Next tidak ikut di deploy */}
      <img
        src={src(l.gambar)}
        srcSet={`/panduan/${l.gambar}-900.webp 900w, ${src(l.gambar)} 1600w`}
        sizes="(min-width: 1100px) 720px, (min-width: 1024px) 62vw, calc(100vw - 2rem)"
        width={l.w}
        height={l.h}
        loading="lazy"
        decoding="async"
        alt={alt}
        className="block h-auto w-full"
      />
      <Perbesar />
    </a>
  );
}

/** Gambar layar HP (potret), ditampilkan berjajar. */
function GambarHp({ l, alt }: { l: LangkahPanduan; alt: string }) {
  return (
    <a href={src(l.gambar)} target="_blank" rel="noopener" className="group relative block overflow-hidden rounded-[22px] border-4 border-ink bg-ink shadow-card">
      {/* eslint-disable-next-line @next/next/no-img-element -- berkas statis siap pakai */}
      <img src={src(l.gambar)} width={l.w} height={l.h} loading="lazy" decoding="async" alt={alt} className="block h-auto w-full rounded-[18px]" />
      <Perbesar />
    </a>
  );
}

function Perbesar() {
  return (
    <span aria-hidden className="absolute right-2.5 bottom-2.5 grid size-8 place-items-center rounded-full bg-ink/75 text-white opacity-80 transition-opacity group-hover:opacity-100">
      <Maximize2 className="size-3.5" />
    </span>
  );
}

/** Langkah berurutan; langkah HP yang bersebelahan digabung menjadi satu jajaran. */
function kelompokkan(langkah: LangkahPanduan[]): { hp: boolean; isi: { l: LangkahPanduan; i: number }[] }[] {
  const hasil: { hp: boolean; isi: { l: LangkahPanduan; i: number }[] }[] = [];
  langkah.forEach((l, i) => {
    const akhir = hasil.at(-1);
    if (l.hp && akhir?.hp) akhir.isi.push({ l, i });
    else hasil.push({ hp: !!l.hp, isi: [{ l, i }] });
  });
  return hasil;
}

export default async function HalamanPanduan() {
  const { b, t } = await teksHalaman();
  const urlHalaman = `${ASAL}${b === "en" ? "/eng/panduan" : "/panduan"}`;
  const urlWaDemo =
    b === "en" ? `https://wa.me/${NOMOR_WA_DEMO}?text=${encodeURIComponent(`Hi ${MEREK}, I read the guide and have a question.`)}` : URL_WA_DEMO;
  const hargaMulai = (
    <Suspense fallback={t("Rp67 ribu/30 hari", "Rp67,000/30 days")}>
      <HargaMulai cadangan={t("Rp67 ribu/30 hari", "Rp67,000/30 days")} />
    </Suspense>
  );
  const teksBagikan = t(
    `Panduan bergambar ${MEREK}: cara bikin WhatsApp dibalas AI otomatis 24 jam, dari daftar sampai jalan.`,
    `${MEREK} illustrated guide: how to get your WhatsApp answered by AI 24/7, from sign-up to live.`,
  );

  return (
    <div className="bg-canvas">
      {/* ---------- Hero ---------- */}
      <div className="relative overflow-hidden bg-ink text-ink-fg">
        <div aria-hidden className="kisi-tinta absolute inset-0 opacity-60" />
        <div aria-hidden className="absolute -top-48 right-0 size-[560px] rounded-full bg-ink-signal/10 blur-3xl" />
        <header className="relative mx-auto flex max-w-[1100px] items-center justify-between gap-2 px-4 py-5 sm:gap-4 sm:px-6">
          <Link href="/" className="rounded-lg" aria-label={t(`${MEREK}, ke beranda`, `${MEREK}, home`)}>
            <Logo ukuran="md" gelap />
          </Link>
          <div className="flex shrink-0 items-center gap-0.5 min-[420px]:gap-1 sm:gap-2">
            <Link href="/" className="hidden rounded-xl px-3 py-2 text-[13.5px] font-semibold text-ink-muted transition-colors hover:text-ink-fg md:inline-flex">
              {t("Beranda", "Home")}
            </Link>
            <GantiBahasa gelap className="max-[419px]:px-1.5 max-[419px]:[&>svg]:hidden" />
            <Link href="/login" className="rounded-xl px-1.5 py-2 text-[13.5px] font-semibold whitespace-nowrap text-ink-fg transition-colors hover:bg-white/[0.06] min-[420px]:px-2.5 sm:px-3.5">
              {t("Masuk", "Sign in")}
            </Link>
            <Link href="/daftar" className="rounded-xl bg-ink-signal px-2.5 py-2 text-[13.5px] font-bold whitespace-nowrap text-ink transition-transform hover:-translate-y-0.5 min-[420px]:px-3 sm:px-4">
              {t("Daftar", "Sign up")}
              <span className="max-[419px]:hidden">{t(" gratis", " free")}</span>
            </Link>
          </div>
        </header>

        <section className="relative mx-auto grid max-w-[1100px] gap-10 px-4 pt-6 pb-14 sm:px-6 sm:pt-10 sm:pb-16 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-center lg:pt-14 lg:pb-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-ink-signal/30 bg-ink-signal/10 px-3.5 py-1.5 text-[12.5px] font-semibold text-ink-signal">
              <BookOpenCheck className="size-3.5" aria-hidden />
              {t(`Panduan resmi ${MEREK}`, `Official ${MEREK} guide`)}
            </p>
            <h1 className="mt-5 text-[32px] leading-[1.1] font-extrabold tracking-tight text-white sm:text-[46px] lg:text-[52px]">
              {t("Panduan Mudah", "The Easy Guide")}
              <br />
              <span className="text-ink-signal">{t("dari daftar sampai AI membalas pelanggan.", "from sign-up to AI replying to customers.")}</span>
            </h1>
            <p className="mt-5 max-w-xl text-[15.5px] leading-relaxed text-ink-muted sm:text-[17px]">
              {t(
                `${PANDUAN.length} bagian, ${JUMLAH_LANGKAH} langkah, semuanya bergambar dan diberi tanda panah merah. Tidak perlu paham teknologi: ikuti saja urutannya.`,
                `${PANDUAN.length} sections, ${JUMLAH_LANGKAH} steps, every one with a screenshot and red arrows. No tech skills needed: just follow along.`,
              )}
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <a
                href={`#${PANDUAN[0].id}`}
                className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-ink-signal px-6 py-3.5 text-[15px] font-bold text-ink transition-transform hover:-translate-y-0.5"
              >
                {t("Mulai dari langkah 1", "Start at step 1")}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </a>
              <TombolBagikan url={urlHalaman} judul={t(`Panduan Mudah ${MEREK}`, `${MEREK} Easy Guide`)} teks={teksBagikan} gelap />
            </div>
            <ul className="mt-7 grid gap-2 text-[13px] text-ink-muted sm:flex sm:flex-wrap sm:gap-x-6">
              <li className="flex items-center gap-1.5">
                <Clock className="size-4 shrink-0 text-ink-signal" aria-hidden /> {t("Selesai ± 10 menit", "Done in about 10 minutes")}
              </li>
              <li className="flex items-center gap-1.5">
                <Smartphone className="size-4 shrink-0 text-ink-signal" aria-hidden /> {t("Bisa dari HP saja", "Works from a phone alone")}
              </li>
              <li className="flex items-center gap-1.5">
                <ShieldCheck className="size-4 shrink-0 text-ink-signal" aria-hidden /> {t(`Jaminan uang kembali ${MASA_ID}`, `${MASA_EN} money-back guarantee`)}
              </li>
            </ul>
          </div>

          {/* Daftar isi (layar lebar). */}
          <nav aria-label={t("Daftar isi", "Contents")} className="hidden rounded-3xl border border-ink-line bg-ink-raised/70 p-5 backdrop-blur lg:block">
            <p className="text-[12px] font-bold tracking-[0.1em] text-ink-muted uppercase">{t("Daftar isi", "Contents")}</p>
            <ol className="mt-3 space-y-1">
              {PANDUAN.map((k, i) => (
                <li key={k.id}>
                  <a href={`#${k.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 text-[14px] font-semibold text-ink-fg transition-colors hover:bg-white/[0.06]">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink-signal/15 text-[12.5px] font-bold text-ink-signal tabular-nums">{i + 1}</span>
                    <span className="min-w-0">{k.judul[b]}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </section>
      </div>

      <BilahKategori kategori={PANDUAN.map((k) => ({ id: k.id, label: LABEL_PENDEK[k.id]?.[b] ?? k.judul[b] }))} />

      {/* ---------- Isi per kategori ---------- */}
      <main className="mx-auto max-w-[1100px] px-4 sm:px-6">
        {PANDUAN.map((k, ki) => (
          <section key={k.id} id={k.id} aria-labelledby={`judul-${k.id}`} className="scroll-mt-20 border-b border-line py-12 last:border-b-0 sm:py-16">
            <div className="flex items-start gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent text-[20px] font-extrabold text-on-accent tabular-nums sm:size-14 sm:text-[24px]">
                {ki + 1}
              </span>
              <div className="min-w-0">
                <p className="text-[12px] font-bold tracking-[0.1em] text-accent uppercase">
                  {t(`Bagian ${ki + 1} dari ${PANDUAN.length}`, `Section ${ki + 1} of ${PANDUAN.length}`)}
                </p>
                <h2 id={`judul-${k.id}`} className="mt-1 text-[24px] leading-tight font-extrabold tracking-tight sm:text-[32px]">
                  {k.judul[b]}
                </h2>
                <p className="mt-1.5 text-[15px] text-muted sm:text-[16px]">{k.ringkas[b]}</p>
              </div>
            </div>

            <ol className="mt-8 space-y-10 sm:mt-10 sm:space-y-14">
              {kelompokkan(k.langkah).map((g) =>
                g.hp ? (
                  <li key={g.isi[0].l.gambar}>
                    <ol className={`grid gap-x-4 gap-y-8 sm:gap-x-6 ${g.isi.length > 1 ? "grid-cols-2 lg:grid-cols-4" : "max-w-[300px] grid-cols-1"}`}>
                      {g.isi.map(({ l, i }) => (
                        <li key={l.gambar} className="min-w-0">
                          <NomorLangkah k={ki} i={i} />
                          <h3 className="mt-2 text-[15px] leading-snug font-bold sm:text-[16px]">{l.judul[b]}</h3>
                          <p className="mt-1 mb-3 text-[13.5px] leading-relaxed text-muted sm:text-[14px]">{l.teks[b]}</p>
                          <GambarHp l={l} alt={`${l.judul[b]}: ${l.teks[b]}`} />
                        </li>
                      ))}
                    </ol>
                  </li>
                ) : (
                  <Fragment key={g.isi[0].l.gambar}>
                    {g.isi.map(({ l, i }) => (
                      <li key={l.gambar} className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-10">
                        <div className="lg:sticky lg:top-24 lg:self-start">
                          <NomorLangkah k={ki} i={i} />
                          <h3 className="mt-2 text-[17px] leading-snug font-bold sm:text-[18px]">{l.judul[b]}</h3>
                          <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted sm:text-[15px]">{l.teks[b]}</p>
                        </div>
                        <GambarLayar l={l} alt={`${l.judul[b]}: ${l.teks[b]}`} />
                      </li>
                    ))}
                  </Fragment>
                ),
              )}
            </ol>

            {ki < PANDUAN.length - 1 && (
              <a
                href={`#${PANDUAN[ki + 1].id}`}
                className="mt-10 flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-5 py-4 shadow-card transition-colors hover:border-accent/40 sm:mt-12"
              >
                <span className="min-w-0">
                  <span className="block text-[12px] font-bold tracking-[0.08em] text-muted uppercase">{t("Lanjut ke bagian berikutnya", "Next section")}</span>
                  <span className="mt-0.5 block text-[15px] font-bold text-fg">
                    {ki + 2}. {PANDUAN[ki + 1].judul[b]}
                  </span>
                </span>
                <ArrowRight className="size-5 shrink-0 text-accent" aria-hidden />
              </a>
            )}
          </section>
        ))}
      </main>

      {/* ---------- Ajakan akhir ---------- */}
      <section className="px-4 pt-4 pb-14 sm:px-6 sm:pb-20">
        <div className="relative mx-auto max-w-[1100px] overflow-hidden rounded-[28px] bg-ink px-5 py-12 text-center text-ink-fg sm:rounded-[32px] sm:px-12 sm:py-16">
          <div aria-hidden className="kisi-tinta absolute inset-0 opacity-60" />
          <div aria-hidden className="absolute -bottom-40 left-1/2 size-[520px] -translate-x-1/2 rounded-full bg-ink-signal/20 blur-3xl" />
          <h2 className="relative text-[27px] leading-tight font-extrabold tracking-tight text-white sm:text-[40px]">
            {t("Sudah kebayang? Sekarang giliran Anda.", "Got the idea? Now it's your turn.")}
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-ink-muted sm:text-[16px]">
            {t("Daftar gratis, sambungkan nomor, dan coba Uji bot sepuasnya. AI mulai membalas pelanggan sungguhan setelah berlangganan, mulai ", "Sign up free, connect your number, and try Test bot as much as you like. The AI starts replying to real customers once you subscribe, from ")}
            <b className="font-bold text-ink-fg">{hargaMulai}</b>
            {t(`. Tidak cocok? Uang kembali 100% dalam ${MASA_ID}.*`, `. Not a fit? 100% money back within ${MASA_EN}.*`)}
          </p>
          <div className="relative mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
            <Link
              href="/daftar"
              data-analitik="Panduan: daftar"
              className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-ink-signal px-7 py-4 text-[15px] font-bold text-ink transition-transform hover:-translate-y-0.5"
            >
              {t("Daftar gratis sekarang", "Sign up free now")}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
            <a
              href={urlWaDemo}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-ink-signal/40 bg-ink-signal/10 px-6 py-4 text-[15px] font-bold text-ink-signal transition-colors hover:bg-ink-signal/20"
            >
              <IkonWhatsApp className="size-4" /> {t("Masih bingung? Tanya CS", "Still unsure? Ask us")}
            </a>
          </div>
          <p className="relative mt-6 text-[12px] text-ink-muted">
            {t("*Untuk pembayaran pertama lewat GoPay, ShopeePay, atau QRIS.", "*For your first payment made with GoPay, ShopeePay, or QRIS.")}
          </p>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1100px] flex-col items-center justify-between gap-3 px-4 py-8 text-[13px] text-muted sm:flex-row sm:px-6">
          <Logo />
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2">
            <Link href="/" className="hover:text-fg">
              {t("Beranda", "Home")}
            </Link>
            <Link href="/panduan" className="font-semibold text-fg">
              {t("Panduan", "Guide")}
            </Link>
            <Link href="/program-afiliasi" className="hover:text-fg">
              {t("Program Afiliasi", "Affiliate Program")}
            </Link>
            <Link href="/login" className="hover:text-fg">
              {t("Masuk", "Sign in")}
            </Link>
            <Link href="/daftar" className="hover:text-fg">
              {t("Daftar", "Sign up")}
            </Link>
          </div>
        </div>
        <KakiPerusahaan className="pb-20 sm:pb-0" />
      </footer>

      <WidgetWaLanding />
    </div>
  );
}

function NomorLangkah({ k, i }: { k: number; i: number }) {
  return (
    <span className="inline-flex items-center rounded-full bg-accent-soft px-2.5 py-1 text-[12px] font-bold text-accent tabular-nums">
      {k + 1}.{i + 1}
    </span>
  );
}
