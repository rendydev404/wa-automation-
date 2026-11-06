import { connection } from "next/server";
import { Check, Sparkles } from "lucide-react";
import Link from "@/components/link";
import type { Bahasa } from "@/lib/bahasa";
import { teksHalaman } from "@/lib/bahasa-halaman";
import { angka, uang, UMUR_HISTORI_HARI } from "@/lib/format";
import { ringkasKanal } from "@/lib/harga";
import { kursUsd } from "@/lib/kurs";
import { aturanPercobaan, daftarPaket } from "@/lib/langganan";
import { kanalAktif, konfigMidtrans } from "@/lib/midtrans";
import { customTampil, paketCustom, tautanCustom } from "@/lib/paket-custom";
import { KartuCustom, TombolWaCustom } from "../kartu-custom";
import { BandingAdminLanding } from "../banding-admin";


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
      konfigMidtrans(),
      b === "en" ? kursUsd() : Promise.resolve(undefined),
    ]);
  } catch {
    return null;
  }
  const dijual = paket.filter((p) => p.harga > 0);
  const adaCustom = customTampil(custom);
  if (!dijual.length && !adaCustom) return null;
  return (
    <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {dijual.map((p) => (
        <article key={p.id} className={`relative flex flex-col rounded-3xl border bg-surface p-7 shadow-card ${p.unggulan ? "border-accent ring-2 ring-accent" : "border-line"}`}>
          {p.unggulan && (
            <span className="absolute -top-3 left-7 inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-[11.5px] font-bold text-on-accent">
              <Sparkles className="size-3" aria-hidden /> {t("Paling banyak dipilih", "Most popular")}
            </span>
          )}
          <h3 className="text-xl font-bold">{p.nama}</h3>
          {p.deskripsi && <p className="mt-1 text-[14px] text-muted">{p.deskripsi}</p>}
          <p className="mt-5 text-4xl font-extrabold tracking-tight tabular-nums">
            {uang(p.harga, b, kurs)}
            <span className="text-[14px] font-semibold text-muted"> / {hari(p.durasi_hari, b)}</span>
          </p>
          <ul className="mt-5 flex-1 space-y-2.5 text-[14px]">
            {[
              t(`${angka(p.kuota_nomor, b)} nomor WhatsApp`, `${angka(p.kuota_nomor, b)} WhatsApp ${p.kuota_nomor === 1 ? "number" : "numbers"}`),
              t(`${angka(p.kuota_balasan, b)} balasan AI`, `${angka(p.kuota_balasan, b)} AI replies`),
              t("Base knowledge & belajar dari balasanmu", "Product knowledge & learns from your replies"),
              t(`Histori percakapan ${UMUR_HISTORI_HARI} hari & statistik`, `${UMUR_HISTORI_HARI}-day chat history & stats`),
            ].map((x) => (
              <li key={x} className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden /> {x}
              </li>
            ))}
          </ul>
          <Link href="/daftar" className={`mt-6 ${p.unggulan ? "btn btn-primary" : "btn btn-ghost border border-line"} w-full justify-center`}>
            {t("Mulai sekarang", "Get started")}
          </Link>
        </article>
      ))}
      {adaCustom && (
        <KartuCustom
          p={custom}
          varian="landing"
          b={b}
          kurs={kurs}
          aksi={
            custom.aksi === "bayar" ? (
              <Link href="/daftar" className="btn btn-ghost w-full justify-center border border-line">
                {custom.tombol}
              </Link>
            ) : (
              <TombolWaCustom href={tautanCustom(custom)} label={custom.tombol} />
            )
          }
        />
      )}
      <p className="text-[13px] text-muted md:col-span-2 xl:col-span-3">
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
