import { C, lepas, mendarat, t } from "../dasar";

/** Judul kinetik konten pendek: kata muncul satu per satu, kata yang diapit *...* diberi warna aksen. */

export interface BarisJudul {
  teks: string;
  ukuran?: number;
  warna?: string;
  /** warna kata yang diapit *...* */
  aksen?: string;
}

export function Judul({ f, dari, sampai, baris, top = 210, instan = false }: { f: number; dari: number; sampai: number; baris: BarisJudul[]; top?: number; instan?: boolean }) {
  const L = f - dari;
  if (L < 0 || f > sampai) return null;
  const keluar = t(f, [sampai - 6, sampai], [0, 1], lepas);
  let n = 0;
  return (
    <div style={{ position: "absolute", left: 50, right: 50, top, textAlign: "center", opacity: 1 - keluar, transform: `translateY(${-keluar * 24}px)`, zIndex: 20 }}>
      {baris.map((b, i) => {
        const kata = b.teks.split(" ");
        return (
          <div key={i} style={{ fontSize: b.ukuran ?? 82, fontWeight: 800, lineHeight: 1.1, letterSpacing: -1.5, color: b.warna ?? C.fg, textShadow: "0 6px 28px rgba(0,0,0,0.65)" }}>
            {kata.map((w, j) => {
              const k = n++;
              const p = instan ? 1 : t(L, [k * 3, k * 3 + 9], [0, 1], mendarat);
              const sorot = w.startsWith("*") && w.endsWith("*");
              return (
                <span key={j} style={{ display: "inline-block", whiteSpace: "pre", opacity: p, transform: `translateY(${(1 - p) * 34}px) scale(${0.82 + 0.18 * p})`, color: sorot ? (b.aksen ?? C.hijau) : undefined }}>
                  {sorot ? w.slice(1, -1) : w}
                  {j < kata.length - 1 ? " " : ""}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
