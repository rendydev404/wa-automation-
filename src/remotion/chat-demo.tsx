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

/**
 * Ukuran komposisi: badan iPhone 12 (71,5 x 146,7 mm) beserta tombol samping dan bayangannya. Layar di dalamnya
 * 710 x 1518 (rasio layar iPhone 12, 390 x 844 pt; 1 pt ~ 1,82 unit). Semua ukuran di bawah dalam unit komposisi.
 */
export const CHAT_LEBAR = 820;
export const CHAT_TINGGI = 1640;
const BADAN = { kiri: 26, atas: 32, lebar: 768, tinggi: 1576, sudut: 113 };
const BINGKAI = 7; // tepi aluminium datar
const BEZEL = 22; // tepi hitam di sekeliling layar
const SUDUT_LAYAR = 84;
const TINGGI_STATUS = 86;
const TINGGI_KEPALA = 84;
const TINGGI_KETIK = 150;
const HIJAU_WA = "#008069";
const BIRU_CENTANG = "#53bdeb";

/** Jam pesan ke-i (jam yang sama di bilah status dan gelembung). */
const jamPesan = (i: number) => `09.${String(41 + Math.floor(i / 2)).padStart(2, "0")}`;

function Gelembung({ p, i, frame, fps }: { p: ReturnType<typeof jadwal>[number]; i: number; frame: number; fps: number }) {
  const masuk = spring({ frame: frame - p.mulai, fps, config: { damping: 16, stiffness: 170 } });
  const ai = p.dari === "ai";
  const huruf = ai ? Math.floor(interpolate(frame, [p.mulai, p.selesai], [0, p.teks.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })) : p.teks.length;
  const latar = ai ? "#ffffff" : W.hijauGelembung;
  return (
    <div style={{ display: "flex", justifyContent: ai ? "flex-start" : "flex-end", opacity: masuk, transform: `translateY(${(1 - masuk) * 24}px) scale(${0.92 + masuk * 0.08})`, transformOrigin: ai ? "left bottom" : "right bottom" }}>
      <div
        style={{
          position: "relative",
          maxWidth: "80%",
          padding: "12px 18px 10px",
          borderRadius: ai ? "24px 24px 24px 6px" : "24px 24px 6px 24px",
          background: latar,
          color: "#111b21",
          fontSize: 30,
          lineHeight: 1.34,
          boxShadow: "0 1.5px 1px rgba(11,20,26,0.13)",
          whiteSpace: "pre-wrap",
        }}
      >
        {/* Ekor gelembung di sudut bawah, seperti WhatsApp iOS. */}
        <svg width="22" height="26" viewBox="0 0 22 26" style={{ position: "absolute", bottom: 0, ...(ai ? { left: -12 } : { right: -12, transform: "scaleX(-1)" }) }} aria-hidden>
          <path d="M22 0v26H4C10 23 14 17 14 8V0z" fill={latar} />
        </svg>
        {ai && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, fontSize: 21, fontWeight: 700, color: W.aksen, letterSpacing: 0.3 }}>
            <span style={{ width: 10, height: 10, borderRadius: 10, background: W.signal }} /> AI · otomatis
          </div>
        )}
        {p.teks.slice(0, huruf)}
        {ai && huruf < p.teks.length && <span style={{ opacity: frame % 16 < 8 ? 1 : 0 }}>▍</span>}
        <span style={{ float: "right", display: "inline-flex", alignItems: "center", gap: 4, margin: "14px 0 -4px 14px", fontSize: 20, color: "#54656f" }}>
          {jamPesan(i)}
          {!ai && (
            <svg width="30" height="18" viewBox="0 0 16 11" aria-hidden>
              <path d="M11.07.65 4.6 7.12 2.1 4.6l-.95.95L4.6 9 12 1.6zM15.05.65 8.6 7.12l-.6-.6-.95.95L8.6 9 16 1.6z" fill={BIRU_CENTANG} />
            </svg>
          )}
        </span>
      </div>
    </div>
  );
}

function Mengetik({ frame }: { frame: number }) {
  return (
    <div style={{ display: "flex" }}>
      <div style={{ display: "flex", gap: 9, padding: "22px 24px", borderRadius: "24px 24px 24px 6px", background: "#fff", boxShadow: "0 1.5px 1px rgba(11,20,26,0.13)" }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{ width: 13, height: 13, borderRadius: 13, background: "#8696a0", transform: `translateY(${Math.sin((frame - i * 5) / 4) * -4}px)`, opacity: 0.55 + 0.45 * Math.max(0, Math.sin((frame - i * 5) / 4)) }}
          />
        ))}
      </div>
    </div>
  );
}

/** Bilah status iOS: jam di kiri takik, sinyal, Wi-Fi, dan baterai di kanan. */
function BilahStatus() {
  return (
    <div style={{ position: "absolute", zIndex: 3, top: 0, left: 0, right: 0, height: TINGGI_STATUS, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 40px 0 70px", color: "#000" }}>
      <span style={{ fontSize: 31, fontWeight: 600, letterSpacing: 0.2 }}>09.41</span>
      {/* Muat di "telinga" kanan takik: (710 - 384) / 2 - 40 = 123 unit. */}
      <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <svg width="30" height="19" viewBox="0 0 34 22" aria-hidden>
          {[0, 1, 2, 3].map((k) => (
            <rect key={k} x={k * 9} y={16 - k * 5} width="6.5" height={6 + k * 5} rx="1.6" fill="#000" />
          ))}
        </svg>
        <svg width="26" height="19" viewBox="0 0 30 22" aria-hidden>
          <path d="M15 21.5 10.6 17a6.3 6.3 0 0 1 8.8 0zM6.4 12.8a12.2 12.2 0 0 1 17.2 0l-2.6 2.6a8.6 8.6 0 0 0-12 0zM2 8.4a18.4 18.4 0 0 1 26 0l-2.6 2.6a14.7 14.7 0 0 0-20.8 0z" fill="#000" />
        </svg>
        <svg width="44" height="20" viewBox="0 0 50 23" aria-hidden>
          <rect x="1" y="1" width="42" height="21" rx="6.5" fill="none" stroke="#000" strokeOpacity="0.4" strokeWidth="2" />
          <rect x="4" y="4" width="32" height="15" rx="4" fill="#000" />
          <path d="M46 8v7c1.6-.6 2.6-2 2.6-3.5S47.6 8.6 46 8z" fill="#000" fillOpacity="0.45" />
        </svg>
      </span>
    </div>
  );
}

/** Takik iPhone 12: speaker dan kamera depan. */
function Takik() {
  return (
    <div style={{ position: "absolute", zIndex: 4, top: 0, left: "50%", width: 384, height: 58, marginLeft: -192, background: "#000", borderRadius: "0 0 32px 32px" }}>
      <span style={{ position: "absolute", top: 18, left: "50%", width: 92, height: 10, marginLeft: -46, borderRadius: 5, background: "#1c1c1e" }} />
      <span style={{ position: "absolute", top: 13, left: "50%", marginLeft: 70, width: 22, height: 22, borderRadius: 22, background: "radial-gradient(circle at 40% 38%, #3a4a6b 0 18%, #0d1117 45%, #050608 100%)" }} />
    </div>
  );
}

/** Tombol fisik: sakelar senyap & volume di kiri, tombol samping di kanan (posisi relatif tinggi badan iPhone 12). */
function TombolSamping() {
  const b = (kiri: boolean, atas: number, tinggi: number) => (
    <div
      style={{
        position: "absolute",
        top: BADAN.atas + atas,
        left: kiri ? BADAN.kiri - 5 : BADAN.kiri + BADAN.lebar - 3,
        width: 8,
        height: tinggi,
        borderRadius: kiri ? "4px 0 0 4px" : "0 4px 4px 0",
        background: "linear-gradient(90deg, #3a3f45, #20242a)",
      }}
    />
  );
  return (
    <>
      {b(true, 205, 52)}
      {b(true, 312, 104)}
      {b(true, 440, 104)}
      {b(false, 330, 160)}
    </>
  );
}

const Ikon = ({ d, w = 40 }: { d: string; w?: number }) => (
  <svg width={w} height={w} viewBox="0 0 24 24" aria-hidden>
    <path d={d} fill="none" stroke={HIJAU_WA} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

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
      <TombolSamping />
      {/* Badan: tepi aluminium datar -> bezel hitam -> layar. */}
      <div
        style={{
          position: "absolute",
          left: BADAN.kiri,
          top: BADAN.atas,
          width: BADAN.lebar,
          height: BADAN.tinggi,
          borderRadius: BADAN.sudut,
          padding: BINGKAI,
          background: "linear-gradient(135deg, #4a5058 0%, #23272c 30%, #31363c 60%, #1b1e22 100%)",
          boxShadow: "0 50px 100px -30px rgba(0,0,0,0.7), inset 0 0 0 1.5px rgba(255,255,255,0.12)",
        }}
      >
        <div style={{ height: "100%", borderRadius: BADAN.sudut - BINGKAI, padding: BEZEL, background: "#000" }}>
          <div style={{ position: "relative", height: "100%", borderRadius: SUDUT_LAYAR, overflow: "hidden", background: "#efeae2" }}>
            <Takik />
            <BilahStatus />
            {/* Kepala chat (WhatsApp iOS) */}
            <div
              style={{
                position: "absolute",
                zIndex: 2,
                top: 0,
                left: 0,
                right: 0,
                height: TINGGI_STATUS + TINGGI_KEPALA,
                paddingTop: TINGGI_STATUS,
                background: "#f6f6f6",
                borderBottom: "1.5px solid #d8d8d8",
                display: "flex",
                alignItems: "center",
                gap: 14,
                paddingLeft: 14,
                paddingRight: 30,
              }}
            >
              <Ikon d="M15 5l-7 7 7 7" w={46} />
              <div style={{ width: 62, height: 62, borderRadius: 62, background: W.aksen, color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 25, flexShrink: 0 }}>{inisial}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 30, color: "#111b21", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nama}</div>
                <div style={{ fontSize: 22, color: "#54656f" }}>{sedangKetik ? "mengetik…" : "online"}</div>
              </div>
              <Ikon d="M15 10l4.6-2.7A1 1 0 0 1 21 8.2v7.6a1 1 0 0 1-1.4.9L15 14M4 6h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
              <span style={{ width: 22 }} />
              <Ikon d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" w={36} />
            </div>
            {/* Latar chat: pola titik halus seperti wallpaper bawaan WhatsApp. */}
            <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(84,101,111,0.09) 2px, transparent 2.5px)", backgroundSize: "34px 34px" }} />
            <div style={{ position: "absolute", zIndex: 1, top: TINGGI_STATUS + TINGGI_KEPALA + 22, left: "50%", transform: "translateX(-50%)", padding: "7px 20px", borderRadius: 14, background: "#ffffff", color: "#54656f", fontSize: 21, fontWeight: 600, boxShadow: "0 1px 1px rgba(11,20,26,0.1)" }}>
              Hari ini
            </div>
            {/* Isi chat, ditambatkan ke bawah: pesan baru mendorong yang lama ke atas, seperti WhatsApp. */}
            <div style={{ position: "absolute", left: 30, right: 30, top: TINGGI_STATUS + TINGGI_KEPALA + 84, bottom: TINGGI_KETIK + 20, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 14, overflow: "hidden" }}>
              {terlihat.map((p) => (
                <Gelembung key={j.indexOf(p)} p={p} i={j.indexOf(p)} frame={frame} fps={fps} />
              ))}
              {sedangKetik && <Mengetik frame={frame} />}
            </div>
            {/* Kolom ketik + indikator beranda */}
            <div style={{ position: "absolute", zIndex: 2, left: 0, right: 0, bottom: 0, height: TINGGI_KETIK, background: "#f6f6f6", borderTop: "1.5px solid #d8d8d8", padding: "14px 22px 0", display: "flex", alignItems: "flex-start", gap: 16 }}>
              <Ikon d="M12 5v14M5 12h14" w={44} />
              <div style={{ flex: 1, height: 58, borderRadius: 30, background: "#fff", border: "1.5px solid #e1e1e1", display: "flex", alignItems: "center", padding: "0 22px", color: "#54656f", fontSize: 25 }}>Ketik pesan</div>
              <Ikon d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" w={42} />
              <Ikon d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3" w={42} />
              <span style={{ position: "absolute", left: "50%", bottom: 16, width: 256, height: 10, marginLeft: -128, borderRadius: 5, background: "#111" }} />
            </div>
          </div>
        </div>
      </div>
      {/* Lencana kecepatan */}
      <div
        style={{
          position: "absolute",
          right: 0,
          top: 400,
          padding: "16px 22px",
          borderRadius: 22,
          background: W.ink,
          color: W.fg,
          fontSize: 24,
          fontWeight: 700,
          boxShadow: "0 18px 40px -12px rgba(0,0,0,0.5)",
          opacity: lencana,
          transform: `scale(${0.7 + lencana * 0.3}) translateY(${(1 - lencana) * 20}px)`,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span style={{ fontSize: 32, color: W.signal }}>⚡</span>
        <span>
          Dibalas dalam
          <br />
          <span style={{ color: W.signal, fontSize: 30 }}>4 detik</span>
        </span>
      </div>
    </AbsoluteFill>
  );
}
