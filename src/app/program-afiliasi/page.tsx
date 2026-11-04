import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowRight, Banknote, Check, Link2, Percent, ShieldCheck, Share2, Sparkles, TrendingUp, Users, Wallet } from "lucide-react";
import { Logo } from "@/components/logo";
import { AlurAfiliasiInteraktif, KalkulatorAfiliasi, type PaketSimulasiAfiliasi } from "@/components/landing/interaktif-afiliasi";
import { WidgetWaLanding } from "@/components/landing/widget-wa";
import { DAFTAR_BANK, hitungKomisiPaket, labelKomisiPaket } from "@/lib/afiliasi-def";
import { pengaturanAfiliasi } from "@/lib/afiliasi";
import { angka } from "@/lib/format";
import { daftarPaket } from "@/lib/langganan";
import { MEREK } from "@/lib/merek";
import { customTampil, paketCustom } from "@/lib/paket-custom";

export const metadata: Metadata = {
  title: `Program Afiliasi · ${MEREK}`,
  description: `Rekomendasikan ${MEREK} ke pelaku usaha dan dapatkan komisi dari setiap pembelian paket langganan.`,
  robots: { index: true, follow: true },
};

const KEUNGGULAN_AFILIASI = [
  {
    ikon: Percent,
    judul: "Komisi Per Paket Transparan",
    teks: "Setiap paket memiliki tarif komisi tersendiri (persentase atau nominal tetap Rupiah) yang langsung masuk ke saldo saat pembayaran lunas.",
  },
  {
    ikon: ShieldCheck,
    judul: "Pelacakan Referral Otomatis",
    teks: "Setiap pengguna baru yang mendaftar melalui link referral Anda—baik menggunakan Email maupun login Google—otomatis tercatat sebagai referral Anda.",
  },
  {
    ikon: TrendingUp,
    judul: "Dashboard Statistik Real-Time",
    teks: "Pantau jumlah klik link, pengguna yang mendaftar, riwayat komisi masuk, hingga status pencairan dana secara langsung dari dashboard.",
  },
  {
    ikon: Wallet,
    judul: "Pencairan ke Bank & E-Wallet",
    teks: "Tarik saldo komisi Anda kapan saja ke berbagai Bank nasional (BCA, Mandiri, BRI, BNI, BSI, Jago, SeaBank) maupun E-Wallet populer.",
  },
];

const FAQ_AFILIASI = [
  {
    t: "Siapa saja yang bisa bergabung di Program Afiliasi?",
    j: "Semua pengguna terdaftar dapat langsung mengaktifkan fitur Afiliasi secara gratis dari menu Afiliasi di dalam dashboard tanpa syarat pembelian paket terlebih dahulu.",
  },
  {
    t: "Bagaimana cara sistem melacak orang yang mendaftar dari link saya?",
    j: "Saat seseorang membuka link ?ref=kode-anda lalu mendaftar akun (baik menggunakan Email maupun login Google), akun mereka otomatis terhubung dan tercatat sebagai referral Anda.",
  },
  {
    t: "Kapan komisi masuk ke saldo saya?",
    j: "Komisi diberikan untuk setiap pelanggan baru yang mendaftar lewat link Anda dan melakukan pembelian paket langganan (otomatis dikreditkan begitu pembayaran berstatus Lunas). Siklus dan besaran komisi mengikuti pengaturan Admin serta ketentuan dari pihak aplikasi.",
  },
  {
    t: "Apakah komisi berbeda untuk setiap paket?",
    j: "Ya. Besaran komisi diatur secara spesifik oleh Admin untuk masing-masing paket (Starter, Bisnis, Pro, maupun Paket Custom) sesuai kebijakan pihak aplikasi.",
  },
  {
    t: "Bagaimana cara mencairkan saldo komisi?",
    j: "Buka menu Afiliasi di dashboard, pastikan saldo Anda sudah mencapai batas minimum penarikan, lalu klik Ajukan Penarikan. Dana akan ditransfer ke rekening Bank atau E-Wallet yang Anda daftarkan sesuai ketentuan dari pihak aplikasi.",
  },
];

async function SeksiKalkulatorDanTabelDinamis() {
  await connection();
  let paketSimulasi: PaketSimulasiAfiliasi[] = [];
  let siklus: "pertama" | "berulang" = "pertama";
  let minTarik = 50_000;

  try {
    const [daftar, custom, aturan] = await Promise.all([
      daftarPaket(),
      paketCustom(),
      pengaturanAfiliasi(),
    ]);
    siklus = aturan.siklus;
    minTarik = aturan.minTarik;

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

    if (customTampil(custom) && custom.harga > 0) {
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
  }

  return (
    <>
      <KalkulatorAfiliasi paketList={paketSimulasi} siklus={siklus} minTarik={minTarik} />

      {paketSimulasi.length > 0 && (
        <div className="mt-10 overflow-hidden rounded-3xl border border-line bg-surface shadow-card sm:mt-14">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-5 sm:px-8">
            <div>
              <h3 className="text-[17px] font-extrabold text-fg">Rincian Komisi Per Paket Saat Ini</h3>
              <p className="mt-0.5 text-[13.5px] text-muted">
                Tarif komisi resmi yang aktif dan otomatis dihitung oleh sistem.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3.5 py-1.5 text-[12px] font-bold text-accent">
              <Sparkles className="size-3.5" aria-hidden />
              {siklus === "berulang" ? "Komisi Berulang Tiap Pembelian" : "1x Komisi per Pelanggan Referral"}
            </span>
          </div>

          {/* Mobile: kartu per paket (tanpa geser ke samping); layar lebar: tabel. */}
          <ul className="divide-y divide-line sm:hidden">
            {paketSimulasi.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-bold text-fg">
                    {p.nama}
                    {p.unggulan && <span className="rounded-full bg-accent px-2 py-0.5 text-[10.5px] font-bold text-on-accent">Populer</span>}
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-muted tabular-nums">
                    Rp{angka(p.harga)} / {p.durasiHari} hari · komisi {labelKomisiPaket(p.komisiJenis, p.komisiNilai)}
                  </p>
                </div>
                <span className="shrink-0 text-[15px] font-extrabold text-accent tabular-nums">Rp{angka(hitungKomisiPaket(p.harga, p.komisiJenis, p.komisiNilai))}</span>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-left text-[14px]">
              <thead>
                <tr className="border-b border-line bg-subtle/60 text-[12px] font-bold tracking-[0.06em] text-muted uppercase">
                  <th className="px-6 py-3.5 sm:px-8">Nama Paket</th>
                  <th className="px-6 py-3.5">Harga Paket</th>
                  <th className="px-6 py-3.5">Tarif Komisi</th>
                  <th className="px-6 py-3.5 sm:px-8">Komisi Diterima / Transaksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {paketSimulasi.map((p) => {
                  const nominal = hitungKomisiPaket(p.harga, p.komisiJenis, p.komisiNilai);
                  const label = labelKomisiPaket(p.komisiJenis, p.komisiNilai);
                  return (
                    <tr key={p.id} className="transition-colors hover:bg-subtle/40">
                      <td className="px-6 py-4 font-bold text-fg sm:px-8">
                        <div className="flex items-center gap-2">
                          <span>{p.nama}</span>
                          {p.unggulan && (
                            <span className="rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-bold text-on-accent">
                              Populer
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-muted tabular-nums">
                        Rp{angka(p.harga)} <span className="text-[12px]">/ {p.durasiHari} hari</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="rounded-lg bg-accent-soft px-2.5 py-1 text-[12.5px] font-bold text-accent tabular-nums">
                          {label ?? "-"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-[15px] font-extrabold text-accent tabular-nums sm:px-8">
                        Rp{angka(nominal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-line bg-subtle/40 px-5 py-3.5 text-[12.5px] text-muted sm:px-8">
            * Besaran komisi per paket, skema pemberian komisi, dan pencairan saldo dapat diatur oleh Admin serta mengikuti syarat & ketentuan dari pihak aplikasi.
          </div>
        </div>
      )}
    </>
  );
}

export default function HalamanProgramAfiliasi() {
  return (
    <div className="bg-canvas">
      {/* ---------- Hero ---------- */}
      <div className="relative overflow-hidden bg-ink text-ink-fg">
        <div aria-hidden className="kisi-tinta absolute inset-0 opacity-60" />
        <header className="relative mx-auto flex max-w-[1200px] items-center justify-between gap-3 px-4 py-5 sm:gap-4 sm:px-6">
          <Link href="/" className="rounded-lg" aria-label={`${MEREK}, ke beranda`}>
            <Logo ukuran="md" gelap />
          </Link>
          <nav aria-label="Navigasi halaman afiliasi" className="hidden items-center gap-7 text-[13.5px] font-semibold text-ink-muted md:flex">
            <Link href="/" className="transition-colors hover:text-ink-fg">
              Beranda Produk
            </Link>
            <a href="#cara-kerja-afiliasi" className="transition-colors hover:text-ink-fg">
              Cara Kerja
            </a>
            <a href="#kalkulator-komisi" className="transition-colors hover:text-ink-fg">
              Kalkulator Komisi
            </a>
            <a href="#keunggulan" className="transition-colors hover:text-ink-fg">
              Keunggulan
            </a>
            <a href="#faq-afiliasi" className="transition-colors hover:text-ink-fg">
              FAQ
            </a>
          </nav>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Link href="/login" className="rounded-xl px-2.5 py-2 text-[13.5px] font-semibold whitespace-nowrap text-ink-fg transition-colors hover:bg-white/[0.06] sm:px-3.5">
              Masuk
            </Link>
            <Link href="/daftar" className="rounded-xl bg-ink-signal px-3 py-2 text-[13.5px] font-bold whitespace-nowrap text-ink transition-transform hover:-translate-y-0.5 sm:px-4">
              <span className="sm:hidden">Gabung</span>
              <span className="hidden sm:inline">Gabung Afiliasi</span>
            </Link>
          </div>
        </header>

        <section className="relative mx-auto max-w-[1200px] px-4 pt-6 pb-14 sm:px-6 sm:pt-10 sm:pb-20 lg:pt-16 lg:pb-24">
          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-ink-signal/30 bg-ink-signal/10 px-3.5 py-1.5 text-[12.5px] font-semibold text-ink-signal">
              <Share2 className="size-3.5" aria-hidden />
              Program Mitra & Afiliasi Resmi {MEREK}
            </p>
            <h1 className="mt-5 text-[32px] leading-[1.1] font-extrabold tracking-tight text-white sm:mt-6 sm:text-[52px] sm:leading-[1.08] lg:text-[60px]">
              Bagikan Link Anda.
              <br />
              <span className="text-ink-signal">Dapatkan Komisi dari Setiap Paket.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-[15.5px] leading-relaxed text-ink-muted sm:mt-6 sm:text-[17px]">
              Bantu pemilik usaha mengotomatiskan balasan WhatsApp mereka dengan AI 24/7. Setiap kali orang yang mendaftar dari link Anda membeli paket, komisi langsung masuk ke saldo Anda dan siap dicairkan.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href="/daftar"
                className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-ink-signal px-6 py-3.5 text-[15px] font-bold text-ink transition-transform hover:-translate-y-0.5"
              >
                Ambil Link Afiliasi Gratis
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
              <a
                href="#kalkulator-komisi"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-ink-line px-6 py-3.5 text-[15px] font-semibold text-ink-fg transition-colors hover:bg-white/[0.05]"
              >
                Hitung Potensi Komisi
              </a>
            </div>
            <ul className="mt-8 grid gap-2 text-[13px] text-ink-muted sm:flex sm:flex-wrap sm:gap-x-6">
              {[
                "100% gratis tanpa biaya pendaftaran",
                "Kode referral unik dibuat acak otomatis",
                "Komisi langsung masuk saat paket lunas",
                "Cairkan ke Bank & E-Wallet",
              ].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Check className="size-4 shrink-0 text-ink-signal" aria-hidden /> {t}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      {/* ---------- Bar Statistik Ringkas ---------- */}
      <section aria-label="Ringkasan program" className="border-b border-line bg-surface">
        <div className="mx-auto grid max-w-[1200px] grid-cols-2 gap-x-4 gap-y-6 px-4 py-8 sm:gap-6 sm:px-6 sm:py-9 md:grid-cols-4">
          {[
            { ikon: Link2, angka: "1 Klik", label: "Aktifkan kode afiliasi di dashboard" },
            { ikon: TrendingUp, angka: "Real-Time", label: "Pantau klik, pendaftar & komisi langsung" },
            { ikon: Users, angka: "Otomatis", label: "Kredit komisi saat transaksi lunas" },
            { ikon: Banknote, angka: `${DAFTAR_BANK.length} Metode`, label: "Pilihan Bank & E-Wallet pencairan" },
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
          <p className="text-[12px] font-bold tracking-[0.1em] text-accent uppercase">Cara Kerja Interaktif</p>
          <h2 className="mt-2 text-[27px] leading-tight font-extrabold tracking-tight sm:text-[40px]">
            Empat langkah sederhana dari bagi link hingga cair ke rekening.
          </h2>
          <p className="mt-3 text-[15px] text-muted sm:text-[16px]">
            Klik setiap langkah di bawah ini untuk mencoba simulasi fitur afiliasi secara langsung.
          </p>
        </div>
        <div className="mt-12">
          <AlurAfiliasiInteraktif domainContoh={process.env.APP_URL?.replace(/\/$/, "") || "https://chatgercep.com"} />
        </div>
      </section>

      {/* ---------- Kalkulator & Tabel Komisi Per Paket ---------- */}
      <section id="kalkulator-komisi" className="scroll-mt-8 border-y border-line bg-subtle/40 py-14 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
          <div className="max-w-2xl">
            <p className="text-[12px] font-bold tracking-[0.1em] text-accent uppercase">Simulasi Penghasilan</p>
            <h2 className="mt-2 text-[27px] leading-tight font-extrabold tracking-tight sm:text-[40px]">
              Berapa komisi yang bisa Anda dapatkan?
            </h2>
            <p className="mt-3 text-[15px] text-muted sm:text-[16px]">
              Pilih paket dan geser jumlah pembeli untuk melihat simulasi komisi sesuai tarif resmi yang berlaku.
            </p>
          </div>
          <div className="mt-10">
            <Suspense
              fallback={
                <KalkulatorAfiliasi paketList={[]} siklus="pertama" minTarik={50_000} />
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
          <p className="text-[12px] font-bold tracking-[0.1em] text-accent uppercase">Mengapa Bergabung</p>
          <h2 className="mt-2 text-[27px] leading-tight font-extrabold tracking-tight sm:text-[40px]">
            Dirancang agar mudah dibagikan dan menguntungkan.
          </h2>
          <p className="mt-3 text-[15px] text-muted sm:text-[16px]">
            Produk AI WhatsApp dibutuhkan oleh ribuan toko online, klinik, kuliner, hingga jasa profesional setiap harinya.
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:mt-12 sm:grid-cols-2">
          {KEUNGGULAN_AFILIASI.map((k) => (
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
              <p className="text-[12px] font-bold tracking-[0.08em] text-accent uppercase">Metode Pencairan Didukung</p>
              <h3 className="mt-1 text-xl font-extrabold text-fg">Transfer Bank Nasional & E-Wallet</h3>
            </div>
            <span className="inline-flex items-center gap-1.5 self-start rounded-xl bg-subtle px-3.5 py-2 text-[12.5px] font-semibold text-muted sm:self-auto">
              <ShieldCheck className="size-4 text-accent" aria-hidden /> Pencairan Fleksibel & Terlacak
            </span>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {DAFTAR_BANK.map((b) => (
              <span
                key={b.id}
                className="rounded-xl border border-line bg-canvas px-3 py-1.5 text-[12.5px] font-bold text-fg sm:px-3.5 sm:py-2 sm:text-[13px]"
              >
                {b.nama}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      <section id="faq-afiliasi" className="mx-auto max-w-3xl scroll-mt-8 px-4 pb-14 sm:px-6 sm:pb-20 lg:pb-24">
        <h2 className="text-center text-[27px] leading-tight font-extrabold tracking-tight sm:text-[40px]">
          Pertanyaan Seputar Program Afiliasi
        </h2>
        <div className="mt-8 space-y-3 sm:mt-10">
          {FAQ_AFILIASI.map((f) => (
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
            Siap Menghasilkan Komisi dari Link Anda?
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-[15px] text-ink-muted sm:text-[16px]">
            Daftar gratis atau masuk ke akun Anda, buka menu Afiliasi, dan aktifkan kode referral unik Anda dalam 30 detik.
          </p>
          <div className="relative mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
            <Link
              href="/daftar"
              className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-ink-signal px-7 py-4 text-[15px] font-bold text-ink transition-transform hover:-translate-y-0.5"
            >
              Daftar & Aktifkan Afiliasi
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
            <Link
              href="/afiliasi"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-ink-line px-6 py-4 text-[15px] font-semibold text-ink-fg transition-colors hover:bg-white/[0.06]"
            >
              Buka Dashboard Afiliasi
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-between gap-3 px-4 py-8 text-[13px] text-muted sm:flex-row sm:px-6">
          <Logo />
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2">
            <Link href="/" className="hover:text-fg">
              Beranda
            </Link>
            <Link href="/program-afiliasi" className="font-semibold text-fg">
              Program Afiliasi
            </Link>
            <Link href="/login" className="hover:text-fg">
              Masuk
            </Link>
            <Link href="/daftar" className="hover:text-fg">
              Daftar
            </Link>
          </div>
        </div>
      </footer>

      <WidgetWaLanding />
    </div>
  );
}
