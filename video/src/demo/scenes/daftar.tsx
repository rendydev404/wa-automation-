import { Check } from "lucide-react";
import { VP_H } from "../config";
import { USAHA } from "../data";
import { ketik, useT } from "../kit/anim";
import type { Cap } from "../kit/caption";
import { Spin } from "../kit/phone";
import { type Script, Stage } from "../kit/stage";
import { Isi, Logo } from "../kit/ui";
import { CaptionsPos } from "../pages/a-caption";

/** Durasi scene (detik). */
export const DUR = 17.8;

const T = { nama: 3.0, email: 5.0, pw: 7.2, ulang: 9.7, cek: 13.1, buat: 14.2 };
const PW = "DapurRini2026";

/** Penunjuk kekuatan password (sama dengan daftar-form.tsx). */
function kekuatan(pw: string): { skor: number; teks: string } {
  if (!pw) return { skor: 0, teks: "Minimal 10 karakter, ada huruf dan angka." };
  let skor = 0;
  if (pw.length >= 10) skor++;
  if (/[a-zA-Z]/.test(pw) && /[0-9]/.test(pw)) skor++;
  if (pw.length >= 14) skor++;
  if (/[^a-zA-Z0-9]/.test(pw) || (/[a-z]/.test(pw) && /[A-Z]/.test(pw))) skor++;
  return { skor, teks: ["Terlalu pendek", "Lemah", "Cukup", "Kuat", "Sangat kuat"][skor] };
}

function LogoGoogle() {
  return (
    <svg viewBox="0 0 48 48" className="size-[18px]" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  );
}

export function Daftar() {
  const t = useT();
  const nama = ketik(USAHA.pemilik, t, T.nama + 0.3, 12);
  const email = ketik(USAHA.email, t, T.email + 0.3, 14);
  const pw = ketik(PW, t, T.pw + 0.35, 10);
  const ulang = ketik(PW, t, T.ulang + 0.3, 11);
  const k = kekuatan(pw);
  const cek = t >= T.cek + 0.12;
  const kirim = t >= T.buat + 0.15;
  const fokus = (a: number, b: number) => t >= a && t < b;

  const script: Script = {
    cursor: [
      { at: 0, to: [1280, 150] },
      { at: 1.5, to: "f-google" },
      { at: T.nama - 0.05, to: "f-nama", click: true, kind: "text" },
      { at: T.email - 0.05, to: "f-email", click: true, kind: "text" },
      { at: T.pw - 0.05, to: "f-pw", click: true, kind: "text" },
      { at: T.ulang - 0.05, to: "f-ulang", click: true, kind: "text" },
      { at: T.cek - 0.05, to: "f-cek", click: true },
      { at: T.buat - 0.05, to: "f-buat", click: true },
      { at: T.buat + 1.5, to: [1250, 420] },
    ],
    scroll: [
      { at: 0, to: 0 },
      { at: 12.95, to: 999, dur: 0.85 },
    ],
    camera: [
      { at: 0, zoom: 1 },
      { at: 2.8, zoom: 1.2, focus: [1070, 330], dur: 1.2 },
      { at: 13.9, zoom: 1.2, focus: [1070, 480], dur: 1.2 },
      { at: 16.4, zoom: 1, dur: 1.1 },
    ],
  };

  const caps: Cap[] = [
    { from: 0.7, to: 2.9, label: "2 · DAFTAR", title: "Daftar gratis, tanpa kartu kredit", sub: "Bisa lewat Google atau email. Akun baru dapat 5 balasan AI percobaan (7 hari)" },
    { from: 3.2, to: 6.9, label: "2 · DAFTAR", title: "Cukup nama, email, dan password", sub: "Tiap akun terpisah penuh: nomor, knowledge, dan histori tidak terlihat pengguna lain" },
    { from: 7.2, to: 11.6, label: "2 · DAFTAR", title: "Password min. 10 karakter, huruf + angka", sub: "Di server password di-hash scrypt, tidak pernah disimpan dalam bentuk asli" },
    { from: 13.0, to: 14.9, label: "2 · DAFTAR", title: "Layanan untuk membalas pelanggan", sub: "Bukan untuk spam atau broadcast massal" },
    { from: 15.2, to: 17.4, label: "2 · DAFTAR", title: "Akun siap dalam hitungan detik", sub: "Langsung masuk ke dashboard" },
  ];

  return (
    <Stage url="/daftar" script={script} judulTab="Daftar · ChatGerCep" canvas={<CaptionsPos items={caps} left={72} top={900} maxWidth={830} />}>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]" style={{ minHeight: VP_H }}>
        <aside className="relative flex flex-col justify-between overflow-hidden bg-ink p-10 text-ink-fg">
          <div aria-hidden className="kisi-tinta absolute inset-0 opacity-70" />
          <div aria-hidden className="absolute -top-32 -left-24 size-[420px] rounded-full" style={{ background: "radial-gradient(closest-side, rgba(61,220,151,0.26), transparent)" }} />
          <span className="relative self-start rounded-lg">
            <Logo ukuran="md" gelap />
          </span>
          <div className="relative max-w-md">
            <p className="text-[28px] leading-tight font-bold tracking-tight">Balas pelanggan dalam hitungan detik, bahkan saat Anda tidur.</p>
            <ul className="mt-6 space-y-3 text-[14px] text-ink-muted">
              <li>• Sambungkan WhatsApp cukup dengan scan QR</li>
              <li>• AI menjawab dari base knowledge usaha Anda</li>
              <li>• Anda tetap bisa membalas sendiri kapan saja</li>
            </ul>
          </div>
          <p className="relative text-[12px] text-ink-muted">Sesi terenkripsi · Password di-hash scrypt · Data tiap akun terpisah</p>
        </aside>
        <div className="grid place-items-center px-4 py-10">
          <div className="w-full max-w-sm">
            <div className="mb-7 flex flex-col items-start text-left">
              <h1 className="text-2xl font-bold tracking-tight">Buat akun baru</h1>
              <p className="mt-1 text-[13.5px] text-muted">Gratis. Sambungkan WhatsApp Anda dalam dua menit.</p>
            </div>
            <div className="card p-6">
              <span data-cur="f-google" className="flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-line-strong bg-surface text-[14px] font-semibold text-fg">
                <LogoGoogle />
                Daftar dengan Google
              </span>
              <div className="my-5 flex items-center gap-3 text-[12px] font-medium text-faint">
                <span className="h-px flex-1 bg-line" />
                atau dengan email
                <span className="h-px flex-1 bg-line" />
              </div>
              <div className="space-y-4">
                <Isi label="Nama" nilai={nama} fokus={fokus(T.nama, T.email)} t={t} cur="f-nama" />
                <Isi label="Email" nilai={email} fokus={fokus(T.email, T.pw)} t={t} cur="f-email" />
                <div>
                  <Isi
                    label="Password"
                    nilai={pw}
                    password
                    fokus={fokus(T.pw, T.ulang)}
                    t={t}
                    cur="f-pw"
                    hint={
                      <>
                        <div className="mt-2 flex gap-1" aria-hidden>
                          {[1, 2, 3, 4].map((i) => (
                            <span key={i} className={`h-1 flex-1 rounded-full ${k.skor >= i ? (k.skor >= 3 ? "bg-accent" : "bg-warning") : "bg-line"}`} />
                          ))}
                        </div>
                        <p className="mt-1 text-[12px] text-muted">{k.teks}</p>
                      </>
                    }
                  />
                </div>
                <Isi label="Ulangi password" nilai={ulang} password fokus={fokus(T.ulang, T.cek)} t={t} cur="f-ulang" />
                <div className="flex items-start gap-2.5 text-[13px] text-muted">
                  <span data-cur="f-cek" className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-[4px]" style={{ background: cek ? "var(--c-accent)" : "#fff", border: cek ? "1px solid var(--c-accent)" : "1px solid #767676" }}>
                    {cek && <Check className="size-3 text-white" strokeWidth={3.5} />}
                  </span>
                  <span>Saya tidak akan memakai layanan ini untuk spam, penipuan, atau pesan massal yang melanggar aturan WhatsApp.</span>
                </div>
                <span data-cur="f-buat" className="btn btn-primary w-full" style={{ opacity: kirim ? 0.55 : 1 }}>
                  {kirim && <Spin t={t} />}
                  Buat akun
                </span>
              </div>
            </div>
            <p className="mt-5 text-center text-[13px] text-muted">
              Sudah punya akun? <span className="font-semibold text-accent">Masuk</span>
            </p>
          </div>
        </div>
      </div>
    </Stage>
  );
}
