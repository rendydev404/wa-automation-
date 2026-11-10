import { randomBytes } from "node:crypto";

/**
 * Berkas pemasangan mesin self-host yang diunduh developer dari portal: docker-compose.yml + .env.contoh.
 * Rahasia acak (AUTH_SECRET, RAHASIA_MESIN, kata sandi DB) dibuat baru di setiap unduhan dan tidak disimpan di pusat.
 * API key TIDAK diisikan: key hanya tampil sekali di portal dan pusat hanya menyimpan hash-nya.
 */

export const IMAGE_MESIN = process.env.IMAGE_MESIN || "ghcr.io/rendydev404/chatgercep-mesin";

export function composeMesin(): string {
  return `# ChatGerCep Mesin (self-host). Semua resource di server Anda: WhatsApp, database, dan kunci AI milik Anda.
# Pasang: isi .env (salin dari .env.contoh), lalu jalankan:  docker compose up -d
# Update:  docker compose pull && docker compose up -d   (migrasi database berjalan otomatis; WhatsApp tidak terputus)
# Panduan lengkap & dokumentasi API: https://chatgercep.com/docs/api
name: chatgercep-mesin

services:
  mesin:
    image: ${IMAGE_MESIN}:\${VERSI_MESIN:-stable}
    restart: unless-stopped
    env_file: .env
    environment:
      MODE: mesin
      DATABASE_URL: postgres://chatgercep:\${DB_PASSWORD}@db:5432/chatgercep
      PORT: "3230"
      HOSTNAME: 0.0.0.0
    # Hanya bisa diakses dari server ini; buka ke internet lewat reverse proxy HTTPS (mis. Caddy) di ALAMAT_PUBLIK.
    ports:
      - "127.0.0.1:\${PORT_MESIN:-3230}:3230"
    # Waktu untuk mati rapi: koneksi WhatsApp ditutup & kunci sesi dituntaskan dulu (update tidak memutus nomor).
    stop_grace_period: 30s
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3230/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      start_period: 30s
      retries: 3

  db:
    image: postgres:15-bookworm
    restart: unless-stopped
    environment:
      POSTGRES_USER: chatgercep
      POSTGRES_PASSWORD: \${DB_PASSWORD}
      POSTGRES_DB: chatgercep
    volumes:
      - pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U chatgercep -d chatgercep"]
      interval: 10s
      timeout: 5s
      retries: 10

# Cadangkan volume ini secara berkala (pg_dump). Hilang = semua nomor harus scan QR ulang.
volumes:
  pg_data:
`;
}

const acak = (n = 32): string => randomBytes(n).toString("base64url");

export function envMesin(o: { namaAplikasi: string; alamat: string | null; sandbox?: boolean; port?: number }): string {
  const alamat = o.sandbox
    ? `# Sandbox TIDAK butuh alamat publik (boleh dijalankan di laptop). Isi nanti saat pindah ke key cg_live_ (production).
# ALAMAT_PUBLIK=https://wa.domain-anda.com`
    : `# Alamat publik HTTPS mesin ini (reverse proxy ke 127.0.0.1:3230). Server ChatGerCep mengirim lisensi ke alamat ini.
ALAMAT_PUBLIK=${o.alamat ?? "https://wa.domain-anda.com"}`;
  return `# ChatGerCep Mesin ${o.sandbox ? "SANDBOX" : `untuk aplikasi "${o.namaAplikasi.replace(/[\r\n"]/g, " ")}"`}.
# Salin menjadi .env di folder yang sama dengan docker-compose.yml. Jangan dibagikan/di-commit.
${o.sandbox ? "# Sandbox: WhatsApp asli, 1 nomor WA, hanya dengan 1 nomor penguji terverifikasi.\n" : ""}
# --- Wajib ---
# API key dari portal Developer (tampil sekali saat dibuat). Dipakai mesin untuk aktivasi DAN oleh aplikasi Anda
# untuk memanggil API di mesin ini (Authorization: Bearer ...).${o.sandbox ? " Sandbox: cg_test_..." : ""}
CHATGERCEP_KEY=
${alamat}
# Akun pemilik untuk dashboard mesin (dibuat otomatis saat pertama menyala).
ADMIN_EMAIL=
ADMIN_PASSWORD=

# --- Mesin AI (kunci milik Anda; biayanya ditagih penyedia AI ke akun Anda) ---
# openai = semua penyedia kompatibel OpenAI (OpenAI, Gemini, Groq, OpenRouter, Ollama/vLLM lokal); anthropic = Claude.
AI_PENYEDIA=openai
AI_API_URL=https://api.openai.com/v1
AI_API_KEY=
AI_MODEL=gpt-4o-mini
# Bila AI_PENYEDIA=anthropic:
# ANTHROPIC_API_KEY=

# --- Opsional ---
# Transkripsi pesan suara (kompatibel OpenAI, mis. Groq Whisper).
# STT_API_KEY=
MAKS_NOMOR=${o.sandbox ? 1 : 50}
${o.sandbox ? `# Port dashboard mesin di komputer ini: buka http://localhost:${o.port ?? 1975} (Nomor -> Tambah nomor -> scan QR nomor bot).\nPORT_MESIN=${o.port ?? 1975}` : "# Port dashboard mesin di server ini (bawaan 3230).\n# PORT_MESIN=3230"}
# Dashboard bawaan mesin: aktif (bawaan) atau mati = mesin murni API (pakai UI aplikasi Anda sendiri).
# DASHBOARD_MESIN=aktif
# Versi image (stable = rilis stabil terbaru; atau nomor versi, mis. 1.0.0).
VERSI_MESIN=stable

# --- Rahasia acak (dibuat otomatis untuk unduhan ini; boleh diganti, jangan dikosongkan) ---
AUTH_SECRET=${acak()}
RAHASIA_MESIN=${acak()}
DB_PASSWORD=${acak(24)}
`;
}

/** Contoh blok Caddy untuk HTTPS otomatis di ALAMAT_PUBLIK. */
export const CONTOH_CADDY = `wa.domain-anda.com {
  reverse_proxy 127.0.0.1:3230
}`;
