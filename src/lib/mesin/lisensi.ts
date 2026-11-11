import "server-only";
import { connection } from "next/server";
import { randomUUID } from "node:crypto";
import {
  type IsiLisensi,
  JALUR_AKTIVASI,
  JALUR_KONDISI,
  JALUR_NOMOR_UJI,
  type KodeGalat,
  type FiturApi,
  type ModeApi,
  type NomorUji,
  type PermintaanAktivasi,
  type PermintaanKondisi,
  type PermintaanNomorUji,
  modeLisensi,
  samarkanNomor,
} from "../api-def";
import { db, sekarang } from "../db";
import { uraiKunciApi, verifikasiLisensi } from "../lisensi-def";
import { VERSI_APLIKASI, alamatPusat, modeMesin } from "../mode";
import { PERINTAH_UPDATE, type StatusUpdate, statusUpdate } from "../rilis-def";
import { dengar, pancarkan } from "../peristiwa";

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
  /** Versi update terakhir yang sudah dicatat di log (sekali per versi). */
  updateDicatat?: string;
  /** Penundaan awal sebelum menghubungi pusat (uji bisa mempercepat). */
  coba: number;
  /** Sandbox: mesin menyimpan lebih dari 1 nomor (sandbox hanya boleh 1) -> mode terbatas. */
  nomorLebih: boolean;
  /** Perbarui lisensi manual terakhir (ms), untuk jeda antar-klik. */
  perbaruiTerakhir: number;
}

const g = globalThis as unknown as { __waMesinLisensi?: Keadaan };
const st = (g.__waMesinLisensi ??= { isi: null, idInstalasi: null, siap: null, galat: null, sinkron: false, timerUlang: null, timerPeringatan: null, peringatan: new Set(), coba: 0, nomorLebih: false, perbaruiTerakhir: 0 });

const kunciApi = (): string => (process.env.CHATGERCEP_KEY ?? "").trim();
/** Mode menurut key di .env (sebelum lisensi pertama tiba): cg_test_ = sandbox. */
const modeKunci = (): ModeApi | null => uraiKunciApi(kunciApi())?.mode ?? null;
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
    catatUpdate();
    await periksaNomorSandbox();
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

/** Lisensi ada, status aktif, dan belum habis (tanpa syarat jumlah nomor sandbox, supaya nomor lebih tetap bisa dihapus). */
function lisensiAktif(kini = sekarang()): boolean {
  const i = st.isi;
  return !!i && i.status === "aktif" && i.berlaku_sampai > kini;
}

/**
 * Fitur boleh dipakai di mesin? Satu pengecekan untuk SEMUA jalur: API, dashboard mesin (server action, halaman,
 * route), bot WhatsApp, dan antrean. Membaca lisensi di memori (0 query). Di server pusat selalu true.
 */
export function fiturBoleh(kode: FiturApi): boolean {
  if (!modeMesin()) return true;
  return lisensiAktif() && !!st.isi?.fitur.includes(kode);
}

/** Bot WhatsApp boleh membalas otomatis: layanan aktif + fitur `bot` dibuka. Pusat: sama dengan layananBoleh (true). */
export const botBoleh = (kini = sekarang()): boolean => layananBoleh(kini) && (!modeMesin() || !!st.isi?.fitur.includes("bot"));

/**
 * Dashboard bawaan mesin boleh dibuka? Mati bila `.env DASHBOARD_MESIN=mati`, atau lisensi sudah ada tetapi fitur
 * `dashboard` tidak dibuka / layanan ditangguhkan, dicabut, habis (blokir dari pusat mengalahkan `.env`). Belum ada
 * lisensi sama sekali = tetap boleh (pemilik perlu melihat status aktivasi).
 */
export async function dashboardMesinBoleh(): Promise<boolean> {
  if (!modeMesin()) return true;
  // Membaca jam (masa berlaku lisensi) hanya boleh saat permintaan berjalan, bukan saat prerender (aturan Next.js).
  // Di luar konteks permintaan (uji, pekerja latar) connection() melempar: diabaikan.
  try {
    await connection();
  } catch {}
  if ((process.env.DASHBOARD_MESIN ?? "").trim().toLowerCase() === "mati") return false;
  await muatLisensi().catch(() => {});
  if (!st.isi) return true;
  return lisensiAktif() && st.isi.fitur.includes("dashboard");
}

/** Mesin sedang berjalan sebagai sandbox (menurut lisensi yang dipegang). Sinkron, hanya membaca memori. */
export const sandboxAktif = (): boolean => modeMesin() && (st.isi ? modeLisensi(st.isi) === "sandbox" : modeKunci() === "sandbox");

/** Nomor penguji lisensi sandbox; null = belum diverifikasi / bukan sandbox. */
export const nomorUji = (): NomorUji | null => (sandboxAktif() ? (st.isi?.uji ?? null) : null);

const angka = (v: string | null | undefined): string => String(v ?? "").replace(/\D/g, "");
/** Bagian pengguna alamat WA (628…@s.whatsapp.net -> 628…); LID bukan nomor telepon. */
const teleponDariAlamat = (a: string | null | undefined): string | null => (a && a.endsWith("@s.whatsapp.net") ? angka(a.split("@")[0].split(":")[0]) || null : null);

/**
 * Apakah lawan bicara ini nomor penguji sandbox? Dicocokkan lewat telepon ATAU alamat WA (JID/LID), karena WhatsApp kadang
 * hanya memberi LID. Bukan sandbox = selalu true (gerbang tidak berlaku).
 */
export function lawanNomorUji(o: { telepon?: string | null; alamat?: string | null }): boolean {
  if (!sandboxAktif()) return true;
  const u = st.isi?.uji;
  if (!u) return false;
  const tel = angka(o.telepon) || teleponDariAlamat(o.alamat);
  const telUji = u.telepon || teleponDariAlamat(u.alamat);
  if (tel && telUji && tel === telUji) return true;
  return !!o.alamat && !!u.alamat && o.alamat === u.alamat;
}

/** Tujuan kirim (nomor 628…) sama dengan nomor penguji? Bukan sandbox = true. */
export function tujuanNomorUji(ke: string): boolean {
  if (!sandboxAktif()) return true;
  const u = st.isi?.uji;
  const telUji = u ? u.telepon || teleponDariAlamat(u.alamat) : null;
  return !!telUji && angka(ke) === telUji;
}

/** Sandbox hanya boleh 1 nomor. Dihitung saat lisensi dimuat/diterima/diperbarui (bukan per pesan). */
async function periksaNomorSandbox(): Promise<void> {
  if (modeLisensi(st.isi) !== "sandbox") {
    st.nomorLebih = false;
    return;
  }
  try {
    const sql = await db();
    const [{ n }] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM numbers`;
    st.nomorLebih = n > 1;
  } catch {
    st.nomorLebih = false;
  }
}

/**
 * Boleh melayani (API & bot)? Sinkron, hanya membaca memori. Di mode pusat selalu true (fungsi ini dipanggil jembatan
 * WhatsApp yang sama di kedua mode).
 */
export function layananBoleh(kini = sekarang()): boolean {
  if (!modeMesin()) return true;
  const i = st.isi;
  return !!i && i.status === "aktif" && i.berlaku_sampai > kini && !(st.nomorLebih && modeLisensi(i) === "sandbox");
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
  if (modeLisensi(i) === "sandbox") {
    if (i.berlaku_sampai <= kini) return { kode: "sandbox_kedaluwarsa", pesan: "Masa berlaku key sandbox habis. Perpanjang di portal Developer ChatGerCep, lalu klik Perbarui lisensi di dashboard mesin (atau nyalakan ulang mesin)." };
    if (st.nomorLebih) return { kode: "batas_nomor", pesan: "Sandbox hanya boleh 1 nomor WhatsApp. Hapus nomor lain di dashboard mesin, lalu klik Perbarui lisensi." };
    return null;
  }
  if (i.berlaku_sampai <= kini) return { kode: "lisensi_kedaluwarsa", pesan: "Lisensi mesin kedaluwarsa: perpanjangan dari server pusat belum diterima. Pastikan ALAMAT_PUBLIK bisa diakses lewat HTTPS." };
  return null;
}

export interface InfoLisensi {
  aktif: boolean;
  mode: ModeApi;
  /** Sandbox: nomor penguji tersamar (62812****890) / "terverifikasi" bila hanya LID; null = belum ada. */
  nomor_uji: string | null;
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

/** Status rolling release mesin ini terhadap info rilis di lisensi (sandbox & production sama). */
export function updateMesin(kini = sekarang()): StatusUpdate {
  return statusUpdate(VERSI_APLIKASI, st.isi?.rilis, kini);
}

/** Satu baris peringatan di terminal (docker compose logs), sekali per versi terbaru/minimal yang baru diketahui. */
function catatUpdate(): void {
  const u = updateMesin();
  if (!u.tersedia && !u.wajib) return;
  const kunci = `${u.versi_terbaru}|${u.wajib}|${u.wajib_sampai}`;
  if (st.updateDicatat === kunci) return;
  st.updateDicatat = kunci;
  const tenggat = u.wajib_sampai ? ` sebelum ${new Date(u.wajib_sampai * 1000).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB` : "";
  const awal = u.wajib ? `WAJIB UPDATE${tenggat}` : "Update tersedia";
  console.warn(`[mesin] ${awal}: v${u.versi_kini} -> v${u.versi_terbaru ?? "?"}. Jalankan: ${PERINTAH_UPDATE}${u.catatan ? ` | ${u.catatan}` : ""}`);
}

export function infoLisensi(): InfoLisensi {
  const i = st.isi;
  const u = nomorUji();
  return {
    aktif: layananBoleh(),
    mode: i ? modeLisensi(i) : (modeKunci() ?? "produksi"),
    nomor_uji: u ? (u.telepon ? samarkanNomor(u.telepon) : "terverifikasi (LID)") : null,
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
  catatUpdate();
  await periksaNomorSandbox();
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

async function panggilPusat(jalur: string, isi: PermintaanAktivasi | PermintaanKondisi | PermintaanNomorUji): Promise<string> {
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
  // Key di .env berganti jenis (sandbox <-> production): instalasi baru di pusat (aplikasinya lain). Data mesin & sesi
  // WhatsApp tidak disentuh; hanya identitas instalasi + lisensi lama yang dikosongkan.
  const mk = modeKunci();
  if (st.isi && mk && modeLisensi(st.isi) !== mk) await gantiInstalasi();
  const id = st.idInstalasi!;
  let token: string;
  if (st.isi) {
    try {
      token = await panggilPusat(JALUR_KONDISI, { key, id_instalasi: id, versi: VERSI_APLIKASI, nomor_bot: await nomorBot() });
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
  // Sandbox tidak butuh alamat publik (tanpa tantangan & webhook lisensi): bisa dijalankan di laptop.
  if (modeKunci() === "sandbox") return nomorBot().then((nomor_bot) => panggilPusat(JALUR_AKTIVASI, { key, id_instalasi: id, alamat, versi: VERSI_APLIKASI, nomor_bot }));
  if (!alamat) throw new GalatPusat("tanpa_alamat", "ALAMAT_PUBLIK belum diisi di .env mesin (alamat HTTPS publik mesin ini)", 0);
  return panggilPusat(JALUR_AKTIVASI, { key, id_instalasi: id, alamat, versi: VERSI_APLIKASI });
}

/** Nomor bot = nomor WA terhubung pertama di mesin (sandbox hanya 1 nomor); dilaporkan ke portal Developer. */
async function nomorBot(): Promise<string | null> {
  try {
    const sql = await db();
    const [r] = await sql<{ wa_id: string }[]>`SELECT wa_id FROM numbers WHERE wa_id IS NOT NULL ORDER BY id LIMIT 1`;
    return r?.wa_id ?? null;
  } catch {
    return null;
  }
}

async function gantiInstalasi(): Promise<void> {
  const baru = randomUUID();
  const sql = await db();
  await sql`UPDATE mesin_lisensi SET id_instalasi = ${baru}::uuid, lisensi = NULL, versi_urut = 0, berlaku_sampai = NULL, diterima = NULL WHERE id = 1`;
  st.idInstalasi = baru;
  st.isi = null;
  st.nomorLebih = false;
  console.info("[mesin] jenis key berganti (sandbox/production): instalasi baru, data & WhatsApp tetap");
}

/**
 * Tombol "Perbarui lisensi" di dashboard mesin (tindakan pemilik, bukan polling): sekali bertanya ke pusat. Dipakai
 * sandbox (tanpa webhook) sesudah perpanjang / ganti nomor penguji / hapus nomor lebih. Jeda 15 dtk antar-klik.
 */
export async function perbaruiLisensi(): Promise<{ ok: boolean; pesan: string }> {
  if (!modeMesin()) return { ok: false, pesan: "Hanya di mesin self-host." };
  if (Date.now() - st.perbaruiTerakhir < 15_000) return { ok: false, pesan: "Tunggu sebentar sebelum memperbarui lagi." };
  st.perbaruiTerakhir = Date.now();
  try {
    await sinkronSekali();
    await periksaNomorSandbox();
    const a = alasanTerbatas();
    return { ok: !a, pesan: a ? a.pesan : "Lisensi diperbarui." };
  } catch (e) {
    const pesan = e instanceof Error ? e.message : String(e);
    await catatGalat(pesan);
    return { ok: false, pesan };
  }
}

/**
 * Mesin sandbox menerima "UJI <kode>" (dari nomor mana pun): teruskan ke pusat; jawabannya lisensi baru berisi nomor
 * uji. Mengembalikan true bila nomor pengirim kini nomor penguji.
 */
export async function verifikasiNomorUjiKePusat(kode: string, pengirim: { telepon: string | null; alamat: string | null }): Promise<{ ok: boolean; pesan: string }> {
  await muatLisensi();
  const key = kunciApi();
  if (!key || modeKunci() !== "sandbox") return { ok: false, pesan: "bukan mesin sandbox" };
  try {
    const token = await panggilPusat(JALUR_NOMOR_UJI, { key, id_instalasi: st.idInstalasi!, kode, telepon: pengirim.telepon, alamat: pengirim.alamat, versi: VERSI_APLIKASI, nomor_bot: await nomorBot() });
    const t = await terimaLisensi(token);
    if (!t.ok) return { ok: false, pesan: t.alasan };
    return { ok: lawanNomorUji(pengirim), pesan: "ok" };
  } catch (e) {
    return { ok: false, pesan: e instanceof Error ? e.message : String(e) };
  }
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
  if (!alamatPublik() && modeKunci() !== "sandbox") console.warn("[mesin] ALAMAT_PUBLIK belum diisi: aktivasi & perpanjangan lisensi dari pusat butuh alamat HTTPS publik mesin ini.");
  if (modeKunci() === "sandbox") console.info("[mesin] key sandbox (cg_test_): hanya 1 nomor penguji, tanpa alamat publik.");
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
  // Sandbox: begitu nomor bot terhubung (scan QR), kabari pusat SEKALI supaya portal Developer menampilkannya.
  // Berbasis kejadian (bukan polling); sekaligus mengambil lisensi terbaru.
  dengar((p) => {
    if (p.jenis !== "nomor.terhubung" || modeKunci() !== "sandbox") return;
    setTimeout(() => void sinkronSekali().catch((e) => console.warn("[mesin] lapor nomor bot gagal:", e instanceof Error ? e.message : e)), 2_000).unref?.();
  });
  // Peringatan sisa masa lisensi (24 jam & 6 jam) ke webhook aplikasi; hanya membaca memori, tidak menghubungi pusat.
  st.timerPeringatan = setInterval(() => periksaPeringatan(), 15 * 60_000);
  st.timerPeringatan.unref?.();
}

/** Pancarkan lisensi.peringatan sekali per ambang (24 jam, 6 jam) per lisensi. */
export function periksaPeringatan(kini = sekarang()): void {
  const i = st.isi;
  // Sandbox tidak diperpanjang otomatis (tanpa webhook): peringatan perpanjangan tidak relevan.
  if (!i || i.status !== "aktif" || modeLisensi(i) === "sandbox") return;
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
  Object.assign(st, { isi: null, idInstalasi: null, siap: null, galat: null, sinkron: false, timerUlang: null, timerPeringatan: null, peringatan: new Set(), coba: 0, nomorLebih: false, perbaruiTerakhir: 0 });
}
