import { FITUR_API, GRUP_FITUR, KODE_GALAT, type KodeGalat } from "@/lib/api-def";
import type { EndpointDok } from "@/lib/api-dok";

/**
 * Data dokumentasi Developer API (murni, tanpa I/O): daftar halaman, penjelasan galat, dan pembuat contoh kode.
 * Endpoint & event tetap bersumber dari src/lib/api-dok.ts (sumber yang sama dengan /docs/api/openapi.json).
 */

export type Teks = { id: string; en: string };

export interface HalamanDok {
  slug: string;
  judul: Teks;
  ringkas: Teks;
  grup: "mulai" | "referensi" | "panduan";
}

/** Urutan = urutan di sidebar & tombol sebelumnya/berikutnya. slug "" = halaman utama /docs/api. */
export const HALAMAN_DOK: HalamanDok[] = [
  { slug: "", grup: "mulai", judul: { id: "Ikhtisar", en: "Overview" }, ringkas: { id: "Apa itu ChatGerCep Developer API dan cara kerjanya", en: "What the ChatGerCep Developer API is and how it works" } },
  { slug: "mulai-cepat", grup: "mulai", judul: { id: "Mulai cepat", en: "Quickstart" }, ringkas: { id: "Kirim pesan WhatsApp pertama dalam 10 menit lewat sandbox", en: "Send your first WhatsApp message in 10 minutes with the sandbox" } },
  { slug: "pasang-mesin", grup: "mulai", judul: { id: "Pasang mesin", en: "Install the engine" }, ringkas: { id: "Persyaratan server, .env, HTTPS, dan pembaruan", en: "Server requirements, .env, HTTPS, and updates" } },
  { slug: "autentikasi", grup: "referensi", judul: { id: "Autentikasi & konvensi", en: "Authentication & conventions" }, ringkas: { id: "API key, idempotensi, paginasi, batas ukuran", en: "API keys, idempotency, pagination, size limits" } },
  { slug: "referensi", grup: "referensi", judul: { id: "Referensi endpoint", en: "Endpoint reference" }, ringkas: { id: "Semua endpoint v1 dengan contoh permintaan, jawaban, dan kode", en: "Every v1 endpoint with request, response, and code samples" } },
  { slug: "webhook", grup: "referensi", judul: { id: "Webhook & event", en: "Webhooks & events" }, ringkas: { id: "Event realtime ke aplikasi Anda dan cara memverifikasinya", en: "Real-time events to your app and how to verify them" } },
  { slug: "galat", grup: "referensi", judul: { id: "Kode galat", en: "Error codes" }, ringkas: { id: "Arti setiap kode galat dan apa yang harus dilakukan", en: "What every error code means and what to do" } },
  { slug: "sandbox", grup: "panduan", judul: { id: "Sandbox", en: "Sandbox" }, ringkas: { id: "Coba dengan WhatsApp asli sebelum production", en: "Try with real WhatsApp before production" } },
  { slug: "ui-sendiri", grup: "panduan", judul: { id: "Bangun UI sendiri", en: "Build your own UI" }, ringkas: { id: "Mode headless, SDK TypeScript, dan contoh aplikasi", en: "Headless mode, TypeScript SDK, and sample app" } },
  { slug: "lisensi", grup: "panduan", judul: { id: "Lisensi, fitur & batas", en: "License, features & limits" }, ringkas: { id: "Lisensi, blokir fitur, anti-blokir WhatsApp, dan privasi", en: "Licensing, feature blocking, WhatsApp anti-ban, and privacy" } },
];

export const GRUP_HALAMAN: { kode: HalamanDok["grup"]; judul: Teks }[] = [
  { kode: "mulai", judul: { id: "Mulai", en: "Get started" } },
  { kode: "referensi", judul: { id: "Referensi", en: "Reference" } },
  { kode: "panduan", judul: { id: "Panduan", en: "Guides" } },
];

export const jalurHalaman = (slug: string): string => (slug ? `/docs/api/${slug}` : "/docs/api");

// ---------- Galat ----------

export const PENJELASAN_GALAT: Record<KodeGalat, { arti: Teks; solusi: Teks }> = {
  isian_tidak_sah: { arti: { id: "Isi permintaan tidak valid (kolom wajib kosong, format salah, terlalu panjang).", en: "The request body is invalid (missing field, wrong format, too long)." }, solusi: { id: "Baca `pesan`: di situ disebut kolom yang salah. Perbaiki lalu kirim ulang.", en: "Read `pesan`: it names the wrong field. Fix it and resend." } },
  key_tidak_sah: { arti: { id: "API key salah, sudah dicabut, masa rotasinya habis, atau jenis key tidak cocok dengan mesin.", en: "The API key is wrong, revoked, past its rotation window, or doesn't match the engine type." }, solusi: { id: "Pastikan header `Authorization: Bearer <key>` dan key sama dengan CHATGERCEP_KEY di mesin. Jangan panggil dari browser.", en: "Check the `Authorization: Bearer <key>` header and that the key equals CHATGERCEP_KEY on the engine. Don't call from a browser." } },
  lisensi_kedaluwarsa: { arti: { id: "Mesin belum aktif atau lisensinya habis (perpanjangan dari pusat tidak diterima).", en: "The engine isn't activated or its license expired (renewal wasn't received)." }, solusi: { id: "Pastikan ALAMAT_PUBLIK bisa diakses lewat HTTPS, lalu nyalakan ulang mesin. Cek GET /status.", en: "Make sure ALAMAT_PUBLIK is reachable over HTTPS, then restart the engine. Check GET /status." } },
  fitur_tidak_dibuka: { arti: { id: "Fitur ini belum dibuka (atau dimatikan) untuk aplikasi Anda.", en: "This feature isn't enabled (or was disabled) for your app." }, solusi: { id: "Minta fitur itu dibuka lewat portal Developer. Blokir berlaku di API, dashboard, dan bot sekaligus.", en: "Ask for the feature in the Developer portal. Blocks apply to the API, dashboard, and bot at once." } },
  aplikasi_ditangguhkan: { arti: { id: "Aplikasi sedang ditangguhkan oleh ChatGerCep.", en: "The app is suspended by ChatGerCep." }, solusi: { id: "Hubungi ChatGerCep. WhatsApp tetap tersambung; layanan pulih begitu diaktifkan.", en: "Contact ChatGerCep. WhatsApp stays connected; service resumes once reactivated." } },
  aplikasi_dicabut: { arti: { id: "Lisensi aplikasi dicabut permanen.", en: "The app's license was permanently revoked." }, solusi: { id: "Ajukan aplikasi baru di portal Developer bila perlu.", en: "Apply for a new app in the Developer portal if needed." } },
  belum_bayar: { arti: { id: "Aplikasi berbayar dan masa bayarnya habis.", en: "The app is paid and its billing period ended." }, solusi: { id: "Bayar di halaman aplikasi di portal Developer; layanan pulih otomatis.", en: "Pay on the app page in the Developer portal; service resumes automatically." } },
  batas_nomor: { arti: { id: "Jumlah nomor WhatsApp sudah mencapai batas lisensi (sandbox: 1).", en: "The number of WhatsApp numbers reached the license limit (sandbox: 1)." }, solusi: { id: "Hapus nomor yang tidak dipakai atau minta batas dinaikkan.", en: "Delete unused numbers or ask for a higher limit." } },
  bukan_nomor_penguji: { arti: { id: "Sandbox hanya boleh mengirim ke 1 nomor penguji yang terverifikasi.", en: "The sandbox may only send to 1 verified tester number." }, solusi: { id: "Kirim ke nomor penguji, atau ganti nomor penguji di portal.", en: "Send to the tester number, or change it in the portal." } },
  nomor_penguji_belum_ada: { arti: { id: "Sandbox belum punya nomor penguji.", en: "The sandbox has no tester number yet." }, solusi: { id: "Portal → Daftarkan nomor penguji → kirim WA berisi kode UJI ke nomor bot.", en: "Portal → Register tester number → send the UJI code over WhatsApp to the bot number." } },
  sandbox_kedaluwarsa: { arti: { id: "Masa berlaku key sandbox habis.", en: "The sandbox key expired." }, solusi: { id: "Perpanjang di portal, lalu klik Perbarui lisensi di mesin atau nyalakan ulang.", en: "Extend it in the portal, then click Refresh license on the engine or restart it." } },
  sandbox_nonaktif: { arti: { id: "Sandbox sedang dimatikan oleh ChatGerCep.", en: "The sandbox is turned off by ChatGerCep." }, solusi: { id: "Coba lagi nanti atau hubungi ChatGerCep.", en: "Try again later or contact ChatGerCep." } },
  tidak_ditemukan: { arti: { id: "Data (nomor, pesan, percakapan, dokumen) tidak ada di mesin ini.", en: "The item (number, message, conversation, document) doesn't exist on this engine." }, solusi: { id: "Periksa ID di jalur. ID selalu berupa string.", en: "Check the ID in the path. IDs are always strings." } },
  nomor_belum_terhubung: { arti: { id: "Nomor WhatsApp belum terhubung (belum scan QR atau sedang terputus).", en: "The WhatsApp number isn't connected (not scanned or disconnected)." }, solusi: { id: "Ambil QR (GET /nomor/{id}/qr) lalu scan, atau tunggu event nomor.status = terhubung.", en: "Fetch the QR (GET /nomor/{id}/qr) and scan it, or wait for nomor.status = terhubung." } },
  instalasi_penuh: { arti: { id: "Batas jumlah mesin untuk key ini sudah penuh.", en: "The engine limit for this key is reached." }, solusi: { id: "Lepas instalasi lama di portal Developer.", en: "Release the old installation in the Developer portal." } },
  bentrok_idempotensi: { arti: { id: "Idempotency-Key yang sama dipakai dengan isi permintaan berbeda.", en: "The same Idempotency-Key was used with a different body." }, solusi: { id: "Buat Idempotency-Key baru untuk setiap aksi yang berbeda.", en: "Use a new Idempotency-Key for each distinct action." } },
  alamat_tidak_sah: { arti: { id: "ALAMAT_PUBLIK bukan HTTPS publik yang sah.", en: "ALAMAT_PUBLIK isn't a valid public HTTPS address." }, solusi: { id: "Pakai domain dengan sertifikat HTTPS (mis. lewat Caddy).", en: "Use a domain with an HTTPS certificate (e.g. via Caddy)." } },
  tantangan_gagal: { arti: { id: "Server kami tidak bisa memverifikasi mesin di ALAMAT_PUBLIK.", en: "Our server couldn't verify the engine at ALAMAT_PUBLIK." }, solusi: { id: "Pastikan alamat bisa diakses dari internet dan CHATGERCEP_KEY sama.", en: "Make sure the address is reachable from the internet and CHATGERCEP_KEY matches." } },
  ditolak_anti_blokir: { arti: { id: "Ditolak aturan anti-blokir WhatsApp (mis. kontak baru per hari sudah habis).", en: "Rejected by WhatsApp anti-ban rules (e.g. daily new-contact limit reached)." }, solusi: { id: "Kirim ke kontak yang pernah chat, atau coba besok. Aturan ini tidak bisa dimatikan.", en: "Send to contacts who chatted before, or try tomorrow. These rules can't be turned off." } },
  terlalu_sering: { arti: { id: "Terlalu banyak permintaan dalam waktu singkat.", en: "Too many requests in a short time." }, solusi: { id: "Tunggu sesuai header Retry-After lalu coba lagi.", en: "Wait for the Retry-After header, then retry." } },
  wa_sedang_menyambung: { arti: { id: "WhatsApp sedang menyambung ulang.", en: "WhatsApp is reconnecting." }, solusi: { id: "Coba lagi beberapa detik kemudian.", en: "Retry in a few seconds." } },
  ai_tidak_tersedia: { arti: { id: "Penyedia AI di mesin tidak menjawab.", en: "The engine's AI provider didn't respond." }, solusi: { id: "Periksa AI_API_KEY / AI_MODEL di .env mesin, lalu coba lagi.", en: "Check AI_API_KEY / AI_MODEL in the engine's .env, then retry." } },
  galat_server: { arti: { id: "Galat tak terduga di mesin.", en: "Unexpected error on the engine." }, solusi: { id: "Coba lagi. Bila berulang, kirim id_permintaan ke ChatGerCep.", en: "Retry. If it keeps happening, send the id_permintaan to ChatGerCep." } },
};

export const DAFTAR_GALAT = (Object.keys(KODE_GALAT) as KodeGalat[]).map((kode) => ({ kode, status: KODE_GALAT[kode], ...PENJELASAN_GALAT[kode] }));

// ---------- Endpoint ----------

/** Grup endpoint untuk referensi: grup katalog fitur + "Umum" (tanpa scope). */
export function grupEndpoint(e: Pick<EndpointDok, "fitur" | "jalur">): string {
  if (!e.fitur) return e.jalur.startsWith("/webhook") ? "wa" : "umum";
  return FITUR_API.find((f) => f.kode === e.fitur)?.grup ?? "umum";
}

export const GRUP_ENDPOINT: { kode: string; label: Teks }[] = [
  { kode: "umum", label: { id: "Umum", en: "General" } },
  ...GRUP_FITUR.filter((g) => g.kode !== "mesin").map((g) => ({ kode: g.kode, label: { id: g.label, en: g.label === "Data usaha" ? "Business data" : g.label === "Laporan & alat" ? "Reports & tools" : g.label } })),
];

export const idEndpoint = (e: Pick<EndpointDok, "metode" | "jalur">): string =>
  `${e.metode}-${e.jalur}`.toLowerCase().replace(/[{}]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const CONTOH_PARAM: Record<string, string> = { id: "12", pid: "88", dok: "5", slug: "laundry" };
/** Jalur contoh: {id} -> 12, dst. */
export const jalurContoh = (jalur: string): string => jalur.replace(/\{(\w+)\}/g, (_, k: string) => CONTOH_PARAM[k] ?? "1");

export type Lingkungan = "sandbox" | "production";
export const BASE: Record<Lingkungan, string> = { sandbox: "http://localhost:1975/api/v1", production: "https://wa.domain-anda.com/api/v1" };
const VAR_KEY = "CHATGERCEP_KEY";

const jsonRapi = (v: unknown, indent = 2): string => JSON.stringify(v, null, indent);

export type BahasaKode = "curl" | "sdk" | "php" | "python";
export const LABEL_KODE: Record<BahasaKode, string> = { curl: "cURL", sdk: "TypeScript (SDK)", php: "PHP", python: "Python" };

/** Contoh kode untuk satu endpoint di empat bahasa. Endpoint berkas (multipart) memakai contoh JSON setara. */
export function contohKode(e: Pick<EndpointDok, "metode" | "jalur" | "minta">, env: Lingkungan): Record<BahasaKode, string> {
  const url = `${BASE[env]}${jalurContoh(e.jalur)}`;
  const adaBadan = e.minta !== undefined && e.metode !== "GET" && e.metode !== "DELETE";
  const idem = e.metode === "POST" && (e.jalur === "/pesan" || e.jalur === "/nomor" || e.jalur.endsWith("/balas"));
  const badan = adaBadan ? jsonRapi(e.minta) : "";
  const curl = [
    `curl -X ${e.metode} "${url}"`,
    `  -H "Authorization: Bearer $${VAR_KEY}"`,
    ...(adaBadan ? [`  -H "Content-Type: application/json"`] : []),
    ...(idem ? [`  -H "Idempotency-Key: $(uuidgen)"`] : []),
    ...(adaBadan ? [`  -d '${JSON.stringify(e.minta)}'`] : []),
  ].join(" \\\n");
  const sdk = [
    `import { ChatGerCep } from "./chatgercep";`,
    ``,
    `const cg = new ChatGerCep({ alamat: "${BASE[env].replace(/\/api\/v1$/, "")}", key: process.env.${VAR_KEY}! });`,
    `const hasil = await cg.minta("${e.metode}", "${jalurContoh(e.jalur)}"${adaBadan || idem ? `, {${adaBadan ? ` body: ${jsonRapi(e.minta).replace(/\n/g, "\n  ")}` : ""}${idem ? `${adaBadan ? "," : ""} idempotensi: crypto.randomUUID()` : ""} }` : ""});`,
    `console.log(hasil);`,
  ].join("\n");
  const phpArr = (v: unknown, d = 1): string => {
    const sp = "  ".repeat(d);
    if (Array.isArray(v)) return `[${v.map((x) => phpArr(x, d)).join(", ")}]`;
    if (v && typeof v === "object") return `[\n${Object.entries(v as Record<string, unknown>).map(([k, x]) => `${sp}"${k}" => ${phpArr(x, d + 1)}`).join(",\n")}\n${"  ".repeat(d - 1)}]`;
    return JSON.stringify(v);
  };
  const php = [
    `$ch = curl_init("${url}");`,
    `curl_setopt_array($ch, [`,
    `  CURLOPT_CUSTOMREQUEST => "${e.metode}",`,
    `  CURLOPT_RETURNTRANSFER => true,`,
    `  CURLOPT_HTTPHEADER => [`,
    `    "Authorization: Bearer " . getenv("${VAR_KEY}"),`,
    ...(adaBadan ? [`    "Content-Type: application/json",`] : []),
    ...(idem ? [`    "Idempotency-Key: " . bin2hex(random_bytes(16)),`] : []),
    `  ],`,
    ...(adaBadan ? [`  CURLOPT_POSTFIELDS => json_encode(${phpArr(e.minta, 2)}),`] : []),
    `]);`,
    `$hasil = json_decode(curl_exec($ch), true);`,
  ].join("\n");
  const pyVal = (v: unknown): string => JSON.stringify(v, null, 4).replace(/\btrue\b/g, "True").replace(/\bfalse\b/g, "False").replace(/\bnull\b/g, "None");
  const python = [
    `import os, uuid, requests`,
    ``,
    `r = requests.request(`,
    `    "${e.metode}",`,
    `    "${url}",`,
    `    headers={"Authorization": f"Bearer {os.environ['${VAR_KEY}']}"${idem ? `, "Idempotency-Key": str(uuid.uuid4())` : ""}},`,
    ...(adaBadan ? [`    json=${pyVal(e.minta).replace(/\n/g, "\n    ")},`] : []),
    `    timeout=15,`,
    `)`,
    `print(r.status_code, r.json())`,
  ].join("\n");
  return { curl, sdk, php, python };
}

export const VERIFIKASI_WEBHOOK: Record<"node" | "php" | "python", string> = {
  node: `import { createHmac, timingSafeEqual } from "node:crypto";

// body = teks MENTAH permintaan (jangan di-parse dulu); rahasia = dari PUT /api/v1/webhook
export function webhookSah(body: string, header: string, rahasia: string): boolean {
  const p = Object.fromEntries(header.split(",").map((x) => x.split("=")));
  if (Math.abs(Date.now() / 1000 - Number(p.t)) > 300) return false; // lebih dari 5 menit = tolak
  const harap = createHmac("sha256", rahasia).update(\`\${p.t}.\${body}\`).digest();
  const dapat = Buffer.from(p.v1 ?? "", "hex");
  return dapat.length === harap.length && timingSafeEqual(dapat, harap);
}`,
  php: `function webhookSah(string $body, string $header, string $rahasia): bool {
  parse_str(str_replace(",", "&", $header), $p);
  if (abs(time() - (int)($p["t"] ?? 0)) > 300) return false; // lebih dari 5 menit = tolak
  $harap = hash_hmac("sha256", $p["t"] . "." . $body, $rahasia);
  return hash_equals($harap, $p["v1"] ?? "");
}
// $body = file_get_contents("php://input"); $header = $_SERVER["HTTP_X_CG_TANDA"];`,
  python: `import hmac, hashlib, time

def webhook_sah(body: bytes, header: str, rahasia: str) -> bool:
    p = dict(x.split("=", 1) for x in header.split(","))
    if abs(time.time() - int(p.get("t", 0))) > 300:  # lebih dari 5 menit = tolak
        return False
    harap = hmac.new(rahasia.encode(), f"{p['t']}.".encode() + body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(harap, p.get("v1", ""))`,
};
