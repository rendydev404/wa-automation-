import "server-only";
import { db, sekarang } from "./db";
import type { Nomor } from "./numbers";
import { pancarkan } from "./peristiwa";
import type { TemplatKirim } from "./wa";
import { alasanKuota, nomorResmi, templatTahap } from "./wa-resmi";
import { type KodeTahap, dalamJendela, isiVariabel, renderTemplat, templatBawaan } from "./wa-resmi-def";

/**
 * Bentuk pesan follow-up menurut jalur nomor (docs/plans/2026-11-18-followup-dua-jalur-wa-resmi.md §4):
 *   - Baileys: teks AI apa adanya (perilaku lama).
 *   - Resmi, di dalam jendela 24 jam sejak pesan masuk terakhir: teks AI bebas.
 *   - Resmi, di luar jendela: template APPROVED untuk tahap itu, variabel diisi dari data (nama pelanggan, nama usaha).
 *     Tidak ada template yang disetujui / kuota tier hampir habis = TahanJalur (ditunda, tidak pernah teks bebas).
 * Logika pemilihan lead, AI, pemeriksa, dan rem lain tetap di followup*.ts.
 */

export class TahanJalur extends Error {}

export interface Kiriman {
  teks: string;
  templat: TemplatKirim | null;
}

async function masukPada(kunci: string): Promise<number | null> {
  const sql = await db();
  const [r] = await sql<{ masuk_pada: number | null }[]>`SELECT masuk_pada FROM percakapan WHERE kunci = ${kunci}`;
  return r?.masuk_pada ?? null;
}

export async function siapkanKiriman(
  nomor: Pick<Nomor, "id" | "sesi" | "label" | "nama_wa">,
  kunci: string,
  teks: string,
  kode: KodeTahap,
  nilai: { nama?: string | null; usaha?: string | null },
): Promise<Kiriman> {
  if (!nomorResmi(nomor.sesi)) return { teks, templat: null };
  if (dalamJendela(await masukPada(kunci), sekarang())) return { teks, templat: null };
  const t = templatTahap(nomor.id, kode);
  if (!t) {
    const label = templatBawaan(kode)?.label ?? kode;
    throw new TahanJalur(`Di luar jendela 24 jam dan template "${label}" belum disetujui Meta`);
  }
  const kuota = await alasanKuota(nomor.id);
  if (kuota) throw new TahanJalur(kuota);
  const variabel = isiVariabel(t.isi, { nama: nilai.nama, usaha: nilai.usaha ?? nomor.nama_wa ?? nomor.label });
  return { teks: renderTemplat(t.isi, variabel), templat: { nama: t.nama, bahasa: t.bahasa, variabel } };
}

export function catatTerkirim(numberId: number, kunci: string, jenisFollowup: string, tahap: number, k: Kiriman): void {
  pancarkan({ jenis: "followup.terkirim", numberId, kunci, jenisFollowup, tahap, bentuk: k.templat ? "templat" : "teks", teks: k.teks });
}
