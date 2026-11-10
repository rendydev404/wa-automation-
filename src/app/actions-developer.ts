"use server";

import { revalidatePath } from "next/cache";
import { catatFitur } from "@/lib/analitik";
import { type BiayaAplikasi, type BiayaEfektif, type BatasApi, RENTANG_BATAS, fiturSah } from "@/lib/api-def";
import { teksPermintaan } from "@/lib/bahasa-server";
import { asalAplikasi, terlaluSering } from "@/lib/batas";
import {
  ApiError,
  type Keputusan,
  ajukan,
  aturAksesApi,
  buatKunci,
  buatSandbox,
  cabutSemuaKunci,
  lepasInstalasi,
  mulaiBayarApi,
  mulaiNomorUji,
  perpanjangSandbox,
  setujui,
  simpanFiturGlobal,
  simpanPengaturanApi,
  simpanPengaturanSandbox,
  tolak,
  ubahAplikasi,
  ubahSandbox,
  ubahStatus,
} from "@/lib/developer-api";
import { adapter, penyediaKanal } from "@/lib/gateway";
import { GatewayError } from "@/lib/gateway-def";
import { type KanalBayar, kanalSah, labelKanal } from "@/lib/harga";
import { modeMesin } from "@/lib/mode";
import { requireAksesApi, requireDeveloper } from "@/lib/session";

/**
 * Server action Developer API (pusat): portal developer luar (/developer) dan panel developer internal
 * (/admin/developer-api). Semua logika & validasi ada di src/lib/developer-api.ts; di sini hanya sesi, batas laju,
 * dan penerjemahan galat menjadi pesan. Di mode mesin (self-host) semua aksi ini ditolak.
 */

export interface Hasil {
  ok: boolean;
  pesan?: string;
}

const idSah = (v: unknown): number | null => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);

async function galat(e: unknown): Promise<Hasil> {
  const { t } = await teksPermintaan();
  if (e instanceof ApiError || e instanceof GatewayError) return { ok: false, pesan: e.message };
  console.error("[developer-api] aksi gagal:", e instanceof Error ? e.message : e);
  return { ok: false, pesan: t("Terjadi kesalahan. Coba lagi.", "Something went wrong. Please try again.") };
}

const tolakMesin = async (): Promise<Hasil | null> => (modeMesin() ? { ok: false, pesan: "Tidak tersedia di mesin self-host." } : null);

// ---------- Portal developer luar ----------

export async function ajukanAction(_lalu: (Hasil & { id?: number }) | null, form: FormData): Promise<Hasil & { id?: number }> {
  const m = await tolakMesin();
  if (m) return m;
  const user = await requireAksesApi();
  const { t } = await teksPermintaan();
  if (terlaluSering(`devapi-ajukan:${user.id}`, 5, 60 * 60_000)) return { ok: false, pesan: t("Terlalu banyak pengajuan. Coba lagi nanti.", "Too many applications. Please try again later.") };
  try {
    const id = await ajukan(user, {
      nama: String(form.get("nama") ?? ""),
      kegunaan: String(form.get("kegunaan") ?? ""),
      situs: String(form.get("situs") ?? ""),
      pemilik: String(form.get("pemilik") ?? ""),
      kontak_wa: String(form.get("kontak_wa") ?? ""),
      perkiraan_nomor: String(form.get("perkiraan_nomor") ?? ""),
      alamat_mesin: String(form.get("alamat_mesin") ?? ""),
      fitur: form.getAll("fitur").map(String),
      setuju: form.get("setuju") === "on",
    });
    revalidatePath("/developer");
    revalidatePath("/admin/developer-api");
    catatFitur(user.id, "developer.ajukan");
    return { ok: true, id, pesan: t("Pengajuan terkirim. Kami akan meninjaunya dan memberi kabar lewat notifikasi.", "Application sent. We'll review it and notify you.") };
  } catch (e) {
    return galat(e);
  }
}

/** Buat / ganti API key. Key utuh dikembalikan SEKALI (hanya hash yang disimpan). */
export async function buatKunciAction(aplikasiId: number): Promise<Hasil & { key?: string; rotasi?: boolean }> {
  const m = await tolakMesin();
  if (m) return m;
  const user = await requireAksesApi();
  const { t } = await teksPermintaan();
  const id = idSah(aplikasiId);
  if (!id) return { ok: false, pesan: t("Aplikasi tidak valid.", "Invalid application.") };
  if (terlaluSering(`devapi-kunci:${user.id}`, 10, 60 * 60_000)) return { ok: false, pesan: t("Terlalu sering membuat key. Coba lagi nanti.", "Too many keys created. Please try again later.") };
  try {
    const k = await buatKunci(user, id);
    revalidatePath(`/developer/${id}`);
    catatFitur(user.id, k.rotasi ? "developer.ganti_key" : "developer.buat_key");
    return { ok: true, key: k.key, rotasi: k.rotasi };
  } catch (e) {
    return galat(e);
  }
}

export async function lepasInstalasiAction(aplikasiId: number, instalasiId: string): Promise<Hasil> {
  const m = await tolakMesin();
  if (m) return m;
  const user = await requireAksesApi();
  const { t } = await teksPermintaan();
  const id = idSah(aplikasiId);
  if (!id || typeof instalasiId !== "string") return { ok: false, pesan: t("Data tidak valid.", "Invalid data.") };
  try {
    await lepasInstalasi(user, id, instalasiId, false);
    revalidatePath(`/developer/${id}`);
    return { ok: true, pesan: t("Instalasi dilepas. Mesin itu berhenti menerima perpanjangan lisensi.", "Installation released. That engine no longer receives license renewals.") };
  } catch (e) {
    return galat(e);
  }
}

// ---------- Sandbox (portal) ----------

/** Buat sandbox + key cg_test_ (atau ganti key sandbox yang ada). Key tampil sekali. */
export async function buatSandboxAction(): Promise<Hasil & { key?: string; baru?: boolean }> {
  const m = await tolakMesin();
  if (m) return m;
  const user = await requireAksesApi();
  const { t } = await teksPermintaan();
  if (terlaluSering(`devapi-sandbox:${user.id}`, 10, 60 * 60_000)) return { ok: false, pesan: t("Terlalu sering membuat key. Coba lagi nanti.", "Too many keys created. Please try again later.") };
  try {
    const r = await buatSandbox(user);
    revalidatePath("/developer");
    catatFitur(user.id, r.baru ? "developer.buat_sandbox" : "developer.ganti_key_sandbox");
    return { ok: true, key: r.key, baru: r.baru };
  } catch (e) {
    return galat(e);
  }
}

export async function perpanjangSandboxAction(): Promise<Hasil> {
  const m = await tolakMesin();
  if (m) return m;
  const user = await requireAksesApi();
  const { t } = await teksPermintaan();
  if (terlaluSering(`devapi-perpanjang:${user.id}`, 10, 60 * 60_000)) return { ok: false, pesan: t("Terlalu sering. Coba lagi nanti.", "Too many attempts. Please try again later.") };
  try {
    await perpanjangSandbox(user);
    revalidatePath("/developer");
    return { ok: true, pesan: t("Diperpanjang. Klik Perbarui lisensi di dashboard mesin (atau nyalakan ulang mesin) supaya berlaku.", "Extended. Click Refresh license in the engine dashboard (or restart the engine) to apply it.") };
  } catch (e) {
    return galat(e);
  }
}

/** Kode verifikasi nomor uji (6 angka, 10 menit). */
export async function mulaiNomorUjiAction(): Promise<Hasil & { kode?: string; sampai?: number }> {
  const m = await tolakMesin();
  if (m) return m;
  const user = await requireAksesApi();
  const { t } = await teksPermintaan();
  if (terlaluSering(`devapi-kode-uji:${user.id}`, 10, 60 * 60_000)) return { ok: false, pesan: t("Terlalu sering membuat kode. Coba lagi nanti.", "Too many codes requested. Please try again later.") };
  try {
    const r = await mulaiNomorUji(user);
    revalidatePath("/developer");
    return { ok: true, kode: r.kode, sampai: r.sampai };
  } catch (e) {
    return galat(e);
  }
}

/** Tagihan 30 hari aplikasi berbayar; klien lalu dibawa ke /langganan/tagihan/{orderId}. Meniru bayarPaketAction. */
export async function bayarApiAction(aplikasiId: number, kanal: string): Promise<Hasil & { orderId?: string; kanalMati?: KanalBayar }> {
  const m = await tolakMesin();
  if (m) return m;
  const user = await requireAksesApi();
  const { b, t } = await teksPermintaan();
  if (terlaluSering(`bayar:${user.id}`, 10, 10 * 60_000)) return { ok: false, pesan: t("Terlalu banyak percobaan. Coba lagi beberapa menit lagi.", "Too many attempts. Please try again in a few minutes.") };
  const tidakTersedia = t("Metode pembayaran ini sedang tidak tersedia. Pilih metode lain.", "This payment method isn't available right now. Please choose another one.");
  const id = idSah(aplikasiId);
  if (!id) return { ok: false, pesan: t("Aplikasi tidak valid.", "Invalid application.") };
  if (!kanalSah(kanal)) return { ok: false, pesan: tidakTersedia };
  const peta = await penyediaKanal();
  if (!Object.keys(peta).length) return { ok: false, pesan: t("Pembayaran belum diaktifkan admin.", "Payments haven't been enabled by the admin yet.") };
  const g = peta[kanal] ? await adapter(peta[kanal]) : null;
  if (!g) return { ok: false, pesan: tidakTersedia, kanalMati: kanal };
  try {
    const h = await mulaiBayarApi(g, user, id, kanal, await asalAplikasi());
    revalidatePath(`/developer/${id}`);
    catatFitur(user.id, "developer.buat_tagihan");
    return { ok: true, orderId: h.orderId };
  } catch (e) {
    console.error(`[bayar-api] gagal membuat tagihan user=${user.id} gateway=${g.nama} kanal=${kanal}: ${e instanceof Error ? e.message : e}`);
    if (e instanceof GatewayError && e.kanalMati) {
      const label = labelKanal(kanal, b, g.nama);
      return { ok: false, pesan: t(`${label} belum tersedia. Pilih metode pembayaran lain.`, `${label} isn't available yet. Please choose another payment method.`), kanalMati: kanal };
    }
    return galat(e);
  }
}

// ---------- Panel developer internal ----------

function bacaKeputusan(form: FormData): Keputusan {
  const biaya = String(form.get("biaya") ?? "ikut_umum") as BiayaAplikasi;
  const hargaTeks = String(form.get("harga_bulan") ?? "").replace(/[.\s]/g, "").trim();
  const batas: Partial<Record<keyof BatasApi, unknown>> = {};
  for (const k of Object.keys(RENTANG_BATAS) as (keyof BatasApi)[]) batas[k] = String(form.get(`batas_${k}`) ?? "").trim() === "" ? undefined : Number(form.get(`batas_${k}`));
  return { fitur: form.getAll("fitur").map(String), biaya, harga_bulan: hargaTeks === "" ? null : Number(hargaTeks), batas };
}

function segarkanPanel(id?: number): void {
  revalidatePath("/admin/developer-api");
  if (id) revalidatePath(`/admin/developer-api/${id}`);
  revalidatePath("/admin", "layout");
}

export async function setujuiAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const m = await tolakMesin();
  if (m) return m;
  const pelaku = await requireDeveloper();
  const id = idSah(form.get("id"));
  if (!id) return { ok: false, pesan: "Aplikasi tidak valid." };
  try {
    await setujui(pelaku, id, bacaKeputusan(form));
    segarkanPanel(id);
    catatFitur(pelaku.id, "admin.developer_setujui");
    return { ok: true, pesan: "Disetujui. Developer mendapat notifikasi untuk membuat API key." };
  } catch (e) {
    return galat(e);
  }
}

export async function ubahAplikasiAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const m = await tolakMesin();
  if (m) return m;
  const pelaku = await requireDeveloper();
  const id = idSah(form.get("id"));
  if (!id) return { ok: false, pesan: "Aplikasi tidak valid." };
  try {
    await ubahAplikasi(pelaku, id, bacaKeputusan(form));
    segarkanPanel(id);
    catatFitur(pelaku.id, "admin.developer_ubah");
    return { ok: true, pesan: "Tersimpan. Lisensi baru dikirim ke mesin lewat webhook." };
  } catch (e) {
    return galat(e);
  }
}

export async function tolakAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const m = await tolakMesin();
  if (m) return m;
  const pelaku = await requireDeveloper();
  const id = idSah(form.get("id"));
  if (!id) return { ok: false, pesan: "Aplikasi tidak valid." };
  try {
    await tolak(pelaku, id, String(form.get("alasan") ?? ""));
    segarkanPanel(id);
    catatFitur(pelaku.id, "admin.developer_tolak");
    return { ok: true, pesan: "Ditolak. Alasan dikirim ke pengaju." };
  } catch (e) {
    return galat(e);
  }
}

export async function ubahStatusAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const m = await tolakMesin();
  if (m) return m;
  const pelaku = await requireDeveloper();
  const id = idSah(form.get("id"));
  const aksi = form.get("aksi");
  if (!id || (aksi !== "tangguhkan" && aksi !== "aktifkan" && aksi !== "cabut")) return { ok: false, pesan: "Data tidak valid." };
  try {
    await ubahStatus(pelaku, id, aksi, String(form.get("alasan") ?? ""));
    segarkanPanel(id);
    catatFitur(pelaku.id, aksi === "tangguhkan" ? "admin.developer_tangguhkan" : aksi === "aktifkan" ? "admin.developer_aktifkan" : "admin.developer_cabut");
    return { ok: true, pesan: aksi === "tangguhkan" ? "Ditangguhkan. Mesin berhenti melayani (WhatsApp tetap tersambung)." : aksi === "aktifkan" ? "Aktif kembali." : "Dicabut permanen." };
  } catch (e) {
    return galat(e);
  }
}

export async function cabutKunciAction(aplikasiId: number): Promise<Hasil> {
  const m = await tolakMesin();
  if (m) return m;
  const pelaku = await requireDeveloper();
  const id = idSah(aplikasiId);
  if (!id) return { ok: false, pesan: "Aplikasi tidak valid." };
  try {
    const n = await cabutSemuaKunci(pelaku, id);
    segarkanPanel(id);
    return { ok: true, pesan: `${n} key dicabut. Developer perlu membuat key baru.` };
  } catch (e) {
    return galat(e);
  }
}

export async function lepasInstalasiStafAction(aplikasiId: number, instalasiId: string): Promise<Hasil> {
  const m = await tolakMesin();
  if (m) return m;
  const pelaku = await requireDeveloper();
  const id = idSah(aplikasiId);
  if (!id || typeof instalasiId !== "string") return { ok: false, pesan: "Data tidak valid." };
  try {
    await lepasInstalasi(pelaku, id, instalasiId, true);
    segarkanPanel(id);
    return { ok: true, pesan: "Instalasi dilepas." };
  } catch (e) {
    return galat(e);
  }
}

export async function simpanPengaturanApiAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const m = await tolakMesin();
  if (m) return m;
  const pelaku = await requireDeveloper();
  const biaya: BiayaEfektif = form.get("biaya") === "berbayar" ? "berbayar" : "gratis";
  const harga = Number(String(form.get("harga") ?? "0").replace(/[.\s]/g, "") || 0);
  try {
    await simpanPengaturanApi(pelaku, { biaya, harga });
    segarkanPanel();
    catatFitur(pelaku.id, "admin.developer_pengaturan");
    return { ok: true, pesan: "Pengaturan tersimpan dan dikirim ke semua mesin aktif." };
  } catch (e) {
    return galat(e);
  }
}

/** Katalog fitur yang dibagikan ke developer luar (tab Fitur). Hanya developer internal. */
export async function simpanFiturGlobalAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const m = await tolakMesin();
  if (m) return m;
  const pelaku = await requireDeveloper();
  try {
    const fitur = await simpanFiturGlobal(pelaku, form.getAll("fitur").map(String).filter(fiturSah));
    segarkanPanel();
    catatFitur(pelaku.id, "admin.developer_pengaturan");
    return { ok: true, pesan: `${fitur.length} fitur dibagikan. Lisensi semua mesin aktif diperbarui.` };
  } catch (e) {
    return galat(e);
  }
}

/** Nyalakan / matikan akses portal /developer satu akun. Hanya developer internal. */
export async function aturAksesAction(userId: number, aktif: boolean): Promise<Hasil> {
  const m = await tolakMesin();
  if (m) return m;
  const pelaku = await requireDeveloper();
  const id = idSah(userId);
  if (!id || typeof aktif !== "boolean") return { ok: false, pesan: "Data tidak valid." };
  try {
    const email = await aturAksesApi(pelaku, id, aktif);
    revalidatePath("/admin/developer-api");
    return { ok: true, pesan: aktif ? `${email} sekarang melihat menu Developer API.` : `Akses ${email} dicabut.` };
  } catch (e) {
    return galat(e);
  }
}

// ---------- Sandbox (panel developer internal) ----------

export async function simpanPengaturanSandboxAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const m = await tolakMesin();
  if (m) return m;
  const pelaku = await requireDeveloper();
  try {
    await simpanPengaturanSandbox(pelaku, {
      aktif: form.get("aktif") === "on",
      hari: Number(String(form.get("hari") ?? "").trim()),
      ai_hari: Number(String(form.get("ai_hari") ?? "").replace(/[.\s]/g, "").trim()),
    });
    segarkanPanel();
    catatFitur(pelaku.id, "admin.developer_sandbox");
    return { ok: true, pesan: "Pengaturan sandbox tersimpan. Berlaku di mesin sandbox saat menyala / Perbarui lisensi." };
  } catch (e) {
    return galat(e);
  }
}

/** Ubah limit AI khusus (0 = ikut bawaan) dan/atau perpanjang satu sandbox. */
export async function ubahSandboxAction(_lalu: Hasil | null, form: FormData): Promise<Hasil> {
  const m = await tolakMesin();
  if (m) return m;
  const pelaku = await requireDeveloper();
  const id = idSah(form.get("id"));
  if (!id) return { ok: false, pesan: "Sandbox tidak valid." };
  const aiTeks = String(form.get("ai_hari") ?? "").replace(/[.\s]/g, "").trim();
  try {
    await ubahSandbox(pelaku, id, { ai_hari: aiTeks === "" ? undefined : Number(aiTeks), perpanjang: form.get("perpanjang") === "1" });
    segarkanPanel();
    return { ok: true, pesan: form.get("perpanjang") === "1" ? "Sandbox diperpanjang." : "Limit AI tersimpan." };
  } catch (e) {
    return galat(e);
  }
}
