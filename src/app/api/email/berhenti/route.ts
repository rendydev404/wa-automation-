import { berhentiPromo, tokenPromoSah } from "@/lib/email-promo";
import { MEREK } from "@/lib/merek";

/**
 * Tautan "Berhenti menerima kabar fitur & promo" di email kampanye (src/lib/email-promo.ts), tanpa login; keabsahan dari
 * token HMAC per akun. GET hanya menampilkan konfirmasi: pemindai tautan di aplikasi email (yang membuka semua tautan
 * otomatis) tidak boleh ikut berhenti. Berhenti = POST dari tombol di halaman itu, atau satu klik dari Gmail (RFC 8058).
 */

const aman = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function halaman(judul: string, isi: string, status = 200): Response {
  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${aman(judul)} · ${MEREK}</title>
<style>
:root{color-scheme:light}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#eef2ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#15201b;padding:16px;box-sizing:border-box}
main{width:100%;max-width:440px;background:#fff;border:1px solid #e6e6e0;border-radius:20px;padding:28px 24px;box-shadow:0 10px 30px -18px rgba(11,24,19,.35)}
.merek{font-size:18px;font-weight:800;letter-spacing:-.3px;margin:0 0 18px}.merek span{color:#0f7a5c}
h1{font-size:22px;line-height:1.3;margin:0 0 8px;letter-spacing:-.3px}
p{font-size:15px;line-height:1.6;color:#5c6862;margin:0 0 18px}
button,a.tombol{display:block;width:100%;box-sizing:border-box;text-align:center;border:0;border-radius:12px;padding:13px 18px;font-weight:700;font-size:15px;font-family:inherit;cursor:pointer;text-decoration:none}
button{background:#0f7a5c;color:#fff}a.tombol{background:#fff;color:#0f7a5c;border:1.5px solid #0f7a5c;margin-top:10px}
</style></head><body><main><p class="merek">Chat<span>GerCep</span></p><h1>${aman(judul)}</h1>${isi}</main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}

const tidakSah = () => halaman("Tautan tidak berlaku", "<p>Tautan ini tidak valid atau sudah diubah. Buka lagi tautan dari email kami.</p>", 400);

function urai(u: string | null, t: string | null): number | null {
  const id = Number(u);
  return Number.isInteger(id) && id > 0 && t && tokenPromoSah(id, t) ? id : null;
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const id = urai(q.get("u"), q.get("t"));
  if (!id) return tidakSah();
  return halaman(
    "Berhenti menerima kabar fitur & promo?",
    `<p>Kami tidak akan lagi mengirim email kabar fitur baru dan promo. Email penting lain (kode reset password, tagihan, pengingat pembayaran) tetap dikirim.</p>
<form method="post"><input type="hidden" name="u" value="${id}"><input type="hidden" name="t" value="${aman(q.get("t") ?? "")}"><button type="submit">Ya, berhenti</button></form>
<a class="tombol" href="/dashboard">Buka dasbor</a>`,
  );
}

/** Tombol di halaman konfirmasi (u & t di badan form), atau berhenti satu klik dari Gmail (RFC 8058: u & t di URL). */
export async function POST(req: Request) {
  const q = new URL(req.url).searchParams;
  const f = await req.formData().catch(() => null);
  const id = urai(f?.get("u")?.toString() ?? q.get("u"), f?.get("t")?.toString() ?? q.get("t"));
  if (!id) return tidakSah();
  if (!(await berhentiPromo(id))) return tidakSah();
  return halaman("Kabar fitur & promo dimatikan", `<p>Anda tidak akan menerima email kabar fitur dan promo lagi. Fitur baru tetap diumumkan di dasbor saat Anda masuk.</p><a class="tombol" href="/dashboard">Buka dasbor</a>`);
}
