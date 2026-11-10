import { teksHalaman } from "@/lib/bahasa-halaman";
import { VERIFIKASI_WEBHOOK } from "../_dok/data";
import { DaftarEvent } from "../_dok/daftar";
import { Bagian, Catatan, JudulHalaman, K, Langkah, metaDok } from "../_dok/kerangka";
import { Kode, KodeTab } from "../_dok/kode";

export const generateMetadata = ({ params }: { params: Promise<{ lang: string }> }) => metaDok(params, "webhook");

export default async function Webhook() {
  const { t } = await teksHalaman();
  return (
    <article className="space-y-10">
      <JudulHalaman label={t("Referensi", "Reference")} judul={t("Webhook & event", "Webhooks & events")}>
        {t(
          "Mesin mengirim event ke URL aplikasi Anda begitu terjadi sesuatu: pesan masuk, balasan AI, status kiriman, QR baru, nomor terhubung. Tanpa polling.",
          "The engine sends events to your app's URL as soon as something happens: incoming messages, AI replies, delivery status, new QR codes, numbers connecting. No polling.",
        )}
      </JudulHalaman>

      <Bagian id="atur" judul={t("Mengatur webhook", "Setting up a webhook")}>
        <Langkah
          daftar={[
            {
              judul: t("Daftarkan URL & pilih event", "Register a URL & pick events"),
              isi: (
                <>
                  <Kode judul="PUT /api/v1/webhook">{JSON.stringify({ url: "https://app-anda.com/webhook/chatgercep", event: ["pesan.masuk", "pesan.dibalas_ai", "pesan.status", "nomor.qr", "nomor.status"] }, null, 2)}</Kode>
                  <p>
                    {t("Jawabannya berisi ", "The response contains ")}
                    <K>rahasia</K>
                    {t(" (whsec_…), tampil SEKALI. Simpan untuk memverifikasi tanda tangan. Untuk mesin di laptop boleh http://localhost.", " (whsec_…), shown ONCE. Store it to verify signatures. Engines on a laptop may use http://localhost.")}
                  </p>
                </>
              ),
            },
            {
              judul: t("Uji kiriman", "Send a test event"),
              isi: (
                <p>
                  <K>POST /api/v1/webhook/uji</K>
                  {t(" mengirim event webhook.uji ke URL Anda dan melaporkan status serta waktu tempuhnya.", " sends a webhook.uji event to your URL and reports the status and latency.")}
                </p>
              ),
            },
            {
              judul: t("Jawab cepat dengan 2xx", "Reply fast with a 2xx"),
              isi: <p>{t("Balas 200 dalam 5 detik, lalu proses di latar. Gagal dicoba ulang: 10 dtk, 1, 5, 30 menit, 2 dan 6 jam.", "Reply 200 within 5 seconds, then process in the background. Failures are retried after 10 s, 1, 5, 30 min, 2 and 6 h.")}</p>,
            },
          ]}
        />
      </Bagian>

      <Bagian id="amplop" judul={t("Bentuk kiriman", "Payload shape")}>
        <Kode judul="POST https://app-anda.com/webhook/chatgercep">{`X-CG-Tanda: t=1794200100,v1=5f2c9a...e81b
Content-Type: application/json

${JSON.stringify({ id_event: "evt_01J8Z...", jenis: "pesan.masuk", waktu: 1794200100, nomor_id: "12", data: { kunci: "c_9f2a...", dari: "6289876543210", nama: "Budi", teks: "Ada paket hemat?" } }, null, 2)}`}</Kode>
        <Catatan>
          {t("Pengiriman minimal sekali (at-least-once): simpan ", "Delivery is at-least-once: store ")}
          <K>id_event</K>
          {t(" yang sudah diproses dan abaikan duplikat. Di sandbox, amplop juga berisi ", " values you've processed and ignore duplicates. In the sandbox, envelopes also include ")}
          <K>&quot;mode&quot;: &quot;sandbox&quot;</K>.
        </Catatan>
      </Bagian>

      <Bagian id="event" judul={t("Daftar event", "Event list")}>
        <p className="text-[13.5px] text-muted">{t("Klik event untuk melihat contoh body lengkapnya.", "Click an event to see its full example body.")}</p>
        <DaftarEvent />
      </Bagian>

      <Bagian id="verifikasi" judul={t("Verifikasi tanda tangan", "Verify the signature")}>
        <p className="text-[14px]">
          {t("Header ", "The ")}
          <K>X-CG-Tanda</K>
          {t(" berisi waktu kirim (t) dan HMAC-SHA256 dari ", " header holds the send time (t) and an HMAC-SHA256 of ")}
          <K>{"<t>.<body mentah>"}</K>
          {t(" memakai rahasia webhook. Tolak bila tanda tidak cocok atau lebih dari 5 menit.", " using your webhook secret. Reject if it doesn't match or is older than 5 minutes.")}
        </p>
        <KodeTab
          tab={[
            { kode: "node", label: "Node.js / TypeScript", isi: VERIFIKASI_WEBHOOK.node },
            { kode: "php", label: "PHP", isi: VERIFIKASI_WEBHOOK.php },
            { kode: "python", label: "Python", isi: VERIFIKASI_WEBHOOK.python },
          ]}
        />
        <p className="text-[13px] text-muted">{t("SDK TypeScript sudah menyediakan verifikasiWebhook(rahasia, header, body).", "The TypeScript SDK already provides verifikasiWebhook(secret, header, body).")}</p>
      </Bagian>
    </article>
  );
}
