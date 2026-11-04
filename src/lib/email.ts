import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { MEREK, PERUSAHAAN } from "./merek";

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
    await g.__waSmtp.t.sendMail({ from: { name: k.nama, address: k.user }, to: e.ke, subject: e.judul, text: `${e.teks}

--
${MEREK} · ${PERUSAHAAN}`, html: e.html });
  } catch (err) {
    const pesan = err instanceof Error ? err.message : String(err);
    throw new EmailError(/535|Invalid login|Username and Password not accepted/i.test(pesan) ? "Gmail menolak login: periksa GMAIL_USER dan App Password." : `Email gagal dikirim: ${pesan}`);
  }
}

const aman = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// Warna merek (sama dengan token di src/app/globals.css). Email tidak bisa memakai variabel CSS.
const W = {
  latar: "#eef2ef",
  ink: "#0b1813",
  inkTimbul: "#13251e",
  inkRedup: "#93a99f",
  sinyal: "#3ddc97",
  aksen: "#0f7a5c",
  aksenLembut: "#e4f3ed",
  teks: "#15201b",
  redup: "#5c6862",
  garis: "#e6e6e0",
  kanvas: "#f6f6f3",
  waspada: "#8f5a0c",
  waspadaLembut: "#fbf1dc",
  bahaya: "#9f1c2f",
  bahayaLembut: "#fde8eb",
} as const;
const HURUF = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "'SFMono-Regular',Menlo,Consolas,'Liberation Mono',monospace";

export interface IsiEmail {
  /** Teks pratinjau di daftar kotak masuk (tidak tampil di badan email). */
  pratinjau: string;
  /** Ikon besar di header: berkas public/email/<ikon>.png (ikon Lucide). */
  ikon: "kunci" | "cek";
  judul: string;
  subjudul: string;
  sapaan?: string;
  paragraf: string[];
  /** Kode OTP: satu blok teks yang mudah disalin. */
  kode?: string;
  /** Keterangan di bawah kode, mis. "Berlaku 10 menit · sampai 10.13 WIB". */
  berlaku?: string;
  /** Baris rincian (label, nilai), mis. akun & waktu. */
  rincian?: [string, string][];
  tombol?: { teks: string; url: string };
  /** Tombol garis di kiri `tombol`, mis. "Salin kode". */
  tombolKedua?: { teks: string; url: string };
  peringatan?: { nada: "waspada" | "bahaya"; judul: string; teks: string };
  catatan?: string;
}

/**
 * Email bermerek yang tampil sama di Gmail, Outlook, Apple Mail, dan aplikasi email HP: tata letak tabel, gaya
 * inline, lebar maks 520 px, tanpa CSS eksternal. Ikon = PNG kecil di public/email/ (ikon Lucide; Gmail tidak
 * menampilkan SVG), dimuat dari APP_URL. Bila gambar diblokir, nama merek dan semua teks tetap terbaca.
 */
export function htmlEmail(o: IsiEmail): string {
  const asal = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  const baris = (isi: string, gaya = "") => `<tr><td style="${gaya}">${isi}</td></tr>`;
  const p = (t: string, gaya = "") => `<p style="margin:0 0 14px;font-family:${HURUF};font-size:15px;line-height:1.6;color:${W.teks};${gaya}">${aman(t)}</p>`;
  // <img> ikon dari public/email/ (kosong bila APP_URL belum diisi).
  const ikon = (nama: string, px: number, gaya = "") =>
    asal ? `<img src="${aman(asal)}/email/${nama}.png" width="${px}" height="${px}" alt="" style="display:inline-block;border:0;vertical-align:middle;${gaya}">` : "";
  const nada = o.peringatan?.nada === "bahaya" ? { warna: W.bahaya, latar: W.bahayaLembut, ikon: "peringatan" } : { warna: W.waspada, latar: W.waspadaLembut, ikon: "perisai" };

  const logo = `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${
    asal ? `<td style="padding-right:10px;vertical-align:middle"><img src="${aman(asal)}/apple-icon.png" width="34" height="34" alt="" style="display:block;border:0;border-radius:9px"></td>` : ""
  }<td style="vertical-align:middle;font-family:${HURUF};font-size:20px;font-weight:800;letter-spacing:-0.3px;color:#ffffff">Chat<span style="color:${W.sinyal}">GerCep</span></td></tr></table>`;

  // Kode dalam SATU blok teks (bukan kotak per digit): ketuk dua kali / tekan lama langsung memilih ke-6 digit untuk
  // disalin. Email tidak bisa menjalankan JavaScript, jadi tombol "Salin" sungguhan tidak mungkin; user-select:all
  // membuat satu ketukan memilih seluruh kode di Apple Mail & aplikasi yang mendukungnya.
  const kode = o.kode
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:6px auto 8px"><tr><td style="padding:12px 18px 12px 28px;border-radius:14px;background:${W.kanvas};border:1px solid ${W.garis};border-bottom:3px solid ${W.aksen};font-family:${MONO};font-size:32px;line-height:1.1;font-weight:700;letter-spacing:10px;color:${W.teks};-webkit-user-select:all;user-select:all">${aman(o.kode)}</td></tr></table><p style="margin:0 0 12px;text-align:center;font-family:${HURUF};font-size:12px;color:${W.redup}">Tekan lama atau ketuk dua kali kodenya untuk menyalin</p>${
        o.berlaku
          ? `<p style="margin:0 0 22px;text-align:center"><span style="display:inline-block;padding:6px 12px;border-radius:999px;background:${W.aksenLembut};font-family:${HURUF};font-size:12.5px;font-weight:600;color:${W.aksen}">${ikon("jam", 14, "margin:-2px 6px 0 0")}${aman(o.berlaku)}</span></p>`
          : ""
      }`
    : "";

  const rincian = o.rincian?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px;border:1px solid ${W.garis};border-radius:12px;background:${W.kanvas}">${o.rincian
        .map(([l, v], i) => {
          const garis = i ? `border-top:1px solid ${W.garis};` : "";
          return `<tr><td style="padding:11px 14px;${garis}font-family:${HURUF};font-size:13px;color:${W.redup};width:34%">${aman(l)}</td><td style="padding:11px 14px;${garis}font-family:${HURUF};font-size:13.5px;font-weight:600;color:${W.teks};word-break:break-word">${aman(v)}</td></tr>`;
        })
        .join("")}</table>`
    : "";

  const kedua = o.tombolKedua
    ? `<td style="border-radius:12px;background:#ffffff;border:1.5px solid ${W.aksen}"><a href="${aman(o.tombolKedua.url)}" style="display:inline-block;padding:12.5px 22px;font-family:${HURUF};font-size:15px;font-weight:700;color:${W.aksen};text-decoration:none;border-radius:12px">${aman(o.tombolKedua.teks)}</a></td><td style="width:10px"></td>`
    : "";
  const tombol = o.tombol
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:6px auto 22px"><tr>${kedua}<td style="border-radius:12px;background:${W.aksen}"><a href="${aman(o.tombol.url)}" style="display:inline-block;padding:14px 26px;font-family:${HURUF};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px">${aman(o.tombol.teks)}${ikon("panah", 16, "margin:-2px 0 0 8px")}</a></td></tr></table>`
    : "";

  const peringatan = o.peringatan
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px"><tr><td style="padding:14px 16px;border-radius:12px;background:${nada.latar};border-left:4px solid ${nada.warna}"><p style="margin:0 0 4px;font-family:${HURUF};font-size:13.5px;font-weight:700;color:${nada.warna}">${ikon(nada.ikon, 16, "margin:-3px 7px 0 0")}${aman(o.peringatan.judul)}</p><p style="margin:0;font-family:${HURUF};font-size:13px;line-height:1.55;color:${nada.warna}">${aman(o.peringatan.teks)}</p></td></tr></table>`
    : "";

  const header = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${baris(logo, "padding:22px 24px 0")}${baris(
    `<div style="width:56px;height:56px;line-height:56px;text-align:center;border-radius:16px;background:${W.inkTimbul};border:1px solid rgba(232,240,236,0.12)">${ikon(o.ikon, 28)}</div>`,
    "padding:24px 24px 0"
  )}${baris(`<h1 style="margin:16px 0 6px;font-family:${HURUF};font-size:24px;line-height:1.25;font-weight:800;letter-spacing:-0.4px;color:#ffffff">${aman(o.judul)}</h1>`, "padding:0 24px")}${baris(
    `<p style="margin:0;font-family:${HURUF};font-size:14.5px;line-height:1.55;color:${W.inkRedup}">${aman(o.subjudul)}</p>`,
    "padding:0 24px 26px"
  )}</table>`;
  const badan = `${o.sapaan ? p(o.sapaan, "font-weight:600") : ""}${o.paragraf.map((t) => p(t)).join("")}${kode}${rincian}${tombol}${peringatan}${o.catatan ? p(o.catatan, `font-size:13px;color:${W.redup};margin:0`) : ""}`;
  const kaki = `<p style="margin:0 0 6px;font-family:${HURUF};font-size:12.5px;font-weight:700;color:${W.teks}">Chat<span style="color:${W.aksen}">GerCep</span> <span style="font-weight:400;color:${W.redup}">· Asisten AI WhatsApp untuk usaha Anda</span></p><p style="margin:0;font-family:${HURUF};font-size:12px;line-height:1.6;color:${W.redup}">Email ini dikirim otomatis, mohon tidak dibalas.${
    asal ? ` <a href="${aman(asal)}" style="color:${W.aksen};text-decoration:none;font-weight:600">${aman(asal.replace(/^https?:\/\//, ""))}</a>` : ""
  }<br>&copy; ${new Date().getFullYear()} ${aman(PERUSAHAAN)}. ${aman(MEREK)} adalah produk ${aman(PERUSAHAAN)}.</p>`;

  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${aman(o.judul)}</title></head>
<body style="margin:0;padding:0;background:${W.latar}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${aman(o.pratinjau)}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${W.latar}"><tr><td align="center" style="padding:24px 10px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">
${baris(header, `background:${W.ink};background-image:linear-gradient(135deg,${W.ink} 0%,#103a2b 100%);border-radius:20px 20px 0 0`)}
${baris(badan, `background:#ffffff;padding:26px 24px;border-radius:0 0 20px 20px;border:1px solid ${W.garis};border-top:0`)}
${baris(kaki, "padding:20px 8px 0;text-align:center")}
</table>
</td></tr></table>
</body></html>`;
}
