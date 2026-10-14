#!/usr/bin/env bash
# Penerima deploy di VPS, dipasang di /opt/wa-automation/bin/terima-deploy.sh.
#
# Kunci SSH milik GitHub Actions HANYA bisa menjalankan skrip ini (forced command di
# /root/.ssh/authorized_keys): ia tidak bisa membuka shell, menjalankan perintah lain, atau
# meneruskan port. Skrip menerima paket build (tar.gz) lewat stdin, memasangnya, dan memastikan
# versi baru sehat; bila tidak, versi sebelumnya dikembalikan dan deploy dinyatakan gagal.
set -euo pipefail
DIR="${DEPLOY_DIR:-/opt/wa-automation}" # DEPLOY_DIR/DEPLOY_PORT hanya untuk menguji skrip ini; lewat SSH tidak bisa diisi
PORT="${DEPLOY_PORT:-3200}"

exec 9>"$DIR/.deploy.lock"
flock -n 9 || { echo "Deploy lain sedang berjalan."; exit 1; }

MASUK=$(mktemp -d "$DIR/.masuk.XXXXXX")
trap 'rm -rf "$MASUK"' EXIT
# Paket paling besar 200 MB (biasanya ±12 MB); pemilik berkas tidak diambil dari arsip.
head -c 209715200 | tar xzf - -C "$MASUK" --no-same-owner
for f in standalone/server.js Dockerfile docker-compose.yml; do
  test -f "$MASUK/$f" || { echo "Paket tidak lengkap: $f tidak ada."; exit 1; }
done

cd "$DIR"
{ test -f .env && grep -q '^DATABASE_URL=' .env; } || { echo "$DIR/.env belum ada atau belum berisi DATABASE_URL."; exit 1; }

sehat() {
  for _ in $(seq 1 45); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:$PORT/api/health")" = 200 ] && return 0
    sleep 2
  done
  return 1
}

rm -rf lama && mkdir lama
[ -d standalone ] && mv standalone lama/standalone
cp -p Dockerfile docker-compose.yml lama/ 2>/dev/null || true
mv "$MASUK/standalone" standalone
cp "$MASUK/Dockerfile" "$MASUK/docker-compose.yml" .

# --force-recreate: container selalu dibuat ulang dari image yang baru dibangun. Tanpa itu, compose
# bisa menganggap "tidak ada perubahan" dan membiarkan container lama berjalan.
docker compose up -d --build --force-recreate --remove-orphans
BARU=$(cat standalone/VERSI 2>/dev/null || true)
terpasang() {
  # Bukti bahwa yang berjalan memang paket ini: penanda versi di dalam container harus sama.
  [ -z "$BARU" ] && return 0
  [ "$(docker compose exec -T app cat /app/VERSI 2>/dev/null | tr -d '[:space:]')" = "$BARU" ]
}
if sehat && terpasang; then
  echo "Versi baru sehat${BARU:+ (versi $BARU)}."
  rm -rf lama
  docker image prune -f >/dev/null
  docker compose ps
  exit 0
fi

echo "Versi baru TIDAK sehat. Log terakhir:"
docker compose logs --no-log-prefix --tail 40 app || true
if [ -d lama/standalone ]; then
  echo "Mengembalikan versi sebelumnya..."
  rm -rf standalone
  mv lama/standalone standalone
  cp lama/Dockerfile lama/docker-compose.yml . 2>/dev/null || true
  docker compose up -d --build --force-recreate --remove-orphans
  if sehat; then echo "Versi sebelumnya berjalan lagi."; else echo "Versi sebelumnya juga tidak sehat: periksa server."; fi
  rm -rf lama
fi
exit 1
