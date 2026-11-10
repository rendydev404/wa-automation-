"use server";

/**
 * Server action: semua perubahan data dikerjakan di sini, di server, lewat SDK. API key tidak pernah ke browser.
 *
 * PENTING: contoh ini belum punya login. Server action bisa dipanggil siapa pun yang bisa membuka aplikasi, jadi
 * tambahkan pemeriksaan sesi Anda sendiri di awal setiap fungsi sebelum dipakai di luar komputer sendiri.
 */
import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { tautan } from "../lib/format";
import { galatRamah, hasilGagal } from "../lib/galat";
import type { HasilAksi } from "../lib/jenis";
import { denganCobaUlang, klien, urlWebhook } from "../lib/klien";
import { ingatRahasiaWebhook } from "../lib/rahasia";
import { EVENT_WEBHOOK, GalatChatGerCep, type QrNomor, type WebhookBaru } from "../lib/sdk";

const isi = (fd: FormData, nama: string): string => {
  const v = fd.get(nama);
  return typeof v === "string" ? v.trim() : "";
};
const teksSah = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 64;
const TIDAK_DIKENAL: HasilAksi = { ok: false, pesan: "Permintaan tidak dikenal. Muat ulang halaman." };

// ---------- Nomor ----------

/** Tambah nomor baru lalu pindah ke halaman QR-nya. */
export async function aksiTambahNomor(_sebelum: HasilAksi, fd: FormData): Promise<HasilAksi> {
  const label = isi(fd, "label");
  if (!label) return { ok: false, pesan: "Isi nama untuk nomor ini, mis. CS Toko." };
  let id: string;
  try {
    const nomor = await denganCobaUlang(randomUUID(), (kunci) => klien().nomor.tambah({ label }, { idempotensi: kunci }));
    id = nomor.id;
  } catch (e) {
    return hasilGagal(e);
  }
  redirect(tautan("/sambungkan", { nomor: id }));
}

/** Ambil QR langsung dari mesin (cadangan bila event `nomor.qr` belum sampai lewat webhook). */
export async function ambilQr(nomorId: string): Promise<{ ok: true; qr: QrNomor } | { ok: false; pesan: string }> {
  if (!teksSah(nomorId)) return { ok: false, pesan: "Nomor tidak dikenal." };
  try {
    return { ok: true, qr: await klien().nomor.qr(nomorId) };
  } catch (e) {
    return { ok: false, pesan: galatRamah(e).pesan };
  }
}

/** Kode pairing (tautkan dengan nomor telepon, tanpa memindai QR). */
export async function aksiPairing(nomorId: string, _sebelum: HasilAksi, fd: FormData): Promise<HasilAksi> {
  if (!teksSah(nomorId)) return TIDAK_DIKENAL;
  const nomorHp = isi(fd, "nomor_hp");
  if (!nomorHp) return { ok: false, pesan: "Isi nomor HP WhatsApp yang akan ditautkan, mis. 6281234567890." };
  try {
    const { kode } = await klien().nomor.pairing(nomorId, nomorHp);
    return {
      ok: true,
      pesan: "Kode pairing siap.",
      tampil: { label: "Kode pairing", nilai: kode, petunjuk: "Di HP: WhatsApp > Perangkat tertaut > Tautkan perangkat > Tautkan dengan nomor telepon, lalu ketik kode ini." },
    };
  } catch (e) {
    return hasilGagal(e);
  }
}

// ---------- Informasi Usaha ----------

export async function aksiTambahDokumen(nomorId: string, _sebelum: HasilAksi, fd: FormData): Promise<HasilAksi> {
  if (!teksSah(nomorId)) return TIDAK_DIKENAL;
  const judul = isi(fd, "judul");
  const teks = isi(fd, "teks");
  if (!teks) return { ok: false, pesan: "Isi teks Informasi Usaha dulu." };
  try {
    const dok = await klien().knowledge.tambah(nomorId, { judul: judul || "Tanpa judul", teks });
    refresh();
    return { ok: true, pesan: `"${dok.judul}" tersimpan (${dok.karakter.toLocaleString("id-ID")} karakter).` };
  } catch (e) {
    return hasilGagal(e);
  }
}

export async function aksiHapusDokumen(nomorId: string, dokId: string): Promise<HasilAksi> {
  if (!teksSah(nomorId) || !teksSah(dokId)) return TIDAK_DIKENAL;
  try {
    await klien().knowledge.hapus(nomorId, dokId);
    refresh();
    return { ok: true, pesan: "Dokumen dihapus." };
  } catch (e) {
    return hasilGagal(e);
  }
}

// ---------- Pesan ----------

/** Kirim pesan lewat antrean anti-blokir, dengan kunci idempotensi supaya percobaan ulang tidak mengirim dua kali. */
export async function aksiKirimPesan(_sebelum: HasilAksi, fd: FormData): Promise<HasilAksi> {
  const nomorId = isi(fd, "nomor_id");
  const ke = isi(fd, "ke");
  const teks = isi(fd, "teks");
  if (!nomorId || !ke || !teks) return { ok: false, pesan: "Pilih nomor pengirim, isi nomor tujuan, dan isi pesannya." };
  try {
    const pesan = await denganCobaUlang(randomUUID(), (kunci) => klien().pesan.kirim({ nomor_id: nomorId, ke, teks }, { idempotensi: kunci }));
    return { ok: true, pesan: `Pesan masuk antrean (id ${pesan.id}). Status akhirnya datang lewat event pesan.status.` };
  } catch (e) {
    return hasilGagal(e);
  }
}

/** Balas manual dari inbox; mesin otomatis menjeda bot untuk percakapan itu. */
export async function aksiBalas(nomorId: string, percakapanId: string, _sebelum: HasilAksi, fd: FormData): Promise<HasilAksi> {
  if (!teksSah(nomorId) || !teksSah(percakapanId)) return TIDAK_DIKENAL;
  const teks = isi(fd, "teks");
  if (!teks) return { ok: false, pesan: "Tulis balasannya dulu." };
  try {
    await denganCobaUlang(randomUUID(), (kunci) => klien().percakapan.balas(nomorId, percakapanId, teks, { idempotensi: kunci }));
    refresh();
    return { ok: true, pesan: "Balasan masuk antrean kirim." };
  } catch (e) {
    return hasilGagal(e);
  }
}

/** Jeda bot 30 menit, atau lanjutkan lagi, untuk satu percakapan. */
export async function aksiAturBot(nomorId: string, percakapanId: string, bot: "jeda" | "lanjut"): Promise<HasilAksi> {
  if (!teksSah(nomorId) || !teksSah(percakapanId) || (bot !== "jeda" && bot !== "lanjut")) return TIDAK_DIKENAL;
  try {
    await klien().percakapan.aturBot(nomorId, percakapanId, bot === "jeda" ? { bot, menit: 30 } : { bot });
    refresh();
    return { ok: true, pesan: bot === "jeda" ? "Bot dijeda 30 menit." : "Bot dilanjutkan." };
  } catch (e) {
    return hasilGagal(e);
  }
}

// ---------- Webhook ----------

/** Daftarkan `<ALAMAT_APLIKASI>/api/webhook` ke mesin. Rahasia penanda tangan hanya tampil sekali di sini. */
export async function aksiDaftarkanWebhook(): Promise<HasilAksi> {
  const url = urlWebhook();
  let hasil: WebhookBaru;
  try {
    const cg = klien();
    try {
      hasil = await cg.webhook.atur({ url, event: [...EVENT_WEBHOOK] });
    } catch (e) {
      // Mesin versi lama belum mengenal sebagian event (nomor.qr dkk.): langgani semua event yang didukungnya.
      if (e instanceof GalatChatGerCep && e.kode === "isian_tidak_sah" && /event/i.test(e.message)) hasil = await cg.webhook.atur({ url });
      else throw e;
    }
  } catch (e) {
    return hasilGagal(e);
  }
  ingatRahasiaWebhook(hasil.rahasia);
  refresh();
  return {
    ok: true,
    pesan: `Webhook terdaftar ke ${hasil.url} (${hasil.event.length} event).`,
    tampil: {
      label: "Rahasia webhook (hanya tampil sekali)",
      nilai: `CHATGERCEP_RAHASIA_WEBHOOK=${hasil.rahasia}`,
      petunjuk: "Salin baris ini ke .env.local, lalu jalankan ulang aplikasi. Sampai dijalankan ulang, rahasia ini sudah dipakai dari memori.",
    },
  };
}

/** Minta mesin mengirim satu event `webhook.uji` ke aplikasi ini. */
export async function aksiUjiWebhook(): Promise<HasilAksi> {
  try {
    const h = await klien().webhook.uji();
    refresh();
    return h.terkirim
      ? { ok: true, pesan: `Event uji diterima aplikasi (HTTP ${h.status ?? 200}, ${h.ms ?? "?"} ms).` }
      : { ok: false, pesan: "Event uji tidak sampai ke aplikasi ini.", rinci: h.galat ?? (h.status ? `HTTP ${h.status}` : undefined) };
  } catch (e) {
    return hasilGagal(e);
  }
}
