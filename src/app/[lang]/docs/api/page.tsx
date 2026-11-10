import type { Metadata } from "next";
import { BookOpen, KeyRound, Server, ShieldCheck, Webhook } from "lucide-react";
import { GantiBahasa } from "@/components/ganti-bahasa";
import Link from "@/components/link";
import { Logo } from "@/components/logo";
import { BATAS_BAWAAN, FITUR_API, KODE_GALAT } from "@/lib/api-def";
import { ENDPOINT_DOK, EVENT_DOK } from "@/lib/api-dok";
import { bahasaSah, pembuatT } from "@/lib/bahasa";
import { teksHalaman } from "@/lib/bahasa-halaman";
import { MEREK } from "@/lib/merek";
import { CONTOH_CADDY } from "@/lib/templat-mesin";

/**
 * Dokumentasi publik Developer API: pasang mesin self-host, autentikasi, endpoint v1, webhook, galat, batas.
 * Seluruhnya statis dari src/lib/api-dok.ts & api-def.ts (sumber yang sama dengan /docs/api/openapi.json).
 */

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const t = pembuatT(bahasaSah(lang) ? lang : "id");
  return {
    title: t(`Dokumentasi Developer API · ${MEREK}`, `Developer API docs · ${MEREK}`),
    description: t(
      "Pasang mesin ChatGerCep di server Anda dan pakai WhatsApp, bot AI, dan product knowledge lewat satu API key.",
      "Install the ChatGerCep engine on your server and use WhatsApp, the AI bot, and product knowledge with one API key.",
    ),
    alternates: { canonical: "/docs/api", languages: { id: "/docs/api", en: "/eng/docs/api" } },
    // Developer API belum dibuka umum: dokumentasi tidak diindeks mesin pencari.
    robots: { index: false, follow: false },
  };
}

const WARNA_METODE: Record<string, string> = {
  GET: "bg-accent-soft text-accent",
  POST: "bg-success-soft text-success",
  PUT: "bg-warning-soft text-warning",
  PATCH: "bg-warning-soft text-warning",
  DELETE: "bg-danger-soft text-danger",
};

function Kode({ children, judul }: { children: string; judul?: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-ink">
      {judul && <div className="border-b border-white/10 px-3.5 py-2 text-[11.5px] font-semibold tracking-wide text-ink-muted uppercase">{judul}</div>}
      <pre className="overflow-x-auto p-3.5 text-[12.5px] leading-relaxed text-ink-fg">
        <code>{children}</code>
      </pre>
    </div>
  );
}

const json = (v: unknown): string => JSON.stringify(v, null, 2);

function Bagian({ id, judul, ikon, children }: { id: string; judul: string; ikon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 space-y-4">
      <h2 className="flex items-center gap-2 text-[22px] font-bold tracking-tight">
        {ikon}
        {judul}
      </h2>
      {children}
    </section>
  );
}

export default async function DokumentasiApi() {
  const { b, t } = await teksHalaman();
  const contohCurl = `curl -X POST https://wa.domain-anda.com/api/v1/pesan \\
  -H "Authorization: Bearer $CHATGERCEP_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: pesanan-1042-siap" \\
  -d '{"nomor_id":"12","ke":"6289876543210","teks":"Pesanan kakak siap diambil!"}'`;
  const contohJs = `const r = await fetch("https://wa.domain-anda.com/api/v1/pesan", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.CHATGERCEP_KEY}\`,
    "Content-Type": "application/json",
    "Idempotency-Key": "pesanan-1042-siap",
  },
  body: JSON.stringify({ nomor_id: "12", ke: "6289876543210", teks: "Pesanan kakak siap diambil!" }),
});
const hasil = await r.json(); // { id: "981", status: "antre" }`;
  const contohPhp = `$ch = curl_init("https://wa.domain-anda.com/api/v1/pesan");
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => [
    "Authorization: Bearer " . getenv("CHATGERCEP_KEY"),
    "Content-Type: application/json",
    "Idempotency-Key: pesanan-1042-siap",
  ],
  CURLOPT_POSTFIELDS => json_encode(["nomor_id" => "12", "ke" => "6289876543210", "teks" => "Pesanan kakak siap diambil!"]),
]);
$hasil = json_decode(curl_exec($ch), true);`;
  const contohPy = `import os, requests
r = requests.post(
    "https://wa.domain-anda.com/api/v1/pesan",
    headers={"Authorization": f"Bearer {os.environ['CHATGERCEP_KEY']}", "Idempotency-Key": "pesanan-1042-siap"},
    json={"nomor_id": "12", "ke": "6289876543210", "teks": "Pesanan kakak siap diambil!"},
    timeout=10,
)
print(r.json())  # {'id': '981', 'status': 'antre'}`;
  const contohVerifikasi = `import { createHmac, timingSafeEqual } from "node:crypto";

// body = teks mentah permintaan (JANGAN di-parse dulu); rahasia = dari PUT /api/v1/webhook
function webhookSah(body, header, rahasia) {
  const p = Object.fromEntries(header.split(",").map((x) => x.split("=")));
  if (Math.abs(Date.now() / 1000 - Number(p.t)) > 300) return false; // tolak kiriman ulang lama (> 5 menit)
  const harap = createHmac("sha256", rahasia).update(\`\${p.t}.\${body}\`).digest();
  const dapat = Buffer.from(p.v1 ?? "", "hex");
  return dapat.length === harap.length && timingSafeEqual(dapat, harap);
}
// Simpan id_event yang sudah diproses: kiriman bisa datang lebih dari sekali (at-least-once).`;

  const daftarIsi = [
    ["cara-kerja", t("Cara kerja", "How it works")],
    ["pasang", t("Pasang mesin", "Install the engine")],
    ["autentikasi", t("Autentikasi", "Authentication")],
    ["endpoint", "Endpoint"],
    ["contoh", t("Contoh kode", "Code samples")],
    ["webhook", "Webhook"],
    ["galat", t("Galat", "Errors")],
    ["batas", t("Batas & anti-blokir", "Limits & anti-ban")],
    ["lisensi", t("Lisensi & pembaruan", "License & updates")],
  ] as const;

  return (
    <div className="min-h-dvh bg-canvas">
      <div className="relative overflow-hidden bg-ink text-ink-fg">
        <div aria-hidden className="kisi-tinta absolute inset-0 opacity-60" />
        <header className="relative mx-auto flex max-w-[1100px] items-center justify-between gap-2 px-4 py-5 sm:px-6">
          <Link href="/" className="rounded-lg" aria-label={t(`${MEREK}, ke beranda`, `${MEREK}, home`)}>
            <Logo ukuran="md" gelap />
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <GantiBahasa gelap />
            <Link href="/developer" className="rounded-xl bg-ink-signal px-3 py-2 text-[13.5px] font-bold whitespace-nowrap text-ink transition-transform hover:-translate-y-0.5 sm:px-4">
              {t("Ajukan API key", "Get an API key")}
            </Link>
          </div>
        </header>
        <div className="relative mx-auto max-w-[1100px] px-4 pt-4 pb-12 sm:px-6 sm:pt-8 sm:pb-16">
          <p className="inline-flex items-center gap-2 rounded-full border border-ink-signal/30 bg-ink-signal/10 px-3.5 py-1.5 text-[12.5px] font-semibold text-ink-signal">
            <BookOpen className="size-3.5" aria-hidden /> Developer API v1
          </p>
          <h1 className="mt-5 max-w-3xl text-[32px] leading-[1.1] font-extrabold tracking-tight text-white sm:text-[44px]">
            {t("Fitur ChatGerCep di aplikasi Anda, ", "ChatGerCep features in your app, ")}
            <span className="text-ink-signal">{t("dengan satu API key.", "with one API key.")}</span>
          </h1>
          <p className="mt-4 max-w-2xl text-[15.5px] leading-relaxed text-ink-muted">
            {t(
              "Mesin ChatGerCep berjalan di server Anda sendiri: WhatsApp, database, dan kunci AI milik Anda. Aplikasi Anda memanggil API di mesin itu; server kami hanya mengirim lisensi.",
              "The ChatGerCep engine runs on your own server: WhatsApp, database, and AI keys are yours. Your app calls the API on that engine; our server only sends the license.",
            )}
          </p>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1100px] gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label={t("Daftar isi", "Contents")} className="lg:sticky lg:top-6 lg:self-start">
          <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-0.5">
            {daftarIsi.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="block rounded-lg px-3 py-1.5 text-[13.5px] font-semibold text-muted transition-colors hover:bg-subtle hover:text-fg max-lg:border max-lg:border-line">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-14 text-[14.5px] leading-relaxed">
          <Bagian id="cara-kerja" judul={t("Cara kerja", "How it works")} ikon={<Server className="size-5 text-accent" aria-hidden />}>
            <Kode>{`┌──────────── ${t("SERVER ANDA", "YOUR SERVER")} ────────────┐
│ ${t("Aplikasi Anda", "Your app     ")} ──/api/v1 + key──▶ ${t("Mesin", "Engine")} │
│ ◀──── webhook (pesan masuk, status) ────┘     │
└────────────────────▲──────────────────────────┘
                     │ ${t("lisensi lewat webhook (saat berubah + tiap 3 hari)", "license via webhook (on change + every 3 days)")}
              chatgercep.com`}</Kode>
            <ol className="list-decimal space-y-1.5 pl-5">
              <li>{t("Ajukan aplikasi di portal Developer. Tim kami meninjau lalu membuka fitur yang Anda butuhkan.", "Apply in the Developer portal. Our team reviews it and enables the features you need.")}</li>
              <li>{t("Buat API key (tampil sekali). Key yang sama dipakai mesin untuk aktivasi dan aplikasi Anda untuk memanggil API.", "Create an API key (shown once). The same key activates the engine and authenticates your app's API calls.")}</li>
              <li>{t("Jalankan mesin dengan Docker di server Anda. Mesin mengaktivasi diri dan menerima lisensi.", "Run the engine with Docker on your server. It activates itself and receives its license.")}</li>
              <li>{t("Panggil API dari aplikasi Anda. Panggilan API tidak pernah lewat server kami.", "Call the API from your app. API calls never pass through our servers.")}</li>
            </ol>
            <p className="rounded-xl border border-line bg-surface p-4 text-[13.5px]">
              {t("Fitur yang bisa dibuka: ", "Available features: ")}
              {FITUR_API.map((f, i) => (
                <span key={f.kode}>
                  <code className="rounded bg-subtle px-1.5 py-0.5 text-[12.5px]">{f.kode}</code> {f.label}
                  {i < FITUR_API.length - 1 ? " · " : ""}
                </span>
              ))}
            </p>
          </Bagian>

          <Bagian id="pasang" judul={t("Pasang mesin", "Install the engine")}>
            <div className="overflow-x-auto rounded-xl border border-line bg-surface">
              <table className="w-full text-left text-[13.5px]">
                <thead className="bg-subtle/60 text-[12px] text-muted uppercase">
                  <tr>
                    <th className="px-4 py-2.5">{t("Skala", "Scale")}</th>
                    <th className="px-4 py-2.5">CPU</th>
                    <th className="px-4 py-2.5">RAM</th>
                    <th className="px-4 py-2.5">Disk</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {[
                    ["≤ 20 " + t("nomor", "numbers"), "1 vCPU", "1 GB", "10 GB"],
                    ["≤ 100 " + t("nomor", "numbers"), "2 vCPU", "2 GB", "20 GB"],
                    ["≤ 250 " + t("nomor", "numbers"), "2–4 vCPU", "4 GB", "40 GB"],
                  ].map((r) => (
                    <tr key={r[0]}>
                      {r.map((c) => (
                        <td key={c} className="px-4 py-2.5">
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-muted">
              {t(
                "Linux x86_64 atau arm64, Docker 24+ dengan Compose v2, domain + HTTPS (reverse proxy), koneksi keluar ke WhatsApp, chatgercep.com, dan penyedia AI. Angka di atas perkiraan: tiap nomor terhubung memakai ±3 MB RAM.",
                "Linux x86_64 or arm64, Docker 24+ with Compose v2, a domain + HTTPS (reverse proxy), outbound access to WhatsApp, chatgercep.com, and your AI provider. Figures are estimates: each connected number uses about 3 MB of RAM.",
              )}
            </p>
            <ol className="list-decimal space-y-3 pl-5">
              <li>
                {t("Unduh ", "Download ")}
                <code>docker-compose.yml</code> {t("dan", "and")} <code>.env.contoh</code> {t("dari halaman aplikasi Anda di portal Developer, simpan .env.contoh sebagai .env, lalu isi:", "from your app page in the Developer portal, save .env.contoh as .env, then fill in:")}
                <Kode>{`CHATGERCEP_KEY=cg_live_xxxxxxxx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ALAMAT_PUBLIK=https://wa.domain-anda.com
ADMIN_EMAIL=anda@domain.com
ADMIN_PASSWORD=...
AI_PENYEDIA=openai          # openai = OpenAI/Gemini/Groq/OpenRouter/Ollama; anthropic = Claude
AI_API_KEY=...
AI_MODEL=gpt-4o-mini`}</Kode>
              </li>
              <li>
                {t("Arahkan domain ke mesin lewat HTTPS, contoh dengan Caddy:", "Point your domain at the engine over HTTPS, e.g. with Caddy:")}
                <Kode>{CONTOH_CADDY}</Kode>
              </li>
              <li>
                {t("Nyalakan:", "Start it:")}
                <Kode>docker compose up -d</Kode>
                {t(
                  "Mesin mengaktivasi diri ke server kami (kami mengirim tantangan ke ALAMAT_PUBLIK untuk memastikan alamat itu milik Anda), lalu menerima lisensi. Cek dengan GET /api/v1/status.",
                  "The engine activates with our server (we send a challenge to ALAMAT_PUBLIK to confirm the address is yours) and receives its license. Check with GET /api/v1/status.",
                )}
              </li>
            </ol>
          </Bagian>

          <Bagian id="autentikasi" judul={t("Autentikasi", "Authentication")} ikon={<KeyRound className="size-5 text-accent" aria-hidden />}>
            <p>
              {t("Kirim key di header", "Send the key in the header")} <code>Authorization: Bearer cg_live_…</code>.{" "}
              {t(
                "Key hanya untuk server ke server: jangan pernah menaruhnya di browser atau aplikasi HP. Ganti key kapan saja di portal; key lama tetap berlaku 24 jam.",
                "Keys are for server-to-server use only: never put them in a browser or mobile app. Rotate any time in the portal; the old key keeps working for 24 hours.",
              )}
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>{t("JSON UTF-8; waktu dalam epoch detik; ID berupa string.", "UTF-8 JSON; times in epoch seconds; IDs are strings.")}</li>
              <li>
                <code>Idempotency-Key</code>{" "}
                {t("pada POST: permintaan ulang dengan key yang sama (24 jam) mengembalikan jawaban pertama, pesan tidak terkirim dua kali.", "on POST: a retry with the same key (within 24 h) returns the first response, so messages are never sent twice.")}
              </li>
              <li>
                {t("Paginasi kursor:", "Cursor pagination:")} <code>?batas=50&amp;setelah=&lt;berikutnya&gt;</code> {t("(maks 100).", "(max 100).")}
              </li>
              <li>{t("Batas ukuran: JSON 1 MB, berkas 10 MB, teks pesan 4.096 karakter.", "Size limits: JSON 1 MB, files 10 MB, message text 4,096 characters.")}</li>
            </ul>
          </Bagian>

          <Bagian id="endpoint" judul={t("Endpoint", "Endpoints")}>
            <p className="text-muted">
              Base URL: <code>https://&lt;ALAMAT_PUBLIK&gt;/api/v1</code> ·{" "}
              <a href="/docs/api/openapi.json" className="font-semibold text-accent hover:underline">
                OpenAPI 3.1 (JSON)
              </a>
            </p>
            <div className="space-y-4">
              {ENDPOINT_DOK.map((e) => (
                <article key={e.metode + e.jalur} className="card overflow-hidden">
                  <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
                    <span className={`rounded-md px-2 py-0.5 text-[11.5px] font-bold ${WARNA_METODE[e.metode]}`}>{e.metode}</span>
                    <code className="text-[13.5px] font-semibold">{e.jalur}</code>
                    {e.fitur && <span className="rounded-md bg-subtle px-2 py-0.5 text-[11px] font-semibold text-muted">scope: {e.fitur}</span>}
                    <span className="w-full text-[13px] text-muted sm:ml-auto sm:w-auto">{b === "en" ? e.ringkas.en : e.ringkas.id}</span>
                  </header>
                  <div className={`grid gap-3 p-3 ${e.minta ? "lg:grid-cols-2" : ""}`}>
                    {e.minta !== undefined && <Kode judul={t("Permintaan", "Request")}>{json(e.minta)}</Kode>}
                    <Kode judul={`${t("Jawaban", "Response")} ${e.status ?? 200}`}>{json(e.jawab)}</Kode>
                  </div>
                </article>
              ))}
            </div>
          </Bagian>

          <Bagian id="contoh" judul={t("Contoh kode: kirim pesan", "Code samples: send a message")}>
            <div className="grid gap-3 lg:grid-cols-2">
              <Kode judul="cURL">{contohCurl}</Kode>
              <Kode judul="JavaScript (Node 18+)">{contohJs}</Kode>
              <Kode judul="PHP">{contohPhp}</Kode>
              <Kode judul="Python">{contohPy}</Kode>
            </div>
          </Bagian>

          <Bagian id="webhook" judul="Webhook" ikon={<Webhook className="size-5 text-accent" aria-hidden />}>
            <p>
              {t(
                "Atur URL dengan PUT /api/v1/webhook. Setiap event dikirim sebagai POST JSON dengan amplop di bawah, ditandatangani HMAC-SHA256. Gagal (bukan 2xx / lebih dari 5 detik) dicoba ulang 10 dtk, 1, 5, 30 menit, 2 dan 6 jam.",
                "Set the URL with PUT /api/v1/webhook. Each event is POSTed as JSON in the envelope below, signed with HMAC-SHA256. Failures (non-2xx / over 5 s) are retried after 10 s, 1, 5, 30 min, 2 and 6 h.",
              )}
            </p>
            <Kode judul={t("Amplop", "Envelope")}>{json({ id_event: "evt_01J...", jenis: "pesan.masuk", waktu: 1794200100, nomor_id: "12", data: EVENT_DOK[0].data })}</Kode>
            <div className="overflow-x-auto rounded-xl border border-line bg-surface">
              <table className="w-full text-left text-[13.5px]">
                <thead className="bg-subtle/60 text-[12px] text-muted uppercase">
                  <tr>
                    <th className="px-4 py-2.5">Event</th>
                    <th className="px-4 py-2.5">{t("Keterangan", "Description")}</th>
                    <th className="px-4 py-2.5">data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {EVENT_DOK.map((e) => (
                    <tr key={e.jenis} className="align-top">
                      <td className="px-4 py-2.5 font-mono text-[12.5px] whitespace-nowrap">{e.jenis}</td>
                      <td className="px-4 py-2.5">{b === "en" ? e.ket.en : e.ket.id}</td>
                      <td className="px-4 py-2.5 font-mono text-[12px] text-muted">{JSON.stringify(e.data)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Kode judul={t("Verifikasi tanda tangan (header X-CG-Tanda)", "Verify the signature (X-CG-Tanda header)")}>{contohVerifikasi}</Kode>
          </Bagian>

          <Bagian id="galat" judul={t("Galat", "Errors")}>
            <Kode>{json({ galat: { kode: "fitur_tidak_dibuka", pesan: "Scope 'knowledge' belum dibuka untuk aplikasi ini.", id_permintaan: "req_9f2a..." } })}</Kode>
            <div className="overflow-x-auto rounded-xl border border-line bg-surface">
              <table className="w-full text-left text-[13.5px]">
                <thead className="bg-subtle/60 text-[12px] text-muted uppercase">
                  <tr>
                    <th className="px-4 py-2.5">HTTP</th>
                    <th className="px-4 py-2.5">{t("Kode", "Code")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {Object.entries(KODE_GALAT).map(([k, s]) => (
                    <tr key={k}>
                      <td className="px-4 py-2 tabular-nums">{s}</td>
                      <td className="px-4 py-2 font-mono text-[12.5px]">{k}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-muted">{t("Kode 429 & 503 boleh dicoba ulang (ikuti header Retry-After).", "429 & 503 may be retried (follow the Retry-After header).")}</p>
          </Bagian>

          <Bagian id="batas" judul={t("Batas & anti-blokir", "Limits & anti-ban")} ikon={<ShieldCheck className="size-5 text-accent" aria-hidden />}>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                {t("Pesan keluar per nomor: bawaan", "Outgoing messages per number: default")} {BATAS_BAWAAN.pesan_menit}/{t("menit", "minute")}, {t("dengan jeda acak 1–3 detik.", "with a random 1–3 s gap.")}
              </li>
              <li>
                {t("Kontak baru (belum pernah chat) per nomor: bawaan", "New contacts (never chatted) per number: default")} {BATAS_BAWAAN.kontak_baru_hari}/{t("hari", "day")}; {t("lebih dari itu ditolak", "beyond that is rejected with")} <code>422 ditolak_anti_blokir</code>.
              </li>
              <li>{t("Bot AI hanya membalas chat pribadi, menampilkan \"mengetik\", maks 10 balasan per 10 menit per chat.", "The AI bot only replies to private chats, shows \"typing\", max 10 replies per 10 minutes per chat.")}</li>
              <li>{t("Aturan ini tidak bisa dimatikan lewat API. Spam/blast dilarang dan bisa membuat lisensi dicabut.", "These rules can't be turned off via the API. Spam/blasting is prohibited and may get the license revoked.")}</li>
            </ul>
          </Bagian>

          <Bagian id="lisensi" judul={t("Lisensi & pembaruan", "License & updates")}>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                {t(
                  "Lisensi dikirim server kami ke ALAMAT_PUBLIK lewat webhook saat ada perubahan dan diperpanjang tiap 3 hari (berlaku 7 hari). Mesin bertanya sekali setiap kali menyala; tidak ada polling.",
                  "Our server sends the license to ALAMAT_PUBLIK via webhook whenever something changes and renews it every 3 days (valid 7 days). The engine asks once on every start; there is no polling.",
                )}
              </li>
              <li>
                {t(
                  "Lisensi habis, ditangguhkan, dicabut, atau belum dibayar = mode terbatas: API membalas 402/403 dan bot berhenti menjawab, tetapi WhatsApp tetap tersambung (tidak perlu scan ulang).",
                  "Expired, suspended, revoked, or unpaid license = limited mode: the API returns 402/403 and the bot stops replying, but WhatsApp stays connected (no rescan needed).",
                )}
              </li>
              <li>
                {t("Pembaruan:", "Updates:")} <code>docker compose pull &amp;&amp; docker compose up -d</code>.{" "}
                {t("Migrasi database otomatis; WhatsApp ditutup rapi dan tersambung lagi sendiri.", "Database migrations run automatically; WhatsApp shuts down cleanly and reconnects by itself.")}
              </li>
              <li>{t("Cadangkan database secara berkala (pg_dump). Kehilangan database = semua nomor harus scan ulang.", "Back up the database regularly (pg_dump). Losing it means every number must be rescanned.")}</li>
              <li>{t("Isi chat, kontak, dan knowledge tidak pernah dikirim ke server kami.", "Chats, contacts, and knowledge are never sent to our servers.")}</li>
            </ul>
          </Bagian>
        </div>
      </div>
    </div>
  );
}
