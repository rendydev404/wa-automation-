import type { ReactNode } from "react";
import { Avatar, C, Logo, TitikLive } from "./dasar";

/** iPhone 12 (71,5 x 146,7 mm). Ketebalan dibuat dari lapisan bingkai yang ditumpuk di sumbu Z. */
export const HP = { lebar: 560, tinggi: 1149, sudut: 86, bezel: 18, sudutLayar: 66 };
const TEBAL = 14;

export function Ponsel({ children }: { children: ReactNode }) {
  return (
    <div style={{ position: "relative", width: HP.lebar, height: HP.tinggi, transformStyle: "preserve-3d" }}>
      {Array.from({ length: TEBAL }, (_, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: HP.sudut,
            transform: `translateZ(${-i * 2.2}px)`,
            background: i === TEBAL - 1 ? "#0d1014" : `linear-gradient(135deg, #59616b, #22272d 35%, #3c434b 70%, #1a1d21)`,
          }}
        />
      ))}
      {/* Tombol samping */}
      {[
        { kiri: true, atas: 150, tinggi: 38 },
        { kiri: true, atas: 228, tinggi: 76 },
        { kiri: true, atas: 322, tinggi: 76 },
        { kiri: false, atas: 240, tinggi: 118 },
      ].map((b, i) => (
        <div key={i} style={{ position: "absolute", top: b.atas, [b.kiri ? "left" : "right"]: -5, width: 7, height: b.tinggi, borderRadius: 4, background: "linear-gradient(90deg,#4a525b,#262b31)", transform: "translateZ(-12px)" }} />
      ))}
      {/* Muka: bezel hitam + layar */}
      <div style={{ position: "absolute", inset: 6, borderRadius: HP.sudut - 6, background: "#000", padding: HP.bezel - 6, transform: "translateZ(1px)" }}>
        <div style={{ position: "relative", height: "100%", borderRadius: HP.sudutLayar, overflow: "hidden" }}>
          {children}
          {/* Takik */}
          <div style={{ position: "absolute", top: 0, left: "50%", width: 272, height: 42, marginLeft: -136, background: "#000", borderRadius: "0 0 24px 24px" }}>
            <span style={{ position: "absolute", top: 13, left: "50%", width: 64, height: 8, marginLeft: -32, borderRadius: 4, background: "#1c1c1e" }} />
            <span style={{ position: "absolute", top: 10, left: "50%", marginLeft: 50, width: 16, height: 16, borderRadius: 16, background: "radial-gradient(circle at 40% 38%, #3a4a6b 0 18%, #0d1117 50%)" }} />
          </div>
          {/* Kilau kaca */}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(115deg, rgba(255,255,255,0.10) 0%, transparent 28%, transparent 70%, rgba(255,255,255,0.04) 100%)", pointerEvents: "none" }} />
        </div>
      </div>
    </div>
  );
}

/** Wallpaper gelap bergelombang hijau-biru (nuansa produk). */
function Wallpaper() {
  return (
    <div style={{ position: "absolute", inset: 0, background: "#04140f" }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(90% 60% at 20% 85%, #0f7a5c 0%, transparent 60%), radial-gradient(80% 55% at 95% 20%, #1d3fb8 0%, transparent 60%), radial-gradient(60% 40% at 60% 55%, #0c4a3a 0%, transparent 70%)" }} />
      <svg viewBox="0 0 100 200" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.55 }}>
        <path d="M-10 120 C 20 95, 45 140, 110 105 L110 210 L-10 210 Z" fill="#0b5c46" />
        <path d="M-10 150 C 30 125, 60 165, 110 135 L110 210 L-10 210 Z" fill="#0a3f33" />
      </svg>
    </div>
  );
}

function BilahStatus({ gelap = false }: { gelap?: boolean }) {
  const w = gelap ? "#000" : "#fff";
  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 34px 0 48px", color: w, fontSize: 21, fontWeight: 600, zIndex: 2 }}>
      <span>09.41</span>
      <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <svg width="22" height="14" viewBox="0 0 34 22">{[0, 1, 2, 3].map((k) => <rect key={k} x={k * 9} y={16 - k * 5} width="6.5" height={6 + k * 5} rx="1.6" fill={w} />)}</svg>
        <svg width="30" height="14" viewBox="0 0 50 23"><rect x="1" y="1" width="42" height="21" rx="6.5" fill="none" stroke={w} strokeOpacity="0.5" strokeWidth="2" /><rect x="4" y="4" width="32" height="15" rx="4" fill={w} /></svg>
      </span>
    </div>
  );
}

/** Layar kunci: jam besar + notifikasi chat pelanggan (muncul saat `notif` 0..1). */
export function LayarKunci({ notif }: { notif: number }) {
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Wallpaper />
      <BilahStatus />
      <div style={{ position: "absolute", top: 120, width: "100%", textAlign: "center", color: "#fff" }}>
        <div style={{ fontSize: 26, fontWeight: 600, opacity: 0.85 }}>Kamis, 30 Oktober</div>
        <div style={{ fontSize: 132, fontWeight: 600, lineHeight: 1, letterSpacing: -3, marginTop: 6 }}>09.41</div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 22,
          right: 22,
          top: 380,
          padding: "18px 20px",
          borderRadius: 30,
          background: "rgba(30,38,35,0.62)",
          backdropFilter: "blur(20px)",
          display: "flex",
          gap: 14,
          color: "#fff",
          opacity: notif,
          transform: `translateY(${(1 - notif) * -40}px) scale(${0.9 + notif * 0.1})`,
        }}
      >
        <Logo ukuran={46} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 700 }}>
            <span>Rina · Pelanggan</span>
            <span style={{ opacity: 0.6, fontWeight: 500 }}>sekarang</span>
          </div>
          <div style={{ fontSize: 19, opacity: 0.9, marginTop: 3 }}>Kak masih buka? Ada paket hemat?</div>
          <div style={{ fontSize: 16, color: C.hijau, marginTop: 6, fontWeight: 700 }}>✓ AI sudah membalas</div>
        </div>
      </div>
      <div style={{ position: "absolute", bottom: 14, left: "50%", width: 180, height: 6, marginLeft: -90, borderRadius: 3, background: "#fff", opacity: 0.85 }} />
    </div>
  );
}

const IKON = [
  ["#ff9f0a", "Kalender"],
  ["#34c759", "Asisten WA"],
  ["#5e5ce6", "Foto"],
  ["#0a84ff", "Peta"],
  ["#ff375f", "Musik"],
  ["#64d2ff", "Cuaca"],
  ["#ffd60a", "Catatan"],
  ["#30d158", "Toko"],
  ["#bf5af2", "Kamera"],
  ["#ff453a", "Video"],
  ["#8e8e93", "Setelan"],
  ["#0a84ff", "Mail"],
] as const;

/** Layar beranda: widget "AI membalas" + kisi aplikasi. */
export function LayarBeranda({ frame }: { frame: number }) {
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Wallpaper />
      <BilahStatus />
      <WidgetLive frame={frame} style={{ position: "absolute", top: 74, left: 22, right: 22 }} kecil />
      <div style={{ position: "absolute", top: 330, left: 30, right: 30, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", rowGap: 30, columnGap: 18 }}>
        {IKON.map(([w, n], i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            {n === "Asisten WA" ? (
              <Logo ukuran={96} />
            ) : (
              <div style={{ width: 96, height: 96, borderRadius: 26, background: `linear-gradient(160deg, ${w}, ${w}bb)`, display: "grid", placeItems: "center" }}>
                <div style={{ width: 40, height: 40, borderRadius: i % 3 === 0 ? 40 : 10, border: "5px solid rgba(255,255,255,0.9)" }} />
              </div>
            )}
            <span style={{ color: "#fff", fontSize: 17, fontWeight: 500 }}>{n}</span>
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", bottom: 26, left: 22, right: 22, height: 128, borderRadius: 44, background: "rgba(255,255,255,0.14)", backdropFilter: "blur(20px)", display: "flex", justifyContent: "space-around", alignItems: "center" }}>
        {["#34c759", "#0a84ff", "#ff9f0a", "#5e5ce6"].map((w, i) => (
          <div key={i} style={{ width: 92, height: 92, borderRadius: 26, background: `linear-gradient(160deg, ${w}, ${w}bb)` }} />
        ))}
      </div>
    </div>
  );
}

/** Widget "AI membalas · LIVE" (di layar beranda kecil; dilepas jadi kartu melayang di adegan 2). */
export function WidgetLive({ frame, style, kecil = false }: { frame: number; style?: React.CSSProperties; kecil?: boolean }) {
  const s = kecil ? 1 : 1.7;
  return (
    <div
      style={{
        padding: `${20 * s}px ${22 * s}px`,
        borderRadius: 34 * s,
        background: "linear-gradient(140deg, rgba(25,40,70,0.78), rgba(14,24,22,0.82))",
        border: `${1.5 * s}px solid rgba(255,255,255,0.12)`,
        backdropFilter: "blur(24px)",
        color: "#fff",
        boxShadow: kecil ? "none" : "0 60px 120px -30px rgba(0,0,0,0.85)",
        ...style,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 17 * s, fontWeight: 700 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 * s }}>
          <Logo ukuran={26 * s} /> Asisten WA
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 7 * s, color: C.hijau, fontSize: 15 * s }}>
          <TitikLive frame={frame} ukuran={10 * s} /> LIVE
        </span>
      </div>
      <div style={{ fontSize: 25 * s, fontWeight: 700, marginTop: 12 * s, letterSpacing: -0.3 }}>AI sedang membalas</div>
      <div style={{ fontSize: 17 * s, opacity: 0.65, marginTop: 2 * s }}>Pelanggan dijawab saat Anda sibuk</div>
      <div style={{ display: "flex", alignItems: "center", marginTop: 16 * s, gap: 14 * s }}>
        <div style={{ display: "flex" }}>
          {["R", "B", "D", "S"].map((h, i) => (
            <Avatar key={h} huruf={h} i={i} ukuran={36 * s} cincin="#14201c" style={{ marginLeft: i ? -10 * s : 0 }} />
          ))}
        </div>
        <span style={{ fontSize: 18 * s, fontWeight: 600 }}>4 chat dibalas barusan</span>
      </div>
    </div>
  );
}
