import { Suspense } from "react";
import type { Metadata } from "next";
import { ArrowRight, BadgeCheck, Bot, Clock, Lock, MessageCircle, Moon, PauseCircle, ShieldCheck, Zap } from "lucide-react";
import Link from "@/components/link";
import { angka, waktuSingkatWib } from "@/lib/format";
import { tautanChatCs } from "@/lib/followup";
import { labelKanal } from "@/lib/harga";
import { alihkanHalaman, teksHalaman } from "@/lib/bahasa-halaman";
import { kursUsd } from "@/lib/kurs";
import { MEREK } from "@/lib/merek";
import { kanalAktif, konfigMidtrans } from "@/lib/midtrans";
import { requireUser } from "@/lib/session";
import { sekarang } from "@/lib/db";
import { dataTrialHabis } from "@/lib/trial-habis";
import { HitungPaket } from "./hitung-paket";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await teksHalaman();
  return { title: `${t("Nyalakan AI lagi", "Turn the AI back on")} · ${MEREK}` };
}

/**
 * Halaman tujuan saat kuota balasan AI gratis / masa free trial habis (pesan WhatsApp otomatis, notifikasi, banner).
 * Isinya hasil nyata akun selama trial, chat yang sedang menunggu, perbandingan dengan biaya admin, lalu pilihan paket
 * yang langsung ke halaman bayar. Akun yang tidak sedang kehabisan kuota gratis diarahkan ke halaman Langganan biasa.
 */
export default function HalamanTrialHabis() {
  return (
    <Suspense fallback={<Kerangka />}>
      <Isi />
    </Suspense>
  );
}

function Kerangka() {
  return (
    <div aria-hidden className="space-y-6">
      <div className="h-80 animate-denyut rounded-3xl bg-ink" />
      <div className="card h-72 animate-denyut" />
      <div className="card h-96 animate-denyut" />
    </div>
  );
}

async function Isi() {
  const [user, { b, t }] = await Promise.all([requireUser(), teksHalaman()]);
  const [d, k, kurs, chatCs] = await Promise.all([
    dataTrialHabis(user),
    konfigMidtrans(),
    b === "en" ? kursUsd() : Promise.resolve(undefined),
    tautanChatCs(user.id).catch(() => null),
  ]);
  if (!d) await alihkanHalaman(user.peran === "admin" ? "/admin" : "/langganan");
  const data = d!;
  const kanal = k ? await kanalAktif() : [];
  const kini = sekarang();

  const pil =
    data.alasan === "waktu"
      ? t(`Masa free trial ${data.hariPercobaan} hari sudah berakhir`, `Your ${data.hariPercobaan}-day free trial has ended`)
      : data.percobaan
        ? t(`${angka(data.batasBalasan, b)} balasan AI gratis sudah habis`, `Your ${angka(data.batasBalasan, b)} free AI replies are used up`)
        : t("Kuota balasan AI gratis bulan ini habis", "This month's free AI replies are used up");
  const stat = [
    { ikon: Bot, nilai: angka(data.balasanAi, b), label: t("chat dibalas AI", "chats answered by AI") },
    { ikon: MessageCircle, nilai: angka(data.pelangganDilayani, b), label: t("pelanggan dilayani", "customers served") },
    // Kecepatan hanya ditampilkan bila terukur dari chat akun ini sendiri (bukan klaim umum).
    ...(data.rataDetik === null ? [] : [{ ikon: Zap, nilai: angka(data.rataDetik, b), label: t("detik rata-rata membalas", "sec average reply") }]),
    { ikon: Moon, nilai: angka(data.luarJamKerja, b), label: t("dibalas di luar jam kerja", "answered outside office hours") },
  ];
  const keberatan = [
    {
      q: t("“Saya bisa balas sendiri kok.”", "“I can reply myself.”"),
      a: t(
        "Bisa, selama kamu sedang pegang HP. Tapi chat paling banyak masuk malam hari dan saat kamu sibuk melayani. Dengan biaya beberapa ribu rupiah per hari, tidak ada pelanggan yang kabur karena menunggu.",
        "Sure, while you're holding your phone. But most chats arrive at night and while you're busy serving. For a few thousand rupiah a day, no customer walks away because they waited.",
      ),
    },
    {
      q: t("“Takut AI jawab ngawur.”", "“What if the AI makes things up?”"),
      a: t(
        "AI hanya menjawab dari product knowledge yang kamu isi (menu, harga, FAQ). Kalau tidak tahu, AI bilang terus terang dan bisa meneruskannya ke WhatsApp pribadimu.",
        "The AI only answers from the product knowledge you provide (menu, prices, FAQ). If it doesn't know, it says so and can forward the chat to your personal WhatsApp.",
      ),
    },
    {
      q: t("“Nomor saya aman?”", "“Is my number safe?”"),
      a: t(
        "Tersambung seperti WhatsApp Web (perangkat tertaut). Bisa diputus kapan saja dari dashboard atau dari HP-mu sendiri, dan percakapan hanya bisa dilihat di akunmu.",
        "It connects like WhatsApp Web (linked device). You can disconnect anytime from the dashboard or your own phone, and conversations are only visible in your account.",
      ),
    },
    {
      q: t("“Kalau kuotanya habis di tengah jalan?”", "“What if the quota runs out mid-way?”"),
      a: t(
        "AI berhenti sementara, chat tetap masuk ke HP-mu. Perpanjang atau naikkan paket kapan saja, kuota langsung bertambah. Tanpa kontrak dan tanpa tagihan otomatis.",
        "The AI pauses and chats still reach your phone. Renew or upgrade anytime and the quota is topped up right away. No contract, no automatic billing.",
      ),
    },
  ];

  return (
    <div className="space-y-6 lg:space-y-8">
      {/* 1. Kehilangan yang sedang terjadi */}
      <section className="relative overflow-hidden rounded-3xl bg-ink px-5 py-8 text-ink-fg sm:px-10 sm:py-12">
        <span aria-hidden className="kisi-tinta absolute inset-0" />
        <div className="relative max-w-3xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-danger px-3 py-1 text-[11.5px] font-bold tracking-wide text-white uppercase">
            <PauseCircle className="size-3.5" aria-hidden /> {pil}
          </span>
          <h1 className="mt-4 text-[26px] leading-tight font-extrabold tracking-tight sm:text-4xl">
            {t("AI di WhatsApp kamu sudah berhenti membalas pelanggan.", "The AI on your WhatsApp has stopped replying to customers.")}
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-muted sm:text-base">
            {t(
              "Chat pelanggan tetap masuk ke HP kamu, tapi sekarang harus kamu balas sendiri. Aktifkan paket dan AI langsung menyala lagi, tanpa scan ulang dan tanpa ganti nomor.",
              "Customer chats still reach your phone, but now you have to answer them yourself. Activate a plan and the AI turns back on instantly, no rescan and no new number.",
            )}
          </p>
          {data.pesanMasukSejakBerhenti > 0 && (
            <div className="mt-5 flex w-fit max-w-full items-start gap-3 rounded-2xl border border-danger/50 bg-danger/15 px-4 py-3 text-[14px]">
              <span className="relative mt-1.5 flex size-2.5 shrink-0">
                <span className="absolute inset-0 animate-ping rounded-full bg-danger opacity-70" />
                <span className="relative size-2.5 rounded-full bg-danger" />
              </span>
              <p className="leading-snug">
                <b className="tabular-nums">{angka(data.pesanMasukSejakBerhenti, b)}</b> {t("pesan pelanggan masuk sejak AI berhenti", "customer messages arrived since the AI stopped")}
                {data.chatMenunggu > 0 && (
                  <span className="block text-[13px] text-ink-muted">{t(`${angka(data.chatMenunggu, b)} chat belum dibalas sama sekali`, `${angka(data.chatMenunggu, b)} chats still unanswered`)}</span>
                )}
              </p>
            </div>
          )}
          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
            <a href="#paket" className="btn btn-primary min-h-12 px-6 text-[15px]">
              {t("Nyalakan AI lagi", "Turn the AI back on")} <ArrowRight className="size-4" aria-hidden />
            </a>
            {chatCs && (
              <a href={chatCs} target="_blank" rel="noopener noreferrer" className="btn min-h-12 border border-ink-line bg-white/[0.06] px-6 text-[15px] text-white hover:bg-white/[0.1]">
                <MessageCircle className="size-4" aria-hidden /> {t("Tanya CS dulu", "Ask support first")}
              </a>
            )}
          </div>
        </div>
      </section>

      {/* 2. Hasil nyata selama trial */}
      <section className="card p-5 sm:p-7">
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
          {data.namaUsaha
            ? t(`Selama free trial, AI sudah bekerja untuk ${data.namaUsaha}`, `During the free trial, the AI worked for ${data.namaUsaha}`)
            : t("Selama free trial, AI sudah bekerja untukmu", "During the free trial, the AI worked for you")}
        </h2>
        <div className={`mt-5 grid grid-cols-2 gap-3 ${stat.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
          {stat.map((s) => (
            <div key={s.label} className="rounded-2xl bg-subtle p-4">
              <s.ikon className="size-4 text-accent" aria-hidden />
              <p className="mt-2 text-2xl font-extrabold text-accent tabular-nums sm:text-[28px]">{s.nilai}</p>
              <p className="text-[12.5px] text-muted">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
          <div>
            <h3 className="text-[15px] font-bold">
              {data.contohMenunggu.length
                ? t("Pelanggan yang sedang menunggu balasanmu", "Customers waiting for your reply")
                : t("Begini yang terjadi sekarang", "Here's what happens now")}
            </h3>
            <ul className="mt-3 space-y-2" aria-label={t("Chat belum dibalas", "Unanswered chats")}>
              {data.contohMenunggu.length ? (
                data.contohMenunggu.map((c, i) => (
                  <li key={i} className="max-w-md rounded-2xl rounded-tl-sm bg-subtle px-3.5 py-2.5 text-[13.5px]">
                    <p className="line-clamp-2 break-words">{c.cuplikan}</p>
                    <p className="mt-0.5 text-[11.5px] text-danger">
                      {c.nama || t("Pelanggan", "Customer")} · {waktuSingkatWib(c.waktu, kini, b)} · {t("belum dibalas", "unanswered")}
                    </p>
                  </li>
                ))
              ) : (
                <>
                  <li className="max-w-md rounded-2xl rounded-tl-sm bg-subtle px-3.5 py-2.5 text-[13.5px]">
                    {t("Kak masih buka? Ada promo nggak?", "Are you still open? Any promos?")}
                    <p className="mt-0.5 text-[11.5px] text-muted">{t("Pelanggan · 22.41", "Customer · 10:41 PM")}</p>
                  </li>
                  <li className="mx-auto w-fit rounded-full bg-danger-soft px-3 py-1 text-[12px] font-semibold text-danger">
                    {t("AI berhenti, kuota gratis habis", "AI paused, free quota used up")}
                  </li>
                  <li className="max-w-md rounded-2xl rounded-tl-sm bg-subtle px-3.5 py-2.5 text-[13.5px]">
                    {t("Kak? Halo? 🙏", "Hello? Anyone? 🙏")}
                    <p className="mt-0.5 text-[11.5px] text-danger">{t("Pelanggan · 22.58 · belum dibalas", "Customer · 10:58 PM · unanswered")}</p>
                  </li>
                </>
              )}
            </ul>
          </div>
          <div className="rounded-2xl border border-danger/30 bg-danger-soft p-5">
            <p className="text-[15px] font-bold text-fg">{t("Pelanggan yang menunggu lama biasanya pindah ke toko lain.", "Customers who wait too long usually go elsewhere.")}</p>
            <p className="mt-1.5 text-[13.5px] text-muted">
              {t(
                "Setiap chat yang telat dibalas adalah calon pesanan yang bisa hilang. AI membalas dalam hitungan detik, siang maupun malam.",
                "Every late reply is a potential order you could lose. The AI answers in seconds, day or night.",
              )}
            </p>
            <a href="#paket" className="btn btn-primary mt-4 min-h-11">
              {t("Balas semua chat lagi", "Answer every chat again")} <ArrowRight className="size-4" aria-hidden />
            </a>
          </div>
        </div>
      </section>

      {/* 3 & 4. Hitungan biaya admin + pilihan paket */}
      <HitungPaket paket={data.paket} chatAwal={data.pesanPerHari} kurs={kurs} />

      {/* 5. Rasa aman membayar */}
      <section className="card p-5 sm:p-7">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { ikon: Zap, judul: t("AI langsung aktif", "AI back on instantly"), isi: t("begitu pembayaran lunas, tanpa scan ulang", "as soon as payment clears, no rescan") },
            { ikon: BadgeCheck, judul: t("Tanpa kontrak", "No contract"), isi: t("tanpa tagihan otomatis, perpanjang kapan saja", "no auto-billing, renew anytime") },
            { ikon: Lock, judul: t("Data tetap privat", "Your data stays private"), isi: t("percakapan hanya terlihat di akunmu", "conversations only show in your account") },
          ].map((x) => (
            <div key={x.judul} className="flex gap-3 rounded-2xl bg-subtle p-4">
              <x.ikon className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
              <div>
                <p className="text-[13.5px] font-bold">{x.judul}</p>
                <p className="text-[12.5px] text-muted">{x.isi}</p>
              </div>
            </div>
          ))}
        </div>
        {kanal.length > 0 && (
          <div className="mt-5">
            <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-muted">
              <ShieldCheck className="size-4" aria-hidden /> {t("Bayar aman lewat Midtrans:", "Pay securely via Midtrans:")}
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {kanal.map((x) => (
                <li key={x} className="rounded-lg border border-line px-2.5 py-1 text-[12px] font-semibold text-muted">
                  {labelKanal(x, b)}
                </li>
              ))}
            </ul>
          </div>
        )}
        {chatCs && (
          <a href={chatCs} target="_blank" rel="noopener noreferrer" className="btn btn-ghost mt-5 min-h-11 w-full border border-line sm:w-auto">
            <MessageCircle className="size-4 text-accent" aria-hidden /> {t("Bingung pilih paket? Chat CS dulu", "Not sure which plan? Chat with support")}
          </a>
        )}
      </section>

      {/* 6. Menjawab keraguan */}
      <section className="card p-5 sm:p-7">
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{t("Masih ragu?", "Still unsure?")}</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {keberatan.map((x) => (
            <details key={x.q} className="group rounded-2xl border border-line px-4 py-3 open:bg-subtle/50">
              <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-3 text-[14px] font-bold select-none [&::-webkit-details-marker]:hidden">
                {x.q}
                <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-accent transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{x.a}</p>
            </details>
          ))}
        </div>
      </section>

      <p className="pb-4 text-center text-[13px]">
        <Link href="/dashboard" className="inline-flex min-h-11 items-center gap-1.5 text-muted hover:text-fg hover:underline">
          <Clock className="size-4" aria-hidden /> {t("Nanti dulu, saya balas manual", "Not now, I'll reply manually")}
        </Link>
      </p>
    </div>
  );
}
