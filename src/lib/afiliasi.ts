import "server-only";
import { randomBytes } from "node:crypto";
import { type Sql, type Tx, db, getSetting, sekarang, setSetting, transaksi as transaksiDb } from "./db";
import {
  DAFTAR_BANK,
  type JenisKomisi,
  MIN_PENARIKAN_BAWAAN,
  type ModePersetujuanAfiliasi,
  type SiklusKomisi,
  type StatusAfiliator,
  type StatusPenarikan,
  hitungKomisiPaket,
  kodeIrisBank,
  normalkanKodeRef,
} from "./afiliasi-def";
import { JAMINAN_HARI } from "./jaminan-def";
import { MidtransError, kirimPayoutIris, konfigIris } from "./midtrans";
import { catatLog } from "./pengguna";
import { kirimNotif, kirimNotifAdmin } from "./notifikasi";
import type { User } from "./session";

export * from "./afiliasi-def";

/**
 * `en`: pesan versi Inggris (tampilan /eng, dipilih di actions.ts); `message` tetap bahasa Indonesia (juga untuk log).
 * Nominal di `en` ditulis "{rp}" dan diisi dari `rp` sebagai USD di actions.ts (kurs tidak dibaca di sini).
 */
export class AfiliasiError extends Error {
  en?: string;
  rp?: number;
  constructor(message: string, en?: string, rp?: number) {
    super(message);
    this.en = en;
    this.rp = rp;
  }
}

export interface PengaturanAfiliasi {
  aktif: boolean;
  persetujuan: ModePersetujuanAfiliasi;
  siklus: SiklusKomisi;
  minTarik: number;
}

const angkaSetting = (nilai: string | null, bawaan: number): number => {
  const v = nilai === null || nilai.trim() === "" ? NaN : Number(nilai);
  return Number.isInteger(v) && v >= 0 ? v : bawaan;
};

export async function pengaturanAfiliasi(): Promise<PengaturanAfiliasi> {
  const [aktif, persetujuan, siklus, minTarik] = await Promise.all([
    getSetting("afiliasi_aktif"),
    getSetting("afiliasi_persetujuan"),
    getSetting("afiliasi_siklus"),
    getSetting("afiliasi_min_tarik"),
  ]);
  return {
    aktif: aktif !== "0",
    persetujuan: persetujuan === "manual" ? "manual" : "otomatis",
    siklus: siklus === "berulang" ? "berulang" : "pertama",
    minTarik: Math.max(10_000, angkaSetting(minTarik, MIN_PENARIKAN_BAWAAN)),
  };
}

export async function simpanPengaturanAfiliasi(p: PengaturanAfiliasi): Promise<void> {
  await setSetting("afiliasi_aktif", p.aktif ? "1" : "0");
  await setSetting("afiliasi_persetujuan", p.persetujuan);
  await setSetting("afiliasi_siklus", p.siklus);
  await setSetting("afiliasi_min_tarik", String(Math.round(p.minTarik)));
}

// ---------- Data Afiliator ----------

export interface BarisAfiliator {
  user_id: number;
  kode: string;
  status: StatusAfiliator;
  bank_nama: string;
  bank_nomor: string;
  bank_pemilik: string;
  klik: number;
  saldo: number;
  total_komisi: number;
  total_ditarik: number;
  created_at: number;
}

const KOLOM_AFILIATOR =
  "user_id, kode, status, bank_nama, bank_nomor, bank_pemilik, klik, saldo, total_komisi, total_ditarik, created_at";

export async function profilAfiliator(userId: number): Promise<BarisAfiliator | undefined> {
  const sql = await db();
  const [a] = await sql<BarisAfiliator[]>`
    SELECT ${sql.unsafe(KOLOM_AFILIATOR)} FROM afiliator WHERE user_id = ${userId}`;
  return a;
}

const ALFABET_REF = "abcdefghjkmnpqrstuvwxyz23456789";

export function buatKodeReferralAcak(panjang = 8): string {
  const b = randomBytes(panjang);
  let hasil = "";
  for (let i = 0; i < panjang; i++) {
    hasil += ALFABET_REF[b[i] % ALFABET_REF.length];
  }
  return hasil;
}

function validasiRekeningAfiliator(input: { bankNama: string; bankNomor: string; bankPemilik: string }) {
  const bankSah = DAFTAR_BANK.some((b) => b.id === input.bankNama);
  if (!bankSah) {
    throw new AfiliasiError("Pilih bank atau e-wallet tujuan pencairan dari daftar.", "Choose the payout bank or e-wallet from the list.");
  }
  const bankNomor = input.bankNomor.replace(/[^0-9]/g, "").slice(0, 30);
  if (bankNomor.length < 6) {
    throw new AfiliasiError("Nomor rekening atau nomor e-wallet minimal 6 digit angka.", "Account or e-wallet number must be at least 6 digits.");
  }
  const bankPemilik = input.bankPemilik.trim().replace(/\s+/g, " ").slice(0, 80);
  if (bankPemilik.length < 2) {
    throw new AfiliasiError("Nama pemilik rekening wajib diisi (minimal 2 huruf).", "Account holder name is required (at least 2 letters).");
  }
  return { bankNama: input.bankNama, bankNomor, bankPemilik };
}

export async function daftarAfiliator(
  userId: number,
  input: { kode?: string; bankNama: string; bankNomor: string; bankPemilik: string }
): Promise<BarisAfiliator> {
  const atur = await pengaturanAfiliasi();
  if (!atur.aktif) throw new AfiliasiError("Program afiliasi sedang ditutup sementara oleh admin.", "The affiliate program is temporarily closed by the admin.");
  const { bankNama, bankNomor, bankPemilik } = validasiRekeningAfiliator(input);
  const kodeManual = input.kode && input.kode.trim() !== "" ? normalkanKodeRef(input.kode) : null;
  if (input.kode && input.kode.trim() !== "" && !kodeManual) {
    throw new AfiliasiError("Kode afiliasi tidak valid.", "Invalid affiliate code.");
  }
  const statusAwal: StatusAfiliator = atur.persetujuan === "otomatis" ? "aktif" : "menunggu";
  const sql = await db();

  const sudah = await profilAfiliator(userId);
  if (sudah) throw new AfiliasiError("Akun Anda sudah terdaftar di program afiliasi.", "Your account is already registered in the affiliate program.");

  for (let coba = 0; coba < 6; coba++) {
    const kodePakai = kodeManual ?? buatKodeReferralAcak(8);
    try {
      const [baru] = await sql<BarisAfiliator[]>`
        INSERT INTO afiliator(user_id, kode, status, bank_nama, bank_nomor, bank_pemilik, created_at)
        VALUES (${userId}, ${kodePakai}, ${statusAwal}, ${bankNama}, ${bankNomor}, ${bankPemilik}, ${sekarang()})
        RETURNING ${sql.unsafe(KOLOM_AFILIATOR)}`;
      if (baru.status === "menunggu") {
        void kirimNotifAdmin({
          jenis: "admin_afiliasi",
          judul: { id: "Pendaftaran afiliator baru menunggu persetujuan", en: "New affiliate sign-up awaiting approval" },
          isi: { id: `Kode ${baru.kode}. Tinjau di halaman Afiliasi.`, en: `Code ${baru.kode}. Review it on the Affiliate page.` },
          tautan: "/admin/afiliasi",
        });
      } else {
        void kirimNotif(userId, {
          jenis: "afiliasi",
          judul: { id: "Selamat, Anda resmi menjadi afiliator", en: "You're now an official affiliate" },
          isi: { id: `Bagikan tautan dengan kode ${baru.kode} dan dapatkan komisi dari setiap pembelian paket.`, en: `Share your link with code ${baru.kode} and earn a commission on every plan purchase.` },
          tautan: "/afiliasi",
        });
      }
      return baru;
    } catch {
      if (kodeManual) {
        throw new AfiliasiError(`Kode afiliasi "${kodeManual}" sudah dipakai orang lain.`, `The affiliate code "${kodeManual}" is already taken.`);
      }
    }
  }
  throw new AfiliasiError("Gagal membuat kode afiliasi acak. Silakan coba lagi.", "Couldn't generate a random affiliate code. Please try again.");
}

export async function ubahProfilAfiliator(
  userId: number,
  input: { kode?: string; bankNama: string; bankNomor: string; bankPemilik: string }
): Promise<BarisAfiliator> {
  const { bankNama, bankNomor, bankPemilik } = validasiRekeningAfiliator(input);
  const kodeBaru = input.kode && input.kode.trim() !== "" ? normalkanKodeRef(input.kode) : null;
  if (input.kode && input.kode.trim() !== "" && !kodeBaru) {
    throw new AfiliasiError("Kode afiliasi tidak valid.", "Invalid affiliate code.");
  }
  const sql = await db();
  try {
    const [ubah] = kodeBaru
      ? await sql<BarisAfiliator[]>`
          UPDATE afiliator
             SET kode = ${kodeBaru}, bank_nama = ${bankNama}, bank_nomor = ${bankNomor}, bank_pemilik = ${bankPemilik}
           WHERE user_id = ${userId}
           RETURNING ${sql.unsafe(KOLOM_AFILIATOR)}`
      : await sql<BarisAfiliator[]>`
          UPDATE afiliator
             SET bank_nama = ${bankNama}, bank_nomor = ${bankNomor}, bank_pemilik = ${bankPemilik}
           WHERE user_id = ${userId}
           RETURNING ${sql.unsafe(KOLOM_AFILIATOR)}`;
    if (!ubah) throw new AfiliasiError("Profil afiliasi tidak ditemukan.", "Affiliate profile not found.");
    return ubah;
  } catch (e) {
    if (e instanceof AfiliasiError) throw e;
    throw new AfiliasiError("Gagal memperbarui profil afiliasi.", "Couldn't update the affiliate profile.");
  }
}

// ---------- Pelacakan Klik & Atribusi Pendaftaran ----------

export async function catatKlikReferral(mentah: string): Promise<boolean> {
  const kode = normalkanKodeRef(mentah);
  if (!kode) return false;
  const sql = await db();
  const [r] = await sql<{ user_id: number }[]>`
    UPDATE afiliator SET klik = klik + 1 WHERE kode = ${kode} AND status = 'aktif' RETURNING user_id`;
  return !!r;
}

export async function terapkanReferral(userIdBaru: number, kodeMentah: string | undefined | null): Promise<boolean> {
  if (!kodeMentah) return false;
  const kode = normalkanKodeRef(kodeMentah);
  if (!kode) return false;
  const atur = await pengaturanAfiliasi();
  if (!atur.aktif) return false;
  const sql = await db();
  const [af] = await sql<{ user_id: number }[]>`
    SELECT user_id FROM afiliator WHERE kode = ${kode} AND status = 'aktif'`;
  if (!af || af.user_id === userIdBaru) return false;
  const [u] = await sql<{ id: number }[]>`
    UPDATE users SET referred_by = ${af.user_id}
     WHERE id = ${userIdBaru} AND referred_by IS NULL
     RETURNING id`;
  return !!u;
}

// ---------- Mesin Komisi Otomatis (Atomik di Dalam Transaksi Pembayaran) ----------

export interface InfoTransaksiKomisi {
  transaksiId: number;
  userId: number;
  paketId: number | null;
  namaPaket: string;
  jumlahBayar: number;
}

/**
 * Dipanggil di dalam transaksi database yang sama saat pembelian paket berubah menjadi lunas
 * (baik dari Midtrans maupun pemberian paket manual berbayar oleh admin).
 * - Memeriksa apakah program aktif & pembeli direferensikan oleh afiliator yang berstatus 'aktif'.
 * - Memeriksa siklus komisi ('pertama' vs 'berulang').
 * - Mengambil aturan komisi dari tabel paket (komisi_jenis & komisi_nilai).
 * - Mencatat baris komisi_afiliasi (idempoten lewat UNIQUE transaksi_id) & menambah saldo afiliator.
 */
export async function prosesKomisiTransaksi(tx: Tx, info: InfoTransaksiKomisi): Promise<number> {
  if (info.jumlahBayar <= 0) return 0;

  const atur = await pengaturanAfiliasi();
  if (!atur.aktif) return 0;

  // 1. Cek apakah pembeli memiliki referred_by
  const [pembeli] = await tx<{ referred_by: number | null }[]>`
    SELECT referred_by FROM users WHERE id = ${info.userId}`;
  const afiliatorId = pembeli?.referred_by;
  if (!afiliatorId || afiliatorId === info.userId) return 0;

  // 2. Pastikan afiliator aktif
  const [af] = await tx<{ user_id: number; status: StatusAfiliator }[]>`
    SELECT user_id, status FROM afiliator WHERE user_id = ${afiliatorId}`;
  if (!af || af.status !== "aktif") return 0;

  // 3. Jika siklus 'pertama', pastikan belum pernah ada transaksi lunas sebelumnya untuk pembeli ini
  //    atau belum pernah ada komisi dari pembeli ini.
  if (atur.siklus === "pertama") {
    const [pernahKomisi] = await tx<{ id: number }[]>`
      SELECT id FROM komisi_afiliasi WHERE referred_user_id = ${info.userId} LIMIT 1`;
    if (pernahKomisi) return 0;

    const [trxLama] = await tx<{ id: number }[]>`
      SELECT id FROM transaksi
       WHERE user_id = ${info.userId} AND status = 'lunas' AND jumlah > 0 AND id <> ${info.transaksiId}
       LIMIT 1`;
    if (trxLama) return 0;
  }

  // 4. Ambil konfigurasi komisi dari paket yang dibeli (atau dari paket '_custom' bila kesepakatan khusus tanpa paketId)
  const [pkt] = info.paketId
    ? await tx<{ komisi_jenis: JenisKomisi; komisi_nilai: number }[]>`
        SELECT komisi_jenis, komisi_nilai FROM paket WHERE id = ${info.paketId}`
    : await tx<{ komisi_jenis: JenisKomisi; komisi_nilai: number }[]>`
        SELECT komisi_jenis, komisi_nilai FROM paket WHERE kode = '_custom'`;
  const komisiJenis: JenisKomisi = pkt?.komisi_jenis ?? "persen";
  const komisiNilai = pkt ? pkt.komisi_nilai : info.paketId === null ? 20 : 0;
  if (komisiNilai <= 0) return 0;

  const nominalKomisi = hitungKomisiPaket(info.jumlahBayar, komisiJenis, komisiNilai);
  if (nominalKomisi <= 0) return 0;

  // 5. Catat ke komisi_afiliasi secara idempoten (UNIQUE transaksi_id mencegah komisi ganda)
  const [catat] = await tx<{ id: number }[]>`
    INSERT INTO komisi_afiliasi(
      afiliator_id, referred_user_id, transaksi_id, nama_paket, jumlah_bayar,
      komisi_jenis, komisi_acuan, nominal, created_at
    )
    VALUES (
      ${afiliatorId}, ${info.userId}, ${info.transaksiId}, ${info.namaPaket}, ${info.jumlahBayar},
      ${komisiJenis}, ${komisiNilai}, ${nominalKomisi}, ${sekarang()}
    )
    ON CONFLICT (transaksi_id) DO NOTHING
    RETURNING id`;

  if (!catat) return 0;

  // 6. Tambah saldo & total_komisi afiliator secara atomik
  await tx`
    UPDATE afiliator
       SET saldo = saldo + ${nominalKomisi},
           total_komisi = total_komisi + ${nominalKomisi}
     WHERE user_id = ${afiliatorId}`;

  return nominalKomisi;
}

// ---------- Penarikan Saldo (Withdraw) ----------

export interface BarisKomisi {
  id: number;
  afiliator_id: number;
  referred_user_id: number | null;
  referred_nama: string | null;
  referred_email: string | null;
  transaksi_id: number;
  nama_paket: string;
  jumlah_bayar: number;
  komisi_jenis: JenisKomisi;
  komisi_acuan: number;
  nominal: number;
  created_at: number;
}

export interface BarisPenarikan {
  id: number;
  afiliator_id: number;
  afiliator_email?: string;
  afiliator_nama?: string;
  afiliator_kode?: string;
  nominal: number;
  bank_nama: string;
  bank_nomor: string;
  bank_pemilik: string;
  status: StatusPenarikan;
  metode: "manual" | "iris" | null;
  referensi: string | null;
  catatan: string | null;
  dibuat: number;
  diproses: number | null;
}

/**
 * Komisi yang belum boleh ditarik: masih dalam masa jaminan uang kembali (JAMINAN_HARI sejak dicatat), atau pembelinya
 * sedang mengajukan uang kembali yang belum selesai (refund manual bisa diproses admin setelah masa jaminan lewat).
 * Lewat komisi_afiliasi_afiliator_idx (baris afiliator ini saja) + indeks parsial pengembalian_dana_berjalan_idx.
 */
async function komisiTertahan(q: Tx | Sql, afiliatorId: number): Promise<number> {
  const [r] = await q<{ n: number }[]>`
    SELECT COALESCE(SUM(k.nominal), 0)::int AS n FROM komisi_afiliasi k
     WHERE k.afiliator_id = ${afiliatorId}
       AND (k.created_at > ${sekarang() - JAMINAN_HARI * 86400}
            OR EXISTS (SELECT 1 FROM pengembalian_dana r WHERE r.transaksi_id = k.transaksi_id AND r.status IN ('menunggu', 'diproses', 'gagal')))`;
  return r.n;
}

export async function ajukanPenarikan(userId: number, nominalMentah: number): Promise<BarisPenarikan> {
  const atur = await pengaturanAfiliasi();
  const nominal = Math.round(nominalMentah);
  if (!Number.isInteger(nominal) || nominal < atur.minTarik) {
    throw new AfiliasiError(`Minimal penarikan komisi adalah Rp${atur.minTarik.toLocaleString("id-ID")}.`, "The minimum commission payout is {rp}.", atur.minTarik);
  }

  const hasil = await transaksiDb(async (tx) => {
    const [af] = await tx<BarisAfiliator[]>`
      SELECT ${tx.unsafe(KOLOM_AFILIATOR)} FROM afiliator WHERE user_id = ${userId} FOR UPDATE`;
    if (!af) throw new AfiliasiError("Anda belum terdaftar sebagai afiliator.", "You are not registered as an affiliate yet.");
    if (af.status !== "aktif") throw new AfiliasiError("Akun afiliasi Anda belum aktif untuk melakukan penarikan.", "Your affiliate account is not active yet, so you can't request a payout.");
    // Komisi yang belum melewati masa jaminan uang kembali tertahan: bila pembelinya minta uang kembali, komisinya batal.
    const bisa = af.saldo - (await komisiTertahan(tx, userId));
    if (bisa < nominal) {
      throw new AfiliasiError(
        `Saldo komisi yang bisa ditarik tidak mencukupi (tersedia Rp${Math.max(0, bisa).toLocaleString("id-ID")}; komisi baru bisa ditarik ${JAMINAN_HARI} hari setelah pembeli membayar).`,
        `Insufficient withdrawable commission balance ({rp} available; new commissions can be withdrawn ${JAMINAN_HARI} days after the buyer pays).`,
        Math.max(0, bisa),
      );
    }

    const [masihMenunggu] = await tx<{ id: number }[]>`
      SELECT id FROM penarikan_afiliasi WHERE afiliator_id = ${userId} AND status = 'menunggu' LIMIT 1`;
    if (masihMenunggu) {
      throw new AfiliasiError("Anda masih memiliki pengajuan penarikan yang sedang diproses admin.", "You still have a payout request being processed by the admin.");
    }

    await tx`UPDATE afiliator SET saldo = saldo - ${nominal} WHERE user_id = ${userId}`;

    const kini = sekarang();
    const [p] = await tx<BarisPenarikan[]>`
      INSERT INTO penarikan_afiliasi(afiliator_id, nominal, bank_nama, bank_nomor, bank_pemilik, status, dibuat)
      VALUES (${userId}, ${nominal}, ${af.bank_nama}, ${af.bank_nomor}, ${af.bank_pemilik}, 'menunggu', ${kini})
      RETURNING id, afiliator_id, nominal, bank_nama, bank_nomor, bank_pemilik, status, metode, referensi, catatan, dibuat, diproses`;
    return p;
  });
  void kirimNotifAdmin({
    jenis: "admin_afiliasi",
    judul: { id: `Pengajuan penarikan komisi Rp${hasil.nominal.toLocaleString("id-ID")}`, en: `Commission payout request: Rp${hasil.nominal.toLocaleString("id-ID")}` },
    isi: { id: `Ke ${hasil.bank_nama.toUpperCase()} ${hasil.bank_nomor} a.n. ${hasil.bank_pemilik}.`, en: `To ${hasil.bank_nama.toUpperCase()} ${hasil.bank_nomor} (${hasil.bank_pemilik}).` },
    tautan: "/admin/afiliasi",
  });
  return hasil;
}

// ---------- Ringkasan & Riwayat untuk Dashboard Pengguna ----------

function samarkanEmail(email: string | null): string {
  if (!email) return "Pengguna";
  const [lokal, domain] = email.split("@");
  if (!domain) return email;
  const awal = lokal.slice(0, Math.min(3, lokal.length));
  return `${awal}***@${domain}`;
}

export interface RingkasanAfiliasiUser {
  pengaturan: PengaturanAfiliasi;
  profil: BarisAfiliator | null;
  totalPendaftar: number;
  totalPembeli: number;
  sedangMenungguCair: number;
  /** Komisi di saldo yang masih dalam masa jaminan uang kembali (belum bisa ditarik). */
  tertahan: number;
  riwayatKomisi: BarisKomisi[];
  riwayatPenarikan: BarisPenarikan[];
}

export async function ringkasanAfiliasiUser(userId: number): Promise<RingkasanAfiliasiUser> {
  const sql = await db();
  const [pengaturan, profil] = await Promise.all([pengaturanAfiliasi(), profilAfiliator(userId)]);
  if (!profil) {
    return {
      pengaturan,
      profil: null,
      totalPendaftar: 0,
      totalPembeli: 0,
      sedangMenungguCair: 0,
      tertahan: 0,
      riwayatKomisi: [],
      riwayatPenarikan: [],
    };
  }

  const [[statRef], [statMenunggu], komisiRows, penarikanRows, tertahan] = await Promise.all([
    sql<{ pendaftar: number; pembeli: number }[]>`
      SELECT COUNT(*)::int AS pendaftar,
             COUNT(*) FILTER (
               WHERE EXISTS (SELECT 1 FROM transaksi t WHERE t.user_id = u.id AND t.status = 'lunas' AND t.jumlah > 0)
             )::int AS pembeli
        FROM users u
       WHERE u.referred_by = ${userId}`,
    sql<{ menunggu: number }[]>`
      SELECT COALESCE(SUM(nominal), 0)::bigint AS menunggu
        FROM penarikan_afiliasi
       WHERE afiliator_id = ${userId} AND status = 'menunggu'`,
    sql<BarisKomisi[]>`
      SELECT k.id, k.afiliator_id, k.referred_user_id, u.nama AS referred_nama, u.email AS referred_email,
             k.transaksi_id, k.nama_paket, k.jumlah_bayar, k.komisi_jenis, k.komisi_acuan, k.nominal, k.created_at
        FROM komisi_afiliasi k
        LEFT JOIN users u ON u.id = k.referred_user_id
       WHERE k.afiliator_id = ${userId}
       ORDER BY k.id DESC
       LIMIT 30`,
    sql<BarisPenarikan[]>`
      SELECT id, afiliator_id, nominal, bank_nama, bank_nomor, bank_pemilik, status, metode, referensi, catatan, dibuat, diproses
        FROM penarikan_afiliasi
       WHERE afiliator_id = ${userId}
       ORDER BY id DESC
       LIMIT 20`,
    komisiTertahan(sql, userId),
  ]);

  return {
    pengaturan,
    profil,
    totalPendaftar: statRef?.pendaftar ?? 0,
    totalPembeli: statRef?.pembeli ?? 0,
    sedangMenungguCair: statMenunggu?.menunggu ?? 0,
    tertahan: Math.min(tertahan, profil.saldo),
    riwayatKomisi: komisiRows.map((k) => ({ ...k, referred_email: samarkanEmail(k.referred_email) })),
    riwayatPenarikan: [...penarikanRows],
  };
}

// ---------- Administrasi Afiliasi (Panel Admin) ----------

export interface BarisAfiliatorAdmin extends BarisAfiliator {
  email: string;
  nama: string;
  pendaftar: number;
  pembeli: number;
}

export interface RingkasanAfiliasiAdmin {
  pengaturan: PengaturanAfiliasi;
  irisSiap: boolean;
  statistik: {
    totalAfiliator: number;
    menungguPersetujuan: number;
    totalKomisiDibagikan: number;
    totalSudahDitarik: number;
    saldoMengendap: number;
    penarikanMenungguNominal: number;
    penarikanMenungguJumlah: number;
  };
  afiliator: BarisAfiliatorAdmin[];
  penarikan: BarisPenarikan[];
  komisiTerbaru: (BarisKomisi & { afiliator_email: string; afiliator_kode: string })[];
}

export async function ringkasanAfiliasiAdmin(): Promise<RingkasanAfiliasiAdmin> {
  const sql = await db();
  const [pengaturan, [statAf], [statTarik], afiliatorRows, penarikanRows, komisiRows] = await Promise.all([
    pengaturanAfiliasi(),
    sql<{
      total: number;
      menunggu: number;
      komisi: number;
      ditarik: number;
      saldo: number;
    }[]>`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE status = 'menunggu')::int AS menunggu,
             COALESCE(SUM(total_komisi), 0)::bigint AS komisi,
             COALESCE(SUM(total_ditarik), 0)::bigint AS ditarik,
             COALESCE(SUM(saldo), 0)::bigint AS saldo
        FROM afiliator`,
    sql<{ jumlah: number; nominal: number }[]>`
      SELECT COUNT(*)::int AS jumlah, COALESCE(SUM(nominal), 0)::bigint AS nominal
        FROM penarikan_afiliasi
       WHERE status = 'menunggu'`,
    sql<BarisAfiliatorAdmin[]>`
      SELECT a.user_id, a.kode, a.status, a.bank_nama, a.bank_nomor, a.bank_pemilik,
             a.klik, a.saldo, a.total_komisi, a.total_ditarik, a.created_at,
             u.email, u.nama,
             COALESCE(r.pendaftar, 0)::int AS pendaftar,
             COALESCE(r.pembeli, 0)::int AS pembeli
        FROM afiliator a
        JOIN users u ON u.id = a.user_id
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS pendaftar,
                 COUNT(*) FILTER (
                   WHERE EXISTS (SELECT 1 FROM transaksi t WHERE t.user_id = ur.id AND t.status = 'lunas' AND t.jumlah > 0)
                 )::int AS pembeli
            FROM users ur
           WHERE ur.referred_by = a.user_id
        ) r ON true
       ORDER BY CASE WHEN a.status = 'menunggu' THEN 0 ELSE 1 END, a.total_komisi DESC, a.created_at DESC
       LIMIT 60`,
    sql<BarisPenarikan[]>`
      SELECT p.id, p.afiliator_id, u.email AS afiliator_email, u.nama AS afiliator_nama, a.kode AS afiliator_kode,
             p.nominal, p.bank_nama, p.bank_nomor, p.bank_pemilik, p.status, p.metode, p.referensi, p.catatan, p.dibuat, p.diproses
        FROM penarikan_afiliasi p
        JOIN afiliator a ON a.user_id = p.afiliator_id
        JOIN users u ON u.id = p.afiliator_id
       ORDER BY CASE WHEN p.status = 'menunggu' THEN 0 ELSE 1 END, p.id DESC
       LIMIT 50`,
    sql<(BarisKomisi & { afiliator_email: string; afiliator_kode: string })[]>`
      SELECT k.id, k.afiliator_id, ua.email AS afiliator_email, a.kode AS afiliator_kode,
             k.referred_user_id, ur.nama AS referred_nama, ur.email AS referred_email,
             k.transaksi_id, k.nama_paket, k.jumlah_bayar, k.komisi_jenis, k.komisi_acuan, k.nominal, k.created_at
        FROM komisi_afiliasi k
        JOIN afiliator a ON a.user_id = k.afiliator_id
        JOIN users ua ON ua.id = k.afiliator_id
        LEFT JOIN users ur ON ur.id = k.referred_user_id
       ORDER BY k.id DESC
       LIMIT 35`,
  ]);

  return {
    pengaturan,
    irisSiap: !!konfigIris(),
    statistik: {
      totalAfiliator: statAf?.total ?? 0,
      menungguPersetujuan: statAf?.menunggu ?? 0,
      totalKomisiDibagikan: statAf?.komisi ?? 0,
      totalSudahDitarik: statAf?.ditarik ?? 0,
      saldoMengendap: statAf?.saldo ?? 0,
      penarikanMenungguNominal: statTarik?.nominal ?? 0,
      penarikanMenungguJumlah: statTarik?.jumlah ?? 0,
    },
    afiliator: [...afiliatorRows],
    penarikan: [...penarikanRows],
    komisiTerbaru: [...komisiRows],
  };
}

export async function setStatusAfiliatorAdmin(admin: User, userId: number, status: StatusAfiliator): Promise<void> {
  const sql = await db();
  const [af] = await sql<{ kode: string; email: string }[]>`
    UPDATE afiliator a
       SET status = ${status}
      FROM users u
     WHERE a.user_id = ${userId} AND u.id = a.user_id
     RETURNING a.kode, u.email`;
  if (!af) throw new AfiliasiError("Afiliator tidak ditemukan.");
  await catatLog(admin, "ubah status afiliator", af.email, `kode ${af.kode} -> ${status}`);
  if (status === "aktif" || status === "nonaktif") {
    await kirimNotif(userId, {
      jenis: "afiliasi",
      judul:
        status === "aktif"
          ? { id: "Pendaftaran afiliasi Anda disetujui", en: "Your affiliate application was approved" }
          : { id: "Akun afiliasi Anda dinonaktifkan admin", en: "Your affiliate account was deactivated by the admin" },
      isi:
        status === "aktif"
          ? { id: "Tautan referral Anda sudah aktif mencatat komisi.", en: "Your referral link is now earning commissions." }
          : { id: "Hubungi admin untuk informasi lebih lanjut.", en: "Contact the admin for more information." },
      tautan: "/afiliasi",
    });
  }
}

/**
 * Proses pengajuan penarikan oleh Admin:
 * - 'manual': Admin sudah transfer manual, tandai 'selesai' + tambah total_ditarik.
 * - 'iris': Kirim payout otomatis lewat Midtrans Iris API, simpan reference_no, tandai 'selesai' + tambah total_ditarik.
 * - 'tolak': Batalkan penarikan dan kembalikan nominal ke saldo afiliator secara atomik.
 */
export async function prosesPenarikanAdmin(
  admin: User,
  id: number,
  opsi: { aksi: "manual" | "iris" | "tolak"; referensi?: string; catatan?: string }
): Promise<string> {
  const catatan = opsi.catatan?.trim().slice(0, 200) || null;
  const refInput = opsi.referensi?.trim().slice(0, 100) || null;

  let diberitahu: { userId: number; nominal: number; ditolak: boolean } | null = null;
  const pesan = await transaksiDb(async (tx) => {
    const [p] = await tx<(BarisPenarikan & { email: string; kode: string })[]>`
      SELECT p.id, p.afiliator_id, p.nominal, p.bank_nama, p.bank_nomor, p.bank_pemilik, p.status,
             u.email, a.kode
        FROM penarikan_afiliasi p
        JOIN afiliator a ON a.user_id = p.afiliator_id
        JOIN users u ON u.id = p.afiliator_id
       WHERE p.id = ${id}
       FOR UPDATE OF p`;
    if (!p) throw new AfiliasiError("Pengajuan penarikan tidak ditemukan.");
    if (p.status !== "menunggu") throw new AfiliasiError("Pengajuan penarikan ini sudah pernah diproses.");

    const kini = sekarang();

    if (opsi.aksi === "tolak") {
      await tx`
        UPDATE penarikan_afiliasi
           SET status = 'ditolak', catatan = ${catatan ?? "Ditolak oleh admin"}, diproses = ${kini}
         WHERE id = ${id}`;
      await tx`
        UPDATE afiliator SET saldo = saldo + ${p.nominal} WHERE user_id = ${p.afiliator_id}`;
      await catatLog(
        admin,
        "tolak penarikan afiliasi",
        p.email,
        `Rp${p.nominal.toLocaleString("id-ID")} dikembalikan ke saldo${catatan ? ` · ${catatan}` : ""}`
      );
      diberitahu = { userId: p.afiliator_id, nominal: p.nominal, ditolak: true };
      return `Penarikan Rp${p.nominal.toLocaleString("id-ID")} ditolak dan saldo telah dikembalikan ke ${p.email}.`;
    }

    let referensiAkhir = refInput;
    let metodeAkhir: "manual" | "iris" = "manual";

    if (opsi.aksi === "iris") {
      const iris = konfigIris();
      if (!iris) {
        throw new AfiliasiError("MIDTRANS_IRIS_KEY belum dipasang di server (.env). Gunakan konfirmasi transfer manual.");
      }
      try {
        const hasilIris = await kirimPayoutIris(iris, {
          idempotencyKey: `AFW-${p.id}`,
          bankKode: kodeIrisBank(p.bank_nama),
          nomorRekening: p.bank_nomor,
          namaPemilik: p.bank_pemilik,
          emailPenerima: p.email,
          nominal: p.nominal,
          catatan: catatan ?? `Komisi Afiliasi ${p.kode}`,
        });
        referensiAkhir = hasilIris.referenceNo;
        metodeAkhir = "iris";
      } catch (e) {
        throw new AfiliasiError(e instanceof MidtransError ? e.message : "Gagal menghubungi Midtrans Iris.");
      }
    }

    await tx`
      UPDATE penarikan_afiliasi
         SET status = 'selesai', metode = ${metodeAkhir}, referensi = ${referensiAkhir}, catatan = ${catatan}, diproses = ${kini}
       WHERE id = ${id}`;
    await tx`
      UPDATE afiliator SET total_ditarik = total_ditarik + ${p.nominal} WHERE user_id = ${p.afiliator_id}`;

    await catatLog(
      admin,
      "cairkan komisi afiliasi",
      p.email,
      `Rp${p.nominal.toLocaleString("id-ID")} via ${metodeAkhir === "iris" ? "Midtrans Iris" : "transfer manual"} (${p.bank_nama.toUpperCase()} ${p.bank_nomor})${referensiAkhir ? ` · ref ${referensiAkhir}` : ""}`
    );

    diberitahu = { userId: p.afiliator_id, nominal: p.nominal, ditolak: false };
    return `Pencairan Rp${p.nominal.toLocaleString("id-ID")} untuk ${p.email} berhasil dicatat (${metodeAkhir === "iris" ? `Midtrans Iris #${referensiAkhir}` : "Transfer Manual"}).`;
  });
  const d = diberitahu as { userId: number; nominal: number; ditolak: boolean } | null;
  if (d) {
    const rp = `Rp${d.nominal.toLocaleString("id-ID")}`;
    await kirimNotif(d.userId, {
      jenis: "afiliasi",
      judul: d.ditolak ? { id: `Penarikan komisi ${rp} ditolak`, en: `Commission payout of ${rp} was rejected` } : { id: `Komisi ${rp} sudah dicairkan`, en: `Commission of ${rp} has been paid out` },
      isi: d.ditolak
        ? { id: "Saldo sudah dikembalikan. Lihat catatan admin di halaman Afiliasi.", en: "The balance has been returned. See the admin's note on the Affiliate page." }
        : { id: "Dana sudah ditransfer ke rekening Anda.", en: "The money has been transferred to your bank account." },
      tautan: "/afiliasi",
    });
  }
  return pesan;
}
