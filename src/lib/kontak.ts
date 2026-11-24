import "server-only";
import { db, sekarang } from "./db";
import { type Nomor, nomorById, nomorBySesi } from "./numbers";
import { skala } from "./skala-waktu";
import { type KontakWa, WaError, padaKontak, tarikKontak } from "./wa";

/**
 * "Jangan balas kontak yang tersimpan di HP" (numbers.abaikan_kontak, bawaan mati). Pesan dari nomor yang disimpan
 * pemilik di buku telepon HP tetap tercatat di histori, tetapi tidak dibalas AI; pemilik membalasnya sendiri. Kontak
 * yang dipilih pemilik sebagai pengecualian (`tetap_balas`) tetap dilayani AI. Nomor yang tidak tersimpan selalu
 * dilayani seperti biasa.
 *
 * Sumber kontak: app-state WhatsApp (`contactAction`), diteruskan wa.ts lewat padaKontak. Hanya disimpan selama fitur
 * ini aktif di nomor itu (tidak menimbun buku telepon pemilik yang tidak memakainya). Saat fitur dinyalakan, daftar
 * lengkapnya ditarik ulang dari WhatsApp (tarikUlangKontak); tarikan penuh juga membuang kontak yang sudah dihapus di HP.
 * Jalur resmi (Cloud API Meta) tidak punya buku telepon, jadi fitur ini hanya untuk nomor yang tersambung lewat QR.
 *
 * Pengecekan per pesan memakai peta di memori per nomor (hanya nomor yang fiturnya aktif, dimuat sekali lalu
 * dibuang setiap kali kontaknya berubah), jadi tanpa query di jalur pesan.
 */

/** Kunci peta: `t:<digit>` (nomor telepon) atau `l:<lid>`. Nilai: true = pengecualian (tetap dibalas AI). */
type Peta = Map<string, boolean>;

interface StatusTarik {
  sedang: boolean;
  /** Detik epoch tarikan terakhir selesai (berhasil atau gagal). */
  pada: number;
  /** Jumlah kontak yang dikirim WhatsApp pada tarikan terakhir. */
  jumlah: number;
  galat: string | null;
  galatEn: string | null;
}

interface Keadaan {
  peta: Map<number, Promise<Peta>>;
  tulis: Map<number, Promise<void>>;
  tarik: Map<number, StatusTarik>;
  /** Kontak yang tiba selama tarikan penuh sedang berjalan, per nomor. */
  diterima: Map<number, number>;
}
const g = globalThis as unknown as { __waKontak?: Keadaan };
const st: Keadaan = (g.__waKontak ??= { peta: new Map(), tulis: new Map(), tarik: new Map(), diterima: new Map() });

const BATAS_SISIP = 500;
/** Jarak minimum antar-tarikan penuh per nomor (tombol "Perbarui daftar" ditekan berulang). */
const JEDA_TARIK_DTK = 30;

const tidur = (ms: number) => new Promise<void>((r) => setTimeout(r, skala(ms)));

function antreTulis(numberId: number, kerja: () => Promise<void>): Promise<void> {
  const janji = (st.tulis.get(numberId) ?? Promise.resolve()).then(kerja).catch((e) => console.error(`[kontak] gagal menyimpan kontak nomor ${numberId}:`, e instanceof Error ? e.message : e));
  st.tulis.set(numberId, janji);
  void janji.finally(() => {
    if (st.tulis.get(numberId) === janji) st.tulis.delete(numberId);
  });
  return janji;
}

async function simpan(numberId: number, daftar: KontakWa[]): Promise<void> {
  // Satu jid sekali per INSERT (ON CONFLICT tidak boleh menyentuh baris yang sama dua kali).
  const unik = new Map<string, KontakWa>();
  for (const k of daftar) unik.set(k.jid, { ...k, nama: k.nama ?? unik.get(k.jid)?.nama ?? null });
  const sql = await db();
  const t = sekarang();
  const baris = [...unik.values()].map((k) => ({ number_id: numberId, jid: k.jid, telepon: k.telepon, lid: k.lid, nama: k.nama?.slice(0, 120) ?? null, diperbarui: t }));
  for (let i = 0; i < baris.length; i += BATAS_SISIP) {
    const potong = baris.slice(i, i + BATAS_SISIP);
    await sql`
      INSERT INTO kontak_wa ${sql(potong, "number_id", "jid", "telepon", "lid", "nama", "diperbarui")}
      ON CONFLICT (number_id, jid) DO UPDATE
         SET telepon = COALESCE(EXCLUDED.telepon, kontak_wa.telepon),
             lid = COALESCE(EXCLUDED.lid, kontak_wa.lid),
             nama = COALESCE(EXCLUDED.nama, kontak_wa.nama),
             diperbarui = EXCLUDED.diperbarui`;
  }
  st.peta.delete(numberId);
}

/** Kontak dari wa.ts: disimpan hanya bila fiturnya aktif di nomor itu. */
function terima(sesi: string, daftar: KontakWa[]): void {
  void nomorBySesi(sesi)
    .then((n) => {
      if (!n?.abaikan_kontak) return;
      if (st.diterima.has(n.id)) st.diterima.set(n.id, st.diterima.get(n.id)! + daftar.length);
      return antreTulis(n.id, () => simpan(n.id, daftar));
    })
    .catch((e) => console.error("[kontak] gagal menerima kontak:", e instanceof Error ? e.message : e));
}
padaKontak(terima);

function petaKontak(numberId: number): Promise<Peta> {
  let janji = st.peta.get(numberId);
  if (!janji) {
    janji = (async () => {
      const sql = await db();
      const baris = await sql<{ telepon: string | null; lid: string | null; tetap_balas: boolean }[]>`
        SELECT telepon, lid, tetap_balas FROM kontak_wa WHERE number_id = ${numberId}`;
      const peta: Peta = new Map();
      // Orang yang sama bisa punya dua baris (PN & LID): satu saja yang dikecualikan sudah cukup untuk dilayani AI.
      const pasang = (k: string, v: boolean) => {
        if (!peta.get(k)) peta.set(k, v);
      };
      for (const b of baris) {
        if (b.telepon) pasang(`t:${b.telepon}`, b.tetap_balas);
        if (b.lid) pasang(`l:${b.lid}`, b.tetap_balas);
      }
      return peta;
    })();
    janji.catch(() => {
      if (st.peta.get(numberId) === janji) st.peta.delete(numberId);
    });
    st.peta.set(numberId, janji);
  }
  return janji;
}

/**
 * Pesan masuk dari lawan bicara ini tidak dibalas AI? true = tersimpan di HP dan bukan pengecualian. Gagal membaca
 * database = false (AI tetap membalas; lebih baik membalas daripada diam tanpa sebab).
 */
export async function kontakDiabaikan(numberId: number, telepon: string | null, chat: string): Promise<boolean> {
  try {
    const peta = await petaKontak(numberId);
    if (!peta.size) return false;
    const lid = chat.endsWith("@lid") ? chat.replace(/:\d+(?=@)/, "") : null;
    const viaTelepon = telepon ? peta.get(`t:${telepon}`) : undefined;
    const viaLid = lid ? peta.get(`l:${lid}`) : undefined;
    if (viaTelepon === undefined && viaLid === undefined) return false;
    return !(viaTelepon || viaLid);
  } catch (e) {
    console.warn(`[kontak] gagal membaca kontak nomor ${numberId}:`, e instanceof Error ? e.message : e);
    return false;
  }
}

export interface Kontak {
  jid: string;
  nama: string | null;
  telepon: string | null;
  tetap_balas: boolean;
}

export interface RingkasanKontak {
  total: number;
  tetap: number;
  /** Detik epoch kontak terakhir diperbarui dari HP; null = belum ada. */
  terakhir: number | null;
  sedang: boolean;
  galat: string | null;
  galatEn: string | null;
}

/**
 * Baris LID-saja (`lidContactAction`) untuk orang yang sudah punya baris PN dengan LID yang sama tidak ditampilkan,
 * supaya satu orang tidak muncul dua kali. Memakai indeks (number_id, lid).
 */
const BUKAN_GANDA = "NOT (k.telepon IS NULL AND EXISTS (SELECT 1 FROM kontak_wa d WHERE d.number_id = k.number_id AND d.lid = k.jid AND d.jid <> k.jid))";

export async function ringkasanKontak(numberId: number): Promise<RingkasanKontak> {
  const sql = await db();
  const [r] = await sql<{ total: number; tetap: number; terakhir: number | null }[]>`
    SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE k.tetap_balas)::int AS tetap, MAX(k.diperbarui)::bigint AS terakhir
      FROM kontak_wa k
     WHERE k.number_id = ${numberId} AND ${sql.unsafe(BUKAN_GANDA)}`;
  const s = st.tarik.get(numberId);
  return { total: r.total, tetap: r.tetap, terakhir: r.terakhir === null ? null : Number(r.terakhir), sedang: !!s?.sedang, galat: s?.galat ?? null, galatEn: s?.galatEn ?? null };
}

export const KONTAK_PER_HALAMAN = 30;

/**
 * Daftar kontak tersimpan satu nomor, urut nama. `cari` = potongan nama atau nomor; `tetap` = hanya pengecualian.
 * Paginasi offset (buku telepon paling banyak beberapa ribu baris per nomor, semuanya lewat primary key).
 */
export async function daftarKontak(numberId: number, o: { cari?: string; tetap?: boolean; mulai?: number } = {}): Promise<{ daftar: Kontak[]; adaLagi: boolean }> {
  const sql = await db();
  const cari = (o.cari ?? "").trim().slice(0, 60);
  const pola = cari ? `%${cari.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  const digit = cari.replace(/\D/g, "");
  // 08xx diketik pengguna Indonesia = 628xx di WhatsApp.
  const polaDigit = digit.length >= 3 ? `%${digit.startsWith("0") ? `62${digit.slice(1)}` : digit}%` : null;
  const mulai = Math.max(0, Math.floor(o.mulai ?? 0));
  const baris = await sql<Kontak[]>`
    SELECT k.jid, k.nama, k.telepon, k.tetap_balas
      FROM kontak_wa k
     WHERE k.number_id = ${numberId}
       AND ${sql.unsafe(BUKAN_GANDA)}
       ${o.tetap ? sql`AND k.tetap_balas` : sql``}
       ${pola ? sql`AND (k.nama ILIKE ${pola} ${polaDigit ? sql`OR k.telepon LIKE ${polaDigit}` : sql``})` : sql``}
     ORDER BY (k.nama IS NULL), lower(COALESCE(k.nama, k.telepon, k.jid)), k.jid
     LIMIT ${KONTAK_PER_HALAMAN + 1} OFFSET ${mulai}`;
  return { daftar: baris.slice(0, KONTAK_PER_HALAMAN), adaLagi: baris.length > KONTAK_PER_HALAMAN };
}

/** Jadikan / batalkan pengecualian. Baris lain milik orang yang sama (PN & LID) ikut diubah. */
export async function setTetapBalas(numberId: number, jid: string, tetap: boolean): Promise<boolean> {
  const sql = await db();
  const [k] = await sql<{ telepon: string | null; lid: string | null }[]>`SELECT telepon, lid FROM kontak_wa WHERE number_id = ${numberId} AND jid = ${jid}`;
  if (!k) return false;
  await sql`
    UPDATE kontak_wa SET tetap_balas = ${tetap}
     WHERE number_id = ${numberId}
       AND (jid = ${jid} ${k.lid ? sql`OR lid = ${k.lid} OR jid = ${k.lid}` : sql``} ${k.telepon ? sql`OR telepon = ${k.telepon}` : sql``})`;
  st.peta.delete(numberId);
  return true;
}

/** Hapus semua pengecualian nomor ini. */
export async function hapusSemuaTetapBalas(numberId: number): Promise<void> {
  const sql = await db();
  await sql`UPDATE kontak_wa SET tetap_balas = false WHERE number_id = ${numberId} AND tetap_balas`;
  st.peta.delete(numberId);
}

/** Fitur dimatikan/dinyalakan: peta lama tidak berlaku lagi. */
export function kontakBasi(numberId: number): void {
  st.peta.delete(numberId);
}

/**
 * Tarik ulang seluruh buku telepon HP dari WhatsApp. Berjalan di latar; statusnya dibaca lewat ringkasanKontak.
 * Kontak bernomor telepon yang tidak ada lagi di snapshot (dihapus di HP) dibuang, tetapi hanya bila snapshot-nya berisi.
 */
export async function tarikUlangKontak(nomor: Nomor): Promise<{ ok: boolean; pesan?: string; pesanEn?: string }> {
  if (nomor.jalur === "resmi") return { ok: false, pesan: "Nomor WhatsApp resmi tidak punya daftar kontak HP.", pesanEn: "Official WhatsApp numbers have no phone contact list." };
  const lama = st.tarik.get(nomor.id);
  if (lama?.sedang) return { ok: true };
  if (lama && sekarang() - lama.pada < JEDA_TARIK_DTK && !lama.galat) return { ok: true };
  const status: StatusTarik = { sedang: true, pada: lama?.pada ?? 0, jumlah: 0, galat: null, galatEn: null };
  st.tarik.set(nomor.id, status);
  st.diterima.set(nomor.id, 0);
  const mulai = sekarang();
  try {
    const jalan = await tarikKontak(nomor.sesi);
    if (!jalan) throw new WaError("Nomor belum tersambung. Daftar kontak diambil otomatis begitu nomor tersambung.", "The number isn't connected. The contact list is fetched automatically once it connects.");
    // Event Baileys dibuffer ±100 ms setelah tarikan selesai; lalu tunggu semua tulisan kontak tuntas.
    await tidur(400);
    await (st.tulis.get(nomor.id) ?? Promise.resolve());
    const jumlah = st.diterima.get(nomor.id) ?? 0;
    if (jumlah > 0) {
      const sql = await db();
      // Hanya kontak bernomor telepon (contactAction, pasti ada di snapshot critical_unblock_low). Baris LID-saja bisa
      // berasal dari lidContactAction yang belum tentu ikut snapshot ini: dibiarkan supaya kontak yang masih tersimpan
      // tidak tiba-tiba dibalas AI.
      await sql`DELETE FROM kontak_wa WHERE number_id = ${nomor.id} AND diperbarui < ${mulai} AND telepon IS NOT NULL`;
      st.peta.delete(nomor.id);
    }
    status.jumlah = jumlah;
    console.info(`[kontak] nomor ${nomor.id}: ${jumlah} kontak dari HP`);
  } catch (e) {
    status.galat = e instanceof Error ? e.message : String(e);
    status.galatEn = e instanceof WaError ? (e.en ?? status.galat) : "Couldn't fetch the contact list. Try again in a moment.";
    console.warn(`[kontak] nomor ${nomor.id}: gagal menarik kontak: ${status.galat}`);
  } finally {
    status.sedang = false;
    status.pada = sekarang();
    st.diterima.delete(nomor.id);
  }
  return status.galat ? { ok: false, pesan: status.galat, pesanEn: status.galatEn ?? undefined } : { ok: true };
}

/**
 * Nomor baru tersambung: bila fiturnya aktif tetapi belum ada satu kontak pun tersimpan (mis. fitur dinyalakan saat
 * nomor terputus), tarik daftarnya sekali. Ditunda sebentar supaya koneksi yang baru terbuka tenang dulu.
 */
export function kontakSaatTerhubung(numberId: number): void {
  setTimeout(() => {
    void (async () => {
      const nomor = await nomorById(numberId);
      if (!nomor?.abaikan_kontak || nomor.jalur === "resmi" || st.tarik.get(numberId)?.sedang) return;
      const sql = await db();
      const [r] = await sql<{ ada: boolean }[]>`SELECT EXISTS (SELECT 1 FROM kontak_wa WHERE number_id = ${numberId}) AS ada`;
      if (!r.ada) await tarikUlangKontak(nomor);
    })().catch((e) => console.warn(`[kontak] gagal memeriksa kontak nomor ${numberId}:`, e instanceof Error ? e.message : e));
  }, skala(5_000));
}
