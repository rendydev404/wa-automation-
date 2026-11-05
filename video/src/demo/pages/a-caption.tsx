import { FPS } from "../config";
import { tampil } from "../kit/anim";
import { useWaktu } from "../kit/timemap";
import type { Cap } from "../kit/caption";

/** Caption seperti kit/caption.tsx tetapi posisinya bebas (mis. di panel kiri supaya tidak menutupi formulir). */
export function CaptionsPos({ items, left, top, maxWidth = 820 }: { items: Cap[]; left: number; top: number; maxWidth?: number }) {
  const { t, v } = useWaktu();
  return (
    <>
      {items.map((c, i) => {
        if ((c.to - c.from) / v < 1.2) return null;
        const a = tampil(t, c.from, c.to, 0.42, 0.32);
        if (a <= 0.001) return null;
        return (
          <div key={i} className="font-sans" style={{ position: "absolute", left, top, opacity: a, transform: `translateY(${(1 - a) * 22}px)`, pointerEvents: "none", maxWidth }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 18,
                padding: "16px 28px 16px 18px",
                borderRadius: 22,
                background: "rgba(8,20,15,0.9)",
                border: "1px solid rgba(232,240,236,0.14)",
                boxShadow: "0 24px 60px -18px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)",
              }}
            >
              {c.label && <span style={{ flexShrink: 0, borderRadius: 12, background: "#3ddc97", color: "#0b1813", fontSize: 15, fontWeight: 700, letterSpacing: 1.2, padding: "8px 13px" }}>{c.label}</span>}
              <div>
                <div style={{ color: "#fff", fontSize: 25, fontWeight: 700, letterSpacing: -0.3, lineHeight: 1.2 }}>{c.title}</div>
                {c.sub && <div style={{ color: "#93a99f", fontSize: 18, fontWeight: 500, marginTop: 4, lineHeight: 1.3 }}>{c.sub}</div>}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
