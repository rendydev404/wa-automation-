import type { CSSProperties, ReactNode } from "react";
import { Img, staticFile } from "remotion";
import { C, FONT, mendarat, t } from "../dasar";

/**
 * Maskot robot ChatGerCep sebagai boneka berlapis, dua pose:
 *   - Maskot: setengah badan, dua tangan memberi isyarat (public/maskot/, dari avatars/chatgercep-robot-2d.png 1312x1199)
 *   - MaskotPenuh: badan utuh, tangan melambai, kaki & sepatu (public/maskot-full/, dari ...-full-body.png 1024x1536)
 * Tiap pose dipotong per bagian (skrip/potong-maskot*.py: kanvas sama besar, lubang di kaos ditambal inpaint) sehingga
 * tiap lapisan cukup diputar di sendinya. Kedip, mata senang, dan mulut digambar SVG di dalam lapisan kepala, jadi ikut
 * bergerak bersama kepala. Koordinat = piksel gambar asli pose masing-masing.
 */

export type Gaya = "diam" | "senang" | "geleng" | "lompat" | "lambai";

export interface PropsMaskot {
  f: number;
  lebar: number;
  /** 0..1 mulut bergerak (gerak buatan, dipakai bila tidak ada suara) */
  bicara?: number;
  /** 0..1 bukaan mulut dari keras suara VO pada frame ini */
  mulut?: number;
  /** 0..1 seberapa sedang berbicara (keras suara dihaluskan beberapa frame); menggerakkan kepala & tangan */
  semangat?: number;
  gaya?: Gaya;
  /** 0..1 pendar hijau di sekeliling (saat "menyerap" product knowledge) */
  pendar?: number;
  style?: CSSProperties;
}

type Titik = readonly [number, number];

interface Wajah {
  layar: string;
  mata: { cx: number; cy: number; rx: number; ry: number }[];
  /** ujung kiri & kanan garis atas mulut, kedalaman senyum asli, elips penutup */
  mulut: { kiri: Titik; kanan: Titik; dalam: number; tutup: { cx: number; cy: number; rx: number; ry: number } };
  /** skala garis mata/mulut terhadap pose setengah badan */
  k: number;
}

const HIJAU_WAJAH = "rgb(176,250,166)";

const asal = (g: { lebar: number; tinggi: number }, [x, y]: Titik) => `${(x / g.lebar) * 100}% ${(y / g.tinggi) * 100}%`;

function Lapis({ dir, nama, g, sendi, putar = 0, geser = [0, 0], children }: { dir: string; nama: string; g: { lebar: number; tinggi: number }; sendi: Titik; putar?: number; geser?: [number, number]; children?: ReactNode }) {
  return (
    <div style={{ position: "absolute", inset: 0, transformOrigin: asal(g, sendi), transform: `translate(${geser[0]}%, ${geser[1]}%) rotate(${putar}deg)` }}>
      <Img src={staticFile(`${dir}/${nama}.png`)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      {children}
    </div>
  );
}

/** Lapisan SVG wajah: kedip / mata senang, dan mulut yang membuka mengikuti suara. */
function LapisWajah({ g, w, f, gaya, mulut, semangat, bicara }: { g: { lebar: number; tinggi: number }; w: Wajah; f: number; gaya: Gaya; mulut?: number; semangat?: number; bicara: number }) {
  // Kedip tiap ±3 detik (4 frame), jedanya digeser tiap siklus supaya tidak berirama; mata senang menggantikan kedip.
  const fase = (f + Math.floor(f / 96) * 37) % 96;
  const senang = gaya === "senang";
  const mataGaris = senang || (fase >= 88 && fase < 92);

  // Mulut: diam = senyum asli; bicara = membuka-menutup mengikuti keras suara.
  const { kiri, kanan, dalam: asli, tutup } = w.mulut;
  const buka = mulut !== undefined ? (10 + mulut * 64) * w.k : (14 + (Math.sin(f * 0.9) * 0.5 + 0.5) * 30 + (Math.sin(f * 0.37 + 1) * 0.5 + 0.5) * 18) * w.k;
  const aktif = Math.min(1, mulut !== undefined ? (semangat ?? 1) * 3 : bicara);
  const dalam = asli + (buka - asli) * aktif;
  const lebarMulut = 1 + ((mulut ?? 0.4) - 0.4) * 0.14 * aktif;
  const tx = (kiri[0] + kanan[0]) / 2;
  const ty = (kiri[1] + kanan[1]) / 2;
  const id = `w${g.lebar}`;

  return (
    <svg viewBox={`0 0 ${g.lebar} ${g.tinggi}`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} aria-hidden>
      <defs>
        <radialGradient id={`${id}t`}>
          <stop offset="0.86" stopColor={w.layar} stopOpacity="1" />
          <stop offset="1" stopColor={w.layar} stopOpacity="0" />
        </radialGradient>
        <filter id={`${id}k`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={5 * w.k} result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {mataGaris &&
        w.mata.map((m, i) => {
          const l = m.rx * 0.68;
          return (
            <g key={i}>
              <ellipse cx={m.cx} cy={m.cy} rx={m.rx} ry={m.ry} fill={`url(#${id}t)`} />
              <path
                d={senang ? `M${m.cx - l} ${m.cy + 16 * w.k} Q${m.cx} ${m.cy - 34 * w.k} ${m.cx + l} ${m.cy + 16 * w.k}` : `M${m.cx - l} ${m.cy + 4 * w.k} Q${m.cx} ${m.cy + 30 * w.k} ${m.cx + l} ${m.cy + 4 * w.k}`}
                fill="none"
                stroke={HIJAU_WAJAH}
                strokeWidth={15 * w.k}
                strokeLinecap="round"
                filter={`url(#${id}k)`}
              />
            </g>
          );
        })}
      {aktif > 0.01 && (
        <g transform={`translate(${tx} ${ty}) scale(${lebarMulut} 1) translate(${-tx} ${-ty})`} opacity={Math.min(1, aktif * 4)}>
          <ellipse cx={tutup.cx} cy={tutup.cy} rx={tutup.rx} ry={tutup.ry} fill={`url(#${id}t)`} />
          <path d={`M${kiri[0]} ${kiri[1]} L${kanan[0]} ${kanan[1]} Q${tx} ${ty + dalam * 2} ${kiri[0]} ${kiri[1]} Z`} fill={HIJAU_WAJAH} strokeLinejoin="round" stroke={HIJAU_WAJAH} strokeWidth={8 * w.k} filter={`url(#${id}k)`} />
        </g>
      )}
    </svg>
  );
}

/** Gerak bersama kedua pose: mengambang, condong, lompat memantul (squash & stretch), kepala mengangguk/menggeleng. */
function gerakDasar(f: number, gaya: Gaya, ngomong: number, suku: number) {
  const senang = gaya === "senang" || gaya === "lompat";
  const loncat = senang ? Math.abs(Math.sin(f / 6)) : 0;
  const tapak = senang ? Math.max(0, 1 - loncat * 4) : 0;
  return {
    loncat,
    tubuh: `translateY(${Math.sin(f / 11) * 6 - loncat * 34}px) rotate(${Math.sin(f / 23) * 1.6 + ngomong * Math.sin(f / 7) * 1.2}deg) scale(${1 - loncat * 0.015 + tapak * 0.04}, ${1 + loncat * 0.03 - tapak * 0.05})`,
    napas: 1 + Math.sin(f / 14) * 0.012,
    kepalaPutar: Math.sin(f / 19) * 3 + ngomong * Math.sin(f / 4.3) * 3.5 + (gaya === "geleng" ? Math.sin(f / 2.2) * 10 : 0) + (senang || gaya === "lambai" ? Math.sin(f / 5) * 4 : 0),
    kepalaGeser: [Math.sin(f / 31) * 0.5, -suku * 0.9 + Math.sin(f / 14) * 0.25 - loncat * 0.6] as [number, number],
  };
}

function Bingkai({ lebar, tinggi, tubuh, pendar, style, children }: { lebar: number; tinggi: number; tubuh: string; pendar: number; style?: CSSProperties; children: ReactNode }) {
  return (
    <div style={{ position: "relative", width: lebar, height: tinggi, transformOrigin: "50% 100%", transform: tubuh, filter: "drop-shadow(0 30px 40px rgba(0,0,0,0.55))", ...style }}>
      {pendar > 0.01 && <div style={{ position: "absolute", left: "18%", right: "18%", top: "2%", height: "40%", borderRadius: "50%", background: C.hijau, filter: "blur(60px)", opacity: pendar * 0.55 }} />}
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- Pose setengah badan

const SETENGAH = { lebar: 1312, tinggi: 1199 };
const WAJAH_SETENGAH: Wajah = {
  layar: "rgb(28,36,41)",
  mata: [
    { cx: 577, cy: 315, rx: 64, ry: 60 },
    { cx: 805, cy: 280, rx: 64, ry: 62 },
  ],
  mulut: { kiri: [650, 375], kanan: [762, 366], dalam: 60, tutup: { cx: 706, cy: 398, rx: 78, ry: 52 } },
  k: 1,
};

export function Maskot({ f, lebar, bicara = 0, mulut, semangat, gaya = "diam", pendar = 0, style }: PropsMaskot) {
  const ngomong = semangat ?? bicara;
  const suku = mulut ?? (Math.sin(f * 0.9) * 0.5 + 0.5) * bicara;
  const senang = gaya === "senang" || gaya === "lompat";
  const d = gerakDasar(f, gaya, ngomong, suku);
  // Tangan kiri (telapak terbuka) memberi isyarat saat bicara, melambai saat senang, ikut menolak saat menggeleng.
  const lenganKiri = Math.sin(f / 17) * 3 + ngomong * (Math.sin(f / 5) * 8 + 4) + (senang ? Math.sin(f / 3) * 12 + 6 : 0) + (gaya === "geleng" ? Math.sin(f / 2.2) * 9 : 0);
  // Tangan kanan menunjuk-nunjuk mengikuti irama bicara.
  const lenganKanan = Math.sin(f / 21 + 1) * 2.5 + ngomong * Math.sin(f / 6 + 2) * 7 + (senang ? Math.sin(f / 4 + 1) * 7 + 3 : 0);
  const g = SETENGAH;
  return (
    <Bingkai lebar={lebar} tinggi={(lebar * g.tinggi) / g.lebar} tubuh={d.tubuh} pendar={pendar} style={style}>
      <Lapis dir="maskot" nama="lengan-kiri" g={g} sendi={[400, 800]} putar={lenganKiri} />
      <div style={{ position: "absolute", inset: 0, transformOrigin: asal(g, [656, 1199]), transform: `scaleY(${d.napas})` }}>
        <Lapis dir="maskot" nama="badan" g={g} sendi={[656, 1199]} />
        <Lapis dir="maskot" nama="lengan-kanan" g={g} sendi={[1050, 870]} putar={lenganKanan} />
        <Lapis dir="maskot" nama="baju-kanan" g={g} sendi={[656, 1199]} />
      </div>
      <Lapis dir="maskot" nama="kepala" g={g} sendi={[705, 535]} putar={d.kepalaPutar} geser={d.kepalaGeser}>
        <LapisWajah g={g} w={WAJAH_SETENGAH} f={f} gaya={gaya} mulut={mulut} semangat={semangat} bicara={bicara} />
      </Lapis>
    </Bingkai>
  );
}

// ---------------------------------------------------------------- Pose badan utuh

const PENUH = { lebar: 1024, tinggi: 1536 };
const WAJAH_PENUH: Wajah = {
  layar: "rgb(35,40,45)",
  mata: [
    { cx: 453, cy: 288, rx: 52, ry: 48 },
    { cx: 638, cy: 267, rx: 50, ry: 50 },
  ],
  mulut: { kiri: [512, 340], kanan: [598, 331], dalam: 47, tutup: { cx: 556, cy: 360, rx: 62, ry: 40 } },
  k: 0.8,
};

/** Kepala robot relatif terhadap lebar gambar (untuk menyamakan ukuran kepala kedua pose). */
export const KEPALA = {
  setengah: { lebar: 710 / SETENGAH.lebar, tengahX: 673 / SETENGAH.lebar, atas: 6 / SETENGAH.lebar },
  penuh: { lebar: 575 / PENUH.lebar, tengahX: 532 / PENUH.lebar, atas: 40 / PENUH.lebar },
  rasioPenuh: PENUH.tinggi / PENUH.lebar,
};

export function MaskotPenuh({ f, lebar, bicara = 0, mulut, semangat, gaya = "lambai", pendar = 0, style }: PropsMaskot) {
  const ngomong = semangat ?? bicara;
  const suku = mulut ?? (Math.sin(f * 0.9) * 0.5 + 0.5) * bicara;
  const d = gerakDasar(f, gaya, ngomong, suku);
  const lambai = gaya === "lambai" || gaya === "senang" || gaya === "lompat";
  // Tangan kanan robot (kiri layar) melambai dari bahu; saat tidak melambai ikut berisyarat mengikuti bicara.
  const lenganLambai = lambai ? Math.sin(f / 3.2) * 11 + 2 : Math.sin(f / 17) * 3 + ngomong * (Math.sin(f / 5) * 6 + 2);
  const lenganGantung = Math.sin(f / 19 + 1) * 2 + ngomong * Math.sin(f / 6 + 2) * 2.5 + d.loncat * 4;
  // Kaki: memindah tumpuan pelan; saat melompat kedua kaki menekuk sedikit ke dalam.
  const tumpu = Math.sin(f / 23) * 1.2;
  return (
    <Bingkai lebar={lebar} tinggi={lebar * KEPALA.rasioPenuh} tubuh={d.tubuh} pendar={pendar} style={style}>
      <Lapis dir="maskot-full" nama="kaki-kiri" g={PENUH} sendi={[450, 950]} putar={tumpu + d.loncat * 3} />
      <Lapis dir="maskot-full" nama="kaki-kanan" g={PENUH} sendi={[630, 950]} putar={-tumpu - d.loncat * 3} />
      <div style={{ position: "absolute", inset: 0, transformOrigin: asal(PENUH, [548, 940]), transform: `scaleY(${d.napas})` }}>
        <Lapis dir="maskot-full" nama="lengan-kiri" g={PENUH} sendi={[340, 670]} putar={lenganLambai} />
        <Lapis dir="maskot-full" nama="lengan-kanan" g={PENUH} sendi={[760, 705]} putar={lenganGantung} />
        <Lapis dir="maskot-full" nama="badan" g={PENUH} sendi={[548, 940]} />
      </div>
      <Lapis dir="maskot-full" nama="kepala" g={PENUH} sendi={[548, 455]} putar={d.kepalaPutar} geser={d.kepalaGeser}>
        <LapisWajah g={PENUH} w={WAJAH_PENUH} f={f} gaya={gaya} mulut={mulut} semangat={semangat} bicara={bicara} />
      </Lapis>
    </Bingkai>
  );
}

/**
 * Wajah tiap gambar pose (avatars/poses/*.png, 1024x1536): letak kepala & ekspresi berbeda-beda, jadi mulut dan mata
 * diukur per gambar dari piksel hijau layar. Mata kosong = tidak berkedip (mata terpejam / kelopak setengah turun).
 */
const WAJAH_POSE: Record<string, Wajah> = {
  explaining: {
    layar: "rgb(39,43,49)",
    mata: [
      { cx: 442, cy: 286, rx: 51, ry: 49 },
      { cx: 619, cy: 272, rx: 49, ry: 49 },
    ],
    mulut: { kiri: [495, 342], kanan: [579, 336], dalam: 47, tutup: { cx: 537, cy: 362, rx: 62, ry: 42 } },
    k: 0.78,
  },
  "knowledge-check": {
    layar: "rgb(36,42,49)",
    mata: [
      { cx: 450, cy: 287, rx: 48, ry: 46 },
      { cx: 622, cy: 243, rx: 51, ry: 48 },
    ],
    mulut: { kiri: [530, 343], kanan: [592, 325], dalam: 30, tutup: { cx: 561, cy: 342, rx: 51, ry: 33 } },
    k: 0.68,
  },
  "mute-spam": {
    layar: "rgb(37,42,47)",
    mata: [
      { cx: 453, cy: 292, rx: 45, ry: 47 },
      { cx: 620, cy: 253, rx: 49, ry: 50 },
    ],
    mulut: { kiri: [518, 338], kanan: [590, 325], dalam: 26, tutup: { cx: 554, cy: 339, rx: 56, ry: 30 } },
    k: 0.7,
  },
  "order-ready": {
    layar: "rgb(37,39,44)",
    mata: [
      { cx: 431, cy: 281, rx: 50, ry: 49 },
      { cx: 611, cy: 269, rx: 50, ry: 49 },
    ],
    mulut: { kiri: [476, 334], kanan: [570, 325], dalam: 51, tutup: { cx: 523, cy: 353, rx: 67, ry: 44 } },
    k: 0.85,
  },
  "reading-proof": {
    layar: "rgb(35,39,46)",
    mata: [
      { cx: 433, cy: 344, rx: 55, ry: 48 },
      { cx: 599, cy: 344, rx: 54, ry: 48 },
    ],
    mulut: { kiri: [485, 402], kanan: [548, 402], dalam: 16, tutup: { cx: 516, cy: 411, rx: 51, ry: 25 } },
    k: 0.65,
  },
  "sleepy-night": {
    layar: "rgb(39,42,48)",
    mata: [],
    mulut: { kiri: [510, 337], kanan: [591, 329], dalam: 29, tutup: { cx: 550, cy: 345, rx: 60, ry: 32 } },
    k: 0.75,
  },
  "step-back": {
    layar: "rgb(38,42,48)",
    mata: [],
    mulut: { kiri: [405, 350], kanan: [478, 333], dalam: 28, tutup: { cx: 441, cy: 349, rx: 56, ry: 32 } },
    k: 0.7,
  },
};

/** Pose badan utuh yang digambar khusus untuk momen cerita, dengan gerak badan dan mulut tetap mengikuti VO. */
export function MaskotPose({ src, f, lebar, bicara = 0, mulut, semangat, gaya = "diam", pendar = 0, style }: PropsMaskot & { src: string }) {
  const ngomong = semangat ?? bicara;
  const suku = mulut ?? (Math.sin(f * 0.9) * 0.5 + 0.5) * bicara;
  const d = gerakDasar(f, gaya, ngomong, suku);
  const wajah = WAJAH_POSE[src.replace(/^.*\//, "").replace(/\.png$/, "")] ?? WAJAH_PENUH;
  return (
    <Bingkai lebar={lebar} tinggi={lebar * KEPALA.rasioPenuh} tubuh={d.tubuh} pendar={pendar} style={style}>
      <Img src={staticFile(src)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      <LapisWajah g={PENUH} w={wajah} f={f} gaya={gaya} mulut={mulut} semangat={semangat} bicara={bicara} />
    </Bingkai>
  );
}

/** Gelembung ucapan maskot: putih, ekor di kiri bawah, muncul memantul lalu teks diketik. */
export function Ucapan({ L, durasi, children, lebar = 560, ekor = "kiri", style }: { L: number; durasi: number; children: ReactNode; lebar?: number; ekor?: "kiri" | "kanan" | "bawah"; style?: CSSProperties }) {
  if (L < 0 || L > durasi) return null;
  const masuk = t(L, [0, 12], [0, 1], mendarat);
  const keluar = t(L, [durasi - 8, durasi], [0, 1]);
  const s = (0.6 + masuk * 0.4) * (1 - keluar * 0.15);
  const asalUcap = ekor === "kiri" ? "0% 100%" : ekor === "kanan" ? "100% 100%" : "50% 100%";
  return (
    <div style={{ position: "absolute", width: lebar, transformOrigin: asalUcap, transform: `scale(${s})`, opacity: masuk * (1 - keluar), ...style }}>
      <div style={{ position: "relative", background: "#fff", color: "#0c1a14", borderRadius: 40, padding: "26px 34px", fontFamily: FONT, fontSize: 42, fontWeight: 800, lineHeight: 1.22, letterSpacing: -0.5, boxShadow: "0 24px 60px -20px rgba(0,0,0,0.7)" }}>
        {children}
        <svg width="54" height="40" viewBox="0 0 54 40" style={{ position: "absolute", bottom: -32, ...(ekor === "kiri" ? { left: 46 } : ekor === "kanan" ? { right: 46, transform: "scaleX(-1)" } : { left: "50%", marginLeft: -27 }) }} aria-hidden>
          <path d="M0 0h54C40 6 26 18 8 40 12 24 10 10 0 0z" fill="#fff" />
        </svg>
      </div>
    </div>
  );
}
