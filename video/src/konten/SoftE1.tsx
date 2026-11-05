import type { ReactNode } from "react";
import { AbsoluteFill, Audio, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT, Latar, Logo, halus, lepas, mendarat, t } from "../dasar";
import { WA } from "../wa";
import { type Gaya, MaskotPenuh, MaskotPose, Ucapan } from "./maskot";
import { type BarisObrolan, DaftarObrolan } from "./obrolan";
import { Judul } from "./teks";
import { AMPLITUDO_E1 } from "./vo-soft-e1";

/**
 * Soft selling E1 "Kamus Chat Pembeli" (KONSEP-SOFT-SELLING.md §6), 36 detik, 1080 x 1920, 30 fps.
 * Maskot Gercep menerjemahkan tiga chat pembeli ("P", "kak masih ada?", "nanti aku kabarin") jadi tips membalas chat;
 * produk hanya lewat di akhir (semua chat toko Bu Dewi terbalas siang-malam), CTA lembut "tag temen".
 *
 * VO: public/vo/soft-e1/take1.mp3 (ElevenLabs "Finn", eleven_v4). Waktu adegan = frame dari transkrip per kata
 * ElevenLabs Scribe, jadi animasi ditulis langsung dalam frame keluaran. Sound effect ElevenLabs di public/sfx/.
 */

export const DURASI_SOFT_E1 = 1080;

const muncul = (f: number, di: number, lama = 9) => t(f, [di, di + lama], [0, 1], mendarat);
const campur = (a: number, b: number, p: number) => a + (b - a) * p;

// ---------------------------------------------------------------- Tata letak (zona aman TikTok/Reels)

const KARTU = { x: 90, y: 300, w: 900, h: 700 };
const POSISI = {
  hook: { x: 290, y: 780, w: 500 },
  kamus: { x: 40, y: 1000, w: 380 },
  akhir: { x: 300, y: 640, w: 480 },
};
/** Batas adegan: hook, kenalan, kartu 1-3, toko Bu Dewi, penutup. */
const ADEGAN = { kenalan: 112, k1: 228, k2: 413, k3: 577, toko: 790, akhir: 968 };

// ---------------------------------------------------------------- Potongan teks & gelembung

function KataMuncul({ L, teks, aksen }: { L: number; teks: string; aksen: string }) {
  const kata = teks.split(" ");
  return (
    <>
      {kata.map((w, j) => {
        const p = t(L, [j * 3, j * 3 + 9], [0, 1], mendarat);
        const sorot = w.startsWith("*") && w.endsWith("*");
        return (
          <span key={j} style={{ display: "inline-block", whiteSpace: "pre", opacity: p, transform: `translateY(${(1 - p) * 26}px)`, color: sorot ? aksen : undefined }}>
            {sorot ? w.slice(1, -1) : w}
            {j < kata.length - 1 ? " " : ""}
          </span>
        );
      })}
    </>
  );
}

function ChatBesar({ p, teks, jam, ukuran = 64, dari = "pelanggan" }: { p: number; teks: string; jam: string; ukuran?: number; dari?: "pelanggan" | "saya" }) {
  const saya = dari === "saya";
  return (
    <div style={{ display: "flex", justifyContent: saya ? "flex-end" : "flex-start", opacity: p, transform: `scale(${0.7 + 0.3 * p})`, transformOrigin: saya ? "100% 100%" : "0 100%" }}>
      <div
        style={{
          maxWidth: 730,
          background: saya ? WA.keluar : WA.masuk,
          color: WA.teks,
          fontSize: ukuran,
          fontWeight: 700,
          lineHeight: 1.15,
          padding: "16px 28px 14px",
          borderRadius: 34,
          ...(saya ? { borderBottomRightRadius: 8 } : { borderBottomLeftRadius: 8 }),
          boxShadow: "0 10px 30px -12px rgba(0,0,0,0.35), 0 1px 0 rgba(0,0,0,0.06)",
        }}
      >
        {teks}
        <span style={{ fontSize: 26, fontWeight: 500, color: WA.abu, marginLeft: 18, whiteSpace: "nowrap" }}>
          {jam}
          {saya && <span style={{ color: WA.centang, marginLeft: 6 }}>✓✓</span>}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Kartu kamus

/** Kartu yang membalik masuk, bisa bergetar, lalu terlempar ke kiri saat adegan berikutnya mulai. */
function Panggung({ f, dari, sampai, getar = 0, latar, padding, children }: { f: number; dari: number; sampai: number; getar?: number; latar: string; padding: string; children: ReactNode }) {
  if (f < dari || f >= sampai) return null;
  const masuk = t(f, [dari, dari + 14], [0, 1], mendarat);
  const keluar = t(f, [sampai - 10, sampai], [0, 1], lepas);
  return (
    <div style={{ position: "absolute", left: KARTU.x, top: KARTU.y, width: KARTU.w, height: KARTU.h, zIndex: 10, perspective: 1800 }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 52,
          background: latar,
          overflow: "hidden",
          boxShadow: "0 50px 120px -30px rgba(0,0,0,0.85), 0 0 0 6px rgba(255,255,255,0.06)",
          transform: `translateX(${getar - keluar * 1100}px) rotateY(${(1 - masuk) * -75}deg) rotate(${keluar * -10 + (1 - masuk) * 4}deg) scale(${0.85 + 0.15 * masuk})`,
          opacity: masuk,
          padding,
          display: "flex",
          flexDirection: "column",
          fontFamily: FONT,
          color: "#0c1a14",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function KartuKamus({ f, dari, sampai, nomor, getar, children }: { f: number; dari: number; sampai: number; nomor: number; getar?: number; children: ReactNode }) {
  return (
    <Panggung f={f} dari={dari} sampai={sampai} getar={getar} latar="#fbf8f1" padding="34px 44px 40px">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 28, fontWeight: 800, letterSpacing: 3, color: C.hijauTua }}>
        <span>📖 KAMUS CHAT PEMBELI</span>
        <span style={{ background: "#0c1a14", color: "#fbf8f1", borderRadius: 999, padding: "6px 18px", letterSpacing: 1 }}>{nomor}/3</span>
      </div>
      {children}
    </Panggung>
  );
}

function ZonaChat({ children }: { children: ReactNode }) {
  return <div style={{ marginTop: 22, background: WA.wallpaper, borderRadius: 30, padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>{children}</div>;
}

function Artinya({ p }: { p: number }) {
  return (
    <div style={{ marginTop: 24, display: "flex", alignItems: "center", gap: 16, fontSize: 32, fontStyle: "italic", fontWeight: 600, color: "#6b7c74", opacity: p }}>
      artinya
      <span style={{ flex: 1, height: 3, borderRadius: 2, background: "#e4ded0", transformOrigin: "0 50%", transform: `scaleX(${p})` }} />
    </div>
  );
}

function Arti({ L, teks, aksen = C.hijauTua, ukuran = 62 }: { L: number; teks: string; aksen?: string; ukuran?: number }) {
  return (
    <div style={{ marginTop: 8, fontSize: ukuran, fontWeight: 800, lineHeight: 1.12, letterSpacing: -1 }}>
      <KataMuncul L={L} teks={teks} aksen={aksen} />
    </div>
  );
}

function Tips({ p, children }: { p: number; children: ReactNode }) {
  return (
    <div style={{ marginTop: "auto", background: "#dff7ea", color: "#0f6b45", borderRadius: 28, padding: "20px 28px", fontSize: 38, fontWeight: 800, lineHeight: 1.25, opacity: p, transform: `translateY(${(1 - p) * 30}px)` }}>
      {children}
    </div>
  );
}

/** "iya?" yang dicoret merah: contoh balasan yang jangan dipakai. */
function IyaDicoret({ f }: { f: number }) {
  const coret = t(f, [389, 397], [0, 1], mendarat);
  const cap = muncul(f, 395, 8);
  return (
    <span style={{ position: "relative", display: "inline-block", background: "#fff", color: WA.teks, borderRadius: 18, padding: "0 16px", fontWeight: 700, boxShadow: "0 4px 10px rgba(0,0,0,0.12)", transform: `rotate(${coret * -4}deg)` }}>
      iya?
      <span style={{ position: "absolute", left: -6, right: -6, top: "50%", height: 7, borderRadius: 4, background: "#e5484d", transformOrigin: "0 50%", transform: `scaleX(${coret}) rotate(-8deg)` }} />
      <span style={{ position: "absolute", right: -58, top: -44, fontSize: 56, opacity: cap, transform: `scale(${cap})` }}>🙅</span>
    </span>
  );
}

const getarDi = (f: number, di: number) => (f >= di && f < di + 20 ? Math.sin(f * 2.6) * 16 * (1 - (f - di) / 20) : 0);

function jamTelat(f: number) {
  const m = 21 * 60 + 4 + Math.round(t(f, [514, 540], [0, 120], halus));
  return `${Math.floor(m / 60)}.${String(m % 60).padStart(2, "0")}`;
}

function Kartu1({ f }: { f: number }) {
  return (
    <KartuKamus f={f} dari={ADEGAN.k1} sampai={ADEGAN.k2} nomor={1}>
      <ZonaChat>
        <ChatBesar p={muncul(f, 232, 10)} teks="P" jam="10.02" ukuran={96} />
      </ZonaChat>
      <Artinya p={muncul(f, 250)} />
      <Arti L={f - 269} teks="Aku di sini, tolong *perhatiin* aku 👀" />
      <Tips p={muncul(f, 341, 10)}>
        💡 Bales cepet, jangan cuma <IyaDicoret f={f} />
      </Tips>
    </KartuKamus>
  );
}

function Kartu2({ f }: { f: number }) {
  const kabur = muncul(f, 545, 10);
  return (
    <KartuKamus f={f} dari={ADEGAN.k2} sampai={ADEGAN.k3} nomor={2} getar={getarDi(f, 545)}>
      <ZonaChat>
        <ChatBesar p={muncul(f, 417, 10)} teks="kak, masih ada?" jam={jamTelat(f)} />
      </ZonaChat>
      <Artinya p={muncul(f, 436)} />
      <Arti L={f - 451} teks="Dia *udah* *mau* *beli* 🛒" ukuran={70} />
      <Tips p={muncul(f, 514, 10)}>⏰ Telat 2 jam → dia beli di sebelah 💸</Tips>
      {kabur > 0 && (
        <div style={{ position: "absolute", left: 56, right: 16, top: 330, transform: `rotate(-4deg) scale(${0.6 + kabur * 0.4})`, opacity: kabur, filter: "drop-shadow(0 18px 30px rgba(229,72,77,0.45))" }}>
          <ChatBesar p={1} teks="udah beli di tempat lain kak 🙏" jam="23.04" ukuran={42} />
        </div>
      )}
    </KartuKamus>
  );
}

function Kartu3({ f }: { f: number }) {
  return (
    <KartuKamus f={f} dari={ADEGAN.k3} sampai={ADEGAN.toko} nomor={3} getar={getarDi(f, 689)}>
      <ZonaChat>
        <ChatBesar p={muncul(f, 600, 10)} teks="nanti aku kabarin ya kak" jam="14.20" ukuran={50} />
      </ZonaChat>
      <Artinya p={muncul(f, 662)} />
      <div style={{ position: "relative", height: 172 }}>
        <div style={{ position: "absolute", inset: 0, opacity: 1 - t(f, [742, 750], [0, 1]) }}>
          <Arti L={f - 689} teks="Dia *kabur* 💔" aksen="#e5484d" ukuran={84} />
        </div>
        <div style={{ position: "absolute", inset: 0, opacity: muncul(f, 750, 10) }}>
          <div style={{ fontSize: 30, fontWeight: 700, color: "#6b7c74", margin: "12px 0 12px" }}>Coba bales gini:</div>
          <ChatBesar p={muncul(f, 754, 10)} dari="saya" teks="Siap kak! Buat acara apa nih? 😊" jam="14.21" ukuran={40} />
        </div>
      </div>
      <Tips p={muncul(f, 715, 10)}>💡 Kasih 1 pertanyaan, biar ngobrol lanjut</Tips>
    </KartuKamus>
  );
}

// ---------------------------------------------------------------- Toko Bu Dewi: produk lewat

const BARIS_TOKO: BarisObrolan[] = [
  { h: "P", i: 6, nama: "Mas P", isi: "P", jam: "12.01", belum: 3, balas: "Halo kak! Ada yang bisa dibantu? 😊" },
  { h: "R", i: 0, nama: "Kak Rina", isi: "kak, masih ada?", jam: "12.03", belum: 1, balas: "Masih ada kak! Mau berapa porsi? 🔥" },
  { h: "A", i: 1, nama: "Andi", isi: "nanti aku kabarin ya kak", jam: "12.04", belum: 1, balas: "Siap kak! Buat acara apa nih? 😊" },
  { h: "N", i: 4, nama: "Kak Nawar", isi: "bisa kurang dikit kak?", jam: "19.40", belum: 2, balas: "Harga sesuai menu ya kak, porsinya gede 😄" },
  { h: "S", i: 2, nama: "Sari", isi: "level 5 pedes ga kak?", jam: "20.12", belum: 1, balas: "Pedes banget kak, siap-siap 🥵" },
  { h: "W", i: 5, nama: "Wulan", isi: "kak besok buka jam brp?", jam: "02.00", belum: 1, balas: "Buka jam 10.00 kak, ditunggu ☀️" },
];
const MASUK_TOKO = [796, 802, 808, 913, 919, 931];
const BALAS_TOKO = [840, 848, 856, 924, 928, 945];

function KartuToko({ f }: { f: number }) {
  const k = 1.15;
  const m = MASUK_TOKO.map((d) => muncul(f, d, 8));
  const b = BALAS_TOKO.map((d) => t(f, [d, d + 8], [0, 1]));
  const belum = BARIS_TOKO.reduce((s, r, i) => s + (m[i] > 0.5 && b[i] < 0.5 ? r.belum : 0), 0);
  const jam = f < 913 ? "12.05" : f < 931 ? "20.12" : "02.00";
  return (
    <Panggung f={f} dari={ADEGAN.toko} sampai={ADEGAN.akhir} latar="#fff" padding="0">
      <div style={{ position: "absolute", left: 0, top: 0, width: KARTU.w / k, height: KARTU.h / k, transform: `scale(${k})`, transformOrigin: "0 0" }}>
        <DaftarObrolan baris={BARIS_TOKO} muncul={m} dibalas={b} jam={jam} belumTotal={belum} />
      </div>
    </Panggung>
  );
}

// ---------------------------------------------------------------- Hook: banjir "P"

const P_BESAR = [
  { di: 8, x: 110, y: 470, r: -8 },
  { di: 19, x: 650, y: 500, r: 7 },
  { di: 41, x: 390, y: 610, r: -3 },
];
const P_KECIL = ["P", "kak?", "P", "PPPP", "P", "halo?", "P", "kak 😡", "P", "P", "masih ada?", "P"].map((teks, i) => ({
  teks,
  di: 48 + i * 4,
  x: [60, 800, 150, 760, 40, 820, 250, 640, 70, 860, 300, 560][i],
  y: [880, 820, 1180, 1120, 700, 1320, 1400, 1380, 1050, 980, 460, 420][i],
}));

function BanjirP({ f }: { f: number }) {
  if (f > ADEGAN.kenalan + 4) return null;
  const pecah = t(f, [100, 114], [0, 1], lepas);
  const gelembung = (teks: string, ukuran: number, p: number, r: number, key: string, x: number, y: number) => (
    <div key={key} style={{ position: "absolute", left: x, top: y, zIndex: 11, transformOrigin: "0 100%", transform: `translateY(${-pecah * 120}px) scale(${p * (1 - pecah)}) rotate(${r}deg)`, opacity: 1 - pecah }}>
      <div style={{ background: "#fff", color: WA.teks, fontSize: ukuran, fontWeight: 800, padding: `${ukuran * 0.22}px ${ukuran * 0.45}px`, borderRadius: ukuran * 0.5, borderBottomLeftRadius: 8, boxShadow: "0 16px 40px -12px rgba(0,0,0,0.7)", whiteSpace: "nowrap" }}>{teks}</div>
    </div>
  );
  return (
    <>
      {P_KECIL.map((s, i) => gelembung(s.teks, 40, muncul(f, s.di, 8), Math.sin(f * 1.7 + i * 2) * 4, `k${i}`, s.x, s.y))}
      {P_BESAR.map((s, i) => gelembung("P", 150, muncul(f, s.di, 8), s.r + Math.sin(f * 1.3 + i) * 3, `b${i}`, s.x, s.y))}
    </>
  );
}

function Lencana({ f }: { f: number }) {
  const p = muncul(f, 122, 12);
  const keluar = t(f, [218, 226], [0, 1], lepas);
  if (p <= 0 || keluar >= 1) return null;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 360, display: "flex", justifyContent: "center", zIndex: 20, opacity: p * (1 - keluar), transform: `scale(${0.8 + p * 0.2})` }}>
      <span style={{ padding: "16px 34px", borderRadius: 999, background: C.kaca, border: `2px solid ${C.hijau}`, color: C.fg, fontSize: 42, fontWeight: 800 }}>
        📖 Kamus Chat Pembeli <span style={{ color: C.hijau }}>· Eps 1</span>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- Maskot

const POSE = [
  { sampai: 341, src: "explaining" },
  { sampai: 413, src: "mute-spam" },
  { sampai: 514, src: "step-back" },
  { sampai: 715, src: "knowledge-check" },
  { sampai: 790, src: "explaining" },
  { sampai: 980, src: "order-ready" },
];

function gayaMaskot(f: number): Gaya {
  if (f >= 46 && f < 72) return "lompat";
  if (f >= 112 && f < 228) return "lambai";
  if (f >= 838 && f < 870) return "senang";
  if (f >= 931 && f < 962) return "senang";
  if (f >= 980) return "lambai";
  return "diam";
}

function LapisMaskot({ f, mulut, semangat }: { f: number; mulut: number; semangat: number }) {
  const { fps } = useVideoConfig();
  if (f < 44) return null;
  const naik = spring({ frame: f - 46, fps, config: { damping: 10, stiffness: 150 } });
  const k1 = t(f, [228, 248], [0, 1], halus);
  const k2 = t(f, [968, 992], [0, 1], halus);
  const { hook, kamus, akhir } = POSISI;
  const x = campur(campur(hook.x, kamus.x, k1), akhir.x, k2);
  const y = campur(campur(hook.y, kamus.y, k1), akhir.y, k2) + (1 - naik) * 1000 - Math.sin(k2 * Math.PI) * 140;
  const w = campur(campur(hook.w, kamus.w, k1), akhir.w, k2);
  const punch = 1 + Math.sin(t(f, [232, 244], [0, 1]) * Math.PI) * 0.08 + Math.sin(t(f, [974, 986], [0, 1]) * Math.PI) * 0.08;
  // Saat pembeli kabur: badan merosot dan bergoyang sedih.
  const sedih = (f >= 545 && f < 577) || (f >= 689 && f < 715);
  const goyang = sedih ? ` rotate(${Math.sin(f / 2.4) * 3}deg) translateY(14px)` : "";
  const props = { f, mulut, semangat, gaya: gayaMaskot(f) };
  const pose = POSE.find((p) => f < p.sampai)?.src ?? "order-ready";
  return (
    <div style={{ position: "absolute", left: x, top: y, zIndex: 12, transformOrigin: "50% 100%", transform: `scale(${punch})${goyang}` }}>
      {f < 238 || f >= 980 ? <MaskotPenuh {...props} lebar={w} /> : <MaskotPose {...props} src={`avatars/poses/${pose}.png`} lebar={w} />}
    </div>
  );
}

// ---------------------------------------------------------------- Penutup

function Merek({ f }: { f: number }) {
  const p = muncul(f, 1000, 14);
  if (p <= 0) return null;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 1392, display: "flex", justifyContent: "center", zIndex: 20, opacity: p, transform: `translateY(${(1 - p) * 30}px)` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "14px 30px 14px 16px", borderRadius: 999, background: C.kaca, border: `2px solid ${C.garis}` }}>
        <Logo ukuran={62} />
        <span style={{ fontSize: 44, fontWeight: 800, letterSpacing: -1, color: C.fg }}>
          Chat<span style={{ color: C.hijau }}>GerCep</span>
        </span>
        <span style={{ fontSize: 30, fontWeight: 600, color: C.muted }}>· admin AI WhatsApp</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Suara

const SFX: { di: number; src: string; vol: number }[] = [
  ...P_BESAR.map((p) => ({ di: p.di, src: "notif", vol: 0.8 })),
  ...P_KECIL.filter((_, i) => i % 2 === 0).map((p) => ({ di: p.di, src: "notif", vol: 0.3 })),
  { di: 46, src: "boing", vol: 0.7 },
  { di: 122, src: "pop", vol: 0.6 },
  ...[ADEGAN.k1, ADEGAN.k2, ADEGAN.k3, ADEGAN.toko, ADEGAN.akhir].map((di) => ({ di: di - 4, src: "whoosh", vol: 0.5 })),
  { di: 269, src: "pop", vol: 0.45 },
  { di: 341, src: "pop", vol: 0.5 },
  { di: 389, src: "pop", vol: 0.6 },
  { di: 451, src: "pop", vol: 0.45 },
  { di: 514, src: "jam", vol: 0.6 },
  { di: 545, src: "notif", vol: 0.6 },
  { di: 600, src: "notif", vol: 0.45 },
  { di: 689, src: "sedih", vol: 0.5 },
  { di: 715, src: "pop", vol: 0.5 },
  { di: 754, src: "pop", vol: 0.45 },
  ...MASUK_TOKO.map((di) => ({ di, src: "notif", vol: 0.3 })),
  { di: 840, src: "kilau", vol: 0.6 },
  { di: 945, src: "kilau", vol: 0.5 },
  { di: 980, src: "boing", vol: 0.5 },
  { di: 1000, src: "pop", vol: 0.5 },
  { di: 1034, src: "kilau", vol: 0.4 },
];

// ---------------------------------------------------------------- Komposisi

export function SoftE1() {
  const f = useCurrentFrame();
  const mulut = AMPLITUDO_E1[f] ?? 0;
  // Rata-rata keras suara ±5 frame: "sedang bicara" yang halus untuk gerak kepala & tangan.
  let jumlah = 0;
  for (let i = f - 5; i <= f + 5; i++) jumlah += AMPLITUDO_E1[i] ?? 0;
  const semangat = Math.min(1, (jumlah / 11) * 1.4);
  return (
    <AbsoluteFill style={{ fontFamily: FONT, background: C.latar, overflow: "hidden" }}>
      <Latar frame={f} hijau={t(f, [200, 260], [0.2, 0.7])} />
      <BanjirP f={f} />
      <LapisMaskot f={f} mulut={mulut} semangat={semangat} />
      <Kartu1 f={f} />
      <Kartu2 f={f} />
      <Kartu3 f={f} />
      <KartuToko f={f} />
      <Judul f={f} dari={60} sampai={ADEGAN.kenalan} baris={[{ teks: 'Arti *"P"* menurut', ukuran: 92 }, { teks: "pembeli… 🤔", ukuran: 92 }]} top={220} />
      <Judul f={f} dari={115} sampai={ADEGAN.k1 - 2} baris={[{ teks: "Halo, aku *Gercep* 👋", ukuran: 88 }]} top={230} />
      <Judul f={f} dari={160} sampai={ADEGAN.k1 - 2} baris={[{ teks: "admin WA yang *nggak* *pernah* *tidur*", ukuran: 50, warna: C.muted }]} top={480} />
      <Lencana f={f} />
      <Judul f={f} dari={795} sampai={838} baris={[{ teks: "Di toko *Bu* *Dewi*…", ukuran: 76 }]} top={200} />
      <Judul f={f} dari={840} sampai={891} baris={[{ teks: "Semua chat *dibales* ✅", ukuran: 76 }]} top={200} />
      <Judul f={f} dari={893} sampai={912} baris={[{ teks: "☀️ *Siang*", ukuran: 76 }]} top={200} instan />
      <Judul f={f} dari={913} sampai={930} baris={[{ teks: "🌙 *Malem*", ukuran: 76 }]} top={200} instan />
      <Judul f={f} dari={931} sampai={966} baris={[{ teks: "🦉 *Jam* *2* *pagi* juga!", ukuran: 76 }]} top={200} />
      <Ucapan L={f - 840} durasi={50} lebar={530} style={{ left: 370, bottom: 1920 - 1110, zIndex: 18 }}>
        Semua aku bales! 😎
      </Ucapan>
      <Judul f={f} dari={970} sampai={DURASI_SOFT_E1 + 10} baris={[{ teks: "Tag temen yang sering", ukuran: 80 }, { teks: 'dapet *"P"* 👇', ukuran: 80 }]} top={220} />
      <Ucapan L={f - 1034} durasi={60} lebar={300} style={{ left: 630, bottom: 1920 - 720, zIndex: 21 }}>
        Dadah! 👋
      </Ucapan>
      <Merek f={f} />
      <Audio src={staticFile("vo/soft-e1/take1.mp3")} />
      {SFX.map((s, i) => (
        <Sequence key={i} from={s.di} durationInFrames={150} layout="none">
          <Audio src={staticFile(`sfx/${s.src}.wav`)} volume={s.vol} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
