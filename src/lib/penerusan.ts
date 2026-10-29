import "server-only";
import { aturan, saklar } from "./aturan";
import { db, sekarang } from "./db";
import type { Nomor } from "./numbers";
import { type JenisTeruskan, type TagTeruskan, pesanUntukPemilik } from "./teruskan";
import { kirimTeks } from "./wa";

/**
 * Pengiriman pesan yang diteruskan AI ke WhatsApp pribadi pemilik nomor (numbers.teruskan_ke), dikirim dari nomor
 * bisnis itu sendiri. Setiap penerusan dicatat (riwayat di halaman nomor + batas harian dari aturan admin).
 */

export interface PelangganTeruskan {
  kunci: string;
  nama: string | null;
  telepon: string | null;
}

export interface BarisTeruskan {
  id: number;
  pelanggan: string;
  jenis: JenisTeruskan;
  ringkasan: string;
  tujuan: string;
  status: "terkirim" | "gagal";
  created_at: number;
}

/** Penerusan ke nomor ini bisa dipakai sekarang (aktif, tujuan terpasang, diizinkan admin)? */
export async function bisaTeruskan(n: Pick<Nomor, "teruskan_aktif" | "teruskan_ke">): Promise<boolean> {
  return n.teruskan_aktif && !!n.teruskan_ke && (await saklar("teruskan_diizinkan"));
}

const g = globalThis as unknown as { __waTeruskan?: Map<string, number> };
/** Ringkasan yang baru saja diteruskan per chat (kunci -> waktu): AI yang mengulang tag yang sama tidak dikirim dua kali. */
const baru = (g.__waTeruskan ??= new Map());
const JEDA_SAMA_MS = 30 * 60_000;

async function catat(numberId: number, chat: string, pelanggan: string, tag: TagTeruskan, tujuan: string, status: "terkirim" | "gagal"): Promise<void> {
  const sql = await db();
  await sql`INSERT INTO teruskan(number_id, chat, pelanggan, jenis, ringkasan, tujuan, status, created_at)
            VALUES (${numberId}, ${chat}, ${pelanggan}, ${tag.jenis}, ${tag.ringkasan}, ${tujuan}, ${status}, ${sekarang()})`;
}

async function jumlahHariIni(numberId: number): Promise<number> {
  const sql = await db();
  const [r] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM teruskan WHERE number_id = ${numberId} AND created_at >= ${sekarang() - 86_400}`;
  return r.n;
}

/**
 * Teruskan satu hal ke pemilik. `padaId` mencatat id pesan sebelum berangkat (supaya gema pesan keluar ini tidak
 * dikira balasan manusia). Hasil: "terkirim", "dilewati" (dobel / batas harian / tidak aktif), atau "gagal".
 */
export async function teruskanKePemilik(
  nomor: Pick<Nomor, "id" | "sesi" | "label" | "nama_wa" | "teruskan_ke" | "teruskan_aktif">,
  pelanggan: PelangganTeruskan,
  tag: TagTeruskan,
  padaId?: (id: string) => void
): Promise<"terkirim" | "dilewati" | "gagal"> {
  if (!(await bisaTeruskan(nomor)) || !nomor.teruskan_ke) return "dilewati";
  const sidik = `${nomor.id}:${pelanggan.kunci}:${tag.jenis}:${tag.ringkasan}`;
  const kini = Date.now();
  if (kini - (baru.get(sidik) ?? 0) < JEDA_SAMA_MS) return "dilewati";
  if ((await jumlahHariIni(nomor.id)) >= (await aturan("teruskan_maks_harian"))) {
    console.warn(`[teruskan] batas harian nomor ${nomor.id} tercapai, ${tag.jenis} tidak diteruskan`);
    return "dilewati";
  }
  baru.set(sidik, kini);
  if (baru.size > 2000) for (const [k, t] of baru) if (kini - t > JEDA_SAMA_MS) baru.delete(k);

  const label = [pelanggan.nama, pelanggan.telepon ? `+${pelanggan.telepon}` : null].filter(Boolean).join(" · ");
  const teks = pesanUntukPemilik({ tag, namaPelanggan: pelanggan.nama, teleponPelanggan: pelanggan.telepon, labelNomor: nomor.label, namaWa: nomor.nama_wa });
  try {
    await kirimTeks(nomor.sesi, `${nomor.teruskan_ke}@s.whatsapp.net`, teks, padaId);
    await catat(nomor.id, pelanggan.kunci, label, tag, nomor.teruskan_ke, "terkirim");
    console.info(`[teruskan] ${tag.jenis} nomor ${nomor.id} -> pemilik`);
    return "terkirim";
  } catch (e) {
    await catat(nomor.id, pelanggan.kunci, label, tag, nomor.teruskan_ke, "gagal").catch(() => {});
    console.error(`[teruskan] gagal mengirim ke pemilik nomor ${nomor.id}: ${e instanceof Error ? e.message : e}`);
    return "gagal";
  }
}

/** Pesan uji dari dashboard: memastikan nomor tujuan benar dan WhatsApp-nya menerima. */
export async function ujiTeruskan(nomor: Pick<Nomor, "id" | "sesi" | "label" | "nama_wa">, tujuan: string, padaId?: (id: string) => void): Promise<void> {
  const tag: TagTeruskan = {
    jenis: "uji",
    ringkasan: "Nomor ini sudah tersambung. Mulai sekarang pesanan, bukti bayar, keluhan, dan permintaan bicara dengan manusia dari pelanggan akan diringkas AI lalu dikirim ke sini.",
  };
  const teks = pesanUntukPemilik({ tag, namaPelanggan: "Uji dari dashboard", teleponPelanggan: null, labelNomor: nomor.label, namaWa: nomor.nama_wa });
  try {
    await kirimTeks(nomor.sesi, `${tujuan}@s.whatsapp.net`, teks, padaId);
  } catch (e) {
    await catat(nomor.id, "uji", "Uji dari dashboard", tag, tujuan, "gagal").catch(() => {});
    throw e;
  }
  await catat(nomor.id, "uji", "Uji dari dashboard", tag, tujuan, "terkirim");
}

/** Riwayat penerusan satu nomor, terbaru dulu (lewat indeks teruskan_nomor_idx). */
export async function riwayatTeruskan(numberId: number, batas = 20): Promise<BarisTeruskan[]> {
  const sql = await db();
  return sql<BarisTeruskan[]>`
    SELECT id, pelanggan, jenis, ringkasan, tujuan, status, created_at FROM teruskan
     WHERE number_id = ${numberId} ORDER BY created_at DESC, id DESC LIMIT ${batas}`;
}
