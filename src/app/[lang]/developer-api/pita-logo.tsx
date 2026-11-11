import { teksHalaman } from "@/lib/bahasa-halaman";

/**
 * Pita logo bahasa & framework: logo resmi + warna merek dari simple-icons 16.36.0 (CC0; merek dagang milik
 * pemiliknya). Path ikon TIDAK ditulis ke HTML: semuanya di satu sprite statis public/developer-api/stack.svg
 * (20 KB, 8,8 KB gzip, di-cache browser/CDN) dan dirujuk lewat <use>. Tanpa JavaScript. Logo di atas ubin terang
 * supaya warna asli yang gelap (Next.js, Django, curl) tetap terlihat di latar gelap.
 *
 * Membuat ulang sprite (bila menambah ikon): impor `si<Nama>` dari "simple-icons", tulis tiap ikon sebagai
 * <symbol id="<slug>" viewBox="0 0 24 24"><path d="<path>" fill="currentColor"/></symbol>.
 */
const SPRITE = "/developer-api/stack.svg";
const IKON = [
  ["nodedotjs", "Node.js", "5FA04E"],
  ["typescript", "TypeScript", "3178C6"],
  ["javascript", "JavaScript", "F7DF1E"],
  ["python", "Python", "3776AB"],
  ["php", "PHP", "777BB4"],
  ["laravel", "Laravel", "FF2D20"],
  ["go", "Go", "00ADD8"],
  ["nextdotjs", "Next.js", "000000"],
  ["django", "Django", "092E20"],
  ["ruby", "Ruby", "CC342D"],
  ["kotlin", "Kotlin", "7F52FF"],
  ["flutter", "Flutter", "02569B"],
  ["curl", "curl", "073551"],
  ["docker", "Docker", "2496ED"],
  ["postgresql", "PostgreSQL", "4169E1"],
] as const;

export async function PitaLogo() {
  const { t } = await teksHalaman();
  const isi = (salinan: boolean) =>
    IKON.map(([slug, nama, warna]) => (
      <span key={`${salinan ? "b" : "a"}-${slug}`} className="flex shrink-0 items-center gap-3" aria-hidden={salinan || undefined}>
        <span className="grid size-11 place-items-center rounded-xl bg-[#f6f6f3] shadow-[inset_0_-2px_0_rgba(0,0,0,0.08),0_8px_20px_-10px_rgba(0,0,0,0.6)]">
          <svg viewBox="0 0 24 24" className="size-6" aria-hidden style={{ color: `#${warna}` }}>
            <use href={`${SPRITE}#${slug}`} />
          </svg>
        </span>
        <span className="text-[15px] font-semibold tracking-tight text-[#e8f0ec]/80">{nama}</span>
      </span>
    ));
  return (
    <section className="mt-20 border-y border-white/[0.06] py-9">
      <p className="mb-6 text-center text-[13px] text-[#93a99f]">{t("Cukup HTTP + JSON. Pakai bahasa & framework apa pun.", "Just HTTP + JSON. Use any language or framework.")}</p>
      <div className="ld-pita overflow-hidden">
        <div className="ld-pita-isi flex w-max gap-10 pr-10">
          {isi(false)}
          {isi(true)}
        </div>
      </div>
    </section>
  );
}
