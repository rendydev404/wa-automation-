import "server-only";
import { perkiraanPerBalasan } from "./ai";
import { db, getSetting, sekarang, setSettingBersama } from "./db";
import { MAKS_HARGA_PAKET } from "./harga";
import { kursUsd } from "./kurs";
import { pemakaianNyata } from "./langganan";
import { AMBANG_KURS_CUSTOM, type HasilCustom, KODE_CUSTOM, type PaketCustom, customBisaDibeli, hitungCustom, rapikanCustom } from "./paket-custom-def";

export * from "./paket-custom-def";

/**
 * Penyimpanan paket Custom (rumusnya di paket-custom-def.ts). Isian admin disimpan sebagai JSON di settings, dan
 * SEKALIGUS dicerminkan ke satu baris tabel paket (kode KODE_CUSTOM) dalam satu transaksi, supaya paket Custom bisa
 * dibayar lewat Midtrans, diberikan admin dari halaman pengguna, dan diperpanjang seperti paket biasa. Baris itu tidak
 * ikut daftar paket biasa (daftarPaket) dan tidak disentuh formulir maupun simulasi paket biasa.
 */

const KUNCI = "paket_custom";

/** Urutan baris cermin di tabel paket: selalu setelah paket lain (kartunya juga tampil paling akhir). */
const URUTAN_CUSTOM = 9999;

export class GalatCustom extends Error {}

async function tulis(p: PaketCustom): Promise<void> {
  await setSettingBersama(KUNCI, JSON.stringify(p), async (tx) => {
    await tx`
      INSERT INTO paket(kode, nama, harga, durasi_hari, kuota_nomor, kuota_balasan, deskripsi, aktif, unggulan, urutan, komisi_jenis, komisi_nilai, created_at)
      VALUES (${KODE_CUSTOM}, ${p.nama}, ${p.harga}, ${p.durasi_hari}, ${p.kuota_nomor}, ${p.kuota_balasan}, ${p.deskripsi}, ${customBisaDibeli(p)}, false, ${URUTAN_CUSTOM}, ${p.komisi_jenis}, ${p.komisi_nilai}, ${sekarang()})
      ON CONFLICT (kode) DO UPDATE SET nama = EXCLUDED.nama, harga = EXCLUDED.harga, durasi_hari = EXCLUDED.durasi_hari, kuota_nomor = EXCLUDED.kuota_nomor,
             kuota_balasan = EXCLUDED.kuota_balasan, deskripsi = EXCLUDED.deskripsi, aktif = EXCLUDED.aktif,
             komisi_jenis = EXCLUDED.komisi_jenis, komisi_nilai = EXCLUDED.komisi_nilai`;
  });
}

const gs = globalThis as unknown as { __waCustomKurs?: Promise<PaketCustom | null> };

/** Harga otomatis dihitung ulang dengan kurs baru (isi paket, termasuk jumlah nomor, tidak berubah). */
async function ikutiKurs(p: PaketCustom, kurs: number): Promise<PaketCustom | null> {
  try {
    const h = hitungCustom({ ...p, nomor_otomatis: false }, { usd: perkiraanPerBalasan(p.model), kurs, balasanPerNomorBulan: 0 });
    if (h.hargaOtomatis === null || h.hargaOtomatis > MAKS_HARGA_PAKET) return null;
    const baru: PaketCustom = { ...p, harga: h.hargaOtomatis, kurs, dihitung: sekarang() };
    await tulis(baru);
    if (baru.harga !== p.harga) console.log(`[paket-custom] harga mengikuti kurs Rp${p.kurs}→Rp${kurs}/USD: Rp${p.harga} → Rp${baru.harga}`);
    return baru;
  } catch (e) {
    console.error(`[paket-custom] gagal mengikuti kurs: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

/**
 * Paket Custom yang berlaku. Bila admin mengizinkan harga mengikuti kurs (harga otomatis, `ikut_kurs`) dan kurs pasar
 * sudah bergeser >= 1% dari kurs saat harga dihitung, harga dihitung ulang dan disimpan dulu (satu kali walau banyak
 * permintaan serentak), jadi kartu dan tagihan Midtrans selalu memakai harga yang sama.
 */
export async function paketCustom(): Promise<PaketCustom> {
  const mentah = await getSetting(KUNCI);
  let d: unknown = null;
  try {
    d = mentah ? JSON.parse(mentah) : null;
  } catch {
    /* rusak = bawaan */
  }
  const p = rapikanCustom(d);
  if (!p.ikut_kurs || p.harga_manual || p.kurs <= 0) return p;
  const kurs = await kursUsd();
  if (Math.abs(kurs - p.kurs) / p.kurs < AMBANG_KURS_CUSTOM) return p;
  gs.__waCustomKurs ??= ikutiKurs(p, kurs).finally(() => {
    gs.__waCustomKurs = undefined;
  });
  return (await gs.__waCustomKurs) ?? p;
}

/**
 * Simpan isian admin (sudah lolos periksaCustom). Harga & jumlah nomor dihitung ulang di server dengan kurs pasar dan
 * pemakaian nyata saat ini, memakai rumus yang sama dengan pratinjau; angka hasil hitungan dari browser tidak dipakai.
 */
export async function simpanPaketCustom(isian: PaketCustom): Promise<{ p: PaketCustom; h: HasilCustom }> {
  const usd = perkiraanPerBalasan(isian.model);
  if (usd === null) throw new GalatCustom("Tarif model acuan belum diketahui.");
  const [kurs, nyata] = await Promise.all([kursUsd(), pemakaianNyata()]);
  const h = hitungCustom(isian, { usd, kurs, balasanPerNomorBulan: nyata.balasanPerNomorBulan });
  if (!isian.harga_manual && h.hargaOtomatis === null) throw new GalatCustom(`Margin ${isian.margin}% + biaya pembayaran mencapai 100%: turunkan margin atau isi harga sendiri.`);
  if (h.harga > MAKS_HARGA_PAKET) throw new GalatCustom(`Harga maksimal Rp${MAKS_HARGA_PAKET.toLocaleString("id-ID")}: kurangi kuota atau durasi.`);
  const p: PaketCustom = { ...isian, kuota_nomor: h.kuotaNomor, harga: h.harga, kurs, dihitung: sekarang() };
  await tulis(p);
  return { p, h };
}

/** Id baris paket Custom di tabel paket (untuk tombol bayar); null bila paket Custom belum pernah disimpan. */
export async function idPaketCustom(): Promise<number | null> {
  const sql = await db();
  const [r] = await sql<{ id: number }[]>`SELECT id FROM paket WHERE kode = ${KODE_CUSTOM}`;
  return r?.id ?? null;
}
