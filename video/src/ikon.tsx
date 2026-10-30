import type { ReactNode } from "react";

/**
 * Ikon aplikasi bergaya iOS (digambar ulang sebagai SVG: kotak "squircle" 60 x 60, gradasi & simbol khas tiap
 * aplikasi bawaan + WhatsApp). Semua dalam satu viewBox supaya tajam di ukuran berapa pun.
 */

export type JenisIkon =
  | "telepon"
  | "pesan"
  | "whatsapp"
  | "kamera"
  | "foto"
  | "setelan"
  | "jam"
  | "cuaca"
  | "kalender"
  | "peta"
  | "catatan"
  | "appstore"
  | "safari"
  | "musik"
  | "mail"
  | "facetime";

function Kotak({ id, dari, ke, children, latar }: { id: string; dari: string; ke: string; children: ReactNode; latar?: string }) {
  return (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={dari} />
          <stop offset="1" stopColor={ke} />
        </linearGradient>
      </defs>
      <rect width="60" height="60" rx="13.5" fill={latar ?? `url(#${id})`} />
      {children}
    </>
  );
}

const GAGANG = "M22.6 17.5c.9-.5 2-.3 2.6.5l2.6 3.6c.6.8.5 2-.2 2.7l-1.8 1.7c-.4.4-.5 1-.2 1.5 1.4 2.7 3.6 4.9 6.3 6.3.5.3 1.1.2 1.5-.2l1.7-1.8c.7-.7 1.9-.8 2.7-.2l3.6 2.6c.8.6 1 1.7.5 2.6l-1.2 2c-.9 1.5-2.7 2.3-4.4 1.8C30.3 39 21 29.7 19 21.6c-.4-1.7.3-3.5 1.8-4.4z";

export function IkonApp({ jenis, ukuran, badge }: { jenis: JenisIkon; ukuran: number; badge?: number }) {
  const id = `g-${jenis}`;
  let isi: ReactNode;
  switch (jenis) {
    case "telepon":
      isi = (
        <Kotak id={id} dari="#6ef07c" ke="#2cc84d">
          <path d={GAGANG} fill="#fff" />
        </Kotak>
      );
      break;
    case "pesan":
      isi = (
        <Kotak id={id} dari="#6ef07c" ke="#2cc84d">
          <path d="M30 14c-9.4 0-17 6.3-17 14.1 0 4.4 2.4 8.4 6.2 11-.3 2.4-1.5 4.6-3.3 6.2 3.3-.2 6.3-1.4 8.6-3.4 1.8.5 3.6.7 5.5.7 9.4 0 17-6.3 17-14.1S39.4 14 30 14z" fill="#fff" />
        </Kotak>
      );
      break;
    case "whatsapp":
      isi = (
        <Kotak id={id} dari="#5cf27f" ke="#1fb954">
          <path d="M30 13.5c-9.2 0-16.6 7.4-16.6 16.6 0 3 .8 5.8 2.2 8.3l-2.4 8.4 8.6-2.3c2.4 1.3 5.2 2.1 8.2 2.1 9.2 0 16.6-7.4 16.6-16.6S39.2 13.5 30 13.5z" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinejoin="round" />
          <path d="M24.4 22.2c.5-.3 1.1-.2 1.4.3l1.6 2.6c.3.5.2 1.1-.2 1.5l-1 .9c.9 1.9 2.4 3.4 4.3 4.3l.9-1c.4-.4 1-.5 1.5-.2l2.6 1.6c.5.3.6.9.3 1.4l-.8 1.3c-.6 1-1.8 1.4-2.9 1.1-4.3-1.3-7.6-4.6-8.9-8.9-.3-1.1.1-2.3 1.1-2.9z" fill="#fff" />
        </Kotak>
      );
      break;
    case "facetime":
      isi = (
        <Kotak id={id} dari="#6ef07c" ke="#2cc84d">
          <rect x="12" y="21" width="24" height="18" rx="5" fill="#fff" />
          <path d="M38 27l9-5.5v17L38 33z" fill="#fff" />
        </Kotak>
      );
      break;
    case "kamera":
      isi = (
        <Kotak id={id} dari="#e3e5e8" ke="#a6aab0">
          <rect x="9" y="19" width="42" height="27" rx="5" fill="#2b2d31" />
          <rect x="22" y="15" width="14" height="6" rx="2" fill="#2b2d31" />
          <circle cx="30" cy="32.5" r="9" fill="#e8eaed" />
          <circle cx="30" cy="32.5" r="6.3" fill="#3c3f45" />
          <circle cx="28" cy="30.5" r="1.8" fill="#9aa4b5" />
          <circle cx="45" cy="24" r="1.6" fill="#f4c542" />
        </Kotak>
      );
      break;
    case "foto": {
      const warna = ["#fbbc05", "#f68b1f", "#ea4335", "#c2185b", "#7b4fd6", "#4285f4", "#34a853", "#9ccc3c"];
      isi = (
        <Kotak id={id} dari="#ffffff" ke="#f2f2f2">
          {warna.map((w, i) => (
            <ellipse key={i} cx="30" cy="20.5" rx="5.6" ry="9.5" fill={w} opacity="0.85" transform={`rotate(${i * 45} 30 30)`} style={{ mixBlendMode: "multiply" }} />
          ))}
        </Kotak>
      );
      break;
    }
    case "setelan":
      isi = (
        <Kotak id={id} dari="#a4a7ad" ke="#6f737a">
          <circle cx="30" cy="30" r="17" fill="none" stroke="#3a3c40" strokeWidth="6" strokeDasharray="3.6 3.1" />
          <circle cx="30" cy="30" r="13" fill="#d6d8db" />
          <circle cx="30" cy="30" r="8.5" fill="#6f737a" />
          <circle cx="30" cy="30" r="4" fill="#d6d8db" />
        </Kotak>
      );
      break;
    case "jam":
      isi = (
        <Kotak id={id} dari="#1c1c1e" ke="#000">
          <circle cx="30" cy="30" r="21" fill="#fff" />
          {Array.from({ length: 12 }, (_, i) => (
            <rect key={i} x="29.4" y="10.5" width="1.2" height="3" fill="#1c1c1e" transform={`rotate(${i * 30} 30 30)`} />
          ))}
          <path d="M30 30V18.5" stroke="#1c1c1e" strokeWidth="2" strokeLinecap="round" />
          <path d="M30 30l8 5" stroke="#1c1c1e" strokeWidth="2" strokeLinecap="round" />
          <path d="M30 30l-9-8" stroke="#ff9500" strokeWidth="1" strokeLinecap="round" />
          <circle cx="30" cy="30" r="1.6" fill="#ff9500" />
        </Kotak>
      );
      break;
    case "cuaca":
      isi = (
        <Kotak id={id} dari="#2f8ef7" ke="#62c8fb">
          <circle cx="24" cy="24" r="8.5" fill="#ffd60a" />
          <path d="M23 43h20a7 7 0 0 0 0-14 9 9 0 0 0-17-1.5A7.5 7.5 0 0 0 23 43z" fill="#fff" />
        </Kotak>
      );
      break;
    case "kalender":
      isi = (
        <Kotak id={id} dari="#fff" ke="#fff">
          <text x="30" y="17" textAnchor="middle" fontSize="8" fontWeight="600" fill="#ff3b30" fontFamily="system-ui, sans-serif">
            THU
          </text>
          <text x="30" y="44" textAnchor="middle" fontSize="27" fontWeight="300" fill="#1c1c1e" fontFamily="system-ui, sans-serif">
            30
          </text>
        </Kotak>
      );
      break;
    case "peta":
      isi = (
        <Kotak id={id} dari="#f4f1ea" ke="#e9e4d8">
          <path d="M0 40 L60 22" stroke="#fff" strokeWidth="7" />
          <path d="M22 0 L36 60" stroke="#fde68a" strokeWidth="5" />
          <path d="M8 60c6-14 18-12 22-24s14-14 24-16" stroke="#0a84ff" strokeWidth="3" fill="none" strokeLinecap="round" />
          <rect x="38" y="36" width="14" height="14" rx="3" fill="#86d98b" />
          <circle cx="40" cy="20" r="5" fill="#ff3b30" stroke="#fff" strokeWidth="1.6" />
        </Kotak>
      );
      break;
    case "catatan":
      isi = (
        <Kotak id={id} dari="#fff" ke="#fbfbfb">
          <rect x="0" y="0" width="60" height="15" fill="#fcd34d" />
          {[24, 32, 40, 48].map((y) => (
            <rect key={y} x="9" y={y} width="42" height="1" fill="#d6d6d6" />
          ))}
        </Kotak>
      );
      break;
    case "appstore":
      isi = (
        <Kotak id={id} dari="#18bffb" ke="#1e6ff2">
          <path d="M23.5 42L33 19M36.5 42L27 19M18 35h24" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" />
        </Kotak>
      );
      break;
    case "safari":
      isi = (
        <Kotak id={id} dari="#fff" ke="#f1f1f1">
          <circle cx="30" cy="30" r="21" fill="url(#g-safari-b)" />
          <defs>
            <linearGradient id="g-safari-b" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#1ec8fa" />
              <stop offset="1" stopColor="#1a73f0" />
            </linearGradient>
          </defs>
          <path d="M30 30l11-11-7.5 13.5z" fill="#ff3b30" />
          <path d="M30 30L19 41l7.5-13.5z" fill="#fff" />
        </Kotak>
      );
      break;
    case "musik":
      isi = (
        <Kotak id={id} dari="#fd5d7d" ke="#fb2445">
          <path d="M37 15v21.5a5 5 0 1 1-3-4.6V21l-10 2.4v16.1a5 5 0 1 1-3-4.6V20.5z" fill="#fff" />
        </Kotak>
      );
      break;
    case "mail":
      isi = (
        <Kotak id={id} dari="#1e8cf8" ke="#62c0fb">
          <rect x="11" y="18" width="38" height="25" rx="3" fill="#fff" />
          <path d="M11.5 19.5L30 33l18.5-13.5" stroke="#3a8ff3" strokeWidth="2" fill="none" />
        </Kotak>
      );
      break;
  }
  return (
    <div style={{ position: "relative", width: ukuran, height: ukuran }}>
      <svg width={ukuran} height={ukuran} viewBox="0 0 60 60" style={{ display: "block", filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.18))" }}>
        {isi}
      </svg>
      {badge ? (
        <span
          style={{
            position: "absolute",
            top: -ukuran * 0.08,
            right: -ukuran * 0.1,
            minWidth: ukuran * 0.34,
            height: ukuran * 0.34,
            padding: `0 ${ukuran * 0.08}px`,
            borderRadius: ukuran,
            background: "#ff3b30",
            color: "#fff",
            fontSize: ukuran * 0.22,
            fontWeight: 600,
            display: "grid",
            placeItems: "center",
            boxSizing: "border-box",
          }}
        >
          {badge}
        </span>
      ) : null}
    </div>
  );
}
