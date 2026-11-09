#!/usr/bin/env bash
# Susun paket deploy dari hasil `next build` (output standalone), dipakai CI dan deploy/deploy.sh.
# Pakai: bash deploy/susun-paket.sh <versi>
#
# Hasil di paket/:
#   app.tar.zst          berkas yang berubah tiap versi (server.js, .next, static, public) + docker-compose.yml
#   <nama>.tar.zst       lapisan besar yang jarang berubah (node_modules, ml); server menyimpannya per isi,
#                        jadi hanya dikirim bila isinya berubah
#   spek                 satu baris per lapisan: <nama>:<sha256 tar deterministik isinya>
#   versi                penanda versi (commit)
# Hash dihitung dari tar yang sama persis dengan hash_folder di deploy/terima-deploy.sh.
set -euo pipefail
cd "$(dirname "$0")/.."
VERSI="${1:?pakai: bash deploy/susun-paket.sh <versi>}"
TAR_TETAP=(--format=gnu --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner)
P=paket
rm -rf "$P" && mkdir -p "$P/isi/app/.next" "$P/lapisan"
cp -r .next/standalone/. "$P/isi/app/"
cp -r .next/static "$P/isi/app/.next/static"
# Isi public/ DIGABUNG ke app/public: standalone bisa sudah membawa sebagian public/ (berkas yang dibaca kode lewat
# fs, mis. public/panduan/wa ikut dilacak Next). `cp -r public app/public` ke folder yang sudah ada menghasilkan
# app/public/public dan semua aset lain jadi 404 (terjadi di rilis 7f77f20).
if [ -d public ]; then mkdir -p "$P/isi/app/public" && cp -r public/. "$P/isi/app/public/"; fi
if [ -e "$P/isi/app/public/public" ]; then echo "GAGAL: app/public/public terbentuk, aset statis akan 404" >&2; exit 1; fi
# Jangan pernah ikut terkirim: data lokal, env lokal, dan biner yang tidak dipakai server Linux.
rm -rf "$P/isi/app/data" "$P/isi/app"/.env* "$P/isi/app/node_modules/@img"
# onnxruntime-node membawa biner semua platform (±290 MB); server hanya butuh Linux.
for d in "$P"/isi/app/node_modules/onnxruntime-node/bin/napi-v*; do [ -d "$d" ] && find "$d" -mindepth 1 -maxdepth 1 ! -name linux -exec rm -rf {} +; done
echo "$VERSI" > "$P/isi/app/VERSI"
cp deploy/docker-compose.yml "$P/isi/"

: > "$P/spek"
for nama in node_modules ml; do
  [ -d "$P/isi/app/$nama" ] || continue
  mv "$P/isi/app/$nama" "$P/lapisan/$nama"
  chmod 755 "$P/lapisan/$nama"
  tar "${TAR_TETAP[@]}" -cf "$P/$nama.tar" -C "$P/lapisan/$nama" .
  echo "$nama:$(sha256sum < "$P/$nama.tar" | cut -c1-64)" >> "$P/spek"
  # Lapisan jarang dikirim tapi selalu disusun: kompresi cepat; app kecil dan selalu dikirim: kompresi maksimal.
  zstd -q -6 -T0 --rm "$P/$nama.tar" -o "$P/$nama.tar.zst"
done
tar "${TAR_TETAP[@]}" -cf - -C "$P/isi" app docker-compose.yml | zstd -q -19 -T0 -o "$P/app.tar.zst"
echo "$VERSI" > "$P/versi"
rm -rf "$P/isi" "$P/lapisan"
ls -lh "$P"
cat "$P/spek"
