"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { nomorUntuk } from "@/lib/akses";
import { kunciAnthropic, modelAnthropic } from "@/lib/ai";
import { samarkan, simpanRahasia } from "@/lib/rahasia";
import { authConfigured } from "@/lib/auth";
import { ipKlien, lewatHttps, terlaluSering } from "@/lib/batas";
import { sekarang, setSetting } from "@/lib/db";
import { KnowledgeError, hapusDokumen, pratinjauDokumen, tambahDokumen } from "@/lib/knowledge";
import { BATAS_JEDA_DETIK, BATAS_TUNGGU_BACA_DETIK, BATAS_TUNGGU_DETIK, hapusNomor, nomorMilik, semuaNomor, setBelajar, setBotAktif, tambahNomor, ubahNomor } from "@/lib/numbers";
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
  setBlokir,
  setKuota,
  setPeran,
  TANPA_PASSWORD,
  ubahNama,
} from "@/lib/pengguna";
import { hapusPercakapan } from "@/lib/percakapan";
import { konfigurasi as konfigurasiSinkron, setNomorSinkron, statusSinkron } from "@/lib/sinkron";
import {
  MAKS_GAGAL_LOGIN,
  akhiriSesi,
  catatLoginBerhasil,
  catatLoginGagal,
  findUserByEmail,
  kuotaNomor,
  mulaiSesi,
  pendaftaranDibuka,
  requireAdmin,
  requireUser,
} from "@/lib/session";
import { WaError, hapusSesi, hubungkan, logout } from "@/lib/wa";

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
  redirect("/dashboard");
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

  const akun = await buatAkun({ email, nama, password });
  if (!akun) return { ok: false, pesan: "Email ini sudah terdaftar. Silakan masuk." };
  await catatLoginBerhasil(akun.id);
  await mulaiSesi(akun, await lewatHttps());
  redirect("/dashboard");
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

export async function keluarSemuaAction(): Promise<Hasil> {
  const user = await requireUser();
  await mulaiSesi(await cabutSesi(user.id), await lewatHttps());
  return { ok: true, pesan: "Semua perangkat lain sudah dikeluarkan." };
}

// ---------- Koneksi WhatsApp ----------

const pesanGalat = (e: unknown): string =>
  e instanceof WaError || e instanceof KnowledgeError || e instanceof PenggunaError ? e.message : "Terjadi kesalahan. Coba lagi.";

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
const MAKS_NOMOR = Math.max(1, Number(process.env.MAKS_NOMOR) || 30);

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
  if (!(await nomorUntuk(await requireUser(), id))) return { ok: false, pesan: "Nomor tidak ditemukan." };
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

// ---------- Base knowledge ----------

export async function tambahTeksAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const numberId = Number(form.get("number_id"));
  if (!(await nomorUntuk(await requireUser(), numberId))) return { ok: false, pesan: "Nomor tidak ditemukan." };
  const judul = String(form.get("judul") ?? "").trim();
  if (!judul) return { ok: false, pesan: "Judul wajib diisi." };
  try {
    await tambahDokumen({ numberId, judul, sumber: "teks", teks: String(form.get("isi") ?? "") });
  } catch (e) {
    return { ok: false, pesan: pesanGalat(e) };
  }
  revalidatePath("/dashboard");
  revalidatePath(`/nomor/${numberId}`);
  return { ok: true, pesan: "Teks ditambahkan." };
}

export async function hapusDokumenAction(id: number, numberId: number): Promise<Hasil> {
  if (!(await nomorUntuk(await requireUser(), numberId))) return { ok: false, pesan: "Nomor tidak ditemukan." };
  await hapusDokumen(id, numberId);
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
  if (!(await nomorUntuk(await requireUser(), numberId))) return null;
  return pratinjauDokumen(id, numberId);
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

export async function adminHapusAction(id: number, konfirmasi: string): Promise<Hasil> {
  const admin = await requireAdmin();
  const u = idSah(id) ? await penggunaById(id) : undefined;
  if (!u) return { ok: false, pesan: "Pengguna tidak ditemukan." };
  if (konfirmasi.trim().toLowerCase() !== u.email) return { ok: false, pesan: "Ketik email pengguna persis untuk konfirmasi." };
  if (u.id === admin.id) return { ok: false, pesan: "Anda tidak bisa menghapus akun Anda sendiri." };
  try {
    // Sesi WhatsApp tiap nomor dicabut dulu; bila satu gagal, akun tidak dihapus (tidak ada sesi yatim).
    for (const n of await nomorMilik(id)) await hapusSesi(n.sesi);
    await hapusPengguna(admin, id);
  } catch (e) {
    return { ok: false, pesan: pesanGalat(e) };
  }
  revalidatePath("/admin");
  redirect("/admin");
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
  revalidatePath("/admin");
  return { ok: true, pesan: `Akun ${email} dibuat.` };
}

export async function adminPengaturanAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const admin = await requireAdmin();
  const buka = form.get("pendaftaran") === "on";
  const kuota = Number(form.get("kuota_bawaan"));
  if (!(Number.isInteger(kuota) && kuota >= 0 && kuota <= 100)) return { ok: false, pesan: "Kuota bawaan harus 0–100 nomor." };
  await setSetting("pendaftaran", buka ? "buka" : "tutup");
  await setSetting("kuota_bawaan", String(kuota));
  await catatLog(admin, "ubah pengaturan", null, `pendaftaran ${buka ? "dibuka" : "ditutup"}, kuota bawaan ${kuota}`);
  revalidatePath("/admin");
  return { ok: true, pesan: "Pengaturan tersimpan." };
}

/** Penyedia & model AI untuk semua nomor. Berlaku langsung (dibaca tiap giliran), tanpa restart/deploy. */
export async function adminAiAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const admin = await requireAdmin();
  const penyedia = form.get("penyedia") === "anthropic" ? "anthropic" : "hermes";
  const model = String(form.get("model") ?? "").trim();
  const cadangan = String(form.get("cadangan") ?? "").trim();
  const sah = /^claude-[a-z0-9.-]+$/i;
  if (penyedia === "anthropic" && !(await kunciAnthropic())) return { ok: false, pesan: "Isi API key Anthropic dulu." };
  if (!sah.test(model) || (cadangan && !sah.test(cadangan))) return { ok: false, pesan: "Nama model tidak valid (contoh: claude-haiku-5-5)." };
  await setSetting("ai_penyedia", penyedia);
  await setSetting("ai_model", model);
  await setSetting("ai_cadangan", cadangan);
  await catatLog(admin, "ubah mesin AI", null, `${penyedia}${penyedia === "anthropic" ? ` · ${model}${cadangan ? ` (cadangan ${cadangan})` : ""}` : ""}`);
  revalidatePath("/admin");
  return { ok: true, pesan: penyedia === "anthropic" ? `Semua nomor kini memakai Claude API (${model}).` : "Semua nomor kini memakai Hermes." };
}

/**
 * Simpan (atau hapus, bila kosong) API key Anthropic. Kunci diuji dulu ke Anthropic (daftar model) supaya kunci
 * salah tidak pernah tersimpan; disimpan terenkripsi dan tidak pernah dikirim balik ke browser.
 */
export async function adminKunciAiAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const admin = await requireAdmin();
  if (terlaluSering(`kunci-ai:${admin.id}`, 10, 10 * 60_000)) return { ok: false, pesan: "Terlalu banyak percobaan. Coba lagi nanti." };
  const kunci = String(form.get("kunci") ?? "").trim();
  if (form.get("hapus") === "1") {
    await simpanRahasia("anthropic", "");
    await setSetting("ai_penyedia", "hermes"); // tanpa kunci, Claude API tidak bisa dipakai: kembali ke Hermes
    await catatLog(admin, "hapus API key Anthropic", null);
    revalidatePath("/admin");
    return { ok: true, pesan: "API key dihapus. Semua nomor memakai Hermes." };
  }
  if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(kunci)) return { ok: false, pesan: "Format API key tidak dikenali (diawali sk-ant-)." };
  const model = await modelAnthropic(kunci);
  if (!model) return { ok: false, pesan: "Anthropic menolak kunci ini (salah, dicabut, atau tidak terjangkau)." };
  await simpanRahasia("anthropic", kunci);
  await catatLog(admin, "simpan API key Anthropic", null, samarkan(kunci));
  revalidatePath("/admin");
  return { ok: true, pesan: `Kunci valid dan tersimpan terenkripsi (${model.length} model tersedia).` };
}
