import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Audio, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT, Latar, Logo, halus, lepas, mendarat, t } from "../dasar";
import { U, WA } from "../wa";
import { KEPALA, MaskotPose, MaskotPenuh, type Gaya, Ucapan } from "./maskot";
import { type BarisObrolan, BuktiTransfer, DaftarObrolan, LayarObrolan, type Pesan } from "./obrolan";
import { Judul } from "./teks";
import { AMPLITUDO_VO } from "./vo-amplitudo";

/**
 * Konten pendek 37 detik (1080 x 1920, 30 fps, bahasa Indonesia) dengan maskot robot sebagai pembawa acara.
 * Hook "Rp250.000 hilang gara-gara telat bales chat" (H1 di KONSEP-KONTEN.md), lalu:
 *   B chat menumpuk · C maskot muncul & semua dibalas · D jawab dari product knowledge · E baca foto bukti transfer
 *   F pemilik membalas sendiri, AI mundur · G chat iseng dibisukan · H rangkuman malam hari · I ajakan coba gratis.
 * Klaim sudah dicocokkan ke kode app: AI tidak meneruskan pesanan ke nomor lain (src/lib/teruskan.ts), jadi pesanan
 * "dirapikan di chat ini" dan tim melanjutkan langsung.
 */

/**
 * Waktu adegan diselaraskan ke voice over (public/vo/take1.mp3, ElevenLabs "Finn", 9 kalimat): tiap adegan internal
 * (frame di kiri) dimulai sesaat sebelum kalimatnya diucapkan (frame keluaran di kanan, dari jeda hasil silencedetect).
 * Animasi ditulis dalam frame internal; komposisi memetakan frame keluaran -> internal secara linier per adegan.
 */
const ADEGAN_INTERNAL = [0, 100, 204, 302, 454, 592, 722, 840, 956, 1110];
const ADEGAN_KELUARAN = [0, 141, 224, 350, 502, 619, 707, 790, 902, 1056];
export const DURASI_KONTEN = ADEGAN_KELUARAN[ADEGAN_KELUARAN.length - 1];

const pt = (n: number) => n * U;
const muncul = (f: number, di: number, lama = 9) => t(f, [di, di + lama], [0, 1], mendarat);

// ---------------------------------------------------------------- Tata letak (zona aman TikTok/Reels)

const KARTU = { x: 134, y: 800, w: 812, h: 740 };
const MASKOT = { x: 70, y: 470, lebar: 420 };
const GANTI = [100, 300, 720, 840];

// ---------------------------------------------------------------- Data chat

const BARIS_SIANG: BarisObrolan[] = [
  { h: "A", i: 1, nama: "Andi", isi: "P", jam: "10.02", belum: 3, balas: "Halo kak Andi! Ada yang bisa dibantu? 😊" },
  { h: "S", i: 2, nama: "Sari", isi: "harga geprek brp kak", jam: "10.03", belum: 1, balas: "Geprek Rp25.000/porsi kak 🔥" },
  { h: "B", i: 3, nama: "Budi", isi: "bisa COD ga?", jam: "10.03", belum: 2, balas: "Bisa COD kak untuk area kota 👍" },
  { h: "M", i: 4, nama: "Maya", isi: "📷 Foto", jam: "10.04", belum: 1, balas: "Bukti transfer diterima kak 🙏" },
  { h: "F", i: 5, nama: "Fajar", isi: "ongkir ke bekasi brp?", jam: "10.04", belum: 2, balas: "Ongkir ke Bekasi Rp10.000 kak 🛵" },
  { h: "N", i: 6, nama: "Nadia", isi: "kak kok gak dibales 😡", jam: "10.05", belum: 4, balas: "Maaf menunggu kak! Mau pesan apa? 🙏" },
  { h: "D", i: 0, nama: "Dimas", isi: "masih buka kak?", jam: "10.05", belum: 1, balas: "Masih buka kak, sampai jam 22.00 ✅" },
  { h: "L", i: 1, nama: "Lina", isi: "menu hari ini apa aja kak?", jam: "10.06", belum: 2, balas: "Ini menu hari ini kak 📋" },
];
const MASUK_SIANG = BARIS_SIANG.map((_, i) => 106 + i * 10);
const BALAS_SIANG = BARIS_SIANG.map((_, i) => 236 + (BARIS_SIANG.length - 1 - i) * 5);

const BARIS_MALAM: BarisObrolan[] = [
  { h: "T", i: 2, nama: "Tono", isi: "besok buka jam brp kak?", jam: "01.47", belum: 1, balas: "Besok buka jam 10.00 kak 😊" },
  { h: "R", i: 0, nama: "Rina", isi: "kak pesen lagi dong", jam: "01.58", belum: 1, balas: "Siap kak Rina! Mau berapa porsi? 🔥" },
  { h: "W", i: 4, nama: "Wulan", isi: "level 5 pedes bgt ga?", jam: "02.06", belum: 1, balas: "Pedes banget kak, siap-siap 🥵" },
  { h: "Y", i: 5, nama: "Yoga", isi: "bisa buat 30 porsi?", jam: "02.11", belum: 1, balas: "Bisa kak, untuk tanggal berapa? 📅" },
  { h: "E", i: 3, nama: "Eka", isi: "ada promo ga kak", jam: "02.14", belum: 1, balas: "Ada kak, beli 5 gratis es teh 🧊" },
];
const MASUK_MALAM = BARIS_MALAM.map((_, i) => 846 + i * 16);

const JAM_A = (f: number) => {
  const m = 21 * 60 + 4 + Math.round(t(f, [30, 62], [0, 126], halus));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}.${String(m % 60).padStart(2, "0")}`;
};

function pesanRina(f: number): Pesan[] {
  return [
    { dari: "pelanggan", teks: "kak geprek brp? bisa antar ke bekasi?", jam: "10.14", muncul: muncul(f, 310), ekor: true },
    { dari: "saya", teks: "Halo kak Rina! 👋\nAyam Geprek Rp25.000/porsi, level 0–5 🔥\nAntar ke Bekasi bisa kak, ongkir Rp10.000.\nMau pesan berapa porsi?", jam: "10.14", muncul: muncul(f, 374), ekor: true },
    { dari: "pelanggan", foto: <BuktiTransfer pindai={t(f, [480, 510], [0, 1], halus)} />, jam: "10.21", muncul: muncul(f, 458), ekor: true },
    { dari: "pelanggan", teks: "udah tf ya kak 🙏", jam: "10.21", muncul: muncul(f, 470) },
    { dari: "saya", teks: "Bukti transfer sudah kami terima kak 🙏\n10 porsi geprek lv 3, antar ke kantor kak Rina.\nTim kami konfirmasi langsung di chat ini ya.", jam: "10.21", muncul: muncul(f, 524), ekor: true },
    { dari: "saya", teks: "Siap kak, langsung kami siapkan ya 🛵", jam: "10.23", muncul: muncul(f, 598) },
  ];
}

function pesanIseng(f: number): Pesan[] {
  const isi = ["P", "P", "P", "tes", "🗿🗿🗿", "kak minta pulsa dong 😂"];
  const di = [726, 731, 736, 744, 752, 762];
  return isi.map((teks, i) => ({ dari: "pelanggan", teks, jam: "11.40", muncul: muncul(f, di[i], 6), ekor: i === 0 }));
}

// ---------------------------------------------------------------- Lencana di dalam kartu (koordinat layar iOS)

function Pita({ p, children, top, latar = "#fff7d6", warna = "#7a5a00" }: { p: number; children: ReactNode; top?: number; latar?: string; warna?: string }) {
  if (p <= 0) return null;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, ...(top !== undefined ? { top } : { bottom: pt(66) }), display: "flex", justifyContent: "center", zIndex: 4, opacity: p, transform: `translateY(${(1 - p) * pt(10)}px) scale(${0.9 + p * 0.1})` }}>
      <span style={{ padding: `${pt(6)}px ${pt(14)}px`, borderRadius: pt(14), background: latar, color: warna, fontSize: pt(14.5), fontWeight: 700, boxShadow: "0 2px 6px rgba(0,0,0,0.12)" }}>{children}</span>
    </div>
  );
}

function SedangMembalas({ f, dari, sampai }: { f: number; dari: number; sampai: number }) {
  const p = Math.min(t(f, [dari, dari + 5], [0, 1]), 1 - t(f, [sampai - 4, sampai], [0, 1]));
  const titik = ".".repeat(1 + (Math.floor(f / 5) % 3));
  return (
    <Pita p={p} top={pt(112)} latar="#dff7ea" warna="#0f6b45">
      🤖 AI sedang membalas{titik}
    </Pita>
  );
}

function Bisu({ f }: { f: number }) {
  const p = t(f, [776, 790], [0, 1], mendarat);
  if (p <= 0) return null;
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 5, display: "grid", placeItems: "center", background: `rgba(17,27,33,${0.35 * p})` }}>
      <div style={{ transform: `scale(${0.7 + p * 0.3}) rotate(${(1 - p) * -6}deg)`, opacity: p, background: "#111b21", color: "#fff", borderRadius: pt(18), padding: `${pt(14)}px ${pt(20)}px`, textAlign: "center", boxShadow: "0 10px 30px rgba(0,0,0,0.4)" }}>
        <div style={{ fontSize: pt(24), fontWeight: 800 }}>🔕 Dibisukan otomatis</div>
        <div style={{ fontSize: pt(14), color: "#aebac1", marginTop: pt(4) }}>Chat iseng tidak dibalas AI</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Kartu (layar WhatsApp diperbesar)

function IsiKartu({ f }: { f: number }) {
  if (f < GANTI[0]) {
    const pesan: Pesan[] = [
      { dari: "pelanggan", teks: "Kak, geprek 10 porsi buat acara kantor besok bisa? 🙏", jam: "21.04", muncul: 1, ekor: true },
      { dari: "pelanggan", teks: "Udah pesan di tempat lain kak. Makasih.", jam: "23.10", muncul: muncul(f, 64, 7) },
    ];
    const jeda = Math.min(t(f, [26, 32], [0, 1]), 1 - t(f, [60, 64], [0, 1]));
    return (
      <Skala k={1.55}>
        <LayarObrolan
          nama="Bu Dewi"
          h="D"
          i={5}
          status="pelanggan"
          jam={JAM_A(f)}
          pesan={pesan}
          sisipan={
            jeda > 0 && (
              <div style={{ position: "absolute", inset: 0, zIndex: 4, display: "grid", placeItems: "center", background: `rgba(17,27,33,${0.45 * jeda})` }}>
                <span style={{ opacity: jeda, transform: `scale(${0.85 + jeda * 0.15})`, padding: `${pt(10)}px ${pt(18)}px`, borderRadius: pt(16), background: "#111b21", color: "#fff", fontSize: pt(24), fontWeight: 800 }}>⏳ 2 jam kemudian…</span>
              </div>
            )
          }
        />
      </Skala>
    );
  }
  if (f < GANTI[1]) {
    const m = MASUK_SIANG.map((d) => muncul(f, d, 8));
    const b = BALAS_SIANG.map((d) => t(f, [d, d + 8], [0, 1]));
    const belum = BARIS_SIANG.reduce((s, r, i) => s + (m[i] > 0.5 && b[i] < 0.5 ? r.belum : 0), 0);
    return (
      <Skala k={1.15}>
        <DaftarObrolan baris={BARIS_SIANG} muncul={m} dibalas={b} jam="10.06" belumTotal={belum} />
      </Skala>
    );
  }
  if (f < GANTI[2]) {
    const jeda = t(f, [604, 614], [0, 1], mendarat);
    return (
      <Skala k={1.55}>
        <LayarObrolan
          nama="Rina"
          h="R"
          i={0}
          status="online"
          jam={f < 450 ? "10.14" : f < 590 ? "10.21" : "10.23"}
          pesan={pesanRina(f)}
          sisipan={
            <>
              <SedangMembalas f={f} dari={348} sampai={374} />
              <SedangMembalas f={f} dari={508} sampai={524} />
              <Pita p={jeda} top={pt(116)}>⏸ AI jeda di chat ini · kamu yang pegang</Pita>
            </>
          }
        />
      </Skala>
    );
  }
  if (f < GANTI[3]) {
    return (
      <Skala k={1.55}>
        <LayarObrolan nama="+62 857-1234-0912" h="?" i={6} status={f < 776 ? "online" : "🔕 dibisukan"} jam="11.40" pesan={pesanIseng(f)} sisipan={<Bisu f={f} />} />
      </Skala>
    );
  }
  const m = MASUK_MALAM.map((d) => muncul(f, d, 8));
  const b = MASUK_MALAM.map((d) => t(f, [d + 14, d + 20], [0, 1]));
  return (
    <Skala k={1.15}>
      <DaftarObrolan baris={BARIS_MALAM} muncul={m} dibalas={b} jam="02.14" belumTotal={0} />
    </Skala>
  );
}

function Skala({ k, children }: { k: number; children: ReactNode }) {
  return <div style={{ position: "absolute", left: 0, top: 0, width: KARTU.w / k, height: KARTU.h / k, transform: `scale(${k})`, transformOrigin: "0 0" }}>{children}</div>;
}

function Kartu({ f }: { f: number }) {
  const s = [0, ...GANTI].filter((g) => g <= f).pop() ?? 0;
  const L = f - s;
  const punch = s > 0 && L < 10 ? Math.sin((L / 10) * Math.PI) * 0.035 : 0;
  const tampil = s > 0 ? t(L, [0, 6], [0, 1]) : 1;
  // Hook: kartu bergetar saat pelanggan pergi
  const getar = f >= 64 && f < 84 ? Math.sin(f * 2.6) * 14 * (1 - (f - 64) / 20) : 0;
  const keluar = t(f, [950, 976], [0, 1], lepas);
  if (keluar >= 1) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: KARTU.x,
        top: KARTU.y,
        width: KARTU.w,
        height: KARTU.h,
        borderRadius: 54,
        overflow: "hidden",
        background: "#fff",
        boxShadow: "0 50px 120px -30px rgba(0,0,0,0.85), 0 0 0 6px rgba(255,255,255,0.06)",
        transform: `translate(${getar}px, ${keluar * 900}px) scale(${1 - punch}) rotate(${keluar * 8}deg)`,
        opacity: 1 - keluar,
        zIndex: 10,
      }}
    >
      <div style={{ position: "absolute", inset: 0, opacity: tampil }}>
        <IsiKartu f={f} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Adegan A & B: hook dan banjir chat

function HargaHilang({ f }: { f: number }) {
  if (f > 100) return null;
  const coret = t(f, [66, 76], [0, 1], mendarat);
  const getar = f >= 66 && f < 86 ? Math.sin(f * 3.1) * 10 * (1 - (f - 66) / 20) : 0;
  const keluar = t(f, [92, 100], [0, 1], lepas);
  return (
    <div style={{ position: "absolute", left: 40, right: 40, top: 230, textAlign: "center", zIndex: 20, opacity: 1 - keluar, transform: `translateY(${-keluar * 30}px)` }}>
      <div style={{ position: "relative", display: "inline-block", fontSize: 180, fontWeight: 800, letterSpacing: -6, lineHeight: 1, color: "#ff4d4f", textShadow: "0 10px 50px rgba(255,77,79,0.45)", transform: `translateX(${getar}px) scale(${1 + Math.sin(f / 6) * 0.012})` }}>
        Rp250.000
        <span style={{ position: "absolute", left: -10, right: -10, top: "52%", height: 16, borderRadius: 8, background: "#fff", transformOrigin: "0 50%", transform: `scaleX(${coret}) rotate(-4deg)`, boxShadow: "0 4px 20px rgba(0,0,0,0.5)" }} />
      </div>
      <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1.12, letterSpacing: -1.5, color: C.fg, marginTop: 18, textShadow: "0 6px 28px rgba(0,0,0,0.65)" }}>
        hilang cuma gara-gara
        <br />
        <span style={{ color: "#ff4d4f" }}>telat bales</span> chat 😭
      </div>
      <div style={{ fontSize: 26, color: C.muted, marginTop: 14, fontWeight: 600 }}>*ilustrasi</div>
    </div>
  );
}

const SPAM_P = [
  { teks: "P", x: 90, y: 470 },
  { teks: "kak?", x: 800, y: 450 },
  { teks: "P", x: 330, y: 560 },
  { teks: "harga brp kak", x: 560, y: 610 },
  { teks: "P", x: 120, y: 690 },
  { teks: "bisa COD?", x: 700, y: 720 },
  { teks: "P", x: 900, y: 600 },
  { teks: "halo kak", x: 380, y: 450 },
  { teks: "ongkir brp?", x: 60, y: 600 },
  { teks: "kak 😡", x: 440, y: 700 },
  { teks: "P", x: 620, y: 500 },
];

function BanjirChat({ f }: { f: number }) {
  if (f < 110 || f > 214) return null;
  const pecah = t(f, [200, 212], [0, 1], lepas);
  return (
    <>
      {SPAM_P.map((s, i) => {
        const p = muncul(f, 116 + i * 7, 8);
        if (p <= 0) return null;
        const goyang = Math.sin(f * 1.7 + i * 2) * 4;
        return (
          <div key={i} style={{ position: "absolute", left: s.x, top: s.y, zIndex: 15, transform: `scale(${p * (1 - pecah)}) rotate(${goyang}deg)`, opacity: 1 - pecah, transformOrigin: "0 100%" }}>
            <div style={{ background: "#fff", color: WA.teks, fontSize: 40, fontWeight: 700, padding: "12px 24px", borderRadius: 26, borderBottomLeftRadius: 6, boxShadow: "0 16px 40px -12px rgba(0,0,0,0.7)", whiteSpace: "nowrap" }}>{s.teks}</div>
          </div>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------- Maskot: posisi, gaya, ucapan

const UCAPAN: { di: number; lama: number; teks: string }[] = [
  { di: 214, lama: 82, teks: "Tenang, biar aku yang bales! 😎" },
  { di: 314, lama: 40, teks: "Bentar, aku cek menu kamu… 📄" },
  { di: 384, lama: 62, teks: "Sesuai data kamu. Nggak ngarang! ✅" },
  { di: 462, lama: 44, teks: "Foto juga bisa aku baca 👀" },
  { di: 530, lama: 58, teks: "Pesanan rapi, tim tinggal lanjut 👌" },
  { di: 606, lama: 50, teks: "Oke bos, aku diam dulu 🤐" },
  { di: 780, lama: 56, teks: "Yang iseng, skip! 🙅" },
  { di: 856, lama: 84, teks: "Aku jaga 24 jam, kamu tidur aja 😴" },
];

const POSE_MASKOT = [
  { sampai: 384, src: "avatars/poses/knowledge-check.png" },
  { sampai: 454, src: "avatars/poses/explaining.png" },
  { sampai: 530, src: "avatars/poses/reading-proof.png" },
  { sampai: 592, src: "avatars/poses/order-ready.png" },
  { sampai: 722, src: "avatars/poses/step-back.png" },
  { sampai: 840, src: "avatars/poses/mute-spam.png" },
  { sampai: 956, src: "avatars/poses/sleepy-night.png" },
];

function gayaMaskot(f: number): Gaya {
  if (f >= 214 && f < 236) return "lompat";
  if (f >= 200 && f < 302) return "lambai";
  if (f >= 384 && f < 420) return "senang";
  if (f >= 776 && f < 812) return "geleng";
  if (f >= 846 && f < 940) return "senang";
  if (f >= 990) return "senang";
  return "diam";
}

function LapisMaskot({ f, mulut, semangat }: { f: number; mulut?: number; semangat?: number }) {
  const { fps } = useVideoConfig();
  if (f < 200) return null;
  const naik = spring({ frame: f - 204, fps, config: { damping: 11, stiffness: 140 } });
  const mundur = t(f, [658, 680], [0, 1], halus) - t(f, [700, 718], [0, 1], mendarat);
  const ikutKartu = t(f, [950, 976], [0, 1], lepas);
  const ucap = UCAPAN.find((u) => f >= u.di && f < u.di + u.lama - 8);
  const tarik = t(f, [326, 350], [0, 1], lepas);
  const pendar = Math.max(Math.sin(t(f, [340, 384], [0, 1]) * Math.PI), Math.sin(t(f, [478, 512], [0, 1]) * Math.PI));
  const props = { f, bicara: ucap || (f >= 990 && f < 1100) ? 1 : 0, mulut, semangat, gaya: gayaMaskot(f), pendar };
  // Pose badan utuh (melambai) dipakai saat berkenalan dan di ajakan akhir; ukurannya disamakan supaya kepalanya
  // tepat menggantikan kepala pose setengah badan.
  const lebarPenuh = (MASKOT.lebar * KEPALA.setengah.lebar) / KEPALA.penuh.lebar;
  const xPenuh = MASKOT.x + MASKOT.lebar * KEPALA.setengah.tengahX - lebarPenuh * KEPALA.penuh.tengahX;
  const yPenuh = MASKOT.y + MASKOT.lebar * KEPALA.setengah.atas - lebarPenuh * KEPALA.penuh.atas;
  const ganti = 1 + Math.sin(t(f, [302, 312], [0, 1]) * Math.PI) * 0.07;
  const naikAjak = spring({ frame: f - 962, fps, config: { damping: 12, stiffness: 120 } });
  return (
    <>
      {f < 302 && (
        <div style={{ position: "absolute", left: xPenuh, top: yPenuh + (1 - naik) * 440, zIndex: 5 }}>
          <MaskotPenuh {...props} lebar={lebarPenuh} />
        </div>
      )}
      {f >= 302 && f < 976 && (
        <div style={{ position: "absolute", left: xPenuh, top: yPenuh + mundur * 260 + ikutKartu * 900, zIndex: 5, opacity: 1 - ikutKartu, transformOrigin: "50% 100%", transform: `scale(${ganti})` }}>
          <MaskotPose {...props} src={POSE_MASKOT.find((pose) => f < pose.sampai)?.src ?? "avatars/poses/sleepy-night.png"} lebar={lebarPenuh} />
        </div>
      )}
      {f >= 962 && (
        <div style={{ position: "absolute", left: 540 - 200, top: 430 + (1 - naikAjak) * 760, zIndex: 12 }}>
          <MaskotPenuh {...props} lebar={400} />
        </div>
      )}
      {UCAPAN.map((u) => (
        <Ucapan key={u.di} L={f - u.di} durasi={u.lama} lebar={540} style={{ left: 440, bottom: 1920 - 690, zIndex: 18 }}>
          {u.teks}
        </Ucapan>
      ))}
      {/* Berkas product knowledge terbang masuk ke kepala maskot */}
      {f >= 318 && f < 352 && (
        <div style={{ position: "absolute", left: 360 + (230 - 360) * tarik, top: 470 + (560 - 470) * tarik, zIndex: 19, opacity: muncul(f, 318, 6) * (1 - t(f, [344, 352], [0, 1])), transform: `scale(${1 - tarik * 0.7}) rotate(${-6 + tarik * 20}deg)` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, background: "#fff", color: "#0c1a14", padding: "18px 26px", borderRadius: 24, fontSize: 34, fontWeight: 800, boxShadow: "0 20px 50px -14px rgba(0,0,0,0.7)" }}>
            <span style={{ width: 54, height: 64, borderRadius: 10, background: "#ef4444", color: "#fff", fontSize: 18, display: "grid", placeItems: "center" }}>PDF</span>
            menu-geprek.pdf
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Adegan H & I

function Rangkuman({ f }: { f: number }) {
  if (f < 840 || f > 950) return null;
  const baris = ["Nggak pernah tidur", "Nggak pernah ngarang", "Tahu kapan diam"];
  const keluar = t(f, [942, 950], [0, 1], lepas);
  return (
    <div style={{ position: "absolute", left: 60, right: 60, top: 196, zIndex: 20, opacity: 1 - keluar }}>
      {baris.map((b, i) => {
        const p = muncul(f, 846 + i * 26, 10);
        return (
          <div key={b} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 22, fontSize: 70, fontWeight: 800, letterSpacing: -1.2, lineHeight: 1.22, color: C.fg, opacity: p, transform: `translateX(${(1 - p) * -60}px)`, textShadow: "0 6px 28px rgba(0,0,0,0.65)" }}>
            <span style={{ width: 62, height: 62, borderRadius: 31, background: C.hijau, color: "#06231a", fontSize: 40, display: "grid", placeItems: "center", transform: `scale(${p})` }}>✓</span>
            {b}
          </div>
        );
      })}
    </div>
  );
}

function Ajakan({ f }: { f: number }) {
  if (f < 956) return null;
  const logo = muncul(f, 960, 14);
  const langkah = ["Scan QR dari HP", "Upload product knowledge", "AI langsung bales chat"];
  const tombol = muncul(f, 1036, 12);
  const denyut = 1 + Math.max(0, Math.sin((f - 1050) / 7)) * 0.035 * (f > 1050 ? 1 : 0);
  const gaya: CSSProperties = { position: "absolute", left: 0, right: 0, zIndex: 20, display: "flex", justifyContent: "center" };
  return (
    <>
      <div style={{ ...gaya, top: 220, alignItems: "center", gap: 26, opacity: logo, transform: `translateY(${(1 - logo) * -40}px)` }}>
        <Logo ukuran={118} />
        <span style={{ fontSize: 96, fontWeight: 800, letterSpacing: -3, color: C.fg }}>
          Chat<span style={{ color: C.hijau }}>GerCep</span>
        </span>
      </div>
      <div style={{ ...gaya, top: 370, opacity: muncul(f, 972, 12), fontSize: 44, fontWeight: 700, color: C.muted }}>Admin AI WhatsApp untuk jualanmu</div>
      <Ucapan L={f - 994} durasi={200} lebar={400} style={{ left: 660, bottom: 1920 - 600, zIndex: 21 }}>
        Yuk, coba gratis! 🚀
      </Ucapan>
      <div style={{ position: "absolute", left: 170, right: 170, top: 1118, zIndex: 20, display: "flex", flexDirection: "column", gap: 18 }}>
        {langkah.map((l, i) => {
          const p = muncul(f, 1004 + i * 9, 10);
          return (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 22, padding: "14px 24px", borderRadius: 26, background: C.kaca, border: `2px solid ${C.garis}`, fontSize: 37, fontWeight: 700, color: C.fg, opacity: p, transform: `translateY(${(1 - p) * 30}px)` }}>
              <span style={{ width: 54, height: 54, borderRadius: 27, background: C.hijau, color: "#06231a", fontWeight: 800, display: "grid", placeItems: "center", flexShrink: 0 }}>{i + 1}</span>
              {l}
            </div>
          );
        })}
      </div>
      <div style={{ ...gaya, top: 1416, opacity: tombol, transform: `translateY(${(1 - tombol) * 30}px) scale(${(0.9 + tombol * 0.1) * denyut})` }}>
        <span style={{ padding: "24px 46px", borderRadius: 999, background: `linear-gradient(150deg, #5ef0b0, ${C.hijau} 50%, #22b877)`, color: "#06231a", fontSize: 46, fontWeight: 800, boxShadow: "0 24px 60px -16px rgba(61,220,151,0.7)" }}>Mulai gratis · chatgercep.com</span>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Komposisi

export function KontenHook() {
  const keluaran = useCurrentFrame();
  const f = interpolate(keluaran, ADEGAN_KELUARAN, ADEGAN_INTERNAL, { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const k = Math.round(keluaran);
  const mulut = AMPLITUDO_VO[k] ?? 0;
  // Rata-rata keras suara ±5 frame: "sedang bicara" yang halus untuk gerak kepala & tangan.
  let jumlah = 0;
  for (let i = k - 5; i <= k + 5; i++) jumlah += AMPLITUDO_VO[i] ?? 0;
  const semangat = Math.min(1, (jumlah / 11) * 1.4);
  const merah = f >= 64 && f < 96 ? Math.max(0, Math.sin(((f - 64) / 32) * Math.PI)) : 0;
  const kilat = Math.max(0, 1 - Math.abs(f - 201) / 4);
  return (
    <AbsoluteFill style={{ fontFamily: FONT, background: C.latar, overflow: "hidden" }}>
      <Latar frame={f} hijau={t(f, [196, 260], [0, 1]) * (1 - t(f, [836, 850], [0, 0.6]))} />
      <AbsoluteFill style={{ background: "radial-gradient(80% 60% at 50% 45%, rgba(255,40,40,0.0) 30%, rgba(255,40,40,0.55) 100%)", opacity: merah, zIndex: 30 }} />
      <HargaHilang f={f} />
      <BanjirChat f={f} />
      <LapisMaskot f={f} mulut={mulut} semangat={semangat} />
      <Kartu f={f} />
      <Judul f={f} dari={100} sampai={200} baris={[{ teks: "Jualan lagi rame," }, { teks: "tangan cuma *dua* 😵", aksen: "#ffb020" }]} />
      <Judul f={f} dari={204} sampai={298} baris={[{ teks: "Kenalin," }, { teks: "*admin* *AI* 24 jam kamu" }]} />
      <Judul f={f} dari={302} sampai={452} baris={[{ teks: "Jawab dari" }, { teks: "*product* *knowledge* kamu" }]} />
      <Judul f={f} dari={454} sampai={590} baris={[{ teks: "Kirim bukti transfer?" }, { teks: "*Dibaca* *juga* 👀" }]} />
      <Judul f={f} dari={592} sampai={720} baris={[{ teks: "Kamu bales sendiri?" }, { teks: "AI otomatis *mundur*" }]} />
      <Judul f={f} dari={722} sampai={840} baris={[{ teks: "Chat iseng & spam?" }, { teks: "*Dibisukan* otomatis" }]} />
      <Rangkuman f={f} />
      <Ajakan f={f} />
      <AbsoluteFill style={{ background: "#fff", opacity: kilat * 0.85, zIndex: 40 }} />
      <Audio src={staticFile("vo/take1.mp3")} />
    </AbsoluteFill>
  );
}
