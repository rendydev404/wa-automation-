#!/usr/bin/env bash
# Bangun di mesin ini, kirim hasilnya ke VPS, lalu jalankan ulang container.
# Pakai: bash deploy/deploy.sh user@host
#        SSH_KEY=~/.ssh/kunci bash deploy/deploy.sh user@host   (bila perlu kunci tertentu)
# Prasyarat sekali saja di VPS: /opt/wa-automation/.env (lihat .env.example).
set -euo pipefail
cd "$(dirname "$0")/.."
HOST="${1:?pakai: bash deploy/deploy.sh user@host}"
DIR=/opt/wa-automation
TMP=.deploy-tmp
SSH=(ssh)
[ -n "${SSH_KEY:-}" ] && SSH+=(-o IdentitiesOnly=yes -i "$SSH_KEY")

npm run build
rm -rf "$TMP" && mkdir -p "$TMP/standalone/.next"
cp -r .next/standalone/. "$TMP/standalone/"
cp -r .next/static "$TMP/standalone/.next/static"
[ -d public ] && cp -r public "$TMP/standalone/public"
# Jangan pernah ikut terkirim: data lokal, env lokal, dan biner khusus Windows.
rm -rf "$TMP/standalone/data" "$TMP/standalone"/.env* "$TMP/standalone/node_modules/@img"
echo "manual-$(date +%Y%m%d-%H%M%S)" > "$TMP/standalone/VERSI"
cp deploy/Dockerfile deploy/docker-compose.yml "$TMP/"

"${SSH[@]}" "$HOST" "mkdir -p $DIR && rm -rf $DIR/standalone"
tar czf - -C "$TMP" . | "${SSH[@]}" "$HOST" "tar xzf - -C $DIR"
# --remove-orphans: container yang sudah tidak ada di compose (mis. `waha` dari versi sebelum Baileys)
# ikut dihentikan. Volume-nya tidak dihapus.
"${SSH[@]}" "$HOST" "cd $DIR && test -f .env || { echo 'BELUM ADA $DIR/.env'; exit 1; } && grep -q '^DATABASE_URL=' .env || { echo 'DATABASE_URL belum ada di $DIR/.env (lihat deploy/postgres/)'; exit 1; } && docker compose up -d --build --force-recreate --remove-orphans && docker compose ps"
rm -rf "$TMP"
