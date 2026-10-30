import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Avatar, C, FONT, Kaca, Latar, Logo, TitikLive, halus, lepas, mendarat, t } from "./dasar";
import { HP, LayarBeranda, LayarKunci, Ponsel, WidgetLive } from "./ponsel";

/**
 * Motion graphic 16 detik (1080 x 1920, 30 fps), mengikuti alur & gaya video referensi:
 *   1. iPhone 3D masuk dari gelap -> layar kunci (notifikasi pelanggan) -> berputar ke depan -> beranda
 *   2. kamera mendorong ke widget "AI sedang membalas" yang lepas dan melayang
 *   3. chip filter (pilihan pindah ke "Dibalas AI") + kartu statistik
 *   4. kartu hijau "AI AKTIF" + daftar percakapan yang bergulir cepat
 *   5. kartu percakapan: balasan AI diketik, tombol kirim ditekan
 *   6. teks kinetik
 *   7. logo + nama produk
 * Adegan saling tumpang-tindih; perpindahan memakai blur + skala (zoom menembus) seperti referensi.
 */

export const DURASI = 480;

function Lapis({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", ...style }}>{children}</AbsoluteFill>;
}

/** Gaya keluar-masuk standar: blur + opasitas + skala. */
function fx(o: { opacity: number; blur: number; scale?: number; x?: number; y?: number; extra?: string }): CSSProperties {
  return {
    opacity: o.opacity,
    filter: o.blur > 0.05 ? `blur(${o.blur}px)` : undefined,
    transform: `translate(${o.x ?? 0}px, ${o.y ?? 0}px) scale(${o.scale ?? 1}) ${o.extra ?? ""}`,
  };
}

// ---------------------------------------------------------------- 1. Ponsel

function AdeganPonsel({ f }: { f: number }) {
  if (f > 112) return null;
  const putar = t(f, [0, 72], [1, 0], halus);
  const dorong = t(f, [70, 104], [0, 1], lepas);
  const skala = 0.7 + (1 - putar) * 0.24 + dorong * 1.5;
  const melayang = Math.sin(f / 18) * 6 * putar;
  // Titik tumpu = tengah widget (x 280, y 205 dari atas ponsel); saat didorong, titik itu dibawa ke tengah layar.
  const geserY = dorong * (HP.tinggi / 2 - 205);
  const beranda = t(f, [50, 64], [0, 1]);
  return (
    <Lapis>
      <div style={{ perspective: 2000, ...fx({ opacity: t(f, [0, 16], [0, 1]) * t(f, [90, 102], [1, 0]), blur: t(f, [0, 22], [18, 0]) + t(f, [84, 102], [0, 24]) }) }}>
        <div
          style={{
            transformStyle: "preserve-3d",
            transformOrigin: `${HP.lebar / 2}px 205px`,
            transform: `translateY(${putar * 140 + geserY + melayang}px) rotateY(${putar * -64}deg) rotateX(${putar * 26}deg) rotateZ(${putar * -16}deg) scale(${skala})`,
          }}
        >
          <Ponsel>
            <LayarKunci notif={t(f, [24, 40], [0, 1], mendarat)} />
            <div style={{ position: "absolute", inset: 0, opacity: beranda, transform: `scale(${1.06 - beranda * 0.06})` }}>
              <LayarBeranda frame={f} />
            </div>
          </Ponsel>
        </div>
      </div>
    </Lapis>
  );
}

// ---------------------------------------------------------------- 2. Widget melayang

function AdeganWidget({ f }: { f: number }) {
  const L = f - 92;
  if (L < 0 || L > 46) return null;
  const keluar = t(L, [28, 44], [0, 1], lepas);
  return (
    <Lapis>
      <div style={{ perspective: 1800 }}>
        <div
          style={{
            width: 860,
            ...fx({
              opacity: t(L, [2, 12], [0, 1]) * (1 - keluar),
              blur: t(L, [2, 14], [22, 0]) + keluar * 26,
              scale: t(L, [2, 18], [1.3, 1], mendarat) + keluar * 0.45,
              y: t(L, [0, 30], [0, -24]),
              extra: `rotateX(${t(L, [0, 30], [0, 7])}deg) rotateY(${t(L, [0, 30], [0, -6])}deg)`,
            }),
          }}
        >
          <WidgetLive frame={f} style={{ width: 860, boxSizing: "border-box" }} />
        </div>
      </div>
    </Lapis>
  );
}

// ---------------------------------------------------------------- 3. Chip + statistik

const CHIP = ["Semua", "Dibalas AI", "Manusia"];
const LEBAR_CHIP = [150, 228, 178];

function BarisChip({ L, pilih }: { L: number; pilih: number }) {
  // pilih: 0 = Semua, 1 = Dibalas AI (boleh pecahan selama berpindah)
  const kiri = (i: number) => LEBAR_CHIP.slice(0, i).reduce((a, b) => a + b + 16, 0);
  const x = kiri(0) + (kiri(1) - kiri(0)) * pilih;
  const w = LEBAR_CHIP[0] + (LEBAR_CHIP[1] - LEBAR_CHIP[0]) * pilih;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
      <Avatar huruf="A" i={3} ukuran={78} cincin="rgba(255,255,255,0.15)" style={{ opacity: t(L, [0, 10], [0, 1]) }} />
      <div style={{ position: "relative", display: "flex", gap: 16 }}>
        <div style={{ position: "absolute", left: x, top: 0, width: w, height: 76, borderRadius: 40, background: C.hijau, boxShadow: "0 10px 40px -8px rgba(61,220,151,0.6)" }} />
        {CHIP.map((c, i) => {
          const aktif = Math.max(0, 1 - Math.abs(pilih - i));
          return (
            <div
              key={c}
              style={{
                position: "relative",
                width: LEBAR_CHIP[i],
                height: 76,
                borderRadius: 40,
                display: "grid",
                placeItems: "center",
                fontSize: 30,
                fontWeight: 700,
                background: `rgba(255,255,255,${0.1 * (1 - aktif)})`,
                color: aktif > 0.5 ? "#06231a" : C.fg,
                ...fx({ opacity: t(L, [3 + i * 3, 13 + i * 3], [0, 1]), blur: 0, x: t(L, [3 + i * 3, 16 + i * 3], [40, 0], mendarat) }),
              }}
            >
              {c}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const STAT = [
  { label: "Pesan masuk", nilai: 68, akhiran: "", warna: "#6c8fd6" },
  { label: "Dibalas AI", nilai: 50, akhiran: "", warna: C.hijau },
  { label: "Rata-rata balas", nilai: 4, akhiran: " dtk", warna: "#f5b041" },
  { label: "Pelanggan", nilai: 128, akhiran: "", warna: "#c084fc" },
];

function AdeganStatistik({ f }: { f: number }) {
  const L = f - 124;
  if (L < 0 || L > 76) return null;
  const pilih = t(L, [24, 38], [0, 1], halus);
  const keluar = t(L, [56, 72], [0, 1], lepas);
  return (
    <Lapis>
      <div
        style={{
          width: 900,
          ...fx({
            opacity: t(L, [0, 14], [0, 1]) * t(L, [62, 74], [1, 0]),
            blur: t(L, [0, 14], [16, 0]) + keluar * 16,
            scale: t(L, [0, 20], [0.9, 1], mendarat),
            x: t(L, [0, 72], [30, -30], halus),
            y: keluar * -520,
          }),
        }}
      >
        <BarisChip L={L} pilih={pilih} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 26, marginTop: 44 }}>
          {STAT.map((s, i) => {
            const m = t(L, [8 + i * 4, 26 + i * 4], [0, 1], mendarat);
            const sorot = i === 1 ? pilih : 0;
            return (
              <Kaca
                key={s.label}
                style={{
                  padding: "34px 34px 30px",
                  borderColor: sorot > 0.5 ? "rgba(61,220,151,0.55)" : C.garis,
                  background: sorot > 0.5 ? "rgba(15,122,92,0.35)" : C.kaca,
                  ...fx({ opacity: m, blur: (1 - m) * 10, y: (1 - m) * 60, scale: 1 + sorot * 0.03 }),
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14, color: C.muted, fontSize: 28, fontWeight: 600 }}>
                  <span style={{ width: 18, height: 18, borderRadius: 6, background: s.warna }} />
                  {s.label}
                </div>
                <div style={{ color: C.fg, fontSize: 96, fontWeight: 800, letterSpacing: -2, marginTop: 10, fontVariantNumeric: "tabular-nums" }}>
                  {Math.round(t(L, [12 + i * 4, 44], [0, s.nilai], mendarat))}
                  <span style={{ fontSize: 44, color: C.muted }}>{s.akhiran}</span>
                </div>
              </Kaca>
            );
          })}
        </div>
      </div>
    </Lapis>
  );
}

// ---------------------------------------------------------------- 4. AI aktif + daftar percakapan

const DAFTAR = [
  { h: "R", nama: "Rina", isi: "Kak masih buka? Ada paket hemat?", ai: true },
  { h: "B", nama: "Budi", isi: "Ongkir ke Depok berapa ya?", ai: true },
  { h: "D", nama: "Dita", isi: "Jadwal Sabtu jam 10 masih ada?", ai: true },
  { h: "S", nama: "Sari", isi: "Sudah transfer ya kak 🙏", ai: false },
  { h: "A", nama: "Andi", isi: "Bisa COD ga kak?", ai: true },
  { h: "M", nama: "Maya", isi: "Menu yang paling laris apa?", ai: true },
  { h: "F", nama: "Fajar", isi: "Pesan 3 box untuk arisan", ai: true },
];

function AdeganDaftar({ f }: { f: number }) {
  const L = f - 182;
  if (L < 0 || L > 72) return null;
  const masuk = t(L, [0, 16], [0, 1], mendarat);
  const gulir = t(L, [26, 62], [0, 1], lepas);
  const laju = t(L, [36, 50], [0, 1]) * t(L, [60, 68], [1, 0]);
  return (
    <Lapis>
      <div style={{ width: 900, ...fx({ opacity: masuk * t(L, [58, 70], [1, 0]), blur: (1 - masuk) * 16 + t(L, [56, 70], [0, 12]), y: (1 - masuk) * 520 }) }}>
        <div style={{ ...fx({ opacity: 1, blur: 0, y: gulir * -380 }) }}>
          <div
            style={{
              borderRadius: 44,
              padding: "34px 36px",
              background: "linear-gradient(135deg, rgba(29,185,104,0.55), rgba(15,122,92,0.45))",
              border: "2px solid rgba(61,220,151,0.55)",
              boxShadow: "0 30px 120px -20px rgba(61,220,151,0.45)",
              color: C.fg,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 26, fontWeight: 800, letterSpacing: 2, color: "#bff7dc" }}>
              <TitikLive frame={f} ukuran={16} /> AI AKTIF
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 22 }}>
              <div style={{ display: "flex", alignItems: "center" }}>
                {["R", "B", "D", "A", "M"].map((h, i) => {
                  const p = t(L, [6 + i * 2, 16 + i * 2], [0, 1], mendarat);
                  return <Avatar key={h} huruf={h} i={i} ukuran={78} cincin="#1a6b4c" style={{ marginLeft: i ? -18 : 0, transform: `scale(${p})`, opacity: p }} />;
                })}
                <span style={{ marginLeft: 16, fontSize: 30, fontWeight: 700 }}>+12</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 24px", borderRadius: 40, border: "2px solid rgba(255,255,255,0.5)", fontSize: 28, fontWeight: 700 }}>
                <TitikLive frame={f} ukuran={14} /> 3 chat aktif
              </div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", margin: "48px 8px 22px", fontSize: 34, fontWeight: 700, color: C.fg }}>
            Percakapan terbaru <span style={{ color: C.muted, fontSize: 28, fontWeight: 600 }}>Lihat semua</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 18, filter: laju > 0.05 ? `blur(${laju * 9}px)` : undefined }}>
            {DAFTAR.map((d, i) => {
              const m = t(L, [10 + i * 3, 24 + i * 3], [0, 1], mendarat);
              return (
                <Kaca key={d.nama} style={{ display: "flex", alignItems: "center", gap: 24, padding: "24px 28px", borderRadius: 36, ...fx({ opacity: m, blur: 0, x: (1 - m) * 60 }) }}>
                  <Avatar huruf={d.h} i={i} ukuran={84} cincin="transparent" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 32, fontWeight: 700, color: C.fg }}>{d.nama}</div>
                    <div style={{ fontSize: 26, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.isi}</div>
                  </div>
                  <span style={{ padding: "8px 18px", borderRadius: 20, fontSize: 22, fontWeight: 800, background: d.ai ? "rgba(61,220,151,0.18)" : "rgba(245,176,65,0.18)", color: d.ai ? C.hijau : "#f5b041" }}>
                    {d.ai ? "AI" : "Anda"}
                  </span>
                </Kaca>
              );
            })}
          </div>
        </div>
      </div>
    </Lapis>
  );
}

// ---------------------------------------------------------------- 5. Kartu percakapan + kirim

const BALASAN = "Halo Kak! Buka sampai 22.00 ✨ Paket Hemat Rp25.000, mau diantar?";

function AdeganKirim({ f }: { f: number }) {
  const { fps } = useVideoConfig();
  const L = f - 240;
  if (L < 0 || L > 64) return null;
  const masuk = t(L, [0, 16], [0, 1], mendarat);
  const huruf = Math.round(t(L, [12, 40], [0, BALASAN.length], (x) => x));
  const zoom = t(L, [36, 52], [0, 1], halus);
  const tekan = spring({ frame: L - 46, fps, config: { damping: 9, stiffness: 220 } });
  const tombol = L < 46 ? 1 : 0.82 + tekan * 0.18 + Math.sin(Math.min(1, tekan) * Math.PI) * 0.12;
  const cincin = t(L, [46, 60], [0, 1], mendarat);
  const keluar = t(L, [54, 64], [0, 1], lepas);
  return (
    <Lapis>
      <div
        style={{
          width: 900,
          transformOrigin: "820px 760px",
          ...fx({
            opacity: masuk * (1 - keluar),
            blur: (1 - masuk) * 16 + keluar * 18,
            scale: (0.92 + masuk * 0.08) * (1 + zoom * 0.75) * (1 + keluar * 0.3),
            x: zoom * -180,
            y: zoom * -120,
          }),
        }}
      >
        <Kaca style={{ padding: "40px 40px 36px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <Avatar huruf="R" i={0} ukuran={92} cincin="transparent" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 36, fontWeight: 800, color: C.fg }}>Rina</div>
              <div style={{ fontSize: 26, color: C.muted }}>Dapur Bu Rini · baru saja</div>
            </div>
            <span style={{ display: "flex", alignItems: "center", gap: 10, color: C.hijau, fontSize: 24, fontWeight: 800 }}>
              <TitikLive frame={f} ukuran={12} /> AI
            </span>
          </div>
          <div style={{ color: C.muted, fontSize: 24, fontWeight: 700, margin: "34px 0 14px", letterSpacing: 1 }}>PESAN PELANGGAN</div>
          <div style={{ display: "inline-block", padding: "22px 28px", borderRadius: "30px 30px 30px 10px", background: "rgba(255,255,255,0.08)", color: C.fg, fontSize: 32 }}>
            Kak masih buka? Ada paket hemat? 🍗
          </div>
          <div style={{ display: "flex", gap: 14, margin: "24px 0 0" }}>
            {["❤️ 2", "⚡ AI 4 dtk"].map((r, i) => (
              <span key={r} style={{ padding: "8px 18px", borderRadius: 20, fontSize: 22, fontWeight: 700, background: i ? "rgba(61,220,151,0.16)" : "rgba(255,255,255,0.08)", color: i ? C.hijau : C.fg }}>
                {r}
              </span>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 34 }}>
            <div style={{ flex: 1, minHeight: 96, padding: "18px 28px", borderRadius: 34, background: "rgba(255,255,255,0.07)", border: `2px solid ${C.garis}`, color: C.fg, fontSize: 30, lineHeight: 1.35 }}>
              {BALASAN.slice(0, huruf)}
              <span style={{ opacity: huruf < BALASAN.length || f % 16 < 8 ? 1 : 0, color: C.hijau }}>|</span>
            </div>
            <div style={{ position: "relative", width: 104, height: 104 }}>
              <div style={{ position: "absolute", inset: 0, borderRadius: 104, border: `4px solid ${C.hijau}`, opacity: 1 - cincin, transform: `scale(${1 + cincin * 1.2})` }} />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: 104,
                  background: C.hijau,
                  display: "grid",
                  placeItems: "center",
                  transform: `scale(${tombol})`,
                  boxShadow: `0 0 ${30 + cincin * 60}px rgba(61,220,151,${0.45 + 0.4 * Math.sin(cincin * Math.PI)})`,
                }}
              >
                <svg width="50" height="50" viewBox="0 0 24 24" fill="#06231a">
                  <path d="M12 3 4 20l8-4 8 4z" />
                </svg>
              </div>
            </div>
          </div>
        </Kaca>
      </div>
    </Lapis>
  );
}

// ---------------------------------------------------------------- 6. Teks kinetik

/** Kata yang masuk dengan jarak huruf melebar lalu merapat (gaya referensi), tiap huruf menyala bergiliran. */
function Kata({ teks, L, mulai, warna = C.fg }: { teks: string; L: number; mulai: number; warna?: string }) {
  const rapat = t(L, [mulai, mulai + 16], [0.42, 0], mendarat);
  return (
    <span style={{ display: "inline-block", letterSpacing: `${rapat}em`, color: warna, filter: `blur(${t(L, [mulai, mulai + 10], [6, 0])}px)`, whiteSpace: "pre" }}>
      {[...teks].map((h, i) => (
        <span key={i} style={{ opacity: t(L, [mulai + i * 0.7, mulai + i * 0.7 + 7], [0, 1]) }}>
          {h}
        </span>
      ))}
    </span>
  );
}

function Baris({ L, dari, sampai, baris, ukuran = 84 }: { L: number; dari: number; sampai: number; baris: ReactNode[]; ukuran?: number }) {
  if (L < dari || L > sampai + 10) return null;
  const k = t(L, [sampai, sampai + 10], [0, 1], lepas);
  return (
    <Lapis>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, fontSize: ukuran, fontWeight: 800, letterSpacing: -1, lineHeight: 1.1, color: C.fg, ...fx({ opacity: 1 - k, blur: k * 16, scale: 1 + k * 0.08 }) }}>
        {baris.map((b, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 22 }}>
            {b}
          </div>
        ))}
      </div>
    </Lapis>
  );
}

function AdeganTeks({ f }: { f: number }) {
  const L = f - 302;
  if (L < 0 || L > 86) return null;
  return (
    <>
      <Baris
        L={L}
        dari={0}
        sampai={26}
        baris={[
          <>
            <Kata teks="Pelanggan" L={L} mulai={0} />
            <span style={{ display: "inline-flex" }}>
              {["R", "B", "D"].map((h, i) => {
                const p = t(L, [8 + i * 2, 16 + i * 2], [0, 1], mendarat);
                return <Avatar key={h} huruf={h} i={i} ukuran={84} style={{ marginLeft: i ? -20 : 0, transform: `scale(${p})`, opacity: p }} />;
              })}
            </span>
          </>,
          <>
            <Kata teks="dibalas" L={L} mulai={10} />
            <Kata teks="otomatis." L={L} mulai={15} warna={C.hijau} />
          </>,
        ]}
      />
      <Baris L={L} dari={36} sampai={52} ukuran={92} baris={[<Kata key="a" teks="Ambil alih" L={L} mulai={36} />, <Kata key="b" teks="kapan saja." L={L} mulai={41} warna={C.hijau} />]} />
      <Baris L={L} dari={62} sampai={76} ukuran={104} baris={[<Kata key="a" teks="Dalam hitungan" L={L} mulai={62} />, <Kata key="b" teks="detik." L={L} mulai={67} warna={C.hijau} />]} />
    </>
  );
}

// ---------------------------------------------------------------- 7. Logo

function AdeganLogo({ f }: { f: number }) {
  const { fps } = useVideoConfig();
  const L = f - 384;
  if (L < 0) return null;
  const muncul = spring({ frame: L, fps, config: { damping: 13, stiffness: 120 } });
  const buka = t(L, [16, 36], [0, 1], halus);
  const LEBAR_TEKS = 780;
  const sup = t(L, [32, 42], [0, 1], mendarat);
  const tag = t(L, [40, 54], [0, 1], mendarat);
  return (
    <Lapis style={{ opacity: t(L, [88, 96], [1, 0]) }}>
      <div style={{ display: "flex", alignItems: "center", transform: `translateX(${(1 - buka) * (LEBAR_TEKS / 2 + 13)}px)` }}>
        <div style={{ transform: `scale(${muncul})`, opacity: Math.min(1, muncul * 1.4) }}>
          <Logo ukuran={184} />
        </div>
        <div style={{ position: "relative", marginLeft: 26, width: LEBAR_TEKS * buka, overflow: "hidden", whiteSpace: "nowrap", height: 210, display: "flex", alignItems: "center" }}>
          <div style={{ color: C.fg, fontSize: 86, fontWeight: 800, letterSpacing: -2, lineHeight: 1.02, transform: `translateX(${(1 - buka) * -80}px)` }}>
            Asisten
            <br />
            WhatsApp
          </div>
          <span style={{ position: "absolute", left: 400, top: 22, padding: "4px 14px", borderRadius: 14, background: C.hijau, color: "#06231a", fontSize: 36, fontWeight: 800, opacity: sup, transform: `scale(${0.6 + sup * 0.4})` }}>AI</span>
        </div>
      </div>
      <div style={{ position: "absolute", top: 1130, left: 90, right: 90, textAlign: "center", ...fx({ opacity: tag, blur: (1 - tag) * 8, y: (1 - tag) * 20 }) }}>
        <div style={{ color: C.fg, fontSize: 44, fontWeight: 700, lineHeight: 1.3 }}>Pelanggan dibalas 24/7, Anda tetap pegang kendali.</div>
        <div style={{ color: C.hijau, fontSize: 40, fontWeight: 700, marginTop: 18, letterSpacing: 1 }}>wa.sukapost.tech</div>
      </div>
    </Lapis>
  );
}

export function Promo() {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ fontFamily: FONT, background: C.latar, overflow: "hidden" }}>
      <Latar frame={f} hijau={t(f, [96, 150], [0, 1])} />
      <AdeganPonsel f={f} />
      <AdeganWidget f={f} />
      <AdeganStatistik f={f} />
      <AdeganDaftar f={f} />
      <AdeganKirim f={f} />
      <AdeganTeks f={f} />
      <AdeganLogo f={f} />
    </AbsoluteFill>
  );
}
