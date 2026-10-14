import "server-only";
import { createHash } from "node:crypto";
import { db, sekarang, setSetting } from "./db";
import { tanyaHermes } from "./hermes";
import { susunSistem } from "./knowledge";
import { type Nomor, catatStat, catatTerhubung, nomorBySesi } from "./numbers";
import { type EventWa, kirimTeks, mengetik, padaEvent, tandaiDibaca } from "./wa";

/**
 * Jembatan WhatsApp (src/lib/wa.ts) -> Hermes -> WhatsApp.
 *
 * Serah-terima manusia <-> AI (per nomor; lihat numbers.tunggu_detik / tunggu_baca_detik / jeda_menit):
 *   1. Pesan pelanggan masuk -> AI menunggu `tunggu_detik`, dihitung dari pesan TERAKHIR pelanggan
 *      (pesan beruntun tergabung). Selama menunggu AI tidak menandai dibaca dan tidak "mengetik".
 *   2. Chat itu dibuka manusia di HP (pesan terbaca) sebelum jawaban AI terkirim -> AI langsung
 *      menahan diri selama `tunggu_baca_detik`. Jawaban yang sudah telanjur disusun disimpan.
 *      WhatsApp tidak memberi tahu perangkat tertaut bahwa pemilik sedang mengetik; "chat dibuka"
 *      adalah satu-satunya tanda yang tersedia bahwa manusia sedang menangani.
 *   3. Manusia mengirim balasan -> jawaban AI dibatalkan dan AI diam di chat itu selama `jeda_menit`
 *      (0 = hanya untuk pesan itu).
 *   4. Masa tunggu di (2) habis tanpa balasan manusia (tidak jadi membalas) -> AI mengambil alih.
 * Aturan anti-blokir: hanya membalas chat pribadi yang masuk, ada "mengetik", dibatasi per chat.
 *
 * Keadaan tiap chat (jeda, batas laju, nomor sesi Hermes) dipegang di memori selama chat itu aktif
 * dan ditulis ke tabel chat_state di latar. Dengan begitu keputusan serah-terima tetap seketika
 * dan tidak bergantung pada perjalanan pulang-pergi ke database; database hanya dibaca sekali saat
 * sebuah chat mulai aktif (lagi), mis. setelah server dimulai ulang.
 */

const MIN_MENGETIK_MS = 1_200;
const UMUR_PESAN_MAKS_DTK = 120; // pesan lama (mis. menumpuk saat offline) tidak dijawab
const JENDELA_DTK = 600;
const MAKS_BALASAN_PER_JENDELA = 10;
const SESI_BARU_SETELAH_DTK = 12 * 3600; // percakapan baru bila pelanggan diam >12 jam
const MAKS_PESAN_KARAKTER = 2_000;
const MAKS_CATATAN = 6;
const MAKS_BELUM_DIBACA = 30;

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
  /** Id pesan pelanggan yang belum ditandai dibaca oleh bot. */
  belumDibaca: string[];
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
  /** Hal yang terjadi di chat di luar pengetahuan AI; disertakan di giliran AI berikutnya. */
  catatan: string[];
  /** Tanda-baca yang dikirim bot sendiri bisa bergema sebagai event; diabaikan sampai waktu ini. */
  botBacaSampai: number;
  aktifSampai: number;
  kueriLalu: string;
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

function jedaChat(kunci: string, a: Antrean, menit: number): void {
  const t = sekarang();
  a.chat = a.chat ? { ...a.chat, jeda_sampai: t + menit * 60 } : { sesi_ke: 1, last_at: t, jeda_sampai: t + menit * 60, jendela_awal: 0, jendela_n: 0 };
  simpanChat(kunci, a.chat);
}

/** Catat satu balasan; kembalikan nomor sesi Hermes, atau null bila batas laju terlampaui. */
function ambilGiliran(kunci: string, a: Antrean): number | null {
  const t = sekarang();
  const b = a.chat;
  if (!b) {
    a.chat = { sesi_ke: 1, last_at: t, jeda_sampai: 0, jendela_awal: t, jendela_n: 1 };
    simpanChat(kunci, a.chat);
    return 1;
  }
  const jendelaBaru = t - b.jendela_awal > JENDELA_DTK;
  const n = jendelaBaru ? 1 : b.jendela_n + 1;
  if (n > MAKS_BALASAN_PER_JENDELA) return null;
  const sesi = t - b.last_at > SESI_BARU_SETELAH_DTK ? b.sesi_ke + 1 : b.sesi_ke;
  a.chat = { ...b, sesi_ke: sesi, last_at: t, jendela_awal: jendelaBaru ? t : b.jendela_awal, jendela_n: n };
  simpanChat(kunci, a.chat);
  return sesi;
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
    if (sedangDijeda(a) || !nomor || !nomor.bot_aktif) {
      a.teks.length = 0;
      a.siap = null;
      return;
    }

    const mulai = Date.now();
    void mengetik(a.sesi, a.alamat, true);

    let jawaban: string;
    if (a.siap && !a.teks.length) {
      // Jawaban sudah disusun sebelum manusia membuka chat, dan ia tidak jadi membalas: kirim itu.
      jawaban = a.siap;
      a.siap = null;
    } else {
      a.siap = null;
      const pesan = a.teks.splice(0).join("\n").slice(0, MAKS_PESAN_KARAKTER);
      const sesi = ambilGiliran(kunci, a);
      if (sesi === null) {
        void mengetik(a.sesi, a.alamat, false);
        return; // batas laju: diam
      }
      const catatan = a.catatan.splice(0);
      const kueri = `${a.kueriLalu}\n${pesan}`;
      a.kueriLalu = pesan;
      try {
        const { sistem } = await susunSistem(nomor, kueri, catatan);
        jawaban = formatWa((await tanyaHermes({ sessionId: `wa-${kunci.slice(0, 24)}-${sesi}`, sistem, pesan })).teks);
      } catch (e) {
        galat(a, e);
        void mengetik(a.sesi, a.alamat, false);
        return;
      }
    }

    const kurang = MIN_MENGETIK_MS - (Date.now() - mulai);
    if (kurang > 0) await tidur(kurang);

    // Selagi AI menyusun jawaban, manusia bisa saja membuka chat atau membalas: jangan menimpali.
    if (a.generasi !== generasi || sedangDijeda(a)) {
      void mengetik(a.sesi, a.alamat, false);
      if (a.batalKarena === "dibaca" && !sedangDijeda(a)) a.siap = jawaban; // ditahan; lihat blok finally
      else catat(a, "Jawaban yang kamu susun untuk pesan sebelumnya TIDAK terkirim, karena pemilik nomor membalas sendiri.");
      return;
    }

    // Baru sekarang pesan ditandai dibaca: sebelum titik ini, tanda-baca di chat hanya bisa berasal dari manusia.
    a.botBacaSampai = Date.now() + 6_000;
    await tandaiDibaca(a.sesi, a.alamat, a.belumDibaca.splice(0));
    try {
      // Id pesan dicatat sebelum pesan berangkat, jadi tidak mungkin dikira balasan manusia.
      await kirimTeks(a.sesi, a.alamat, jawaban, (id) => ingat(st.terkirim, id, 500));
      statistik(a.numberId, "dibalas");
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
    if (a.teks.length || a.siap) jadwalkan(kunci, a, a.dibukaManusia ? Math.max(1_000, a.dibacaPada + a.tungguBacaMs - Date.now()) : a.tungguMs);
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
    timer: null,
    sedangProses: false,
    tungguMs: 5000,
    tungguBacaMs: 45000,
    generasi: 0,
    batalKarena: null,
    dibukaManusia: false,
    dibacaPada: 0,
    siap: null,
    catatan: [],
    botBacaSampai: 0,
    aktifSampai: Date.now() + 600_000,
    kueriLalu: "",
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
    jadwalkan(kunci, a, a.tungguBacaMs);
  }
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

  if (ev.dariSaya) {
    // Pesan keluar yang bukan kiriman bot berarti manusia membalas dari HP (atau perangkat tertaut lain).
    const dariBot = st.terkirim.has(ev.id);
    console.info(`[bridge] pesan keluar sesi=${sesi} -> ${dariBot ? "bot" : "manusia"}`);
    if (dariBot) return;
    // Manusia mengambil alih: batalkan jawaban AI yang sedang menunggu/disiapkan, lalu AI mundur.
    const a = await antreanUntuk(kunci, nomor.id, sesi, ev.alamat);
    if (nomor.jeda_menit > 0) jedaChat(kunci, a, nomor.jeda_menit);
    a.generasi += 1;
    a.batalKarena = "dibalas";
    if (a.timer) clearTimeout(a.timer);
    a.timer = null;
    a.teks.length = 0;
    a.belumDibaca.length = 0;
    a.siap = null;
    a.dibukaManusia = false;
    a.aktifSampai = Date.now() + Math.max(600_000, nomor.jeda_menit * 60_000);
    // Supaya AI nyambung saat nanti melanjutkan percakapan ini.
    const isi = ev.teks.trim().slice(0, 300);
    catat(a, isi ? `Pemilik nomor membalas sendiri ke lawan bicara: "${isi}"` : "Pemilik nomor mengirim media/lampiran sendiri ke lawan bicara.");
    return;
  }

  statistik(nomor.id, "masuk");
  if (!nomor.bot_aktif) return;

  let teks = ev.teks.trim();
  if (ev.lampiran) teks = teks ? `${teks}\n[Pelanggan juga melampirkan media yang tidak bisa kamu lihat]` : "[Pelanggan mengirim gambar/suara/berkas tanpa teks, yang tidak bisa kamu lihat]";
  if (!teks) return;

  const a = await antreanUntuk(kunci, nomor.id, sesi, ev.alamat);
  if (sedangDijeda(a)) return; // manusia sedang memegang chat ini
  a.alamat = ev.alamat;
  a.tungguMs = nomor.tunggu_detik * 1000;
  a.tungguBacaMs = nomor.tunggu_baca_detik * 1000;
  if (a.siap) {
    // Jawaban yang ditahan jadi basi: pelanggan menambah pesan sebelum jawaban itu terkirim.
    a.siap = null;
    catat(a, "Jawaban yang kamu susun untuk pesan sebelumnya BELUM terkirim ke lawan bicara; jawab juga hal itu sekarang.");
  }
  a.teks.push(teks);
  a.belumDibaca.push(ev.id);
  if (a.belumDibaca.length > MAKS_BELUM_DIBACA) a.belumDibaca.shift();
  // Pesan baru: manusia diberi kesempatan dari awal. Bila chat masih terbuka di HP, tanda-baca untuk
  // pesan ini segera menyusul (atau baru saja tiba lebih dulu) dan masa tunggunya jadi yang panjang.
  a.dibukaManusia = Date.now() - a.dibacaPada < 3_000;
  if (!a.sedangProses) jadwalkan(kunci, a, a.dibukaManusia ? a.tungguBacaMs : a.tungguMs);
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
