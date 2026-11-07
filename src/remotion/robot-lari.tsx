import { AbsoluteFill, Easing, Img, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

/**
 * Lapisan maskot robot lari di hero landing (diputar @remotion/player, latar transparan di atas hero HTML asli).
 * Sprite 4 pose (public/maskot/robot-lari.webp, 4 sel 326x280). Satu putaran 8 dtk, diulang:
 *   0–3,2 dtk lari biasa · LESAT (gelembung "Dibalas < 5 detik!", gelombang kejut) · lari · TURBO (getar, "GERCEP!").
 * Pemutar melompat ke LESAT saat diklik dan ke TURBO saat disorot (pemutar.tsx PemutarRobot).
 * Acak tapi deterministik (random(seed)): tiap putaran tampak sama, tanpa state.
 */

export const ROBOT_FPS = 30;
export const ROBOT_DURASI = 8 * ROBOT_FPS;
export const ROBOT_LEBAR = 760;
export const ROBOT_TINGGI = 400;
export const LESAT = 96;
export const TURBO = 168;
const TURBO_SELESAI = 228;
const LESAT_SELESAI = LESAT + 66;

const SEL_L = 326;
const SEL_T = 280;
const LIME = "#a3ff47";
const INK = "#0b1813";
const mendarat = Easing.bezier(0.16, 1, 0.3, 1);
const klem = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const SPRITE = staticFile("maskot/robot-lari.webp");

export type PropsRobot = { bahasa: "id" | "en" };

export function RobotLari({ bahasa }: PropsRobot) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const turbo = frame >= TURBO && frame < TURBO_SELESAI;
  const langkah = turbo ? 18 : 11; // pose per detik
  const pose = Math.floor((frame * langkah) / fps) % 4;
  const fase = (frame * langkah) / fps;
  const ayun = Math.abs(Math.sin((fase * Math.PI) / 2)) * 12;

  // Lesat ke depan lalu kembali; turbo: getar kecil yang mereda.
  const lesat = interpolate(frame, [LESAT, LESAT + 8, LESAT + 22, LESAT + 42], [0, 1, 1, 0], { ...klem, easing: mendarat });
  const kuat = turbo ? interpolate(frame, [TURBO, TURBO + 6, TURBO_SELESAI - 12, TURBO_SELESAI], [0, 1, 1, 0], klem) * 6 : 0;
  const gx = (random(`gx${frame}`) - 0.5) * kuat;
  const gy = (random(`gy${frame}`) - 0.5) * kuat;
  const x = 170 + lesat * 70 + gx;
  const y = 88 + gy;
  const skala = 1 + lesat * 0.1 + (turbo ? 0.04 : 0);
  const cahaya = turbo ? 26 : 12 + lesat * 16;

  const garis = Array.from({ length: turbo ? 9 : 6 }, (_, i) => {
    const siklus = turbo ? 9 : 16;
    const p = ((frame + i * 5) % siklus) / siklus;
    return { p, y: 12 + random(`y${i}`) * 72, pj: 90 + random(`l${i}`) * 110 };
  });
  const blok = Math.floor(frame / 11);
  const percik = Array.from({ length: 7 }, (_, i) => ({
    hidup: (frame + i * 7) % 11 < 3,
    x: random(`px${i}-${blok}`) * 260 - 30,
    y: random(`py${i}-${blok}`) * 230 + 10,
    r: random(`pr${i}`) * 50 - 25,
  }));

  const gelombang = interpolate(frame, [LESAT, LESAT + 26], [0, 1], { ...klem, easing: mendarat });
  const gel = spring({ frame: frame - (LESAT + 4), fps, config: { damping: 10, stiffness: 180 } });
  const gelKeluar = interpolate(frame, [LESAT_SELESAI - 8, LESAT_SELESAI], [1, 0], klem);
  const tulisan = spring({ frame: frame - TURBO, fps, config: { damping: 9, stiffness: 160 } });
  const tulisanKeluar = interpolate(frame, [TURBO_SELESAI - 10, TURBO_SELESAI], [1, 0], klem);

  return (
    <AbsoluteFill style={{ fontFamily: "inherit" }}>
      {/* gelombang kejut saat lesat */}
      {frame >= LESAT && frame < LESAT + 26 && (
        <div
          style={{
            position: "absolute",
            left: x + SEL_L * 0.55 - 160,
            top: y + SEL_T * 0.5 - 160,
            width: 320,
            height: 320,
            borderRadius: "50%",
            border: `4px solid ${LIME}`,
            opacity: 1 - gelombang,
            transform: `scale(${0.25 + gelombang})`,
          }}
        />
      )}
      {/* garis kecepatan */}
      {garis.map((g, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: x + 40 - g.p * 230 - g.pj,
            top: y + (g.y / 100) * SEL_T,
            width: g.pj,
            height: turbo ? 5 : 4,
            borderRadius: 99,
            opacity: Math.sin(g.p * Math.PI),
            background: `linear-gradient(to left, ${LIME}, rgba(61,220,151,0))`,
          }}
        />
      ))}
      {/* bayangan lantai */}
      <div
        style={{
          position: "absolute",
          left: x + SEL_L * 0.2,
          top: y + SEL_T - 18,
          width: SEL_L * 0.58,
          height: 26,
          borderRadius: "50%",
          transform: `scaleX(${1 - ayun / 60})`,
          background: "radial-gradient(closest-side, rgba(163,255,71,0.5), rgba(0,0,0,0.4) 55%, transparent)",
        }}
      />
      {/* tubuh: satu sel sprite */}
      <div
        style={{
          position: "absolute",
          left: x,
          top: y - ayun,
          width: SEL_L,
          height: SEL_T,
          overflow: "hidden",
          transform: `scale(${skala}) skewX(${-lesat * 8}deg)`,
          transformOrigin: "50% 100%",
          filter: `drop-shadow(0 0 ${cahaya}px rgba(163,255,71,0.7)) brightness(${turbo ? 1.15 : 1})`,
        }}
      >
        <Img src={SPRITE} style={{ width: SEL_L * 4, height: SEL_T, maxWidth: "none", transform: `translateX(${-pose * SEL_L}px)` }} />
      </div>
      {/* percikan kilat */}
      {percik.map(
        (p, i) =>
          p.hidup && (
            <svg key={i} viewBox="0 0 20 40" style={{ position: "absolute", left: x + p.x, top: y + p.y, width: 26, transform: `rotate(${p.r}deg)`, filter: `drop-shadow(0 0 6px ${LIME})` }}>
              <path d="M12 0 L2 22 H10 L6 40 L18 14 H10 Z" fill={LIME} />
            </svg>
          ),
      )}
      {/* gelembung saat lesat */}
      {frame >= LESAT + 4 && frame <= LESAT_SELESAI && (
        <div
          style={{
            position: "absolute",
            left: x + 120,
            top: y - 64,
            padding: "10px 22px",
            borderRadius: 999,
            background: LIME,
            color: INK,
            fontWeight: 800,
            fontSize: 30,
            whiteSpace: "nowrap",
            boxShadow: "0 0 40px rgba(163,255,71,0.7)",
            transform: `scale(${gel * gelKeluar}) translateY(${(1 - gel) * 12}px)`,
            transformOrigin: "bottom left",
          }}
        >
          {bahasa === "en" ? "Replied in < 5 sec!" : "Dibalas < 5 detik!"}
        </div>
      )}
      {/* GERCEP! saat turbo */}
      {turbo && (
        <div
          style={{
            position: "absolute",
            left: x - 60,
            top: -4,
            fontSize: 64,
            fontWeight: 900,
            fontStyle: "italic",
            letterSpacing: "-0.03em",
            color: LIME,
            textShadow: "0 0 28px rgba(163,255,71,0.85)",
            transform: `scale(${tulisan * tulisanKeluar}) rotate(-8deg)`,
            transformOrigin: "left center",
          }}
        >
          {bahasa === "en" ? "ZOOM!" : "GERCEP!"}
        </div>
      )}
    </AbsoluteFill>
  );
}
