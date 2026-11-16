/**
 * Bahan SEO bersama: alamat situs, halaman publik yang boleh diindeks, dan pembuat JSON-LD yang aman disisipkan.
 * Dipakai landing page, /sitemap.xml, dan /llms.txt supaya ketiganya selalu sepakat.
 */
import { SLUG_LP } from "@/lib/lp/def";
import { MEREK, PERUSAHAAN } from "@/lib/merek";

export const ASAL_SITUS = process.env.APP_URL?.replace(/\/+$/, "") || "https://chatgercep.com";

/** Halaman publik dua bahasa (versi Inggris di /eng/...). Halaman app, login, dan Developer API sengaja tidak masuk. */
export const HALAMAN_DUA_BAHASA = [
  { jalur: "/", prioritas: 1.0, frekuensi: "weekly" },
  { jalur: "/panduan", prioritas: 0.8, frekuensi: "monthly" },
  { jalur: "/program-afiliasi", prioritas: 0.6, frekuensi: "monthly" },
] as const;

/** Halaman publik khusus bahasa Indonesia: landing page per industri + syarat garansi. */
export const HALAMAN_ID_SAJA = [...SLUG_LP.map((s) => ({ jalur: `/${s}`, prioritas: 0.8, frekuensi: "monthly" })), { jalur: "/garansi", prioritas: 0.4, frekuensi: "yearly" }] as const;

export const urlEn = (jalur: string) => (jalur === "/" ? "/eng" : `/eng${jalur}`);

/** JSON aman untuk <script type="application/ld+json">: "<" di-escape supaya isi teks tidak bisa menutup tag skrip. */
export const jsonLdAman = (o: unknown) => JSON.stringify(o).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

/** Entitas Organization yang dirujuk @id dari data terstruktur lain. */
export const ID_ORGANISASI = `${ASAL_SITUS}/#organisasi`;
export const ID_SITUS = `${ASAL_SITUS}/#situs`;
export const ID_APLIKASI = `${ASAL_SITUS}/#aplikasi`;

export const dataOrganisasi = () => ({
  "@type": "Organization",
  "@id": ID_ORGANISASI,
  name: PERUSAHAAN,
  legalName: PERUSAHAAN,
  alternateName: MEREK,
  url: ASAL_SITUS,
  logo: { "@type": "ImageObject", url: `${ASAL_SITUS}/icon-512.png`, width: 512, height: 512 },
  brand: { "@type": "Brand", name: MEREK },
  areaServed: { "@type": "Country", name: "Indonesia" },
});
