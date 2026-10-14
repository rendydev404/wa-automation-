#!/usr/bin/env bash
# Pasang / perbarui PostgreSQL proyek ini di VPS. Aman dijalankan ulang: kata sandi hanya dibuat
# sekali (di VPS, tidak pernah lewat mesin ini) dan data di volume tidak disentuh.
# Pakai: SSH_KEY=~/.ssh/kunci bash deploy/postgres/pasang.sh user@host
set -euo pipefail
cd "$(dirname "$0")"
HOST="${1:?pakai: bash deploy/postgres/pasang.sh user@host}"
DIR=/opt/wa-postgres
SSH=(ssh)
[ -n "${SSH_KEY:-}" ] && SSH+=(-o IdentitiesOnly=yes -i "$SSH_KEY")

"${SSH[@]}" "$HOST" "mkdir -p $DIR/init && chmod 700 $DIR"
tar czf - docker-compose.yml postgresql.conf init | "${SSH[@]}" "$HOST" "tar xzf - -C $DIR && chmod 644 $DIR/postgresql.conf $DIR/init/*"
"${SSH[@]}" "$HOST" "cd $DIR && if [ ! -f .env ]; then
  umask 077
  S=\$(openssl rand -hex 24); W=\$(openssl rand -hex 24)
  printf 'POSTGRES_PASSWORD=%s\nWA_DB_PASSWORD=%s\nWA_DATABASE_URL=postgres://wa:%s@127.0.0.1:5433/wa\n' \"\$S\" \"\$W\" \"\$W\" > .env
  echo '.env dibuat (kata sandi acak, izin 600)'
fi && docker compose up -d && docker compose ps"
