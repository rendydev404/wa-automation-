import "server-only";
import { aturan, saklar } from "./aturan";
import { db, getSetting, sekarang, setSetting } from "./db";
import { angka, tanggal } from "./format";
import { balasanTerpakai, hakAkun } from "./langganan";
import { type Nomor, nomorMilik } from "./numbers";
import { type JenisTeruskan, type TagTeruskan, pesanUntukPemilik } from "./teruskan";
import { infoSesi, kirimTeks } from "./wa";

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
/**
 * Nomor penerus wajib diisi (siapDipakai), jadi penerusan selalu aktif begitu nomornya ada: pesanan, keluhan, bukti
 * bayar, dan permintaan bicara dengan orang selalu sampai ke pemilik. Hanya saklar sistem admin yang bisa mematikannya.
 */
export async function bisaTeruskan(n: Pick<Nomor, "teruskan_ke">): Promise<boolean> {
  return !!n.teruskan_ke && (await saklar("teruskan_diizinkan"));
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

const sedangKabar = new Set<number>(); // pemilik yang notifikasi kuotanya sedang dikirim (pesan serentak tidak dobel)

/**
 * Kuota balasan AI pemilik nomor habis: kabari WhatsApp pribadinya (penerima penerusan) supaya segera memperpanjang
 * atau menaikkan paket. Paling banyak sekali per periode kuota per akun (dicatat di settings, bertahan walau server
 * dimulai ulang); periode baru (paket diperpanjang / bulan baru) yang habis lagi dikabari lagi. Dikirim dari nomor
 * bisnis yang menerima pesan, hanya bila penerusan nomor itu aktif. Tercatat di riwayat penerusan nomor.
 */
export async function kabariKuotaHabis(
  nomor: Pick<Nomor, "id" | "user_id" | "sesi" | "label" | "nama_wa" | "teruskan_ke" | "teruskan_aktif">,
  padaId?: (id: string) => void
): Promise<"terkirim" | "dilewati" | "gagal"> {
  const userId = nomor.user_id;
  // Penanda dipasang sebelum await apa pun: pesan serentak dari banyak pelanggan hanya memicu satu kabar.
  if (userId === null || !nomor.teruskan_ke || sedangKabar.has(userId)) return "dilewati";
  sedangKabar.add(userId);
  try {
    if (!(await bisaTeruskan(nomor))) return "dilewati";
    const sql = await db();
    const [u] = await sql<{ peran: string }[]>`SELECT peran FROM users WHERE id = ${userId}`;
    if (!u) return "dilewati";
    const hak = await hakAkun({ id: userId, peran: u.peran });
    if (hak.balasan === null) return "dilewati";
    // Sekali per periode kuota; kuotanya ditambah (paket diperpanjang, kuota percobaan dinaikkan admin) lalu habis lagi
    // = dikabari lagi.
    const kunci = `kuota_habis_dikabari:${userId}`;
    const penanda = `${hak.periodeMulai}:${hak.balasan}:${hak.percobaanSampai ?? ""}`;
    if ((await getSetting(kunci)) === penanda) return "dilewati";
    const terpakai = await balasanTerpakai(userId, hak.periodeMulai);
    const app = process.env.APP_URL?.replace(/\/+$/, "");
    const ringkasan = [
      hak.percobaanBerakhir
        ? `Masa percobaan gratis sudah berakhir pada ${tanggal(hak.percobaanSampai!)} (${angka(terpakai)} dari ${angka(hak.balasan)} balasan AI terpakai).`
        : hak.percobaan
        ? `Kuota percobaan gratis sudah habis (${angka(terpakai)} dari ${angka(hak.balasan)} balasan AI terpakai).`
        : `Kuota balasan AI paket ${hak.paket} sudah habis (${angka(terpakai)} dari ${angka(hak.balasan)} terpakai).`,
      "Mulai sekarang AI TIDAK membalas pesan pelanggan di semua nomor Anda. Pesan tetap masuk dan bisa Anda balas sendiri dari HP.",
      hak.percobaan
        ? `Pilih paket untuk melanjutkan balasan AI${app ? `: ${app}/langganan` : " di menu Langganan pada dashboard"}.`
        : `Segera perpanjang atau upgrade paket${app ? `: ${app}/langganan` : " di menu Langganan pada dashboard"}.`,
    ].join("\n\n");
    const tag: TagTeruskan = { jenis: "lainnya", ringkasan };
    const teks = `⚠️ *Kuota balasan AI habis*\nNomor: ${nomor.label}${nomor.nama_wa ? ` (${nomor.nama_wa})` : ""}\n\n${ringkasan}`;
    try {
      await kirimTeks(nomor.sesi, `${nomor.teruskan_ke}@s.whatsapp.net`, teks, padaId);
    } catch (e) {
      await catat(nomor.id, "kuota", "Sistem: kuota habis", tag, nomor.teruskan_ke, "gagal").catch(() => {});
      console.error(`[teruskan] notifikasi kuota habis gagal (nomor ${nomor.id}): ${e instanceof Error ? e.message : e}`);
      return "gagal";
    }
    await setSetting(kunci, penanda);
    await catat(nomor.id, "kuota", "Sistem: kuota habis", tag, nomor.teruskan_ke, "terkirim");
    console.info(`[teruskan] kuota habis dikabarkan ke pemilik (akun ${userId}, nomor ${nomor.id})`);
    return "terkirim";
  } finally {
    sedangKabar.delete(userId);
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

/**
 * Kabari pemilik akun bahwa paketnya sudah aktif (setelah admin mengaktifkan paket berbayar manual). Dikirim seperti
 * kabar kuota habis: dari nomor bisnisnya yang tersambung ke nomor penerusnya sendiri. Tidak ada nomor yang
 * tersambung + berpenerus = "dilewati".
 */
export async function kabariPaketAktif(
  userId: number,
  p: { nama: string; sampai: number; kuota_nomor: number; kuota_balasan: number; diperpanjang: boolean }
): Promise<"terkirim" | "dilewati" | "gagal"> {
  const nomor = (await nomorMilik(userId)).find((n) => n.teruskan_ke && infoSesi(n.sesi).status === "WORKING");
  if (!nomor?.teruskan_ke) return "dilewati";
  const app = process.env.APP_URL?.replace(/\/+$/, "");
  const teks = [
    `✅ *Paket ${p.nama} ${p.diperpanjang ? "diperpanjang" : "sudah aktif"}*`,
    "",
    `Berlaku sampai: ${tanggal(p.sampai)}`,
    `Kuota: ${angka(p.kuota_balasan)} balasan AI, ${angka(p.kuota_nomor)} nomor WhatsApp`,
    "",
    `Terima kasih! Detail langganan bisa dilihat${app ? ` di ${app}/langganan` : " di menu Langganan pada dashboard"}.`,
  ].join("\n");
  try {
    await kirimTeks(nomor.sesi, `${nomor.teruskan_ke}@s.whatsapp.net`, teks);
    return "terkirim";
  } catch (e) {
    console.error(`[teruskan] kabar paket aktif gagal (akun ${userId}): ${e instanceof Error ? e.message : e}`);
    return "gagal";
  }
}
