import type { ReactNode } from "react";
import { IkonApp, type JenisIkon } from "./ikon";
import { FONT_IOS, U } from "./wa";

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

const pt = (n: number) => n * U;

function BilahStatusTerang() {
  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: pt(47), display: "flex", alignItems: "center", justifyContent: "space-between", padding: `${pt(6)}px ${pt(26)}px 0 ${pt(36)}px`, color: "#fff", fontSize: pt(17), fontWeight: 600, zIndex: 2, fontFamily: FONT_IOS }}>
      <span>9:41</span>
      <span style={{ display: "flex", gap: pt(5), alignItems: "center" }}>
        <svg width={pt(17)} height={pt(11)} viewBox="0 0 34 22">{[0, 1, 2, 3].map((k) => <rect key={k} x={k * 9} y={16 - k * 5} width="6.5" height={6 + k * 5} rx="1.6" fill="#fff" />)}</svg>
        <svg width={pt(16)} height={pt(11)} viewBox="0 0 30 22"><path d="M15 21.5 10.6 17a6.3 6.3 0 0 1 8.8 0zM6.4 12.8a12.2 12.2 0 0 1 17.2 0l-2.6 2.6a8.6 8.6 0 0 0-12 0zM2 8.4a18.4 18.4 0 0 1 26 0l-2.6 2.6a14.7 14.7 0 0 0-20.8 0z" fill="#fff" /></svg>
        <svg width={pt(25)} height={pt(12)} viewBox="0 0 50 23"><rect x="1" y="1" width="42" height="21" rx="6.5" fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="2" /><rect x="4" y="4" width="32" height="15" rx="4" fill="#fff" /></svg>
      </span>
    </div>
  );
}

/** Layar kunci iOS: tanggal, jam besar, notifikasi WhatsApp dari pelanggan (muncul saat `notif` 0..1). */
export function LayarKunci({ notif }: { notif: number }) {
  return (
    <div style={{ position: "absolute", inset: 0, isolation: "isolate", fontFamily: FONT_IOS }}>
      <Wallpaper />
      <BilahStatusTerang />
      <div style={{ position: "absolute", top: pt(70), width: "100%", textAlign: "center", color: "#fff" }}>
        <div style={{ fontSize: pt(21), fontWeight: 600, opacity: 0.9 }}>Thursday 30 October</div>
        <div style={{ fontSize: pt(96), fontWeight: 700, lineHeight: 1, letterSpacing: -2, marginTop: pt(2) }}>9:41</div>
      </div>
      <div
        style={{
          position: "absolute",
          left: pt(10),
          right: pt(10),
          top: pt(300),
          padding: `${pt(12)}px ${pt(14)}px`,
          borderRadius: pt(22),
          background: "rgba(245,245,245,0.78)",
          backdropFilter: "blur(20px)",
          display: "flex",
          gap: pt(10),
          alignItems: "flex-start",
          color: "#000",
          opacity: notif,
          transform: `translateY(${(1 - notif) * pt(40)}px) scale(${0.92 + notif * 0.08})`,
        }}
      >
        <IkonApp jenis="whatsapp" ukuran={pt(38)} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: pt(15), fontWeight: 600 }}>
            <span>Rina</span>
            <span style={{ color: "#6e6e73", fontWeight: 400, fontSize: pt(13) }}>now</span>
          </div>
          <div style={{ fontSize: pt(15), lineHeight: 1.3 }}>Hi! Are you open today? Any combo deals? 🍗</div>
        </div>
      </div>
      {/* Senter & kamera, indikator beranda */}
      {[{ left: pt(46) }, { right: pt(46) }].map((p, i) => (
        <div key={i} style={{ position: "absolute", bottom: pt(50), ...p, width: pt(50), height: pt(50), borderRadius: pt(25), background: "rgba(0,0,0,0.35)", backdropFilter: "blur(12px)" }} />
      ))}
      <div style={{ position: "absolute", bottom: pt(8), left: "50%", width: pt(134), height: pt(5), marginLeft: -pt(67), borderRadius: pt(3), background: "#fff" }} />
    </div>
  );
}

const KISI: JenisIkon[][] = [
  ["facetime", "foto", "kamera", "mail"],
  ["jam", "peta", "catatan", "appstore"],
  ["setelan", "whatsapp", "kalender", "cuaca"],
];
const NAMA: Record<JenisIkon, string> = {
  facetime: "FaceTime",
  foto: "Photos",
  kamera: "Camera",
  mail: "Mail",
  jam: "Clock",
  peta: "Maps",
  catatan: "Notes",
  appstore: "App Store",
  setelan: "Settings",
  whatsapp: "WhatsApp",
  kalender: "Calendar",
  cuaca: "Weather",
  telepon: "Phone",
  safari: "Safari",
  pesan: "Messages",
  musik: "Music",
};
const KOLOM_X = [30, 120, 210, 300];
const BARIS_Y = [240, 332, 424];
/** Titik tengah ikon WhatsApp di layar (px), dipakai untuk sentuhan jari dan animasi aplikasi terbuka. */
export const POS_WA = { x: pt(KOLOM_X[1] + 30), y: pt(BARIS_Y[2] + 30) };

/** Layar beranda iOS: widget Cuaca & Kalender, kisi aplikasi, titik halaman, dok. `tekan` 0..1 = ikon WhatsApp ditekan. */
export function LayarBeranda({ tekan = 0 }: { tekan?: number }) {
  return (
    <div style={{ position: "absolute", inset: 0, isolation: "isolate", fontFamily: FONT_IOS }}>
      <Wallpaper />
      <BilahStatusTerang />
      <div style={{ position: "absolute", top: pt(62), left: pt(24), width: pt(155), height: pt(155), borderRadius: pt(22), background: "linear-gradient(180deg, #2f7fe9, #5ab3f6)", color: "#fff", padding: pt(14), boxSizing: "border-box" }}>
        <div style={{ fontSize: pt(15), fontWeight: 600 }}>Jakarta ➤</div>
        <div style={{ fontSize: pt(44), fontWeight: 300, lineHeight: 1.05 }}>31°</div>
        <div style={{ position: "absolute", bottom: pt(14), left: pt(14), fontSize: pt(13), fontWeight: 600 }}>
          ☀️<br />
          Sunny
          <br />
          <span style={{ fontWeight: 500 }}>H:33° L:25°</span>
        </div>
      </div>
      <div style={{ position: "absolute", top: pt(62), left: pt(211), width: pt(155), height: pt(155), borderRadius: pt(22), background: "#fff", color: "#000", padding: pt(14), boxSizing: "border-box" }}>
        <div style={{ fontSize: pt(12), fontWeight: 700, color: "#ff3b30" }}>THURSDAY</div>
        <div style={{ fontSize: pt(44), fontWeight: 300, lineHeight: 1.05 }}>30</div>
        <div style={{ marginTop: pt(10), borderLeft: `${pt(3)}px solid #34c759`, paddingLeft: pt(6), fontSize: pt(12), fontWeight: 600 }}>
          Weekend promo
          <div style={{ color: "#8e8e93", fontWeight: 500 }}>10:00 – 22:00</div>
        </div>
      </div>
      {KISI.map((baris, r) =>
        baris.map((j, c) => {
          const wa = j === "whatsapp";
          return (
            <div key={j} style={{ position: "absolute", left: pt(KOLOM_X[c] - 8), top: pt(BARIS_Y[r]), width: pt(76), display: "flex", flexDirection: "column", alignItems: "center", gap: pt(5) }}>
              <div style={{ transform: wa ? `scale(${1 - tekan * 0.12})` : undefined, filter: wa && tekan > 0 ? `brightness(${1 - tekan * 0.35})` : undefined }}>
                <IkonApp jenis={j} ukuran={pt(60)} badge={wa ? 2 : undefined} />
              </div>
              <span style={{ color: "#fff", fontSize: pt(12), fontWeight: 500, textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}>{NAMA[j]}</span>
            </div>
          );
        }),
      )}
      <div style={{ position: "absolute", top: pt(728), left: "50%", transform: "translateX(-50%)", display: "flex", gap: pt(8) }}>
        <span style={{ width: pt(7), height: pt(7), borderRadius: pt(4), background: "#fff" }} />
        <span style={{ width: pt(7), height: pt(7), borderRadius: pt(4), background: "rgba(255,255,255,0.4)" }} />
      </div>
      <div style={{ position: "absolute", bottom: pt(12), left: pt(12), right: pt(12), height: pt(92), borderRadius: pt(32), background: "rgba(255,255,255,0.22)", backdropFilter: "blur(20px)", display: "flex", justifyContent: "space-around", alignItems: "center" }}>
        {(["telepon", "safari", "pesan", "musik"] as JenisIkon[]).map((j) => (
          <IkonApp key={j} jenis={j} ukuran={pt(60)} />
        ))}
      </div>
    </div>
  );
}

/** Sentuhan jari (lingkaran putih seperti rekaman layar dengan "show touches"). */
export function Sentuh({ x, y, k }: { x: number; y: number; k: number }) {
  if (k <= 0 || k >= 1) return null;
  const tekan = Math.sin(k * Math.PI);
  return (
    <div
      style={{
        position: "absolute",
        left: x - pt(26),
        top: y - pt(26),
        width: pt(52),
        height: pt(52),
        borderRadius: pt(26),
        background: "rgba(255,255,255,0.55)",
        border: `${pt(2)}px solid rgba(255,255,255,0.9)`,
        boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
        opacity: tekan,
        transform: `scale(${0.7 + tekan * 0.3})`,
        zIndex: 20,
      }}
    />
  );
}
