import { ArrowRight, Boxes, Code2, FlaskConical, KeyRound, LayoutTemplate, Lock, Server, ShieldCheck, Webhook, Zap } from "lucide-react";
import Link from "@/components/link";
import { FITUR_API, GRUP_FITUR } from "@/lib/api-def";
import { teksHalaman } from "@/lib/bahasa-halaman";
import { HALAMAN_DOK, jalurHalaman } from "./_dok/data";
import { Bagian, metaDok } from "./_dok/kerangka";
import { Kode } from "./_dok/kode";

export const generateMetadata = ({ params }: { params: Promise<{ lang: string }> }) => metaDok(params, "");

export default async function IkhtisarDok() {
  const { b, t } = await teksHalaman();
  const ikonHalaman: Record<string, typeof Zap> = { "mulai-cepat": Zap, "pasang-mesin": Server, autentikasi: KeyRound, referensi: Code2, webhook: Webhook, galat: ShieldCheck, sandbox: FlaskConical, "ui-sendiri": LayoutTemplate, lisensi: Lock };
  return (
    <div className="space-y-12">
      <div className="relative overflow-hidden rounded-2xl bg-ink px-5 py-8 text-ink-fg sm:px-8 sm:py-10">
        <div aria-hidden className="kisi-tinta absolute inset-0 opacity-50" />
        <div className="relative">
          <p className="text-[12px] font-bold tracking-[0.08em] text-ink-signal uppercase">Developer API v1</p>
          <h1 className="mt-3 max-w-2xl text-[28px] leading-[1.15] font-extrabold tracking-tight text-white sm:text-[38px]">
            {t("WhatsApp, bot AI, dan Informasi Usaha di aplikasi Anda.", "WhatsApp, an AI bot, and Business Info inside your app.")}
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-muted">
            {t(
              "Seperti Core API: mesin ChatGerCep berjalan di server Anda, aplikasi Anda memanggilnya lewat satu API key. Tampilan sepenuhnya milik Anda.",
              "Like a Core API: the ChatGerCep engine runs on your server and your app calls it with one API key. The UI is entirely yours.",
            )}
          </p>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <Link href="/docs/api/mulai-cepat" className="inline-flex items-center gap-2 rounded-xl bg-ink-signal px-4 py-2.5 text-[14px] font-bold text-ink transition-transform hover:-translate-y-0.5">
              {t("Mulai dalam 10 menit", "Start in 10 minutes")} <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link href="/docs/api/referensi" className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-white/10">
              {t("Lihat semua endpoint", "Browse all endpoints")}
            </Link>
          </div>
        </div>
      </div>

      <Bagian id="cara-kerja" judul={t("Cara kerjanya", "How it works")}>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { ikon: Server, judul: t("1. Mesin di server Anda", "1. Engine on your server"), isi: t("Jalankan image Docker ChatGerCep. WhatsApp, database, dan kunci AI milik Anda.", "Run the ChatGerCep Docker image. WhatsApp, database, and AI keys are yours.") },
            { ikon: Code2, judul: t("2. Aplikasi memanggil API", "2. Your app calls the API"), isi: t("Kirim pesan, atur bot, isi Informasi Usaha lewat /api/v1 dengan API key.", "Send messages, configure the bot, add Business Info via /api/v1 with your API key.") },
            { ikon: Webhook, judul: t("3. Event masuk realtime", "3. Events arrive in real time"), isi: t("Pesan masuk, balasan AI, QR, dan status nomor dikirim ke webhook Anda.", "Incoming messages, AI replies, QR codes, and number status are sent to your webhook.") },
          ].map((x) => (
            <div key={x.judul} className="card p-4">
              <span className="grid size-9 place-items-center rounded-xl bg-accent-soft text-accent">
                <x.ikon className="size-4" aria-hidden />
              </span>
              <p className="mt-3 text-[14px] font-semibold">{x.judul}</p>
              <p className="mt-1 text-[13px] text-muted">{x.isi}</p>
            </div>
          ))}
        </div>
        <Kode judul={t("Contoh: kirim struk ke pelanggan", "Example: send a receipt to a customer")}>{`curl -X POST https://wa.domain-anda.com/api/v1/pesan \\
  -H "Authorization: Bearer $CHATGERCEP_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"nomor_id":"12","ke":"6289876543210","teks":"Terima kasih! Pesanan #1042 sudah kami terima."}'

# 202 { "id": "981", "status": "antre" }  -> status akhir lewat webhook pesan.status`}</Kode>
        <p className="text-[13.5px] text-muted">
          {t(
            "Server ChatGerCep hanya mengirim lisensi. Panggilan API, isi chat, dan data pelanggan tidak pernah lewat server kami.",
            "ChatGerCep's server only sends the license. API calls, chats, and customer data never pass through our servers.",
          )}
        </p>
      </Bagian>

      <Bagian id="fitur" judul={t("Fitur yang tersedia", "Available features")}>
        <div className="grid gap-3 sm:grid-cols-2">
          {GRUP_FITUR.map((g) => (
            <div key={g.kode} className="card p-4">
              <p className="flex items-center gap-2 text-[14px] font-semibold">
                <Boxes className="size-4 text-accent" aria-hidden /> {g.label}
              </p>
              <ul className="mt-2 space-y-1">
                {FITUR_API.filter((f) => f.grup === g.kode).map((f) => (
                  <li key={f.kode} className="flex gap-2 text-[13px]">
                    <code className="shrink-0 text-[12px] text-accent">{f.kode}</code>
                    <span className="text-muted">{f.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="text-[13px] text-muted">{t("Fitur yang aktif untuk aplikasi Anda ditentukan lisensi (lihat GET /status).", "Which features are enabled for your app is set by its license (see GET /status).")}</p>
      </Bagian>

      <Bagian id="jelajahi" judul={t("Jelajahi dokumentasi", "Explore the docs")}>
        <div className="grid gap-3 sm:grid-cols-2">
          {HALAMAN_DOK.filter((h) => h.slug).map((h) => {
            const Ikon = ikonHalaman[h.slug] ?? Zap;
            return (
              <Link key={h.slug} href={jalurHalaman(h.slug)} className="group card flex gap-3 p-4 transition-colors hover:border-accent/40">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-subtle text-fg group-hover:bg-accent-soft group-hover:text-accent">
                  <Ikon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1 text-[14px] font-semibold">
                    {h.judul[b]} <ArrowRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                  </span>
                  <span className="mt-0.5 block text-[13px] text-muted">{h.ringkas[b]}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </Bagian>
    </div>
  );
}
