import { teksHalaman } from "@/lib/bahasa-halaman";
import { CONTOH_CADDY } from "@/lib/templat-mesin";
import { Bagian, Catatan, JudulHalaman, K, Langkah, Tabel, metaDok } from "../_dok/kerangka";
import { Kode } from "../_dok/kode";

export const generateMetadata = ({ params }: { params: Promise<{ lang: string }> }) => metaDok(params, "pasang-mesin");

export default async function PasangMesin() {
  const { t } = await teksHalaman();
  return (
    <article className="space-y-10">
      <JudulHalaman label={t("Mulai", "Get started")} judul={t("Pasang mesin production", "Install the production engine")}>
        {t(
          "Setelah pengajuan disetujui, pasang mesin di server Anda dengan key cg_live_. Satu mesin = satu proses, cukup Docker.",
          "Once your application is approved, install the engine on your server with a cg_live_ key. One engine = one process, Docker is all you need.",
        )}
      </JudulHalaman>

      <Bagian id="persyaratan" judul={t("Persyaratan server", "Server requirements")}>
        <Tabel
          kepala={[t("Skala", "Scale"), "CPU", "RAM", "Disk"]}
          baris={[
            [`≤ 20 ${t("nomor", "numbers")}`, "1 vCPU", "1 GB", "10 GB"],
            [`≤ 100 ${t("nomor", "numbers")}`, "2 vCPU", "2 GB", "20 GB"],
            [`≤ 250 ${t("nomor", "numbers")}`, "2–4 vCPU", "4 GB", "40 GB"],
          ]}
        />
        <p className="text-[13.5px] text-muted">
          {t(
            "Linux x86_64/arm64, Docker 24+ dengan Compose v2, domain + HTTPS, dan koneksi keluar ke WhatsApp, chatgercep.com, serta penyedia AI. Tiap nomor terhubung memakai ±3 MB RAM.",
            "Linux x86_64/arm64, Docker 24+ with Compose v2, a domain + HTTPS, and outbound access to WhatsApp, chatgercep.com, and your AI provider. Each connected number uses about 3 MB of RAM.",
          )}
        </p>
      </Bagian>

      <Bagian id="langkah" judul={t("Langkah pemasangan", "Installation steps")}>
        <Langkah
          daftar={[
            {
              judul: t("Unduh berkas & isi .env", "Download the files & fill in .env"),
              isi: (
                <>
                  <p>{t("Dari halaman aplikasi di portal Developer: unduh docker-compose.yml dan .env.contoh, simpan sebagai .env.", "From your app page in the Developer portal: download docker-compose.yml and .env.contoh, save it as .env.")}</p>
                  <Kode judul=".env">{`CHATGERCEP_KEY=cg_live_xxxxxxxx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ALAMAT_PUBLIK=https://wa.domain-anda.com
ADMIN_EMAIL=anda@domain.com
ADMIN_PASSWORD=...
AI_PENYEDIA=openai          # openai = OpenAI/Gemini/Groq/OpenRouter/Ollama; anthropic = Claude
AI_API_KEY=...
AI_MODEL=gpt-4o-mini
# DASHBOARD_MESIN=mati      # opsional: mesin murni API (pakai UI aplikasi Anda sendiri)`}</Kode>
                </>
              ),
            },
            {
              judul: t("Arahkan domain lewat HTTPS", "Point your domain over HTTPS"),
              isi: (
                <>
                  <p>{t("Contoh dengan Caddy (sertifikat HTTPS otomatis):", "Example with Caddy (automatic HTTPS certificates):")}</p>
                  <Kode judul="Caddyfile">{CONTOH_CADDY}</Kode>
                </>
              ),
            },
            {
              judul: t("Nyalakan", "Start it"),
              isi: (
                <>
                  <Kode judul="Terminal">docker compose up -d</Kode>
                  <p>
                    {t("Mesin mengaktivasi diri: server kami mengirim tantangan ke ALAMAT_PUBLIK untuk memastikan alamat itu milik Anda, lalu mengirim lisensi. Cek dengan ", "The engine activates itself: our server sends a challenge to ALAMAT_PUBLIK to confirm it's yours, then sends the license. Check with ")}
                    <K>GET /api/v1/status</K>.
                  </p>
                </>
              ),
            },
          ]}
        />
      </Bagian>

      <Bagian id="pembaruan" judul={t("Pembaruan & cadangan", "Updates & backups")}>
        <Kode judul="Terminal">docker compose pull && docker compose up -d</Kode>
        <ul className="list-disc space-y-1.5 pl-5 text-[14px]">
          <li>{t("Migrasi database berjalan otomatis; WhatsApp ditutup rapi lalu tersambung lagi sendiri (tidak perlu scan ulang).", "Database migrations run automatically; WhatsApp shuts down cleanly and reconnects by itself (no rescan).")}</li>
          <li>{t("Cadangkan database secara berkala dengan pg_dump. Kehilangan database = semua nomor harus scan ulang.", "Back up the database regularly with pg_dump. Losing it means every number must be rescanned.")}</li>
        </ul>
        <Catatan jenis="awas">{t("Jalankan hanya SATU mesin per database. Proses kedua dengan database yang sama akan menolak menyala supaya sesi WhatsApp tidak saling memutus.", "Run only ONE engine per database. A second process on the same database refuses to start so WhatsApp sessions don't kick each other out.")}</Catatan>
      </Bagian>
    </article>
  );
}
