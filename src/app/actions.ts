"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { nomorUntuk } from "@/lib/akses";
import { kunciAnthropic, kursUsd, perkiraanPerBalasan } from "@/lib/ai";
import { MAKS_HARGA_PAKET, METODE_BAYAR } from "@/lib/harga";
import { authConfigured } from "@/lib/auth";
import { asalAplikasi, ipKlien, lewatHttps, terlaluSering } from "@/lib/batas";
import { sekarang, setSetting } from "@/lib/db";
import { ATURAN_ANGKA, ATURAN_SAKLAR, MAKS_ATURAN_GLOBAL } from "@/lib/aturan";
import { berikanPaket, hentikanLangganan, mulaiBayar, paketById, riwayatTransaksi, segarkanKuota, simpanPaket, terapkanSimulasi, terapkanStatus } from "@/lib/langganan";
import { MidtransError, konfigMidtrans } from "@/lib/midtrans";
import { GalatCustom, customTampil, periksaCustom, ringkasCustom, simpanPaketCustom } from "@/lib/paket-custom";
import { KnowledgeError, hapusDokumen, pratinjauDokumen, tambahDokumen } from "@/lib/knowledge";
import { BATAS_JEDA_DETIK, BATAS_TUNGGU_BACA_DETIK, BATAS_TUNGGU_DETIK, hapusNomor, nomorMilik, rapikanNomorWa, semuaNomor, setBelajar, setBotAktif, setSaringSpam, setTeruskan, siapDipakai, tambahNomor, ubahNomor } from "@/lib/numbers";
import { ujiTeruskan } from "@/lib/penerusan";
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
import { hapusPercakapan, tandaiBukanSpam } from "@/lib/percakapan";
import { konfigurasi as konfigurasiSinkron, setNomorSinkron, statusSinkron } from "@/lib/sinkron";
import {
  MAKS_GAGAL_LOGIN,
  akhiriSesi,
  catatLoginBerhasil,
  catatLoginGagal,
  findUserByEmail,
  kuotaNomor,
  mulaiSesi,
  pastikanAdminAwal,
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

  await pastikanAdminAwal();
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
  const aktif = form.get("aktif") === "on";
  // Wajib diisi: tanpa nomor penerus, nomor bisnis tidak bisa dipakai (lihat siapDipakai).
  if (!mentah) return { ok: false, pesan: "Nomor WhatsApp penerus wajib diisi. Tanpa nomor ini AI tidak membalas di nomor bisnis ini." };
  const ke = rapikanNomorWa(mentah);
  if (!ke) return { ok: false, pesan: "Nomor WhatsApp tidak valid. Contoh: 0812 3456 7890 atau +62 812 3456 7890." };
  if (ke === nomor.wa_id) return { ok: false, pesan: "Isi dengan nomor lain (WhatsApp pribadi Anda), bukan nomor bisnis yang dibalas AI ini." };
  await setTeruskan(id, { ke, aktif });
  revalidatePath("/dashboard");
  revalidatePath(`/nomor/${id}`);
  return { ok: true, pesan: aktif ? "Tersimpan. AI akan meneruskan hal penting ke nomor ini." : "Tersimpan. Penerusan dimatikan." };
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

/** Pemilik menandai sebuah chat "bukan spam": AI tidak menyaring chat itu lagi (berlaku di pesan berikutnya). */
export async function bukanSpamAction(numberId: number, percakapanId: number): Promise<Hasil> {
  if (!(await nomorUntuk(await requireUser(), numberId))) return { ok: false, pesan: "Nomor tidak ditemukan." };
  if (!Number.isInteger(percakapanId)) return { ok: false, pesan: "Percakapan tidak valid." };
  if (!(await tandaiBukanSpam(numberId, percakapanId))) return { ok: false, pesan: "Percakapan tidak ditemukan." };
  return { ok: true, pesan: "Ditandai bukan spam. Pesan berikutnya dari kontak ini dijawab AI seperti biasa." };
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
  revalidatePath("/admin", "layout");
  redirect("/admin/pengguna");
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
  const balasan = Number(form.get("kuota_balasan_gratis"));
  if (!(Number.isInteger(kuota) && kuota >= 0 && kuota <= 100)) return { ok: false, pesan: "Kuota bawaan harus 0–100 nomor." };
  if (!(Number.isInteger(balasan) && balasan >= 0 && balasan <= 1_000_000)) return { ok: false, pesan: "Kuota balasan gratis tidak valid." };
  await setSetting("pendaftaran", buka ? "buka" : "tutup");
  await setSetting("kuota_bawaan", String(kuota));
  await setSetting("kuota_balasan_gratis", String(balasan));
  segarkanKuota();
  await catatLog(admin, "ubah pengaturan", null, `pendaftaran ${buka ? "dibuka" : "ditutup"}, kuota gratis ${kuota} nomor & ${balasan} balasan/bulan`);
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

/** Buat tagihan paket di Midtrans Snap; browser lalu dibawa ke halaman pembayarannya. */
export async function bayarPaketAction(paketId: number): Promise<Hasil & { url?: string }> {
  const user = await requireUser();
  if (terlaluSering(`bayar:${user.id}`, 10, 10 * 60_000)) return { ok: false, pesan: "Terlalu banyak percobaan. Coba lagi beberapa menit lagi." };
  const k = await konfigMidtrans();
  if (!k) return { ok: false, pesan: "Pembayaran belum diaktifkan admin." };
  const paket = Number.isInteger(paketId) ? await paketById(paketId) : undefined;
  if (!paket || !paket.aktif || paket.harga < 1) return { ok: false, pesan: "Paket tidak ditemukan." };
  try {
    return { ok: true, url: await mulaiBayar(k, user, paket, await asalAplikasi()) };
  } catch (e) {
    console.error(`[bayar] gagal membuat tagihan user=${user.id}: ${e instanceof Error ? e.message : e}`);
    return { ok: false, pesan: e instanceof MidtransError ? "Pembayaran sedang tidak bisa dibuat. Coba lagi nanti." : "Terjadi kesalahan. Coba lagi." };
  }
}

/** Kembali dari Midtrans: status terbaru ditanyakan langsung ke Midtrans (tidak menunggu webhook). */
export async function cekBayarAction(orderId: string): Promise<Hasil & { status?: string }> {
  const user = await requireUser();
  const k = await konfigMidtrans();
  const t = (await riwayatTransaksi({ userId: user.id, batas: 50 })).find((x) => x.order_id === orderId);
  if (!k || !t) return { ok: false, pesan: "Transaksi tidak ditemukan." };
  try {
    const h = await terapkanStatus(k, orderId);
    revalidatePath("/langganan");
    return { ok: true, status: h?.status };
  } catch {
    return { ok: false, pesan: "Status pembayaran belum bisa dicek. Coba muat ulang sebentar lagi." };
  }
}

// ---------- Admin: paket, langganan, Midtrans ----------

export async function adminPaketAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const admin = await requireAdmin();
  const id = idSah(form.get("id")) ?? undefined;
  const angkaForm = (k: string) => Number(String(form.get(k) ?? "").replace(/[^\d]/g, ""));
  const nama = String(form.get("nama") ?? "").trim().slice(0, 40);
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
  };
  if (nama.length < 2) return { ok: false, pesan: "Nama paket wajib diisi." };
  // Harga bebas diatur admin; hanya dijaga agar muat di kolom database. 0 = paket yang hanya diberikan admin (tidak dijual).
  if (p.harga > MAKS_HARGA_PAKET) return { ok: false, pesan: `Harga maksimal Rp${MAKS_HARGA_PAKET.toLocaleString("id-ID")}.` };
  if (!(p.durasi_hari >= 1 && p.durasi_hari <= 3660)) return { ok: false, pesan: "Durasi 1–3660 hari." };
  if (p.kuota_nomor > 1000 || p.kuota_balasan > 10_000_000) return { ok: false, pesan: "Kuota terlalu besar." };
  try {
    await simpanPaket(p);
  } catch {
    return { ok: false, pesan: "Kode paket sudah dipakai paket lain." };
  }
  await catatLog(admin, id ? "ubah paket" : "buat paket", null, `${nama} · Rp${p.harga.toLocaleString("id-ID")} · ${p.kuota_nomor} nomor · ${p.kuota_balasan} balasan`);
  revalidatePath("/admin", "layout");
  revalidatePath("/langganan");
  revalidatePath("/");
  return { ok: true, pesan: id ? "Paket diperbarui." : "Paket dibuat." };
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

export async function adminBerikanPaketAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const admin = await requireAdmin();
  const userId = idSah(form.get("id"));
  const paketId = idSah(form.get("paket"));
  const hariMentah = String(form.get("hari") ?? "").trim();
  const hari = hariMentah ? Number(hariMentah) : undefined;
  const u = userId ? await penggunaById(userId) : undefined;
  const p = paketId ? await paketById(paketId) : undefined;
  if (!u || !p) return { ok: false, pesan: "Pengguna atau paket tidak valid." };
  if (hari !== undefined && !(Number.isInteger(hari) && hari >= 1 && hari <= 3660)) return { ok: false, pesan: "Jumlah hari 1–3660." };
  await berikanPaket(u.id, p.id, hari);
  await catatLog(admin, "berikan paket", u.email, `${p.nama} ${hari ?? p.durasi_hari} hari`);
  revalidatePath(`/admin/pengguna/${u.id}`);
  return { ok: true, pesan: `Paket ${p.nama} aktif untuk ${u.email}.` };
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
  if (form.get("terapkan") !== "1") {
    await catatLog(admin, "ubah acuan harga", null, acuanTeks);
    revalidatePath("/admin", "layout");
    return { ok: true, pesan: "Acuan harga tersimpan." };
  }
  const mode = form.get("mode") === "kunci-harga" ? "kunci-harga" : "kunci-kuota";
  // Paket yang dicentang admin; paket tanpa centang tetap persis seperti yang ia atur.
  const ids = new Set(form.getAll("ikut").map(Number).filter((n) => Number.isInteger(n) && n > 0));
  if (!ids.size) return { ok: false, pesan: "Centang minimal satu paket yang mau diterapkan." };
  let hasil;
  try {
    hasil = await terapkanSimulasi({ ...a, metode: a.metode as keyof typeof METODE_BAYAR }, mode, ids);
  } catch (e) {
    return { ok: false, pesan: e instanceof Error ? e.message : "Gagal menerapkan simulasi." };
  }
  const { berubah, dilewati } = hasil;
  await catatLog(
    admin,
    "terapkan simulasi paket",
    null,
    `${acuanTeks}, ${mode}; ${berubah.map((b) => `${b.nama}: ${b.sebelum} -> ${b.sesudah}`).join("; ") || "tidak ada perubahan"}${dilewati.length ? `; dilewati: ${dilewati.map((d) => `${d.nama} (${d.alasan})`).join(", ")}` : ""}`
  );
  revalidatePath("/admin", "layout");
  revalidatePath("/langganan");
  revalidatePath("/");
  const lewat = dilewati.length ? ` Tidak diubah: ${dilewati.map((d) => `${d.nama} (${d.alasan})`).join("; ")}.` : "";
  return { ok: true, pesan: (berubah.length ? `Paket diperbarui: ${berubah.map((b) => `${b.nama} → ${b.sesudah}`).join("; ")}.` : "Paket yang dipilih sudah sesuai simulasi.") + lewat };
}
