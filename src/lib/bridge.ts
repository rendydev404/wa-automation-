import "server-only";
import { createHash } from "node:crypto";
import { db, sekarang, setSetting } from "./db";
import { catatPakai, tanpaIngatan, tanyaAiTerjaga } from "./ai";
import { aiUntukAkun, catatBalasanLokal, catatKuotaHabis, daftarPaket, sisaKuotaAi } from "./langganan";
import { uang } from "./format";
import { MEREK } from "./merek";
import { adaKnowledge, susunSistem } from "./knowledge";
import { type KirimProduk, bahanKirim, captionProduk, daftarProduk, katalogBoleh, perluDaftar, teksKatalog } from "./katalog";
import { type Nomor, catatStat, catatTerhubung, nomorBySesi } from "./numbers";
import { catatPesan, chatDipercaya, riwayatUntukAi, tandaiProspek, tandaiSpam } from "./percakapan";
import { alasanSpam, periksaSpam } from "./spam";
import { type Penilaian, PELUANG_AUDIT, catatAudit, catatPengalaman, hitung, layakDicek, nilaiPesan, setelanMl, yakinLewati } from "./prospek";
import { BATAS_STRIKE, BISU_BOT_DTK, BOT_BERUNTUN, BOT_CEPAT_MS, STATUS, type StatusChat, ULANG_BERUNTUN, adaKataMinat, berulang, gema, penutupSaja } from "./prospek-def";
import { skala } from "./skala-waktu";
import { pelajariBalasan } from "./pelajaran";
import { CATATAN_KODE_DIBLOKIR, TOLAK_KODE, adaKode } from "./penjaga";
import { sttTerkonfigurasi, transkripsi } from "./stt";
import type { Foto } from "./types";
import type { WAMessage } from "baileys";
import { type EventWa, digitWa, kirimGambar, kirimTeks, mengetik, padaEvent, tandaiDibaca } from "./wa";

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
 * Penyaring prospek (src/lib/prospek.ts, per nomor numbers.saring_prospek; tidak berlaku di chat yang pernah dibalas
 * pemilik atau ditandai bukan spam):
 *   - Tiap jawaban AI membawa label tersembunyi. "prospek" = chat terbukti prospek (tidak pernah dibisukan lagi);
 *     "bukan" di chat yang belum terbukti = strike; BATAS_STRIKE strike beruntun = chat DIBISUKAN (jawaban terakhir
 *     itu sudah berupa satu kalimat sopan yang mengarahkan); "selesai" tanpa teks = tidak dibalas.
 *   - Chat dibisukan: pesan hanya tercatat. Dicek AI utama (tanpa mengirim apa pun kecuali AI menilainya prospek)
 *     bila ada kata minat, ML melihat minat / kemiripan dengan knowledge, ML masih magang, atau terpilih audit.
 *   - Ucapan penutup ("ok makasih") setelah jawaban yang tidak bertanya dilewati tanpa memanggil AI bila ML aktif.
 *   - Detektor pola (tanpa AI): lawan bicara membalas < BOT_CEPAT_MS berturut-turut, mengulang pesan panjang yang
 *     sama, atau memantulkan balasan kita = bot/auto-reply -> dibisukan BISU_BOT_DTK.
 *   Tidak ada batas jumlah balasan: pelanggan yang terus bertanya dilayani tanpa batas.
 * Aturan anti-blokir (panduan WAHA "how to avoid blocking"): hanya membalas chat pribadi yang masuk, tidak pernah
 * memulai chat; ritmenya seperti manusia: baca dulu, "mengetik" selama yang wajar untuk panjang jawabannya, berhenti,
 * baru kirim; waktu tunggu dan lama mengetik diacak (tidak pernah tepat sama).
 *   Satu-satunya pengecualian: follow-up nomor CS ChatGerCep (followup.ts, lewat kirimSapaan) ke chat yang SUDAH
 *   pernah ada dengan pemilik akun gratis yang kuotanya habis; paling banyak 2 pesan per akun, pelan, dan berjam kerja.
 *
 * Keadaan tiap chat (jeda, nomor sesi Hermes) dipegang di memori selama chat itu aktif
 * dan ditulis ke tabel chat_state di latar. Dengan begitu keputusan serah-terima tetap seketika
 * dan tidak bergantung pada perjalanan pulang-pergi ke database; database hanya dibaca sekali saat
 * sebuah chat mulai aktif (lagi), mis. setelah server dimulai ulang.
 */

/** Lama "mengetik" = dasar + per huruf jawaban, paling lama MAKS, lalu diacak ±20%. */
const MENGETIK_DASAR_MS = 1_500;
const MENGETIK_PER_HURUF_MS = 25;
const MENGETIK_MAKS_MS = 8_000;
const lamaMengetik = (teks: string): number =>
  skala(Math.round(Math.min(MENGETIK_MAKS_MS, MENGETIK_DASAR_MS + teks.length * MENGETIK_PER_HURUF_MS) * (0.8 + Math.random() * 0.4)));
/** Waktu tunggu pengaturan nomor dipakai sebagai batas bawah, ditambah acak sampai 40% supaya tidak pernah tetap. */
const acakTunggu = (ms: number): number => skala(Math.round(ms * (1 + Math.random() * 0.4)));
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
  /** Penyaring prospek: STATUS (prospek-def.ts), strike beruntun, dan akhir bisu chat bot (detik epoch). */
  prospek: StatusChat;
  strike: number;
  bisu_sampai: number;
}

const chatBaru = (t: number): BarisChat => ({ sesi_ke: 1, last_at: t, jeda_sampai: 0, jendela_awal: 0, jendela_n: 0, prospek: STATUS.baru, strike: 0, bisu_sampai: 0 });

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
  /** Transkrip pesan suara yang belum dijawab, per penanda di `teks` (lihat PENANDA_SUARA); mulai dikerjakan saat tiba. */
  suara: Map<string, Promise<string | null>>;
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
  /** Produk katalog yang dikirim bersama jawaban `siap`. */
  siapProduk: KirimProduk | null;
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
  /** Pemilik pernah membalas chat ini atau menandainya bukan spam: penyaring prospek tidak berlaku. */
  dikenal: boolean;
  /** Balasan terakhir yang kita kirim & kapan (ms); 0 = pesan masuk sesudahnya sudah diukur detektor bot. */
  balasanAkhir: string | null;
  kirimAkhirMs: number;
  /** Balasan lawan bicara yang tiba < BOT_CEPAT_MS setelah balasan kita, berturut-turut. */
  cepat: number;
  /** Beberapa pesan masuk terakhir (detektor pesan berulang). */
  masukAkhir: string[];
  /** Giliran ini hanya pengecekan chat yang dibisukan: jawaban dikirim hanya bila AI menilai pesannya prospek. */
  modeCek: boolean;
  /** Giliran ini audit keputusan "lewati" ML (dihitung saat label AI tiba). */
  audit: boolean;
  /** Penilaian ML untuk pesan yang dilewati di chat yang dibisukan (dipelajari sebagai kesalahan bila pemilik membalas). */
  terlewat: Penilaian | null;
}

interface Keadaan {
  terlihat: Map<string, number>;
  terkirim: Set<string>;
  antre: Map<string, Antrean>;
  /** Tulis ke database di latar, satu per satu sesuai urutan dibuatnya. */
  tulis: Promise<void>;
  hitung: number;
  /** Khusus pengujian: lama mengetik & masa tunggu yang pasti (tanpa acak). */
  minMengetikMs?: number;
  tungguMs?: number;
  /** Follow-up CS ChatGerCep (followup.ts) memasang dirinya di sini; null = fitur tidak dimuat. */
  kaitCs?: KaitCs | null;
}

/**
 * Kait nomor CS ChatGerCep (followup.ts). Dipasang lewat pasangKaitCs supaya jembatan tidak mengimpor followup.ts
 * (followup.ts yang memakai kirimSapaan dari sini).
 */
export interface KaitCs {
  /** Nomor CS (id) & digit WA-nya, dari memori tanpa I/O. */
  nomorCs: () => { ids: ReadonlySet<number>; wa: ReadonlySet<string> };
  /**
   * Pesan masuk di nomor CS. Mengembalikan catatan untuk AI (siapa lawan bicaranya, balasan atas follow-up, permintaan
   * berhenti) atau null. Chat yang tidak sedang di-follow-up dan tanpa kode akun selesai tanpa I/O.
   */
  pesanMasuk: (d: { numberId: number; kunci: string; teks: string; telepon: string | null }) => Promise<string | null>;
}

const g = globalThis as unknown as { __waBridge?: Keadaan };
const st: Keadaan = (g.__waBridge ??= { terlihat: new Map(), terkirim: new Set(), antre: new Map(), tulis: Promise.resolve(), hitung: 0 });

export function pasangKaitCs(k: KaitCs): void {
  st.kaitCs = k;
}

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
      INSERT INTO chat_state(kunci, sesi_ke, last_at, jeda_sampai, jendela_awal, jendela_n, prospek, strike, bisu_sampai)
      VALUES (${kunci}, ${b.sesi_ke}, ${b.last_at}, ${b.jeda_sampai}, ${b.jendela_awal}, ${b.jendela_n}, ${b.prospek}, ${b.strike}, ${b.bisu_sampai})
      ON CONFLICT (kunci) DO UPDATE SET sesi_ke = EXCLUDED.sesi_ke, last_at = EXCLUDED.last_at, jeda_sampai = EXCLUDED.jeda_sampai,
                                        jendela_awal = EXCLUDED.jendela_awal, jendela_n = EXCLUDED.jendela_n,
                                        prospek = EXCLUDED.prospek, strike = EXCLUDED.strike, bisu_sampai = EXCLUDED.bisu_sampai`;
  });
}

const sedangDijeda = (a: Antrean): boolean => (a.chat?.jeda_sampai ?? 0) > sekarang();
/** Sisa jeda chat ini dalam ms (0 bila tidak dijeda). */
const sisaJedaMs = (a: Antrean): number => Math.max(0, (a.chat?.jeda_sampai ?? 0) * 1000 - Date.now());

function jedaChat(kunci: string, a: Antrean, detik: number): void {
  const t = sekarang();
  a.chat = { ...(a.chat ?? chatBaru(t)), jeda_sampai: t + detik };
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
    a.chat = { ...chatBaru(t), jendela_awal: t, jendela_n: 1 };
    simpanChat(kunci, a.chat);
    return 1;
  }
  a.chat = { ...b, last_at: t };
  simpanChat(kunci, a.chat);
  return b.sesi_ke;
}

/** Ubah keadaan penyaring prospek sebuah chat (memori = acuan; database & histori ditulis di latar). */
function ubahStatus(kunci: string, a: Antrean, status: StatusChat, alasan: string | null, bisuSampai = 0): void {
  a.chat = { ...(a.chat ?? chatBaru(sekarang())), prospek: status, strike: 0, bisu_sampai: bisuSampai };
  simpanChat(kunci, a.chat);
  tulisLatar(() => tandaiProspek(kunci, status, alasan));
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

/**
 * Follow-up CS (followup.ts): satu pesan dari bot ke chat yang SUDAH pernah ada, dengan ritme manusia seperti balasan
 * biasa: jeda sebentar, online + "mengetik" selama yang wajar untuk panjang pesannya, berhenti, kirim, lalu offline.
 * Id pesan dicatat sebelum berangkat supaya gemanya tidak dikira balasan manusia (yang akan menjeda AI di chat itu).
 */
export async function kirimSapaan(d: { numberId: number; sesi: string; alamat: string; kunci: string; teks: string }): Promise<string> {
  await tidur(skala(800 + Math.round(Math.random() * 2_200)));
  const lama = st.minMengetikMs ?? lamaMengetik(d.teks);
  void mengetik(d.sesi, d.alamat, true);
  await tidur(lama);
  void mengetik(d.sesi, d.alamat, false);
  const id = await kirimTeks(d.sesi, d.alamat, d.teks, (x) => ingat(st.terkirim, x, 500));
  const a = st.antre.get(d.kunci);
  if (a) {
    a.balasanAkhir = d.teks;
    a.kirimAkhirMs = Date.now();
  }
  // Tidak dihitung "dibalas" di statistik harian: ini pesan yang kita mulai, bukan jawaban atas pesan masuk.
  tulisLatar(() => catatPesan({ numberId: d.numberId, kunci: d.kunci, peran: 1, teks: d.teks, waktu: sekarang() }));
  return id;
}

function jadwalkan(kunci: string, a: Antrean, ms: number): void {
  if (a.timer) clearTimeout(a.timer);
  a.timer = setTimeout(() => void proses(kunci), ms);
}

/**
 * Kirim katalog/foto produk yang diminta AI lewat tag <kirim_produk>, setelah jawabannya terkirim: daftar lengkap
 * (untuk "semua"), lalu foto satu per satu dengan nama & harga, berjeda seperti orang mengirim. Hanya produk yang ada
 * di katalog nomor ini, tersedia, dan punya foto. Tercatat di histori sebagai balasan AI supaya giliran berikutnya tahu.
 */
async function kirimKatalog(a: Antrean, kunci: string, tag: KirimProduk, jawaban: string): Promise<void> {
  try {
    const b = await bahanKirim(a.numberId, tag);
    const terkirim: string[] = [];
    const daftar = b.daftarTeks && perluDaftar(jawaban, b.daftar) ? teksKatalog(b.daftar) : "";
    if (daftar) {
      await tidur(skala(700));
      await kirimTeks(a.sesi, a.alamat, daftar, (id) => ingat(st.terkirim, id, 500));
      terkirim.push(daftar);
    }
    for (const p of b.foto) {
      await tidur(skala(900));
      await kirimGambar(a.sesi, a.alamat, p.data, p.mime, captionProduk(p), (id) => ingat(st.terkirim, id, 500));
      terkirim.push(`[Foto produk] ${captionProduk(p).replace(/\n/g, " · ")}`);
    }
    if (terkirim.length) tulisLatar(() => catatPesan({ numberId: a.numberId, kunci, peran: 1, teks: terkirim.join("\n"), waktu: sekarang() }));
  } catch (e) {
    console.warn(`[bridge] katalog gagal dikirim sesi=${a.sesi}: ${e instanceof Error ? e.message : e}`);
  }
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

/**
 * Pemberitahuan sekali kirim saat kuota balasan AI akun trial/gratis habis (klaimPemberitahuanKuota menjamin sekali per
 * periode kuota). Dikirim sebagai balasan di chat yang sedang masuk, jadi bukan pesan tanpa diminta. Isinya ajakan
 * berlangganan untuk pemilik nomor; harga "mulai" diambil dari paket aktif termurah (tanpa harga bila belum ada paket).
 * Tautannya ke /trial-habis: tanpa trial halaman itu langsung mengalihkan ke Langganan (pilihan paket).
 */
export function teksKuotaHabis(mulai: { harga: number; hari: number } | null = null): string {
  const asal = (process.env.APP_URL || "https://chatgercep.com").replace(/\/+$/, "");
  return [
    "🚨 *Asisten AI WhatsApp Kamu Sudah Berhenti Membalas*",
    "",
    `Halo, asisten AI ${MEREK} di nomor ini sedang tidak aktif karena belum ada paket yang berjalan. Mulai sekarang, setiap chat pelanggan yang masuk harus kamu balas sendiri.`,
    "",
    "Coba bayangkan:",
    "",
    "📱 Calon pembeli chat jam 11 malam, tanya harga dan stok.",
    "⏰ Kamu baru sempat membalas besok pagi.",
    "💸 Sementara itu, dia sudah beli di toko sebelah yang balasnya lebih cepat.",
    "",
    "Pembeli zaman sekarang tidak suka menunggu. *Setiap chat yang telat dibalas berpotensi jadi penjualan yang hilang.*",
    "",
    `Dengan ${MEREK} aktif kembali, kamu mendapatkan:`,
    "",
    "✅ Chat pelanggan dibalas otomatis 24 jam, termasuk hari libur",
    "✅ Pertanyaan produk, harga, dan stok dijawab sesuai data usaha kamu",
    "✅ Waktu admin jauh lebih hemat, fokus ke closing",
    "✅ Kendali tetap di tangan kamu: balas sendiri kapan saja, AI otomatis mundur",
    "",
    ...(mulai ? [`🔥 *Cukup mulai ${uang(mulai.harga)} untuk ${mulai.hari} hari*, lebih murah dari satu pesanan yang hilang.`, ""] : []),
    "Aktifkan sekarang supaya tidak ada pembeli yang lepas lagi:",
    `👉 ${asal}/trial-habis`,
    "",
    `*${MEREK} — Bales WA Pakai AI, Tidak Pernah Segercep Ini!*`,
  ].join("\n");
}

/** Paket aktif termurah (bukan Custom) untuk baris "mulai Rp..." di pemberitahuan kuota habis; gagal = tanpa harga. */
async function hargaMulai(): Promise<{ harga: number; hari: number } | null> {
  try {
    const p = (await daftarPaket()).filter((x) => x.harga > 0).sort((x, y) => x.harga - y.harga)[0];
    return p ? { harga: p.harga, hari: p.durasi_hari } : null;
  } catch {
    return null;
  }
}

/**
 * Selama kuota habis, tiap pesan masuk melewati jalur ini: catatKuotaHabis (notifikasi + klaim pemberitahuan chat) cukup
 * dijalankan sekali per 10 menit per akun. Keduanya anti-dobel di database, jadi pengulangan sesudahnya aman.
 */
const habisDicek = new Map<number, number>();
const tanpaKnowledgeDicatat = new Map<number, number>();
function habisBaruDicek(userId: number): boolean {
  const t = habisDicek.get(userId) ?? 0;
  if (Date.now() - t < 600_000) return false;
  habisDicek.set(userId, Date.now());
  return true;
}

async function beritahuKuotaHabis(a: Antrean, kunci: string): Promise<void> {
  const teks = teksKuotaHabis(await hargaMulai());
  try {
    await kirimTeks(a.sesi, a.alamat, teks, (id) => ingat(st.terkirim, id, 500));
    tulisLatar(() => catatPesan({ numberId: a.numberId, kunci, peran: 1, teks, waktu: sekarang() }));
    console.info(`[bridge] kuota habis: pemberitahuan berlangganan dikirim sekali sesi=${a.sesi}`);
  } catch (e) {
    galat(a, e);
  }
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
    // Kuota habis: AI diam (pemilik melihatnya di dasbor). Bot tidak pernah mengirim pesan ke nomor yang tidak
    // sedang chat dengannya, karena pesan tanpa diminta seperti itu memicu blokir WhatsApp.
    const habis = !!nomor && nomor.bot_aktif && nomor.pemilik_aktif && (await kuotaHabis(nomor.user_id));
    // Akun trial/gratis: kuota habis diberitahukan SEKALI di chat yang sedang masuk (lalu diam seperti biasa).
    if (habis && nomor && nomor.user_id !== null && a.teks.length && habisBaruDicek(nomor.user_id) && (await catatKuotaHabis(nomor.user_id).catch(() => false))) {
      await beritahuKuotaHabis(a, kunci);
    }
    // Aturan pakai: tanpa product knowledge, AI tidak menjawab (pesan tetap tercatat; pemilik membalas sendiri).
    const tanpaKnowledge = !!nomor && nomor.bot_aktif && nomor.pemilik_aktif && !habis && !(await adaKnowledge(nomor.id).catch(() => true));
    if (tanpaKnowledge && nomor && Date.now() - (tanpaKnowledgeDicatat.get(nomor.id) ?? 0) > 3600_000) {
      tanpaKnowledgeDicatat.set(nomor.id, Date.now());
      console.warn(`[bridge] nomor ${nomor.id} belum punya product knowledge: AI tidak membalas`);
    }
    if (!nomor || !nomor.bot_aktif || !nomor.pemilik_aktif || habis || tanpaKnowledge) {
      a.teks.length = 0;
      a.foto.length = 0;
      a.siap = null;
      return;
    }

    // Balasan mengutip pesan terakhir yang sedang dijawab (bukan pesan yang tiba selagi AI berpikir).
    const kutip = a.kutip;

    let jawaban: string;
    let produk: KirimProduk | null = null;
    if (a.siap && !a.teks.length) {
      // Jawaban sudah disusun sebelum manusia membuka chat, dan ia tidak jadi membalas: kirim itu.
      jawaban = a.siap;
      produk = a.siapProduk;
      a.siap = null;
      a.siapProduk = null;
    } else {
      a.siap = null;
      a.siapProduk = null;
      const tertunda = a.teks.length;
      const sesiLalu = a.chat?.sesi_ke ?? 0;
      const asli = await isiTranskrip(a.teks.splice(0), a.suara);
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
        // Katalog produk hanya untuk akun berbayar (dan admin); daftarnya dibaca tanpa foto.
        // Penyaring prospek: AI memberi label di jawabannya; ML menilai pesan yang sama (±6 ms) untuk belajar.
        const pakaiNilai = nomor.saring_prospek;
        const [ai, saringSpam, katalog, penilaian] = await Promise.all([
          aiUntukAkun(nomor.user_id),
          nomor.saring_spam ? st.tulis.then(() => chatDipercaya(kunci)).then((p) => !p, () => false) : false,
          katalogBoleh(nomor.user_id).then((ok) => (ok ? daftarProduk(nomor.id) : []), () => []),
          pakaiNilai && pesan.trim() ? nilaiPesan(nomor.id, pesan) : null,
        ]);
        const lengkap = tanpaIngatan(ai.penyedia);
        const riwayat = st.tulis.then(() => riwayatUntukAi(kunci, { sesiBaru: sesi !== sesiLalu, tertunda, lengkap }));
        // Foto baru diunduh sekarang (AI memang akan menjawab), bersamaan, langsung ke memori.
        const gambar = (await Promise.all(pemuatFoto.map((ambil) => ambil().catch(() => null)))).filter((f: Foto | null): f is Foto => !!f);
        const gagalFoto = pemuatFoto.length - gambar.length;
        const isiPesan = gagalFoto ? `${pesan}\n[${gagalFoto} foto gagal dimuat sehingga tidak bisa kamu lihat; minta pelanggan mengirim ulang bila perlu]` : pesan;
        const { sistem } = await susunSistem(nomor, kueri, { catatan, riwayat, adaFoto: gambar.length > 0, riwayatLengkap: lengkap, saringSpam, katalog, nilaiPesan: pakaiNilai });
        // Sumber fakta untuk pemeriksa: pesan sistem + pesan pelanggan + seluruh chat sesi ini (Hermes hanya diberi
        // yang belum ia lihat, jadi sisanya dibaca terpisah supaya angka yang pernah disebut di chat tetap sah).
        const sumber = [sistem, isiPesan, ...(lengkap ? [] : await riwayatUntukAi(kunci, { sesiBaru: false, tertunda, lengkap: true }))].join("\n");
        const hasil = await tanyaAiTerjaga({ sessionId: `wa-${kunci.slice(0, 24)}-${sesi}`, sistem, pesan: isiPesan, gambar, paksa: { penyedia: ai.penyedia }, cadanganHermes: ai.cadanganHermes }, sumber, { saringSpam, katalog: katalog.length > 0, gaya: true, nilai: pakaiNilai });
        const modeCek = a.modeCek;
        const audit = a.audit;
        a.modeCek = false;
        a.audit = false;
        const label = hasil.nilai;
        // Tidak ada yang dikirim: spam, tidak perlu dibalas (hanya label), atau pengecekan chat yang dibisukan yang
        // ternyata tetap bukan prospek. Biaya tetap tercatat; kuota balasan pelanggan tidak terpotong.
        const diam = !!hasil.abaikan || (!!label && !hasil.teks) || (modeCek && label !== "prospek");
        tulisLatar(() => catatPakai(a.numberId, hasil, gambar.length > 0, diam));
        if (penilaian && label) {
          // Pengalaman untuk ML: label AI utama; giliran yang berujung pesanan/katalog = hasil nyata (lebih dipercaya);
          // chat dibisukan yang ternyata prospek = koreksi.
          const nyata = katalog.length > 0 && !!hasil.kirimProduk;
          catatPengalaman(nomor.id, penilaian, nyata ? "prospek" : label, nyata ? "hasil" : modeCek && label === "prospek" ? "koreksi" : "ai");
          if (audit) catatAudit(nomor.id, label === "selesai" || label === "bukan");
        }
        if (pakaiNilai && !a.dikenal && label && !hasil.abaikan) {
          const c = a.chat;
          if (label === "prospek" && c?.prospek !== STATUS.prospek) ubahStatus(kunci, a, STATUS.prospek, null);
          else if (label === "bukan" && (c?.prospek ?? STATUS.baru) === STATUS.baru) {
            const strike = (c?.strike ?? 0) + 1;
            if (strike >= BATAS_STRIKE) {
              ubahStatus(kunci, a, STATUS.bisu, `Bukan prospek: ${strike} pesan beruntun di luar urusan usaha`);
              hitung(nomor.id, "dibisukan");
              console.info(`[bridge] chat dibisukan (bukan prospek, ${strike} strike) sesi=${a.sesi}`);
            } else {
              a.chat = { ...(c ?? chatBaru(sekarang())), strike };
              simpanChat(kunci, a.chat);
            }
          }
        }
        if (diam && !hasil.abaikan) {
          if (modeCek && label !== "prospek") {
            console.info(`[bridge] chat dibisukan dicek AI: tetap bukan prospek, tidak dibalas sesi=${a.sesi}`);
            catat(a, "Jawaban yang kamu susun untuk pesan terakhir TIDAK terkirim: chat ini sedang tidak dilayani karena dinilai bukan prospek.");
          }
          a.belumDibaca.length = 0;
          a.kutip = null;
          return;
        }
        if (hasil.abaikan) {
          // Dinilai spam oleh AI: tidak dibalas, tidak ditandai dibaca, tidak memotong kuota; pemilik melihatnya di histori.
          const alasan = `Dinilai AI: ${hasil.abaikan.jenis}${hasil.abaikan.alasan ? ` (${hasil.abaikan.alasan})` : ""}`;
          console.info(`[bridge] pesan tidak dibalas, ${alasan} sesi=${a.sesi}`);
          tulisLatar(() => tandaiSpam(kunci, alasan));
          a.belumDibaca.length = 0;
          a.kutip = null;
          return;
        }
        produk = katalog.length ? hasil.kirimProduk : null;
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

    // Selagi AI menyusun jawaban (atau selagi "mengetik"), manusia bisa saja membuka chat atau membalas: jangan menimpali.
    const diambilManusia = (): boolean => {
      if (a.generasi === generasi && !sedangDijeda(a)) return false;
      if (a.batalKarena === "dibaca" && !sedangDijeda(a)) {
        a.siap = jawaban; // ditahan; lihat blok finally
        a.siapProduk = produk;
      } else catat(a, "Jawaban yang kamu susun untuk pesan sebelumnya TIDAK terkirim, karena pemilik nomor membalas sendiri.");
      return true;
    };
    if (diambilManusia()) return;

    // Seperti manusia: baca dulu, mengetik selama yang wajar untuk jawabannya, berhenti, baru kirim. Baru sekarang
    // pesan ditandai dibaca: sebelum titik ini, tanda-baca di chat hanya bisa berasal dari manusia.
    const lama = st.minMengetikMs ?? lamaMengetik(jawaban);
    a.botBacaSampai = Date.now() + skala(6_000) + lama;
    await tandaiDibaca(a.sesi, a.alamat, a.belumDibaca.splice(0));
    void mengetik(a.sesi, a.alamat, true);
    await tidur(lama);
    void mengetik(a.sesi, a.alamat, false);
    if (diambilManusia()) return;
    try {
      // Id pesan dicatat sebelum pesan berangkat, jadi tidak mungkin dikira balasan manusia.
      await kirimTeks(a.sesi, a.alamat, jawaban, (id) => ingat(st.terkirim, id, 500), kutip);
      if (a.kutip === kutip) a.kutip = null;
      a.balasanAkhir = jawaban;
      a.kirimAkhirMs = Date.now();
      statistik(a.numberId, "dibalas");
      tulisLatar(() => catatPesan({ numberId: a.numberId, kunci, peran: 1, teks: jawaban, waktu: sekarang() }));
      if (produk) await kirimKatalog(a, kunci, produk, jawaban);
    } catch (e) {
      galat(a, e);
    }
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
      jadwalkan(kunci, a, ulang || sisaJedaMs(a) + (a.dibukaManusia ? Math.max(skala(1_000), a.dibacaPada + a.tungguBacaMs - Date.now()) : a.tungguMs));
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
  // Satu query lewat dua indeks unik: keadaan chat + apakah lawan bicara sudah dikenal pemilik (penyaring tidak berlaku).
  const [r] = await sql<(Partial<BarisChat> & { tercatat: boolean; dikenal: boolean })[]>`
    SELECT c.sesi_ke, c.last_at, c.jeda_sampai, c.jendela_awal, c.jendela_n, c.prospek, c.strike, c.bisu_sampai,
           c.kunci IS NOT NULL AS tercatat, COALESCE(p.manusia_n > 0 OR p.spam = 2, false) AS dikenal
      FROM (SELECT ${kunci}::text AS k) x
      LEFT JOIN chat_state c ON c.kunci = x.k
      LEFT JOIN percakapan p ON p.kunci = x.k`;
  const { tercatat, dikenal, ...chat } = r;
  // Selagi menunggu database, event lain untuk chat yang sama tidak mungkin lewat (event satu nomor
  // diproses berurutan), tetapi tetap dijaga supaya tidak pernah ada dua antrean untuk satu chat.
  const sudah = st.antre.get(kunci);
  if (sudah) return sudah;
  const a: Antrean = {
    numberId,
    sesi,
    alamat,
    chat: tercatat ? (chat as BarisChat) : null,
    teks: [],
    belumDibaca: [],
    kutip: null,
    foto: [],
    suara: new Map(),
    timer: null,
    sedangProses: false,
    tungguMs: 5000,
    tungguBacaMs: 5000,
    generasi: 0,
    batalKarena: null,
    dibukaManusia: false,
    dibacaPada: 0,
    siap: null,
    siapProduk: null,
    catatan: [],
    botBacaSampai: 0,
    aktifSampai: Date.now() + 600_000,
    kueriLalu: "",
    ulangAi: 0,
    jedaUlangMs: 0,
    dikenal,
    balasanAkhir: null,
    kirimAkhirMs: 0,
    cepat: 0,
    masukAkhir: [],
    modeCek: false,
    audit: false,
    terlewat: null,
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

/**
 * Penyaring prospek untuk satu pesan masuk (lihat komentar di atas berkas). true = berhenti di sini: pesan sudah
 * tercatat di histori, tidak dibalas, tidak ditandai dibaca, tidak memanggil AI.
 */
async function saringProspek(kunci: string, a: Antrean, nomor: Nomor, teks: string): Promise<boolean> {
  if (!nomor.saring_prospek || a.dikenal) return false;
  const t = sekarang();

  // Detektor pola tanpa AI: lawan bicara yang bukan manusia.
  if (a.kirimAkhirMs) {
    a.cepat = Date.now() - a.kirimAkhirMs < skala(BOT_CEPAT_MS) ? a.cepat + 1 : 0;
    a.kirimAkhirMs = 0;
  }
  const pola =
    a.cepat >= BOT_BERUNTUN
      ? "membalas otomatis secepat mesin"
      : teks && gema(teks, a.balasanAkhir)
        ? "memantulkan balasan kita"
        : teks && berulang(teks, a.masukAkhir)
          ? "mengirim pesan panjang yang sama berulang-ulang"
          : null;
  if (teks) {
    a.masukAkhir.push(teks);
    if (a.masukAkhir.length > ULANG_BERUNTUN) a.masukAkhir.shift();
  }
  if (pola) {
    console.info(`[bridge] lawan bicara terdeteksi bot (${pola}) sesi=${a.sesi}: dibisukan ${BISU_BOT_DTK / 3600} jam`);
    ubahStatus(kunci, a, STATUS.bot, `Terdeteksi bot/auto-reply: ${pola}`, t + BISU_BOT_DTK);
    // Pesan bot yang masih menunggu ikut dibatalkan, termasuk jawaban yang sedang disusun.
    a.generasi += 1;
    a.batalKarena = "dibalas";
    if (a.timer) clearTimeout(a.timer);
    a.timer = null;
    a.teks.length = 0;
    a.foto.length = 0;
    a.suara.clear();
    a.belumDibaca.length = 0;
    a.kutip = null;
    a.siap = null;
    a.cepat = 0;
    a.masukAkhir.length = 0;
    return true;
  }

  const status = a.chat?.prospek ?? STATUS.baru;
  if (status === STATUS.bot) {
    if ((a.chat?.bisu_sampai ?? 0) > t) return true;
    ubahStatus(kunci, a, STATUS.baru, null);
  }

  if (status === STATUS.bisu) {
    // Dicek AI utama (tanpa mengirim kecuali AI menilai prospek) bila ada tanda minat, ML belum aktif, atau audit.
    const [pen, set] = await Promise.all([teks ? nilaiPesan(nomor.id, teks) : null, setelanMl(nomor.id)]);
    const minat = !teks || adaKataMinat(teks);
    const cek = minat || !pen || !set.aktif || layakDicek(pen, set);
    const audit = !cek && Math.random() < PELUANG_AUDIT;
    if (cek || audit) {
      a.modeCek = true;
      a.audit ||= audit;
      return false;
    }
    a.terlewat = pen;
    hitung(nomor.id, "dihemat");
    return true;
  }

  // Ucapan penutup setelah jawaban kita yang tidak bertanya, tanpa pesan lain yang menunggu: tidak perlu dijawab.
  if (teks && !a.teks.length && !a.sedangProses && a.balasanAkhir && !/\?\s*\W*$/.test(a.balasanAkhir) && penutupSaja(teks)) {
    const [pen, set] = await Promise.all([nilaiPesan(nomor.id, teks), setelanMl(nomor.id)]);
    if (pen && set.aktif && (pen.hasil.label === "selesai" || yakinLewati(pen, set))) {
      if (Math.random() < PELUANG_AUDIT) {
        a.audit = true;
        return false;
      }
      hitung(nomor.id, "dihemat");
      return true;
    }
  }
  return false;
}

/**
 * Pemilik meminta chat yang dibisukan dilayani lagi (tombol di histori). Bila chat sedang aktif di memori, keadaannya
 * diubah di sana (acuan); bila tidak, langsung di database. Pesan yang tadi dilewati dipelajari sebagai kesalahan.
 */
export async function bangunkanChat(numberId: number, kunci: string): Promise<void> {
  const a = st.antre.get(kunci);
  if (a) {
    if (a.terlewat) catatPengalaman(numberId, a.terlewat, "prospek", "koreksi");
    a.terlewat = null;
    a.cepat = 0;
    a.masukAkhir.length = 0;
    ubahStatus(kunci, a, STATUS.baru, null);
  } else {
    await st.tulis;
    const sql = await db();
    await sql`UPDATE chat_state SET prospek = ${STATUS.baru}, strike = 0, bisu_sampai = 0 WHERE kunci = ${kunci}`;
    await tandaiProspek(kunci, STATUS.baru, null);
  }
  hitung(numberId, "salah_bisu");
}

function teleponDariEvent(ev: Extract<EventWa, { jenis: "pesan" }>): string | null {
  if (ev.telepon) return ev.telepon;
  if (ev.alamat.endsWith("@s.whatsapp.net")) return digitWa(ev.alamat) || null;
  if (ev.chat.endsWith("@s.whatsapp.net")) return digitWa(ev.chat) || null;
  return null;
}

const besar = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Teks pesan untuk histori percakapan: kutipan (bila me-reply), isi, dan keterangan media. */
function teksLogPesan(ev: Extract<EventWa, { jenis: "pesan" }>): string {
  const t = ev.teks.trim();
  const label = ev.lampiran ? `[${besar(ev.media ?? (ev.foto ? "foto" : "lampiran media"))}]` : "";
  const isi = [t, label].filter(Boolean).join("\n");
  if (!isi) return "";
  return [ev.kutipan?.teks ? `↩ "${ev.kutipan.teks.slice(0, 200)}"` : "", ev.diedit ? `(diedit) ${isi}` : isi].filter(Boolean).join("\n");
}

/** Penanda tempat transkrip pesan suara di teks antrean; diganti isiTranskrip() saat giliran AI diproses. */
const PENANDA_SUARA = /⟦suara:([a-z0-9]+)⟧/g;

/**
 * Pesan pelanggan dalam kata-kata untuk AI: isi ketikan, apa yang di-reply (kutipan, termasuk dari siapa), media
 * (foto, lokasi + tautan peta, kartu kontak, dokumen, stiker, video), suntingan, dan penanda pesan suara.
 */
export function teksUntukAi(ev: Extract<EventWa, { jenis: "pesan" }>, penandaSuara: string | null): string {
  const bagian: string[] = [];
  const k = ev.kutipan;
  if (k && (k.teks || k.foto))
    bagian.push(
      `[Pelanggan me-reply ${k.dariKami ? "pesan dari pihak kita (balasanmu/tim kita)" : "pesannya sendiri"}: "${k.teks || "(foto)"}"${k.foto ? "; foto yang di-reply ikut terlampir" : ""}. Pesannya di bawah ini merujuk ke situ.]`
    );
  if (ev.diedit) bagian.push("[Pelanggan mengedit pesan sebelumnya menjadi:]");
  const t = ev.teks.trim();
  if (t) bagian.push(t);
  if (penandaSuara) bagian.push(penandaSuara);
  else if (ev.foto) bagian.push(t ? "[Pelanggan melampirkan foto]" : "[Pelanggan mengirim foto]");
  else if (ev.suara) bagian.push("[Pelanggan mengirim pesan suara yang tidak bisa kamu dengar. Minta dengan sopan agar ia mengetik pesannya.]");
  else if (ev.media) bagian.push(`[Pelanggan mengirim ${ev.media}]`);
  else if (ev.lampiran) bagian.push(t ? "[Pelanggan juga melampirkan media yang tidak bisa kamu lihat]" : "[Pelanggan mengirim media yang tidak bisa kamu lihat]");
  return bagian.join("\n");
}

/** Ganti penanda pesan suara dengan transkripnya (sudah dikerjakan sejak pesan tiba). */
async function isiTranskrip(teks: string[], suara: Map<string, Promise<string | null>>): Promise<string[]> {
  if (!suara.size) return teks;
  const hasil = new Map(await Promise.all([...suara].map(async ([k, j]) => [k, await j.catch(() => null)] as const)));
  suara.clear();
  return teks.map((t) =>
    t.replace(PENANDA_SUARA, (_, k: string) => {
      const isi = hasil.get(k);
      return isi
        ? `[Pesan suara pelanggan, sudah ditranskrip: "${isi}"]`
        : "[Pelanggan mengirim pesan suara yang gagal diputar. Minta dengan sopan agar ia mengetik pesannya.]";
    })
  );
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
  const telepon = teleponDariEvent(ev);
  const teksLog = teksLogPesan(ev);

  // Pesan yang tiba terlambat (menumpuk selagi offline, atau ditahan WhatsApp) tidak dijawab AI dan balasan lama
  // manusia tidak menjeda chat, TETAPI tetap tercatat di histori & statistik: pemilik melihatnya dan bisa membalas
  // sendiri. Dulu dibuang diam-diam, sehingga pesan yang ditahan WhatsApp berjam-jam seolah tidak pernah ada.
  const umur = ev.waktu ? sekarang() - ev.waktu : 0;
  if (umur > UMUR_PESAN_MAKS_DTK) {
    if (ev.dariSaya && st.terkirim.has(ev.id)) return;
    console.info(`[bridge] pesan ${ev.dariSaya ? "keluar" : "masuk"} terlambat ${umur} dtk sesi=${sesi}: dicatat tanpa dibalas`);
    if (!ev.dariSaya) statistik(nomor.id, "masuk");
    if (teksLog)
      tulisLatar(() =>
        catatPesan({ numberId: nomor.id, kunci, peran: ev.dariSaya ? 2 : 0, teks: teksLog, waktu: ev.waktu, telepon, nama: ev.dariSaya ? null : (ev.namaPengirim ?? null), alamat: ev.alamat })
      );
    return;
  }

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
    // Pemilik membalas sendiri: lawan bicara dikenal (penyaring prospek tidak berlaku lagi). Bila chat ini sedang
    // dibisukan, pembisuannya keliru: ML belajar dari pesan yang tadi dilewatinya.
    a.dikenal = true;
    const st0 = a.chat?.prospek ?? STATUS.baru;
    if (st0 === STATUS.bisu || st0 === STATUS.bot) {
      if (st0 === STATUS.bisu) hitung(nomor.id, "salah_bisu");
      if (a.terlewat) catatPengalaman(nomor.id, a.terlewat, "prospek", "koreksi");
      a.terlewat = null;
      ubahStatus(kunci, a, STATUS.prospek, null);
    }
    if (nomor.jeda_detik > 0) jedaChat(kunci, a, nomor.jeda_detik);
    a.generasi += 1;
    a.batalKarena = "dibalas";
    if (a.timer) clearTimeout(a.timer);
    a.timer = null;
    a.teks.length = 0;
    a.foto.length = 0;
    a.suara.clear();
    a.belumDibaca.length = 0;
    a.kutip = null;
    a.siap = null;
    a.dibukaManusia = false;
    a.modeCek = false;
    a.audit = false;
    a.aktifSampai = Date.now() + Math.max(600_000, nomor.jeda_detik * 1000);
    // AI tetap nyambung saat nanti melanjutkan: balasan ini tercatat di histori dan ikut dibaca (riwayatUntukAi).
    return;
  }

  statistik(nomor.id, "masuk");
  if (teksLog) tulisLatar(() => catatPesan({ numberId: nomor.id, kunci, peran: 0, teks: teksLog, waktu: ev.waktu || sekarang(), telepon, nama: ev.namaPengirim ?? null, alamat: ev.alamat }));
  // Bot dimatikan atau pemilik diblokir admin: pesan tetap tercatat, tapi AI tidak membalas.
  if (!nomor.bot_aktif || !nomor.pemilik_aktif) return;
  // Pesan dari nomor CS ChatGerCep (follow-up) ke nomor pelanggan: dicatat, tidak dibalas AI nomor ini. Tanpa ini dua
  // bot bisa saling membalas tanpa henti; pemilik nomor tetap membacanya dan membalas sendiri dari HP.
  const cs = st.kaitCs?.nomorCs();
  if (cs && telepon && cs.wa.has(telepon) && !cs.ids.has(nomor.id)) {
    console.info(`[bridge] pesan dari nomor CS ${MEREK} sesi=${sesi}: dicatat tanpa dibalas AI`);
    return;
  }

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

  // Pesan suara: transkripsi dimulai sekarang (selagi AI menunggu jeda balas), hasilnya dipakai saat giliran diproses.
  const kodeSuara = ev.suara && sttTerkonfigurasi() ? createHash("sha1").update(`${nomor.id}:${ev.id}`).digest("hex").slice(0, 12) : null;
  if (ev.suara && !kodeSuara) console.warn(`[bridge] pesan suara tidak ditranskrip: STT_API_KEY belum dipasang di .env (sesi=${sesi})`);
  const teks = teksUntukAi(ev, kodeSuara ? `⟦suara:${kodeSuara}⟧` : null);
  if (!teks) return;

  const a = await antreanUntuk(kunci, nomor.id, sesi, ev.alamat);
  // Nomor CS ChatGerCep: balasan atas follow-up / kode akun dari tombol "Chat CS" -> konteks untuk AI.
  if (cs?.ids.has(nomor.id) && st.kaitCs) {
    const c = await st.kaitCs.pesanMasuk({ numberId: nomor.id, kunci, teks: ev.teks, telepon }).catch((e) => {
      console.warn(`[bridge] kait CS gagal sesi=${sesi}: ${e instanceof Error ? e.message : e}`);
      return null;
    });
    if (c) catat(a, c);
  }
  // Penyaring prospek: chat dibisukan / bot / ucapan penutup yang tidak perlu dijawab berhenti di sini (tanpa AI).
  if (await saringProspek(kunci, a, nomor, ev.teks.trim())) return;
  if (kodeSuara && ev.suara) {
    const ambil = ev.suara;
    a.suara.set(
      kodeSuara,
      ambil()
        .then((au) => (au ? transkripsi(au.data, au.mime) : null))
        .then((t) => t || null)
        .catch((e) => {
          console.error(`[bridge] transkripsi pesan suara gagal sesi=${sesi}: ${e instanceof Error ? e.message : e}`);
          return null;
        })
    );
  }
  a.alamat = ev.alamat;
  a.tungguMs = st.tungguMs ?? acakTunggu(nomor.tunggu_detik * 1000);
  a.tungguBacaMs = acakTunggu(nomor.tunggu_baca_detik * 1000);
  if (a.siap) {
    // Jawaban yang ditahan jadi basi: pelanggan menambah pesan sebelum jawaban itu terkirim.
    a.siap = null;
    catat(a, "Jawaban yang kamu susun untuk pesan sebelumnya BELUM terkirim ke lawan bicara; jawab juga hal itu sekarang.");
  }
  a.teks.push(teks);
  // Foto pesan ini, atau foto yang di-reply pelanggan (supaya AI melihat produk yang dimaksud).
  const foto = ev.foto ?? ev.kutipan?.foto ?? null;
  if (foto) {
    a.foto.push(foto);
    if (a.foto.length > MAKS_FOTO_GILIRAN) a.foto.shift();
  }
  a.belumDibaca.push(ev.id);
  if (a.belumDibaca.length > MAKS_BELUM_DIBACA) a.belumDibaca.shift();
  a.kutip = ev.kutip ?? null;
  // Pesan baru: manusia diberi kesempatan dari awal. Bila chat masih terbuka di HP, tanda-baca untuk
  // pesan ini segera menyusul (atau baru saja tiba lebih dulu) dan masa tunggunya jadi yang panjang.
  a.dibukaManusia = Date.now() - a.dibacaPada < skala(3_000);
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
