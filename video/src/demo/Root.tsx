import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/montserrat/700.css";
import "./index.css";
import { type ReactNode, useEffect, useState } from "react";
import { AbsoluteFill, Composition, Sequence, useCurrentFrame, useDelayRender } from "remotion";
import { CH, CW, FPS, MEREK_URL } from "./config";
import { tw } from "./kit/anim";
import { KonteksWaktu, waktuAsli } from "./kit/timemap";
import { Logo } from "./kit/ui";
import { SCENES, type SceneDef, TOTAL_DETIK, mulaiScene } from "./scenes";

/** Tunggu font produk (Plus Jakarta Sans + Montserrat untuk logo) siap sebelum frame mana pun dirender. */
function FontGate({ children }: { children: ReactNode }) {
  const { delayRender, continueRender } = useDelayRender();
  const [siap, setSiap] = useState(false);
  const [h] = useState(() => delayRender("font produk"));
  useEffect(() => {
    const muat = ["400", "500", "600", "700"].map((w) => document.fonts.load(`${w} 16px "Plus Jakarta Sans"`)).concat(document.fonts.load('700 16px "Montserrat"'));
    Promise.all(muat).then(() => {
      setSiap(true);
      continueRender(h);
    });
  }, [h, continueRender]);
  return siap ? <>{children}</> : null;
}

/** Fade masuk/keluar di tepi scene, dip singkat di tiap potongan lompat, dan lencana saat dipercepat. */
function Pudar({ s, children }: { s: SceneDef; children: ReactNode }) {
  const tv = useCurrentFrame() / FPS;
  const w = waktuAsli(s.peta, tv);
  const tepi = Math.min(tw(tv, 0, 0.4), 1 - tw(tv, s.dur - 0.4, s.dur));
  const dip = s.peta.potongan.reduce((a, tc) => Math.max(a, 1 - Math.min(1, Math.abs(tv - tc) / 0.1)), 0);
  const cepat = s.chip && w.v >= 1.9;
  const label = Number.isInteger(w.v) ? `${w.v}` : w.v.toFixed(1).replace(/\.0$/, "");
  return (
    <AbsoluteFill style={{ opacity: tepi * (1 - dip * 0.92) }}>
      {children}
      {cepat && (
        <div className="font-sans" style={{ position: "absolute", top: 52, right: 56, display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", borderRadius: 14, background: "rgba(8,20,15,0.92)", border: "1px solid rgba(61,220,151,0.5)", color: "#3ddc97", fontSize: 24, fontWeight: 800, letterSpacing: 0.5 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="#3ddc97"><path d="M3 5l8 7-8 7zM12 5l8 7-8 7z" /></svg>
          {label}x
        </div>
      )}
    </AbsoluteFill>
  );
}

function Demo() {
  return (
    <FontGate>
      <AbsoluteFill style={{ background: "#06100c" }}>
        {SCENES.map((s, i) => (
          <Sequence key={s.id} from={Math.round(mulaiScene(i) * FPS)} durationInFrames={Math.round(s.dur * FPS)} name={s.id}>
            <KonteksWaktu value={s.peta}>
              <Pudar s={s}>
                <s.Comp />
              </Pudar>
            </KonteksWaktu>
          </Sequence>
        ))}
      </AbsoluteFill>
    </FontGate>
  );
}

function SatuScene({ i }: { i: number }) {
  const s = SCENES[i];
  return (
    <FontGate>
      <KonteksWaktu value={s.peta}>
        <Pudar s={s}>
          <s.Comp />
        </Pudar>
      </KonteksWaktu>
    </FontGate>
  );
}

/**
 * Versi 9:16 untuk Reels/TikTok/Status: komposisi Demo 16:9 dirender langsung (bukan dari mp4) lalu diskalakan utuh
 * selebar layar di tengah, jadi teks UI tetap tajam. Ruang kosong atas-bawah diisi logo dan alamat situs.
 */
const VW = 1080;
const VH = 1920;
function DemoVertikal() {
  const skala = VW / CW;
  const tinggiVideo = CH * skala;
  return (
    <FontGate>
      <AbsoluteFill style={{ background: "radial-gradient(120% 60% at 50% 50%, #0c2a1e 0%, #06100c 70%)" }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: (VH - tinggiVideo) / 2, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Logo ukuran="xl" gelap />
        </div>
        <div style={{ position: "absolute", left: 0, top: (VH - tinggiVideo) / 2, width: VW, height: tinggiVideo, overflow: "hidden", boxShadow: "0 30px 90px rgba(0,0,0,0.55)" }}>
          <div style={{ position: "absolute", left: 0, top: 0, width: CW, height: CH, transform: `scale(${skala})`, transformOrigin: "0 0" }}>
            <Demo />
          </div>
        </div>
        <div className="font-sans text-ink-fg" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: (VH - tinggiVideo) / 2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44, fontWeight: 600, letterSpacing: 1, opacity: 0.75 }}>
          {MEREK_URL}
        </div>
      </AbsoluteFill>
    </FontGate>
  );
}

export function DemoRoot() {
  return (
    <>
      <Composition id="Demo" component={Demo} durationInFrames={Math.round(TOTAL_DETIK * FPS)} fps={FPS} width={CW} height={CH} />
      <Composition id="DemoVertikal" component={DemoVertikal} durationInFrames={Math.round(TOTAL_DETIK * FPS)} fps={FPS} width={VW} height={VH} />
      {SCENES.map((s, i) => (
        <Composition key={s.id} id={`S-${s.id}`} component={SatuScene} defaultProps={{ i }} durationInFrames={Math.round(s.dur * FPS)} fps={FPS} width={CW} height={CH} />
      ))}
    </>
  );
}
