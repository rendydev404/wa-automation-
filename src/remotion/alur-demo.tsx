import type { ReactNode } from "react";
import { AbsoluteFill, Easing, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { type Bahasa, LOKAL, type T, pembuatT } from "../lib/bahasa";
import { W } from "./chat-demo";

/**
 * Komposisi Remotion "cara kerja": tiga babak (sambungkan → beri pengetahuan → AI membalas), PANJANG_BABAK frame per
 * babak di 60 fps. Antar-babak memudar silang (babak berikutnya mulai SILANG frame lebih awal), semua gerak memakai
 * transform/opacity dan kurva ease-out halus. Bahasa teks layar dari input prop `bahasa` (bawaan "id").
 * Ringan untuk dirender tiap frame: QR satu <path> SVG (bukan ratusan elemen), tanpa filter blur yang dihitung ulang.
 */

export interface PropsAlurDemo {
  bahasa?: Bahasa;
  [k: string]: unknown;
}

export const ALUR_FPS = 60;
export const PANJANG_BABAK = 240;
export const ALUR_DURASI = PANJANG_BABAK * 3;
/** Lama pudar silang antar-babak (frame). */
const SILANG = 22;

const huruf = "var(--font-plus-jakarta), 'Plus Jakarta Sans', system-ui, sans-serif";

/**
 * Maskot robot ChatGerCep (assets/maskot/pose, dipotong & dikecilkan ke WebP di public/maskot, ±40 KB per pose):
 * "cek-product-knowledge" saat mempelajari file, "jempol" setelah semuanya dipahami. Rasio lebar/tinggi per pose.
 */
const MASKOT = {
  belajar: { src: staticFile("maskot/cek-product-knowledge.webp"), rasio: 239 / 640 },
  paham: { src: staticFile("maskot/jempol.webp"), rasio: 378 / 640 },
} as const;
const halus = Easing.bezier(0.16, 1, 0.3, 1);
const lembut = Easing.bezier(0.65, 0, 0.35, 1);
/** interpolate yang dijepit di kedua ujung (paling sering dipakai). */
const ip = (f: number, masuk: [number, number], keluar: [number, number], easing: (n: number) => number = halus) =>
  interpolate(f, masuk, keluar, { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing });

/** Pola QR semu yang tetap sama di setiap frame, sebagai satu path SVG (21×21 modul). */
const QR_PATH = (() => {
  let d = "";
  for (let y = 0; y < 21; y++)
    for (let x = 0; x < 21; x++) {
      let isi = (x * 7 + y * 13 + x * y * 3) % 5 < 2;
      for (const [a, b] of [[0, 0], [14, 0], [0, 14]]) {
        const lx = x - a;
        const ly = y - b;
        if (lx >= 0 && lx < 7 && ly >= 0 && ly < 7) isi = lx === 0 || lx === 6 || ly === 0 || ly === 6 || (lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4);
        else if (lx >= -1 && lx <= 7 && ly >= -1 && ly <= 7) isi = false;
      }
      if (isi) d += `M${x} ${y}h1v1h-1z`;
    }
  return d;
})();

function KodeQr({ ukuran, warna = W.ink }: { ukuran: number; warna?: string }) {
  return (
    <svg width={ukuran} height={ukuran} viewBox="0 0 21 21" shapeRendering="crispEdges" aria-hidden>
      <path d={QR_PATH} fill={warna} />
    </svg>
  );
}

/** Masuk (pudar + naik) di awal babak dan keluar (pudar + naik sedikit) di akhir, untuk pudar silang yang mulus. */
function Panggung({ awal, children }: { awal: number; children: ReactNode }) {
  const frame = useCurrentFrame();
  const total = PANJANG_BABAK + awal;
  const masuk = ip(frame, [0, SILANG + 8], [0, 1]);
  const keluar = ip(frame, [total - SILANG, total], [0, 1], lembut);
  return (
    <AbsoluteFill style={{ opacity: masuk * (1 - keluar), transform: `translateY(${(1 - masuk) * 26 - keluar * 18}px) scale(${0.985 + masuk * 0.015})` }}>
      {children}
    </AbsoluteFill>
  );
}

function Judul({ f, no, teks, sub, t }: { f: number; no: number; teks: string; sub: string; t: T }) {
  const a = ip(f, [0, 28], [0, 1]);
  const b2 = ip(f, [6, 36], [0, 1]);
  return (
    <div style={{ position: "absolute", left: 70, top: 58 }}>
      <div style={{ color: W.signal, fontSize: 21, fontWeight: 800, letterSpacing: 3.5, opacity: a, transform: `translateX(${(1 - a) * -24}px)` }}>
        {t("LANGKAH", "STEP")} {no}
      </div>
      <div style={{ color: W.fg, fontSize: 48, fontWeight: 800, marginTop: 6, letterSpacing: -1.2, opacity: a, transform: `translateX(${(1 - a) * -24}px)` }}>{teks}</div>
      <div style={{ color: W.muted, fontSize: 22, marginTop: 6, opacity: b2, transform: `translateX(${(1 - b2) * -16}px)` }}>{sub}</div>
    </div>
  );
}

/** Jendela browser sederhana (titik tiga + alamat) untuk menampilkan dashboard. */
function Jendela({ left, top, width, height, alamat, children, style }: { left: number; top: number; width: number; height: number; alamat: string; children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ position: "absolute", left, top, width, height, borderRadius: 22, background: "#f7f8f6", boxShadow: "0 30px 70px -20px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)", overflow: "hidden", ...style }}>
      <div style={{ height: 40, background: "#eceeeb", display: "flex", alignItems: "center", gap: 7, padding: "0 16px", borderBottom: "1px solid #e1e4e0" }}>
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <span key={c} style={{ width: 11, height: 11, borderRadius: 11, background: c }} />
        ))}
        <span style={{ marginLeft: 14, flex: 1, height: 24, borderRadius: 8, background: "#fff", color: "#6b7a72", fontSize: 13, display: "flex", alignItems: "center", padding: "0 12px" }}>🔒 {alamat}</span>
      </div>
      <div style={{ position: "relative", height: height - 40 }}>{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------- Babak 1: scan QR

function BabakQr({ t, awal }: { t: T; awal: number }) {
  const frame = useCurrentFrame();
  const f = frame - awal;
  const { fps } = useVideoConfig();
  const hp = spring({ frame: f - 30, fps, config: { damping: 200, mass: 1.1 } });
  const pindai = ip(f, [92, 150], [0, 1], lembut);
  const kilat = ip(f, [150, 156], [0, 1], Easing.linear) * (1 - ip(f, [156, 176], [0, 1], Easing.linear));
  const ok = ip(f, [158, 190], [0, 1]);
  const centang = spring({ frame: f - 164, fps, config: { damping: 14, stiffness: 140 } });
  const qrMuncul = ip(f, [10, 40], [0, 1]);
  return (
    <AbsoluteFill>
      <Judul f={f} no={1} t={t} teks={t("Scan QR, tersambung", "Scan the QR, you're in")} sub={t("Seperti WhatsApp Web. Tanpa aplikasi tambahan.", "Just like WhatsApp Web. No extra app needed.")} />
      <Jendela left={70} top={236} width={640} height={384} alamat="chatgercep.com/nomor/1">
        <div style={{ position: "absolute", left: 30, top: 26, color: "#101814", fontSize: 22, fontWeight: 800 }}>{t("Hubungkan WhatsApp", "Connect WhatsApp")}</div>
        <div style={{ position: "absolute", left: 30, top: 60, display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, color: ok > 0.5 ? W.aksen : "#9a6b00" }}>
          <span style={{ width: 9, height: 9, borderRadius: 9, background: ok > 0.5 ? W.signal : "#f5a524" }} />
          {ok > 0.5 ? t("Terhubung", "Connected") : t("Menunggu scan…", "Waiting for scan…")}
        </div>
        {/* QR -> centang */}
        <div style={{ position: "absolute", left: 30, top: 98, width: 220, height: 220, borderRadius: 18, background: "#fff", border: "1px solid #e3e7e2", display: "grid", placeItems: "center" }}>
          <div style={{ opacity: qrMuncul * (1 - ok), transform: `scale(${0.94 + qrMuncul * 0.06})` }}>
            <KodeQr ukuran={184} />
          </div>
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", opacity: ok }}>
            <div style={{ width: 118, height: 118, borderRadius: 118, background: W.signal, display: "grid", placeItems: "center", transform: `scale(${0.5 + centang * 0.5})`, boxShadow: "0 12px 40px -8px rgba(61,220,151,0.8)" }}>
              <svg width="58" height="58" viewBox="0 0 24 24" fill="none" stroke={W.ink} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12.5l4.5 4.5L19 7.5" strokeDasharray={24} strokeDashoffset={24 * (1 - ip(f, [168, 196], [0, 1]))} />
              </svg>
            </div>
          </div>
        </div>
        <div style={{ position: "absolute", left: 280, top: 104, right: 28, display: "grid", gap: 16 }}>
          {[t("Buka WhatsApp di HP", "Open WhatsApp on your phone"), t("Ketuk Perangkat tertaut", "Tap Linked devices"), t("Arahkan kamera ke kode", "Point the camera at the code")].map((s, i) => {
            const m = ip(f, [24 + i * 10, 54 + i * 10], [0, 1]);
            const selesai = ok > 0.5 || (i < 2 && f > 70 + i * 16);
            return (
              <div key={s} style={{ display: "flex", gap: 12, alignItems: "center", opacity: m, transform: `translateX(${(1 - m) * 14}px)`, color: "#26332c", fontSize: 17, fontWeight: 600 }}>
                <span style={{ width: 28, height: 28, borderRadius: 28, flexShrink: 0, display: "grid", placeItems: "center", fontSize: 14, fontWeight: 800, background: selesai ? W.signal : "#e9ede8", color: selesai ? W.ink : "#6b7a72" }}>{selesai ? "✓" : i + 1}</span>
                {s}
              </div>
            );
          })}
          <div style={{ marginTop: 8, borderRadius: 14, padding: "12px 14px", background: "#eefaf3", border: "1px solid #c9eedb", color: "#14532d", fontSize: 15, fontWeight: 700, opacity: ok, transform: `translateY(${(1 - ok) * 10}px)` }}>
            +62 812-3456-7890 · {t("aktif sekarang", "active now")}
          </div>
        </div>
      </Jendela>

      {/* HP dengan kamera pemindai */}
      <div style={{ position: "absolute", left: 828, top: 132, width: 262, height: 500, opacity: hp, transform: `translate(${(1 - hp) * 90}px, ${(1 - hp) * 30}px) rotate(${(1 - hp) * 8 - 3 + ok * 3}deg)` }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: 42, background: "#060c09", boxShadow: "0 40px 80px -20px rgba(0,0,0,0.75), inset 0 0 0 2px rgba(255,255,255,0.08)", padding: 10 }}>
          <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 33, overflow: "hidden", background: ok > 0.5 ? "#f6f6f3" : "#0d1512" }}>
            <div style={{ position: "absolute", left: "50%", top: 9, width: 74, height: 20, marginLeft: -37, borderRadius: 20, background: "#000", zIndex: 2 }} />
            {/* Layar kamera */}
            <div style={{ position: "absolute", inset: 0, opacity: 1 - ok }}>
              <div style={{ position: "absolute", top: 48, left: 0, right: 0, textAlign: "center", color: "#fff", fontSize: 15, fontWeight: 700 }}>{t("Tautkan perangkat", "Link a device")}</div>
              <div style={{ position: "absolute", left: 30, right: 30, top: 120, height: 182, borderRadius: 20, overflow: "hidden", background: "linear-gradient(160deg,#1c2a24,#0b1310)" }}>
                <div style={{ position: "absolute", left: 38, top: 18, transform: "perspective(400px) rotateX(14deg) rotateY(-10deg)", background: "#fff", padding: 6, borderRadius: 8, opacity: ip(f, [60, 90], [0, 1]) }}>
                  <KodeQr ukuran={110} />
                </div>
                {/* Sudut bidikan */}
                {[["left", "top"], ["right", "top"], ["left", "bottom"], ["right", "bottom"]].map(([h, v]) => (
                  <span key={h + v} style={{ position: "absolute", [h]: 10, [v]: 10, width: 26, height: 26, borderColor: W.signal, borderStyle: "solid", borderWidth: 0, [`border${v === "top" ? "Top" : "Bottom"}Width`]: 4, [`border${h === "left" ? "Left" : "Right"}Width`]: 4, borderRadius: 6 } as React.CSSProperties} />
                ))}
                <div style={{ position: "absolute", left: 12, right: 12, top: 12 + pindai * 154, height: 3, borderRadius: 3, background: W.signal, boxShadow: `0 0 18px 4px ${W.signal}`, opacity: pindai > 0 && pindai < 1 ? 1 : 0 }} />
                <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: kilat * 0.85 }} />
              </div>
              <div style={{ position: "absolute", left: 0, right: 0, top: 322, textAlign: "center", color: "rgba(255,255,255,0.7)", fontSize: 13 }}>{t("Arahkan ke kode QR", "Point at the QR code")}</div>
            </div>
            {/* Setelah tertaut */}
            <div style={{ position: "absolute", inset: 0, opacity: ok, padding: "56px 18px 0" }}>
              <div style={{ color: "#101814", fontSize: 18, fontWeight: 800 }}>{t("Perangkat tertaut", "Linked devices")}</div>
              <div style={{ marginTop: 16, borderRadius: 16, background: "#fff", padding: 14, display: "flex", gap: 12, alignItems: "center", boxShadow: "0 6px 20px -10px rgba(0,0,0,0.25)", transform: `translateY(${(1 - ok) * 14}px)` }}>
                <span style={{ width: 40, height: 40, borderRadius: 12, background: W.ink, color: W.signal, display: "grid", placeItems: "center", fontWeight: 900, fontSize: 15 }}>CG</span>
                <span>
                  <span style={{ display: "block", color: "#101814", fontSize: 15, fontWeight: 700 }}>ChatGerCep</span>
                  <span style={{ display: "block", color: W.aksen, fontSize: 12.5, fontWeight: 600 }}>{t("Aktif sekarang", "Active now")}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------- Babak 2: product knowledge

const dokumen = (t: T) => [
  { nama: t("Menu & harga.pdf", "Menu & prices.pdf"), ukuran: "1,2 MB", jenis: "PDF", warna: "#e5484d", karakter: 21_480 },
  { nama: t("Jam buka.txt", "Opening hours.txt"), ukuran: "2 KB", jenis: "TXT", warna: "#6c8fd6", karakter: 1_260 },
  { nama: t("FAQ pelanggan.md", "Customer FAQ.md"), ukuran: "38 KB", jenis: "MD", warna: "#3ddc97", karakter: 15_870 },
  { nama: t("Cara bayar.pdf", "Payment options.pdf"), ukuran: "640 KB", jenis: "PDF", warna: "#e5484d", karakter: 9_600 },
];

/** Titik di kurva bezier kuadrat (p0 -> p2 lewat titik kendali p1). */
const bezier = (u: number, p0: [number, number], p1: [number, number], p2: [number, number]): [number, number] => [
  (1 - u) ** 2 * p0[0] + 2 * (1 - u) * u * p1[0] + u ** 2 * p2[0],
  (1 - u) ** 2 * p0[1] + 2 * (1 - u) * u * p1[1] + u ** 2 * p2[1],
];

function BabakKnowledge({ t, b, awal }: { t: T; b: Bahasa; awal: number }) {
  const frame = useCurrentFrame();
  const f = frame - awal;
  const { fps } = useVideoConfig();
  const docs = dokumen(t);
  // Titik tujuan aliran data: dada maskot (logo di kaos).
  const ORB: [number, number] = [952, 352];
  const mulai = (i: number) => 34 + i * 30;
  const LAMA_UNGGAH = 46;
  // Progres unggah tiap file dihitung sekali per frame; penghitung karakter & "detak" AI diturunkan darinya.
  const progresFile = docs.map((_, i) => ip(f, [mulai(i) + 6, mulai(i) + 6 + LAMA_UNGGAH], [0, 1], Easing.bezier(0.33, 0, 0.2, 1)));
  const karakter = docs.reduce((n, d, i) => n + d.karakter * progresFile[i], 0);
  const berangkatTitik = (i: number, k: number) => mulai(i) + 6 + LAMA_UNGGAH * 0.35 + k * 7;
  const detak = docs.reduce((n, _, i) => n + [0, 1, 2, 3, 4].filter((k) => { const u = (f - berangkatTitik(i, k)) / 46; return u > 0.92 && u < 1.05; }).length, 0);
  return (
    <AbsoluteFill>
      <Judul f={f} no={2} t={t} teks={t("Beri pengetahuan", "Add your knowledge")} sub={t("Unggah PDF atau tulis teks. AI hanya menjawab dari sini.", "Upload PDFs or type it in. The AI answers only from this.")} />
      <Jendela left={70} top={236} width={600} height={384} alamat={t("chatgercep.com/nomor/1#knowledge", "chatgercep.com/nomor/1#knowledge")}>
        <div style={{ position: "absolute", left: 24, top: 20, color: "#101814", fontSize: 20, fontWeight: 800 }}>Product knowledge</div>
        <div style={{ position: "absolute", left: 24, right: 24, top: 56, height: 46, borderRadius: 14, border: "2px dashed #c9d3cd", color: "#6b7a72", fontSize: 14.5, fontWeight: 600, display: "grid", placeItems: "center", background: f > 26 && f < 130 ? "#f0faf5" : "transparent" }}>
          {t("Tarik file ke sini atau klik untuk mengunggah", "Drag files here or click to upload")}
        </div>
        {docs.map((d, i) => {
          const m = spring({ frame: f - mulai(i), fps, config: { damping: 200 } });
          const progres = progresFile[i];
          const siap = progres >= 1;
          return (
            <div key={d.nama} style={{ position: "absolute", left: 24, right: 24, top: 112 + i * 56, height: 48, borderRadius: 14, background: "#fff", border: "1px solid #e3e7e2", display: "flex", alignItems: "center", gap: 12, padding: "0 14px", opacity: m, transform: `translateY(${(1 - m) * -22}px) scale(${0.97 + m * 0.03})` }}>
              <span style={{ width: 34, height: 34, borderRadius: 9, background: d.warna, color: "#fff", fontSize: 10.5, fontWeight: 900, display: "grid", placeItems: "center", flexShrink: 0 }}>{d.jenis}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "flex", justifyContent: "space-between", color: "#101814", fontSize: 15, fontWeight: 700 }}>
                  {d.nama}
                  <span style={{ color: siap ? W.aksen : "#6b7a72", fontSize: 12.5, fontWeight: 700 }}>{siap ? t("✓ Siap", "✓ Ready") : `${Math.round(progres * 100)}%`}</span>
                </span>
                <span style={{ display: "block", marginTop: 6, height: 5, borderRadius: 5, background: "#e9ede8", overflow: "hidden" }}>
                  <span style={{ display: "block", height: "100%", width: `${progres * 100}%`, borderRadius: 5, background: siap ? W.signal : W.aksen }} />
                </span>
              </span>
              <span style={{ color: "#9aa69f", fontSize: 12, width: 52, textAlign: "right" }}>{d.ukuran}</span>
            </div>
          );
        })}
      </Jendela>

      {/* Aliran data dari tiap file yang selesai ke AI (kurva, beberapa titik bergiliran) */}
      {docs.flatMap((d, i) =>
        [0, 1, 2, 3, 4].map((k) => {
          const berangkat = berangkatTitik(i, k);
          const u = ip(f, [berangkat, berangkat + 46], [0, 1], Easing.bezier(0.5, 0, 0.3, 1));
          if (u <= 0 || u >= 1) return null;
          // Ujung kanan baris file i: jendela (top 236) + bilah alamat 40 + baris pertama 112 + setengah tinggi baris 24.
          const awalTitik: [number, number] = [672, 236 + 40 + 112 + 24 + i * 56];
          const [x, y] = bezier(u, awalTitik, [800, 262 + i * 46], ORB);
          return <span key={`${i}-${k}`} style={{ position: "absolute", left: x - 5, top: y - 5, width: 10, height: 10, borderRadius: 10, background: d.warna === "#e5484d" ? "#ffb4b6" : W.signal, opacity: Math.sin(u * Math.PI), boxShadow: `0 0 14px 3px ${W.signal}66` }} />;
        }),
      )}

      {/* Maskot robot: berpikir selagi file dipelajari, lalu mengacungkan jempol begitu semuanya dipahami. */}
      {(() => {
        const muncul = spring({ frame: f - 6, fps, config: { damping: 200 } });
        const selesai = mulai(docs.length - 1) + 6 + LAMA_UNGGAH + 4; // file terakhir selesai diunggah
        const paham = ip(f, [selesai, selesai + 16], [0, 1], lembut);
        const loncat = spring({ frame: f - selesai, fps, config: { damping: 9, stiffness: 160, mass: 0.7 } });
        const melayang = Math.sin(f / 26) * 5;
        const serap = Math.min(detak, 3) * 0.01;
        const TINGGI = 404;
        const dasarY = 574; // telapak kaki
        const pose = (p: (typeof MASKOT)[keyof typeof MASKOT], o: number, skala: number) => {
          const w = TINGGI * p.rasio;
          return (
            <Img
              src={p.src}
              style={{ position: "absolute", left: ORB[0] - w / 2, top: dasarY - TINGGI, width: w, height: TINGGI, opacity: o, transform: `scale(${skala})`, transformOrigin: "50% 100%" }}
            />
          );
        };
        return (
          <div style={{ position: "absolute", inset: 0, opacity: muncul, transform: `translateY(${(1 - muncul) * 30 + melayang}px)` }}>
            {/* Cahaya di belakang + cincin berputar pelan */}
            <div style={{ position: "absolute", left: ORB[0] - 190, top: 168, width: 380, height: 380, borderRadius: 380, background: "radial-gradient(circle, rgba(61,220,151,0.32), rgba(61,220,151,0.08) 55%, transparent 72%)", transform: `scale(${1 + serap * 2 + paham * 0.06})` }} />
            <div style={{ position: "absolute", left: ORB[0] - 150, top: 208, width: 300, height: 300, borderRadius: 300, background: `conic-gradient(from ${f * 1.6}deg, transparent 0 62%, rgba(61,220,151,0.55) 84%, rgba(167,243,208,0.7) 93%, transparent 100%)`, opacity: 0.5, WebkitMask: "radial-gradient(circle, transparent 66%, #000 67%)", mask: "radial-gradient(circle, transparent 66%, #000 67%)" }} />
            {/* Bayangan di lantai (tidak ikut melayang penuh) */}
            <div style={{ position: "absolute", left: ORB[0] - 86, top: dasarY - 10 - melayang, width: 172, height: 22, borderRadius: 172, background: "radial-gradient(ellipse, rgba(0,0,0,0.55), transparent 70%)", transform: `scale(${1 - melayang * 0.012})` }} />
            {pose(MASKOT.belajar, 1 - paham, 1 + serap)}
            {pose(MASKOT.paham, paham, 0.96 + loncat * 0.04)}
          </div>
        );
      })()}
      <div style={{ position: "absolute", left: ORB[0] - 200, width: 400, top: 588, textAlign: "center", color: W.fg, fontSize: 22, fontWeight: 700, opacity: ip(f, [30, 60], [0, 1]) }}>
        <span style={{ color: W.signal, fontVariantNumeric: "tabular-nums" }}>{Math.round(karakter).toLocaleString(LOKAL[b])}</span> {t("karakter dipelajari", "characters learned")}
      </div>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------- Babak 3: AI membalas

function Gelembung({ dari, teks, waktu, m, biru }: { dari: "pelanggan" | "ai"; teks: string; waktu: string; m: number; biru?: boolean }) {
  const ai = dari === "ai";
  return (
    <div style={{ display: "flex", flexShrink: 0, justifyContent: ai ? "flex-end" : "flex-start", maxHeight: m * 170, opacity: m, transform: `translateY(${(1 - m) * 16}px) scale(${0.96 + m * 0.04})`, transformOrigin: ai ? "right bottom" : "left bottom" }}>
      <div style={{ maxWidth: 360, borderRadius: 16, [ai ? "borderBottomRightRadius" : "borderBottomLeftRadius"]: 4, background: ai ? W.hijauGelembung : "#fff", padding: "10px 14px", color: "#101814", fontSize: 16, lineHeight: 1.4, boxShadow: "0 1px 1px rgba(0,0,0,0.06)" } as React.CSSProperties}>
        {ai && <span style={{ display: "block", color: W.aksen, fontSize: 11.5, fontWeight: 800, marginBottom: 2 }}>● AI · otomatis</span>}
        {teks}
        <span style={{ display: "block", textAlign: "right", color: "#8a9690", fontSize: 11.5, marginTop: 3 }}>
          {waktu} {ai && <span style={{ color: biru ? "#34b7f1" : "#8a9690", fontWeight: 700 }}>✓✓</span>}
        </span>
      </div>
    </div>
  );
}

function BabakBalas({ t, b, awal }: { t: T; b: Bahasa; awal: number }) {
  const frame = useCurrentFrame();
  const f = frame - awal;
  const { fps } = useVideoConfig();
  const s = (mulai: number) => spring({ frame: f - mulai, fps, config: { damping: 200, mass: 0.9 } });
  const ketik1 = f > 50 && f < 92;
  const ketik2 = f > 148 && f < 182;
  const dibalas = Math.round(ip(f, [24, 200], [0, 1284], Easing.bezier(0.25, 0.1, 0.25, 1)));
  const batang = [42, 58, 51, 74, 66, 88, 97];
  const titik = (k: number) => 0.35 + 0.65 * Math.max(0, Math.sin((f - k * 6) / 5));
  return (
    <AbsoluteFill>
      <Judul f={f} no={3} t={t} teks={t("AI membalas 24/7", "AI replies 24/7")} sub={t("Anda membalas sendiri? AI otomatis diam di chat itu.", "Reply yourself and the AI steps back in that chat.")} />
      {/* Chat WhatsApp */}
      <div style={{ position: "absolute", left: 70, top: 230, width: 560, height: 392, borderRadius: 24, overflow: "hidden", background: "#efeae2", boxShadow: "0 30px 70px -20px rgba(0,0,0,0.6)" }}>
        <div style={{ height: 62, background: "#0b5c47", display: "flex", alignItems: "center", gap: 12, padding: "0 18px", color: "#fff" }}>
          <span style={{ width: 38, height: 38, borderRadius: 38, background: "#f5a524", color: W.ink, display: "grid", placeItems: "center", fontWeight: 900, fontSize: 15 }}>BS</span>
          <span style={{ flex: 1 }}>
            <span style={{ display: "block", fontSize: 16, fontWeight: 700 }}>Bu Sari</span>
            <span style={{ display: "block", fontSize: 12.5, opacity: 0.85 }}>{ketik1 || ketik2 ? t("Toko sedang mengetik…", "Store is typing…") : t("online", "online")}</span>
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, background: "rgba(0,0,0,0.25)", borderRadius: 20, padding: "4px 10px" }}>🌙 23.14</span>
        </div>
        {/* Pesan terbaru di bawah; yang lama terdorong naik (seperti chat sungguhan), kelebihan di atas terpotong. */}
        <div style={{ position: "absolute", top: 62, bottom: 0, left: 0, right: 0, padding: 16, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 10, overflow: "hidden" }}>
          <Gelembung dari="pelanggan" m={s(14)} waktu="23.14" teks={t("Kak, nastar masih ada? Bisa kirim besok pagi?", "Hi, any pineapple tarts left? Can you deliver tomorrow morning?")} />
          {ketik1 && <Mengetik titik={titik} m={ip(f, [50, 60], [0, 1]) * (1 - ip(f, [86, 92], [0, 1]))} />}
          {f >= 92 && <Gelembung dari="ai" m={s(92)} biru={f > 128} waktu="23.14" teks={t("Masih ada kak! Nastar Rp85.000/toples, bisa dikirim besok jam 08.00. Mau pesan berapa? 🙂", "Yes we do! Tarts are Rp85,000 a jar, delivered tomorrow at 8 AM. How many would you like? 🙂")} />}
          {f >= 136 && <Gelembung dari="pelanggan" m={s(136)} waktu="23.15" teks={t("Mau 2 toples ya kak", "2 jars please")} />}
          {ketik2 && <Mengetik titik={titik} m={ip(f, [148, 158], [0, 1]) * (1 - ip(f, [176, 182], [0, 1]))} />}
          {f >= 182 && <Gelembung dari="ai" m={s(182)} biru={f > 210} waktu="23.15" teks={t("Siap! Total Rp170.000. Pesanan dicatat dan diteruskan ke pemilik toko ✅", "Done! Total Rp170,000. Order noted and forwarded to the owner ✅")} />}
        </div>
      </div>
      {/* Statistik */}
      <div style={{ position: "absolute", left: 690, top: 246, color: W.muted, fontSize: 21, fontWeight: 600, opacity: s(10) }}>{t("Pesan dibalas minggu ini", "Messages answered this week")}</div>
      <div style={{ position: "absolute", left: 686, top: 276, color: W.fg, fontSize: 92, fontWeight: 900, letterSpacing: -3, fontVariantNumeric: "tabular-nums", opacity: s(10) }}>{dibalas.toLocaleString(LOKAL[b])}</div>
      <div style={{ position: "absolute", left: 690, top: 396, display: "flex", gap: 10, opacity: s(40) }}>
        {[t("▲ 98% otomatis", "▲ 98% automated"), t("± 7 dtk / balasan", "± 7 s / reply")].map((x) => (
          <span key={x} style={{ borderRadius: 20, background: "rgba(61,220,151,0.12)", border: "1px solid rgba(61,220,151,0.3)", color: W.signal, fontSize: 16, fontWeight: 700, padding: "6px 12px" }}>{x}</span>
        ))}
      </div>
      <div style={{ position: "absolute", left: 690, right: 70, top: 450, height: 170, display: "flex", alignItems: "flex-end", gap: 14 }}>
        {batang.map((tinggi, i) => {
          const m = spring({ frame: f - 30 - i * 9, fps, config: { damping: 18, stiffness: 90 } });
          const akhir = i === batang.length - 1;
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <div style={{ width: "100%", height: `${tinggi * 1.35 * m}px`, borderRadius: 10, background: akhir ? `linear-gradient(180deg, #7af3bf, ${W.signal})` : "rgba(61,220,151,0.28)", boxShadow: akhir ? "0 0 24px rgba(61,220,151,0.45)" : "none" }} />
              <span style={{ color: akhir ? W.signal : W.muted, fontSize: 15, fontWeight: akhir ? 800 : 500 }}>{(b === "en" ? ["M", "T", "W", "T", "F", "S", "S"] : ["S", "S", "R", "K", "J", "S", "M"])[i]}</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

function Mengetik({ titik, m }: { titik: (k: number) => number; m: number }) {
  return (
    <div style={{ display: "flex", flexShrink: 0, justifyContent: "flex-end", maxHeight: m * 44, opacity: m }}>
      <div style={{ borderRadius: 16, borderBottomRightRadius: 4, background: W.hijauGelembung, padding: "12px 16px", display: "flex", gap: 6 }}>
        {[0, 1, 2].map((k) => (
          <span key={k} style={{ width: 8, height: 8, borderRadius: 8, background: W.aksen, opacity: titik(k), transform: `translateY(${-3 * titik(k)}px)` }} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Komposisi

export function AlurDemo({ bahasa = "id" }: PropsAlurDemo) {
  const t = pembuatT(bahasa);
  const frame = useCurrentFrame();
  const babak = [
    (awal: number) => <BabakQr t={t} awal={awal} />,
    (awal: number) => <BabakKnowledge t={t} b={bahasa} awal={awal} />,
    (awal: number) => <BabakBalas t={t} b={bahasa} awal={awal} />,
  ];
  return (
    <AbsoluteFill style={{ background: W.ink, fontFamily: huruf, overflow: "hidden" }}>
      {/* Unduh pose maskot sejak awal (tak terlihat) supaya babak 2 tidak menunggu gambar. */}
      <div aria-hidden style={{ position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden" }}>
        <Img src={MASKOT.belajar.src} style={{ width: 1 }} />
        <Img src={MASKOT.paham.src} style={{ width: 1 }} />
      </div>
      {/* Latar: cahaya lembut yang bergeser pelan + kisi */}
      <div style={{ position: "absolute", width: 760, height: 760, borderRadius: 760, left: -220 + Math.sin(frame / 120) * 40, top: -330 + Math.cos(frame / 140) * 30, background: "radial-gradient(circle, rgba(61,220,151,0.16), transparent 65%)" }} />
      <div style={{ position: "absolute", width: 620, height: 620, borderRadius: 620, right: -240, bottom: -300, background: "radial-gradient(circle, rgba(61,220,151,0.09), transparent 65%)" }} />
      <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(232,240,236,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(232,240,236,0.045) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
      {babak.map((isi, i) => {
        // Babak 2 & 3 mulai SILANG frame lebih awal: pudar masuknya bertumpuk dengan pudar keluar babak sebelumnya.
        const awal = i === 0 ? 0 : SILANG;
        return (
          <Sequence key={i} from={i * PANJANG_BABAK - awal} durationInFrames={PANJANG_BABAK + awal} premountFor={30}>
            <Panggung awal={awal}>{isi(awal)}</Panggung>
          </Sequence>
        );
      })}
      <div style={{ position: "absolute", left: 70, right: 70, bottom: 40, display: "flex", gap: 14 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ flex: 1, height: 6, borderRadius: 6, background: "rgba(232,240,236,0.12)", overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 6, background: W.signal, width: `${interpolate(frame, [i * PANJANG_BABAK, (i + 1) * PANJANG_BABAK], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}%` }} />
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
}
