import "server-only";
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { db, sekarang, transaksi } from "./db";
import { emailTerkonfigurasi, htmlEmail, kirimEmail } from "./email";
import { hashPassword } from "./password";
import { MEREK } from "./merek";
import { normalkanEmail } from "./pengguna";

/**
 * Lupa password, tiga tahap:
 *   1. mintaOtp(email): hanya akun terdaftar & aktif yang dikirimi kode 6 digit (menggantikan kode lama). Email yang
 *      tidak terdaftar dijawab terus terang (pilihan pemilik: pengguna langsung tahu salah ketik), dibatasi per IP &
 *      per email di actions.ts supaya tidak bisa dipakai menyisir daftar email.
 *   2. verifikasiOtp(email, kode): kode cocok, belum kedaluwarsa, percobaannya belum habis = kode hangus dan ditukar
 *      token reset acak (sekali pakai, OTP.menit) yang dibawa browser ke tahap 3.
 *   3. gantiPasswordDenganToken(email, token, baru): password diganti, semua sesi lama keluar, kunci gagal login
 *      dibuka, baris reset dihapus.
 * Yang disimpan hanya HMAC-SHA256(AUTH_SECRET, ...) dari kode dan token: bocornya database tidak membocorkan keduanya.
 * Akun yang masuk dengan Google (tanpa password) juga bisa memasang password lewat jalur ini.
 */

export const OTP = {
  menit: 10, // umur kode, juga umur token reset setelah kode benar
  maksCoba: 5, // kode salah sebanyak ini = harus minta kode baru
  jedaKirimDtk: 60, // jarak minimal antar-permintaan kode untuk satu akun
} as const;

export class GalatOtp extends Error {}

const hmac = (isi: string): string => createHmac("sha256", process.env.AUTH_SECRET ?? "").update(isi).digest("hex");
const hashKode = (userId: number, kode: string): string => hmac(`${userId}:${kode}`);
const hashToken = (userId: number, token: string): string => hmac(`token:${userId}:${token}`);
const samaHex = (a: string, b: string): boolean => {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
};

const asalApp = (): string => (process.env.APP_URL ?? "").replace(/\/+$/, "");
const wib = (o: Intl.DateTimeFormatOptions) => (detik: number) => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", ...o }).format(new Date(detik * 1000));
const jamWib = wib({ hour: "2-digit", minute: "2-digit" });
const tanggalWib = wib({ day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

export type HasilMinta ="terkirim" | "tidak-terdaftar" | "diblokir";

/** Kirim kode OTP ke akun terdaftar. Galat hanya bila pengiriman email belum dikonfigurasi. */
export async function mintaOtp(emailMentah: string): Promise<HasilMinta> {
  if (!emailTerkonfigurasi()) throw new GalatOtp("Pemulihan lewat email belum diaktifkan. Hubungi admin untuk reset password.");
  const email = normalkanEmail(emailMentah);
  if (!email) return "tidak-terdaftar";
  const sql = await db();
  const kini = sekarang();
  const [u] = await sql<{ id: number; nama: string; status: string }[]>`SELECT id, nama, status FROM users WHERE email = ${email}`;
  if (!u) return "tidak-terdaftar";
  if (u.status !== "aktif") return "diblokir";
  const kode = String(randomInt(0, 1_000_000)).padStart(6, "0");
  // Satu kode aktif per akun; permintaan ulang dalam jedaKirimDtk tidak mengirim lagi (kode sebelumnya masih berlaku).
  const [baru] = await sql<{ user_id: number }[]>`
    INSERT INTO reset_password(user_id, kode_hash, dibuat, kedaluwarsa, percobaan)
    VALUES (${u.id}, ${hashKode(u.id, kode)}, ${kini}, ${kini + OTP.menit * 60}, 0)
    ON CONFLICT (user_id) DO UPDATE SET kode_hash = EXCLUDED.kode_hash, dibuat = EXCLUDED.dibuat, kedaluwarsa = EXCLUDED.kedaluwarsa,
           percobaan = 0, token_hash = NULL, token_kedaluwarsa = NULL
     WHERE reset_password.dibuat <= ${kini - OTP.jedaKirimDtk}
    RETURNING user_id`;
  if (!baru) return "terkirim";
  void kirimEmail({
    ke: email,
    judul: `${kode} adalah kode reset password ${MEREK}`,
    teks: `Halo ${u.nama || ""},\n\nKode untuk mengatur ulang password akun ${MEREK} Anda: ${kode}\nBerlaku ${OTP.menit} menit. Jangan berikan kode ini kepada siapa pun, termasuk yang mengaku dari ${MEREK}.\n\nBukan Anda yang meminta? Abaikan email ini; password Anda tidak berubah.`,
    html: htmlEmail({
      pratinjau: `Kode berlaku ${OTP.menit} menit. Jangan berikan kepada siapa pun.`,
      ikon: "kunci",
      judul: "Kode reset password",
      subjudul: `Gunakan kode ini untuk membuat password baru akun ${MEREK} Anda.`,
      sapaan: `Halo ${u.nama?.trim() || "Kak"},`,
      paragraf: [`Kami menerima permintaan untuk mengatur ulang password akun ${email}. Masukkan kode berikut di halaman Lupa password:`],
      kode,
      berlaku: `Berlaku ${OTP.menit} menit · sampai ${jamWib(kini + OTP.menit * 60)} WIB`,
      tombol: asalApp() ? { teks: "Buka halaman Lupa password", url: `${asalApp()}/lupa-password` } : undefined,
      peringatan: {
        nada: "waspada",
        judul: "Jaga kerahasiaan kode ini",
        teks: `Jangan berikan kode ini kepada siapa pun, termasuk yang mengaku dari ${MEREK}. Tim kami tidak pernah meminta kode lewat chat atau telepon.`,
      },
      catatan: "Bukan Anda yang meminta? Abaikan email ini; password Anda tetap aman dan tidak berubah.",
    }),
  }).catch((e) => console.error(`[lupa-password] email gagal dikirim user=${u.id}: ${e instanceof Error ? e.message : e}`));
  return "terkirim";
}

/**
 * Tahap 2: periksa kode. Tiap percobaan memakai satu jatah lebih dulu (atomik di database), jadi tebakan serentak pun
 * tidak bisa melebihi OTP.maksCoba. Benar = kode hangus (sekali pakai) dan token reset dikembalikan.
 */
export async function verifikasiOtp(emailMentah: string, kodeMentah: string): Promise<string> {
  const email = normalkanEmail(emailMentah);
  const kode = kodeMentah.replace(/\D/g, "");
  if (!email || kode.length !== 6) throw new GalatOtp("Masukkan 6 digit kode dari email.");
  const sql = await db();
  const kini = sekarang();
  const [r] = await sql<{ user_id: number; kode_hash: string; percobaan: number }[]>`
    UPDATE reset_password r SET percobaan = r.percobaan + 1
      FROM users u
     WHERE u.email = ${email} AND r.user_id = u.id AND r.kedaluwarsa > ${kini} AND r.percobaan < ${OTP.maksCoba} AND r.kode_hash <> ''
     RETURNING r.user_id, r.kode_hash, r.percobaan`;
  if (!r) throw new GalatOtp("Kode salah atau sudah kedaluwarsa. Minta kode baru.");
  if (!samaHex(r.kode_hash, hashKode(r.user_id, kode))) {
    const sisa = OTP.maksCoba - r.percobaan;
    if (sisa <= 0) await sql`DELETE FROM reset_password WHERE user_id = ${r.user_id}`;
    throw new GalatOtp(sisa > 0 ? `Kode salah. Sisa ${sisa} kali percobaan.` : "Kode salah terlalu sering. Minta kode baru.");
  }
  const token = randomBytes(32).toString("base64url");
  // Sekali pakai: hanya permintaan yang berhasil mengosongkan kode ini yang mendapat token.
  const [ok] = await sql`
    UPDATE reset_password SET kode_hash = '', token_hash = ${hashToken(r.user_id, token)}, token_kedaluwarsa = ${kini + OTP.menit * 60}
     WHERE user_id = ${r.user_id} AND kode_hash = ${r.kode_hash}
     RETURNING user_id`;
  if (!ok) throw new GalatOtp("Kode ini sudah dipakai. Minta kode baru bila perlu.");
  return token;
}

/** Tahap 3: ganti password dengan token dari verifikasiOtp. `baru` harus sudah lolos cekPassword. */
export async function gantiPasswordDenganToken(emailMentah: string, tokenMentah: string, baru: string) {
  const email = normalkanEmail(emailMentah);
  const token = tokenMentah.trim();
  const KEDALUWARSA = "Sesi reset sudah kedaluwarsa. Ulangi dari awal dengan meminta kode baru.";
  if (!email || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new GalatOtp(KEDALUWARSA);
  const sql = await db();
  const [r] = await sql<{ user_id: number; token_hash: string }[]>`
    SELECT r.user_id, r.token_hash FROM reset_password r JOIN users u ON u.id = r.user_id
     WHERE u.email = ${email} AND r.token_hash IS NOT NULL AND r.token_kedaluwarsa > ${sekarang()}`;
  if (!r || !samaHex(r.token_hash, hashToken(r.user_id, token))) throw new GalatOtp(KEDALUWARSA);
  const hash = await hashPassword(baru);
  const u = await transaksi(async (tx) => {
    const [dipakai] = await tx`DELETE FROM reset_password WHERE user_id = ${r.user_id} AND token_hash = ${r.token_hash} RETURNING user_id`;
    if (!dipakai) return null;
    const [x] = await tx<{ id: number; email: string; nama: string; peran: "admin" | "user"; status: string; password_hash: string; sesi_versi: number }[]>`
      UPDATE users SET password_hash = ${hash}, sesi_versi = sesi_versi + 1, gagal_login = 0, kunci_sampai = 0
       WHERE id = ${r.user_id}
       RETURNING id, email, nama, peran, status, password_hash, sesi_versi`;
    return x;
  });
  if (!u) throw new GalatOtp(KEDALUWARSA);
  void kirimEmail({
    ke: u.email,
    judul: `Password akun ${MEREK} Anda baru saja diganti`,
    teks: `Password akun ${MEREK} Anda baru saja diganti lewat kode email, dan semua perangkat lain sudah dikeluarkan.\n\nBukan Anda? Segera hubungi admin ${MEREK}.`,
    html: htmlEmail({
      pratinjau: "Password akun Anda baru saja diganti. Semua perangkat lain sudah dikeluarkan.",
      ikon: "cek",
      judul: "Password berhasil diganti",
      subjudul: "Akun Anda sekarang memakai password baru.",
      sapaan: `Halo ${u.nama?.trim() || "Kak"},`,
      paragraf: [`Password akun ${MEREK} Anda baru saja diganti lewat kode email. Demi keamanan, semua perangkat lain sudah dikeluarkan otomatis.`],
      rincian: [
        ["Akun", u.email],
        ["Waktu", `${tanggalWib(sekarang())} WIB`],
        ["Perangkat lain", "Sudah dikeluarkan"],
      ],
      tombol: asalApp() ? { teks: "Masuk ke akun", url: `${asalApp()}/login` } : undefined,
      peringatan: { nada: "bahaya", judul: "Bukan Anda yang mengganti?", teks: `Segera atur ulang password lewat halaman Lupa password, lalu hubungi admin ${MEREK}.` },
    }),
  }).catch((e) => console.error(`[lupa-password] pemberitahuan gagal dikirim user=${u.id}: ${e instanceof Error ? e.message : e}`));
  return u;
}
