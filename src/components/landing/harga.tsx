import { connection } from "next/server";
import { ArrowRight, Check, Crown, Flame, MessageCircle, Rocket, ShieldCheck, Sparkles, Trophy } from "lucide-react";
import { tingkatPaket } from "@/lib/tingkat-paket";
import Link from "@/components/link";
import type { Bahasa } from "@/lib/bahasa";
import { teksHalaman } from "@/lib/bahasa-halaman";
import { angka, uang, UMUR_HISTORI_HARI } from "@/lib/format";
import { ringkasKanal } from "@/lib/harga";
import { kursUsd } from "@/lib/kurs";
import { aturanPercobaan, daftarPaket } from "@/lib/langganan";
import { kanalAktif, pembayaranAktif } from "@/lib/gateway";
import { customTampil, paketCustom, tautanCustom } from "@/lib/paket-custom";
import { KartuCustom } from "../kartu-custom";
import { BandingAdminLanding } from "../banding-admin";
import { syaratJaminan, MASA_ID, MASA_EN } from "@/lib/jaminan-def";

const hari = (n: number, b: Bahasa) => (b === "en" ? `${n} ${n === 1 ? "day" : "days"}` : `${n} hari`);

/**
 * Daftar harga di landing page, langsung dari paket yang dikelola admin (harga di sini = harga yang bisa dibeli).
 * Dibaca saat permintaan dan dialirkan setelah kerangka halaman statis tampil; database tak terjangkau = bagian
 * ini tidak tampil, bukan halaman gagal. Versi Inggris menampilkan USD (kurs dari memori, tanpa kueri tambahan).
 */
export async function HargaLanding() {
  await connection();
  const { b, t } = await teksHalaman();
  let paket, gratis, custom, kanal, midtrans, kurs;
  try {
    [paket, gratis, custom, kanal, midtrans, kurs] = await Promise.all([
      daftarPaket(),
      aturanPercobaan(),
      paketCustom(),
      kanalAktif(),
      pembayaranAktif(),
      b === "en" ? kursUsd() : Promise.resolve(undefined),
    ]);
  } catch {
    return null;
  }
  const dijual = paket.filter((p) => p.harga > 0);
  const adaCustom = customTampil(custom);
  if (!dijual.length && !adaCustom) return null;
  const tanpaTrial = gratis.balasan === 0;
  const IKON = { starter: Rocket, bisnis: Trophy, pro: Crown } as const;
  return (
    <div className="mt-14 grid gap-6 md:grid-cols-2 xl:grid-cols-3 xl:gap-5">
      {dijual.map((p) => {
        const top = p.unggulan;
        const tingkat = tingkatPaket(p.kode, p.nama);
        const Ikon = tingkat && tingkat !== "custom" ? IKON[tingkat] : Sparkles;
        return (
          <article
            key={p.id}
            className={`relative flex flex-col rounded-3xl p-7 backdrop-blur transition-transform duration-300 hover:-translate-y-1 ${
              top
                ? "border-2 border-[#a3ff47] bg-[#0f2a1d]/90 shadow-[0_0_48px_-8px_rgba(163,255,71,0.55)]"
                : "border border-ink-signal/25 bg-ink-raised/70 hover:border-ink-signal/50"
            }`}
          >
            {top && (
              <span className="absolute -top-3.5 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[#a3ff47] px-3.5 py-1 text-[12.5px] font-bold whitespace-nowrap text-ink shadow-[0_0_18px_rgba(163,255,71,0.6)]">
                <Flame className="size-3.5" aria-hidden /> {t("Paling Banyak Dipilih", "Most Popular")}
              </span>
            )}
            <div className="flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-[#a3ff47]/40 bg-[#a3ff47]/10 text-[#a3ff47]">
                <Ikon className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <h3 className="text-[22px] leading-tight font-extrabold text-white">{p.nama}</h3>
                {p.deskripsi && <p className="text-[12.5px] text-ink-muted">{p.deskripsi}</p>}
              </div>
            </div>
            <p className="mt-6 flex flex-wrap items-baseline gap-x-1">
              <span className="text-[40px] leading-none font-extrabold tracking-tight text-white tabular-nums">{uang(p.harga, b, kurs)}</span>
              <span className="text-[14px] font-semibold text-ink-muted">/{hari(p.durasi_hari, b)}</span>
            </p>
            <ul className="mt-6 flex-1 space-y-3 text-[14.5px] text-ink-fg">
              {[
                t(`${angka(p.kuota_nomor, b)} nomor WhatsApp`, `${angka(p.kuota_nomor, b)} WhatsApp ${p.kuota_nomor === 1 ? "number" : "numbers"}`),
                t(`${angka(p.kuota_balasan, b)} balasan AI/${p.durasi_hari} hari`, `${angka(p.kuota_balasan, b)} AI replies/${p.durasi_hari} days`),
                t("Informasi Usaha & belajar dari balasanmu", "Business Info & learns from your replies"),
                t(`Histori percakapan ${UMUR_HISTORI_HARI} hari & statistik`, `${UMUR_HISTORI_HARI}-day chat history & stats`),
              ].map((x) => (
                <li key={x} className="flex gap-3">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[#a3ff47] text-ink">
                    <Check className="size-3.5" strokeWidth={3.2} aria-hidden />
                  </span>
                  {x}
                </li>
              ))}
            </ul>
            <Link
              href="/daftar"
              data-analitik={`Harga: aktif ${p.nama}`}
              className={`mt-8 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-bold transition ${
                top
                  ? "harga-kilau bg-[#a3ff47] text-ink shadow-[0_0_24px_-4px_rgba(163,255,71,0.7)] hover:brightness-105"
                  : "border-2 border-white/85 text-white hover:border-[#a3ff47] hover:bg-[#a3ff47] hover:text-ink"
              }`}
            >
              {t("Langsung Aktif Sekarang", "Activate Now")} <ArrowRight className="size-4" aria-hidden />
            </Link>
          </article>
        );
      })}
      {adaCustom && (
        <KartuCustom
          p={custom}
          varian="landing"
          b={b}
          kurs={kurs}
          className="md:col-span-2 xl:col-span-3"
          aksi={
            custom.aksi === "bayar" ? (
              <Link href="/daftar" className="inline-flex h-12 w-full items-center justify-center rounded-full border-2 border-white/85 font-bold text-white hover:bg-white hover:text-ink">
                {custom.tombol}
              </Link>
            ) : (
              <a href={tautanCustom(custom)} target="_blank" rel="noopener noreferrer" className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border-2 border-white/85 font-bold text-white hover:bg-white hover:text-ink">
                <MessageCircle className="size-4" aria-hidden /> {custom.tombol}
              </a>
            )
          }
        />
      )}
      {tanpaTrial && (
        <div className="relative overflow-hidden rounded-[28px] border-2 border-[#a3ff47] bg-[#0b2016] p-6 shadow-[0_0_56px_-10px_rgba(163,255,71,0.6)] sm:p-8 md:col-span-2 xl:col-span-3">
          <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-10 size-72 rounded-full bg-[#a3ff47]/15 blur-3xl" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center">
            <div className="flex items-center gap-5 lg:shrink-0">
              <ShieldCheck className="size-20 shrink-0 text-[#a3ff47] drop-shadow-[0_0_18px_rgba(163,255,71,0.65)] sm:size-24" strokeWidth={1.6} aria-hidden />
              <p className="leading-none font-extrabold text-white uppercase italic">
                <span className="block text-[22px] tracking-tight sm:text-[30px]">{t("Garansi uang kembali", "Money-back guarantee")}</span>
                <span className="mt-1 block text-[44px] tracking-tight text-[#a3ff47] sm:text-[60px]">{t(`${MASA_ID}`, `${MASA_EN}`)}</span>
              </p>
            </div>
            <div aria-hidden className="hidden h-24 w-px bg-white/25 lg:block" />
            <div className="text-[15px] leading-relaxed text-ink-fg sm:text-[16px]">
              <p className="font-semibold text-white">{t("Coba langsung, tanpa trial.", "Try it right away, no trial needed.")}</p>
              <p>
                {t(
                  `Jika dalam ${MASA_ID} pertama ChatGerCep tidak gercep atau tidak sesuai yang kami janjikan, `,
                  `If within the first ${MASA_EN} ChatGerCep isn't fast or isn't what we promised, `,
                )}
                <mark className="rounded-md bg-[#a3ff47] px-1.5 font-bold text-ink [box-decoration-break:clone]">{t("uang kamu kami kembalikan 100%.", "you get 100% of your money back.")}</mark>
              </p>
            </div>
          </div>
          <div className="relative mt-6 border-t border-white/15 pt-5">
            <p className="text-[13px] font-bold tracking-wide text-[#a3ff47] uppercase">{t("Syarat & ketentuan garansi", "Guarantee terms")}</p>
            <ol className="mt-3 grid gap-x-8 gap-y-2 text-[13px] text-ink-fg sm:grid-cols-2">
              {syaratJaminan(t).map((x, i) => (
                <li key={x} className="flex gap-2.5">
                  <span className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-[#a3ff47]/15 text-[11px] font-bold text-[#a3ff47] tabular-nums">{i + 1}</span>
                  {x}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
      <p className="text-center text-[13px] text-ink-muted md:col-span-2 xl:col-span-3">
        {gratis.balasan > 0 &&
          t(
            `Coba gratis dulu: setiap akun baru mendapat ${angka(gratis.balasan)} balasan AI ${gratis.ulang === "bulanan" ? "per bulan" : gratis.hari > 0 ? `percobaan selama ${gratis.hari} hari` : "percobaan"} tanpa kartu kredit. `,
            `Try it free first: every new account gets ${angka(gratis.balasan, b)} AI replies ${gratis.ulang === "bulanan" ? "every month" : gratis.hari > 0 ? `for a ${gratis.hari}-day trial` : "as a free trial"}, no credit card required. `,
          )}
        {midtrans && kanal.length > 0 && t(`Bayar lewat ${ringkasKanal(kanal)}.`, `Pay with ${ringkasKanal(kanal, "en")}.`)}
        {b === "en" && kurs ? ` Prices shown in USD; payment is charged in Indonesian rupiah (IDR).` : null}
      </p>
    </div>
  );
}

/**
 * Perbandingan gaji admin CS vs langganan ChatGerCep (setelah section Fitur). Paket dari database (sama dengan daftar
 * harga, satu query daftarPaket yang ringan); database tak terjangkau = bagian ini tidak tampil.
 */
export async function BandingLanding() {
  await connection();
  const { b } = await teksHalaman();
  let paket, kurs;
  try {
    [paket, kurs] = await Promise.all([daftarPaket(), b === "en" ? kursUsd() : Promise.resolve(undefined)]);
  } catch {
    return null;
  }
  const dijual = paket
    .filter((p) => p.harga > 0)
    .sort((x, y) => x.harga - y.harga)
    .map(({ id, nama, harga, durasi_hari, kuota_balasan }) => ({ id, nama, harga, durasi_hari, kuota_balasan }));
  if (!dijual.length) return null;
  return <BandingAdminLanding paket={dijual} kurs={kurs} />;
}

/** "Rp67 ribu" dari harga Rupiah (ribuan bulat), selain itu format uang biasa. */
function ringkasRp(harga: number, b: Bahasa, kurs?: number): string {
  if (b === "en") return uang(harga, b, kurs);
  return harga % 1000 === 0 ? `Rp${angka(harga / 1000)} ribu` : uang(harga, b);
}

/**
 * Harga paket termurah untuk kalimat hero ("mulai Rp67 ribu/30 hari"). Dialirkan di dalam Suspense dengan teks
 * cadangan, jadi hero tetap statis dan tidak menunggu database; gagal = teks cadangan tetap tampil.
 */
export async function HargaMulai({ cadangan }: { cadangan: string }) {
  await connection();
  const { b } = await teksHalaman();
  try {
    const [paket, kurs] = await Promise.all([daftarPaket(), b === "en" ? kursUsd() : Promise.resolve(undefined)]);
    const p = paket.filter((x) => x.harga > 0).sort((x, y) => x.harga - y.harga)[0];
    if (!p) return cadangan;
    return `${ringkasRp(p.harga, b, kurs)}/${hari(p.durasi_hari, b)}`;
  } catch {
    return cadangan;
  }
}
