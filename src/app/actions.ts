"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  AfiliasiError,
  COOKIE_REF,
  type JenisKomisi,
  type ModePersetujuanAfiliasi,
  type SiklusKomisi,
  type StatusAfiliator,
  ajukanPenarikan,
  daftarAfiliator,
  labelKomisiPaket,
  prosesPenarikanAdmin,
  setStatusAfiliatorAdmin,
  simpanPengaturanAfiliasi,
  terapkanReferral,
  ubahProfilAfiliator,
} from "@/lib/afiliasi";
import { nomorUntuk } from "@/lib/akses";
import { kunciAnthropic, kursUsd, perkiraanPerBalasan } from "@/lib/ai";
import { KANAL_BAYAR, type KanalBayar, MAKS_HARGA_PAKET, METODE_BAYAR, kanalSah, labelKanal } from "@/lib/harga";
import type { Bahasa, T } from "@/lib/bahasa";
import { alihkanPermintaan, teksPermintaan } from "@/lib/bahasa-server";
import { authConfigured } from "@/lib/auth";
import { asalAplikasi, ipKlien, lewatHttps, terlaluSering } from "@/lib/batas";
import { sekarang, setSetting } from "@/lib/db";
import {
  COOKIE_PIXEL_REG,
  KUNCI_EVENT_META,
  type KunciEventMeta,
  ekstrakPixelId,
  kirimCapiEvent,
  simpanPengaturanMetaPixel,
  ujiCapiMetaPixel,
} from "@/lib/meta-pixel";
import { notifPendaftarBaru } from "@/lib/notifikasi";
import { ATURAN_ANGKA, MAKS_ATURAN_GLOBAL } from "@/lib/aturan";
import { type IsiKhusus, METODE_MANUAL, type MetodeManual, batalkanBayar, berikanPaketManual, hapusPaket, hentikanLangganan, mulaiBayar, ORDER_SAH, paketById, segarkanKuota, simpanPaket, terapkanSimulasi } from "@/lib/langganan";
import { MidtransError, kanalAktif, kanalBelumAktif, konfigMidtrans, setKanalMati } from "@/lib/midtrans";
import { tanggal, uang } from "@/lib/format";
import { GalatCustom, customTampil, periksaCustom, ringkasCustom, simpanPaketCustom } from "@/lib/paket-custom";
import { KnowledgeError, adaKnowledge, hapusDokumen, pratinjauDokumen, tambahDokumen } from "@/lib/knowledge";
import { geserProduk, hapusProduk, katalogBoleh, setTersedia } from "@/lib/katalog";
import { BATAS_JEDA_DETIK, BATAS_TUNGGU_BACA_DETIK, BATAS_TUNGGU_DETIK, hapusNomor, nomorMilik, rapikanNomorWa, semuaNomor, setBelajar, setBotAktif, setSaringProspek, setSaringSpam, tambahNomor, ubahNomor } from "@/lib/numbers";
import { cekPassword, verifyPassword } from "@/lib/password";
import { type ItemPelajaran, daftarPelajaran, hapusPelajaran } from "@/lib/pelajaran";
import {
  PenggunaError,
  buatAkun,
  cabutSesi,
  catatLog,
  beriBonusKuota,
  gantiPassword,
  hapusPengguna,
  normalkanEmail,
  passwordHash,
  penggunaById,
  resetPassword,
  setAiAkun,
  setBlokir,
  setKuota,
  setPeran,
  TANPA_PASSWORD,
  tandaiTurSelesai,
  ubahNama,
} from "@/lib/pengguna";
import { hapusPercakapan, kunciPercakapan, tandaiBukanSpam } from "@/lib/percakapan";
import { bangunkanChat } from "@/lib/bridge";
import { konfigurasi as konfigurasiSinkron, setNomorSinkron, statusSinkron } from "@/lib/sinkron";
import { mintaSinkronCg, setNomorSinkronCg, statusSinkronCg } from "@/lib/sinkron-cg";
import { GalatOtp, gantiPasswordDenganToken, mintaOtp, verifikasiOtp } from "@/lib/lupa-password";
import {
  MAKS_GAGAL_LOGIN,
  akhiriSesi,
  catatLoginBerhasil,
  catatLoginGagal,
  findUserByEmail,
  halamanAwal,
  kuotaNomor,
  mulaiSesi,
  pastikanAdminAwal,
  pendaftaranDibuka,
  requireAdmin,
  requireUser,
} from "@/lib/session";
import { WaError, hapusSesi, hubungkan, logout, mintaKodePairing } from "@/lib/wa";

export interface Hasil {
  ok: boolean;
  pesan?: string;
}

// ---------- Login & pendaftaran ----------

// Hash pengganti saat email tidak terdaftar: verifikasi tetap berjalan supaya waktu respons tidak membocorkan email.
const HASH_PALSU = "scrypt:16384:8:1:AAAAAAAAAAAAAAAAAAAAAA==:AAAA";

// Pesan yang dipakai banyak aksi pengguna (versi Inggris untuk halaman /eng).
const belumDikonfigurasi = (t: T): Hasil => ({ ok: false, pesan: t("AUTH_SECRET belum dikonfigurasi di server.", "AUTH_SECRET is not configured on the server.") });
const terlaluBanyak = (t: T): Hasil => ({ ok: false, pesan: t("Terlalu banyak percobaan. Coba lagi beberapa menit lagi.", "Too many attempts. Please try again in a few minutes.") });
const nomorTidakAda = (t: T): Hasil => ({ ok: false, pesan: t("Nomor tidak ditemukan.", "Number not found.") });
const percakapanTidakSah = (t: T): Hasil => ({ ok: false, pesan: t("Percakapan tidak valid.", "Invalid conversation.") });
const ulangiTidakSama = (t: T): Hasil => ({ ok: false, pesan: t("Ulangi password baru tidak sama.", "The new passwords don't match.") });

export async function loginAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const { t, href } = await teksPermintaan();
  if (!authConfigured()) return belumDikonfigurasi(t);
  const ip = await ipKlien();
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 254);
  const password = String(form.get("password") ?? "");
  // Dua lapis: per IP (penebakan massal) dan per email (satu akun ditebak dari banyak IP; ada juga kunci akun di database).
  if (terlaluSering(`login:${ip}`, 10, 5 * 60_000) || terlaluSering(`login-email:${email}`, 20, 15 * 60_000)) return terlaluBanyak(t);

  const user = email && password.length <= 200 ? await findUserByEmail(email) : undefined;
  const cocok = await verifyPassword(password, user?.password_hash ?? HASH_PALSU);
  if (user && user.kunci_sampai > sekarang()) {
    const menit = Math.ceil((user.kunci_sampai - sekarang()) / 60);
    return {
      ok: false,
      pesan: t(
        `Akun dikunci sementara setelah ${MAKS_GAGAL_LOGIN} kali gagal masuk. Coba lagi dalam ${menit} menit.`,
        `Account temporarily locked after ${MAKS_GAGAL_LOGIN} failed sign-in attempts. Try again in ${menit} ${menit === 1 ? "minute" : "minutes"}.`
      ),
    };
  }
  if (!user || !cocok) {
    if (user) await catatLoginGagal(user.id);
    return { ok: false, pesan: t("Email atau password salah.", "Incorrect email or password.") };
  }
  if (user.status === "diblokir") {
    const alasan = user.alasan_blokir ? `: ${user.alasan_blokir}` : ".";
    return { ok: false, pesan: t(`Akun Anda diblokir oleh admin${alasan}`, `Your account has been blocked by the admin${alasan}`) };
  }

  await catatLoginBerhasil(user.id);
  await mulaiSesi(user, await lewatHttps());
  redirect(href(halamanAwal(user.peran)));
}

export async function daftarAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const { b, t, href } = await teksPermintaan();
  if (!authConfigured()) return belumDikonfigurasi(t);
  if (!(await pendaftaranDibuka())) return { ok: false, pesan: t("Pendaftaran akun baru sedang ditutup oleh admin.", "New sign-ups are currently closed by the admin.") };
  // Kolom jebakan: tidak terlihat oleh manusia, biasanya diisi bot.
  if (String(form.get("situs") ?? "")) return { ok: false, pesan: t("Pendaftaran ditolak.", "Sign-up rejected.") };
  if (terlaluSering(`daftar:${await ipKlien()}`, 5, 60 * 60_000))
    return { ok: false, pesan: t("Terlalu banyak pendaftaran dari jaringan ini. Coba lagi nanti.", "Too many sign-ups from this network. Please try again later.") };

  const nama = String(form.get("nama") ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  const email = normalkanEmail(String(form.get("email") ?? ""));
  const password = String(form.get("password") ?? "");
  if (nama.length < 2) return { ok: false, pesan: t("Nama minimal 2 huruf.", "Name must be at least 2 letters.") };
  if (!email) return { ok: false, pesan: t("Email tidak valid.", "Invalid email.") };
  const lemah = cekPassword(password, email, b);
  if (lemah) return { ok: false, pesan: lemah };
  if (password !== String(form.get("ulang") ?? "")) return { ok: false, pesan: t("Ulangi password tidak sama.", "The passwords don't match.") };
  if (form.get("setuju") !== "on") return { ok: false, pesan: t("Setujui aturan penggunaan dulu.", "Please agree to the terms of use first.") };

  await pastikanAdminAwal();
  const akun = await buatAkun({ email, nama, password });
  if (!akun) return { ok: false, pesan: t("Email ini sudah terdaftar. Silakan masuk.", "This email is already registered. Please sign in.") };
  const toples = await cookies();
  const refKode = toples.get(COOKIE_REF)?.value;
  if (refKode) {
    await terapkanReferral(akun.id, refKode).catch(() => {});
    toples.delete(COOKIE_REF);
  }
  toples.set(COOKIE_PIXEL_REG, "1", { maxAge: 120, path: "/", httpOnly: false, sameSite: "lax" });
  void kirimCapiEvent({ kunci: "complete_registration", email });
  notifPendaftarBaru(akun.id, email, "email");
  await catatLoginBerhasil(akun.id);
  await mulaiSesi(akun, await lewatHttps());
  redirect(href(halamanAwal(akun.peran)));
}

export async function logoutAction(): Promise<void> {
  await akhiriSesi();
  await alihkanPermintaan("/login");
}

// ---------- Akun sendiri ----------

export async function ubahProfilAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const user = await requireUser();
  const { t } = await teksPermintaan();
  const nama = String(form.get("nama") ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  if (nama.length < 2) return { ok: false, pesan: t("Nama minimal 2 huruf.", "Name must be at least 2 letters.") };
  await ubahNama(user.id, nama);
  revalidatePath("/", "layout");
  return { ok: true, pesan: t("Profil tersimpan.", "Profile saved.") };
}

export async function gantiPasswordAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const user = await requireUser();
  const { b, t } = await teksPermintaan();
  if (terlaluSering(`ganti-pw:${user.id}`, 6, 15 * 60_000)) return { ok: false, pesan: t("Terlalu banyak percobaan. Coba lagi nanti.", "Too many attempts. Please try again later.") };
  const lama = String(form.get("lama") ?? "");
  const baru = String(form.get("baru") ?? "");
  const tersimpan = (await passwordHash(user.id)) ?? HASH_PALSU;
  // Akun dari Google belum punya password: boleh langsung memasang (sudah terbukti lewat sesi login yang sah).
  if (tersimpan !== TANPA_PASSWORD && !(await verifyPassword(lama, tersimpan))) return { ok: false, pesan: t("Password saat ini salah.", "Your current password is incorrect.") };
  const lemah = cekPassword(baru, user.email, b);
  if (lemah) return { ok: false, pesan: lemah };
  if (baru !== String(form.get("ulang") ?? "")) return ulangiTidakSama(t);
  if (tersimpan !== TANPA_PASSWORD && baru === lama) return { ok: false, pesan: t("Password baru harus berbeda.", "The new password must be different.") };
  // Sesi lain batal karena sidik hash password berubah; sesi di perangkat ini diperbarui.
  await mulaiSesi(await gantiPassword(user.id, baru), await lewatHttps());
  revalidatePath("/akun");
  return {
    ok: true,
    pesan:
      tersimpan === TANPA_PASSWORD
        ? t("Password terpasang. Sekarang bisa masuk juga dengan email.", "Password set. You can now also sign in with your email.")
        : t("Password diganti. Perangkat lain otomatis keluar.", "Password changed. Other devices were signed out automatically."),
  };
}

/**
 * Lupa password tahap 1: kirim kode OTP ke email yang terdaftar. Email yang tidak terdaftar dijawab terus terang
 * (tidak bisa lanjut). Dibatasi per IP dan per email (menyisir daftar email / membanjiri kotak masuk), ditambah
 * jeda 60 detik per akun di lupa-password.ts.
 */
export async function mintaOtpAction(_lalu: Hasil | null, form: FormData): Promise<Hasil & { email?: string }> {
  const { b, t } = await teksPermintaan();
  const email = normalkanEmail(String(form.get("email") ?? ""));
  if (!email) return { ok: false, pesan: t("Format email tidak valid.", "Invalid email format.") };
  if (terlaluSering(`otp:${await ipKlien()}`, 5, 15 * 60_000) || terlaluSering(`otp-email:${email}`, 3, 15 * 60_000))
    return { ok: false, pesan: t("Terlalu banyak permintaan kode. Coba lagi beberapa menit lagi.", "Too many code requests. Please try again in a few minutes.") };
  let hasil;
  try {
    hasil = await mintaOtp(email, b);
  } catch (e) {
    if (e instanceof GalatOtp) return { ok: false, pesan: teksGalat(e, b) };
    throw e;
  }
  if (hasil === "tidak-terdaftar")
    return { ok: false, pesan: t("Email ini belum terdaftar. Periksa lagi ejaannya, atau daftar akun baru.", "This email isn't registered. Check the spelling, or sign up for a new account.") };
  if (hasil === "diblokir")
    return { ok: false, pesan: t("Akun ini sedang diblokir admin, jadi password tidak bisa diatur ulang. Hubungi admin.", "This account is blocked by the admin, so the password can't be reset. Please contact the admin.") };
  return {
    ok: true,
    pesan: t(`Kode 6 digit sudah dikirim ke ${email}. Cek juga folder Spam atau Promosi.`, `A 6-digit code has been sent to ${email}. Also check your Spam or Promotions folder.`),
    email,
  };
}

/** Lupa password tahap 2: periksa kode OTP. Benar = token reset sekali pakai untuk tahap 3. */
export async function verifikasiOtpAction(_lalu: Hasil | null, form: FormData): Promise<Hasil & { token?: string }> {
  const { b, t } = await teksPermintaan();
  if (terlaluSering(`otp-pakai:${await ipKlien()}`, 20, 15 * 60_000)) return terlaluBanyak(t);
  try {
    const token = await verifikasiOtp(String(form.get("email") ?? "").slice(0, 254), String(form.get("kode") ?? "").slice(0, 20));
    return { ok: true, token };
  } catch (e) {
    if (e instanceof GalatOtp) return { ok: false, pesan: teksGalat(e, b) };
    throw e;
  }
}

/** Lupa password tahap 3: password baru dengan token dari tahap 2. Berhasil = semua sesi lama keluar, lalu langsung masuk. */
export async function resetPasswordOtpAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const { b, t, href } = await teksPermintaan();
  if (!authConfigured()) return belumDikonfigurasi(t);
  if (terlaluSering(`otp-ganti:${await ipKlien()}`, 20, 15 * 60_000)) return terlaluBanyak(t);
  const email = String(form.get("email") ?? "").slice(0, 254);
  const baru = String(form.get("baru") ?? "");
  const lemah = cekPassword(baru, email, b);
  if (lemah) return { ok: false, pesan: lemah };
  if (baru !== String(form.get("ulang") ?? "")) return ulangiTidakSama(t);
  let u;
  try {
    u = await gantiPasswordDenganToken(email, String(form.get("token") ?? "").slice(0, 100), baru, b);
  } catch (e) {
    if (e instanceof GalatOtp) return { ok: false, pesan: teksGalat(e, b) };
    throw e;
  }
  if (u.status !== "aktif") return { ok: true, pesan: t("Password sudah diganti, tetapi akun Anda sedang diblokir admin.", "Your password was changed, but your account is blocked by the admin.") };
  await mulaiSesi(u, await lewatHttps());
  redirect(href(halamanAwal(u.peran)));
}

export async function keluarSemuaAction(): Promise<Hasil> {
  const user = await requireUser();
  const { t } = await teksPermintaan();
  await mulaiSesi(await cabutSesi(user.id), await lewatHttps());
  return { ok: true, pesan: t("Semua perangkat lain sudah dikeluarkan.", "All other devices have been signed out.") };
}

// ---------- Koneksi WhatsApp ----------

/** Galat lib dua bahasa: kelasnya (WaError, KnowledgeError, AfiliasiError, GalatOtp, ...) membawa versi `en`. */
const teksGalat = (e: Error & { en?: string }, b: Bahasa): string => (b === "en" && e.en) || e.message;

/** Pesan galat untuk pengguna; `b` bawaan "id" (aksi admin tetap berbahasa Indonesia). */
const pesanGalat = (e: unknown, b: Bahasa = "id"): string =>
  e instanceof WaError || e instanceof KnowledgeError || e instanceof PenggunaError || e instanceof AfiliasiError
    ? teksGalat(e, b)
    : b === "en"
      ? "Something went wrong. Please try again."
      : "Terjadi kesalahan. Coba lagi.";

/** Seperti pesanGalat, ditambah nominal "{rp}" di galat afiliasi versi Inggris yang ditampilkan sebagai USD. */
async function pesanGalatAfiliasi(e: unknown, b: Bahasa): Promise<string> {
  if (b === "en" && e instanceof AfiliasiError && e.en && e.rp !== undefined) return e.en.replace("{rp}", uang(e.rp, b, await kursUsd()));
  return pesanGalat(e, b);
}

export async function hubungkanWaAction(id: number): Promise<Hasil> {
  const nomor = await nomorUntuk(await requireUser(), id);
  const { b, t } = await teksPermintaan();
  if (!nomor) return nomorTidakAda(t);
  try {
    await hubungkan(nomor.sesi);
    return { ok: true };
  } catch (e) {
    return { ok: false, pesan: pesanGalat(e, b) };
  }
}

export async function kodePairingWaAction(id: number, telepon: string): Promise<Hasil & { kode?: string }> {
  const nomor = await nomorUntuk(await requireUser(), id);
  const { b, t } = await teksPermintaan();
  if (!nomor) return nomorTidakAda(t);
  try {
    const kode = await mintaKodePairing(nomor.sesi, telepon);
    return { ok: true, kode };
  } catch (e) {
    return { ok: false, pesan: pesanGalat(e, b) };
  }
}

export async function logoutWaAction(id: number): Promise<Hasil> {
  const nomor = await nomorUntuk(await requireUser(), id);
  const { b, t } = await teksPermintaan();
  if (!nomor) return nomorTidakAda(t);
  try {
    await logout(nomor.sesi);
    return { ok: true };
  } catch (e) {
    return { ok: false, pesan: pesanGalat(e, b) };
  }
}

// ---------- Nomor ----------

// Tiap nomor terhubung = satu soket WebSocket di proses ini; batas total server ini hanya pengaman memori.
const MAKS_NOMOR = Math.max(1, Number(process.env.MAKS_NOMOR) || 250);

/** Tambah nomor (dalam kuota akun): buat jalurnya, nyalakan sesi WhatsApp-nya, lalu buka halamannya (QR langsung tampil). */
export async function tambahNomorAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const user = await requireUser();
  const { t, href } = await teksPermintaan();
  const label = String(form.get("label") ?? "").trim().slice(0, 60);
  if (!label) return { ok: false, pesan: t("Nama nomor wajib diisi.", "Number name is required.") };
  const kuota = await kuotaNomor(user);
  if (kuota !== null && (await nomorMilik(user.id)).length >= kuota)
    return {
      ok: false,
      pesan:
        kuota === 0
          ? t("Akun Anda belum diberi kuota nomor. Hubungi admin.", "Your account doesn't have a number quota yet. Please contact the admin.")
          : t(
              `Kuota akun Anda ${kuota} nomor. Hubungi admin untuk menambah kuota.`,
              `Your account quota is ${kuota} ${kuota === 1 ? "number" : "numbers"}. Contact the admin to increase it.`
            ),
    };
  if ((await semuaNomor()).length >= MAKS_NOMOR)
    return { ok: false, pesan: t("Kapasitas server sedang penuh. Coba lagi nanti atau hubungi admin.", "The server is at capacity right now. Try again later or contact the admin.") };
  const nomor = await tambahNomor(label, user.id);
  // Gagal menyalakan sesi tidak membatalkan pembuatan: tombol "Hubungkan" di halamannya bisa mengulang.
  await hubungkan(nomor.sesi).catch(() => {});
  // "layout": daftar nomor di sidebar ikut diperbarui, bukan hanya halamannya.
  revalidatePath("/", "layout");
  redirect(href(`/nomor/${nomor.id}`));
}

export async function ubahNomorAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const user = await requireUser();
  const id = Number(form.get("id"));
  const label = String(form.get("label") ?? "").trim().slice(0, 60);
  const instruksi = String(form.get("instruksi") ?? "").trim().slice(0, 2000);
  const { t } = await teksPermintaan();
  if (!(await nomorUntuk(user, id))) return nomorTidakAda(t);
  if (!label) return { ok: false, pesan: t("Nama nomor wajib diisi.", "Number name is required.") };
  const tungguDetik = Math.round(Number(form.get("tunggu_detik")));
  const tungguBacaDetik = Math.round(Number(form.get("tunggu_baca_detik")));
  // Lama AI diam diisi dengan satuan pilihan (detik/menit), disimpan dalam detik.
  const jedaNilai = Math.round(Number(form.get("jeda_nilai")));
  const jedaDetik = form.get("jeda_satuan") === "detik" ? jedaNilai : jedaNilai * 60;
  if (!(tungguDetik >= BATAS_TUNGGU_DETIK.min && tungguDetik <= BATAS_TUNGGU_DETIK.maks))
    return {
      ok: false,
      pesan: t(
        `Waktu tunggu harus ${BATAS_TUNGGU_DETIK.min}–${BATAS_TUNGGU_DETIK.maks} detik.`,
        `Wait time must be ${BATAS_TUNGGU_DETIK.min}–${BATAS_TUNGGU_DETIK.maks} seconds.`
      ),
    };
  if (!(tungguBacaDetik >= BATAS_TUNGGU_BACA_DETIK.min && tungguBacaDetik <= BATAS_TUNGGU_BACA_DETIK.maks))
    return {
      ok: false,
      pesan: t(
        `Waktu setelah chat dibuka harus ${BATAS_TUNGGU_BACA_DETIK.min}–${BATAS_TUNGGU_BACA_DETIK.maks} detik.`,
        `Wait time after the chat is opened must be ${BATAS_TUNGGU_BACA_DETIK.min}–${BATAS_TUNGGU_BACA_DETIK.maks} seconds.`
      ),
    };
  if (!(jedaDetik >= BATAS_JEDA_DETIK.min && jedaDetik <= BATAS_JEDA_DETIK.maks))
    return {
      ok: false,
      pesan: t(
        "Lama AI diam harus 0 sampai 24 jam (1.440 menit atau 86.400 detik).",
        "AI pause must be between 0 and 24 hours (1,440 minutes or 86,400 seconds)."
      ),
    };
  await ubahNomor(id, { label, instruksi, tungguDetik, tungguBacaDetik, jedaDetik });
  revalidatePath("/", "layout"); // nama nomor juga tampil di sidebar
  return { ok: true, pesan: t("Tersimpan.", "Saved.") };
}

export async function setBotAktifAction(id: number, aktif: boolean): Promise<Hasil> {
  const nomor = await nomorUntuk(await requireUser(), id);
  const { t } = await teksPermintaan();
  if (!nomor) return nomorTidakAda(t);
  // Aturan pakai: balasan otomatis hanya bisa dinyalakan setelah product knowledge diisi.
  if (aktif && !(await adaKnowledge(id))) {
    return { ok: false, pesan: t("Isi product knowledge dulu supaya AI tahu apa yang harus dijawab.", "Add your product knowledge first so the AI knows what to answer.") };
  }
  await setBotAktif(id, aktif);
  revalidatePath("/dashboard");
  revalidatePath(`/nomor/${id}`);
  return { ok: true };
}

/** Sinkron data kasir Suka Shawarma: fitur internal, khusus admin. */
export async function setSinkronAction(id: number, aktif: boolean): Promise<Hasil> {
  if (!(await nomorUntuk(await requireAdmin(), id))) return { ok: false, pesan: "Nomor tidak ditemukan." };
  if (!konfigurasiSinkron()) return { ok: false, pesan: "Sinkron belum dikonfigurasi di server." };
  await setNomorSinkron(id, aktif);
  const s = await statusSinkron();
  revalidatePath("/dashboard");
  revalidatePath(`/nomor/${id}`);
  return aktif && s.galat ? { ok: false, pesan: `Gagal mengambil data: ${s.galat}` } : { ok: true };
}

/** Data sistem ChatGerCep (paket, harga, komisi, metode bayar, fitur) sebagai knowledge otomatis: khusus admin. */
export async function setSinkronCgAction(id: number, aktif: boolean): Promise<Hasil> {
  if (!(await nomorUntuk(await requireAdmin(), id))) return { ok: false, pesan: "Nomor tidak ditemukan." };
  await setNomorSinkronCg(id, aktif);
  const s = await statusSinkronCg();
  revalidatePath("/dashboard");
  revalidatePath(`/nomor/${id}`);
  return aktif && s.galat ? { ok: false, pesan: `Gagal menyusun data: ${s.galat}` } : { ok: true };
}

export async function hapusNomorAction(id: number): Promise<Hasil> {
  const nomor = await nomorUntuk(await requireUser(), id);
  const { b, t, href } = await teksPermintaan();
  if (!nomor) return nomorTidakAda(t);
  // Sesi WhatsApp-nya ikut dihapus (perangkat tertaut dicabut). Bila itu gagal, nomor tidak dihapus
  // supaya tidak tertinggal sesi yatim yang masih terhubung ke WhatsApp.
  try {
    await hapusSesi(nomor.sesi);
  } catch (e) {
    return { ok: false, pesan: pesanGalat(e, b) };
  }
  await hapusNomor(id);
  revalidatePath("/", "layout");
  redirect(href("/dashboard"));
}

// ---------- Katalog produk (tambah/ubah lewat /api/katalog karena membawa foto) ----------

async function produkMilik(numberId: number, tulis: boolean): Promise<{ id: number } | null> {
  const user = await requireUser();
  const nomor = await nomorUntuk(user, numberId);
  if (!nomor) return null;
  if (tulis && user.peran !== "admin" && !(await katalogBoleh(nomor.user_id))) return null;
  return { id: nomor.id };
}

const katalogTerkunci = (t: T): Hasil => ({ ok: false, pesan: t("Katalog tidak bisa diubah.", "The catalog can't be changed.") });

export async function hapusProdukAction(numberId: number, id: number): Promise<Hasil> {
  const n = await produkMilik(numberId, false); // menghapus tetap boleh walau paket sudah habis
  const { t } = await teksPermintaan();
  if (!n || !Number.isInteger(id)) return { ok: false, pesan: t("Produk tidak ditemukan.", "Product not found.") };
  await hapusProduk(n.id, id);
  revalidatePath(`/nomor/${n.id}`);
  return { ok: true, pesan: t("Produk dihapus.", "Product deleted.") };
}

export async function tersediaProdukAction(numberId: number, id: number, tersedia: boolean): Promise<Hasil> {
  const n = await produkMilik(numberId, true);
  if (!n || !Number.isInteger(id)) return katalogTerkunci((await teksPermintaan()).t);
  await setTersedia(n.id, id, tersedia);
  revalidatePath(`/nomor/${n.id}`);
  return { ok: true };
}

export async function geserProdukAction(numberId: number, id: number, arah: -1 | 1): Promise<Hasil> {
  const n = await produkMilik(numberId, true);
  if (!n || !Number.isInteger(id) || (arah !== -1 && arah !== 1)) return katalogTerkunci((await teksPermintaan()).t);
  await geserProduk(n.id, id, arah);
  revalidatePath(`/nomor/${n.id}`);
  return { ok: true };
}

// ---------- Base knowledge ----------

export async function tambahTeksAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const numberId = Number(form.get("number_id"));
  const user = await requireUser();
  const { b, t } = await teksPermintaan();
  if (!(await nomorUntuk(user, numberId))) return nomorTidakAda(t);
  const judul = String(form.get("judul") ?? "").trim();
  if (!judul) return { ok: false, pesan: t("Judul wajib diisi.", "Title is required.") };
  // `ganti_id`: dokumen lama yang disempurnakan; dihapus setelah versi barunya tersimpan (tidak pernah keduanya hilang).
  const gantiId = Number(form.get("ganti_id"));
  try {
    await tambahDokumen({ numberId, judul, sumber: "teks", teks: String(form.get("isi") ?? "") });
    if (Number.isInteger(gantiId) && gantiId > 0) await hapusDokumen(gantiId, numberId, user.peran === "admin");
  } catch (e) {
    return { ok: false, pesan: pesanGalat(e, b) };
  }
  revalidatePath("/dashboard");
  revalidatePath(`/nomor/${numberId}`);
  return { ok: true, pesan: gantiId > 0 ? t("Dokumen diperbarui.", "Document updated.") : t("Tersimpan ke base knowledge.", "Saved to product knowledge.") };
}

export async function hapusDokumenAction(id: number, numberId: number): Promise<Hasil> {
  const user = await requireUser();
  if (!(await nomorUntuk(user, numberId))) return nomorTidakAda((await teksPermintaan()).t);
  await hapusDokumen(id, numberId, user.peran === "admin");
  revalidatePath("/dashboard");
  revalidatePath(`/nomor/${numberId}`);
  return { ok: true };
}

// ---------- Histori percakapan ----------

/** Hapus satu percakapan (`percakapanId`) atau seluruh histori percakapan sebuah nomor. */
export async function hapusPercakapanAction(numberId: number, percakapanId?: number): Promise<Hasil> {
  const user = await requireUser();
  const { t } = await teksPermintaan();
  if (!(await nomorUntuk(user, numberId))) return nomorTidakAda(t);
  if (percakapanId !== undefined && !Number.isInteger(percakapanId)) return percakapanTidakSah(t);
  const n = await hapusPercakapan(numberId, percakapanId);
  revalidatePath("/dashboard");
  revalidatePath(`/nomor/${numberId}`);
  return { ok: true, pesan: t(`${n} percakapan dihapus.`, `${n} ${n === 1 ? "conversation" : "conversations"} deleted.`) };
}

/** Pemilik menandai sebuah chat "bukan spam": AI tidak menyaring chat itu lagi (berlaku di pesan berikutnya). */
export async function bukanSpamAction(numberId: number, percakapanId: number): Promise<Hasil> {
  const user = await requireUser();
  const { t } = await teksPermintaan();
  if (!(await nomorUntuk(user, numberId))) return nomorTidakAda(t);
  if (!Number.isInteger(percakapanId)) return percakapanTidakSah(t);
  if (!(await tandaiBukanSpam(numberId, percakapanId))) return { ok: false, pesan: t("Percakapan tidak ditemukan.", "Conversation not found.") };
  return { ok: true, pesan: t("Ditandai bukan spam. Pesan berikutnya dari kontak ini dijawab AI seperti biasa.", "Marked as not spam. The AI will reply to this contact's next messages as usual.") };
}

/** Chat yang dibisukan penyaring prospek dilayani AI lagi mulai pesan berikutnya (opsional; penyaring belajar dari ini). */
export async function bangunkanChatAction(numberId: number, percakapanId: number): Promise<Hasil> {
  const user = await requireUser();
  const { t } = await teksPermintaan();
  if (!(await nomorUntuk(user, numberId))) return nomorTidakAda(t);
  if (!Number.isInteger(percakapanId)) return percakapanTidakSah(t);
  const kunci = await kunciPercakapan(numberId, percakapanId);
  if (!kunci) return { ok: false, pesan: t("Percakapan tidak ditemukan.", "Conversation not found.") };
  await bangunkanChat(numberId, kunci);
  return { ok: true, pesan: t("Pesan berikutnya dari kontak ini dijawab AI lagi.", "The AI will reply to this contact's next messages again.") };
}

export async function setSaringProspekAction(id: number, aktif: boolean): Promise<Hasil> {
  if (!(await nomorUntuk(await requireUser(), id))) return nomorTidakAda((await teksPermintaan()).t);
  await setSaringProspek(id, aktif);
  revalidatePath(`/nomor/${id}`);
  return { ok: true };
}

export async function setSaringSpamAction(id: number, aktif: boolean): Promise<Hasil> {
  if (!(await nomorUntuk(await requireUser(), id))) return nomorTidakAda((await teksPermintaan()).t);
  await setSaringSpam(id, aktif);
  revalidatePath(`/nomor/${id}`);
  return { ok: true };
}

// ---------- Belajar dari balasan manusia ----------

export async function setBelajarAction(id: number, aktif: boolean): Promise<Hasil> {
  if (!(await nomorUntuk(await requireUser(), id))) return nomorTidakAda((await teksPermintaan()).t);
  await setBelajar(id, aktif);
  revalidatePath(`/nomor/${id}`);
  return { ok: true };
}

/** Halaman berikutnya daftar pelajaran (kursor dari baris terakhir yang sudah tampil). */
export async function muatPelajaranAction(numberId: number, waktu: number, id: number): Promise<{ daftar: ItemPelajaran[]; adaLagi: boolean }> {
  if (!(await nomorUntuk(await requireUser(), numberId)) || !Number.isInteger(waktu) || !Number.isInteger(id)) return { daftar: [], adaLagi: false };
  return daftarPelajaran(numberId, { waktu, id });
}

/** Hapus satu pelajaran (`id`) atau semua pelajaran sebuah nomor. */
export async function hapusPelajaranAction(numberId: number, id?: number): Promise<Hasil> {
  const user = await requireUser();
  const { t } = await teksPermintaan();
  if (!(await nomorUntuk(user, numberId))) return nomorTidakAda(t);
  if (id !== undefined && !Number.isInteger(id)) return { ok: false, pesan: t("Data tidak valid.", "Invalid data.") };
  const n = await hapusPelajaran(numberId, id);
  revalidatePath(`/nomor/${numberId}`);
  return { ok: true, pesan: t(`${n} pelajaran dihapus.`, `${n} ${n === 1 ? "lesson" : "lessons"} deleted.`) };
}

export async function pratinjauAction(id: number, numberId: number): Promise<string | null> {
  const user = await requireUser();
  if (!(await nomorUntuk(user, numberId))) return null;
  return pratinjauDokumen(id, numberId, user.peran === "admin");
}

// ---------- Admin ----------

export interface HasilReset extends Hasil {
  password?: string;
}

const idSah = (v: unknown): number | null => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);

async function jalankanAdmin(fn: () => Promise<string | void>, ...jalur: string[]): Promise<Hasil> {
  try {
    const pesan = await fn();
    for (const j of jalur) revalidatePath(j);
    return { ok: true, pesan: pesan || "Tersimpan." };
  } catch (e) {
    return { ok: false, pesan: pesanGalat(e) };
  }
}

export async function adminKuotaAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const admin = await requireAdmin();
  const id = idSah(form.get("id"));
  const mentah = String(form.get("kuota") ?? "").trim();
  const kuota = mentah === "" ? null : Number(mentah);
  if (!id) return { ok: false, pesan: "Pengguna tidak valid." };
  if (kuota !== null && !(Number.isInteger(kuota) && kuota >= 0 && kuota <= 100)) return { ok: false, pesan: "Kuota harus 0–100 nomor (kosongkan = kuota bawaan)." };
  return jalankanAdmin(() => setKuota(admin, id, kuota), `/admin/pengguna/${id}`, "/admin");
}

export async function adminBonusKuotaAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const admin = await requireAdmin();
  const id = idSah(form.get("id"));
  const jumlah = Number(String(form.get("jumlah") ?? "").replace(/[.,\s]/g, ""));
  if (!id) return { ok: false, pesan: "Pengguna tidak valid." };
  return jalankanAdmin(
    async () => {
      await beriBonusKuota(admin, id, jumlah, String(form.get("catatan") ?? ""));
      return `Bonus ${jumlah.toLocaleString("id-ID")} balasan AI diberikan. Pengguna mendapat notifikasi.`;
    },
    `/admin/pengguna/${id}`,
    "/admin",
  );
}

export async function adminAiAkunAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const admin = await requireAdmin();
  const id = idSah(form.get("id"));
  if (!id) return { ok: false, pesan: "Pengguna tidak valid." };
  const dipilih = form.get("penyedia");
  const penyedia = dipilih === "hermes" || dipilih === "anthropic" ? dipilih : null;
  if (penyedia === "anthropic" && !kunciAnthropic()) return { ok: false, pesan: "API key Anthropic belum dipasang developer di server (ANTHROPIC_API_KEY)." };
  return jalankanAdmin(async () => {
    await setAiAkun(admin, id, penyedia);
    return penyedia === null
      ? "Akun ini kembali ikut pengaturan Mesin AI."
      : `Semua nomor akun ini kini dijawab ${penyedia === "anthropic" ? "Claude API (cadangan Hermes)" : "Hermes"}.`;
  }, `/admin/pengguna/${id}`, "/admin/pengguna");
}

export async function adminPeranAction(id: number, peran: "admin" | "user"): Promise<Hasil> {
  const admin = await requireAdmin();
  if (!idSah(id) || (peran !== "admin" && peran !== "user")) return { ok: false, pesan: "Data tidak valid." };
  return jalankanAdmin(() => setPeran(admin, id, peran), `/admin/pengguna/${id}`, "/admin");
}

export async function adminBlokirAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const admin = await requireAdmin();
  const id = idSah(form.get("id"));
  if (!id) return { ok: false, pesan: "Pengguna tidak valid." };
  const blokir = form.get("blokir") === "1";
  const alasan = String(form.get("alasan") ?? "").trim().slice(0, 200);
  return jalankanAdmin(async () => {
    await setBlokir(admin, id, blokir, alasan);
    return blokir ? "Akun diblokir: sesi login dicabut dan AI berhenti membalas di nomornya." : "Blokir dibuka.";
  }, `/admin/pengguna/${id}`, "/admin");
}

export async function adminResetPasswordAction(id: number): Promise<HasilReset> {
  const admin = await requireAdmin();
  if (!idSah(id)) return { ok: false, pesan: "Pengguna tidak valid." };
  try {
    return { ok: true, password: await resetPassword(admin, id) };
  } catch (e) {
    return { ok: false, pesan: pesanGalat(e) };
  }
}

export async function adminCabutSesiAction(id: number): Promise<Hasil> {
  const admin = await requireAdmin();
  if (!idSah(id)) return { ok: false, pesan: "Pengguna tidak valid." };
  return jalankanAdmin(async () => {
    await cabutSesi(id, admin);
    return "Semua sesi login pengguna ini dicabut.";
  }, `/admin/pengguna/${id}`);
}

/** Putuskan semua WhatsApp milik pengguna (perangkat tertaut dicabut); nomornya tetap ada. */
export async function adminPutuskanWaAction(id: number): Promise<Hasil> {
  const admin = await requireAdmin();
  const u = idSah(id) ? await penggunaById(id) : undefined;
  if (!u) return { ok: false, pesan: "Pengguna tidak ditemukan." };
  return jalankanAdmin(async () => {
    const daftar = await nomorMilik(id);
    for (const n of daftar) await logout(n.sesi);
    await catatLog(admin, "putuskan WhatsApp", u.email, `${daftar.length} nomor`);
    return `${daftar.length} nomor diputuskan dari WhatsApp.`;
  }, `/admin/pengguna/${id}`);
}

export async function adminHapusAction(id: number, konfirmasi?: string, alihkan = true): Promise<Hasil> {
  const admin = await requireAdmin();
  const u = idSah(id) ? await penggunaById(id) : undefined;
  if (!u) return { ok: false, pesan: "Pengguna tidak ditemukan." };
  if (konfirmasi !== undefined && konfirmasi.trim().toLowerCase() !== u.email) return { ok: false, pesan: "Ketik email pengguna persis untuk konfirmasi." };
  if (u.id === admin.id) return { ok: false, pesan: "Anda tidak bisa menghapus akun Anda sendiri." };
  try {
    // Sesi WhatsApp tiap nomor dicabut dulu; bila satu gagal, akun tidak dihapus (tidak ada sesi yatim).
    for (const n of await nomorMilik(id)) await hapusSesi(n.sesi);
    await hapusPengguna(admin, id);
  } catch (e) {
    return { ok: false, pesan: pesanGalat(e) };
  }
  revalidatePath("/admin", "layout");
  revalidatePath("/admin/pengguna");
  if (alihkan) redirect("/admin/pengguna");
  return { ok: true, pesan: `Pengguna ${u.email} berhasil dihapus.` };
}

export async function adminBuatAkunAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const admin = await requireAdmin();
  const nama = String(form.get("nama") ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  const email = normalkanEmail(String(form.get("email") ?? ""));
  const password = String(form.get("password") ?? "");
  const peran = form.get("peran") === "admin" ? "admin" : "user";
  const kuotaMentah = String(form.get("kuota") ?? "").trim();
  const kuota = kuotaMentah === "" ? null : Number(kuotaMentah);
  if (nama.length < 2) return { ok: false, pesan: "Nama minimal 2 huruf." };
  if (!email) return { ok: false, pesan: "Email tidak valid." };
  const lemah = cekPassword(password, email);
  if (lemah) return { ok: false, pesan: lemah };
  if (kuota !== null && !(Number.isInteger(kuota) && kuota >= 0 && kuota <= 100)) return { ok: false, pesan: "Kuota harus 0–100 nomor." };
  const akun = await buatAkun({ email, nama, password, peran, kuota });
  if (!akun) return { ok: false, pesan: "Email ini sudah terdaftar." };
  await catatLog(admin, "buat akun", email, peran === "admin" ? "sebagai admin" : undefined);
  revalidatePath("/admin", "layout");
  return { ok: true, pesan: `Akun ${email} dibuat.` };
}

export async function adminPengaturanAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const admin = await requireAdmin();
  const buka = form.get("pendaftaran") === "on";
  const kuota = Number(form.get("kuota_bawaan"));
  const balasanTeks = String(form.get("kuota_percobaan") ?? "").trim();
  const balasan = balasanTeks === "" ? NaN : Number(balasanTeks);
  const ulang = form.get("kuota_percobaan_ulang") === "bulanan" ? "bulanan" : "sekali";
  const hariTeks = String(form.get("kuota_percobaan_hari") ?? "").trim();
  const hari = hariTeks === "" ? NaN : Number(hariTeks);
  if (!(Number.isInteger(kuota) && kuota >= 0 && kuota <= 100)) return { ok: false, pesan: "Kuota bawaan harus 0–100 nomor." };
  if (!(Number.isInteger(balasan) && balasan >= 0 && balasan <= 1_000_000)) return { ok: false, pesan: "Kuota balasan gratis harus angka bulat 0–1.000.000." };
  if (!(Number.isInteger(hari) && hari >= 0 && hari <= 365)) return { ok: false, pesan: "Masa percobaan harus 0–365 hari." };
  await setSetting("pendaftaran", buka ? "buka" : "tutup");
  await setSetting("kuota_bawaan", String(kuota));
  await setSetting("kuota_percobaan", String(balasan));
  await setSetting("kuota_percobaan_ulang", ulang);
  await setSetting("kuota_percobaan_hari", String(hari));
  segarkanKuota();
  mintaSinkronCg();
  await catatLog(
    admin,
    "ubah pengaturan",
    null,
    `pendaftaran ${buka ? "dibuka" : "ditutup"}, kuota gratis ${kuota} nomor & ${balasan} balasan ${ulang === "sekali" ? `sekali (free trial${hari > 0 ? ` ${hari} hari` : ", tanpa batas waktu"})` : "per bulan"}`
  );
  revalidatePath("/admin", "layout");
  return { ok: true, pesan: "Pengaturan tersimpan." };
}

/** Aturan sistem (src/lib/aturan.ts): batas laju, panjang balasan, peringatan kuota, aturan global semua bot. */
export async function adminAturanAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const admin = await requireAdmin();
  const nilai: [string, string][] = [];
  for (const [k, a] of Object.entries(ATURAN_ANGKA)) {
    const v = Number(form.get(k));
    if (!(Number.isInteger(v) && v >= a.min && v <= a.max)) return { ok: false, pesan: `${a.label}: harus ${a.min}–${a.max} ${a.satuan}.` };
    nilai.push([k, String(v)]);
  }
  const global = String(form.get("aturan_global") ?? "").replace(/\r\n/g, "\n").trim();
  if (global.length > MAKS_ATURAN_GLOBAL) return { ok: false, pesan: `Aturan untuk semua bot maksimal ${MAKS_ATURAN_GLOBAL.toLocaleString("id-ID")} karakter.` };
  nilai.push(["aturan_global", global]);
  for (const [k, v] of nilai) await setSetting(k, v);
  await catatLog(admin, "ubah aturan sistem", null, nilai.filter(([k]) => k !== "aturan_global").map(([k, v]) => `${k}=${v}`).join(", ") + `, aturan global ${global.length} karakter`);
  revalidatePath("/admin", "layout");
  revalidatePath("/", "layout");
  return { ok: true, pesan: "Aturan tersimpan dan langsung berlaku untuk semua bot." };
}

/** Penyedia & model AI untuk semua nomor. Berlaku langsung (dibaca tiap giliran), tanpa restart/deploy. */
export async function adminAiAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const admin = await requireAdmin();
  const dipilih = form.get("penyedia");
  const penyedia = dipilih === "anthropic" || dipilih === "per_paket" ? dipilih : "hermes";
  const model = String(form.get("model") ?? "").trim();
  const cadangan = String(form.get("cadangan") ?? "").trim();
  const sah = /^claude-[a-z0-9.-]+$/i;
  if (penyedia !== "hermes" && !kunciAnthropic()) return { ok: false, pesan: "API key Anthropic belum dipasang developer di server (ANTHROPIC_API_KEY)." };
  if (!sah.test(model) || (cadangan && !sah.test(cadangan))) return { ok: false, pesan: "Nama model tidak valid (contoh: claude-haiku-5-5)." };
  await setSetting("ai_penyedia", penyedia);
  await setSetting("ai_model", model);
  await setSetting("ai_cadangan", cadangan);
  const rincian = `${model}${cadangan ? ` (cadangan ${cadangan})` : ""}`;
  await catatLog(admin, "ubah mesin AI", null, penyedia === "hermes" ? "hermes" : penyedia === "anthropic" ? `anthropic · ${rincian}` : `per paket: gratis hermes, berbayar ${rincian}, lalu hermes`);
  revalidatePath("/admin", "layout");
  return {
    ok: true,
    pesan:
      penyedia === "anthropic"
        ? `Semua nomor kini memakai Claude API (${model}).`
        : penyedia === "per_paket"
          ? `Akun gratis memakai Hermes; akun berbayar memakai Claude API (${model}), cadangan Hermes.`
          : "Semua nomor kini memakai Hermes.",
  };
}


// ---------- Tur panduan ----------

const TUR_SAH = new Set(["dashboard", "nomor"]);

export async function selesaiTurAction(nama: string): Promise<void> {
  const user = await requireUser();
  if (!TUR_SAH.has(nama)) return;
  await tandaiTurSelesai(user.id, nama);
}

// ---------- Langganan & pembayaran ----------

/**
 * Buat tagihan paket lewat Midtrans Core API dengan kanal pilihan pelanggan; browser lalu dibawa ke halaman instruksi
 * bayar kita sendiri. Klik ganda / tagihan yang sama yang masih berlaku = order_id yang sama (tanpa charge baru).
 */
/** `kanalMati`: kanal yang baru ketahuan belum aktif; browser menghapusnya dari pilihan. */
export async function bayarPaketAction(paketId: number, kanal: string): Promise<Hasil & { orderId?: string; kanalMati?: KanalBayar }> {
  const user = await requireUser();
  const { b, t } = await teksPermintaan();
  if (terlaluSering(`bayar:${user.id}`, 10, 10 * 60_000)) return terlaluBanyak(t);
  const k = await konfigMidtrans();
  if (!k) return { ok: false, pesan: t("Pembayaran belum diaktifkan admin.", "Payments haven't been enabled by the admin yet.") };
  const tidakTersedia = t("Metode pembayaran ini sedang tidak tersedia. Pilih metode lain.", "This payment method isn't available right now. Please choose another one.");
  if (!kanalSah(kanal)) return { ok: false, pesan: tidakTersedia };
  if (!(await kanalAktif()).includes(kanal)) return { ok: false, pesan: tidakTersedia, kanalMati: kanal };
  const paket = Number.isInteger(paketId) ? await paketById(paketId) : undefined;
  if (!paket || !paket.aktif || paket.harga < 1) return { ok: false, pesan: t("Paket tidak ditemukan.", "Plan not found.") };
  try {
    const h = await mulaiBayar(k, user, paket, kanal, await asalAplikasi());
    if (h.baru) {
      void kirimCapiEvent({
        kunci: "initiate_checkout",
        email: user.email,
        customData: { value: paket.harga, currency: "IDR", content_name: paket.nama, num_items: 1 },
      });
      revalidatePath("/langganan");
    }
    return { ok: true, orderId: h.orderId };
  } catch (e) {
    console.error(`[bayar] gagal membuat tagihan user=${user.id} kanal=${kanal}: ${e instanceof Error ? e.message : e}`);
    if (e instanceof MidtransError && kanalBelumAktif(e.kode)) {
      revalidatePath("/langganan", "layout");
      mintaSinkronCg(); // metode bayar yang disebut bot ChatGerCep ikut diperbarui
      const label = labelKanal(kanal, b);
      return { ok: false, pesan: t(`${label} belum tersedia. Pilih metode pembayaran lain.`, `${label} isn't available yet. Please choose another payment method.`), kanalMati: kanal };
    }
    return {
      ok: false,
      pesan:
        e instanceof MidtransError
          ? t("Tagihan sedang tidak bisa dibuat. Coba lagi sebentar lagi atau pilih metode lain.", "The invoice can't be created right now. Try again shortly or choose another method.")
          : pesanGalat(null, b),
    };
  }
}

/** Admin menampilkan/menyembunyikan satu metode pembayaran di halaman bayar (juga kanal yang tersembunyi otomatis). */
export async function setKanalTampilAction(kanal: string, tampil: boolean): Promise<Hasil> {
  const admin = await requireAdmin();
  if (!kanalSah(kanal)) return { ok: false, pesan: "Metode pembayaran tidak dikenal." };
  await setKanalMati(kanal, tampil ? null : { oleh: "admin", waktu: sekarang() });
  await catatLog(admin, tampil ? "tampilkan metode bayar" : "sembunyikan metode bayar", null, KANAL_BAYAR[kanal].label);
  revalidatePath("/admin/transaksi");
  revalidatePath("/langganan", "layout");
  mintaSinkronCg();
  return { ok: true };
}

/** Pelanggan membatalkan tagihannya yang belum dibayar. */
export async function batalBayarAction(orderId: string): Promise<Hasil & { status?: string }> {
  const user = await requireUser();
  const { t } = await teksPermintaan();
  const tidakAda = t("Tagihan tidak ditemukan.", "Invoice not found.");
  const k = await konfigMidtrans();
  if (!k || !ORDER_SAH.test(orderId)) return { ok: false, pesan: tidakAda };
  try {
    const status = await batalkanBayar(k, user.id, orderId);
    if (!status) return { ok: false, pesan: tidakAda };
    revalidatePath("/langganan");
    return status === "dibatalkan"
      ? { ok: true, status }
      : {
          ok: false,
          status,
          pesan: status === "lunas" ? t("Tagihan ini sudah dibayar.", "This invoice has already been paid.") : t("Tagihan ini sudah tidak bisa dibatalkan.", "This invoice can no longer be canceled."),
        };
  } catch {
    return { ok: false, pesan: t("Tagihan belum bisa dibatalkan. Coba lagi sebentar lagi.", "The invoice can't be canceled yet. Please try again shortly.") };
  }
}

// ---------- Admin: paket, langganan, Midtrans ----------

export async function adminPaketAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const admin = await requireAdmin();
  const id = idSah(form.get("id")) ?? undefined;
  const angkaForm = (k: string) => Number(String(form.get(k) ?? "").replace(/[^\d]/g, ""));
  const nama = String(form.get("nama") ?? "").trim().slice(0, 40);
  const komisiJenis: JenisKomisi = form.get("komisi_jenis") === "rupiah" ? "rupiah" : "persen";
  const komisiNilai = form.get("komisi_nilai") !== null ? angkaForm("komisi_nilai") : 20;
  const p = {
    id,
    kode: (String(form.get("kode") ?? "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "") || nama.toLowerCase().replace(/[^a-z0-9]+/g, "-")).slice(0, 30),
    nama,
    harga: angkaForm("harga"),
    durasi_hari: angkaForm("durasi_hari"),
    kuota_nomor: angkaForm("kuota_nomor"),
    kuota_balasan: angkaForm("kuota_balasan"),
    deskripsi: String(form.get("deskripsi") ?? "").trim().slice(0, 200),
    aktif: form.get("aktif") === "on",
    unggulan: form.get("unggulan") === "on",
    urutan: angkaForm("urutan"),
    komisi_jenis: komisiJenis,
    komisi_nilai: komisiNilai,
  };
  if (nama.length < 2) return { ok: false, pesan: "Nama paket wajib diisi." };
  // Harga bebas diatur admin; hanya dijaga agar muat di kolom database. 0 = paket yang hanya diberikan admin (tidak dijual).
  if (p.harga > MAKS_HARGA_PAKET) return { ok: false, pesan: `Harga maksimal Rp${MAKS_HARGA_PAKET.toLocaleString("id-ID")}.` };
  if (!(p.durasi_hari >= 1 && p.durasi_hari <= 3660)) return { ok: false, pesan: "Durasi 1–3660 hari." };
  if (p.kuota_nomor > 1000 || p.kuota_balasan > 10_000_000) return { ok: false, pesan: "Kuota terlalu besar." };
  if (komisiJenis === "persen" && komisiNilai > 100) return { ok: false, pesan: "Komisi persentase harus 0–100%." };
  if (komisiJenis === "rupiah" && komisiNilai > MAKS_HARGA_PAKET) return { ok: false, pesan: "Nominal komisi terlalu besar." };
  try {
    await simpanPaket(p);
    mintaSinkronCg();
  } catch {
    return { ok: false, pesan: "Kode paket sudah dipakai paket lain." };
  }
  await catatLog(admin, id ? "ubah paket" : "buat paket", null, `${nama} · Rp${p.harga.toLocaleString("id-ID")} · ${p.kuota_nomor} nomor · ${p.kuota_balasan} balasan · komisi ${labelKomisiPaket(komisiJenis, komisiNilai, p.harga)}`);
  revalidatePath("/admin", "layout");
  revalidatePath("/langganan");
  revalidatePath("/afiliasi");
  revalidatePath("/program-afiliasi");
  revalidatePath("/");
  return { ok: true, pesan: id ? "Paket diperbarui." : "Paket dibuat." };
}

export async function adminHapusPaketAction(id: number): Promise<Hasil> {
  const admin = await requireAdmin();
  if (!idSah(id)) return { ok: false, pesan: "Paket tidak valid." };
  const dihapus = await hapusPaket(id);
  mintaSinkronCg();
  if (!dihapus) return { ok: false, pesan: "Paket tidak ditemukan." };
  await catatLog(admin, "hapus paket", null, `${dihapus.nama} (Rp${dihapus.harga.toLocaleString("id-ID")})`);
  revalidatePath("/admin", "layout");
  revalidatePath("/langganan");
  revalidatePath("/afiliasi");
  revalidatePath("/program-afiliasi");
  revalidatePath("/");
  return { ok: true, pesan: `Paket "${dihapus.nama}" dihapus.` };
}

/**
 * Paket Custom (Paket & harga): seluruh isian dikirim sebagai JSON di kolom "data". Nomor WhatsApp dirapikan di sini,
 * sisanya diperiksa periksaCustom; harga & jumlah nomor dihitung ulang di server (simpanPaketCustom).
 */
export async function adminPaketCustomAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const admin = await requireAdmin();
  let mentah: unknown;
  try {
    mentah = JSON.parse(String(form.get("data") ?? ""));
  } catch {
    return { ok: false, pesan: "Isian tidak terbaca. Muat ulang halaman lalu coba lagi." };
  }
  const o = mentah && typeof mentah === "object" ? { ...(mentah as Record<string, unknown>) } : {};
  const waMentah = typeof o.wa === "string" ? o.wa.trim().slice(0, 30) : "";
  const wa = waMentah ? rapikanNomorWa(waMentah) : "";
  if (wa === null) return { ok: false, pesan: "Nomor WhatsApp tidak valid. Contoh: 0812 3456 7890 atau +62 812 3456 7890." };
  const isian = periksaCustom({ ...o, wa });
  if (typeof isian === "string") return { ok: false, pesan: isian };
  let hasil;
  try {
    hasil = await simpanPaketCustom(isian);
    mintaSinkronCg();
  } catch (e) {
    if (e instanceof GalatCustom) return { ok: false, pesan: e.message };
    throw e;
  }
  const { p, h } = hasil;
  const marginTeks = h.rincian.margin === null ? "–" : `${Math.round(h.rincian.margin * 100)}%`;
  await catatLog(
    admin,
    "ubah paket custom",
    null,
    `${customTampil(p) ? "tampil" : "tidak tampil"} · ${ringkasCustom({ ...p, tampil_kuota: true, tampil_harga: "angka" })} · margin ${marginTeks} · harga ${p.harga_manual ? "sendiri" : "otomatis"} · kurs ${p.kurs} · ${p.aksi === "bayar" ? "bayar langsung" : "chat WhatsApp"}`
  );
  revalidatePath("/admin", "layout");
  revalidatePath("/langganan");
  revalidatePath("/");
  const tampil = customTampil(p) ? "Tampil di daftar harga." : p.aktif ? "Belum tampil: lengkapi tombolnya dulu." : "Belum ditampilkan di daftar harga.";
  const rugi = h.status === "rugi" ? " Perhatian: harga di bawah modal (rugi)." : "";
  return {
    ok: true,
    pesan: `Tersimpan: Rp${p.harga.toLocaleString("id-ID")} / ${p.durasi_hari} hari · ${p.kuota_balasan.toLocaleString("id-ID")} balasan · ${p.kuota_nomor.toLocaleString("id-ID")} nomor · margin ${marginTeks}. ${tampil}${rugi}`,
  };
}

/**
 * Admin mengaktifkan paket untuk satu akun (bayar di luar Midtrans atau kompensasi): paket terdaftar atau isi khusus
 * hasil kesepakatan, pembayarannya dicatat sebagai transaksi lunas, dan (opsional) pemilik akun dikabari lewat WhatsApp.
 */
export async function adminBerikanPaketAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const admin = await requireAdmin();
  const u = await (async () => {
    const id = idSah(form.get("id"));
    return id ? penggunaById(id) : undefined;
  })();
  if (!u) return { ok: false, pesan: "Pengguna tidak ditemukan." };
  const angkaForm = (k: string) => {
    const t = String(form.get(k) ?? "").replace(/\D/g, "");
    return t ? Number(t) : null;
  };
  const khusus = form.get("mode") === "khusus";
  const hari = angkaForm("hari");
  if (hari !== null && !(hari >= 1 && hari <= 3660)) return { ok: false, pesan: "Durasi 1–3660 hari." };
  let paketId: number | null = null;
  let isi: IsiKhusus | undefined;
  let namaPaket: string;
  if (khusus) {
    const nama = String(form.get("nama") ?? "").trim().slice(0, 60);
    const kuotaBalasan = angkaForm("kuota_balasan");
    const kuotaNomor = angkaForm("kuota_nomor");
    if (nama.length < 2) return { ok: false, pesan: "Nama paket khusus wajib diisi." };
    if (kuotaBalasan === null || kuotaBalasan < 1 || kuotaBalasan > 10_000_000) return { ok: false, pesan: "Kuota balasan AI 1–10.000.000." };
    if (kuotaNomor === null || kuotaNomor < 1 || kuotaNomor > 1000) return { ok: false, pesan: "Jumlah nomor 1–1.000." };
    if (hari === null) return { ok: false, pesan: "Isi durasi paket khusus." };
    isi = { nama, kuota_balasan: kuotaBalasan, kuota_nomor: kuotaNomor };
    namaPaket = nama;
  } else {
    const p = await paketById(idSah(form.get("paket")) ?? 0);
    if (!p) return { ok: false, pesan: "Pilih paket dulu." };
    paketId = p.id;
    namaPaket = p.nama;
  }
  const metode = String(form.get("metode") ?? "");
  if (!(metode in METODE_MANUAL)) return { ok: false, pesan: "Pilih cara bayar." };
  const jumlah = angkaForm("jumlah") ?? 0;
  if (metode !== "kompensasi" && !(jumlah >= 1 && jumlah <= MAKS_HARGA_PAKET)) return { ok: false, pesan: "Isi jumlah yang diterima (atau pilih Gratis / kompensasi)." };
  const catatan = String(form.get("catatan") ?? "").trim().slice(0, 300);

  const h = await berikanPaketManual(u.id, { paketId, isi, hari: hari ?? undefined, metode: metode as MetodeManual, jumlah, catatan });
  await catatLog(
    admin,
    h.diperpanjang ? "perpanjang paket" : "berikan paket",
    u.email,
    `${namaPaket}${isi ? " (isi khusus)" : ""} · ${h.kuota_balasan.toLocaleString("id-ID")} balasan · ${h.kuota_nomor} nomor · sampai ${tanggal(h.sampai)} · ${METODE_MANUAL[metode as MetodeManual]} Rp${h.jumlah.toLocaleString("id-ID")}${catatan ? ` · ${catatan}` : ""}`
  );
  revalidatePath(`/admin/pengguna/${u.id}`);
  revalidatePath("/admin/transaksi");
  return {
    ok: true,
    pesan: `${h.nama} ${h.diperpanjang ? "diperpanjang" : "aktif"} untuk ${u.email} sampai ${tanggal(h.sampai)}. Pembayaran tercatat (${h.orderId}).`,
  };
}

export async function adminHentikanLanggananAction(id: number): Promise<Hasil> {
  const admin = await requireAdmin();
  const u = idSah(id) ? await penggunaById(id) : undefined;
  if (!u) return { ok: false, pesan: "Pengguna tidak ditemukan." };
  await hentikanLangganan(u.id);
  await catatLog(admin, "hentikan langganan", u.email);
  revalidatePath(`/admin/pengguna/${u.id}`);
  return { ok: true, pesan: "Langganan dihentikan; akun kembali ke kuota gratis." };
}

/** Acuan harga & margin (simulasi di /admin). terapkan=1: harga semua paket berbayar dihitung ulang di server. */
export async function adminHargaAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const admin = await requireAdmin();
  const bulat = (k: string) => Number(form.get(k));
  const a = {
    margin: bulat("margin"),
    pemakaian: bulat("pemakaian"),
    metode: String(form.get("metode") ?? ""),
    biayaServerNomor: bulat("biaya_server"),
    kurs: await kursUsd(), // kurs pasar otomatis (kurs.ts), bukan isian admin
    model: String(form.get("model") ?? ""),
  };
  if (!(Number.isInteger(a.margin) && a.margin >= 0 && a.margin <= 90)) return { ok: false, pesan: "Margin harus 0–90%." };
  if (!(Number.isInteger(a.pemakaian) && a.pemakaian >= 10 && a.pemakaian <= 100)) return { ok: false, pesan: "Pemakaian kuota 10–100%." };
  if (!(a.metode in METODE_BAYAR)) return { ok: false, pesan: "Metode bayar tidak dikenal." };
  if (!(Number.isFinite(a.biayaServerNomor) && a.biayaServerNomor >= 0 && a.biayaServerNomor <= 1_000_000)) return { ok: false, pesan: "Biaya server tidak valid." };
  if (perkiraanPerBalasan(a.model) === null) return { ok: false, pesan: "Tarif model acuan belum diketahui." };
  await setSetting("margin_target", String(a.margin));
  await setSetting("pemakaian_acuan", String(a.pemakaian));
  await setSetting("metode_acuan", a.metode);
  await setSetting("biaya_server_nomor", String(Math.round(a.biayaServerNomor)));
  await setSetting("harga_model", a.model);
  const acuanTeks = `margin ${a.margin}%, pemakaian ${a.pemakaian}%, ${a.metode}, ${a.model}, kurs ${a.kurs}`;
  const terapkanPenuh = form.get("terapkan") === "1";
  const terapkanKomisiSaja = form.get("terapkan_komisi") === "1";
  if (!terapkanPenuh && !terapkanKomisiSaja) {
    await catatLog(admin, "ubah acuan harga", null, acuanTeks);
    revalidatePath("/admin", "layout");
    return { ok: true, pesan: "Acuan harga tersimpan." };
  }
  const mode = form.get("mode") === "kunci-harga" ? "kunci-harga" : "kunci-kuota";
  const masukkanKomisi = form.get("masukkan_komisi") === "1";
  let komisiMap: Record<number, { jenis: JenisKomisi; nilai: number }> | undefined;
  const komisiJson = form.get("komisi_paket_json");
  if (typeof komisiJson === "string" && komisiJson.trim() !== "") {
    try {
      const parsed = JSON.parse(komisiJson) as Record<string, { jenis?: string; nilai?: number }>;
      komisiMap = {};
      for (const [k, v] of Object.entries(parsed)) {
        const idNum = Number(k);
        if (!Number.isInteger(idNum) || idNum <= 0 || !v) continue;
        const jenis: JenisKomisi = v.jenis === "rupiah" ? "rupiah" : "persen";
        const nilai = Math.max(0, Math.round(Number(v.nilai) || 0));
        if (jenis === "persen" && nilai > 100) return { ok: false, pesan: "Komisi persentase harus 0–100%." };
        if (jenis === "rupiah" && nilai > MAKS_HARGA_PAKET) return { ok: false, pesan: "Nominal komisi terlalu besar." };
        komisiMap[idNum] = { jenis, nilai };
      }
    } catch {
      // abaikan jika JSON tidak valid
    }
  }
  // Paket yang dicentang admin; paket tanpa centang tetap persis seperti yang ia atur.
  const ids = new Set(form.getAll("ikut").map(Number).filter((n) => Number.isInteger(n) && n > 0));
  if (!ids.size) return { ok: false, pesan: "Centang minimal satu paket yang mau diterapkan." };
  let hasil;
  try {
    hasil = await terapkanSimulasi(
      { ...a, metode: a.metode as keyof typeof METODE_BAYAR },
      mode,
      ids,
      komisiMap ? { komisiMap, masukkanKomisi, hanyaKomisi: terapkanKomisiSaja } : undefined
    );
  } catch (e) {
    return { ok: false, pesan: e instanceof Error ? e.message : "Gagal menerapkan simulasi." };
  }
  const { berubah, dilewati } = hasil;
  mintaSinkronCg();
  await catatLog(
    admin,
    terapkanKomisiSaja ? "terapkan komisi paket" : "terapkan simulasi paket",
    null,
    `${acuanTeks}, ${mode}; ${berubah.map((b) => `${b.nama}: ${b.sebelum} -> ${b.sesudah}`).join("; ") || "tidak ada perubahan"}${dilewati.length ? `; dilewati: ${dilewati.map((d) => `${d.nama} (${d.alasan})`).join(", ")}` : ""}`
  );
  revalidatePath("/admin", "layout");
  revalidatePath("/langganan");
  revalidatePath("/afiliasi");
  revalidatePath("/program-afiliasi");
  revalidatePath("/");
  const lewat = dilewati.length ? ` Tidak diubah: ${dilewati.map((d) => `${d.nama} (${d.alasan})`).join("; ")}.` : "";
  return { ok: true, pesan: (berubah.length ? `Paket diperbarui: ${berubah.map((b) => `${b.nama} → ${b.sesudah}`).join("; ")}.` : "Paket yang dipilih sudah sesuai simulasi.") + lewat };
}

// ---------- Afiliasi (Pengguna & Admin) ----------

export async function daftarAfiliasiAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const user = await requireUser();
  const { b, t } = await teksPermintaan();
  if (terlaluSering(`daftar-af:${user.id}`, 6, 10 * 60_000)) return terlaluBanyak(t);
  const kode = String(form.get("kode") ?? "");
  const bankNama = String(form.get("bank_nama") ?? "");
  const bankNomor = String(form.get("bank_nomor") ?? "");
  const bankPemilik = String(form.get("bank_pemilik") ?? "");
  try {
    const af = await daftarAfiliator(user.id, { kode, bankNama, bankNomor, bankPemilik });
    revalidatePath("/afiliasi");
    revalidatePath("/admin/afiliasi");
    return {
      ok: true,
      pesan:
        af.status === "aktif"
          ? t(
              "Selamat! Akun afiliasi Anda sudah aktif. Bagikan tautan Anda untuk mulai mendapat komisi.",
              "Congratulations! Your affiliate account is active. Share your link to start earning commissions."
            )
          : t("Pendaftaran afiliasi berhasil dikirim dan sedang menunggu persetujuan admin.", "Your affiliate application has been sent and is awaiting admin approval."),
    };
  } catch (e) {
    return { ok: false, pesan: await pesanGalatAfiliasi(e, b) };
  }
}

export async function ubahAfiliasiAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const user = await requireUser();
  const { b, t } = await teksPermintaan();
  const kode = String(form.get("kode") ?? "");
  const bankNama = String(form.get("bank_nama") ?? "");
  const bankNomor = String(form.get("bank_nomor") ?? "");
  const bankPemilik = String(form.get("bank_pemilik") ?? "");
  try {
    await ubahProfilAfiliator(user.id, { kode, bankNama, bankNomor, bankPemilik });
    revalidatePath("/afiliasi");
    revalidatePath("/admin/afiliasi");
    return { ok: true, pesan: t("Profil & rekening pencairan berhasil diperbarui.", "Profile & payout account updated.") };
  } catch (e) {
    return { ok: false, pesan: await pesanGalatAfiliasi(e, b) };
  }
}

export async function tarikKomisiAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const user = await requireUser();
  const { b, t } = await teksPermintaan();
  if (terlaluSering(`tarik-af:${user.id}`, 5, 10 * 60_000)) return terlaluBanyak(t);
  const nominal = Number(String(form.get("nominal") ?? "").replace(/[^\d]/g, ""));
  try {
    const p = await ajukanPenarikan(user.id, nominal);
    revalidatePath("/afiliasi");
    revalidatePath("/admin/afiliasi");
    return {
      ok: true,
      pesan:
        b === "en"
          ? `Your payout request for ${uang(p.nominal, b, await kursUsd())} has been sent and will be processed soon.`
          : `Pengajuan penarikan Rp${p.nominal.toLocaleString("id-ID")} berhasil dikirim dan akan segera diproses.`,
    };
  } catch (e) {
    return { ok: false, pesan: await pesanGalatAfiliasi(e, b) };
  }
}

export async function adminAturanAfiliasiAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const admin = await requireAdmin();
  const aktif = form.get("aktif") === "on";
  const persetujuan: ModePersetujuanAfiliasi = form.get("persetujuan") === "manual" ? "manual" : "otomatis";
  const siklus: SiklusKomisi = form.get("siklus") === "pertama" ? "pertama" : "berulang";
  const minTarik = Number(String(form.get("min_tarik") ?? "").replace(/[^\d]/g, ""));
  if (!Number.isInteger(minTarik) || minTarik < 10_000 || minTarik > 100_000_000) {
    return { ok: false, pesan: "Minimal penarikan harus Rp10.000 – Rp100.000.000." };
  }
  await simpanPengaturanAfiliasi({ aktif, persetujuan, siklus, minTarik });
  mintaSinkronCg();
  await catatLog(
    admin,
    "ubah aturan afiliasi",
    null,
    `program ${aktif ? "aktif" : "nonaktif"}, pendaftaran ${persetujuan}, komisi ${siklus}, min tarik Rp${minTarik.toLocaleString("id-ID")}`
  );
  revalidatePath("/admin/afiliasi");
  revalidatePath("/afiliasi");
  return { ok: true, pesan: "Pengaturan program afiliasi tersimpan." };
}

export async function adminStatusAfiliatorAction(userId: number, status: StatusAfiliator): Promise<Hasil> {
  const admin = await requireAdmin();
  if (!idSah(userId) || !["menunggu", "aktif", "nonaktif"].includes(status)) {
    return { ok: false, pesan: "Data tidak valid." };
  }
  return jalankanAdmin(
    async () => {
      await setStatusAfiliatorAdmin(admin, userId, status);
      return `Status afiliator diubah menjadi ${status}.`;
    },
    "/admin/afiliasi",
    "/afiliasi"
  );
}

export async function adminProsesPenarikanAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const admin = await requireAdmin();
  const id = idSah(form.get("id"));
  const aksi = String(form.get("aksi") ?? "");
  if (!id || (aksi !== "manual" && aksi !== "iris" && aksi !== "tolak")) {
    return { ok: false, pesan: "Permintaan tidak valid." };
  }
  const referensi = String(form.get("referensi") ?? "");
  const catatan = String(form.get("catatan") ?? "");
  return jalankanAdmin(
    () => prosesPenarikanAdmin(admin, id, { aksi, referensi, catatan }),
    "/admin/afiliasi",
    "/afiliasi"
  );
}

// ---------- Admin: Meta Ads Pixel ----------

export async function adminMetaPixelAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const admin = await requireAdmin();
  const ambil =
    form instanceof FormData
      ? (k: string) => form.get(k)
      : (_lalu as unknown) instanceof FormData
        ? (k: string) => (_lalu as unknown as FormData).get(k)
        : form && typeof form === "object"
          ? (k: string) => (form as unknown as Record<string, unknown>)[k]
          : null;
  if (!ambil) return { ok: false, pesan: "Data formulir tidak terbaca." };
  const pixelMentah = String(ambil("pixel_id") ?? "");
  const pixelId = ekstrakPixelId(pixelMentah);
  if (pixelId === null) {
    return {
      ok: false,
      pesan: "ID Meta Pixel tidak valid. Masukkan 8–25 digit angka ID Pixel atau tempel langsung kode script dari Meta Events Manager.",
    };
  }
  const aktif = Boolean(pixelId) && ambil("aktif") === "on";
  const capiToken = String(ambil("capi_token") ?? "").trim();
  const testEventCode = String(ambil("test_event_code") ?? "").trim();
  const event = Object.fromEntries(
    KUNCI_EVENT_META.map((k) => [k, ambil(`ev_${k}`) === "on"])
  ) as Record<KunciEventMeta, boolean>;

  try {
    const tersimpan = await simpanPengaturanMetaPixel({
      aktif,
      pixelId,
      capiToken,
      testEventCode,
      event,
    });
    const evAktif = KUNCI_EVENT_META.filter((k) => tersimpan.event[k]).length;
    await catatLog(
      admin,
      "ubah meta pixel",
      null,
      tersimpan.pixelId
        ? `ID ${tersimpan.pixelId} (${tersimpan.aktif ? "aktif" : "nonaktif"}, ${evAktif}/${KUNCI_EVENT_META.length} event${tersimpan.capiToken ? ", CAPI terpasang" : ""})`
        : "pixel dikosongkan"
    );
    revalidatePath("/", "layout");
    revalidatePath("/admin", "layout");
    return {
      ok: true,
      pesan: tersimpan.pixelId
        ? tersimpan.aktif
          ? `Meta Pixel (${tersimpan.pixelId}) tersimpan dan langsung aktif di seluruh halaman.`
          : `ID Meta Pixel (${tersimpan.pixelId}) tersimpan dalam keadaan nonaktif.`
        : "Meta Pixel dinonaktifkan dan dikosongkan.",
    };
  } catch (e) {
    return { ok: false, pesan: e instanceof Error ? e.message : "Gagal menyimpan pengaturan Meta Pixel." };
  }
}

export async function adminUjiMetaPixelAction(): Promise<Hasil> {
  const admin = await requireAdmin();
  if (terlaluSering(`uji-px:${admin.id}`, 8, 5 * 60_000)) {
    return { ok: false, pesan: "Terlalu sering mengirim event uji. Tunggu sebentar lalu coba lagi." };
  }
  const ip = await ipKlien();
  return ujiCapiMetaPixel({ ip, email: admin.email });
}
