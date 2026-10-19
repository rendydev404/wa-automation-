import "server-only";
import type { AuthenticationCreds, CacheStore, SignalDataSet, SignalDataTypeMap, SignalKeyStore } from "baileys";
import { db } from "./db";

/**
 * Keadaan login Baileys di PostgreSQL (tabel wa_auth), pengganti `useMultiFileAuthState` yang
 * menulis satu berkas per kunci. Tiap baca adalah pencarian primary key; tulis beruntun dikirim
 * sebagai SATU pernyataan (bukan satu query per kunci). Kunci biner (sesi Signal, dsb.) disimpan
 * sebagai bytea tanpa base64/JSON. Di depannya ada cache LRU kecil per soket, sehingga kunci yang
 * sedang dipakai tidak dibaca ulang dari database.
 */

type Baileys = typeof import("baileys");

interface Baris {
  kunci: string;
  biner: Buffer | null;
  teks: string | null;
}

const MAKS_CACHE_KUNCI = 800; // entri kunci di memori per soket; selebihnya dibaca dari database

/**
 * Cache kunci di depan database: LRU berbatas jumlah, tanpa timer, ikut terbuang bersama soketnya.
 * Cache bawaan Baileys untuk ini memasang interval 10 menit yang tidak pernah dihentikan, jadi tiap
 * sambung ulang menambah satu timer dan satu objek cache yang tidak bisa dibuang lagi (kecil, tetapi
 * menumpuk selama proses hidup). Tanpa masa berlaku pun aman: setiap tulis melewati cache ini,
 * jadi isinya tidak pernah basi.
 */
export function cacheKunci(maks: number): CacheStore {
  const m = new Map<string, unknown>();
  return {
    get<T>(k: string): T | undefined {
      const v = m.get(k);
      if (v !== undefined) {
        m.delete(k);
        m.set(k, v);
      }
      return v as T | undefined;
    },
    set<T>(k: string, v: T): void {
      // Pre-key diunggah ratusan sekaligus (812 saat pairing) tetapi masing-masing hanya dibaca
      // sekali: bila ikut di-cache, semua kunci sesi yang sedang dipakai malah tergusur.
      if (k.startsWith("pre-key.")) return;
      m.delete(k);
      m.set(k, v);
      if (m.size > maks) m.delete(m.keys().next().value as string);
    },
    del(k: string): void {
      m.delete(k);
    },
    flushAll(): void {
      m.clear();
    },
  };
}

/**
 * Tulis ke satu sesi dijalankan berurutan: penyimpanan kredensial, penyimpanan kunci, dan
 * penghapusan sesi tidak boleh saling mendahului (mis. kredensial lama tertulis SETELAH logout).
 */
const g = globalThis as unknown as { __waAuthAntre?: Map<string, Promise<unknown>> };
const antre = (g.__waAuthAntre ??= new Map());

function berurutan<T>(sesi: string, kerja: () => Promise<T>): Promise<T> {
  const kini = (antre.get(sesi) ?? Promise.resolve()).catch(() => {}).then(kerja);
  antre.set(sesi, kini);
  void kini
    .catch(() => {})
    .finally(() => {
      if (antre.get(sesi) === kini) antre.delete(sesi);
    });
  return kini;
}

/**
 * Tulisan kunci/kredensial tidak boleh hilang: bila memori dan database berbeda, setelah restart
 * WhatsApp bisa mencabut perangkat. Gangguan database sesaat (restart, koneksi putus) dicoba lagi
 * dengan jeda makin panjang (±30 dtk total); antrean sesi itu ikut menunggu supaya urutan tetap.
 */
const JEDA_ULANG_TULIS_MS = [250, 500, 1_000, 2_000, 4_000, 8_000, 15_000];

async function tulisPasti(sesi: string, kerja: () => Promise<void>): Promise<void> {
  for (let i = 0; ; i++) {
    try {
      return await kerja();
    } catch (e) {
      if (i >= JEDA_ULANG_TULIS_MS.length) throw e;
      console.warn(`[wa ${sesi}] tulis kunci gagal (${e instanceof Error ? e.message : String(e)}), dicoba lagi`);
      await new Promise((r) => setTimeout(r, JEDA_ULANG_TULIS_MS[i]));
    }
  }
}

export interface AuthSesi {
  creds: AuthenticationCreds;
  keys: SignalKeyStore;
  /** Menulis keadaan kredensial saat ini di latar (berurutan); kegagalannya dicatat, tidak dilempar. */
  simpanCreds: () => void;
}

export async function bukaAuth(B: Baileys, sesi: string): Promise<AuthSesi> {
  const urai = (jenis: string, b: Baris): unknown => {
    if (b.biner) return b.biner;
    const o: unknown = JSON.parse(b.teks!, B.BufferJSON.reviver);
    return jenis === "app-state-sync-key" && o ? B.proto.Message.AppStateSyncKeyData.fromObject(o as object) : o;
  };

  // Lewat antrean: bila sesi ini baru saja dihapus (logout), yang terbaca adalah keadaan sesudahnya.
  const awal = await berurutan(sesi, async () => {
    const sql = await db();
    const [r] = await sql<{ teks: string | null }[]>`SELECT teks FROM wa_auth WHERE sesi = ${sesi} AND kunci = 'creds'`;
    return r?.teks ?? null;
  });
  const creds = awal ? (JSON.parse(awal, B.BufferJSON.reviver) as AuthenticationCreds) : B.initAuthCreds();

  const diDatabase: SignalKeyStore = {
    async get<T extends keyof SignalDataTypeMap>(jenis: T, ids: string[]) {
      const hasil: { [id: string]: SignalDataTypeMap[T] } = {};
      if (!ids.length) return hasil;
      const awalan = `${jenis}:`;
      const sql = await db();
      const baris = await sql<Baris[]>`SELECT kunci, biner, teks FROM wa_auth WHERE sesi = ${sesi} AND kunci = ANY(${ids.map((id) => awalan + id)})`;
      for (const b of baris) hasil[b.kunci.slice(awalan.length)] = urai(jenis, b) as SignalDataTypeMap[T];
      return hasil;
    },
    set(data: SignalDataSet) {
      const simpan: { sesi: string; kunci: string; biner: Buffer | null; teks: string | null }[] = [];
      const hapus: string[] = [];
      for (const jenis in data) {
        const isi = data[jenis as keyof SignalDataSet] as Record<string, unknown> | undefined;
        for (const id in isi) {
          const v = isi[id];
          const kunci = `${jenis}:${id}`;
          if (v === null || v === undefined) hapus.push(kunci);
          else if (v instanceof Uint8Array) simpan.push({ sesi, kunci, biner: Buffer.from(v.buffer, v.byteOffset, v.byteLength), teks: null });
          else simpan.push({ sesi, kunci, biner: null, teks: JSON.stringify(v, B.BufferJSON.replacer) });
        }
      }
      return berurutan(sesi, () => tulisPasti(sesi, async () => {
        const sql = await db();
        const tulis = async (q: typeof sql): Promise<void> => {
          // 4 parameter per baris; dipecah supaya jauh di bawah batas 65.535 parameter per pernyataan.
          for (let i = 0; i < simpan.length; i += 2000) {
            await q`INSERT INTO wa_auth ${q(simpan.slice(i, i + 2000), "sesi", "kunci", "biner", "teks")}
                    ON CONFLICT (sesi, kunci) DO UPDATE SET biner = EXCLUDED.biner, teks = EXCLUDED.teks`;
          }
          if (hapus.length) await q`DELETE FROM wa_auth WHERE sesi = ${sesi} AND kunci = ANY(${hapus})`;
        };
        // Satu pernyataan sudah atomik; transaksi hanya bila ada lebih dari satu.
        if ((simpan.length > 0 ? Math.ceil(simpan.length / 2000) : 0) + (hapus.length ? 1 : 0) > 1) await sql.begin((tx) => tulis(tx as unknown as typeof sql));
        else await tulis(sql);
      }));
    },
    clear() {
      return berurutan(sesi, async () => {
        const sql = await db();
        await sql`DELETE FROM wa_auth WHERE sesi = ${sesi} AND kunci <> 'creds'`;
      });
    },
  };

  return {
    creds,
    keys: B.makeCacheableSignalKeyStore(diDatabase, undefined, cacheKunci(MAKS_CACHE_KUNCI)),
    simpanCreds() {
      // Isi kredensial dibekukan SEKARANG; yang ditulis nanti adalah keadaan saat fungsi ini dipanggil.
      const teks = JSON.stringify(creds, B.BufferJSON.replacer);
      void berurutan(sesi, () => tulisPasti(sesi, async () => {
        const sql = await db();
        await sql`INSERT INTO wa_auth(sesi, kunci, teks) VALUES (${sesi}, 'creds', ${teks})
                  ON CONFLICT (sesi, kunci) DO UPDATE SET teks = EXCLUDED.teks, biner = NULL`;
      })).catch((e) => console.error(`[wa ${sesi}] gagal menyimpan kredensial:`, e instanceof Error ? e.message : e));
    },
  };
}

/** Buang seluruh keadaan login sebuah sesi (logout, nomor dihapus, QR tidak jadi dipindai). */
export function hapusAuth(sesi: string): Promise<void> {
  return berurutan(sesi, async () => {
    const sql = await db();
    await sql`DELETE FROM wa_auth WHERE sesi = ${sesi}`;
  });
}

/** Menunggu semua tulis yang masih antre untuk sebuah sesi (dipakai uji dan saat mematikan). */
export async function tungguTulis(sesi: string): Promise<void> {
  await (antre.get(sesi) ?? Promise.resolve()).catch(() => {});
}

/**
 * Menunggu sampai antrean tulis SEMUA sesi kosong dan tetap kosong sejenak. Baileys menulis kunci
 * lewat beberapa lapis promise (mutex, cache), jadi tulisan yang sedang berjalan bisa baru masuk
 * antrean sesaat setelah dicek; yang ditunggu adalah antrean yang benar-benar tenang.
 */
export async function tungguSemuaTulis(): Promise<void> {
  let tenang = 0;
  while (tenang < 2) {
    await new Promise((r) => setTimeout(r, 50));
    if (antre.size) {
      tenang = 0;
      await Promise.all([...antre.values()].map((p) => p.catch(() => {})));
    } else tenang += 1;
  }
}

/**
 * Sesi yang sudah dipasangkan dengan sebuah nomor (kredensialnya punya identitas `me`).
 * Dipanggil sekali saat server mulai. Isi kredensial diperiksa di sini, bukan dengan fungsi JSON
 * di SQL: teksnya tidak dijamin bisa diubah ke jsonb (mis. nama profil dengan karakter aneh).
 */
export const SQL_SESI_TERPASANG = `SELECT n.sesi, a.teks FROM numbers n
  JOIN wa_auth a ON a.sesi = n.sesi AND a.kunci = 'creds'
 ORDER BY n.id`;

export async function sesiTerpasang(): Promise<string[]> {
  const sql = await db();
  const baris = await sql.unsafe<{ sesi: string; teks: string | null }[]>(SQL_SESI_TERPASANG);
  return baris
    .filter((b) => {
      try {
        return !!(JSON.parse(b.teks ?? "null") as { me?: { id?: string } } | null)?.me?.id;
      } catch {
        return false;
      }
    })
    .map((b) => b.sesi);
}

/** Buang keadaan login milik nomor yang sudah tidak ada (mis. proses mati di tengah penghapusan). */
export async function rapikanAuthYatim(): Promise<void> {
  const sql = await db();
  await sql`DELETE FROM wa_auth a WHERE NOT EXISTS (SELECT 1 FROM numbers n WHERE n.sesi = a.sesi)`;
}
