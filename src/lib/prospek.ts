import "server-only";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { db, sekarang } from "./db";
import { embed, mlSiap } from "./ml/embed";
import { fiturBoleh } from "./mesin/lisensi";
import {
  AMBANG_AWAL,
  AMBANG_BANGUN,
  type Bank,
  DIM,
  type HasilKnn,
  type Kepala,
  LABEL,
  type Label,
  bankKosong,
  gabungPeluang,
  idLabel,
  kodeVektor,
  nilaiKepala,
  nilaiKnn,
  peluangLewati,
  tambahKeBank,
} from "./prospek-def";

/**
 * Penyaring prospek: machine learning yang belajar sendiri dari pengalaman (tanpa penandaan manual).
 *
 * Pembagian tugas:
 *   - AI utama (Hermes/Claude) tetap satu-satunya yang menjawab pelanggan. Di tiap jawabannya ia juga memberi label
 *     tersembunyi (prospek / netral / selesai / bukan, prospek-def.ts) tanpa panggilan AI tambahan. Label inilah
 *     "guru" bagi ML, dan yang memutuskan strike & pembisuan sejak hari pertama.
 *   - ML lokal (embed.ts + kNN di prospek-def.ts) menilai pesan dalam ±6 ms tanpa biaya. Tugasnya menghemat panggilan
 *     AI di tempat yang aman: pesan di chat yang sudah dibisukan, dan ucapan penutup ("ok makasih") yang tidak perlu
 *     dijawab. ML juga membandingkan pesan dengan knowledge nomor itu (ksim): pesan yang mirip isi knowledge
 *     tidak pernah dilewati.
 *
 * Bekal awal (ml/latih.mjs): kepala klasifikasi yang dilatih pada ratusan kasus chat WA berbagai usaha + MASSIVE id-ID
 * (ml/kepala.json), dan contoh-contoh yang sama sebagai benih kNN (ml/benih.bin). Penilaian = campuran kepala dan kNN
 * (benih + pengalaman nomor itu); bobot campuran, tau, dan ambang dipilih saat pelatihan pada data uji terpisah.
 *
 * Belajar dari pengalaman (semua otomatis, ml_contoh):
 *   1. label AI utama di setiap giliran (sumber 1);
 *   2. hasil nyata: giliran yang berujung pengiriman katalog (sumber 2, bobot lebih);
 *   3. kesalahan: chat yang dibisukan tetapi kemudian dibalas pemilik sendiri, atau audit yang membuktikan ML keliru
 *      (sumber 3, bobot terbesar).
 *   Contoh baru langsung dipakai (kNN tidak perlu dilatih ulang). Tiap malam setiap nomor diuji leave-one-out pada
 *   pengalamannya sendiri: ambang disetel ulang, dan ML baru boleh melewati pesan ("aktif") bila presisinya terbukti
 *   >= PRESISI_MINIMUM. Sebelum itu ML "magang": hanya mengamati, semua keputusan oleh AI utama. Saat aktif, sebagian
 *   kecil keputusan ML tetap diaudit AI utama; audit yang buruk langsung mengembalikannya ke magang.
 */

const PRESISI_MINIMUM = 0.97;
const MIN_CONTOH_AKTIF = 100;
const MIN_LEWATI_DIUJI = 20;
/** Peluang sebuah keputusan "lewati" ML tetap dicek AI utama saat ML aktif. */
export const PELUANG_AUDIT = Number(process.env.ML_PELUANG_AUDIT ?? 0.1);
const AUDIT_JENDELA = 30;
const AUDIT_PRESISI_DARURAT = 0.9;
const MAKS_CONTOH_MEMORI = 800;
const MAKS_CONTOH_SIMPAN = 1_500;
const MAKS_CONTOH_UJI = 600;
const MAKS_SEGMEN_KNOWLEDGE = 3_000;
const MAKS_NOMOR_MEMORI = 60;
/** Ambang kemiripan knowledge bawaan sebelum disetel dari pengalaman nomor itu (terukur pada knowledge Suka Shawarma). */
export const KAPPA_AWAL = 0.84;
const SEGAR_KNOWLEDGE_MS = 5 * 60_000;
/** Bobot contoh per sumber; benih dataset publik = 1. */
export const BOBOT = { ai: 2, hasil: 3, koreksi: 5 } as const;
const SUMBER = { ai: 1, hasil: 2, koreksi: 3 } as const;
export type SumberContoh = keyof typeof SUMBER;

export interface SetelanMl {
  aktif: boolean;
  ambang: number;
  kappa: number | null;
}

export interface Penilaian {
  kode: Buffer;
  /** Campuran kepala terlatih + kNN (benih & pengalaman nomor ini). */
  hasil: HasilKnn;
  /** Kemiripan tertinggi dengan potongan knowledge nomor ini; null bila nomor belum punya knowledge. */
  ksim: number | null;
}

interface DataNomor {
  contoh: Bank;
  pengetahuan: Bank;
  versiKnowledge: string;
  dicekKnowledge: number;
  mengindeks: boolean;
  setelan: SetelanMl;
  audit: boolean[];
  dipakai: number;
}

interface Setelan {
  kepala: Kepala | null;
  campur: number;
  tau: number;
  ambang: number;
}

interface Keadaan {
  benih: Bank | null;
  model: Setelan | null;
  nomor: Map<number, Promise<DataNomor>>;
  tulis: Promise<void>;
  latihMalam: ReturnType<typeof setInterval> | null;
  terakhirLatih: string;
}

const g = globalThis as unknown as { __waProspek?: Keadaan };
const st: Keadaan = (g.__waProspek ??= { benih: null, model: null, nomor: new Map(), tulis: Promise.resolve(), latihMalam: null, terakhirLatih: "" });

function tulisLatar(kerja: () => Promise<unknown>): void {
  st.tulis = st.tulis.then(kerja).then(
    () => {},
    (e) => console.error("[prospek] gagal menulis:", e instanceof Error ? e.message : e)
  );
}

/** Selesai setelah semua tulisan latar modul ini tuntas (dipakai uji). */
export const tulisProspekTuntas = (): Promise<void> => st.tulis;

// ---------- Bekal awal: benih kNN (ml/benih.bin) & kepala terlatih (ml/kepala.json) ----------
// Jalur tetap (tanpa env) supaya pelacak berkas build hanya membawa berkas ini, bukan seluruh proyek.

function benih(): Bank {
  if (st.benih) return st.benih;
  const berkas = path.join(process.cwd(), "ml", "benih.bin");
  if (!existsSync(berkas)) return (st.benih = bankKosong(0));
  const b = readFileSync(berkas);
  // WAB1: label saja (bobot 1). WAB2: label lalu bobot per contoh (ml/latih.mjs).
  const versi = b.toString("ascii", 0, 4);
  if (versi !== "WAB1" && versi !== "WAB2") throw new Error(`format benih tidak dikenal: ${berkas}`);
  const n = b.readUInt32LE(4);
  const awal = 8 + n * (versi === "WAB2" ? 2 : 1);
  const bank = bankKosong(n);
  const ukuran = 4 + DIM;
  for (let i = 0; i < n; i++) tambahKeBank(bank, b.subarray(awal + i * ukuran, awal + (i + 1) * ukuran), b[8 + i], versi === "WAB2" ? b[8 + n + i] : 1);
  return (st.benih = bank);
}

function model(): Setelan {
  if (st.model) return st.model;
  const berkas = path.join(process.cwd(), "ml", "kepala.json");
  if (!existsSync(berkas)) return (st.model = { kepala: null, campur: 0, tau: 0.03, ambang: AMBANG_AWAL });
  const j = JSON.parse(readFileSync(berkas, "utf8")) as { dim: number; label: string[]; W: number[]; b: number[]; campur: number; tau: number; ambang: number };
  if (j.dim !== DIM || j.label.join() !== LABEL.join() || j.W.length !== 4 * DIM) throw new Error("ml/kepala.json tidak cocok dengan model embedding");
  return (st.model = { kepala: { W: Float32Array.from(j.W), b: Float32Array.from(j.b) }, campur: j.campur, tau: j.tau, ambang: j.ambang });
}

/** Peluang per label untuk satu vektor: campuran kepala terlatih + kNN atas bank yang diberikan. */
function nilaiVektor(v: Float32Array, bank: Bank[], lewati?: (b: number, i: number) => boolean): HasilKnn {
  const m = model();
  const knn = nilaiKnn(v, bank, { tau: m.tau, lewati });
  if (!m.kepala) return knn;
  const p = gabungPeluang(nilaiKepala(v, m.kepala), knn.p, m.campur);
  let t = 0;
  for (let k = 1; k < 4; k++) if (p[k] > p[t]) t = k;
  return { p, label: LABEL[t], simMaks: knn.simMaks };
}

// ---------- Data per nomor (pengalaman + knowledge), dimuat malas & dibuang bila lama tak dipakai ----------

const setelanBawaan = (): SetelanMl => ({ aktif: false, ambang: model().ambang, kappa: null });

async function muatNomor(numberId: number): Promise<DataNomor> {
  const sql = await db();
  const [contoh, [s]] = await Promise.all([
    sql<{ label: number; bobot: number; vektor: Buffer }[]>`
      SELECT label, bobot, vektor FROM ml_contoh WHERE number_id = ${numberId} ORDER BY id DESC LIMIT ${MAKS_CONTOH_MEMORI}`,
    sql<{ aktif: boolean; ambang: number; kappa: number | null }[]>`SELECT aktif, ambang, kappa FROM ml_nomor WHERE number_id = ${numberId}`,
  ]);
  const bank = bankKosong(MAKS_CONTOH_MEMORI);
  for (const c of contoh) tambahKeBank(bank, c.vektor, c.label, c.bobot);
  return {
    contoh: bank,
    pengetahuan: bankKosong(0),
    versiKnowledge: "",
    dicekKnowledge: 0,
    mengindeks: false,
    setelan: s ? { aktif: s.aktif, ambang: s.ambang, kappa: s.kappa } : setelanBawaan(),
    audit: [],
    dipakai: Date.now(),
  };
}

async function dataNomor(numberId: number): Promise<DataNomor> {
  let j = st.nomor.get(numberId);
  if (!j) {
    j = muatNomor(numberId).catch((e) => {
      st.nomor.delete(numberId);
      throw e;
    });
    st.nomor.set(numberId, j);
    if (st.nomor.size > MAKS_NOMOR_MEMORI) {
      // Buang yang paling lama tidak dipakai (datanya tetap di database).
      const semua = await Promise.all([...st.nomor].map(async ([id, p]) => [id, (await p.catch(() => null))?.dipakai ?? 0] as const));
      const [tertua] = semua.filter(([id]) => id !== numberId).sort((a, b) => a[1] - b[1])[0] ?? [];
      if (tertua !== undefined) st.nomor.delete(tertua);
    }
  }
  const d = await j;
  d.dipakai = Date.now();
  return d;
}

/** Potongan knowledge -> segmen pendek (e5 membaca maks 128 token; satu baris knowledge biasanya satu fakta). */
export function segmenKnowledge(isi: string): string[] {
  const hasil: string[] = [];
  for (const baris of isi.split(/\n+/)) {
    const b = baris.replace(/\s+/g, " ").trim();
    if (b.length < 15) continue;
    for (let i = 0; i < b.length; i += 280) hasil.push(b.slice(i, i + 300));
  }
  return hasil;
}

/**
 * Pastikan vektor knowledge nomor ini mutakhir. Versi dicek paling sering tiap SEGAR_KNOWLEDGE_MS lewat indeks
 * chunks_number_idx. Potongan yang belum punya vektor di-embed di latar satu per satu (pesan pelanggan tetap
 * didahulukan karena antrean mesin bergiliran) lalu disimpan, jadi setelah restart cukup dibaca.
 */
async function segarkanKnowledge(numberId: number, d: DataNomor): Promise<void> {
  if (Date.now() - d.dicekKnowledge < SEGAR_KNOWLEDGE_MS || d.mengindeks) return;
  d.dicekKnowledge = Date.now();
  const sql = await db();
  const [v] = await sql<{ n: number; maks: number | null; jumlah: number | null }[]>`
    SELECT COUNT(*)::int AS n, MAX(id) AS maks, SUM(id)::float8 AS jumlah FROM chunks WHERE number_id = ${numberId}`;
  const versi = `${v.n}:${v.maks}:${v.jumlah}`;
  if (versi === d.versiKnowledge) return;
  d.mengindeks = true;
  try {
    const baris = await sql<{ id: number; isi: string; vektor: Buffer | null }[]>`
      SELECT c.id, c.isi, p.vektor FROM chunks c LEFT JOIN ml_potongan p ON p.chunk_id = c.id
       WHERE c.number_id = ${numberId} ORDER BY c.id`;
    const ukuran = 4 + DIM;
    const bank = bankKosong(MAKS_SEGMEN_KNOWLEDGE);
    const isiBank = (kode: Buffer) => {
      for (let o = 0; o + ukuran <= kode.length; o += ukuran) tambahKeBank(bank, kode.subarray(o, o + ukuran), 0, 1);
    };
    for (const b of baris) if (b.vektor) isiBank(b.vektor);
    d.pengetahuan = bank;
    for (const b of baris) {
      if (b.vektor || bank.n >= MAKS_SEGMEN_KNOWLEDGE) continue;
      const kode: Buffer[] = [];
      for (const s of segmenKnowledge(b.isi)) {
        const vek = await embed(s, "passage");
        if (!vek) return; // mesin tidak tersedia: coba lagi nanti
        kode.push(kodeVektor(vek));
      }
      const gabung = Buffer.concat(kode);
      isiBank(gabung);
      // Potongan bisa saja sudah dihapus selagi di-embed: sisipan yang melanggar FK diabaikan.
      tulisLatar(async () => {
        const s2 = await db();
        await s2`INSERT INTO ml_potongan(chunk_id, vektor) SELECT ${b.id}, ${gabung} WHERE EXISTS (SELECT 1 FROM chunks WHERE id = ${b.id}) ON CONFLICT (chunk_id) DO NOTHING`;
      });
    }
    d.versiKnowledge = versi;
  } finally {
    d.mengindeks = false;
  }
}

function ksimMaks(v: Float32Array, bank: Bank): number | null {
  if (!bank.n) return null;
  let maks = -1;
  for (let i = 0; i < bank.n; i++) {
    let s = 0;
    const off = i * DIM;
    for (let j = 0; j < DIM; j++) s += bank.vek[off + j] * v[j];
    s *= bank.skala[i];
    if (s > maks) maks = s;
  }
  return maks;
}

// ---------- Penilaian ----------

/** Nilai satu pesan untuk nomor ini. null = ML tidak tersedia (penyaring jalan dengan AI utama saja). */
export async function nilaiPesan(numberId: number, teks: string): Promise<Penilaian | null> {
  try {
    const v = await embed(teks);
    if (!v) return null;
    const d = await dataNomor(numberId);
    void segarkanKnowledge(numberId, d).catch((e) => console.warn(`[prospek] knowledge nomor ${numberId} gagal diindeks: ${e instanceof Error ? e.message : e}`));
    return { kode: kodeVektor(v), hasil: nilaiVektor(v, [benih(), d.contoh]), ksim: ksimMaks(v, d.pengetahuan) };
  } catch (e) {
    console.warn(`[prospek] penilaian gagal: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

export async function setelanMl(numberId: number): Promise<SetelanMl> {
  try {
    return (await dataNomor(numberId)).setelan;
  } catch {
    return setelanBawaan();
  }
}

const kappa = (s: SetelanMl): number => s.kappa ?? KAPPA_AWAL;

/** ML yakin pesan ini boleh dilewati tanpa jawaban (hanya berlaku saat ML aktif). Mirip knowledge = tidak pernah. */
export const yakinLewati = (p: Penilaian, s: SetelanMl): boolean => s.aktif && peluangLewati(p.hasil) >= s.ambang && (p.ksim === null || p.ksim < kappa(s));

/** Pesan di chat yang dibisukan layak dicek AI utama: ML melihat minat, atau pesannya mirip isi knowledge. */
export const layakDicek = (p: Penilaian, s: SetelanMl): boolean => p.hasil.p[0] >= AMBANG_BANGUN || (p.ksim !== null && p.ksim >= kappa(s));

// ---------- Belajar dari pengalaman ----------

/** Simpan satu pengalaman berlabel: langsung dipakai di memori, ditulis ke database di latar. */
export function catatPengalaman(numberId: number, p: Penilaian, label: Label, sumber: SumberContoh): void {
  const bobot = BOBOT[sumber];
  const id = idLabel(label);
  void dataNomor(numberId)
    .then((d) => {
      const b = d.contoh;
      if (b.n >= MAKS_CONTOH_MEMORI) {
        // Penuh: geser (contoh tertua keluar dari memori; di database tetap ada sampai dipangkas).
        b.vek.copyWithin(0, DIM);
        b.skala.copyWithin(0, 1);
        b.label.copyWithin(0, 1);
        b.bobot.copyWithin(0, 1);
        b.n -= 1;
      }
      tambahKeBank(b, p.kode, id, bobot);
    })
    .catch(() => {});
  const prediksi = idLabel(p.hasil.label);
  const pl = peluangLewati(p.hasil);
  tulisLatar(async () => {
    const sql = await db();
    await sql`
      INSERT INTO ml_contoh(number_id, label, sumber, bobot, ksim, prediksi, p_lewati, vektor, waktu)
      VALUES (${numberId}, ${id}, ${SUMBER[sumber]}, ${bobot}, ${p.ksim}, ${prediksi}, ${pl}, ${p.kode}, ${sekarang()})`;
  });
}

export type KolomHitung = "dihemat" | "diaudit" | "audit_benar" | "dibisukan" | "salah_bisu";

export function hitung(numberId: number, kolom: KolomHitung): void {
  tulisLatar(async () => {
    const sql = await db();
    const k = sql(kolom);
    await sql`INSERT INTO ml_nomor(number_id, ${k}) VALUES (${numberId}, 1) ON CONFLICT (number_id) DO UPDATE SET ${k} = ml_nomor.${k} + 1`;
  });
}

/**
 * Hasil satu audit (keputusan "lewati" ML yang tetap dicek AI utama). Bila dalam AUDIT_JENDELA audit terakhir
 * presisinya jatuh di bawah AUDIT_PRESISI_DARURAT, ML langsung kembali magang sampai lolos ujian malam berikutnya.
 */
export function catatAudit(numberId: number, benar: boolean): void {
  hitung(numberId, "diaudit");
  if (benar) hitung(numberId, "audit_benar");
  void dataNomor(numberId)
    .then((d) => {
      d.audit.push(benar);
      if (d.audit.length > AUDIT_JENDELA) d.audit.shift();
      const salah = d.audit.filter((x) => !x).length;
      if (d.setelan.aktif && d.audit.length >= 10 && 1 - salah / d.audit.length < AUDIT_PRESISI_DARURAT) {
        d.setelan = { ...d.setelan, aktif: false };
        d.audit = [];
        console.warn(`[prospek] audit nomor ${numberId}: ML terlalu sering keliru, kembali ke mode magang`);
        tulisLatar(async () => {
          const sql = await db();
          await sql`UPDATE ml_nomor SET aktif = false WHERE number_id = ${numberId}`;
        });
      }
    })
    .catch(() => {});
}

// ---------- Ujian & penyetelan tiap malam ----------

export interface HasilUjian {
  contoh: number;
  aktif: boolean;
  ambang: number;
  kappa: number | null;
  presisi: number | null;
  lewati: number;
}

const jeda = () => new Promise((r) => setImmediate(r));

/**
 * Uji ML nomor ini pada pengalamannya sendiri (leave-one-out: tiap contoh dinilai oleh semua contoh LAIN + benih),
 * lalu pilih ambang terendah yang presisi "lewati"-nya >= PRESISI_MINIMUM. Keputusan lewati dianggap benar bila AI
 * utama/hasil nyata memang menilai pesan itu selesai atau bukan prospek. Kappa = persentil-10 ksim pesan prospek.
 * Dijalankan bertahap (memberi giliran ke event loop) supaya WhatsApp tidak tersendat.
 */
export async function ujiNomor(numberId: number): Promise<HasilUjian> {
  const sql = await db();
  // Pangkas dulu: simpan MAKS_CONTOH_SIMPAN pengalaman terbaru per nomor.
  await sql`
    DELETE FROM ml_contoh WHERE number_id = ${numberId}
       AND id < (SELECT id FROM ml_contoh WHERE number_id = ${numberId} ORDER BY id DESC OFFSET ${MAKS_CONTOH_SIMPAN - 1} LIMIT 1)`;
  const baris = await sql<{ label: number; bobot: number; ksim: number | null; vektor: Buffer }[]>`
    SELECT label, bobot, ksim, vektor FROM ml_contoh WHERE number_id = ${numberId} ORDER BY id DESC LIMIT ${MAKS_CONTOH_SIMPAN}`;
  const bank = bankKosong(baris.length);
  for (const b of baris) tambahKeBank(bank, b.vektor, b.label, b.bobot);

  const ksimProspek = baris.filter((b) => b.label === 0 && b.ksim !== null).map((b) => b.ksim!).sort((a, b) => a - b);
  const kappaBaru = ksimProspek.length >= 20 ? ksimProspek[Math.floor(ksimProspek.length * 0.1)] : null;
  const kap = kappaBaru ?? KAPPA_AWAL;

  const uji = Math.min(baris.length, MAKS_CONTOH_UJI);
  const pl: number[] = [];
  const v = new Float32Array(DIM);
  for (let i = 0; i < uji; i++) {
    const s = bank.skala[i];
    for (let j = 0; j < DIM; j++) v[j] = bank.vek[i * DIM + j] * s;
    const h = nilaiVektor(v, [benih(), bank], (b, k) => b === 1 && k === i);
    const ks = baris[i].ksim;
    pl.push(ks !== null && ks >= kap ? 0 : peluangLewati(h));
    if (i % 25 === 24) await jeda();
  }

  let terpilih: { ambang: number; presisi: number; lewati: number } | null = null;
  for (let a = 0.8; a <= 0.981; a += 0.02) {
    let lewati = 0;
    let benar = 0;
    for (let i = 0; i < uji; i++)
      if (pl[i] >= a) {
        lewati += 1;
        if (baris[i].label >= 2) benar += 1;
      }
    const presisi = lewati ? benar / lewati : 0;
    if (lewati >= MIN_LEWATI_DIUJI && presisi >= PRESISI_MINIMUM) {
      terpilih = { ambang: Math.round(a * 100) / 100, presisi, lewati };
      break;
    }
  }
  const aktif = !!terpilih && baris.length >= MIN_CONTOH_AKTIF;
  const hasil: HasilUjian = {
    contoh: baris.length,
    aktif,
    ambang: terpilih?.ambang ?? model().ambang,
    kappa: kappaBaru,
    presisi: terpilih?.presisi ?? null,
    lewati: terpilih?.lewati ?? 0,
  };
  await sql`
    INSERT INTO ml_nomor(number_id, aktif, ambang, kappa, presisi, diuji, dilatih)
    VALUES (${numberId}, ${hasil.aktif}, ${hasil.ambang}, ${hasil.kappa}, ${hasil.presisi}, ${uji}, ${sekarang()})
    ON CONFLICT (number_id) DO UPDATE SET aktif = EXCLUDED.aktif, ambang = EXCLUDED.ambang, kappa = EXCLUDED.kappa,
      presisi = EXCLUDED.presisi, diuji = EXCLUDED.diuji, dilatih = EXCLUDED.dilatih`;
  const d = st.nomor.get(numberId);
  if (d) {
    const dn = await d.catch(() => null);
    if (dn) {
      dn.setelan = { aktif: hasil.aktif, ambang: hasil.ambang, kappa: hasil.kappa };
      dn.audit = [];
    }
  }
  return hasil;
}

/** Ujian semua nomor yang penyaringnya aktif dan punya pengalaman, satu per satu. */
export async function ujiSemua(): Promise<void> {
  if (!fiturBoleh("ml") || !(await mlSiap())) return;
  const sql = await db();
  const nomor = await sql<{ id: number }[]>`
    SELECT n.id FROM numbers n WHERE n.saring_prospek AND EXISTS (SELECT 1 FROM ml_contoh c WHERE c.number_id = n.id)`;
  for (const { id } of nomor) {
    try {
      const h = await ujiNomor(id);
      console.info(`[prospek] ujian nomor ${id}: ${h.contoh} pengalaman, ${h.aktif ? `AKTIF (ambang ${h.ambang}, presisi ${((h.presisi ?? 0) * 100).toFixed(1)}% pada ${h.lewati} keputusan)` : "magang"}`);
    } catch (e) {
      console.error(`[prospek] ujian nomor ${id} gagal:`, e instanceof Error ? e.message : e);
    }
  }
}

/** Ujian tiap malam pukul 02.00 WIB (dicek tiap 15 menit), dan model dipanaskan di latar sejak server mulai. */
export function mulaiPenyaringProspek(): void {
  if (st.latihMalam) return;
  setTimeout(() => void mlSiap(), 5_000).unref?.();
  const cek = () => {
    const wib = new Date(Date.now() + 7 * 3600_000);
    const hari = wib.toISOString().slice(0, 10);
    if (wib.getUTCHours() === 2 && st.terakhirLatih !== hari) {
      st.terakhirLatih = hari;
      void ujiSemua().catch((e) => console.error("[prospek] ujian malam gagal:", e));
    }
  };
  st.latihMalam = setInterval(cek, 15 * 60_000);
  st.latihMalam.unref?.();
}

// ---------- Untuk dashboard ----------

export interface StatusMl {
  aktif: boolean;
  presisi: number | null;
  pengalaman: number;
  dihemat: number;
  diaudit: number;
  audit_benar: number;
  dibisukan: number;
  salah_bisu: number;
  dilatih: number;
}

export async function statusMl(numberId: number): Promise<StatusMl> {
  const sql = await db();
  const [[s], [c]] = await Promise.all([
    sql<Omit<StatusMl, "pengalaman">[]>`
      SELECT aktif, presisi, dihemat, diaudit, audit_benar, dibisukan, salah_bisu, dilatih FROM ml_nomor WHERE number_id = ${numberId}`,
    sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM ml_contoh WHERE number_id = ${numberId}`,
  ]);
  const d = st.nomor.get(numberId);
  const aktifKini = d ? ((await d.catch(() => null))?.setelan.aktif ?? s?.aktif ?? false) : (s?.aktif ?? false);
  return {
    aktif: aktifKini,
    presisi: s?.presisi ?? null,
    pengalaman: c.n,
    dihemat: s?.dihemat ?? 0,
    diaudit: s?.diaudit ?? 0,
    audit_benar: s?.audit_benar ?? 0,
    dibisukan: s?.dibisukan ?? 0,
    salah_bisu: s?.salah_bisu ?? 0,
    dilatih: s?.dilatih ?? 0,
  };
}

