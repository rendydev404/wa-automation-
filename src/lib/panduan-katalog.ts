import "server-only";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { db, getSetting, sekarang, setSetting } from "./db";
import { BATAS_KATALOG } from "./katalog-def";
import { AWALAN_PANDUAN, PANDUAN, namaItemPanduan } from "./panduan-def";

/**
 * Gambar panduan cara pakai (lib/panduan-def.ts) sebagai item katalog di nomor CS ChatGerCep (yang ikut sinkron-cg),
 * supaya bot bisa mengirim tutorial bergambar per kategori lewat tag <kirim_produk>. Item dikenali dari awalan namanya
 * (AWALAN_PANDUAN), tanpa harga, dan tidak dianggap produk (katalog-def.ts). Foto dari public/panduan/wa/<gambar>.jpg.
 *
 * Ditulis ulang hanya bila isinya berubah (hash teks + ukuran berkas) atau jumlah itemnya di database tidak cocok
 * (mis. ada yang terhapus dari dashboard); selain itu cukup satu query hitung untuk semua nomor.
 */

const KUNCI_HASH = "panduan_katalog_hash:";
const URUTAN_AWAL = 1000;
const POLA = `${AWALAN_PANDUAN}%`;

export interface ItemPanduan {
  nama: string;
  deskripsi: string;
  gambar: string;
  urutan: number;
}

const potong = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

export const ITEM_PANDUAN: ItemPanduan[] = PANDUAN.flatMap((kat, k) =>
  kat.langkah.map((l, i) => ({
    nama: potong(namaItemPanduan(k, kat, i), BATAS_KATALOG.nama),
    deskripsi: potong(`${l.judul.id}: ${l.teks.id}`, BATAS_KATALOG.deskripsi),
    gambar: l.gambar,
    urutan: 0,
  })),
).map((x, n) => ({ ...x, urutan: URUTAN_AWAL + n }));

const berkas = (g: string, akar = process.cwd()) => path.join(akar, "public", "panduan", "wa", `${g}.jpg`);

/** Sidik isi panduan: teks item + ukuran tiap gambar (gambar difoto ulang = ukuran berubah). */
export async function hashPanduan(akar = process.cwd()): Promise<string> {
  const ukuran = await Promise.all(ITEM_PANDUAN.map((x) => stat(berkas(x.gambar, akar)).then((s) => s.size)));
  return createHash("sha256")
    .update(JSON.stringify(ITEM_PANDUAN.map((x, i) => [x.nama, x.deskripsi, x.urutan, ukuran[i]])))
    .digest("hex");
}

/** Samakan item panduan di katalog nomor-nomor ini dengan isi panduan saat ini. */
export async function sinkronPanduanKatalog(ids: number[], akar = process.cwd()): Promise<void> {
  if (!ids.length) return;
  const sql = await db();
  const [hash, jumlah, simpan] = await Promise.all([
    hashPanduan(akar),
    sql<{ number_id: number; n: number }[]>`
      SELECT number_id, COUNT(*)::int AS n FROM produk WHERE number_id IN ${sql(ids)} AND nama LIKE ${POLA} GROUP BY number_id`,
    Promise.all(ids.map((id) => getSetting(KUNCI_HASH + id))),
  ]);
  const ada = new Map(jumlah.map((r) => [r.number_id, r.n]));
  const perlu = ids.filter((id, i) => simpan[i] !== hash || ada.get(id) !== ITEM_PANDUAN.length);
  if (!perlu.length) return;

  // Nomor yang sudah dihapus tidak ikut (FK produk -> numbers).
  const hidup = new Set((await sql<{ id: number }[]>`SELECT id FROM numbers WHERE id IN ${sql(perlu)}`).map((r) => r.id));
  const foto = await Promise.all(ITEM_PANDUAN.map((x) => readFile(berkas(x.gambar, akar))));
  const t = sekarang();
  for (const id of perlu) {
    if (!hidup.has(id)) continue;
    await sql.begin(async (tx) => {
      await tx`DELETE FROM produk WHERE number_id = ${id} AND nama LIKE ${POLA}`;
      const baris = ITEM_PANDUAN.map((x, i) => ({
        number_id: id,
        nama: x.nama,
        harga: null,
        deskripsi: x.deskripsi,
        tersedia: true,
        foto: foto[i],
        foto_mime: "image/jpeg",
        urutan: x.urutan,
        created_at: t,
        updated_at: t,
      }));
      await tx`INSERT INTO produk ${tx(baris, "number_id", "nama", "harga", "deskripsi", "tersedia", "foto", "foto_mime", "urutan", "created_at", "updated_at")}`;
    });
    await setSetting(KUNCI_HASH + id, hash);
  }
}

/** Nomor berhenti ikut sinkron-cg: item panduannya dihapus. */
export async function hapusPanduanKatalog(numberId: number): Promise<void> {
  const sql = await db();
  await sql`DELETE FROM produk WHERE number_id = ${numberId} AND nama LIKE ${POLA}`;
  await sql`DELETE FROM settings WHERE kunci = ${KUNCI_HASH + numberId}`;
}
