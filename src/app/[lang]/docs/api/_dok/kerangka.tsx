import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Info, Lightbulb, TriangleAlert } from "lucide-react";
import { bahasaSah, pembuatT } from "@/lib/bahasa";
import { MEREK } from "@/lib/merek";
import { HALAMAN_DOK, jalurHalaman } from "./data";

/** Metadata satu halaman docs (judul & deskripsi dari HALAMAN_DOK). Docs belum dibuka umum: tidak diindeks. */
export async function metaDok(params: Promise<{ lang: string }>, slug: string): Promise<Metadata> {
  const { lang } = await params;
  const b = bahasaSah(lang) ? lang : "id";
  const t = pembuatT(b);
  const h = HALAMAN_DOK.find((x) => x.slug === slug)!;
  const jalur = jalurHalaman(slug);
  return {
    title: `${h.judul[b]} · ${t("Dokumentasi Developer API", "Developer API docs")} · ${MEREK}`,
    description: h.ringkas[b],
    alternates: { canonical: jalur, languages: { id: jalur, en: `/eng${jalur}` } },
    robots: { index: false, follow: false },
  };
}

export function JudulHalaman({ label, judul, children }: { label: string; judul: string; children?: ReactNode }) {
  return (
    <header className="mb-8 border-b border-line pb-7">
      <p className="text-[12px] font-bold tracking-[0.08em] text-accent uppercase">{label}</p>
      <h1 className="mt-2 text-[28px] leading-tight font-extrabold tracking-tight sm:text-[34px]">{judul}</h1>
      {children && <div className="mt-3 max-w-2xl text-[15.5px] leading-relaxed text-muted">{children}</div>}
    </header>
  );
}

export function Bagian({ id, judul, children }: { id: string; judul: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 space-y-4 pt-2">
      <h2 className="group flex items-center gap-2 text-[21px] font-bold tracking-tight">
        {judul}
        <a href={`#${id}`} className="text-faint opacity-0 transition-opacity group-hover:opacity-100" aria-label={`Tautan ke ${judul}`}>
          #
        </a>
      </h2>
      {children}
    </section>
  );
}

const GAYA_CATATAN = {
  info: { kelas: "border-accent/30 bg-accent-soft", ikon: Info, warna: "text-accent" },
  tips: { kelas: "border-success/30 bg-success-soft", ikon: Lightbulb, warna: "text-success" },
  awas: { kelas: "border-warning/40 bg-warning-soft", ikon: TriangleAlert, warna: "text-warning" },
} as const;

export function Catatan({ jenis = "info", judul, children }: { jenis?: keyof typeof GAYA_CATATAN; judul?: string; children: ReactNode }) {
  const g = GAYA_CATATAN[jenis];
  return (
    <div className={`flex gap-3 rounded-xl border p-4 text-[13.5px] leading-relaxed ${g.kelas}`}>
      <g.ikon className={`mt-0.5 size-4 shrink-0 ${g.warna}`} aria-hidden />
      <div className="min-w-0">
        {judul && <p className="font-semibold text-fg">{judul}</p>}
        <div className="text-fg/85">{children}</div>
      </div>
    </div>
  );
}

/** Langkah bernomor dengan garis penghubung. */
export function Langkah({ daftar }: { daftar: { judul: string; isi: ReactNode }[] }) {
  return (
    <ol className="relative space-y-6">
      {daftar.map((l, i) => (
        <li key={l.judul} className="relative flex gap-4">
          {i < daftar.length - 1 && <span aria-hidden className="absolute top-8 bottom-[-1.5rem] left-[15px] w-px bg-line" />}
          <span className="relative z-10 grid size-8 shrink-0 place-items-center rounded-full bg-ink text-[13px] font-bold text-ink-signal">{i + 1}</span>
          <div className="min-w-0 flex-1 pt-1">
            <p className="text-[15px] font-semibold">{l.judul}</p>
            <div className="mt-1.5 space-y-3 text-[14px] leading-relaxed text-muted">{l.isi}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Tabel sederhana. */
export function Tabel({ kepala, baris }: { kepala: string[]; baris: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full text-left text-[13.5px]">
        <thead className="bg-subtle/60 text-[12px] text-muted uppercase">
          <tr>
            {kepala.map((k) => (
              <th key={k} className="px-4 py-2.5 font-semibold">
                {k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {baris.map((r, i) => (
            <tr key={i} className="align-top">
              {r.map((c, j) => (
                <td key={j} className="px-4 py-2.5">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const K = ({ children }: { children: ReactNode }) => <code className="rounded bg-subtle px-1.5 py-0.5 text-[12.5px]">{children}</code>;
