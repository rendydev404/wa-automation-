import Link from "@/components/link";
import { SANDBOX_PORT_BAWAAN } from "@/lib/api-def";
import { teksHalaman } from "@/lib/bahasa-halaman";
import { Catatan, JudulHalaman, K, Langkah, metaDok } from "../_dok/kerangka";
import { Kode, KodeTab } from "../_dok/kode";

export const generateMetadata = ({ params }: { params: Promise<{ lang: string }> }) => metaDok(params, "mulai-cepat");

export default async function MulaiCepat() {
  const { t } = await teksHalaman();
  const base = `http://localhost:${SANDBOX_PORT_BAWAAN}/api/v1`;
  return (
    <article className="space-y-8">
      <JudulHalaman label={t("Mulai", "Get started")} judul={t("Mulai cepat: pesan pertama dalam 10 menit", "Quickstart: your first message in 10 minutes")}>
        {t(
          "Pakai sandbox: gratis, langsung aktif, tanpa domain. Anda butuh Docker, 1 nomor WhatsApp untuk bot, dan HP Anda sendiri sebagai nomor penguji.",
          "Use the sandbox: free, instant, no domain needed. You need Docker, 1 WhatsApp number for the bot, and your own phone as the tester number.",
        )}
      </JudulHalaman>

      <Langkah
        daftar={[
          {
            judul: t("Ambil key sandbox", "Get a sandbox key"),
            isi: (
              <>
                <p>
                  {t("Buka ", "Open ")}
                  <Link href="/developer" className="font-semibold text-accent hover:underline">
                    {t("portal Developer", "the Developer portal")}
                  </Link>
                  {t(" → kartu Sandbox → Buat key sandbox. Salin key ", " → Sandbox card → Create sandbox key. Copy the ")}
                  <K>cg_test_…</K>
                  {t(" (tampil sekali), lalu unduh .env sandbox dan docker-compose.yml.", " key (shown once), then download the sandbox .env and docker-compose.yml.")}
                </p>
              </>
            ),
          },
          {
            judul: t("Nyalakan mesin", "Start the engine"),
            isi: (
              <>
                <p>{t("Letakkan dua berkas itu di satu folder, isi key dan akun admin di .env, lalu jalankan:", "Put both files in one folder, fill in the key and admin account in .env, then run:")}</p>
                <Kode judul=".env">{`CHATGERCEP_KEY=cg_test_xxxxxxxx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ADMIN_EMAIL=anda@domain.com
ADMIN_PASSWORD=password-kuat-anda
AI_API_KEY=...          # kunci AI milik Anda (OpenAI/Gemini/Groq/OpenRouter/Claude)
PORT_MESIN=${SANDBOX_PORT_BAWAAN}`}</Kode>
                <Kode judul="Terminal">docker compose up -d</Kode>
                <p>{t("Cek mesin sudah aktif:", "Check the engine is active:")}</p>
                <Kode judul="Terminal">{`curl ${base}/status -H "Authorization: Bearer $CHATGERCEP_KEY"
# { "mode": "sandbox", "lisensi": { "aktif": true, ... } }`}</Kode>
              </>
            ),
          },
          {
            judul: t("Sambungkan nomor bot", "Connect the bot number"),
            isi: (
              <>
                <p>
                  {t("Buka dashboard mesin ", "Open the engine dashboard at ")}
                  <K>{`http://localhost:${SANDBOX_PORT_BAWAAN}`}</K>
                  {t(" → Nomor → Tambah nomor, lalu scan QR dari HP bot (WhatsApp → Perangkat tertaut → Tautkan perangkat). Atau lewat API:", " → Numbers → Add number, then scan the QR from the bot phone (WhatsApp → Linked devices → Link a device). Or via the API:")}
                </p>
                <Kode judul="Terminal">{`curl -X POST ${base}/nomor -H "Authorization: Bearer $CHATGERCEP_KEY" \\
  -H "Content-Type: application/json" -d '{"label":"Bot uji"}'
curl ${base}/nomor/12/qr -H "Authorization: Bearer $CHATGERCEP_KEY"   # png_base64 -> tampilkan & scan`}</Kode>
              </>
            ),
          },
          {
            judul: t("Daftarkan nomor penguji", "Register the tester number"),
            isi: (
              <p>
                {t("Portal → Daftarkan nomor penguji. Dari HP Anda, kirim WhatsApp berisi kode, mis. ", "Portal → Register tester number. From your phone, send a WhatsApp message with the code, e.g. ")}
                <K>UJI 482913</K>
                {t(", ke nomor bot. Nomor bot membalas ✅.", ", to the bot number. The bot replies ✅.")}
              </p>
            ),
          },
          {
            judul: t("Kirim pesan pertama", "Send your first message"),
            isi: (
              <KodeTab
                tab={[
                  {
                    kode: "curl",
                    label: "cURL",
                    isi: `curl -X POST ${base}/pesan \\
  -H "Authorization: Bearer $CHATGERCEP_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: uji-1" \\
  -d '{"nomor_id":"12","ke":"62812xxxxxxx","teks":"Halo dari API ChatGerCep!"}'`,
                  },
                  {
                    kode: "sdk",
                    label: "TypeScript (SDK)",
                    isi: `import { ChatGerCep } from "./chatgercep";

const cg = new ChatGerCep({ alamat: "http://localhost:${SANDBOX_PORT_BAWAAN}", key: process.env.CHATGERCEP_KEY! });
const p = await cg.pesan.kirim({ nomor_id: "12", ke: "62812xxxxxxx", teks: "Halo dari API ChatGerCep!" }, { idempotensi: "uji-1" });
console.log(p); // { id: "981", status: "antre" }`,
                  },
                  {
                    kode: "python",
                    label: "Python",
                    isi: `import os, requests
r = requests.post("${base}/pesan",
    headers={"Authorization": f"Bearer {os.environ['CHATGERCEP_KEY']}", "Idempotency-Key": "uji-1"},
    json={"nomor_id": "12", "ke": "62812xxxxxxx", "teks": "Halo dari API ChatGerCep!"}, timeout=15)
print(r.json())`,
                  },
                ]}
              />
            ),
          },
        ]}
      />

      <Catatan jenis="tips" judul={t("Berhasil? Lanjutkan ke…", "It worked? Next up…")}>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>
            <Link href="/docs/api/webhook" className="font-semibold text-accent hover:underline">
              {t("Webhook", "Webhooks")}
            </Link>
            {t(": terima pesan masuk & balasan AI di aplikasi Anda.", ": receive incoming messages & AI replies in your app.")}
          </li>
          <li>
            <Link href="/docs/api/ui-sendiri" className="font-semibold text-accent hover:underline">
              {t("Bangun UI sendiri", "Build your own UI")}
            </Link>
            {t(": SDK + contoh aplikasi siap diubah.", ": SDK + a sample app ready to restyle.")}
          </li>
          <li>
            <Link href="/docs/api/pasang-mesin" className="font-semibold text-accent hover:underline">
              {t("Pasang mesin production", "Install the production engine")}
            </Link>
            {t(": ganti ke key cg_live_ setelah pengajuan disetujui.", ": switch to a cg_live_ key once approved.")}
          </li>
        </ul>
      </Catatan>
    </article>
  );
}
