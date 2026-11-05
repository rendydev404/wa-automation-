import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { ArrowRight, Banknote, Check, Link2, Percent, ShieldCheck, Share2, Sparkles, TrendingUp, Users, Wallet } from "lucide-react";
import { GantiBahasa } from "@/components/ganti-bahasa";
import { KakiPerusahaan } from "@/components/kaki-perusahaan";
import Link from "@/components/link";
import { Logo } from "@/components/logo";
import { AlurAfiliasiInteraktif, KalkulatorAfiliasi, type PaketSimulasiAfiliasi } from "@/components/landing/interaktif-afiliasi";
import { WidgetWaLanding } from "@/components/landing/widget-wa";
import { DAFTAR_BANK, hitungKomisiPaket, type JenisKomisi } from "@/lib/afiliasi-def";
import { pengaturanAfiliasi } from "@/lib/afiliasi";
import { type Bahasa, type T, bahasaSah, pembuatT } from "@/lib/bahasa";
import { teksHalaman } from "@/lib/bahasa-halaman";
import { uang } from "@/lib/format";
import { KURS_CADANGAN, kursUsd } from "@/lib/kurs";
import { daftarPaket } from "@/lib/langganan";
import { MEREK } from "@/lib/merek";
import { customTampil, hargaAngka, paketCustom } from "@/lib/paket-custom";

const ASAL = process.env.APP_URL?.replace(/\/+$/, "") || "https://chatgercep.com";

export async function generateMetadata({ params }: PageProps<"/[lang]/program-afiliasi">): Promise<Metadata> {
  const { lang } = await params;
  const b = bahasaSah(lang) ? lang : "id";
  const t = pembuatT(b);
  return {
    metadataBase: new URL(ASAL),
    title: t(`Program Afiliasi · ${MEREK}`, `Affiliate Program · ${MEREK}`),
    description: t(
      `Rekomendasikan ${MEREK} ke pelaku usaha dan dapatkan komisi dari setiap pembelian paket langganan.`,
      `Recommend ${MEREK} to business owners and earn a commission on every subscription plan they buy.`,
    ),
    robots: { index: true, follow: true },
    alternates: {
      canonical: b === "en" ? "/eng/program-afiliasi" : "/program-afiliasi",
      languages: { id: "/program-afiliasi", en: "/eng/program-afiliasi", "x-default": "/program-afiliasi" },
    },
  };
}

/** Sama dengan labelKomisiPaket() (lib/afiliasi-def), tetapi mengikuti bahasa & menampilkan USD untuk "en". */
function labelKomisi(jenis: JenisKomisi, nilai: number, b: Bahasa, t: T, kurs?: number): string {
  if (nilai <= 0) return t("Tanpa komisi", "No commission");
  return jenis === "persen" ? `${nilai}%` : uang(nilai, b, kurs);
}

const keunggulanAfiliasi = (t: T) => [
  {
    ikon: Percent,
    judul: t("Komisi Per Paket Transparan", "Transparent per-plan commission"),
    teks: t(
      "Setiap paket memiliki tarif komisi tersendiri (persentase atau nominal tetap Rupiah) yang langsung masuk ke saldo saat pembayaran lunas.",
      "Each plan has its own commission rate (a percentage or a fixed amount) that lands in your balance as soon as the payment clears.",
    ),
  },
  {
    ikon: ShieldCheck,
    judul: t("Pelacakan Referral Otomatis", "Automatic referral tracking"),
    teks: t(
      "Setiap pengguna baru yang mendaftar melalui link referral Anda—baik menggunakan Email maupun login Google—otomatis tercatat sebagai referral Anda.",
      "Every new user who signs up through your referral link, whether by email or with Google, is automatically credited to you.",
    ),
  },
  {
    ikon: TrendingUp,
    judul: t("Dashboard Statistik Real-Time", "Real-time stats dashboard"),
    teks: t(
      "Pantau jumlah klik link, pengguna yang mendaftar, riwayat komisi masuk, hingga status pencairan dana secara langsung dari dashboard.",
      "Track link clicks, sign-ups, commission history, and payout status live from your dashboard.",
    ),
  },
  {
    ikon: Wallet,
    judul: t("Pencairan ke Bank & E-Wallet", "Payouts to bank & e-wallet"),
    teks: t(
      "Tarik saldo komisi Anda kapan saja ke berbagai Bank nasional (BCA, Mandiri, BRI, BNI, BSI, Jago, SeaBank) maupun E-Wallet populer.",
      "Withdraw your commission anytime to major Indonesian banks (BCA, Mandiri, BRI, BNI, BSI, Jago, SeaBank) or popular e-wallets.",
    ),
  },
];

const faqAfiliasi = (t: T) => [
  {
    t: t("Siapa saja yang bisa bergabung di Program Afiliasi?", "Who can join the Affiliate Program?"),
    j: t(
      "Semua pengguna terdaftar dapat langsung mengaktifkan fitur Afiliasi secara gratis dari menu Afiliasi di dalam dashboard tanpa syarat pembelian paket terlebih dahulu.",
      "Any registered user can turn on the affiliate feature for free from the Affiliate menu in the dashboard. No plan purchase required.",
    ),
  },
  {
    t: t("Bagaimana cara sistem melacak orang yang mendaftar dari link saya?", "How are people who sign up from my link tracked?"),
    j: t(
      "Saat seseorang membuka link ?ref=kode-anda lalu mendaftar akun (baik menggunakan Email maupun login Google), akun mereka otomatis terhubung dan tercatat sebagai referral Anda.",
      "When someone opens your ?ref=your-code link and creates an account (by email or with Google), their account is automatically linked to you as your referral.",
    ),
  },
  {
    t: t("Kapan komisi masuk ke saldo saya?", "When does commission reach my balance?"),
    j: t(
      "Komisi diberikan untuk setiap pelanggan baru yang mendaftar lewat link Anda dan melakukan pembelian paket langganan (otomatis dikreditkan begitu pembayaran berstatus Lunas). Siklus dan besaran komisi mengikuti pengaturan Admin serta ketentuan dari pihak aplikasi.",
      "You earn commission for every new customer who signs up through your link and buys a subscription plan. It's credited automatically as soon as the payment is marked Paid. Commission cycles and amounts follow the admin's settings and the app's terms.",
    ),
  },
  {
    t: t("Apakah komisi berbeda untuk setiap paket?", "Is the commission different for each plan?"),
    j: t(
      "Ya. Besaran komisi diatur secara spesifik oleh Admin untuk masing-masing paket (Starter, Bisnis, Pro, maupun Paket Custom) sesuai kebijakan pihak aplikasi.",
      "Yes. The admin sets the commission for each plan individually, including Custom plans, in line with the app's policy.",
    ),
  },
  {
    t: t("Bagaimana cara mencairkan saldo komisi?", "How do I withdraw my commission?"),
    j: t(
      "Buka menu Afiliasi di dashboard, pastikan saldo Anda sudah mencapai batas minimum penarikan, lalu klik Ajukan Penarikan. Dana akan ditransfer ke rekening Bank atau E-Wallet yang Anda daftarkan sesuai ketentuan dari pihak aplikasi.",
      "Open the Affiliate menu in your dashboard, make sure your balance has reached the minimum payout, then request a payout. The funds are transferred to the bank account or e-wallet you registered, under the app's terms.",
    ),
  },
];

async function SeksiKalkulatorDanTabelDinamis() {
  await connection();
  const { b, t } = await teksHalaman();
  let paketSimulasi: PaketSimulasiAfiliasi[] = [];
  let siklus: "pertama" | "berulang" = "pertama";
  let minTarik = 50_000;
  let kurs: number | undefined;

  try {
    const [daftar, custom, aturan, k] = await Promise.all([
      daftarPaket(),
      paketCustom(),
      pengaturanAfiliasi(),
      // Versi Inggris menampilkan USD: kurs dari memori proses (tanpa kueri di jalur panas).
      b === "en" ? kursUsd().catch(() => KURS_CADANGAN) : Promise.resolve(undefined),
    ]);
    siklus = aturan.siklus;
    minTarik = aturan.minTarik;
    kurs = k;

    paketSimulasi = daftar
      .filter((p) => p.harga > 0)
      .map((p) => ({
        id: String(p.id),
        nama: p.nama,
        harga: p.harga,
        durasiHari: p.durasi_hari,
        komisiJenis: p.komisi_jenis,
        komisiNilai: p.komisi_nilai > 0 ? p.komisi_nilai : 20,
        unggulan: p.unggulan,
      }));

    // Hanya bila kartu Custom menampilkan harga berupa angka; harga "Hubungi kami" adalah hitungan internal.
    if (customTampil(custom) && hargaAngka(custom)) {
      paketSimulasi.push({
        id: "custom",
        nama: custom.nama,
        harga: custom.harga,
        durasiHari: custom.durasi_hari,
        komisiJenis: custom.komisi_jenis,
        komisiNilai: custom.komisi_nilai > 0 ? custom.komisi_nilai : 20,
      });
    }
  } catch {
    // Gunakan fallback default di komponen klien bila DB belum siap saat prerender
    if (b === "en") kurs = KURS_CADANGAN;
  }
  const rp = (n: number) => uang(n, b, kurs);
  const hari = (n: number) => t(`${n} hari`, `${n} ${n === 1 ? "day" : "days"}`);

  return (
    <>
      <KalkulatorAfiliasi paketList={paketSimulasi} siklus={siklus} minTarik={minTarik} kurs={kurs} />

      {paketSimulasi.length > 0 && (
        <div className="mt-10 overflow-hidden rounded-3xl border border-line bg-surface shadow-card sm:mt-14">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-5 sm:px-8">
            <div>
              <h3 className="text-[17px] font-extrabold text-fg">{t("Rincian Komisi Per Paket Saat Ini", "Current commission per plan")}</h3>
              <p className="mt-0.5 text-[13.5px] text-muted">
                {t("Tarif komisi resmi yang aktif dan otomatis dihitung oleh sistem.", "The official commission rates in effect, calculated automatically by the system.")}
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3.5 py-1.5 text-[12px] font-bold text-accent">
              <Sparkles className="size-3.5" aria-hidden />
              {siklus === "berulang"
                ? t("Komisi Berulang Tiap Pembelian", "Recurring commission on every purchase")
                : t("1x Komisi per Pelanggan Referral", "One-time commission per referred customer")}
            </span>
          </div>

          {/* Mobile: kartu per paket (tanpa geser ke samping); layar lebar: tabel. */}
          <ul className="divide-y divide-line sm:hidden">
            {paketSimulasi.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-bold text-fg">
                    {p.nama}
                    {p.unggulan && <span className="rounded-full bg-accent px-2 py-0.5 text-[10.5px] font-bold text-on-accent">{t("Populer", "Popular")}</span>}
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-muted tabular-nums">
                    {t(
                      `${rp(p.harga)} / ${hari(p.durasiHari)} · komisi ${labelKomisi(p.komisiJenis, p.komisiNilai, b, t, kurs)}`,
                      `${rp(p.harga)} / ${hari(p.durasiHari)} · ${labelKomisi(p.komisiJenis, p.komisiNilai, b, t, kurs)} commission`,
                    )}
                  </p>
                </div>
                <span className="shrink-0 text-[15px] font-extrabold text-accent tabular-nums">{rp(hitungKomisiPaket(p.harga, p.komisiJenis, p.komisiNilai))}</span>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-left text-[14px]">
              <thead>
                <tr className="border-b border-line bg-subtle/60 text-[12px] font-bold tracking-[0.06em] text-muted uppercase">
                  <th className="px-6 py-3.5 sm:px-8">{t("Nama Paket", "Plan")}</th>
                  <th className="px-6 py-3.5">{t("Harga Paket", "Plan price")}</th>
                  <th className="px-6 py-3.5">{t("Tarif Komisi", "Commission rate")}</th>
                  <th className="px-6 py-3.5 sm:px-8">{t("Komisi Diterima / Transaksi", "Commission per transaction")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {paketSimulasi.map((p) => {
                  const nominal = hitungKomisiPaket(p.harga, p.komisiJenis, p.komisiNilai);
                  const label = labelKomisi(p.komisiJenis, p.komisiNilai, b, t, kurs);
                  return (
                    <tr key={p.id} className="transition-colors hover:bg-subtle/40">
                      <td className="px-6 py-4 font-bold text-fg sm:px-8">
                        <div className="flex items-center gap-2">
                          <span>{p.nama}</span>
                          {p.unggulan && (
                            <span className="rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-bold text-on-accent">
                              {t("Populer", "Popular")}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-muted tabular-nums">
                        {rp(p.harga)} <span className="text-[12px]">/ {hari(p.durasiHari)}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="rounded-lg bg-accent-soft px-2.5 py-1 text-[12.5px] font-bold text-accent tabular-nums">
                          {label ?? "-"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-[15px] font-extrabold text-accent tabular-nums sm:px-8">
                        {rp(nominal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-line bg-subtle/40 px-5 py-3.5 text-[12.5px] text-muted sm:px-8">
            {t(
              "* Besaran komisi per paket, skema pemberian komisi, dan pencairan saldo dapat diatur oleh Admin serta mengikuti syarat & ketentuan dari pihak aplikasi.",
              "* Commission per plan, the commission scheme, and payouts are set by the admin and subject to the app's terms & conditions.",
            )}
            {b === "en" && " Amounts shown in USD; plans are billed and commissions are paid in Indonesian rupiah (IDR)."}
          </div>
        </div>
      )}
    </>
  );
}

export default async function HalamanProgramAfiliasi() {
  const { b, t } = await teksHalaman();
  return (
    <div className="bg-canvas">
      {/* ---------- Hero ---------- */}
      <div className="relative overflow-hidden bg-ink text-ink-fg">
        <div aria-hidden className="kisi-tinta absolute inset-0 opacity-60" />
        <header className="relative mx-auto flex max-w-[1200px] items-center justify-between gap-3 px-4 py-5 sm:gap-4 sm:px-6">
          <Link href="/" className="rounded-lg" aria-label={t(`${MEREK}, ke beranda`, `${MEREK}, home`)}>
            <Logo ukuran="md" gelap />
          </Link>
          <nav aria-label={t("Navigasi halaman afiliasi", "Affiliate page navigation")} className="hidden items-center gap-7 text-[13.5px] font-semibold text-ink-muted md:flex">
            <Link href="/" className="transition-colors hover:text-ink-fg">
              {t("Beranda Produk", "Product home")}
            </Link>
            <a href="#cara-kerja-afiliasi" className="transition-colors hover:text-ink-fg">
              {t("Cara Kerja", "How it works")}
            </a>
            <a href="#kalkulator-komisi" className="transition-colors hover:text-ink-fg">
              {t("Kalkulator Komisi", "Commission calculator")}
            </a>
            <a href="#keunggulan" className="transition-colors hover:text-ink-fg">
              {t("Keunggulan", "Benefits")}
            </a>
            <a href="#faq-afiliasi" className="transition-colors hover:text-ink-fg">
              FAQ
            </a>
          </nav>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <GantiBahasa gelap />
            <Link href="/login" className="rounded-xl px-2.5 py-2 text-[13.5px] font-semibold whitespace-nowrap text-ink-fg transition-colors hover:bg-white/[0.06] sm:px-3.5">
              {t("Masuk", "Sign in")}
            </Link>
            <Link href="/daftar" className="rounded-xl bg-ink-signal px-3 py-2 text-[13.5px] font-bold whitespace-nowrap text-ink transition-transform hover:-translate-y-0.5 sm:px-4">
              <span className="sm:hidden">{t("Gabung", "Join")}</span>
              <span className="hidden sm:inline">{t("Gabung Afiliasi", "Become an affiliate")}</span>
            </Link>
          </div>
        </header>

        <section className="relative mx-auto max-w-[1200px] px-4 pt-6 pb-14 sm:px-6 sm:pt-10 sm:pb-20 lg:pt-16 lg:pb-24">
          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-ink-signal/30 bg-ink-signal/10 px-3.5 py-1.5 text-[12.5px] font-semibold text-ink-signal">
              <Share2 className="size-3.5" aria-hidden />
              {t(`Program Mitra & Afiliasi Resmi ${MEREK}`, `Official ${MEREK} Partner & Affiliate Program`)}
            </p>
            <h1 className="mt-5 text-[32px] leading-[1.1] font-extrabold tracking-tight text-white sm:mt-6 sm:text-[52px] sm:leading-[1.08] lg:text-[60px]">
              {t("Bagikan Link Anda.", "Share your link.")}
              <br />
              <span className="text-ink-signal">{t("Dapatkan Komisi dari Setiap Paket.", "Earn commission on every plan.")}</span>
            </h1>
            <p className="mt-5 max-w-2xl text-[15.5px] leading-relaxed text-ink-muted sm:mt-6 sm:text-[17px]">
              {t(
                "Bantu pemilik usaha mengotomatiskan balasan WhatsApp mereka dengan AI 24/7. Setiap kali orang yang mendaftar dari link Anda membeli paket, komisi langsung masuk ke saldo Anda dan siap dicairkan.",
                "Help business owners automate their WhatsApp replies with AI, 24/7. Every time someone who signed up through your link buys a plan, the commission goes straight to your balance, ready to withdraw.",
              )}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href="/daftar"
                className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-ink-signal px-6 py-3.5 text-[15px] font-bold text-ink transition-transform hover:-translate-y-0.5"
              >
                {t("Ambil Link Afiliasi Gratis", "Get your free affiliate link")}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
              <a
                href="#kalkulator-komisi"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-ink-line px-6 py-3.5 text-[15px] font-semibold text-ink-fg transition-colors hover:bg-white/[0.05]"
              >
                {t("Hitung Potensi Komisi", "Estimate your commission")}
              </a>
            </div>
            <ul className="mt-8 grid gap-2 text-[13px] text-ink-muted sm:flex sm:flex-wrap sm:gap-x-6">
              {[
                t("100% gratis tanpa biaya pendaftaran", "100% free, no sign-up fee"),
                t("Kode referral unik dibuat acak otomatis", "Unique referral code generated for you"),
                t("Komisi langsung masuk saat paket lunas", "Commission credited as soon as the plan is paid"),
                t("Cairkan ke Bank & E-Wallet", "Withdraw to bank or e-wallet"),
              ].map((x) => (
                <li key={x} className="flex items-center gap-1.5">
                  <Check className="size-4 shrink-0 text-ink-signal" aria-hidden /> {x}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      {/* ---------- Bar Statistik Ringkas ---------- */}
      <section aria-label={t("Ringkasan program", "Program summary")} className="border-b border-line bg-surface">
        <div className="mx-auto grid max-w-[1200px] grid-cols-2 gap-x-4 gap-y-6 px-4 py-8 sm:gap-6 sm:px-6 sm:py-9 md:grid-cols-4">
          {[
            { ikon: Link2, angka: t("1 Klik", "1 click"), label: t("Aktifkan kode afiliasi di dashboard", "Turn on your affiliate code in the dashboard") },
            { ikon: TrendingUp, angka: "Real-Time", label: t("Pantau klik, pendaftar & komisi langsung", "Track clicks, sign-ups & commission live") },
            { ikon: Users, angka: t("Otomatis", "Automatic"), label: t("Kredit komisi saat transaksi lunas", "Commission credited when payment clears") },
            { ikon: Banknote, angka: t(`${DAFTAR_BANK.length} Metode`, `${DAFTAR_BANK.length} methods`), label: t("Pilihan Bank & E-Wallet pencairan", "Bank & e-wallet payout options") },
          ].map((item) => (
            <div key={item.label} className="flex min-w-0 flex-col items-start gap-2.5 sm:flex-row sm:gap-3.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
                <item.ikon className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-xl font-extrabold tracking-tight text-fg sm:text-2xl">{item.angka}</p>
                <p className="mt-0.5 text-[12.5px] text-muted">{item.label}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Simulasi Alur Interaktif ---------- */}
      <section id="cara-kerja-afiliasi" className="mx-auto max-w-[1200px] scroll-mt-8 px-4 py-14 sm:px-6 sm:py-20 lg:py-24">
        <div className="max-w-2xl">
          <p className="text-[12px] font-bold tracking-[0.1em] text-accent uppercase">{t("Cara Kerja Interaktif", "Interactive walkthrough")}</p>
          <h2 className="mt-2 text-[27px] leading-tight font-extrabold tracking-tight sm:text-[40px]">
            {t("Empat langkah sederhana dari bagi link hingga cair ke rekening.", "Four simple steps, from sharing a link to cash in your account.")}
          </h2>
          <p className="mt-3 text-[15px] text-muted sm:text-[16px]">
            {t("Klik setiap langkah di bawah ini untuk mencoba simulasi fitur afiliasi secara langsung.", "Click each step below to try out the affiliate features yourself.")}
          </p>
        </div>
        <div className="mt-12">
          <AlurAfiliasiInteraktif domainContoh={ASAL} />
        </div>
      </section>

      {/* ---------- Kalkulator & Tabel Komisi Per Paket ---------- */}
      <section id="kalkulator-komisi" className="scroll-mt-8 border-y border-line bg-subtle/40 py-14 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
          <div className="max-w-2xl">
            <p className="text-[12px] font-bold tracking-[0.1em] text-accent uppercase">{t("Simulasi Penghasilan", "Earnings simulator")}</p>
            <h2 className="mt-2 text-[27px] leading-tight font-extrabold tracking-tight sm:text-[40px]">
              {t("Berapa komisi yang bisa Anda dapatkan?", "How much commission could you earn?")}
            </h2>
            <p className="mt-3 text-[15px] text-muted sm:text-[16px]">
              {t(
                "Pilih paket dan geser jumlah pembeli untuk melihat simulasi komisi sesuai tarif resmi yang berlaku.",
                "Pick a plan and slide the number of buyers to see your commission at the current official rates.",
              )}
            </p>
          </div>
          <div className="mt-10">
            <Suspense
              fallback={
                <KalkulatorAfiliasi paketList={[]} siklus="pertama" minTarik={50_000} kurs={b === "en" ? KURS_CADANGAN : undefined} />
              }
            >
              <SeksiKalkulatorDanTabelDinamis />
            </Suspense>
          </div>
        </div>
      </section>

      {/* ---------- Keunggulan & Metode Pencairan ---------- */}
      <section id="keunggulan" className="mx-auto max-w-[1200px] scroll-mt-8 px-4 py-14 sm:px-6 sm:py-20 lg:py-24">
        <div className="max-w-2xl">
          <p className="text-[12px] font-bold tracking-[0.1em] text-accent uppercase">{t("Mengapa Bergabung", "Why join")}</p>
          <h2 className="mt-2 text-[27px] leading-tight font-extrabold tracking-tight sm:text-[40px]">
            {t("Dirancang agar mudah dibagikan dan menguntungkan.", "Easy to share, and worth your while.")}
          </h2>
          <p className="mt-3 text-[15px] text-muted sm:text-[16px]">
            {t(
              "Produk AI WhatsApp dibutuhkan oleh ribuan toko online, klinik, kuliner, hingga jasa profesional setiap harinya.",
              "Thousands of online stores, clinics, restaurants, and professional services need an AI assistant on WhatsApp every day.",
            )}
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:mt-12 sm:grid-cols-2">
          {keunggulanAfiliasi(t).map((k) => (
            <article
              key={k.judul}
              className="rounded-3xl border border-line bg-surface p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-accent/30 sm:p-6"
            >
              <span className="grid size-11 place-items-center rounded-2xl bg-accent-soft text-accent">
                <k.ikon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-5 text-[16.5px] font-bold text-fg">{k.judul}</h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{k.teks}</p>
            </article>
          ))}
        </div>

        <div className="mt-8 rounded-3xl border border-line bg-surface p-5 shadow-card sm:mt-10 sm:p-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-[12px] font-bold tracking-[0.08em] text-accent uppercase">{t("Metode Pencairan Didukung", "Supported payout methods")}</p>
              <h3 className="mt-1 text-xl font-extrabold text-fg">{t("Transfer Bank Nasional & E-Wallet", "Indonesian bank transfers & e-wallets")}</h3>
            </div>
            <span className="inline-flex items-center gap-1.5 self-start rounded-xl bg-subtle px-3.5 py-2 text-[12.5px] font-semibold text-muted sm:self-auto">
              <ShieldCheck className="size-4 text-accent" aria-hidden /> {t("Pencairan Fleksibel & Terlacak", "Flexible, trackable payouts")}
            </span>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {DAFTAR_BANK.map((x) => (
              <span
                key={x.id}
                className="rounded-xl border border-line bg-canvas px-3 py-1.5 text-[12.5px] font-bold text-fg sm:px-3.5 sm:py-2 sm:text-[13px]"
              >
                {x.nama}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      <section id="faq-afiliasi" className="mx-auto max-w-3xl scroll-mt-8 px-4 pb-14 sm:px-6 sm:pb-20 lg:pb-24">
        <h2 className="text-center text-[27px] leading-tight font-extrabold tracking-tight sm:text-[40px]">
          {t("Pertanyaan Seputar Program Afiliasi", "Affiliate program FAQ")}
        </h2>
        <div className="mt-8 space-y-3 sm:mt-10">
          {faqAfiliasi(t).map((f) => (
            <details key={f.t} className="group rounded-2xl border border-line bg-surface p-4 shadow-card open:shadow-pop sm:p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[14.5px] font-bold sm:text-[15px] [&::-webkit-details-marker]:hidden">
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

      {/* ---------- CTA Penutup ---------- */}
      <section className="px-4 pb-14 sm:px-6 sm:pb-20">
        <div className="relative mx-auto max-w-[1200px] overflow-hidden rounded-[28px] bg-ink px-5 py-12 text-center text-ink-fg sm:rounded-[32px] sm:px-12 sm:py-20">
          <div aria-hidden className="kisi-tinta absolute inset-0 opacity-60" />
          <h2 className="relative text-[27px] leading-tight font-extrabold tracking-tight text-white sm:text-[42px]">
            {t("Siap Menghasilkan Komisi dari Link Anda?", "Ready to earn from your link?")}
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-[15px] text-ink-muted sm:text-[16px]">
            {t(
              "Daftar gratis atau masuk ke akun Anda, buka menu Afiliasi, dan aktifkan kode referral unik Anda dalam 30 detik.",
              "Sign up for free or sign in, open the Affiliate menu, and turn on your unique referral code in 30 seconds.",
            )}
          </p>
          <div className="relative mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
            <Link
              href="/daftar"
              className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-ink-signal px-7 py-4 text-[15px] font-bold text-ink transition-transform hover:-translate-y-0.5"
            >
              {t("Daftar & Aktifkan Afiliasi", "Sign up & activate affiliate")}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
            <Link
              href="/afiliasi"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-ink-line px-6 py-4 text-[15px] font-semibold text-ink-fg transition-colors hover:bg-white/[0.06]"
            >
              {t("Buka Dashboard Afiliasi", "Open affiliate dashboard")}
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-between gap-3 px-4 py-8 text-[13px] text-muted sm:flex-row sm:px-6">
          <Logo />
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2">
            <Link href="/" className="hover:text-fg">
              {t("Beranda", "Home")}
            </Link>
            <Link href="/program-afiliasi" className="font-semibold text-fg">
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
