import "server-only";
import {
  ANONIM,
  HALAMAN_PUBLIK,
  JENIS,
  type Jenis,
  KODE_FITUR,
  MAKS_BYTE_KIRIM,
  MAKS_EVENT_PER_KIRIM,
  MAKS_PANJANG_JALUR,
  MAKS_PANJANG_LABEL,
  RETENSI_HARI,
  labelAman,
  polaJalur,
} from "./analitik-def";
import { type Sql, db, sekarang } from "./db";
import { kunciHariWib } from "./format";

/**
 * Analitik perilaku pengguna: kunjungan halaman & klik (dikirim browser ke /api/analitik) dan pemakaian fitur (dicatat
 * server). Definisi bersama di analitik-def.ts, tabel `analitik_harian` di migrasi v29 (db.ts).
 *
 *   1. `catat`/`catatFitur` hanya menjumlahkan di memori (sinkron, tanpa query, tidak pernah melempar). Buffer dibatasi
 *      MAKS_KUNCI_BUFFER kunci; penuh = tulis segera, kunci baru dibuang sampai tertulis.
 *   2. Tiap ~10 dtk (mulaiAnalitik) isi buffer di-upsert dengan SATU pernyataan per 2.000 baris (unnest + ON CONFLICT).
 *      Tulis tidak pernah berjalan bersamaan; gagal = isinya digabung kembali ke buffer dan dicoba lagi nanti.
 *   3. Baris yang lebih tua dari RETENSI_HARI dihapus tiap 6 jam lewat indeks tanggal.
 * Semua keadaan di globalThis: instrumentation, route handler, dan server action dibundel terpisah oleh Next.js tetapi
 * berbagi satu proses, jadi tetap satu buffer dan satu antrean tulis.
 */

const SELANG_TULIS_MS = 10_000;
const PEMBERSIHAN_AWAL_MS = 5 * 60_000;
const PEMBERSIHAN_SELANG_MS = 6 * 3600_000;
/** Kunci (jenis, tanggal, akun, kunci, label) berbeda yang boleh menunggu di memori (±200 byte per kunci). */
const MAKS_KUNCI_BUFFER = 20_000;
const BARIS_PER_TULIS = 2_000;
const HAPUS_PER_PUTARAN = 5_000;
/** Batas laju (event per jendela) dan kunci berbeda baru per hari untuk kiriman browser. */
const JENDELA_LAJU_DETIK = 60;
const LAJU_AKUN = 240;
const LAJU_ANONIM = 60;
const KUNCI_BARU_AKUN = 400;
const KUNCI_BARU_ANONIM = 2_000;
/** Peta batas laju & kunci baru dikosongkan bila melewati ini (setelah dibersihkan dari entri basi). */
const MAKS_PETA = 50_000;
/** Jumlah sidik kunci di semua akun sekaligus (±20 byte per sidik): memori peta kunci baru tetap terbatas. */
const MAKS_SIDIK = 200_000;
const MAKS_PANJANG_IP = 64;
/** Label klik yang kosong setelah dirapikan (mis. tombol ikon tanpa aria-label). */
const TANPA_LABEL = "(tanpa label)";
const HARI_DETIK = 86_400;

const PUBLIK = new Set<string>(HALAMAN_PUBLIK);

interface Sel {
  jenis: Jenis;
  tanggal: string; // YYYY-MM-DD WIB
  kunci: string;
  label: string;
  userId: number;
  n: number;
  terakhir: number; // detik epoch
}

interface Keadaan {
  buffer: Map<string, Sel>;
  /** Tulis yang sudah diminta tetapi belum mulai: permintaan berikutnya ikut menunggu ini (tidak menumpuk). */
  menunggu: Promise<void> | null;
  /** Tulis yang sedang berjalan; tulis berikutnya baru mulai setelah ini selesai. */
  berjalan: Promise<void> | null;
  /** Event yang dibuang karena buffer penuh sejak tulis berhasil terakhir. */
  dibuang: number;
  gagalDilaporkan: boolean;
  /** Setelah tulis gagal, buffer penuh tidak memicu tulis lagi sebelum waktu ini (ms): tanpa putaran coba-ulang rapat. */
  cobaLagi: number;
  timer: ReturnType<typeof setInterval> | null;
  timerBersih: ReturnType<typeof setInterval> | null;
  /** Batas laju per akun ("u:<id>") atau per IP anonim ("ip:<ip>"): jendela tetap JENDELA_LAJU_DETIK. */
  laju: Map<string, { n: number; mulai: number }>;
  /** "tanggal|userId" -> sidik kunci yang sudah diterima hari itu (membatasi kunci baru per akun per hari). */
  kunciBaru: Map<string, Set<number>>;
  jumlahSidik: number;
  bersihPeta: number;
  /** Memo kunciHariWib: tanggal untuk nomor hari WIB terakhir yang dihitung. */
  hari: { ke: number; tanggal: string };
}

const g = globalThis as unknown as { __waAnalitik?: Keadaan };
const keadaan = (): Keadaan =>
  (g.__waAnalitik ??= {
    buffer: new Map(),
    menunggu: null,
    berjalan: null,
    dibuang: 0,
    gagalDilaporkan: false,
    cobaLagi: 0,
    timer: null,
    timerBersih: null,
    laju: new Map(),
    kunciBaru: new Map(),
    jumlahSidik: 0,
    bersihPeta: 0,
    hari: { ke: -1, tanggal: "" },
  });

const pesanGalat = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Detik epoch dari masukan (milidetik juga diterima); tidak sah/kosong = sekarang. */
function detikSah(w: number | undefined): number {
  if (typeof w !== "number" || !Number.isFinite(w) || w <= 0) return Math.floor(Date.now() / 1000);
  return Math.floor(w > 1e11 ? w / 1000 : w);
}

/** Tanggal WIB "YYYY-MM-DD" (kunciHariWib), dimemo per hari: WIB selalu UTC+7 tanpa musim panas. */
function tanggalWib(k: Keadaan, detik: number): string {
  const ke = Math.floor((detik + 7 * 3600) / HARI_DETIK);
  if (k.hari.ke !== ke) k.hari = { ke, tanggal: kunciHariWib(detik) };
  return k.hari.tanggal;
}

/** Tambah satu event ke buffer. false = dibuang karena buffer penuh. Kunci & label sudah sah. */
function tambah(k: Keadaan, userId: number, jenis: Jenis, kunci: string, label: string, detik: number): boolean {
  const tanggal = tanggalWib(k, detik);
  // Pola halaman & kode fitur tidak pernah memuat "|", jadi label (boleh memuat "|") aman di ujung.
  const kb = `${jenis}|${tanggal}|${userId}|${kunci}|${label}`;
  const ada = k.buffer.get(kb);
  if (ada) {
    ada.n += 1;
    if (detik > ada.terakhir) ada.terakhir = detik;
    return true;
  }
  if (k.buffer.size >= MAKS_KUNCI_BUFFER) {
    if (k.dibuang++ === 0) console.warn(`[analitik] buffer penuh (${MAKS_KUNCI_BUFFER} kunci): event baru dibuang sampai tertulis ke database`);
    if (Date.now() >= k.cobaLagi) void tulisTuntasAnalitik();
    return false;
  }
  k.buffer.set(kb, { jenis, tanggal, kunci, label, userId, n: 1, terakhir: detik });
  if (k.buffer.size >= MAKS_KUNCI_BUFFER && Date.now() >= k.cobaLagi) void tulisTuntasAnalitik();
  return true;
}

/** Catat ke buffer memori (sinkron, tidak pernah melempar, tanpa query). Tanggal WIB dihitung dari `waktu` (detik epoch). */
export function catat(userId: number, jenis: Jenis, kunci: string, label?: string, waktu?: number): void {
  try {
    if (!Number.isSafeInteger(userId) || userId < 0) return;
    if (jenis === JENIS.fitur) {
      if (typeof kunci === "string" && KODE_FITUR.test(kunci)) tambah(keadaan(), userId, jenis, kunci, "", detikSah(waktu));
      return;
    }
    if (jenis !== JENIS.halaman && jenis !== JENIS.klik) return;
    // Pola ("/nomor/[id]") maupun jalur apa adanya ("/eng/nomor/12") diterima; selain halaman aplikasi diabaikan.
    const pola = polaJalur(kunci);
    if (!pola) return;
    tambah(keadaan(), userId, jenis, pola, jenis === JENIS.klik ? labelAman(label) || TANPA_LABEL : "", detikSah(waktu));
  } catch {
    // Analitik tidak boleh mengganggu pemanggilnya.
  }
}

/** Pemakaian fitur oleh server (jenis 2). Kode harus cocok KODE_FITUR; kode tak sah diabaikan diam-diam. */
export function catatFitur(userId: number, kode: string): void {
  catat(userId, JENIS.fitur, kode);
}

/** Satu pernyataan untuk sampai BARIS_PER_TULIS baris: tiap kolom dikirim sebagai satu array (7 parameter saja). */
async function tulisBaris(sql: Sql, isi: Sel[]): Promise<void> {
  const jenis: number[] = [];
  const tanggal: string[] = [];
  const kunci: string[] = [];
  const label: string[] = [];
  const pengguna: number[] = [];
  const n: number[] = [];
  const terakhir: number[] = [];
  for (const s of isi) {
    jenis.push(s.jenis);
    tanggal.push(s.tanggal);
    kunci.push(s.kunci);
    label.push(s.label);
    pengguna.push(s.userId);
    n.push(s.n);
    terakhir.push(s.terakhir);
  }
  await sql`
    INSERT INTO analitik_harian AS a (jenis, tanggal, kunci, label, user_id, n, terakhir)
    SELECT x.jenis, x.tanggal::date, x.kunci, x.label, x.user_id, x.n, x.terakhir
      FROM unnest(${jenis}::int2[], ${tanggal}::text[], ${kunci}::text[], ${label}::text[], ${pengguna}::int4[], ${n}::int4[], ${terakhir}::int8[])
           AS x(jenis, tanggal, kunci, label, user_id, n, terakhir)
    ON CONFLICT (jenis, tanggal, kunci, label, user_id) DO UPDATE
      SET n = a.n + EXCLUDED.n, terakhir = GREATEST(a.terakhir, EXCLUDED.terakhir)`;
}

/** Sisa yang belum tertulis kembali ke buffer (dijumlahkan dengan event baru), sampai batas; selebihnya dibuang. */
function gabungkanKembali(k: Keadaan, isi: [string, Sel][], dari: number): void {
  for (let i = dari; i < isi.length; i++) {
    const [kb, s] = isi[i];
    const ada = k.buffer.get(kb);
    if (ada) {
      ada.n += s.n;
      if (s.terakhir > ada.terakhir) ada.terakhir = s.terakhir;
    } else if (k.buffer.size < MAKS_KUNCI_BUFFER) {
      k.buffer.set(kb, s);
    } else {
      if (k.dibuang === 0) console.warn(`[analitik] buffer penuh (${MAKS_KUNCI_BUFFER} kunci): sebagian event yang gagal ditulis dibuang`);
      k.dibuang += s.n;
    }
  }
}

async function tulisBuffer(k: Keadaan): Promise<void> {
  if (!k.buffer.size) return;
  const isi = [...k.buffer];
  k.buffer = new Map();
  let i = 0;
  try {
    const sql = await db();
    for (; i < isi.length; i += BARIS_PER_TULIS) await tulisBaris(sql, isi.slice(i, i + BARIS_PER_TULIS).map((e) => e[1]));
  } catch (e) {
    gabungkanKembali(k, isi, i);
    k.cobaLagi = Date.now() + SELANG_TULIS_MS;
    if (!k.gagalDilaporkan) {
      k.gagalDilaporkan = true;
      console.error(`[analitik] gagal menulis ${isi.length - i} kunci (disimpan lagi di memori, dicoba lagi nanti): ${pesanGalat(e)}`);
    }
    return;
  }
  k.cobaLagi = 0;
  if (k.gagalDilaporkan) {
    k.gagalDilaporkan = false;
    console.info("[analitik] tulis ke database pulih");
  }
  if (k.dibuang) {
    console.warn(`[analitik] ${k.dibuang} event sempat dibuang karena buffer penuh`);
    k.dibuang = 0;
  }
}

/**
 * Tulis seluruh buffer ke DB sekarang (satu INSERT ... SELECT FROM unnest(...) ON CONFLICT DO UPDATE per 2.000 baris).
 * Tidak pernah dua tulis bersamaan: yang diminta saat tulis lain berjalan menunggu giliran, dan permintaan beruntun
 * digabung jadi satu. Tidak pernah ditolak (gagal DB dicatat ke log, isinya kembali ke buffer).
 */
export function tulisTuntasAnalitik(): Promise<void> {
  const k = keadaan();
  if (k.menunggu) return k.menunggu;
  const giliran = k.berjalan ?? Promise.resolve();
  const p: Promise<void> = giliran.then(async () => {
    k.menunggu = null;
    k.berjalan = p;
    try {
      await tulisBuffer(k);
    } catch (e) {
      console.error("[analitik] gagal menulis:", pesanGalat(e));
    } finally {
      if (k.berjalan === p) k.berjalan = null;
    }
  });
  k.menunggu = p;
  return p;
}

/** Hapus baris lebih tua dari RETENSI_HARI (tanggal WIB). Mengembalikan jumlah baris terhapus. */
export async function hapusAnalitikKedaluwarsa(kini: number = sekarang()): Promise<number> {
  const batas = kunciHariWib(detikSah(kini) - RETENSI_HARI * HARI_DETIK);
  const sql = await db();
  let total = 0;
  // Berkelompok lewat indeks tanggal: kunci baris & WAL per pernyataan tetap kecil walau yang dihapus banyak.
  for (;;) {
    const r = await sql`
      DELETE FROM analitik_harian
       WHERE ctid = ANY(ARRAY(SELECT ctid FROM analitik_harian WHERE tanggal < ${batas}::date LIMIT ${HAPUS_PER_PUTARAN}))`;
    total += r.count;
    if (r.count < HAPUS_PER_PUTARAN) return total;
  }
}

/** Timer tulis berkala (~10 dtk, unref) + pembersihan retensi 5 menit setelah mulai lalu tiap 6 jam. Idempoten (globalThis). */
export function mulaiAnalitik(): void {
  const k = keadaan();
  if (k.timer) return;
  k.timer = setInterval(() => {
    if (k.buffer.size) void tulisTuntasAnalitik();
    const kini = Math.floor(Date.now() / 1000);
    if (kini - k.bersihPeta >= JENDELA_LAJU_DETIK) bersihkanPeta(k, kini);
  }, SELANG_TULIS_MS);
  k.timer.unref?.();
  const bersih = () =>
    void hapusAnalitikKedaluwarsa()
      .then((n) => {
        if (n) console.log(`[analitik] dihapus (lebih dari ${RETENSI_HARI} hari): ${n} baris`);
      })
      .catch((e) => console.error("[analitik] gagal membersihkan:", pesanGalat(e)));
  setTimeout(bersih, PEMBERSIHAN_AWAL_MS).unref?.();
  k.timerBersih = setInterval(bersih, PEMBERSIHAN_SELANG_MS);
  k.timerBersih.unref?.();
}

// ---------- Kiriman browser (POST /api/analitik) ----------

/** Terima kiriman browser (logika route handler, bisa diuji tanpa Next). */
export interface HasilTerima {
  status: 204 | 400 | 413 | 429;
  diterima: number;
}

/** Buang entri batas laju yang jendelanya lewat dan sidik kunci hari-hari sebelumnya. */
function bersihkanPeta(k: Keadaan, kini: number): void {
  k.bersihPeta = kini;
  for (const [kunci, v] of k.laju) if (kini - v.mulai >= JENDELA_LAJU_DETIK) k.laju.delete(kunci);
  const hariIni = tanggalWib(k, kini);
  let sisa = 0;
  for (const [kp, set] of k.kunciBaru) {
    if (kp.slice(0, 10) !== hariIni) k.kunciBaru.delete(kp);
    else sisa += set.size;
  }
  k.jumlahSidik = sisa;
}

/** true = kiriman `jumlah` event ini melewati batas laju (kiriman yang ditolak tidak ikut dihitung). */
function melewatiLaju(k: Keadaan, kunci: string, jumlah: number, maks: number, kini: number): boolean {
  const p = k.laju.get(kunci);
  if (p && kini - p.mulai < JENDELA_LAJU_DETIK) {
    if (p.n + jumlah > maks) return true;
    p.n += jumlah;
    return false;
  }
  if (jumlah > maks) return true;
  if (!p && k.laju.size >= MAKS_PETA) {
    bersihkanPeta(k, kini);
    if (k.laju.size >= MAKS_PETA) k.laju.clear();
  }
  k.laju.set(kunci, { n: jumlah, mulai: kini });
  return false;
}

/** Sidik 32-bit (FNV-1a) satu kunci; tabrakan hanya membuat batas sedikit lebih longgar, tidak salah hitung angka. */
function sidik(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** Kunci (jenis, pola, label) ini boleh dicatat untuk akun ini hari ini? Kunci yang sudah pernah diterima selalu boleh. */
function bolehKunci(k: Keadaan, userId: number, tanggal: string, s: number): boolean {
  const kp = `${tanggal}|${userId}`;
  let set = k.kunciBaru.get(kp);
  if (set?.has(s)) return true;
  if (set && set.size >= (userId === ANONIM ? KUNCI_BARU_ANONIM : KUNCI_BARU_AKUN)) return false;
  // Pengaman memori: bila terlalu banyak (akun x kunci) sekaligus, peta dimulai dari kosong (batas hanya jadi longgar).
  if (k.kunciBaru.size >= MAKS_PETA || k.jumlahSidik >= MAKS_SIDIK) {
    k.kunciBaru.clear();
    k.jumlahSidik = 0;
    set = undefined;
  }
  if (!set) {
    set = new Set();
    k.kunciBaru.set(kp, set);
  }
  set.add(s);
  k.jumlahSidik += 1;
  return true;
}

/**
 * Kiriman browser `{"e":[[jenis, jalur, label?], ...]}`. 413 = lebih dari MAKS_BYTE_KIRIM byte; 400 = JSON rusak, bukan
 * bentuk itu, atau lebih dari MAKS_EVENT_PER_KIRIM event; 429 = melewati batas laju (akun 240/menit, anonim 60/menit per
 * IP). Event dengan jalur yang bukan halaman aplikasi dibuang; tanpa sesi (userId null) hanya HALAMAN_PUBLIK yang
 * dicatat. Label klik dirapikan ulang dengan labelAman (klien tidak dipercaya). `kini` = detik epoch (bawaan: sekarang).
 */
export function terimaKiriman(a: { teks: string; userId: number | null; ip: string; kini?: number }): HasilTerima {
  const tolak = (status: 400 | 413 | 429): HasilTerima => ({ status, diterima: 0 });
  try {
    const teks = a.teks;
    if (typeof teks !== "string") return tolak(400);
    // Panjang UTF-16 <= jumlah byte UTF-8 <= 3x panjang: hitung byte hanya bila perlu.
    if (teks.length > MAKS_BYTE_KIRIM || (teks.length * 3 > MAKS_BYTE_KIRIM && Buffer.byteLength(teks, "utf8") > MAKS_BYTE_KIRIM)) return tolak(413);
    let data: unknown;
    try {
      data = JSON.parse(teks);
    } catch {
      return tolak(400);
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) return tolak(400);
    const e: unknown = (data as { e?: unknown }).e;
    if (!Array.isArray(e) || e.length > MAKS_EVENT_PER_KIRIM) return tolak(400);
    for (const ev of e) {
      if (!Array.isArray(ev) || ev.length < 2 || ev.length > 3) return tolak(400);
      const [jenis, jalur, label] = ev as unknown[];
      if ((jenis !== JENIS.halaman && jenis !== JENIS.klik) || typeof jalur !== "string") return tolak(400);
      if (label !== undefined && label !== null && typeof label !== "string") return tolak(400);
    }
    if (!e.length) return { status: 204, diterima: 0 };

    const k = keadaan();
    const kini = detikSah(a.kini);
    if (kini - k.bersihPeta >= JENDELA_LAJU_DETIK) bersihkanPeta(k, kini);
    const userId = typeof a.userId === "number" && Number.isSafeInteger(a.userId) && a.userId > 0 ? a.userId : ANONIM;
    const kunciLaju = userId === ANONIM ? `ip:${String(a.ip ?? "").slice(0, MAKS_PANJANG_IP)}` : `u:${userId}`;
    if (melewatiLaju(k, kunciLaju, e.length, userId === ANONIM ? LAJU_ANONIM : LAJU_AKUN, kini)) return tolak(429);

    const tanggal = tanggalWib(k, kini);
    let diterima = 0;
    for (const [jenis, jalur, label] of e as [0 | 1, string, string | null | undefined][]) {
      if (jalur.length > MAKS_PANJANG_JALUR) continue;
      const pola = polaJalur(jalur);
      if (!pola || (userId === ANONIM && !PUBLIK.has(pola))) continue;
      const lbl = jenis === JENIS.klik ? labelAman(typeof label === "string" ? label.slice(0, MAKS_PANJANG_LABEL * 4) : "") || TANPA_LABEL : "";
      if (!bolehKunci(k, userId, tanggal, sidik(`${jenis}|${pola}|${lbl}`))) continue;
      if (tambah(k, userId, jenis, pola, lbl, kini)) diterima += 1;
    }
    return { status: 204, diterima };
  } catch {
    return tolak(400);
  }
}

// ---------- Ringkasan untuk halaman admin ----------

export interface FilterAnalitik {
  hari: number;
  userId?: number | null;
  sertakanAdmin?: boolean;
  kini?: number;
}
/** Periode ini vs periode sebelumnya yang sama panjang. */
export interface Angka2 {
  kini: number;
  lalu: number;
}
/** Akun yang paling sering melakukan satu hal (ditampilkan di bawah butir daftar teratas). */
export interface SiapaSingkat {
  userId: number;
  /** Nama akun, atau email bila nama kosong. */
  nama: string;
  n: number;
}
export interface BarisTop {
  kunci: string;
  label: string;
  n: number;
  pengguna: number;
  terakhir: number;
  /** SIAPA_N akun teratas untuk butir ini (tanpa anonim), urut menurun; kosong dalam mode satu akun. */
  siapa: SiapaSingkat[];
}
export interface TitikAnalitik {
  tanggal: string;
  aktif: number;
  halaman: number;
  klik: number;
  fitur: number;
}
export interface PenggunaAktif {
  userId: number;
  email: string | null;
  nama: string | null;
  peran: string | null;
  halaman: number;
  klik: number;
  fitur: number;
  hariAktif: number;
  terakhir: number;
}
export interface RingkasanAnalitik {
  /** 'YYYY-MM-DD' WIB, urut naik, panjang = filter.hari, berakhir hari ini. */
  hari: string[];
  /** pengguna = akun unik aktif (tanpa anonim); anonim = kunjungan halaman anonim. */
  total: { halaman: Angka2; klik: Angka2; fitur: Angka2; pengguna: Angka2; anonim: Angka2 };
  /** Satu titik per hari di `hari` (hari tanpa data = nol). */
  harian: TitikAnalitik[];
  /** Jenis 0, label '': semua halaman (ruang kuncinya dibatasi POLA_HALAMAN). */
  halaman: BarisTop[];
  /** Jenis 1 (kunci = pola halaman, label = label elemen): 50 teratas. */
  klik: BarisTop[];
  /** Jenis 2 (kunci = kode fitur): semua fitur yang dipakai (maks. 150). */
  fitur: BarisTop[];
  /** 20 akun paling aktif (kosong bila filter.userId diisi). */
  pengguna: PenggunaAktif[];
  /** Akun (login) yang tercatat beraktivitas dalam ONLINE_DETIK terakhir: perkiraan "sedang online" (tertinggal ±20 dtk). */
  online: number;
}

/** Jendela "sedang online": aktivitas dalam 5 menit terakhir. */
export const ONLINE_DETIK = 300;

/** Batas butir per daftar: halaman & fitur praktis semuanya, klik (label bebas) 50 teratas. */
const BATAS_TOP: Record<Jenis, number> = { 0: 60, 1: 50, 2: 150 };
/** Akun teratas yang disebut per butir daftar. */
const SIAPA_N = 3;
const PENGGUNA_N = 20;
/** Baris maksimal di rincian "siapa saja" (lebih dari ini = terpotong, ditandai). */
const RINCIAN_N = 500;

/** "YYYY-MM-DD" digeser `n` hari (kalender murni, tanpa zona waktu). */
const geserTanggal = (tgl: string, n: number): string => new Date(Date.parse(`${tgl}T00:00:00Z`) + n * HARI_DETIK * 1000).toISOString().slice(0, 10);

/** Periode `f.hari` hari terakhir (WIB, berakhir hari ini): jumlah hari (1..RETENSI_HARI) dan tanggal awal/akhir. */
function periode(f: FilterAnalitik): { hari: number; awal: string; akhir: string } {
  const hari = Number.isFinite(f.hari) ? Math.min(RETENSI_HARI, Math.max(1, Math.floor(f.hari))) : 30;
  const akhir = kunciHariWib(detikSah(f.kini));
  return { hari, akhir, awal: geserTanggal(akhir, 1 - hari) };
}

/**
 * Ringkasan analitik `f.hari` hari terakhir (WIB, berakhir hari ini) dibandingkan periode sebelumnya yang sama panjang.
 * Semua agregasi di SQL, 5 query paralel lewat indeks tanggal (mode satu akun: indeks user_id, tanggal):
 *   - periode ini, satu pindaian: per (hari, akun) dulu (±300 baris/hari), lalu jadi titik harian, total, akun teratas;
 *   - periode sebelumnya: dijumlahkan per akun, lalu total;
 *   - daftar teratas per jenis: per (kunci, label, akun) dulu, jadi pengguna unik = COUNT(*) tanpa DISTINCT.
 * Aturan:
 *   - Anonim (user_id 0) hanya masuk `total.anonim` dan daftar halaman/klik/fitur teratas (`n`); tidak dihitung di
 *     `total.pengguna`, `total.halaman/klik/fitur`, `harian`, kolom `pengguna` daftar teratas, maupun `pengguna`.
 *   - `sertakanAdmin` false (bawaan) = baris milik akun ber-peran admin dikecualikan.
 *   - `userId` diisi = semua angka hanya untuk akun itu (anonim = 0, `pengguna` kosong), apa pun perannya.
 */
export async function ringkasanAnalitik(f: FilterAnalitik): Promise<RingkasanAnalitik> {
  const { hari, akhir, awal } = periode(f);
  const awalLalu = geserTanggal(awal, -hari);
  const akhirLalu = geserTanggal(awal, -1);
  const satuAkun = typeof f.userId === "number" && Number.isSafeInteger(f.userId) && f.userId > 0 ? f.userId : null;
  const sql = await db();
  // Penyaring baris: satu akun (indeks user_id, tanggal) atau tanpa akun admin (bawaan; subquery kecil di-hash sekali).
  const saring = satuAkun
    ? sql`AND user_id = ${satuAkun}`
    : f.sertakanAdmin
      ? sql``
      : sql`AND user_id NOT IN (SELECT id FROM users WHERE peran <> 'user')`;

  // Daftar teratas satu jenis (indeks tanggal; tiga jenis = tiga bagian terpisah dari jendela yang sama). Per (kunci, label,
  // akun) dulu: pengguna unik = COUNT(*), dan dari kelompok yang sama diambil SIAPA_N akun teratas per butir (row_number),
  // digabung ke users hanya untuk baris terpilih itu. Mode satu akun: tanpa daftar siapa (isinya hanya akun itu).
  const siapaN = satuAkun ? 0 : SIAPA_N;
  const teratas = (jenis: Jenis) => sql<BarisTop[]>`
    WITH p AS (
      SELECT kunci, label, user_id, SUM(n) AS m, MAX(terakhir) AS w
        FROM analitik_harian
       WHERE jenis = ${jenis} AND tanggal BETWEEN ${awal}::date AND ${akhir}::date ${saring}
       GROUP BY kunci, label, user_id
    ), t AS (
      SELECT kunci, label, SUM(m)::bigint AS n, COUNT(*) FILTER (WHERE user_id <> 0) AS pengguna, MAX(w) AS terakhir
        FROM p
       GROUP BY kunci, label
       ORDER BY n DESC, kunci, label
       LIMIT ${BATAS_TOP[jenis]}
    ), r AS (
      SELECT p.kunci, p.label, p.user_id, p.m, row_number() OVER (PARTITION BY p.kunci, p.label ORDER BY p.m DESC, p.user_id) AS i
        FROM p JOIN t ON t.kunci = p.kunci AND t.label = p.label
       WHERE p.user_id <> 0
    ), s AS (
      SELECT r.kunci, r.label,
             json_agg(json_build_object('userId', r.user_id, 'nama', COALESCE(NULLIF(u.nama, ''), u.email, 'Akun #' || r.user_id), 'n', r.m) ORDER BY r.i) AS siapa
        FROM r LEFT JOIN users u ON u.id = r.user_id
       WHERE r.i <= ${siapaN}
       GROUP BY r.kunci, r.label
    )
    SELECT t.kunci, t.label, t.n, t.pengguna, t.terakhir, COALESCE(s.siapa, '[]'::json) AS siapa
      FROM t LEFT JOIN s ON s.kunci = t.kunci AND s.label = t.label
     ORDER BY t.n DESC, t.kunci, t.label`;

  // Akun teratas (JSON, digabung ke users hanya untuk 20 baris itu); tidak dihitung dalam mode satu akun.
  const teratasAkun = satuAkun
    ? sql`NULL::json`
    : sql`(SELECT json_agg(json_build_object('userId', p.user_id, 'email', u.email, 'nama', NULLIF(u.nama, ''), 'peran', u.peran,
                                              'halaman', p.h, 'klik', p.k, 'fitur', p.f, 'hariAktif', p.hari, 'terakhir', p.w)
                            ORDER BY p.s DESC, p.user_id)
             FROM (SELECT user_id, COALESCE(SUM(h), 0) AS h, COALESCE(SUM(k), 0) AS k, COALESCE(SUM(f), 0) AS f,
                          COUNT(*) AS hari, MAX(w) AS w, SUM(s) AS s
                     FROM d WHERE user_id <> 0
                    GROUP BY user_id ORDER BY s DESC, user_id LIMIT ${PENGGUNA_N}) p
             LEFT JOIN users u ON u.id = p.user_id)`;

  type Jumlah = { halaman: number; klik: number; fitur: number; pengguna: number; anonim: number };
  // "Sedang online": akun dengan aktivitas tercatat ONLINE_DETIK terakhir (baris hari ini & kemarin, lewat indeks tanggal).
  const detikKini = detikSah(f.kini);
  const [[kini], [lalu], halaman, klik, fitur, [online]] = await Promise.all([
    sql<{ harian: TitikAnalitik[]; jumlah: Jumlah; pengguna: PenggunaAktif[] | null }[]>`
      WITH d AS MATERIALIZED (
        SELECT tanggal, user_id, SUM(n) FILTER (WHERE jenis = 0) AS h, SUM(n) FILTER (WHERE jenis = 1) AS k,
               SUM(n) FILTER (WHERE jenis = 2) AS f, SUM(n) AS s, MAX(terakhir) AS w
          FROM analitik_harian
         WHERE tanggal BETWEEN ${awal}::date AND ${akhir}::date ${saring}
         GROUP BY tanggal, user_id
      ), x AS (
        SELECT tanggal, COUNT(*) FILTER (WHERE user_id <> 0) AS aktif, SUM(h) FILTER (WHERE user_id <> 0) AS h,
               SUM(k) FILTER (WHERE user_id <> 0) AS k, SUM(f) FILTER (WHERE user_id <> 0) AS f, SUM(h) FILTER (WHERE user_id = 0) AS a
          FROM d GROUP BY tanggal
      )
      SELECT
        -- Satu titik per hari; hari tanpa data diisi nol oleh generate_series.
        (SELECT json_agg(json_build_object('tanggal', to_char(g.t, 'YYYY-MM-DD'), 'aktif', COALESCE(x.aktif, 0), 'halaman', COALESCE(x.h, 0),
                                           'klik', COALESCE(x.k, 0), 'fitur', COALESCE(x.f, 0)) ORDER BY g.t)
           FROM generate_series(${awal}::date, ${akhir}::date, interval '1 day') AS g(t)
           LEFT JOIN x ON x.tanggal = g.t::date) AS harian,
        (SELECT json_build_object('halaman', COALESCE(SUM(h), 0), 'klik', COALESCE(SUM(k), 0), 'fitur', COALESCE(SUM(f), 0),
                                  'anonim', COALESCE(SUM(a), 0), 'pengguna', (SELECT COUNT(DISTINCT user_id) FROM d WHERE user_id <> 0))
           FROM x) AS jumlah,
        ${teratasAkun} AS pengguna`,
    sql<Jumlah[]>`
      SELECT COALESCE(SUM(h) FILTER (WHERE user_id <> 0), 0)::bigint AS halaman, COALESCE(SUM(k) FILTER (WHERE user_id <> 0), 0)::bigint AS klik,
             COALESCE(SUM(f) FILTER (WHERE user_id <> 0), 0)::bigint AS fitur, COUNT(*) FILTER (WHERE user_id <> 0) AS pengguna,
             COALESCE(SUM(h) FILTER (WHERE user_id = 0), 0)::bigint AS anonim
        FROM (SELECT user_id, SUM(n) FILTER (WHERE jenis = 0) AS h, SUM(n) FILTER (WHERE jenis = 1) AS k, SUM(n) FILTER (WHERE jenis = 2) AS f
                FROM analitik_harian
               WHERE tanggal BETWEEN ${awalLalu}::date AND ${akhirLalu}::date ${saring}
               GROUP BY user_id) p`,
    teratas(JENIS.halaman),
    teratas(JENIS.klik),
    teratas(JENIS.fitur),
    sql<{ n: number }[]>`
      SELECT COUNT(DISTINCT user_id) AS n
        FROM analitik_harian
       WHERE tanggal >= ${geserTanggal(akhir, -1)}::date AND terakhir >= ${detikKini - ONLINE_DETIK} AND user_id <> 0 ${saring}`,
  ]);

  const baris = (r: readonly BarisTop[]): BarisTop[] =>
    r.map((b) => ({ kunci: b.kunci, label: b.label, n: b.n, pengguna: b.pengguna, terakhir: b.terakhir, siapa: b.siapa }));
  const k = kini.jumlah;
  return {
    hari: kini.harian.map((h) => h.tanggal),
    total: {
      halaman: { kini: k.halaman, lalu: lalu.halaman },
      klik: { kini: k.klik, lalu: lalu.klik },
      fitur: { kini: k.fitur, lalu: lalu.fitur },
      pengguna: { kini: k.pengguna, lalu: lalu.pengguna },
      anonim: { kini: k.anonim, lalu: lalu.anonim },
    },
    harian: kini.harian,
    halaman: baris(halaman),
    klik: baris(klik),
    fitur: baris(fitur),
    pengguna: kini.pengguna ?? [],
    online: online?.n ?? 0,
  };
}

// ---------- Rincian "siapa saja" untuk satu butir ----------

export interface PenggunaRinci {
  userId: number;
  email: string | null;
  nama: string | null;
  peran: string | null;
  n: number;
  hariAktif: number;
  terakhir: number;
}
export interface RincianAnalitik {
  /** Total kejadian pada periode (akun + anonim). */
  n: number;
  /** Akun unik yang melakukannya (tanpa anonim). */
  pengguna: number;
  /** Kejadian oleh pengunjung yang belum login. */
  anonim: number;
  /** Akun yang melakukannya, terbanyak dulu (maks. RINCIAN_N). */
  daftar: PenggunaRinci[];
  /** true bila akunnya lebih dari RINCIAN_N (daftar dipotong). */
  terpotong: boolean;
}

/**
 * "Siapa saja" untuk satu butir daftar teratas: semua akun yang membuka halaman (jenis 0), mengeklik label di halaman
 * itu (jenis 1), atau memakai fitur (jenis 2) pada periode `f.hari`, dengan jumlah, hari aktif, dan waktu terakhir.
 * Satu query lewat primary key (jenis, tanggal, kunci, label, user_id); total & jumlah akun dihitung window function
 * di query yang sama, users digabung hanya untuk baris yang dikembalikan. Aturan admin & periode = ringkasanAnalitik.
 */
export async function rincianAnalitik(f: FilterAnalitik & { jenis: Jenis; kunci: string; label?: string }): Promise<RincianAnalitik> {
  const { akhir, awal } = periode(f);
  const sql = await db();
  const saring = f.sertakanAdmin ? sql`` : sql`AND user_id NOT IN (SELECT id FROM users WHERE peran <> 'user')`;
  const baris = await sql<(PenggunaRinci & { total: number; akun: number })[]>`
    SELECT p.user_id AS "userId", u.email, NULLIF(u.nama, '') AS nama, u.peran, p.m AS n, p.hari AS "hariAktif", p.w AS terakhir,
           (SUM(p.m) OVER ())::bigint AS total, COUNT(*) FILTER (WHERE p.user_id <> 0) OVER () AS akun
      FROM (SELECT user_id, SUM(n)::bigint AS m, COUNT(*) AS hari, MAX(terakhir) AS w
              FROM analitik_harian
             WHERE jenis = ${f.jenis} AND tanggal BETWEEN ${awal}::date AND ${akhir}::date
               AND kunci = ${f.kunci} AND label = ${f.label ?? ""} ${saring}
             GROUP BY user_id) p
      LEFT JOIN users u ON u.id = p.user_id
     ORDER BY (p.user_id = 0) DESC, p.m DESC, p.user_id
     LIMIT ${RINCIAN_N + 2}`;
  const akun = baris.filter((b) => b.userId !== 0);
  return {
    n: baris[0]?.total ?? 0,
    pengguna: baris[0]?.akun ?? 0,
    anonim: baris.find((b) => b.userId === 0)?.n ?? 0,
    daftar: akun.slice(0, RINCIAN_N).map((b) => ({ userId: b.userId, email: b.email, nama: b.nama, peran: b.peran, n: b.n, hariAktif: b.hariAktif, terakhir: b.terakhir })),
    terpotong: akun.length > RINCIAN_N,
  };
}
