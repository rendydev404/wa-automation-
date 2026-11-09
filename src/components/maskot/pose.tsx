"use client";

import { useEffect, useState } from "react";

/**
 * Pose maskot robot ChatGerCep untuk dashboard: potongan kepala-pinggang dari assets/maskot (PNG 1024x1536) yang
 * dikecilkan ke WebP 256x250 (±14 KB per pose) di public/maskot/dasbor. Hanya pose yang sedang tampil yang diunduh;
 * pose baru di-decode dulu sebelum menggantikan yang lama, jadi tidak pernah berkedip kosong.
 */
export type Pose =
  | "sapa"
  | "membalas"
  | "bekerja"
  | "malam"
  | "analitik"
  | "jelaskan"
  | "tablet"
  | "tunjuk"
  | "jempol"
  | "senang"
  | "kaget"
  | "sedih"
  | "bingung"
  | "berpikir"
  | "pesanan"
  | "knowledge";

export const srcPose = (p: Pose): string => `/maskot/dasbor/${p}.webp`;

const terdekode = new Set<Pose>();

/** Unduh + decode pose di latar (dipakai sebelum menukar gambar, dan untuk pose yang hampir pasti dipakai). */
export function siapkanPose(p: Pose): Promise<void> {
  if (terdekode.has(p)) return Promise.resolve();
  const img = new Image();
  img.src = srcPose(p);
  return img
    .decode()
    .catch(() => {})
    .then(() => {
      terdekode.add(p);
    });
}

/** Gambar pose yang bertukar dengan animasi "pop" hanya setelah pose baru siap ditampilkan. */
export function GambarPose({ pose, className = "", prioritas = false }: { pose: Pose; className?: string; prioritas?: boolean }) {
  const [tampil, setTampil] = useState(pose);
  const [ganti, setGanti] = useState(0);

  useEffect(() => {
    if (pose === tampil) return;
    let batal = false;
    void siapkanPose(pose).then(() => {
      if (batal) return;
      setTampil(pose);
      setGanti((n) => n + 1);
    });
    return () => {
      batal = true;
    };
  }, [pose, tampil]);

  return (
    // eslint-disable-next-line @next/next/no-img-element -- WebP kecil statis; next/image menambah permintaan optimasi tanpa manfaat
    <img
      key={ganti}
      src={srcPose(tampil)}
      alt=""
      width={256}
      height={250}
      draggable={false}
      decoding="async"
      fetchPriority={prioritas ? "auto" : "low"}
      className={`${ganti ? "maskot-ganti" : ""} pointer-events-none select-none ${className}`}
    />
  );
}

/** Efek di sekitar kepala sesuai pose/keadaan: gelembung chat, zzz, kilau, tanda seru, dst. Hiasan saja (aria-hidden). */
export function EfekPose({ pose }: { pose: Pose }) {
  switch (pose) {
    case "membalas":
      return (
        <span aria-hidden className="pointer-events-none absolute top-[42%] right-[6%]">
          {[0, 0.85, 1.7].map((d, i) => (
            <span
              key={i}
              className={`maskot-chat absolute block rounded-[9px] rounded-bl-[3px] shadow-sm ${i === 1 ? "h-3.5 w-6 bg-white ring-1 ring-accent/30" : "h-3 w-5 bg-[#25d366]"}`}
              style={{ animationDelay: `${d}s`, right: i * 6 }}
            />
          ))}
        </span>
      );
    case "malam":
      return (
        <span aria-hidden className="pointer-events-none absolute top-[2%] right-[8%] font-extrabold text-accent">
          {["z", "z", "Z"].map((z, i) => (
            <span key={i} className="maskot-zzz absolute block" style={{ animationDelay: `${i * 0.9}s`, fontSize: 11 + i * 4, right: i * 7 }}>
              {z}
            </span>
          ))}
        </span>
      );
    case "senang":
    case "jempol":
      return (
        <span aria-hidden className="pointer-events-none absolute inset-0">
          {[
            ["8%", "14%", 0],
            ["80%", "8%", 0.5],
            ["88%", "40%", 1],
            ["4%", "46%", 0.75],
          ].map(([l, t, d], i) => (
            <svg key={i} viewBox="0 0 24 24" className="maskot-kilau absolute size-4 text-[#f5b301]" style={{ left: l, top: t, animationDelay: `${d}s` }}>
              <path fill="currentColor" d="M12 0l2.6 9.4L24 12l-9.4 2.6L12 24l-2.6-9.4L0 12l9.4-2.6z" />
            </svg>
          ))}
        </span>
      );
    case "kaget":
      return (
        <span aria-hidden className="maskot-pop pointer-events-none absolute top-[4%] right-[10%] grid size-6 place-items-center rounded-full bg-danger text-[15px] font-black text-white shadow">
          !
        </span>
      );
    case "bingung":
      return (
        <span aria-hidden className="maskot-pop pointer-events-none absolute top-[2%] right-[12%] grid size-6 place-items-center rounded-full bg-warning text-[14px] font-black text-white shadow">
          ?
        </span>
      );
    case "sedih":
      return (
        <span aria-hidden className="maskot-zzz pointer-events-none absolute top-[10%] right-[16%] block size-2.5 rounded-full rounded-tl-none bg-[#6c8fd6]" style={{ transform: "rotate(45deg)" }} />
      );
    case "berpikir":
      return (
        <span aria-hidden className="pointer-events-none absolute top-[2%] right-[4%] flex items-end gap-1 rounded-full bg-white px-2 py-1.5 shadow ring-1 ring-line">
          {[0, 0.15, 0.3].map((d) => (
            <span key={d} className="maskot-titik block size-1.5 rounded-full bg-accent" style={{ animationDelay: `${d}s` }} />
          ))}
        </span>
      );
    case "analitik":
    case "tablet":
    case "pesanan":
      return (
        <span aria-hidden className="pointer-events-none absolute top-[6%] left-[4%] flex h-6 items-end gap-[3px] rounded-md bg-white/90 px-1.5 py-1 shadow-sm ring-1 ring-accent/20">
          {[0, 0.3, 0.6, 0.15].map((d, i) => (
            <span key={i} className="maskot-batang block w-[4px] rounded-sm bg-accent" style={{ height: `${55 + i * 15}%`, animationDelay: `${d}s` }} />
          ))}
        </span>
      );
    case "bekerja":
    case "knowledge":
      return (
        <span aria-hidden className="pointer-events-none absolute top-[3%] left-1/2 size-14 -translate-x-1/2">
          <span className="maskot-cincin absolute inset-0 rounded-full border-2 border-accent/50" />
          <span className="maskot-cincin-2 absolute inset-0 rounded-full border-2 border-accent/40" />
        </span>
      );
    default:
      return null;
  }
}
