import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Avatar, C, FONT, Kaca, Latar, Logo, TitikLive, halus, lepas, mendarat, t } from "./dasar";
import { LayarBeranda, LayarKunci, POS_WA, Ponsel, Sentuh } from "./ponsel";
import { type BarisChat, DaftarChat, LayarChat, type PesanWa, U } from "./wa";

/**
 * Motion graphic 25 detik (1080 x 1920, 30 fps), teks bahasa Inggris, alur & gaya mengikuti video referensi:
 *   1. iPhone 3D masuk dari gelap -> layar kunci (notifikasi WhatsApp dari pelanggan) -> berputar ke depan -> beranda
 *      iOS -> jari mengetuk WhatsApp -> aplikasi terbuka (animasi iOS)
 *   2. daftar Chats WhatsApp: chat Rina masuk di atas, diketuk -> layar percakapan bergeser masuk
 *   3. percakapan: AI membalas sambil mengutip pesan pelanggan, centang jadi biru, kartu "Replied by AI in 4s" dan
 *      "Order forwarded" melayang di samping ponsel
 *   4. kamera menembus ponsel ke dasbor: chip filter + statistik (termasuk spam yang diblokir)
 *   5. teks kinetik  6. logo + nama produk
 */

export const DURASI = 750;

function Lapis({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", ...style }}>{children}</AbsoluteFill>;
}

function fx(o: { opacity: number; blur: number; scale?: number; x?: number; y?: number; extra?: string }): CSSProperties {
  return {
    opacity: o.opacity,
    filter: o.blur > 0.05 ? `blur(${o.blur}px)` : undefined,
    transform: `translate(${o.x ?? 0}px, ${o.y ?? 0}px) scale(${o.scale ?? 1}) ${o.extra ?? ""}`,
  };
}

// ---------------------------------------------------------------- Data WhatsApp

const CHAT_LAIN: BarisChat[] = [
  { h: "B", i: 1, nama: "Budi", isi: "Your order is on the way! 🛵", jam: "9:12", kirim: true },
  { h: "D", i: 2, nama: "Dita", isi: "Saturday 10 AM, please", jam: "8:55", belum: 1 },
  { h: "S", i: 3, nama: "Sari", isi: "📷 Photo", jam: "8:40" },
  { h: "A", i: 4, nama: "Andi", isi: "Can I pay cash on delivery?", jam: "Yesterday", kirim: true },
  { h: "M", i: 5, nama: "Maya", isi: "Thanks a lot! 🙌", jam: "Yesterday" },
  { h: "F", i: 6, nama: "Fajar", isi: "3 boxes for Sunday", jam: "Tuesday", kirim: true },
  { h: "N", i: 0, nama: "Nadia", isi: "Is the spicy one still available?", jam: "Monday" },
];
const CHAT_RINA: BarisChat = { h: "R", i: 0, nama: "Rina", isi: "Any combo deals? 🍗", jam: "9:41", belum: 2 };

const BALAS_1 = "Hi Rina! 👋 We're open until 10 PM. Combo Deal: rice + grilled chicken + iced tea, just Rp25,000. Delivery or pick-up?";
const BALAS_2 = "Got it! Delivery fee is Rp8,000, ready in about 30 min. Your order has been passed to our team ✅";

// ---------------------------------------------------------------- 1-3. Ponsel (satu ponsel, kamera bergerak)

function AdeganPonsel({ f }: { f: number }) {
  if (f > 496) return null;
  const putar = t(f, [0, 84], [1, 0], halus);
  const melayang = Math.sin(f / 18) * 6 * putar;
  const dekat = t(f, [150, 210], [0, 1], halus); // dorong saat WhatsApp terbuka
  const chat = t(f, [238, 290], [0, 1], halus); // seluruh ponsel terlihat, sedikit lebih besar
  const tembus = t(f, [468, 494], [0, 1], lepas); // kamera menembus ke dasbor
  const skala = 0.74 + (1 - putar) * 0.18 + dekat * 0.2 + chat * 0.18 + tembus * 1.4;
  const geserY = -dekat * 20 - chat * 30;

  // Isi layar
  const beranda = t(f, [86, 100], [0, 1]);
  const tekan = Math.sin(t(f, [118, 134], [0, 1], (x) => x) * Math.PI);
  const buka = t(f, [130, 156], [0, 1], mendarat);
  const rinaMasuk = t(f, [174, 192], [0, 1], mendarat);
  const sorot = Math.sin(t(f, [222, 240], [0, 1], (x) => x) * Math.PI);
  const dorongChat = t(f, [236, 258], [0, 1], halus);
  const ketik = f >= 335 && f < 352;

  const pesan: PesanWa[] = [
    { dari: "pelanggan", teks: "Hi! Are you open today?", jam: "9:41", muncul: 1, ekor: true },
    { dari: "pelanggan", teks: "Any combo deals? 🍗", jam: "9:41", muncul: 1 },
    { dari: "saya", teks: BALAS_1, jam: "9:41", muncul: t(f, [300, 314], [0, 1], mendarat), dibaca: f > 330, kutip: { nama: "Rina", teks: "Any combo deals? 🍗" }, ekor: true },
    { dari: "pelanggan", teks: "Delivery please, Jl. Melati 5 🙏", jam: "9:42", muncul: t(f, [352, 366], [0, 1], mendarat), ekor: true },
    { dari: "saya", teks: BALAS_2, jam: "9:42", muncul: t(f, [388, 402], [0, 1], mendarat), dibaca: f > 418, ekor: true },
  ];

  return (
    <Lapis>
      <div style={{ perspective: 2000, ...fx({ opacity: t(f, [0, 16], [0, 1]) * (1 - tembus), blur: t(f, [0, 22], [18, 0]) + tembus * 26 }) }}>
        <div
          style={{
            transformStyle: "preserve-3d",
            transform: `translateY(${putar * 140 + melayang + geserY}px) rotateY(${putar * -64}deg) rotateX(${putar * 26}deg) rotateZ(${putar * -16}deg) scale(${skala})`,
          }}
        >
          <Ponsel>
            <LayarKunci notif={t(f, [36, 54], [0, 1], mendarat)} />
            {beranda > 0 && (
              <div style={{ position: "absolute", inset: 0, opacity: beranda, transform: `scale(${1.06 - beranda * 0.06})` }}>
                <LayarBeranda tekan={tekan} />
              </div>
            )}
            {buka > 0 && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  overflow: "hidden",
                  transformOrigin: `${POS_WA.x}px ${POS_WA.y}px`,
                  transform: `scale(${0.12 + buka * 0.88})`,
                  borderRadius: (1 - buka) * 120,
                  opacity: t(f, [130, 140], [0, 1]),
                }}
              >
                <div style={{ position: "absolute", inset: 0, transform: `translateX(${-dorongChat * 30}%)`, filter: dorongChat > 0 ? `brightness(${1 - dorongChat * 0.15})` : undefined }}>
                  <DaftarChat baris={CHAT_LAIN} baru={CHAT_RINA} masuk={rinaMasuk} sorot={sorot} />
                </div>
                {dorongChat > 0 && (
                  <LayarChat
                    pesan={pesan}
                    status={ketik ? "typing…" : "online"}
                    style={{ transform: `translateX(${(1 - dorongChat) * 100}%)`, boxShadow: "-10px 0 30px rgba(0,0,0,0.15)" }}
                  />
                )}
              </div>
            )}
            <Sentuh x={POS_WA.x} y={POS_WA.y} k={t(f, [114, 138], [0, 1], (x) => x)} />
            <Sentuh x={150 * U} y={(226 + 46 + 38) * U} k={t(f, [218, 244], [0, 1], (x) => x)} />
          </Ponsel>
        </div>
      </div>
    </Lapis>
  );
}

// ---------------------------------------------------------------- Kartu melayang di samping ponsel

function Melayang({ f, dari, sampai, children, style }: { f: number; dari: number; sampai: number; children: ReactNode; style: CSSProperties }) {
  if (f < dari || f > sampai + 12) return null;
  const m = t(f, [dari, dari + 14], [0, 1], mendarat);
  const k = t(f, [sampai, sampai + 12], [0, 1], lepas);
  return (
    <div style={{ position: "absolute", ...style, ...fx({ opacity: m * (1 - k), blur: (1 - m) * 10 + k * 12, scale: 0.85 + m * 0.15, y: (1 - m) * 30 + Math.sin(f / 22) * 6 }) }}>
      <Kaca style={{ padding: "26px 32px", borderRadius: 36, background: "rgba(10,18,15,0.82)", display: "flex", alignItems: "center", gap: 18, color: C.fg }}>{children}</Kaca>
    </div>
  );
}

function KartuMelayang({ f }: { f: number }) {
  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <Melayang f={f} dari={268} sampai={300} style={{ left: 60, top: 40 }}>
        <TitikLive frame={f} ukuran={18} />
        <span style={{ fontSize: 34, fontWeight: 700 }}>AI is replying</span>
        <span style={{ display: "flex", gap: 7 }}>
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ width: 10, height: 10, borderRadius: 10, background: C.hijau, opacity: 0.4 + 0.6 * Math.max(0, Math.sin((f - i * 5) / 4)) }} />
          ))}
        </span>
      </Melayang>
      <Melayang f={f} dari={314} sampai={378} style={{ left: 60, top: 30 }}>
        <span style={{ fontSize: 40 }}>⚡</span>
        <span>
          <div style={{ fontSize: 26, color: C.muted, fontWeight: 600 }}>Replied by AI in</div>
          <div style={{ fontSize: 44, fontWeight: 800, color: C.hijau }}>4 seconds</div>
        </span>
      </Melayang>
      <Melayang f={f} dari={404} sampai={470} style={{ left: 190, top: 1690, width: 700 }}>
        <span style={{ alignSelf: "flex-start", fontSize: 40 }}>📌</span>
        <span>
          <div style={{ fontSize: 30, fontWeight: 800 }}>Order forwarded to owner</div>
          <div style={{ fontSize: 24, color: C.muted, marginTop: 6, lineHeight: 1.4 }}>
            Rina · Combo Deal x1
            <br />
            Delivery to Jl. Melati 5
          </div>
        </span>
      </Melayang>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------- 4. Dasbor

const CHIP = ["All", "AI replies", "Human"];
const LEBAR_CHIP = [112, 208, 150];

function BarisChip({ L, pilih }: { L: number; pilih: number }) {
  const kiri = (i: number) => LEBAR_CHIP.slice(0, i).reduce((a, b) => a + b + 16, 0);
  const x = kiri(0) + (kiri(1) - kiri(0)) * pilih;
  const w = LEBAR_CHIP[0] + (LEBAR_CHIP[1] - LEBAR_CHIP[0]) * pilih;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
      <Logo ukuran={78} />
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
  { label: "Messages in", nilai: 68, akhiran: "", warna: "#6c8fd6" },
  { label: "Replied by AI", nilai: 50, akhiran: "", warna: C.hijau },
  { label: "Avg. reply", nilai: 4, akhiran: " sec", warna: "#f5b041" },
  { label: "Spam blocked", nilai: 7, akhiran: "", warna: "#f87171" },
];

function AdeganDasbor({ f }: { f: number }) {
  const L = f - 478;
  if (L < 0 || L > 124) return null;
  const pilih = t(L, [30, 46], [0, 1], halus);
  const keluar = t(L, [104, 120], [0, 1], lepas);
  return (
    <Lapis>
      <div
        style={{
          width: 900,
          ...fx({
            opacity: t(L, [4, 18], [0, 1]) * (1 - keluar),
            blur: t(L, [4, 20], [22, 0]) + keluar * 20,
            scale: t(L, [4, 24], [0.8, 1], mendarat) * (1 + keluar * 0.3),
            x: t(L, [0, 120], [30, -30], halus),
          }),
        }}
      >
        <div style={{ color: C.fg, fontSize: 52, fontWeight: 800, letterSpacing: -1, marginBottom: 34, ...fx({ opacity: t(L, [6, 18], [0, 1]), blur: 0, y: t(L, [6, 22], [30, 0], mendarat) }) }}>
          Today at a glance
        </div>
        <BarisChip L={L} pilih={pilih} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 26, marginTop: 44 }}>
          {STAT.map((s, i) => {
            const m = t(L, [12 + i * 4, 30 + i * 4], [0, 1], mendarat);
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
                  {Math.round(t(L, [16 + i * 4, 52], [0, s.nilai], mendarat))}
                  <span style={{ fontSize: 44, color: C.muted }}>{s.akhiran}</span>
                </div>
              </Kaca>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 30, padding: "24px 30px", borderRadius: 36, background: "linear-gradient(135deg, rgba(29,185,104,0.5), rgba(15,122,92,0.4))", border: "2px solid rgba(61,220,151,0.5)", color: C.fg, fontSize: 30, fontWeight: 700, ...fx({ opacity: t(L, [40, 54], [0, 1]), blur: 0, y: t(L, [40, 58], [40, 0], mendarat) }) }}>
          <TitikLive frame={f} ukuran={16} /> AI ACTIVE · 3 chats right now
          <span style={{ marginLeft: "auto", display: "flex" }}>
            {["R", "B", "D"].map((h, i) => (
              <Avatar key={h} huruf={h} i={i} ukuran={58} cincin="#1a6b4c" style={{ marginLeft: i ? -14 : 0 }} />
            ))}
          </span>
        </div>
      </div>
    </Lapis>
  );
}

// ---------------------------------------------------------------- 5. Teks kinetik

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

function Baris({ L, dari, sampai, baris, ukuran = 88 }: { L: number; dari: number; sampai: number; baris: ReactNode[]; ukuran?: number }) {
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
  const L = f - 594;
  if (L < 0 || L > 84) return null;
  return (
    <>
      <Baris
        L={L}
        dari={0}
        sampai={26}
        baris={[
          <>
            <Kata teks="Customers" L={L} mulai={0} />
            <span style={{ display: "inline-flex" }}>
              {["R", "B", "D"].map((h, i) => {
                const p = t(L, [8 + i * 2, 16 + i * 2], [0, 1], mendarat);
                return <Avatar key={h} huruf={h} i={i} ukuran={84} style={{ marginLeft: i ? -20 : 0, transform: `scale(${p})`, opacity: p }} />;
              })}
            </span>
          </>,
          <>
            <Kata teks="answered" L={L} mulai={10} />
            <Kata teks="instantly." L={L} mulai={15} warna={C.hijau} />
          </>,
        ]}
      />
      <Baris L={L} dari={34} sampai={50} ukuran={100} baris={[<Kata key="a" teks="Take over" L={L} mulai={34} />, <Kata key="b" teks="anytime." L={L} mulai={39} warna={C.hijau} />]} />
      <Baris L={L} dari={58} sampai={72} ukuran={100} baris={[<Kata key="a" teks="Even while" L={L} mulai={58} />, <Kata key="b" teks="you sleep." L={L} mulai={63} warna={C.hijau} />]} />
    </>
  );
}

// ---------------------------------------------------------------- 6. Logo

function AdeganLogo({ f }: { f: number }) {
  const { fps } = useVideoConfig();
  const L = f - 674;
  if (L < 0) return null;
  const muncul = spring({ frame: L, fps, config: { damping: 13, stiffness: 120 } });
  const buka = t(L, [12, 30], [0, 1], halus);
  const LEBAR_TEKS = 600;
  const sup = t(L, [26, 36], [0, 1], mendarat);
  const tag = t(L, [32, 46], [0, 1], mendarat);
  return (
    <Lapis style={{ opacity: t(L, [70, 76], [1, 0]) }}>
      <div style={{ display: "flex", alignItems: "center", transform: `translateX(${(1 - buka) * (LEBAR_TEKS / 2 + 13)}px)` }}>
        <div style={{ transform: `scale(${muncul})`, opacity: Math.min(1, muncul * 1.4) }}>
          <Logo ukuran={184} />
        </div>
        <div style={{ position: "relative", marginLeft: 26, width: LEBAR_TEKS * buka, overflow: "hidden", whiteSpace: "nowrap", height: 210, display: "flex", alignItems: "center" }}>
          <div style={{ color: C.fg, fontSize: 86, fontWeight: 800, letterSpacing: -2, lineHeight: 1.02, transform: `translateX(${(1 - buka) * -80}px)` }}>
            BalasCepet
            <span style={{ display: "inline-block", verticalAlign: "top", marginLeft: 14, marginTop: 6, padding: "4px 14px", borderRadius: 14, background: C.hijau, color: "#06231a", fontSize: 36, fontWeight: 800, letterSpacing: 0, lineHeight: 1.2, opacity: sup, transform: `scale(${0.6 + sup * 0.4})` }}>AI</span>
            <br />
            .com
          </div>
        </div>
      </div>
      <div style={{ position: "absolute", top: 1130, left: 90, right: 90, textAlign: "center", ...fx({ opacity: tag, blur: (1 - tag) * 8, y: (1 - tag) * 20 }) }}>
        <div style={{ color: C.fg, fontSize: 46, fontWeight: 700, lineHeight: 1.3 }}>Your 24/7 AI customer service<br />on WhatsApp.</div>
        <div style={{ color: C.hijau, fontSize: 40, fontWeight: 700, marginTop: 18, letterSpacing: 1 }}>wa.sukapost.tech</div>
      </div>
    </Lapis>
  );
}

export function Promo() {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ fontFamily: FONT, background: C.latar, overflow: "hidden" }}>
      <Latar frame={f} hijau={t(f, [130, 240], [0, 1])} />
      <AdeganPonsel f={f} />
      <KartuMelayang f={f} />
      <AdeganDasbor f={f} />
      <AdeganTeks f={f} />
      <AdeganLogo f={f} />
    </AbsoluteFill>
  );
}
