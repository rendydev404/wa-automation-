import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpenText, Camera, Check, GraduationCap, Hand, History, Lock, MessageCircle, ShieldCheck, Smartphone, Zap } from "lucide-react";
import { DemoAlur, DemoChat } from "@/components/landing/demo";
import { Kalkulator } from "@/components/landing/kalkulator";

/** Landing page publik: seluruhnya statis (prerender), animasi Remotion dimuat terpisah di sisi klien. */

export const metadata: Metadata = {
  title: "Asisten WhatsApp · AI yang membalas pelanggan Anda 24/7",
  description: "Sambungkan WhatsApp dengan scan QR, beri pengetahuan usaha Anda, dan biarkan AI membalas pelanggan dalam hitungan detik.",
  robots: { index: true, follow: true },
};

const FITUR = [
  { ikon: BookOpenText, judul: "Jawab dari base knowledge", teks: "Unggah PDF, menu, harga, atau FAQ. AI hanya menyampaikan fakta yang Anda berikan dan tidak mengarang." },
  { ikon: Hand, judul: "Anda tetap pegang kendali", teks: "Membalas sendiri dari HP? AI otomatis diam di chat itu, lalu melanjutkan setelah jeda yang Anda atur." },
  { ikon: GraduationCap, judul: "Belajar dari balasan Anda", teks: "Cara Anda menjawab pelanggan dipelajari, jadi balasan AI makin mirip gaya usaha Anda." },
  { ikon: Camera, judul: "Mengerti foto pelanggan", teks: "Pelanggan kirim foto produk atau bukti transfer? AI bisa melihat dan menanggapinya." },
  { ikon: History, judul: "Histori percakapan", teks: "Semua chat tercatat rapi: siapa yang membalas (AI atau Anda), dan bisa dicari kapan saja." },
  { ikon: Smartphone, judul: "Tanpa ganti nomor", teks: "Pakai nomor WhatsApp yang sudah ada. Tersambung sebagai perangkat tertaut, HP tetap bisa dipakai." },
];

const KEAMANAN = [
  { ikon: Lock, judul: "Password di-hash scrypt", teks: "Password tidak pernah disimpan dalam bentuk asli." },
  { ikon: ShieldCheck, judul: "Sesi login bertanda tangan", teks: "Cookie HttpOnly; ganti password = semua perangkat lain keluar." },
  { ikon: Zap, judul: "Perlindungan tebak password", teks: "Pembatasan percobaan per IP dan penguncian akun otomatis." },
  { ikon: Smartphone, judul: "Kontrol penuh perangkat", teks: "Putuskan WhatsApp kapan saja dari dashboard atau dari HP." },
];

const FAQ = [
  { t: "Apakah nomor WhatsApp saya aman?", j: "Nomor tersambung sebagai perangkat tertaut, sama seperti WhatsApp Web. Anda bisa memutusnya kapan saja dari dashboard atau dari HP (Perangkat tertaut → Keluar)." },
  { t: "Bisa dipakai WhatsApp Business?", j: "Bisa. WhatsApp biasa maupun WhatsApp Business, selama bisa membuka menu Perangkat tertaut." },
  { t: "Bagaimana kalau AI tidak tahu jawabannya?", j: "AI dilarang menebak. Bila informasinya tidak ada di base knowledge, AI berkata terus terang dan meneruskan ke Anda." },
  { t: "Berapa nomor yang bisa saya sambungkan?", j: "Akun baru mendapat kuota 1 nomor. Butuh lebih banyak untuk tim atau cabang? Hubungi admin untuk menambah kuota." },
  { t: "Bolehkah untuk broadcast/promo massal?", j: "Tidak. Layanan ini untuk membalas pelanggan yang menghubungi Anda. Akun yang dipakai untuk spam akan diblokir." },
];

export default function Landing() {
  return (
    <div className="bg-canvas">
      {/* ---------- Hero (gelap) ---------- */}
      <div className="relative overflow-hidden bg-ink text-ink-fg">
        <div aria-hidden className="kisi-tinta absolute inset-0 opacity-60" />
        <div aria-hidden className="absolute -top-40 left-1/2 size-[720px] -translate-x-1/2 rounded-full bg-ink-signal/15 blur-3xl" />
        <header className="relative mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-ink-signal text-ink">
              <MessageCircle className="size-5" strokeWidth={2.4} aria-hidden />
            </span>
            <span className="text-[16px] font-bold tracking-tight">Asisten WhatsApp</span>
          </Link>
          <nav aria-label="Navigasi landing" className="hidden items-center gap-7 text-[13.5px] font-semibold text-ink-muted md:flex">
            <a href="#fitur" className="transition-colors hover:text-ink-fg">
              Fitur
            </a>
            <a href="#cara-kerja" className="transition-colors hover:text-ink-fg">
              Cara kerja
            </a>
            <a href="#keamanan" className="transition-colors hover:text-ink-fg">
              Keamanan
            </a>
            <a href="#faq" className="transition-colors hover:text-ink-fg">
              FAQ
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-xl px-3.5 py-2 text-[13.5px] font-semibold text-ink-fg transition-colors hover:bg-white/[0.06]">
              Masuk
            </Link>
            <Link href="/daftar" className="rounded-xl bg-ink-signal px-4 py-2 text-[13.5px] font-bold text-ink transition-transform hover:-translate-y-0.5">
              Daftar gratis
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
              AI membalas 24 jam, termasuk saat Anda tidur
            </p>
            <h1 className="mt-6 text-[40px] leading-[1.05] font-extrabold tracking-tight text-white sm:text-[56px] lg:text-[64px]">
              Pelanggan dibalas
              <br />
              <span className="bg-gradient-to-r from-ink-signal to-[#a7f3d0] bg-clip-text text-transparent">dalam hitungan detik.</span>
            </h1>
            <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-ink-muted">
              Sambungkan WhatsApp usaha Anda dengan scan QR, isi pengetahuan tentang produk dan layanan, lalu biarkan AI menjawab pertanyaan pelanggan secara sopan dan akurat.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/daftar" className="group inline-flex items-center gap-2 rounded-2xl bg-ink-signal px-6 py-3.5 text-[15px] font-bold text-ink shadow-[0_12px_40px_-12px_rgba(61,220,151,0.7)] transition-transform hover:-translate-y-0.5">
                Mulai gratis <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
              <a href="#cara-kerja" className="inline-flex items-center gap-2 rounded-2xl border border-ink-line px-6 py-3.5 text-[15px] font-semibold text-ink-fg transition-colors hover:bg-white/[0.05]">
                Lihat cara kerja
              </a>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-ink-muted">
              {["Tanpa kartu kredit", "1 nomor gratis", "Putuskan kapan saja"].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Check className="size-4 text-ink-signal" aria-hidden /> {t}
                </li>
              ))}
            </ul>
          </div>
          <DemoChat />
        </section>
      </div>

      {/* ---------- Angka ---------- */}
      <section aria-label="Sekilas" className="border-b border-line bg-surface">
        <dl className="mx-auto grid max-w-[1200px] grid-cols-2 gap-6 px-4 py-10 sm:px-6 md:grid-cols-4">
          {[
            ["< 10 dtk", "rata-rata waktu balas"],
            ["24/7", "tanpa jam kerja"],
            ["2 menit", "dari daftar sampai tersambung"],
            ["0", "aplikasi tambahan di HP"],
          ].map(([a, b]) => (
            <div key={b}>
              <dt className="sr-only">{b}</dt>
              <dd className="text-3xl font-extrabold tracking-tight text-fg">{a}</dd>
              <dd className="mt-1 text-[13px] text-muted">{b}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ---------- Fitur ---------- */}
      <section id="fitur" className="mx-auto max-w-[1200px] scroll-mt-8 px-4 py-20 sm:px-6 lg:py-28">
        <div className="max-w-2xl">
          <p className="text-[12px] font-bold tracking-[0.1em] text-accent uppercase">Fitur</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-[40px]">Seperti punya CS yang tidak pernah lelah.</h2>
          <p className="mt-3 text-[16px] text-muted">Semua yang dibutuhkan untuk membalas pelanggan dengan cepat, tanpa kehilangan sentuhan pribadi usaha Anda.</p>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FITUR.map((f) => (
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

      {/* ---------- Cara kerja (gelap, Remotion interaktif) ---------- */}
      <section id="cara-kerja" className="scroll-mt-8 bg-ink py-20 text-ink-fg lg:py-28">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
          <div className="max-w-2xl">
            <p className="text-[12px] font-bold tracking-[0.1em] text-ink-signal uppercase">Cara kerja</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-[40px]">Tiga langkah, langsung jalan.</h2>
            <p className="mt-3 text-[16px] text-ink-muted">Klik tiap langkah untuk melihat animasinya.</p>
          </div>
          <div className="mt-12">
            <DemoAlur />
          </div>
        </div>
      </section>

      {/* ---------- Kalkulator ---------- */}
      <section className="mx-auto grid max-w-[1200px] items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:py-28">
        <div>
          <p className="text-[12px] font-bold tracking-[0.1em] text-accent uppercase">Hemat waktu</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-[40px]">Berapa jam yang bisa Anda ambil kembali?</h2>
          <p className="mt-3 text-[16px] text-muted">Geser sesuai jumlah chat harian usaha Anda. Waktu yang biasanya habis untuk mengetik jawaban yang sama berulang-ulang bisa dipakai untuk mengembangkan usaha.</p>
        </div>
        <Kalkulator />
      </section>

      {/* ---------- Keamanan ---------- */}
      <section id="keamanan" className="scroll-mt-8 border-y border-line bg-surface">
        <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:py-24">
          <div>
            <span className="grid size-12 place-items-center rounded-2xl bg-ink text-ink-signal">
              <ShieldCheck className="size-6" aria-hidden />
            </span>
            <h2 className="mt-5 text-3xl font-extrabold tracking-tight">Data usaha Anda hanya milik Anda.</h2>
            <p className="mt-3 text-[16px] text-muted">Setiap akun terpisah sepenuhnya: nomor, knowledge, dan histori percakapan tidak bisa dilihat pengguna lain.</p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {KEAMANAN.map((k) => (
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
        <h2 className="text-center text-3xl font-extrabold tracking-tight sm:text-[40px]">Pertanyaan yang sering diajukan</h2>
        <div className="mt-10 space-y-3">
          {FAQ.map((f) => (
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
          <h2 className="relative text-3xl font-extrabold tracking-tight text-white sm:text-[44px]">Biarkan AI menjawab. Anda fokus berjualan.</h2>
          <p className="relative mx-auto mt-4 max-w-xl text-[16px] text-ink-muted">Daftar dalam satu menit, sambungkan nomor, dan lihat pelanggan pertama dibalas otomatis.</p>
          <Link href="/daftar" className="group relative mt-8 inline-flex items-center gap-2 rounded-2xl bg-ink-signal px-7 py-4 text-[15px] font-bold text-ink transition-transform hover:-translate-y-0.5">
            Buat akun gratis <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-between gap-3 px-4 py-8 text-[13px] text-muted sm:flex-row sm:px-6">
          <p>© Asisten WhatsApp</p>
          <div className="flex gap-5">
            <Link href="/login" className="hover:text-fg">
              Masuk
            </Link>
            <Link href="/daftar" className="hover:text-fg">
              Daftar
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
