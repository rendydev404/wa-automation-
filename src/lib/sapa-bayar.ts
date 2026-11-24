import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db, sekarang } from "./db";
import { EmailError, emailTerkonfigurasi, htmlEmail, kirimEmail } from "./email";
import { uang } from "./format";
import { KANAL_BAYAR, type KanalBayar, kanalSah, labelKanal, ringkasKanal } from "./harga";
import { MASA_ID } from "./jaminan-def";
import { MEREK } from "./merek";
import { kirimNotif, kirimNotifAdmin } from "./notifikasi";

/**
 * Sapaan otomatis untuk pembayaran paket yang tidak selesai (tagihan kedaluwarsa, gagal, atau dibatalkan dan tidak
 * diganti tagihan lain), supaya calon pembeli yang sudah mau bayar tidak hilang diam-diam.
 *
 * Kanal: EMAIL + notifikasi lonceng & banner di dashboard + notifikasi admin. SENGAJA TIDAK lewat WhatsApp: pesan
 * duluan dari nomor CS ke orang yang belum pernah chat berisiko nomor dibatasi/diblokir WhatsApp.
 *
 * Aturan:
 *   - Tahap 1: ±15 menit setelah tagihan terakhir akun berakhir tanpa lunas (hanya kejadian ≤ 3 hari terakhir, jadi
 *     deploy pertama tidak menyapa kegagalan lama). Admin ikut diberi tahu.
 *   - Tahap 2: 24 jam setelah tahap 1, bila tagihan terakhir akun masih belum lunas.
 *   - Paling banyak satu rangkaian (tahap 1 + 2) per akun per 7 hari; berhenti begitu akun membayar / mendapat paket
 *     sesudah tagihan itu, membuat tagihan baru yang masih berjalan, atau memilih berhenti lewat tautan di email.
 *   - Hanya akun peran user yang aktif; tagihan Developer API, voucher (VCR-), dan pembayaran admin (ADM-) tidak ikut.
 *   - Beberapa percobaan berdekatan (mis. 3 e-wallet dalam semenit) = satu sapaan yang menyebut semua metode tadi.
 *   - Satu baris sapa_bayar per sapaan (PK order+tahap) diklaim SEBELUM mengirim: tidak pernah terkirim dua kali.
 *
 * Satu putaran = satu query terindeks (transaksi_dibuat_idx untuk jendela waktu, indeks per akun untuk sisanya).
 */

export const JEDA_TAHAP1_DTK = 15 * 60;
export const JEDA_TAHAP2_DTK = 24 * 3600;
/** Kegagalan yang lebih tua dari ini tidak lagi memulai rangkaian sapaan (dan bannernya hilang). */
export const JENDELA_DTK = 3 * 86400;
export const JEDA_RANGKAIAN_DTK = 7 * 86400;
const PUTARAN_MS = 5 * 60_000;
/** Percobaan bayar lain akun yang sama dalam rentang ini sebelum tagihan terakhir dihitung satu kejadian. */
const RENTANG_PERCOBAAN_DTK = 6 * 3600;

const STATUS_GAGAL = ["kedaluwarsa", "gagal", "dibatalkan"] as const;

const asalApp = (): string => (process.env.APP_URL || "https://chatgercep.com").replace(/\/+$/, "");

// ---------- Tautan berhenti menerima sapaan (tanpa login) ----------

const rahasia = (): string => process.env.AUTH_SECRET || MEREK;
export const tokenBerhenti = (userId: number): string => createHmac("sha256", rahasia()).update(`sapa-bayar:${userId}`).digest("hex").slice(0, 32);

export function tokenBerhentiSah(userId: number, token: string): boolean {
  const benar = Buffer.from(tokenBerhenti(userId));
  const diberi = Buffer.from(String(token));
  return diberi.length === benar.length && timingSafeEqual(diberi, benar);
}

export const tautanBerhenti = (userId: number): string => `${asalApp()}/api/sapa-bayar/berhenti?u=${userId}&t=${tokenBerhenti(userId)}`;

/** Matikan sapaan pembayaran untuk akun ini. false = akun tidak ada. */
export async function berhentiSapaBayar(userId: number): Promise<boolean> {
  const sql = await db();
  const r = await sql`UPDATE users SET sapa_bayar_mati = true WHERE id = ${userId}`;
  return r.count > 0;
}

// ---------- Pemilihan calon ----------

export interface CalonSapa {
  order_id: string;
  user_id: number;
  email: string;
  nama: string;
  paket_id: number;
  nama_paket: string;
  jumlah: number;
  status: string;
  kedaluwarsa: number | null;
  /** Kapan tagihan dianggap berakhir: batas bayar (kedaluwarsa/menunggu) atau waktu dibuat (gagal/dibatalkan). */
  akhir: number;
  paket_aktif: boolean;
  durasi_hari: number | null;
  kanal_dicoba: string[];
  pernah_lunas: boolean;
  tersambung: boolean;
  tahap1: number | null;
  tahap2: number | null;
}

async function calon(kini: number): Promise<CalonSapa[]> {
  const sql = await db();
  return sql<CalonSapa[]>`
    WITH akhir AS (
      SELECT DISTINCT ON (t.user_id) t.order_id, t.user_id, t.paket_id, t.nama_paket, t.jumlah, t.status, t.dibuat, t.kedaluwarsa,
             CASE WHEN t.status IN ('kedaluwarsa', 'menunggu') THEN COALESCE(t.kedaluwarsa, t.dibuat) ELSE t.dibuat END AS akhir
        FROM transaksi t
       WHERE t.dibuat >= ${kini - JEDA_RANGKAIAN_DTK - JENDELA_DTK}
         AND t.order_id LIKE 'WA-%' AND t.paket_id IS NOT NULL AND t.api_aplikasi_id IS NULL
       ORDER BY t.user_id, t.dibuat DESC, t.id DESC
    )
    SELECT a.order_id, a.user_id, u.email, u.nama, a.paket_id, a.nama_paket, a.jumlah, a.status, a.kedaluwarsa, a.akhir,
           COALESCE(p.aktif AND p.harga > 0, false) AS paket_aktif, p.durasi_hari,
           ARRAY(SELECT x.kanal FROM transaksi x
                  WHERE x.user_id = a.user_id AND x.kanal IS NOT NULL AND x.status <> 'lunas' AND x.dibuat >= a.dibuat - ${RENTANG_PERCOBAAN_DTK}
                  GROUP BY x.kanal ORDER BY min(x.dibuat)) AS kanal_dicoba,
           EXISTS (SELECT 1 FROM transaksi x WHERE x.user_id = a.user_id AND x.status = 'lunas') AS pernah_lunas,
           EXISTS (SELECT 1 FROM numbers n WHERE n.user_id = a.user_id AND n.wa_id IS NOT NULL) AS tersambung,
           (SELECT max(s.dikirim) FROM sapa_bayar s WHERE s.user_id = a.user_id AND s.tahap = 1 AND s.dikirim > ${kini - JEDA_RANGKAIAN_DTK}) AS tahap1,
           (SELECT max(s.dikirim) FROM sapa_bayar s WHERE s.user_id = a.user_id AND s.tahap = 2 AND s.dikirim > ${kini - JEDA_RANGKAIAN_DTK}) AS tahap2
      FROM akhir a
      JOIN users u ON u.id = a.user_id
      LEFT JOIN paket p ON p.id = a.paket_id
     WHERE u.peran = 'user' AND u.status = 'aktif' AND NOT u.sapa_bayar_mati
       AND (a.status IN ${sql([...STATUS_GAGAL])} OR (a.status = 'menunggu' AND a.kedaluwarsa IS NOT NULL AND a.kedaluwarsa <= ${kini}))
       AND a.akhir <= ${kini - JEDA_TAHAP1_DTK}
       AND NOT EXISTS (SELECT 1 FROM langganan l WHERE l.user_id = a.user_id AND l.mulai >= a.dibuat)`;
}

/** Tahap yang jatuh tempo untuk calon ini (null = belum / tidak perlu). Murni, tanpa I/O. */
export function tahapJatuhTempo(c: Pick<CalonSapa, "akhir" | "tahap1" | "tahap2">, kini: number): 1 | 2 | null {
  if (c.tahap1 === null) return c.akhir >= kini - JENDELA_DTK ? 1 : null;
  if (c.tahap1 <= kini - JEDA_TAHAP2_DTK && (c.tahap2 === null || c.tahap2 < c.tahap1)) return 2;
  return null;
}

/**
 * Metode bayar aktif yang disarankan setelah metode `dicoba` gagal: utamakan golongan lain (e-wallet/QRIS gagal ->
 * virtual account, dan sebaliknya), tanpa metode yang baru saja gagal. [] = tidak ada saran.
 */
export function saranKanal(aktif: readonly KanalBayar[], dicoba: readonly string[]): KanalBayar[] {
  const gagal = dicoba.filter(kanalSah);
  const sisa = aktif.filter((k) => !gagal.includes(k));
  const golonganGagal = new Set(gagal.map((k) => KANAL_BAYAR[k].metode));
  const lain = sisa.filter((k) => !golonganGagal.has(KANAL_BAYAR[k].metode));
  return lain.length ? lain : sisa;
}

const labelDicoba = (dicoba: readonly string[]): string[] => dicoba.filter(kanalSah).map((k) => labelKanal(k));

// ---------- Isi sapaan ----------

export interface IsiSapa {
  judul: string;
  teks: string;
  html: string;
}

/** Email sapaan (bahasa Indonesia; akun belum menyimpan pilihan bahasa). Murni: semua data dari pemanggil. */
export function isiEmailSapa(
  c: Pick<CalonSapa, "user_id" | "nama" | "paket_id" | "nama_paket" | "jumlah" | "status" | "paket_aktif" | "durasi_hari" | "kanal_dicoba" | "pernah_lunas">,
  tahap: 1 | 2,
  o: { saran: readonly KanalBayar[]; chatCs: string | null },
): IsiSapa {
  const asal = asalApp();
  const urlBayar = `${asal}${c.paket_aktif ? `/langganan/bayar/${c.paket_id}` : "/langganan"}`;
  const nama = c.nama.trim() || "Kak";
  const paket = `paket ${c.nama_paket}`;
  const dicoba = labelDicoba(c.kanal_dicoba);
  const saran = o.saran.length ? ringkasKanal(o.saran) : "";
  const berhenti = tautanBerhenti(c.user_id);
  const jaminan = c.pernah_lunas ? "" : `Pembayaran pertama lewat GoPay, ShopeePay, atau QRIS dilindungi jaminan uang kembali ${MASA_ID}.`;
  const tombolCs = o.chatCs ? { teks: "Chat CS di WhatsApp", url: o.chatCs } : undefined;

  if (tahap === 1) {
    const status = c.status === "dibatalkan" ? "Dibatalkan" : c.status === "gagal" ? "Gagal" : "Kedaluwarsa (batas waktu bayar habis)";
    const tips = saran
      ? `Kalau ${dicoba.length ? dicoba.join(" / ") : "metode tadi"} masih gagal, coba bayar lewat ${saran}.`
      : "Kalau metode tadi masih gagal, coba metode lain di halaman pembayaran.";
    const paragraf = [
      `Tadi Anda sempat memesan ${paket} ${MEREK}, tapi pembayarannya belum kami terima. Biasanya ini karena batas waktu bayar habis atau aplikasi pembayaran sedang gangguan, bukan karena kesalahan Anda.`,
      `Paketnya belum aktif, tapi masih bisa diaktifkan kapan saja lewat tombol di bawah.${jaminan ? ` ${jaminan}` : ""}`,
    ];
    const rincian: [string, string][] = [
      ["Paket", c.durasi_hari ? `${c.nama_paket} (${c.durasi_hari} hari)` : c.nama_paket],
      ["Tagihan", uang(c.jumlah)],
      ...(dicoba.length ? ([["Dicoba lewat", dicoba.join(", ")]] as [string, string][]) : []),
      ["Status", status],
    ];
    const judul = `Pembayaran ${paket} belum masuk`;
    return {
      judul,
      teks: `Halo ${nama},\n\n${paragraf.join("\n\n")}\n\n${rincian.map(([l, v]) => `${l}: ${v}`).join("\n")}\n\nCoba bayar lagi: ${urlBayar}\n${tips}${o.chatCs ? `\nAda kendala? Chat CS kami di WhatsApp: ${o.chatCs}` : ""}\n\nTidak ingin menerima pengingat pembayaran lagi: ${berhenti}`,
      html: htmlEmail({
        pratinjau: `Tagihan ${uang(c.jumlah)} belum terbayar. ${paket[0].toUpperCase()}${paket.slice(1)} masih bisa diaktifkan, cukup satu klik.`,
        ikon: "peringatan",
        judul: "Pembayaran belum berhasil",
        subjudul: `${paket[0].toUpperCase()}${paket.slice(1)} Anda belum aktif, tapi masih bisa diaktifkan kapan saja.`,
        sapaan: `Halo ${nama},`,
        paragraf,
        rincian,
        tombol: { teks: "Coba bayar lagi", url: urlBayar },
        tombolKedua: tombolCs,
        peringatan: { nada: "waspada", judul: "Tips agar lancar", teks: tips },
        catatan: o.chatCs ? "Ada kendala saat membayar? Tekan Chat CS di WhatsApp, tim kami bantu langsung." : undefined,
        tautanKecil: { teks: "Berhenti menerima pengingat pembayaran", url: berhenti },
      }),
    };
  }

  const paragraf = [
    `Kemarin pembayaran ${paket} belum berhasil, jadi AI belum membalas chat pelanggan Anda.`,
    `Begitu paket aktif, AI langsung menjawab pertanyaan pelanggan dari Informasi Usaha Anda, 24 jam, termasuk chat yang masuk malam hari.`,
    ...(o.chatCs ? ["Belum sempat mengisi Informasi Usaha? Chat CS kami di WhatsApp dan kirim foto menu atau daftar harga, nanti kami bantu isikan."] : []),
    ...(jaminan ? [jaminan] : []),
  ];
  const judul = `AI ${MEREK} Anda tinggal satu langkah lagi`;
  return {
    judul,
    teks: `Halo ${nama},\n\n${paragraf.join("\n\n")}\n\nAktifkan ${paket}: ${urlBayar}${saran ? `\nBisa dibayar lewat ${saran}.` : ""}${o.chatCs ? `\nChat CS di WhatsApp: ${o.chatCs}` : ""}\n\nTidak ingin menerima pengingat pembayaran lagi: ${berhenti}`,
    html: htmlEmail({
      pratinjau: `${paket[0].toUpperCase()}${paket.slice(1)} belum aktif. Aktifkan sekarang supaya AI mulai membalas pelanggan.`,
      ikon: "perisai",
      judul: "Tinggal satu langkah lagi",
      subjudul: "Begitu paket aktif, AI langsung membalas pelanggan Anda 24 jam.",
      sapaan: `Halo ${nama},`,
      paragraf,
      tombol: { teks: `Aktifkan ${paket}`, url: urlBayar },
      tombolKedua: tombolCs,
      catatan: saran ? `Bisa dibayar lewat ${saran}.` : undefined,
      tautanKecil: { teks: "Berhenti menerima pengingat pembayaran", url: berhenti },
    }),
  };
}

// ---------- Putaran ----------

async function kirimSatu(c: CalonSapa, tahap: 1 | 2, kini: number, saran: KanalBayar[]): Promise<boolean> {
  const sql = await db();
  const [klaim] = await sql`
    INSERT INTO sapa_bayar(order_id, user_id, tahap, dikirim) VALUES (${c.order_id}, ${c.user_id}, ${tahap}, ${kini})
    ON CONFLICT DO NOTHING RETURNING 1`;
  if (!klaim) return false;
  const tautanBayar = c.paket_aktif ? `/langganan/bayar/${c.paket_id}` : "/langganan";
  await kirimNotif(c.user_id, {
    jenis: "pembayaran",
    judul:
      tahap === 1
        ? { id: `Pembayaran paket ${c.nama_paket} belum berhasil`, en: `Your ${c.nama_paket} plan payment didn't go through` }
        : { id: `Paket ${c.nama_paket} belum aktif`, en: `Your ${c.nama_paket} plan isn't active yet` },
    isi: {
      id: "Paketnya masih bisa diaktifkan. Coba bayar lagi, atau pilih metode lain bila metode tadi gagal.",
      en: "You can still activate it. Try paying again, or choose another method if the previous one failed.",
    },
    tautan: tautanBayar,
    kunci: `sapa-bayar:${c.order_id}:${tahap}`,
  });
  if (tahap === 1) {
    const dicoba = labelDicoba(c.kanal_dicoba);
    await kirimNotifAdmin({
      jenis: "admin_bayar",
      judul: { id: `Gagal bayar: ${c.email}`, en: `Payment not completed: ${c.email}` },
      isi: {
        id: `${c.nama_paket} ${uang(c.jumlah)}${dicoba.length ? ` · ${dicoba.length} metode dicoba (${dicoba.join(", ")})` : ""} · ${c.tersambung ? "nomor WA sudah tersambung" : "belum menyambungkan WA"}. Email sapaan otomatis terkirim.`,
        en: `${c.nama_paket} ${uang(c.jumlah)}${dicoba.length ? ` · ${dicoba.length} method(s) tried (${dicoba.join(", ")})` : ""} · ${c.tersambung ? "WhatsApp connected" : "WhatsApp not connected"}. An automatic reminder email was sent.`,
      },
      tautan: `/admin/pengguna/${c.user_id}`,
      kunci: `sapa-bayar:${c.order_id}`,
    });
  }
  if (emailTerkonfigurasi()) {
    const { tautanChatCs } = await import("./followup");
    const chatCs = await tautanChatCs(c.user_id).catch(() => null);
    const isi = isiEmailSapa(c, tahap, { saran, chatCs });
    try {
      await kirimEmail({ ke: c.email, judul: isi.judul, teks: isi.teks, html: isi.html, berhenti: tautanBerhenti(c.user_id) });
    } catch (e) {
      // Klaim tetap disimpan: lebih baik satu email hilang daripada terkirim berulang tiap putaran.
      console.warn(`[sapa-bayar] email tahap ${tahap} user=${c.user_id} gagal:`, e instanceof EmailError ? e.message : e);
    }
  }
  return true;
}

/** Satu putaran: menyegarkan tagihan "menunggu" yang lewat batas, lalu mengirim sapaan yang jatuh tempo. Jumlah terkirim. */
export async function putaranSapaBayar(kini = sekarang()): Promise<number> {
  const daftar = await calon(kini);
  if (!daftar.length) return 0;
  let aktif: KanalBayar[] | null = null;
  let terkirim = 0;
  for (const c of daftar) {
    if (c.status === "menunggu") {
      // Status di database belum diperbarui (webhook tidak sampai): tanyakan provider; disapa di putaran berikutnya bila memang tidak lunas.
      const { terapkanStatus } = await import("./langganan");
      await terapkanStatus(c.order_id).catch(() => null);
      continue;
    }
    const tahap = tahapJatuhTempo(c, kini);
    if (!tahap) continue;
    if (aktif === null) {
      const { kanalAktif } = await import("./gateway");
      aktif = await kanalAktif().catch(() => [] as KanalBayar[]);
    }
    if (await kirimSatu(c, tahap, kini, saranKanal(aktif, c.kanal_dicoba))) terkirim += 1;
  }
  return terkirim;
}

// ---------- Banner dashboard ----------

export interface GagalBayar {
  order_id: string;
  paket_id: number;
  nama_paket: string;
  jumlah: number;
  paket_aktif: boolean;
}

/**
 * Tagihan paket terakhir akun ini bila berakhir tanpa lunas dalam JENDELA_DTK dan belum diganti paket/tagihan lain.
 * Satu query lewat transaksi_user_idx (user_id, dibuat DESC, id DESC). Tidak bergantung pada email terkirim.
 */
export async function gagalBayarTerakhir(userId: number, kini = sekarang()): Promise<GagalBayar | null> {
  const sql = await db();
  const [t] = await sql<(GagalBayar & { status: string; dibuat: number; kedaluwarsa: number | null; ada_paket: boolean })[]>`
    SELECT t.order_id, t.paket_id, t.nama_paket, t.jumlah, t.status, t.dibuat, t.kedaluwarsa,
           COALESCE(p.aktif AND p.harga > 0, false) AS paket_aktif,
           EXISTS (SELECT 1 FROM langganan l WHERE l.user_id = t.user_id AND l.mulai >= t.dibuat) AS ada_paket
      FROM transaksi t LEFT JOIN paket p ON p.id = t.paket_id
     WHERE t.user_id = ${userId} AND t.order_id LIKE 'WA-%' AND t.paket_id IS NOT NULL AND t.api_aplikasi_id IS NULL
     ORDER BY t.dibuat DESC, t.id DESC LIMIT 1`;
  if (!t || t.ada_paket) return null;
  const lewat = t.status === "menunggu" && t.kedaluwarsa !== null && t.kedaluwarsa <= kini;
  if (!lewat && !(STATUS_GAGAL as readonly string[]).includes(t.status)) return null;
  const akhir = t.status === "kedaluwarsa" || t.status === "menunggu" ? (t.kedaluwarsa ?? t.dibuat) : t.dibuat;
  if (akhir < kini - JENDELA_DTK) return null;
  return { order_id: t.order_id, paket_id: t.paket_id, nama_paket: t.nama_paket, jumlah: t.jumlah, paket_aktif: t.paket_aktif };
}

// ---------- Penjadwal ----------

const g = globalThis as unknown as { __waSapaBayar?: ReturnType<typeof setInterval>; __waSapaBayarJalan?: boolean };

/** Dipanggil sekali saat server mulai (instrumentation.ts, hanya pusat chatgercep.com): tiap 5 menit, pertama 3 menit setelah mulai. */
export function mulaiSapaBayar(): void {
  if (g.__waSapaBayar) return;
  const jalan = () => {
    if (g.__waSapaBayarJalan) return;
    g.__waSapaBayarJalan = true;
    void putaranSapaBayar()
      .then((n) => n && console.log(`[sapa-bayar] ${n} sapaan terkirim`))
      .catch((e) => console.warn("[sapa-bayar] putaran gagal:", e instanceof Error ? e.message : e))
      .finally(() => (g.__waSapaBayarJalan = false));
  };
  setTimeout(jalan, 180_000).unref?.();
  g.__waSapaBayar = setInterval(jalan, PUTARAN_MS);
  g.__waSapaBayar.unref?.();
}
