import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

/**
 * Komposisi Remotion: percakapan WhatsApp yang dibalas AI. Semua gerak dihitung dari nomor frame
 * (tanpa transisi CSS), jadi bisa diputar, dihentikan, dan digeser di Player secara deterministik.
 */

export const W = {
  ink: "#0b1813",
  inkRaised: "#13251e",
  signal: "#3ddc97",
  fg: "#e8f0ec",
  muted: "#93a99f",
  kertas: "#f6f6f3",
  hijauGelembung: "#d9fdd3",
  aksen: "#0f7a5c",
} as const;

export interface PesanDemo {
  dari: "pelanggan" | "ai";
  teks: string;
}

export interface PropsChatDemo {
  nama: string;
  inisial: string;
  pesan: PesanDemo[];
  [k: string]: unknown;
}

export const CHAT_FPS = 30;
const JEDA_PELANGGAN = 26; // frame sebelum pesan pelanggan berikutnya muncul
const LAMA_KETIK = 34; // titik-titik "mengetik…" sebelum balasan AI
const KECEPATAN_HURUF = 1.6; // huruf per frame saat balasan AI diketik

/** Jadwal tiap pesan: kapan muncul dan (untuk AI) kapan selesai diketik. */
export function jadwal(pesan: PesanDemo[]) {
  let t = 12;
  return pesan.map((p) => {
    if (p.dari === "pelanggan") {
      const mulai = t;
      t += JEDA_PELANGGAN;
      return { ...p, ketik: -1, mulai, selesai: mulai };
    }
    const ketik = t;
    const mulai = t + LAMA_KETIK;
    const selesai = mulai + Math.ceil(p.teks.length / KECEPATAN_HURUF);
    t = selesai + 30;
    return { ...p, ketik, mulai, selesai };
  });
}

export const durasiChat = (pesan: PesanDemo[]): number => {
  const j = jadwal(pesan);
  return j[j.length - 1].selesai + 90;
};

function Gelembung({ p, frame, fps }: { p: ReturnType<typeof jadwal>[number]; frame: number; fps: number }) {
  const masuk = spring({ frame: frame - p.mulai, fps, config: { damping: 16, stiffness: 170 } });
  const ai = p.dari === "ai";
  const huruf = ai ? Math.floor(interpolate(frame, [p.mulai, p.selesai], [0, p.teks.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })) : p.teks.length;
  return (
    <div style={{ display: "flex", justifyContent: ai ? "flex-start" : "flex-end", opacity: masuk, transform: `translateY(${(1 - masuk) * 24}px) scale(${0.92 + masuk * 0.08})`, transformOrigin: ai ? "left bottom" : "right bottom" }}>
      <div
        style={{
          maxWidth: "78%",
          padding: "14px 18px",
          borderRadius: ai ? "6px 22px 22px 22px" : "22px 6px 22px 22px",
          background: ai ? "#ffffff" : W.hijauGelembung,
          color: "#15201b",
          fontSize: 25,
          lineHeight: 1.38,
          boxShadow: "0 2px 0 rgba(0,0,0,0.05)",
          whiteSpace: "pre-wrap",
        }}
      >
        {ai && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontSize: 17, fontWeight: 700, color: W.aksen, letterSpacing: 0.3 }}>
            <span style={{ width: 9, height: 9, borderRadius: 9, background: W.signal }} /> AI · otomatis
          </div>
        )}
        {p.teks.slice(0, huruf)}
        {ai && huruf < p.teks.length && <span style={{ opacity: frame % 16 < 8 ? 1 : 0 }}>▍</span>}
      </div>
    </div>
  );
}

function Mengetik({ frame }: { frame: number }) {
  return (
    <div style={{ display: "flex" }}>
      <div style={{ display: "flex", gap: 8, padding: "18px 20px", borderRadius: "6px 22px 22px 22px", background: "#fff" }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{ width: 11, height: 11, borderRadius: 11, background: W.muted, transform: `translateY(${Math.sin((frame - i * 5) / 4) * -4}px)`, opacity: 0.55 + 0.45 * Math.max(0, Math.sin((frame - i * 5) / 4)) }}
          />
        ))}
      </div>
    </div>
  );
}

export function ChatDemo({ nama, inisial, pesan }: PropsChatDemo) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const j = jadwal(pesan);
  const sedangKetik = j.some((p) => p.dari === "ai" && frame >= p.ketik && frame < p.mulai);
  const terlihat = j.filter((p) => frame >= p.mulai);
  const pertamaAi = j.find((p) => p.dari === "ai");
  const lencana = pertamaAi ? spring({ frame: frame - pertamaAi.selesai - 6, fps, config: { damping: 12 } }) : 0;
  const pudar = interpolate(frame, [durationInFrames - 18, durationInFrames - 1], [1, 0], { extrapolateLeft: "clamp", easing: Easing.in(Easing.quad) });

  return (
    <AbsoluteFill style={{ background: "transparent", fontFamily: "var(--font-plus-jakarta), 'Plus Jakarta Sans', system-ui, sans-serif", opacity: pudar }}>
      <div style={{ position: "absolute", inset: "18px 40px", borderRadius: 64, background: "#000", padding: 14, boxShadow: "0 40px 90px -30px rgba(0,0,0,0.6)" }}>
        <div style={{ position: "relative", height: "100%", borderRadius: 52, overflow: "hidden", background: "#efeae2" }}>
          {/* Kepala chat */}
          <div style={{ position: "absolute", zIndex: 2, top: 0, left: 0, right: 0, padding: "46px 26px 20px", background: "#075e54", display: "flex", alignItems: "center", gap: 16, color: "#fff" }}>
            <div style={{ width: 58, height: 58, borderRadius: 58, background: W.signal, color: W.ink, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 25 }}>{inisial}</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 25 }}>{nama}</div>
              <div style={{ fontSize: 18, opacity: 0.85 }}>{sedangKetik ? "mengetik…" : "online"}</div>
            </div>
          </div>
          {/* Isi chat */}
          {/* Ditambatkan ke bawah: pesan baru mendorong yang lama ke atas, seperti WhatsApp. */}
          <div style={{ position: "absolute", left: 22, right: 22, top: 150, bottom: 104, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 16, overflow: "hidden" }}>
            {terlihat.map((p, i) => (
              <Gelembung key={i} p={p} frame={frame} fps={fps} />
            ))}
            {sedangKetik && <Mengetik frame={frame} />}
          </div>
          {/* Kolom ketik */}
          <div style={{ position: "absolute", zIndex: 2, left: 0, right: 0, bottom: 0, padding: "16px 18px 26px", background: "#efeae2", display: "flex", gap: 12 }}>
            <div style={{ flex: 1, height: 58, borderRadius: 58, background: "#fff", display: "flex", alignItems: "center", padding: "0 24px", color: "#667777", fontSize: 21 }}>Ketik pesan</div>
            <div style={{ width: 58, height: 58, borderRadius: 58, background: "#00a884" }} />
          </div>
        </div>
      </div>
      {/* Lencana kecepatan */}
      <div
        style={{
          position: "absolute",
          right: 6,
          top: 210,
          padding: "14px 20px",
          borderRadius: 20,
          background: W.ink,
          color: W.fg,
          fontSize: 20,
          fontWeight: 700,
          boxShadow: "0 18px 40px -12px rgba(0,0,0,0.5)",
          opacity: lencana,
          transform: `scale(${0.7 + lencana * 0.3}) translateY(${(1 - lencana) * 20}px)`,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span style={{ fontSize: 28, color: W.signal }}>⚡</span>
        <span>
          Dibalas dalam
          <br />
          <span style={{ color: W.signal, fontSize: 26 }}>4 detik</span>
        </span>
      </div>
    </AbsoluteFill>
  );
}
