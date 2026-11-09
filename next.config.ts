import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // CI mengecek tipe di job terpisah yang berjalan paralel (deploy.yml, job `periksa`); build lokal tetap mengecek.
  typescript: { ignoreBuildErrors: process.env.LEWATI_CEK_TIPE === "1" },
  // Build mandiri untuk Docker (image kecil).
  output: "standalone",
  outputFileTracingRoot: path.resolve(process.cwd()),
  // unpdf membawa pdf.js sendiri; biarkan dimuat dari node_modules, jangan dibundel.
  // baileys (WhatsApp) murni ESM dengan protobuf & WASM: dimuat apa adanya saat dibutuhkan.
  // onnxruntime-node (model ML penyaring prospek) membawa pustaka native: dimuat dari node_modules.
  serverExternalPackages: ["unpdf", "baileys", "postgres", "onnxruntime-node", "nodemailer"],
  // Aturan umum bot dibaca saat jalan (src/lib/soul.ts) untuk penyedia AI tanpa Hermes: ikut ke build standalone.
  // Model ML penyaring prospek (src/lib/ml/embed.ts) & contoh awalnya (src/lib/prospek.ts) juga dibaca saat jalan.
  // Pustaka native onnxruntime dimuat lewat require dinamis (tidak terlacak): Linux untuk server, Windows x64 untuk uji
  // build lokal. Paket deploy membuang biner selain Linux (deploy.yml, deploy.sh).
  outputFileTracingIncludes: {
    "/**": [
      "./hermes/SOUL-cs.md",
      "./ml/model/model.onnx",
      "./ml/model/tokenizer.json",
      "./ml/model/tokenizer_config.json",
      "./ml/benih.bin",
      "./ml/kepala.json",
      "./node_modules/onnxruntime-node/bin/napi-v6/linux/*/libonnxruntime.so.1",
      "./node_modules/onnxruntime-node/bin/napi-v6/linux/*/onnxruntime_binding.node",
      "./node_modules/onnxruntime-node/bin/napi-v6/win32/x64/*",
    ],
  },
  experimental: {
    // Unggahan PDF maksimal 10 MB (+ overhead multipart).
    proxyClientMaxBodySize: "12mb",
  },
  // Halaman hasil bayar lama (callback Snap) -> halaman tagihan Core API yang menggantikannya.
  async redirects() {
    return [
      { source: "/langganan/selesai", has: [{ type: "query", key: "order", value: "(?<order>WA-[0-9]+-[0-9]+-[0-9a-f]+)" }], destination: "/langganan/tagihan/:order", permanent: false },
      { source: "/langganan/selesai", destination: "/langganan", permanent: false },
    ];
  },
  // Bahasa: /eng/... -> src/app/[lang] dengan lang "en", jalur halaman lain -> lang "id" (URL di browser tetap).
  // Di sini, bukan di proxy.ts: rewrite dari proxy berupa URL absolut yang host-nya dinormalkan Next ke "localhost",
  // sehingga dengan HOSTNAME=127.0.0.1 (deploy/docker-compose.yml) dianggap proxy eksternal dan gagal.
  // Dikecualikan: /api, /_next, berkas statis (ada titik di segmen terakhir: logo, ikon, robots.txt).
  // Urutan penting: aturan beforeFiles berantai (aturan berikutnya melihat jalur hasil aturan sebelumnya).
  // /id/... atau /en/... yang dibuka langsung menjadi /id/id/... -> 404 (segmen internal tidak terbuka).
  // /[lang]/... tidak ditulis ulang: Next meneruskan server action antar-halaman ke jalur worker itu secara internal.
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/:path((?!api(?:/|$)|_next/|eng(?:/|$)|\\[|%5B)(?!.*\\.[a-zA-Z0-9]+$).+)", destination: "/id/:path" },
        { source: "/", destination: "/id" },
        { source: "/eng", destination: "/en" },
        { source: "/eng/:path((?!.*\\.[a-zA-Z0-9]+$).+)", destination: "/en/:path" },
      ],
    };
  },
  async headers() {
    return [
      // Logo kanal pembayaran: berkas statis kecil, disimpan browser seminggu (ganti logo = ganti nama berkas).
      { source: "/logo-bayar/:berkas", headers: [{ key: "Cache-Control", value: "public, max-age=604800" }] },
      // Gambar panduan (/panduan): berganti hanya saat panduan difoto ulang; disimpan browser sehari.
      { source: "/panduan/:berkas", headers: [{ key: "Cache-Control", value: "public, max-age=86400" }] },
      // Service worker push admin: selalu dicek ulang supaya perubahan langsung terpakai.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Content-Type", value: "application/javascript; charset=utf-8" }] },
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
