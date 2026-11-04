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
import { KANAL_BAYAR, type KanalBayar, MAKS_HARGA_PAKET, METODE_BAYAR, kanalSah } from "@/lib/harga";
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
import { ATURAN_ANGKA, ATURAN_SAKLAR, MAKS_ATURAN_GLOBAL } from "@/lib/aturan";
import { type IsiKhusus, METODE_MANUAL, type MetodeManual, batalkanBayar, berikanPaketManual, hapusPaket, hentikanLangganan, mulaiBayar, ORDER_SAH, paketById, segarkanKuota, simpanPaket, terapkanSimulasi } from "@/lib/langganan";
import { MidtransError, kanalAktif, kanalBelumAktif, konfigMidtrans, setKanalMati } from "@/lib/midtrans";
import { tanggal } from "@/lib/format";
import { GalatCustom, customTampil, periksaCustom, ringkasCustom, simpanPaketCustom } from "@/lib/paket-custom";
import { KnowledgeError, hapusDokumen, pratinjauDokumen, tambahDokumen } from "@/lib/knowledge";
import { geserProduk, hapusProduk, katalogBoleh, setTersedia } from "@/lib/katalog";
import { BATAS_JEDA_DETIK, BATAS_TUNGGU_BACA_DETIK, BATAS_TUNGGU_DETIK, hapusNomor, nomorMilik, rapikanNomorWa, semuaNomor, setBelajar, setBotAktif, setSaringProspek, setSaringSpam, setTeruskan, siapDipakai, tambahNomor, ubahNomor } from "@/lib/numbers";
import { kabariPaketAktif, ujiTeruskan } from "@/lib/penerusan";
import { PERLU_PENERUS } from "@/lib/teruskan";
import { cekPassword, verifyPassword } from "@/lib/password";
import { type ItemPelajaran, daftarPelajaran, hapusPelajaran } from "@/lib/pelajaran";
import {
  PenggunaError,
  buatAkun,
  cabutSesi,
  catatLog,
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
import { GalatOtp, mintaOtp, pakaiOtp } from "@/lib/lupa-password";
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

export async function loginAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  if (!authConfigured()) return { ok: false, pesan: "AUTH_SECRET belum dikonfigurasi di server." };
  const ip = await ipKlien();
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 254);
  const password = String(form.get("password") ?? "");
  // Dua lapis: per IP (penebakan massal) dan per email (satu akun ditebak dari banyak IP; ada juga kunci akun di database).
  if (terlaluSering(`login:${ip}`, 10, 5 * 60_000) || terlaluSering(`login-email:${email}`, 20, 15 * 60_000))
    return { ok: false, pesan: "Terlalu banyak percobaan. Coba lagi beberapa menit lagi." };

  const user = email && password.length <= 200 ? await findUserByEmail(email) : undefined;
  const cocok = await verifyPassword(password, user?.password_hash ?? HASH_PALSU);
  if (user && user.kunci_sampai > sekarang())
    return { ok: false, pesan: `Akun dikunci sementara setelah ${MAKS_GAGAL_LOGIN} kali gagal masuk. Coba lagi dalam ${Math.ceil((user.kunci_sampai - sekarang()) / 60)} menit.` };
  if (!user || !cocok) {
    if (user) await catatLoginGagal(user.id);
    return { ok: false, pesan: "Email atau password salah." };
  }
  if (user.status === "diblokir") return { ok: false, pesan: `Akun Anda diblokir oleh admin${user.alasan_blokir ? `: ${user.alasan_blokir}` : "."}` };

  await catatLoginBerhasil(user.id);
  await mulaiSesi(user, await lewatHttps());
  redirect(halamanAwal(user.peran));
}

export async function daftarAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  if (!authConfigured()) return { ok: false, pesan: "AUTH_SECRET belum dikonfigurasi di server." };
  if (!(await pendaftaranDibuka())) return { ok: false, pesan: "Pendaftaran akun baru sedang ditutup oleh admin." };
  // Kolom jebakan: tidak terlihat oleh manusia, biasanya diisi bot.
  if (String(form.get("situs") ?? "")) return { ok: false, pesan: "Pendaftaran ditolak." };
  if (terlaluSering(`daftar:${await ipKlien()}`, 5, 60 * 60_000)) return { ok: false, pesan: "Terlalu banyak pendaftaran dari jaringan ini. Coba lagi nanti." };

  const nama = String(form.get("nama") ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  const email = normalkanEmail(String(form.get("email") ?? ""));
  const password = String(form.get("password") ?? "");
  if (nama.length < 2) return { ok: false, pesan: "Nama minimal 2 huruf." };
  if (!email) return { ok: false, pesan: "Email tidak valid." };
  const lemah = cekPassword(password, email);
  if (lemah) return { ok: false, pesan: lemah };
  if (password !== String(form.get("ulang") ?? "")) return { ok: false, pesan: "Ulangi password tidak sama." };
  if (form.get("setuju") !== "on") return { ok: false, pesan: "Setujui aturan penggunaan dulu." };

  await pastikanAdminAwal();
  const akun = await buatAkun({ email, nama, password });
  if (!akun) return { ok: false, pesan: "Email ini sudah terdaftar. Silakan masuk." };
  const toples = await cookies();
  const refKode = toples.get(COOKIE_REF)?.value;
  if (refKode) {
    await terapkanReferral(akun.id, refKode).catch(() => {});
    toples.delete(COOKIE_REF);
  }
  toples.set(COOKIE_PIXEL_REG, "1", { maxAge: 120, path: "/", httpOnly: false, sameSite: "lax" });
  void kirimCapiEvent({ kunci: "complete_registration", email });
  await catatLoginBerhasil(akun.id);
  await mulaiSesi(akun, await lewatHttps());
  redirect(halamanAwal(akun.peran));
}

export async function logoutAction(): Promise<void> {
  await akhiriSesi();
  redirect("/login");
}

// ---------- Akun sendiri ----------

export async function ubahProfilAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const user = await requireUser();
  const nama = String(form.get("nama") ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  if (nama.length < 2) return { ok: false, pesan: "Nama minimal 2 huruf." };
  await ubahNama(user.id, nama);
  revalidatePath("/", "layout");
  return { ok: true, pesan: "Profil tersimpan." };
}

export async function gantiPasswordAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const user = await requireUser();
  if (terlaluSering(`ganti-pw:${user.id}`, 6, 15 * 60_000)) return { ok: false, pesan: "Terlalu banyak percobaan. Coba lagi nanti." };
  const lama = String(form.get("lama") ?? "");
  const baru = String(form.get("baru") ?? "");
  const tersimpan = (await passwordHash(user.id)) ?? HASH_PALSU;
  // Akun dari Google belum punya password: boleh langsung memasang (sudah terbukti lewat sesi login yang sah).
  if (tersimpan !== TANPA_PASSWORD && !(await verifyPassword(lama, tersimpan))) return { ok: false, pesan: "Password saat ini salah." };
  const lemah = cekPassword(baru, user.email);
  if (lemah) return { ok: false, pesan: lemah };
  if (baru !== String(form.get("ulang") ?? "")) return { ok: false, pesan: "Ulangi password baru tidak sama." };
  if (tersimpan !== TANPA_PASSWORD && baru === lama) return { ok: false, pesan: "Password baru harus berbeda." };
  // Sesi lain batal karena sidik hash password berubah; sesi di perangkat ini diperbarui.
  await mulaiSesi(await gantiPassword(user.id, baru), await lewatHttps());
  revalidatePath("/akun");
  return { ok: true, pesan: tersimpan === TANPA_PASSWORD ? "Password terpasang. Sekarang bisa masuk juga dengan email." : "Password diganti. Perangkat lain otomatis keluar." };
}

/**
 * Lupa password langkah 1: kirim kode OTP ke email. Jawabannya sama untuk email terdaftar maupun tidak; dibatasi per
 * IP dan per email (mencegah email dibanjiri kode), ditambah jeda 60 detik per akun di lupa-password.ts.
 */
export async function mintaOtpAction(_lalu: Hasil | null, form: FormData): Promise<Hasil & { email?: string }> {
  const email = normalkanEmail(String(form.get("email") ?? ""));
  if (!email) return { ok: false, pesan: "Email tidak valid." };
  if (terlaluSering(`otp:${await ipKlien()}`, 5, 15 * 60_000) || terlaluSering(`otp-email:${email}`, 3, 15 * 60_000))
    return { ok: false, pesan: "Terlalu banyak permintaan kode. Coba lagi beberapa menit lagi." };
  try {
    await mintaOtp(email);
  } catch (e) {
    if (e instanceof GalatOtp) return { ok: false, pesan: e.message };
    throw e;
  }
  return { ok: true, pesan: `Bila ${email} terdaftar, kode 6 digit sudah dikirim ke sana. Cek juga folder Spam atau Promosi.`, email };
}

/** Lupa password langkah 2: kode OTP + password baru. Berhasil = semua sesi lama keluar, lalu langsung masuk. */
export async function resetPasswordOtpAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  if (!authConfigured()) return { ok: false, pesan: "AUTH_SECRET belum dikonfigurasi di server." };
  if (terlaluSering(`otp-pakai:${await ipKlien()}`, 20, 15 * 60_000)) return { ok: false, pesan: "Terlalu banyak percobaan. Coba lagi beberapa menit lagi." };
  const email = String(form.get("email") ?? "").slice(0, 254);
  const baru = String(form.get("baru") ?? "");
  // Password diperiksa dulu supaya password yang ditolak tidak menghabiskan jatah percobaan kode.
  const lemah = cekPassword(baru, email);
  if (lemah) return { ok: false, pesan: lemah };
  if (baru !== String(form.get("ulang") ?? "")) return { ok: false, pesan: "Ulangi password baru tidak sama." };
  let u;
  try {
    u = await pakaiOtp(email, String(form.get("kode") ?? ""), baru);
  } catch (e) {
    if (e instanceof GalatOtp) return { ok: false, pesan: e.message };
    throw e;
  }
  if (u.status !== "aktif") return { ok: true, pesan: "Password sudah diganti, tetapi akun Anda sedang diblokir admin." };
  await mulaiSesi(u, await lewatHttps());
  redirect(halamanAwal(u.peran));
}

export async function keluarSemuaAction(): Promise<Hasil> {
  const user = await requireUser();
  await mulaiSesi(await cabutSesi(user.id), await lewatHttps());
  return { ok: true, pesan: "Semua perangkat lain sudah dikeluarkan." };
}

// ---------- Koneksi WhatsApp ----------

const pesanGalat = (e: unknown): string =>
  e instanceof WaError || e instanceof KnowledgeError || e instanceof PenggunaError || e instanceof AfiliasiError ? e.message : "Terjadi kesalahan. Coba lagi.";

export async function hubungkanWaAction(id: number): Promise<Hasil> {
  const nomor = await nomorUntuk(await requireUser(), id);
  if (!nomor) return { ok: false, pesan: "Nomor tidak ditemukan." };
  try {
    await hubungkan(nomor.sesi);
    return { ok: true };
  } catch (e) {
    return { ok: false, pesan: pesanGalat(e) };
  }
}

export async function kodePairingWaAction(id: number, telepon: string): Promise<Hasil & { kode?: string }> {
  const nomor = await nomorUntuk(await requireUser(), id);
  if (!nomor) return { ok: false, pesan: "Nomor tidak ditemukan." };
  try {
    const kode = await mintaKodePairing(nomor.sesi, telepon);
    return { ok: true, kode };
  } catch (e) {
    return { ok: false, pesan: pesanGalat(e) };
  }
}

export async function logoutWaAction(id: number): Promise<Hasil> {
  const nomor = await nomorUntuk(await requireUser(), id);
  if (!nomor) return { ok: false, pesan: "Nomor tidak ditemukan." };
  try {
    await logout(nomor.sesi);
    return { ok: true };
  } catch (e) {
    return { ok: false, pesan: pesanGalat(e) };
  }
}

// ---------- Nomor ----------

// Tiap nomor terhubung = satu soket WebSocket di proses ini; batas total server ini hanya pengaman memori.
const MAKS_NOMOR = Math.max(1, Number(process.env.MAKS_NOMOR) || 250);

/** Tambah nomor (dalam kuota akun): buat jalurnya, nyalakan sesi WhatsApp-nya, lalu buka halamannya (QR langsung tampil). */
export async function tambahNomorAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const user = await requireUser();
  const label = String(form.get("label") ?? "").trim().slice(0, 60);
  if (!label) return { ok: false, pesan: "Nama nomor wajib diisi." };
  const kuota = await kuotaNomor(user);
  if (kuota !== null && (await nomorMilik(user.id)).length >= kuota)
    return { ok: false, pesan: kuota === 0 ? "Akun Anda belum diberi kuota nomor. Hubungi admin." : `Kuota akun Anda ${kuota} nomor. Hubungi admin untuk menambah kuota.` };
  if ((await semuaNomor()).length >= MAKS_NOMOR) return { ok: false, pesan: "Kapasitas server sedang penuh. Coba lagi nanti atau hubungi admin." };
  const nomor = await tambahNomor(label, user.id);
  // Gagal menyalakan sesi tidak membatalkan pembuatan: tombol "Hubungkan" di halamannya bisa mengulang.
  await hubungkan(nomor.sesi).catch(() => {});
  // "layout": daftar nomor di sidebar ikut diperbarui, bukan hanya halamannya.
  revalidatePath("/", "layout");
  redirect(`/nomor/${nomor.id}`);
}

export async function ubahNomorAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const user = await requireUser();
  const id = Number(form.get("id"));
  const label = String(form.get("label") ?? "").trim().slice(0, 60);
  const instruksi = String(form.get("instruksi") ?? "").trim().slice(0, 2000);
  if (!(await nomorUntuk(user, id))) return { ok: false, pesan: "Nomor tidak ditemukan." };
  if (!label) return { ok: false, pesan: "Nama nomor wajib diisi." };
  const tungguDetik = Math.round(Number(form.get("tunggu_detik")));
  const tungguBacaDetik = Math.round(Number(form.get("tunggu_baca_detik")));
  // Lama AI diam diisi dengan satuan pilihan (detik/menit), disimpan dalam detik.
  const jedaNilai = Math.round(Number(form.get("jeda_nilai")));
  const jedaDetik = form.get("jeda_satuan") === "detik" ? jedaNilai : jedaNilai * 60;
  if (!(tungguDetik >= BATAS_TUNGGU_DETIK.min && tungguDetik <= BATAS_TUNGGU_DETIK.maks))
    return { ok: false, pesan: `Waktu tunggu harus ${BATAS_TUNGGU_DETIK.min}–${BATAS_TUNGGU_DETIK.maks} detik.` };
  if (!(tungguBacaDetik >= BATAS_TUNGGU_BACA_DETIK.min && tungguBacaDetik <= BATAS_TUNGGU_BACA_DETIK.maks))
    return { ok: false, pesan: `Waktu setelah chat dibuka harus ${BATAS_TUNGGU_BACA_DETIK.min}–${BATAS_TUNGGU_BACA_DETIK.maks} detik.` };
  if (!(jedaDetik >= BATAS_JEDA_DETIK.min && jedaDetik <= BATAS_JEDA_DETIK.maks))
    return { ok: false, pesan: "Lama AI diam harus 0 sampai 24 jam (1.440 menit atau 86.400 detik)." };
  await ubahNomor(id, { label, instruksi, tungguDetik, tungguBacaDetik, jedaDetik });
  revalidatePath("/", "layout"); // nama nomor juga tampil di sidebar
  return { ok: true, pesan: "Tersimpan." };
}

export async function setBotAktifAction(id: number, aktif: boolean): Promise<Hasil> {
  const nomor = await nomorUntuk(await requireUser(), id);
  if (!nomor) return { ok: false, pesan: "Nomor tidak ditemukan." };
  if (aktif && !siapDipakai(nomor)) return { ok: false, pesan: PERLU_PENERUS };
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
  if (!nomor) return { ok: false, pesan: "Nomor tidak ditemukan." };
  // Sesi WhatsApp-nya ikut dihapus (perangkat tertaut dicabut). Bila itu gagal, nomor tidak dihapus
  // supaya tidak tertinggal sesi yatim yang masih terhubung ke WhatsApp.
  try {
    await hapusSesi(nomor.sesi);
  } catch (e) {
    return { ok: false, pesan: pesanGalat(e) };
  }
  await hapusNomor(id);
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

// ---------- Teruskan ke pemilik ----------

/** Nomor WhatsApp pribadi penerima pesan yang diteruskan AI (pesanan, bukti bayar, keluhan) + saklar aktif. */
export async function teruskanAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const id = Number(form.get("number_id"));
  const nomor = await nomorUntuk(await requireUser(), id);
  if (!nomor) return { ok: false, pesan: "Nomor tidak ditemukan." };
  const mentah = String(form.get("teruskan_ke") ?? "").trim();
  // Wajib diisi: tanpa nomor penerus, nomor bisnis tidak bisa dipakai (lihat siapDipakai).
  if (!mentah) return { ok: false, pesan: "Nomor WhatsApp penerus wajib diisi. Tanpa nomor ini AI tidak membalas di nomor bisnis ini." };
  const ke = rapikanNomorWa(mentah);
  if (!ke) return { ok: false, pesan: "Nomor WhatsApp tidak valid. Contoh: 0812 3456 7890 atau +62 812 3456 7890." };
  if (ke === nomor.wa_id) return { ok: false, pesan: "Isi dengan nomor lain (WhatsApp pribadi Anda), bukan nomor bisnis yang dibalas AI ini." };
  await setTeruskan(id, { ke, aktif: true }); // penerusan selalu aktif selama nomor penerus terisi
  revalidatePath("/dashboard");
  revalidatePath(`/nomor/${id}`);
  return { ok: true, pesan: "Tersimpan. Pesanan, keluhan, bukti bayar, dan hal penting lain selalu diteruskan ke nomor ini." };
}

// ---------- Katalog produk (tambah/ubah lewat /api/katalog karena membawa foto) ----------

async function produkMilik(numberId: number, tulis: boolean): Promise<{ id: number } | null> {
  const user = await requireUser();
  const nomor = await nomorUntuk(user, numberId);
  if (!nomor) return null;
  if (tulis && user.peran !== "admin" && !(await katalogBoleh(nomor.user_id))) return null;
  return { id: nomor.id };
}

export async function hapusProdukAction(numberId: number, id: number): Promise<Hasil> {
  const n = await produkMilik(numberId, false); // menghapus tetap boleh walau paket sudah habis
  if (!n || !Number.isInteger(id)) return { ok: false, pesan: "Produk tidak ditemukan." };
  await hapusProduk(n.id, id);
  revalidatePath(`/nomor/${n.id}`);
  return { ok: true, pesan: "Produk dihapus." };
}

export async function tersediaProdukAction(numberId: number, id: number, tersedia: boolean): Promise<Hasil> {
  const n = await produkMilik(numberId, true);
  if (!n || !Number.isInteger(id)) return { ok: false, pesan: "Katalog tidak bisa diubah." };
  await setTersedia(n.id, id, tersedia);
  revalidatePath(`/nomor/${n.id}`);
  return { ok: true };
}

export async function geserProdukAction(numberId: number, id: number, arah: -1 | 1): Promise<Hasil> {
  const n = await produkMilik(numberId, true);
  if (!n || !Number.isInteger(id) || (arah !== -1 && arah !== 1)) return { ok: false, pesan: "Katalog tidak bisa diubah." };
  await geserProduk(n.id, id, arah);
  revalidatePath(`/nomor/${n.id}`);
  return { ok: true };
}

/** Kirim pesan uji dari nomor bisnis ke nomor pribadi: memastikan nomornya benar & WhatsApp-nya menerima. */
export async function ujiTeruskanAction(id: number): Promise<Hasil> {
  const user = await requireUser();
  const nomor = await nomorUntuk(user, id);
  if (!nomor) return { ok: false, pesan: "Nomor tidak ditemukan." };
  if (!nomor.teruskan_ke) return { ok: false, pesan: "Simpan nomor WhatsApp penerima dulu." };
  if (terlaluSering(`uji-teruskan:${user.id}`, 5, 10 * 60_000)) return { ok: false, pesan: "Terlalu sering. Coba lagi beberapa menit lagi." };
  try {
    await ujiTeruskan(nomor, nomor.teruskan_ke);
  } catch (e) {
    return { ok: false, pesan: `Gagal mengirim: ${pesanGalat(e)} Pastikan nomor bisnis ini sedang terhubung.` };
  }
  revalidatePath(`/nomor/${id}`);
  return { ok: true, pesan: "Pesan uji terkirim. Cek WhatsApp pribadi Anda." };
}

// ---------- Base knowledge ----------

export async function tambahTeksAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const numberId = Number(form.get("number_id"));
  const user = await requireUser();
  if (!(await nomorUntuk(user, numberId))) return { ok: false, pesan: "Nomor tidak ditemukan." };
  const judul = String(form.get("judul") ?? "").trim();
  if (!judul) return { ok: false, pesan: "Judul wajib diisi." };
  // `ganti_id`: dokumen lama yang disempurnakan; dihapus setelah versi barunya tersimpan (tidak pernah keduanya hilang).
  const gantiId = Number(form.get("ganti_id"));
  try {
    await tambahDokumen({ numberId, judul, sumber: "teks", teks: String(form.get("isi") ?? "") });
    if (Number.isInteger(gantiId) && gantiId > 0) await hapusDokumen(gantiId, numberId, user.peran === "admin");
  } catch (e) {
    return { ok: false, pesan: pesanGalat(e) };
  }
  revalidatePath("/dashboard");
  revalidatePath(`/nomor/${numberId}`);
  return { ok: true, pesan: gantiId > 0 ? "Dokumen diperbarui." : "Tersimpan ke base knowledge." };
}

export async function hapusDokumenAction(id: number, numberId: number): Promise<Hasil> {
  const user = await requireUser();
  if (!(await nomorUntuk(user, numberId))) return { ok: false, pesan: "Nomor tidak ditemukan." };
  await hapusDokumen(id, numberId, user.peran === "admin");
  revalidatePath("/dashboard");
  revalidatePath(`/nomor/${numberId}`);
  return { ok: true };
}

// ---------- Histori percakapan ----------

/** Hapus satu percakapan (`percakapanId`) atau seluruh histori percakapan sebuah nomor. */
export async function hapusPercakapanAction(numberId: number, percakapanId?: number): Promise<Hasil> {
  if (!(await nomorUntuk(await requireUser(), numberId))) return { ok: false, pesan: "Nomor tidak ditemukan." };
  if (percakapanId !== undefined && !Number.isInteger(percakapanId)) return { ok: false, pesan: "Percakapan tidak valid." };
  const n = await hapusPercakapan(numberId, percakapanId);
  revalidatePath("/dashboard");
  revalidatePath(`/nomor/${numberId}`);
  return { ok: true, pesan: `${n} percakapan dihapus.` };
}

/** Pemilik menandai sebuah chat "bukan spam": AI tidak menyaring chat itu lagi (berlaku di pesan berikutnya). */
export async function bukanSpamAction(numberId: number, percakapanId: number): Promise<Hasil> {
  if (!(await nomorUntuk(await requireUser(), numberId))) return { ok: false, pesan: "Nomor tidak ditemukan." };
  if (!Number.isInteger(percakapanId)) return { ok: false, pesan: "Percakapan tidak valid." };
  if (!(await tandaiBukanSpam(numberId, percakapanId))) return { ok: false, pesan: "Percakapan tidak ditemukan." };
  return { ok: true, pesan: "Ditandai bukan spam. Pesan berikutnya dari kontak ini dijawab AI seperti biasa." };
}

/** Chat yang dibisukan penyaring prospek dilayani AI lagi mulai pesan berikutnya (opsional; penyaring belajar dari ini). */
export async function bangunkanChatAction(numberId: number, percakapanId: number): Promise<Hasil> {
  if (!(await nomorUntuk(await requireUser(), numberId))) return { ok: false, pesan: "Nomor tidak ditemukan." };
  if (!Number.isInteger(percakapanId)) return { ok: false, pesan: "Percakapan tidak valid." };
  const kunci = await kunciPercakapan(numberId, percakapanId);
  if (!kunci) return { ok: false, pesan: "Percakapan tidak ditemukan." };
  await bangunkanChat(numberId, kunci);
  return { ok: true, pesan: "Pesan berikutnya dari kontak ini dijawab AI lagi." };
}

export async function setSaringProspekAction(id: number, aktif: boolean): Promise<Hasil> {
  if (!(await nomorUntuk(await requireUser(), id))) return { ok: false, pesan: "Nomor tidak ditemukan." };
  await setSaringProspek(id, aktif);
  revalidatePath(`/nomor/${id}`);
  return { ok: true };
}

export async function setSaringSpamAction(id: number, aktif: boolean): Promise<Hasil> {
  if (!(await nomorUntuk(await requireUser(), id))) return { ok: false, pesan: "Nomor tidak ditemukan." };
  await setSaringSpam(id, aktif);
  revalidatePath(`/nomor/${id}`);
  return { ok: true };
}

// ---------- Belajar dari balasan manusia ----------

export async function setBelajarAction(id: number, aktif: boolean): Promise<Hasil> {
  if (!(await nomorUntuk(await requireUser(), id))) return { ok: false, pesan: "Nomor tidak ditemukan." };
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
  if (!(await nomorUntuk(await requireUser(), numberId))) return { ok: false, pesan: "Nomor tidak ditemukan." };
  if (id !== undefined && !Number.isInteger(id)) return { ok: false, pesan: "Data tidak valid." };
  const n = await hapusPelajaran(numberId, id);
  revalidatePath(`/nomor/${numberId}`);
  return { ok: true, pesan: `${n} pelajaran dihapus.` };
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

/** Aturan sistem (src/lib/aturan.ts): batas laju, panjang balasan, peringatan kuota, penerusan, aturan global semua bot. */
export async function adminAturanAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const admin = await requireAdmin();
  const nilai: [string, string][] = [];
  for (const [k, a] of Object.entries(ATURAN_ANGKA)) {
    const v = Number(form.get(k));
    if (!(Number.isInteger(v) && v >= a.min && v <= a.max)) return { ok: false, pesan: `${a.label}: harus ${a.min}–${a.max} ${a.satuan}.` };
    nilai.push([k, String(v)]);
  }
  for (const k of Object.keys(ATURAN_SAKLAR)) nilai.push([k, form.get(k) === "on" ? "1" : "0"]);
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
  if (terlaluSering(`bayar:${user.id}`, 10, 10 * 60_000)) return { ok: false, pesan: "Terlalu banyak percobaan. Coba lagi beberapa menit lagi." };
  const k = await konfigMidtrans();
  if (!k) return { ok: false, pesan: "Pembayaran belum diaktifkan admin." };
  if (!kanalSah(kanal)) return { ok: false, pesan: "Metode pembayaran ini sedang tidak tersedia. Pilih metode lain." };
  if (!(await kanalAktif()).includes(kanal)) return { ok: false, pesan: "Metode pembayaran ini sedang tidak tersedia. Pilih metode lain.", kanalMati: kanal };
  const paket = Number.isInteger(paketId) ? await paketById(paketId) : undefined;
  if (!paket || !paket.aktif || paket.harga < 1) return { ok: false, pesan: "Paket tidak ditemukan." };
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
      return { ok: false, pesan: `${KANAL_BAYAR[kanal].label} belum tersedia. Pilih metode pembayaran lain.`, kanalMati: kanal };
    }
    return { ok: false, pesan: e instanceof MidtransError ? "Tagihan sedang tidak bisa dibuat. Coba lagi sebentar lagi atau pilih metode lain." : "Terjadi kesalahan. Coba lagi." };
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
  const k = await konfigMidtrans();
  if (!k || !ORDER_SAH.test(orderId)) return { ok: false, pesan: "Tagihan tidak ditemukan." };
  try {
    const status = await batalkanBayar(k, user.id, orderId);
    if (!status) return { ok: false, pesan: "Tagihan tidak ditemukan." };
    revalidatePath("/langganan");
    return status === "dibatalkan" ? { ok: true, status } : { ok: false, status, pesan: status === "lunas" ? "Tagihan ini sudah dibayar." : "Tagihan ini sudah tidak bisa dibatalkan." };
  } catch {
    return { ok: false, pesan: "Tagihan belum bisa dibatalkan. Coba lagi sebentar lagi." };
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
  const kabar = form.get("kabari") === "on" ? await kabariPaketAktif(u.id, h) : null;
  await catatLog(
    admin,
    h.diperpanjang ? "perpanjang paket" : "berikan paket",
    u.email,
    `${namaPaket}${isi ? " (isi khusus)" : ""} · ${h.kuota_balasan.toLocaleString("id-ID")} balasan · ${h.kuota_nomor} nomor · sampai ${tanggal(h.sampai)} · ${METODE_MANUAL[metode as MetodeManual]} Rp${h.jumlah.toLocaleString("id-ID")}${catatan ? ` · ${catatan}` : ""}`
  );
  revalidatePath(`/admin/pengguna/${u.id}`);
  revalidatePath("/admin/transaksi");
  const pesanKabar = kabar === "terkirim" ? " Pelanggan sudah dikabari lewat WhatsApp." : kabar === "gagal" ? " Kabar WhatsApp gagal terkirim." : kabar === "dilewati" ? " Kabar WhatsApp dilewati (tidak ada nomor yang tersambung dengan nomor penerus)." : "";
  return {
    ok: true,
    pesan: `${h.nama} ${h.diperpanjang ? "diperpanjang" : "aktif"} untuk ${u.email} sampai ${tanggal(h.sampai)}. Pembayaran tercatat (${h.orderId}).${pesanKabar}`,
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
  if (terlaluSering(`daftar-af:${user.id}`, 6, 10 * 60_000)) {
    return { ok: false, pesan: "Terlalu banyak percobaan. Coba lagi beberapa menit lagi." };
  }
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
          ? "Selamat! Akun afiliasi Anda sudah aktif. Bagikan tautan Anda untuk mulai mendapat komisi."
          : "Pendaftaran afiliasi berhasil dikirim dan sedang menunggu persetujuan admin.",
    };
  } catch (e) {
    return { ok: false, pesan: pesanGalat(e) };
  }
}

export async function ubahAfiliasiAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const user = await requireUser();
  const kode = String(form.get("kode") ?? "");
  const bankNama = String(form.get("bank_nama") ?? "");
  const bankNomor = String(form.get("bank_nomor") ?? "");
  const bankPemilik = String(form.get("bank_pemilik") ?? "");
  try {
    await ubahProfilAfiliator(user.id, { kode, bankNama, bankNomor, bankPemilik });
    revalidatePath("/afiliasi");
    revalidatePath("/admin/afiliasi");
    return { ok: true, pesan: "Profil & rekening pencairan berhasil diperbarui." };
  } catch (e) {
    return { ok: false, pesan: pesanGalat(e) };
  }
}

export async function tarikKomisiAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const user = await requireUser();
  if (terlaluSering(`tarik-af:${user.id}`, 5, 10 * 60_000)) {
    return { ok: false, pesan: "Terlalu banyak percobaan. Coba lagi beberapa menit lagi." };
  }
  const nominal = Number(String(form.get("nominal") ?? "").replace(/[^\d]/g, ""));
  try {
    const p = await ajukanPenarikan(user.id, nominal);
    revalidatePath("/afiliasi");
    revalidatePath("/admin/afiliasi");
    return {
      ok: true,
      pesan: `Pengajuan penarikan Rp${p.nominal.toLocaleString("id-ID")} berhasil dikirim dan akan segera diproses.`,
    };
  } catch (e) {
    return { ok: false, pesan: pesanGalat(e) };
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
