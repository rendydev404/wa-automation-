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
  // onnxruntime-node (model ML penyaring prospek) membawa pustaka native: dimuat dari node_modules.
  serverExternalPackages: ["unpdf", "baileys", "postgres", "onnxruntime-node"],
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
