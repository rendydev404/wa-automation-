import "server-only";
import { db, sekarang } from "../db";
import { modeMesin } from "../mode";
import { lisensiSekarang } from "./lisensi";

/**
 * Limit balasan AI per hari WIB di mesin self-host (`batas.ai_hari` dari lisensi; 0 = tanpa batas). Dihitung: balasan
 * bot di WhatsApp, POST /api/v1/ai/jawab, POST /api/v1/ai/rapikan. Sandbox selalu punya limit; production bawaan tanpa
 * batas. Di server pusat (bukan mesin) dan tanpa limit: nol query.
 *
 * Satu baris per hari (mesin_pemakaian_ai). Jatah diambil SEBELUM AI dipanggil dengan satu UPSERT bersyarat yang
 * atomik (permintaan serentak tidak bisa melewati batas), lalu dikembalikan bila AI gagal.
 */

/** Awal hari WIB (detik epoch). */
export const awalHariAi = (kini = sekarang()): number => Math.floor((kini + 7 * 3600) / 86_400) * 86_400 - 7 * 3600;

/** Limit yang berlaku sekarang; 0 = tanpa batas (atau bukan mesin). */
export function batasAiHarian(): number {
  if (!modeMesin()) return 0;
  return Math.max(0, Math.trunc(lisensiSekarang()?.batas.ai_hari ?? 0));
}

/** Ambil satu jatah balasan AI. true = boleh memanggil AI. */
export async function ambilJatahAi(kini = sekarang()): Promise<boolean> {
  const batas = batasAiHarian();
  if (!batas) return true;
  const hari = awalHariAi(kini);
  const sql = await db();
  const r = await sql<{ jumlah: number }[]>`
    INSERT INTO mesin_pemakaian_ai (hari, jumlah) VALUES (${hari}, 1)
    ON CONFLICT (hari) DO UPDATE SET jumlah = mesin_pemakaian_ai.jumlah + 1 WHERE mesin_pemakaian_ai.jumlah < ${batas}
    RETURNING jumlah`;
  // Hari baru: baris > 90 hari dibuang (sekali sehari, tanpa pekerja latar tambahan).
  if (r[0]?.jumlah === 1) void sql`DELETE FROM mesin_pemakaian_ai WHERE hari < ${hari - 90 * 86_400}`.catch(() => {});
  return r.length > 0;
}

/** Kembalikan jatah (AI gagal menjawab). */
export async function kembalikanJatahAi(kini = sekarang()): Promise<void> {
  if (!batasAiHarian()) return;
  const sql = await db();
  await sql`UPDATE mesin_pemakaian_ai SET jumlah = GREATEST(jumlah - 1, 0) WHERE hari = ${awalHariAi(kini)}`.catch(() => {});
}

/** Pemakaian hari ini (untuk /api/v1/status & dashboard mesin). */
export async function pemakaianAiHariIni(kini = sekarang()): Promise<{ terpakai: number; batas: number; reset: number }> {
  const hari = awalHariAi(kini);
  const batas = batasAiHarian();
  if (!modeMesin()) return { terpakai: 0, batas, reset: hari + 86_400 };
  const sql = await db();
  const [r] = await sql<{ jumlah: number }[]>`SELECT jumlah FROM mesin_pemakaian_ai WHERE hari = ${hari}`;
  return { terpakai: r?.jumlah ?? 0, batas, reset: hari + 86_400 };
}

const g = globalThis as unknown as { __waBatasAiDiberitahu?: { hari: number } };
/** Pemberitahuan "limit AI habis" ke nomor penguji sandbox: sekali per hari. */
export function perluBeritahuBatasAi(kini = sekarang()): boolean {
  const hari = awalHariAi(kini);
  const s = (g.__waBatasAiDiberitahu ??= { hari: 0 });
  if (s.hari === hari) return false;
  s.hari = hari;
  return true;
}

export const teksBatasAi = (batas: number): string =>
  `Batas ${batas.toLocaleString("id-ID")} balasan AI sandbox hari ini sudah habis, jadi bot berhenti menjawab dulu. Jatahnya kembali jam 00.00 WIB. (Pesan otomatis ChatGerCep Sandbox)`;
