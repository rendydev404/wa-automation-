import type { ReactNode } from "react";
import { Avatar } from "../dasar";
import { FONT_IOS, U, WA } from "../wa";

/**
 * WhatsApp iOS berbahasa Indonesia untuk konten pendek: daftar "Chat" (baris bisa berubah jadi sudah dibalas) dan
 * layar percakapan (gelembung teks/foto, status "mengetik…", jam bilah status bisa diatur). Ukuran pt iOS x U.
 */
const pt = (n: number) => n * U;

export function BilahStatus({ jam }: { jam: string }) {
  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: pt(47), display: "flex", alignItems: "center", justifyContent: "space-between", padding: `${pt(6)}px ${pt(26)}px 0 ${pt(36)}px`, color: "#000", fontSize: pt(17), fontWeight: 600, zIndex: 5, fontVariantNumeric: "tabular-nums" }}>
      <span>{jam}</span>
      <span style={{ display: "flex", gap: pt(5), alignItems: "center" }}>
        <svg width={pt(17)} height={pt(11)} viewBox="0 0 34 22">{[0, 1, 2, 3].map((k) => <rect key={k} x={k * 9} y={16 - k * 5} width="6.5" height={6 + k * 5} rx="1.6" fill="#000" />)}</svg>
        <svg width={pt(25)} height={pt(12)} viewBox="0 0 50 23"><rect x="1" y="1" width="42" height="21" rx="6.5" fill="none" stroke="#000" strokeOpacity="0.4" strokeWidth="2" /><rect x="4" y="4" width="26" height="15" rx="4" fill="#000" /></svg>
      </span>
    </div>
  );
}

function Centang({ biru = true }: { biru?: boolean }) {
  return (
    <svg width={pt(17)} height={pt(11)} viewBox="0 0 16 11" aria-hidden style={{ flexShrink: 0 }}>
      <path d="M11.07.65 4.6 7.12 2.1 4.6l-.95.95L4.6 9 12 1.6zM15.05.65 8.6 7.12l-.6-.6-.95.95L8.6 9 16 1.6z" fill={biru ? WA.centang : "#8696a0"} />
    </svg>
  );
}

// ------------------------------------------------------------------ Daftar chat

export interface BarisObrolan {
  h: string;
  i: number;
  nama: string;
  isi: string;
  jam: string;
  belum: number;
  /** pratinjau setelah AI membalas */
  balas: string;
}

function Baris({ b, muncul, dibalas }: { b: BarisObrolan; muncul: number; dibalas: number }) {
  const sudah = dibalas > 0.5;
  return (
    <div style={{ height: pt(76) * muncul, opacity: muncul, overflow: "hidden" }}>
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: pt(12), height: pt(76), padding: `0 ${pt(16)}px`, background: `rgba(37,211,102,${0.16 * Math.sin(Math.min(1, dibalas) * Math.PI)})` }}>
        <Avatar huruf={b.h} i={b.i} ukuran={pt(52)} cincin="transparent" />
        <div style={{ flex: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", borderBottom: `1px solid ${WA.garis}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: pt(17), fontWeight: 600, color: WA.teks }}>{b.nama}</span>
            <span style={{ fontSize: pt(14), color: !sudah ? WA.hijauTua : WA.abu, fontWeight: !sudah ? 600 : 400 }}>{b.jam}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: pt(2) }}>
            <span style={{ display: "flex", alignItems: "center", gap: pt(3), fontSize: pt(15), color: sudah ? WA.abu : WA.teks, fontWeight: sudah ? 400 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: pt(250) }}>
              {sudah && <Centang />}
              {sudah ? b.balas : b.isi}
            </span>
            {!sudah && (
              <span style={{ minWidth: pt(20), height: pt(20), padding: `0 ${pt(6)}px`, boxSizing: "border-box", borderRadius: pt(10), background: WA.hijau, color: "#fff", fontSize: pt(13), fontWeight: 700, display: "grid", placeItems: "center" }}>{b.belum}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** `muncul[i]` 0..1 baris menyisip dari atas (baris terakhir di array = paling atas); `dibalas[i]` 0..1. */
export function DaftarObrolan({ baris, muncul, dibalas, jam, belumTotal }: { baris: BarisObrolan[]; muncul: number[]; dibalas: number[]; jam: string; belumTotal: number }) {
  const urut = baris.map((b, i) => ({ b, i })).reverse();
  return (
    <div style={{ position: "absolute", inset: 0, isolation: "isolate", background: "#fff", fontFamily: FONT_IOS }}>
      <BilahStatus jam={jam} />
      <div style={{ position: "absolute", top: pt(54), left: pt(16), right: pt(16), display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: pt(34), fontWeight: 800, color: "#000", letterSpacing: -0.5 }}>Chat</span>
        {belumTotal > 0 && (
          <span style={{ padding: `${pt(4)}px ${pt(12)}px`, borderRadius: pt(14), background: "#ff3b30", color: "#fff", fontSize: pt(16), fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{belumTotal} belum dibalas</span>
        )}
      </div>
      <div style={{ position: "absolute", top: pt(104), left: 0, right: 0, bottom: 0, overflow: "hidden", borderTop: `1px solid ${WA.garis}` }}>
        {urut.map(({ b, i }) => (
          <Baris key={b.nama} b={b} muncul={muncul[i] ?? 1} dibalas={dibalas[i] ?? 0} />
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Layar percakapan

export interface Pesan {
  dari: "pelanggan" | "saya";
  teks?: string;
  foto?: ReactNode;
  jam: string;
  /** 0..1 */
  muncul: number;
  ekor?: boolean;
}

function Gelembung({ p }: { p: Pesan }) {
  const saya = p.dari === "saya";
  const latar = saya ? WA.keluar : WA.masuk;
  return (
    <div style={{ display: "flex", justifyContent: saya ? "flex-end" : "flex-start", opacity: Math.min(1, p.muncul * 1.5), transform: `translateY(${(1 - p.muncul) * pt(26)}px) scale(${0.92 + p.muncul * 0.08})`, transformOrigin: saya ? "right bottom" : "left bottom", padding: `0 ${pt(10)}px`, marginTop: p.ekor ? pt(6) : 0 }}>
      <div style={{ position: "relative", maxWidth: "82%", padding: p.foto ? pt(4) : `${pt(6)}px ${pt(8)}px ${pt(5)}px ${pt(9)}px`, borderRadius: pt(10), borderTopLeftRadius: !saya && p.ekor ? 0 : pt(10), borderTopRightRadius: saya && p.ekor ? 0 : pt(10), background: latar, color: WA.teks, fontSize: pt(17), lineHeight: 1.3, boxShadow: "0 1px 0.5px rgba(11,20,26,0.13)", whiteSpace: "pre-line" }}>
        {p.ekor && (
          <svg width={pt(8)} height={pt(13)} viewBox="0 0 8 13" style={{ position: "absolute", top: 0, ...(saya ? { right: -pt(8) } : { left: -pt(8), transform: "scaleX(-1)" }) }} aria-hidden>
            <path d="M0 0h8L1.5 9C.6 10.2 0 11 0 13z" fill={latar} />
          </svg>
        )}
        {p.foto}
        {p.teks && <span>{p.teks}</span>}
        <span style={{ float: "right", display: "inline-flex", alignItems: "center", gap: pt(3), margin: p.foto ? `${pt(4)}px ${pt(4)}px 0 0` : `${pt(8)}px 0 -${pt(2)}px ${pt(10)}px`, fontSize: pt(11), color: WA.abu }}>
          {p.jam}
          {saya && <Centang />}
        </span>
      </div>
    </div>
  );
}

export function LayarObrolan({ nama, h, i, status, pesan, jam, sisipan }: { nama: string; h: string; i: number; status: ReactNode; pesan: Pesan[]; jam: string; sisipan?: ReactNode }) {
  return (
    <div style={{ position: "absolute", inset: 0, isolation: "isolate", background: WA.wallpaper, fontFamily: FONT_IOS }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: pt(99), background: "rgba(246,246,246,0.97)", borderBottom: "1px solid #d8d8d8", zIndex: 3 }}>
        <BilahStatus jam={jam} />
        <div style={{ position: "absolute", top: pt(47), left: pt(10), right: pt(14), height: pt(52), display: "flex", alignItems: "center", gap: pt(8) }}>
          <svg width={pt(26)} height={pt(26)} viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="#000" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <Avatar huruf={h} i={i} ukuran={pt(36)} cincin="transparent" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: pt(16), fontWeight: 600, color: "#000" }}>{nama}</div>
            <div style={{ fontSize: pt(12.5), color: WA.abu }}>{status}</div>
          </div>
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: pt(108), bottom: pt(56), display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: pt(4), overflow: "hidden", paddingBottom: pt(8) }}>
        {pesan.filter((p) => p.muncul > 0).map((p, k) => (
          <Gelembung key={k} p={p} />
        ))}
      </div>
      {sisipan}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: pt(56), background: WA.bilah, borderTop: "1px solid #d8d8d8", display: "flex", alignItems: "flex-start", gap: pt(10), padding: `${pt(10)}px ${pt(12)}px 0` }}>
        <span style={{ fontSize: pt(28), lineHeight: 1, color: "#000" }}>+</span>
        <div style={{ flex: 1, height: pt(34), borderRadius: pt(17), background: "#fff", border: "1px solid #e0e0e0" }} />
      </div>
    </div>
  );
}

/** Foto struk transfer m-banking (generik, tanpa merek bank). */
export function BuktiTransfer({ pindai = 0 }: { pindai?: number }) {
  return (
    <div style={{ position: "relative", width: pt(210), borderRadius: pt(8), overflow: "hidden", background: "linear-gradient(180deg,#eef4ff,#ffffff 40%)", padding: `${pt(14)}px ${pt(14)}px ${pt(12)}px`, boxSizing: "border-box", textAlign: "center", fontFamily: FONT_IOS }}>
      <div style={{ width: pt(40), height: pt(40), borderRadius: pt(20), background: "#16a34a", margin: "0 auto", display: "grid", placeItems: "center" }}>
        <svg width={pt(22)} height={pt(22)} viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
      <div style={{ marginTop: pt(8), fontSize: pt(14), fontWeight: 700, color: "#0f172a" }}>Transfer Berhasil</div>
      <div style={{ marginTop: pt(4), fontSize: pt(22), fontWeight: 800, color: "#0f172a" }}>Rp260.000</div>
      <div style={{ marginTop: pt(8), borderTop: "1px dashed #cbd5e1", paddingTop: pt(8), fontSize: pt(11.5), color: "#475569", lineHeight: 1.5, textAlign: "left" }}>
        <div>Ke: <b>GEPREK MANTUL</b></div>
        <div>Berita: 10 porsi lv 3</div>
        <div>04 Nov 2026 · 10.12</div>
      </div>
      {pindai > 0 && pindai < 1 && (
        <div style={{ position: "absolute", left: 0, right: 0, top: `${pindai * 100}%`, height: pt(26), marginTop: -pt(13), background: "linear-gradient(180deg, transparent, rgba(61,220,151,0.55), transparent)", borderBottom: "2px solid #3ddc97" }} />
      )}
    </div>
  );
}
