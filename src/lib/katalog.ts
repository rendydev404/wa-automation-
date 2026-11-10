import "server-only";
import { db, getSetting, sekarang } from "./db";
import { akunBerbayar } from "./langganan";
import { BATAS_KATALOG, type KirimProduk, MAKS_HARGA_PRODUK, type Produk, pilihUntukKirim } from "./katalog-def";
import { staf } from "./peran";
import { modeMesin } from "./mode";

export * from "./katalog-def";

/**
 * Katalog produk per nomor (fitur akun berbayar; admin selalu boleh). Produk & fotonya di PostgreSQL (tabel produk).
 * Daftar untuk AI dibaca tanpa kolom foto; foto hanya dibaca saat benar-benar dikirim atau ditampilkan di dashboard.
 */

export class KatalogError extends Error {
  /** Pesan versi Inggris (tampilan /eng, dipilih di actions/API); `message` tetap bahasa Indonesia (juga untuk log). */
  en?: string;
  constructor(message: string, en?: string) {
    super(message);
    this.en = en;
  }
}

type FotoMime = "image/jpeg" | "image/png" | "image/webp";

/** Jenis gambar dari isi berkasnya (bukan dari nama/tipe yang dikirim browser); null = bukan JPEG/PNG/WebP. */
export function jenisFoto(d: Uint8Array): FotoMime | null {
  if (d[0] === 0xff && d[1] === 0xd8 && d[2] === 0xff) return "image/jpeg";
  if (d[0] === 0x89 && d[1] === 0x50 && d[2] === 0x4e && d[3] === 0x47) return "image/png";
  if (d.length > 12 && String.fromCharCode(...d.slice(0, 4)) === "RIFF" && String.fromCharCode(...d.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

const KOLOM = "id, nama, harga, deskripsi, tersedia, foto IS NOT NULL AS \"adaFoto\", urutan, updated_at AS diubah";

export async function daftarProduk(numberId: number): Promise<Produk[]> {
  const sql = await db();
  return [...(await sql<Produk[]>`SELECT ${sql.unsafe(KOLOM)} FROM produk WHERE number_id = ${numberId} ORDER BY urutan, id`)];
}

const gk = globalThis as unknown as { __waKatalogBoleh?: Map<number, { at: number; ok: boolean }> };
const cacheBoleh = (gk.__waKatalogBoleh ??= new Map());

/**
 * Akun ini boleh memakai katalog: admin, punya langganan aktif, atau pemilik nomor CS ChatGerCep (nomor yang dipilih
 * admin di sinkron-cg; katalognya berisi gambar panduan). Dipegang 60 dtk (dipanggil tiap balasan AI).
 */
export async function katalogBoleh(userId: number | null): Promise<boolean> {
  if (userId === null) return false;
  if (modeMesin()) return true; // mesin self-host: semua fitur tanpa paket
  const c = cacheBoleh.get(userId);
  if (c && Date.now() - c.at < 60_000) return c.ok;
  const sql = await db();
  const [u] = await sql<{ peran: string }[]>`SELECT peran FROM users WHERE id = ${userId}`;
  const ok = staf(u?.peran) || (await akunBerbayar(userId)) || (await punyaNomorCs(userId));
  cacheBoleh.set(userId, { at: Date.now(), ok });
  return ok;
}

/** Setting dibaca langsung (bukan lewat sinkron-cg.ts) supaya tidak terjadi impor melingkar. */
async function punyaNomorCs(userId: number): Promise<boolean> {
  let ids: number[] = [];
  try {
    const v = JSON.parse((await getSetting("sinkron_cg_nomor")) ?? "[]");
    if (Array.isArray(v)) ids = v.filter((x): x is number => Number.isInteger(x));
  } catch {}
  if (!ids.length) return false;
  const sql = await db();
  const [r] = await sql`SELECT 1 FROM numbers WHERE user_id = ${userId} AND id IN ${sql(ids)} LIMIT 1`;
  return !!r;
}

export interface IsianProduk {
  id?: number;
  nama: string;
  harga: number | null;
  deskripsi: string;
  tersedia: boolean;
  /** undefined = foto tidak diubah; null = foto dihapus. */
  foto?: Uint8Array | null;
}

/** Periksa isian dari formulir; galat berupa pesan untuk pengguna. */
export function periksaIsianProduk(p: IsianProduk): void {
  if (p.nama.trim().length < 2) throw new KatalogError("Nama produk wajib diisi.", "Product name is required.");
  if (p.nama.length > BATAS_KATALOG.nama) throw new KatalogError(`Nama produk maksimal ${BATAS_KATALOG.nama} karakter.`, `Product name can be at most ${BATAS_KATALOG.nama} characters.`);
  if (p.deskripsi.length > BATAS_KATALOG.deskripsi) throw new KatalogError(`Keterangan maksimal ${BATAS_KATALOG.deskripsi} karakter.`, `Description can be at most ${BATAS_KATALOG.deskripsi} characters.`);
  if (p.harga !== null && !(Number.isInteger(p.harga) && p.harga >= 0 && p.harga <= MAKS_HARGA_PRODUK)) throw new KatalogError("Harga tidak valid.", "Invalid price.");
  if (p.foto) {
    if (p.foto.length > BATAS_KATALOG.fotoByte) throw new KatalogError("Foto terlalu besar (maksimal 1,5 MB).", "Photo is too large (max 1.5 MB).");
    if (!jenisFoto(p.foto)) throw new KatalogError("Foto harus berupa JPG, PNG, atau WebP.", "Photo must be a JPG, PNG, or WebP.");
  }
}

/** Tambah (tanpa id) atau ubah produk milik nomor ini; mengembalikan id. */
export async function simpanProduk(numberId: number, p: IsianProduk): Promise<number> {
  periksaIsianProduk(p);
  const sql = await db();
  const t = sekarang();
  const nama = p.nama.trim();
  const deskripsi = p.deskripsi.trim();
  const mime = p.foto ? jenisFoto(p.foto) : null;
  const foto = p.foto ? Buffer.from(p.foto) : null;
  if (p.id) {
    const ubahFoto = p.foto !== undefined;
    const [r] = await sql<{ id: number }[]>`
      UPDATE produk SET nama = ${nama}, harga = ${p.harga}, deskripsi = ${deskripsi}, tersedia = ${p.tersedia}, updated_at = ${t},
             foto = CASE WHEN ${ubahFoto} THEN ${foto}::bytea ELSE foto END,
             foto_mime = CASE WHEN ${ubahFoto} THEN ${mime}::text ELSE foto_mime END
       WHERE id = ${p.id} AND number_id = ${numberId}
      RETURNING id`;
    if (!r) throw new KatalogError("Produk tidak ditemukan.", "Product not found.");
    return r.id;
  }
  const [{ n, maks }] = await sql<{ n: number; maks: number }[]>`SELECT COUNT(*)::int AS n, COALESCE(MAX(urutan), 0)::int AS maks FROM produk WHERE number_id = ${numberId}`;
  if (n >= BATAS_KATALOG.produk) throw new KatalogError(`Katalog sudah penuh (maksimal ${BATAS_KATALOG.produk} produk per nomor).`, `The catalog is full (max ${BATAS_KATALOG.produk} products per number).`);
  const [r] = await sql<{ id: number }[]>`
    INSERT INTO produk(number_id, nama, harga, deskripsi, tersedia, foto, foto_mime, urutan, created_at, updated_at)
    VALUES (${numberId}, ${nama}, ${p.harga}, ${deskripsi}, ${p.tersedia}, ${foto}, ${mime}, ${maks + 1}, ${t}, ${t})
    RETURNING id`;
  return r.id;
}

export async function hapusProduk(numberId: number, id: number): Promise<void> {
  const sql = await db();
  await sql`DELETE FROM produk WHERE id = ${id} AND number_id = ${numberId}`;
}

export async function setTersedia(numberId: number, id: number, tersedia: boolean): Promise<void> {
  const sql = await db();
  await sql`UPDATE produk SET tersedia = ${tersedia}, updated_at = ${sekarang()} WHERE id = ${id} AND number_id = ${numberId}`;
}

/** Geser produk satu posisi ke atas/bawah (tukar urutan dengan tetangganya). */
export async function geserProduk(numberId: number, id: number, arah: -1 | 1): Promise<void> {
  const daftar = await daftarProduk(numberId);
  const i = daftar.findIndex((p) => p.id === id);
  const j = i + arah;
  if (i < 0 || j < 0 || j >= daftar.length) return;
  const urut = daftar.map((p) => p.id);
  [urut[i], urut[j]] = [urut[j], urut[i]];
  const sql = await db();
  await sql.begin(async (tx) => {
    for (const [k, pid] of urut.entries()) await tx`UPDATE produk SET urutan = ${k + 1} WHERE id = ${pid} AND number_id = ${numberId}`;
  });
}

/** Foto satu produk (untuk dashboard & Uji bot); pemanggil memeriksa hak akses lewat number_id. */
export async function fotoProduk(id: number): Promise<{ numberId: number; data: Buffer; mime: string; diubah: number } | undefined> {
  const sql = await db();
  const [r] = await sql<{ number_id: number; foto: Buffer | null; foto_mime: string | null; updated_at: number }[]>`
    SELECT number_id, foto, foto_mime, updated_at FROM produk WHERE id = ${id}`;
  return r?.foto && r.foto_mime ? { numberId: r.number_id, data: r.foto, mime: r.foto_mime, diubah: r.updated_at } : undefined;
}

/** Produk (beserta fotonya) yang dikirim untuk sebuah tag AI. */
export async function bahanKirim(numberId: number, tag: KirimProduk): Promise<{ daftar: Produk[]; daftarTeks: boolean; foto: (Produk & { data: Buffer; mime: string })[] }> {
  const daftar = await daftarProduk(numberId);
  const pilih = pilihUntukKirim(daftar, tag);
  if (!pilih.foto.length) return { daftar, daftarTeks: pilih.daftarTeks, foto: [] };
  const sql = await db();
  const baris = await sql<{ id: number; foto: Buffer; foto_mime: string }[]>`
    SELECT id, foto, foto_mime FROM produk WHERE number_id = ${numberId} AND id IN ${sql(pilih.foto.map((p) => p.id))} AND foto IS NOT NULL`;
  const per = new Map(baris.map((b) => [b.id, b]));
  return {
    daftar,
    daftarTeks: pilih.daftarTeks,
    foto: pilih.foto.flatMap((p) => {
      const b = per.get(p.id);
      return b ? [{ ...p, data: b.foto, mime: b.foto_mime }] : [];
    }),
  };
}
