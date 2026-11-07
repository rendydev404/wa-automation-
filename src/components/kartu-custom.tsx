import type { ReactNode } from "react";
import { Check, MessageCircle } from "lucide-react";
import { type Bahasa, pembuatT } from "@/lib/bahasa";
import { angka, uang } from "@/lib/format";
import { type PaketCustom, hargaAngka } from "@/lib/paket-custom-def";
import { LencanaPaket } from "./lencana-paket";

/**
 * Kartu paket "Custom" di samping paket biasa (landing, Langganan, dan pratinjau di panel admin). Harga berupa angka
 * atau teks bebas, kuota boleh ditampilkan; tombolnya (`aksi`) disusun halaman: chat WhatsApp ke admin atau bayar.
 * `b` (bawaan "id") memilih bahasa teks; `kurs` (Rp per 1 USD) membuat harga tampil dalam USD untuk "en".
 * Varian landing: kartu lebar (satu baris penuh di bawah paket biasa) dengan aksen ungu senada lencana Custom; di layar
 * lebar isinya mendatar (judul & harga | poin | tombol), di HP menurun.
 */
export function KartuCustom({
  p,
  varian,
  aksi,
  b = "id",
  kurs,
  className = "",
}: {
  p: PaketCustom;
  varian: "landing" | "app";
  aksi: ReactNode;
  b?: Bahasa;
  kurs?: number;
  className?: string;
}) {
  const t = pembuatT(b);
  const poin = [
    ...(p.tampil_kuota
      ? [t(`${angka(p.kuota_nomor, b)} nomor WhatsApp`, `${angka(p.kuota_nomor, b)} WhatsApp ${p.kuota_nomor === 1 ? "number" : "numbers"}`), t(`${angka(p.kuota_balasan, b)} balasan AI`, `${angka(p.kuota_balasan, b)} AI replies`)]
      : []),
    ...p.fitur,
  ];
  const sebulan = hargaAngka(p) && p.durasi_hari >= 60 ? Math.round((p.harga * 30) / p.durasi_hari) : null;

  if (varian === "landing")
    return (
      <article
        className={`relative grid gap-6 overflow-hidden rounded-3xl border border-[#c084fc]/35 bg-gradient-to-br from-ink-raised/80 via-ink-raised/80 to-[#2a1446]/80 p-7 text-ink-fg backdrop-blur lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_15rem] lg:items-center lg:gap-8 ${className}`}
      >
        <div aria-hidden className="pointer-events-none absolute -right-16 -bottom-20 size-64 rounded-full bg-[#a855f7]/20 blur-3xl" />
        <div className="relative">
          <LencanaPaket tingkat="custom" nama={p.nama} ukuran="lg" />
          {p.deskripsi && <p className="mt-3 text-[14px] text-ink-muted">{p.deskripsi}</p>}
          {hargaAngka(p) ? (
            <p className="mt-4 flex flex-wrap items-baseline gap-x-1.5">
              <span className="text-[36px] leading-none font-extrabold tracking-tight text-white tabular-nums">{uang(p.harga, b, kurs)}</span>
              <span className="text-[14px] font-semibold text-ink-muted">/ {t(`${p.durasi_hari} hari`, `${p.durasi_hari} ${p.durasi_hari === 1 ? "day" : "days"}`)}</span>
            </p>
          ) : (
            <p className="mt-4 bg-gradient-to-r from-[#c084fc] to-[#f472b6] bg-clip-text text-[36px] leading-tight font-extrabold tracking-tight text-transparent">{p.teks_harga}</p>
          )}
          {sebulan !== null && <p className="mt-1 text-[12.5px] text-ink-muted tabular-nums">{t(`Setara ${uang(sebulan, b, kurs)} per 30 hari`, `Works out to ${uang(sebulan, b, kurs)} per 30 days`)}</p>}
        </div>
        <ul className="relative grid gap-x-6 gap-y-2.5 text-[14px] sm:grid-cols-2">
          {poin.map((x, i) => (
            <li key={`${i}-${x}`} className="flex gap-2.5">
              <span className="mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full bg-[#c084fc] text-ink">
                <Check className="size-3" strokeWidth={3} aria-hidden />
              </span>
              {x}
            </li>
          ))}
        </ul>
        <div className="relative">{aksi}</div>
      </article>
    );

  return (
    <article className={`card relative flex flex-col border-dashed p-6 ${className}`}>
      <h3 className="text-lg font-bold">{p.nama}</h3>
      {p.deskripsi && <p className="mt-1 text-[13px] text-muted">{p.deskripsi}</p>}
      {hargaAngka(p) ? (
        <p className="mt-4 text-3xl font-extrabold tracking-tight tabular-nums">
          {uang(p.harga, b, kurs)}
          <span className="text-[13px] font-semibold text-muted"> / {t(`${p.durasi_hari} hari`, `${p.durasi_hari} ${p.durasi_hari === 1 ? "day" : "days"}`)}</span>
        </p>
      ) : (
        <p className="mt-4 text-3xl font-extrabold tracking-tight">{p.teks_harga}</p>
      )}
      {sebulan !== null && <p className="mt-1 text-[12.5px] text-muted tabular-nums">{t(`Setara ${uang(sebulan, b, kurs)} per 30 hari`, `Works out to ${uang(sebulan, b, kurs)} per 30 days`)}</p>}
      <ul className="mt-4 flex-1 space-y-2 text-[13.5px]">
        {poin.map((x, i) => (
          <li key={`${i}-${x}`} className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden /> {x}
          </li>
        ))}
      </ul>
      <div className="mt-5">{aksi}</div>
    </article>
  );
}

/** Tombol kartu Custom yang membuka chat WhatsApp ke admin. */
export function TombolWaCustom({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="btn btn-ghost w-full justify-center border border-line">
      <MessageCircle className="size-4" aria-hidden /> {label}
    </a>
  );
}
