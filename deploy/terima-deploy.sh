#!/usr/bin/env bash
# Penerima deploy di VPS, dipasang di /opt/wa-automation/bin/terima-deploy.sh.
#
# Kunci SSH milik GitHub Actions HANYA bisa menjalankan skrip ini (forced command di
# /root/.ssh/authorized_keys): ia tidak bisa membuka shell, menjalankan perintah lain, atau
# meneruskan port. Perintahnya dibaca dari SSH_ORIGINAL_COMMAND dan diperiksa ketat:
#
#   lapisan <nama>:<sha256>...         cetak "perlu <nama>" untuk lapisan yang belum ada di server
#   kirim-lapisan <nama>:<sha256>      stdin = tar.zst isi lapisan; hash diperiksa ulang sebelum disimpan
#   pasang <versi> <nama>:<sha256>...  stdin = tar.zst berisi app/ + docker-compose.yml
#   (tanpa perintah)                   cara lama (deploy/deploy.sh): stdin = tar.gz standalone/ lengkap
#
# Lapisan = bagian besar yang jarang berubah (node_modules, ml), disimpan sekali per isi di lapisan/.
# Tiap versi dirakit di rilis/<versi>/ (lapisan di-hardlink: instan, tanpa salinan), lalu symlink
# `aktif` dipindah dan container dibuat ulang dari image Node yang sama (tanpa docker build).
# Versi baru tidak sehat = symlink dikembalikan ke versi sebelumnya dan deploy dinyatakan gagal.
set -euo pipefail
DIR="${DEPLOY_DIR:-/opt/wa-automation}" # DEPLOY_DIR/DEPLOY_PORT/DEPLOY_UJI hanya untuk menguji skrip ini; lewat SSH tidak bisa diisi
PORT="${DEPLOY_PORT:-$(grep -oP '^APP_PORT=\K[0-9]+' "$DIR/.env" 2>/dev/null || echo 3200)}"
UJI="${DEPLOY_UJI:-}" # 1 = tanpa docker & tanpa cek kesehatan (uji logika berkas saja)
PEMILIK=1001:1001     # user "nextjs" di container
MAKS_BYTE=$((600 * 1024 * 1024))
cd "$DIR"
mkdir -p lapisan rilis

read -r -a ARG <<< "${SSH_ORIGINAL_COMMAND:-}"
PERINTAH="${ARG[0]:-}"

gagal() { echo "$*" >&2; exit 1; }
# <nama>:<sha256>, nama hanya huruf kecil & garis bawah.
cek_spek() { [[ "$1" =~ ^([a-z_]{1,32}):([0-9a-f]{64})$ ]] || gagal "Spek lapisan tidak sah: $1"; }
ada_lapisan() { [ -f "lapisan/$1-$2.lengkap" ] && [ -d "lapisan/$1-$2" ]; }
# Hash isi folder secara deterministik (sama dengan yang dihitung CI).
hash_folder() { tar --format=gnu --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner -cf - -C "$1" . | sha256sum | cut -c1-64; }

dc() { if [ -n "$UJI" ]; then echo "[uji] docker $*"; else docker "$@"; fi; }
sehat() {
  [ -n "$UJI" ] && return 0
  for _ in $(seq 1 45); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:$PORT/api/health")" = 200 ] && return 0
    sleep 1
  done
  return 1
}
# Bukti bahwa yang berjalan memang versi ini: penanda versi di dalam container harus sama.
terpasang() {
  local harus="$1"
  [ -z "$harus" ] && return 0
  if [ -n "$UJI" ]; then [ "$(tr -d '[:space:]' < aktif/VERSI)" = "$harus" ]; return; fi
  [ "$(docker compose exec -T app cat /app/VERSI 2>/dev/null | tr -d '[:space:]')" = "$harus" ]
}

case "$PERINTAH" in
  lapisan)
    for spek in "${ARG[@]:1}"; do
      cek_spek "$spek"
      ada_lapisan "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}" || echo "perlu ${BASH_REMATCH[1]}"
    done
    exit 0
    ;;

  kirim-lapisan)
    [ "${#ARG[@]}" -eq 2 ] || gagal "Pakai: kirim-lapisan <nama>:<sha256>"
    cek_spek "${ARG[1]}"
    NAMA="${BASH_REMATCH[1]}" HASH="${BASH_REMATCH[2]}"
    if ada_lapisan "$NAMA" "$HASH"; then cat > /dev/null; echo "Lapisan $NAMA sudah ada."; exit 0; fi
    TMP=$(mktemp -d "$DIR/lapisan/.masuk.XXXXXX")
    chmod 755 "$TMP" # sama dengan mode folder lapisan di CI (ikut dihitung di hash)
    trap 'rm -rf "$TMP"' EXIT
    head -c "$MAKS_BYTE" | zstd -dc | tar xf - -C "$TMP" --no-same-owner
    [ "$(hash_folder "$TMP")" = "$HASH" ] || gagal "Isi lapisan $NAMA tidak cocok dengan hash-nya."
    chown -R "$PEMILIK" "$TMP"
    rm -rf "lapisan/$NAMA-$HASH"
    mv "$TMP" "lapisan/$NAMA-$HASH"
    trap - EXIT
    touch "lapisan/$NAMA-$HASH.lengkap"
    echo "Lapisan $NAMA tersimpan."
    exit 0
    ;;

  pasang | "") ;;
  *) gagal "Perintah tidak dikenal." ;;
esac

# ---------- pasang (atau cara lama) ----------
exec 9>"$DIR/.deploy.lock"
flock -n 9 || gagal "Deploy lain sedang berjalan."

MASUK=$(mktemp -d "$DIR/.masuk.XXXXXX")
trap 'rm -rf "$MASUK"' EXIT
SPEK=()
if [ "$PERINTAH" = pasang ]; then
  [ "${#ARG[@]}" -ge 2 ] && [[ "${ARG[1]}" =~ ^[0-9a-zA-Z._-]{1,64}$ ]] || gagal "Pakai: pasang <versi> <nama>:<sha256>..."
  VERSI="${ARG[1]}"
  SPEK=("${ARG[@]:2}")
  head -c "$MAKS_BYTE" | zstd -dc | tar xf - -C "$MASUK" --no-same-owner
  mv "$MASUK/app" "$MASUK/baru"
else
  head -c "$MAKS_BYTE" | tar xzf - -C "$MASUK" --no-same-owner
  mv "$MASUK/standalone" "$MASUK/baru"
  VERSI=$(tr -d '[:space:]' < "$MASUK/baru/VERSI" 2>/dev/null || date +manual-%Y%m%d-%H%M%S)
  [[ "$VERSI" =~ ^[0-9a-zA-Z._-]{1,64}$ ]] || VERSI=$(date +manual-%Y%m%d-%H%M%S)
fi
for f in baru/server.js docker-compose.yml; do
  test -f "$MASUK/$f" || gagal "Paket tidak lengkap: $f tidak ada."
done
{ test -f .env && grep -q '^DATABASE_URL=' .env; } || gagal "$DIR/.env belum ada atau belum berisi DATABASE_URL."

# Rakit rilis: berkas app + lapisan (hardlink dari lapisan/, tidak menyalin isi).
R="rilis/$VERSI"
rm -rf "$R"
chown -R "$PEMILIK" "$MASUK/baru"
mv "$MASUK/baru" "$R"
: > "$R/.lapisan"
for spek in "${SPEK[@]}"; do
  cek_spek "$spek"
  NAMA="${BASH_REMATCH[1]}" HASH="${BASH_REMATCH[2]}"
  ada_lapisan "$NAMA" "$HASH" || { rm -rf "$R"; gagal "Lapisan $NAMA ($HASH) belum ada di server: kirim dulu dengan kirim-lapisan."; }
  [ -e "$R/$NAMA" ] && { rm -rf "$R"; gagal "Paket app tidak boleh berisi $NAMA (dikirim sebagai lapisan)."; }
  cp -al "lapisan/$NAMA-$HASH" "$R/$NAMA"
  echo "$NAMA-$HASH" >> "$R/.lapisan"
done

# Versi yang sedang berjalan, untuk dikembalikan bila versi baru tidak sehat. Tata letak lama
# (standalone/ + image hasil docker build) dipindah sekali menjadi rilis biasa.
SEBELUM=$(readlink aktif 2>/dev/null || true)
if [ -z "$SEBELUM" ] && [ -d standalone ]; then
  LAMA="rilis/lama-$(tr -d '[:space:]' < standalone/VERSI 2>/dev/null || echo awal)"
  rm -rf "$LAMA"
  mv standalone "$LAMA"
  chown -R "$PEMILIK" "$LAMA"
  : > "$LAMA/.lapisan"
  SEBELUM="$LAMA"
fi
cp -p docker-compose.yml .compose-sebelum.yml 2>/dev/null || true
cp "$MASUK/docker-compose.yml" docker-compose.yml

pindah() { ln -sfn "$1" .aktif-baru && mv -T .aktif-baru aktif; }
jalankan() {
  # Matikan container lama lebih dulu (SIGTERM -> matikanGerbang) supaya semua soket WA ditutup rapi
  # dan kunci Signal selesai ditulis ke PostgreSQL sebelum container baru menyambung ke WhatsApp.
  dc compose stop -t 25 app 2>/dev/null || true
  # --force-recreate: mount ./aktif dibaca ulang (symlink sudah menunjuk ke rilis baru). Tanpa build.
  dc compose up -d --force-recreate --remove-orphans
}

pindah "$R"
jalankan
if sehat && terpasang "$(tr -d '[:space:]' < "$R/VERSI" 2>/dev/null || true)"; then
  echo "Versi baru sehat (versi $VERSI)."
  # Simpan rilis ini + satu sebelumnya (untuk kembali cepat); lapisan yang tidak dipakai keduanya dihapus.
  for d in rilis/*/; do
    d="${d%/}"
    [ "$d" = "$R" ] || [ "$d" = "$SEBELUM" ] || rm -rf "$d"
  done
  PAKAI=$(cat "$R/.lapisan" "${SEBELUM:-/dev/null}/.lapisan" 2>/dev/null || true)
  for l in lapisan/*.lengkap; do
    [ -e "$l" ] || continue
    n=$(basename "$l" .lengkap)
    grep -qx "$n" <<< "$PAKAI" || rm -rf "lapisan/$n" "$l"
  done
  rm -rf lama Dockerfile .compose-sebelum.yml
  [ -n "$UJI" ] || { docker image rm wa-automation-app:local >/dev/null 2>&1 || true; docker compose ps; }
  exit 0
fi

echo "Versi baru TIDAK sehat. Log terakhir:"
[ -n "$UJI" ] || docker compose logs --no-log-prefix --tail 40 app || true
if [ -n "$SEBELUM" ] && [ -d "$SEBELUM" ]; then
  echo "Mengembalikan versi sebelumnya ($SEBELUM)..."
  [ -f .compose-sebelum.yml ] && grep -q './aktif:/app' .compose-sebelum.yml && mv .compose-sebelum.yml docker-compose.yml
  pindah "$SEBELUM"
  jalankan
  if sehat; then echo "Versi sebelumnya berjalan lagi."; else echo "Versi sebelumnya juga tidak sehat: periksa server."; fi
fi
rm -rf "$R"
exit 1
