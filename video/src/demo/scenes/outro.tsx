import { ArrowRight, Check, Share2, Smartphone } from "lucide-react";
import { AbsoluteFill } from "remotion";
import { E, pegas, tw, useT } from "../kit/anim";
import { Backdrop } from "../kit/stage";
import { Logo } from "../kit/ui";

/** Durasi scene (detik). */
export const DUR = 10;

const MANFAAT = [
  "Sambungkan WhatsApp dengan scan QR",
  "AI menjawab dari base knowledge usaha Anda",
  "Anda tetap bisa membalas sendiri kapan saja",
  "AI hanya membalas, tidak pernah mengirim pesan duluan",
  "Histori percakapan 30 hari & statistik",
  "Mulai gratis: 5 balasan AI percobaan 7 hari",
];

/** Penutup: rekap manfaat (centang berurutan), lalu logo + ajakan mendaftar. */
export function Outro() {
  const t = useT();
  const fase1 = tw(t, 0.2, 0.7) * (1 - tw(t, 5.0, 5.6, 0, 1, E.io));
  const fase2 = tw(t, 5.3, 6.2, 0, 1, E.out);
  const denyut = 0.5 + 0.5 * Math.sin(t * 3.2);
  const logo = pegas(t, 5.5, 14, 130);
  const cta = pegas(t, 6.3, 13, 150);
  const pil = tw(t, 7.0, 7.7, 0, 1, E.out);
  const aff = tw(t, 7.5, 8.2, 0, 1, E.out);

  return (
    <AbsoluteFill className="font-sans">
      <Backdrop />

      {fase1 > 0.001 && (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", display: "flex", flexDirection: "column", opacity: fase1, transform: `translateY(${(1 - fase1) * -16}px)` }}>
          <p className="text-[18px] font-bold tracking-[0.18em] text-ink-signal uppercase">Rekap</p>
          <h2 className="mt-3 text-center text-[58px] leading-[1.08] font-extrabold tracking-tight text-white">Dari daftar sampai AI membalas,<br />semuanya beres dalam hitungan menit.</h2>
          <ul className="mt-12 space-y-4">
            {MANFAAT.map((m, i) => {
              const a = pegas(t, 0.9 + i * 0.6, 15, 170);
              return (
                <li key={m} className="flex items-center gap-5 text-[31px] font-semibold text-ink-fg" style={{ opacity: Math.min(1, a * 1.5), transform: `translateX(${(1 - a) * -34}px)` }}>
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ink-signal text-ink" style={{ transform: `scale(${0.5 + a * 0.5})` }}>
                    <Check className="size-6" strokeWidth={3} />
                  </span>
                  {m}
                </li>
              );
            })}
          </ul>
        </AbsoluteFill>
      )}

      {fase2 > 0.001 && (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", display: "flex", flexDirection: "column", opacity: fase2 }}>
          <div style={{ opacity: logo, transform: `scale(${0.8 + logo * 0.2})` }}>
            <Logo ukuran="xl" gelap />
          </div>
          <div
            className="mt-14 inline-flex items-center gap-4 rounded-[28px] bg-ink-signal px-12 py-7 text-[40px] font-extrabold tracking-tight text-ink"
            style={{ opacity: Math.min(1, cta * 1.4), transform: `translateY(${(1 - cta) * 28}px) scale(${1 + denyut * 0.012})`, boxShadow: `0 28px 90px -16px rgba(61,220,151,${0.5 + denyut * 0.2})` }}
          >
            Mulai gratis di chatgercep.com <ArrowRight className="size-9" strokeWidth={2.6} />
          </div>
          <div className="mt-9 inline-flex items-center gap-3 rounded-full border border-ink-signal/40 bg-ink-signal/10 px-8 py-4 text-[26px] font-bold text-ink-signal" style={{ opacity: pil, transform: `translateY(${(1 - pil) * 14}px)` }}>
            <Smartphone className="size-6" /> Coba Tes WA: +62 895-3548-73838
          </div>
          <p className="mt-8 inline-flex items-center gap-2.5 text-[22px] font-medium text-ink-muted" style={{ opacity: aff }}>
            <Share2 className="size-5 text-ink-signal" /> Program Afiliasi: komisi dari setiap paket
          </p>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
}
