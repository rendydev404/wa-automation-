#!/usr/bin/env bash
# Deploy manual dari mesin ini (cadangan bila CI tidak bisa dipakai): build, susun paket, lalu kirim lewat
# penerima deploy yang sama dengan CI (deploy/terima-deploy.sh), lengkap dengan cek sehat & rollback.
# Pakai: bash deploy/deploy.sh user@host
#        SSH_KEY=~/.ssh/kunci bash deploy/deploy.sh user@host   (bila perlu kunci tertentu)
# Prasyarat sekali saja di VPS: /opt/wa-automation/.env (lihat .env.example) dan
# /opt/wa-automation/bin/terima-deploy.sh (salinan deploy/terima-deploy.sh).
set -euo pipefail
cd "$(dirname "$0")/.."
HOST="${1:?pakai: bash deploy/deploy.sh user@host}"
SSH=(ssh)
[ -n "${SSH_KEY:-}" ] && SSH+=(-o IdentitiesOnly=yes -i "$SSH_KEY")
terima() { "${SSH[@]}" "$HOST" "SSH_ORIGINAL_COMMAND='$1' /opt/wa-automation/bin/terima-deploy.sh"; }

npm run build
bash deploy/susun-paket.sh "manual-$(date +%Y%m%d-%H%M%S)"
SPEK=$(tr '\n' ' ' < paket/spek)
for nama in $(terima "lapisan $SPEK" | sed -n 's/^perlu //p'); do
  terima "kirim-lapisan $(grep "^$nama:" paket/spek)" < "paket/$nama.tar.zst"
done
terima "pasang $(cat paket/versi) $SPEK" < paket/app.tar.zst
rm -rf paket
