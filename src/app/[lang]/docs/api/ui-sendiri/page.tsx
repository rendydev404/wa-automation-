import { Download, LayoutTemplate, MessagesSquare, QrCode, Send } from "lucide-react";
import Link from "@/components/link";
import { teksHalaman } from "@/lib/bahasa-halaman";
import { Bagian, Catatan, JudulHalaman, K, Langkah, metaDok } from "../_dok/kerangka";
import { Kode } from "../_dok/kode";

export const generateMetadata = ({ params }: { params: Promise<{ lang: string }> }) => metaDok(params, "ui-sendiri");

export default async function UiSendiri() {
  const { t } = await teksHalaman();
  return (
    <article className="space-y-10">
      <JudulHalaman label={t("Panduan", "Guides")} judul={t("Bangun UI sendiri (headless)", "Build your own UI (headless)")}>
        {t(
          "Mesin menyediakan fitur & logika inti; tampilan milik aplikasi Anda. Dashboard bawaan tetap ada dan boleh dimatikan.",
          "The engine provides the core features & logic; the UI belongs to your app. The built-in dashboard is still there and can be turned off.",
        )}
      </JudulHalaman>

      <Bagian id="langkah" judul={t("Langkahnya", "The steps")}>
        <Langkah
          daftar={[
            {
              judul: t("Matikan dashboard bawaan (opsional)", "Turn off the built-in dashboard (optional)"),
              isi: (
                <>
                  <Kode judul=".env">DASHBOARD_MESIN=mati</Kode>
                  <p>{t("Semua halaman mesin dialihkan ke halaman status \"mode API\". API & webhook tetap jalan.", "Every engine page redirects to an \"API mode\" status page. The API & webhooks keep working.")}</p>
                </>
              ),
            },
            {
              judul: t("Berlangganan event realtime", "Subscribe to real-time events"),
              isi: (
                <p>
                  {t("Daftarkan webhook dengan event ", "Register a webhook with the events ")}
                  <K>nomor.qr</K>, <K>nomor.status</K>, <K>pesan.masuk</K>, <K>pesan.dibalas_ai</K>
                  {t(" supaya QR dan pesan tampil di halaman Anda tanpa polling.", " so QR codes and messages show up on your pages without polling.")}
                </p>
              ),
            },
            {
              judul: t("Bangun halaman di atas endpoint", "Build pages on the endpoints"),
              isi: (
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    { ikon: QrCode, judul: t("Sambungkan WhatsApp", "Connect WhatsApp"), isi: "POST /nomor · nomor.qr" },
                    { ikon: LayoutTemplate, judul: t("Informasi Usaha & katalog", "Business Info & catalog"), isi: "/nomor/{id}/knowledge · /produk" },
                    { ikon: Send, judul: t("Kirim pesan", "Send messages"), isi: "POST /pesan · pesan.status" },
                    { ikon: MessagesSquare, judul: t("Inbox", "Inbox"), isi: "/nomor/{id}/percakapan · /balas" },
                  ].map((x) => (
                    <div key={x.judul} className="flex gap-3 rounded-xl border border-line bg-surface p-3">
                      <x.ikon className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                      <span>
                        <span className="block text-[13.5px] font-semibold text-fg">{x.judul}</span>
                        <code className="text-[12px]">{x.isi}</code>
                      </span>
                    </div>
                  ))}
                </div>
              ),
            },
          ]}
        />
      </Bagian>

      <Bagian id="sdk" judul={t("SDK TypeScript & contoh aplikasi", "TypeScript SDK & sample app")}>
        <p className="text-[14px]">
          {t(
            "Unduh paket berisi SDK (klien bertipe + verifikasi webhook) dan contoh aplikasi Next.js (sambungkan WA dengan QR realtime, Informasi Usaha, kirim pesan, inbox). Salin, lalu ubah tampilannya sesuka Anda.",
            "Download a package with the SDK (typed client + webhook verification) and a Next.js sample app (connect WhatsApp with a real-time QR, Business Info, send messages, inbox). Copy it, then restyle it however you like.",
          )}
        </p>
        <Kode judul={t("Contoh SDK", "SDK example")}>{`import { ChatGerCep, verifikasiWebhook } from "./chatgercep";

const cg = new ChatGerCep({ alamat: process.env.CHATGERCEP_ALAMAT!, key: process.env.CHATGERCEP_KEY! });

// Inbox: 25 chat terbaru + isi pesan chat pertama
const { data } = await cg.percakapan.daftar("12", { batas: 25 });
const isi = await cg.percakapan.pesan("12", data[0].id);

// Balas manual (bot otomatis dijeda untuk chat ini)
await cg.percakapan.balas("12", data[0].id, "Siap kak, saya bantu cek ya.");

// Di route webhook Anda:
const event = verifikasiWebhook(process.env.CHATGERCEP_RAHASIA_WEBHOOK!, req.headers.get("x-cg-tanda"), await req.text());`}</Kode>
        <Link href="/developer" className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-[14px] font-semibold text-ink-signal hover:opacity-90">
          <Download className="size-4" aria-hidden /> {t("Unduh di portal Developer", "Download in the Developer portal")}
        </Link>
        <Catatan>{t("Paket hanya bisa diunduh dari portal Developer oleh akun yang punya sandbox atau aplikasi disetujui. Boleh dipakai & diubah untuk aplikasi Anda, tidak untuk dijual ulang.", "The package can only be downloaded from the Developer portal by accounts with a sandbox or an approved app. You may use & modify it for your app, not resell it.")}</Catatan>
      </Bagian>
    </article>
  );
}
