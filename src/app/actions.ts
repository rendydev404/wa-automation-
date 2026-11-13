"use server";

import type { FiturApi } from "@/lib/api-def";
import { fiturBoleh } from "@/lib/mesin/lisensi";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { MAKS_INSTRUKSI } from "@/lib/templat-ai-def";
import { penandaTersisa } from "@/lib/templat-ai";
import { COOKIE_ASAL, bacaAsal } from "@/lib/asal-def";
import { simpanAsal } from "@/lib/asal";
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
import { catatFitur } from "@/lib/analitik";
import { KANAL_BAYAR, type KanalBayar, MAKS_HARGA_PAKET, METODE_BAYAR, kanalSah, labelKanal } from "@/lib/harga";
import type { Bahasa, T } from "@/lib/bahasa";
import { alihkanPermintaan, teksPermintaan } from "@/lib/bahasa-server";
import { authConfigured } from "@/lib/auth";
import { asalAplikasi, ipKlien, lewatHttps, terlaluSering } from "@/lib/batas";
import { jalurLanjut } from "@/lib/lanjut";
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
import { konteksMetaPermintaan } from "@/lib/meta-pixel-konteks";
import { notifPendaftarBaru } from "@/lib/notifikasi";
import { ATURAN_ANGKA, MAKS_ATURAN_GLOBAL } from "@/lib/aturan";
import { type IsiKhusus, METODE_MANUAL, type MetodeManual, batalkanBayar, berikanPaketManual, cekSyaratBot, hapusPaket, hentikanLangganan, mulaiBayar, ORDER_SAH, paketById, segarkanKuota, simpanPaket, terapkanSimulasi } from "@/lib/langganan";
import { GATEWAY, GatewayError, adapter, gatewaySah, kanalMati, lupakanStatusKanal, modeGateway, modeGatewaySah, penyediaKanal, rencanaKanal, setKanalMati, setModeGateway, setPenyediaHybrid, terpasang } from "@/lib/gateway";
import { MODE_GATEWAY } from "@/lib/gateway-def";
import { ajukanJaminan, selesaikanManual, setModeRefund, tolakPengembalian, ulangiPengembalian } from "@/lib/jaminan";
import { teksProsesRefund } from "@/lib/jaminan-def";
import { tanggal, uang } from "@/lib/format";
import { GalatCustom, customTampil, periksaCustom, ringkasCustom, simpanPaketCustom } from "@/lib/paket-custom";
import { KnowledgeError, hapusDokumen, pratinjauDokumen, tambahDokumen } from "@/lib/knowledge";
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
  jagaAkunAdmin,
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
  requireAdminUtama,
  requireStaf,
  requireUser,
} from "@/lib/session";
import { WaError, hapusSesi, hubungkan, logout, mintaKodePairing } from "@/lib/wa";
import { type Peran, labelPeran, peranSah, staf } from "@/lib/peran";
import { modeMesin } from "@/lib/mode";

export interface Hasil {
  ok: boolean;
  pesan?: string;
}

/**
 * Analitik pemakaian fitur (src/lib/analitik-fitur.ts): dicatat hanya bila hasilnya ok, lalu hasil diteruskan apa
 * adanya. catatFitur sinkron ke buffer memori (tanpa query), jadi tidak menambah waktu aksi.
 */
function catatBila<H extends Hasil>(h: H, userId: number, kode: string): H {
  if (h.ok) catatFitur(userId, kode);
  return h;
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
  catatFitur(user.id, "akun.masuk");
  // Kembali ke halaman yang tadi dibuka sebelum diminta login (admin selalu ke panel admin).
  const lanjut = staf(user.peran) ? null : jalurLanjut(form.get("lanjut"));
  redirect(href(lanjut ?? halamanAwal(user.peran)));
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
  // Asal dari LP industri / iklan (cookie dari proxy.ts): disimpan ke akun, industrinya ikut di CompleteRegistration.
  const asal = bacaAsal(toples.get(COOKIE_ASAL)?.value);
  if (asal) {
    await simpanAsal(akun.id, asal);
    toples.delete(COOKIE_ASAL);
  }
  toples.set(COOKIE_PIXEL_REG, String(akun.id), { maxAge: 120, path: "/", httpOnly: false, sameSite: "lax" });
  void kirimCapiEvent({
    ...(await konteksMetaPermintaan()),
    kunci: "complete_registration",
    eventId: `reg_${akun.id}`,
    email,
    externalId: akun.id,
    ...(asal?.industri ? { customData: { content_category: asal.industri } } : {}),
  });
  notifPendaftarBaru(akun.id, email, "email");
  await catatLoginBerhasil(akun.id);
  await mulaiSesi(akun, await lewatHttps());
  catatFitur(akun.id, "akun.daftar");
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
  catatFitur(user.id, "akun.ubah_profil");
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
  catatFitur(user.id, "akun.ganti_password");
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
  catatFitur(u.id, "akun.reset_password");
  if (u.status !== "aktif") return { ok: true, pesan: t("Password sudah diganti, tetapi akun Anda sedang diblokir admin.", "Your password was changed, but your account is blocked by the admin.") };
  await mulaiSesi(u, await lewatHttps());
  redirect(href(halamanAwal(u.peran)));
}

export async function keluarSemuaAction(): Promise<Hasil> {
  const user = await requireUser();
  const { t } = await teksPermintaan();
  await mulaiSesi(await cabutSesi(user.id), await lewatHttps());
  catatFitur(user.id, "akun.keluar_semua");
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

/** Mesin self-host: fitur yang dimatikan dari pusat ikut terkunci di dashboard (pusat: selalu boleh, tanpa query). */
async function fiturTerkunci(kode: FiturApi): Promise<Hasil | null> {
  if (fiturBoleh(kode)) return null;
  const { t } = await teksPermintaan();
  return { ok: false, pesan: t("Fitur ini dinonaktifkan oleh ChatGerCep.", "This feature has been disabled by ChatGerCep.") };
}

export async function hubungkanWaAction(id: number): Promise<Hasil> {
  { const kunci = await fiturTerkunci("nomor"); if (kunci) return kunci; }
  const user = await requireUser();
  const nomor = await nomorUntuk(user, id);
  const { b, t } = await teksPermintaan();
  if (!nomor) return nomorTidakAda(t);
  try {
    await hubungkan(nomor.sesi);
    catatFitur(user.id, "wa.hubungkan");
    return { ok: true };
  } catch (e) {
    return { ok: false, pesan: pesanGalat(e, b) };
  }
}

export async function kodePairingWaAction(id: number, telepon: string): Promise<Hasil & { kode?: string }> {
  { const kunci = await fiturTerkunci("nomor"); if (kunci) return kunci; }
  const user = await requireUser();
  const nomor = await nomorUntuk(user, id);
  const { b, t } = await teksPermintaan();
  if (!nomor) return nomorTidakAda(t);
  try {
    const kode = await mintaKodePairing(nomor.sesi, telepon);
    catatFitur(user.id, "wa.kode_pairing");
    return { ok: true, kode };
  } catch (e) {
    return { ok: false, pesan: pesanGalat(e, b) };
  }
}

export async function logoutWaAction(id: number): Promise<Hasil> {
  { const kunci = await fiturTerkunci("nomor"); if (kunci) return kunci; }
  const user = await requireUser();
  const nomor = await nomorUntuk(user, id);
  const { b, t } = await teksPermintaan();
  if (!nomor) return nomorTidakAda(t);
  try {
    await logout(nomor.sesi);
    catatFitur(user.id, "wa.putuskan");
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
  { const kunci = await fiturTerkunci("nomor"); if (kunci) return kunci; }
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
  // Mesin self-host: batas nomor dari lisensi pusat (src/lib/mesin/lisensi.ts).
  if (modeMesin()) {
    const batas = (await import("@/lib/mesin/lisensi")).lisensiSekarang()?.batas.nomor ?? 1;
    if ((await semuaNomor()).length >= batas)
      return { ok: false, pesan: t(`Lisensi mesin ini maksimal ${batas} nomor.`, `This engine's license allows up to ${batas} ${batas === 1 ? "number" : "numbers"}.`) };
  }
  const nomor = await tambahNomor(label, user.id);
  // Gagal menyalakan sesi tidak membatalkan pembuatan: tombol "Hubungkan" di halamannya bisa mengulang.
  await hubungkan(nomor.sesi).catch(() => {});
  // "layout": daftar nomor di sidebar ikut diperbarui, bukan hanya halamannya.
  revalidatePath("/", "layout");
  catatFitur(user.id, "nomor.tambah");
  redirect(href(`/nomor/${nomor.id}`));
}

export async function ubahNomorAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  { const kunci = await fiturTerkunci("bot"); if (kunci) return kunci; }
  const user = await requireUser();
  const id = Number(form.get("id"));
  const label = String(form.get("label") ?? "").trim().slice(0, 60);
  const instruksi = String(form.get("instruksi") ?? "").trim().slice(0, MAKS_INSTRUKSI);
  const { t } = await teksPermintaan();
  if (!(await nomorUntuk(user, id))) return nomorTidakAda(t);
  if (!label) return { ok: false, pesan: t("Nama nomor wajib diisi.", "Number name is required.") };
  // Template AI yang belum diisi: isian contoh/penanda tidak boleh sampai terbaca AI sebagai fakta usaha.
  const penanda = await penandaTersisa(instruksi);
  if (penanda.length)
    return {
      ok: false,
      pesan: t(
        `Masih ada ${penanda.length} bagian bertanda [ ... ] yang belum diganti, misalnya ${penanda[0]}. Ganti dengan data usaha Anda atau hapus.`,
        `${penanda.length} part(s) marked [ ... ] haven't been replaced yet, e.g. ${penanda[0]}. Replace them with your business details or delete them.`,
      ),
    };
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
  catatFitur(user.id, "nomor.ubah");
  return { ok: true, pesan: t("Tersimpan.", "Saved.") };
}

export async function setBotAktifAction(id: number, aktif: boolean): Promise<Hasil> {
  { const kunci = await fiturTerkunci("bot"); if (kunci) return kunci; }
  const user = await requireUser();
  const nomor = await nomorUntuk(user, id);
  const { t } = await teksPermintaan();
  if (!nomor) return nomorTidakAda(t);
  // Aturan pakai: balasan otomatis hanya bisa dinyalakan setelah kedua syarat terpenuhi (Informasi Usaha + langganan/kuota).
  if (aktif) {
    const syarat = await cekSyaratBot(id);
    if (syarat === "knowledge_kosong") {
      return { ok: false, pesan: t("Isi Informasi Usaha dulu supaya AI tahu apa yang harus dijawab.", "Add your Business Info first so the AI knows what to answer.") };
    }
    if (syarat === "tanpa_kuota") {
      return { ok: false, pesan: t("Pilih paket langganan dulu supaya balasan AI bisa aktif.", "Choose a subscription plan first so AI replies can turn on.") };
    }
  }
  await setBotAktif(id, aktif);
  revalidatePath("/dashboard");
  revalidatePath(`/nomor/${id}`);
  catatFitur(user.id, aktif ? "bot.nyalakan" : "bot.matikan");
  return { ok: true };
}

/** Sinkron data kasir Suka Shawarma: fitur internal, khusus admin. */
export async function setSinkronAction(id: number, aktif: boolean): Promise<Hasil> {
  const admin = await requireStaf();
  if (!(await nomorUntuk(admin, id))) return { ok: false, pesan: "Nomor tidak ditemukan." };
  if (!konfigurasiSinkron()) return { ok: false, pesan: "Sinkron belum dikonfigurasi di server." };
  await setNomorSinkron(id, aktif);
  const s = await statusSinkron();
  revalidatePath("/dashboard");
  revalidatePath(`/nomor/${id}`);
  return catatBila(aktif && s.galat ? { ok: false, pesan: `Gagal mengambil data: ${s.galat}` } : { ok: true }, admin.id, aktif ? "sinkron.kasir_nyalakan" : "sinkron.kasir_matikan");
}

/** Data sistem ChatGerCep (paket, harga, komisi, metode bayar, fitur) sebagai knowledge otomatis: khusus admin. */
export async function setSinkronCgAction(id: number, aktif: boolean): Promise<Hasil> {
  const admin = await requireStaf();
  if (!(await nomorUntuk(admin, id))) return { ok: false, pesan: "Nomor tidak ditemukan." };
  await setNomorSinkronCg(id, aktif);
  const s = await statusSinkronCg();
  revalidatePath("/dashboard");
  revalidatePath(`/nomor/${id}`);
  return catatBila(aktif && s.galat ? { ok: false, pesan: `Gagal menyusun data: ${s.galat}` } : { ok: true }, admin.id, aktif ? "sinkron.cg_nyalakan" : "sinkron.cg_matikan");
}

export async function hapusNomorAction(id: number): Promise<Hasil> {
  { const kunci = await fiturTerkunci("nomor"); if (kunci) return kunci; }
  const user = await requireUser();
  const nomor = await nomorUntuk(user, id);
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
  catatFitur(user.id, "nomor.hapus");
  redirect(href("/dashboard"));
}

// ---------- Katalog produk (tambah/ubah lewat /api/katalog karena membawa foto) ----------

/** Nomor yang katalognya boleh diakses pengguna ini (`userId` = pelaku, untuk analitik). */
async function produkMilik(numberId: number, tulis: boolean): Promise<{ id: number; userId: number } | null> {
  const user = await requireUser();
  const nomor = await nomorUntuk(user, numberId);
  if (!nomor) return null;
  if (tulis && !staf(user.peran) && !(await katalogBoleh(nomor.user_id))) return null;
  return { id: nomor.id, userId: user.id };
}

const katalogTerkunci = (t: T): Hasil => ({ ok: false, pesan: t("Katalog tidak bisa diubah.", "The catalog can't be changed.") });

export async function hapusProdukAction(numberId: number, id: number): Promise<Hasil> {
  { const kunci = await fiturTerkunci("katalog"); if (kunci) return kunci; }
  const n = await produkMilik(numberId, false); // menghapus tetap boleh walau paket sudah habis
  const { t } = await teksPermintaan();
  if (!n || !Number.isInteger(id)) return { ok: false, pesan: t("Produk tidak ditemukan.", "Product not found.") };
  await hapusProduk(n.id, id);
  revalidatePath(`/nomor/${n.id}`);
  catatFitur(n.userId, "katalog.hapus");
  return { ok: true, pesan: t("Produk dihapus.", "Product deleted.") };
}

export async function tersediaProdukAction(numberId: number, id: number, tersedia: boolean): Promise<Hasil> {
  { const kunci = await fiturTerkunci("katalog"); if (kunci) return kunci; }
  const n = await produkMilik(numberId, true);
  if (!n || !Number.isInteger(id)) return katalogTerkunci((await teksPermintaan()).t);
  await setTersedia(n.id, id, tersedia);
  revalidatePath(`/nomor/${n.id}`);
  catatFitur(n.userId, tersedia ? "katalog.tersedia" : "katalog.habis");
  return { ok: true };
}

export async function geserProdukAction(numberId: number, id: number, arah: -1 | 1): Promise<Hasil> {
  { const kunci = await fiturTerkunci("katalog"); if (kunci) return kunci; }
  const n = await produkMilik(numberId, true);
  if (!n || !Number.isInteger(id) || (arah !== -1 && arah !== 1)) return katalogTerkunci((await teksPermintaan()).t);
  await geserProduk(n.id, id, arah);
  revalidatePath(`/nomor/${n.id}`);
  catatFitur(n.userId, "katalog.urutkan");
  return { ok: true };
}

// ---------- Base knowledge ----------

export async function tambahTeksAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  { const kunci = await fiturTerkunci("knowledge"); if (kunci) return kunci; }
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
    if (Number.isInteger(gantiId) && gantiId > 0) await hapusDokumen(gantiId, numberId, staf(user.peran));
  } catch (e) {
    return { ok: false, pesan: pesanGalat(e, b) };
  }
  revalidatePath("/dashboard");
  revalidatePath(`/nomor/${numberId}`);
  catatFitur(user.id, gantiId > 0 ? "knowledge.perbarui" : "knowledge.tulis");
  return { ok: true, pesan: gantiId > 0 ? t("Dokumen diperbarui.", "Document updated.") : t("Tersimpan ke Informasi Usaha.", "Saved to Business Info.") };
}

export async function hapusDokumenAction(id: number, numberId: number): Promise<Hasil> {
  { const kunci = await fiturTerkunci("knowledge"); if (kunci) return kunci; }
  const user = await requireUser();
  if (!(await nomorUntuk(user, numberId))) return nomorTidakAda((await teksPermintaan()).t);
  await hapusDokumen(id, numberId, staf(user.peran));
  revalidatePath("/dashboard");
  revalidatePath(`/nomor/${numberId}`);
  catatFitur(user.id, "knowledge.hapus");
  return { ok: true };
}

// ---------- Histori percakapan ----------

/** Hapus satu percakapan (`percakapanId`) atau seluruh histori percakapan sebuah nomor. */
export async function hapusPercakapanAction(numberId: number, percakapanId?: number): Promise<Hasil> {
  { const kunci = await fiturTerkunci("percakapan"); if (kunci) return kunci; }
  const user = await requireUser();
  const { t } = await teksPermintaan();
  if (!(await nomorUntuk(user, numberId))) return nomorTidakAda(t);
  if (percakapanId !== undefined && !Number.isInteger(percakapanId)) return percakapanTidakSah(t);
  const n = await hapusPercakapan(numberId, percakapanId);
  revalidatePath("/dashboard");
  revalidatePath(`/nomor/${numberId}`);
  catatFitur(user.id, percakapanId === undefined ? "percakapan.hapus_semua" : "percakapan.hapus");
  return { ok: true, pesan: t(`${n} percakapan dihapus.`, `${n} ${n === 1 ? "conversation" : "conversations"} deleted.`) };
}

/** Pemilik menandai sebuah chat "bukan spam": AI tidak menyaring chat itu lagi (berlaku di pesan berikutnya). */
export async function bukanSpamAction(numberId: number, percakapanId: number): Promise<Hasil> {
  { const kunci = await fiturTerkunci("percakapan"); if (kunci) return kunci; }
  const user = await requireUser();
  const { t } = await teksPermintaan();
  if (!(await nomorUntuk(user, numberId))) return nomorTidakAda(t);
  if (!Number.isInteger(percakapanId)) return percakapanTidakSah(t);
  if (!(await tandaiBukanSpam(numberId, percakapanId))) return { ok: false, pesan: t("Percakapan tidak ditemukan.", "Conversation not found.") };
  catatFitur(user.id, "percakapan.bukan_spam");
  return { ok: true, pesan: t("Ditandai bukan spam. Pesan berikutnya dari kontak ini dijawab AI seperti biasa.", "Marked as not spam. The AI will reply to this contact's next messages as usual.") };
}

/** Chat yang dibisukan penyaring prospek dilayani AI lagi mulai pesan berikutnya (opsional; penyaring belajar dari ini). */
export async function bangunkanChatAction(numberId: number, percakapanId: number): Promise<Hasil> {
  { const kunci = await fiturTerkunci("percakapan"); if (kunci) return kunci; }
  const user = await requireUser();
  const { t } = await teksPermintaan();
  if (!(await nomorUntuk(user, numberId))) return nomorTidakAda(t);
  if (!Number.isInteger(percakapanId)) return percakapanTidakSah(t);
  const kunci = await kunciPercakapan(numberId, percakapanId);
  if (!kunci) return { ok: false, pesan: t("Percakapan tidak ditemukan.", "Conversation not found.") };
  await bangunkanChat(numberId, kunci);
  catatFitur(user.id, "percakapan.bangunkan");
  return { ok: true, pesan: t("Pesan berikutnya dari kontak ini dijawab AI lagi.", "The AI will reply to this contact's next messages again.") };
}

export async function setSaringProspekAction(id: number, aktif: boolean): Promise<Hasil> {
  { const kunci = await fiturTerkunci("ml"); if (kunci) return kunci; }
  const user = await requireUser();
  if (!(await nomorUntuk(user, id))) return nomorTidakAda((await teksPermintaan()).t);
  await setSaringProspek(id, aktif);
  revalidatePath(`/nomor/${id}`);
  catatFitur(user.id, aktif ? "penyaring.prospek_nyalakan" : "penyaring.prospek_matikan");
  return { ok: true };
}

export async function setSaringSpamAction(id: number, aktif: boolean): Promise<Hasil> {
  { const kunci = await fiturTerkunci("spam"); if (kunci) return kunci; }
  const user = await requireUser();
  if (!(await nomorUntuk(user, id))) return nomorTidakAda((await teksPermintaan()).t);
  await setSaringSpam(id, aktif);
  revalidatePath(`/nomor/${id}`);
  catatFitur(user.id, aktif ? "penyaring.spam_nyalakan" : "penyaring.spam_matikan");
  return { ok: true };
}

// ---------- Belajar dari balasan manusia ----------

export async function setBelajarAction(id: number, aktif: boolean): Promise<Hasil> {
  { const kunci = await fiturTerkunci("belajar"); if (kunci) return kunci; }
  const user = await requireUser();
  if (!(await nomorUntuk(user, id))) return nomorTidakAda((await teksPermintaan()).t);
  await setBelajar(id, aktif);
  revalidatePath(`/nomor/${id}`);
  catatFitur(user.id, aktif ? "belajar.nyalakan" : "belajar.matikan");
  return { ok: true };
}

/** Halaman berikutnya daftar pelajaran (kursor dari baris terakhir yang sudah tampil). */
export async function muatPelajaranAction(numberId: number, waktu: number, id: number): Promise<{ daftar: ItemPelajaran[]; adaLagi: boolean }> {
  if (!fiturBoleh("pelajaran")) return { daftar: [], adaLagi: false };
  if (!(await nomorUntuk(await requireUser(), numberId)) || !Number.isInteger(waktu) || !Number.isInteger(id)) return { daftar: [], adaLagi: false };
  return daftarPelajaran(numberId, { waktu, id });
}

/** Hapus satu pelajaran (`id`) atau semua pelajaran sebuah nomor. */
export async function hapusPelajaranAction(numberId: number, id?: number): Promise<Hasil> {
  { const kunci = await fiturTerkunci("pelajaran"); if (kunci) return kunci; }
  const user = await requireUser();
  const { t } = await teksPermintaan();
  if (!(await nomorUntuk(user, numberId))) return nomorTidakAda(t);
  if (id !== undefined && !Number.isInteger(id)) return { ok: false, pesan: t("Data tidak valid.", "Invalid data.") };
  const n = await hapusPelajaran(numberId, id);
  revalidatePath(`/nomor/${numberId}`);
  catatFitur(user.id, id === undefined ? "belajar.hapus_semua" : "belajar.hapus");
  return { ok: true, pesan: t(`${n} pelajaran dihapus.`, `${n} ${n === 1 ? "lesson" : "lessons"} deleted.`) };
}

export async function pratinjauAction(id: number, numberId: number): Promise<string | null> {
  if (!fiturBoleh("knowledge")) return null;
  const user = await requireUser();
  if (!(await nomorUntuk(user, numberId))) return null;
  const isi = await pratinjauDokumen(id, numberId, staf(user.peran));
  if (isi !== null) catatFitur(user.id, "knowledge.pratinjau");
  return isi;
}

// ---------- Admin ----------

export interface HasilReset extends Hasil {
  password?: string;
}

const idSah = (v: unknown): number | null => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);

/** Aksi admin standar: galat -> pesan, berhasil -> segarkan `jalur` lalu catat `fitur` [id admin, kode] ke analitik. */
async function jalankanAdmin(fitur: readonly [number, string], fn: () => Promise<string | void>, ...jalur: string[]): Promise<Hasil> {
  try {
    const pesan = await fn();
    for (const j of jalur) revalidatePath(j);
    catatFitur(fitur[0], fitur[1]);
    return { ok: true, pesan: pesan || "Tersimpan." };
  } catch (e) {
    return { ok: false, pesan: pesanGalat(e) };
  }
}

export async function adminKuotaAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const admin = await requireStaf();
  const id = idSah(form.get("id"));
  const mentah = String(form.get("kuota") ?? "").trim();
  const kuota = mentah === "" ? null : Number(mentah);
  if (!id) return { ok: false, pesan: "Pengguna tidak valid." };
  if (kuota !== null && !(Number.isInteger(kuota) && kuota >= 0 && kuota <= 100)) return { ok: false, pesan: "Kuota harus 0–100 nomor (kosongkan = kuota bawaan)." };
  return jalankanAdmin([admin.id, "admin.ubah_kuota"], () => setKuota(admin, id, kuota), `/admin/pengguna/${id}`, "/admin");
}

export async function adminBonusKuotaAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const admin = await requireStaf();
  const id = idSah(form.get("id"));
  const jumlah = Number(String(form.get("jumlah") ?? "").replace(/[.,\s]/g, ""));
  if (!id) return { ok: false, pesan: "Pengguna tidak valid." };
  return jalankanAdmin(
    [admin.id, "admin.bonus_kuota"],
    async () => {
      await beriBonusKuota(admin, id, jumlah, String(form.get("catatan") ?? ""));
      return `Bonus ${jumlah.toLocaleString("id-ID")} balasan AI diberikan. Pengguna mendapat notifikasi.`;
    },
    `/admin/pengguna/${id}`,
    "/admin",
  );
}

export async function adminAiAkunAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const admin = await requireStaf();
  const id = idSah(form.get("id"));
  if (!id) return { ok: false, pesan: "Pengguna tidak valid." };
  const dipilih = form.get("penyedia");
  const penyedia = dipilih === "hermes" || dipilih === "anthropic" ? dipilih : null;
  if (penyedia === "anthropic" && !kunciAnthropic()) return { ok: false, pesan: "API key Anthropic belum dipasang developer di server (ANTHROPIC_API_KEY)." };
  return jalankanAdmin([admin.id, "admin.ai_akun"], async () => {
    await setAiAkun(admin, id, penyedia);
    return penyedia === null
      ? "Akun ini kembali ikut pengaturan Mesin AI."
      : `Semua nomor akun ini kini dijawab ${penyedia === "anthropic" ? "Claude API (cadangan Hermes)" : "Hermes"}.`;
  }, `/admin/pengguna/${id}`, "/admin/pengguna");
}

/** Ubah peran akun (pengguna / developer / admin). Hanya admin: developer internal tidak bisa mengatur peran. */
export async function adminPeranAction(id: number, peran: Peran): Promise<Hasil> {
  const admin = await requireAdminUtama();
  if (!idSah(id) || !peranSah(peran)) return { ok: false, pesan: "Data tidak valid." };
  return jalankanAdmin(
    [admin.id, "admin.ubah_peran"],
    async () => {
      await setPeran(admin, id, peran);
      return `Peran diubah menjadi ${labelPeran(peran)}.`;
    },
    `/admin/pengguna/${id}`,
    "/admin",
  );
}

export async function adminBlokirAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const admin = await requireStaf();
  const id = idSah(form.get("id"));
  if (!id) return { ok: false, pesan: "Pengguna tidak valid." };
  const blokir = form.get("blokir") === "1";
  const alasan = String(form.get("alasan") ?? "").trim().slice(0, 200);
  return jalankanAdmin([admin.id, blokir ? "admin.blokir" : "admin.buka_blokir"], async () => {
    await setBlokir(admin, id, blokir, alasan);
    return blokir ? "Akun diblokir: sesi login dicabut dan AI berhenti membalas di nomornya." : "Blokir dibuka.";
  }, `/admin/pengguna/${id}`, "/admin");
}

export async function adminResetPasswordAction(id: number): Promise<HasilReset> {
  const admin = await requireStaf();
  if (!idSah(id)) return { ok: false, pesan: "Pengguna tidak valid." };
  try {
    const password = await resetPassword(admin, id);
    catatFitur(admin.id, "admin.reset_password");
    return { ok: true, password };
  } catch (e) {
    return { ok: false, pesan: pesanGalat(e) };
  }
}

export async function adminCabutSesiAction(id: number): Promise<Hasil> {
  const admin = await requireStaf();
  if (!idSah(id)) return { ok: false, pesan: "Pengguna tidak valid." };
  return jalankanAdmin([admin.id, "admin.cabut_sesi"], async () => {
    await cabutSesi(id, admin);
    return "Semua sesi login pengguna ini dicabut.";
  }, `/admin/pengguna/${id}`);
}

/** Putuskan semua WhatsApp milik pengguna (perangkat tertaut dicabut); nomornya tetap ada. */
export async function adminPutuskanWaAction(id: number): Promise<Hasil> {
  const admin = await requireStaf();
  const u = idSah(id) ? await penggunaById(id) : undefined;
  if (!u) return { ok: false, pesan: "Pengguna tidak ditemukan." };
  return jalankanAdmin([admin.id, "admin.putuskan_wa"], async () => {
    jagaAkunAdmin(admin, u);
    const daftar = await nomorMilik(id);
    for (const n of daftar) await logout(n.sesi);
    await catatLog(admin, "putuskan WhatsApp", u.email, `${daftar.length} nomor`);
    return `${daftar.length} nomor diputuskan dari WhatsApp.`;
  }, `/admin/pengguna/${id}`);
}

export async function adminHapusAction(id: number, konfirmasi?: string, alihkan = true): Promise<Hasil> {
  const admin = await requireStaf();
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
  catatFitur(admin.id, "admin.hapus_pengguna");
  if (alihkan) redirect("/admin/pengguna");
  return { ok: true, pesan: `Pengguna ${u.email} berhasil dihapus.` };
}

export async function adminBuatAkunAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const admin = await requireStaf();
  const nama = String(form.get("nama") ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  const email = normalkanEmail(String(form.get("email") ?? ""));
  const password = String(form.get("password") ?? "");
  const dipilih = form.get("peran");
  const peran: Peran = peranSah(dipilih) ? dipilih : "user";
  // Membuat akun staf (admin/developer) = memberi peran: hanya admin.
  if (peran !== "user" && admin.peran !== "admin") return { ok: false, pesan: "Hanya admin yang bisa membuat akun admin atau developer." };
  const kuotaMentah = String(form.get("kuota") ?? "").trim();
  const kuota = kuotaMentah === "" ? null : Number(kuotaMentah);
  if (nama.length < 2) return { ok: false, pesan: "Nama minimal 2 huruf." };
  if (!email) return { ok: false, pesan: "Email tidak valid." };
  const lemah = cekPassword(password, email);
  if (lemah) return { ok: false, pesan: lemah };
  if (kuota !== null && !(Number.isInteger(kuota) && kuota >= 0 && kuota <= 100)) return { ok: false, pesan: "Kuota harus 0–100 nomor." };
  const akun = await buatAkun({ email, nama, password, peran, kuota });
  if (!akun) return { ok: false, pesan: "Email ini sudah terdaftar." };
  await catatLog(admin, "buat akun", email, peran === "user" ? undefined : `sebagai ${labelPeran(peran).toLowerCase()}`);
  revalidatePath("/admin", "layout");
  catatFitur(admin.id, "admin.buat_akun");
  return { ok: true, pesan: `Akun ${email} dibuat.` };
}

export async function adminPengaturanAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const admin = await requireStaf();
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
  catatFitur(admin.id, "admin.pengaturan");
  return { ok: true, pesan: "Pengaturan tersimpan." };
}

/** Aturan sistem (src/lib/aturan.ts): batas laju, panjang balasan, peringatan kuota, aturan global semua bot. */
export async function adminAturanAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const admin = await requireStaf();
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
  catatFitur(admin.id, "admin.aturan");
  return { ok: true, pesan: "Aturan tersimpan dan langsung berlaku untuk semua bot." };
}

/** Penyedia & model AI untuk semua nomor. Berlaku langsung (dibaca tiap giliran), tanpa restart/deploy. */
export async function adminAiAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const admin = await requireStaf();
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
  catatFitur(admin.id, "admin.mesin_ai");
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

const TUR_SAH = new Set(["dashboard", "nomor", "admin"]);

export async function selesaiTurAction(nama: string): Promise<void> {
  const user = await requireUser();
  if (!TUR_SAH.has(nama)) return;
  await tandaiTurSelesai(user.id, nama);
  // Tur panel admin tidak masuk analitik fitur (analitik mengukur perilaku pengguna, bukan admin).
  if (nama !== "admin") catatFitur(user.id, nama === "nomor" ? "tur.selesai_nomor" : "tur.selesai_dashboard");
}

// ---------- Langganan & pembayaran ----------

/**
 * Buat tagihan paket dengan kanal pilihan pelanggan, lewat provider kanal itu menurut mode admin (Midtrans / iPaymu /
 * hybrid per metode); browser lalu dibawa ke halaman instruksi bayar kita sendiri. Klik ganda / tagihan yang sama yang
 * masih berlaku = order_id yang sama (tanpa charge baru).
 */
/** `kanalMati`: kanal yang baru ketahuan belum aktif; browser menghapusnya dari pilihan. */
export async function bayarPaketAction(paketId: number, kanal: string): Promise<Hasil & { orderId?: string; kanalMati?: KanalBayar }> {
  const user = await requireUser();
  const { b, t } = await teksPermintaan();
  if (terlaluSering(`bayar:${user.id}`, 10, 10 * 60_000)) return terlaluBanyak(t);
  const tidakTersedia = t("Metode pembayaran ini sedang tidak tersedia. Pilih metode lain.", "This payment method isn't available right now. Please choose another one.");
  if (!kanalSah(kanal)) return { ok: false, pesan: tidakTersedia };
  const peta = await penyediaKanal();
  if (!Object.keys(peta).length) return { ok: false, pesan: t("Pembayaran belum diaktifkan admin.", "Payments haven't been enabled by the admin yet.") };
  const g = peta[kanal] ? await adapter(peta[kanal]) : null;
  if (!g) return { ok: false, pesan: tidakTersedia, kanalMati: kanal };
  const paket = Number.isInteger(paketId) ? await paketById(paketId) : undefined;
  if (!paket || !paket.aktif || paket.harga < 1) return { ok: false, pesan: t("Paket tidak ditemukan.", "Plan not found.") };
  try {
    const konteks = await konteksMetaPermintaan();
    const h = await mulaiBayar(g, user, paket, kanal, await asalAplikasi(), konteks);
    if (h.baru) {
      void kirimCapiEvent({
        ...konteks,
        kunci: "initiate_checkout",
        eventId: `ic_${h.orderId}`,
        email: user.email,
        externalId: user.id,
        customData: { value: paket.harga, currency: "IDR", content_name: paket.nama, num_items: 1 },
      });
      revalidatePath("/langganan");
    }
    catatFitur(user.id, "langganan.buat_tagihan");
    return { ok: true, orderId: h.orderId };
  } catch (e) {
    console.error(`[bayar] gagal membuat tagihan user=${user.id} gateway=${g.nama} kanal=${kanal}: ${e instanceof Error ? e.message : e}`);
    if (e instanceof GatewayError && e.kanalMati) {
      revalidatePath("/langganan", "layout");
      mintaSinkronCg(); // metode bayar yang disebut bot ChatGerCep ikut diperbarui
      const label = labelKanal(kanal, b, g.nama);
      return { ok: false, pesan: t(`${label} belum tersedia. Pilih metode pembayaran lain.`, `${label} isn't available yet. Please choose another payment method.`), kanalMati: kanal };
    }
    return {
      ok: false,
      pesan:
        e instanceof GatewayError
          ? t("Tagihan sedang tidak bisa dibuat. Coba lagi sebentar lagi atau pilih metode lain.", "The invoice can't be created right now. Try again shortly or choose another method.")
          : pesanGalat(null, b),
    };
  }
}

/**
 * Admin menampilkan/menyembunyikan satu metode pembayaran di halaman bayar (juga kanal yang tersembunyi otomatis).
 * Berlaku untuk provider yang sekarang melayani metode itu (tiap provider punya daftar kanal tersembunyi sendiri).
 */
export async function setKanalTampilAction(kanal: string, tampil: boolean): Promise<Hasil> {
  const admin = await requireStaf();
  if (!kanalSah(kanal)) return { ok: false, pesan: "Metode pembayaran tidak dikenal." };
  const g = (await rencanaKanal()).kanal.find((r) => r.kanal === kanal)?.penyedia;
  if (!g) return { ok: false, pesan: "Metode ini tidak dilayani provider yang dipakai sekarang." };
  await setKanalMati(g, kanal, tampil ? null : { oleh: "admin", waktu: sekarang() });
  await catatLog(admin, tampil ? "tampilkan metode bayar" : "sembunyikan metode bayar", null, `${KANAL_BAYAR[kanal].label} (${GATEWAY[g].label})`);
  revalidatePath("/admin/transaksi");
  revalidatePath("/langganan", "layout");
  mintaSinkronCg();
  catatFitur(admin.id, tampil ? "admin.tampilkan_metode_bayar" : "admin.sembunyikan_metode_bayar");
  return { ok: true };
}

/**
 * Admin memilih cara memakai payment gateway untuk tagihan BARU, kapan saja: hanya Midtrans, hanya iPaymu, atau hybrid
 * (provider per metode). Tagihan yang sudah ada tetap dicek, dibatalkan, dan di-refund lewat provider asalnya. Provider
 * yang kredensialnya belum dipasang di .env ditolak (hybrid butuh keduanya).
 */
export async function adminGatewayAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const admin = await requireStaf();
  const m = form.get("mode");
  if (!modeGatewaySah(m)) return { ok: false, pesan: "Pilih Hanya Midtrans, Hanya iPaymu, atau Hybrid." };
  const perlu = m === "hybrid" ? (["midtrans", "ipaymu"] as const) : [m];
  const belum = perlu.filter((g) => !terpasang(g));
  if (belum.length)
    return {
      ok: false,
      pesan: belum.map((g) => (g === "ipaymu" ? "iPaymu belum dipasang di server (developer: IPAYMU_VA & IPAYMU_API_KEY di .env)." : "Midtrans belum dipasang di server (developer: MIDTRANS_SERVER_KEY di .env).")).join(" "),
    };
  const lama = await modeGateway();
  if (lama !== m) {
    await setModeGateway(m);
    await catatLog(admin, "ganti payment gateway", null, `${MODE_GATEWAY[lama].judul} -> ${MODE_GATEWAY[m].judul}`);
    revalidatePath("/admin/transaksi");
    revalidatePath("/langganan", "layout");
    mintaSinkronCg(); // metode bayar yang disebut bot ChatGerCep ikut diperbarui
  }
  return {
    ok: true,
    pesan:
      m === "hybrid"
        ? "Mode hybrid aktif: tiap metode lewat provider yang tertulis di daftar di bawah. Tagihan yang sudah ada tetap diproses provider asalnya."
        : `Semua tagihan baru sekarang lewat ${GATEWAY[m].label}. Tagihan yang sudah ada tetap diproses provider asalnya.`,
  };
}

/** Admin membaca ulang status kanal dari dashboard provider sekarang (biasanya tersimpan 10 menit). */
export async function adminSegarkanStatusKanalAction(): Promise<Hasil> {
  await requireStaf();
  lupakanStatusKanal();
  revalidatePath("/admin/transaksi");
  revalidatePath("/langganan", "layout");
  return { ok: true };
}

/** Metode yang pernah ditolak provider saat membuat tagihan: admin mencobanya lagi (mis. setelah diaktifkan di provider). */
export async function adminCobaLagiKanalAction(kanal: string, gateway: string): Promise<Hasil> {
  const admin = await requireStaf();
  if (!kanalSah(kanal) || !gatewaySah(gateway)) return { ok: false, pesan: "Pilihan tidak dikenal." };
  if ((await kanalMati(gateway))[kanal]?.oleh === "otomatis") await setKanalMati(gateway, kanal, null);
  lupakanStatusKanal();
  await catatLog(admin, "coba lagi metode bayar", null, `${KANAL_BAYAR[kanal].label} (${GATEWAY[gateway].label})`);
  revalidatePath("/admin/transaksi");
  revalidatePath("/langganan", "layout");
  mintaSinkronCg();
  return { ok: true };
}

/** Mode hybrid: admin memilih provider untuk satu metode bayar (hanya provider terpasang yang melayani metode itu). */
export async function adminPenyediaKanalAction(kanal: string, gateway: string): Promise<Hasil> {
  const admin = await requireStaf();
  if (!kanalSah(kanal) || !gatewaySah(gateway)) return { ok: false, pesan: "Pilihan tidak dikenal." };
  const r = (await rencanaKanal()).kanal.find((x) => x.kanal === kanal);
  if (!r?.pilihan.includes(gateway)) return { ok: false, pesan: `${KANAL_BAYAR[kanal].label} belum aktif di ${GATEWAY[gateway].label}.` };
  await setPenyediaHybrid(kanal, gateway);
  await catatLog(admin, "ubah provider metode bayar (hybrid)", null, `${KANAL_BAYAR[kanal].label} -> ${GATEWAY[gateway].label}`);
  revalidatePath("/admin/transaksi");
  revalidatePath("/langganan", "layout");
  return { ok: true };
}

/** Pelanggan membatalkan tagihannya yang belum dibayar. */
export async function batalBayarAction(orderId: string): Promise<Hasil & { status?: string }> {
  const user = await requireUser();
  const { t } = await teksPermintaan();
  const tidakAda = t("Tagihan tidak ditemukan.", "Invoice not found.");
  if (!ORDER_SAH.test(orderId)) return { ok: false, pesan: tidakAda };
  try {
    const status = await batalkanBayar(user.id, orderId);
    if (!status) return { ok: false, pesan: tidakAda };
    revalidatePath("/langganan");
    if (status === "dibatalkan") catatFitur(user.id, "langganan.batal_tagihan");
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

// ---------- Jaminan uang kembali (src/lib/jaminan.ts) ----------

export async function ajukanJaminanAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const user = await requireUser();
  const { b, t } = await teksPermintaan();
  if (terlaluSering(`jaminan:${user.id}`, 3, 10 * 60_000)) return terlaluBanyak(t);
  const teks = (n: string) => String(form.get(n) ?? "");
  const h = await ajukanJaminan(user.id, {
    alasan: teks("alasan"),
    tujuan: { bank: teks("tujuan_bank"), nomor: teks("tujuan_nomor"), nama: teks("tujuan_nama") },
  });
  revalidatePath("/langganan");
  if (!h.ok) return { ok: false, pesan: b === "en" ? h.pesan.en : h.pesan.id };
  catatFitur(user.id, "langganan.jaminan");
  return {
    ok: true,
    pesan:
      h.cara === "manual"
        ? t(`Pengajuan terkirim. Dana ditransfer ke rekening/e-wallet yang kamu isi dalam ${teksProsesRefund(t)}; kamu dapat notifikasi saat selesai.`, `Request sent. The money will be transferred to the account/e-wallet you entered within ${teksProsesRefund(t)}; you'll be notified when it's done.`)
        : t("Dana sudah dikembalikan ke metode bayar asal dan paketnya dihentikan.", "The money has been refunded to the original payment method and the plan was stopped."),
  };
}

/** Admin: dana sudah ditransfer manual -> pengajuan selesai, paket dicabut, komisi batal. */
export async function adminSelesaikanPengembalianAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const admin = await requireStaf();
  const id = idSah(form.get("id"));
  if (!id) return { ok: false, pesan: "Pengajuan tidak ditemukan." };
  const referensi = String(form.get("referensi") ?? "");
  const h = await selesaikanManual(id, referensi);
  await catatLog(admin, "selesaikan uang kembali (manual)", `#${id}`, h.ok ? referensi.trim() || "tanpa referensi" : h.pesan.id);
  revalidatePath("/admin/transaksi", "layout");
  if (!h.ok) return { ok: false, pesan: h.pesan.id };
  catatFitur(admin.id, "admin.selesai_pengembalian");
  return { ok: true, pesan: "Tercatat selesai; paket pembeli dicabut dan komisi afiliasinya batal." };
}

export async function adminTolakPengembalianAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const admin = await requireStaf();
  const id = idSah(form.get("id"));
  if (!id) return { ok: false, pesan: "Pengajuan tidak ditemukan." };
  const catatan = String(form.get("catatan") ?? "");
  const h = await tolakPengembalian(id, catatan);
  if (!h.ok) return { ok: false, pesan: h.pesan.id };
  await catatLog(admin, "tolak uang kembali", `#${id}`, catatan.trim());
  revalidatePath("/admin/transaksi", "layout");
  catatFitur(admin.id, "admin.tolak_pengembalian");
  return { ok: true, pesan: "Pengajuan ditolak; pemilik akun diberi tahu dan paketnya tetap aktif." };
}

export async function adminUlangiPengembalianAction(id: number): Promise<Hasil> {
  const admin = await requireStaf();
  if (!idSah(id)) return { ok: false, pesan: "Pengajuan tidak ditemukan." };
  const h = await ulangiPengembalian(id);
  await catatLog(admin, "ulangi pengembalian dana (otomatis)", `#${id}`, h.ok ? "berhasil" : h.pesan.id);
  revalidatePath("/admin/transaksi", "layout");
  if (h.ok) catatFitur(admin.id, "admin.ulangi_pengembalian");
  return h.ok ? { ok: true, pesan: "Dana berhasil dikembalikan lewat Midtrans; paket pembeli dicabut." } : { ok: false, pesan: h.pesan.id };
}

/** Admin memilih cara pengembalian dana: manual (transfer sendiri) atau otomatis (Refund API Midtrans). */
export async function adminModeRefundAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const admin = await requireStaf();
  const mode = form.get("mode");
  if (mode !== "manual" && mode !== "otomatis") return { ok: false, pesan: "Pilih manual atau otomatis." };
  await setModeRefund(mode);
  await catatLog(admin, "ubah cara pengembalian dana", mode);
  mintaSinkronCg(); // bot ChatGerCep menjelaskan cara pengembalian dana yang berlaku
  revalidatePath("/admin/transaksi", "layout");
  catatFitur(admin.id, "admin.mode_refund");
  return { ok: true, pesan: mode === "otomatis" ? "Pengembalian dana sekarang otomatis lewat Refund API Midtrans." : "Pengembalian dana sekarang manual: admin mentransfer lalu menandai selesai." };
}

// ---------- Admin: paket, langganan, Midtrans ----------

export async function adminPaketAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const admin = await requireStaf();
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
  catatFitur(admin.id, id ? "admin.ubah_paket" : "admin.buat_paket");
  return { ok: true, pesan: id ? "Paket diperbarui." : "Paket dibuat." };
}

export async function adminHapusPaketAction(id: number): Promise<Hasil> {
  const admin = await requireStaf();
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
  catatFitur(admin.id, "admin.hapus_paket");
  return { ok: true, pesan: `Paket "${dihapus.nama}" dihapus.` };
}

/**
 * Paket Custom (Paket & harga): seluruh isian dikirim sebagai JSON di kolom "data". Nomor WhatsApp dirapikan di sini,
 * sisanya diperiksa periksaCustom; harga & jumlah nomor dihitung ulang di server (simpanPaketCustom).
 */
export async function adminPaketCustomAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const admin = await requireStaf();
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
  catatFitur(admin.id, "admin.paket_custom");
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
  const admin = await requireStaf();
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
  catatFitur(admin.id, "admin.berikan_paket");
  return {
    ok: true,
    pesan: `${h.nama} ${h.diperpanjang ? "diperpanjang" : "aktif"} untuk ${u.email} sampai ${tanggal(h.sampai)}. Pembayaran tercatat (${h.orderId}).`,
  };
}

export async function adminHentikanLanggananAction(id: number): Promise<Hasil> {
  const admin = await requireStaf();
  const u = idSah(id) ? await penggunaById(id) : undefined;
  if (!u) return { ok: false, pesan: "Pengguna tidak ditemukan." };
  await hentikanLangganan(u.id);
  await catatLog(admin, "hentikan langganan", u.email);
  revalidatePath(`/admin/pengguna/${u.id}`);
  catatFitur(admin.id, "admin.hentikan_langganan");
  return { ok: true, pesan: "Langganan dihentikan; AI akun ini berhenti membalas sampai berlangganan lagi." };
}

/** Acuan harga & margin (simulasi di /admin). terapkan=1: harga semua paket berbayar dihitung ulang di server. */
export async function adminHargaAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const admin = await requireStaf();
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
    catatFitur(admin.id, "admin.acuan_harga");
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
  catatFitur(admin.id, terapkanKomisiSaja ? "admin.terapkan_komisi" : "admin.terapkan_harga");
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
    catatFitur(user.id, "afiliasi.daftar");
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
    catatFitur(user.id, "afiliasi.ubah_profil");
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
    catatFitur(user.id, "afiliasi.tarik_komisi");
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
  const admin = await requireStaf();
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
  catatFitur(admin.id, "admin.aturan_afiliasi");
  return { ok: true, pesan: "Pengaturan program afiliasi tersimpan." };
}

export async function adminStatusAfiliatorAction(userId: number, status: StatusAfiliator): Promise<Hasil> {
  const admin = await requireStaf();
  if (!idSah(userId) || !["menunggu", "aktif", "nonaktif"].includes(status)) {
    return { ok: false, pesan: "Data tidak valid." };
  }
  return jalankanAdmin(
    [admin.id, "admin.status_afiliator"],
    async () => {
      await setStatusAfiliatorAdmin(admin, userId, status);
      return `Status afiliator diubah menjadi ${status}.`;
    },
    "/admin/afiliasi",
    "/afiliasi"
  );
}

export async function adminProsesPenarikanAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const admin = await requireStaf();
  const id = idSah(form.get("id"));
  const aksi = String(form.get("aksi") ?? "");
  if (!id || (aksi !== "manual" && aksi !== "iris" && aksi !== "tolak")) {
    return { ok: false, pesan: "Permintaan tidak valid." };
  }
  const referensi = String(form.get("referensi") ?? "");
  const catatan = String(form.get("catatan") ?? "");
  return jalankanAdmin(
    [admin.id, "admin.proses_penarikan"],
    () => prosesPenarikanAdmin(admin, id, { aksi, referensi, catatan }),
    "/admin/afiliasi",
    "/afiliasi"
  );
}

// ---------- Admin: Meta Ads Pixel ----------

export async function adminMetaPixelAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const admin = await requireStaf();
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
    catatFitur(admin.id, "admin.meta_pixel");
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
  const admin = await requireStaf();
  if (terlaluSering(`uji-px:${admin.id}`, 8, 5 * 60_000)) {
    return { ok: false, pesan: "Terlalu sering mengirim event uji. Tunggu sebentar lalu coba lagi." };
  }
  const ip = await ipKlien();
  return catatBila(await ujiCapiMetaPixel({ ip, email: admin.email }), admin.id, "admin.uji_meta_pixel");
}

// ---------- Follow-up WhatsApp nomor CS (followup.ts) ----------

export async function adminFollowupAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const admin = await requireStaf();
  const angkaForm = (k: string): number => Number(String(form.get(k) ?? "").trim());
  const nomorId = idSah(form.get("nomor_id"));
  const setelan = {
    aktif: form.get("aktif") === "on",
    nomorId,
    batasHarian: angkaForm("batas_harian"),
    jamMulai: angkaForm("jam_mulai"),
    jamSelesai: angkaForm("jam_selesai"),
    tundaJam: angkaForm("tunda_jam"),
    pengingatHari: angkaForm("pengingat_hari"),
  };
  return jalankanAdmin(
    [admin.id, "admin.followup_setelan"],
    async () => {
      const { simpanPengaturanFollowup } = await import("@/lib/followup");
      const s = await simpanPengaturanFollowup(setelan);
      await catatLog(admin, "followup_setelan", null, `${s.aktif ? "aktif" : "mati"}, ${s.batasHarian}/hari, jam ${s.jamMulai}-${s.jamSelesai}, tunda ${s.tundaJam} jam, pengingat ${s.pengingatHari} hari`);
      return s.aktif ? "Tersimpan. Follow-up aktif: akun yang kuotanya habis sedang dipindai." : "Tersimpan. Follow-up mati: tidak ada pesan yang dikirim.";
    },
    "/admin/followup",
  );
}

export async function adminLepasRemFollowupAction(): Promise<Hasil> {
  const admin = await requireStaf();
  return jalankanAdmin(
    [admin.id, "admin.followup_lepas_rem"],
    async () => {
      const { lepasRemFollowup } = await import("@/lib/followup");
      await lepasRemFollowup();
      await catatLog(admin, "followup_lepas_rem", null);
      return "Rem dilepas. Follow-up berjalan lagi di putaran berikutnya.";
    },
    "/admin/followup",
  );
}

export async function adminTautChatCsAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const admin = await requireStaf();
  const id = idSah(form.get("id"));
  if (!id) return { ok: false, pesan: "Pengguna tidak valid." };
  const nomor = String(form.get("nomor") ?? "").slice(0, 40);
  return jalankanAdmin(
    [admin.id, "admin.followup_tautkan"],
    async () => {
      const { tautkanChatCs } = await import("@/lib/followup");
      const pesan = await tautkanChatCs(id, nomor);
      await catatLog(admin, "followup_tautkan", String(id), nomor.trim() || "dilepas");
      return pesan;
    },
    `/admin/pengguna/${id}`,
    "/admin/followup",
  );
}

export async function adminAntrekanFollowupAction(id: number): Promise<Hasil> {
  const admin = await requireStaf();
  if (!idSah(id)) return { ok: false, pesan: "Pengguna tidak valid." };
  return jalankanAdmin(
    [admin.id, "admin.followup_antre_ulang"],
    async () => {
      const { antrekanUlang } = await import("@/lib/followup");
      await antrekanUlang(id);
      await catatLog(admin, "followup_antre_ulang", String(id));
      return "Diantrekan ulang. Semua pemeriksaan (jam kirim, batas harian, chat duluan) tetap berlaku.";
    },
    `/admin/pengguna/${id}`,
    "/admin/followup",
  );
}

export async function adminTulisUlangPesanFollowupAction(id: number): Promise<Hasil & { teks?: string }> {
  const admin = await requireStaf();
  if (!idSah(id)) return { ok: false, pesan: "Pengguna tidak valid." };
  try {
    const { tulisUlangPesan } = await import("@/lib/followup");
    const teks = await tulisUlangPesan(id);
    revalidatePath("/admin/followup");
    catatFitur(admin.id, "admin.followup_tulis_ulang");
    return { ok: true, pesan: "Pesan ditulis ulang.", teks };
  } catch (e) {
    return { ok: false, pesan: pesanGalat(e) };
  }
}

export async function adminSimpanPesanFollowupAction(id: number, teks: string): Promise<Hasil> {
  const admin = await requireStaf();
  if (!idSah(id)) return { ok: false, pesan: "Pengguna tidak valid." };
  return jalankanAdmin(
    [admin.id, "admin.followup_ubah_pesan"],
    async () => {
      const { simpanPesan } = await import("@/lib/followup");
      await simpanPesan(id, String(teks ?? "").slice(0, 3000));
      await catatLog(admin, "followup_ubah_pesan", String(id));
      return "Pesan disimpan. Teks inilah yang akan dikirim.";
    },
    "/admin/followup",
  );
}

// ---------- Follow-up prospek nomor CS (followup-prospek.ts) ----------

const kunciChatSah = (v: unknown): string | null => (typeof v === "string" && /^[0-9a-f]{32}$/.test(v) ? v : null);

export async function adminFollowupProspekAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const admin = await requireStaf();
  const angkaForm = (k: string): number => Number(String(form.get(k) ?? "").trim());
  const setelan = {
    aktif: form.get("aktif") === "on",
    jedaPanasJam: angkaForm("jeda_panas_jam"),
    jedaHangatJam: angkaForm("jeda_hangat_jam"),
    tahap2Jam: angkaForm("tahap2_jam"),
    tahap3Jam: angkaForm("tahap3_jam"),
    maksTahap: angkaForm("maks_tahap"),
  };
  return jalankanAdmin(
    [admin.id, "admin.followup_prospek_setelan"],
    async () => {
      const { simpanPengaturanProspek } = await import("@/lib/followup-prospek");
      const s = await simpanPengaturanProspek(setelan);
      await catatLog(admin, "followup_prospek_setelan", null, `${s.aktif ? "aktif" : "mati"}, panas ${s.jedaPanasJam} jam, hangat ${s.jedaHangatJam} jam, tahap 2 +${s.tahap2Jam} jam, tahap 3 +${s.tahap3Jam} jam, maks ${s.maksTahap} pesan`);
      return s.aktif ? "Tersimpan. Follow-up prospek aktif: lead yang diam dipindai tiap 5 menit." : "Tersimpan. Follow-up prospek mati: tidak ada pesan yang dikirim.";
    },
    "/admin/followup/prospek",
  );
}

export async function adminTulisUlangDrafProspekAction(kunci: string): Promise<Hasil & { teks?: string }> {
  const admin = await requireStaf();
  const k = kunciChatSah(kunci);
  if (!k) return { ok: false, pesan: "Chat tidak valid." };
  try {
    const { tulisUlangDrafProspek } = await import("@/lib/followup-prospek");
    const teks = await tulisUlangDrafProspek(k);
    revalidatePath("/admin/followup/prospek");
    catatFitur(admin.id, "admin.followup_prospek_tulis_ulang");
    return { ok: true, pesan: "Pesan ditulis ulang.", teks };
  } catch (e) {
    return { ok: false, pesan: pesanGalat(e) };
  }
}

export async function adminSimpanDrafProspekAction(kunci: string, teks: string): Promise<Hasil> {
  const admin = await requireStaf();
  const k = kunciChatSah(kunci);
  if (!k) return { ok: false, pesan: "Chat tidak valid." };
  return jalankanAdmin(
    [admin.id, "admin.followup_prospek_ubah_pesan"],
    async () => {
      const { simpanDrafProspek } = await import("@/lib/followup-prospek");
      await simpanDrafProspek(k, String(teks ?? "").slice(0, 3000));
      await catatLog(admin, "followup_prospek_ubah_pesan", k.slice(0, 12));
      return "Pesan disimpan. Teks inilah yang akan dikirim.";
    },
    "/admin/followup/prospek",
  );
}

export async function adminHentikanProspekAction(kunci: string): Promise<Hasil> {
  const admin = await requireStaf();
  const k = kunciChatSah(kunci);
  if (!k) return { ok: false, pesan: "Chat tidak valid." };
  return jalankanAdmin(
    [admin.id, "admin.followup_prospek_hentikan"],
    async () => {
      const { hentikanProspek } = await import("@/lib/followup-prospek");
      await hentikanProspek(k);
      await catatLog(admin, "followup_prospek_hentikan", k.slice(0, 12));
      return "Follow-up chat ini dihentikan.";
    },
    "/admin/followup/prospek",
  );
}
