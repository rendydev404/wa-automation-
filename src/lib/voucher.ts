import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { db, getSetting, sekarang, setSetting, transaksi as transaksiDb } from "./db";
import { segarkanKuota } from "./langganan";
import { aktifkanBotSiap, segarkanNomor } from "./numbers";
import {
  BAWAAN_PENGATURAN_VOUCHER,
  type BarisVoucher,
  type InfoModalVoucher,
  type ModeKlaimVoucher,
  type PengaturanVoucher,
  type RingkasanVoucher,
  type StatusVoucher,
  type VoucherTersedia,
  VoucherError,
  kodeVoucherSah,
  normalisasiKodeVoucher,
} from "./voucher-def";

export * from "./voucher-def";

const KUNCI_SETELAN = "pengaturan_voucher";
const HURUF_VOUCHER = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function sanitasiPengaturan(raw: Partial<PengaturanVoucher> | null | undefined): PengaturanVoucher {
  const d = BAWAAN_PENGATURAN_VOUCHER;
  if (!raw || typeof raw !== "object") return { ...d };
  const nama = typeof raw.nama_paket === "string" ? raw.nama_paket.trim().slice(0, 60) : "";
  const durasi = Number(raw.durasi_hari);
  const nomor = Number(raw.kuota_nomor);
  const balasan = Number(raw.kuota_balasan);
  const mode: ModeKlaimVoucher = raw.mode_klaim === "ganti" ? "ganti" : "tambah";
  return {
    aktif: typeof raw.aktif === "boolean" ? raw.aktif : d.aktif,
    nama_paket: nama || d.nama_paket,
    durasi_hari: Number.isInteger(durasi) && durasi >= 1 && durasi <= 3650 ? durasi : d.durasi_hari,
    kuota_nomor: Number.isInteger(nomor) && nomor >= 1 && nomor <= 100 ? nomor : d.kuota_nomor,
    kuota_balasan: Number.isInteger(balasan) && balasan >= 1 && balasan <= 10_000_000 ? balasan : d.kuota_balasan,
    mode_klaim: mode,
  };
}

/** Baca konfigurasi paket voucher panduan yang diatur admin. */
export async function pengaturanVoucher(): Promise<PengaturanVoucher> {
  const mentah = await getSetting(KUNCI_SETELAN);
  if (!mentah) return { ...BAWAAN_PENGATURAN_VOUCHER };
  try {
    return sanitasiPengaturan(JSON.parse(mentah) as Partial<PengaturanVoucher>);
  } catch {
    return { ...BAWAAN_PENGATURAN_VOUCHER };
  }
}

/** Simpan konfigurasi paket voucher panduan dari halaman Admin. */
export async function simpanPengaturanVoucher(isian: Partial<PengaturanVoucher>): Promise<PengaturanVoucher> {
  const saatIni = await pengaturanVoucher();
  const baru = sanitasiPengaturan({ ...saatIni, ...isian });
  await setSetting(KUNCI_SETELAN, JSON.stringify(baru));
  return baru;
}

/** Buat satu kode acak berformat PREFIX-XXXX-XXXX tanpa karakter ambigu (0/O/1/I). */
export function acakKodeVoucher(prefix = "CG"): string {
  const p = prefix.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) || "CG";
  const b = randomBytes(8);
  let s = "";
  for (let i = 0; i < 8; i++) s += HURUF_VOUCHER[b[i]! % HURUF_VOUCHER.length];
  return `${p}-${s.slice(0, 4)}-${s.slice(4, 8)}`;
}

export interface InputVoucherPanduan {
  kode: string;
  order_id?: string | null;
  pembeli_nama?: string | null;
  pembeli_email?: string | null;
  pembeli_wa?: string | null;
  harga_beli?: number | null;
  nama_paket?: string;
  durasi_hari?: number;
  kuota_nomor?: number;
  kuota_balasan?: number;
  catatan?: string | null;
}

const KOLOM_VOUCHER = `
  v.id, v.kode, v.sumber, v.order_id, v.pembeli_nama, v.pembeli_email, v.pembeli_wa, v.harga_beli,
  v.nama_paket, v.durasi_hari, v.kuota_nomor, v.kuota_balasan, v.status,
  v.diklaim_oleh, u.email AS diklaim_email, u.nama AS diklaim_nama,
  v.diklaim_pada, v.langganan_id, v.transaksi_id, v.catatan, v.dibuat
`;

/**
 * Daftarkan voucher dari webhook pembelian Panduan Produk Digital (akbaralatas.com).
 * Idempoten berdasarkan `order_id` maupun `kode`: bila dipanggil ulang saat rekonsiliasi,
 * data yang sudah terdaftar tidak digandakan dan kuota snapshot awal tetap terjaga.
 */
export async function terbitkanVoucherPanduan(input: InputVoucherPanduan): Promise<BarisVoucher> {
  const kode = normalisasiKodeVoucher(input.kode);
  if (!kodeVoucherSah(kode)) throw new VoucherError("Format kode voucher tidak sah.", "Invalid voucher code format.");

  const cfg = await pengaturanVoucher();
  const namaPaket = (input.nama_paket ?? "").trim().slice(0, 60) || cfg.nama_paket;
  const durasiHari = Number.isInteger(input.durasi_hari) && (input.durasi_hari ?? 0) > 0 ? Number(input.durasi_hari) : cfg.durasi_hari;
  const kuotaNomor = Number.isInteger(input.kuota_nomor) && (input.kuota_nomor ?? 0) > 0 ? Number(input.kuota_nomor) : cfg.kuota_nomor;
  const kuotaBalasan = Number.isInteger(input.kuota_balasan) && (input.kuota_balasan ?? 0) > 0 ? Number(input.kuota_balasan) : cfg.kuota_balasan;

  const orderId = input.order_id ? String(input.order_id).trim().slice(0, 64) || null : null;
  const pembeliNama = input.pembeli_nama ? String(input.pembeli_nama).trim().slice(0, 120) || null : null;
  const pembeliEmail = input.pembeli_email ? String(input.pembeli_email).trim().toLowerCase().slice(0, 160) || null : null;
  const pembeliWa = input.pembeli_wa ? String(input.pembeli_wa).trim().slice(0, 40) || null : null;
  const hargaBeli = typeof input.harga_beli === "number" && Number.isFinite(input.harga_beli) && input.harga_beli >= 0 ? Math.round(input.harga_beli) : null;
  const catatan = input.catatan ? String(input.catatan).trim().slice(0, 250) || null : null;
  const kini = sekarang();

  return transaksiDb(async (tx) => {
    if (orderId) {
      const [adaOrder] = await tx<BarisVoucher[]>`
        SELECT ${tx.unsafe(KOLOM_VOUCHER)}
          FROM voucher v LEFT JOIN users u ON u.id = v.diklaim_oleh
         WHERE v.order_id = ${orderId}`;
      if (adaOrder) return adaOrder;
    }

    const [baris] = await tx<{ id: number }[]>`
      INSERT INTO voucher (
        kode, sumber, order_id, pembeli_nama, pembeli_email, pembeli_wa, harga_beli,
        nama_paket, durasi_hari, kuota_nomor, kuota_balasan, status, catatan, dibuat
      ) VALUES (
        ${kode}, 'panduan', ${orderId}, ${pembeliNama}, ${pembeliEmail}, ${pembeliWa}, ${hargaBeli},
        ${namaPaket}, ${durasiHari}, ${kuotaNomor}, ${kuotaBalasan}, 'belum_diklaim', ${catatan}, ${kini}
      )
      ON CONFLICT (kode) DO UPDATE SET
        order_id      = COALESCE(voucher.order_id, EXCLUDED.order_id),
        pembeli_nama  = COALESCE(EXCLUDED.pembeli_nama, voucher.pembeli_nama),
        pembeli_email = COALESCE(EXCLUDED.pembeli_email, voucher.pembeli_email),
        pembeli_wa    = COALESCE(EXCLUDED.pembeli_wa, voucher.pembeli_wa),
        harga_beli    = COALESCE(EXCLUDED.harga_beli, voucher.harga_beli),
        catatan       = COALESCE(EXCLUDED.catatan, voucher.catatan)
      RETURNING id`;

    const [hasil] = await tx<BarisVoucher[]>`
      SELECT ${tx.unsafe(KOLOM_VOUCHER)}
        FROM voucher v LEFT JOIN users u ON u.id = v.diklaim_oleh
       WHERE v.id = ${baris.id}`;
    return hasil;
  });
}

export interface OpsiBuatVoucherAdmin {
  jumlah?: number;
  prefix?: string;
  nama_paket?: string;
  durasi_hari?: number;
  kuota_nomor?: number;
  kuota_balasan?: number;
  pembeli_nama?: string | null;
  pembeli_email?: string | null;
  pembeli_wa?: string | null;
  catatan?: string | null;
}

/**
 * Admin membuat 1 s.d. 50 kode voucher sekaligus dari panel Admin (untuk giveaway, bonus, atau pembeli manual).
 */
export async function buatVoucherAdmin(opsi: OpsiBuatVoucherAdmin = {}): Promise<BarisVoucher[]> {
  const cfg = await pengaturanVoucher();
  const jumlah = Math.min(Math.max(Math.trunc(Number(opsi.jumlah) || 1), 1), 50);
  const prefix = (opsi.prefix ?? "CG").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) || "CG";
  const namaPaket = (opsi.nama_paket ?? "").trim().slice(0, 60) || cfg.nama_paket;
  const durasiHari = Number.isInteger(opsi.durasi_hari) && (opsi.durasi_hari ?? 0) >= 1 && (opsi.durasi_hari ?? 0) <= 3650 ? Number(opsi.durasi_hari) : cfg.durasi_hari;
  const kuotaNomor = Number.isInteger(opsi.kuota_nomor) && (opsi.kuota_nomor ?? 0) >= 1 && (opsi.kuota_nomor ?? 0) <= 100 ? Number(opsi.kuota_nomor) : cfg.kuota_nomor;
  const kuotaBalasan = Number.isInteger(opsi.kuota_balasan) && (opsi.kuota_balasan ?? 0) >= 1 && (opsi.kuota_balasan ?? 0) <= 10_000_000 ? Number(opsi.kuota_balasan) : cfg.kuota_balasan;
  const pembeliNama = opsi.pembeli_nama ? String(opsi.pembeli_nama).trim().slice(0, 120) || null : null;
  const pembeliEmail = opsi.pembeli_email ? String(opsi.pembeli_email).trim().toLowerCase().slice(0, 160) || null : null;
  const pembeliWa = opsi.pembeli_wa ? String(opsi.pembeli_wa).trim().slice(0, 40) || null : null;
  const catatan = opsi.catatan ? String(opsi.catatan).trim().slice(0, 250) || null : null;
  const kini = sekarang();

  return transaksiDb(async (tx) => {
    const ids: number[] = [];
    for (let i = 0; i < jumlah; i++) {
      for (let coba = 0; coba < 8; coba++) {
        const kode = acakKodeVoucher(prefix);
        const [ins] = await tx<{ id: number }[]>`
          INSERT INTO voucher (
            kode, sumber, pembeli_nama, pembeli_email, pembeli_wa,
            nama_paket, durasi_hari, kuota_nomor, kuota_balasan, status, catatan, dibuat
          ) VALUES (
            ${kode}, 'admin', ${pembeliNama}, ${pembeliEmail}, ${pembeliWa},
            ${namaPaket}, ${durasiHari}, ${kuotaNomor}, ${kuotaBalasan}, 'belum_diklaim', ${catatan}, ${kini}
          )
          ON CONFLICT (kode) DO NOTHING
          RETURNING id`;
        if (ins) {
          ids.push(ins.id);
          break;
        }
      }
    }
    if (ids.length === 0) throw new Error("Gagal membuat kode voucher unik.");
    const daftar = await tx<BarisVoucher[]>`
      SELECT ${tx.unsafe(KOLOM_VOUCHER)}
        FROM voucher v LEFT JOIN users u ON u.id = v.diklaim_oleh
       WHERE v.id IN ${tx(ids)}
       ORDER BY v.id ASC`;
    return [...daftar];
  });
}

/** Batalkan voucher yang belum diklaim (soft-cancel, tanpa menghapus baris data). */
export async function batalkanVoucher(voucherId: number): Promise<void> {
  const sql = await db();
  const [v] = await sql<{ id: number; status: StatusVoucher }[]>`
    SELECT id, status FROM voucher WHERE id = ${voucherId}`;
  if (!v) throw new VoucherError("Voucher tidak ditemukan.");
  if (v.status === "diklaim") throw new VoucherError("Voucher yang sudah diklaim tidak dapat dibatalkan.");
  if (v.status === "dibatalkan") return;
  await sql`UPDATE voucher SET status = 'dibatalkan' WHERE id = ${voucherId} AND status = 'belum_diklaim'`;
}

export interface HasilKlaimVoucher {
  kode: string;
  orderId: string;
  langgananId: number;
  nama_paket: string;
  mulai: number;
  sampai: number;
  kuota_nomor: number;
  kuota_balasan: number;
  tambahan_balasan: number;
  durasi_hari: number;
  diperpanjang: boolean;
}

/**
 * Pengguna mengklaim kode voucher untuk mengaktifkan / menambah paket & kuota balasan AI.
 * Berjalan dalam satu transaksi database dengan `FOR UPDATE` pada baris voucher agar bebas klaim ganda.
 */
export async function klaimVoucher(userId: number, kodeMentah: string): Promise<HasilKlaimVoucher> {
  const cfg = await pengaturanVoucher();
  if (!cfg.aktif) {
    throw new VoucherError("Klaim voucher sedang dinonaktifkan sementara oleh admin.", "Voucher claims are temporarily disabled by the admin.");
  }

  const kode = normalisasiKodeVoucher(kodeMentah);
  if (!kodeVoucherSah(kode)) {
    throw new VoucherError("Format kode voucher tidak sah. Masukkan kode seperti CG-XXXX-XXXX.", "Invalid voucher code format. Enter a code like CG-XXXX-XXXX.");
  }

  const hasil = await transaksiDb(async (tx) => {
    const [v] = await tx<{
      id: number;
      kode: string;
      sumber: string;
      order_id: string | null;
      harga_beli: number | null;
      nama_paket: string;
      durasi_hari: number;
      kuota_nomor: number;
      kuota_balasan: number;
      status: StatusVoucher;
      diklaim_oleh: number | null;
    }[]>`
      SELECT id, kode, sumber, order_id, harga_beli, nama_paket, durasi_hari, kuota_nomor, kuota_balasan, status, diklaim_oleh
        FROM voucher
       WHERE kode = ${kode}
       FOR UPDATE`;

    if (!v) {
      throw new VoucherError(
        "Kode voucher belum terdaftar. Bila Anda baru saja membayar, tunggu 1-2 menit lalu coba lagi; bila tetap gagal, pastikan kodenya benar atau hubungi admin.",
        "Voucher code not found yet. If you just paid, wait 1-2 minutes and try again; if it still fails, check the code or contact the admin.",
      );
    }
    if (v.status === "dibatalkan") {
      throw new VoucherError("Kode voucher ini sudah tidak berlaku (dibatalkan).", "This voucher code is no longer valid (cancelled).");
    }
    if (v.status === "diklaim") {
      if (v.diklaim_oleh === userId) {
        throw new VoucherError("Kode voucher ini sudah pernah Anda klaim di akun ini.", "You have already claimed this voucher on this account.");
      }
      throw new VoucherError("Kode voucher ini sudah pernah digunakan oleh akun lain.", "This voucher code has already been used by another account.");
    }

    const kini = sekarang();
    const durasiDetik = v.durasi_hari * 86400;

    const [l] = await tx<{
      id: number;
      nama_paket: string;
      mulai: number;
      sampai: number;
      kuota_nomor: number;
      kuota_balasan: number;
    }[]>`
      SELECT id, nama_paket, mulai, sampai, kuota_nomor, kuota_balasan
        FROM langganan
       WHERE user_id = ${userId} AND sampai > ${kini}
       ORDER BY sampai DESC, id DESC LIMIT 1
       FOR UPDATE`;

    let sebelumnyaHabis = !l;
    if (l && v.kuota_balasan > 0) {
      const [[b], [pk]] = await Promise.all([
        tx<{ n: number }[]>`SELECT COALESCE(SUM(jumlah), 0)::int AS n FROM kuota_bonus WHERE user_id = ${userId} AND dibuat >= ${l.mulai}`,
        tx<{ n: number }[]>`
          SELECT COUNT(*)::int AS n FROM numbers n JOIN ai_pakai ap ON ap.number_id = n.id AND ap.waktu >= ${l.mulai}
           WHERE n.user_id = ${userId} AND NOT ap.abaikan`,
      ]);
      sebelumnyaHabis = pk.n >= l.kuota_balasan + b.n;
    }
    const botDinyalakan = sebelumnyaHabis && v.kuota_balasan > 0 ? await aktifkanBotSiap(userId, tx) : false;

    let langgananId: number;
    let namaAkhir = v.nama_paket;
    let mulaiAkhir = kini;
    let sampaiAkhir = kini + durasiDetik;
    let nomorAkhir = v.kuota_nomor;
    let balasanAkhir = v.kuota_balasan;
    let diperpanjang = false;

    if (l && cfg.mode_klaim === "tambah") {
      const nomorBaru = Math.max(l.kuota_nomor, v.kuota_nomor);
      const [upd] = await tx<{ sampai: number; kuota_balasan: number; kuota_nomor: number }[]>`
        UPDATE langganan
           SET sampai = sampai + ${durasiDetik},
               kuota_balasan = kuota_balasan + ${v.kuota_balasan},
               kuota_nomor = ${nomorBaru}
         WHERE id = ${l.id}
         RETURNING sampai, kuota_balasan, kuota_nomor`;
      langgananId = l.id;
      namaAkhir = l.nama_paket;
      mulaiAkhir = l.mulai;
      sampaiAkhir = upd.sampai;
      nomorAkhir = upd.kuota_nomor;
      balasanAkhir = upd.kuota_balasan;
      diperpanjang = true;
    } else {
      if (l) {
        await tx`UPDATE langganan SET sampai = ${kini} WHERE id = ${l.id}`;
      }
      const [baru] = await tx<{ id: number }[]>`
        INSERT INTO langganan (user_id, paket_id, nama_paket, mulai, sampai, kuota_nomor, kuota_balasan, sumber)
        VALUES (${userId}, ${null}, ${v.nama_paket}, ${kini}, ${sampaiAkhir}, ${v.kuota_nomor}, ${v.kuota_balasan}, 'admin')
        RETURNING id`;
      langgananId = baru.id;
    }

    const orderId = `VCR-${userId}-${kini}-${randomBytes(3).toString("hex")}`;
    const jumlah = v.harga_beli && v.harga_beli > 0 ? v.harga_beli : 0;
    const catatanTrx = v.order_id ? `Voucher ${v.kode} (Pesanan ${v.order_id})` : `Voucher ${v.kode}`;

    const [trx] = await tx<{ id: number }[]>`
      INSERT INTO transaksi (
        order_id, user_id, paket_id, nama_paket, jumlah, status, metode, dibuat, dibayar, langganan_id, catatan
      ) VALUES (
        ${orderId}, ${userId}, ${null}, ${v.nama_paket}, ${jumlah}, 'lunas', 'voucher', ${kini}, ${kini}, ${langgananId}, ${catatanTrx}
      )
      RETURNING id`;

    await tx`
      UPDATE voucher
         SET status = 'diklaim',
             diklaim_oleh = ${userId},
             diklaim_pada = ${kini},
             langganan_id = ${langgananId},
             transaksi_id = ${trx.id}
       WHERE id = ${v.id}`;

    return {
      kode: v.kode,
      orderId,
      langgananId,
      nama_paket: namaAkhir,
      mulai: mulaiAkhir,
      sampai: sampaiAkhir,
      kuota_nomor: nomorAkhir,
      kuota_balasan: balasanAkhir,
      tambahan_balasan: v.kuota_balasan,
      durasi_hari: v.durasi_hari,
      diperpanjang,
      botDinyalakan,
    };
  });

  if (hasil.botDinyalakan) segarkanNomor();
  segarkanKuota(userId);
  void notifVoucherDiklaim(userId, hasil);

  const { botDinyalakan: _, ...keluar } = hasil;
  void _;
  return keluar;
}

async function notifVoucherDiklaim(userId: number, h: HasilKlaimVoucher): Promise<void> {
  try {
    const { kirimNotif, kirimNotifAdmin } = await import("./notifikasi");
    const sql = await db();
    const [u] = await sql<{ email: string }[]>`SELECT email FROM users WHERE id = ${userId}`;
    const sampaiId = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric" }).format(new Date(h.sampai * 1000));
    const sampaiEn = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric" }).format(new Date(h.sampai * 1000));
    await kirimNotif(userId, {
      jenis: "paket",
      judul: {
        id: `Voucher ${h.kode} berhasil diaktifkan`,
        en: `Voucher ${h.kode} activated`,
      },
      isi: {
        id: `+${h.tambahan_balasan.toLocaleString("id-ID")} kuota balasan AI (${h.nama_paket}). Aktif sampai ${sampaiId}.`,
        en: `+${h.tambahan_balasan.toLocaleString("en-US")} AI replies (${h.nama_paket}). Active until ${sampaiEn}.`,
      },
      tautan: "/langganan",
    });
    if (u?.email) {
      await kirimNotifAdmin({
        jenis: "pembayaran",
        judul: {
          id: `Voucher diklaim · ${h.kode}`,
          en: `Voucher claimed · ${h.kode}`,
        },
        isi: {
          id: `${u.email} mengklaim ${h.nama_paket} (+${h.tambahan_balasan.toLocaleString("id-ID")} balasan AI, ${h.durasi_hari} hari).`,
          en: `${u.email} claimed ${h.nama_paket} (+${h.tambahan_balasan.toLocaleString("en-US")} AI replies, ${h.durasi_hari} days).`,
        },
        tautan: "/admin/paket",
      });
    }
  } catch (e) {
    console.error("[notif] gagal mengirim notifikasi klaim voucher:", e instanceof Error ? e.message : e);
  }
}

/**
 * Cari voucher yang belum diklaim milik alamat email pengguna ini (lewat indeks parsial `voucher_email_belum_idx`).
 * Memungkinkan klaim 1-klik otomatis di halaman Dashboard & Langganan tanpa harus mengetik kode.
 */
export async function voucherBelumDiklaimEmail(email: string): Promise<VoucherTersedia[]> {
  const bersih = String(email ?? "").trim().toLowerCase();
  if (!bersih) return [];
  const cfg = await pengaturanVoucher();
  if (!cfg.aktif) return [];
  const sql = await db();
  const baris = await sql<VoucherTersedia[]>`
    SELECT id, kode, nama_paket, durasi_hari, kuota_nomor, kuota_balasan, order_id, dibuat
      FROM voucher
     WHERE status = 'belum_diklaim' AND lower(pembeli_email) = ${bersih}
     ORDER BY dibuat DESC, id DESC
     LIMIT 5`;
  return [...baris];
}

/**
 * Info satu voucher untuk modal klaim (kode dari tautan email). Satu query lewat indeks unik `kode`;
 * status dihitung relatif ke pengguna yang sedang login.
 */
export async function infoVoucherModal(kodeMentah: string, userId: number): Promise<InfoModalVoucher | null> {
  const kode = normalisasiKodeVoucher(kodeMentah);
  if (!kodeVoucherSah(kode)) return null;
  const kosong = { nama_paket: null, durasi_hari: null, kuota_nomor: null, kuota_balasan: null };
  const cfg = await pengaturanVoucher();
  if (!cfg.aktif) return { kode, status: "nonaktif", ...kosong };
  const sql = await db();
  const [v] = await sql<{ kode: string; nama_paket: string; durasi_hari: number; kuota_nomor: number; kuota_balasan: number; status: StatusVoucher; diklaim_oleh: number | null }[]>`
    SELECT kode, nama_paket, durasi_hari, kuota_nomor, kuota_balasan, status, diklaim_oleh
      FROM voucher WHERE kode = ${kode}`;
  if (!v) return { kode, status: "tidak_ada", ...kosong };
  const status =
    v.status === "belum_diklaim" ? "siap" : v.status === "dibatalkan" ? "dibatalkan" : v.diklaim_oleh === userId ? "milik_anda" : "dipakai_lain";
  return { kode: v.kode, status, nama_paket: v.nama_paket, durasi_hari: v.durasi_hari, kuota_nomor: v.kuota_nomor, kuota_balasan: v.kuota_balasan };
}

const lolosLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export interface FilterDaftarVoucher {
  status?: StatusVoucher | "semua";
  q?: string;
  batas?: number;
}

/** Daftar voucher untuk tabel Admin (kolom spesifik + join user pengklaim, terindeks). */
export async function daftarVoucherAdmin(filter: FilterDaftarVoucher = {}): Promise<BarisVoucher[]> {
  const sql = await db();
  const batas = Math.min(Math.max(filter.batas ?? 50, 1), 200);
  const st = filter.status && filter.status !== "semua" ? filter.status : null;
  const q = (filter.q ?? "").trim().slice(0, 80);
  const pola = q ? `%${lolosLike(q.toLowerCase())}%` : null;

  const syaratStatus = st ? sql`v.status = ${st}` : sql`true`;
  const syaratCari = pola
    ? sql`(
        lower(v.kode) LIKE ${pola}
        OR lower(COALESCE(v.order_id, '')) LIKE ${pola}
        OR lower(COALESCE(v.pembeli_email, '')) LIKE ${pola}
        OR lower(COALESCE(v.pembeli_nama, '')) LIKE ${pola}
        OR lower(COALESCE(u.email, '')) LIKE ${pola}
      )`
    : sql`true`;

  const baris = await sql<BarisVoucher[]>`
    SELECT ${sql.unsafe(KOLOM_VOUCHER)}
      FROM voucher v
      LEFT JOIN users u ON u.id = v.diklaim_oleh
     WHERE ${syaratStatus} AND ${syaratCari}
     ORDER BY v.dibuat DESC, v.id DESC
     LIMIT ${batas}`;
  return [...baris];
}

/** Ringkasan metrik voucher untuk kartu KPI di halaman Admin. */
export async function ringkasanVoucherAdmin(): Promise<RingkasanVoucher> {
  const sql = await db();
  const [r] = await sql<RingkasanVoucher[]>`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status = 'belum_diklaim')::int AS belum_diklaim,
           COUNT(*) FILTER (WHERE status = 'diklaim')::int AS diklaim,
           COUNT(*) FILTER (WHERE status = 'dibatalkan')::int AS dibatalkan,
           COUNT(*) FILTER (WHERE sumber = 'panduan')::int AS dari_panduan,
           COUNT(*) FILTER (WHERE sumber = 'admin')::int AS dari_admin
      FROM voucher`;
  return (
    r ?? {
      total: 0,
      belum_diklaim: 0,
      diklaim: 0,
      dibatalkan: 0,
      dari_panduan: 0,
      dari_admin: 0,
    }
  );
}

/** Rahasia sinkronisasi webhook antara Panduan Produk Digital dan ChatGerCep (wajib dari env VOUCHER_SYNC_SECRET). */
export function rahasiaSyncVoucher(): string {
  return (process.env.VOUCHER_SYNC_SECRET ?? "").trim();
}

/** Buat tanda tangan HMAC-SHA256 untuk payload sinkronisasi voucher. */
export function buatSignatureVoucher(rawBody: string, timestamp: string, secret = rahasiaSyncVoucher()): string {
  if (!secret) throw new Error("VOUCHER_SYNC_SECRET belum diisi di environment variables.");
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

/** Verifikasi tanda tangan HMAC-SHA256 pada endpoint `/api/voucher/terbit`. */
export function verifikasiSignatureVoucher(rawBody: string, timestamp: string, signature: string): boolean {
  const secret = rahasiaSyncVoucher();
  if (!secret) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const selisihDetik = Math.abs(sekarang() - ts);
  if (selisihDetik > 600) return false;
  const diharapkan = buatSignatureVoucher(rawBody, String(ts), secret);
  const bufA = Buffer.from(diharapkan, "hex");
  const bufB = Buffer.from(String(signature ?? "").trim(), "hex");
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
