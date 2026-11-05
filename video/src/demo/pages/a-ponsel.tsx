import { Check, ChevronLeft, ChevronRight, Laptop, Smartphone, X } from "lucide-react";
import { E, pegas, tw } from "../kit/anim";
import { QrSvg } from "./a-koneksi";

/** Layar ponsel pemilik: WhatsApp > Perangkat tertaut > Tautkan perangkat > kamera memindai QR > berhasil. `tp` = detik sejak ponsel muncul. */
export const PT = { tap: 2.5, cam: 2.8, scan: 5.6, list: 6.5 };

function Status({ terang = false }: { terang?: boolean }) {
  const w = terang ? "#fff" : "#000";
  return (
    <div className="absolute inset-x-0 top-0 z-30 flex h-[52px] items-end justify-between px-9 pb-1.5 text-[16px] font-semibold" style={{ color: w }}>
      <span>9:41</span>
      <span className="flex items-center gap-1.5">
        <svg width="17" height="11" viewBox="0 0 34 22">{[0, 1, 2, 3].map((k) => <rect key={k} x={k * 9} y={16 - k * 5} width="6.5" height={6 + k * 5} rx="1.6" fill={w} />)}</svg>
        <svg width="25" height="12" viewBox="0 0 50 23"><rect x="1" y="1" width="42" height="21" rx="6.5" fill="none" stroke={w} strokeOpacity="0.4" strokeWidth="2" /><rect x="4" y="4" width="32" height="15" rx="4" fill={w} /></svg>
      </span>
    </div>
  );
}

function Navbar({ judul }: { judul: string }) {
  return (
    <div className="absolute inset-x-0 z-20 flex items-center px-2 text-[#007aff]" style={{ top: 58, height: 44 }}>
      <ChevronLeft className="size-7" strokeWidth={2.4} />
      <span className="text-[16.5px]">Pengaturan</span>
      <span className="absolute inset-x-0 text-center text-[17px] font-semibold text-black" style={{ pointerEvents: "none" }}>{judul}</span>
    </div>
  );
}

function Siku({ warna, ukuran = 250 }: { warna: string; ukuran?: number }) {
  const p = { position: "absolute" as const, width: 38, height: 38, borderColor: warna, borderStyle: "solid" as const, borderWidth: 0 };
  return (
    <div style={{ position: "absolute", width: ukuran, height: ukuran }}>
      <span style={{ ...p, left: 0, top: 0, borderTopWidth: 5, borderLeftWidth: 5, borderTopLeftRadius: 20 }} />
      <span style={{ ...p, right: 0, top: 0, borderTopWidth: 5, borderRightWidth: 5, borderTopRightRadius: 20 }} />
      <span style={{ ...p, left: 0, bottom: 0, borderBottomWidth: 5, borderLeftWidth: 5, borderBottomLeftRadius: 20 }} />
      <span style={{ ...p, right: 0, bottom: 0, borderBottomWidth: 5, borderRightWidth: 5, borderBottomRightRadius: 20 }} />
    </div>
  );
}

export function LayarScan({ tp }: { tp: number }) {
  const s2 = tw(tp, PT.cam - 0.18, PT.cam) * (1 - tw(tp, PT.list - 0.2, PT.list));
  const s3 = tw(tp, PT.list - 0.2, PT.list);
  const s1 = 1 - tw(tp, PT.cam - 0.18, PT.cam);
  const tekan = tp > PT.tap - 0.12 && tp < PT.tap + 0.45 ? tw(tp, PT.tap - 0.12, PT.tap + 0.45, 0, 1, E.out) : -1;
  const sukses = tw(tp, PT.scan, PT.scan + 0.25);
  const garis = 0.5 + 0.5 * Math.sin((tp - PT.cam) * 3.2);
  const toast = tw(tp, PT.list, PT.list + 0.4, 0, 1, E.out) * (1 - tw(tp, PT.list + 2.8, PT.list + 3.2));
  const flash = tp > PT.scan ? Math.max(0, 0.6 - (tp - PT.scan) * 2) : 0;
  return (
    <div className="absolute inset-0" style={{ background: "#f2f2f7" }}>
      {/* 1. Perangkat tertaut (kosong) */}
      <div className="absolute inset-0" style={{ opacity: s1, background: "#f2f2f7" }}>
        <Status />
        <Navbar judul="Perangkat tertaut" />
        <div className="absolute inset-x-0 flex flex-col items-center px-8 text-center" style={{ top: 160 }}>
          <div className="relative grid size-[150px] place-items-center rounded-full bg-[#d7f4e4]">
            <Laptop className="size-16 text-[#1daa61]" strokeWidth={1.6} />
            <span className="absolute right-6 bottom-7 grid size-9 place-items-center rounded-lg bg-white shadow"><Smartphone className="size-5 text-[#1daa61]" /></span>
          </div>
          <h2 className="mt-8 text-[22px] leading-tight font-bold text-black">Gunakan WhatsApp di perangkat lain</h2>
          <p className="mt-2.5 text-[15px] leading-snug text-[#6b6b70]">Tautkan perangkat untuk memakai WhatsApp di komputer. HP Anda tetap bisa dipakai seperti biasa.</p>
        </div>
        <div className="absolute inset-x-6 grid h-[52px] place-items-center rounded-xl text-[17px] font-semibold text-white" style={{ bottom: 118, background: tekan >= 0 ? "#16a34f" : "#1fb859" }}>
          Tautkan perangkat
        </div>
        {tekan >= 0 && (
          <span className="absolute rounded-full" style={{ left: 195 - 34, top: 700 - 34, width: 68, height: 68, background: "rgba(0,0,0,0.16)", border: "2px solid rgba(255,255,255,0.7)", transform: `scale(${0.6 + tekan * 0.4})`, opacity: 1 - tekan * 0.5 }} />
        )}
      </div>

      {/* 2. Kamera pemindai */}
      <div className="absolute inset-0 overflow-hidden" style={{ opacity: s2, background: "linear-gradient(160deg,#243238,#0b1013)" }}>
        <div className="absolute rounded-[28px]" style={{ left: -30, top: 150, width: 450, height: 420, background: "linear-gradient(135deg, rgba(120,170,160,0.16), rgba(20,30,34,0.0))", transform: "rotate(-6deg)" }} />
        <Status terang />
        <X className="absolute top-16 left-5 size-7 text-white" />
        <p className="absolute inset-x-0 text-center text-[16px] font-medium text-white" style={{ top: 150 }}>Arahkan kamera ke kode QR di komputer</p>
        <div className="absolute" style={{ left: 70, top: 215, width: 250, height: 250 }}>
          <div className="absolute grid place-items-center overflow-hidden rounded-xl bg-white" style={{ inset: 14, transform: `rotate(${-3 + Math.sin(tp * 1.3) * 1.2}deg) scale(${1 + Math.sin(tp * 1.7) * 0.015})` }}>
            <QrSvg ukuran={216} />
          </div>
          <Siku warna={sukses > 0.5 ? "#25d366" : "#ffffff"} />
          {tp < PT.scan && <span className="absolute rounded-full" style={{ left: 18, right: 18, top: 24 + garis * 200, height: 3, background: "#3ddc97", boxShadow: "0 0 16px 4px rgba(61,220,151,0.75)" }} />}
          {sukses > 0 && (
            <span className="absolute grid size-20 place-items-center rounded-full bg-[#25d366] text-white" style={{ left: 85, top: 85, transform: `scale(${pegas(tp, PT.scan, 12, 200)})`, boxShadow: "0 10px 30px rgba(37,211,102,0.5)" }}>
              <Check className="size-11" strokeWidth={3} />
            </span>
          )}
        </div>
        <p className="absolute inset-x-0 text-center text-[16px] font-semibold text-[#25d366]" style={{ bottom: 110 }}>Tautkan dengan nomor telepon saja</p>
        <div className="absolute inset-0 bg-white" style={{ opacity: flash }} />
      </div>

      {/* 3. Daftar perangkat tertaut */}
      <div className="absolute inset-0" style={{ opacity: s3, background: "#f2f2f7" }}>
        <Status />
        <Navbar judul="Perangkat tertaut" />
        <p className="absolute left-6 text-[13px] font-medium tracking-wide text-[#6b6b70]" style={{ top: 176 }}>PERANGKAT</p>
        <div className="absolute inset-x-4 rounded-2xl bg-white px-4 py-3.5 shadow-sm" style={{ top: 204 }}>
          <div className="flex items-center gap-3.5">
            <span className="grid size-11 place-items-center rounded-full bg-[#e9edef]"><Laptop className="size-6 text-[#54656f]" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[16.5px] font-semibold text-black">ChatGerCep</p>
              <p className="text-[13.5px] text-[#6b6b70]">Google Chrome (Windows)</p>
              <p className="text-[13px] text-[#1daa61]">Terakhir aktif: baru saja</p>
            </div>
            <ChevronRight className="size-5 text-[#c4c4c7]" />
          </div>
        </div>
        <p className="absolute inset-x-6 text-[13px] leading-snug text-[#6b6b70]" style={{ top: 308 }}>Pesan tetap terenkripsi ujung ke ujung. Anda bisa keluar dari perangkat ini kapan saja dari sini.</p>
        <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#111b21] px-4 py-2.5 text-[14px] font-semibold text-white shadow-lg" style={{ top: 110 + (1 - toast) * -30, opacity: toast, whiteSpace: "nowrap" }}>
          <span className="grid size-5 place-items-center rounded-full bg-[#25d366]"><Check className="size-3.5" strokeWidth={3} /></span>
          Perangkat berhasil ditautkan
        </div>
      </div>
    </div>
  );
}
