import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { MEREK } from "./merek";

/**
 * Kirim email transaksional (kode OTP lupa password, pemberitahuan akun) lewat SMTP Gmail dengan App Password:
 * tanpa verifikasi domain, dan email dari akun Gmail itu sendiri lolos SPF/DKIM Google. Env: GMAIL_USER (alamat
 * Gmail pengirim) dan GMAIL_APP_PASSWORD (16 huruf dari myaccount.google.com/apppasswords; spasi boleh ikut).
 * Opsional: EMAIL_NAMA (nama pengirim, bawaan nama merek), SMTP_HOST / SMTP_PORT (bawaan smtp.gmail.com:465,
 * diganti hanya untuk uji atau penyedia SMTP lain). Password tidak pernah keluar dari server.
 */

function konfig() {
  const user = process.env.GMAIL_USER?.trim();
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  if (!user || !pass) return null;
  const host = process.env.SMTP_HOST?.trim() || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT) || 465;
  return { user, pass, host, port, nama: process.env.EMAIL_NAMA?.trim() || MEREK };
}

export function emailTerkonfigurasi(): boolean {
  return konfig() !== null;
}

export class EmailError extends Error {}

// Satu transporter per konfigurasi (dibuat ulang bila env berubah, mis. di uji).
const g = globalThis as unknown as { __waSmtp?: { kunci: string; t: Transporter } };

export async function kirimEmail(e: { ke: string; judul: string; teks: string; html: string }): Promise<void> {
  const k = konfig();
  if (!k) throw new EmailError("Pengiriman email belum dikonfigurasi (GMAIL_USER / GMAIL_APP_PASSWORD).");
  const kunci = `${k.host}:${k.port}:${k.user}:${k.pass}`;
  if (g.__waSmtp?.kunci !== kunci) {
    g.__waSmtp = {
      kunci,
      t: nodemailer.createTransport({
        host: k.host,
        port: k.port,
        secure: k.port === 465, // 465 = TLS langsung; port lain naik ke TLS lewat STARTTLS bila server menawarkannya
        auth: { user: k.user, pass: k.pass },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      }),
    };
  }
  try {
    await g.__waSmtp.t.sendMail({ from: { name: k.nama, address: k.user }, to: e.ke, subject: e.judul, text: e.teks, html: e.html });
  } catch (err) {
    const pesan = err instanceof Error ? err.message : String(err);
    throw new EmailError(/535|Invalid login|Username and Password not accepted/i.test(pesan) ? "Gmail menolak login: periksa GMAIL_USER dan App Password." : `Email gagal dikirim: ${pesan}`);
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
