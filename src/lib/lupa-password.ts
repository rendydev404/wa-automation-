import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { db, sekarang, transaksi } from "./db";
import { emailTerkonfigurasi, htmlEmail, kirimEmail } from "./email";
import { hashPassword } from "./password";
import { MEREK } from "./merek";
import { normalkanEmail } from "./pengguna";

/**
 * Lupa password lewat kode OTP 6 digit di email.
 *   1. mintaOtp(email): bila akun ada & aktif, kode baru dibuat (menggantikan kode lama) lalu dikirim ke email itu.
 *      Jawabannya sama untuk email terdaftar maupun tidak, dan email dikirim di latar, supaya tidak ada yang bisa
 *      menebak email mana yang terdaftar dari isi atau lama jawabannya.
 *   2. pakaiOtp(email, kode, baru): kode cocok, belum kedaluwarsa, dan percobaannya belum habis = password diganti,
 *      semua sesi lama keluar, kunci gagal login dibuka, kode dihapus (sekali pakai).
 * Yang disimpan hanya HMAC-SHA256(AUTH_SECRET, "<user_id>:<kode>"): bocornya database tidak membocorkan kode aktif.
 * Akun yang masuk dengan Google (tanpa password) juga bisa memasang password lewat jalur ini.
 */

export const OTP = {
  menit: 10, // umur kode
  maksCoba: 5, // kode salah sebanyak ini = harus minta kode baru
  jedaKirimDtk: 60, // jarak minimal antar-permintaan kode untuk satu akun
} as const;

export class GalatOtp extends Error {}

const hashKode = (userId: number, kode: string): string => createHmac("sha256", process.env.AUTH_SECRET ?? "").update(`${userId}:${kode}`).digest("hex");

/** Kirim kode OTP. Selalu selesai tanpa memberi tahu apakah emailnya terdaftar; galat hanya bila email belum dikonfigurasi. */
export async function mintaOtp(emailMentah: string): Promise<void> {
  if (!emailTerkonfigurasi()) throw new GalatOtp("Pemulihan lewat email belum diaktifkan. Hubungi admin untuk reset password.");
  const email = normalkanEmail(emailMentah);
  if (!email) return;
  const sql = await db();
  const kini = sekarang();
  const [u] = await sql<{ id: number; nama: string; status: string }[]>`SELECT id, nama, status FROM users WHERE email = ${email}`;
  if (!u || u.status !== "aktif") return;
  const kode = String(randomInt(0, 1_000_000)).padStart(6, "0");
  // Satu kode aktif per akun; permintaan ulang dalam jedaKirimDtk diabaikan (kode sebelumnya masih berlaku).
  const [baru] = await sql<{ user_id: number }[]>`
    INSERT INTO reset_password(user_id, kode_hash, dibuat, kedaluwarsa, percobaan)
    VALUES (${u.id}, ${hashKode(u.id, kode)}, ${kini}, ${kini + OTP.menit * 60}, 0)
    ON CONFLICT (user_id) DO UPDATE SET kode_hash = EXCLUDED.kode_hash, dibuat = EXCLUDED.dibuat, kedaluwarsa = EXCLUDED.kedaluwarsa, percobaan = 0
     WHERE reset_password.dibuat <= ${kini - OTP.jedaKirimDtk}
    RETURNING user_id`;
  if (!baru) return;
  void kirimEmail({
    ke: email,
    judul: `${kode} adalah kode reset password ${MEREK}`,
    teks: `Halo ${u.nama || ""},\n\nKode untuk mengatur ulang password akun ${MEREK} Anda: ${kode}\nBerlaku ${OTP.menit} menit. Jangan berikan kode ini kepada siapa pun, termasuk yang mengaku dari ${MEREK}.\n\nBukan Anda yang meminta? Abaikan email ini; password Anda tidak berubah.`,
    html: htmlEmail({
      merek: MEREK,
      judul: "Kode reset password",
      kode,
      paragraf: [
        `Masukkan kode di atas di halaman Lupa password. Kode berlaku ${OTP.menit} menit.`,
        `Jangan berikan kode ini kepada siapa pun, termasuk yang mengaku dari ${MEREK}.`,
        "Bukan Anda yang meminta? Abaikan email ini; password Anda tidak berubah.",
      ],
    }),
  }).catch((e) => console.error(`[lupa-password] email gagal dikirim user=${u.id}: ${e instanceof Error ? e.message : e}`));
}

/**
 * Ganti password dengan kode OTP. `baru` harus sudah lolos cekPassword. Tiap percobaan memakai satu jatah lebih dulu
 * (atomik di database), jadi tebakan serentak pun tidak bisa melebihi OTP.maksCoba.
 */
export async function pakaiOtp(emailMentah: string, kodeMentah: string, baru: string) {
  const email = normalkanEmail(emailMentah);
  const kode = kodeMentah.replace(/\D/g, "");
  if (!email || kode.length !== 6) throw new GalatOtp("Masukkan 6 digit kode dari email.");
  const sql = await db();
  const kini = sekarang();
  const [r] = await sql<{ user_id: number; kode_hash: string; percobaan: number }[]>`
    UPDATE reset_password r SET percobaan = r.percobaan + 1
      FROM users u
     WHERE u.email = ${email} AND r.user_id = u.id AND r.kedaluwarsa > ${kini} AND r.percobaan < ${OTP.maksCoba}
     RETURNING r.user_id, r.kode_hash, r.percobaan`;
  if (!r) throw new GalatOtp("Kode salah atau sudah kedaluwarsa. Minta kode baru.");
  const harus = Buffer.from(r.kode_hash, "hex");
  const masuk = Buffer.from(hashKode(r.user_id, kode), "hex");
  if (harus.length !== masuk.length || !timingSafeEqual(harus, masuk)) {
    const sisa = OTP.maksCoba - r.percobaan;
    if (sisa <= 0) await sql`DELETE FROM reset_password WHERE user_id = ${r.user_id}`;
    throw new GalatOtp(sisa > 0 ? `Kode salah. Sisa ${sisa} kali percobaan.` : "Kode salah terlalu sering. Minta kode baru.");
  }
  const hash = await hashPassword(baru);
  const u = await transaksi(async (tx) => {
    // Sekali pakai: hanya permintaan yang berhasil menghapus kodenya yang boleh mengganti password.
    const [dipakai] = await tx`DELETE FROM reset_password WHERE user_id = ${r.user_id} AND kode_hash = ${r.kode_hash} RETURNING user_id`;
    if (!dipakai) return null;
    const [x] = await tx<{ id: number; email: string; nama: string; peran: "admin" | "user"; status: string; password_hash: string; sesi_versi: number }[]>`
      UPDATE users SET password_hash = ${hash}, sesi_versi = sesi_versi + 1, gagal_login = 0, kunci_sampai = 0
       WHERE id = ${r.user_id}
       RETURNING id, email, nama, peran, status, password_hash, sesi_versi`;
    return x;
  });
  if (!u) throw new GalatOtp("Kode ini sudah dipakai. Minta kode baru bila perlu.");
  void kirimEmail({
    ke: u.email,
    judul: `Password akun ${MEREK} Anda baru saja diganti`,
    teks: `Password akun ${MEREK} Anda baru saja diganti lewat kode email, dan semua perangkat lain sudah dikeluarkan.\n\nBukan Anda? Segera hubungi admin ${MEREK}.`,
    html: htmlEmail({
      merek: MEREK,
      judul: "Password Anda diganti",
      paragraf: ["Password akun Anda baru saja diganti lewat kode email, dan semua perangkat lain sudah dikeluarkan.", `Bukan Anda? Segera hubungi admin ${MEREK}.`],
    }),
  }).catch((e) => console.error(`[lupa-password] pemberitahuan gagal dikirim user=${u.id}: ${e instanceof Error ? e.message : e}`));
  return u;
}
