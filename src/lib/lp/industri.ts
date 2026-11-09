/**
 * Isi landing page tiap industri (lp/industri/<slug>.json). Diimpor statis: ikut dibundel ke server, tanpa baca
 * berkas saat jalan. Hanya untuk kode server (route LP & landing utama); tidak dikirim ke browser.
 */
import bengkel from "../../../lp/industri/bengkel.json";
import catering from "../../../lp/industri/catering.json";
import distributor from "../../../lp/industri/distributor.json";
import klinikKecantikan from "../../../lp/industri/klinik-kecantikan.json";
import kursusLes from "../../../lp/industri/kursus-les.json";
import laundry from "../../../lp/industri/laundry.json";
import maklonKosmetik from "../../../lp/industri/maklon-kosmetik.json";
import rentalMobil from "../../../lp/industri/rental-mobil.json";
import tokoOnline from "../../../lp/industri/toko-online.json";
import travelUmrah from "../../../lp/industri/travel-umrah.json";
import { SLUG_LP, type SlugLp } from "./def";

export type IkonLp = "box" | "shirt" | "sparkle" | "car" | "flask" | "wrench" | "truck" | "plane" | "utensils" | "book";

export interface PesanDemo {
  from: "c" | "a" | string;
  text: string;
  image?: string;
}

export interface IndustriLp {
  slug: string;
  industry_name: string;
  industry_short: string;
  theme: { accent: string; accent_soft: string; accent_ink: string; glow: string; icon: string };
  seo_metadata: { title: string; description: string; og_title: string; og_description: string };
  hero: {
    badge: string;
    title: string;
    title_highlight: string;
    subtitle: string;
    cards: { pos: string; kicker: string; title: string; lines: string[] }[];
  };
  pain_points: { title: string; body: string }[];
  solutions: { pain: string; answer: string }[];
  demo_conversations: {
    business_name: string;
    business_initials: string;
    scenarios: { id: string; label: string; messages: PesanDemo[] }[];
  };
  benefits: { title: string; body: string }[];
  faq: { q: string; a: string }[];
  image_assets: { hero: string | null; hero_alt: string; brief: string };
  ai_prompt_template: string;
  cta_tracking: { content_name: string; content_category: string };
}

export const INDUSTRI: Record<SlugLp, IndustriLp> = {
  "toko-online": tokoOnline,
  laundry,
  "klinik-kecantikan": klinikKecantikan,
  "rental-mobil": rentalMobil,
  "maklon-kosmetik": maklonKosmetik,
  bengkel,
  distributor,
  "travel-umrah": travelUmrah,
  catering,
  "kursus-les": kursusLes,
};

/** Urutan tampil = SLUG_LP. */
export const DAFTAR_INDUSTRI: IndustriLp[] = SLUG_LP.map((s) => INDUSTRI[s]);
