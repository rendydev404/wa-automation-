import { SLUG_LP } from "@/lib/lp/def";

/** Sitemap landing page industri (dirujuk public/robots.txt). Statis: dibuat saat build. */
const ASAL = process.env.APP_URL?.replace(/\/+$/, "") || "https://chatgercep.com";

export function GET(): Response {
  const isi = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${ASAL}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
${SLUG_LP.map((s) => `  <url><loc>${ASAL}/${s}</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>`).join("\n")}
</urlset>
`;
  return new Response(isi, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
