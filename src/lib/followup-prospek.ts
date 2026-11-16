import "server-only";
import { type Sql, db, getSetting, sekarang, setSetting } from "./db";
import { bakukanTag, catatPakai, tanyaAi } from "./ai";
import { formatWa, kirimSapaan } from "./bridge";
import { ATURAN_LEWATI, type HasilSusun, ambilLewati } from "./followup-aman";
import {
  BATAS_PESAN,
  BATAS_SETELAN_PROSPEK,
  type BarisProspek,
  POLA_STOP,
  POLA_STOP_PENDEK,
  SETELAN_PROSPEK_AWAL,
  type SetelanProspek,
  type StatusMesinProspek,
  type StatusProspek,
} from "./followup-def";
import { MASA_ID } from "./jaminan-def";
import { susunSistem } from "./knowledge";
import { aiUntukAkun, daftarPaket } from "./langganan";
import { MEREK } from "./merek";
import { type Nomor, nomorById } from "./numbers";
import { periksaJawaban } from "./pemeriksa";
import { adaKode } from "./penjaga";
import { riwayatUntukAi } from "./percakapan";
import { PenggunaError } from "./pengguna";
import { LURUH_MINAT_DTK, ambilNilai, minatEfektif } from "./prospek-def";
import { WaError, infoSesi } from "./wa";

/**
 * Follow-up prospek di nomor CS ChatGerCep (docs/plans/2026-11-13-minat-lead-dan-followup-prospek.md).
 *
 * Siapa: orang yang chat DULUAN ke nomor CS, dinilai prospek dengan minat hangat/panas (tag <minat> AI utama), sudah
 * dijawab bot (pesan terakhir di chat dari bot), lalu diam. Tidak pernah memulai chat baru, tidak menyentuh chat yang
 * sedang ditangani follow-up akun (followup.ts), pelanggan yang sudah berlangganan, chat spam/bisu/bot, atau yang
 * pernah minta berhenti.
 *
 * Ritme: pesan 1 setelah lead diam `jedaPanasJam`/`jedaHangatJam`, pesan 2 `tahap2Jam` kemudian, pesan 3 (pamit)
 * `tahap3Jam` kemudian; paling banyak `maksTahap` pesan per siklus. Begitu ia membalas, follow-up berhenti dan
 * percakapan dilayani AI seperti biasa. Siklus baru hanya bila ia chat lagi (ada pesan masuk sesudah siklus lama).
 *
 * Isi: hard selling paket ChatGerCep, ditulis AI per orang dari riwayat chat-nya, pengetahuan nomor CS, dan daftar paket
 * aktif dari database (<paket_nyata>), dengan teknik persuasi per tahap (lanjutan + rekomendasi paket + balas budi,
 * takut rugi + jangkar harga + bukti sosial nyata, pesan pamit + pembalik risiko). AI lebih dulu menilai riwayat dan
 * melewati chat yang tidak pantas dikejar (followup-aman.ts: <lewati>). Fakta diperiksa pemeriksa.ts terhadap sumbernya; kelangkaan/batas waktu palsu, tautan berlebih,
 * dan harga karangan ditolak (cadangan: templat).
 *
 * Anti-blokir: jam kerja, batas harian, jeda acak, dan rem centang satu dipakai BERSAMA follow-up akun (followup.ts
 * memanggil modul ini dari putarannya). Pesan berikutnya tidak dikirim bila pesan sebelumnya tidak sampai ke HP.
 *
 * Hemat resource: pemindaian tiap 5 menit lewat indeks parsial percakapan_lead_idx (hanya chat prospek hangat/panas
 * di rentang 3 hari), pengiriman lewat followup_prospek_jalan_idx. Pesan masuk di nomor CS hanya membaca memori.
 */

const KUNCI_SETELAN = "followup_prospek";
const PINDAI_MS = 5 * 60_000;
/** Lead yang diam lebih lama dari ini saat dipindai tidak diantrekan (follow-up selalu dekat dengan percakapannya). */
const JENDELA_DTK = 3 * 86400;
const PANTAU_DTK = 14 * 86400;
/** Draf disiapkan menjelang jadwal (pratinjau admin), paling banyak sekian per putaran. */
const DRAF_PER_PUTARAN = 2;
const DRAF_SEBELUM_DTK = 6 * 3600;

interface InfoAktif {
  teks: string | null;
  dicatat: boolean;
}

interface Keadaan {
  aktif: Map<string, InfoAktif>;
  ack: Map<string, { kunci: string; slot: 1 | 2 | 3; ack: number }>;
  pindaiPada: number;
  dimuat: boolean;
  bukti: { pada: number; teks: string } | null;
  paket?: { pada: number; teks: string } | null;
}

const g = globalThis as unknown as { __waFollowupProspek?: Keadaan };
const st: Keadaan = (g.__waFollowupProspek ??= { aktif: new Map(), ack: new Map(), pindaiPada: 0, dimuat: false, bukti: null });

const asal = (): string => (process.env.APP_URL || "https://chatgercep.com").replace(/\/+$/, "");

// ---------- Pengaturan ----------

const dalamRentang = (v: unknown, [min, maks]: readonly [number, number], bawaan: number): number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= maks ? v : bawaan;

function uraiSetelan(mentah: string | null): SetelanProspek {
  let v: Partial<SetelanProspek> = {};
  try {
    v = JSON.parse(mentah ?? "{}") ?? {};
  } catch {
    v = {};
  }
  const a = SETELAN_PROSPEK_AWAL;
  const b = BATAS_SETELAN_PROSPEK;
  return {
    aktif: v.aktif === true,
    jedaPanasJam: dalamRentang(v.jedaPanasJam, b.jedaPanasJam, a.jedaPanasJam),
    jedaHangatJam: dalamRentang(v.jedaHangatJam, b.jedaHangatJam, a.jedaHangatJam),
    tahap2Jam: dalamRentang(v.tahap2Jam, b.tahap2Jam, a.tahap2Jam),
    tahap3Jam: dalamRentang(v.tahap3Jam, b.tahap3Jam, a.tahap3Jam),
    maksTahap: dalamRentang(v.maksTahap, b.maksTahap, a.maksTahap),
  };
}

export async function pengaturanProspek(): Promise<SetelanProspek> {
  return uraiSetelan(await getSetting(KUNCI_SETELAN));
}

export async function simpanPengaturanProspek(s: SetelanProspek): Promise<SetelanProspek> {
  const bersih = uraiSetelan(JSON.stringify(s));
  await setSetting(KUNCI_SETELAN, JSON.stringify(bersih));
  st.pindaiPada = 0; // pindai di putaran berikutnya
  return bersih;
}

// ---------- Pemindaian lead yang diam ----------

/** Jeda pesan 1 sesuai tingkat minat (2 = panas). */
const jedaAwalDtk = (s: SetelanProspek, minat: number): number => (minat >= 2 ? s.jedaPanasJam : s.jedaHangatJam) * 3600;

/**
 * Fragmen: nomor lawan bicara chat `p` tertaut ke akun yang langganannya masih aktif (pelanggan sendiri, bukan lead).
 * Cocok lewat chat yang ditautkan (users.cs_kunci), nomor yang di-scan, atau nomor "teruskan ke" milik akun itu.
 */
const sudahBerlangganan = (sql: Sql, t: number) => sql`
  EXISTS (
    SELECT 1 FROM users u JOIN langganan l ON l.user_id = u.id AND l.sampai > ${t}
     WHERE u.cs_kunci = p.kunci
        OR u.id IN (SELECT n.user_id FROM numbers n WHERE n.user_id IS NOT NULL AND (n.wa_id = p.telepon OR n.teruskan_ke = p.telepon)))`;

/**
 * Antrekan lead yang diam. Lewat percakapan_lead_idx: chat prospek hangat/panas nomor CS dengan aktivitas terakhir
 * dalam JENDELA_DTK yang sudah lewat jeda pesan 1 terpendek. Siklus lama (bukan "jalan"/"stop") hanya diganti bila ia
 * chat lagi sesudah siklus itu dimulai.
 */
export async function pindaiProspek(cs: Nomor, s: SetelanProspek): Promise<number> {
  const sql = await db();
  const t = sekarang();
  const jedaMin = Math.min(s.jedaPanasJam, s.jedaHangatJam) * 3600;
  const kandidat = await sql<{ kunci: string; telepon: string | null; nama: string | null; terakhir_pada: number; minat: number }[]>`
    SELECT p.kunci, p.telepon, p.nama, p.terakhir_pada,
           (p.minat - (${t} - p.minat_pada) / ${LURUH_MINAT_DTK})::int AS minat
      FROM percakapan p
     WHERE p.number_id = ${cs.id} AND p.prospek = 1 AND p.minat >= 1
       AND p.terakhir_pada >= ${t - JENDELA_DTK} AND p.terakhir_pada <= ${t - jedaMin}
       AND p.minat - (${t} - p.minat_pada) / ${LURUH_MINAT_DTK} >= 1
       AND p.pengirim_akhir = 1 AND p.spam <> 1 AND p.masuk_n > 0
       AND (p.beli_pada IS NULL OR p.beli_pada < p.minat_pada)
       AND (SELECT m.peran FROM pesan_chat m WHERE m.percakapan_id = p.id ORDER BY m.id LIMIT 1) = 0
       AND NOT EXISTS (SELECT 1 FROM followup_stop fs WHERE fs.kunci = p.kunci)
       AND NOT EXISTS (SELECT 1 FROM followup f WHERE f.kunci = p.kunci AND f.status IN ('antre', 'terkirim', 'dibalas'))
       AND NOT EXISTS (
             SELECT 1 FROM followup_prospek fp
              WHERE fp.kunci = p.kunci
                AND (fp.status IN ('jalan', 'stop')
                     OR NOT EXISTS (SELECT 1 FROM pesan_chat m WHERE m.percakapan_id = p.id AND m.peran = 0 AND m.waktu > fp.siklus)))
       AND NOT ${sudahBerlangganan(sql, t)}
     ORDER BY p.terakhir_pada DESC, p.id DESC
     LIMIT 50`;
  let masuk = 0;
  for (const k of kandidat) {
    const jadwal = k.terakhir_pada + jedaAwalDtk(s, k.minat);
    const r = await sql`
      INSERT INTO followup_prospek (kunci, number_id, status, tujuan, nama, minat, tahap, jadwal, siklus, dibuat, diperbarui)
      VALUES (${k.kunci}, ${cs.id}, 'jalan', ${k.telepon}, ${k.nama}, ${k.minat}, 0, ${jadwal}, ${k.terakhir_pada}, ${t}, ${t})
      ON CONFLICT (kunci) DO UPDATE SET
        number_id = EXCLUDED.number_id, status = 'jalan', tujuan = EXCLUDED.tujuan, nama = EXCLUDED.nama, minat = EXCLUDED.minat,
        tahap = 0, jadwal = EXCLUDED.jadwal, siklus = EXCLUDED.siklus, dibuat = EXCLUDED.dibuat, diperbarui = EXCLUDED.diperbarui,
        draf = NULL, pesan1 = NULL, pesan2 = NULL, pesan3 = NULL, pesan1_id = NULL, pesan2_id = NULL, pesan3_id = NULL,
        terkirim1 = NULL, terkirim2 = NULL, terkirim3 = NULL, ack1 = 0, ack2 = 0, ack3 = 0, dibalas = NULL, alasan = NULL
       WHERE followup_prospek.status NOT IN ('jalan', 'stop')`;
    masuk += r.count;
  }
  if (masuk) console.info(`[followup-prospek] ${masuk} lead yang diam masuk antrean`);
  return masuk;
}

// ---------- Penyusun pesan ----------

interface ChatLead {
  id: number;
  kunci: string;
  alamat: string | null;
  telepon: string | null;
  nama: string | null;
  prospek: number;
  spam: number;
  minat: number | null;
  minat_pada: number | null;
}

async function chatLead(kunci: string): Promise<ChatLead | undefined> {
  const sql = await db();
  const [c] = await sql<ChatLead[]>`
    SELECT id, kunci, alamat, telepon, nama, prospek, spam, minat, minat_pada FROM percakapan WHERE kunci = ${kunci}`;
  return c;
}

/**
 * Bukti sosial yang NYATA (dari database, dibulatkan ke bawah): usaha yang memakai nomor WA tertaut dan balasan AI
 * 30 hari terakhir (ai_pakai lewat indeks BRIN waktu). Hanya disebut bila angkanya meyakinkan. Disimpan 1 jam di memori.
 */
async function buktiNyata(): Promise<string> {
  if (st.bukti && Date.now() - st.bukti.pada < 3600_000) return st.bukti.teks;
  const sql = await db();
  const t = sekarang();
  const [[u], [b]] = await Promise.all([
    sql<{ n: number }[]>`SELECT COUNT(DISTINCT user_id)::int AS n FROM numbers WHERE user_id IS NOT NULL AND wa_id IS NOT NULL`,
    sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM ai_pakai WHERE waktu >= ${t - 30 * 86400} AND NOT abaikan`,
  ]);
  const bulat = (n: number): number => (n >= 10_000 ? Math.floor(n / 1000) * 1000 : n >= 1000 ? Math.floor(n / 100) * 100 : Math.floor(n / 10) * 10);
  const fakta: string[] = [];
  if ((u?.n ?? 0) >= 20) fakta.push(`Lebih dari ${bulat(u.n).toLocaleString("id-ID")} usaha sudah menyambungkan nomor WhatsApp-nya ke ${MEREK}.`);
  if ((b?.n ?? 0) >= 1000) fakta.push(`Dalam 30 hari terakhir AI ${MEREK} sudah membalas lebih dari ${bulat(b.n).toLocaleString("id-ID")} chat pelanggan.`);
  const teks = fakta.join("\n");
  st.bukti = { pada: Date.now(), teks };
  return teks;
}

/**
 * Paket ChatGerCep yang aktif dijual (database, sumber harga yang pasti terbaru), disimpan 10 menit di memori. Dipakai
 * follow-up prospek & follow-up akun (followup.ts) supaya harga & rekomendasi paket tidak pernah karangan.
 */
export async function paketNyata(): Promise<string> {
  if (st.paket && Date.now() - st.paket.pada < 600_000) return st.paket.teks;
  const daftar = await daftarPaket().catch(() => []);
  const rp = (n: number): string => `Rp${n.toLocaleString("id-ID")}`;
  const teks = daftar
    .filter((p) => p.harga > 0)
    .map((p) => `- ${p.nama}: ${rp(p.harga)} / ${p.durasi_hari} hari, ${p.kuota_balasan.toLocaleString("id-ID")} balasan AI, ${p.kuota_nomor} nomor WhatsApp${p.unggulan ? " (paling banyak dipilih)" : ""}${p.deskripsi ? `. ${p.deskripsi.replace(/\s+/g, " ").slice(0, 160)}` : ""}`)
    .join("\n");
  st.paket = { pada: Date.now(), teks };
  return teks;
}

export const POLA_TAUTAN = /(https?:\/\/[^\s]+|www\.[^\s]+|wa\.me\/[^\s]*)/gi;
/** Kelangkaan / batas waktu buatan: tidak pernah boleh (promo nyata pun cukup disebut tanpa desakan waktu karangan). */
export const POLA_DESAK =
  /\b((hanya|cuma|khusus|berlaku)\s+(hari ini|malam ini|sampai (nanti )?malam|besok)|sisa\s+\d+\s*(slot|kuota|kursi|tempat)|(promo|diskon|harga)\s+(ini\s+)?(berakhir|habis|naik)\s+(hari ini|malam ini|besok|segera)|kesempatan terakhir|terbatas hari ini)\b/i;

type Tahap = 1 | 2 | 3;

const PANDUAN_TAHAP: Record<Tahap, string> = {
  1: [
    "Ini pesan follow-up PERTAMA (tahap lanjutan). Teknik:",
    "- Lingkaran terbuka: lanjutkan TEPAT dari hal terakhir yang ia tanyakan atau bahas (sebut topiknya / usahanya), jangan menyapa seperti orang baru.",
    "- Rekomendasi: bila usahanya / perkiraan jumlah chat-nya terlihat di riwayat, sebut SATU paket dari <paket_nyata> yang paling pas beserta alasannya (kuota cukup untuk chat-nya, jumlah nomor).",
    "- Balas budi: beri satu hal berguna yang belum ia dapat, misalnya gambaran singkat bagaimana AI membalas pelanggan di usahanya, atau tawaran mencoba bila pengetahuan menyebut ada uji coba gratis.",
    "- Jawab duluan satu keberatan yang paling mungkin membuatnya ragu (harga, takut ribet, takut AI salah jawab, takut nomor diblokir), singkat dan pakai fakta dari pengetahuan.",
    "- Tutup dengan SATU pertanyaan penutupan yang gampang dijawab (ya/tidak, atau pilih paket A/B). Jangan menutup dengan \"ada yang bisa dibantu?\".",
    "- 2 sampai 4 kalimat, paling panjang 420 karakter.",
  ].join("\n"),
  2: [
    "Ini pesan follow-up KEDUA (nilai & bukti), pesan pertamamu belum dibalas. Teknik:",
    "- Takut rugi: gambarkan kerugian nyata bila chat pelanggan telat dibalas (pelanggan pindah ke toko lain, chat malam/akhir pekan terbengkalai, admin kewalahan), kaitkan dengan usahanya bila diketahui.",
    "- Jangkar harga: bila menyebut harga, pakai harga paket PERSIS dari <paket_nyata> / pengetahuan; boleh dipecah per hari atau dibandingkan dengan biaya admin manusia (hitung dengan benar, dibulatkan ke atas).",
    "- Bukti sosial: HANYA dari blok <bukti_nyata> bila ada. Tanpa blok itu, jangan menyebut jumlah pengguna atau testimoni apa pun.",
    "- Ajakan tegas ke langkah berikut yang jelas (pilih paket / daftar / balas \"ya\" supaya dibantu aktifkan).",
    "- Jangan mengulang kalimat pesan follow-up sebelumnya. 3 sampai 5 kalimat, paling panjang 560 karakter.",
  ].join("\n"),
  3: [
    "Ini pesan follow-up TERAKHIR (pamit), dua pesan sebelumnya belum dibalas. Teknik:",
    "- Pesan pamit: bilang terus terang ini pesan terakhir darimu soal ini, kamu tidak akan mengganggu lagi.",
    `- Pembalik risiko: sebut jaminan uang kembali ${MASA_ID} untuk pembayaran pertama (GoPay, ShopeePay, atau QRIS) bila sesuai pengetahuan.`,
    "- Pintu tetap terbuka: cukup balas chat ini kapan pun ia siap.",
    "- Jangan mengulang kalimat pesan sebelumnya. 2 sampai 3 kalimat, paling panjang 400 karakter.",
  ].join("\n"),
};

const BATAS_KARAKTER: Record<Tahap, number> = { 1: 600, 2: 760, 3: 560 };

function templat(tahap: Tahap, panas: boolean): string {
  const pilih = <T,>(x: T[]): T => x[Math.floor(Math.random() * x.length)];
  if (tahap === 1)
    return panas
      ? pilih([
          `Kak, tadi sudah sampai mana? Kalau mau langsung aktif, aku bantu pilihkan paket yang pas dan cara bayarnya ya. Mau lanjut sekarang?`,
          `Kak, pesanan paketnya mau aku bantu lanjutkan sekarang? Tinggal pilih paketnya, sisanya aku pandu sampai AI-nya jalan.`,
        ])
      : pilih([
          `Kak, soal yang tadi ditanyakan, ada yang masih bikin ragu? Kalau mau, aku bantu hitungkan paket yang paling pas untuk jumlah chat di usaha Kakak. Mau?`,
          `Kak, tadi sempat tanya soal ${MEREK}. Biar gampang, aku bisa bantu cek paket yang cocok untuk usaha Kakak. Boleh aku bantu?`,
        ]);
  if (tahap === 2)
    return pilih([
      `Kak, sekadar gambaran: chat pelanggan yang baru dibalas berjam-jam kemudian sering keburu pindah ke toko lain. Dengan ${MEREK}, setiap chat langsung dibalas AI 24 jam. Mau aku bantu aktifkan sekarang?`,
      `Kak, banyak pelanggan yang chat malam atau saat admin sibuk, dan tidak semuanya mau menunggu. ${MEREK} bikin semua chat itu langsung dibalas. Mau aku pandu mulai hari ini?`,
    ]);
  return pilih([
    `Kak, ini pesan terakhir dariku soal ini ya, aku tidak akan mengganggu lagi 🙏 Kalau nanti siap mencoba, ada jaminan uang kembali ${MASA_ID} untuk pembayaran pertama. Cukup balas chat ini kapan saja.`,
    `Kak, aku pamit dulu ya, ini pesan terakhir dariku 🙏 Kapan pun Kakak siap, tinggal balas chat ini, dan pembayaran pertama dilindungi jaminan uang kembali ${MASA_ID}.`,
  ]);
}

/** Pelanggaran khusus follow-up (selain pemeriksa.ts): null = lolos. */
function periksaFollowup(teks: string, tahap: Tahap, panas: boolean): string | null {
  if (teks.length < 30 || teks.length > BATAS_KARAKTER[tahap]) return `panjang ${teks.length} karakter`;
  if (adaKode(teks)) return "berisi kode";
  if (POLA_DESAK.test(teks)) return "kelangkaan / batas waktu buatan";
  const tautan = teks.match(POLA_TAUTAN) ?? [];
  if (tautan.length > 1) return "lebih dari satu tautan";
  if (tautan.length === 1) {
    if (!panas && tahap !== 3) return "tautan di pesan follow-up lead hangat";
    if (!tautan[0].replace(/^https?:\/\//, "").startsWith(asal().replace(/^https?:\/\//, ""))) return "tautan selain situs sendiri";
  }
  return null;
}

/**
 * Satu pesan follow-up yang ditulis AI dari riwayat chat orang ini, pengetahuan nomor CS, dan paket aktif. Gagal /
 * melanggar dua kali = templat. Biaya AI dicatat di nomor CS tanpa memotong kuota balasannya. `bolehLewati`: AI boleh
 * memutuskan chat ini tidak pantas di-follow-up ({ lewati }).
 */
async function susunPesan(cs: Nomor, chat: ChatLead, tahap: Tahap, minat: number, sebelumnya: string[], bolehLewati = true): Promise<HasilSusun> {
  const panas = minat >= 2;
  const cadangan = { teks: templat(tahap, panas) };
  try {
    const riwayat = await riwayatUntukAi(chat.kunci, { sesiBaru: false, tertunda: 0, lengkap: true });
    const kueri = riwayat.slice(-6).join("\n");
    const [{ sistem: dasar }, bukti, paket, ai] = await Promise.all([
      susunSistem(cs, kueri, { riwayat, riwayatLengkap: true }),
      buktiNyata(),
      paketNyata(),
      aiUntukAkun(cs.user_id),
    ]);
    const instruksi = [
      "<tugas_follow_up>",
      ...(bolehLewati ? [ATURAN_LEWATI] : []),
      `Lawan bicara di chat ini tadi bertanya soal ${MEREK} (dinilai ${panas ? "SIAP MEMBELI (lead panas)" : "tertarik serius (lead hangat)"}), sudah kamu jawab, lalu tidak membalas lagi.`,
      "Tulis SATU pesan WhatsApp follow-up untuk membujuknya berlangganan. Ini hard selling: yakinkan dengan tegas, tetapi jujur dan sopan.",
      PANDUAN_TAHAP[tahap],
      panas
        ? `Karena ia sudah siap membeli: langsung ke penutupan. Sebut paket yang paling cocok menurut percakapannya dan langkah bayarnya; boleh SATU tautan ${asal()}/langganan.`
        : tahap === 3
          ? `Boleh SATU tautan ${asal()}/langganan, tidak wajib.`
          : "JANGAN menulis tautan apa pun di pesan ini.",
      "Aturan wajib:",
      "- Bahasa Indonesia santai seperti CS manusia, ikuti cara menyapa yang sudah dipakai di chat ini (mis. \"Kak\"). Paling banyak 1 emoji.",
      "- Semua harga, paket, fitur, promo, dan jaminan HANYA dari pengetahuan nomor ini atau blok di bawah. Tidak ada di sana = jangan disebut.",
      "- DILARANG: kelangkaan atau batas waktu yang dibuat-buat (\"hanya hari ini\", \"sisa 3 slot\", \"promo berakhir malam ini\"), testimoni / nama pelanggan / angka pengguna karangan, janji hasil (\"pasti laris\"), menyebut dirimu bot atau follow-up otomatis.",
      ...(sebelumnya.length ? ["Pesan follow-up yang sudah kamu kirim (jangan diulang):", ...sebelumnya.map((p, i) => `${i + 1}. ${p}`)] : []),
      "Tulis isi pesannya saja, tanpa tanda kutip, judul, tag, atau penjelasan.",
      "</tugas_follow_up>",
      bukti ? `<bukti_nyata>\n${bukti}\n</bukti_nyata>` : "",
      paket ? `<paket_nyata>\nPaket ${MEREK} yang dijual sekarang (harga pasti terbaru):\n${paket}\n</paket_nyata>` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const sistem = `${dasar}\n\n${instruksi}`;
    const sumber = [sistem, ...riwayat].join("\n");
    let umpan = "";
    for (let coba = 0; coba < 2; coba++) {
      const hasil = await tanyaAi({
        sessionId: `followup-prospek-${chat.id}-${tahap}-${Date.now()}-${coba}`,
        sistem: umpan ? `${sistem}\n\n${umpan}` : sistem,
        pesan: `Tulis pesan follow-up tahap ${tahap} sekarang.`,
        timeoutMs: 60_000,
        paksa: { penyedia: ai.penyedia },
        cadanganHermes: ai.cadanganHermes,
      });
      void catatPakai(cs.id, hasil, false, true).catch(() => {});
      const lewati = bolehLewati ? ambilLewati(hasil.teks) : null;
      if (lewati) {
        console.info(`[followup-prospek] AI melewati chat ${chat.id}: ${lewati}`);
        return { lewati };
      }
      const teks = formatWa(ambilNilai(bakukanTag(hasil.teks)).teks.replace(/<\/?[a-z_]+[^>]*>/gi, "").replace(/^["'“”]+|["'“”]+$/g, "").trim());
      const salah = periksaFollowup(teks, tahap, panas);
      // Tawaran membantu ("aku bantu cek paketnya") memang inti follow-up, jadi pemeriksaan "janji" & gaya tidak dipakai;
      // yang diperiksa: angka/harga/tautan tak bersumber, mengaku manusia/pemilik, dan menyebut mesin AI.
      const fakta = periksaJawaban(teks, sumber).filter((p) => p.jenis !== "robotik" && p.jenis !== "janji");
      if (!salah && !fakta.length) return { teks };
      console.warn(`[followup-prospek] pesan AI tahap ${tahap} ditolak (${salah ?? fakta.map((f) => f.jenis).join(",")})`);
      umpan = `Draf sebelumnya DITOLAK: ${salah ?? `ada fakta yang tidak ada di sumber (${fakta.map((f) => `"${f.kutipan}"`).join(", ")})`}. Tulis ulang dan patuhi semua aturan.`;
    }
    return cadangan;
  } catch (e) {
    console.warn(`[followup-prospek] AI gagal menyusun pesan: ${e instanceof Error ? e.message : e}`);
    return cadangan;
  }
}

// ---------- Pengiriman (dipanggil putaran followup.ts) ----------

type BarisJalan = Pick<BarisProspek, "kunci" | "status" | "tahap" | "minat" | "jadwal" | "draf" | "pesan1" | "pesan2" | "pesan3" | "ack1" | "ack2" | "ack3"> & {
  siklus: number;
  number_id: number;
};

async function ubah(kunci: string, status: StatusProspek, alasan: string | null, dibalas?: number): Promise<false> {
  const sql = await db();
  await sql`
    UPDATE followup_prospek SET status = ${status}, alasan = ${alasan}, diperbarui = ${sekarang()}, dibalas = COALESCE(${dibalas ?? null}::bigint, dibalas)
     WHERE kunci = ${kunci}`;
  if (status !== "jalan") {
    const v = st.aktif.get(kunci);
    if (v) v.dicatat = true;
  }
  return false;
}

async function tunda(kunci: string, detik: number, alasan: string): Promise<void> {
  const sql = await db();
  const t = sekarang();
  await sql`UPDATE followup_prospek SET jadwal = ${t + detik}, alasan = ${alasan}, diperbarui = ${t} WHERE kunci = ${kunci}`;
}

async function masukSejak(percakapanId: number, sejak: number): Promise<boolean> {
  const sql = await db();
  const [r] = await sql`SELECT 1 FROM pesan_chat WHERE percakapan_id = ${percakapanId} AND peran = 0 AND waktu > ${sejak} LIMIT 1`;
  return !!r;
}

/** Pemeriksaan sebelum menulis/mengirim. null = boleh lanjut; selain itu baris sudah diubah statusnya. */
async function periksaBaris(b: BarisJalan, chat: ChatLead | undefined): Promise<string | null> {
  const sql = await db();
  const t = sekarang();
  if (!chat) return (await ubah(b.kunci, "batal", "Chat sudah terhapus"), "hapus");
  const [s] = await sql<{ stop: boolean; akun: boolean; langganan: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM followup_stop WHERE kunci = ${b.kunci}) AS stop,
           EXISTS (SELECT 1 FROM followup f WHERE f.kunci = ${b.kunci} AND f.status IN ('antre', 'terkirim', 'dibalas')) AS akun,
           ${sudahBerlangganan(sql, t)} AS langganan
      FROM percakapan p WHERE p.kunci = ${b.kunci}`;
  if (s?.stop) return (await ubah(b.kunci, "stop", "Chat ini pernah meminta tidak dihubungi lagi"), "stop");
  if (chat.prospek !== 1 || chat.spam === 1) return (await ubah(b.kunci, "batal", "Chat tidak lagi berstatus prospek / ditandai spam"), "status");
  if (s?.akun) return (await ubah(b.kunci, "batal", "Sedang ditangani follow-up akun"), "akun");
  if (s?.langganan) return (await ubah(b.kunci, "batal", "Sudah berlangganan"), "langganan");
  if (await masukSejak(chat.id, b.siklus)) {
    if (b.tahap > 0) return (await ubah(b.kunci, "dibalas", null, t), "dibalas");
    return (await ubah(b.kunci, "batal", "Lawan bicara chat lagi sebelum follow-up"), "chat");
  }
  const ackAkhir = [b.ack1, b.ack2, b.ack3][b.tahap - 1];
  if (b.tahap > 0 && ackAkhir < 3) return (await ubah(b.kunci, "selesai", "Pesan sebelumnya tidak sampai ke HP (centang satu): pesan berikutnya tidak dikirim"), "ack");
  if ((minatEfektif(chat.minat, chat.minat_pada, t) ?? 0) < 1) return (await ubah(b.kunci, "selesai", "Minat beli sudah dingin"), "dingin");
  return null;
}

const sebelumnyaDari = (b: Pick<BarisProspek, "pesan1" | "pesan2" | "pesan3">): string[] => [b.pesan1, b.pesan2, b.pesan3].filter((x): x is string => !!x);

/** Satu baris yang jatuh tempo. true = satu pesan terkirim (putaran berhenti, jeda acak berlaku). */
async function prosesSatu(b: BarisJalan, s: SetelanProspek, cs: Nomor): Promise<boolean> {
  const chat = await chatLead(b.kunci);
  if (await periksaBaris(b, chat)) return false;
  const c = chat as ChatLead;
  const alamat = c.alamat ?? (c.telepon ? `${c.telepon}@s.whatsapp.net` : null);
  if (!alamat) return ubah(b.kunci, "batal", "Alamat chat tidak diketahui");
  const tahap = (b.tahap + 1) as Tahap;
  const susun = b.draf ? { teks: b.draf } : await susunPesan(cs, c, tahap, b.minat, sebelumnyaDari(b));
  if ("lewati" in susun) return ubah(b.kunci, b.tahap > 0 ? "selesai" : "batal", `Dilewati AI: ${susun.lewati}`);
  const teks = susun.teks;
  // Pemeriksaan terakhir: selagi AI menulis, ia bisa saja membalas.
  if (await masukSejak(c.id, b.siklus)) return ubah(b.kunci, b.tahap > 0 ? "dibalas" : "batal", b.tahap > 0 ? null : "Lawan bicara chat lagi sebelum follow-up", b.tahap > 0 ? sekarang() : undefined);
  if (infoSesi(cs.sesi).status !== "WORKING") return false;

  let id: string;
  try {
    id = await kirimSapaan({ numberId: cs.id, sesi: cs.sesi, alamat, kunci: c.kunci, teks });
  } catch (e) {
    const pesan = e instanceof Error ? e.message : String(e);
    console.warn(`[followup-prospek] gagal mengirim ke chat ${c.id}: ${pesan}`);
    if (e instanceof WaError) await tunda(b.kunci, 1800, `Nomor CS tidak terhubung: ${pesan}`);
    else if (sekarang() - b.jadwal > 2 * 86400) await ubah(b.kunci, "gagal", pesan.slice(0, 200));
    else await tunda(b.kunci, 3600, `Gagal mengirim, dicoba lagi: ${pesan.slice(0, 160)}`);
    return false;
  }

  const sql = await db();
  const kini = sekarang();
  const lanjut = tahap < s.maksTahap;
  const jadwal = kini + (tahap === 1 ? s.tahap2Jam : s.tahap3Jam) * 3600;
  const status: StatusProspek = lanjut ? "jalan" : "selesai";
  const alasan = lanjut ? null : "Semua pesan follow-up terkirim";
  // Kolom per tahap ditulis lewat CASE supaya satu pernyataan untuk ketiga tahap.
  await sql`
    UPDATE followup_prospek SET
      status = ${status}, tahap = ${tahap}, jadwal = ${jadwal}, draf = NULL, alasan = ${alasan}, diperbarui = ${kini},
      tujuan = ${c.telepon}, nama = ${c.nama},
      pesan1 = CASE WHEN ${tahap} = 1 THEN ${teks} ELSE pesan1 END, pesan1_id = CASE WHEN ${tahap} = 1 THEN ${id} ELSE pesan1_id END,
      terkirim1 = CASE WHEN ${tahap} = 1 THEN ${kini}::bigint ELSE terkirim1 END, ack1 = CASE WHEN ${tahap} = 1 THEN 1 ELSE ack1 END,
      pesan2 = CASE WHEN ${tahap} = 2 THEN ${teks} ELSE pesan2 END, pesan2_id = CASE WHEN ${tahap} = 2 THEN ${id} ELSE pesan2_id END,
      terkirim2 = CASE WHEN ${tahap} = 2 THEN ${kini}::bigint ELSE terkirim2 END, ack2 = CASE WHEN ${tahap} = 2 THEN 1 ELSE ack2 END,
      pesan3 = CASE WHEN ${tahap} = 3 THEN ${teks} ELSE pesan3 END, pesan3_id = CASE WHEN ${tahap} = 3 THEN ${id} ELSE pesan3_id END,
      terkirim3 = CASE WHEN ${tahap} = 3 THEN ${kini}::bigint ELSE terkirim3 END, ack3 = CASE WHEN ${tahap} = 3 THEN 1 ELSE ack3 END
     WHERE kunci = ${b.kunci}`;
  st.ack.set(id, { kunci: b.kunci, slot: tahap, ack: 1 });
  st.aktif.set(b.kunci, { teks, dicatat: false });
  console.info(`[followup-prospek] pesan tahap ${tahap} terkirim ke chat ${c.id} lewat nomor CS ${cs.id}`);
  return true;
}

/**
 * Bagian follow-up prospek dari satu putaran followup.ts (jam kerja, batas harian, rem, nomor CS terhubung sudah
 * diperiksa di sana). Pemindaian tiap 5 menit; draf disiapkan menjelang jadwal. true = satu pesan terkirim.
 */
export async function putaranProspek(cs: Nomor, bolehKirim: boolean): Promise<boolean> {
  const s = await pengaturanProspek();
  if (!s.aktif) return false;
  if (!st.dimuat) await muatPantauan().catch((e) => console.warn("[followup-prospek] pantauan gagal dimuat:", e instanceof Error ? e.message : e));
  if (Date.now() >= st.pindaiPada) {
    st.pindaiPada = Date.now() + PINDAI_MS;
    await pindaiProspek(cs, s).catch((e) => console.error("[followup-prospek] pemindaian gagal:", e instanceof Error ? e.message : e));
  }
  await siapkanDraf(cs).catch((e) => console.warn("[followup-prospek] draf gagal disiapkan:", e instanceof Error ? e.message : e));
  if (!bolehKirim) return false;
  const sql = await db();
  const baris = await sql<BarisJalan[]>`
    SELECT kunci, number_id, status, tahap, minat, jadwal, siklus, draf, pesan1, pesan2, pesan3, ack1, ack2, ack3
      FROM followup_prospek WHERE status = 'jalan' AND jadwal <= ${sekarang()} AND NOT usaha
     ORDER BY minat DESC, jadwal, kunci LIMIT 10`;
  for (const b of baris) {
    if (b.number_id !== cs.id) {
      await ubah(b.kunci, "batal", "Nomor CS diganti");
      continue;
    }
    if (await prosesSatu(b, s, cs)) return true;
  }
  return false;
}

/** Pratinjau: draf pesan berikutnya disiapkan menjelang jadwal (bisa dibaca / diedit admin sebelum terkirim). */
async function siapkanDraf(cs: Nomor): Promise<void> {
  const sql = await db();
  const t = sekarang();
  const baris = await sql<BarisJalan[]>`
    SELECT kunci, number_id, status, tahap, minat, jadwal, siklus, draf, pesan1, pesan2, pesan3, ack1, ack2, ack3
      FROM followup_prospek WHERE status = 'jalan' AND jadwal <= ${t + DRAF_SEBELUM_DTK} AND draf IS NULL AND number_id = ${cs.id} AND NOT usaha
     ORDER BY jadwal, kunci LIMIT ${DRAF_PER_PUTARAN}`;
  for (const b of baris) {
    const chat = await chatLead(b.kunci);
    if (await periksaBaris(b, chat)) continue;
    const h = await susunPesan(cs, chat as ChatLead, (b.tahap + 1) as Tahap, b.minat, sebelumnyaDari(b));
    if ("lewati" in h) await ubah(b.kunci, b.tahap > 0 ? "selesai" : "batal", `Dilewati AI: ${h.lewati}`);
    else await sql`UPDATE followup_prospek SET draf = ${h.teks} WHERE kunci = ${b.kunci} AND tahap = ${b.tahap} AND status = 'jalan' AND draf IS NULL`;
  }
}

// ---------- Pesan masuk & status kiriman (dipanggil followup.ts) ----------

/**
 * Pesan masuk di nomor CS. Hanya balasan PERTAMA setelah follow-up prospek yang dinilai: permintaan berhenti dicatat
 * permanen; selain itu siklus selesai sebagai "dibalas" dan AI diberi konteks pesan follow-up yang ia balas.
 * Chat yang tidak sedang di-follow-up selesai tanpa I/O.
 */
export async function pesanMasukProspek(d: { kunci: string; teks: string }): Promise<string | null> {
  const f = st.aktif.get(d.kunci);
  if (!f || f.dicatat) return null;
  f.dicatat = true;
  const teks = d.teks.trim();
  const t = sekarang();
  const sql = await db();
  if (teks && (POLA_STOP.test(teks) || POLA_STOP_PENDEK.test(teks))) {
    await sql`INSERT INTO followup_stop (kunci, dibuat) VALUES (${d.kunci}, ${t}) ON CONFLICT (kunci) DO NOTHING`;
    await sql`UPDATE followup_prospek SET status = 'stop', alasan = 'Lawan bicara meminta tidak dihubungi lagi', diperbarui = ${t}, dibalas = COALESCE(dibalas, ${t}) WHERE kunci = ${d.kunci}`;
    console.info("[followup-prospek] lawan bicara meminta tidak dihubungi lagi");
    return `Lawan bicara ini menerima follow-up dari kita${f.teks ? ` ("${f.teks.slice(0, 300)}")` : ""} dan meminta tidak dihubungi lagi. Minta maaf singkat dalam satu kalimat, pastikan ia tidak akan dikirimi follow-up lagi, dan jangan menawarkan apa pun.`;
  }
  await sql`
    UPDATE followup_prospek SET status = CASE WHEN status = 'jalan' OR status = 'selesai' THEN 'dibalas' ELSE status END,
           alasan = CASE WHEN status = 'jalan' OR status = 'selesai' THEN null ELSE alasan END,
           dibalas = COALESCE(dibalas, ${t}), diperbarui = ${t}
     WHERE kunci = ${d.kunci} AND tahap > 0`;
  return `${f.teks ? `Kamu (CS) tadi mengirim follow-up ini ke chat ini: "${f.teks.slice(0, 400)}". Pesan berikut adalah balasannya. ` : ""}Bantu ia memutuskan berlangganan: jawab keberatannya dengan fakta dari pengetahuan; bila ia sudah siap, pandu memilih paket dan arahkan ke ${asal()}/langganan. Jangan memaksa bila ia menolak.`;
}

/** Status kiriman (centang). true = id ini milik follow-up prospek. */
export function terimaAckProspek(id: string, status: number): boolean {
  const x = st.ack.get(id);
  if (!x) return false;
  const nilai = Math.min(4, status);
  if (nilai <= x.ack) return true;
  x.ack = nilai;
  if (nilai >= 4) st.ack.delete(id);
  void db()
    .then((sql) =>
      x.slot === 1
        ? sql`UPDATE followup_prospek SET ack1 = GREATEST(ack1, ${nilai}) WHERE kunci = ${x.kunci}`
        : x.slot === 2
          ? sql`UPDATE followup_prospek SET ack2 = GREATEST(ack2, ${nilai}) WHERE kunci = ${x.kunci}`
          : sql`UPDATE followup_prospek SET ack3 = GREATEST(ack3, ${nilai}) WHERE kunci = ${x.kunci}`,
    )
    .catch((e) => console.warn("[followup-prospek] status kiriman gagal disimpan:", e instanceof Error ? e.message : e));
  return true;
}

/** Baris yang masih dipantau (14 hari terakhir) dimuat ke memori sekali. */
export async function muatPantauan(): Promise<void> {
  if (st.dimuat) return;
  st.dimuat = true;
  const sql = await db();
  const sejak = sekarang() - PANTAU_DTK;
  const baris = await sql<
    (Pick<BarisProspek, "kunci" | "status" | "tahap" | "pesan1" | "pesan2" | "pesan3" | "ack1" | "ack2" | "ack3" | "dibalas"> & { pesan1_id: string | null; pesan2_id: string | null; pesan3_id: string | null })[]
  >`
    SELECT kunci, status, tahap, pesan1, pesan2, pesan3, pesan1_id, pesan2_id, pesan3_id, ack1, ack2, ack3, dibalas
      FROM followup_prospek WHERE tahap > 0 AND diperbarui >= ${sejak} AND NOT usaha`;
  for (const b of baris) {
    const teks = [b.pesan1, b.pesan2, b.pesan3][b.tahap - 1] ?? null;
    st.aktif.set(b.kunci, { teks, dicatat: b.dibalas !== null || b.status === "stop" || b.status === "dibalas" });
    const id = [b.pesan1_id, b.pesan2_id, b.pesan3_id];
    const ack = [b.ack1, b.ack2, b.ack3];
    for (let i = 0; i < 3; i++) if (id[i] && ack[i] < 4) st.ack.set(id[i] as string, { kunci: b.kunci, slot: (i + 1) as 1 | 2 | 3, ack: ack[i] });
  }
}

// ---------- Untuk followup.ts (anggaran & rem bersama) ----------

/** Pesan follow-up prospek yang terkirim sejak `awal` (batas harian bersama). */
export async function kirimanProspekSejak(awal: number): Promise<number> {
  const sql = await db();
  const [r] = await sql<{ n: number }[]>`
    SELECT (COUNT(*) FILTER (WHERE terkirim1 >= ${awal}) + COUNT(*) FILTER (WHERE terkirim2 >= ${awal}) + COUNT(*) FILTER (WHERE terkirim3 >= ${awal}))::int AS n
      FROM followup_prospek WHERE diperbarui >= ${awal} AND NOT usaha`;
  return r?.n ?? 0;
}

/** Kiriman prospek terbaru dalam rentang (untuk rem centang satu): waktu & status centang. */
export async function kirimanProspekRentang(sejak: number, sampai: number): Promise<{ w: number; ack: number }[]> {
  const sql = await db();
  return [
    ...(await sql<{ w: number; ack: number }[]>`
      SELECT w, ack FROM (
        SELECT terkirim1 AS w, ack1 AS ack FROM followup_prospek WHERE terkirim1 >= ${sejak} AND NOT usaha
        UNION ALL SELECT terkirim2, ack2 FROM followup_prospek WHERE terkirim2 >= ${sejak} AND NOT usaha
        UNION ALL SELECT terkirim3, ack3 FROM followup_prospek WHERE terkirim3 >= ${sejak} AND NOT usaha
      ) x WHERE w <= ${sampai} ORDER BY w DESC LIMIT 10`),
  ];
}

// ---------- Untuk halaman admin ----------

export async function statusMesinProspek(): Promise<StatusMesinProspek> {
  const [setelan, sql] = await Promise.all([pengaturanProspek(), db()]);
  const [hitung, [k]] = await Promise.all([
    sql<{ status: StatusProspek; n: number }[]>`SELECT status, COUNT(*)::int AS n FROM followup_prospek WHERE NOT usaha GROUP BY status`,
    sql<{ terkirim: number; dibalas: number; berlangganan: number }[]>`
      SELECT COUNT(*) FILTER (WHERE fp.tahap > 0)::int AS terkirim,
             COUNT(*) FILTER (WHERE fp.tahap > 0 AND fp.dibalas IS NOT NULL)::int AS dibalas,
             COUNT(*) FILTER (WHERE fp.tahap > 0 AND fp.tujuan IS NOT NULL AND EXISTS (
               SELECT 1 FROM numbers n JOIN langganan l ON l.user_id = n.user_id AND l.mulai >= fp.dibuat
                WHERE n.wa_id = fp.tujuan OR n.teruskan_ke = fp.tujuan))::int AS berlangganan
        FROM followup_prospek fp WHERE NOT fp.usaha`,
  ]);
  return {
    setelan,
    hitung: Object.fromEntries(hitung.map((h) => [h.status, h.n])),
    terkirim: k?.terkirim ?? 0,
    dibalas: k?.dibalas ?? 0,
    berlangganan: k?.berlangganan ?? 0,
  };
}

/** Riwayat terbaru lewat followup_prospek_diperbarui_idx. */
export async function daftarProspek(opsi: { status?: StatusProspek | null; batas?: number } = {}): Promise<BarisProspek[]> {
  const sql = await db();
  const batas = Math.min(100, Math.max(1, opsi.batas ?? 50));
  const status = opsi.status ?? null;
  return [
    ...(await sql<BarisProspek[]>`
      SELECT fp.kunci, fp.status, fp.tujuan, fp.nama, fp.minat, fp.tahap, fp.jadwal, fp.dibuat, fp.diperbarui, fp.draf,
             fp.pesan1, fp.pesan2, fp.pesan3, fp.terkirim1, fp.terkirim2, fp.terkirim3, fp.ack1, fp.ack2, fp.ack3,
             fp.dibalas, fp.alasan, p.id AS percakapan_id
        FROM followup_prospek fp LEFT JOIN percakapan p ON p.kunci = fp.kunci
       WHERE NOT fp.usaha AND (${status}::text IS NULL OR fp.status = ${status})
       ORDER BY fp.diperbarui DESC, fp.kunci DESC LIMIT ${batas}`),
  ];
}

/** Admin: tulis ulang draf pesan berikutnya dengan AI. */
export async function tulisUlangDrafProspek(kunci: string): Promise<string> {
  const sql = await db();
  const [b] = await sql<(BarisJalan & { number_id: number })[]>`
    SELECT kunci, number_id, status, tahap, minat, jadwal, siklus, draf, pesan1, pesan2, pesan3, ack1, ack2, ack3
      FROM followup_prospek WHERE kunci = ${kunci} AND NOT usaha`;
  if (!b || b.status !== "jalan") throw new PenggunaError("Tidak ada pesan yang menunggu dikirim untuk chat ini.");
  const [cs, chat] = await Promise.all([nomorById(b.number_id), chatLead(kunci)]);
  if (!cs) throw new PenggunaError("Nomor CS tidak ditemukan.");
  if (!chat) throw new PenggunaError("Chat sudah terhapus.");
  const { teks } = (await susunPesan(cs, chat, (b.tahap + 1) as Tahap, b.minat, sebelumnyaDari(b), false)) as { teks: string };
  await sql`UPDATE followup_prospek SET draf = ${teks} WHERE kunci = ${kunci} AND tahap = ${b.tahap} AND status = 'jalan'`;
  return teks;
}

/** Admin: simpan suntingan draf. Teks inilah yang dikirim, persis. */
export async function simpanDrafProspek(kunci: string, teks: string): Promise<void> {
  const bersih = teks.replace(/\u0000/g, "").replace(/\r\n/g, "\n").trim();
  if (bersih.length < BATAS_PESAN[0] || bersih.length > BATAS_PESAN[1]) throw new PenggunaError(`Pesan harus ${BATAS_PESAN[0]}–${BATAS_PESAN[1]} karakter.`);
  const sql = await db();
  const r = await sql`UPDATE followup_prospek SET draf = ${bersih} WHERE kunci = ${kunci} AND status = 'jalan' AND NOT usaha`;
  if (!r.count) throw new PenggunaError("Follow-up chat ini sudah selesai, jadi pesannya tidak bisa diubah lagi.");
}

/** Admin: hentikan follow-up satu chat (tidak dikirimi apa pun lagi di siklus ini). */
export async function hentikanProspek(kunci: string): Promise<void> {
  const sql = await db();
  const r = await sql`UPDATE followup_prospek SET status = 'batal', alasan = 'Dihentikan admin', diperbarui = ${sekarang()} WHERE kunci = ${kunci} AND status = 'jalan' AND NOT usaha`;
  if (!r.count) throw new PenggunaError("Follow-up chat ini sudah tidak berjalan.");
}
