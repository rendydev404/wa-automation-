import "server-only";
import { randomUUID } from "node:crypto";
import {
  type IsiLisensi,
  JALUR_AKTIVASI,
  JALUR_KONDISI,
  type KodeGalat,
  type PermintaanAktivasi,
  type PermintaanKondisi,
} from "../api-def";
import { db, sekarang } from "../db";
import { verifikasiLisensi } from "../lisensi-def";
import { VERSI_APLIKASI, alamatPusat, modeMesin } from "../mode";
import { pancarkan } from "../peristiwa";

/**
 * Lisensi di mesin self-host. Lisensi = token bertanda tangan Ed25519 dari pusat (lisensi-def.ts), disimpan di tabel
 * mesin_lisensi (satu baris) dan dipegang di memori, sehingga setiap panggilan API & keputusan bot cukup membaca memori.
 *
 * Alur (TANPA polling ke pusat):
 *   - Saat menyala: muat lisensi tersimpan (tetap melayani walau pusat sedang tidak terjangkau), lalu SEKALI bertanya ke
 *     pusat: aktivasi (belum pernah) atau kondisi (sudah). Gagal = dicoba lagi dengan jeda bertambah sampai berhasil
 *     sekali, lalu berhenti.
 *   - Setelah itu semua perubahan & perpanjangan datang dari pusat lewat webhook (/api/lisensi/webhook).
 * Lisensi habis / ditangguhkan / dicabut / belum dibayar = mode terbatas: API & bot berhenti melayani, tetapi koneksi
 * WhatsApp TIDAK PERNAH diputus (tidak perlu scan ulang saat lisensi aktif lagi).
 */

interface Keadaan {
  isi: IsiLisensi | null;
  idInstalasi: string | null;
  siap: Promise<void> | null;
  /** Galat terakhir saat menghubungi pusat (ditampilkan di /api/v1/status & dashboard). */
  galat: string | null;
  sinkron: boolean;
  timerUlang: ReturnType<typeof setTimeout> | null;
  timerPeringatan: ReturnType<typeof setInterval> | null;
  peringatan: Set<string>;
  /** Penundaan awal sebelum menghubungi pusat (uji bisa mempercepat). */
  coba: number;
}

const g = globalThis as unknown as { __waMesinLisensi?: Keadaan };
const st = (g.__waMesinLisensi ??= { isi: null, idInstalasi: null, siap: null, galat: null, sinkron: false, timerUlang: null, timerPeringatan: null, peringatan: new Set(), coba: 0 });

const kunciApi = (): string => (process.env.CHATGERCEP_KEY ?? "").trim();
const alamatPublik = (): string => (process.env.ALAMAT_PUBLIK ?? "").trim().replace(/\/+$/, "");

/** Muat baris mesin_lisensi (dibuat sekali dengan id_instalasi acak) dan lisensi tersimpan ke memori. */
export function muatLisensi(): Promise<void> {
  return (st.siap ??= (async () => {
    const sql = await db();
    await sql`INSERT INTO mesin_lisensi (id, id_instalasi) VALUES (1, ${randomUUID()}::uuid) ON CONFLICT (id) DO NOTHING`;
    const [r] = await sql<{ id_instalasi: string; lisensi: string | null; galat_terakhir: string | null }[]>`
      SELECT id_instalasi::text, lisensi, galat_terakhir FROM mesin_lisensi WHERE id = 1`;
    st.idInstalasi = r.id_instalasi;
    st.galat = r.galat_terakhir;
    const isi = r.lisensi ? verifikasiLisensi(r.lisensi) : null;
    st.isi = isi && isi.id_instalasi === r.id_instalasi ? isi : null;
  })().catch((e) => {
    st.siap = null; // database belum siap: dicoba lagi di panggilan berikutnya
    throw e;
  }));
}

export async function idInstalasi(): Promise<string> {
  await muatLisensi();
  return st.idInstalasi!;
}

/** Lisensi yang sedang dipegang (sudah diverifikasi tanda tangannya); null = belum ada. */
export const lisensiSekarang = (): IsiLisensi | null => st.isi;

/**
 * Boleh melayani (API & bot)? Sinkron, hanya membaca memori. Di mode pusat selalu true (fungsi ini dipanggil jembatan
 * WhatsApp yang sama di kedua mode).
 */
export function layananBoleh(kini = sekarang()): boolean {
  if (!modeMesin()) return true;
  const i = st.isi;
  return !!i && i.status === "aktif" && i.berlaku_sampai > kini;
}

/** Alasan mode terbatas dalam bentuk galat API; null = layanan aktif. */
export function alasanTerbatas(kini = sekarang()): { kode: KodeGalat; pesan: string } | null {
  const i = st.isi;
  if (!i) {
    if (!kunciApi()) return { kode: "lisensi_kedaluwarsa", pesan: "Mesin belum diaktifkan: CHATGERCEP_KEY belum diisi di .env mesin." };
    return { kode: "lisensi_kedaluwarsa", pesan: `Mesin belum aktif: lisensi belum diterima dari server pusat${st.galat ? ` (${st.galat})` : ""}.` };
  }
  if (i.status === "ditangguhkan") return { kode: "aplikasi_ditangguhkan", pesan: "Aplikasi ini sedang ditangguhkan. Hubungi ChatGerCep." };
  if (i.status === "dicabut") return { kode: "aplikasi_dicabut", pesan: "Lisensi aplikasi ini sudah dicabut." };
  if (i.status === "belum_bayar") return { kode: "belum_bayar", pesan: "Masa bayar aplikasi ini sudah habis. Bayar di portal Developer ChatGerCep." };
  if (i.berlaku_sampai <= kini) return { kode: "lisensi_kedaluwarsa", pesan: "Lisensi mesin kedaluwarsa: perpanjangan dari server pusat belum diterima. Pastikan ALAMAT_PUBLIK bisa diakses lewat HTTPS." };
  return null;
}

export interface InfoLisensi {
  aktif: boolean;
  status: IsiLisensi["status"] | "belum_aktif";
  aplikasi: string | null;
  id_instalasi: string | null;
  fitur: string[];
  batas: IsiLisensi["batas"] | null;
  biaya: IsiLisensi["biaya"] | null;
  dibayar_sampai: number | null;
  berlaku_sampai: number | null;
  versi_urut: number;
  galat_pusat: string | null;
  alasan: string | null;
}

export function infoLisensi(): InfoLisensi {
  const i = st.isi;
  return {
    aktif: layananBoleh(),
    status: i?.status ?? "belum_aktif",
    aplikasi: i?.nama_aplikasi ?? null,
    id_instalasi: st.idInstalasi,
    fitur: i?.fitur ?? [],
    batas: i?.batas ?? null,
    biaya: i?.biaya ?? null,
    dibayar_sampai: i?.dibayar_sampai ?? null,
    berlaku_sampai: i?.berlaku_sampai ?? null,
    versi_urut: i?.versi_urut ?? 0,
    galat_pusat: st.galat,
    alasan: alasanTerbatas()?.pesan ?? null,
  };
}

/**
 * Terima token lisensi (dari jawaban aktivasi/kondisi atau webhook pusat). Ditolak bila tanda tangan palsu, untuk
 * instalasi lain, atau versi_urut tidak LEBIH BESAR dari yang tersimpan (kiriman lama yang datang terlambat).
 * Pembaruan bersyarat di SQL, jadi dua kiriman serentak tidak bisa menurunkan versi.
 */
export async function terimaLisensi(token: string): Promise<{ ok: true; versi: number } | { ok: false; alasan: string; versi: number }> {
  await muatLisensi();
  const isi = verifikasiLisensi(token);
  const versiKini = st.isi?.versi_urut ?? 0;
  if (!isi) return { ok: false, alasan: "tanda tangan lisensi tidak sah", versi: versiKini };
  if (isi.id_instalasi !== st.idInstalasi) return { ok: false, alasan: "lisensi untuk instalasi lain", versi: versiKini };
  const sql = await db();
  const r = await sql<{ versi_urut: number }[]>`
    UPDATE mesin_lisensi SET lisensi = ${token}, versi_urut = ${isi.versi_urut}, berlaku_sampai = ${isi.berlaku_sampai},
           diterima = ${sekarang()}, galat_terakhir = NULL
     WHERE id = 1 AND versi_urut < ${isi.versi_urut}
     RETURNING versi_urut`;
  if (!r.length) {
    const [x] = await sql<{ versi_urut: number }[]>`SELECT versi_urut FROM mesin_lisensi WHERE id = 1`;
    return { ok: false, alasan: "versi lisensi lebih lama dari yang tersimpan", versi: x?.versi_urut ?? versiKini };
  }
  st.isi = isi;
  st.galat = null;
  st.peringatan.clear();
  return { ok: true, versi: isi.versi_urut };
}

async function catatGalat(pesan: string): Promise<void> {
  st.galat = pesan.slice(0, 300);
  try {
    const sql = await db();
    await sql`UPDATE mesin_lisensi SET galat_terakhir = ${st.galat} WHERE id = 1`;
  } catch {}
}

class GalatPusat extends Error {
  kode: string;
  status: number;
  constructor(kode: string, pesan: string, status: number) {
    super(pesan);
    this.kode = kode;
    this.status = status;
  }
}

async function panggilPusat(jalur: string, isi: PermintaanAktivasi | PermintaanKondisi): Promise<string> {
  let res: Response;
  try {
    res = await fetch(alamatPusat() + jalur, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": `ChatGerCep-Mesin/${VERSI_APLIKASI}` },
      body: JSON.stringify(isi),
      // Aktivasi menunggu pusat mengirim tantangan ke mesin ini lebih dulu.
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    throw new GalatPusat("jaringan", `server pusat tidak terjangkau (${e instanceof Error ? e.message : e})`, 0);
  }
  const j = (await res.json().catch(() => null)) as { lisensi?: unknown; galat?: { kode?: string; pesan?: string } } | null;
  if (res.ok && typeof j?.lisensi === "string") return j.lisensi;
  throw new GalatPusat(j?.galat?.kode ?? `http_${res.status}`, j?.galat?.pesan ?? `server pusat menjawab HTTP ${res.status}`, res.status);
}

/** Sekali bertanya ke pusat: kondisi bila pernah aktif, aktivasi bila belum (atau pusat tidak mengenal instalasi ini). */
export async function sinkronSekali(): Promise<void> {
  await muatLisensi();
  const key = kunciApi();
  if (!key) throw new GalatPusat("tanpa_key", "CHATGERCEP_KEY belum diisi di .env mesin", 0);
  const id = st.idInstalasi!;
  let token: string;
  if (st.isi) {
    try {
      token = await panggilPusat(JALUR_KONDISI, { key, id_instalasi: id, versi: VERSI_APLIKASI });
    } catch (e) {
      if (!(e instanceof GalatPusat) || e.kode !== "tidak_ditemukan") throw e;
      token = await aktivasi(key, id);
    }
  } else {
    token = await aktivasi(key, id);
  }
  const t = await terimaLisensi(token);
  // Lisensi dari jawaban pusat bisa "lebih lama" bila webhook yang lebih baru tiba duluan: itu bukan kegagalan.
  if (!t.ok && t.alasan !== "versi lisensi lebih lama dari yang tersimpan") throw new GalatPusat("lisensi", t.alasan, 0);
}

function aktivasi(key: string, id: string): Promise<string> {
  const alamat = alamatPublik();
  if (!alamat) throw new GalatPusat("tanpa_alamat", "ALAMAT_PUBLIK belum diisi di .env mesin (alamat HTTPS publik mesin ini)", 0);
  return panggilPusat(JALUR_AKTIVASI, { key, id_instalasi: id, alamat, versi: VERSI_APLIKASI });
}

/** Jeda coba ulang sinkron awal: 10 dtk, lalu dua kali lipat, maks 15 menit. */
export const jedaUlangSinkron = (coba: number): number => Math.min(15 * 60_000, 10_000 * 2 ** Math.max(0, coba - 1));

/**
 * Dipanggil sekali saat mesin menyala. Menghubungi pusat setelah `tundaMs` (server sudah siap menerima tantangan),
 * lalu mencoba ulang dengan jeda bertambah HANYA sampai berhasil sekali. Bukan polling: setelah berhasil, pembaruan
 * datang dari pusat lewat webhook.
 */
export function mulaiLisensiMesin(tundaMs = 5_000): void {
  if (!modeMesin() || st.sinkron) return;
  st.sinkron = true;
  void muatLisensi().catch((e) => console.warn("[mesin] lisensi tersimpan gagal dimuat:", e instanceof Error ? e.message : e));
  if (!kunciApi()) console.error("[mesin] CHATGERCEP_KEY belum diisi: mesin berjalan dalam mode terbatas (API & bot tidak melayani, WhatsApp tetap tersambung).");
  if (!alamatPublik()) console.warn("[mesin] ALAMAT_PUBLIK belum diisi: aktivasi & perpanjangan lisensi dari pusat butuh alamat HTTPS publik mesin ini.");
  const jalan = async (): Promise<void> => {
    st.timerUlang = null;
    try {
      await sinkronSekali();
      st.coba = 0;
      console.info(`[mesin] lisensi diterima dari pusat: ${st.isi?.nama_aplikasi ?? "-"} (${st.isi?.status ?? "-"}, versi ${st.isi?.versi_urut ?? 0})`);
    } catch (e) {
      st.coba += 1;
      const pesan = e instanceof Error ? e.message : String(e);
      await catatGalat(pesan);
      if (e instanceof GalatPusat && e.kode === "tanpa_key") return; // tanpa key tidak ada gunanya mencoba lagi
      const jeda = jedaUlangSinkron(st.coba);
      console.warn(`[mesin] gagal menghubungi pusat (${pesan}); dicoba lagi dalam ${Math.round(jeda / 1000)} dtk`);
      st.timerUlang = setTimeout(() => void jalan(), jeda);
      st.timerUlang.unref?.();
    }
  };
  const t = setTimeout(() => void jalan(), tundaMs);
  t.unref?.();
  // Peringatan sisa masa lisensi (24 jam & 6 jam) ke webhook aplikasi; hanya membaca memori, tidak menghubungi pusat.
  st.timerPeringatan = setInterval(() => periksaPeringatan(), 15 * 60_000);
  st.timerPeringatan.unref?.();
}

/** Pancarkan lisensi.peringatan sekali per ambang (24 jam, 6 jam) per lisensi. */
export function periksaPeringatan(kini = sekarang()): void {
  const i = st.isi;
  if (!i || i.status !== "aktif") return;
  const sisa = i.berlaku_sampai - kini;
  for (const ambang of [6 * 3600, 24 * 3600]) {
    const kunci = `${i.versi_urut}:${ambang}`;
    if (sisa > 0 && sisa <= ambang && !st.peringatan.has(kunci)) {
      st.peringatan.add(kunci);
      pancarkan({ jenis: "lisensi.peringatan", sisaDetik: sisa, berlakuSampai: i.berlaku_sampai, status: i.status });
      console.warn(`[mesin] lisensi berakhir dalam ${Math.round(sisa / 3600)} jam dan belum diperpanjang pusat`);
      break;
    }
  }
}

/** Untuk uji: kosongkan keadaan di memori. */
export function aturUlangLisensiUji(): void {
  if (st.timerUlang) clearTimeout(st.timerUlang);
  if (st.timerPeringatan) clearInterval(st.timerPeringatan);
  Object.assign(st, { isi: null, idInstalasi: null, siap: null, galat: null, sinkron: false, timerUlang: null, timerPeringatan: null, peringatan: new Set(), coba: 0 });
}
