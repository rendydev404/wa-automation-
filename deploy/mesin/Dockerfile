# syntax=docker/dockerfile:1.7
# Image mesin ChatGerCep self-host (MODE=mesin). Dibangun CI (.github/workflows/mesin.yml) untuk linux/amd64 & arm64,
# dari repo yang sama dengan chatgercep.com (satu basis kode). Konteks build = akar repo:
#   docker build -f deploy/mesin/Dockerfile --build-arg VERSI=1.0.0 -t chatgercep-mesin .

FROM node:24-bookworm-slim AS bangun
WORKDIR /src
ENV NEXT_TELEMETRY_DISABLED=1 \
    # onnxruntime-node (penyaring prospek): biner CPU saja, bukan CUDA.
    ONNXRUNTIME_NODE_INSTALL=skip
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG VERSI=dev
# LISENSI_MODE_UJI dipaksa kosong saat build: nilainya ditanam ke kode (next.config.ts `env`), sehingga kunci lisensi
# uji tidak pernah bisa diaktifkan di image ini, termasuk lewat .env pemilik mesin.
RUN LISENSI_MODE_UJI= VERSI_APLIKASI=$VERSI npm run build \
 # Buang biner native yang bukan Linux & cache build (image lebih kecil).
 && rm -rf .next/standalone/node_modules/onnxruntime-node/bin/napi-v6/win32 \
           .next/standalone/node_modules/onnxruntime-node/bin/napi-v6/darwin \
           .next/standalone/node_modules/@img .next/cache

FROM node:24-bookworm-slim
WORKDIR /app
ARG VERSI=dev
ENV NODE_ENV=production \
    MODE=mesin \
    VERSI_APLIKASI=$VERSI \
    HOSTNAME=0.0.0.0 \
    PORT=3230 \
    DATA_DIR=/app/data \
    NEXT_TELEMETRY_DISABLED=1 \
    # SIGTERM ditangani src/instrumentation.ts: koneksi WhatsApp ditutup rapi sebelum keluar.
    NEXT_MANUAL_SIG_HANDLE=1 \
    NODE_OPTIONS=--max-old-space-size=1536
COPY --from=bangun --chown=1001:1001 /src/.next/standalone ./
COPY --from=bangun --chown=1001:1001 /src/.next/static ./.next/static
COPY --from=bangun --chown=1001:1001 /src/public ./public
RUN mkdir -p /app/data && chown 1001:1001 /app/data
USER 1001:1001
EXPOSE 3230
LABEL org.opencontainers.image.title="ChatGerCep Mesin" \
      org.opencontainers.image.description="ChatGerCep self-host: WhatsApp + AI + product knowledge, dikendalikan lisensi" \
      org.opencontainers.image.source="https://github.com/rendydev404/wa-automation-" \
      org.opencontainers.image.version=$VERSI
CMD ["node", "server.js"]
