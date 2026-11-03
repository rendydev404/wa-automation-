import { MEREK_BELAKANG, MEREK_DEPAN } from "@/lib/merek";

/**
 * Tanda merek: gelembung chat dengan panah naik + titik. Digambar ulang sebagai geometri bersih dari logo resmi
 * (elips 50x40,5; panah simetris 45°; sisi kanan ekor menyinggung elips), jadi tajam di ukuran berapa pun.
 * Panahnya berupa potongan, sehingga mengikuti warna latar (putih di latar terang, gelap di sidebar).
 * Path yang sama dipakai src/app/icon.svg; ubah keduanya bersamaan.
 */
export const PATH_TANDA = "M23.74 76.26A50 40.5 0 1 1 85.06 70.68L50 98.6L50 79.8L36.9 79.8L64.45 52.25L72.3 60.1L79.12 29.22L48.25 36.05L56.1 43.9Z";

export function TandaMerek({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={`shrink-0 text-merek ${className}`}>
      <path d={PATH_TANDA} fill="currentColor" />
      <circle cx="94.76" cy="75.68" r="4.68" fill="currentColor" />
    </svg>
  );
}

const UKURAN = {
  sm: { tanda: "size-7", teks: "text-[17px]", jarak: "gap-2" },
  md: { tanda: "size-8 sm:size-10", teks: "text-[17px] sm:text-[22px]", jarak: "gap-2 sm:gap-2.5" },
  lg: { tanda: "size-12", teks: "text-[27px]", jarak: "gap-3" },
} as const;

/**
 * Logo lengkap: tanda + tulisan dua warna ("Chat" tinta, "GerCep" hijau merek) dalam Montserrat Bold seperti logo
 * resmi. Teksnya teks sungguhan (terbaca pembaca layar & mesin pencari). `gelap` = untuk latar tinta.
 */
export function Logo({ ukuran = "sm", gelap = false, className = "" }: { ukuran?: keyof typeof UKURAN; gelap?: boolean; className?: string }) {
  const u = UKURAN[ukuran];
  return (
    <span className={`inline-flex min-w-0 items-center ${u.jarak} ${className}`}>
      <TandaMerek className={u.tanda} />
      {/* Dua span tanpa spasi dibaca pembaca layar sebagai satu kata "ChatGerCep". */}
      <span className={`truncate font-merek leading-none font-bold tracking-[-0.01em] ${u.teks}`}>
        <span className={gelap ? "text-ink-fg" : "text-merek-tinta"}>{MEREK_DEPAN}</span>
        <span className="text-merek">{MEREK_BELAKANG}</span>
      </span>
    </span>
  );
}
