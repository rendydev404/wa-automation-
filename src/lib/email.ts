import "server-only";

/**
 * Kirim email transaksional (kode OTP lupa password, pemberitahuan akun) lewat Resend HTTP API: satu fetch, tanpa
 * dependensi dan tanpa server SMTP. Env: RESEND_API_KEY dan EMAIL_DARI (pengirim dari domain yang sudah diverifikasi
 * di Resend, mis. "ChatGerCep <no-reply@chatgercep.com>"). Kunci tidak pernah keluar dari server.
 */

export function emailTerkonfigurasi(): boolean {
  return !!process.env.RESEND_API_KEY?.trim() && !!process.env.EMAIL_DARI?.trim();
}

export class EmailError extends Error {}

export async function kirimEmail(e: { ke: string; judul: string; teks: string; html: string }): Promise<void> {
  const kunci = process.env.RESEND_API_KEY?.trim();
  const dari = process.env.EMAIL_DARI?.trim();
  if (!kunci || !dari) throw new EmailError("Pengiriman email belum dikonfigurasi (RESEND_API_KEY / EMAIL_DARI).");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${kunci}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ from: dari, to: [e.ke], subject: e.judul, text: e.teks, html: e.html }),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) {
    const d = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new EmailError(`Resend menolak email (HTTP ${res.status})${d?.message ? `: ${d.message}` : ""}`);
  }
}

const aman = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Badan HTML sederhana yang aman di semua aplikasi email (gaya inline, tanpa gambar dari luar). */
export function htmlEmail(o: { merek: string; judul: string; paragraf: string[]; kode?: string }): string {
  const p = o.paragraf.map((t) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#334155">${aman(t)}</p>`).join("");
  const kode = o.kode
    ? `<p style="margin:6px 0 20px;font-size:32px;font-weight:700;letter-spacing:8px;color:#0f172a;font-family:ui-monospace,Menlo,Consolas,monospace">${aman(o.kode)}</p>`
    : "";
  return `<!doctype html><html lang="id"><body style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px">
<p style="margin:0 0 18px;font-size:18px;font-weight:700;color:#16a34a">${aman(o.merek)}</p>
<h1 style="margin:0 0 14px;font-size:20px;color:#0f172a">${aman(o.judul)}</h1>${kode}${p}
</div></body></html>`;
}
