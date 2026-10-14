#!/bin/sh
# Dijalankan sekali oleh image postgres saat volume data masih kosong.
# Aplikasi tidak memakai superuser: role `wa` hanya memiliki database `wa`.
set -eu
: "${WA_DB_PASSWORD:?WA_DB_PASSWORD belum diisi di .env}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres -v pw="$WA_DB_PASSWORD" <<'SQL'
CREATE ROLE wa LOGIN PASSWORD :'pw' CONNECTION LIMIT 15;
-- Query aplikasi yang macet tidak boleh menahan server kecil ini; naikkan per sesi bila perlu
-- (SET statement_timeout = ...) untuk migrasi atau laporan berat.
ALTER ROLE wa SET statement_timeout = '30s';
CREATE DATABASE wa OWNER wa ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0;
REVOKE ALL ON DATABASE wa FROM PUBLIC;
-- Role aplikasi hanya boleh masuk ke database miliknya.
REVOKE CONNECT ON DATABASE postgres FROM PUBLIC;
REVOKE CONNECT ON DATABASE template1 FROM PUBLIC;
SQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname wa <<'SQL'
-- Skema public hanya untuk pemilik database.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO wa;
SQL
