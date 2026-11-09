import { ArrowUpRight, BookOpen, Car, FlaskConical, type LucideIcon, MessageCircle, Plane, Shirt, ShoppingBag, Sparkles, Truck, UtensilsCrossed, Wrench } from "lucide-react";
import type { Bahasa, T } from "@/lib/bahasa";
import { NAMA_LP_EN, type SlugLp } from "@/lib/lp/def";
import { DAFTAR_INDUSTRI } from "@/lib/lp/industri";

const IKON: Record<string, LucideIcon> = {
  box: ShoppingBag,
  shirt: Shirt,
  sparkle: Sparkles,
  car: Car,
  flask: FlaskConical,
  wrench: Wrench,
  truck: Truck,
  plane: Plane,
  utensils: UtensilsCrossed,
  book: BookOpen,
};

/**
 * Landing utama: kartu contoh landing page per jenis usaha (/laundry, /bengkel, ...). Komponen server statis: data dari
 * lp/industri/*.json ikut prerender, tidak ada JSON industri yang dikirim ke browser. Tautan biasa (<a>), bukan <Link>:
 * LP disajikan route handler (HTML utuh), jadi tidak perlu prefetch RSC.
 */
export function ContohIndustri({ b, t }: { b: Bahasa; t: T }) {
  return (
    <section id="contoh-usaha" aria-labelledby="judul-contoh-usaha" className="mx-auto max-w-[1200px] scroll-mt-8 px-4 pb-20 sm:px-6 lg:pb-28">
      <div className="max-w-2xl">
        <p className="text-[12px] font-bold tracking-[0.1em] text-accent uppercase">{t("Contoh per jenis usaha", "Examples by business type")}</p>
        <h2 id="judul-contoh-usaha" className="mt-2 text-3xl font-extrabold tracking-tight sm:text-[40px]">
          {t("Lihat cara AI melayani usaha seperti milik Anda.", "See how the AI serves a business like yours.")}
        </h2>
        <p className="mt-3 text-[16px] text-muted">
          {t(
            "Pilih jenis usaha Anda untuk melihat contoh pertanyaan pelanggan, simulasi chat WhatsApp, dan FAQ yang khusus untuk industri itu.",
            "Pick your type of business to see typical customer questions, a simulated WhatsApp chat, and FAQs for that industry (pages in Indonesian).",
          )}
        </p>
      </div>
      {/* HP: 2 kolom ringkas (ikon + nama) supaya 10 kartu tidak memanjangkan halaman; contoh chat mulai layar sm. */}
      <ul className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        {DAFTAR_INDUSTRI.map((ind) => {
          const Ikon = IKON[ind.theme.icon] ?? MessageCircle;
          const tanya = ind.demo_conversations.scenarios[0]?.messages[0]?.text ?? "";
          return (
            <li key={ind.slug}>
              <a
                href={`/${ind.slug}`}
                className="group flex h-full flex-col rounded-3xl border border-line bg-surface p-4 shadow-card transition-all duration-200 hover:-translate-y-1 hover:border-accent/30 hover:shadow-pop sm:p-5"
              >
                <span className="flex items-center gap-2.5 sm:gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-2xl text-white sm:size-10" style={{ backgroundColor: ind.theme.accent }}>
                    <Ikon className="size-[18px] sm:size-5" aria-hidden />
                  </span>
                  <span className="text-[14px] leading-tight font-bold sm:text-[15px]">{b === "en" ? NAMA_LP_EN[ind.slug as SlugLp] : ind.industry_name}</span>
                </span>
                <span className="mt-4 hidden rounded-2xl rounded-tl-md bg-subtle px-3.5 py-2.5 text-[13px] leading-snug text-muted sm:block">
                  <span className="line-clamp-2">“{tanya}”</span>
                </span>
                <span className="mt-auto inline-flex items-center gap-1 pt-3 text-[13px] font-bold text-accent sm:pt-4">
                  {t("Lihat contoh", "See example")}
                  <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
