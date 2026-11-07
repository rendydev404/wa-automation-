import "server-only";
import { type Sql, type Tx, db, getSetting, sekarang, setSetting, transaksi as transaksiDb } from "./db";
import { DAFTAR_BANK, namaBankTampil } from "./afiliasi-def";
import { JAMINAN_HARI, JAMINAN_MAKS_PAKAI_PERSEN, MODE_REFUND_BAWAAN, type ModeRefund } from "./jaminan-def";
import { ORDER_SAH, balasanTerpakai, catatRefundBerhasil } from "./langganan";
import { MEREK } from "./merek";
import { type KonfigMidtrans, MidtransError, kanalBisaRefund, refundMidtrans, statusMidtrans } from "./midtrans";

/**
 * Jaminan uang kembali (pengganti free trial). Pemilik akun mengajukan sendiri dari halaman Langganan bila:
 *   - pembayaran PERTAMA akun ini (belum ada pembayaran lain), dibayar lewat GoPay / ShopeePay / QRIS;
 *   - diajukan paling lambat JAMINAN_HARI hari sejak dibayar, paketnya masih aktif;
 *   - balasan AI yang terpakai sejak paket mulai paling banyak JAMINAN_MAKS_PAKAI_PERSEN% dari kuota paket;
 *   - nomor WhatsApp / email akun ini belum pernah memakai jaminan di akun lain.
 * Cara pengembaliannya dipilih admin (modeRefund):
 *   - manual (bawaan): pengajuan "menunggu" + rekening/e-wallet tujuan; admin mentransfer sendiri lalu menandai selesai
 *     (atau menolak). Paket tetap aktif sampai admin menandai selesai.
 *   - otomatis: Refund API Midtrans langsung ke metode bayar asal ("diproses" -> selesai / gagal). Gagal (mis. fitur
 *     refund belum diaktifkan Midtrans, saldo Midtrans kurang) = paket tetap aktif, admin bisa mencoba ulang.
 * Selesai (cara apa pun) = paket dicabut dan komisi afiliasinya batal (langganan.ts selesaikanRefund). Refund dari
 * dashboard Midtrans tetap tercatat lewat webhook (terapkanStatus).
 */

export { JAMINAN_HARI, JAMINAN_MAKS_PAKAI_PERSEN };

type Teks = { id: string; en: string };
export type StatusPengembalian = "menunggu" | "diproses" | "selesai" | "gagal" | "ditolak";
export type CaraPengembalian = "manual" | "otomatis" | "midtrans";

const KUNCI_MODE = "refund_mode";

export async function modeRefund(): Promise<ModeRefund> {
  const v = await getSetting(KUNCI_MODE);
  return v === "otomatis" || v === "manual" ? v : MODE_REFUND_BAWAAN;
}

export async function setModeRefund(mode: ModeRefund): Promise<void> {
  await setSetting(KUNCI_MODE, mode);
}

export interface Tujuan {
  bank: string;
  nomor: string;
  nama: string;
}

export interface InfoJaminan {
  orderId: string;
  jumlah: number;
  kanal: string | null;
  namaPaket: string;
  dibayar: number;
  /** Batas akhir pengajuan (detik epoch). */
  sampai: number;
  terpakai: number;
  batasPakai: number;
  pengajuan: {
    status: StatusPengembalian;
    cara: CaraPengembalian;
    dibuat: number;
    selesai: number | null;
    tujuan: Tujuan | null;
    catatan: string | null;
  } | null;
  /** Boleh mengajukan sekarang (termasuk mengulang refund otomatis yang gagal). */
  boleh: boolean;
  /** Alasan tidak boleh; null bila boleh. */
  alasan: Teks | null;
}

interface BarisJaminan {
  id: number;
  order_id: string;
  jumlah: number;
  status: string;
  kanal: string | null;
  nama_paket: string;
  dibayar: number | null;
  dibuat: number;
  l_mulai: number | null;
  l_sampai: number | null;
  l_kuota: number | null;
  r_status: StatusPengembalian | null;
  r_cara: CaraPengembalian | null;
  r_dibuat: number | null;
  r_selesai: number | null;
  r_bank: string | null;
  r_nomor: string | null;
  r_nama: string | null;
  r_catatan: string | null;
}

/**
 * Hitung syarat jaminan untuk pembayaran pertama akun ini. Dua pembayaran berbayar paling awal lewat transaksi_user_idx
 * (cukup tahu ada pembayaran kedua atau tidak), langganan & pengajuan lewat PK/UNIQUE. null = belum pernah membayar.
 */
async function hitung(q: Sql | Tx, userId: number): Promise<(InfoJaminan & { transaksiId: number }) | null> {
  const rows = await q<BarisJaminan[]>`
    SELECT t.id, t.order_id, t.jumlah, t.status, t.kanal, t.nama_paket, t.dibayar, t.dibuat,
           l.mulai AS l_mulai, l.sampai AS l_sampai, l.kuota_balasan AS l_kuota,
           r.status AS r_status, r.cara AS r_cara, r.dibuat AS r_dibuat, r.selesai AS r_selesai,
           r.tujuan_bank AS r_bank, r.tujuan_nomor AS r_nomor, r.tujuan_nama AS r_nama, r.catatan AS r_catatan
      FROM transaksi t
      LEFT JOIN langganan l ON l.id = t.langganan_id
      LEFT JOIN pengembalian_dana r ON r.transaksi_id = t.id
     WHERE t.user_id = ${userId} AND t.status IN ('lunas', 'dikembalikan') AND t.jumlah > 0
     ORDER BY t.dibuat ASC, t.id ASC
     LIMIT 2`;
  const t = rows[0];
  if (!t) return null;
  const kini = sekarang();
  const dibayar = t.dibayar ?? t.dibuat;
  // Pengajuan yang gagal dihitung dari saat pertama diajukan: mengulang tidak kena batas waktu yang lewat sesudahnya.
  const sampai = (t.r_dibuat ?? dibayar) + JAMINAN_HARI * 86400;
  const batasPakai = Math.floor(((t.l_kuota ?? 0) * JAMINAN_MAKS_PAKAI_PERSEN) / 100);
  const dasar = {
    transaksiId: t.id,
    orderId: t.order_id,
    jumlah: t.jumlah,
    kanal: t.kanal,
    namaPaket: t.nama_paket,
    dibayar,
    sampai,
    batasPakai,
    pengajuan: t.r_status
      ? {
          status: t.r_status,
          cara: t.r_cara ?? "manual",
          dibuat: t.r_dibuat ?? dibayar,
          selesai: t.r_selesai,
          tujuan: t.r_bank && t.r_nomor ? { bank: t.r_bank, nomor: t.r_nomor, nama: t.r_nama ?? "" } : null,
          catatan: t.r_catatan,
        }
      : null,
  };
  const tolak = (alasan: Teks, terpakai = 0): InfoJaminan & { transaksiId: number } => ({ ...dasar, terpakai, boleh: false, alasan });
  if (t.r_status === "selesai" || t.status === "dikembalikan") return tolak({ id: "Dana pembayaran ini sudah dikembalikan.", en: "This payment has already been refunded." });
  if (t.r_status === "menunggu" || t.r_status === "diproses") return tolak({ id: "Pengembalian dana sedang diproses.", en: "The refund is being processed." });
  if (t.r_status === "ditolak") return tolak({ id: "Pengajuan uang kembali untuk pembayaran ini sudah ditolak admin.", en: "The refund request for this payment was declined by the admin." });
  if (!ORDER_SAH.test(t.order_id) || !kanalBisaRefund(t.kanal))
    return tolak({
      id: "Jaminan uang kembali hanya untuk pembayaran lewat GoPay, ShopeePay, atau QRIS. Pembayaran ini memakai metode lain.",
      en: "The money-back guarantee only covers payments made with GoPay, ShopeePay, or QRIS. This payment used another method.",
    });
  if (rows.length > 1)
    return tolak({ id: "Jaminan hanya untuk pembayaran pertama, dan akun ini sudah punya pembayaran berikutnya.", en: "The guarantee only covers your first payment, and this account already has a later one." });
  if (kini > sampai) return tolak({ id: `Masa jaminan ${JAMINAN_HARI} hari sudah lewat.`, en: `The ${JAMINAN_HARI}-day guarantee period has ended.` });
  if (t.l_sampai === null || t.l_mulai === null || t.l_sampai <= kini)
    return tolak({ id: "Paket dari pembayaran ini sudah tidak aktif.", en: "The plan from this payment is no longer active." });
  const [terpakai, [dipakai]] = await Promise.all([
    balasanTerpakai(userId, t.l_mulai),
    // Nomor WhatsApp atau email yang sama sudah pernah dikembalikan dananya lewat akun lain (GIN pengembalian_dana_wa_idx).
    q<{ id: number }[]>`
      SELECT r.id FROM pengembalian_dana r
       WHERE r.status = 'selesai' AND r.user_id IS DISTINCT FROM ${userId}
         AND (r.wa_ids && ARRAY(SELECT wa_id FROM numbers WHERE user_id = ${userId} AND wa_id IS NOT NULL)
              OR r.email = (SELECT email FROM users WHERE id = ${userId}))
       LIMIT 1`,
  ]);
  if (terpakai > batasPakai)
    return tolak(
      {
        id: `Balasan AI yang terpakai (${terpakai.toLocaleString("id-ID")}) sudah lebih dari ${JAMINAN_MAKS_PAKAI_PERSEN}% kuota paket (${batasPakai.toLocaleString("id-ID")}).`,
        en: `AI replies used (${terpakai.toLocaleString("en-US")}) are already over ${JAMINAN_MAKS_PAKAI_PERSEN}% of the plan quota (${batasPakai.toLocaleString("en-US")}).`,
      },
      terpakai,
    );
  if (dipakai)
    return tolak({ id: "Nomor WhatsApp atau email akun ini sudah pernah memakai jaminan uang kembali.", en: "This account's WhatsApp number or email has already used the money-back guarantee." }, terpakai);
  return { ...dasar, terpakai, boleh: true, alasan: null };
}

/** Akun ini sudah punya pembayaran berbayar (jaminan tidak berlaku lagi untuk pembelian berikutnya). Lewat transaksi_user_idx. */
export async function sudahPernahBayar(userId: number): Promise<boolean> {
  const sql = await db();
  const [r] = await sql<{ id: number }[]>`
    SELECT id FROM transaksi WHERE user_id = ${userId} AND status IN ('lunas', 'dikembalikan') AND jumlah > 0 LIMIT 1`;
  return !!r;
}

/** Untuk halaman Langganan. null = belum pernah membayar. */
export async function cekJaminan(userId: number): Promise<InfoJaminan | null> {
  const info = await hitung(await db(), userId);
  if (!info) return null;
  const { transaksiId, ...sisa } = info;
  void transaksiId; // id internal tidak dikirim ke halaman
  return sisa;
}

/** Rekening / e-wallet tujuan transfer manual; null = tidak sah (pesan dua bahasa). */
export function tujuanSah(m: { bank: string; nomor: string; nama: string }): Tujuan | Teks {
  if (!DAFTAR_BANK.some((b) => b.id === m.bank)) return { id: "Pilih bank atau e-wallet tujuan dari daftar.", en: "Choose the destination bank or e-wallet from the list." };
  const nomor = m.nomor.replace(/[^0-9]/g, "").slice(0, 30);
  if (nomor.length < 6) return { id: "Nomor rekening atau nomor e-wallet minimal 6 digit angka.", en: "The account or e-wallet number must be at least 6 digits." };
  const nama = m.nama.trim().replace(/\s+/g, " ").slice(0, 80);
  if (nama.length < 2) return { id: "Nama pemilik rekening / e-wallet wajib diisi.", en: "The account holder name is required." };
  return { bank: m.bank, nomor, nama };
}

/** Kunci advisory (berpasangan dengan id pengguna): satu pengajuan pada satu waktu per akun. */
const KUNCI_JAMINAN = 72727403;

export type HasilJaminan = { ok: true; cara: "manual" | "otomatis" } | { ok: false; pesan: Teks };

const GAGAL_MIDTRANS: Teks = {
  id: "Pengajuan tercatat, tapi Midtrans belum memproses pengembalian dananya. Admin sudah diberi tahu dan akan menuntaskannya; paket kamu tetap aktif sampai dana kembali.",
  en: "Your request is recorded, but Midtrans hasn't processed the refund yet. The admin has been notified and will complete it; your plan stays active until the money is back.",
};

const rp = (n: number) => `Rp${n.toLocaleString("id-ID")}`;

function notifAdmin(judul: Teks, isi: Teks, orderId: string): void {
  void import("./notifikasi").then(({ kirimNotifAdmin }) => kirimNotifAdmin({ jenis: "admin_bayar", judul, isi, tautan: `/admin/transaksi/${encodeURIComponent(orderId)}` }));
}

/**
 * Pemilik akun mengajukan jaminan uang kembali. Syarat diperiksa ulang di dalam transaksi database (kunci per akun) lalu
 * baris pengajuan diklaim. Mode manual: selesai di sini (menunggu admin). Mode otomatis: Refund API dipanggil DI LUAR
 * transaksi supaya kunci tidak tertahan selama panggilan jaringan. Klik ganda / dua tab: yang kedua "sedang diproses".
 */
export async function ajukanJaminan(
  k: KonfigMidtrans | null,
  userId: number,
  isi: { alasan: string; tujuan?: { bank: string; nomor: string; nama: string } },
): Promise<HasilJaminan> {
  const mode = await modeRefund();
  if (mode === "otomatis" && !k) return { ok: false, pesan: { id: "Pembayaran online belum diaktifkan admin.", en: "Online payment has not been enabled by the admin yet." } };
  let tujuan: Tujuan | null = null;
  if (mode === "manual") {
    const v = tujuanSah(isi.tujuan ?? { bank: "", nomor: "", nama: "" });
    if (!("bank" in v)) return { ok: false, pesan: v };
    tujuan = v;
  }
  const catatan = isi.alasan.trim().slice(0, 300) || null;
  const kini = sekarang();
  const klaim = await transaksiDb(async (tx): Promise<{ galat: Teks } | { orderId: string; jumlah: number; refundKey: string }> => {
    await tx`SELECT pg_advisory_xact_lock(${KUNCI_JAMINAN}, ${userId})`;
    const info = await hitung(tx, userId);
    if (!info) return { galat: { id: "Belum ada pembayaran di akun ini.", en: "There are no payments on this account yet." } };
    if (!info.boleh) return { galat: info.alasan! };
    const [r] = await tx<{ refund_key: string }[]>`
      INSERT INTO pengembalian_dana(transaksi_id, user_id, email, order_id, jumlah, status, cara, refund_key, tujuan_bank, tujuan_nomor, tujuan_nama, alasan, terpakai, wa_ids, dibuat)
      SELECT ${info.transaksiId}, u.id, u.email, ${info.orderId}, ${info.jumlah}, ${mode === "manual" ? "menunggu" : "diproses"}, ${mode}, ${`RF-${info.transaksiId}`},
             ${tujuan?.bank ?? null}, ${tujuan?.nomor ?? null}, ${tujuan?.nama ?? null}, ${catatan}, ${info.terpakai},
             ARRAY(SELECT wa_id FROM numbers WHERE user_id = u.id AND wa_id IS NOT NULL), ${kini}
        FROM users u WHERE u.id = ${userId}
      ON CONFLICT (transaksi_id) DO UPDATE
         SET status = EXCLUDED.status, cara = EXCLUDED.cara, galat = NULL, terpakai = EXCLUDED.terpakai,
             tujuan_bank = EXCLUDED.tujuan_bank, tujuan_nomor = EXCLUDED.tujuan_nomor, tujuan_nama = EXCLUDED.tujuan_nama,
             alasan = COALESCE(EXCLUDED.alasan, pengembalian_dana.alasan)
       WHERE pengembalian_dana.status = 'gagal'
      RETURNING refund_key`;
    if (!r) return { galat: { id: "Pengembalian dana sedang diproses.", en: "The refund is being processed." } };
    return { orderId: info.orderId, jumlah: info.jumlah, refundKey: r.refund_key };
  });
  if ("galat" in klaim) return { ok: false, pesan: klaim.galat };
  const ket = `${klaim.orderId}${tujuan ? ` · transfer ke ${namaBankTampil(tujuan.bank)} ${tujuan.nomor} a.n. ${tujuan.nama}` : ""}${catatan ? ` · ${catatan}` : ""}`;
  notifAdmin(
    mode === "manual"
      ? { id: `Perlu transfer uang kembali ${rp(klaim.jumlah)}`, en: `Refund transfer needed: ${rp(klaim.jumlah)}` }
      : { id: `Pengajuan uang kembali ${rp(klaim.jumlah)}`, en: `Money-back request ${rp(klaim.jumlah)}` },
    { id: ket, en: ket },
    klaim.orderId,
  );
  if (mode === "manual") return { ok: true, cara: "manual" };
  return (await kirimRefund(k!, klaim)) ? { ok: true, cara: "otomatis" } : { ok: false, pesan: GAGAL_MIDTRANS };
}

/**
 * Kirim refund ke Midtrans untuk pengajuan yang sudah diklaim "diproses". Bila Midtrans ternyata sudah mencatat refund
 * (percobaan sebelumnya berhasil tapi jawabannya hilang), tidak dikirim lagi. true = dana dikembalikan.
 */
async function kirimRefund(k: KonfigMidtrans, p: { orderId: string; jumlah: number; refundKey: string }): Promise<boolean> {
  try {
    const s = await statusMidtrans(k, p.orderId).catch(() => null);
    if (s?.transaction_status !== "refund") await refundMidtrans(k, p.orderId, { refundKey: p.refundKey, jumlah: p.jumlah, alasan: `Jaminan uang kembali ${MEREK}` });
    await catatRefundBerhasil(p.orderId);
    return true;
  } catch (e) {
    const galat = (e instanceof MidtransError ? e.message : "Midtrans tidak bisa dihubungi").slice(0, 300);
    console.error(`[jaminan] refund gagal order=${p.orderId}: ${galat}`);
    const sql = await db();
    await sql`UPDATE pengembalian_dana SET status = 'gagal', galat = ${galat} WHERE refund_key = ${p.refundKey} AND status = 'diproses'`;
    notifAdmin(
      { id: "Pengembalian dana GAGAL diproses Midtrans", en: "Refund FAILED at Midtrans" },
      {
        id: `${p.orderId} · ${galat}. Cek fitur refund & saldo Midtrans lalu coba lagi, atau transfer manual dan tandai selesai.`,
        en: `${p.orderId} · ${galat}. Check Midtrans refund activation & balance, then retry, or transfer manually and mark it done.`,
      },
      p.orderId,
    );
    return false;
  }
}

const TIDAK_BISA: Teks = { id: "Pengajuan ini sudah diproses atau tidak ditemukan.", en: "This request has already been handled or doesn't exist." };

/**
 * Admin menandai pengajuan sudah dikembalikan secara manual (dana sudah ditransfer ke tujuan). Juga untuk refund otomatis
 * yang gagal lalu diselesaikan admin dengan transfer sendiri. Klaim atomik menunggu/gagal -> diproses, jadi dua klik
 * admin tidak menyelesaikan dua kali; gagal di tengah = dikembalikan ke status semula.
 */
export async function selesaikanManual(id: number, referensi: string): Promise<HasilJaminan> {
  const sql = await db();
  const ref = referensi.trim().slice(0, 100) || null;
  const [p] = await sql<{ order_id: string; status_lama: StatusPengembalian }[]>`
    UPDATE pengembalian_dana r SET status = 'diproses', cara = 'manual', referensi = ${ref}, galat = NULL
      FROM (SELECT id, status FROM pengembalian_dana WHERE id = ${id} FOR UPDATE) lama
     WHERE r.id = lama.id AND lama.status IN ('menunggu', 'gagal')
    RETURNING r.order_id, lama.status AS status_lama`;
  if (!p) return { ok: false, pesan: TIDAK_BISA };
  try {
    await catatRefundBerhasil(p.order_id);
    return { ok: true, cara: "manual" };
  } catch (e) {
    await sql`UPDATE pengembalian_dana SET status = ${p.status_lama} WHERE id = ${id} AND status = 'diproses'`;
    throw e;
  }
}

/** Admin menolak pengajuan (dana tidak dikembalikan, paket tetap aktif); pemilik akun diberi tahu alasannya. */
export async function tolakPengembalian(id: number, catatan: string): Promise<HasilJaminan> {
  const sql = await db();
  const isi = catatan.trim().slice(0, 300);
  if (isi.length < 3) return { ok: false, pesan: { id: "Tulis alasan penolakan untuk pemilik akun.", en: "Write a reason for the account owner." } };
  const [p] = await sql<{ user_id: number | null; order_id: string; jumlah: number }[]>`
    UPDATE pengembalian_dana SET status = 'ditolak', catatan = ${isi}, selesai = ${sekarang()}
     WHERE id = ${id} AND status IN ('menunggu', 'gagal')
    RETURNING user_id, order_id, jumlah`;
  if (!p) return { ok: false, pesan: TIDAK_BISA };
  if (p.user_id)
    void import("./notifikasi").then(({ kirimNotif }) =>
      kirimNotif(p.user_id!, {
        jenis: "pembayaran",
        judul: { id: `Pengajuan uang kembali ${rp(p.jumlah)} ditolak`, en: `Refund request of ${rp(p.jumlah)} declined` },
        isi: { id: `Alasan admin: ${isi}. Paket kamu tetap aktif.`, en: `Admin's reason: ${isi}. Your plan stays active.` },
        tautan: "/langganan",
        kunci: `refund-tolak:${p.order_id}`,
      }),
    );
  return { ok: true, cara: "manual" };
}

/**
 * Admin mencoba ulang refund otomatis yang gagal (mis. setelah fitur refund aktif / saldo Midtrans cukup). Midtrans hanya
 * menerima kunci refund yang sama sampai 7 hari sejak percobaan pertama; lewat dari itu dipakai kunci baru (aman: status
 * dicek dulu).
 */
export async function ulangiPengembalian(k: KonfigMidtrans, id: number): Promise<HasilJaminan> {
  const sql = await db();
  const kini = sekarang();
  const [p] = await sql<{ order_id: string; jumlah: number; refund_key: string }[]>`
    UPDATE pengembalian_dana
       SET status = 'diproses', cara = 'otomatis', galat = NULL,
           refund_key = CASE WHEN dibuat < ${kini - 6 * 86400} THEN refund_key || '-' || ${String(kini)} ELSE refund_key END
     WHERE id = ${id} AND status IN ('gagal', 'menunggu') AND refund_key IS NOT NULL
     RETURNING order_id, jumlah, refund_key`;
  if (!p) return { ok: false, pesan: TIDAK_BISA };
  return (await kirimRefund(k, { orderId: p.order_id, jumlah: p.jumlah, refundKey: p.refund_key })) ? { ok: true, cara: "otomatis" } : { ok: false, pesan: GAGAL_MIDTRANS };
}

export interface BarisPengembalian {
  id: number;
  order_id: string;
  email: string;
  user_id: number | null;
  jumlah: number;
  status: StatusPengembalian;
  cara: CaraPengembalian;
  tujuan_bank: string | null;
  tujuan_nomor: string | null;
  tujuan_nama: string | null;
  referensi: string | null;
  alasan: string | null;
  catatan: string | null;
  galat: string | null;
  terpakai: number;
  dibuat: number;
  selesai: number | null;
  dikonfirmasi: number | null;
}

const KOLOM_PENGEMBALIAN =
  "id, order_id, email, user_id, jumlah, status, cara, tujuan_bank, tujuan_nomor, tujuan_nama, referensi, alasan, catatan, galat, terpakai, dibuat, selesai, dikonfirmasi";

/**
 * Untuk admin: pengajuan yang masih perlu ditangani (indeks parsial pengembalian_dana_berjalan_idx, jumlahnya kecil)
 * dan riwayat terbaru (pengembalian_dana_dibuat_idx).
 */
export async function daftarPengembalian(batas = 20): Promise<{ berjalan: BarisPengembalian[]; riwayat: BarisPengembalian[] }> {
  const sql = await db();
  const [berjalan, riwayat] = await Promise.all([
    sql<BarisPengembalian[]>`
      SELECT ${sql.unsafe(KOLOM_PENGEMBALIAN)} FROM pengembalian_dana
       WHERE status IN ('menunggu', 'diproses', 'gagal') ORDER BY dibuat, id`,
    sql<BarisPengembalian[]>`
      SELECT ${sql.unsafe(KOLOM_PENGEMBALIAN)} FROM pengembalian_dana
       WHERE status IN ('selesai', 'ditolak') ORDER BY dibuat DESC, id DESC LIMIT ${Math.min(batas, 100)}`,
  ]);
  return { berjalan: [...berjalan], riwayat: [...riwayat] };
}

/** Pengembalian dana satu transaksi (halaman detail transaksi admin), lewat UNIQUE transaksi_id. */
export async function pengembalianTransaksi(transaksiId: number): Promise<BarisPengembalian | undefined> {
  const sql = await db();
  const [r] = await sql<BarisPengembalian[]>`SELECT ${sql.unsafe(KOLOM_PENGEMBALIAN)} FROM pengembalian_dana WHERE transaksi_id = ${transaksiId}`;
  return r;
}
