import { AbsoluteFill } from "remotion";
import { E, pegas, tw, useT } from "../kit/anim";
import { Backdrop } from "../kit/stage";
import { Logo } from "../kit/ui";

const LANGKAH = ["Daftar", "Sambungkan WhatsApp", "Isi knowledge", "AI membalas", "Langganan", "Afiliasi"];

/** Pembuka: logo, janji produk, dan peta perjalanan demo. */
export function Intro() {
  const t = useT();
  const m = pegas(t, 0.25, 15, 120);
  const j = tw(t, 1.0, 1.9, 0, 1, E.out);
  const s = tw(t, 1.9, 2.7, 0, 1, E.out);
  return (
    <AbsoluteFill className="font-sans">
      <Backdrop />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", display: "flex" }}>
        <div style={{ opacity: m, transform: `scale(${0.7 + 0.3 * m})` }}>
          <Logo ukuran="xl" gelap />
        </div>
        <h1 className="mt-14 text-center text-[78px] leading-[1.05] font-extrabold tracking-tight text-white" style={{ opacity: j, transform: `translateY(${(1 - j) * 26}px)` }}>
          Pelanggan dibalas
          <br />
          <span className="bg-gradient-to-r from-ink-signal to-[#a7f3d0] bg-clip-text text-transparent">dalam hitungan detik.</span>
        </h1>
        <p className="mt-7 text-[30px] font-medium text-ink-muted" style={{ opacity: s, transform: `translateY(${(1 - s) * 18}px)` }}>
          Demo lengkap dari sisi pengguna: dari daftar sampai AI membalas WhatsApp pelanggan
        </p>
        <div className="mt-12 flex items-center gap-3">
          {LANGKAH.map((l, i) => {
            const a = tw(t, 3.0 + i * 0.28, 3.5 + i * 0.28, 0, 1, E.out);
            return (
              <div key={l} className="flex items-center gap-3" style={{ opacity: a, transform: `translateY(${(1 - a) * 14}px)` }}>
                <span className="inline-flex items-center gap-2.5 rounded-full border border-ink-line bg-white/[0.05] px-4 py-2.5 text-[19px] font-semibold text-ink-fg">
                  <span className="grid size-6 place-items-center rounded-full bg-ink-signal text-[13px] font-bold text-ink">{i + 1}</span>
                  {l}
                </span>
                {i < LANGKAH.length - 1 && <span className="text-ink-muted">→</span>}
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
