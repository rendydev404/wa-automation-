"use server";

import { revalidatePath } from "next/cache";
import { nomorUntuk } from "@/lib/akses";
import { catatFitur } from "@/lib/analitik";
import { teksPermintaan } from "@/lib/bahasa-server";
import { terlaluSering } from "@/lib/batas";
import { fiturBoleh } from "@/lib/mesin/lisensi";
import type { Nomor } from "@/lib/numbers";
import { staf } from "@/lib/peran";
import { type User, requireStaf, requireUser } from "@/lib/session";
import { WaError } from "@/lib/wa";
import { type KebijakanJalur, rapikanKredensial, uraiKebijakan } from "@/lib/wa-resmi-def";
import type { BarisTemplat, HasilPasang, StatusResmi } from "@/lib/wa-resmi";

/**
 * Aksi jalur WhatsApp resmi (Cloud API Meta) & template Meta, dipanggil dari tab Koneksi / Follow-up halaman nomor dan
 * panel admin. Rencana: docs/plans/2026-11-18-followup-dua-jalur-wa-resmi.md §3.
 * Aturan akses: pemilik nomor atau staf. Pengguna biasa hanya bila kebijakan admin bukan "Baileys saja" dan akunnya
 * berbayar (sama dengan follow-up usaha). Token & app secret tidak pernah dikirim balik ke browser.
 */

export interface HasilJalur {
  ok: boolean;
  pesan?: string;
  pasang?: HasilPasang;
  status?: StatusResmi;
  templat?: BarisTemplat[];
}

type T = (id: string, en: string) => string;

const pesanGalat = (e: unknown, b: string): string =>
  e instanceof WaError ? (b === "en" && e.en ? e.en : e.message) : b === "en" ? "Something went wrong. Please try again." : "Terjadi kesalahan. Coba lagi.";

async function nomorJalur(id: unknown, ubah: boolean): Promise<{ user: User; nomor: Nomor; t: T; b: string } | HasilJalur> {
  const user = await requireUser();
  const { t, b } = await teksPermintaan();
  if (!fiturBoleh("wa.resmi") && !staf(user.peran)) return { ok: false, pesan: t("Fitur ini dinonaktifkan oleh ChatGerCep.", "This feature has been disabled by ChatGerCep.") };
  const nomor = await nomorUntuk(user, id);
  if (!nomor) return { ok: false, pesan: t("Nomor tidak ditemukan.", "Number not found.") };
  if (ubah && !staf(user.peran)) {
    const { bolehResmi } = await import("@/lib/wa-resmi");
    if (!(await bolehResmi(false))) return { ok: false, pesan: t("Admin belum membuka WhatsApp resmi untuk pengguna.", "The admin has not enabled official WhatsApp for users.") };
    const { followupBoleh } = await import("@/lib/followup-usaha");
    if (!(await followupBoleh(nomor.user_id)))
      return { ok: false, pesan: t("WhatsApp resmi tersedia untuk akun berlangganan. Aktifkan paket dulu di menu Langganan.", "Official WhatsApp is available on paid plans. Activate a plan first from the Subscription menu.") };
  }
  return { user, nomor, t, b };
}

export async function pasangJalurResmiAction(_lalu: HasilJalur | null, form: FormData): Promise<HasilJalur> {
  const x = await nomorJalur(form.get("number_id"), true);
  if ("ok" in x) return x;
  const { user, nomor, t, b } = x;
  if (await terlaluSering(`jalur-resmi:${user.id}`, 10, 600_000)) return { ok: false, pesan: t("Terlalu banyak percobaan. Tunggu beberapa menit.", "Too many attempts. Wait a few minutes.") };
  const v: Record<string, unknown> = {};
  for (const k of ["phone_number_id", "waba_id", "token", "app_secret", "pin"]) v[k] = String(form.get(k) ?? "");
  const r = rapikanKredensial(v);
  if ("galat" in r) return { ok: false, pesan: r.galat };
  try {
    const { pasangResmi, statusResmi } = await import("@/lib/wa-resmi");
    const pasang = await pasangResmi(nomor.id, r.data);
    revalidatePath(`/nomor/${nomor.id}`);
    catatFitur(user.id, "jalur.resmi_pasang");
    return { ok: true, pesan: t("WhatsApp resmi terpasang. Tempel URL webhook & verify token di App Dashboard Meta.", "Official WhatsApp connected. Paste the webhook URL & verify token into the Meta App Dashboard."), pasang, status: await statusResmi(nomor.id) };
  } catch (e) {
    return { ok: false, pesan: pesanGalat(e, b) };
  }
}

export async function lepasJalurResmiAction(numberId: number): Promise<HasilJalur> {
  const x = await nomorJalur(numberId, false);
  if ("ok" in x) return x;
  try {
    const { lepasResmi, statusResmi } = await import("@/lib/wa-resmi");
    await lepasResmi(x.nomor.id);
    revalidatePath(`/nomor/${x.nomor.id}`);
    catatFitur(x.user.id, "jalur.resmi_lepas");
    return { ok: true, pesan: x.t("Kembali ke scan QR. Kredensial Meta disimpan nonaktif.", "Back to QR scan. Meta credentials are kept inactive."), status: await statusResmi(x.nomor.id) };
  } catch (e) {
    return { ok: false, pesan: pesanGalat(e, x.b) };
  }
}

export async function segarkanJalurResmiAction(numberId: number): Promise<HasilJalur> {
  const x = await nomorJalur(numberId, false);
  if ("ok" in x) return x;
  try {
    const { segarkanStatus, statusResmi } = await import("@/lib/wa-resmi");
    await segarkanStatus(x.nomor.id);
    return { ok: true, status: await statusResmi(x.nomor.id) };
  } catch (e) {
    return { ok: false, pesan: pesanGalat(e, x.b) };
  }
}

export async function simpanTemplatAction(numberId: number, d: { nama: string; isi: string; kode_tahap: string | null }): Promise<HasilJalur> {
  const x = await nomorJalur(numberId, false);
  if ("ok" in x) return x;
  if (await terlaluSering(`templat-wa:${x.user.id}`, 30, 3_600_000)) return { ok: false, pesan: x.t("Terlalu banyak pengajuan template. Coba lagi nanti.", "Too many template submissions. Try again later.") };
  try {
    const { simpanTemplat, daftarTemplat } = await import("@/lib/wa-resmi");
    await simpanTemplat(x.nomor.id, { nama: String(d.nama ?? ""), isi: String(d.isi ?? ""), kode_tahap: d.kode_tahap });
    catatFitur(x.user.id, "jalur.templat_ajukan");
    return { ok: true, pesan: x.t("Template diajukan ke Meta. Status diperbarui otomatis setelah ditinjau (maks 24 jam).", "Template submitted to Meta. Status updates automatically after review (up to 24 hours)."), templat: await daftarTemplat(x.nomor.id) };
  } catch (e) {
    return { ok: false, pesan: pesanGalat(e, x.b) };
  }
}

export async function pasangTemplatBawaanAction(numberId: number): Promise<HasilJalur> {
  const x = await nomorJalur(numberId, false);
  if ("ok" in x) return x;
  try {
    const { pasangTemplatBawaan, daftarTemplat } = await import("@/lib/wa-resmi");
    const { nomorCsChatGercep } = await import("@/lib/followup");
    const cs = (await nomorCsChatGercep()).has(x.nomor.id);
    await pasangTemplatBawaan(x.nomor.id, cs ? "cs" : "usaha");
    catatFitur(x.user.id, "jalur.templat_bawaan");
    return { ok: true, pesan: x.t("Template bawaan diajukan ke Meta.", "Default templates submitted to Meta."), templat: await daftarTemplat(x.nomor.id) };
  } catch (e) {
    return { ok: false, pesan: pesanGalat(e, x.b) };
  }
}

export async function sinkronTemplatAction(numberId: number): Promise<HasilJalur> {
  const x = await nomorJalur(numberId, false);
  if ("ok" in x) return x;
  try {
    const { sinkronTemplat } = await import("@/lib/wa-resmi");
    return { ok: true, pesan: x.t("Status template diperbarui dari Meta.", "Template status refreshed from Meta."), templat: await sinkronTemplat(x.nomor.id) };
  } catch (e) {
    return { ok: false, pesan: pesanGalat(e, x.b) };
  }
}

export async function hapusTemplatAction(numberId: number, nama: string): Promise<HasilJalur> {
  const x = await nomorJalur(numberId, false);
  if ("ok" in x) return x;
  try {
    const { hapusTemplat, daftarTemplat } = await import("@/lib/wa-resmi");
    await hapusTemplat(x.nomor.id, String(nama ?? ""));
    return { ok: true, pesan: x.t("Template dihapus.", "Template deleted."), templat: await daftarTemplat(x.nomor.id) };
  } catch (e) {
    return { ok: false, pesan: pesanGalat(e, x.b) };
  }
}

/** Admin: kebijakan jalur untuk nomor pengguna (Baileys saja / pengguna memilih / resmi saja). */
export async function simpanKebijakanJalurAction(nilai: KebijakanJalur): Promise<HasilJalur> {
  const user = await requireStaf();
  const { t } = await teksPermintaan();
  const { simpanKebijakanJalur } = await import("@/lib/wa-resmi");
  await simpanKebijakanJalur(uraiKebijakan(nilai));
  revalidatePath("/admin/followup");
  catatFitur(user.id, "jalur.kebijakan");
  return { ok: true, pesan: t("Kebijakan jalur WhatsApp disimpan.", "WhatsApp channel policy saved.") };
}
