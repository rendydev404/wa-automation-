import type { ReactNode } from "react";
import { Check, MessageCircle } from "lucide-react";
import { type Bahasa, pembuatT } from "@/lib/bahasa";
import { angka, uang } from "@/lib/format";
import { type PaketCustom, hargaAngka } from "@/lib/paket-custom-def";

/**
 * Kartu paket "Custom" di samping paket biasa (landing, Langganan, dan pratinjau di panel admin). Harga berupa angka
 * atau teks bebas, kuota boleh ditampilkan; tombolnya (`aksi`) disusun halaman: chat WhatsApp ke admin atau bayar.
 * `b` (bawaan "id") memilih bahasa teks; `kurs` (Rp per 1 USD) membuat harga tampil dalam USD untuk "en".
 */
export function KartuCustom({ p, varian, aksi, b = "id", kurs }: { p: PaketCustom; varian: "landing" | "app"; aksi: ReactNode; b?: Bahasa; kurs?: number }) {
  const t = pembuatT(b);
  const landing = varian === "landing";
  const poin = [
    ...(p.tampil_kuota
      ? [t(`${angka(p.kuota_nomor, b)} nomor WhatsApp`, `${angka(p.kuota_nomor, b)} WhatsApp ${p.kuota_nomor === 1 ? "number" : "numbers"}`), t(`${angka(p.kuota_balasan, b)} balasan AI`, `${angka(p.kuota_balasan, b)} AI replies`)]
      : []),
    ...p.fitur,
  ];
  const sebulan = hargaAngka(p) && p.durasi_hari >= 60 ? Math.round((p.harga * 30) / p.durasi_hari) : null;
  return (
    <article className={landing ? "relative flex flex-col rounded-3xl border border-dashed border-line-strong bg-surface p-7 shadow-card" : "card relative flex flex-col border-dashed p-6"}>
      <h3 className={landing ? "text-xl font-bold" : "text-lg font-bold"}>{p.nama}</h3>
      {p.deskripsi && <p className={`mt-1 text-muted ${landing ? "text-[14px]" : "text-[13px]"}`}>{p.deskripsi}</p>}
      {hargaAngka(p) ? (
        <p className={`font-extrabold tracking-tight tabular-nums ${landing ? "mt-5 text-4xl" : "mt-4 text-3xl"}`}>
          {uang(p.harga, b, kurs)}
          <span className={`font-semibold text-muted ${landing ? "text-[14px]" : "text-[13px]"}`}> / {t(`${p.durasi_hari} hari`, `${p.durasi_hari} ${p.durasi_hari === 1 ? "day" : "days"}`)}</span>
        </p>
      ) : (
        <p className={`font-extrabold tracking-tight ${landing ? "mt-5 text-4xl" : "mt-4 text-3xl"}`}>{p.teks_harga}</p>
      )}
      {sebulan !== null && <p className="mt-1 text-[12.5px] text-muted tabular-nums">{t(`Setara ${uang(sebulan, b, kurs)} per 30 hari`, `Works out to ${uang(sebulan, b, kurs)} per 30 days`)}</p>}
      <ul className={`flex-1 ${landing ? "mt-5 space-y-2.5 text-[14px]" : "mt-4 space-y-2 text-[13.5px]"}`}>
        {poin.map((x, i) => (
          <li key={`${i}-${x}`} className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden /> {x}
          </li>
        ))}
      </ul>
      <div className={landing ? "mt-6" : "mt-5"}>{aksi}</div>
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
