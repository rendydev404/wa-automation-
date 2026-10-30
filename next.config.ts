import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // Build mandiri untuk Docker (image kecil).
  output: "standalone",
  outputFileTracingRoot: path.resolve(process.cwd()),
  // unpdf membawa pdf.js sendiri; biarkan dimuat dari node_modules, jangan dibundel.
  // baileys (WhatsApp) murni ESM dengan protobuf & WASM: dimuat apa adanya saat dibutuhkan.
  serverExternalPackages: ["unpdf", "baileys", "postgres"],
  // Aturan umum bot dibaca saat jalan (src/lib/soul.ts) untuk penyedia AI tanpa Hermes: ikut ke build standalone.
  outputFileTracingIncludes: { "/**": ["./hermes/SOUL-cs.md"] },
  experimental: {
    // Unggahan PDF maksimal 10 MB (+ overhead multipart).
    proxyClientMaxBodySize: "12mb",
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // Diabaikan browser lewat HTTP biasa (dev); di produksi (HTTPS lewat Caddy) memaksa HTTPS setahun.
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          // Tanpa script-src: Next.js menyisipkan skrip inline. Yang dikunci: <base>, plugin, iframe, dan tujuan form.
          { key: "Content-Security-Policy", value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'" },
        ],
      },
    ];
  },
  turbopack: {
    root: path.resolve(process.cwd()),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
