import "server-only";
import { createHash } from "node:crypto";
import { db, sekarang, setSetting } from "./db";
import { catatPakai, tanpaIngatan, tanyaAiTerjaga } from "./ai";
import { aiUntukAkun, catatBalasanLokal, sisaKuotaAi } from "./langganan";
import { susunSistem } from "./knowledge";
import { bisaTeruskan, teruskanKePemilik } from "./penerusan";
import type { TagTeruskan } from "./teruskan";
import { type Nomor, catatStat, catatTerhubung, nomorBySesi } from "./numbers";
import { catatPesan, chatDipercaya, riwayatUntukAi, tandaiSpam } from "./percakapan";
import { alasanSpam, periksaSpam } from "./spam";
import { pelajariBalasan } from "./pelajaran";
import { CATATAN_KODE_DIBLOKIR, TOLAK_KODE, adaKode } from "./penjaga";
import type { Foto } from "./types";
import type { WAMessage } from "baileys";
import { type EventWa, digitWa, kirimTeks, mengetik, padaEvent, tandaiDibaca } from "./wa";

/**
 * Jembatan WhatsApp (src/lib/wa.ts) -> Hermes -> WhatsApp.
 *
 * Serah-terima manusia <-> AI (per nomor; lihat numbers.tunggu_detik / tunggu_baca_detik / jeda_detik):
 *   1. Pesan pelanggan masuk -> AI menunggu `tunggu_detik`, dihitung dari pesan TERAKHIR pelanggan
 *      (pesan beruntun tergabung). Selama menunggu AI tidak menandai dibaca dan tidak "mengetik".
 *   2. Chat itu dibuka manusia di HP (pesan terbaca) sebelum jawaban AI terkirim -> AI langsung
 *      menahan diri selama `tunggu_baca_detik`. Jawaban yang sudah telanjur disusun disimpan.
 *      WhatsApp tidak memberi tahu perangkat tertaut bahwa pemilik sedang mengetik; "chat dibuka"
 *      adalah satu-satunya tanda yang tersedia bahwa manusia sedang menangani.
 *   3. Manusia mengirim balasan -> jawaban AI dibatalkan dan AI diam di chat itu selama `jeda_detik`
 *      (0 = hanya untuk pesan itu). Pesan pelanggan yang masuk selama itu tetap diantrekan: bila manusia
 *      tidak membalasnya sampai jeda habis, AI yang menjawab (tidak ada pesan pelanggan yang dibiarkan).
 *   4. Masa tunggu di (2) habis tanpa balasan manusia (tidak jadi membalas) -> AI mengambil alih.
 * Spam (src/lib/spam.ts): promosi judi yang jelas tidak diantrekan sama sekali; spam lain dinilai AI (tag <abaikan>).
 * Keduanya tidak berlaku di chat yang pernah dibalas manusia atau ditandai "bukan spam", dan bisa dimatikan per nomor.
 *   Pesan spam tetap tercatat di histori (dengan tanda spam) dan tidak ditandai dibaca, jadi pemilik tetap melihatnya.
 * Aturan anti-blokir: hanya membalas chat pribadi yang masuk, ada "mengetik", dibatasi per chat.
 *
 * Keadaan tiap chat (jeda, nomor sesi Hermes) dipegang di memori selama chat itu aktif
 * dan ditulis ke tabel chat_state di latar. Dengan begitu keputusan serah-terima tetap seketika
 * dan tidak bergantung pada perjalanan pulang-pergi ke database; database hanya dibaca sekali saat
 * sebuah chat mulai aktif (lagi), mis. setelah server dimulai ulang.
 */

const MIN_MENGETIK_MS = 1_200;
const UMUR_PESAN_MAKS_DTK = 120; // pesan lama (mis. menumpuk saat offline) tidak dijawab
const MAKS_PESAN_KARAKTER = 2_000;
const MAKS_CATATAN = 6;
const MAKS_BELUM_DIBACA = 30;
const MAKS_FOTO_GILIRAN = 3;
/**
 * AI gagal menjawab (mis. penyedia model kena batas laju): pesan dicoba lagi setelah tiap jeda ini,
 * lalu menyerah. Env AI_JEDA_ULANG_MS (mis. "15000,45000") menggantinya.
 */
const JEDA_ULANG_AI_MS = ((d) => (d.length ? d : [15_000, 45_000]))(
  (process.env.AI_JEDA_ULANG_MS ?? "").split(",").map(Number).filter((n) => Number.isFinite(n) && n > 0)
);

interface BarisChat {
  sesi_ke: number;
  last_at: number;
  jeda_sampai: number;
  jendela_awal: number;
  jendela_n: number;
}

interface Antrean {
  numberId: number;
  sesi: string;
  /** JID tujuan balasan (alamat pesan terakhir lawan bicara). */
  alamat: string;
  /** Baris chat_state chat ini; null = belum pernah ada. */
  chat: BarisChat | null;
  /** Pesan pelanggan yang belum dijawab. */
  teks: string[];
  /** Pengunduh foto pelanggan yang belum dijawab (paling banyak MAKS_FOTO_GILIRAN, yang terbaru). */
  foto: (() => Promise<Foto | null>)[];
  /** Id pesan pelanggan yang belum ditandai dibaca oleh bot. */
  belumDibaca: string[];
  /** Pesan pelanggan terakhir yang belum dijawab; balasan AI mengutipnya (reply). */
  kutip: WAMessage | null;
  timer: ReturnType<typeof setTimeout> | null;
  sedangProses: boolean;
  tungguMs: number;
  tungguBacaMs: number;
  /** Naik tiap manusia membuka chat / membalas; jawaban AI yang disiapkan sebelum itu tidak dikirim. */
  generasi: number;
  batalKarena: "dibaca" | "dibalas" | null;
  /** Pesan yang sedang menunggu sudah dibuka manusia di HP. */
  dibukaManusia: boolean;
  dibacaPada: number;
  /** Jawaban AI yang sudah jadi tetapi ditahan karena manusia membuka chat. */
  siap: string | null;
  /** Hal yang akan diteruskan ke pemilik bersama jawaban `siap` (dikirim hanya bila jawaban itu terkirim). */
  siapTeruskan: TagTeruskan | null;
  /** Nama & nomor pelanggan terakhir di chat ini, untuk pesan yang diteruskan ke pemilik. */
  namaPelanggan: string | null;
  teleponPelanggan: string | null;
  /** Hal yang terjadi di chat di luar pengetahuan AI; disertakan di giliran AI berikutnya. */
  catatan: string[];
  /** Tanda-baca yang dikirim bot sendiri bisa bergema sebagai event; diabaikan sampai waktu ini. */
  botBacaSampai: number;
  aktifSampai: number;
  kueriLalu: string;
  /** Berapa kali pesan yang sedang menunggu sudah gagal dijawab AI. */
  ulangAi: number;
  /** >0: giliran berikutnya adalah percobaan ulang setelah AI gagal, dijadwalkan sejauh ini. */
  jedaUlangMs: number;
}

interface Keadaan {
  terlihat: Map<string, number>;
  terkirim: Set<string>;
  antre: Map<string, Antrean>;
  /** Tulis ke database di latar, satu per satu sesuai urutan dibuatnya. */
  tulis: Promise<void>;
  hitung: number;
}

const g = globalThis as unknown as { __waBridge?: Keadaan };
const st = (g.__waBridge ??= { terlihat: new Map(), terkirim: new Set(), antre: new Map(), tulis: Promise.resolve(), hitung: 0 });

function ingat<T>(wadah: Map<T, number> | Set<T>, kunci: T, maks: number): void {
  if (wadah instanceof Map) wadah.set(kunci, Date.now());
  else wadah.add(kunci);
  if (wadah.size > maks) {
    const pertama = wadah.keys().next().value as T;
    wadah.delete(pertama);
  }
}

/** Antrekan satu tulis ke database tanpa menunggunya; kegagalan dicatat dan tidak menghentikan antrean. */
function tulisLatar(kerja: () => Promise<unknown>): void {
  st.tulis = st.tulis.then(kerja).then(
    () => {},
    (e) => console.error("[bridge] gagal menulis ke database:", e instanceof Error ? e.message : e)
  );
}

/** Selesai setelah semua tulis yang sudah diantrekan tuntas (dipakai uji). */
export function tulisTuntas(): Promise<void> {
  return st.tulis;
}

const kunciChat = (sesi: string, chat: string): string => createHash("sha256").update(`${sesi}|${chat}`).digest("hex").slice(0, 32);

function simpanChat(kunci: string, c: BarisChat): void {
  const b = { ...c };
  tulisLatar(async () => {
    const sql = await db();
    await sql`
      INSERT INTO chat_state(kunci, sesi_ke, last_at, jeda_sampai, jendela_awal, jendela_n)
      VALUES (${kunci}, ${b.sesi_ke}, ${b.last_at}, ${b.jeda_sampai}, ${b.jendela_awal}, ${b.jendela_n})
      ON CONFLICT (kunci) DO UPDATE SET sesi_ke = EXCLUDED.sesi_ke, last_at = EXCLUDED.last_at, jeda_sampai = EXCLUDED.jeda_sampai,
                                        jendela_awal = EXCLUDED.jendela_awal, jendela_n = EXCLUDED.jendela_n`;
  });
}

const sedangDijeda = (a: Antrean): boolean => (a.chat?.jeda_sampai ?? 0) > sekarang();
/** Sisa jeda chat ini dalam ms (0 bila tidak dijeda). */
const sisaJedaMs = (a: Antrean): number => Math.max(0, (a.chat?.jeda_sampai ?? 0) * 1000 - Date.now());

function jedaChat(kunci: string, a: Antrean, detik: number): void {
  const t = sekarang();
  a.chat = a.chat ? { ...a.chat, jeda_sampai: t + detik } : { sesi_ke: 1, last_at: t, jeda_sampai: t + detik, jendela_awal: 0, jendela_n: 0 };
  simpanChat(kunci, a.chat);
}

/**
 * Catat satu balasan; kembalikan nomor sesi Hermes. Tanpa batas jumlah balasan dan tanpa sesi baru karena diam
 * lama: AI membalas setiap pesan dan obrolan selalu dilanjutkan (nomor sesi tetap, 1 untuk chat baru).
 */
function ambilGiliran(kunci: string, a: Antrean): number {
  const t = sekarang();
  const b = a.chat;
  if (!b) {
    a.chat = { sesi_ke: 1, last_at: t, jeda_sampai: 0, jendela_awal: t, jendela_n: 1 };
    simpanChat(kunci, a.chat);
    return 1;
  }
  a.chat = { ...b, last_at: t };
  simpanChat(kunci, a.chat);
  return b.sesi_ke;
}

/** Rapikan keluaran model ke format WhatsApp. */
export function formatWa(teks: string): string {
  return teks
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1: $2")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 3500);
}

const tidur = (ms: number) => new Promise((r) => setTimeout(r, ms));

function jadwalkan(kunci: string, a: Antrean, ms: number): void {
  if (a.timer) clearTimeout(a.timer);
  a.timer = setTimeout(() => void proses(kunci), ms);
}

function catat(a: Antrean, isi: string): void {
  a.catatan.push(isi);
  if (a.catatan.length > MAKS_CATATAN) a.catatan.shift();
}

const kuotaDicatat = new Map<number, number>(); // pemilik -> kapan terakhir "kuota habis" ditulis ke log

/**
 * Kuota balasan AI pemilik nomor sudah habis? (paket langganan / kuota gratis bulanan; lihat langganan.ts)
 * Dibaca dari memori, disegarkan paling cepat tiap 60 dtk. Database tak terjangkau = jangan menahan AI.
 */
async function kuotaHabis(userId: number | null): Promise<boolean> {
  if (userId === null) return false;
  const sisa = await sisaKuotaAi(userId).catch(() => null);
  if (sisa === null || sisa > 0) return false;
  if (Date.now() - (kuotaDicatat.get(userId) ?? 0) > 3600_000) {
    kuotaDicatat.set(userId, Date.now());
    console.warn(`[bridge] kuota balasan AI pengguna ${userId} habis: AI diam sampai paket diperpanjang`);
  }
  return true;
}

function statistik(numberId: number, kolom: "masuk" | "dibalas" | "gagal"): void {
  tulisLatar(() => catatStat(numberId, kolom));
}

function galat(a: Antrean, e: unknown): void {
  statistik(a.numberId, "gagal");
  const nilai = JSON.stringify({ at: sekarang(), pesan: e instanceof Error ? e.message : String(e) });
  tulisLatar(() => setSetting("galat_terakhir", nilai));
}

async function proses(kunci: string): Promise<void> {
  const a = st.antre.get(kunci);
  if (!a || a.sedangProses || (!a.teks.length && !a.siap)) return;
  a.sedangProses = true;
  if (a.timer) clearTimeout(a.timer);
  a.timer = null;
  a.batalKarena = null;
  const generasi = a.generasi;
  try {
    let nomor: Nomor | undefined;
    try {
      nomor = await nomorBySesi(a.sesi);
    } catch (e) {
      galat(a, e);
      return; // database tidak terjangkau: pesan tetap di antrean dan dicoba lagi lewat blok finally
    }
    // Selagi menunggu di atas, manusia bisa saja sudah membalas (antrean dikosongkan).
    if (a.generasi !== generasi || (!a.teks.length && !a.siap)) return;
    // Manusia sedang memegang chat: pesan tetap menunggu dan dijawab setelah jeda habis (lihat blok finally).
    if (sedangDijeda(a)) return;
    if (!nomor || !nomor.bot_aktif || !nomor.pemilik_aktif || (await kuotaHabis(nomor.user_id))) {
      a.teks.length = 0;
      a.foto.length = 0;
      a.siap = null;
      return;
    }

    const mulai = Date.now();
    // Balasan mengutip pesan terakhir yang sedang dijawab (bukan pesan yang tiba selagi AI berpikir).
    const kutip = a.kutip;
    void mengetik(a.sesi, a.alamat, true);

    let jawaban: string;
    let tag: TagTeruskan | null = null;
    if (a.siap && !a.teks.length) {
      // Jawaban sudah disusun sebelum manusia membuka chat, dan ia tidak jadi membalas: kirim itu.
      jawaban = a.siap;
      tag = a.siapTeruskan;
      a.siap = null;
      a.siapTeruskan = null;
    } else {
      a.siap = null;
      a.siapTeruskan = null;
      const tertunda = a.teks.length;
      const sesiLalu = a.chat?.sesi_ke ?? 0;
      const asli = a.teks.splice(0);
      const pesan = asli.join("\n").slice(0, MAKS_PESAN_KARAKTER);
      const pemuatFoto: (() => Promise<Foto | null>)[] = a.foto.splice(0);
      const sesi = ambilGiliran(kunci, a);
      const catatan = a.catatan.splice(0);
      const kueri = `${a.kueriLalu}\n${pesan}`;
      a.kueriLalu = pesan;
      try {
        // Isi chat yang tidak dilihat AI (balasan manusia, pesan selagi AI diam) dibaca dari histori,
        // bersamaan dengan knowledge. Tulis histori yang masih antre ditunggu dulu supaya ikut terbaca.
        // Penyedia tanpa ingatan sesi (Claude API) diberi seluruh percakapan sesi ini, bukan hanya yang belum dilihat.
        // Penyedia ditentukan per akun (mode "per_paket": gratis = Hermes, berbayar = Claude API, cadangan Hermes).
        // Penyaring spam lewat AI hanya untuk chat yang belum dipercaya (lihat chatDipercaya); gagal membaca = jangan menyaring.
        const [ai, teruskan, saringSpam] = await Promise.all([
          aiUntukAkun(nomor.user_id),
          bisaTeruskan(nomor),
          nomor.saring_spam ? st.tulis.then(() => chatDipercaya(kunci)).then((p) => !p, () => false) : false,
        ]);
        const lengkap = tanpaIngatan(ai.penyedia);
        const riwayat = st.tulis.then(() => riwayatUntukAi(kunci, { sesiBaru: sesi !== sesiLalu, tertunda, lengkap }));
        // Foto baru diunduh sekarang (AI memang akan menjawab), bersamaan, langsung ke memori.
        const gambar = (await Promise.all(pemuatFoto.map((ambil) => ambil().catch(() => null)))).filter((f: Foto | null): f is Foto => !!f);
        const gagalFoto = pemuatFoto.length - gambar.length;
        const isiPesan = gagalFoto ? `${pesan}\n[${gagalFoto} foto gagal dimuat sehingga tidak bisa kamu lihat; minta pelanggan mengirim ulang bila perlu]` : pesan;
        const { sistem } = await susunSistem(nomor, kueri, { catatan, riwayat, adaFoto: gambar.length > 0, riwayatLengkap: lengkap, teruskan, saringSpam });
        // Sumber fakta untuk pemeriksa: pesan sistem + pesan pelanggan + seluruh chat sesi ini (Hermes hanya diberi
        // yang belum ia lihat, jadi sisanya dibaca terpisah supaya angka yang pernah disebut di chat tetap sah).
        const sumber = [sistem, isiPesan, ...(lengkap ? [] : await riwayatUntukAi(kunci, { sesiBaru: false, tertunda, lengkap: true }))].join("\n");
        const hasil = await tanyaAiTerjaga({ sessionId: `wa-${kunci.slice(0, 24)}-${sesi}`, sistem, pesan: isiPesan, gambar, paksa: { penyedia: ai.penyedia }, cadanganHermes: ai.cadanganHermes }, sumber, { teruskan, saringSpam });
        tulisLatar(() => catatPakai(a.numberId, hasil, gambar.length > 0, !!hasil.abaikan));
        if (hasil.abaikan) {
          // Dinilai spam oleh AI: tidak dibalas, tidak ditandai dibaca, tidak memotong kuota; pemilik melihatnya di histori.
          const alasan = `Dinilai AI: ${hasil.abaikan.jenis}${hasil.abaikan.alasan ? ` (${hasil.abaikan.alasan})` : ""}`;
          console.info(`[bridge] pesan tidak dibalas, ${alasan} sesi=${a.sesi}`);
          tulisLatar(() => tandaiSpam(kunci, alasan));
          void mengetik(a.sesi, a.alamat, false);
          a.belumDibaca.length = 0;
          a.kutip = null;
          return;
        }
        tag = teruskan ? hasil.teruskan : null;
        if (nomor.user_id !== null) catatBalasanLokal(nomor.user_id);
        if (hasil.pelanggaran.length) {
          console.warn(`[bridge] jawaban AI ditolak pemeriksa (${hasil.pelanggaran.map((p) => p.jenis).join(",")}) sesi=${a.sesi}${hasil.aman ? ", dikirim jawaban aman" : ", ditulis ulang"}`);
          // Hermes mengingat draf pertamanya sendiri: beri tahu jawaban yang benar-benar terkirim.
          if (!lengkap) catat(a, `Jawabanmu untuk pesan terakhir ditolak pemeriksa dan diganti dengan: "${hasil.teks.slice(0, 400)}". Anggap itulah yang kamu kirim.`);
        }
        const mentah = hasil.teks;
        if (adaKode(mentah)) {
          // Pengaman terakhir: kode program tidak pernah sampai ke WhatsApp, apa pun isi pesannya.
          console.warn(`[bridge] jawaban AI berisi kode, diganti penolakan sesi=${a.sesi}`);
          jawaban = TOLAK_KODE;
          catat(a, CATATAN_KODE_DIBLOKIR);
        } else jawaban = formatWa(mentah);
        if (!jawaban) throw new Error("AI mengirim jawaban kosong");
      } catch (e) {
        galat(a, e);
        void mengetik(a.sesi, a.alamat, false);
        // Pesan dikembalikan ke antrean dan dicoba lagi, kecuali manusia sudah mengambil alih selagi menunggu.
        if (a.generasi === generasi && !sedangDijeda(a) && a.ulangAi < JEDA_ULANG_AI_MS.length) {
          a.jedaUlangMs = JEDA_ULANG_AI_MS[a.ulangAi];
          a.ulangAi += 1;
          a.teks.unshift(...asli);
          a.foto.unshift(...pemuatFoto);
          if (a.foto.length > MAKS_FOTO_GILIRAN) a.foto.splice(0, a.foto.length - MAKS_FOTO_GILIRAN);
          console.warn(`[bridge] AI gagal menjawab sesi=${a.sesi}, dicoba lagi dalam ${a.jedaUlangMs / 1000} dtk`);
        } else {
          a.ulangAi = 0;
          console.error(`[bridge] AI gagal menjawab sesi=${a.sesi}, pesan tidak dibalas`);
        }
        return;
      }
    }
    a.ulangAi = 0;

    const kurang = MIN_MENGETIK_MS - (Date.now() - mulai);
    if (kurang > 0) await tidur(kurang);

    // Selagi AI menyusun jawaban, manusia bisa saja membuka chat atau membalas: jangan menimpali.
    if (a.generasi !== generasi || sedangDijeda(a)) {
      void mengetik(a.sesi, a.alamat, false);
      if (a.batalKarena === "dibaca" && !sedangDijeda(a)) {
        a.siap = jawaban; // ditahan; lihat blok finally
        a.siapTeruskan = tag;
      }
      else catat(a, "Jawaban yang kamu susun untuk pesan sebelumnya TIDAK terkirim, karena pemilik nomor membalas sendiri.");
      return;
    }

    // Baru sekarang pesan ditandai dibaca: sebelum titik ini, tanda-baca di chat hanya bisa berasal dari manusia.
    a.botBacaSampai = Date.now() + 6_000;
    await tandaiDibaca(a.sesi, a.alamat, a.belumDibaca.splice(0));
    try {
      // Id pesan dicatat sebelum pesan berangkat, jadi tidak mungkin dikira balasan manusia.
      await kirimTeks(a.sesi, a.alamat, jawaban, (id) => ingat(st.terkirim, id, 500), kutip);
      if (a.kutip === kutip) a.kutip = null;
      statistik(a.numberId, "dibalas");
      // Diteruskan ke pemilik hanya setelah jawabannya benar-benar sampai ke pelanggan ("sudah aku teruskan" jadi benar).
      if (tag) void teruskanKePemilik(nomor, { kunci, nama: a.namaPelanggan, telepon: a.teleponPelanggan }, tag, (id) => ingat(st.terkirim, id, 500));
      tulisLatar(() => catatPesan({ numberId: a.numberId, kunci, peran: 1, teks: jawaban, waktu: sekarang() }));
    } catch (e) {
      galat(a, e);
    }
    void mengetik(a.sesi, a.alamat, false);
    a.dibukaManusia = false;
  } finally {
    a.sedangProses = false;
    a.aktifSampai = Date.now() + 600_000;
    // Masih ada yang menunggu (pesan baru, atau jawaban yang ditahan): manusia diberi kesempatan dulu.
    // Masa tunggu setelah chat dibuka dihitung dari saat dibuka, bukan dari selesainya AI berpikir.
    const ulang = a.jedaUlangMs;
    a.jedaUlangMs = 0;
    // Chat sedang dijeda: paling cepat setelah jedanya habis, lalu manusia masih diberi `tunggu` seperti biasa.
    if (a.teks.length || a.siap)
      jadwalkan(kunci, a, ulang || sisaJedaMs(a) + (a.dibukaManusia ? Math.max(1_000, a.dibacaPada + a.tungguBacaMs - Date.now()) : a.tungguMs));
  }
}

/**
 * Antrean sebuah chat. Saat chat itu baru aktif (lagi), keadaannya dimuat sekali dari database;
 * sesudah itu memori yang menjadi acuan dan database hanya ditulisi.
 */
async function antreanUntuk(kunci: string, numberId: number, sesi: string, alamat: string): Promise<Antrean> {
  const ada = st.antre.get(kunci);
  if (ada) return ada;
  await st.tulis; // tulis yang masih antre untuk chat ini (bila ada) harus sudah sampai sebelum dibaca
  const sql = await db();
  const [chat] = await sql<BarisChat[]>`SELECT sesi_ke, last_at, jeda_sampai, jendela_awal, jendela_n FROM chat_state WHERE kunci = ${kunci}`;
  // Selagi menunggu database, event lain untuk chat yang sama tidak mungkin lewat (event satu nomor
  // diproses berurutan), tetapi tetap dijaga supaya tidak pernah ada dua antrean untuk satu chat.
  const sudah = st.antre.get(kunci);
  if (sudah) return sudah;
  const a: Antrean = {
    numberId,
    sesi,
    alamat,
    chat: chat ? { ...chat } : null,
    teks: [],
    belumDibaca: [],
    kutip: null,
    foto: [],
    timer: null,
    sedangProses: false,
    tungguMs: 5000,
    tungguBacaMs: 5000,
    generasi: 0,
    batalKarena: null,
    dibukaManusia: false,
    dibacaPada: 0,
    siap: null,
    siapTeruskan: null,
    namaPelanggan: null,
    teleponPelanggan: null,
    catatan: [],
    botBacaSampai: 0,
    aktifSampai: Date.now() + 600_000,
    kueriLalu: "",
    ulangAi: 0,
    jedaUlangMs: 0,
  };
  st.antre.set(kunci, a);
  if (st.antre.size > 500) rapikanAntrean();
  return a;
}

/** Pesan pelanggan di chat ini baru saja terbaca di HP pemilik nomor: manusia sedang membuka chat. */
function chatDibukaManusia(kunci: string): void {
  const a = st.antre.get(kunci);
  if (!a || Date.now() < a.botBacaSampai) return;
  a.dibacaPada = Date.now();
  if (!a.teks.length && !a.siap && !a.sedangProses) return; // tidak ada yang sedang menunggu jawaban AI
  a.dibukaManusia = true;
  console.info(`[bridge] chat dibuka manusia sesi=${a.sesi} -> AI menahan ${a.tungguBacaMs / 1000} dtk`);
  if (a.sedangProses) {
    // AI sedang menyusun jawaban: jangan dikirim dulu (proses() akan menyimpannya dan menjadwalkan ulang).
    a.generasi += 1;
    a.batalKarena = "dibaca";
  } else {
    jadwalkan(kunci, a, sisaJedaMs(a) + a.tungguBacaMs);
  }
}

function teleponDariEvent(ev: Extract<EventWa, { jenis: "pesan" }>): string | null {
  if (ev.telepon) return ev.telepon;
  if (ev.alamat.endsWith("@s.whatsapp.net")) return digitWa(ev.alamat) || null;
  if (ev.chat.endsWith("@s.whatsapp.net")) return digitWa(ev.chat) || null;
  return null;
}

function teksLogPesan(ev: Extract<EventWa, { jenis: "pesan" }>): string {
  const t = ev.teks.trim();
  const label = ev.foto ? "[Foto]" : "[Lampiran media]";
  return ev.lampiran ? (t ? `${t}\n${label}` : label) : t;
}

/**
 * Menangani satu event WhatsApp. Gerbang memanggilnya berurutan per nomor dan menunggunya selesai;
 * balasan AI sendiri diproses di latar (timer), tidak di sini.
 */
export async function tanganiEvent(ev: EventWa): Promise<void> {
  // Jalur ditentukan oleh sesi pengirim event; sesi yang tidak dikenal diabaikan.
  const nomor = await nomorBySesi(ev.sesi);
  if (!nomor) return;
  const sesi = nomor.sesi;

  if (ev.jenis === "terhubung") {
    await catatTerhubung(nomor.id, ev.waId, ev.nama);
    return;
  }

  const kunci = kunciChat(sesi, ev.chat);
  if (ev.jenis === "dibaca") {
    chatDibukaManusia(kunci);
    return;
  }

  // Pesan yang sama bisa tiba lagi setelah koneksi tersambung ulang.
  const idUnik = `${nomor.id}:${ev.id}`;
  if (st.terlihat.has(idUnik)) return;
  ingat(st.terlihat, idUnik, 3000);
  if (++st.hitung % 500 === 0) bersihkanChatLama();
  // Pesan lama (menumpuk selagi offline) tidak dijawab, dan balasan lama manusia tidak menjeda chat.
  if (ev.waktu && sekarang() - ev.waktu > UMUR_PESAN_MAKS_DTK) return;

  const telepon = teleponDariEvent(ev);
  // Chat dengan nomor pribadi pemilik (penerima pesan yang diteruskan AI) bukan chat pelanggan: tidak dijawab AI,
  // tidak dipelajari, tidak masuk histori/statistik, ke arah mana pun.
  if (nomor.teruskan_ke && (telepon === nomor.teruskan_ke || digitWa(ev.chat) === nomor.teruskan_ke)) return;
  const teksLog = teksLogPesan(ev);

  if (ev.dariSaya) {
    // Pesan keluar yang bukan kiriman bot berarti manusia membalas dari HP (atau perangkat tertaut lain).
    const dariBot = st.terkirim.has(ev.id);
    console.info(`[bridge] pesan keluar sesi=${sesi} -> ${dariBot ? "bot" : "manusia"}`);
    if (dariBot) return;
    const waktu = ev.waktu || sekarang();
    if (teksLog) tulisLatar(() => catatPesan({ numberId: nomor.id, kunci, peran: 2, teks: teksLog, waktu, telepon }));
    // AI belajar dari balasan manusia; sesudah balasan itu tercatat, supaya pertanyaannya bisa dirunut.
    if (nomor.belajar && ev.teks.trim()) tulisLatar(() => pelajariBalasan({ numberId: nomor.id, kunci, jawaban: ev.teks, waktu }));
    // Manusia mengambil alih: batalkan jawaban AI yang sedang menunggu/disiapkan, lalu AI mundur.
    const a = await antreanUntuk(kunci, nomor.id, sesi, ev.alamat);
    if (nomor.jeda_detik > 0) jedaChat(kunci, a, nomor.jeda_detik);
    a.generasi += 1;
    a.batalKarena = "dibalas";
    if (a.timer) clearTimeout(a.timer);
    a.timer = null;
    a.teks.length = 0;
    a.foto.length = 0;
    a.belumDibaca.length = 0;
    a.kutip = null;
    a.siap = null;
    a.dibukaManusia = false;
    a.aktifSampai = Date.now() + Math.max(600_000, nomor.jeda_detik * 1000);
    // AI tetap nyambung saat nanti melanjutkan: balasan ini tercatat di histori dan ikut dibaca (riwayatUntukAi).
    return;
  }

  statistik(nomor.id, "masuk");
  if (teksLog) tulisLatar(() => catatPesan({ numberId: nomor.id, kunci, peran: 0, teks: teksLog, waktu: ev.waktu || sekarang(), telepon, nama: ev.namaPengirim ?? null }));
  // Pemilik diblokir admin: pesan tetap tercatat, tapi AI tidak membalas.
  if (!nomor.bot_aktif || !nomor.pemilik_aktif) return;

  // Promosi judi yang jelas: tidak diantrekan (tanpa memanggil AI), kecuali chat ini sudah dipercaya pemilik.
  if (nomor.saring_spam && ev.teks) {
    const h = periksaSpam(ev.teks);
    // Balasan manusia yang masih antre ditulis harus ikut terbaca; gagal membaca = anggap dipercaya (jangan menyaring).
    if (h.spam && !(await st.tulis.then(() => chatDipercaya(kunci)).catch(() => true))) {
      console.info(`[bridge] pesan tidak dibalas, spam judi (skor ${h.skor}: ${h.sinyal.join(", ")}) sesi=${sesi}`);
      tulisLatar(() => tandaiSpam(kunci, alasanSpam(h)));
      return;
    }
  }

  let teks = ev.teks.trim();
  if (ev.foto) teks = teks ? `${teks}\n[Pelanggan melampirkan foto]` : "[Pelanggan mengirim foto]";
  else if (ev.lampiran) teks = teks ? `${teks}\n[Pelanggan juga melampirkan media yang tidak bisa kamu lihat]` : "[Pelanggan mengirim suara/berkas/stiker tanpa teks, yang tidak bisa kamu lihat]";
  if (!teks) return;

  const a = await antreanUntuk(kunci, nomor.id, sesi, ev.alamat);
  a.alamat = ev.alamat;
  a.namaPelanggan = ev.namaPengirim?.trim() || a.namaPelanggan;
  a.teleponPelanggan = telepon ?? a.teleponPelanggan;
  a.tungguMs = nomor.tunggu_detik * 1000;
  a.tungguBacaMs = nomor.tunggu_baca_detik * 1000;
  if (a.siap) {
    // Jawaban yang ditahan jadi basi: pelanggan menambah pesan sebelum jawaban itu terkirim.
    a.siap = null;
    catat(a, "Jawaban yang kamu susun untuk pesan sebelumnya BELUM terkirim ke lawan bicara; jawab juga hal itu sekarang.");
  }
  a.teks.push(teks);
  if (ev.foto) {
    a.foto.push(ev.foto);
    if (a.foto.length > MAKS_FOTO_GILIRAN) a.foto.shift();
  }
  a.belumDibaca.push(ev.id);
  if (a.belumDibaca.length > MAKS_BELUM_DIBACA) a.belumDibaca.shift();
  a.kutip = ev.kutip ?? null;
  // Pesan baru: manusia diberi kesempatan dari awal. Bila chat masih terbuka di HP, tanda-baca untuk
  // pesan ini segera menyusul (atau baru saja tiba lebih dulu) dan masa tunggunya jadi yang panjang.
  a.dibukaManusia = Date.now() - a.dibacaPada < 3_000;
  // Manusia sedang memegang chat (jeda): pesan menunggu sampai jeda habis; dibalas manusia = antrean dikosongkan.
  if (!a.sedangProses) jadwalkan(kunci, a, sisaJedaMs(a) + (a.dibukaManusia ? a.tungguBacaMs : a.tungguMs));
}

// Didaftarkan saat modul dimuat (lihat src/instrumentation.ts).
padaEvent(tanganiEvent);

/** Buang antrean di memori yang sudah lama diam (keadaannya sudah tersimpan di database). */
function rapikanAntrean(): void {
  const kini = Date.now();
  for (const [k, a] of st.antre) if (!a.timer && !a.sedangProses && !a.teks.length && !a.siap && a.aktifSampai < kini) st.antre.delete(k);
}

/** Buang keadaan chat yang sudah lama tidak aktif (dipanggil sesekali). */
function bersihkanChatLama(): void {
  const batas = sekarang() - 30 * 86400;
  tulisLatar(async () => {
    const sql = await db();
    await sql`DELETE FROM chat_state WHERE last_at < ${batas}`;
  });
}
