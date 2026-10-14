"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { authConfigured } from "@/lib/auth";
import { KnowledgeError, hapusDokumen, pratinjauDokumen, tambahDokumen } from "@/lib/knowledge";
import { BATAS_JEDA_MENIT, BATAS_TUNGGU_BACA_DETIK, BATAS_TUNGGU_DETIK, hapusNomor, nomorById, semuaNomor, setBotAktif, tambahNomor, ubahNomor } from "@/lib/numbers";
import { verifyPassword } from "@/lib/password";
import { konfigurasi as konfigurasiSinkron, setNomorSinkron, statusSinkron } from "@/lib/sinkron";
import { akhiriSesi, findUserByEmail, mulaiSesi, requireUser } from "@/lib/session";
import { WaError, hapusSesi, hubungkan, logout } from "@/lib/wa";

export interface Hasil {
  ok: boolean;
  pesan?: string;
}

// ---------- Login ----------

const percobaan = new Map<string, { n: number; mulai: number }>();
const MAKS_PERCOBAAN = 6;
const JENDELA_MS = 5 * 60_000;

function terlaluSering(ip: string): boolean {
  const kini = Date.now();
  const p = percobaan.get(ip);
  if (!p || kini - p.mulai > JENDELA_MS) {
    percobaan.set(ip, { n: 1, mulai: kini });
    if (percobaan.size > 5000) percobaan.clear();
    return false;
  }
  p.n += 1;
  return p.n > MAKS_PERCOBAAN;
}

export async function loginAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  if (!authConfigured()) return { ok: false, pesan: "AUTH_SECRET belum dikonfigurasi di server." };
  const h = await headers();
  const ip = h.get("cf-connecting-ip") || h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  if (terlaluSering(ip)) return { ok: false, pesan: "Terlalu banyak percobaan. Coba lagi beberapa menit lagi." };

  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const user = email && password.length <= 200 ? await findUserByEmail(email) : undefined;
  // Tetap jalankan verifikasi walau pengguna tidak ada, supaya waktu responsnya tidak membocorkan email.
  const cocok = await verifyPassword(password, user?.password_hash ?? "scrypt:16384:8:1:AAAAAAAAAAAAAAAAAAAAAA==:AAAA");
  if (!user || !cocok) return { ok: false, pesan: "Email atau password salah." };

  await mulaiSesi(user, (h.get("x-forwarded-proto") ?? "http").startsWith("https"));
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await akhiriSesi();
  redirect("/login");
}

// ---------- Koneksi WhatsApp ----------

const pesanGalat = (e: unknown): string => (e instanceof WaError || e instanceof KnowledgeError ? e.message : "Terjadi kesalahan. Coba lagi.");

export async function hubungkanWaAction(id: number): Promise<Hasil> {
  await requireUser();
  const nomor = await nomorById(id);
  if (!nomor) return { ok: false, pesan: "Nomor tidak ditemukan." };
  try {
    await hubungkan(nomor.sesi);
    return { ok: true };
  } catch (e) {
    return { ok: false, pesan: pesanGalat(e) };
  }
}

export async function logoutWaAction(id: number): Promise<Hasil> {
  await requireUser();
  const nomor = await nomorById(id);
  if (!nomor) return { ok: false, pesan: "Nomor tidak ditemukan." };
  try {
    await logout(nomor.sesi);
    return { ok: true };
  } catch (e) {
    return { ok: false, pesan: pesanGalat(e) };
  }
}

// ---------- Nomor ----------

// Tiap nomor terhubung = satu soket WebSocket di proses ini; batasnya hanya pengaman memori.
const MAKS_NOMOR = Math.max(1, Number(process.env.MAKS_NOMOR) || 30);

/** Tambah nomor: buat jalurnya, nyalakan sesi WhatsApp-nya, lalu buka halamannya (QR langsung tampil). */
export async function tambahNomorAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  await requireUser();
  const label = String(form.get("label") ?? "").trim().slice(0, 60);
  if (!label) return { ok: false, pesan: "Nama nomor wajib diisi." };
  if ((await semuaNomor()).length >= MAKS_NOMOR) return { ok: false, pesan: `Maksimal ${MAKS_NOMOR} nomor.` };
  const nomor = await tambahNomor(label);
  // Gagal menyalakan sesi tidak membatalkan pembuatan: tombol "Hubungkan" di halamannya bisa mengulang.
  await hubungkan(nomor.sesi).catch(() => {});
  revalidatePath("/");
  redirect(`/nomor/${nomor.id}`);
}

export async function ubahNomorAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  await requireUser();
  const id = Number(form.get("id"));
  const label = String(form.get("label") ?? "").trim().slice(0, 60);
  const instruksi = String(form.get("instruksi") ?? "").trim().slice(0, 2000);
  if (!(await nomorById(id))) return { ok: false, pesan: "Nomor tidak ditemukan." };
  if (!label) return { ok: false, pesan: "Nama nomor wajib diisi." };
  const tungguDetik = Math.round(Number(form.get("tunggu_detik")));
  const tungguBacaDetik = Math.round(Number(form.get("tunggu_baca_detik")));
  const jedaMenit = Math.round(Number(form.get("jeda_menit")));
  if (!(tungguDetik >= BATAS_TUNGGU_DETIK.min && tungguDetik <= BATAS_TUNGGU_DETIK.maks))
    return { ok: false, pesan: `Waktu tunggu harus ${BATAS_TUNGGU_DETIK.min}–${BATAS_TUNGGU_DETIK.maks} detik.` };
  if (!(tungguBacaDetik >= BATAS_TUNGGU_BACA_DETIK.min && tungguBacaDetik <= BATAS_TUNGGU_BACA_DETIK.maks))
    return { ok: false, pesan: `Waktu setelah chat dibuka harus ${BATAS_TUNGGU_BACA_DETIK.min}–${BATAS_TUNGGU_BACA_DETIK.maks} detik.` };
  if (!(jedaMenit >= BATAS_JEDA_MENIT.min && jedaMenit <= BATAS_JEDA_MENIT.maks))
    return { ok: false, pesan: `Lama AI diam harus ${BATAS_JEDA_MENIT.min}–${BATAS_JEDA_MENIT.maks} menit.` };
  await ubahNomor(id, { label, instruksi, tungguDetik, tungguBacaDetik, jedaMenit });
  revalidatePath("/");
  revalidatePath(`/nomor/${id}`);
  return { ok: true, pesan: "Tersimpan." };
}

export async function setBotAktifAction(id: number, aktif: boolean): Promise<Hasil> {
  await requireUser();
  if (!(await nomorById(id))) return { ok: false, pesan: "Nomor tidak ditemukan." };
  await setBotAktif(id, aktif);
  revalidatePath("/");
  revalidatePath(`/nomor/${id}`);
  return { ok: true };
}

export async function setSinkronAction(id: number, aktif: boolean): Promise<Hasil> {
  await requireUser();
  if (!(await nomorById(id))) return { ok: false, pesan: "Nomor tidak ditemukan." };
  if (!konfigurasiSinkron()) return { ok: false, pesan: "Sinkron belum dikonfigurasi di server." };
  await setNomorSinkron(id, aktif);
  const s = await statusSinkron();
  revalidatePath("/");
  revalidatePath(`/nomor/${id}`);
  return aktif && s.galat ? { ok: false, pesan: `Gagal mengambil data: ${s.galat}` } : { ok: true };
}

export async function hapusNomorAction(id: number): Promise<Hasil> {
  await requireUser();
  const nomor = await nomorById(id);
  if (!nomor) return { ok: false, pesan: "Nomor tidak ditemukan." };
  // Sesi WhatsApp-nya ikut dihapus (perangkat tertaut dicabut). Bila itu gagal, nomor tidak dihapus
  // supaya tidak tertinggal sesi yatim yang masih terhubung ke WhatsApp.
  try {
    await hapusSesi(nomor.sesi);
  } catch (e) {
    return { ok: false, pesan: pesanGalat(e) };
  }
  await hapusNomor(id);
  revalidatePath("/");
  redirect("/");
}

// ---------- Base knowledge ----------

export async function tambahTeksAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  await requireUser();
  const numberId = Number(form.get("number_id"));
  if (!(await nomorById(numberId))) return { ok: false, pesan: "Nomor tidak ditemukan." };
  const judul = String(form.get("judul") ?? "").trim();
  if (!judul) return { ok: false, pesan: "Judul wajib diisi." };
  try {
    await tambahDokumen({ numberId, judul, sumber: "teks", teks: String(form.get("isi") ?? "") });
  } catch (e) {
    return { ok: false, pesan: pesanGalat(e) };
  }
  revalidatePath("/");
  revalidatePath(`/nomor/${numberId}`);
  return { ok: true, pesan: "Teks ditambahkan." };
}

export async function hapusDokumenAction(id: number, numberId: number): Promise<Hasil> {
  await requireUser();
  await hapusDokumen(id, numberId);
  revalidatePath("/");
  revalidatePath(`/nomor/${numberId}`);
  return { ok: true };
}

export async function pratinjauAction(id: number, numberId: number): Promise<string | null> {
  await requireUser();
  return pratinjauDokumen(id, numberId);
}
