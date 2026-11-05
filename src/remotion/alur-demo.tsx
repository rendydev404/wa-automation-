import { AbsoluteFill, Easing, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { type Bahasa, LOKAL, type T, pembuatT } from "../lib/bahasa";
import { W } from "./chat-demo";

/**
 * Komposisi Remotion "cara kerja": tiga babak (sambungkan → beri pengetahuan → AI membalas), 120 frame per babak.
 * Bahasa teks layar datang dari input prop `bahasa` (bawaan "id").
 */

export interface PropsAlurDemo {
  bahasa?: Bahasa;
  [k: string]: unknown;
}

export const ALUR_FPS = 30;
export const PANJANG_BABAK = 120;
export const ALUR_DURASI = PANJANG_BABAK * 3;

const huruf = "var(--font-plus-jakarta), 'Plus Jakarta Sans', system-ui, sans-serif";

/** Pola QR semu yang tetap sama di setiap frame (bukan acak per render). */
const QR = Array.from({ length: 21 * 21 }, (_, i) => {
  const x = i % 21;
  const y = Math.floor(i / 21);
  // Tiga penanda sudut QR: cincin 7×7 dengan inti 3×3.
  for (const [a, b] of [[0, 0], [14, 0], [0, 14]]) {
    const lx = x - a;
    const ly = y - b;
    if (lx >= 0 && lx < 7 && ly >= 0 && ly < 7) return lx === 0 || lx === 6 || ly === 0 || ly === 6 || (lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4);
    if (lx >= -1 && lx <= 7 && ly >= -1 && ly <= 7) return false; // celah putih di sekeliling penanda
  }
  return (x * 7 + y * 13 + x * y * 3) % 5 < 2;
});

function Judul({ no, teks, sub, t }: { no: number; teks: string; sub: string; t: T }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const m = spring({ frame, fps, config: { damping: 18 } });
  return (
    <div style={{ position: "absolute", left: 70, top: 64, opacity: m, transform: `translateX(${(1 - m) * -30}px)` }}>
      <div style={{ color: W.signal, fontSize: 22, fontWeight: 800, letterSpacing: 3 }}>{t("LANGKAH", "STEP")} {no}</div>
      <div style={{ color: W.fg, fontSize: 50, fontWeight: 800, marginTop: 8, letterSpacing: -1 }}>{teks}</div>
      <div style={{ color: W.muted, fontSize: 24, marginTop: 8 }}>{sub}</div>
    </div>
  );
}

function BabakQr({ t }: { t: T }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pindai = interpolate(frame, [20, 75], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  const ok = spring({ frame: frame - 78, fps, config: { damping: 11 } });
  return (
    <AbsoluteFill>
      <Judul no={1} t={t} teks={t("Scan QR, tersambung", "Scan the QR, you're in")} sub={t("Seperti WhatsApp Web. Tanpa aplikasi tambahan.", "Just like WhatsApp Web. No extra app needed.")} />
      <div style={{ position: "absolute", left: 470, top: 250, width: 300, height: 300, padding: 18, borderRadius: 28, background: "#fff" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(21, 1fr)", width: "100%", height: "100%", opacity: 1 - ok * 0.85 }}>
          {QR.map((isi, i) => {
            const muncul = interpolate(frame, [i * 0.03, i * 0.03 + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            return <span key={i} style={{ background: isi ? W.ink : "transparent", opacity: muncul, borderRadius: 1.5 }} />;
          })}
        </div>
        <div style={{ position: "absolute", left: 10, right: 10, top: 18 + pindai * 264, height: 4, borderRadius: 4, background: W.signal, boxShadow: `0 0 24px 6px ${W.signal}`, opacity: pindai > 0 && pindai < 1 ? 1 : 0 }} />
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", opacity: ok, transform: `scale(${0.4 + ok * 0.6})` }}>
          <div style={{ width: 130, height: 130, borderRadius: 130, background: W.signal, display: "grid", placeItems: "center", fontSize: 72, color: W.ink, fontWeight: 900 }}>✓</div>
        </div>
      </div>
      <div style={{ position: "absolute", left: 470, width: 300, top: 580, textAlign: "center", color: W.signal, fontSize: 26, fontWeight: 800, opacity: ok }}>{t("Terhubung", "Connected")}</div>
    </AbsoluteFill>
  );
}

const dokumen = (t: T) => [t("Menu & harga.pdf", "Menu & prices.pdf"), t("Jam buka.txt", "Opening hours.txt"), t("FAQ pelanggan.md", "Customer FAQ.md"), t("Cara bayar.pdf", "Payment options.pdf")];

function BabakKnowledge({ t, b }: { t: T; b: Bahasa }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const karakter = Math.round(interpolate(frame, [20, 100], [0, 48210], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }));
  const denyut = 1 + Math.sin(frame / 6) * 0.04;
  return (
    <AbsoluteFill>
      <Judul no={2} t={t} teks={t("Beri pengetahuan", "Add your knowledge")} sub={t("Unggah PDF atau tulis teks. AI hanya menjawab dari sini.", "Upload PDFs or type it in. The AI answers only from this.")} />
      {dokumen(t).map((d, i) => {
        const m = spring({ frame: frame - 8 - i * 14, fps, config: { damping: 15 } });
        const terbang = interpolate(frame, [52 + i * 10, 80 + i * 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic) });
        const x = 90 + (i % 2) * 290;
        const y = 270 + Math.floor(i / 2) * 120;
        return (
          <div
            key={d}
            style={{
              position: "absolute",
              left: x + terbang * (860 - x),
              top: y + terbang * (390 - y),
              opacity: m * (1 - terbang),
              transform: `scale(${(0.8 + m * 0.2) * (1 - terbang * 0.7)})`,
              padding: "18px 22px",
              borderRadius: 18,
              background: W.inkRaised,
              border: "1px solid rgba(232,240,236,0.12)",
              color: W.fg,
              fontSize: 22,
              fontWeight: 700,
              display: "flex",
              gap: 12,
              alignItems: "center",
            }}
          >
            <span style={{ width: 30, height: 38, borderRadius: 6, background: i % 2 ? "#6c8fd6" : W.signal }} /> {d}
          </div>
        );
      })}
      <div style={{ position: "absolute", left: 790, top: 300, width: 260, height: 260, borderRadius: 260, background: `radial-gradient(circle at 40% 35%, ${W.signal}, #0f7a5c 70%)`, transform: `scale(${denyut})`, boxShadow: `0 0 80px 10px rgba(61,220,151,0.35)`, display: "grid", placeItems: "center", color: W.ink, fontSize: 40, fontWeight: 900 }}>
        AI
      </div>
      <div style={{ position: "absolute", left: 740, width: 360, top: 600, textAlign: "center", color: W.fg, fontSize: 26, fontWeight: 700 }}>
        <span style={{ color: W.signal, fontVariantNumeric: "tabular-nums" }}>{karakter.toLocaleString(LOKAL[b])}</span> {t("karakter dipelajari", "characters learned")}
      </div>
    </AbsoluteFill>
  );
}

function BabakBalas({ t, b }: { t: T; b: Bahasa }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dibalas = Math.round(interpolate(frame, [10, 105], [0, 1284], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.quad) }));
  const batang = [42, 58, 51, 74, 66, 88, 97];
  return (
    <AbsoluteFill>
      <Judul no={3} t={t} teks={t("AI membalas 24/7", "AI replies 24/7")} sub={t("Anda membalas sendiri? AI otomatis diam di chat itu.", "Reply yourself and the AI steps back in that chat.")} />
      <div style={{ position: "absolute", left: 90, top: 290, color: W.muted, fontSize: 24, fontWeight: 600 }}>{t("Pesan dibalas minggu ini", "Messages answered this week")}</div>
      <div style={{ position: "absolute", left: 86, top: 324, color: W.fg, fontSize: 120, fontWeight: 900, letterSpacing: -4, fontVariantNumeric: "tabular-nums" }}>{dibalas.toLocaleString(LOKAL[b])}</div>
      <div style={{ position: "absolute", left: 90, top: 486, color: W.signal, fontSize: 26, fontWeight: 700 }}>{t("▲ 98% pesan terjawab otomatis", "▲ 98% answered automatically")}</div>
      <div style={{ position: "absolute", left: 640, right: 90, top: 280, height: 330, display: "flex", alignItems: "flex-end", gap: 22 }}>
        {batang.map((t, i) => {
          const m = spring({ frame: frame - 10 - i * 7, fps, config: { damping: 14 } });
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <div style={{ width: "100%", height: `${t * 3 * m}px`, borderRadius: 12, background: i === batang.length - 1 ? W.signal : "rgba(61,220,151,0.35)" }} />
              <span style={{ color: W.muted, fontSize: 18 }}>{(b === "en" ? ["M", "T", "W", "T", "F", "S", "S"] : ["S", "S", "R", "K", "J", "S", "M"])[i]}</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

export function AlurDemo({ bahasa = "id" }: PropsAlurDemo) {
  const t = pembuatT(bahasa);
  const frame = useCurrentFrame();
  // Garis kemajuan per babak di bawah.
  return (
    <AbsoluteFill style={{ background: W.ink, fontFamily: huruf, overflow: "hidden" }}>
      <div style={{ position: "absolute", width: 700, height: 700, borderRadius: 700, left: -200, top: -300, background: "rgba(61,220,151,0.12)", filter: "blur(60px)" }} />
      <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(232,240,236,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(232,240,236,0.05) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
      <Sequence durationInFrames={PANJANG_BABAK} premountFor={10}>
        <BabakQr t={t} />
      </Sequence>
      <Sequence from={PANJANG_BABAK} durationInFrames={PANJANG_BABAK} premountFor={10}>
        <BabakKnowledge t={t} b={bahasa} />
      </Sequence>
      <Sequence from={PANJANG_BABAK * 2} durationInFrames={PANJANG_BABAK} premountFor={10}>
        <BabakBalas t={t} b={bahasa} />
      </Sequence>
      <div style={{ position: "absolute", left: 70, right: 70, bottom: 44, display: "flex", gap: 14 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ flex: 1, height: 6, borderRadius: 6, background: "rgba(232,240,236,0.12)", overflow: "hidden" }}>
            <div style={{ height: "100%", background: W.signal, width: `${interpolate(frame, [i * PANJANG_BABAK, (i + 1) * PANJANG_BABAK], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}%` }} />
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
}
