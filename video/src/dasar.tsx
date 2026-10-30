import type { CSSProperties, ReactNode } from "react";
import { Easing, interpolate } from "remotion";

/** Warna produk (sama dengan landing page) + latar hitam berpendar ala video referensi. */
export const C = {
  latar: "#040706",
  kaca: "rgba(22, 30, 27, 0.72)",
  kacaTerang: "rgba(36, 48, 43, 0.75)",
  garis: "rgba(232, 240, 236, 0.10)",
  fg: "#f2f7f4",
  muted: "#93a99f",
  hijau: "#3ddc97",
  hijauTua: "#0f7a5c",
  biru: "#2f5bff",
} as const;

export const FONT = "'Plus Jakarta Sans Variable', 'Plus Jakarta Sans', system-ui, sans-serif";

/** Kurva halus untuk gerak kamera & transisi (masuk-keluar pelan), dan kurva "mendarat" untuk elemen masuk. */
export const halus = Easing.bezier(0.65, 0, 0.35, 1);
export const mendarat = Easing.bezier(0.16, 1, 0.3, 1);
export const lepas = Easing.bezier(0.7, 0, 0.84, 0);

/** interpolate yang selalu dijepit di kedua ujung. */
export function t(frame: number, masuk: [number, number], keluar: [number, number], easing = halus): number {
  return interpolate(frame, masuk, keluar, { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing });
}

/** Latar: hitam, dua pendar warna yang bergeser pelan, vinyet. `hijau` 0..1 menggeser nuansa dari biru ke hijau. */
export function Latar({ frame, hijau }: { frame: number; hijau: number }) {
  const gx = 30 + Math.sin(frame / 70) * 8;
  const gy = 72 + Math.cos(frame / 90) * 5;
  const bx = 78 + Math.cos(frame / 80) * 6;
  const by = 30 + Math.sin(frame / 60) * 6;
  return (
    <div style={{ position: "absolute", inset: 0, background: C.latar, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(60% 38% at ${bx}% ${by}%, rgba(47,91,255,${0.42 * (1 - hijau) + 0.08}) 0%, transparent 70%),
                       radial-gradient(70% 42% at ${gx}% ${gy}%, rgba(29,185,104,${0.18 + 0.32 * hijau}) 0%, transparent 72%),
                       radial-gradient(50% 30% at 85% 92%, rgba(61,220,151,${0.1 * hijau}) 0%, transparent 70%)`,
        }}
      />
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 80% at 50% 50%, transparent 55%, rgba(0,0,0,0.75) 100%)" }} />
    </div>
  );
}

/** Kartu kaca gelap bersudut besar (gaya UI di video referensi). */
export function Kaca({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        background: C.kaca,
        border: `2px solid ${C.garis}`,
        borderRadius: 44,
        boxShadow: "0 40px 90px -30px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.06)",
        backdropFilter: "blur(24px)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

const WARNA_AVATAR = ["#f59e0b", "#ec4899", "#6366f1", "#14b8a6", "#ef4444", "#8b5cf6", "#22c55e"];

export function Avatar({ huruf, i, ukuran = 64, cincin = C.latar, style }: { huruf: string; i: number; ukuran?: number; cincin?: string; style?: CSSProperties }) {
  const w = WARNA_AVATAR[i % WARNA_AVATAR.length];
  return (
    <div
      style={{
        width: ukuran,
        height: ukuran,
        borderRadius: ukuran,
        flexShrink: 0,
        display: "grid",
        placeItems: "center",
        background: `linear-gradient(140deg, ${w}, ${w}aa)`,
        color: "#fff",
        fontWeight: 700,
        fontSize: ukuran * 0.42,
        boxShadow: `0 0 0 ${Math.max(3, ukuran * 0.07)}px ${cincin}`,
        ...style,
      }}
    >
      {huruf}
    </div>
  );
}

/** Logo Asisten WhatsApp: gelembung chat di kotak hijau (sama dengan logo di situs). */
export function Logo({ ukuran }: { ukuran: number }) {
  return (
    <div
      style={{
        width: ukuran,
        height: ukuran,
        borderRadius: ukuran * 0.28,
        background: `linear-gradient(150deg, #5ef0b0, ${C.hijau} 45%, #22b877)`,
        display: "grid",
        placeItems: "center",
        boxShadow: `0 ${ukuran * 0.2}px ${ukuran * 0.6}px -${ukuran * 0.2}px rgba(61,220,151,0.55)`,
      }}
    >
      <svg width={ukuran * 0.58} height={ukuran * 0.58} viewBox="0 0 24 24" fill="none" stroke="#06231a" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
      </svg>
    </div>
  );
}

/** Titik "live" yang berdenyut. */
export function TitikLive({ frame, ukuran = 16 }: { frame: number; ukuran?: number }) {
  const d = (Math.sin(frame / 5) + 1) / 2;
  return <span style={{ width: ukuran, height: ukuran, borderRadius: ukuran, background: C.hijau, boxShadow: `0 0 ${6 + d * 14}px ${C.hijau}`, display: "inline-block" }} />;
}
