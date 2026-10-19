# Image runtime saja: hasil `next build` (output standalone) dibangun di mesin dev lalu disalin ke sini,
# supaya VPS yang RAM-nya ketat tidak perlu menjalankan build. Lihat deploy/deploy.sh.
FROM node:24-bookworm-slim
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/data \
    NEXT_MANUAL_SIG_HANDLE=1
# NEXT_MANUAL_SIG_HANDLE: Next.js tidak langsung exit saat SIGTERM; src/instrumentation.ts menutup
# koneksi WhatsApp dan menuntaskan tulisan kunci dulu (kunci yang hilang = perangkat dicabut WhatsApp).
WORKDIR /app

RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs \
 && mkdir -p /data && chown nextjs:nodejs /data

COPY --chown=nextjs:nodejs standalone/ ./

USER nextjs
VOLUME /data
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
