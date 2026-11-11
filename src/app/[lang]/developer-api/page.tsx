import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRight, ArrowUpRight, BookOpen, Bot, Boxes, FileText, FlaskConical, KeyRound, Lock, Server, ShieldCheck, Smartphone, Webhook } from "lucide-react";
import Link from "@/components/link";
import { Logo } from "@/components/logo";
import { FITUR_API } from "@/lib/api-def";
import { bahasaHalaman, teksHalaman } from "@/lib/bahasa-halaman";
import { pembuatT } from "@/lib/bahasa";
import { MEREK, NOMOR_WA_DEMO, PERUSAHAAN } from "@/lib/merek";
import { modeMesin } from "@/lib/mode";
import { type ContohKode, DemoApi, PemicuMuncul, SalinPerintah, Sorot } from "./klien";
import { Kubus3D } from "./kubus-3d";
import "./lp-dev.css";

/**
 * Landing page Developer API — TIDAK dipublikasikan: noindex/nofollow, tidak di sitemap, tidak ditautkan dari beranda,
 * menu, atau footer. Hanya terbuka bagi yang menerima tautannya. Konsep dari Resend (hero gelap + objek 3D + kode SDK),
 * Linear (tangkapan produk di bawah hero), dan Supabase (bento fitur berilustrasi garis), dengan warna & font merek.
 * Statis penuh; skrip klien hanya untuk demo kode, sorotan kursor, dan animasi muncul saat digulir.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = pembuatT(await bahasaHalaman());
  return {
    title: `Developer API · ${MEREK}`,
    description: t("WhatsApp, bot AI, dan Informasi Usaha di aplikasi Anda lewat satu API key. Mesin berjalan di server Anda.", "WhatsApp, an AI bot, and Business Info in your app with one API key. The engine runs on your server."),
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  };
}

const ALAMAT = "https://wa.tokoanda.com";

export default async function HalamanDeveloperApi() {
  if (modeMesin()) notFound(); // mesin self-host: halaman khusus chatgercep.com
  const { t } = await teksHalaman();
  const pesanAkses = t(`Halo ${MEREK}, saya developer dan ingin minta akses Developer API.`, `Hi ${MEREK}, I'm a developer and I'd like access to the Developer API.`);
  const urlAkses = `https://wa.me/${NOMOR_WA_DEMO}?text=${encodeURIComponent(pesanAkses)}`;
  const teksPesan = t("Pesanan #1042 siap diambil!", "Order #1042 is ready for pickup!");
  const contoh: ContohKode[] = [
    {
      label: "Node.js",
      berkas: "kirim.ts",
      kode: `import { ChatGerCep } from "./chatgercep";

const cg = new ChatGerCep({
  alamat: "${ALAMAT}",
  key: process.env.CHATGERCEP_KEY,
});

await cg.pesan.kirim({
  nomor_id: "12",
  ke: "6289876543210",
  teks: "${teksPesan}",
});`,
    },
    {
      label: "cURL",
      berkas: "terminal",
      kode: `curl -X POST ${ALAMAT}/api/v1/pesan \\
  -H "Authorization: Bearer $CHATGERCEP_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "nomor_id": "12",
    "ke": "6289876543210",
    "teks": "${teksPesan}"
  }'`,
    },
    {
      label: "Python",
      berkas: "kirim.py",
      kode: `import os, requests

requests.post(
    "${ALAMAT}/api/v1/pesan",
    headers={"Authorization": f"Bearer {os.environ['CHATGERCEP_KEY']}"},
    json={
        "nomor_id": "12",
        "ke": "6289876543210",
        "teks": "${teksPesan}",
    },
)`,
    },
    {
      label: "PHP",
      berkas: "KirimPesan.php",
      kode: `use Illuminate\\Support\\Facades\\Http;

Http::withToken(env('CHATGERCEP_KEY'))
    ->post('${ALAMAT}/api/v1/pesan', [
        'nomor_id' => '12',
        'ke' => '6289876543210',
        'teks' => '${teksPesan}',
    ]);`,
    },
  ];
  const fitur = (g: string) => FITUR_API.filter((f) => f.grup === g).map((f) => f.label);
  const STACK = ["Node.js", "TypeScript", "Python", "PHP", "Laravel", "Go", "Next.js", "Django", "Ruby", "cURL", "Docker", "PostgreSQL"];

  return (
    <div className="ld min-h-dvh overflow-x-clip">
      <PemicuMuncul />
      {/* ---------- Bilah atas ---------- */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#060d0a]/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-3 px-4 sm:px-6">
          <span className="flex min-w-0 items-center gap-2.5">
            <Logo ukuran="sm" gelap />
            <span className="hidden rounded-md border border-white/12 px-2 py-0.5 font-mono text-[11px] text-[#93a99f] sm:inline">Developer API</span>
          </span>
          <nav className="ml-auto flex items-center gap-1 sm:gap-2">
            <a href="#fitur" className="hidden rounded-lg px-3 py-2 text-[13.5px] text-[#93a99f] transition-colors hover:text-white md:block">
              {t("Fitur", "Features")}
            </a>
            <a href="#cara-kerja" className="hidden rounded-lg px-3 py-2 text-[13.5px] text-[#93a99f] transition-colors hover:text-white md:block">
              {t("Cara kerja", "How it works")}
            </a>
            <Link href="/docs/api" className="hidden rounded-lg px-3 py-2 text-[13.5px] text-[#93a99f] transition-colors hover:text-white sm:block">
              {t("Dokumentasi", "Docs")}
            </Link>
            <a href={urlAkses} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-white/15 bg-white/[0.06] px-3.5 py-2 text-[13.5px] font-semibold whitespace-nowrap text-white transition-colors hover:bg-white/[0.12]">
              {t("Minta akses", "Request access")}
            </a>
          </nav>
        </div>
      </header>

      {/* ---------- Hero (ala Resend) ---------- */}
      <Sorot className="ld-sorot relative">
        <div aria-hidden className="ld-kisi pointer-events-none absolute inset-0" />
        <div className="relative mx-auto grid max-w-[1200px] items-center gap-10 px-4 pt-16 pb-10 sm:px-6 sm:pt-24 lg:min-h-[640px] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:pt-20">
          <div>
            <span className="ld-muncul inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] py-1 pr-3 pl-1.5 text-[12.5px] text-[#c8d6cf]">
              <span className="rounded-full bg-[#3ddc97]/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-[#3ddc97]">v1</span>
              {t("Akses terbatas · khusus undangan", "Limited access · invite only")}
            </span>
            <h1 className="ld-muncul mt-6 text-[44px] leading-[1.02] font-bold tracking-[-0.035em] sm:text-[64px] lg:text-[78px]" style={{ "--tunda": "80ms" } as React.CSSProperties}>
              <span className="ld-kilau">{t("WhatsApp & AI,", "WhatsApp & AI,")}</span>
              <br />
              <span className="ld-kilau-hijau">{t("satu API.", "one API.")}</span>
            </h1>
            <p className="ld-muncul mt-6 max-w-[520px] text-[16.5px] leading-relaxed text-[#93a99f] sm:text-[18px]" style={{ "--tunda": "160ms" } as React.CSSProperties}>
              {t(
                "Kirim pesan, jalankan bot AI, dan terima webhook realtime dari aplikasi Anda sendiri. Mesinnya berjalan di server Anda, logikanya dari kami.",
                "Send messages, run an AI bot, and receive real-time webhooks from your own app. The engine runs on your server; the logic comes from us.",
              )}
            </p>
            <div className="ld-muncul mt-8 flex flex-wrap items-center gap-3" style={{ "--tunda": "240ms" } as React.CSSProperties}>
              <a
                href={urlAkses}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-2 rounded-xl bg-[#3ddc97] px-5 py-3 text-[14.5px] font-bold text-[#0b1813] shadow-[0_0_0_1px_rgba(61,220,151,0.4),0_10px_40px_-10px_rgba(61,220,151,0.6)] transition-transform hover:-translate-y-0.5"
              >
                {t("Minta akses", "Request access")}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </a>
              <Link href="/docs/api" className="inline-flex items-center gap-2 rounded-xl px-4 py-3 text-[14.5px] font-semibold text-[#e8f0ec] transition-colors hover:text-white">
                <BookOpen className="size-4" aria-hidden />
                {t("Baca dokumentasi", "Read the docs")}
              </Link>
            </div>
            <div className="ld-muncul mt-6" style={{ "--tunda": "320ms" } as React.CSSProperties}>
              <SalinPerintah teks="docker compose up -d" label={t("Salin perintah", "Copy command")} />
            </div>
          </div>
          <div className="relative h-[340px] sm:h-[440px] lg:h-[560px]">
            <Kubus3D label={t("Kubus 3D interaktif: tarik untuk memutar, klik untuk memutar satu lapisan", "Interactive 3D cube: drag to spin, click to twist a layer")} />
            <div aria-hidden className="ld-bayang" />
            <p aria-hidden className="pointer-events-none absolute inset-x-0 bottom-2 text-center font-mono text-[11px] text-[#5f7a6e]">
              {t("tarik untuk memutar · klik untuk memutar lapisan", "drag to spin · click to twist a layer")}
            </p>
          </div>
        </div>
        <svg aria-hidden viewBox="0 0 1440 220" preserveAspectRatio="none" className="ld-garis-cahaya pointer-events-none absolute inset-x-0 bottom-0 h-[160px] w-full">
          <defs>
            <linearGradient id="ld-g1" x1="0" x2="1">
              <stop offset="0" stopColor="#3ddc97" stopOpacity="0" />
              <stop offset="0.45" stopColor="#3ddc97" stopOpacity="0.55" />
              <stop offset="0.7" stopColor="#e8f0ec" stopOpacity="0.5" />
              <stop offset="1" stopColor="#e8f0ec" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0 200 C 360 120, 760 60, 1440 110" fill="none" stroke="url(#ld-g1)" strokeWidth="1.5" />
        </svg>
      </Sorot>

      {/* ---------- Tangkapan produk (ala Linear) ---------- */}
      <section className="relative mx-auto max-w-[1200px] px-4 sm:px-6">
        <div className="ld-muncul">
          <DemoApi
            contoh={contoh}
            teks={{
              jalankan: t("Jalankan", "Run"),
              respons: "201",
              langsung: t("langsung", "live"),
              pelanggan: t("Toko Kue Anda · pelanggan", "Your Bakery · customer"),
              online: t("terhubung", "connected"),
              menunggu: t("menunggu permintaan…", "waiting for a request…"),
              pesan: teksPesan,
              balas: t("Siap kak, otw. Masih bisa tambah 2 bolu?", "Great, on my way. Can I add 2 sponge cakes?"),
              balasAi: t("Bisa kak! Bolu pandan Rp45.000 masih ada, kami siapkan bersama pesanan #1042 ya.", "Sure! Pandan sponge cake (Rp45,000) is in stock. We'll pack it with order #1042."),
            }}
          />
        </div>
        <p className="ld-muncul mt-4 text-center font-mono text-[12px] text-[#5f7a6e]">
          {t("Kode asli dari dokumentasi · respons & webhook disimulasikan", "Real code from the docs · response & webhooks simulated")}
        </p>
      </section>

      {/* ---------- Pita stack ---------- */}
      <section className="mt-20 border-y border-white/[0.06] py-8">
        <p className="mb-5 text-center text-[13px] text-[#93a99f]">{t("Cukup HTTP + JSON. Pakai bahasa apa pun.", "Just HTTP + JSON. Use any language.")}</p>
        <div className="ld-pita overflow-hidden">
          <div className="ld-pita-isi flex w-max gap-14 pr-14">
            {[...STACK, ...STACK].map((s, i) => (
              <span key={i} className="font-mono text-[18px] font-semibold tracking-tight text-[#e8f0ec]/45">
                {s}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Integrasi sore ini (ala Resend) ---------- */}
      <section id="cara-kerja" className="mx-auto max-w-[1200px] scroll-mt-20 px-4 py-24 sm:px-6 sm:py-32">
        <div className="ld-muncul mx-auto max-w-[720px] text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-2xl border border-white/10 bg-gradient-to-b from-[#1d3229] to-[#0b1813] shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_20px_50px_-15px_rgba(61,220,151,0.35)]">
            <Webhook className="size-7 text-[#3ddc97]" aria-hidden />
          </span>
          <h2 className="mt-6 text-[36px] leading-[1.08] font-bold tracking-[-0.03em] sm:text-[52px]">
            <span className="ld-kilau">{t("Terintegrasi", "Integrated")} </span>
            <span className="text-[#3ddc97]">{t("sore ini.", "this afternoon.")}</span>
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-[#93a99f] sm:text-[17px]">
            {t("Tiga langkah dari nol ke pesan pertama. Tanpa membangun koneksi WhatsApp, antrean, atau AI sendiri.", "Three steps from zero to your first message. No WhatsApp connection, queue, or AI to build yourself.")}
          </p>
        </div>
        <div className="mt-14 grid gap-4 lg:grid-cols-3">
          {[
            { no: "01", ikon: Server, judul: t("Nyalakan mesin", "Start the engine"), isi: t("Satu image Docker di server Anda. Database, nomor WA, dan kunci AI tetap milik Anda.", "One Docker image on your server. Database, WhatsApp numbers, and AI keys stay yours."), kode: "docker compose up -d\n✓ mesin aktif · lisensi valid" },
            { no: "02", ikon: Smartphone, judul: t("Sambungkan nomor", "Connect a number"), isi: t("Buat nomor lewat API, pindai QR atau pakai kode pairing dari HP.", "Create a number via the API, then scan the QR or use a pairing code."), kode: "POST /api/v1/nomor\nGET  /api/v1/nomor/12/qr" },
            { no: "03", ikon: Webhook, judul: t("Kirim & terima", "Send & receive"), isi: t("Kirim lewat antrean anti-blokir. Pesan masuk & balasan AI datang ke webhook Anda.", "Send through an anti-ban queue. Incoming messages and AI replies arrive at your webhook."), kode: "POST /api/v1/pesan\n← pesan.masuk · pesan.dibalas_ai" },
          ].map((x, i) => (
            <div key={x.no} className="ld-muncul group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 transition-colors hover:border-white/[0.16]" style={{ "--tunda": `${i * 90}ms` } as React.CSSProperties}>
              <div className="flex items-center justify-between">
                <x.ikon className="size-5 text-[#3ddc97]" aria-hidden />
                <span className="font-mono text-[12px] text-[#5f7a6e]">{x.no}</span>
              </div>
              <h3 className="mt-5 text-[18px] font-semibold tracking-tight">{x.judul}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-[#93a99f]">{x.isi}</p>
              <pre className="mt-5 overflow-x-auto rounded-xl border border-white/[0.06] bg-black/30 px-3.5 py-3 font-mono text-[12px] leading-[1.7] whitespace-pre text-[#a6f5cf]">{x.kode}</pre>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Bento fitur terang (ala Supabase) ---------- */}
      <section id="fitur" className="scroll-mt-16 rounded-t-[32px] bg-[#f6f6f3] text-[#15201b] sm:rounded-t-[48px]">
        <div className="mx-auto max-w-[1200px] px-4 py-24 sm:px-6 sm:py-28">
          <div className="ld-muncul grid gap-6 lg:grid-cols-2 lg:items-end">
            <h2 className="text-[36px] leading-[1.06] font-bold tracking-[-0.03em] sm:text-[52px]">
              {t("Satu API key.", "One API key.")}
              <br />
              <span className="text-[#0f7a5c]">{t(`${FITUR_API.length} fitur siap pakai.`, `${FITUR_API.length} ready-made features.`)}</span>
            </h2>
            <p className="max-w-[460px] text-[16px] leading-relaxed text-[#5c6862] lg:justify-self-end">
              {t("Semua yang dipakai bisnis di dashboard ChatGerCep, kini bisa dipanggil dari aplikasi Anda. Buka hanya fitur yang Anda butuhkan.", "Everything businesses use in the ChatGerCep dashboard, now callable from your app. Open only the features you need.")}
            </p>
          </div>

          <div className="mt-14 grid gap-4 md:grid-cols-6">
            {/* WhatsApp (besar) */}
            <article className="ld-muncul ld-bento flex flex-col overflow-hidden rounded-2xl border border-[#e6e6e0] bg-white md:col-span-4">
              <div className="grid flex-1 gap-6 p-6 sm:grid-cols-2 sm:p-7">
                <div>
                  <h3 className="flex items-center gap-2 text-[17px] font-semibold">
                    <Smartphone className="size-5 text-[#0f7a5c]" aria-hidden /> WhatsApp
                  </h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-[#5c6862]">
                    {t("Nomor, QR & pairing, kirim lewat antrean anti-blokir, cek nomor, riwayat percakapan.", "Numbers, QR & pairing, anti-ban send queue, number check, conversation history.")}
                  </p>
                  <ul className="mt-5 space-y-1.5 text-[13.5px]">
                    {fitur("wa").map((f) => (
                      <li key={f} className="flex items-center gap-2">
                        <span className="size-1.5 rounded-full bg-[#0f7a5c]" /> {f}
                      </li>
                    ))}
                  </ul>
                </div>
                <svg viewBox="0 0 220 200" className="ld-ilus h-full max-h-[220px] w-full" fill="none" aria-hidden>
                  <rect x="60" y="10" width="100" height="180" rx="16" stroke="#d3d3cb" strokeWidth="1.5" />
                  <rect x="78" y="44" width="64" height="64" rx="4" stroke="#d3d3cb" strokeWidth="1.5" />
                  {[0, 1, 2, 3].map((r) =>
                    [0, 1, 2, 3].map((c) => ((r * 3 + c * 5) % 4 ? <rect key={`${r}${c}`} x={84 + c * 14} y={50 + r * 14} width="10" height="10" rx="1.5" className="gerak" stroke="#c4c4bb" strokeWidth="1.2" /> : null)),
                  )}
                  <path d="M80 128h60M80 142h44M80 156h52" className="gerak" stroke="#d3d3cb" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M10 100h50M160 100h50" className="alir" stroke="#0f7a5c" strokeWidth="1.5" />
                </svg>
              </div>
            </article>

            {/* Bot AI */}
            <article className="ld-muncul ld-bento flex flex-col rounded-2xl border border-[#e6e6e0] bg-white p-6 md:col-span-2" style={{ "--tunda": "80ms" } as React.CSSProperties}>
              <h3 className="flex items-center gap-2 text-[17px] font-semibold">
                <Bot className="size-5 text-[#0f7a5c]" aria-hidden /> {t("Bot AI", "AI bot")}
              </h3>
              <p className="mt-2 text-[14px] leading-relaxed text-[#5c6862]">{t("Menjawab dari Informasi Usaha, saring spam, belajar dari admin.", "Answers from Business Info, filters spam, learns from admins.")}</p>
              <div className="mt-auto space-y-2 pt-6">
                <div className="w-[80%] rounded-2xl rounded-bl-md border border-[#e6e6e0] bg-[#f6f6f3] px-3 py-2 text-[12.5px]">{t("Ada paket hemat?", "Any budget bundle?")}</div>
                <div className="ml-auto w-[88%] rounded-2xl rounded-br-md bg-[#0f7a5c] px-3 py-2 text-[12.5px] text-white">{t("Ada kak! Paket Hemat Rp25.000 😊", "Yes! The Budget Bundle is Rp25,000 😊")}</div>
                <p className="pt-1 font-mono text-[11px] text-[#65706a]">{t(`${fitur("ai").length} fitur AI · 1,8 dtk`, `${fitur("ai").length} AI features · 1.8 s`)}</p>
              </div>
            </article>

            {/* Informasi Usaha */}
            <article className="ld-muncul ld-bento flex flex-col rounded-2xl border border-[#e6e6e0] bg-white p-6 md:col-span-2">
              <h3 className="flex items-center gap-2 text-[17px] font-semibold">
                <FileText className="size-5 text-[#0f7a5c]" aria-hidden /> {t("Informasi Usaha", "Business Info")}
              </h3>
              <p className="mt-2 text-[14px] leading-relaxed text-[#5c6862]">{t("Teks, PDF, dan katalog produk + foto yang dipakai AI untuk menjawab.", "Text, PDFs, and a product catalog with photos the AI answers from.")}</p>
              <svg viewBox="0 0 200 90" className="ld-ilus mt-auto h-[90px] w-full pt-4" fill="none" aria-hidden>
                <rect x="20" y="8" width="70" height="80" rx="6" stroke="#d3d3cb" strokeWidth="1.5" />
                <path d="M32 26h46M32 38h38M32 50h44M32 62h30" className="gerak" stroke="#c4c4bb" strokeWidth="1.5" strokeLinecap="round" />
                <rect x="110" y="18" width="70" height="70" rx="6" stroke="#d3d3cb" strokeWidth="1.5" />
                <circle cx="132" cy="40" r="7" className="gerak" stroke="#c4c4bb" strokeWidth="1.5" />
                <path d="M114 80l22-22 14 14 10-10 18 18" className="gerak" stroke="#c4c4bb" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            </article>

            {/* Webhook */}
            <article className="ld-muncul ld-bento flex flex-col rounded-2xl border border-[#e6e6e0] bg-white p-6 md:col-span-2" style={{ "--tunda": "80ms" } as React.CSSProperties}>
              <h3 className="flex items-center gap-2 text-[17px] font-semibold">
                <Webhook className="size-5 text-[#0f7a5c]" aria-hidden /> {t("Webhook realtime", "Real-time webhooks")}
              </h3>
              <p className="mt-2 text-[14px] leading-relaxed text-[#5c6862]">{t("Bertanda tangan HMAC, dicoba ulang otomatis bila server Anda sibuk.", "HMAC-signed and retried automatically when your server is busy.")}</p>
              <div className="mt-auto flex flex-wrap gap-1.5 pt-5 font-mono text-[11.5px]">
                {["pesan.masuk", "pesan.dibalas_ai", "pesan.status", "nomor.terhubung"].map((e) => (
                  <span key={e} className="rounded-md border border-[#e6e6e0] bg-[#f6f6f3] px-2 py-1 text-[#0b6249]">
                    {e}
                  </span>
                ))}
              </div>
            </article>

            {/* Laporan & alat */}
            <article className="ld-muncul ld-bento flex flex-col rounded-2xl border border-[#e6e6e0] bg-white p-6 md:col-span-2" style={{ "--tunda": "160ms" } as React.CSSProperties}>
              <h3 className="flex items-center gap-2 text-[17px] font-semibold">
                <Boxes className="size-5 text-[#0f7a5c]" aria-hidden /> {t("Laporan & alat", "Reports & tools")}
              </h3>
              <p className="mt-2 text-[14px] leading-relaxed text-[#5c6862]">{t("Statistik harian per nomor dan cek spam judi tanpa AI.", "Daily stats per number and gambling-spam checks without AI.")}</p>
              <svg viewBox="0 0 200 80" className="ld-ilus mt-auto h-[80px] w-full pt-4" fill="none" aria-hidden>
                {[22, 40, 30, 52, 44, 62, 56].map((h, i) => (
                  <rect key={i} x={14 + i * 26} y={78 - h} width="16" height={h} rx="3" className="gerak" stroke={i === 5 ? "#0f7a5c" : "#c4c4bb"} strokeWidth="1.5" />
                ))}
              </svg>
            </article>

            {/* Self-host (lebar) */}
            <article className="ld-muncul ld-bento overflow-hidden rounded-2xl border border-[#e6e6e0] bg-white md:col-span-6">
              <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-center">
                <div>
                  <h3 className="flex items-center gap-2 text-[17px] font-semibold">
                    <Server className="size-5 text-[#0f7a5c]" aria-hidden /> {t("Self-host, UI milik Anda", "Self-hosted, your UI")}
                  </h3>
                  <p className="mt-2 max-w-[440px] text-[14px] leading-relaxed text-[#5c6862]">
                    {t(
                      "Seperti Core API: mesin ChatGerCep berjalan di Docker milik Anda, aplikasi Anda memanggilnya. Dashboard bawaan boleh dimatikan supaya pelanggan hanya melihat tampilan Anda.",
                      "Like a Core API: the ChatGerCep engine runs in your Docker and your app calls it. The built-in dashboard can be switched off so customers only see your UI.",
                    )}
                  </p>
                </div>
                <svg viewBox="0 0 520 150" className="ld-ilus w-full" fill="none" aria-hidden>
                  <rect x="8" y="45" width="130" height="60" rx="10" stroke="#d3d3cb" strokeWidth="1.5" />
                  <text x="73" y="80" textAnchor="middle" fontSize="13" fill="#15201b" fontFamily="var(--font-sans)">{t("Aplikasi Anda", "Your app")}</text>
                  <rect x="195" y="30" width="130" height="90" rx="12" stroke="#0f7a5c" strokeWidth="1.8" fill="#e4f3ed" />
                  <text x="260" y="70" textAnchor="middle" fontSize="13" fontWeight="600" fill="#0b6249" fontFamily="var(--font-sans)">{MEREK}</text>
                  <text x="260" y="90" textAnchor="middle" fontSize="11" fill="#0f7a5c" fontFamily="monospace">docker · :1975</text>
                  <rect x="382" y="45" width="130" height="60" rx="10" stroke="#d3d3cb" strokeWidth="1.5" />
                  <text x="447" y="80" textAnchor="middle" fontSize="13" fill="#15201b" fontFamily="var(--font-sans)">WhatsApp</text>
                  <path d="M138 68h57M325 68h57" className="alir" stroke="#0f7a5c" strokeWidth="1.6" />
                  <path d="M195 84h-57M382 84h-57" className="alir" stroke="#9fb3aa" strokeWidth="1.4" />
                  <text x="166" y="60" textAnchor="middle" fontSize="10" fill="#65706a" fontFamily="monospace">API</text>
                  <text x="166" y="100" textAnchor="middle" fontSize="10" fill="#65706a" fontFamily="monospace">webhook</text>
                </svg>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* ---------- Milik Anda (gelap) ---------- */}
      <section className="bg-[#f6f6f3]">
        <div className="rounded-t-[32px] bg-[#060d0a] sm:rounded-t-[48px]">
          <div className="mx-auto max-w-[1200px] px-4 py-24 sm:px-6 sm:py-32">
            <h2 className="ld-muncul max-w-[820px] text-[34px] leading-[1.1] font-bold tracking-[-0.03em] sm:text-[48px]">
              <span className="ld-kilau">{t("Server, nomor, data, dan kunci AI tetap milik Anda.", "Your server, numbers, data, and AI keys stay yours.")}</span>{" "}
              <span className="text-[#5f7a6e]">{t("Kami hanya meminjamkan mesinnya.", "We just lend you the engine.")}</span>
            </h2>
            <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.08] sm:grid-cols-2 lg:grid-cols-4">
              {[
                { ikon: Lock, judul: t("Data tidak keluar", "Data stays put"), isi: t("Isi chat & Informasi Usaha tidak pernah dikirim ke server kami.", "Chats and Business Info are never sent to our servers.") },
                { ikon: KeyRound, judul: t("Satu API key", "One API key"), isi: t("Semua fitur yang dibuka dipanggil dengan satu key, bisa diganti kapan saja.", "Every opened feature uses one key you can rotate anytime.") },
                { ikon: ShieldCheck, judul: t("Lisensi bertanda tangan", "Signed licenses"), isi: t("Ed25519, dikirim lewat webhook tanpa polling. Mesin tetap jalan saat pusat sibuk.", "Ed25519, delivered by webhook with no polling. The engine keeps running if we're busy.") },
                { ikon: FlaskConical, judul: t("Sandbox gratis", "Free sandbox"), isi: t("Key cg_test_ langsung aktif dengan WhatsApp asli, tanpa menunggu peninjauan.", "A cg_test_ key works right away with real WhatsApp, no review wait.") },
              ].map((x, i) => (
                <div key={x.judul} className="ld-muncul bg-[#060d0a] p-6" style={{ "--tunda": `${i * 80}ms` } as React.CSSProperties}>
                  <x.ikon className="size-5 text-[#3ddc97]" aria-hidden />
                  <h3 className="mt-4 text-[15.5px] font-semibold">{x.judul}</h3>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#93a99f]">{x.isi}</p>
                </div>
              ))}
            </div>

            {/* Sandbox vs production */}
            <div className="mt-20 grid gap-4 lg:grid-cols-2">
              {[
                {
                  label: "Sandbox",
                  kode: "cg_test_…",
                  harga: t("Gratis", "Free"),
                  isi: [t("Langsung aktif, tanpa peninjauan", "Active instantly, no review"), t("Mesin di laptop, tanpa domain/HTTPS", "Run on a laptop, no domain/HTTPS"), t("1 nomor bot + 1 nomor penguji", "1 bot number + 1 tester number"), t("WhatsApp asli, AI pakai kunci Anda", "Real WhatsApp, AI with your keys")],
                  sorot: false,
                },
                {
                  label: "Production",
                  kode: "cg_live_…",
                  harga: t("Gratis secara bawaan", "Free by default"),
                  isi: [t("Ditinjau tim kami, fitur sesuai kebutuhan", "Reviewed by our team, features as needed"), t("Mesin di server Anda dengan HTTPS", "Engine on your server with HTTPS"), t("Lisensi 7 hari, diperpanjang otomatis", "7-day license, renewed automatically"), t("Batas nomor & pesan per aplikasi", "Per-app number & message limits")],
                  sorot: true,
                },
              ].map((p) => (
                <div
                  key={p.label}
                  className={`ld-muncul relative overflow-hidden rounded-2xl border p-7 ${p.sorot ? "border-[#3ddc97]/40 bg-gradient-to-b from-[#0f2a20] to-[#08130f]" : "border-white/[0.08] bg-white/[0.02]"}`}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-[18px] font-semibold">{p.label}</h3>
                    <code className="rounded-md border border-white/10 px-2 py-0.5 font-mono text-[12px] text-[#93a99f]">{p.kode}</code>
                  </div>
                  <p className={`mt-4 text-[30px] font-bold tracking-tight ${p.sorot ? "text-[#3ddc97]" : ""}`}>{p.harga}</p>
                  <ul className="mt-5 space-y-2.5 text-[14px] text-[#c8d6cf]">
                    {p.isi.map((x) => (
                      <li key={x} className="flex gap-2.5">
                        <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[#3ddc97]" /> {x}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* ---------- CTA akhir ---------- */}
          <div className="relative overflow-hidden border-t border-white/[0.06]">
            <div aria-hidden className="ld-kisi absolute inset-0 opacity-60" />
            <div aria-hidden className="absolute inset-x-0 -bottom-40 mx-auto h-80 w-[720px] max-w-full rounded-full bg-[#3ddc97]/15 blur-[90px]" />
            <div className="relative mx-auto max-w-[900px] px-4 py-24 text-center sm:px-6 sm:py-32">
              <h2 className="ld-muncul text-[38px] leading-[1.05] font-bold tracking-[-0.035em] sm:text-[60px]">
                <span className="ld-kilau">{t("Mulai bangun", "Start building")}</span>
                <br />
                <span className="ld-kilau-hijau">{t("hari ini.", "today.")}</span>
              </h2>
              <p className="ld-muncul mx-auto mt-5 max-w-[520px] text-[16px] leading-relaxed text-[#93a99f]">
                {t("Akses Developer API masih terbatas. Ceritakan aplikasi Anda, tim kami membukakan portal dan key sandbox.", "Developer API access is still limited. Tell us about your app and we'll open the portal and a sandbox key.")}
              </p>
              <div className="ld-muncul mt-9 flex flex-wrap items-center justify-center gap-3">
                <a href={urlAkses} target="_blank" rel="noopener noreferrer" className="group inline-flex items-center gap-2 rounded-xl bg-[#3ddc97] px-6 py-3.5 text-[15px] font-bold text-[#0b1813] shadow-[0_10px_40px_-10px_rgba(61,220,151,0.6)] transition-transform hover:-translate-y-0.5">
                  {t("Minta akses lewat WhatsApp", "Request access on WhatsApp")}
                  <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
                </a>
                <Link href="/docs/api/mulai-cepat" className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-5 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-white/[0.06]">
                  {t("Mulai cepat (10 menit)", "Quickstart (10 min)")}
                </Link>
              </div>
            </div>
          </div>

          <footer className="border-t border-white/[0.06]">
            <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 py-8 text-[13px] text-[#5f7a6e] sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <span className="flex items-center gap-3">
                <Logo ukuran="sm" gelap />
                <span>© {PERUSAHAAN}</span>
              </span>
              <span className="flex flex-wrap gap-5">
                <Link href="/docs/api" className="hover:text-[#e8f0ec]">
                  {t("Dokumentasi", "Docs")}
                </Link>
                <Link href="/docs/api/referensi" className="hover:text-[#e8f0ec]">
                  {t("Referensi API", "API reference")}
                </Link>
                <a href="/docs/api/openapi.json" className="hover:text-[#e8f0ec]">
                  OpenAPI
                </a>
              </span>
            </div>
          </footer>
        </div>
      </section>
    </div>
  );
}
