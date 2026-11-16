import { ASAL_SITUS, HALAMAN_DUA_BAHASA, HALAMAN_ID_SAJA, urlEn } from "@/lib/seo";

/**
 * Sitemap utama (dirujuk public/robots.txt): landing page, panduan, program afiliasi (dua bahasa, dengan hreflang),
 * landing page industri, dan syarat garansi. Statis: dibuat saat build. /sitemap-lp.xml tetap ada untuk yang sudah
 * mendaftarkannya di Search Console.
 */
export function GET(): Response {
  const loc = (j: string) => `${ASAL_SITUS}${j === "/" ? "/" : j}`;
  const alt = (j: string) =>
    `    <xhtml:link rel="alternate" hreflang="id" href="${loc(j)}"/>\n    <xhtml:link rel="alternate" hreflang="en" href="${loc(urlEn(j))}"/>\n    <xhtml:link rel="alternate" hreflang="x-default" href="${loc(j)}"/>`;
  const baris = [
    ...HALAMAN_DUA_BAHASA.flatMap((h) =>
      [h.jalur, urlEn(h.jalur)].map(
        (j) => `  <url>\n    <loc>${loc(j)}</loc>\n${alt(h.jalur)}\n    <changefreq>${h.frekuensi}</changefreq>\n    <priority>${j === h.jalur ? h.prioritas.toFixed(1) : (h.prioritas * 0.8).toFixed(1)}</priority>\n  </url>`,
      ),
    ),
    ...HALAMAN_ID_SAJA.map((h) => `  <url>\n    <loc>${loc(h.jalur)}</loc>\n    <changefreq>${h.frekuensi}</changefreq>\n    <priority>${h.prioritas.toFixed(1)}</priority>\n  </url>`),
  ];
  const isi = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${baris.join("\n")}
</urlset>
`;
  return new Response(isi, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
