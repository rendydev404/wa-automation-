import type { CSSProperties, ReactNode } from "react";
import { Avatar } from "./dasar";

/**
 * Tampilan WhatsApp iOS (2024-2025): daftar Chats (judul besar, kolom cari, filter All/Unread/Favourites/Groups,
 * bilah tab Updates · Calls · Communities · Chats · Settings) dan layar percakapan (wallpaper krem bermotif,
 * gelembung masuk putih & keluar hijau muda dengan ekor di sudut atas, centang biru, balasan yang mengutip).
 * Ukuran dalam pt iOS dikali U (lebar layar iPhone 12 = 390 pt).
 */
export const U = 524 / 390;
const pt = (n: number) => n * U;

export const WA = {
  hijau: "#25d366",
  hijauTua: "#1daa61",
  keluar: "#d9fdd3",
  masuk: "#ffffff",
  teks: "#111b21",
  abu: "#667781",
  garis: "#e9edef",
  centang: "#53bdeb",
  wallpaper: "#efe7de",
  bilah: "#f6f6f6",
} as const;

export const FONT_IOS = "-apple-system, 'SF Pro Text', 'Plus Jakarta Sans Variable', system-ui, sans-serif";

export function BilahStatusGelap() {
  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: pt(47), display: "flex", alignItems: "center", justifyContent: "space-between", padding: `${pt(6)}px ${pt(26)}px 0 ${pt(36)}px`, color: "#000", fontSize: pt(17), fontWeight: 600, zIndex: 5 }}>
      <span>9:41</span>
      <span style={{ display: "flex", gap: pt(5), alignItems: "center" }}>
        <svg width={pt(17)} height={pt(11)} viewBox="0 0 34 22">{[0, 1, 2, 3].map((k) => <rect key={k} x={k * 9} y={16 - k * 5} width="6.5" height={6 + k * 5} rx="1.6" fill="#000" />)}</svg>
        <svg width={pt(16)} height={pt(11)} viewBox="0 0 30 22"><path d="M15 21.5 10.6 17a6.3 6.3 0 0 1 8.8 0zM6.4 12.8a12.2 12.2 0 0 1 17.2 0l-2.6 2.6a8.6 8.6 0 0 0-12 0zM2 8.4a18.4 18.4 0 0 1 26 0l-2.6 2.6a14.7 14.7 0 0 0-20.8 0z" fill="#000" /></svg>
        <svg width={pt(25)} height={pt(12)} viewBox="0 0 50 23"><rect x="1" y="1" width="42" height="21" rx="6.5" fill="none" stroke="#000" strokeOpacity="0.4" strokeWidth="2" /><rect x="4" y="4" width="32" height="15" rx="4" fill="#000" /></svg>
      </span>
    </div>
  );
}

const Garis = ({ d, ukuran, warna = "#000", tebal = 1.8, isi = "none" }: { d: string; ukuran: number; warna?: string; tebal?: number; isi?: string }) => (
  <svg width={ukuran} height={ukuran} viewBox="0 0 24 24" aria-hidden>
    <path d={d} fill={isi} stroke={warna} strokeWidth={tebal} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IKON = {
  kamera: "M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  tambah: "M12 5v14M5 12h14",
  cari: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  video: "M15 10l4.6-2.7A1 1 0 0 1 21 8.2v7.6a1 1 0 0 1-1.4.9L15 14M4 6h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z",
  telepon: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2",
  kembali: "M15 5l-7 7 7 7",
  mic: "M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3",
  stiker: "M12 21a9 9 0 1 1 9-9v1a8 8 0 0 1-8 8zM9 10h.01M15 10h.01M8.5 14.5a4.5 4.5 0 0 0 7 0",
  arsip: "M3 6h18v4H3zM5 10v9h14v-9M10 14h4",
  pembaruan: "M12 3a9 9 0 1 0 9 9M12 3a9 9 0 0 1 9 9M12 8v4l3 2",
  panggilan: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2",
  komunitas: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M17 11a2.5 2.5 0 1 0 0-5M16 14.5a5 5 0 0 1 5 5.5",
  chat: "M4 12a8 8 0 1 1 3.5 6.6L4 20l1.3-3.4A7.9 7.9 0 0 1 4 12z",
  setelan: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
};

function Centang({ biru }: { biru: boolean }) {
  return (
    <svg width={pt(17)} height={pt(11)} viewBox="0 0 16 11" aria-hidden>
      <path d="M11.07.65 4.6 7.12 2.1 4.6l-.95.95L4.6 9 12 1.6zM15.05.65 8.6 7.12l-.6-.6-.95.95L8.6 9 16 1.6z" fill={biru ? WA.centang : "#8696a0"} />
    </svg>
  );
}

// ------------------------------------------------------------------ Daftar Chats

export interface BarisChat {
  h: string;
  i: number;
  nama: string;
  isi: string;
  jam: string;
  belum?: number;
  kirim?: boolean;
}

function Baris({ b, sorot = 0 }: { b: BarisChat; sorot?: number }) {
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", gap: pt(12), height: pt(76), padding: `0 ${pt(16)}px`, background: `rgba(0,0,0,${0.06 * sorot})` }}>
      <Avatar huruf={b.h} i={b.i} ukuran={pt(52)} cincin="transparent" />
      <div style={{ flex: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", borderBottom: `1px solid ${WA.garis}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: pt(17), fontWeight: 600, color: WA.teks }}>{b.nama}</span>
          <span style={{ fontSize: pt(14), color: b.belum ? WA.hijauTua : WA.abu, fontWeight: b.belum ? 600 : 400 }}>{b.jam}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: pt(2) }}>
          <span style={{ display: "flex", alignItems: "center", gap: pt(3), fontSize: pt(15), color: WA.abu, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: pt(240) }}>
            {b.kirim && <Centang biru />}
            {b.isi}
          </span>
          {b.belum ? (
            <span style={{ minWidth: pt(20), height: pt(20), padding: `0 ${pt(6)}px`, boxSizing: "border-box", borderRadius: pt(10), background: WA.hijau, color: "#fff", fontSize: pt(13), fontWeight: 600, display: "grid", placeItems: "center" }}>{b.belum}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const TAB: [keyof typeof IKON, string][] = [
  ["pembaruan", "Updates"],
  ["panggilan", "Calls"],
  ["komunitas", "Communities"],
  ["chat", "Chats"],
  ["setelan", "Settings"],
];

/** `masuk` 0..1: chat Rina yang baru masuk menyisip di paling atas. `sorot` 0..1: baris Rina disentuh. */
export function DaftarChat({ baris, baru, masuk, sorot }: { baris: BarisChat[]; baru: BarisChat; masuk: number; sorot: number }) {
  return (
    <div style={{ position: "absolute", inset: 0, isolation: "isolate", background: "#fff", fontFamily: FONT_IOS }}>
      <BilahStatusGelap />
      <div style={{ position: "absolute", top: pt(50), left: pt(16), right: pt(16), display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ width: pt(30), height: pt(30), borderRadius: pt(15), background: "#f0f2f5", display: "grid", placeItems: "center", fontSize: pt(16), fontWeight: 800, letterSpacing: 1 }}>···</span>
        <span style={{ display: "flex", gap: pt(14), alignItems: "center" }}>
          <Garis d={IKON.kamera} ukuran={pt(26)} />
          <span style={{ width: pt(30), height: pt(30), borderRadius: pt(15), background: WA.hijau, display: "grid", placeItems: "center" }}>
            <Garis d={IKON.tambah} ukuran={pt(20)} warna="#fff" tebal={2.6} />
          </span>
        </span>
      </div>
      <div style={{ position: "absolute", top: pt(88), left: pt(16), fontSize: pt(34), fontWeight: 800, color: "#000", letterSpacing: -0.5 }}>Chats</div>
      <div style={{ position: "absolute", top: pt(136), left: pt(16), right: pt(16), height: pt(36), borderRadius: pt(10), background: "rgba(118,118,128,0.12)", display: "flex", alignItems: "center", gap: pt(6), padding: `0 ${pt(8)}px`, color: "#8e8e93", fontSize: pt(17) }}>
        <Garis d={IKON.cari} ukuran={pt(18)} warna="#8e8e93" tebal={2.2} /> Search
      </div>
      <div style={{ position: "absolute", top: pt(184), left: pt(16), display: "flex", gap: pt(8) }}>
        {["All", "Unread 2", "Favourites", "Groups"].map((c, i) => (
          <span key={c} style={{ padding: `${pt(6)}px ${pt(13)}px`, borderRadius: pt(16), fontSize: pt(15), fontWeight: 600, background: i === 0 ? WA.keluar : "#f0f2f5", color: i === 0 ? "#15603e" : "#54656f" }}>
            {c}
          </span>
        ))}
      </div>
      <div style={{ position: "absolute", top: pt(226), left: 0, right: 0, bottom: pt(83), overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: pt(24), height: pt(46), padding: `0 ${pt(28)}px`, color: WA.teks, fontSize: pt(16), fontWeight: 600 }}>
          <Garis d={IKON.arsip} ukuran={pt(20)} warna="#54656f" /> Archived <span style={{ marginLeft: "auto", color: WA.abu, fontWeight: 400, fontSize: pt(14) }}>3</span>
        </div>
        <div style={{ height: pt(76) * masuk, overflow: "hidden", opacity: masuk }}>
          <div style={{ transform: `translateY(${(1 - masuk) * -pt(30)}px)` }}>
            <Baris b={baru} sorot={sorot} />
          </div>
        </div>
        {baris.map((b) => (
          <Baris key={b.nama} b={b} />
        ))}
      </div>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: pt(83), background: "rgba(249,249,249,0.94)", borderTop: "1px solid #d8d8d8", display: "flex", justifyContent: "space-around", paddingTop: pt(7) }}>
        {TAB.map(([k, n]) => {
          const aktif = n === "Chats";
          return (
            <div key={n} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: pt(2), width: pt(70) }}>
              <span style={{ position: "relative" }}>
                <Garis d={IKON[k]} ukuran={pt(26)} isi={aktif ? "#000" : "none"} tebal={aktif ? 1.4 : 1.7} />
                {n === "Chats" && (
                  <span style={{ position: "absolute", top: -pt(4), right: -pt(10), minWidth: pt(18), height: pt(18), borderRadius: pt(9), background: WA.hijau, color: "#fff", fontSize: pt(11), fontWeight: 700, display: "grid", placeItems: "center" }}>4</span>
                )}
              </span>
              <span style={{ fontSize: pt(10.5), fontWeight: aktif ? 700 : 500, color: aktif ? "#000" : "#54656f" }}>{n}</span>
            </div>
          );
        })}
        <span style={{ position: "absolute", left: "50%", bottom: pt(8), width: pt(134), height: pt(5), marginLeft: -pt(67), borderRadius: pt(3), background: "#000" }} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Layar percakapan

export interface PesanWa {
  dari: "pelanggan" | "saya";
  teks: string;
  jam: string;
  /** 0..1 */
  muncul: number;
  dibaca?: boolean;
  kutip?: { nama: string; teks: string };
  /** baris pertama dari sederet pesan pengirim yang sama: gelembungnya berekor */
  ekor?: boolean;
}

/** Pola doodle wallpaper WhatsApp (digambar ulang: garis tipis sewarna latar). */
function Doodle() {
  return (
    <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }} aria-hidden>
      <defs>
        <pattern id="doodle" width="120" height="120" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="#e0d6c8" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 20c4-8 14-8 16 0s-8 14-8 14-12-6-8-14z" />
            <circle cx="70" cy="22" r="9" />
            <path d="M66 22h8M70 18v8" />
            <path d="M100 12l4 8 9 1-6.5 6 1.6 9-8.1-4.3-8.1 4.3 1.6-9-6.5-6 9-1z" />
            <path d="M12 70h22v14H12zM12 70l11 8 11-8" />
            <path d="M58 64c0-6 12-6 12 0v14a6 6 0 0 1-12 0z" />
            <path d="M92 70a10 10 0 1 0 20 0 10 10 0 0 0-20 0zM98 68h.01M106 68h.01M97 74c3 3 7 3 10 0" />
            <path d="M18 104l8-8 8 8-8 8z" />
            <path d="M58 100h16l-3 14H61z M74 103h4a3 3 0 0 1 0 6h-5" />
            <path d="M96 98l14 14M110 98l-14 14" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#doodle)" />
    </svg>
  );
}

function Gelembung({ p }: { p: PesanWa }) {
  const saya = p.dari === "saya";
  const latar = saya ? WA.keluar : WA.masuk;
  return (
    <div style={{ display: "flex", justifyContent: saya ? "flex-end" : "flex-start", opacity: p.muncul, transform: `translateY(${(1 - p.muncul) * pt(24)}px) scale(${0.94 + p.muncul * 0.06})`, transformOrigin: saya ? "right bottom" : "left bottom", padding: `0 ${pt(10)}px` }}>
      <div
        style={{
          position: "relative",
          maxWidth: "80%",
          padding: `${pt(6)}px ${pt(8)}px ${pt(5)}px ${pt(9)}px`,
          borderRadius: pt(10),
          borderTopLeftRadius: !saya && p.ekor ? 0 : pt(10),
          borderTopRightRadius: saya && p.ekor ? 0 : pt(10),
          background: latar,
          color: WA.teks,
          fontSize: pt(17),
          lineHeight: 1.3,
          boxShadow: "0 1px 0.5px rgba(11,20,26,0.13)",
        }}
      >
        {p.ekor && (
          <svg width={pt(8)} height={pt(13)} viewBox="0 0 8 13" style={{ position: "absolute", top: 0, ...(saya ? { right: -pt(8) } : { left: -pt(8), transform: "scaleX(-1)" }) }} aria-hidden>
            <path d="M0 0h8L1.5 9C.6 10.2 0 11 0 13z" fill={latar} />
          </svg>
        )}
        {p.kutip && (
          <div style={{ display: "flex", borderRadius: pt(7), background: saya ? "#cfe9c7" : "#f0f0f0", overflow: "hidden", marginBottom: pt(4) }}>
            <span style={{ width: pt(4), background: "#7f66ff" }} />
            <div style={{ padding: `${pt(5)}px ${pt(8)}px` }}>
              <div style={{ fontSize: pt(14), fontWeight: 600, color: "#7f66ff" }}>{p.kutip.nama}</div>
              <div style={{ fontSize: pt(14), color: "#54656f" }}>{p.kutip.teks}</div>
            </div>
          </div>
        )}
        <span>{p.teks}</span>
        <span style={{ float: "right", display: "inline-flex", alignItems: "center", gap: pt(3), margin: `${pt(8)}px 0 -${pt(2)}px ${pt(10)}px`, fontSize: pt(11), color: WA.abu }}>
          {p.jam}
          {saya && <Centang biru={!!p.dibaca} />}
        </span>
      </div>
    </div>
  );
}

export function LayarChat({ pesan, status, style }: { pesan: PesanWa[]; status: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ position: "absolute", inset: 0, isolation: "isolate", background: WA.wallpaper, fontFamily: FONT_IOS, ...style }}>
      <Doodle />
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: pt(47 + 52), background: "rgba(246,246,246,0.96)", borderBottom: "1px solid #d8d8d8", zIndex: 3 }}>
        <BilahStatusGelap />
        <div style={{ position: "absolute", top: pt(47), left: 0, right: pt(14), height: pt(52), display: "flex", alignItems: "center", gap: pt(8) }}>
          <span style={{ display: "flex", alignItems: "center", fontSize: pt(17), color: "#000", marginLeft: pt(4) }}>
            <Garis d={IKON.kembali} ukuran={pt(28)} tebal={2.2} />
            <span style={{ marginLeft: -pt(4) }}>3</span>
          </span>
          <Avatar huruf="R" i={0} ukuran={pt(36)} cincin="transparent" />
          <div style={{ flex: 1, minWidth: 0, marginLeft: pt(2) }}>
            <div style={{ fontSize: pt(16), fontWeight: 600, color: "#000" }}>Rina</div>
            <div style={{ fontSize: pt(12.5), color: WA.abu }}>{status}</div>
          </div>
          <Garis d={IKON.video} ukuran={pt(26)} />
          <span style={{ width: pt(18) }} />
          <Garis d={IKON.telepon} ukuran={pt(22)} />
        </div>
      </div>
      <div style={{ position: "absolute", top: pt(47 + 52 + 10), left: "50%", transform: "translateX(-50%)", padding: `${pt(4)}px ${pt(10)}px`, borderRadius: pt(8), background: "rgba(255,255,255,0.92)", color: "#54656f", fontSize: pt(12.5), fontWeight: 600, zIndex: 2 }}>Today</div>
      <div style={{ position: "absolute", left: 0, right: 0, top: pt(140), bottom: pt(88), display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: pt(4), overflow: "hidden" }}>
        {pesan.filter((p) => p.muncul > 0).map((p, i) => (
          <div key={i} style={{ marginTop: p.ekor ? pt(6) : 0 }}>
            <Gelembung p={p} />
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: pt(84), background: WA.bilah, borderTop: "1px solid #d8d8d8", display: "flex", alignItems: "flex-start", gap: pt(10), padding: `${pt(8)}px ${pt(12)}px 0` }}>
        <Garis d={IKON.tambah} ukuran={pt(30)} tebal={2} />
        <div style={{ flex: 1, height: pt(34), borderRadius: pt(17), background: "#fff", border: "1px solid #e0e0e0", display: "flex", alignItems: "center", justifyContent: "flex-end", padding: `0 ${pt(8)}px` }}>
          <Garis d={IKON.stiker} ukuran={pt(22)} warna="#54656f" />
        </div>
        <Garis d={IKON.kamera} ukuran={pt(28)} />
        <Garis d={IKON.mic} ukuran={pt(28)} />
        <span style={{ position: "absolute", left: "50%", bottom: pt(8), width: pt(134), height: pt(5), marginLeft: -pt(67), borderRadius: pt(3), background: "#000" }} />
      </div>
    </div>
  );
}
